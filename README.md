# mrbedo.github.io
Bedoworks

## Add artwork

Run the intake script with no arguments to import images from the current directory:

```powershell
.\scripts\import-artworks.ps1
```

Pass a folder or a list of image files to import specific images:

```powershell
.\scripts\import-artworks.ps1 C:\path\to\images
.\scripts\import-artworks.ps1 .\first.jpg .\second.png
```

The script accepts JPG, JPEG, and PNG files. It prompts for each title and dimensions, creates the next numbered folder under `src`, updates `artworks.json`, and generates the new thumbnails. Dimensions can be entered as `24 18` or `24x18`; both produce `24” x 18”`.

Regenerate every thumbnail, or only selected artworks, with:

```powershell
.\scripts\generate-thumbnails.ps1
.\scripts\generate-thumbnails.ps1 -Name 12_mistakes_were_made
```

## Copyright

Copyright (c) 2026 Bedoworks. All rights reserved.

## Crawlers and AI

`robots.txt` blocks known AI crawlers from the whole site and keeps the artwork files in `src/` out of search engine image indexes. `index.html` also sets the `noai, noimageai` robots meta tag. These are opt-out signals that well-behaved bots respect; they cannot technically stop someone from copying an image shown in a browser.
