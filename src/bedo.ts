import { MathUtils } from './math-utils.ts';
import { BlinkBehavior, ManualBlinkController } from './interaction-behavior.ts';

const MIN_SCROLL_RANGE_PX = 1;
const MIN_PARALLAX_PROGRESS = 0;
const MAX_PARALLAX_PROGRESS = 1;
const BASE_bedo_SCALE = 1;
const LANDSCAPE_PARALLAX_X_RATIO = 0.2;
const PORTRAIT_PARALLAX_X_RATIO = 0.15;
const PORTRAIT_PARALLAX_MAX_X_PX = 220;
const LANDSCAPE_PARALLAX_Y_RATIO = 0.04;
const LANDSCAPE_PARALLAX_MAX_Y_PX = 56;
const PORTRAIT_PARALLAX_Y_RATIO = 0.18;
const PORTRAIT_PARALLAX_MAX_Y_PX = 180;
const LANDSCAPE_PARALLAX_SCALE_RATIO = 0.2;
const GAZE_TRANSITION_BLUR_PX = 1.5;
const GAZE_TRANSITION_DURATION_MS = 70;
const OBJECT_POSITION_PERCENT_SCALE = 100;
const OBJECT_POSITION_CENTER_DIVISOR = 2;
const GAZE_POINTER_RANGE_RATIO = 0.28;
const MIN_NORMALIZED_GAZE = -1;
const MAX_NORMALIZED_GAZE = 1;
const GAZE_DIRECTION_THRESHOLD = 0.18;
const DOWN_GAZE_DIRECTION_THRESHOLD = 0.6;
const CENTER_FOCUS_THRESHOLD = 0.08;
const MIDDLE_LEFT_THRESHOLD = 0.6;
const DOWN_MIDDLE_THRESHOLD = 0.8;

interface EyePosition {
  x: number;
  y: number;
}

interface EyeSettings {
  crop: { x: number; y: number; width: number; height: number };
  eyes: EyePosition[];
  states: Record<string, string>;
}

export class BedoHeaderController {
  private readonly bedoImage = document.querySelector<HTMLImageElement>('.bedo-image')!;
  private readonly bedoEyeOverlay = document.querySelector<HTMLCanvasElement>('.bedo-eye-overlay')!;
  private readonly bedoMedia: HTMLElement[] = [this.bedoImage, this.bedoEyeOverlay];
  private readonly bedoHeader = document.getElementById('gallery-header')!;
  private readonly landingStage = document.getElementById('landing-stage')!;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly bedoGazeImages = new Map<string, Promise<HTMLImageElement>>();
  private readonly bedoGazeDirections = new Map<string, string>([
    ['-1,-1', 'up-left'],
    ['0,-1', 'up'],
    ['1,-1', 'up-right'],
    ['-1,0', 'left'],
    ['0,0', 'center'],
    ['1,0', 'right'],
    ['-1,1', 'down-left'],
    ['0,1', 'down'],
    ['1,1', 'down-right']
  ]);

  private bedoParallaxFrame = 0;
  private renderedbedoShiftX = Number.NaN;
  private renderedbedoShiftY = Number.NaN;
  private renderedbedoScale = Number.NaN;
  private bedoEyeSettings: EyeSettings | undefined;
  private requestedbedoGaze = '';
  private currentbedoGazeState = 'center';
  private bedoGazeFrame = 0;
  private bedoBlinkTimer = 0;
  private hasRenderedbedoGaze = false;
  private bedoGazeTransitionLayer: HTMLCanvasElement | null = null;
  private readonly bedoManualBlink = new ManualBlinkController({
    blink: () => this.showbedoGaze('blink'),
    restore: () => this.showbedoGaze(this.currentbedoGazeState),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    now: () => performance.now()
  });

  constructor() {
    this.registerbedoEventHandlers();
    void this.initializebedoEyes();
  }

  // Parallax updates are coalesced so scroll and resize events stay inexpensive.

