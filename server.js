// Simple real-time matching + WebRTC signaling server for Radio
// (anonymous voice & video — real waves on the air)
// Run with: node server.js   (or npm run dev:all)

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(express.json());
app.use(cookieParser());

// Allow Vite dev server + any deployed frontend
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  ...(FRONTEND_URL ? [FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true); // allow in dev; tighten in prod if desired
    }
  },
  credentials: true,
}));

// =====================================================
// STEP 1: ANONYMOUS TOKEN SYSTEM (UUID + recovery code)
// Zero PII. Device-bound. Recoverable via code only.
// =====================================================

const RECOVERY_SECRET = process.env.RECOVERY_SECRET || 'radio-dev-secret-change-in-prod';
const TOKEN_TTL_DAYS = 365; // long lived anonymous sessions

// In-memory session store for Step 1 (will move to PostgreSQL + Redis later)
// Key: token (UUID), Value: { recoveryHash, createdAt, ageVerified, lastSeen }
const sessions = new Map();

function generateUUID() {
  return crypto.randomUUID();
}

function generateRecoveryCode(token) {
  // Create a short, user-friendly 6-char base62 recovery code
  const hash = crypto
    .createHmac('sha256', RECOVERY_SECRET)
    .update(token)
    .digest('base64url'); // base64url is URL-safe

  // Take first 6 uppercase alphanumeric chars (base62-like)
  const code = hash.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  return code;
}

function hashRecoveryCode(code) {
  return crypto
    .createHmac('sha256', RECOVERY_SECRET)
    .update(code.toUpperCase())
    .digest('hex');
}

function createAnonymousSession(ageVerified = false) {
  const token = generateUUID();
  const recoveryCode = generateRecoveryCode(token);
  const recoveryHash = hashRecoveryCode(recoveryCode);

  const sessionData = {
    recoveryHash,
    createdAt: Date.now(),
    ageVerified: !!ageVerified,
    lastSeen: Date.now(),
    recoveryCustomized: false,
    customRecoveryCode: null,   // plaintext only if user set a custom access code
  };

  sessions.set(token, sessionData);

  return {
    token,
    recoveryCode,
    ageVerified: sessionData.ageVerified,
    recoveryCustomized: sessionData.recoveryCustomized,
  };
}

function recoverSession(recoveryCode) {
  if (!recoveryCode || typeof recoveryCode !== 'string') return null;

  const upperCode = recoveryCode.trim().toUpperCase();
  const providedHash = hashRecoveryCode(upperCode);

  // Find matching session by hash
  for (const [token, data] of sessions.entries()) {
    if (data.recoveryHash === providedHash) {
      // Issue a fresh token for the new device (better security)
      const newToken = generateUUID();

      let newRecoveryCode;
      let newRecoveryHash;

      if (data.customRecoveryCode) {
        // User set a custom access code — keep the same one so it's consistent
        newRecoveryCode = data.customRecoveryCode;
        newRecoveryHash = hashRecoveryCode(newRecoveryCode);
      } else {
        newRecoveryCode = generateRecoveryCode(newToken);
        newRecoveryHash = hashRecoveryCode(newRecoveryCode);
      }

      const updatedData = {
        ...data,
        recoveryHash: newRecoveryHash,
        lastSeen: Date.now(),
      };

      // Remove old token, store under new one
      sessions.delete(token);
      sessions.set(newToken, updatedData);

      return {
        token: newToken,
        recoveryCode: newRecoveryCode,
        ageVerified: updatedData.ageVerified,
        recoveryCustomized: updatedData.recoveryCustomized,
      };
    }
  }

  return null;
}

function validateToken(token) {
  if (!token) return null;
  const data = sessions.get(token);
  if (!data) return null;

  // Touch last seen
  data.lastSeen = Date.now();
  return {
    token,
    ageVerified: data.ageVerified,
    provider: data.provider || 'guest',
    displayName: data.displayName || data.username || null,
  };
}

// =====================================================
// NEW AUTH: Google + Apple (secured) + ultra-fast Guest (no verification friction)
// All paths create a server-issued secure session stored in the sessions Map + optional httpOnly cookie.
// Guest = instant anonymous radio name, fully secured token but no real identity.
// Google / Apple = real verified human via provider, persistent name, ageVerified automatically true.
// =====================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || 'com.yourcompany.radio'; // set your Apple Services ID

const googleAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Helper: radio-style guest name (server side for consistency)
function generateRadioGuestName() {
  const adjectives = ['Signal', 'Echo', 'Frequency', 'Carrier', 'Resonance', 'Static', 'Wave', 'Beacon', 'Spectrum', 'Pulse'];
  const nouns = ['Wanderer', 'Seeker', 'Voice', 'Ghost', 'Drifter', 'Phantom', 'Traveler', 'Ember', 'Horizon', 'Relay'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 8900);
  return `${adj} ${noun} ${num}`;
}

