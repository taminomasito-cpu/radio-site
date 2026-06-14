import type React from 'react';
import { Mic } from 'lucide-react';
import RadioWave3D from './RadioWave3D';
import type { Socket } from 'socket.io-client';

export type VoiceChatViewProps = {
  state: 'searching' | 'matched' | 'left';
  strangerName: string;
  strangerCountry: string;
  isVideoCall: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  online: number;
  messages: { id: number; from: 'you' | 'them'; text: string; timestamp: number }[];
  textInput: string;
  isPartnerTyping: boolean;
  signalsReceived: number;
  frequencyNote: string;
  connectionQuality: 'excellent' | 'reconnecting' | 'poor';
  videoRequestFromStranger: boolean;
  remoteCameraOn: boolean;
  voiceAmplitude: number;
  profile: { username: string; authProvider?: 'guest' | 'google' | 'apple' };
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  waveCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  setFrequencyNote: React.Dispatch<React.SetStateAction<string>>;
  setTopic: (v: string) => void;
  handleTextInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sendText: () => void;
  toggleMute: () => void;
  toggleCamera: (forceOn?: boolean) => void;
  handleNext: () => void;
  handleLeave: () => void;
  quickStamp: (emoji: string) => void;
  setVideoRequestFromStranger: React.Dispatch<React.SetStateAction<boolean>>;
  setConnectionQuality: React.Dispatch<React.SetStateAction<'excellent' | 'reconnecting' | 'poor'>>;
  socketRef: React.MutableRefObject<Socket | null>;
  roomIdRef: React.MutableRefObject<string | null>;
  pcRef: React.MutableRefObject<RTCPeerConnection | null>;
};

