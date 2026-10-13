import { useSyncExternalStore } from 'react';
import type { Ref } from 'react';
import type { GalleryViewModel } from '../view-models/gallery-view-model.ts';
import { GalleryTile } from './gallery-tile.tsx';

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

  return (
    <main
      id="gallery"
      ref={galleryRef}
      aria-label="Artwork gallery"
      data-expanded={galleryState.expanded}
    >
      <div className="gallery-toolbar">
        <div className="gallery-toolbar-heading">
          <h2>Gallery</h2>
          <div id="gallery-year-filters" role="group" aria-label="Filter gallery by year">
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
          aria-label="Close gallery"
          onClick={() => viewModel.close()}
        >
          <span aria-hidden="true">&times;</span>
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
