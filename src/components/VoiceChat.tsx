import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { VoiceChatView } from './VoiceChatView';

const getSignalingUrl = () => {
  const envUrl = (import.meta as any).env?.VITE_SIGNALING_URL;
  if (envUrl) return envUrl;

  // Production single-service deploy (the Express server serves the built React at root):
  // use the current origin so cookies, WebSockets, and API calls all go to the same place.
  // In Vite dev (port 5173) we force localhost:3001 so the real backend + Socket.IO is reached.
  const isViteDev = (import.meta as any).env?.DEV === true;
  const looksLikeProdOrigin =
    typeof window !== 'undefined' &&
    window.location.protocol.startsWith('http') &&
    !window.location.port; // no explicit port (or 443 etc.) usually means prod origin

  if (!isViteDev && looksLikeProdOrigin) {
    return window.location.origin;
  }

  // Dev / fallback: the backend (npm run server or dev:all). Vite proxy handles the HTTP API paths.
  return 'http://localhost:3001';
};

const SIGNALING_URL = getSignalingUrl();

// Professional-grade ICE servers for high reliability (STUN + multiple TURN fallbacks)
// In production you should run your own Coturn/TURN for best results (no rate limits, low latency).
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  // Public TURN relays (free tier, may have limits – fine for testing, replace in prod)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

interface Profile {
  username: string;
  interests: string[];
  token?: string;
  country?: string;
  preferredCountry?: string;
  wantsVideo?: boolean;
  authProvider?: 'guest' | 'google' | 'apple';
}

interface VoiceChatProps {
  profile: Profile;
  onExit: () => void;
  onOpenLegal?: (section?: 'privacy' | 'terms' | 'safety' | 'contact') => void;
}

type ChatState = 'searching' | 'matched' | 'left';