export function VoiceChatView({
  state, strangerName, strangerCountry, isVideoCall, isMuted, isCameraOn, online,
  messages, textInput, isPartnerTyping, signalsReceived, frequencyNote, connectionQuality,
  videoRequestFromStranger, remoteCameraOn, voiceAmplitude, profile,
  localVideoRef, remoteVideoRef, waveCanvasRef,
  setFrequencyNote, setTopic, handleTextInputChange, sendText,
  toggleMute, toggleCamera, handleNext, handleLeave, quickStamp,
  setVideoRequestFromStranger, setConnectionQuality, socketRef, roomIdRef, pcRef,
}: VoiceChatViewProps) {
  return (
    <div className="radio-panel h-screen flex flex-col text-[#2c2522] overflow-hidden">
      {/* Top of the receiver — radio log. Radio waves traveling the spectrum, looking for real persons. */}
      <div className="radio-header mb-2">
        <div className="radio-title flex items-center gap-2">
          {/* Tiny consistent logo mark */}
          <svg width="18" height="13" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 -mt-0.5">
            <g stroke="#c5a26f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="12" r="2.4" fill="#c5a26f" stroke="none" />
              <path d="M9 5 Q15 3 23 6" />
              <path d="M9 9 Q16 7.5 24 10" />
              <path d="M9 15 Q16 16.5 24 14" />
              <path d="M9 19 Q15 21 23 18" />
            </g>
          </svg>
          On air with {strangerName || 'someone'}
          {profile.authProvider && profile.authProvider !== 'guest' && (
            <span className="text-[10px] px-1.5 py-px rounded bg-emerald-100 text-emerald-700 tracking-[1px]">SECURED</span>
          )}
        </div>
        {strangerCountry && strangerCountry !== 'Unknown' && (
          <div className="text-[#8a7660] text-[13px] -mt-1" style={{ lineHeight: 'var(--line-height)' }}>
            transmitting from {strangerCountry}
          </div>
        )}
        <div className="radio-status mt-1 flex items-center gap-2">
          {online} signals on the air right now
          {state === 'matched' && (
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded ${
              connectionQuality === 'excellent' ? 'bg-emerald-100 text-emerald-700' :
              connectionQuality === 'reconnecting' ? 'bg-amber-100 text-amber-700 animate-pulse' :
              'bg-red-100 text-red-700'
            }`}>
              {connectionQuality === 'excellent' ? 'Strong signal' :
               connectionQuality === 'reconnecting' ? 'Reconnecting… (no auto cut)' :
               'Weak signal — trying to recover'}
            </span>
          )}
        </div>
      </div>

      {/* The actual receiver content — everything tuned to the frequency */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Searching state — scanning the airwaves */}
        {state === 'searching' && (
          <div className="flex-1 flex items-center justify-center" style={{ lineHeight: 'var(--line-height)' }}>
            <div>
              <div className="text-3xl tracking-tight mb-2">Scanning the airwaves for a real voice...</div>
              <div className="radio-status">Your signal is live. Someone will tune in any moment.</div>
            </div>
          </div>
        )}

        {/* Matched — the transmission is now shared */}
        {state === 'matched' && (
          <div className="flex-1 flex flex-col">
            {/* Frequency line — written at the very top like a transmission note on a radio log.
                Either person can type here. Super easy, no extra clicks needed. */}
            <div className="mb-3 text-sm" style={{ lineHeight: 'var(--line-height)' }}>
              <span className="text-[#8a7660]">Frequency note:</span>{' '}
              <input
                value={frequencyNote}
                onChange={(e) => setFrequencyNote(e.target.value)}
                onBlur={() => setTopic(frequencyNote)}
                onKeyDown={(e) => { if (e.key === 'Enter') setTopic(frequencyNote); }}
                placeholder="write one short word or phrase for this transmission..."
                className="radio-write max-w-sm"
              />
            </div>

            {/* The living 3D Aether Wave Field — original never-before radio sculpture.
                Elegant professional 3D harmonic waves in space. The field breathes, rotates slowly,
                and "chants" with real voice amplitude (local or remote). Classic gold/cream/deep radio tones.
                Out-of-this-earth yet simple and refined. The pure essence of radio waves. */}
            <div className="mb-4">
              <RadioWave3D amplitude={voiceAmplitude} isSpeaking={voiceAmplitude > 0.07} />
            </div>

            {/* Single LIVE TRACE — the elegant "vibration on a line" chanting radio scope.
                Classic analog modulation trace. Reacts instantly when anybody speaks.
                Gold primary with subtle harmonic. Pure professional radio receiver feel. */}
            <div className="mb-5">
              <div className="text-[10px] tracking-[2px] text-[#8a7660] mb-1 pl-0.5">LIVE TRACE • RADIO SCOPE</div>
              <div className="radio-scope">
                <canvas ref={waveCanvasRef as React.LegacyRef<HTMLCanvasElement>} width={620} height={48} />
              </div>
            </div>

            {/* The main visual (video or voice presence) presented elegantly below the 3D waves, like content from the transmission. */}
            {isVideoCall ? (
              <div className="mb-4">
                <div className="signal-photo aspect-video w-full max-w-[720px] mx-auto overflow-hidden rounded-sm">
                  <video ref={remoteVideoRef as React.LegacyRef<HTMLVideoElement>} autoPlay playsInline className="w-full h-full object-cover" />
                  {/* Overlay when the stranger has paused their camera */}
                  {!remoteCameraOn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/75 text-[#f4f0e6] text-sm tracking-[2px]">
                      Stranger paused their camera
                    </div>
                  )}
                  {/* Small local view taped in the corner */}
                  <div className="absolute bottom-3 right-3 w-36 aspect-video bg-black border-[5px] border-[#f4f0e6] overflow-hidden">
                    <video ref={localVideoRef as React.LegacyRef<HTMLVideoElement>} autoPlay playsInline muted className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            ) : (
              /* Voice presence written on the page */
              <div className="mb-6">
                <div className="flex items-center gap-3 text-xl" style={{ lineHeight: 'var(--line-height)' }}>
                  <Mic className="w-5 h-5 text-[#3f342b]" />
                  <span>You are transmitting together right now.</span>
                </div>
                <div className="radio-status mt-1">Just speak. The connection is live.</div>

                {/* Real mid-call video request from the other person (WhatsApp-style upgrade) */}
                {videoRequestFromStranger && (
                  <div className="mt-3 p-3 border border-[#d9ccaf] bg-[#faf7f0] rounded text-sm">
                    Stranger wants to open a video signal with you.
                    <button
                      onClick={() => {
                        setVideoRequestFromStranger(false);
                        if (!isVideoCall) {
                          // This will turn camera on and renegotiate
                          toggleCamera();
                        }
                      }}
                      className="ml-3 underline text-[#3f342b]"
                    >
                      Open my video
                    </button>
                    <button
                      onClick={() => setVideoRequestFromStranger(false)}
                      className="ml-2 text-[#8a7660]"
                    >
                      Not now
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Transmissions written as real lines in the log */}
            <div className="flex-1 overflow-auto radio-scroll pr-2 -mr-2" style={{ lineHeight: 'var(--line-height)' }}>
              {messages.length === 0 && (
                <div className="radio-log-line text-[#8a7660]">
                  The frequency is open. Write something or just speak.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className="radio-log-line">
                  <span className={m.from === 'you' ? 'font-medium' : ''}>
                    {m.from === 'you' ? 'You' : strangerName}: {m.text}
                  </span>
                  <span className="meta">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {isPartnerTyping && (
                <div className="radio-log-line text-[#8a7660] italic">they are transmitting...</div>
              )}
            </div>

            {/* The transmission line at the bottom — this is how you broadcast on the airwaves */}
            <div className="mt-3 pt-2 border-t border-[#d9ccaf]">
              <input
                value={textInput}
                onChange={handleTextInputChange}
                onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
                placeholder="transmit a message on this frequency..."
                className="radio-write"
              />
              <div className="text-[10px] text-[#a8987f] mt-1 pl-1">press enter to send your signal</div>
            </div>
          </div>
        )}

        {state === 'left' && (
          <div className="flex-1 flex items-center justify-center text-[#5c5246] text-center">
            Stranger closed the page.<br /><br />
            Click <span className="font-medium text-[#3f342b] underline">Skip →</span> in the margin below to find someone new.<br />
            <span className="text-xs mt-2 block">(No auto-cut. You are always in control. The call stays until you decide.)</span>
          </div>
        )}
      </div>

      {/* Bottom margin — the few essential actions written like notes in the margin.
          Very minimal. Super easy. Almost no clicking needed. */}
      {(state === 'matched' || state === 'left') && (
        <div className="flex items-center justify-between text-sm mt-4 pt-3 border-t border-[#d9ccaf] text-[#8a7660]">
          <div className="flex items-center gap-x-5">
            {/* Mic is on by default. One tiny control */}
            <span
              onClick={toggleMute}
              className={`radio-control ${isMuted ? 'line-through' : ''}`}
            >
              {isMuted ? 'unmute voice' : 'mute voice'}
            </span>

            {isVideoCall && (
              <span onClick={() => toggleCamera()} className="radio-control">
                {isCameraOn ? 'hide camera' : 'show camera'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-x-5">
            {/* Retune feature — clear and easy, written in the margin like a log entry.
                Radio waves traveling — retune to find the next person. */}
            <span onClick={handleNext} className="radio-control font-medium text-[#3f342b] text-base">
              Retune →
            </span>

            {/* Signals received — grows as you retune. Feels like a real radio log. */}
            <span className="radio-control text-xs text-[#8a7660]">signals received: {signalsReceived}</span>

            {/* Request to upgrade to video mid-call (real WhatsApp-style feature) */}
            {isVideoCall && (
              <span
                onClick={() => toggleCamera()}
                className="radio-control text-sm"
              >
                {isCameraOn ? 'Pause camera' : 'Resume camera'}
              </span>
            )}
            {!isVideoCall && (
              <span
                onClick={() => {
                  if (socketRef.current && roomIdRef.current) {
                    socketRef.current.emit('request-video');
                    if (!isCameraOn) toggleCamera();
                  }
                }}
                className="radio-control text-sm"
                title="Ask the stranger to open their video signal"
              >
                Ask for video
              </span>
            )}

            {/* Manual reconnect if quality is poor – gives user control instead of silent failure */}
            {connectionQuality === 'poor' && (
              <span
                onClick={() => {
                  if (pcRef.current && socketRef.current && roomIdRef.current) {
                    setConnectionQuality('reconnecting');
                    try {
                      pcRef.current.restartIce();
                      pcRef.current.createOffer({ iceRestart: true }).then(offer => {
                        pcRef.current!.setLocalDescription(offer);
                        socketRef.current!.emit('signal', { roomId: roomIdRef.current, type: 'offer', data: offer });
                      }).catch(console.warn);
                    } catch (e) { console.warn(e); }
                  }
                }}
                className="radio-control text-sm text-amber-600"
              >
                Reconnect call
              </span>
            )}

            {/* Quick elegant stamps — light shared marks on the live transmission.
                Instant via data channel + log. Pure radio fun, minimal, professional. */}
            <span onClick={() => quickStamp('❤️')} className="radio-control text-sm cursor-pointer" title="heart">❤️</span>
            <span onClick={() => quickStamp('👋')} className="radio-control text-sm cursor-pointer" title="wave">👋</span>
            <span onClick={() => quickStamp('😊')} className="radio-control text-sm cursor-pointer" title="smile">😊</span>

            <span onClick={handleLeave} className="radio-control danger">
              end transmission
            </span>
          </div>
        </div>
      )}

      {/* Tiny elegant keyboard hint — radio receiver style */}
      {state === 'matched' && (
        <div className="text-[10px] text-[#a8987f] mt-1 text-right">
          n = retune &nbsp;&nbsp; esc = end transmission
        </div>
      )}
    </div>
  );
}
