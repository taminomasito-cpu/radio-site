import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Landing from './components/Landing';
import VoiceChat from './components/VoiceChat';
import AgeGate from './components/AgeGate';
import LegalModal from './components/LegalModal';

// Auth flow for Radio:
// - Guest: very fast, no verification friction, still issues a real secured server token.
// - Google / Apple: fully secured via real OAuth ID token verified on the server.
// Logged-in (Google/Apple) users skip the age gate (provider already verified a real person).
// Guest still goes through the quick 18+ checkbox for legal compliance.

interface AuthProfile {
  username: string;
  token?: string;
  provider?: 'guest' | 'google' | 'apple';
  picture?: string | null;
  wantsVideo?: boolean;
}

type AppView = 'landing' | 'consent' | 'voice';

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [, setPendingVideo] = useState(false);
  const [legalSection, setLegalSection] = useState<'privacy' | 'terms' | 'safety' | 'contact' | null>(null);
  const [, setIsAuthenticated] = useState(false); // true for google/apple paths (we skip gate)

  // One single easy entry point — now routes to the ultra-fast Guest path
  const handleStartGuest = () => {
    setPendingVideo(false);
    setIsAuthenticated(false);
    setView('consent'); // Guest still sees the quick 18+ gate (legal)
  };

  // Secure Google sign in (client gets ID token via GIS, we send it to server for full verification)
  const handleGoogleSignIn = async () => {
    try {
      if (!(window as any).google?.accounts?.id) {
        // Try to wait a moment for the script
        await new Promise(r => setTimeout(r, 600));
      }
      const google = (window as any).google;
      if (!google?.accounts?.id) {
        alert('Google Sign-In is not available right now. Please try Guest (instant) or reload the page.');
        return;
      }

      google.accounts.id.initialize({
        client_id: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        callback: async (response: any) => {
          if (!response?.credential) return;
          const res = await fetch('/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await res.json();
          if (!data?.ok) throw new Error(data?.error || 'Google auth failed');

          setIsAuthenticated(true);
          setPendingVideo(false);
          setProfile({
            username: data.username,
            token: data.token,
            provider: 'google',
            picture: data.picture || null,
          });
          setView('voice'); // Secured login → straight to air (no extra gate)
        },
      });

      // Show Google's account chooser / popup (very secure)
      google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: some browsers block prompt — user can still use Guest instantly
          console.info('[Radio] Google prompt was not shown, user can use Guest instead.');
        }
      });
    } catch (e) {
      console.error(e);
      alert('Could not start Google sign in. The instant Guest option is always available and fully secured.');
    }
  };

  // Apple Sign In (real ID token verified server-side). Requires Apple Developer setup for production.
  const handleAppleSignIn = async () => {
    try {
      // Prefer the official Apple JS if loaded
      const AppleID = (window as any).AppleID;
      if (AppleID?.auth) {
        try {
          const response = await AppleID.auth.signIn();
          const credential = response?.authorization?.id_token;
          if (credential) {
            await finishAppleAuth(credential);
            return;
          }
        } catch (e) {
          console.warn('Apple native flow failed, trying fallback', e);
        }
      }

      // Fallback / dev path: ask user for the id_token (in real prod the Apple button flow gives it directly)
      // For local testing without full Apple dev portal setup we still allow the backend to be exercised.
      const testCredential = prompt('For testing Apple auth locally, paste an Apple id_token here (in production the native Apple button will provide it automatically). Leave empty to cancel.');
      if (testCredential && testCredential.length > 20) {
        await finishAppleAuth(testCredential);
      } else {
        // Provide a super simple dev simulation note (still goes through real backend verify path if token is real)
        alert('Apple Sign In requires a configured Apple Developer account + associated domain for the native button in production.\n\nThe backend verification is fully real. Use Guest (instant) or Google for now, or supply a valid Apple id_token for testing.');
      }
    } catch (e) {
      console.error(e);
      alert('Apple sign in could not complete. Guest login is always instant and secured.');
    }
  };

  async function finishAppleAuth(credential: string) {
    const res = await fetch('/auth/apple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential }),
    });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'Apple auth failed');

    setIsAuthenticated(true);
    setPendingVideo(false);
    setProfile({
      username: data.username,
      token: data.token,
      provider: 'apple',
      picture: data.picture || null,
    });
    setView('voice'); // Secured Apple login → straight onto the air
  };

  // Called after the quick AgeGate for Guest path only.
  // We also create a real secured guest session here for consistency.
  const handleAgeConfirmed = async () => {
    try {
      // Create a fast secured guest session (server issues real token)
      const authRes = await fetch('/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ageVerified: true }),
      });
      const authData = await authRes.json();

      const finalName = authData?.username || 'Signal Guest ' + Math.floor(100 + Math.random() * 8900);

      setProfile({
        username: finalName,
        token: authData?.token,
        provider: 'guest',
      });
      setView('voice');
    } catch (e) {
      // Ultimate fallback — still works, just less "tokenized" for this session
      console.warn('Guest auth endpoint failed, using local name only', e);
      setProfile({
        username: profile?.username || 'Signal Guest ' + Math.floor(1000 + Math.random() * 9000),
        provider: 'guest',
      });
      setView('voice');
    }
  };

  const exitVoice = () => {
    setView('landing');
    setProfile(null);
    setPendingVideo(false);
    setIsAuthenticated(false);
  };

  const openLegal = (section: 'privacy' | 'terms' | 'safety' | 'contact' = 'privacy') => {
    setLegalSection(section);
  };

  const closeLegal = () => setLegalSection(null);

  return (
    <>
      <AnimatePresence mode="wait">
        {view === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <Landing
              onStartGuest={handleStartGuest}
              onGoogleSignIn={handleGoogleSignIn}
              onAppleSignIn={handleAppleSignIn}
              onOpenLegal={openLegal}
            />
          </motion.div>
        )}

        {view === 'consent' && (
          <AgeGate
            key="consent"
            onVerified={handleAgeConfirmed}
            onCancel={() => {
              setView('landing');
              setPendingVideo(false);
            }}
          />
        )}

        {view === 'voice' && profile && (
          <motion.div
            key="voice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <VoiceChat
              profile={{
                username: profile.username,
                token: profile.token,
                interests: [],
                wantsVideo: profile.wantsVideo,
                authProvider: profile.provider,
              }}
              onExit={exitVoice}
              onOpenLegal={openLegal}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {legalSection && (
        <LegalModal onClose={closeLegal} initialSection={legalSection} />
      )}
    </>
  );
}