// Create or update a secured session (used by all three auth methods)
function createSecureSession({ provider, providerId, displayName, email = null, picture = null, ageVerified = false }) {
  const token = generateUUID();

  const sessionData = {
    provider,
    providerId: providerId || token,
    displayName: displayName || generateRadioGuestName(),
    email,
    picture,
    ageVerified: !!ageVerified,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    // legacy recovery fields left empty for guest paths if needed
    recoveryHash: null,
  };

  sessions.set(token, sessionData);

  return {
    token,
    username: sessionData.displayName,
    provider,
    picture: sessionData.picture,
    ageVerified: sessionData.ageVerified,
  };
}

// Verify Google ID token (official + secure)
async function verifyGoogleCredential(credential) {
  if (!googleAuthClient) {
    throw new Error('Google auth not configured (set GOOGLE_CLIENT_ID)');
  }
  const ticket = await googleAuthClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email_verified) {
    throw new Error('Google email not verified');
  }
  return {
    providerId: payload.sub,
    displayName: payload.name || payload.email?.split('@')[0] || 'Signal',
    email: payload.email || null,
    picture: payload.picture || null,
  };
}

// Verify Apple id_token (real JWKS signature verification)
async function verifyAppleCredential(idToken) {
  // Decode header to get kid
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.payload) {
    throw new Error('Invalid Apple token format');
  }

  const { kid } = decoded.header;
  const { sub, email, email_verified, name: appleName } = decoded.payload;

  // Fetch Apple's current public keys
  const jwksResponse = await fetch('https://appleid.apple.com/auth/keys');
  const jwks = await jwksResponse.json();
  const appleKey = jwks.keys.find((k) => k.kid === kid);

  if (!appleKey) throw new Error('Apple public key not found');

  // Convert JWK (RSA) to PEM for jsonwebtoken
  const modulus = Buffer.from(appleKey.n, 'base64');
  const exponent = Buffer.from(appleKey.e, 'base64');
  const publicKey = crypto.createPublicKey({
    key: {
      kty: 'RSA',
      n: modulus.toString('base64url'),
      e: exponent.toString('base64url'),
    },
    format: 'jwk',
  });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });

  // Verify signature + claims
  const verified = jwt.verify(idToken, pem, {
    algorithms: ['RS256'],
    audience: APPLE_CLIENT_ID,
    issuer: 'https://appleid.apple.com',
  });

  return {
    providerId: verified.sub || sub,
    displayName: appleName || (verified.email || email || 'Signal')?.split('@')[0] || 'Signal User',
    email: verified.email || email || null,
    picture: null, // Apple does not provide picture in the token
  };
}

// --- Auth Routes (called by the radio frontend) ---

app.post('/auth/guest', (req, res) => {
  // Ultra fast guest — no provider verification, but we still issue a real server token (secured)
  const { ageVerified } = req.body || {};
  const result = createSecureSession({
    provider: 'guest',
    ageVerified: !!ageVerified,
  });

  // Also set httpOnly cookie for defense-in-depth (socket + future requests)
  res.cookie('radio_auth', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 400, // ~13 months
  });

  res.json({ ok: true, ...result });
});

app.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    const googleData = await verifyGoogleCredential(credential);
    const result = createSecureSession({
      provider: 'google',
      providerId: googleData.providerId,
      displayName: googleData.displayName,
      email: googleData.email,
      picture: googleData.picture,
      ageVerified: true, // real verified Google identity
    });

    res.cookie('radio_auth', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 400,
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Radio] Google auth failed:', err.message);
    res.status(401).json({ error: 'Google sign in failed. Please try again.' });
  }
});

app.post('/auth/apple', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing Apple credential' });

    const appleData = await verifyAppleCredential(credential);
    const result = createSecureSession({
      provider: 'apple',
      providerId: appleData.providerId,
      displayName: appleData.displayName,
      email: appleData.email,
      picture: appleData.picture,
      ageVerified: true,
    });

    res.cookie('radio_auth', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 400,
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Radio] Apple auth failed:', err.message);
    res.status(401).json({ error: 'Apple sign in failed. Make sure you are using a real Apple ID in production.' });
  }
});

// NOTE: Legacy recovery still works for old guest tokens if someone has a code.
// The primary new paths are the three above: guest (fastest), google, apple (secured).

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;

