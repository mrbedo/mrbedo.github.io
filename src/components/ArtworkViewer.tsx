import type { KeyboardEvent, Ref } from 'react';
import type { ArtworkEntry } from '../artwork-catalog.ts';
import { formatText, siteText } from '../site-text.ts';
import type { GalleryAppViewModel } from '../view-models/gallery-app-view-model.ts';
import { InstagramLink } from './InstagramLink.tsx';
import { BrandHeading, CopyrightNotice } from './SiteChrome.tsx';

interface ArtworkViewerProps {
  entry: ArtworkEntry | undefined;
  imageOnly: boolean;
  viewModel: GalleryAppViewModel;
  viewerRef: Ref<HTMLElement>;
  imageRef: Ref<HTMLImageElement>;
}

export function ArtworkViewer({
  entry,
  imageOnly,
  viewModel,
  viewerRef,
  imageRef
}: ArtworkViewerProps) {
  function handleImageKeyDown(event: KeyboardEvent<HTMLImageElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    viewModel.toggleImageOnly();
  }

  return (
    <section
      id="viewer"
      ref={viewerRef}
      hidden={!entry}
      className={imageOnly ? 'image-only' : undefined}
    >
      <div className="viewer-brand">
        <a
          className="home-link"
          href="./"
          aria-label={siteText.site.homeLabel}
          onClick={(event) => {
            event.preventDefault();
            viewModel.closeViewer();
          }}
        >
          <BrandHeading />
        </a>
        <InstagramLink />
      </div>
      <button
        id="close"
        type="button"
        aria-label={siteText.viewer.closeLabel}
        onClick={() => viewModel.closeViewer()}
      >
        {siteText.viewer.closeSymbol}
      </button>
      <button
        id="prev"
        type="button"
        aria-label={siteText.viewer.previousLabel}
        onClick={() => viewModel.moveArtwork(-1)}
      >
        {siteText.viewer.previousSymbol}
      </button>
      <figure>
        <figcaption className="placard">
          <div id="title">{entry?.placard.title.replaceAll('\\n', '\n')}</div>
          <div id="subtitle">{entry?.placard.subtitle}</div>
          <div id="year">{entry?.placard.year}</div>
        </figcaption>
        <img
          id="art"
          ref={imageRef}
          src={entry?.image}
          alt={entry?.name ?? ''}
          role="button"
          tabIndex={0}
          aria-pressed={imageOnly}
          aria-label={formatText(
            imageOnly ? siteText.viewer.exitFullscreenLabel : siteText.viewer.showFullscreenLabel,
            { name: entry?.name ?? '' }
          )}
          onClick={() => viewModel.toggleImageOnly()}
          onKeyDown={handleImageKeyDown}
          onLoad={(event) => viewModel.onArtworkLoad(event.currentTarget)}
        />
      </figure>
      <button
        id="next"
        type="button"
        aria-label={siteText.viewer.nextLabel}
        onClick={() => viewModel.moveArtwork(1)}
      >
        {siteText.viewer.nextSymbol}
      </button>
      <CopyrightNotice />
    </section>
  );
}
