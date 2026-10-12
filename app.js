const $ = id => document.getElementById(id);
const current = () => {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
};

const heroImage = document.querySelector('.hero-image');
const heroHeader = $('gallery-header');
const landingStage = $('landing-stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let heroParallaxFrame = 0;
let renderedHeroShiftX = Number.NaN;
let renderedHeroShiftY = Number.NaN;
let renderedHeroScale = Number.NaN;

function updateHeroParallax() {
  heroParallaxFrame = 0;
  if (!heroImage || document.hidden) return;
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  const maxPageScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const effectRange = landscape
    ? Math.max(landingStage.scrollHeight - landingStage.clientHeight, 1)
    : Math.min(heroHeader.offsetHeight, maxPageScroll);
  const scrollTop = landscape ? landingStage.scrollTop : window.scrollY;
  const progress = reducedMotion.matches
    ? 0
    : Math.min(scrollTop / effectRange, 1);
  const shiftX = landscape
    ? -window.innerWidth * .2 * progress
    : -Math.min(window.innerWidth * .15, 220) * progress;
  const shiftY = landscape
    ? -Math.min(window.innerHeight * .04, 56) * progress
    : Math.min(window.innerHeight * .18, 180) * progress;
  const scale = landscape ? 1 + .2 * progress : 1;
  if (shiftX !== renderedHeroShiftX) {
    heroImage.style.setProperty('--hero-shift-x', `${shiftX}px`);
    renderedHeroShiftX = shiftX;
  }
  if (shiftY !== renderedHeroShiftY) {
    heroImage.style.setProperty('--hero-shift-y', `${shiftY}px`);
    renderedHeroShiftY = shiftY;
  }
  if (scale !== renderedHeroScale) {
    heroImage.style.setProperty('--hero-scale', scale);
    renderedHeroScale = scale;
  }
}

function scheduleHeroParallax() {
  if (!heroParallaxFrame) heroParallaxFrame = requestAnimationFrame(updateHeroParallax);
}

window.addEventListener('scroll', scheduleHeroParallax, { passive: true });
landingStage.addEventListener('scroll', scheduleHeroParallax, { passive: true });
window.addEventListener('resize', scheduleHeroParallax, { passive: true });
document.addEventListener('visibilitychange', scheduleHeroParallax);
reducedMotion.addEventListener('change', scheduleHeroParallax);
scheduleHeroParallax();

let works = [];
const artwork = new Map();
const viewerColors = new Map();
const materialBackgrounds = [
  '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c',
  '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f',
  '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c',
  '#673ab7', '#5e35b1', '#512da8', '#4527a0', '#311b92',
  '#3f51b5', '#3949ab', '#303f9f', '#283593', '#1a237e',
  '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1',
  '#03a9f4', '#039be5', '#0288d1', '#0277bd', '#01579b',
  '#00bcd4', '#00acc1', '#0097a7', '#00838f', '#006064',
  '#009688', '#00897b', '#00796b', '#00695c', '#004d40',
  '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20',
  '#8bc34a', '#7cb342', '#689f38', '#558b2f', '#33691e',
  '#cddc39', '#c0ca33', '#afb42b', '#9e9d24', '#827717',
  '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17',
  '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#ff6f00',
  '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100',
  '#ff5722', '#f4511e', '#e64a19', '#d84315', '#bf360c',
  '#795548', '#6d4c41', '#5d4037', '#4e342e', '#3e2723',
  '#9e9e9e', '#757575', '#616161', '#424242', '#212121',
  '#607d8b', '#546e7a', '#455a64', '#37474f', '#263238'
];

function colorLuminance(hexColor) {
  const channels = hexColor.match(/[a-f\d]{2}/gi).map(channel => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function setViewerColor(color) {
  const viewer = $('viewer');
  const materialColor = materialBackgrounds.includes(color.toLowerCase()) ? color.toLowerCase() : '#263238';
  const useDarkAccents = colorLuminance(materialColor) > .25;
  viewer.style.setProperty('--viewer-color', materialColor);
  viewer.style.setProperty('--viewer-bedo-color', useDarkAccents ? '#01579b' : '#81d4fa');
  viewer.style.setProperty('--viewer-works-color', useDarkAccents ? '#b71c1c' : '#ff8a80');
}

function rgbToHsl(red, green, blue) {
  red /= 255;
  green /= 255;
  blue /= 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (!delta) return { hue: 0, saturation: 0, lightness };
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return {
    hue: (hue * 60 + 360) % 360,
    saturation: delta / (1 - Math.abs(2 * lightness - 1)),
    lightness
  };
}

function hslToHex(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const second = chroma * (1 - Math.abs(section % 2 - 1));
  const [red, green, blue] = section < 1 ? [chroma, second, 0]
    : section < 2 ? [second, chroma, 0]
      : section < 3 ? [0, chroma, second]
        : section < 4 ? [0, second, chroma]
          : section < 5 ? [second, 0, chroma]
            : [chroma, 0, second];
  const match = lightness - chroma / 2;
  return '#' + [red, green, blue]
    .map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('');
}

function colorToOklab(hexColor) {
  const [red, green, blue] = hexColor.match(/[a-f\d]{2}/gi).map(channel => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const long = Math.cbrt(.4122214708 * red + .5363325363 * green + .0514459929 * blue);
  const medium = Math.cbrt(.2119034982 * red + .6806995451 * green + .1073969566 * blue);
  const short = Math.cbrt(.0883024619 * red + .2817188376 * green + .6299787005 * blue);
  return [
    .2104542553 * long + .793617785 * medium - .0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + .4505937099 * short,
    .0259040371 * long + .7827717662 * medium - .808675766 * short
  ];
}

function nearestMaterialBackground(targetColor) {
  const target = colorToOklab(targetColor);
  return materialBackgrounds.reduce((nearest, color) => {
    const candidate = colorToOklab(color);
    const distance = candidate.reduce((sum, channel, index) =>
      sum + (channel - target[index]) ** 2
    , 0);
    return distance < nearest.distance ? { color, distance } : nearest;
  }, { color: '#263238', distance: Infinity }).color;
}

function artworkBackground(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const clusters = new Map();

  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const hsl = rgbToHsl(red, green, blue);
    if (
      pixels[i + 3] < 128 ||
      hsl.lightness < .04 ||
      (hsl.lightness > .94 && hsl.saturation < .12)
    ) continue;
    const hueBand = hsl.saturation < .08 ? 0 : Math.floor(hsl.hue / 20) + 1;
    const key = `${hueBand}:${Math.floor(hsl.saturation * 4)}:${Math.floor(hsl.lightness * 5)}`;
    const cluster = clusters.get(key) || { red: 0, green: 0, blue: 0, count: 0, significance: 0 };
    cluster.red += red;
    cluster.green += green;
    cluster.blue += blue;
    cluster.count++;
    cluster.significance += .65 + hsl.saturation * .7;
    clusters.set(key, cluster);
  }

  const selected = [...clusters.values()].reduce((best, cluster) =>
    !best || cluster.significance > best.significance ? cluster : best
  , null);
  if (!selected) return '#263238';
  const source = rgbToHsl(
    selected.red / selected.count,
    selected.green / selected.count,
    selected.blue / selected.count
  );
  const saturation = Math.min(.8, Math.max(.2, source.saturation * .85));
  const lightness = Math.min(.48, Math.max(.3, .24 + source.lightness * .35));
  return nearestMaterialBackground(hslToHex(source.hue, saturation, lightness));
}

function thumbnailBackground(entry) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(artworkBackground(image));
      } catch (error) {
        console.error(`Failed to analyze ${entry.name} thumbnail colors:`, error);
        resolve('#263238');
      }
    };
    image.onerror = () => {
      console.error(`Failed to load ${entry.name} thumbnail for color analysis.`);
      resolve('#263238');
    };
    image.src = entry.thumbnail;
  });
}

