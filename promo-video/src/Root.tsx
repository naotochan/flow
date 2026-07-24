import React from "react";
import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo";
import { HeroImage } from "./HeroImage";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="PromoVideo"
        component={PromoVideo}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="HeroImageJa"
        component={HeroImage}
        durationInFrames={1}
        fps={30}
        width={1800}
        height={1012}
        defaultProps={{ locale: "ja" }}
      />
      <Composition
        id="HeroImageEn"
        component={HeroImage}
        durationInFrames={1}
        fps={30}
        width={1800}
        height={1012}
        defaultProps={{ locale: "en" }}
      />
    </>
  );
};
