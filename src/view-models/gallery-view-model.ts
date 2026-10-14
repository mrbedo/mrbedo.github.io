import type { ArtworkEntry } from '../artwork-catalog.ts';
import { ObservableViewModel } from './observable-view-model.ts';
import { galleryDockOffset } from '../gallery-pull.ts';
import { usesSplitGallery } from '../responsive-layout.ts';

export interface GalleryViewModelState {
  expanded: boolean;
  years: string[];
  selectedYears: string[];
  visibleEntries: ArtworkEntry[];
}

export interface GalleryViewElements {
  stage: HTMLElement;
  gallery: HTMLElement;
  closeButton: HTMLElement;
  header: HTMLElement;
}

export class GalleryViewModel extends ObservableViewModel<GalleryViewModelState> {
  private stage: HTMLElement | null = null;
  private gallery: HTMLElement | null = null;
  private closeButton: HTMLElement | null = null;
  private header: HTMLElement | null = null;
  private readonly browserWindow: Window;
  private readonly document: Document;
  private entries: ArtworkEntry[] = [];
  private restoreFilterDock = false;

  constructor(browserWindow: Window = window, document: Document = window.document) {
    super({
      expanded: false,
      years: [],
      selectedYears: [],
      visibleEntries: []
    });
    this.browserWindow = browserWindow;
    this.document = document;
  }

  setEntries(entries: ArtworkEntry[]): void {
    this.entries = entries;
    const years = [...new Set(entries.map((entry) => entry.placard.year).filter(Boolean))].sort(
      (first, second) => first.localeCompare(second, undefined, { numeric: true })
    );

    const selectedYears = this.state.selectedYears.filter((year) => years.includes(year));
    this.updateState({
      years,
      selectedYears,
      visibleEntries: this.filterEntries(selectedYears)
    });
  }

  toggleYear(year: string): void {
    if (!this.state.years.includes(year)) {
      return;
    }

    const nextSelectedYears = this.state.selectedYears.includes(year) ? [] : [year];
    // Filter controls are only offered when docked. Native focus/scrollIntoView can
    // move a sticky toolbar first, so the filter action must restore its own dock.
    this.restoreFilterDock = Boolean(
      this.gallery && !this.header?.hidden && (!this.isLandscape() || this.state.expanded)
    );

    this.updateState({
      selectedYears: nextSelectedYears,
      visibleEntries: this.filterEntries(nextSelectedYears)
    });
  }

  /** Reconcile after React commits the filtered tiles, not against the old page height. */
  reconcileLayout(): void {
    if (!this.restoreFilterDock) {
      return;
    }

    this.restoreFilterDock = false;
    if (!this.gallery || this.header?.hidden) {
      return;
    }

    const content = this.gallery.querySelector<HTMLElement>('.gallery-content');
    if (content) {
      content.scrollTop = 0;
    }

    if (this.isLandscape()) {
      this.scrollStage(this.getExpandedScrollTop(), 'auto');
    } else {
      this.browserWindow.scrollTo({
        top: Math.max(
          0,
          this.gallery.offsetTop - galleryDockOffset(this.gallery, this.browserWindow)
        ),
        behavior: 'auto'
      });
    }
  }

  start({ stage, gallery, closeButton, header }: GalleryViewElements): () => void {
    this.stage = stage;
    this.gallery = gallery;
    this.closeButton = closeButton;
    this.header = header;

    const onWheel = (event: WheelEvent) => this.handleWheel(event);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.target || !this.closeButton?.contains(event.target as Node)) {
        this.expand();
      }
    };
    const onPointerDown = (event: Event) => this.handlePointerDown(event);
    const onResize = () => {
      if (this.state.expanded && this.isLandscape()) {
        const expandedScrollTop = this.getExpandedScrollTop();
        if (this.stage!.scrollTop !== expandedScrollTop) {
          this.scrollStage(expandedScrollTop, 'auto');
        }
      }
    };

    const resizeTarget = this.browserWindow.visualViewport ?? this.browserWindow;

    this.document.addEventListener('wheel', onWheel, { passive: false });
    this.document.addEventListener('keydown', onKeyDown);
    this.document.addEventListener('pointerdown', onPointerDown);
    resizeTarget.addEventListener('resize', onResize, { passive: true });

    return () => {
      this.document.removeEventListener('wheel', onWheel);
      this.document.removeEventListener('keydown', onKeyDown);
      this.document.removeEventListener('pointerdown', onPointerDown);
      resizeTarget.removeEventListener('resize', onResize);

      this.stage = null;
      this.gallery = null;
      this.closeButton = null;
      this.header = null;
      this.restoreFilterDock = false;
    };
  }

  close(): void {
    this.restoreFilterDock = false;
    if (this.isLandscape()) {
      this.collapse();
    } else {
      this.scrollPageToTop();
    }
  }

  reveal(): void {
    if (this.isLandscape()) {
      this.expand();
      return;
    }

    this.gallery?.scrollIntoView({
      behavior: this.browserWindow.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth'
    });
  }

  private isLandscape(): boolean {
    return (
      Boolean(this.stage && this.gallery && this.closeButton && this.header) &&
      usesSplitGallery(this.browserWindow) &&
      !this.header?.hidden
    );
  }

  private scrollStage(top: number, behavior?: ScrollBehavior): void {
    this.stage?.scrollTo({
      top,
      behavior:
        behavior ??
        (this.browserWindow.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth')
    });
  }

  private scrollPageToTop(): void {
    this.browserWindow.scrollTo({
      top: 0,
      behavior: this.browserWindow.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth'
    });
  }

  private getExpandedScrollTop(): number {
    return Math.max(0, this.stage!.scrollHeight - this.stage!.clientHeight);
  }

  private setExpanded(expanded: boolean): void {
    if (this.state.expanded === expanded) {
      return;
    }

    this.updateState({ expanded });
  }

  private filterEntries(selectedYears: string[]): ArtworkEntry[] {
    return selectedYears.length
      ? this.entries.filter((entry) => selectedYears.includes(entry.placard.year))
      : this.entries;
  }

  private expand(): void {
    if (!this.isLandscape()) {
      return;
    }

    this.setExpanded(true);
    this.scrollStage(this.getExpandedScrollTop());
  }

  private collapse(): void {
    if (this.isLandscape()) {
      this.setExpanded(false);
      this.scrollStage(0);
    }
  }

  private handleWheel(event: WheelEvent): void {
    const insideGallery = Boolean(event.target && this.gallery?.contains(event.target as Node));
    if (!this.isLandscape() || (insideGallery && this.state.expanded)) {
      return;
    }

    if (event.deltaY < 0 && this.state.expanded) {
      event.preventDefault();
      this.collapse();
      return;
    }

    if (event.deltaY > 0) {
      if (!this.state.expanded) {
        event.preventDefault();
        this.expand();
      } else if (this.stage!.scrollTop < this.getExpandedScrollTop()) {
        event.preventDefault();
      }
    }
  }

  private handlePointerDown(event: Event): void {
    if (!this.isLandscape()) {
      return;
    }

    if (event.target && this.closeButton?.contains(event.target as Node)) {
      return;
    }

    if (event.target && this.gallery?.contains(event.target as Node)) {
      if (!this.state.expanded) {
        this.expand();
      }
    } else {
      this.collapse();
    }
  }
}
