import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG = "#F5F3FF";          // lavender-50
const VIOLET = "#7C3AED";      // violet-600
const VIOLET_LIGHT = "#EDE9FE"; // violet-100
const PINK = "#EC4899";         // pink-500
const BLUE = "#3B82F6";         // blue-500
const AMBER = "#F59E0B";        // amber-500
const TEXT_DARK = "#1E1B4B";    // indigo-950
const TEXT_MID = "#4C1D95";     // violet-900
const WHITE = "#FFFFFF";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function fadeIn(frame: number, start: number, dur = 20) {
  return interpolate(frame, [start, start + dur], [0, 1], clamp);
}

function slideUp(frame: number, start: number, dur = 25) {
  const progress = interpolate(frame, [start, start + dur], [0, 1], clamp);
  const y = interpolate(progress, [0, 1], [40, 0]);
  return { opacity: progress, transform: `translateY(${y}px)` };
}

// ─── Scene 1: Title (0–90f, 0–3s) ────────────────────────────────────────────
const Scene1Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const taglineStyle = slideUp(frame, 25);
  const subtitleStyle = slideUp(frame, 45);
  const pillOpacity = fadeIn(frame, 60, 20);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${VIOLET_LIGHT} 0%, ${BG} 65%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      }}
    >
      {/* Decorative blobs */}
      <div style={{
        position: "absolute", width: 600, height: 600,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${VIOLET}22 0%, transparent 70%)`,
        top: -100, left: -100,
      }} />
      <div style={{
        position: "absolute", width: 400, height: 400,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${PINK}18 0%, transparent 70%)`,
        bottom: -50, right: 100,
      }} />

      {/* Mic icon */}
      <div style={{
        transform: `scale(${logoScale})`,
        marginBottom: 32,
        width: 96, height: 96,
        borderRadius: 28,
        background: `linear-gradient(135deg, ${VIOLET}, ${PINK})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 20px 60px ${VIOLET}44`,
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="2" width="6" height="11" rx="3" fill={WHITE} />
          <path d="M5 10a7 7 0 0014 0" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12" y2="21" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
          <line x1="9" y1="21" x2="15" y2="21" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Title */}
      <div style={{
        ...taglineStyle,
        fontSize: 80,
        fontWeight: 800,
        letterSpacing: -3,
        color: TEXT_DARK,
      }}>
        Whisper{" "}
        <span style={{ color: VIOLET }}>Dictation</span>
      </div>

      {/* Tagline */}
      <div style={{
        ...subtitleStyle,
        fontSize: 32,
        fontWeight: 400,
        color: TEXT_MID,
        marginTop: 16,
        letterSpacing: 1,
      }}>
        Talk. Transcribe. Type.
      </div>

      {/* Badge */}
      <div style={{
        opacity: pillOpacity,
        marginTop: 40,
        display: "flex", gap: 12,
      }}>
        {["Free & Open Source", "macOS", "Whisper AI"].map((label, i) => (
          <span key={i} style={{
            padding: "8px 20px",
            borderRadius: 999,
            background: WHITE,
            boxShadow: `0 2px 12px ${VIOLET}22`,
            fontSize: 18,
            fontWeight: 600,
            color: VIOLET,
          }}>
            {label}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Hotkey (90–195f, 3–6.5s) ───────────────────────────────────────
const Scene2Hotkey: React.FC = () => {
  const frame = useCurrentFrame(); // relative to sequence start
  const { fps } = useVideoConfig();

  const titleStyle = slideUp(frame, 0, 20);
  const keyScale = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 10, stiffness: 180 } });
  const arrowOpacity = fadeIn(frame, 35, 15);
  const descStyle = slideUp(frame, 45, 20);

  // Ripple effect on key
  const ripple1 = interpolate(frame, [30, 60], [0, 1], clamp);
  const ripple2 = interpolate(frame, [40, 70], [0, 1], clamp);

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(160deg, ${BG} 0%, #EFF6FF 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* Section label */}
      <div style={{
        ...titleStyle,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 4,
        textTransform: "uppercase",
        color: BLUE,
        marginBottom: 24,
      }}>
        Step 1
      </div>

      {/* Key + ripple */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Ripple rings */}
        {[ripple1, ripple2].map((r, i) => (
          <div key={i} style={{
            position: "absolute",
            width: 140 + r * 120,
            height: 140 + r * 120,
            borderRadius: "50%",
            border: `2px solid ${VIOLET}`,
            opacity: (1 - r) * 0.5,
          }} />
        ))}

        {/* The key cap */}
        <div style={{
          transform: `scale(${keyScale})`,
          width: 140, height: 140,
          borderRadius: 24,
          background: `linear-gradient(145deg, #F3EFFF, ${WHITE})`,
          boxShadow: `0 8px 0 ${VIOLET}55, 0 16px 40px ${VIOLET}22`,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          border: `2px solid ${VIOLET_LIGHT}`,
          zIndex: 1,
        }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: TEXT_MID }}>✦</span>
        </div>
      </div>

      {/* Arrow */}
      <div style={{
        opacity: arrowOpacity,
        fontSize: 40, color: VIOLET,
        margin: "24px 0",
      }}>
        ↓
      </div>

      {/* Description */}
      <div style={{ ...descStyle, textAlign: "center" }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: TEXT_DARK, letterSpacing: -1 }}>
          Any key you like
        </div>
        <div style={{ fontSize: 26, color: TEXT_MID, marginTop: 12, fontWeight: 400 }}>
          Assign your favorite key or modifier to start recording
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3: Recording / Waveform (195–300f, 6.5–10s) ───────────────────────
const WaveBar: React.FC<{ index: number; frame: number }> = ({ index, frame }) => {
  const offset = index * 0.4;
  const height = 20 + Math.abs(Math.sin((frame * 0.18) + offset) * 70)
    + Math.abs(Math.sin((frame * 0.11) + offset * 1.7) * 30);

  return (
    <div style={{
      width: 10,
      height,
      borderRadius: 5,
      background: `linear-gradient(to top, ${VIOLET}, ${PINK})`,
      transition: "height 0.05s",
    }} />
  );
};

const Scene3Recording: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerScale = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });
  const labelStyle = slideUp(frame, 20, 20);
  const descStyle = slideUp(frame, 35, 20);

  const bars = Array.from({ length: 28 });

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(160deg, #FFF1F2 0%, ${BG} 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* Recording pill (like overlay indicator) */}
      <div style={{
        transform: `scale(${containerScale})`,
        background: WHITE,
        borderRadius: 999,
        padding: "20px 40px",
        display: "flex", alignItems: "center", gap: 20,
        boxShadow: `0 8px 40px ${PINK}33, 0 2px 12px rgba(0,0,0,0.08)`,
        marginBottom: 48,
        border: `1.5px solid ${PINK}33`,
      }}>
        {/* Red dot */}
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: PINK,
          boxShadow: `0 0 0 ${interpolate(frame, [0, 15, 30], [0, 6, 0], clamp)}px ${PINK}44`,
        }} />

        {/* Waveform bars */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, height: 60 }}>
          {bars.map((_, i) => (
            <WaveBar key={i} index={i} frame={frame} />
          ))}
        </div>

        {/* Timer */}
        <span style={{ fontSize: 22, fontWeight: 600, color: TEXT_MID, minWidth: 60 }}>
          {String(Math.floor(frame / 30)).padStart(2, "0")}:
          {String(Math.floor((frame % 30) * 1.9)).padStart(2, "0")}
        </span>
      </div>

      {/* Label */}
      <div style={{ ...labelStyle, textAlign: "center" }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: TEXT_DARK, letterSpacing: -1 }}>
          Speak naturally
        </div>
        <div style={{ fontSize: 26, color: TEXT_MID, marginTop: 12, fontWeight: 400 }}>
          Powered by{" "}
          <span style={{ color: VIOLET, fontWeight: 700 }}>OpenAI Whisper</span>
          {" "}— local or cloud
        </div>
      </div>

      {/* Feature chips */}
      <div style={{
        ...descStyle,
        display: "flex", gap: 14, marginTop: 32, flexWrap: "wrap" as const, justifyContent: "center",
      }}>
        {["Whisper API", "Local Model", "LM Studio"].map((label, i) => (
          <span key={i} style={{
            padding: "10px 22px",
            borderRadius: 999,
            background: i === 0 ? `${VIOLET}18` : WHITE,
            border: i === 0 ? `1.5px solid ${VIOLET}55` : `1.5px solid #E5E7EB`,
            fontSize: 20,
            fontWeight: 600,
            color: i === 0 ? VIOLET : TEXT_MID,
          }}>
            {label}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: Paste (300–390f, 10–13s) ────────────────────────────────────────
const SAMPLE_TEXT = "Meeting tomorrow at 10am with the product team. Please prepare the Q1 roadmap slides and send them beforehand.";

const Scene4Paste: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const windowScale = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });
  const titleStyle = slideUp(frame, 5, 20);

  // Typewriter effect
  const charsVisible = Math.floor(interpolate(frame, [15, 75], [0, SAMPLE_TEXT.length], clamp));
  const visibleText = SAMPLE_TEXT.slice(0, charsVisible);
  const cursorVisible = frame % 20 < 12;

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(160deg, #ECFDF5 0%, ${BG} 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* Mock app window */}
      <div style={{
        transform: `scale(${windowScale})`,
        width: 760, borderRadius: 16,
        background: WHITE,
        boxShadow: "0 24px 80px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)",
        overflow: "hidden",
        marginBottom: 48,
      }}>
        {/* Window chrome */}
        <div style={{
          background: "#F3F4F6",
          padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 8,
          borderBottom: "1px solid #E5E7EB",
        }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: c }} />
          ))}
          <span style={{ marginLeft: 12, fontSize: 15, color: "#6B7280", fontWeight: 500 }}>
            Notes — Untitled
          </span>
        </div>

        {/* Text area */}
        <div style={{
          padding: "28px 32px",
          minHeight: 120,
          fontSize: 22,
          lineHeight: 1.7,
          color: TEXT_DARK,
          fontFamily: "Georgia, serif",
        }}>
          {visibleText}
          {cursorVisible && charsVisible < SAMPLE_TEXT.length && (
            <span style={{
              display: "inline-block", width: 2, height: "1.2em",
              background: VIOLET, verticalAlign: "text-bottom", marginLeft: 1,
            }} />
          )}
        </div>
      </div>

      {/* Description */}
      <div style={{ ...titleStyle, textAlign: "center" }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: TEXT_DARK, letterSpacing: -1 }}>
          Instantly pasted anywhere
        </div>
        <div style={{ fontSize: 26, color: TEXT_MID, marginTop: 12, fontWeight: 400 }}>
          Works with any app — Notes, Slack, VSCode, email…
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: CTA / Closing (390–450f, 13–15s) ───────────────────────────────
const Scene5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const line1Style = slideUp(frame, 10, 20);
  const line2Style = slideUp(frame, 25, 20);
  const badgeOpacity = fadeIn(frame, 40, 20);

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, #4C1D95 0%, ${VIOLET} 50%, ${PINK}99 100%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* Subtle grid overlay */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(255,255,255,0.05) 60px),
                          repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.05) 60px)`,
      }} />

      {/* Logo */}
      <div style={{
        transform: `scale(${logoScale})`,
        marginBottom: 28,
        width: 88, height: 88,
        borderRadius: 24,
        background: "rgba(255,255,255,0.18)",
        backdropFilter: "blur(8px)",
        border: "1.5px solid rgba(255,255,255,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="2" width="6" height="11" rx="3" fill={WHITE} />
          <path d="M5 10a7 7 0 0014 0" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12" y2="21" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
          <line x1="9" y1="21" x2="15" y2="21" stroke={WHITE} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* App name */}
      <div style={{
        ...line1Style,
        fontSize: 76,
        fontWeight: 800,
        color: WHITE,
        letterSpacing: -3,
      }}>
        Flow
      </div>

      {/* Tagline */}
      <div style={{
        ...line2Style,
        fontSize: 30,
        color: "rgba(255,255,255,0.8)",
        marginTop: 8,
        fontWeight: 400,
      }}>
        Free. Open Source. Built for macOS.
      </div>

      {/* GitHub */}
      <div style={{
        opacity: badgeOpacity,
        marginTop: 44,
        padding: "14px 32px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.15)",
        backdropFilter: "blur(8px)",
        border: "1.5px solid rgba(255,255,255,0.3)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill={WHITE}>
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        <span style={{ fontSize: 22, fontWeight: 600, color: WHITE }}>
          github.com/naotochan/whisper-dictation
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ─── Main composition ─────────────────────────────────────────────────────────
export const PromoVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Scene 1: Title  0–90f */}
      <Sequence from={0} durationInFrames={100}>
        <Scene1Title />
      </Sequence>

      {/* Scene 2: Hotkey  90–195f */}
      <Sequence from={90} durationInFrames={110}>
        <Scene2Hotkey />
      </Sequence>

      {/* Scene 3: Recording  195–300f */}
      <Sequence from={195} durationInFrames={110}>
        <Scene3Recording />
      </Sequence>

      {/* Scene 4: Paste  300–390f */}
      <Sequence from={300} durationInFrames={95}>
        <Scene4Paste />
      </Sequence>

      {/* Scene 5: CTA  390–450f */}
      <Sequence from={390} durationInFrames={60}>
        <Scene5CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