async function prepareViewerColors(entries) {
  const colors = await Promise.all(entries.map(thumbnailBackground));
  entries.forEach((entry, index) => {
    viewerColors.set(entry.name, colors[index]);
  });
  const selectedColor = viewerColors.get(current());
  if (selectedColor) setViewerColor(selectedColor);
}

function parsePlacard(text) {
  const [title = '', subtitle = '', year = ''] = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return { title, subtitle, year };
}

async function loadPlacards(entries) {
  await Promise.all(entries.map(async entry => {
    const res = await fetch(entry.details);
    if (!res.ok) throw new Error(`Could not load ${entry.name} details (${res.status}).`);
    entry.placard = parsePlacard(await res.text());
    if (!entry.placard.title) throw new Error(`Artwork title missing from ${entry.details}.`);
  }));
}

function renderGallery() {
  const galleryTiles = works.map(name => {
    const entry = artwork.get(name);
    const link = document.createElement('a');
    const img = document.createElement('img');
    const imageFrame = document.createElement('span');
    const title = document.createElement('span');
    link.href = '#' + encodeURIComponent(name);
    img.src = entry.thumbnail;
    img.alt = entry.placard.title.replaceAll('\\n', ' ');
    img.loading = 'lazy';
    img.decoding = 'async';
    imageFrame.className = 'gallery-image-frame';
    imageFrame.append(img);
    title.className = 'gallery-title';
    title.textContent = entry.placard.title.replaceAll('\\n', ' ');
    title.setAttribute('aria-hidden', 'true');
    link.append(imageFrame, title);
    return link;
  });
  $('gallery').replaceChildren(...galleryTiles);
}

function renderPlacard({ title, subtitle, year }) {
  const titleElement = $('title');
  titleElement.textContent = title.replaceAll('\\n', '\n');
  titleElement.classList.toggle('wrapped', title.includes('\\n'));
  $('subtitle').textContent = subtitle;
  $('year').textContent = year;
}

function fittedArtworkArea(aspectRatio, availableWidth, availableHeight) {
  const width = Math.min(availableWidth, availableHeight * aspectRatio);
  return width * width / aspectRatio;
}

