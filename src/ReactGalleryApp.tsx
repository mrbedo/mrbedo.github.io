import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GalleryAppViewModel } from './view-models/gallery-app-view-model.ts';
import { ArtworkViewer } from './components/ArtworkViewer.tsx';
import { GallerySlideOut } from './components/GallerySlideOut.tsx';
import { LandingView } from './components/LandingView.tsx';

export function ReactGalleryApp({ viewModel }: { viewModel: GalleryAppViewModel }) {
  const appState = useSyncExternalStore(
    viewModel.subscribe,
    viewModel.getSnapshot,
    viewModel.getSnapshot
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLElement>(null);
  const closeGalleryRef = useRef<HTMLButtonElement>(null);
  const landingHeaderRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const artworkImageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const gallery = galleryRef.current;
    const closeButton = closeGalleryRef.current;
    const header = landingHeaderRef.current;
    const viewer = viewerRef.current;
    const image = artworkImageRef.current;
    if (!stage || !gallery || !closeButton || !header || !viewer || !image) {
      return;
    }

    return viewModel.start({
      stage,
      gallery,
      closeButton,
      header,
      viewer,
      image
    });
  }, [viewModel]);

  const selectedEntry = viewModel.selectedEntry;

  return (
    <>
      <LandingView
        hasSelectedArtwork={Boolean(selectedEntry)}
        stageRef={stageRef}
        headerRef={landingHeaderRef}
        gallery={
          <GallerySlideOut
            loadError={appState.loadError}
            viewModel={viewModel.gallery}
            galleryRef={galleryRef}
            closeButtonRef={closeGalleryRef}
          />
        }
      />
      <ArtworkViewer
        entry={selectedEntry}
        imageOnly={appState.imageOnly}
        viewModel={viewModel}
        viewerRef={viewerRef}
        imageRef={artworkImageRef}
      />
    </>
  );
}
