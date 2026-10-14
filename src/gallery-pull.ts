import { MathUtils } from './math-utils.ts';
import { usesSplitGallery } from './responsive-layout.ts';

interface GalleryPullElements {
  stage: HTMLElement;
  gallery: HTMLElement;
  header: HTMLElement;
}

export function galleryDockOffset(gallery: HTMLElement, browserWindow: Window): number {
  const toolbar = gallery.querySelector<HTMLElement>('.gallery-toolbar');
  return toolbar ? parseFloat(browserWindow.getComputedStyle(toolbar).top) || 0 : 0;
}

/**
 * Drives the pull-out gallery's scroll-linked presentation: the header fills in as it
 * rises, docks and spreads at the top, and each row of paintings trails the row above
 * it with an eased lag.
 */
export class GalleryPullController {
  static readonly DOCK_TOLERANCE_PX = 2;
  static readonly FOLLOW_TIME_CONSTANT_MS = 90;
  static readonly ROW_TIME_CONSTANT_MS = 45;
  static readonly MAX_FRAME_MS = 64;
  static readonly SETTLE_THRESHOLD_PX = 0.4;

  private readonly stage: HTMLElement;
  private readonly gallery: HTMLElement;
  private readonly header: HTMLElement;
  private readonly browserWindow: Window;
  private rows: HTMLElement[][] = [];
  private positions: number[] = [];
  private target = 0;
  private frame = 0;
  private lastFrameTime = 0;
  private travelled = 0;
  private suspended = false;

  constructor({ stage, gallery, header }: GalleryPullElements, browserWindow: Window = window) {
    this.stage = stage;
    this.gallery = gallery;
    this.header = header;
    this.browserWindow = browserWindow;
  }

  static progress(travelled: number, range: number): number {
    return range > 0 ? MathUtils.clamp(travelled / range, 0, 1) : 1;
  }

  /**
   * Exponentially closes a fraction of the remaining gap each frame. Because it never
   * covers more than the gap, the paintings ease into place without overshooting.
   */
  static follow(
    position: number,
    target: number,
    elapsedMs: number,
    timeConstantMs: number = this.FOLLOW_TIME_CONSTANT_MS
  ): number {
    const elapsed = MathUtils.clamp(elapsedMs, 0, this.MAX_FRAME_MS);
    const closed = 1 - Math.exp(-elapsed / timeConstantMs);
    return position + (target - position) * closed;
  }

  static isSettled(position: number, target: number): boolean {
    return Math.abs(target - position) < this.SETTLE_THRESHOLD_PX;
  }

  start(): () => void {
    const onChange = () => this.update();
    const onResize = () => {
      if (!this.header.hidden && this.gallery.dataset.docked === 'true') {
        const { range } = this.measureTravel();
        this.scrollTo(range);
      }
      this.update();
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== this.gallery) {
        this.update();
      }
    };
    const resizeTarget = this.browserWindow.visualViewport ?? this.browserWindow;

    this.stage.addEventListener('scroll', onChange, { passive: true });
    this.browserWindow.addEventListener('scroll', onChange, { passive: true });
    resizeTarget.addEventListener('resize', onResize, { passive: true });
    if (resizeTarget !== this.browserWindow) {
      this.browserWindow.addEventListener('resize', onResize, { passive: true });
    }
    this.gallery.addEventListener('transitionend', onTransitionEnd);
    const motion = this.browserWindow.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', onChange);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onChange);
    resizeObserver?.observe(this.header);
    resizeObserver?.observe(this.gallery);
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(onChange);
    mutations?.observe(this.gallery, { childList: true, subtree: true });
    mutations?.observe(this.header, { attributes: true, attributeFilter: ['hidden'] });
    this.update();