function updateViewerFit() {
  const viewer = $('viewer');
  const image = $('art');
  if (viewer.hidden || !image.naturalWidth || !image.naturalHeight) return;
  if (window.innerHeight <= 480 || window.innerWidth <= 300) {
    viewer.dataset.artLayout = 'compact';
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const edgeInset = Math.min(1.5 * rem, Math.max(rem, window.innerWidth * .014));
    const availableWidth = window.innerWidth - 2 * edgeInset;
    const availableHeight = window.innerHeight - 2 * edgeInset;
    const aspectRatio = image.naturalWidth / image.naturalHeight;
    const fitScale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight);
    const minimumScale = (11.25 * rem) / (aspectRatio >= 1 ? image.naturalHeight : image.naturalWidth);
    const scale = Math.min(Math.max(fitScale, minimumScale), availableHeight / image.naturalHeight);
    image.style.setProperty('--compact-art-width', `${image.naturalWidth * scale}px`);
    image.style.setProperty('--compact-art-height', `${image.naturalHeight * scale}px`);
    return;
  }
  if (window.innerWidth <= 600) {
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
  const compact = viewportWidth <= 900;
  const edgeInset = Math.min(1.5 * rem, Math.max(rem, viewportWidth * .014));
  const navigationWidth = (compact ? 7 : 8) * rem;
  const sidePadding = 2 * edgeInset;
  const sideRails = (compact ? 16 : 28) * rem;
  const sideGaps = compact ? 2 * rem : 2 * Math.min(2 * rem, Math.max(rem, viewportWidth * .02));
  const sideWidth = Math.max(0, viewportWidth - navigationWidth - sidePadding - sideRails - sideGaps);
  const sideHeight = Math.max(0, viewportHeight - 5.5 * rem);
  const bottomWidth = Math.max(0, viewportWidth - navigationWidth - 2 * edgeInset);
  const bottomHeight = Math.max(0, viewportHeight - 10.25 * rem);
  const sideArea = fittedArtworkArea(aspectRatio, sideWidth, sideHeight);
  const bottomArea = fittedArtworkArea(aspectRatio, bottomWidth, bottomHeight);
  viewer.dataset.artLayout = viewportWidth <= 900 && bottomArea > sideArea ? 'wide' : 'tall';
}

let viewerFitFrame = 0;
function scheduleViewerFit() {
  if (viewerFitFrame) return;
  viewerFitFrame = requestAnimationFrame(() => {
    viewerFitFrame = 0;
    updateViewerFit();
  });
}

async function show(name) {
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

function close() {
  history.pushState(null, '', location.pathname);
  route();
}

function step(offset) {
  const i = works.indexOf(current());
  location.hash = encodeURIComponent(works[(i + offset + works.length) % works.length]);
}

function route() {
  if (works.includes(current())) show(current());
  else {
    $('viewer').hidden = true;
    $('viewer').classList.remove('image-only');
    $('gallery-header').hidden = false;
  }
}

function toggleImageOnly() {
  const viewer = $('viewer');
  const image = $('art');
  const isImageOnly = viewer.classList.toggle('image-only');
  image.setAttribute('aria-pressed', String(isImageOnly));
  image.setAttribute('aria-label', `${isImageOnly ? 'Exit' : 'Show'} fullscreen artwork: ${image.alt}`);
  if (isImageOnly) image.focus({ preventScroll: true });
}

$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('art').setAttribute('role', 'button');
$('art').setAttribute('tabindex', '0');
$('art').onclick = toggleImageOnly;
$('art').onkeydown = event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleImageOnly();
};
$('viewer-home').onclick = e => { e.preventDefault(); close(); };
$('close').onclick = e => { e.preventDefault(); close(); };
window.addEventListener('hashchange', route);
window.addEventListener('resize', scheduleViewerFit, { passive: true });
document.addEventListener('keydown', e => {
  if ($('viewer').hidden) return;
  if ($('viewer').classList.contains('image-only')) {
    if (e.key === 'Escape') toggleImageOnly();
    return;
  }
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'Escape') close();
});

fetch('artworks.json')
  .then(res => {
    if (!res.ok) throw new Error(`Could not load artwork list (${res.status}).`);
    return res.json();
  })
  .then(async entries => {
    if (!Array.isArray(entries) || entries.some(entry =>
      !entry || typeof entry.name !== 'string' || !entry.name ||
      typeof entry.image !== 'string' || !entry.image ||
      typeof entry.thumbnail !== 'string' || !entry.thumbnail ||
      typeof entry.details !== 'string' || !entry.details
    )) throw new Error('Invalid artwork list. Expected entries with name, image, thumbnail, and details paths.');
    await loadPlacards(entries);
    entries.forEach(entry => artwork.set(entry.name, entry));
    works = entries
      .map(entry => entry.name)
      .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
    renderGallery();
    prepareViewerColors(works.map(name => artwork.get(name)));
    route();
  })
  .catch(error => {
    console.error('Failed to load the gallery:', error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = 'The gallery could not be loaded. Please try again later.';
    $('gallery').replaceChildren(message);
  });
