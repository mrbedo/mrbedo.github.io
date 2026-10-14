import test from 'node:test';
import assert from 'node:assert/strict';
import { GalleryPullController } from '../src/gallery-pull.ts';

class Target {
  listeners = new Map();
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }
  dispatch(type, event = {}) {
    for (const callback of this.listeners.get(type) ?? []) callback({ target: this, ...event });
  }
}

function style() {
  const values = new Map();
  return { setProperty: (key, value) => values.set(key, value), get: (key) => values.get(key) };
}

function harness() {
  const window = new Target();
  const motion = new Target();
  motion.matches = false;
  window.scrollY = 0;
  window.matchMedia = (query) => (query.includes('orientation') ? { matches: false } : motion);
  window.getComputedStyle = () => ({ top: '6px', paddingLeft: '16px' });
  window.scrollTo = ({ top }) => {
    window.scrollY = top;
  };
  const frames = new Map();
  let id = 0;
  let time = 0;
  window.requestAnimationFrame = (callback) => {
    frames.set(++id, callback);
    return id;
  };
  window.cancelAnimationFrame = (frame) => frames.delete(frame);
  const stage = new Target();
  stage.dataset = {};
  stage.style = style();
  const header = { hidden: false };
  const toolbar = { getBoundingClientRect: () => ({ left: 0 }) };
  const toggle = { getBoundingClientRect: () => ({ right: 80 }) };
  const tile = (top) => ({ offsetTop: top, style: style() });
  const gallery = new Target();
  gallery.offsetTop = 924;
  gallery.dataset = {};
  gallery.style = style();
  gallery.tiles = [tile(72), tile(446), tile(820)];
  gallery.querySelectorAll = () => gallery.tiles;
  gallery.querySelector = (selector) => (selector === '.gallery-toolbar' ? toolbar : toggle);
  const controller = new GalleryPullController({ stage, gallery, header }, window);
  const stop = controller.start();
  return {
    window,
    stage,
    gallery,
    header,
    motion,
    frames,
    tile,
    stop,
    advance(count = 1) {
      for (let n = 0; n < count; n++) {
        time += 1000 / 60;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(time));
      }
    },
    scroll(top) {
      window.scrollY = top;
      window.dispatch('scroll');
    }
  };
}

test('tile rows cascade monotonically to zero without moving the gallery container', () => {
  const h = harness();
  h.advance();
  h.scroll(918);
  h.advance();
  const lag = () => h.gallery.tiles.map((tile) => parseFloat(tile.style.get('--tile-lag')));
  let previous = lag();
  assert.ok(previous[0] < previous[1] && previous[1] < previous[2]);
  for (let frame = 0; frame < 180; frame++) {
    h.advance();
    const next = lag();
    next.forEach((value, index) => {
      assert.ok(value >= 0 && value <= previous[index]);
    });
    previous = next;
  }
  assert.deepEqual(lag(), [0, 0, 0]);
  assert.equal(h.gallery.style.get('--tile-lag'), undefined);
  assert.equal(h.gallery.dataset.docked, 'true');
  assert.equal(h.stage.style.get('--gallery-progress'), '1.000');
  h.stop();
  assert.equal(h.frames.size, 0);
});

test('filtering during animation refreshes tile membership rather than writing detached tiles', () => {
  const h = harness();
  h.scroll(500);
  h.advance(2);
  const removed = h.gallery.tiles[0];
  const removedLag = removed.style.get('--tile-lag');
  const newTile = h.tile(72);
  h.gallery.tiles = [newTile, h.gallery.tiles[2]];
  h.window.dispatch('scroll');
  h.advance(180);
  assert.equal(newTile.style.get('--tile-lag'), '0.00px');
  assert.equal(removed.style.get('--tile-lag'), removedLag);
  assert.equal(h.gallery.tiles[1].style.get('--tile-lag'), '0.00px');
  h.stop();
});

test('reduced motion immediately cancels outstanding lag, including when the setting changes', () => {
  const h = harness();
  h.scroll(500);
  h.advance(2);
  assert.ok(h.frames.size);
  h.motion.matches = true;
  h.motion.dispatch('change');
  assert.equal(h.frames.size, 0);
  assert.ok(h.gallery.tiles.every((tile) => tile.style.get('--tile-lag') === '0.00px'));
  h.stop();
  assert.equal(h.motion.listeners.get('change').size, 0);
});

test('hidden landing suspends animation and restores the landing scroll on viewer return', () => {
  const h = harness();
  h.scroll(918);
  h.advance(2);
  h.header.hidden = true;
  h.scroll(0);
  assert.equal(h.frames.size, 0);
  h.header.hidden = false;
  h.window.dispatch('resize');
  h.advance(180);
  assert.equal(h.window.scrollY, 918);
  assert.equal(h.gallery.dataset.docked, 'true');
  h.stop();
});

test('viewer return corrects a native tile-focus scroll that moved the gallery below its dock', () => {
  const h = harness();
  h.scroll(918);
  h.scroll(687);
  h.header.hidden = true;
  h.scroll(0);
  h.header.hidden = false;
  h.window.dispatch('scroll');
  assert.equal(h.window.scrollY, 918);
  assert.equal(h.gallery.dataset.docked, 'true');
  h.stop();
});

test('resizing a docked gallery tracks the new dock without reopening a collapsed gallery', () => {
  const h = harness();
  h.scroll(918);
  h.gallery.offsetTop = 1024;
  h.window.dispatch('resize');
  assert.equal(h.window.scrollY, 1018);
  assert.equal(h.gallery.dataset.docked, 'true');
  h.scroll(0);
  h.gallery.offsetTop = 1100;
  h.window.dispatch('resize');
  assert.equal(h.window.scrollY, 0);
  assert.equal(h.gallery.dataset.docked, 'false');
  h.stop();
});
