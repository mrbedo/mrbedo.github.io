import siteTextJson from './site-text.json' with { type: 'json' };

export type SiteText = typeof siteTextJson;

/** All user-facing copy, configured in site-text.json. */
export const siteText: SiteText = siteTextJson;

/** Replaces `{key}` placeholders in configured text with the supplied values. */
export function formatText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder
  );
}
