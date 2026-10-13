import './src/bedo.js';
import {
  artworkBackground,
  prepareViewerColors,
  setViewerColor,
  viewerColors
} from './src/artwork-colors.js';
import { clamp, fitScale, fittedArea } from './src/math-utils.js';

const COMPACT_VIEWPORT_MAX_HEIGHT_PX = 480;
const COMPACT_VIEWPORT_MAX_WIDTH_PX = 300;
const WIDE_VIEWPORT_MAX_WIDTH_PX = 600;
const COMPACT_LAYOUT_MAX_WIDTH_PX = 900;
const LANDSCAPE_ASPECT_RATIO = 1;
const VIEWPORT_EDGE_INSET_RATIO = .014;
const MIN_VIEWER_EDGE_INSET_REM = 1;
const MAX_VIEWER_EDGE_INSET_REM = 1.5;
const MIN_COMPACT_ARTWORK_SIZE_REM = 11.25;
const COMPACT_NAVIGATION_WIDTH_REM = 7;
const REGULAR_NAVIGATION_WIDTH_REM = 8;
const COMPACT_SIDE_RAILS_WIDTH_REM = 16;
const REGULAR_SIDE_RAILS_WIDTH_REM = 28;
const COMPACT_SIDE_GAP_REM = 2;
const MAX_REGULAR_SIDE_GAP_REM = 2;
const REGULAR_SIDE_GAP_VIEWPORT_RATIO = .02;
const VIEWER_EDGE_COUNT = 2;
const MIN_VIEWER_LAYOUT_DIMENSION_PX = 0;
const SIDE_LAYOUT_HEIGHT_INSET_REM = 5.5;
const BOTTOM_LAYOUT_HEIGHT_INSET_REM = 10.25;
const DECIMAL_RADIX = 10;
const PREVIOUS_ARTWORK_OFFSET = -1;
const NEXT_ARTWORK_OFFSET = 1;
const ARTWORK_IMAGE_TAB_INDEX = 0;

/**
 * @typedef {Object} Placard
 * @property {string} title
 * @property {string} subtitle
 * @property {string} year
 */

/**
 * @typedef {Object} ArtworkEntry
 * @property {string} name
 * @property {string} image
 * @property {string} thumbnail
 * @property {string} details
 * @property {Placard} [placard]
 */

/**
 * Find a page element by its ID.
 * @param {string} id Element ID.
 * @returns {HTMLElement|null} The matching element, if present.
 */
const $ = id => document.getElementById(id);

/**
 * Read the selected artwork name from the URL fragment.
 * @returns {string} The decoded fragment, or an empty string if it is invalid.
 */
const current = () => {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return '';
  }
};

// Artwork data and placard metadata.
let works = [];
const artwork = new Map();

/**
 * Parse a detail file's non-empty lines into placard fields.
 * @param {string} text Artwork detail text.
 * @returns {Placard} The title, subtitle, and year for display.
 */
function parsePlacard(text) {
  const [title = '', subtitle = '', year = ''] = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return { title, subtitle, year };
}

/**
 * Load and validate placard details for each artwork entry.
 * @param {ArtworkEntry[]} entries Artwork records to enrich.
 * @returns {Promise<void>} Resolves when all placards are loaded.
 */
async function loadPlacards(entries) {
  await Promise.all(entries.map(async entry => {
    const response = await fetch(entry.details);
    if (!response.ok) {
      throw new Error(`Could not load ${entry.name} details (${response.status}).`);
    }

    entry.placard = parsePlacard(await response.text());
    if (!entry.placard.title) {
      throw new Error(`Artwork title missing from ${entry.details}.`);
    }
  }));
}

// Gallery tiles and artwork labels.

/**
 * Render the gallery links from the loaded artwork records.
 * @returns {void}
 */
function renderGallery() {
  const galleryTiles = works.map(name => {
    const entry = artwork.get(name);
    const link = document.createElement('a');
    const image = document.createElement('img');
    const imageFrame = document.createElement('span');
    const title = document.createElement('span');
    const plainTitle = entry.placard.title.replaceAll('\\n', ' ');

    link.href = `#${encodeURIComponent(name)}`;
    image.src = entry.thumbnail;
    image.alt = plainTitle;
    image.loading = 'lazy';
    image.decoding = 'async';
    imageFrame.className = 'gallery-image-frame';
    imageFrame.append(image);
    title.className = 'gallery-title';
    title.textContent = plainTitle;
    title.setAttribute('aria-hidden', 'true');
    link.append(imageFrame, title);
    return link;
  });

  $('gallery').replaceChildren(...galleryTiles);
}

/**
 * Update the viewer placard with one artwork's metadata.
 * @param {Placard} placard The metadata to display.
 * @returns {void}
 */
function renderPlacard({ title, subtitle, year }) {
  const titleElement = $('title');
  titleElement.textContent = title.replaceAll('\\n', '\n');
  $('subtitle').textContent = subtitle;
  $('year').textContent = year;
}

