import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ArtworkCatalog } from '../src/artwork-catalog.ts';
import { BlinkBehavior, ManualBlinkController } from '../src/interaction-behavior.ts';
import { GalleryAppViewModel } from '../src/view-models/gallery-app-view-model.ts';
import { GalleryViewModel } from '../src/view-models/gallery-view-model.ts';

class TestTarget {
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((registered) => registered !== listener)
    );
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

function createGalleryInteractions({ landscape = true, reducedMotion = false, visualViewport = false } = {}) {
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
  const media = { landscape, reducedMotion };
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
      return { matches: query.includes('orientation') ? media.landscape : media.reducedMotion };
    }
  };
  if (visualViewport) {
    window.visualViewport = new TestTarget();
  }

  closeButton.contains = (target) => target === closeButton || target?.parent === closeButton;
  gallery.contains = (target) => target === gallery || target?.parent === gallery;
  const viewModel = new GalleryViewModel(window, document);
  const stop = viewModel.start({
    stage,
    gallery,
    closeButton,
    header
  });
  return {
    document,
    gallery,
    closeButton,
    viewModel,
    stage,
    header,
    window,
    windowScrollToCalls,
    setLandscape: (value) => {
      media.landscape = value;
    },
    stop
  };
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

test('artwork catalog reports list and detail request failures', async () => {
  const listFailure = new ArtworkCatalog(async () => new Response('', { status: 503 }));
  const detailFailure = new ArtworkCatalog(async (url) =>
    url === 'artworks.json'
      ? new Response(
          JSON.stringify([
            { name: '01_art', image: 'art.jpg', thumbnail: 'thumb.jpg', details: 'art.md' }
          ]),
          { status: 200 }
        )
      : new Response('', { status: 404 })
  );

  await assert.rejects(listFailure.load(), /Could not load artwork list \(503\)/);
  await assert.rejects(detailFailure.load(), /Could not load 01_art details \(404\)/);
});

test('artwork catalog rejects non-array lists and non-object records', async () => {
  const nonArray = new ArtworkCatalog(async () => new Response('{}', { status: 200 }));
  const nonObject = new ArtworkCatalog(async () => new Response('[null]', { status: 200 }));

  await assert.rejects(nonArray.load(), /Invalid artwork list/);
  await assert.rejects(nonObject.load(), /Invalid artwork list/);
});

