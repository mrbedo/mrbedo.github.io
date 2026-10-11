# mrbedo.github.io
Bedo Works Of Art

## Copyright and license

Copyright (c) 2026 bedo. All rights reserved. See [LICENSE](LICENSE) for the custom proprietary terms. Commercial downloading, copying, replication, and reuse require the author's prior written consent. Permission requests: bedoworksofart@gmail.com.

## Adding artwork and previewing

Install the thumbnail tooling once:

```shell
npm install
```

Put each image and its matching Markdown placard in a dedicated folder under
`src/`. The folder, image, and placard should share the same filename stem. Add
an entry to `artworks.json` with exact, case-sensitive relative paths, for
example:

```json
{
  "name": "12_mistakes_were_made",
  "image": "src/12_mistakes_were_made/12_mistakes_were_made.jpg",
  "thumbnail": "src/12_mistakes_were_made/12_mistakes_were_made_thumb.jpg",
  "details": "src/12_mistakes_were_made/12_mistakes_were_made.md"
}
```

Run `npm run thumbnails` after adding or replacing artwork. This creates a
progressive, color-profile-aware 720-pixel square JPEG ending in `_thumb.jpg`
for the fast-loading gallery preview. The original image is retained for the
full artwork viewer.

The placard's first nonblank line is its title, the second is its year and
dimensions, and the remaining paragraphs are the description. Markdown heading
markers are removed for display.

This is a static site: `artworks.json` is plain JSON, and `.nojekyll` disables
Jekyll processing on GitHub Pages. Serve the repository root with any HTTP
static-file server for local preview; no generated or substituted responses are
needed. Keep that server running while browsing. Opening `index.html` directly
as a local file does not support the required fetch requests.

To publish, push these files to the branch and root folder configured as the
GitHub Pages source.