# mrbedo.github.io
Bedoworks

## Development

The site is built with React, TypeScript, and Vite. Install dependencies with `npm install`, then run `npm run dev` to start the Vite development server.
Run `npm test` for interaction regressions and `npm run build` to type-check and build the site into `dist/`.
For browser regressions, run `npx playwright install chromium firefox webkit` once, then `npm run test:browser`.
The browser suite starts its own server on port 5180; leave that port free. Failure traces and viewport screenshots are saved in the ignored `test-results/` directory.
Run `npm run test:core-coverage` for 100% line, branch, and function coverage of the artwork catalog, blink behavior, math helpers, view-model state, and viewer layout. This focused report does not cover the remaining UI and browser controllers.

React components use PascalCase names and filenames; other source modules use kebab-case. Pull requests to `main` run tests and build checks. Pushes to `main` publish `dist/` to GitHub Pages through `.github/workflows/deploy.yml`. In the repository settings, set Pages **Build and deployment** source to **GitHub Actions** to enable publishing.

The deployment workflow generates a UTC build version in `YYYY.MM.DD.HHMMSS` format and stamps the generated `dist/index.html` with `<meta name="build-version" content="<version>">` before uploading it. Release branch deployments use that same version for the release tag. Inspect the deployed page source or run `document.querySelector('meta[name="build-version"]').content` in the browser console to identify its version. Local builds do not include this tag.

## Architecture

Application and gallery state live in `src/view-models/`. React components in `src/components/` subscribe to viewmodel snapshots and send user actions back to the viewmodels; they contain presentation markup rather than application state.

The gallery heading peeks over the landing image, then docks and reveals the year filters and close button. Split-screen mode requires landscape orientation, at least 700px of width and 480px of height. Other viewports use a full-width, page-scrolling gallery and compact fixed branding. The CSS breakpoint and `src/responsive-layout.ts` must stay in sync.

Filtering resets the visible list to its beginning and keeps the toolbar fully docked, including when a year contains very few paintings. Closing returns to the landing view; returning from an artwork restores the gallery without stranding it partway open. Each tile row follows with a monotonic, time-based delay, never a bouncing spring. Reduced motion snaps the tiles immediately. Tile membership and geometry are refreshed after content changes, viewport changes and viewer transitions.

Compact artwork views reserve space for branding, descriptions and navigation; wide, short viewports put descriptions beside the artwork to retain more image area. Fullscreen continues to use the entire viewport.

## Text configuration

Shared UI copy, accessible labels, symbols, links and the document title are configured in `src/site-text.json`, accessed through `src/site-text.ts`. Artwork-specific titles and descriptions remain data in each artwork's Markdown file. The copyright year comes from the current date, and footer clauses wrap before "All rights reserved."

## Browser and responsive coverage

Browser regressions run against Chromium, Firefox and WebKit, plus emulated Android/Chromium and iPhone/WebKit touch profiles. The desktop engines exercise 14 viewport shapes from 240x320 and 320x240 through 3840x2160 and 2160x3840, including 240x1440, 2560x240, square sizes and intermediate breakpoints.

Assertions cover docking, short-list filtering, deep scrolling, rotation/resizing, viewer return, every artwork, keyboard/touch navigation, fullscreen, exposed controls, title overflow, footer wrapping, hover/selection, reduced motion, font-loading failure and catalog errors. Screenshots are recorded for gallery and viewer states throughout the viewport matrix.

These are engine tests and mobile emulation, not certification of physical devices or every browser brand/version. Chromium-derived browsers share much of this coverage, but obscure browsers and legacy engines are not individually verified. Basic viewport units, font sizing and solid text colors provide fallbacks when newer CSS features or external fonts are unavailable.

## Copyright

Copyright (c) 2026 Bedoworks. All rights reserved.

## Crawlers and AI

`robots.txt` blocks known AI crawlers from the whole site and keeps the artwork files in `src/` out of search engine image indexes. `index.html` also sets the `noai, noimageai` robots meta tag. These are opt-out signals that well-behaved bots respect; they cannot technically stop someone from copying an image shown in a browser.
