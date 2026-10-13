import { clamp } from './math-utils.js';

const MIN_SCROLL_RANGE_PX = 1;
const MIN_PARALLAX_PROGRESS = 0;
const MAX_PARALLAX_PROGRESS = 1;
const BASE_HERO_SCALE = 1;
const LANDSCAPE_PARALLAX_X_RATIO = .2;
const PORTRAIT_PARALLAX_X_RATIO = .15;
const PORTRAIT_PARALLAX_MAX_X_PX = 220;
const LANDSCAPE_PARALLAX_Y_RATIO = .04;
const LANDSCAPE_PARALLAX_MAX_Y_PX = 56;
const PORTRAIT_PARALLAX_Y_RATIO = .18;
const PORTRAIT_PARALLAX_MAX_Y_PX = 180;
const LANDSCAPE_PARALLAX_SCALE_RATIO = .2;
const GAZE_TRANSITION_BLUR_PX = 1.5;
const GAZE_TRANSITION_DURATION_MS = 70;
const BLINK_HOLD_DURATION_MS = 120;
const MIN_BLINK_INTERVAL_MS = 2500;
const BLINK_INTERVAL_VARIANCE_MS = 1000;
const OBJECT_POSITION_PERCENT_SCALE = 100;
const OBJECT_POSITION_CENTER_DIVISOR = 2;
const GAZE_POINTER_RANGE_RATIO = .28;
const MIN_NORMALIZED_GAZE = -1;
const MAX_NORMALIZED_GAZE = 1;
const GAZE_DIRECTION_THRESHOLD = .18;
const DOWN_GAZE_DIRECTION_THRESHOLD = .6;
const CENTER_FOCUS_THRESHOLD = .08;
const MIDDLE_LEFT_THRESHOLD = .6;
const DOWN_MIDDLE_THRESHOLD = .8;


/**
 * Find a page element by its ID.
 * @param {string} id Element ID.
 * @returns {HTMLElement|null} The matching element, if present.
 */
const $ = id => document.getElementById(id);

// Hero parallax and interactive eye gaze.
const heroImage = document.querySelector('.hero-image');
const heroEyeOverlay = document.querySelector('.hero-eye-overlay');
const heroMedia = [heroImage, heroEyeOverlay].filter(Boolean);
const heroHeader = $('gallery-header');
const landingStage = $('landing-stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroGazeImages = new Map();
const heroGazeDirections = new Map([
  ['-1,-1', 'up-left'], ['0,-1', 'up'], ['1,-1', 'up-right'],
  ['-1,0', 'left'], ['0,0', 'center'], ['1,0', 'right'],
  ['-1,1', 'down-left'], ['0,1', 'down'], ['1,1', 'down-right']
]);

let heroParallaxFrame = 0;
let renderedHeroShiftX = Number.NaN;
let renderedHeroShiftY = Number.NaN;
let renderedHeroScale = Number.NaN;
let heroEyeSettings;
let requestedHeroGaze = '';
let currentHeroGazeState = 'center';
let heroGazeFrame = 0;
let heroBlinkTimer = 0;
let hasRenderedHeroGaze = false;
let heroGazeTransitionLayer;

// Parallax updates are coalesced so scroll and resize events stay inexpensive.

/**
 * Apply scroll-based movement to the hero image and eye overlay.
 * @returns {void}
 */
function updateHeroParallax() {
  heroParallaxFrame = 0;
  if (!heroImage || document.hidden) return;

  const landscape = window.matchMedia('(orientation: landscape)').matches;
  const maxPageScroll = Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    MIN_SCROLL_RANGE_PX
  );
  const effectRange = landscape
    ? Math.max(
      landingStage.scrollHeight - landingStage.clientHeight,
      MIN_SCROLL_RANGE_PX
    )
    : Math.min(heroHeader.offsetHeight, maxPageScroll);
  const scrollTop = landscape ? landingStage.scrollTop : window.scrollY;
  const progress = reducedMotion.matches
    ? MIN_PARALLAX_PROGRESS
    : clamp(scrollTop / effectRange, MIN_PARALLAX_PROGRESS, MAX_PARALLAX_PROGRESS);
  const shiftX = landscape
    ? -window.innerWidth * LANDSCAPE_PARALLAX_X_RATIO * progress
    : -Math.min(
      window.innerWidth * PORTRAIT_PARALLAX_X_RATIO,
      PORTRAIT_PARALLAX_MAX_X_PX
    ) * progress;
  const shiftY = landscape
    ? -Math.min(
      window.innerHeight * LANDSCAPE_PARALLAX_Y_RATIO,
      LANDSCAPE_PARALLAX_MAX_Y_PX
    ) * progress
    : Math.min(
      window.innerHeight * PORTRAIT_PARALLAX_Y_RATIO,
      PORTRAIT_PARALLAX_MAX_Y_PX
    ) * progress;
  const scale = landscape
    ? BASE_HERO_SCALE + LANDSCAPE_PARALLAX_SCALE_RATIO * progress
    : BASE_HERO_SCALE;


  if (shiftX !== renderedHeroShiftX) {
    heroMedia.forEach(media => media.style.setProperty('--hero-shift-x', `${shiftX}px`));
    renderedHeroShiftX = shiftX;
  }
  if (shiftY !== renderedHeroShiftY) {
    heroMedia.forEach(media => media.style.setProperty('--hero-shift-y', `${shiftY}px`));
    renderedHeroShiftY = shiftY;
  }
  if (scale !== renderedHeroScale) {
    heroMedia.forEach(media => media.style.setProperty('--hero-scale', scale));
    renderedHeroScale = scale;
  }
}

