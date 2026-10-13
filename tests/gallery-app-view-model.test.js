import test from 'node:test';
import assert from 'node:assert/strict';
import { GalleryAppViewModel } from '../src/view-models/gallery-app-view-model.ts';

const entries = [
  {
    name: '01_first',
    image: 'first.jpg',
    thumbnail: 'first-thumb.jpg',
    details: 'first.md',
    placard: { title: 'First', subtitle: 'Oil', year: '2026' }
  },
  {
    name: '02_second',
    image: 'second.jpg',
    thumbnail: 'second-thumb.jpg',
    details: 'second.md',
    placard: { title: 'Second', subtitle: 'Ink', year: '2025' }
  }
];

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
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ target: this, ...event });
    }
  }
}

function createStyle() {
  const properties = new Map();
  return {
    properties,
    setProperty(name, value) {
      properties.set(name, value);
    },
    removeProperty(name) {
      properties.delete(name);
    }
  };
}

function buildAppHarness({ load = async () => entries, imageComplete = false } = {}) {
  const document = new TestTarget();
  document.documentElement = {};

  const browserWindow = new TestTarget();
  let hash = '#01_first';
  browserWindow.location = { pathname: '/' };
  Object.defineProperty(browserWindow.location, 'hash', {
    get: () => hash,
    set: (value) => {
      hash = value.startsWith('#') ? value : `#${value}`;
      browserWindow.dispatch('hashchange');
    }
  });
  const historyCalls = [];
  browserWindow.history = {
    pushState(...args) {
      historyCalls.push(args);
      hash = '';
    }
  };
  browserWindow.innerWidth = 1200;
  browserWindow.innerHeight = 900;
  browserWindow.matchMedia = (query) => ({ matches: query.includes('orientation') });
  browserWindow.getComputedStyle = () => ({ fontSize: '16px' });
  browserWindow.scrollTo = () => {};

  const stage = {
    scrollHeight: 1800,
    clientHeight: 900,
    scrollTop: 0,
    scrollTo(options) {
      this.scrollTop = options.top;
    }
  };
  const gallery = new TestTarget();
  const closeButton = new TestTarget();
  const header = { hidden: false };
  const viewer = { hidden: false, dataset: {}, style: createStyle() };
  const focusCalls = [];
  const image = {
    complete: imageComplete,
    naturalWidth: 1200,
    naturalHeight: 800,
    style: createStyle(),
    focus(options) {
      focusCalls.push(options);
    }
  };
  const galleryContains = (target) => target === gallery || target?.parent === gallery;
  gallery.contains = galleryContains;
  closeButton.contains = (target) => target === closeButton || target?.parent === closeButton;

  const colorCalls = [];
  const colorManager = {
    viewerColors: new Map(),
    artworkBackground: () => 'sampled-color',
    setViewerColor(color) {
      colorCalls.push(color);
    },
    prepareViewerColors(artworks, getSelectedName) {
      artworks.forEach((entry, index) => this.viewerColors.set(entry.name, `color-${index}`));
      const selectedColor = this.viewerColors.get(getSelectedName());
      if (selectedColor) {
        this.setViewerColor(selectedColor);
      }
    }
  };
  let headerControllerCreations = 0;
  const viewModel = new GalleryAppViewModel({
    catalog: { load },
    colors: colorManager,
    browserWindow,
    document,
    headerControllerConstructor: class {
      constructor() {
        headerControllerCreations++;
      }
    }
  });

  const elements = { stage, gallery, closeButton, header, viewer, image };
  return {
    browserWindow,
    closeButton,
    colorCalls,
    colorManager,
    document,
    elements,
    focusCalls,
    gallery,
    headerControllerCreations: () => headerControllerCreations,
    historyCalls,
    stage,
    viewModel,
    viewer
  };
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('app viewmodel coordinates routing, viewer controls, colors, and lifecycle', async () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };

  try {
    const harness = buildAppHarness({ imageComplete: true });
    const { browserWindow, colorManager, document, focusCalls, historyCalls, viewModel, viewer } =
      harness;

    viewModel.moveArtwork(1);
    let notifications = 0;
    viewModel.subscribe(() => notifications++);
    const stop = viewModel.start(harness.elements);
    await flushPromises();

    assert.equal(viewModel.getSnapshot().entries.length, 2);
    assert.equal(viewModel.selectedEntry.name, '01_first');
    assert.equal(harness.headerControllerCreations(), 1);
    assert.ok(colorManager.viewerColors.has('01_first'));

    browserWindow.dispatch('resize');
    assert.equal(frames.length, 1);
    frames[0](0);

    viewModel.moveArtwork(1);
    assert.equal(viewModel.selectedEntry.name, '02_second');
    document.dispatch('keydown', { key: 'ArrowLeft' });
    assert.equal(viewModel.selectedEntry.name, '01_first');
    document.dispatch('keydown', { key: 'ArrowRight' });
    assert.equal(viewModel.selectedEntry.name, '02_second');

    viewModel.toggleImageOnly();
    assert.equal(viewModel.getSnapshot().imageOnly, true);
    assert.deepEqual(focusCalls, [{ preventScroll: true }]);
    document.dispatch('keydown', { key: 'ArrowLeft' });
    assert.equal(viewModel.selectedEntry.name, '02_second');
    document.dispatch('keydown', { key: 'Escape' });
    assert.equal(viewModel.getSnapshot().imageOnly, false);

    colorManager.viewerColors.delete('02_second');
    viewModel.onArtworkLoad(harness.elements.image);
    assert.equal(harness.colorCalls.at(-1), 'sampled-color');

    viewModel.toggleImageOnly();
    document.dispatch('keydown', { key: 'Escape' });
    browserWindow.location.hash = '#missing';
    assert.equal(viewModel.selectedEntry, undefined);
    document.dispatch('keydown', { key: 'ArrowRight' });
    viewModel.toggleImageOnly();
    assert.equal(viewModel.getSnapshot().imageOnly, false);

    browserWindow.location.hash = '#02_second';
    document.dispatch('keydown', { key: 'Escape' });
    assert.equal(viewModel.getSnapshot().selectedName, '');
    assert.deepEqual(historyCalls, [[null, '', '/']]);
    assert.equal(viewer.style.properties.size, 0);
    viewModel.moveArtwork(1);
    assert.equal(viewModel.selectedEntry.name, '01_first');
    assert.ok(notifications > 0);

    stop();
    const selectedNameAfterStop = viewModel.getSnapshot().selectedName;
    browserWindow.location.hash = '#02_second';
    assert.equal(viewModel.getSnapshot().selectedName, selectedNameAfterStop);

    const stopAgain = viewModel.start(harness.elements);
    await flushPromises();
    assert.equal(harness.headerControllerCreations(), 1);
    stopAgain();
  } finally {
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      delete globalThis.requestAnimationFrame;
    }
  }
});

