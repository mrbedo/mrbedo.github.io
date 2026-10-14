import type { ReactNode, Ref } from 'react';
import { siteText } from '../site-text.ts';
import { InstagramLink } from './InstagramLink.tsx';
import { BrandHeading, CopyrightNotice } from './SiteChrome.tsx';

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
            alt={siteText.header.imageAlt}
          />
          <canvas className="bedo-eye-overlay" aria-hidden="true" />
          <div className="header-brand">
            <BrandHeading />
            <InstagramLink />
          </div>
        </header>
        {gallery}
      </div>
      <CopyrightNotice />
    </>
  );
}
