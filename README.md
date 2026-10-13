# mrbedo.github.io
Bedoworks

## Development

The site is built with React, TypeScript, and Vite. Install dependencies with `npm install`, then run `npm run dev` to start the Vite development server.
Run `npm test` for interaction regressions and `npm run build` to type-check and build the site into `dist/`.
Run `npm run test:core-coverage` for 100% line, branch, and function coverage of the artwork catalog, blink behavior, math helpers, view-model state, and viewer layout. This focused report does not cover the remaining UI and browser controllers.

React components use PascalCase names and filenames; other source modules use kebab-case. Pull requests to `main` run tests and build checks. Pushes to `main` publish `dist/` to GitHub Pages through `.github/workflows/deploy.yml`. In the repository settings, set Pages **Build and deployment** source to **GitHub Actions** to enable publishing.

## Architecture

Application and gallery state live in `src/view-models/`. React components in `src/components/` subscribe to viewmodel snapshots and send user actions back to the viewmodels; they contain presentation markup rather than application state.

## Copyright

Copyright (c) 2026 Bedoworks. All rights reserved.

## Crawlers and AI

`robots.txt` blocks known AI crawlers from the whole site and keeps the artwork files in `src/` out of search engine image indexes. `index.html` also sets the `noai, noimageai` robots meta tag. These are opt-out signals that well-behaved bots respect; they cannot technically stop someone from copying an image shown in a browser.
