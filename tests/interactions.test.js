import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ArtworkCatalog } from '../src/artwork-catalog.ts';
import { BlinkBehavior, ManualBlinkController } from '../src/interaction-behavior.ts';
import { GalleryViewModel } from '../src/view-models/gallery-view-model.ts';

class TestTarget {
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ target: this, ...event });
    }
  }
}

function createFakeClock() {
  let time = 0;
  let nextTimer = 0;
  const timers = new Map();

  return {
    now: () => time,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, dueAt: time + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(duration) {
      const end = time + duration;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= end)
          .sort((first, second) => first[1].dueAt - second[1].dueAt)[0];
        if (!next) break;
        time = next[1].dueAt;
        timers.delete(next[0]);
        next[1].callback();
      }
      time = end;
    }
  };
}

function createGalleryInteractions({ landscape = true, reducedMotion = false } = {}) {
  const document = new TestTarget();
  const gallery = new TestTarget();
  const closeButton = new TestTarget();
  closeButton.parent = gallery;
  const stage = {
    scrollHeight: 1800,
    clientHeight: 900,
    scrollTop: 0,
    scrollToCalls: [],
    scrollTo(options) {
      this.scrollToCalls.push(options);
      this.scrollTop = options.top;
    }
  };
  const header = { hidden: false };
  const windowListeners = new Map();
  const windowScrollToCalls = [];
  const window = {
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) ?? [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      windowListeners.set(
        type,
        (windowListeners.get(type) ?? []).filter((registered) => registered !== listener)
      );
    },
    dispatch(type) {
      for (const listener of windowListeners.get(type) ?? []) {
        listener();
      }
    },
    scrollTo(options) {
      windowScrollToCalls.push(options);
    },
    matchMedia(query) {
      return { matches: query.includes('orientation') ? landscape : reducedMotion };
    }
  };

  closeButton.contains = (target) => target === closeButton || target?.parent === closeButton;
  gallery.contains = (target) => target === gallery || target?.parent === gallery;
  const viewModel = new GalleryViewModel(window, document);
  viewModel.start({
    stage,
    gallery,
    closeButton,
    header
  });
  return { document, gallery, closeButton, viewModel, stage, header, window, windowScrollToCalls };
}

test('artwork catalog validates, enriches, and sorts gallery entries', async () => {
  const records = [
    { name: '02_second', image: 'second.jpg', thumbnail: 'second-thumb.jpg', details: 'second.md' },
    { name: '12_first', image: 'first.jpg', thumbnail: 'first-thumb.jpg', details: 'first.md' }
  ];
  const fetcher = async (url) =>
    url === 'artworks.json'
      ? new Response(JSON.stringify(records), { status: 200 })
      : new Response(`Title ${url}\nOil on canvas\n2026`, { status: 200 });
  const catalog = new ArtworkCatalog(fetcher);

  const entries = await catalog.load();

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['12_first', '02_second']
  );

  assert.deepEqual(catalog.get('02_second').placard, {
    title: 'Title second.md',
    subtitle: 'Oil on canvas',
    year: '2026'
  });
  assert.equal(catalog.get('missing'), undefined);
});

test('artwork catalog rejects malformed records and empty placard titles', async () => {
  const invalidList = new ArtworkCatalog(
    async () => new Response(JSON.stringify([{ name: 'missing paths' }]), { status: 200 })
  );

  const missingTitle = new ArtworkCatalog(async (url) =>
    url === 'artworks.json'
      ? new Response(
          JSON.stringify([
            {
              name: '01_empty',
              image: 'art.jpg',
              thumbnail: 'thumb.jpg',
              details: 'empty.md'
            }
          ]),
          { status: 200 }
        )
      : new Response('\n\n', { status: 200 })
  );

  await assert.rejects(invalidList.load(), /Invalid artwork list/);
  await assert.rejects(missingTitle.load(), /Artwork title missing/);
});

test('blink intervals model a relaxed 12 to 18 blinks per minute', () => {
  assert.equal(BlinkBehavior.getIntervalMs(0), 3250);
  assert.equal(BlinkBehavior.getIntervalMs(0.5), 4000);
  assert.equal(BlinkBehavior.getIntervalMs(1), 4750);
  assert.equal(BlinkBehavior.HOLD_DURATION_MS, 140);
});

