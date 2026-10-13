import test from 'node:test';
import assert from 'node:assert/strict';
import { MathUtils } from '../src/math-utils.ts';
import { ViewerLayoutController } from '../src/viewer-layout.ts';

function createLayout({
  viewportWidth = 1200,
  viewportHeight = 900,
  naturalWidth = 1200,
  naturalHeight = 800,
  hidden = false
} = {}) {
  const styles = new Map();
  const image = {
    naturalWidth,
    naturalHeight,
    style: {
      setProperty(name, value) {
        styles.set(name, value);
      },
      removeProperty(name) {
        styles.delete(name);
      }
    }
  };
  const viewer = { hidden, dataset: {} };
  const browserWindow = {
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    getComputedStyle() {
      return { fontSize: '16px' };
    }
  };
  const document = { documentElement: {} };
  const controller = new ViewerLayoutController(viewer, image, browserWindow, document);
  return { controller, viewer, image, styles };
}

test('math helpers clamp, fit dimensions, and calculate fitted areas', () => {
  assert.equal(MathUtils.clamp(5, 0, 10), 5);
  assert.equal(MathUtils.clamp(-1, 0, 10), 0);
  assert.equal(MathUtils.clamp(11, 0, 10), 10);
  assert.equal(MathUtils.fitScale(100, 50, 200, 300), 2);
  assert.equal(MathUtils.fitScale(100, 50, 300, 25), 0.5);
  assert.equal(MathUtils.fittedArea(2, 100, 40), 3200);
  assert.equal(MathUtils.fittedArea(0.5, 200, 100), 5000);
});

test('layout skips hidden viewers and images without intrinsic dimensions', () => {
  const hidden = createLayout({ hidden: true });
  hidden.controller.update();
  assert.deepEqual(hidden.viewer.dataset, {});

  const missingWidth = createLayout({ naturalWidth: 0 });
  missingWidth.controller.update();
  assert.deepEqual(missingWidth.viewer.dataset, {});

  const missingHeight = createLayout({ naturalHeight: 0 });
  missingHeight.controller.update();
  assert.deepEqual(missingHeight.viewer.dataset, {});
});

test('compact layout sizes landscape and portrait artwork within the viewport', () => {
  const compactByHeight = createLayout({
    viewportWidth: 400,
    viewportHeight: 480,
    naturalWidth: 1000,
    naturalHeight: 500
  });
  compactByHeight.controller.update();
  assert.equal(compactByHeight.viewer.dataset.artLayout, 'compact');
  assert.ok(Number.parseFloat(compactByHeight.styles.get('--compact-art-width')) > 0);
  assert.ok(Number.parseFloat(compactByHeight.styles.get('--compact-art-height')) > 0);

  const compactByWidth = createLayout({
    viewportWidth: 300,
    viewportHeight: 900,
    naturalWidth: 500,
    naturalHeight: 1000
  });
  compactByWidth.controller.update();
  assert.equal(compactByWidth.viewer.dataset.artLayout, 'compact');
  assert.ok(Number.parseFloat(compactByWidth.styles.get('--compact-art-width')) > 0);
  assert.ok(Number.parseFloat(compactByWidth.styles.get('--compact-art-height')) > 0);
});

test('wide and regular layouts remove stale compact artwork dimensions', () => {
  const wide = createLayout({ viewportWidth: 600, viewportHeight: 800 });
  wide.image.style.setProperty('--compact-art-width', '100px');
  wide.image.style.setProperty('--compact-art-height', '80px');
  wide.controller.update();
  assert.equal(wide.viewer.dataset.artLayout, 'wide');
  assert.equal(wide.styles.has('--compact-art-width'), false);
  assert.equal(wide.styles.has('--compact-art-height'), false);

  const regular = createLayout({ viewportWidth: 1200, viewportHeight: 900 });
  regular.image.style.setProperty('--compact-art-width', '100px');
  regular.image.style.setProperty('--compact-art-height', '80px');
  regular.controller.update();
  assert.equal(regular.viewer.dataset.artLayout, 'tall');
  assert.equal(regular.styles.has('--compact-art-width'), false);
  assert.equal(regular.styles.has('--compact-art-height'), false);
});

test('regular layout chooses wide or tall based on fitted artwork area', () => {
  const wide = createLayout({
    viewportWidth: 800,
    viewportHeight: 900,
    naturalWidth: 1000,
    naturalHeight: 500
  });
  wide.controller.update();
  assert.equal(wide.viewer.dataset.artLayout, 'wide');

  const tall = createLayout({
    viewportWidth: 800,
    viewportHeight: 900,
    naturalWidth: 500,
    naturalHeight: 1000
  });
  tall.controller.update();
  assert.equal(tall.viewer.dataset.artLayout, 'tall');
});

test('scheduled layout updates coalesce until the animation frame runs', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const callbacks = [];
  globalThis.requestAnimationFrame = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };

  try {
    const { controller, viewer } = createLayout({ viewportWidth: 600, viewportHeight: 800 });
    controller.scheduleUpdate();
    controller.scheduleUpdate();
    assert.equal(callbacks.length, 1);
    callbacks[0](0);
    assert.equal(viewer.dataset.artLayout, 'wide');

    controller.scheduleUpdate();
    assert.equal(callbacks.length, 2);
  } finally {
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      delete globalThis.requestAnimationFrame;
    }
  }
});