test('app viewmodel reports current catalog failures and ignores stale failures', async () => {
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    const failed = buildAppHarness({ load: async () => { throw new Error('offline'); } });
    const stopFailed = failed.viewModel.start(failed.elements);
    await flushPromises();
    assert.equal(failed.viewModel.getSnapshot().loadError, 'The gallery could not be loaded. Please try again later.');
    assert.equal(errors.length, 1);
    stopFailed();

    let rejectLoad;
    const stale = buildAppHarness({
      load: () => new Promise((resolve, reject) => { rejectLoad = reject; })
    });
    const stopStale = stale.viewModel.start(stale.elements);
    stopStale();
    rejectLoad(new Error('stale failure'));
    await flushPromises();
    assert.equal(stale.viewModel.getSnapshot().loadError, '');
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
  }
});

test('app viewmodel ignores stale successful loads and catches image color errors', async () => {
  let resolveLoad;
  const stale = buildAppHarness({
    load: () => new Promise((resolve) => { resolveLoad = resolve; })
  });
  const stopStale = stale.viewModel.start(stale.elements);
  stopStale();
  resolveLoad(entries);
  await flushPromises();
  assert.deepEqual(stale.viewModel.getSnapshot().entries, []);

  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    const loaded = buildAppHarness();
    const stopLoaded = loaded.viewModel.start(loaded.elements);
    await flushPromises();
    loaded.colorManager.viewerColors.delete('01_first');
    loaded.colorManager.artworkBackground = () => { throw new Error('canvas blocked'); };
    loaded.viewModel.onArtworkLoad(loaded.elements.image);
    assert.equal(errors.length, 1);
    stopLoaded();
  } finally {
    console.error = originalError;
  }
});