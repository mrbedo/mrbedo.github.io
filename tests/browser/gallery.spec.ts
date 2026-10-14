import { expect, test, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

async function expectDocked(page: Page) {
  await expect(page.locator('#gallery')).toHaveAttribute('data-docked', 'true');
  await expect(page.locator('#gallery-close')).toBeVisible();
  if (
    await page.evaluate(
      () =>
        !matchMedia('(orientation: landscape) and (min-width: 700px) and (min-height: 480px)')
          .matches
    )
  ) {
    await expect(page.locator('#gallery-header .header-link')).toBeHidden();
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const gallery = document.querySelector<HTMLElement>('#gallery')!;
        const toolbar = gallery.querySelector<HTMLElement>('.gallery-toolbar')!;
        const top = getComputedStyle(gallery).position === 'sticky'
            ? gallery.getBoundingClientRect().top
            : parseFloat(getComputedStyle(toolbar).top);
        return Math.abs(toolbar.getBoundingClientRect().top - top);
      })
    )
    .toBeLessThanOrEqual(2);
}

async function expectWithinViewport(page: Page, selectors: string[]) {
  const bounds = await page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const box = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        return {
          selector,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: innerWidth,
          height: innerHeight
        };
      }),
    selectors
  );

  for (const box of bounds) {
    expect(box.left, `${box.selector} left edge`).toBeGreaterThanOrEqual(-1);
    expect(box.top, `${box.selector} top edge`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `${box.selector} right edge`).toBeLessThanOrEqual(box.width + 1);
    expect(box.bottom, `${box.selector} bottom edge`).toBeLessThanOrEqual(box.height + 1);
  }
}

async function expectControlsExposed(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = document.querySelectorAll<HTMLElement>(
          '#gallery-year-filters button, #gallery-close'
        );

        return [...controls].every((control) => {
          const rect = control.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          return [rect.top + 1, rect.top + rect.height / 2, rect.bottom - 1].every((y) => {
            const hit = document.elementFromPoint(x, y);
            return hit !== null && control.contains(hit);
          });
        });
      })
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.gallery-content > a')).toHaveCount(13);
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    const layout = await page.evaluate(() => {
      const gallery = document.querySelector<HTMLElement>('#gallery');
      const toolbar = document.querySelector<HTMLElement>('.gallery-toolbar');
      return {
        viewport: [innerWidth, innerHeight],
        scroll: scrollY,
        maxScroll: document.documentElement.scrollHeight - innerHeight,
        galleryTop: gallery?.offsetTop,
        galleryHeight: gallery?.offsetHeight,
        toolbarTop: toolbar?.getBoundingClientRect().top,
        dockOffset: toolbar && getComputedStyle(toolbar).top,
        docked: gallery?.dataset.docked,
        progress: document
          .querySelector<HTMLElement>('#landing-stage')
          ?.style.getPropertyValue('--gallery-progress')
      };
    });
    await info.attach('layout', { body: JSON.stringify(layout), contentType: 'application/json' });
    console.info('Failed layout:', JSON.stringify(layout));
  }
  expect(pageErrors.get(page), 'uncaught browser errors').toEqual([]);
});

test('filtering and clearing a short list keep the gallery docked', async ({ page }) => {
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  for (const year of ['2025', '2026', '2026', '2025']) {
    await page.getByRole('button', { name: year, exact: true }).click();
    await expectDocked(page);
    await expect(page.locator('.gallery-content > a').first()).toBeVisible();
  }
  await expect(page.locator('.gallery-content > a')).toHaveCount(2);
});

test('filtering from the end of the gallery returns to a coherent docked list', async ({
  page
}) => {
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  await page.evaluate(() => {
    const gallery = document.querySelector<HTMLElement>('#gallery')!;
    if (getComputedStyle(gallery).position === 'sticky') {
      const content = gallery.querySelector<HTMLElement>('.gallery-content')!;
      content.scrollTop = content.scrollHeight;
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    }
  });
  await page.getByRole('button', { name: '2025', exact: true }).click();
  await expectDocked(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tile = document.querySelector<HTMLElement>('.gallery-content > a')!;
        const toolbar = document.querySelector<HTMLElement>('.gallery-toolbar')!;
        return tile.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom;
      })
    )
    .toBeGreaterThanOrEqual(0);
});

