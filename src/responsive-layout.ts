export const SPLIT_GALLERY_QUERY = '(orientation: landscape) and (min-width: 700px) and (min-height: 480px)';

export function usesSplitGallery(browserWindow: Window): boolean {
  return browserWindow.matchMedia(SPLIT_GALLERY_QUERY).matches;
}
