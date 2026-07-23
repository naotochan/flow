import React from "react";
import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo";

export const Root: React.FC = () => {
  return (
    <Composition
      id="PromoVideo"
      component={PromoVideo}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
