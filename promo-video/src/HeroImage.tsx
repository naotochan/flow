import React from "react";
import { AbsoluteFill } from "remotion";

const BG = "#F5F3FF";
const VIOLET = "#7C3AED";
const TEXT_DARK = "#1E1B4B";
const TEXT_MID = "#4C1D95";
const WHITE = "#FFFFFF";
const BAR_HEIGHTS = [0.4, 0.7, 1, 0.6, 0.85];

type Locale = "ja" | "en";

const COPY: Record<
  Locale,
  {
    windowTitle: string;
    sample: string;
    hold: string;
    record: string;
    listening: string;
    sampleFont: string;
  }
> = {
  ja: {
    windowTitle: "メモ — 無題",
    sample: "明日の午後3時から会議があります。資料の準備をお願いします。",
    hold: "押している間",
    record: "録音",
    listening: "録音中",
    sampleFont: "Georgia, 'Hiragino Mincho ProN', serif",
  },
  en: {
    windowTitle: "Notes — Untitled",
    sample:
      "We have a meeting tomorrow at 3 PM. Please prepare the documents in advance.",
    hold: "Hold",
    record: "to record",
    listening: "Listening",
    sampleFont: "Georgia, 'Times New Roman', serif",
  },
};

function WaveformBars() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 20 }}>
      {BAR_HEIGHTS.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: "100%",
            borderRadius: 999,
            backgroundColor: "#2dd4bf",
            transform: `scaleY(${h})`,
          }}
        />
      ))}
    </div>
  );
}

/** README hero — press hotkey, speak, paste into any app. */
export const HeroImage: React.FC<{ locale: Locale }> = ({ locale }) => {
  const copy = COPY[locale];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 20%, #EDE9FE 0%, ${BG} 55%, #EFF6FF 100%)`,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${VIOLET}18 0%, transparent 70%)`,
          top: -120,
          right: -80,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, #EC489918 0%, transparent 70%)",
          bottom: 40,
          left: -60,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 72,
          left: "50%",
          transform: "translateX(-50%)",
          width: 920,
          borderRadius: 14,
          background: WHITE,
          boxShadow: "0 28px 90px rgba(30, 27, 75, 0.14), 0 4px 18px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#F3F4F6",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
            <div
              key={i}
              style={{ width: 12, height: 12, borderRadius: "50%", background: c }}
            />
          ))}
          <span
            style={{
              marginLeft: 10,
              fontSize: 13,
              color: "#6B7280",
              fontWeight: 500,
            }}
          >
            {copy.windowTitle}
          </span>
        </div>

        <div
          style={{
            padding: "36px 40px 120px",
            fontSize: 26,
            lineHeight: 1.65,
            color: TEXT_DARK,
            fontFamily: copy.sampleFont,
          }}
        >
          {copy.sample}
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: "1.1em",
              background: VIOLET,
              verticalAlign: "text-bottom",
              marginLeft: 2,
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 118,
          right: 108,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #E5E7EB",
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        }}
      >
        <span style={{ fontSize: 13, color: TEXT_MID, fontWeight: 500 }}>{copy.hold}</span>
        <div
          style={{
            minWidth: 44,
            height: 40,
            padding: "0 12px",
            borderRadius: 8,
            background: "linear-gradient(180deg, #FFFFFF, #F3F4F6)",
            border: "1px solid #D1D5DB",
            boxShadow: "0 3px 0 #D1D5DB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            color: TEXT_DARK,
          }}
        >
          ⌥
        </div>
        <span style={{ fontSize: 13, color: TEXT_MID, fontWeight: 500 }}>{copy.record}</span>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 88,
          left: "50%",
          transform: "translateX(-50%)",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderRadius: 999,
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
        }}
      >
        <WaveformBars />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "rgba(255,255,255,0.72)",
            letterSpacing: 0.2,
          }}
        >
          {copy.listening}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 36,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: 0.55,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: `linear-gradient(135deg, ${VIOLET}, #EC4899)`,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MID, letterSpacing: 0.4 }}>
          Flow
        </span>
      </div>
    </AbsoluteFill>
  );
};
