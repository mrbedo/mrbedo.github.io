const $ = id => document.getElementById(id);
const current = () => {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
};

let works = [];
const artwork = new Map();
const viewerColors = new Map();
const viewerPalette = [
  { hue: 0, color: '#b71c1c' },
  { hue: 335, color: '#880e4f' },
  { hue: 291, color: '#4a148c' },
  { hue: 251, color: '#311b92' },
  { hue: 235, color: '#1a237e' },
  { hue: 212, color: '#0d47a1' },
  { hue: 199, color: '#01579b' },
  { hue: 187, color: '#006064' },
  { hue: 168, color: '#004d40' },
  { hue: 123, color: '#1b5e20' },
  { hue: 88, color: '#33691e' },
  { hue: 60, color: '#33691e' },
  { hue: 30, color: '#3e2723' },
  { hue: 14, color: '#bf360c' }
];

function pixelHue(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (!delta) return 0;
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function complementaryHue(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let hueX = 0;
  let hueY = 0;
  let totalWeight = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    const lightness = (Math.max(red, green, blue) + Math.min(red, green, blue)) / 510;
    if (pixels[i + 3] < 128 || spread < 18 || lightness < .08 || lightness > .92) continue;
    const weight = (spread / 255) * (1 - Math.abs(lightness - .5));
    const radians = pixelHue(red, green, blue) * Math.PI / 180;
    hueX += Math.cos(radians) * weight;
    hueY += Math.sin(radians) * weight;
    totalWeight += weight;
  }

  if (!totalWeight) return null;
  const dominantHue = (Math.atan2(hueY, hueX) * 180 / Math.PI + 360) % 360;
  return (dominantHue + 180) % 360;
}

function hueDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}

function assignViewerColors(targetHues) {
  const assigned = [];
  targetHues.forEach((targetHue, index) => {
    const previous = assigned.at(-1);
    const first = assigned[0];
    const isLast = index === targetHues.length - 1;
    const candidates = viewerPalette.filter(candidate =>
      (!previous || (
        candidate.color !== previous.color &&
        hueDistance(candidate.hue, previous.hue) >= 60
      )) &&
      (!isLast || !first || (
        candidate.color !== first.color &&
        hueDistance(candidate.hue, first.hue) >= 60
      ))
    );
    const available = candidates.length ? candidates : viewerPalette;
    assigned.push(available.reduce((closest, candidate) => {
      const distance = targetHue === null ? 0 : hueDistance(candidate.hue, targetHue);
      return distance < closest.distance ? { ...candidate, distance } : closest;
    }, { ...available[0], distance: Infinity }));
  });
  return assigned.map(entry => entry.color);
}

function thumbnailHue(entry) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(complementaryHue(image));
      } catch (error) {
        console.error(`Failed to analyze ${entry.name} thumbnail colors:`, error);
        resolve(null);
      }
    };
    image.onerror = () => {
      console.error(`Failed to load ${entry.name} thumbnail for color analysis.`);
      resolve(null);
    };
    image.src = entry.thumbnail;
  });
}

async function prepareViewerColors(entries) {
  const targetHues = await Promise.all(entries.map(thumbnailHue));
  const colors = assignViewerColors(targetHues);
  entries.forEach((entry, index) => viewerColors.set(entry.name, colors[index]));
  const selectedColor = viewerColors.get(current());
  if (selectedColor) $('viewer').style.setProperty('--viewer-color', selectedColor);
}

// Markdown layout: "# Title", then dimensions line, then description paragraphs.
function parsePlacard(md) {
  const lines = md.split(/\r?\n/).map(line =>
    line.replace(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+\s*)?$/, '$1')
  );
  const nextLine = () => {
    while (lines.length && !lines[0].trim()) lines.shift();
    return (lines.shift() || '').trim();
  };
  const title = nextLine();
  const dimensions = nextLine();
  const description = lines.join('\n').trim().split(/\n\s*\n/).filter(Boolean);
  return { title, dimensions, description };
}

function renderGallery() {
  $('gallery').replaceChildren(...works.map(name => {
    const entry = artwork.get(name);
    const link = document.createElement('a');
    const img = document.createElement('img');
    const title = document.createElement('span');
    link.href = '#' + encodeURIComponent(name);
    img.src = entry.thumbnail;
    img.alt = entry.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    title.className = 'gallery-title';
    title.textContent = entry.title;
    title.setAttribute('aria-hidden', 'true');
    link.append(img, title);
    return link;
  }));
}

function renderPlacard({ title, dimensions, description }) {
  $('title').textContent = title;
  $('dimensions').textContent = dimensions;
  $('description').replaceChildren(...description.map(text => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }));
}

async function show(name) {
  const selected = artwork.get(name);
  const viewer = $('viewer');
  const image = $('art');
  viewer.hidden = false;
  viewer.style.removeProperty('--viewer-color');
  image.onload = () => {
    if (current() !== name) return;
    const preparedColor = viewerColors.get(name);
    if (preparedColor) {
      viewer.style.setProperty('--viewer-color', preparedColor);
      return;
    }
    try {
      const targetHue = complementaryHue(image);
      const color = targetHue === null
        ? '#263238'
        : viewerPalette.reduce((closest, candidate) =>
          hueDistance(candidate.hue, targetHue) < hueDistance(closest.hue, targetHue)
            ? candidate
            : closest
        ).color;
      viewer.style.setProperty('--viewer-color', color);
    } catch (error) {
      console.error('Failed to select a complementary artwork background:', error);
    }
  };
  image.src = selected.image;
  image.alt = name;
  renderPlacard({ title: 'Loading artwork details...', dimensions: '', description: [] });
  $('description').removeAttribute('role');
  try {
    const res = await fetch(selected.details);
    if (!res.ok) throw new Error(`Could not load ${name} details (${res.status}).`);
    const md = await res.text();
    if (current() === name) renderPlacard(parsePlacard(md));
  } catch (error) {
    console.error('Failed to load artwork details:', error);
    if (current() !== name) return;
    renderPlacard({
      title: name,
      dimensions: '',
      description: ['Artwork details could not be loaded. Please close and reopen the artwork to try again.']
    });
    $('description').setAttribute('role', 'alert');
  }
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
  else $('viewer').hidden = true;
}

$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('close').onclick = e => { e.preventDefault(); close(); };
window.addEventListener('hashchange', route);
document.addEventListener('keydown', e => {
  if ($('viewer').hidden) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'Escape') close();
});

fetch('artworks.json')
  .then(res => {
    if (!res.ok) throw new Error(`Could not load artwork list (${res.status}).`);
    return res.json();
  })
  .then(entries => {
    if (!Array.isArray(entries) || entries.some(entry =>
      !entry || typeof entry.name !== 'string' || !entry.name ||
      typeof entry.title !== 'string' || !entry.title ||
      typeof entry.image !== 'string' || !entry.image ||
      typeof entry.thumbnail !== 'string' || !entry.thumbnail ||
      typeof entry.details !== 'string' || !entry.details
    )) throw new Error('Invalid artwork list. Expected entries with name, title, image, thumbnail, and details paths.');
    entries.forEach(entry => artwork.set(entry.name, entry));
    works = entries.map(entry => entry.name).sort();
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