export default function VoiceChat({ profile, onExit }: VoiceChatProps) {
  const [state, setState] = useState<ChatState>('searching');
  const [strangerName, setStrangerName] = useState('Stranger');
  const [, setStrangerInterests] = useState<string[]>([]); // kept for potential future use in radio theme
  const [strangerCountry, setStrangerCountry] = useState<string>('Unknown');
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [online, setOnline] = useState(1247);
  const [messages, setMessages] = useState<{ id: number; from: 'you' | 'them'; text: string; timestamp: number }[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [signalsReceived, setSignalsReceived] = useState(0);   // radio log counter
  const [frequencyNote, setFrequencyNote] = useState('');     // shared note on this frequency / transmission
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'reconnecting' | 'poor'>('excellent');
  const [videoRequestFromStranger, setVideoRequestFromStranger] = useState(false);
  const [remoteCameraOn, setRemoteCameraOn] = useState(true); // whether the stranger currently has camera sending
  const [voiceAmplitude, setVoiceAmplitude] = useState(0); // 0-1 for the 3D radio waves vibration

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Radio wave visualizer - vibration line that reacts to voice like radio waves
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Connect socket once
  useEffect(() => {
    const socket = io(SIGNALING_URL, {
      transports: ['websocket'],
      withCredentials: true, // important for httpOnly cookie
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-queue', {
        username: profile.username,
        interests: profile.interests || [],
        token: profile.token,
        country: profile.country,
        preferredCountry: profile.preferredCountry,
        wantsVideo: profile.wantsVideo,
      });
    });

    socket.on('online', (count: number) => {
      if (count > 200) setOnline(count);
    });

    socket.on('searching', (data: { online?: number }) => {
      setState('searching');
      if (data.online) setOnline(data.online);
      cleanupCall();
    });

    socket.on('matched', (data: { roomId: string; strangerName: string; strangerInterests?: string[]; strangerCountry?: string; strangerWantsVideo?: boolean }) => {
      roomIdRef.current = data.roomId;
      setStrangerName(data.strangerName || 'Stranger');
      setStrangerInterests(data.strangerInterests || []);
      setStrangerCountry(data.strangerCountry || 'Unknown');

      const videoMode = !!(profile.wantsVideo || data.strangerWantsVideo);
      setIsVideoCall(videoMode);
      setIsCameraOn(videoMode); // start camera on if this is a video call

      setState('matched');
      setMessages([]);
      setSignalsReceived(1);   // first signal when you go live
      setFrequencyNote('');    // fresh frequency, no note yet
      startMediaCall(data.roomId, socket, videoMode);
    });

    socket.on('signal', async ({ type, data }: any) => {
      const pc = pcRef.current;
      if (!pc) return;

      if (type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { roomId: roomIdRef.current, type: 'answer', data: answer });
      } else if (type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (type === 'ice') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data));
        } catch (e) {
          // ignore
        }
      } else if (type === 'camera-state') {
        setRemoteCameraOn(!!data.on);
      }
    });

    socket.on('stranger-left', () => {
      cleanupCall();
      setState('left');
      setIsCameraOn(false);
      setConnectionQuality('excellent');

      // NO auto-cut. Give the user clear control.
      // They can click Skip or wait – we do not force a new search immediately.
      // This prevents the "call suddenly drops and auto starts new" bug you hated.
    });

    socket.on('left-room', () => {
      cleanupCall();
      setState('searching');
      setIsVideoCall(false);
      setIsCameraOn(false);
    });

    // STEP 2: Basic text chat + special "topic" messages
    socket.on('text-message', (msg: any) => {
      const raw = msg.text || msg;

      // Special frequency note update from the other person (or our own echo)
      if (typeof raw === 'string' && raw.startsWith('__TOPIC__')) {
        const topicText = raw.replace('__TOPIC__', '');
        setFrequencyNote(topicText);
        return; // don't add to normal chat lines
      }

      setMessages(prev => [...prev, {
        id: msg.id || Date.now(),
        from: 'them',
        text: raw,
        timestamp: msg.timestamp || Date.now(),
      }]);
    });

    socket.on('typing', () => {
      setIsPartnerTyping(true);
    });

    socket.on('stop-typing', () => {
      setIsPartnerTyping(false);
    });

    // Real "request video from other person" feature (like WhatsApp video upgrade)
    socket.on('request-video', () => {
      setVideoRequestFromStranger(true);
    });

    // Keep online fresh
    const onlineInterval = setInterval(() => {
      socket.emit('get-online');
    }, 20000);

    return () => {
      clearInterval(onlineInterval);
      cleanupCall();
      socket.disconnect();
    };
  }, [profile]);

  // Update voice amplitude for the 3D radio waves (real-time vibration when speaking)
  useEffect(() => {
    if (state !== 'matched') {
      setVoiceAmplitude(0);
      return;
    }
    const id = setInterval(() => {
      const local = getAudioLevel(localAnalyserRef.current);
      const remote = getAudioLevel(remoteAnalyserRef.current);
      setVoiceAmplitude(Math.max(local, remote));
    }, 80);
    return () => clearInterval(id);
  }, [state]);

  // Single elegant LIVE TRACE — classic radio oscilloscope / modulation line.
  // Reacts to voice (local + remote). "Chants" and vibrates like real radio waves on a scope when someone speaks.
  // One clean animation loop, pure professional analog feel.
  useEffect(() => {
    if (state !== 'matched') {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const canvas = waveCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const localAmp = getAudioLevel(localAnalyserRef.current);
      const remoteAmp = getAudioLevel(remoteAnalyserRef.current);
      const amp = Math.max(localAmp, remoteAmp) * 26;

      // Main elegant gold/ink trace — the "chanting vibration on a line"
      ctx.strokeStyle = '#c5a26f';
      ctx.lineWidth = 2.1;
      ctx.beginPath();

      const midY = canvas.height / 2;
      const time = phase;

      for (let x = 0; x <= canvas.width; x += 2) {
        const norm = x / canvas.width;
        // Rich harmonic for beautiful radio wave "chant" motion
        const wave = Math.sin(norm * Math.PI * 3.7 + time) * amp * (0.58 + Math.sin(norm * 8.2) * 0.42);
        const y = midY + wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Delicate secondary harmonic — classic scope depth, only when voice present
      if (amp > 0.6) {
        ctx.strokeStyle = '#8a7660';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        for (let x = 0; x <= canvas.width; x += 2) {
          const norm = x / canvas.width;
          const wave = Math.sin(norm * Math.PI * 7.4 + time * 1.65) * amp * 0.32;
          const y = midY + wave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      phase += 0.11 + amp * 0.009; // voice accelerates the chant
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [state]);

  function getAudioLevel(analyser: AnalyserNode | null): number {
    if (!analyser) return 0;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
    return sum / bufferLength / 255;
  }

  async function startMediaCall(roomId: string, socket: Socket, wantsVideo: boolean) {
    try {
      // High-quality audio first (WhatsApp-like clarity)
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1, // mono for lowest latency in chat
        },
        video: wantsVideo
          ? {
              facingMode: 'user',
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 60 },
            }
          : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      // Attach local video preview if we have video
      if (wantsVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
        setIsCameraOn(true);
      }

      // Setup radio wave analyser for local mic (vibration when you speak)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const localSource = audioContextRef.current.createMediaStreamSource(stream);
      const localAnalyser = audioContextRef.current.createAnalyser();
      localAnalyser.fftSize = 32;
      localSource.connect(localAnalyser);
      localAnalyserRef.current = localAnalyser;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Data channel for low-latency control (camera state, reactions, topic)
      // Much more reliable and lower lag than going through socket for these
      const dc = pc.createDataChannel('control', { ordered: true });
      dataChannelRef.current = dc;

      dc.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'camera-state') {
            setRemoteCameraOn(!!data.on);
          }
          if (data.type === 'reaction') {
            // Show floating emoji on remote video for fun
            showFloatingReaction(data.emoji);
          }
        } catch (e) {}
      };

      pc.ondatachannel = (event) => {
        const incomingDc = event.channel;
        incomingDc.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === 'camera-state') {
              setRemoteCameraOn(!!data.on);
            }
            if (data.type === 'reaction') {
              showFloatingReaction(data.emoji);
            }
          } catch (e) {}
        };
        dataChannelRef.current = incomingDc;
      };

      // Professional connection monitoring – prevents mysterious drops
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log('[Radio] ICE state:', state);

        if (state === 'connected' || state === 'completed') {
          setConnectionQuality('excellent');
        } else if (state === 'disconnected') {
          setConnectionQuality('reconnecting');
          // Give it a chance to recover (WhatsApp does this too)
          setTimeout(() => {
            if (pcRef.current && pcRef.current.iceConnectionState === 'disconnected') {
              console.log('[Radio] Attempting ICE restart...');
              try {
                pcRef.current.restartIce();
                // Re-negotiate if needed
                if (socketRef.current && roomIdRef.current) {
                  pcRef.current.createOffer({ iceRestart: true }).then(offer => {
                    pcRef.current!.setLocalDescription(offer);
                    socketRef.current!.emit('signal', { roomId: roomIdRef.current, type: 'offer', data: offer });
                  }).catch(console.warn);
                }
              } catch (e) { console.warn(e); }
            }
          }, 2500);
        } else if (state === 'failed') {
          setConnectionQuality('poor');
          // Last resort – try full renegotiation instead of hard drop
          setTimeout(() => {
            if (pcRef.current && socketRef.current && roomIdRef.current) {
              console.log('[Radio] Full renegotiation after ICE failure');
              pcRef.current.createOffer().then(offer => {
                pcRef.current!.setLocalDescription(offer);
                socketRef.current!.emit('signal', { roomId: roomIdRef.current, type: 'offer', data: offer });
              }).catch(console.warn);
            }
          }, 1500);
        }
      };

      // Add all local tracks (audio + optional video)
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Remote audio (always)
      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      audioElRef.current = remoteAudio;

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;

        // If this track is video, attach to remote video element
        if (event.track.kind === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
          setRemoteCameraOn(true);
        } else if (event.track.kind === 'audio') {
          remoteAudio.srcObject = stream;

          // Radio wave analyser for remote voice - vibration when they speak
          if (audioContextRef.current) {
            const remoteSource = audioContextRef.current.createMediaStreamSource(stream);
            const remoteAnalyser = audioContextRef.current.createAnalyser();
            remoteAnalyser.fftSize = 32;
            remoteSource.connect(remoteAnalyser);
            remoteAnalyserRef.current = remoteAnalyser;
          }
        }

        // If the remote ends the track (e.g. they pause camera), update state so we show overlay
        // without killing the call.
        event.track.onended = () => {
          if (event.track.kind === 'video') {
            setRemoteCameraOn(false);
          }
        };
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && roomId) {
          socket.emit('signal', { roomId, type: 'ice', data: event.candidate });
        }
      };

      // Extra safety: connection state (some browsers report here first)
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setConnectionQuality('excellent');
        } else if (['disconnected', 'failed'].includes(pc.connectionState)) {
          setConnectionQuality('reconnecting');
        }
      };

      const myId = socket.id || '';
      const shouldOffer = myId < (roomId.split('-').pop() || '');

      if (shouldOffer) {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: wantsVideo,
        });
        await pc.setLocalDescription(offer);
        socket.emit('signal', { roomId, type: 'offer', data: offer });
      }
    } catch (err: any) {
      console.error('Media error (mic/camera):', err);
      if (wantsVideo) {
        // Graceful fallback – never hard crash the page
        setIsVideoCall(false);
        setIsCameraOn(false);
        alert('Could not access camera. Starting high-quality voice chat instead.');
        // Retry cleanly as voice-only
        startMediaCall(roomId, socket, false);
      } else {
        alert('Could not access microphone. Please allow mic access and try again.');
        handleNext();
      }
    }
  }

  function cleanupCall() {
    // Close data channel cleanly
    if (dataChannelRef.current) {
      try { dataChannelRef.current.close(); } catch (e) {}
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (e) {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      localStreamRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    roomIdRef.current = null;
    setIsMuted(false);
    setIsCameraOn(false);
    setRemoteCameraOn(true);
    setVideoRequestFromStranger(false);
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }

  function toggleCamera(forceOn = false) {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const next = forceOn ? true : !videoTrack.enabled;
      videoTrack.enabled = next;
      setIsCameraOn(next);

      // Broadcast state so the other side can show accurate "camera off" state
      const stateMsg = JSON.stringify({ type: 'camera-state', on: next });
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        dataChannelRef.current.send(stateMsg);
      }
      if (socketRef.current && roomIdRef.current) {
        socketRef.current.emit('signal', { 
          roomId: roomIdRef.current, 
          type: 'camera-state', 
          data: { on: next } 
        });
      }

      if (next && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } else if (isVideoCall || forceOn) {
      // Upgrade to video mid-call
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then((videoStream) => {
          const newVideoTrack = videoStream.getVideoTracks()[0];
          if (newVideoTrack && pcRef.current && localStreamRef.current) {
            localStreamRef.current.addTrack(newVideoTrack);
            pcRef.current.addTrack(newVideoTrack, localStreamRef.current);

            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
            setIsCameraOn(true);

            const stateMsg = JSON.stringify({ type: 'camera-state', on: true });
            if (dataChannelRef.current?.readyState === 'open') dataChannelRef.current.send(stateMsg);
            if (socketRef.current && roomIdRef.current) {
              socketRef.current.emit('signal', { roomId: roomIdRef.current, type: 'camera-state', data: { on: true } });

              pcRef.current.createOffer({ offerToReceiveVideo: true })
                .then(offer => pcRef.current!.setLocalDescription(offer))
                .then(() => {
                  socketRef.current!.emit('signal', {
                    roomId: roomIdRef.current,
                    type: 'offer',
                    data: pcRef.current!.localDescription,
                  });
                })
                .catch(console.error);
            }
          }
        })
        .catch((e) => {
          console.error('Failed to add camera mid-call', e);
          alert('Could not start camera. Please check permissions.');
        });
    }
  }

  // STEP 2: Send text message + typing indicators
  function sendText() {
    const text = textInput.trim();
    if (!text || !socketRef.current || state !== 'matched') return;

    const newMsg = {
      id: Date.now(),
      from: 'you' as const,
      text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, newMsg]);
    socketRef.current.emit('text-message', { text });
    socketRef.current.emit('stop-typing');
    setTextInput('');
  }

  // Set a note for this frequency (written at the top like a transmission note)
  function setTopic(newTopic: string) {
    const trimmed = newTopic.trim();
    setFrequencyNote(trimmed);

    if (socketRef.current && state === 'matched') {
      // We send it as a normal text message with a special prefix so the other side can pick it up
      // and we don't show it in the normal chat lines.
      socketRef.current.emit('text-message', { text: `__TOPIC__${trimmed}` });
    }
  }

  let typingTimeout: any = null;

  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput(e.target.value);

    if (!socketRef.current || state !== 'matched') return;

    socketRef.current.emit('typing');

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (socketRef.current) socketRef.current.emit('stop-typing');
    }, 1200);
  };

  function handleNext() {
    // Prevent rapid clicks causing double joins or state chaos.
    if (!socketRef.current || state === 'searching') return;

    socketRef.current.emit('next');
    setSignalsReceived(p => p + 1);
    setFrequencyNote('');
    cleanupCall();
    setState('searching');
    setMessages([]);
    setIsVideoCall(false);
    setIsCameraOn(false);
    setConnectionQuality('excellent');

    // Re-enter the queue immediately so matching can happen.
    socketRef.current.emit('join-queue', {
      username: profile.username,
      interests: profile.interests || [],
      token: profile.token,
      country: profile.country,
      preferredCountry: profile.preferredCountry,
      wantsVideo: profile.wantsVideo,
    });
  }

  function handleLeave() {
    if (!socketRef.current) return;
    socketRef.current.emit('leave');
    setFrequencyNote('');
    cleanupCall();
    onExit();
  }

  // Quick stamp / reaction — draws a small mark on the shared transmission log.
  // Minimal, fits the "mark on the log" feeling. Both people see it instantly.
  function quickStamp(emoji: string) {
    if (!socketRef.current || state !== 'matched') return;
    const stampMsg = ` *${emoji}* `;
    const newMsg = {
      id: Date.now(),
      from: 'you' as const,
      text: stampMsg,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, newMsg]);
    socketRef.current.emit('text-message', { text: stampMsg });

    // Also send via data channel for instant visual pop on their video
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'reaction', emoji }));
    }
    showFloatingReaction(emoji, true); // show on our side too
  };

  function showFloatingReaction(emoji: string, isLocal = false) {
    // Fun WhatsApp/Ome.tv style: emoji pops and floats on the remote (or local) video area
    const container = isLocal ? localVideoRef.current?.parentElement : remoteVideoRef.current?.parentElement;
    if (!container) return;

    const el = document.createElement('div');
    el.textContent = emoji;
    el.style.position = 'absolute';
    el.style.fontSize = '42px';
    el.style.zIndex = '50';
    el.style.pointerEvents = 'none';
    el.style.transition = 'transform 1.2s ease-out, opacity 1.2s ease-out';
    el.style.left = `${30 + Math.random() * 40}%`;
    el.style.top = `${20 + Math.random() * 50}%`;
    container.style.position = 'relative';
    container.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transform = `translateY(-${80 + Math.random() * 60}px) scale(0.6)`;
      el.style.opacity = '0';
    });

    setTimeout(() => el.remove(), 1400);
  }

  // Interests intentionally unused in pure radio theme (kept for future optionality)


  return (
    <VoiceChatView
      state={state}
      strangerName={strangerName}
      strangerCountry={strangerCountry}
      isVideoCall={isVideoCall}
      isMuted={isMuted}
      isCameraOn={isCameraOn}
      online={online}
      messages={messages}
      textInput={textInput}
      isPartnerTyping={isPartnerTyping}
      signalsReceived={signalsReceived}
      frequencyNote={frequencyNote}
      connectionQuality={connectionQuality}
      videoRequestFromStranger={videoRequestFromStranger}
      remoteCameraOn={remoteCameraOn}
      voiceAmplitude={voiceAmplitude}
      profile={profile}
      localVideoRef={localVideoRef}
      remoteVideoRef={remoteVideoRef}
      waveCanvasRef={waveCanvasRef}
      setFrequencyNote={setFrequencyNote}
      setTopic={setTopic}
      handleTextInputChange={handleTextInputChange}
      sendText={sendText}
      toggleMute={toggleMute}
      toggleCamera={toggleCamera}
      handleNext={handleNext}
      handleLeave={handleLeave}
      quickStamp={quickStamp}
      setVideoRequestFromStranger={setVideoRequestFromStranger}
      setConnectionQuality={setConnectionQuality}
      socketRef={socketRef}
      roomIdRef={roomIdRef}
      pcRef={pcRef}
    />
  );
}
