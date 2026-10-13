import { MathUtils } from './math-utils.ts';

const COMPACT_VIEWPORT_MAX_HEIGHT_PX = 480;
const COMPACT_VIEWPORT_MAX_WIDTH_PX = 300;
const WIDE_VIEWPORT_MAX_WIDTH_PX = 600;
const COMPACT_LAYOUT_MAX_WIDTH_PX = 900;
const LANDSCAPE_ASPECT_RATIO = 1;
const VIEWPORT_EDGE_INSET_RATIO = 0.014;
const MIN_VIEWER_EDGE_INSET_REM = 1;
const MAX_VIEWER_EDGE_INSET_REM = 1.5;
const MIN_COMPACT_ARTWORK_SIZE_REM = 11.25;
const COMPACT_NAVIGATION_WIDTH_REM = 7;
const REGULAR_NAVIGATION_WIDTH_REM = 8;
const COMPACT_SIDE_RAILS_WIDTH_REM = 16;
const REGULAR_SIDE_RAILS_WIDTH_REM = 28;
const COMPACT_SIDE_GAP_REM = 2;
const MAX_REGULAR_SIDE_GAP_REM = 2;
const REGULAR_SIDE_GAP_VIEWPORT_RATIO = 0.02;
const VIEWPORT_EDGE_COUNT = 2;
const MIN_VIEWER_LAYOUT_DIMENSION_PX = 0;
const SIDE_LAYOUT_HEIGHT_INSET_REM = 5.5;
const BOTTOM_LAYOUT_HEIGHT_INSET_REM = 10.25;

export class ViewerLayoutController {
  private readonly viewer: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly browserWindow: Window;
  private readonly document: Document;
  private frameId = 0;

  constructor(
    viewer: HTMLElement,
    image: HTMLImageElement,
    browserWindow: Window = window,
    document: Document = window.document
  ) {
    this.viewer = viewer;
    this.image = image;
    this.browserWindow = browserWindow;
    this.document = document;
  }

  update(): void {
    const { image, viewer, browserWindow } = this;
    if (viewer.hidden || !image.naturalWidth || !image.naturalHeight) {
      return;
    }

    if (
      browserWindow.innerHeight <= COMPACT_VIEWPORT_MAX_HEIGHT_PX ||
      browserWindow.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH_PX
    ) {
      viewer.dataset.artLayout = 'compact';
      const rem = Number.parseFloat(
        this.browserWindow.getComputedStyle(this.document.documentElement).fontSize
      );

      const edgeInset = MathUtils.clamp(
        browserWindow.innerWidth * VIEWPORT_EDGE_INSET_RATIO,
        MIN_VIEWER_EDGE_INSET_REM * rem,
        MAX_VIEWER_EDGE_INSET_REM * rem
      );

      const availableWidth = browserWindow.innerWidth - VIEWPORT_EDGE_COUNT * edgeInset;
      const availableHeight = browserWindow.innerHeight - VIEWPORT_EDGE_COUNT * edgeInset;
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      const scaleToFit = MathUtils.fitScale(
        image.naturalWidth,
        image.naturalHeight,
        availableWidth,
        availableHeight
      );

      const minimumScale = (MIN_COMPACT_ARTWORK_SIZE_REM * rem) /
        (aspectRatio >= LANDSCAPE_ASPECT_RATIO ? image.naturalHeight : image.naturalWidth);
      const scale = Math.min(
        Math.max(scaleToFit, minimumScale),
        availableHeight / image.naturalHeight
      );

      image.style.setProperty('--compact-art-width', `${image.naturalWidth * scale}px`);
      image.style.setProperty('--compact-art-height', `${image.naturalHeight * scale}px`);
      return;
    }

    image.style.removeProperty('--compact-art-width');
    image.style.removeProperty('--compact-art-height');

    if (browserWindow.innerWidth <= WIDE_VIEWPORT_MAX_WIDTH_PX) {
      viewer.dataset.artLayout = 'wide';
      return;
    }

    const rem = Number.parseFloat(
      this.browserWindow.getComputedStyle(this.document.documentElement).fontSize
    );

    const viewportWidth = browserWindow.innerWidth;
    const viewportHeight = browserWindow.innerHeight;
    const aspectRatio = image.naturalWidth / image.naturalHeight;
    const compact = viewportWidth <= COMPACT_LAYOUT_MAX_WIDTH_PX;
    const edgeInset = MathUtils.clamp(
      viewportWidth * VIEWPORT_EDGE_INSET_RATIO,
      MIN_VIEWER_EDGE_INSET_REM * rem,
      MAX_VIEWER_EDGE_INSET_REM * rem
    );

    const navigationWidth = (compact ? COMPACT_NAVIGATION_WIDTH_REM : REGULAR_NAVIGATION_WIDTH_REM) * rem;
    const sidePadding = VIEWPORT_EDGE_COUNT * edgeInset;
    const sideRails = (compact ? COMPACT_SIDE_RAILS_WIDTH_REM : REGULAR_SIDE_RAILS_WIDTH_REM) * rem;
    const sideGaps = compact
      ? COMPACT_SIDE_GAP_REM * rem
      : VIEWPORT_EDGE_COUNT *
        MathUtils.clamp(
          viewportWidth * REGULAR_SIDE_GAP_VIEWPORT_RATIO,
          MIN_VIEWER_EDGE_INSET_REM * rem,
          MAX_REGULAR_SIDE_GAP_REM * rem
        );

    const sideWidth = Math.max(
      MIN_VIEWER_LAYOUT_DIMENSION_PX,
      viewportWidth - navigationWidth - sidePadding - sideRails - sideGaps
    );

    const sideHeight = Math.max(
      MIN_VIEWER_LAYOUT_DIMENSION_PX,
      viewportHeight - SIDE_LAYOUT_HEIGHT_INSET_REM * rem
    );

    const bottomWidth = Math.max(
      MIN_VIEWER_LAYOUT_DIMENSION_PX,
      viewportWidth - navigationWidth - VIEWPORT_EDGE_COUNT * edgeInset
    );

    const bottomHeight = Math.max(
      MIN_VIEWER_LAYOUT_DIMENSION_PX,
      viewportHeight - BOTTOM_LAYOUT_HEIGHT_INSET_REM * rem
    );

    const sideArea = MathUtils.fittedArea(aspectRatio, sideWidth, sideHeight);
    const bottomArea = MathUtils.fittedArea(aspectRatio, bottomWidth, bottomHeight);
    viewer.dataset.artLayout = viewportWidth <= COMPACT_LAYOUT_MAX_WIDTH_PX && bottomArea > sideArea ? 'wide' : 'tall';
  }

  scheduleUpdate(): void {
    if (this.frameId) {
      return;
    }

    this.frameId = requestAnimationFrame(() => {
      this.frameId = 0;
      this.update();
    });
  }
}