test('blink intervals model a relaxed 12 to 18 blinks per minute', () => {
  assert.equal(BlinkBehavior.getIntervalMs(0), 3250);
  assert.equal(BlinkBehavior.getIntervalMs(0.5), 4000);
  assert.equal(BlinkBehavior.getIntervalMs(1), 4750);
  assert.equal(BlinkBehavior.HOLD_DURATION_MS, 140);
  assert.ok(BlinkBehavior.getIntervalMs() >= 3250);
  assert.ok(BlinkBehavior.getIntervalMs() <= 4750);
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

test('portrait gallery close respects reduced motion', () => {
  const { viewModel, windowScrollToCalls } = createGalleryInteractions({
    landscape: false,
    reducedMotion: true
  });

  viewModel.close();

  assert.deepEqual(windowScrollToCalls, [{ top: 0, behavior: 'auto' }]);
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

test('gallery expansion stays at the top when its content fits the viewport', () => {
  const { document, stage } = createGalleryInteractions();
  stage.scrollHeight = 800;
  stage.clientHeight = 900;

  document.dispatch('wheel', { deltaY: 1, preventDefault() {} });

  assert.deepEqual(stage.scrollToCalls, [{ top: 0, behavior: 'smooth' }]);
});

test('expanded gallery listens to visual viewport resizes when available', () => {
  const { document, stage, window } = createGalleryInteractions({ visualViewport: true });

  document.dispatch('wheel', { deltaY: 1, preventDefault() {} });
  stage.scrollHeight = 2400;
  stage.clientHeight = 1200;
  window.visualViewport.dispatch('resize');

  assert.equal(stage.scrollTop, 1200);
  assert.deepEqual(stage.scrollToCalls.at(-1), { top: 1200, behavior: 'auto' });
});

test('expanded gallery skips landscape repositioning after orientation changes', () => {
  const { document, stage, window, viewModel, setLandscape } = createGalleryInteractions();
  document.dispatch('wheel', { deltaY: 1, preventDefault() {} });
  const scrollCallsBeforeResize = [...stage.scrollToCalls];

  setLandscape(false);
  window.dispatch('resize');

  assert.deepEqual(stage.scrollToCalls, scrollCallsBeforeResize);
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

test('landing branding stays sticky without a header scroll container trapping it', () => {
  const stylesheet = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const headerRule = stylesheet.match(/#gallery-header\s*\{([^}]*)\}/)?.[1] ?? '';
  const brandRule = stylesheet.match(/#gallery-header \.header-brand\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(headerRule, /overflow:\s*clip/);
  assert.match(brandRule, /position:\s*sticky/);
  assert.match(brandRule, /top:\s*var\(--edge-inset\)/);
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

test('cancelling a manual blink clears its timer without restoring early', () => {
  const clock = createFakeClock();
  const states = [];
  const blink = new ManualBlinkController({
    blink: () => states.push('closed'),
    restore: () => states.push('open'),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now
  });

  blink.pointerDown(3, false);
  blink.cancel();
  clock.advance(BlinkBehavior.HOLD_DURATION_MS);

  assert.deepEqual(states, ['closed']);
  assert.equal(blink.isActive(), false);
});

test('gallery subscriptions and listeners can be stopped cleanly', () => {
  const { document, viewModel, stop, stage, window } = createGalleryInteractions();
  let notifications = 0;
  const unsubscribe = viewModel.subscribe(() => notifications++);

  unsubscribe();
  document.dispatch('wheel', { deltaY: 1, preventDefault() {} });
  const scrollCallsBeforeStop = [...stage.scrollToCalls];
  stop();
  document.dispatch('wheel', { deltaY: -1, preventDefault() {} });
  document.dispatch('pointerdown', { target: {} });
  document.dispatch('keydown', { key: 'Enter' });
  window.dispatch('resize');

  assert.equal(notifications, 0);
  assert.deepEqual(stage.scrollToCalls, scrollCallsBeforeStop);
  viewModel.close();
  assert.deepEqual(stage.scrollToCalls, scrollCallsBeforeStop);
});

test('gallery filtering ignores unknown years and drops unavailable selections', () => {
  const { viewModel } = createGalleryInteractions();
  viewModel.setEntries([
    { name: '2025_art', placard: { year: '2025' } },
    { name: '2026_art', placard: { year: '2026' } }
  ]);
  viewModel.toggleYear('unknown');
  assert.deepEqual(viewModel.getSnapshot().selectedYears, []);

  viewModel.toggleYear('2025');
  viewModel.setEntries([{ name: '2026_art', placard: { year: '2026' } }]);
  assert.deepEqual(viewModel.getSnapshot().selectedYears, []);
  assert.deepEqual(viewModel.getSnapshot().visibleEntries.map((entry) => entry.name), [
    '2026_art'
  ]);
});

test('gallery leaves native scrolling at the bottom and avoids redundant resize work', () => {
  const { document, stage, window } = createGalleryInteractions();
  let prevented = 0;
  const wheel = () => ({ deltaY: 1, preventDefault() { prevented++; } });

  document.dispatch('wheel', wheel());
  stage.scrollTop = 0;
  document.dispatch('wheel', wheel());
  stage.scrollTop = stage.scrollHeight - stage.clientHeight;
  document.dispatch('wheel', wheel());
  const callsBeforeResize = [...stage.scrollToCalls];
  window.dispatch('resize');

  assert.equal(prevented, 2);
  assert.deepEqual(stage.scrollToCalls, callsBeforeResize);
});

test('gallery handles missing event targets and collapsed viewport changes', () => {
  const { document, stage, window, viewModel } = createGalleryInteractions();

  window.dispatch('resize');
  document.dispatch('wheel', { deltaY: -1, preventDefault() {} });
  document.dispatch('wheel', { deltaY: 0, target: null, preventDefault() {} });
  document.dispatch('pointerdown', { target: null });
  document.dispatch('keydown', { target: null });

  assert.equal(viewModel.getSnapshot().expanded, true);
  assert.deepEqual(stage.scrollToCalls, [
    { top: 0, behavior: 'smooth' },
    { top: 900, behavior: 'smooth' }
  ]);
});

test('app viewmodel exposes a stable snapshot store and safely decodes routes', () => {
  const historyCalls = [];
  const browserWindow = {
    location: { hash: '#01_first', pathname: '/' },
    history: { pushState: (...args) => historyCalls.push(args) }
  };
  const viewModel = new GalleryAppViewModel({ browserWindow, document: {} });
  const snapshot = viewModel.getSnapshot;
  const subscribe = viewModel.subscribe;
  const notifications = [];
  const unsubscribe = viewModel.subscribe(() => notifications.push(viewModel.getSnapshot()));
  let activeNotifications = 0;
  viewModel.subscribe(() => activeNotifications++);

  assert.equal(viewModel.getSnapshot().selectedName, '01_first');
  unsubscribe();
  viewModel.closeViewer();

  assert.equal(viewModel.getSnapshot, snapshot);
  assert.equal(viewModel.subscribe, subscribe);
  assert.deepEqual(notifications, []);
  assert.equal(activeNotifications, 1);
  assert.equal(viewModel.getSnapshot().selectedName, '');
  assert.deepEqual(historyCalls, [[null, '', '/']]);

  const invalidRoute = new GalleryAppViewModel({
    browserWindow: { location: { hash: '#%E0%A4%A' } },
    document: {}
  });
  assert.equal(invalidRoute.getSnapshot().selectedName, '');
});
