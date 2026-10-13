import type { ReactNode, Ref } from 'react';
import { InstagramLink } from './instagram-link.tsx';

const COPYRIGHT = 'Copyright © 2026 Bedoworks. All rights reserved.';

interface LandingViewProps {
  hasSelectedArtwork: boolean;
  stageRef: Ref<HTMLDivElement>;
  headerRef: Ref<HTMLElement>;
  gallery: ReactNode;
}

export function LandingView({
  hasSelectedArtwork,
  stageRef,
  headerRef,
  gallery
}: LandingViewProps) {
  return (
    <>
      <div id="landing-stage" ref={stageRef}>
        <header id="gallery-header" ref={headerRef} hidden={hasSelectedArtwork}>
          <img
            className="bedo-image"
            src="src/about/header.jpg"
            alt="Painting of a person holding a cup of tea"
          />
          <canvas className="bedo-eye-overlay" aria-hidden="true" />
          <div className="header-brand">
            <h1 aria-label="Bedoworks">BEDOWORKS</h1>
            <InstagramLink />
          </div>
        </header>
        {gallery}
      </div>
      <footer className="copyright">{COPYRIGHT}</footer>
    </>
  );
}