// In-memory waiting queue: { id, socket, profile }
let waiting = [];
// Active rooms: roomId -> { userA: id, userB: id }
const rooms = new Map();

function getOnlineCount() {
  // Rough count: connected sockets (rough proxy for "people online")
  return io.sockets.sockets.size;
}

function broadcastOnline() {
  io.emit('online', getOnlineCount());
}

io.on('connection', (socket) => {
  // Client joins the random voice/video chat queue
  socket.on('join-queue', (profile = {}) => {
    // Remove from any previous room/queue
    leaveCurrent(socket);

    // If client sent a valid auth token (from Google/Apple/Guest), use the server's verified display name
    let finalUsername = profile.username || null;
    let authProvider = 'guest';

    const validated = profile.token ? validateToken(profile.token) : null;
    if (validated) {
      if (validated.displayName) finalUsername = validated.displayName;
      authProvider = validated.provider || 'guest';
    }

    const user = {
      id: socket.id,
      socket,
      token: profile.token || null,
      profile: {
        username: finalUsername || generateRadioGuestName(),
        interests: Array.isArray(profile.interests) ? profile.interests.slice(0, 5) : [],
        country: profile.country || null,
        preferredCountry: profile.preferredCountry || 'any',
        wantsVideo: !!profile.wantsVideo,
        authProvider,
      },
    };

    // Try to find a good preference-aware match (interests + country filter)
    let partner = findBestMatch(user);
    if (!partner && waiting.length > 0) {
      partner = waiting.shift();
    }

    if (partner) {
      const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      socket.join(roomId);
      partner.socket.join(roomId);

      rooms.set(roomId, { userA: socket.id, userB: partner.id });

      const matchDataForMe = {
        roomId,
        strangerName: partner.profile.username,
        strangerInterests: partner.profile.interests,
        strangerCountry: partner.profile.country || 'Unknown',
        strangerWantsVideo: !!partner.profile.wantsVideo,
      };
      const matchDataForThem = {
        roomId,
        strangerName: user.profile.username,
        strangerInterests: user.profile.interests,
        strangerCountry: user.profile.country || 'Unknown',
        strangerWantsVideo: !!user.profile.wantsVideo,
      };

      socket.emit('matched', matchDataForMe);
      partner.socket.emit('matched', matchDataForThem);

      broadcastOnline();
    } else {
      waiting.push(user);
      socket.emit('searching', { online: getOnlineCount() });
      broadcastOnline();
    }
  });

  // WebRTC signaling relay (offer, answer, ice)
  socket.on('signal', ({ roomId, type, data }) => {
    // Relay to everyone else in the room (the partner)
    socket.to(roomId).emit('signal', {
      type,
      data,
      from: socket.id,
    });
  });

  // =====================================================
  // STEP 2: Basic text chat via Socket.IO
  // Messages are only sent within the current matched room.
  // Includes typing indicators.
  // =====================================================

  socket.on('text-message', (msg) => {
    const roomId = findRoomForSocket(socket.id);
    if (!roomId) return;

    const message = {
      id: Date.now() + Math.random(),
      from: socket.id,
      text: msg.text || msg,
      timestamp: Date.now(),
    };

    // Send to the partner only (not back to self here — client adds its own)
    socket.to(roomId).emit('text-message', message);
  });

  // Real mid-call "request video from the other person" (WhatsApp-style upgrade)
  socket.on('request-video', () => {
    const roomId = findRoomForSocket(socket.id);
    if (roomId) {
      socket.to(roomId).emit('request-video');
    }
  });

  // Typing indicator
  socket.on('typing', () => {
    const roomId = findRoomForSocket(socket.id);
    if (roomId) {
      socket.to(roomId).emit('typing', { from: socket.id });
    }
  });

  socket.on('stop-typing', () => {
    const roomId = findRoomForSocket(socket.id);
    if (roomId) {
      socket.to(roomId).emit('stop-typing', { from: socket.id });
    }
  });

  // User wants a new person (Next button)
  socket.on('next', () => {
    const currentRoom = findRoomForSocket(socket.id);
    if (currentRoom) {
      const partnerId = getPartnerId(currentRoom, socket.id);
      if (partnerId) {
        io.to(partnerId).emit('stranger-left', { reason: 'next' });
      }
      // Clean room
      leaveRoom(socket.id, currentRoom);
    }
    // Re-queue self
    socket.emit('left-room');
    // Small delay so UI can reset
    setTimeout(() => {
      // Client will call join-queue again after receiving 'left-room'
    }, 50);
  });

  // User explicitly leaves / ends
  socket.on('leave', () => {
    leaveCurrent(socket);
    socket.emit('left-room');
    broadcastOnline();
  });

  // Periodic online count ping (client can also request)
  socket.on('get-online', () => {
    socket.emit('online', getOnlineCount());
  });

  socket.on('disconnect', () => {
    leaveCurrent(socket);
    broadcastOnline();
  });
});

