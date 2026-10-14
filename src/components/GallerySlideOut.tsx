import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { Ref } from 'react';
import { siteText } from '../site-text.ts';
import type { GalleryViewModel } from '../view-models/gallery-view-model.ts';
import { GalleryTile } from './GalleryTile.tsx';

interface GallerySlideOutProps {
  loadError: string;
  viewModel: GalleryViewModel;
  galleryRef: Ref<HTMLElement>;
  closeButtonRef: Ref<HTMLButtonElement>;
}

export function GallerySlideOut({
  loadError,
  viewModel,
  galleryRef,
  closeButtonRef
}: GallerySlideOutProps) {
  const galleryState = useSyncExternalStore(
    viewModel.subscribe,
    viewModel.getSnapshot,
    viewModel.getSnapshot
  );
  useLayoutEffect(() => {
    viewModel.reconcileLayout();
  }, [viewModel, galleryState.visibleEntries]);

  return (
    <main
      id="gallery"
      ref={galleryRef}
      aria-label={siteText.gallery.label}
      data-expanded={galleryState.expanded}
    >
      <div className="gallery-toolbar">
        <div className="gallery-toolbar-heading">
          <h2>
            <button
              className="gallery-heading-toggle"
              type="button"
              onClick={() => viewModel.reveal()}
            >
              <span>{siteText.gallery.heading}</span>
              <svg className="gallery-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 9l7 7 7-7" />
              </svg>
            </button>
          </h2>
          <div
            id="gallery-year-filters"
            role="group"
            aria-label={siteText.gallery.yearFiltersLabel}
          >
            {galleryState.years.map((year) => (
              <button
                key={year}
                type="button"
                aria-pressed={galleryState.selectedYears.includes(year)}
                onClick={() => viewModel.toggleYear(year)}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
        <button
          id="gallery-close"
          ref={closeButtonRef}
          type="button"
          aria-label={siteText.gallery.closeLabel}
          onClick={() => viewModel.close()}
        >
          <span aria-hidden="true">{siteText.gallery.closeSymbol}</span>
        </button>
      </div>
      <div className="gallery-content">
        {loadError ? (
          <p role="alert">{loadError}</p>
        ) : (
          galleryState.visibleEntries.map((entry) => (
            <GalleryTile key={entry.name} entry={entry} />
          ))
        )}
      </div>
    </main>
  );
}
