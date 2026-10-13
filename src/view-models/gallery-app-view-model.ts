import type { ArtworkEntry } from '../artwork-catalog.ts';
import { ArtworkCatalog } from '../artwork-catalog.ts';
import { viewerColorManager } from '../artwork-colors.ts';
import type { ViewerColorManager } from '../artwork-colors.ts';
import { BedoHeaderController } from '../bedo.ts';
import { ViewerLayoutController } from '../viewer-layout.ts';
import { GalleryViewModel } from './gallery-view-model.ts';
import type { GalleryViewElements } from './gallery-view-model.ts';

const PREVIOUS_ARTWORK_OFFSET = -1;
const NEXT_ARTWORK_OFFSET = 1;
const GALLERY_LOAD_ERROR = 'The gallery could not be loaded. Please try again later.';

export interface GalleryAppViewModelState {
  entries: ArtworkEntry[];
  loadError: string;
  selectedName: string;
  imageOnly: boolean;
}

interface AppViewElements extends GalleryViewElements {
  header: HTMLElement;
  viewer: HTMLElement;
  image: HTMLImageElement;
}

interface GalleryAppViewModelOptions {
  catalog?: ArtworkCatalog;
  colors?: ViewerColorManager;
  browserWindow?: Window;
  document?: Document;
}

function currentArtworkName(browserWindow: Window): string {
  try {
    return decodeURIComponent(browserWindow.location.hash.slice(1));
  } catch {
    return '';
  }
}

export class GalleryAppViewModel {
  readonly gallery: GalleryViewModel;

  private readonly catalog: ArtworkCatalog;
  private readonly colors: ViewerColorManager;
  private readonly browserWindow: Window;
  private readonly document: Document;
  private readonly listeners = new Set<() => void>();
  private readonly headerController = { current: null as BedoHeaderController | null };
  private state: GalleryAppViewModelState;
  private viewerElement: HTMLElement | null = null;
  private artworkImage: HTMLImageElement | null = null;
  private viewerLayout: ViewerLayoutController | null = null;
  private loadGeneration = 0;

  constructor({
    catalog = new ArtworkCatalog(),
    colors = viewerColorManager,
    browserWindow = window,
    document = window.document
  }: GalleryAppViewModelOptions = {}) {
    this.catalog = catalog;
    this.colors = colors;
    this.browserWindow = browserWindow;
    this.document = document;
    this.gallery = new GalleryViewModel(browserWindow, document);
    this.state = {
      entries: [],
      loadError: '',
      selectedName: currentArtworkName(browserWindow),
      imageOnly: false
    };
  }

  getSnapshot = (): GalleryAppViewModelState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get selectedEntry(): ArtworkEntry | undefined {
    return this.state.entries.find((entry) => entry.name === this.state.selectedName);
  }

  start({ stage, gallery, closeButton, header, viewer, image }: AppViewElements): () => void {
    const generation = ++this.loadGeneration;
    const stopGallery = this.gallery.start({ stage, gallery, closeButton, header });
    this.viewerElement = viewer;
    this.artworkImage = image;
    this.viewerLayout = new ViewerLayoutController(
      viewer,
      image,
      this.browserWindow,
      this.document
    );

    this.headerController.current ??= new BedoHeaderController();

    const onHashChange = () => this.syncRoute();
    const onKeyDown = (event: KeyboardEvent) => this.handleViewerKeyDown(event);
    const onResize = () => this.viewerLayout?.scheduleUpdate();

    this.browserWindow.addEventListener('hashchange', onHashChange);
    this.browserWindow.addEventListener('resize', onResize, { passive: true });
    this.document.addEventListener('keydown', onKeyDown);

    if (image.complete && image.naturalWidth) {
      this.onArtworkLoad(image);
    }

    void this.loadEntries(generation);

    return () => {
      this.loadGeneration++;
      stopGallery();
      this.browserWindow.removeEventListener('hashchange', onHashChange);
      this.browserWindow.removeEventListener('resize', onResize);
      this.document.removeEventListener('keydown', onKeyDown);
      this.viewerElement = null;
      this.artworkImage = null;
      this.viewerLayout = null;
    };
  }

  closeViewer(): void {
    this.browserWindow.history.pushState(null, '', this.browserWindow.location.pathname);
    this.update({ selectedName: '', imageOnly: false });
    this.clearViewerColor();
  }

  moveArtwork(offset: number): void {
    const { entries, selectedName } = this.state;
    if (!entries.length) {
      return;
    }

    const currentIndex = entries.findIndex((entry) => entry.name === selectedName);
    const nextIndex = (currentIndex + offset + entries.length) % entries.length;
    this.browserWindow.location.hash = encodeURIComponent(entries[nextIndex].name);
  }

  toggleImageOnly(): void {
    if (!this.selectedEntry) {
      return;
    }

    const imageOnly = !this.state.imageOnly;
    this.update({ imageOnly });
    if (imageOnly) {
      this.artworkImage?.focus({ preventScroll: true });
    }
  }

  onArtworkLoad(image: HTMLImageElement): void {
    this.viewerLayout?.update();
    const entry = this.selectedEntry;
    if (!entry || this.colors.viewerColors.has(entry.name)) {
      return;
    }

    try {
      this.colors.setViewerColor(this.colors.artworkBackground(image));
    } catch (error) {
      console.error('Failed to select an artwork background:', error);
    }
  }

  private async loadEntries(generation: number): Promise<void> {
    try {
      const entries = await this.catalog.load();
      if (generation !== this.loadGeneration) {
        return;
      }

      this.update({ entries });
      this.gallery.setEntries(entries);
      void this.colors.prepareViewerColors(entries, () => this.state.selectedName);
      this.applySelectedColor();
    } catch (error) {
      if (generation !== this.loadGeneration) {
        return;
      }

      console.error('Failed to load the gallery:', error);
      this.update({ loadError: GALLERY_LOAD_ERROR });
    }
  }

  private syncRoute(): void {
    this.update({ selectedName: currentArtworkName(this.browserWindow), imageOnly: false });
    this.applySelectedColor();
  }

  private handleViewerKeyDown(event: KeyboardEvent): void {
    if (!this.selectedEntry) {
      return;
    }

    if (this.state.imageOnly) {
      if (event.key === 'Escape') {
        this.update({ imageOnly: false });
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      this.moveArtwork(PREVIOUS_ARTWORK_OFFSET);
    } else if (event.key === 'ArrowRight') {
      this.moveArtwork(NEXT_ARTWORK_OFFSET);
    } else if (event.key === 'Escape') {
      this.closeViewer();
    }
  }

  private applySelectedColor(): void {
    const selectedColor = this.colors.viewerColors.get(this.state.selectedName);
    if (selectedColor) {
      this.colors.setViewerColor(selectedColor);
    }
  }

  private clearViewerColor(): void {
    this.viewerElement?.style.removeProperty('--viewer-color');
    this.viewerElement?.style.removeProperty('--viewer-bedo-color');
    this.viewerElement?.style.removeProperty('--viewer-works-color');
  }

  private update(patch: Partial<GalleryAppViewModelState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