test('a press near either eye is recognized, but a distant press is not', () => {
  const eyes = [
    { x: 400, y: 300 },
    { x: 500, y: 300 }
  ];
  assert.equal(BlinkBehavior.isPointerNearEyes({ clientX: 400, clientY: 300 }, eyes, 1), true);
  assert.equal(BlinkBehavior.isPointerNearEyes({ clientX: 500, clientY: 300 }, eyes, 1), true);
  assert.equal(BlinkBehavior.isPointerNearEyes({ clientX: 700, clientY: 300 }, eyes, 1), false);
});

test('gallery pointer presses and any key fully expand it', () => {
  const { document, gallery, stage } = createGalleryInteractions();
  const galleryChild = { parent: gallery };

  document.dispatch('pointerdown', { target: galleryChild, button: 2 });
  document.dispatch('keydown', { key: 'Escape' });

  assert.equal(stage.scrollToCalls.length, 2);
  assert.deepEqual(stage.scrollToCalls[0], { top: 900, behavior: 'smooth' });
  assert.deepEqual(stage.scrollToCalls[1], { top: 900, behavior: 'smooth' });
});

test('scrolling down opens the gallery and scrolling up closes it', () => {
  const { document, stage } = createGalleryInteractions();
  let prevented = 0;
  const wheelEvent = (deltaY, target = document) => ({
    deltaY,
    target,
    preventDefault() {
      prevented += 1;
    }
  });

  document.dispatch('wheel', wheelEvent(1));
  document.dispatch('wheel', wheelEvent(-1));

  assert.deepEqual(stage.scrollToCalls, [
    { top: 900, behavior: 'smooth' },
    { top: 0, behavior: 'smooth' }
  ]);
  assert.equal(prevented, 2);
});

test('wheel scrolling over gallery tiles stays native in both directions', () => {
  const { document, gallery, stage } = createGalleryInteractions();
  const galleryChild = { parent: gallery };
  let prevented = 0;
  const wheelEvent = (deltaY, target) => ({
    deltaY,
    target,
    preventDefault() {
      prevented += 1;
    }
  });

  document.dispatch('wheel', wheelEvent(1, document));
  document.dispatch('wheel', wheelEvent(-1, galleryChild));
  document.dispatch('wheel', wheelEvent(1, galleryChild));

  assert.deepEqual(stage.scrollToCalls, [{ top: 900, behavior: 'smooth' }]);
  assert.equal(prevented, 1);

  document.dispatch('wheel', wheelEvent(-1, document));

  assert.deepEqual(stage.scrollToCalls, [
    { top: 900, behavior: 'smooth' },
    { top: 0, behavior: 'smooth' }
  ]);
  assert.equal(prevented, 2);
});

test('clicking away collapses the gallery and reduced motion skips animation', () => {
  const { document, stage } = createGalleryInteractions({ reducedMotion: true });
  document.dispatch('pointerdown', { target: {}, button: 1 });

  assert.deepEqual(stage.scrollToCalls, [{ top: 0, behavior: 'auto' }]);
});

test('the gallery close button collapses the stage without reopening on pointer or key input', () => {
  const { document, closeButton, viewModel, stage } = createGalleryInteractions();
  const closeIcon = { parent: closeButton };

  document.dispatch('wheel', { deltaY: 1, preventDefault() {} });
  document.dispatch('pointerdown', { target: closeIcon });
  document.dispatch('keydown', { target: closeButton, key: 'Enter' });
  viewModel.close();

  assert.deepEqual(stage.scrollToCalls, [
    { top: 900, behavior: 'smooth' },
    { top: 0, behavior: 'smooth' }
  ]);
});

test('clicking inside an expanded gallery does not collapse or reposition it', () => {
  const { document, gallery, stage, viewModel } = createGalleryInteractions();
  const galleryChild = { parent: gallery };

  document.dispatch('pointerdown', { target: galleryChild });
  const scrollCallsBeforeClick = [...stage.scrollToCalls];
  document.dispatch('pointerdown', { target: galleryChild });

  assert.equal(viewModel.getSnapshot().expanded, true);
  assert.deepEqual(stage.scrollToCalls, scrollCallsBeforeClick);

  viewModel.close();
  assert.equal(viewModel.getSnapshot().expanded, false);
});

