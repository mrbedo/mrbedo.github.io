import { siteText } from '../site-text.ts';

export function InstagramLink() {
  const { url, handle, label } = siteText.instagram;
  return (
    <a
      className="header-link instagram-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" />
      </svg>
      <span>{handle}</span>
    </a>
  );
}