test('closing, reopening and returning from an artwork preserve usable controls', async ({
  page
}) => {
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  await page.getByRole('button', { name: '2025', exact: true }).click();
  await expectDocked(page);
  await page.locator('.gallery-content > a').first().click();
  await expect(page.locator('#viewer')).toBeVisible();
  await page.locator('#close').click();
  await expect(page.locator('#viewer')).toBeHidden();
  await expectDocked(page);
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await expect(page.locator('#gallery')).toHaveAttribute('data-docked', 'false');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
});

test('resize and reduced motion do not strand a filtered gallery or leave tile lag', async ({
  page
}) => {
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  await page.getByRole('button', { name: '2025', exact: true }).click();
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: size.height + 100 });
  await expectDocked(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      page
        .locator('.gallery-content > a')
        .evaluateAll((tiles) =>
          tiles.every(
            (tile) => (tile as HTMLElement).style.getPropertyValue('--tile-lag') === '0.00px'
          )
        )
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
});

test('extreme and intermediate viewports keep gallery and artwork controls coherent', async ({
  page,
  isMobile
}, info) => {
  test.skip(isMobile, 'Touch profiles run the interaction tests at their device viewport.');
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const sizes = [
    [240, 320],
    [320, 240],
    [240, 1440],
    [2560, 240],
    [320, 320],
    [600, 600],
    [768, 1024],
    [844, 390],
    [900, 901],
    [901, 900],
    [1024, 1366],
    [1440, 900],
    [3840, 2160],
    [2160, 3840]
  ];
  for (const [width, height] of sizes) {
    await test.step(`${width}x${height}`, async () => {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.querySelector<HTMLElement>('#landing-stage')!.scrollTop = 0;
      });
      await expectWithinViewport(page, ['#gallery-header h1']);
      await page.getByRole('button', { name: 'Gallery', exact: true }).click();
      await expectDocked(page);
      await page.getByRole('button', { name: '2025', exact: true }).click();
      await expectDocked(page);
      await expectWithinViewport(page, [
        '#gallery-close',
        '#gallery-year-filters button',
        '.gallery-heading-toggle'
      ]);
      await expectControlsExposed(page);
      await page.screenshot({ path: info.outputPath(`${width}x${height}-gallery.png`) });
      await page.locator('.gallery-content > a').first().click();
      await expect(page.locator('#viewer')).toBeVisible();
      await expect(page.locator('#art')).toHaveJSProperty('complete', true);
      await expectWithinViewport(page, ['#close', '#prev', '#next', '#art', '.viewer-brand h1']);
      await page.screenshot({ path: info.outputPath(`${width}x${height}-viewer.png`) });
      await page.locator('#next').click();
      await page.locator('#prev').click();
      await page.locator('#art').click();
      await expect(page.locator('#viewer')).toHaveClass('image-only');
      await page.locator('#art').press('Escape');
      await expect(page.locator('#viewer')).not.toHaveClass('image-only');
      await page.locator('#close').click();
      await expectDocked(page);
      await page.getByRole('button', { name: '2025', exact: true }).click();
      await expect(page.locator('.gallery-content > a')).toHaveCount(13);
      await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
      await expect(page.locator('#gallery')).toHaveAttribute('data-docked', 'false');
    });
  }
});

test('touch and keyboard controls navigate artwork and exit fullscreen', async ({
  page,
  hasTouch
}) => {
  const heading = page.getByRole('button', { name: 'Gallery', exact: true });
  if (hasTouch) {
    await heading.tap();
  } else {
    await heading.press('Enter');
  }
  await expectDocked(page);
  await page.locator('.gallery-content > a').first().click();
  const firstHash = new URL(page.url()).hash;
  await page.locator('#art').press('ArrowRight');
  await expect.poll(() => new URL(page.url()).hash).not.toBe(firstHash);
  await page.locator('#art').press('ArrowLeft');
  await expect.poll(() => new URL(page.url()).hash).toBe(firstHash);
  await page.locator('#art').press('Enter');
  await expect(page.locator('#viewer')).toHaveClass('image-only');
  await page.locator('#art').press('Escape');
  await expect(page.locator('#viewer')).not.toHaveClass('image-only');
  await page.locator('#art').press('Escape');
  await expect(page.locator('#viewer')).toBeHidden();
  await expectDocked(page);
});