  /**
   * Apply scroll-based movement to the bedo image and eye overlay.
   * @returns {void}
   */
  private updatebedoParallax(): void {
    this.bedoParallaxFrame = 0;
    if (!this.bedoImage || document.hidden) {
      return;
    }

    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const maxPageScroll = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      MIN_SCROLL_RANGE_PX
    );

    const effectRange = landscape
      ? Math.max(
          this.landingStage.scrollHeight - this.landingStage.clientHeight,
          MIN_SCROLL_RANGE_PX
        )
      : Math.min(this.bedoHeader.offsetHeight, maxPageScroll);
    const scrollTop = landscape ? this.landingStage.scrollTop : window.scrollY;
    const progress = this.reducedMotion.matches
      ? MIN_PARALLAX_PROGRESS
      : MathUtils.clamp(scrollTop / effectRange, MIN_PARALLAX_PROGRESS, MAX_PARALLAX_PROGRESS);
    const shiftX = landscape
      ? -window.innerWidth * LANDSCAPE_PARALLAX_X_RATIO * progress
      : -Math.min(window.innerWidth * PORTRAIT_PARALLAX_X_RATIO, PORTRAIT_PARALLAX_MAX_X_PX) *
        progress;
    const shiftY = landscape
      ? -Math.min(window.innerHeight * LANDSCAPE_PARALLAX_Y_RATIO, LANDSCAPE_PARALLAX_MAX_Y_PX) *
        progress
      : Math.min(window.innerHeight * PORTRAIT_PARALLAX_Y_RATIO, PORTRAIT_PARALLAX_MAX_Y_PX) *
        progress;
    const scale = landscape
      ? BASE_bedo_SCALE + LANDSCAPE_PARALLAX_SCALE_RATIO * progress
      : BASE_bedo_SCALE;

