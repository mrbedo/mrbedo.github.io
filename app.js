const $ = id => document.getElementById(id);
const file = (name, ext) => `src/${encodeURIComponent(name)}.${ext}`;
const current = () => {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
};

let works = [];
const images = new Map();

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
    const link = document.createElement('a');
    const img = document.createElement('img');
    link.href = '#' + encodeURIComponent(name);
    img.src = images.get(name);
    img.alt = name;
    img.loading = 'lazy';
    link.append(img);
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
  $('viewer').hidden = false;
  $('art').src = images.get(name);
  $('art').alt = name;
  renderPlacard({ title: 'Loading artwork details...', dimensions: '', description: [] });
  $('description').removeAttribute('role');
  try {
    const res = await fetch(file(name, 'md'));
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
      typeof entry.image !== 'string' || !entry.image
    )) throw new Error('Invalid artwork list. Build the site with Jekyll before serving it.');
    entries.forEach(({ name, image }) => images.set(name, image));
    works = entries.map(entry => entry.name).sort();
    renderGallery();
    route();
  })
  .catch(error => {
    console.error('Failed to load the gallery:', error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = 'The gallery could not be loaded. Please try again later.';
    $('gallery').replaceChildren(message);
  });
