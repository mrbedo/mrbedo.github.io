import { clamp } from './math-utils.js';

const MIN_SCROLL_RANGE_PX = 1;
const MIN_PARALLAX_PROGRESS = 0;
const MAX_PARALLAX_PROGRESS = 1;
const BASE_bedo_SCALE = 1;
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

// bedo parallax and interactive eye gaze.
const bedoImage = document.querySelector('.bedo-image');
const bedoEyeOverlay = document.querySelector('.bedo-eye-overlay');
const bedoMedia = [bedoImage, bedoEyeOverlay].filter(Boolean);
const bedoHeader = $('gallery-header');
const landingStage = $('landing-stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const bedoGazeImages = new Map();
const bedoGazeDirections = new Map([
  ['-1,-1', 'up-left'], ['0,-1', 'up'], ['1,-1', 'up-right'],
  ['-1,0', 'left'], ['0,0', 'center'], ['1,0', 'right'],
  ['-1,1', 'down-left'], ['0,1', 'down'], ['1,1', 'down-right']
]);

let bedoParallaxFrame = 0;
let renderedbedoShiftX = Number.NaN;
let renderedbedoShiftY = Number.NaN;
let renderedbedoScale = Number.NaN;
let bedoEyeSettings;
let requestedbedoGaze = '';
let currentbedoGazeState = 'center';
let bedoGazeFrame = 0;
let bedoBlinkTimer = 0;
let hasRenderedbedoGaze = false;
let bedoGazeTransitionLayer;

// Parallax updates are coalesced so scroll and resize events stay inexpensive.

/**
 * Apply scroll-based movement to the bedo image and eye overlay.
 * @returns {void}
 */
function updatebedoParallax() {
  bedoParallaxFrame = 0;
  if (!bedoImage || document.hidden) return;

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
    : Math.min(bedoHeader.offsetHeight, maxPageScroll);
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
    ? BASE_bedo_SCALE + LANDSCAPE_PARALLAX_SCALE_RATIO * progress
    : BASE_bedo_SCALE;


  if (shiftX !== renderedbedoShiftX) {
    bedoMedia.forEach(media => media.style.setProperty('--bedo-shift-x', `${shiftX}px`));
    renderedbedoShiftX = shiftX;
  }
  if (shiftY !== renderedbedoShiftY) {
    bedoMedia.forEach(media => media.style.setProperty('--bedo-shift-y', `${shiftY}px`));
    renderedbedoShiftY = shiftY;
  }
  if (scale !== renderedbedoScale) {
    bedoMedia.forEach(media => media.style.setProperty('--bedo-scale', scale));
    renderedbedoScale = scale;
  }
}

/**
 * Schedule one bedo parallax update on the next animation frame.
 * @returns {void}
 */
function schedulebedoParallax() {
  if (!bedoParallaxFrame) {
    bedoParallaxFrame = requestAnimationFrame(updatebedoParallax);
  }
}

// Eye sprite loading and transitions.

/**
 * Load and cache an eye-gaze sprite.
 * @param {string} fileName Sprite filename from the gaze manifest.
 * @returns {Promise<HTMLImageElement>} The loaded sprite image.
 */
function loadbedoGazeImage(fileName) {
  if (!bedoGazeImages.has(fileName)) {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load eye gaze image: ${fileName}`));
    });
    image.src = `src/about/eyes/${fileName}`;
    bedoGazeImages.set(fileName, loaded);
  }

  return bedoGazeImages.get(fileName);
}

/**
 * Draw a gaze sprite into the eye overlay, fading from the previous gaze.
 * @param {HTMLImageElement} image Loaded eye-gaze sprite.
 * @returns {void}
 */
function drawbedoGaze(image) {
  const context = bedoEyeOverlay.getContext('2d');
  const { crop } = bedoEyeSettings;

  if (bedoGazeTransitionLayer) {
    bedoGazeTransitionLayer.getAnimations().forEach(animation => animation.cancel());
    bedoGazeTransitionLayer.remove();
    bedoGazeTransitionLayer = null;
  }

  if (hasRenderedbedoGaze && !reducedMotion.matches) {
    const transitionLayer = bedoEyeOverlay.cloneNode();
    transitionLayer.classList.add('bedo-eye-transition');
    transitionLayer.getContext('2d').drawImage(bedoEyeOverlay, 0, 0);
    bedoHeader.append(transitionLayer);
    bedoGazeTransitionLayer = transitionLayer;

    const animation = transitionLayer.animate([
      { opacity: 1, filter: 'blur(0px)' },
      { opacity: 0, filter: `blur(${GAZE_TRANSITION_BLUR_PX}px)` }
    ], { duration: GAZE_TRANSITION_DURATION_MS, easing: 'ease-out' });
    animation.onfinish = () => {
      transitionLayer.remove();
      if (bedoGazeTransitionLayer === transitionLayer) bedoGazeTransitionLayer = null;
    };
  }

  context.clearRect(0, 0, bedoEyeOverlay.width, bedoEyeOverlay.height);
  context.drawImage(image, 0, 0, crop.width, crop.height, crop.x, crop.y, crop.width, crop.height);
  hasRenderedbedoGaze = true;
}

/**
 * Load and display the requested gaze state.
 * @param {string} stateName Name of a state in the eye manifest.
 * @returns {Promise<void>} Resolves after the sprite is drawn or its load fails.
 */
async function showbedoGaze(stateName) {
  const isBlink = stateName === 'blink';
  const fileName = bedoEyeSettings.states[stateName];
  if (!fileName || requestedbedoGaze === fileName) return;

  if (!isBlink) {
    currentbedoGazeState = stateName;
    window.clearTimeout(bedoBlinkTimer);
  }
  requestedbedoGaze = fileName;

  try {
    const image = await loadbedoGazeImage(fileName);
    if (requestedbedoGaze !== fileName) return;
    drawbedoGaze(image);
    if (!isBlink) schedulebedoBlink();
  } catch (error) {
    console.error('Failed to load the header eye gaze:', error);
  }
}

/**
 * Schedule a natural blink and restore the gaze afterward.
 * @returns {void}
 */
function schedulebedoBlink() {
  window.clearTimeout(bedoBlinkTimer);
  if (!hasRenderedbedoGaze || document.hidden || reducedMotion.matches) return;

  bedoBlinkTimer = window.setTimeout(async () => {
    const gazeState = currentbedoGazeState;
    await showbedoGaze('blink');

    if (requestedbedoGaze !== bedoEyeSettings.states.blink) {
      schedulebedoBlink();
      return;
    }

    bedoBlinkTimer = window.setTimeout(() => {
      if (requestedbedoGaze === bedoEyeSettings.states.blink) {
        showbedoGaze(gazeState);
      }
    }, BLINK_HOLD_DURATION_MS);
  }, MIN_BLINK_INTERVAL_MS + Math.random() * BLINK_INTERVAL_VARIANCE_MS);
}

/**
 * Cancel the pending blink and restore the current gaze if needed.
 * @returns {void}
 */
function cancelbedoBlink() {
  window.clearTimeout(bedoBlinkTimer);
  bedoBlinkTimer = 0;
  if (requestedbedoGaze === bedoEyeSettings?.states.blink) {
    showbedoGaze(currentbedoGazeState);
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
function getbedoGazeState(event) {
  const imageStyle = getComputedStyle(bedoImage);
  const imageRect = bedoImage.getBoundingClientRect();
  const imageScale = Math.max(
    imageRect.width / bedoImage.naturalWidth,
    imageRect.height / bedoImage.naturalHeight
  );


  const [positionX, positionY] = imageStyle.objectPosition.split(' ');
  const cropOffsetX = getObjectPositionOffset(
    positionX,
    imageRect.width - bedoImage.naturalWidth * imageScale
  );
  const cropOffsetY = getObjectPositionOffset(
    positionY,
    imageRect.height - bedoImage.naturalHeight * imageScale
  );


  const eyesCenter = bedoEyeSettings.eyes.reduce((center, eye) => ({
    x: center.x + eye.x / bedoEyeSettings.eyes.length,
    y: center.y + eye.y / bedoEyeSettings.eyes.length
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
  return bedoGazeDirections.get(`${column},${row}`);
}

/**
 * Coalesce pointer updates and display the nearest gaze state.
 * @param {number} clientX Horizontal viewport coordinate.
 * @param {number} clientY Vertical viewport coordinate.
 * @returns {void}
 */
function schedulebedoGaze(clientX, clientY) {
  if (bedoGazeFrame) return;
  bedoGazeFrame = requestAnimationFrame(() => {
    bedoGazeFrame = 0;
    showbedoGaze(getbedoGazeState({ clientX, clientY }));
  });
}

/**
 * Track the first active touch as the gaze target.
 * @param {TouchEvent} event Touch event containing active pointers.
 * @returns {void}
 */
function trackTouchGaze(event) {
  if (!bedoEyeSettings) return;

  const touch = event.touches[0];
  if (touch) schedulebedoGaze(touch.clientX, touch.clientY);
}

/**
 * Cancel pending gaze work and clear the overlay after touch input ends.
 * @returns {void}
 */
function resetbedoGaze() {
  if (bedoGazeFrame) cancelAnimationFrame(bedoGazeFrame);
  bedoGazeFrame = 0;
  window.clearTimeout(bedoBlinkTimer);
  bedoBlinkTimer = 0;
  requestedbedoGaze = '';

  if (bedoGazeTransitionLayer) {
    bedoGazeTransitionLayer.getAnimations().forEach(animation => animation.cancel());
    bedoGazeTransitionLayer.remove();
    bedoGazeTransitionLayer = null;
  }

  bedoEyeOverlay.getContext('2d').clearRect(0, 0, bedoEyeOverlay.width, bedoEyeOverlay.height);
  hasRenderedbedoGaze = false;
}

/**
 * Refresh parallax and blink behavior when page visibility changes.
 * @returns {void}
 */
function handlebedoVisibilityChange() {
  schedulebedoParallax();
  if (document.hidden) cancelbedoBlink();
  else schedulebedoBlink();
}

/**
 * Refresh parallax and blink behavior when the motion preference changes.
 * @returns {void}
 */
function handleReducedMotionChange() {
  schedulebedoParallax();
  if (reducedMotion.matches) cancelbedoBlink();
  else schedulebedoBlink();
}

/**
 * Update gaze from non-touch pointer movement once settings are loaded.
 * @param {PointerEvent} event Pointer movement event.
 * @returns {void}
 */
function handlebedoPointerMove(event) {
  if (!bedoEyeSettings || event.pointerType === 'touch') return;
  schedulebedoGaze(event.clientX, event.clientY);
}

/**
 * Follow the remaining touch or clear gaze when the final touch ends.
 * @param {TouchEvent} event Touch end event.
 * @returns {void}
 */
function handlebedoTouchEnd(event) {
  if (event.touches.length) trackTouchGaze(event);
  else resetbedoGaze();
}

// Manifest and input setup.

/**
 * Load gaze settings and register pointer and touch handlers.
 * @returns {Promise<void>} Resolves after gaze input is initialized.
 */
async function initializebedoEyes() {
  if (!bedoEyeOverlay || !bedoImage) return;

  try {
    const response = await fetch('src/about/eyes/manifest.json');
    if (!response.ok) throw new Error(`Could not load eye manifest (${response.status}).`);
    bedoEyeSettings = await response.json();
    if (!bedoImage.complete) {
      await new Promise(resolve => bedoImage.addEventListener('load', resolve, { once: true }));
    }

    bedoEyeOverlay.width = bedoImage.naturalWidth;
    bedoEyeOverlay.height = bedoImage.naturalHeight;
  } catch (error) {
    console.error('Failed to initialize the header eyes:', error);
  }
}

// Event registration.

/**
 * Register bedo scrolling, visibility, motion, and pointer handlers.
 * @returns {void}
 */
function registerbedoEventHandlers() {
  window.addEventListener('scroll', schedulebedoParallax, { passive: true });
  landingStage.addEventListener('scroll', schedulebedoParallax, { passive: true });
  window.addEventListener('resize', schedulebedoParallax, { passive: true });
  document.addEventListener('visibilitychange', handlebedoVisibilityChange);
  reducedMotion.addEventListener('change', handleReducedMotionChange);
  window.addEventListener('pointermove', handlebedoPointerMove, { passive: true });
  window.addEventListener('touchstart', trackTouchGaze, { passive: true });
  window.addEventListener('touchmove', trackTouchGaze, { passive: true });
  window.addEventListener('touchend', handlebedoTouchEnd, { passive: true });
  window.addEventListener('touchcancel', resetbedoGaze, { passive: true });
  schedulebedoParallax();
}

registerbedoEventHandlers();
initializebedoEyes();