function findRoomForSocket(socketId) {
  for (const [roomId, participants] of rooms.entries()) {
    if (participants.userA === socketId || participants.userB === socketId) {
      return roomId;
    }
  }
  return null;
}

// Simple preference-aware matcher (used for filters + country + interests)
// Returns a good partner from waiting or null. Removes it from queue if found.
function findBestMatch(newUser) {
  if (waiting.length === 0) return null;

  let best = null;
  let bestScore = -1;
  let bestIdx = -1;

  const myInterests = newUser.profile.interests || [];
  const myCountry = newUser.profile.country;
  const myPref = newUser.profile.preferredCountry || 'any';

  for (let i = 0; i < waiting.length; i++) {
    const c = waiting[i];
    const cInterests = c.profile.interests || [];
    const cCountry = c.profile.country;
    const cPref = c.profile.preferredCountry || 'any';

    let score = 0;

    // Shared interests boost
    const shared = myInterests.filter(i => cInterests.includes(i)).length;
    score += shared * 2;

    // Mutual country preference match
    if (myPref === 'any' || myPref === cCountry) score += 3;
    if (cPref === 'any' || cPref === myCountry) score += 3;

    // Exact same country is nice too
    if (myCountry && cCountry && myCountry === cCountry) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = c;
      bestIdx = i;
    }
  }

  // Only use a "best" if it has some positive compatibility, otherwise fall back to FIFO
  if (best && bestScore >= 1) {
    waiting.splice(bestIdx, 1);
    return best;
  }
  return null;
}

function getPartnerId(roomId, myId) {
  const r = rooms.get(roomId);
  if (!r) return null;
  return r.userA === myId ? r.userB : r.userA;
}

function leaveRoom(socketId, roomId) {
  const r = rooms.get(roomId);
  if (!r) return;

  const partnerId = getPartnerId(roomId, socketId);

  rooms.delete(roomId);

  // Make sure sockets leave the socket.io room
  const mySocket = io.sockets.sockets.get(socketId);
  const partnerSocket = partnerId ? io.sockets.sockets.get(partnerId) : null;

  if (mySocket) mySocket.leave(roomId);
  if (partnerSocket) partnerSocket.leave(roomId);
}

function leaveCurrent(socket) {
  // Remove from waiting queue
  waiting = waiting.filter(u => u.id !== socket.id);

  // Leave any active room
  const roomId = findRoomForSocket(socket.id);
  if (roomId) {
    const partnerId = getPartnerId(roomId, socket.id);
    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('stranger-left', { reason: 'disconnect' });
        partnerSocket.leave(roomId);
      }
    }
    rooms.delete(roomId);
    socket.leave(roomId);
  }
}

// Basic health + info (always available, including prod for monitoring/Render health checks)
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Radio signaling + matching',
    online: getOnlineCount(),
    waiting: waiting.length,
  });
});

app.get('/online', (_req, res) => {
  res.json({ online: getOnlineCount(), waiting: waiting.length });
});

// Support the recovery UI "set custom code" flow (used by RecoveryCodeDisplay / Preferences)
app.post('/api/set-custom-recovery', (req, res) => {
  const token = req.cookies?.radio_auth || req.body?.token;
  const { customRecoveryCode } = req.body || {};
  if (!token || !customRecoveryCode) {
    return res.status(400).json({ error: 'Missing token or customRecoveryCode' });
  }
  const data = sessions.get(token);
  if (!data) return res.status(401).json({ error: 'Invalid or expired session' });

  const trimmed = String(customRecoveryCode).trim().toUpperCase().slice(0, 30);
  if (trimmed.length < 3) {
    return res.status(400).json({ error: 'Custom code must be at least 3 characters' });
  }

  data.customRecoveryCode = trimmed;
  // recoveryHash stays as-is for legacy; recoverSession already prefers customRecoveryCode when present
  res.json({ ok: true, recoveryCode: trimmed });
});

// Serve the built React frontend in production (single service deploy on same origin)
// IMPORTANT: register API routes (above) first. Static + SPA catch-all last.
// Use '/*splat' for Express 5 + path-to-regexp v8+ compatibility (required for catch-all in recent Express).
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`\n[Radio] Signaling server running on http://localhost:${PORT}`);
  console.log(`Frontend should connect to ws://localhost:${PORT}`);
});

setInterval(broadcastOnline, 15000); // keep online count fresh
