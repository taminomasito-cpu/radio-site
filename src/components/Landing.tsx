import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import Logo3D from './Logo3D';

interface LandingProps {
  onStartGuest: () => void;
  onGoogleSignIn?: () => void;
  onAppleSignIn?: () => void;
  onOpenLegal?: (section?: 'privacy' | 'terms' | 'safety' | 'contact') => void;
}

// Pure classic professional radio landing. Elegant, simple, no notebook anywhere.
// Features the custom 3D planet + meteor ring as the hero mark on the home screen (simple + professional
// with own creative 3D celestial broadcast emblem). The live reactive 3D wave field is still used inside calls.
// Three entry points: instant Guest (fastest, no verification), or fully secured Google / Apple.
export default function Landing({ onStartGuest, onGoogleSignIn, onAppleSignIn, onOpenLegal }: LandingProps) {
  return (
    <div className="min-h-screen bg-[#f4f0e6] text-[#2c2522] flex flex-col selection:bg-[#c5a26f]/30">
      {/* Elegant top bar - classic radio receiver header.
          "Go on air" is placed here on the right so it is immediately visible the moment the site opens. */}
      <div className="border-b border-[#d9ccaf] bg-[#faf7f0]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo - very simple, elegant, memorable radio wave mark that echoes the Aether Wave Field */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {/* Custom simple memorable logo: core + elegant traveling radio waves. Gold on the theme's charcoal. */}
              <svg
                width="32"
                height="24"
                viewBox="0 0 32 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0"
              >
                <g stroke="#c5a26f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {/* Signal core */}
                  <circle cx="5" cy="12" r="2.8" fill="#c5a26f" stroke="none" />
                  {/* Very simple elegant radio waves — the pure essence. Memorable after one look. */}
                  <path d="M9.5 4.5 Q16 2.5 25 5.5" />
                  <path d="M9.5 8.5 Q17 7 25.5 9.5" />
                  <path d="M9.5 15.5 Q17 17 25.5 14.5" />
                  <path d="M9.5 19.5 Q16 21.5 25 18.5" />
                </g>
              </svg>

              <div>
                <div className="font-semibold text-2xl tracking-[-1px]">Radio</div>
                <div className="text-[10px] text-[#7a6652] -mt-1">real voices • real waves • no accounts</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Prominent "Go on air" right in the top bar — clearly visible the instant someone opens the site */}
            <button
              onClick={onStartGuest}
              className="text-base md:text-lg px-6 py-1.5 font-medium tracking-[-0.3px] border-b-[3px] border-[#3f342b] hover:border-[#c5a26f] transition-all active:border-[#c5a26f] whitespace-nowrap"
            >
              Go on air
            </button>

            <div className="hidden md:flex items-center gap-2 text-xs tracking-[1.5px] text-[#7a6652] pl-2 border-l border-[#d9ccaf]">
              <Users className="w-3.5 h-3.5" /> REAL VOICES • NO BOTS • NO ACCOUNTS
            </div>
          </div>
        </div>
      </div>

      {/* Hero: now centered on the 3D Logo mark.
          Simple, professional, elegant 3D emblem built from the same radio wave language
          used throughout the site (top bar 2D version + live signal visuals in calls).
          Creative but restrained — depth, subtle ribbons, professional rotation. */}
      <div className="flex-1 pt-6 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Headline + primary Go on air placed at the very top of the content.
              This + the top navigation button make the action clearly visible the moment someone opens the site. */}
          <div className="text-center mb-4">
            <div className="inline-block px-5 py-1 rounded-full bg-[#3f342b] text-[#f4f0e6] text-xs tracking-[2px] mb-3">REAL SIGNALS • REAL PEOPLE • NO ACCOUNTS</div>

            <div className="max-w-md mx-auto text-center mb-4">
              <div className="text-[42px] md:text-[52px] leading-[0.9] font-semibold tracking-[-3px] text-[#2c2522] mb-2">
                Tune in.<br />Hear a stranger.
              </div>
              <p className="text-[#5c5246] text-[14px]">
                Radio waves traveling the spectrum, looking for real persons.<br />
                Voice or video. No names. Just the signal.
              </p>
            </div>

            {/* Big prominent Go on air — high in the page so it's impossible to miss on first open */}
            <div className="flex justify-center mb-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.985 }}
                onClick={onStartGuest}
                className="text-2xl md:text-[28px] px-12 py-3 rounded-none border-b-[4px] border-[#3f342b] hover:border-[#c5a26f] font-medium tracking-[-0.3px] active:border-[#c5a26f]"
                style={{ lineHeight: 'var(--line-height)' }}
              >
                Go on air
              </motion.button>
            </div>
            <div className="text-center text-xs text-[#8a7660]">
              Instant guest • real secured token • no verification needed
            </div>
          </div>

          {/* The 3D Logo — now the main hero visual on the home screen.
              Elegant, simple, professional 3D planet with realistic meteor/asteroid ring.
              Own creative take on a celestial broadcast emblem. Very restrained motion.
              Ties to the live signal visuals inside calls. */}
          <div className="mb-6 mt-3">
            <Logo3D className="mx-auto" />
          </div>

          {/* Optional fully secured sign-in options (Google / Apple).
              Real verified accounts go straight on air. The primary instant "Go on air" (guest) is already clearly on top in the header and just above the 3D. */}
          {(onGoogleSignIn || onAppleSignIn) && (
            <div className="mt-2 mb-8 text-center">
              <div className="text-[10px] tracking-[1.5px] text-[#8a7660] mb-2">OR SIGN IN SECURELY</div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {onGoogleSignIn && (
                  <button
                    onClick={onGoogleSignIn}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded border border-[#d9ccaf] hover:border-[#3f342b] bg-white/60 text-sm tracking-[-0.1px] active:bg-[#f4f0e6] transition"
                  >
                    <span className="font-semibold text-[#2c2522]">G</span>
                    <span>Sign in with Google</span>
                  </button>
                )}
                {onAppleSignIn && (
                  <button
                    onClick={onAppleSignIn}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded border border-[#2c2522] bg-[#2c2522] text-[#f4f0e6] hover:bg-black text-sm tracking-[-0.1px] active:bg-[#111] transition"
                  >
                    <span className="font-semibold"></span>
                    <span>Sign in with Apple</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 text-center text-xs tracking-[1px] text-[#8a7660]">
            100% anonymous guest option • free forever • transmitting on phone &amp; desktop
          </div>
        </div>
      </div>

      {/* Founder / Operator section — scroll down for the story */}
      <div className="border-t border-[#d9ccaf] bg-[#faf7f0]">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <div className="mb-8">
            <div className="text-xs tracking-[2px] text-[#8a7660] mb-2">FROM THE OPERATOR</div>
            <div className="text-2xl font-semibold tracking-[-0.6px] text-[#2c2522]">A note from the frequency</div>
          </div>

          <div className="space-y-6 text-[15px] leading-relaxed text-[#5c5246]">
            <p>
              Hi, I’m the solo builder and operator behind Radio.
            </p>

            <p>
              I started this project in early 2026 because I was tired of conversations that felt filtered through profiles, algorithms, and performance. I wanted a place where two real people could simply tune in and talk — nothing more, nothing less. The idea came from the old magic of radio waves traveling the spectrum, looking for another signal without needing names or introductions.
            </p>

            <p>
              I built it alone, starting with the most minimal possible experience: open the site, press “Go on air,” and you’re live. The 3D planet + meteor ring hero and the live voice-reactive waves grew out of a desire to make the connection itself feel visible and alive, like watching the actual frequency between two people.
            </p>

            <p>
              One small story: During an early prototype test I matched with someone on the other side of the world at 3 a.m. We talked for almost an hour about ordinary things — music, cities we’d never visited, the strange comfort of speaking to a complete stranger. When we both said goodnight and the transmission ended, it felt like something real had passed between us for a little while. That moment is why I keep the signal going.
            </p>
          </div>

          <div className="mt-10 pt-8 border-t border-[#d9ccaf]">
            <div className="text-sm text-[#5c5246] mb-3">
              If you’ve enjoyed the signal and want to help keep Radio running (servers, development, and keeping it completely free and account-free), any support is deeply appreciated.
            </div>
            <a
              href="mailto:taminomasito@gmail.com?subject=Supporting%20the%20Radio%20signal"
              className="inline-block px-6 py-2 text-sm border-b-2 border-[#3f342b] hover:border-[#c5a26f] font-medium tracking-[-0.2px] transition-colors"
            >
              Support Radio
            </a>
            <div className="text-[11px] text-[#8a7660] mt-2">
              or just say hi — taminomasito@gmail.com
            </div>
          </div>
        </div>
      </div>

      {/* Elegant radio footer */}
      <div className="border-t border-[#d9ccaf] py-5 px-6 text-xs text-[#7a6652] bg-[#faf7f0]">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-center">
          <span>Transmit kindly. These signals are shared with real humans.</span>

          {onOpenLegal && (
            <>
              <button onClick={() => onOpenLegal('privacy')} className="hover:text-[#3f342b] underline underline-offset-2">Privacy</button>
              <button onClick={() => onOpenLegal('terms')} className="hover:text-[#3f342b] underline underline-offset-2">Terms</button>
              <button onClick={() => onOpenLegal('safety')} className="hover:text-[#3f342b] underline underline-offset-2">Safety</button>
              <button onClick={() => onOpenLegal('contact')} className="hover:text-[#3f342b] underline underline-offset-2">Contact</button>
            </>
          )}

          <span className="hidden sm:inline">•</span>
          <a href="mailto:taminomasito@gmail.com" className="hover:text-[#3f342b] underline">taminomasito@gmail.com</a>
        </div>
      </div>
    </div>
  );
}