// Fit the viewer layout to the artwork's aspect ratio and available viewport.

/**
 * Choose the viewer layout and size for the current viewport.
 * @returns {void}
 */
function updateViewerFit() {
  const viewer = $('viewer');
  const image = $('art');
  if (viewer.hidden || !image.naturalWidth || !image.naturalHeight) return;


  if (
    window.innerHeight <= COMPACT_VIEWPORT_MAX_HEIGHT_PX ||
    window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH_PX
  ) {
    viewer.dataset.artLayout = 'compact';
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const edgeInset = clamp(
      window.innerWidth * VIEWPORT_EDGE_INSET_RATIO,
      MIN_VIEWER_EDGE_INSET_REM * rem,
      MAX_VIEWER_EDGE_INSET_REM * rem
    );
    const availableWidth = window.innerWidth - VIEWER_EDGE_COUNT * edgeInset;
    const availableHeight = window.innerHeight - VIEWER_EDGE_COUNT * edgeInset;
    const aspectRatio = image.naturalWidth / image.naturalHeight;
    const scaleToFit = fitScale(
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


  if (window.innerWidth <= WIDE_VIEWPORT_MAX_WIDTH_PX) {
    viewer.dataset.artLayout = 'wide';
    image.style.removeProperty('--compact-art-width');
    image.style.removeProperty('--compact-art-height');
    return;
  }

  image.style.removeProperty('--compact-art-width');
  image.style.removeProperty('--compact-art-height');


  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const aspectRatio = image.naturalWidth / image.naturalHeight;
  const compact = viewportWidth <= COMPACT_LAYOUT_MAX_WIDTH_PX;
  const edgeInset = clamp(
    viewportWidth * VIEWPORT_EDGE_INSET_RATIO,
    MIN_VIEWER_EDGE_INSET_REM * rem,
    MAX_VIEWER_EDGE_INSET_REM * rem
  );
  const navigationWidth = (compact
    ? COMPACT_NAVIGATION_WIDTH_REM
    : REGULAR_NAVIGATION_WIDTH_REM) * rem;
  const sidePadding = VIEWER_EDGE_COUNT * edgeInset;
  const sideRails = (compact
    ? COMPACT_SIDE_RAILS_WIDTH_REM
    : REGULAR_SIDE_RAILS_WIDTH_REM) * rem;
  const sideGaps = compact
    ? COMPACT_SIDE_GAP_REM * rem
    : VIEWER_EDGE_COUNT * clamp(
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
    viewportWidth - navigationWidth - VIEWER_EDGE_COUNT * edgeInset
  );
  const bottomHeight = Math.max(
    MIN_VIEWER_LAYOUT_DIMENSION_PX,
    viewportHeight - BOTTOM_LAYOUT_HEIGHT_INSET_REM * rem
  );


  const sideArea = fittedArea(aspectRatio, sideWidth, sideHeight);
  const bottomArea = fittedArea(aspectRatio, bottomWidth, bottomHeight);

  viewer.dataset.artLayout = viewportWidth <= COMPACT_LAYOUT_MAX_WIDTH_PX && bottomArea > sideArea
    ? 'wide'
    : 'tall';
}

let viewerFitFrame = 0;

/**
 * Schedule a single viewer layout update for the next animation frame.
 * @returns {void}
 */
function scheduleViewerFit() {
  if (viewerFitFrame) return;
  viewerFitFrame = requestAnimationFrame(() => {
    viewerFitFrame = 0;
    updateViewerFit();
  });
}

// Viewer routing and display state.

/**
 * Display the selected artwork and its placard in the viewer.
 * @param {string} name Artwork record key.
 * @returns {void}
 */
function show(name) {
  const selected = artwork.get(name);
  const viewer = $('viewer');
  const image = $('art');
  viewer.classList.remove('image-only');
  $('gallery-header').hidden = true;
  viewer.hidden = false;
  viewer.style.removeProperty('--viewer-color');
  viewer.style.removeProperty('--viewer-bedo-color');
  viewer.style.removeProperty('--viewer-works-color');


  const preparedColor = viewerColors.get(name);
  if (preparedColor) setViewerColor(preparedColor);


  image.onload = () => {
    if (current() !== name) return;
    updateViewerFit();
    if (preparedColor) return;

    try {
      setViewerColor(artworkBackground(image));
    } catch (error) {
      console.error('Failed to select an artwork background:', error);
    }
  };


  image.src = selected.image;
  image.alt = name;
  image.setAttribute('aria-pressed', 'false');
  image.setAttribute('aria-label', `Show ${name} fullscreen`);
  if (image.complete) image.onload();
  renderPlacard(selected.placard);
  $('title').removeAttribute('role');
}

/**
 * Return to the gallery route.
 * @returns {void}
 */
function close() {
  history.pushState(null, '', location.pathname);
  route();
}

/**
 * Move through the artwork list by the requested number of positions.
 * @param {number} offset Direction and distance to move.
 * @returns {void}
 */
function step(offset) {
  const index = works.indexOf(current());
  location.hash = encodeURIComponent(works[(index + offset + works.length) % works.length]);
}

/**
 * Select the gallery or artwork viewer based on the URL fragment.
 * @returns {void}
 */
function route() {
  const selectedName = current();
  if (works.includes(selectedName)) {
    show(selectedName);
    return;
  }

  $('viewer').hidden = true;
  $('viewer').classList.remove('image-only');
  $('gallery-header').hidden = false;
}

/**
 * Toggle the artwork between viewer and image-only modes.
 * @returns {void}
 */
function toggleImageOnly() {
  const viewer = $('viewer');
  const image = $('art');
  const isImageOnly = viewer.classList.toggle('image-only');
  image.setAttribute('aria-pressed', String(isImageOnly));
  image.setAttribute(
    'aria-label',
    `${isImageOnly ? 'Exit' : 'Show'} fullscreen artwork: ${image.alt}`
  );
  if (isImageOnly) image.focus({ preventScroll: true });
}

// Keep keyboard actions named so event wiring stays easy to scan.

/**
 * Toggle image-only mode when the artwork receives an activation key.
 * @param {KeyboardEvent} event Keyboard event from the artwork image.
 * @returns {void}
 */
function handleArtworkKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleImageOnly();
}

/**
 * Handle viewer navigation and dismissal keyboard shortcuts.
 * @param {KeyboardEvent} event Document-level keyboard event.
 * @returns {void}
 */
function handleViewerKeydown(event) {
  const viewer = $('viewer');
  if (viewer.hidden) return;

  if (viewer.classList.contains('image-only')) {
    if (event.key === 'Escape') toggleImageOnly();
    return;
  }

  if (event.key === 'ArrowLeft') step(PREVIOUS_ARTWORK_OFFSET);
  if (event.key === 'ArrowRight') step(NEXT_ARTWORK_OFFSET);
  if (event.key === 'Escape') close();
}

/**
 * Handle links that navigate from the viewer back to the gallery.
 * @param {MouseEvent} event Click event from a home or close link.
 * @returns {void}
 */
function handleHomeNavigation(event) {
  event.preventDefault();
  close();
}

/**
 * Navigate to the previous artwork.
 * @returns {void}
 */
function handlePreviousArtwork() {
  step(PREVIOUS_ARTWORK_OFFSET);
}

/**
 * Navigate to the next artwork.
 * @returns {void}
 */
function handleNextArtwork() {
  step(NEXT_ARTWORK_OFFSET);
}

// Event registration.

/**
 * Register viewer controls and browser-level navigation handlers.
 * @returns {void}
 */
function registerViewerEventHandlers() {
  $('prev').onclick = handlePreviousArtwork;
  $('next').onclick = handleNextArtwork;
  $('art').setAttribute('role', 'button');
  $('art').setAttribute('tabindex', String(ARTWORK_IMAGE_TAB_INDEX));
  $('art').onclick = toggleImageOnly;
  $('art').onkeydown = handleArtworkKeydown;
  $('viewer-home').onclick = handleHomeNavigation;
  $('close').onclick = handleHomeNavigation;
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', scheduleViewerFit, { passive: true });
  document.addEventListener('keydown', handleViewerKeydown);
}

// Load artwork records before rendering the gallery.

/**
 * Fetch artwork data, load placards, and initialize the gallery view.
 * @returns {Promise<void>} Resolves after initial gallery setup.
 */
async function initializeGallery() {
  try {
    const response = await fetch('artworks.json');
    if (!response.ok) {
      throw new Error(`Could not load artwork list (${response.status}).`);
    }


    const entries = await response.json();
    const hasInvalidEntry = !Array.isArray(entries) || entries.some(entry =>
      !entry || typeof entry.name !== 'string' || !entry.name ||
      typeof entry.image !== 'string' || !entry.image ||
      typeof entry.thumbnail !== 'string' || !entry.thumbnail ||
      typeof entry.details !== 'string' || !entry.details
    );
    if (hasInvalidEntry) {
      throw new Error('Invalid artwork list. Expected entries with name, image, thumbnail, and details paths.');
    }


    await loadPlacards(entries);
    entries.forEach(entry => artwork.set(entry.name, entry));
    works = entries
      .map(entry => entry.name)
      .sort((first, second) =>
        Number.parseInt(second, DECIMAL_RADIX) - Number.parseInt(first, DECIMAL_RADIX)
      );


    renderGallery();
    prepareViewerColors(works.map(name => artwork.get(name)), current);
    route();
  } catch (error) {
    console.error('Failed to load the gallery:', error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = 'The gallery could not be loaded. Please try again later.';
    $('gallery').replaceChildren(message);
  }
}

registerViewerEventHandlers();
initializeGallery();