test('every artwork loads, fits and has a readable title without horizontal overflow', async ({
  page
}) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  await page.locator('.gallery-content > a').first().click();
  for (let index = 0; index < 13; index++) {
    await expect(page.locator('#art')).toHaveAttribute(
      'alt',
      decodeURIComponent(new URL(page.url()).hash.slice(1))
    );

    await expect
      .poll(
        () =>
          page
            .locator('#art')
            .evaluate(
              (image) =>
                (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
            ),
        { timeout: 20_000 }
      )
      .toBe(true);
    await expectWithinViewport(page, ['#art', '#close', '#prev', '#next']);
    await expect
      .poll(() => page.locator('#title').evaluate((title) => title.scrollWidth - title.clientWidth))
      .toBeLessThanOrEqual(1);
    const previousHash = new URL(page.url()).hash;
    await page.locator('#next').click();
    await expect.poll(() => new URL(page.url()).hash).not.toBe(previousHash);
  }
});

test('switching between split and full-width layouts keeps a filtered gallery docked', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'Device profiles use their own mobile viewport.');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  await page.getByRole('button', { name: '2025', exact: true }).click();
  for (const [width, height] of [
    [1440, 900],
    [844, 390],
    [394, 980]
  ]) {
    await page.setViewportSize({ width, height });
    await expectDocked(page);
    await expectWithinViewport(page, ['#gallery-close', '#gallery-year-filters button']);
  }
});

test('footer clauses wrap together and reflect the current year', async ({ page }) => {
  const footer = page.locator('#root > .copyright');
  await expect(footer).toContainText(String(new Date().getFullYear()));
  const lines = await footer.evaluate((footer) => {
    (footer as HTMLElement).style.width = '240px';
    const result = [...footer.querySelectorAll('span')].map((span) => ({
      text: span.textContent,
      top: span.offsetTop,
      overflow: span.scrollWidth - span.clientWidth
    }));
    (footer as HTMLElement).style.width = '';
    return result;
  });
  expect(lines[1].text).toBe('All rights reserved.');
  expect(lines[1].top).toBeGreaterThan(lines[0].top);
  expect(lines.every((line) => line.overflow <= 1)).toBe(true);
});

test('hover is border-only and only the selected year gets orange', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'Hover is checked with mouse profiles, not emulated touch.');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  const year = page.getByRole('button', { name: '2025', exact: true });
  const box = await year.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(year).toHaveCSS('outline-style', 'solid');
  await expect(year).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(year).toHaveCSS('color', 'rgb(20, 20, 20)');
  await year.click();
  await expect(year).toHaveAttribute('aria-pressed', 'true');
  await expect(year).toHaveCSS('background-color', 'rgb(255, 109, 0)');
});

test('system fonts keep branding and controls usable when external fonts are unavailable', async ({
  page,
  isMobile
}) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  if (!isMobile) {
    await page.setViewportSize({ width: 240, height: 320 });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.gallery-content > a')).toHaveCount(13);
  await expectWithinViewport(page, ['#gallery-header h1']);
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  await expectWithinViewport(page, ['#gallery-close', '#gallery-year-filters button']);
  await page.locator('.gallery-content > a').first().click();
  await expect(page.locator('#viewer')).toBeVisible();
  await expectWithinViewport(page, ['.viewer-brand h1', '#close', '#prev', '#next', '#art']);
});

test('catalog failure displays the configured error and leaves gallery controls usable', async ({
  page
}) => {
  await page.route('**/artworks.json', (route) => route.fulfill({ status: 503, body: '' }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('alert')).toHaveText(
    'The gallery could not be loaded. Please try again later.'
  );

  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await expectDocked(page);
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await expect(page.locator('#gallery')).toHaveAttribute('data-docked', 'false');
});
