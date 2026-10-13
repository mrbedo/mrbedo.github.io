import type { ArtworkEntry } from '../artwork-catalog.ts';

export function GalleryTile({ entry }: { entry: ArtworkEntry }) {
  const title = entry.placard.title.replaceAll('\\n', ' ');

  return (
    <a href={`#${encodeURIComponent(entry.name)}`}>
      <span className="gallery-image-frame">
        <img src={entry.thumbnail} alt={title} loading="lazy" decoding="async" />
      </span>
      <span className="gallery-title" aria-hidden="true">
        {title}
      </span>
    </a>
  );
}
