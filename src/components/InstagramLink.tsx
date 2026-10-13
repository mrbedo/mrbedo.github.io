const INSTAGRAM_URL = 'https://www.instagram.com/yourmomspilledpaintintheattic';
const INSTAGRAM_HANDLE = 'yourmomspilledpaintintheattic';

export function InstagramLink() {
  return (
    <a
      className="header-link instagram-link"
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Bedoworks on Instagram"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" />
      </svg>
      <span>{INSTAGRAM_HANDLE}</span>
    </a>
  );
}
