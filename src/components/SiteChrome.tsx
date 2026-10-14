import { formatText, siteText } from '../site-text.ts';

export function BrandHeading() {
  return <h1 aria-label={siteText.site.brandLabel}>{siteText.site.brand}</h1>;
}

export function CopyrightNotice({ year = new Date().getFullYear() }: { year?: number }) {
  return (
    <footer className="copyright">
      <span>{formatText(siteText.footer.copyright, { year })}</span>{' '}
      <span>{siteText.footer.rights}</span>
    </footer>
  );
}