/**
 * Schedule one hero parallax update on the next animation frame.
 * @returns {void}
 */
function scheduleHeroParallax() {
  if (!heroParallaxFrame) {
    heroParallaxFrame = requestAnimationFrame(updateHeroParallax);
  }
}

// Eye sprite loading and transitions.

/**
 * Load and cache an eye-gaze sprite.
 * @param {string} fileName Sprite filename from the gaze manifest.
 * @returns {Promise<HTMLImageElement>} The loaded sprite image.
 */
function loadHeroGazeImage(fileName) {
  if (!heroGazeImages.has(fileName)) {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load eye gaze image: ${fileName}`));
    });
    image.src = `src/about/eyes/${fileName}`;
    heroGazeImages.set(fileName, loaded);
  }

  return heroGazeImages.get(fileName);
}

/**
 * Draw a gaze sprite into the eye overlay, fading from the previous gaze.
 * @param {HTMLImageElement} image Loaded eye-gaze sprite.
 * @returns {void}
 */
function drawHeroGaze(image) {
  const context = heroEyeOverlay.getContext('2d');
  const { crop } = heroEyeSettings;

  if (heroGazeTransitionLayer) {
    heroGazeTransitionLayer.getAnimations().forEach(animation => animation.cancel());
    heroGazeTransitionLayer.remove();
    heroGazeTransitionLayer = null;
  }

  if (hasRenderedHeroGaze && !reducedMotion.matches) {
    const transitionLayer = heroEyeOverlay.cloneNode();
    transitionLayer.classList.add('hero-eye-transition');
    transitionLayer.getContext('2d').drawImage(heroEyeOverlay, 0, 0);
    heroHeader.append(transitionLayer);
    heroGazeTransitionLayer = transitionLayer;

    const animation = transitionLayer.animate([
      { opacity: 1, filter: 'blur(0px)' },
      { opacity: 0, filter: `blur(${GAZE_TRANSITION_BLUR_PX}px)` }
    ], { duration: GAZE_TRANSITION_DURATION_MS, easing: 'ease-out' });
    animation.onfinish = () => {
      transitionLayer.remove();
      if (heroGazeTransitionLayer === transitionLayer) heroGazeTransitionLayer = null;
    };
  }

  context.clearRect(0, 0, heroEyeOverlay.width, heroEyeOverlay.height);
  context.drawImage(image, 0, 0, crop.width, crop.height, crop.x, crop.y, crop.width, crop.height);
  hasRenderedHeroGaze = true;
}

/**
 * Load and display the requested gaze state.
 * @param {string} stateName Name of a state in the eye manifest.
 * @returns {Promise<void>} Resolves after the sprite is drawn or its load fails.
 */
async function showHeroGaze(stateName) {
  const isBlink = stateName === 'blink';
  const fileName = heroEyeSettings.states[stateName];
  if (!fileName || requestedHeroGaze === fileName) return;

  if (!isBlink) {
    currentHeroGazeState = stateName;
    window.clearTimeout(heroBlinkTimer);
  }
  requestedHeroGaze = fileName;

  try {
    const image = await loadHeroGazeImage(fileName);
    if (requestedHeroGaze !== fileName) return;
    drawHeroGaze(image);
    if (!isBlink) scheduleHeroBlink();
  } catch (error) {
    console.error('Failed to load the header eye gaze:', error);
  }
}

/**
 * Schedule a natural blink and restore the gaze afterward.
 * @returns {void}
 */
function scheduleHeroBlink() {
  window.clearTimeout(heroBlinkTimer);
  if (!hasRenderedHeroGaze || document.hidden || reducedMotion.matches) return;

  heroBlinkTimer = window.setTimeout(async () => {
    const gazeState = currentHeroGazeState;
    await showHeroGaze('blink');

    if (requestedHeroGaze !== heroEyeSettings.states.blink) {
      scheduleHeroBlink();
      return;
    }

    heroBlinkTimer = window.setTimeout(() => {
      if (requestedHeroGaze === heroEyeSettings.states.blink) {
        showHeroGaze(gazeState);
      }
    }, BLINK_HOLD_DURATION_MS);
  }, MIN_BLINK_INTERVAL_MS + Math.random() * BLINK_INTERVAL_VARIANCE_MS);
}

/**
 * Cancel the pending blink and restore the current gaze if needed.
 * @returns {void}
 */
function cancelHeroBlink() {
  window.clearTimeout(heroBlinkTimer);
  heroBlinkTimer = 0;
  if (requestedHeroGaze === heroEyeSettings?.states.blink) {
    showHeroGaze(currentHeroGazeState);
  }
}

// Pointer coordinates are mapped to the nearest sprite direction.

/**
 * Convert a CSS object-position component into its crop offset.
 * @param {string} position CSS position keyword or percentage.
 * @param {number} availableSpace Difference between container and image size.
 * @returns {number} Offset in pixels.
 */
function getObjectPositionOffset(position, availableSpace) {
  if (position === 'left' || position === 'top') return 0;
  if (position === 'right' || position === 'bottom') return availableSpace;
  if (position === 'center') return availableSpace / OBJECT_POSITION_CENTER_DIVISOR;
  return Number.parseFloat(position) / OBJECT_POSITION_PERCENT_SCALE * availableSpace;
}

/**
 * Resolve the gaze sprite that points toward a pointer or touch location.
 * @param {{clientX: number, clientY: number}} event Viewport coordinates.
 * @returns {string} Matching gaze state name.
 */
function getHeroGazeState(event) {
  const imageStyle = getComputedStyle(heroImage);
  const imageRect = heroImage.getBoundingClientRect();
  const imageScale = Math.max(
    imageRect.width / heroImage.naturalWidth,
    imageRect.height / heroImage.naturalHeight
  );


  const [positionX, positionY] = imageStyle.objectPosition.split(' ');
  const cropOffsetX = getObjectPositionOffset(
    positionX,
    imageRect.width - heroImage.naturalWidth * imageScale
  );
  const cropOffsetY = getObjectPositionOffset(
    positionY,
    imageRect.height - heroImage.naturalHeight * imageScale
  );


  const eyesCenter = heroEyeSettings.eyes.reduce((center, eye) => ({
    x: center.x + eye.x / heroEyeSettings.eyes.length,
    y: center.y + eye.y / heroEyeSettings.eyes.length
  }), { x: 0, y: 0 });
  const targetX = imageRect.left + cropOffsetX + eyesCenter.x * imageScale;
  const targetY = imageRect.top + cropOffsetY + eyesCenter.y * imageScale;
  const horizontal = clamp(
    (event.clientX - targetX) / (window.innerWidth * GAZE_POINTER_RANGE_RATIO),
    MIN_NORMALIZED_GAZE,
    MAX_NORMALIZED_GAZE
  );
  const vertical = clamp(
    (event.clientY - targetY) / (window.innerHeight * GAZE_POINTER_RANGE_RATIO),
    MIN_NORMALIZED_GAZE,
    MAX_NORMALIZED_GAZE
  );


  const column = Math.abs(horizontal) < GAZE_DIRECTION_THRESHOLD ? 0 : Math.sign(horizontal);
  const verticalThreshold = vertical > 0
    ? DOWN_GAZE_DIRECTION_THRESHOLD
    : GAZE_DIRECTION_THRESHOLD;
  const row = Math.abs(vertical) < verticalThreshold ? 0 : Math.sign(vertical);

  if (
    column === 0 && row === 0 &&
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
  return heroGazeDirections.get(`${column},${row}`);
}

/**
 * Coalesce pointer updates and display the nearest gaze state.
 * @param {number} clientX Horizontal viewport coordinate.
 * @param {number} clientY Vertical viewport coordinate.
 * @returns {void}
 */
function scheduleHeroGaze(clientX, clientY) {
  if (heroGazeFrame) return;
  heroGazeFrame = requestAnimationFrame(() => {
    heroGazeFrame = 0;
    showHeroGaze(getHeroGazeState({ clientX, clientY }));
  });
}

/**
 * Track the first active touch as the gaze target.
 * @param {TouchEvent} event Touch event containing active pointers.
 * @returns {void}
 */
function trackTouchGaze(event) {
  if (!heroEyeSettings) return;

  const touch = event.touches[0];
  if (touch) scheduleHeroGaze(touch.clientX, touch.clientY);
}

/**
 * Cancel pending gaze work and clear the overlay after touch input ends.
 * @returns {void}
 */
function resetHeroGaze() {
  if (heroGazeFrame) cancelAnimationFrame(heroGazeFrame);
  heroGazeFrame = 0;
  window.clearTimeout(heroBlinkTimer);
  heroBlinkTimer = 0;
  requestedHeroGaze = '';

  if (heroGazeTransitionLayer) {
    heroGazeTransitionLayer.getAnimations().forEach(animation => animation.cancel());
    heroGazeTransitionLayer.remove();
    heroGazeTransitionLayer = null;
  }

  heroEyeOverlay.getContext('2d').clearRect(0, 0, heroEyeOverlay.width, heroEyeOverlay.height);
  hasRenderedHeroGaze = false;
}

/**
 * Refresh parallax and blink behavior when page visibility changes.
 * @returns {void}
 */
function handleHeroVisibilityChange() {
  scheduleHeroParallax();
  if (document.hidden) cancelHeroBlink();
  else scheduleHeroBlink();
}

/**
 * Refresh parallax and blink behavior when the motion preference changes.
 * @returns {void}
 */
function handleReducedMotionChange() {
  scheduleHeroParallax();
  if (reducedMotion.matches) cancelHeroBlink();
  else scheduleHeroBlink();
}

/**
 * Update gaze from non-touch pointer movement once settings are loaded.
 * @param {PointerEvent} event Pointer movement event.
 * @returns {void}
 */
function handleHeroPointerMove(event) {
  if (!heroEyeSettings || event.pointerType === 'touch') return;
  scheduleHeroGaze(event.clientX, event.clientY);
}

/**
 * Follow the remaining touch or clear gaze when the final touch ends.
 * @param {TouchEvent} event Touch end event.
 * @returns {void}
 */
function handleHeroTouchEnd(event) {
  if (event.touches.length) trackTouchGaze(event);
  else resetHeroGaze();
}

// Manifest and input setup.

/**
 * Load gaze settings and register pointer and touch handlers.
 * @returns {Promise<void>} Resolves after gaze input is initialized.
 */
async function initializeHeroEyes() {
  if (!heroEyeOverlay || !heroImage) return;

  try {
    const response = await fetch('src/about/eyes/manifest.json');
    if (!response.ok) throw new Error(`Could not load eye manifest (${response.status}).`);
    heroEyeSettings = await response.json();
    if (!heroImage.complete) {
      await new Promise(resolve => heroImage.addEventListener('load', resolve, { once: true }));
    }

    heroEyeOverlay.width = heroImage.naturalWidth;
    heroEyeOverlay.height = heroImage.naturalHeight;
  } catch (error) {
    console.error('Failed to initialize the header eyes:', error);
  }
}

// Event registration.

/**
 * Register hero scrolling, visibility, motion, and pointer handlers.
 * @returns {void}
 */
function registerHeroEventHandlers() {
  window.addEventListener('scroll', scheduleHeroParallax, { passive: true });
  landingStage.addEventListener('scroll', scheduleHeroParallax, { passive: true });
  window.addEventListener('resize', scheduleHeroParallax, { passive: true });
  document.addEventListener('visibilitychange', handleHeroVisibilityChange);
  reducedMotion.addEventListener('change', handleReducedMotionChange);
  window.addEventListener('pointermove', handleHeroPointerMove, { passive: true });
  window.addEventListener('touchstart', trackTouchGaze, { passive: true });
  window.addEventListener('touchmove', trackTouchGaze, { passive: true });
  window.addEventListener('touchend', handleHeroTouchEnd, { passive: true });
  window.addEventListener('touchcancel', resetHeroGaze, { passive: true });
  scheduleHeroParallax();
}

registerHeroEventHandlers();
initializeHeroEyes();