    return () => {
      this.stage.removeEventListener('scroll', onChange);
      this.browserWindow.removeEventListener('scroll', onChange);
      resizeTarget.removeEventListener('resize', onResize);
      if (resizeTarget !== this.browserWindow) {
        this.browserWindow.removeEventListener('resize', onResize);
      }
      motion.removeEventListener('change', onChange);
      resizeObserver?.disconnect();
      mutations?.disconnect();
      this.gallery.removeEventListener('transitionend', onTransitionEnd);
      this.browserWindow.cancelAnimationFrame(this.frame);
      this.frame = 0;
    };
  }

  private isLandscape(): boolean {
    return usesSplitGallery(this.browserWindow);
  }

  private prefersReducedMotion(): boolean {
    return this.browserWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private measureTravel(): { travelled: number; range: number } {
    if (this.isLandscape()) {
      return {
        travelled: this.stage.scrollTop,
        range: Math.max(0, this.stage.scrollHeight - this.stage.clientHeight)
      };
    }

    return {
      travelled: this.browserWindow.scrollY,
      range: Math.max(
        0,
        this.gallery.offsetTop - galleryDockOffset(this.gallery, this.browserWindow)
      )
    };
  }

  private scrollTo(top: number): void {
    if (this.isLandscape()) {
      this.stage.scrollTo({ top, behavior: 'auto' });
    } else {
      this.browserWindow.scrollTo({ top, behavior: 'auto' });
    }
  }

  private update(): void {
    if (this.header.hidden) {
      this.suspended = true;
      this.browserWindow.cancelAnimationFrame(this.frame);
      this.frame = 0;
      return;
    }

    if (this.suspended) {
      this.suspended = false;
      // Native focus can recenter a tile before it opens the viewer. Returning from
      // that viewer must not restore an accidentally half-open gallery.
      const { range } = this.measureTravel();
      this.scrollTo(this.travelled > 0 ? Math.max(this.travelled, range) : 0);
    }
    const { travelled, range } = this.measureTravel();
    this.travelled = travelled;
    const progress = GalleryPullController.progress(travelled, range);
    const docked = range - travelled <= GalleryPullController.DOCK_TOLERANCE_PX;

    this.stage.style.setProperty('--gallery-progress', progress.toFixed(3));
    this.stage.dataset.docked = String(docked);
    this.gallery.dataset.docked = String(docked);
    if (!docked) {
      this.measurePill();
    }

    this.target = Math.min(travelled, range);
    this.collectRows();
    if (this.prefersReducedMotion()) {
      this.browserWindow.cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.positions = this.rows.map(() => this.target);
      this.applyLag();
      return;
    }

    if (!this.frame) {
      this.lastFrameTime = 0;
      this.frame = this.browserWindow.requestAnimationFrame((time) => this.animate(time));
    }
  }

  private measurePill(): void {
    const toolbar = this.gallery.querySelector<HTMLElement>('.gallery-toolbar');
    const toggle = this.gallery.querySelector<HTMLElement>('.gallery-heading-toggle');
    if (!toolbar || !toggle) {
      return;
    }

    const toolbarLeft = toolbar.getBoundingClientRect().left;
    const toggleRight = toggle.getBoundingClientRect().right;
    const inset = parseFloat(this.browserWindow.getComputedStyle(toolbar).paddingLeft) || 0;
    this.gallery.style.setProperty(
      '--gallery-pill-width',
      `${Math.round(toggleRight - toolbarLeft + inset)}px`
    );

  }

  /** Groups tiles into visual rows so each row can trail the one above it. */
  private collectRows(): void {
    const rows = new Map<number, HTMLElement[]>();
    this.gallery.querySelectorAll<HTMLElement>('.gallery-content > a').forEach((tile) => {
      const top = Math.round(tile.offsetTop);
      rows.set(top, [...(rows.get(top) ?? []), tile]);
    });

    const previous = new Map<HTMLElement, number>();
    this.rows.forEach((row, index) => {
      row.forEach((tile) => previous.set(tile, this.positions[index]));
    });
    this.rows = [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
    this.positions = this.rows.map((row) => previous.get(row[0]) ?? this.target);
    this.applyLag();
  }

  private animate(time: number): void {
    this.frame = 0;
    const elapsed = this.lastFrameTime ? time - this.lastFrameTime : 1000 / 60;
    this.lastFrameTime = time;

    let leader = this.target;
    let settled = true;
    this.positions = this.positions.map((position, index) => {
      const timeConstant = index === 0
          ? GalleryPullController.FOLLOW_TIME_CONSTANT_MS
          : GalleryPullController.ROW_TIME_CONSTANT_MS;
      let next = GalleryPullController.follow(position, leader, elapsed, timeConstant);
      if (settled && GalleryPullController.isSettled(next, this.target)) {
        next = this.target;
      } else {
        settled = false;
      }
      leader = next;
      return next;
    });

    if (!settled) {
      this.frame = this.browserWindow.requestAnimationFrame((next) => this.animate(next));
    }

    this.applyLag();
  }

  private applyLag(): void {
    this.rows.forEach((row, index) => {
      const lag = Math.max(0, this.target - (this.positions[index] ?? this.target));
      row.forEach((tile) => tile.style.setProperty('--tile-lag', `${lag.toFixed(2)}px`));
    });
  }
}
