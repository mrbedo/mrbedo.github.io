const $ = id => document.getElementById(id);
const file = (name, ext) => `src/${encodeURIComponent(name)}.${ext}`;
const current = () => decodeURIComponent(location.hash.slice(1));

let works = [];

// Markdown layout: "# Title", then dimensions line, then description paragraphs.
function parsePlacard(md) {
  const lines = md.split(/\r?\n/);
  const nextLine = () => {
    while (lines.length && !lines[0].trim()) lines.shift();
    return (lines.shift() || '').trim();
  };
  const title = nextLine().replace(/^#+\s*/, '');
  const dimensions = nextLine();
  const description = lines.join('\n').trim().split(/\n\s*\n/).filter(Boolean);
  return { title, dimensions, description };
}

function renderGallery() {
  $('gallery').replaceChildren(...works.map(name => {
    const link = document.createElement('a');
    const img = document.createElement('img');
    link.href = '#' + encodeURIComponent(name);
    img.src = file(name, 'png');
    img.alt = name;
    img.loading = 'lazy';
    link.append(img);
    return link;
  }));
}

async function show(name) {
  $('viewer').hidden = false;
  $('art').src = file(name, 'png');
  $('art').alt = name;
  const res = await fetch(file(name, 'md'));
  const placard = parsePlacard(res.ok ? await res.text() : name);
  if (current() !== name) return;
  $('title').textContent = placard.title;
  $('dimensions').textContent = placard.dimensions;
  $('description').replaceChildren(...placard.description.map(text => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }));
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
  .then(res => res.json())
  .then(names => {
    works = names.sort();
    renderGallery();
    route();
  });