    if (shiftX !== this.renderedbedoShiftX) {
      this.bedoMedia.forEach((media) => media.style.setProperty('--bedo-shift-x', `${shiftX}px`));
      this.renderedbedoShiftX = shiftX;
    }
    if (shiftY !== this.renderedbedoShiftY) {
      this.bedoMedia.forEach((media) => media.style.setProperty('--bedo-shift-y', `${shiftY}px`));
      this.renderedbedoShiftY = shiftY;
    }
    if (scale !== this.renderedbedoScale) {
      this.bedoMedia.forEach((media) => media.style.setProperty('--bedo-scale', String(scale)));
      this.renderedbedoScale = scale;
    }
  }

  /**
   * Schedule one bedo parallax update on the next animation frame.
   * @returns {void}
   */
  private schedulebedoParallax(): void {
    if (!this.bedoParallaxFrame) {
      this.bedoParallaxFrame = requestAnimationFrame(() => this.updatebedoParallax());
    }
  }

  // Eye sprite loading and transitions.

  /**
   * Load and cache an eye-gaze sprite.
   * @param {string} fileName Sprite filename from the gaze manifest.
   * @returns {Promise<HTMLImageElement>} The loaded sprite image.
   */
  private loadbedoGazeImage(fileName: string): Promise<HTMLImageElement> {
    if (!this.bedoGazeImages.has(fileName)) {
      const image = new Image();
      const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load eye gaze image: ${fileName}`));
      });
      image.src = `src/about/eyes/${fileName}`;
      this.bedoGazeImages.set(fileName, loaded);
    }

    return this.bedoGazeImages.get(fileName)!;
  }

  /**
   * Draw a gaze sprite into the eye overlay, fading from the previous gaze.
   * @param {HTMLImageElement} image Loaded eye-gaze sprite.
   * @returns {void}
   */
  private drawbedoGaze(image: HTMLImageElement): void {
    const context = this.bedoEyeOverlay.getContext('2d');
    if (!context || !this.bedoEyeSettings) {
      return;
    }

    const { crop } = this.bedoEyeSettings;

    if (this.bedoGazeTransitionLayer) {
      this.bedoGazeTransitionLayer.getAnimations().forEach((animation) => animation.cancel());
      this.bedoGazeTransitionLayer.remove();
      this.bedoGazeTransitionLayer = null;
    }

    if (this.hasRenderedbedoGaze && !this.reducedMotion.matches) {
      const transitionLayer = this.bedoEyeOverlay.cloneNode() as HTMLCanvasElement;
      transitionLayer.classList.add('bedo-eye-transition');
      transitionLayer.getContext('2d')?.drawImage(this.bedoEyeOverlay, 0, 0);
      this.bedoHeader.append(transitionLayer);
      this.bedoGazeTransitionLayer = transitionLayer;

      const animation = transitionLayer.animate(
        [
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: `blur(${GAZE_TRANSITION_BLUR_PX}px)` }
        ],
        { duration: GAZE_TRANSITION_DURATION_MS, easing: 'ease-out' }
      );

      animation.onfinish = () => {
        transitionLayer.remove();
        if (this.bedoGazeTransitionLayer === transitionLayer) {
          this.bedoGazeTransitionLayer = null;
        }
      };
    }

    context.clearRect(0, 0, this.bedoEyeOverlay.width, this.bedoEyeOverlay.height);
    context.drawImage(
      image,
      0,
      0,
      crop.width,
      crop.height,
      crop.x,
      crop.y,
      crop.width,
      crop.height
    );

    this.hasRenderedbedoGaze = true;
  }

  /**
   * Load and display the requested gaze state.
   * @param {string} stateName Name of a state in the eye manifest.
   * @returns {Promise<void>} Resolves after the sprite is drawn or its load fails.
   */
  private async showbedoGaze(stateName: string): Promise<void> {
    if (!this.bedoEyeSettings) {
      return;
    }

    const isBlink = stateName === 'blink';
    const fileName = this.bedoEyeSettings.states[stateName];
    if (!fileName || this.requestedbedoGaze === fileName) {
      return;
    }

    if (!isBlink) {
      this.currentbedoGazeState = stateName;
      window.clearTimeout(this.bedoBlinkTimer);
    }
    this.requestedbedoGaze = fileName;

    try {
      const image = await this.loadbedoGazeImage(fileName);
      if (this.requestedbedoGaze !== fileName) {
        return;
      }

      this.drawbedoGaze(image);
      if (!isBlink) {
        this.schedulebedoBlink();
      }
    } catch (error) {
      console.error('Failed to load the header eye gaze:', error);
    }
  }

  /**
   * Schedule a natural blink and restore the gaze afterward.
   * @returns {void}
   */
  private schedulebedoBlink(): void {
    window.clearTimeout(this.bedoBlinkTimer);
    const states = this.bedoEyeSettings?.states;

    if (!states || !this.hasRenderedbedoGaze || document.hidden || this.reducedMotion.matches) {
      return;
    }

    this.bedoBlinkTimer = window.setTimeout(async () => {
      const gazeState = this.currentbedoGazeState;
      await this.showbedoGaze('blink');

      if (this.requestedbedoGaze !== states.blink) {
        this.schedulebedoBlink();
        return;
      }

      this.bedoBlinkTimer = window.setTimeout(() => {
        if (this.requestedbedoGaze === states.blink) {
          this.showbedoGaze(gazeState);
        }
      }, BlinkBehavior.HOLD_DURATION_MS);
    }, BlinkBehavior.getIntervalMs());
  }

  /**
   * Cancel the pending blink and restore the current gaze if needed.
   * @returns {void}
   */
  private cancelbedoBlink(): void {
    window.clearTimeout(this.bedoBlinkTimer);
    this.bedoBlinkTimer = 0;
    this.bedoManualBlink.cancel();
    if (this.requestedbedoGaze === this.bedoEyeSettings?.states.blink) {
      this.showbedoGaze(this.currentbedoGazeState);
    }
  }

  // Pointer coordinates are mapped to the nearest sprite direction.

  /**
   * Convert a CSS object-position component into its crop offset.
   * @param {string} position CSS position keyword or percentage.
   * @param {number} availableSpace Difference between container and image size.
   * @returns {number} Offset in pixels.
   */
  private getObjectPositionOffset(position: string, availableSpace: number): number {
    if (position === 'left' || position === 'top') {
      return 0;
    }

    if (position === 'right' || position === 'bottom') {
      return availableSpace;
    }

    if (position === 'center') {
      return availableSpace / OBJECT_POSITION_CENTER_DIVISOR;
    }

    return (Number.parseFloat(position) / OBJECT_POSITION_PERCENT_SCALE) * availableSpace;
  }

  /**
   * Map the eye coordinates in the artwork to viewport coordinates.
   * @returns {{positions: {x: number, y: number}[], scale: number}} Eye positions and image scale.
   */
  private getbedoEyeViewportPositions(): { positions: EyePosition[]; scale: number } {
    if (!this.bedoEyeSettings) {
      return { positions: [], scale: 1 };
    }

    const imageStyle = getComputedStyle(this.bedoImage);
    const imageRect = this.bedoImage.getBoundingClientRect();
    const scale = Math.max(
      imageRect.width / this.bedoImage.naturalWidth,
      imageRect.height / this.bedoImage.naturalHeight
    );

    const [positionX, positionY] = imageStyle.objectPosition.split(' ');
    const cropOffsetX = this.getObjectPositionOffset(
      positionX,
      imageRect.width - this.bedoImage.naturalWidth * scale
    );

    const cropOffsetY = this.getObjectPositionOffset(
      positionY,
      imageRect.height - this.bedoImage.naturalHeight * scale
    );

    return {
      scale,
      positions: this.bedoEyeSettings.eyes.map((eye) => ({
        x: imageRect.left + cropOffsetX + eye.x * scale,
        y: imageRect.top + cropOffsetY + eye.y * scale
      }))
    };
  }

  /**
   * Blink when the face is pressed, holding the eyes closed while pressed near an eye.
   * @param {PointerEvent} event Pointer press in the landing header.
   * @returns {void}
   */
  private handlebedoPointerDown(event: PointerEvent): void {
    if (
      !this.bedoEyeSettings ||
      !(event.target instanceof Node) ||
      !this.bedoHeader.contains(event.target)
    ) {
      return;
    }

    if (event.target instanceof Element && event.target.closest('.header-brand')) {
      return;
    }

    const { positions, scale } = this.getbedoEyeViewportPositions();
    window.clearTimeout(this.bedoBlinkTimer);
    this.bedoBlinkTimer = 0;
    this.bedoManualBlink.pointerDown(
      event.pointerId,
      BlinkBehavior.isPointerNearEyes(event, positions, scale)
    );

  }

  /**
   * Finish a manual blink when the pointer is released or cancelled.
   * @param {PointerEvent} event Pointer release or cancellation.
   * @returns {void}
   */
  private handlebedoPointerEnd(event: PointerEvent): void {
    this.bedoManualBlink.pointerUp(event.pointerId);
  }

  /**
   * Resolve the gaze sprite that points toward a pointer or touch location.
   * @param {{clientX: number, clientY: number}} event Viewport coordinates.
   * @returns {string} Matching gaze state name.
   */
  private getbedoGazeState(event: { clientX: number; clientY: number }): string {
    if (!this.bedoEyeSettings) {
      return 'center';
    }

    const imageStyle = getComputedStyle(this.bedoImage);
    const imageRect = this.bedoImage.getBoundingClientRect();
    const imageScale = Math.max(
      imageRect.width / this.bedoImage.naturalWidth,
      imageRect.height / this.bedoImage.naturalHeight
    );

    const [positionX, positionY] = imageStyle.objectPosition.split(' ');
    const cropOffsetX = this.getObjectPositionOffset(
      positionX,
      imageRect.width - this.bedoImage.naturalWidth * imageScale
    );

    const cropOffsetY = this.getObjectPositionOffset(
      positionY,
      imageRect.height - this.bedoImage.naturalHeight * imageScale
    );

    const eyes = this.bedoEyeSettings.eyes;
    const eyesCenter = eyes.reduce(
      (center, eye) => ({
        x: center.x + eye.x / eyes.length,
        y: center.y + eye.y / eyes.length
      }),
      { x: 0, y: 0 }
    );

    const targetX = imageRect.left + cropOffsetX + eyesCenter.x * imageScale;
    const targetY = imageRect.top + cropOffsetY + eyesCenter.y * imageScale;
    const horizontal = MathUtils.clamp(
      (event.clientX - targetX) / (window.innerWidth * GAZE_POINTER_RANGE_RATIO),
      MIN_NORMALIZED_GAZE,
      MAX_NORMALIZED_GAZE
    );

    const vertical = MathUtils.clamp(
      (event.clientY - targetY) / (window.innerHeight * GAZE_POINTER_RANGE_RATIO),
      MIN_NORMALIZED_GAZE,
      MAX_NORMALIZED_GAZE
    );

    const column = Math.abs(horizontal) < GAZE_DIRECTION_THRESHOLD ? 0 : Math.sign(horizontal);
    const verticalThreshold = vertical > 0 ? DOWN_GAZE_DIRECTION_THRESHOLD : GAZE_DIRECTION_THRESHOLD;
    const row = Math.abs(vertical) < verticalThreshold ? 0 : Math.sign(vertical);

    if (
      column === 0 &&
      row === 0 &&
      Math.abs(horizontal) < CENTER_FOCUS_THRESHOLD &&
      Math.abs(vertical) < CENTER_FOCUS_THRESHOLD
    ) {
      return 'center-focused';
    }

    if (row === 0 && column === -1 && Math.abs(horizontal) < MIDDLE_LEFT_THRESHOLD) {
      return 'middle-left';
    }

    if (column === 0 && row === 1 && vertical < DOWN_MIDDLE_THRESHOLD) {
      return 'down-middle';
    }

    return this.bedoGazeDirections.get(`${column},${row}`) ?? 'center';
  }

  /**
   * Coalesce pointer updates and display the nearest gaze state.
   * @param {number} clientX Horizontal viewport coordinate.
   * @param {number} clientY Vertical viewport coordinate.
   * @returns {void}
   */
  private schedulebedoGaze(clientX: number, clientY: number): void {
    if (this.bedoGazeFrame || this.bedoManualBlink.isActive()) {
      return;
    }

    this.bedoGazeFrame = requestAnimationFrame(() => {
      this.bedoGazeFrame = 0;
      this.showbedoGaze(this.getbedoGazeState({ clientX, clientY }));
    });
  }

  /**
   * Track the first active touch as the gaze target.
   * @param {TouchEvent} event Touch event containing active pointers.
   * @returns {void}
   */
  private trackTouchGaze(event: TouchEvent): void {
    if (!this.bedoEyeSettings) {
      return;
    }

    const touch = event.touches[0];
    if (touch) {
      this.schedulebedoGaze(touch.clientX, touch.clientY);
    }
  }

  /**
   * Cancel pending gaze work and clear the overlay after touch input ends.
   * @returns {void}
   */
  private resetbedoGaze(): void {
    if (this.bedoGazeFrame) {
      cancelAnimationFrame(this.bedoGazeFrame);
    }
    this.bedoGazeFrame = 0;
    window.clearTimeout(this.bedoBlinkTimer);
    this.bedoManualBlink.cancel();
    this.bedoBlinkTimer = 0;
    this.requestedbedoGaze = '';

    if (this.bedoGazeTransitionLayer) {
      this.bedoGazeTransitionLayer.getAnimations().forEach((animation) => animation.cancel());
      this.bedoGazeTransitionLayer.remove();
      this.bedoGazeTransitionLayer = null;
    }

    this.bedoEyeOverlay
      .getContext('2d')
      ?.clearRect(0, 0, this.bedoEyeOverlay.width, this.bedoEyeOverlay.height);
    this.hasRenderedbedoGaze = false;
  }

  /**
   * Refresh parallax and blink behavior when page visibility changes.
   * @returns {void}
   */
  private handlebedoVisibilityChange(): void {
    this.schedulebedoParallax();
    if (document.hidden) {
      this.cancelbedoBlink();
    } else {
      this.schedulebedoBlink();
    }
  }

  /**
   * Refresh parallax and blink behavior when the motion preference changes.
   * @returns {void}
   */
  private handleReducedMotionChange(): void {
    this.schedulebedoParallax();
    if (this.reducedMotion.matches) {
      this.cancelbedoBlink();
    } else {
      this.schedulebedoBlink();
    }
  }

  /**
   * Update gaze from non-touch pointer movement once settings are loaded.
   * @param {PointerEvent} event Pointer movement event.
   * @returns {void}
   */
  private handlebedoPointerMove(event: PointerEvent): void {
    if (!this.bedoEyeSettings || event.pointerType === 'touch') {
      return;
    }

    this.schedulebedoGaze(event.clientX, event.clientY);
  }

  /**
   * Follow the remaining touch or clear gaze when the final touch ends.
   * @param {TouchEvent} event Touch end event.
   * @returns {void}
   */
  private handlebedoTouchEnd(event: TouchEvent): void {
    if (event.touches.length) {
      this.trackTouchGaze(event);
    } else {
      this.resetbedoGaze();
    }
  }

  // Manifest and input setup.

  /**
   * Load gaze settings and register pointer and touch handlers.
   * @returns {Promise<void>} Resolves after gaze input is initialized.
   */
  private async initializebedoEyes(): Promise<void> {
    if (!this.bedoEyeOverlay || !this.bedoImage) {
      return;
    }

    try {
      const response = await fetch('src/about/eyes/manifest.json');
      if (!response.ok) {
        throw new Error(`Could not load eye manifest (${response.status}).`);
      }
      this.bedoEyeSettings = (await response.json()) as EyeSettings;
      if (!this.bedoImage.complete) {
        await new Promise((resolve) =>
          this.bedoImage.addEventListener('load', resolve, { once: true })
        );

      }

      this.bedoEyeOverlay.width = this.bedoImage.naturalWidth;
      this.bedoEyeOverlay.height = this.bedoImage.naturalHeight;
      this.showbedoGaze('center');
    } catch (error) {
      console.error('Failed to initialize the header eyes:', error);
    }
  }

  // Event registration.

  /**
   * Register bedo scrolling, visibility, motion, and pointer handlers.
   * @returns {void}
   */
  private registerbedoEventHandlers(): void {
    window.addEventListener('scroll', () => this.schedulebedoParallax(), { passive: true });
    this.landingStage.addEventListener('scroll', () => this.schedulebedoParallax(), {
      passive: true
    });
    window.addEventListener('resize', () => this.schedulebedoParallax(), { passive: true });
    document.addEventListener('visibilitychange', () => this.handlebedoVisibilityChange());
    this.reducedMotion.addEventListener('change', () => this.handleReducedMotionChange());
    window.addEventListener('pointermove', (event) => this.handlebedoPointerMove(event), {
      passive: true
    });
    window.addEventListener('pointerdown', (event) => this.handlebedoPointerDown(event), {
      passive: true
    });
    window.addEventListener('pointerup', (event) => this.handlebedoPointerEnd(event), {
      passive: true
    });
    window.addEventListener('pointercancel', (event) => this.handlebedoPointerEnd(event), {
      passive: true
    });
    window.addEventListener('touchstart', (event) => this.trackTouchGaze(event), { passive: true });
    window.addEventListener('touchmove', (event) => this.trackTouchGaze(event), { passive: true });
    window.addEventListener('touchend', (event) => this.handlebedoTouchEnd(event), {
      passive: true
    });
    window.addEventListener('touchcancel', () => this.resetbedoGaze(), { passive: true });
    this.schedulebedoParallax();
  }
}
