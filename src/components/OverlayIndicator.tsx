import { useRecordingState } from "../hooks/useRecordingState";

/** Animated bars for the "processing" state. */
function ProcessingBars({ color }: { color: string }) {
  const bars = [
    { delay: "0s", height: "40%" },
    { delay: "0.15s", height: "70%" },
    { delay: "0.05s", height: "100%" },
    { delay: "0.2s", height: "60%" },
    { delay: "0.1s", height: "80%" },
  ];

  return (
    <div className="flex items-center gap-[3px] h-5">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            backgroundColor: color,
            height: bar.height,
            animation: "waveform 1s ease-in-out infinite",
            animationDelay: bar.delay,
          }}
        />
      ))}
    </div>
  );
}

/** Level-reactive bars for the "recording" state. */
function LevelBars({ color, level }: { color: string; level: number }) {
  // Aggressive amplification: even quiet speech should move the bars noticeably
  const amplified = Math.min(1, Math.pow(level, 0.35) * 1.8);

  // Wide spread of offsets for more organic, dramatic movement
  const offsets = [0.35, 0.75, 1.0, 0.6, 0.85];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", height: "20px" }}>
      {offsets.map((off, i) => {
        const barScale = 0.08 + amplified * off * 0.92; // min 8%, max 100%
        return (
          <div
            key={i}
            style={{
              width: "3px",
              borderRadius: "9999px",
              backgroundColor: color,
              height: "100%",
              transform: `scaleY(${barScale})`,
              transition: "transform 50ms ease-out",
            }}
          />
        );
      })}
    </div>
  );
}

/** Checkmark icon for the "done" state. */
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Warning icon for the "error" state. */
function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function OverlayIndicator() {
  const { state, audioLevel, lastTranscription } = useRecordingState();

  const isError = state === "error";
  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isIdle = state === "idle";
  const showResult = isIdle && lastTranscription;

  const barColor = isProcessing ? "#fbbf24" : "#6ee7b7";
  const label = isProcessing ? "Processing..." : isRecording ? "Listening..." : "";

  return (
    <>
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background: transparent !important;
          background-color: transparent !important;
          overflow: hidden;
        }
        @keyframes waveform {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 16px",
            borderRadius: "9999px",
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            maxWidth: "90vw",
          }}
        >
          {isError ? (
            <>
              <WarningIcon />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#fca5a5",
                  whiteSpace: "nowrap",
                }}
              >
                サーバーが起動していません
              </span>
            </>
          ) : showResult ? (
            <>
              <CheckIcon />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "rgba(255, 255, 255, 0.85)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "400px",
                }}
              >
                {lastTranscription}
              </span>
            </>
          ) : (
            <>
              {isProcessing ? (
                <ProcessingBars color={barColor} />
              ) : (
                <LevelBars color={barColor} level={audioLevel} />
              )}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "rgba(255, 255, 255, 0.7)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