test('closing the portrait gallery scrolls back to the top of the page', () => {
  const { viewModel, windowScrollToCalls } = createGalleryInteractions({ landscape: false });

  viewModel.close();

  assert.deepEqual(windowScrollToCalls, [{ top: 0, behavior: 'smooth' }]);
});

test('gallery year filter selects one year or clears to all entries', () => {
  const { document, gallery, viewModel } = createGalleryInteractions();
  viewModel.setEntries([
    { name: '2026_first', placard: { year: '2026' } },
    { name: '2025_first', placard: { year: '2025' } },
    { name: '2026_second', placard: { year: '2026' } }
  ]);

  assert.deepEqual(viewModel.getSnapshot().years, ['2025', '2026']);
  assert.equal(viewModel.getSnapshot().visibleEntries.length, 3);

  viewModel.toggleYear('2025');
  assert.deepEqual(
    viewModel.getSnapshot().visibleEntries.map((entry) => entry.name),
    ['2025_first']
  );
  document.dispatch('pointerdown', { target: { parent: gallery } });
  assert.deepEqual(viewModel.getSnapshot().selectedYears, ['2025']);

  viewModel.toggleYear('2026');
  assert.deepEqual(viewModel.getSnapshot().selectedYears, ['2026']);
  assert.deepEqual(
    viewModel.getSnapshot().visibleEntries.map((entry) => entry.name),
    ['2026_first', '2026_second']
  );

  viewModel.toggleYear('2026');
  assert.deepEqual(viewModel.getSnapshot().selectedYears, []);
  assert.equal(viewModel.getSnapshot().visibleEntries.length, 3);
});

test('gallery viewmodel publishes expansion state to subscribed views', () => {
  const { document, viewModel } = createGalleryInteractions();
  const states = [];
  viewModel.subscribe(() => states.push(viewModel.getSnapshot().expanded));

  document.dispatch('wheel', { deltaY: 1, preventDefault() {} });
  document.dispatch('wheel', { deltaY: -1, preventDefault() {} });

  assert.deepEqual(states, [true, false]);
});

test('expanded gallery follows viewport height changes without leaving a vertical gap', () => {
  const { document, stage, viewModel, window } = createGalleryInteractions();

  document.dispatch('wheel', { deltaY: 1, preventDefault() {} });
  stage.scrollHeight = 2400;
  stage.clientHeight = 1200;
  window.dispatch('resize');

  assert.equal(stage.scrollTop, 1200);
  assert.deepEqual(stage.scrollToCalls.at(-1), { top: 1200, behavior: 'auto' });
  assert.equal(viewModel.getSnapshot().expanded, true);
});

test('gallery movement is inactive outside the landscape gallery view', () => {
  const { document, stage, header } = createGalleryInteractions({ landscape: false });
  document.dispatch('wheel');
  document.dispatch('keydown', { key: 'a' });
  header.hidden = true;
  document.dispatch('pointerdown');

  assert.deepEqual(stage.scrollToCalls, []);
});

test('viewer navigation controls remain tappable above the artwork', () => {
  const stylesheet = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const controlsRule = stylesheet.match(/#viewer button,\s*#close\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(controlsRule, /z-index:\s*4/);
  assert.match(controlsRule, /touch-action:\s*manipulation/);
});

test('a face click closes the eyes for at least one blink interval', () => {
  const clock = createFakeClock();
  const states = [];
  const blink = new ManualBlinkController({
    blink: () => states.push('closed'),
    restore: () => states.push('open'),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now
  });

  blink.pointerDown(1, false);
  clock.advance(BlinkBehavior.HOLD_DURATION_MS - 1);
  blink.pointerUp(1);
  assert.deepEqual(states, ['closed']);
  clock.advance(1);

  assert.deepEqual(states, ['closed', 'open']);
  assert.equal(blink.isActive(), false);
});

test('a press near an eye stays closed until release', () => {
  const clock = createFakeClock();
  const states = [];
  const blink = new ManualBlinkController({
    blink: () => states.push('closed'),
    restore: () => states.push('open'),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now
  });

  blink.pointerDown(7, true);
  clock.advance(BlinkBehavior.HOLD_DURATION_MS * 3);
  assert.deepEqual(states, ['closed']);
  blink.pointerUp(8);
  assert.equal(blink.isActive(), true);
  blink.pointerUp(7);
  clock.advance(0);

  assert.deepEqual(states, ['closed', 'open']);
  assert.equal(blink.isActive(), false);
});
