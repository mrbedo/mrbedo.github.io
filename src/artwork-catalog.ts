export interface Placard {
  title: string;
  subtitle: string;
  year: string;
}

export interface ArtworkRecord {
  name: string;
  image: string;
  thumbnail: string;
  details: string;
}

export interface ArtworkEntry extends ArtworkRecord {
  placard: Placard;
}

export class ArtworkCatalog {
  private readonly fetcher: typeof fetch;
  private entriesByName = new Map<string, ArtworkEntry>();
  private orderedEntries: ArtworkEntry[] = [];

  constructor(fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.fetcher = fetcher;
  }

  get entries(): ArtworkEntry[] {
    return [...this.orderedEntries];
  }

  get(name: string): ArtworkEntry | undefined {
    return this.entriesByName.get(name);
  }

  async load(): Promise<ArtworkEntry[]> {
    const response = await this.fetcher('artworks.json');
    if (!response.ok) {
      throw new Error(`Could not load artwork list (${response.status}).`);
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every((entry) => this.isArtworkRecord(entry))) {
      throw new Error(
        'Invalid artwork list. Expected entries with name, image, thumbnail, and details paths.'
      );

    }

    const entries = await Promise.all(
      (data as ArtworkRecord[]).map((entry) => this.loadPlacard(entry))
    );

    entries.sort(
      (first, second) => Number.parseInt(second.name, 10) - Number.parseInt(first.name, 10)
    );

    this.orderedEntries = entries;
    this.entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
    return this.entries;
  }

  private isArtworkRecord(value: unknown): value is ArtworkRecord {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.name === 'string' &&
      Boolean(candidate.name) &&
      typeof candidate.image === 'string' &&
      Boolean(candidate.image) &&
      typeof candidate.thumbnail === 'string' &&
      Boolean(candidate.thumbnail) &&
      typeof candidate.details === 'string' &&
      Boolean(candidate.details)
    );

  }

  private parsePlacard(text: string): Placard {
    const [title = '', subtitle = '', year = ''] = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return { title, subtitle, year };
  }

  private async loadPlacard(entry: ArtworkRecord): Promise<ArtworkEntry> {
    const response = await this.fetcher(entry.details);
    if (!response.ok) {
      throw new Error(`Could not load ${entry.name} details (${response.status}).`);
    }

    const placard = this.parsePlacard(await response.text());
    if (!placard.title) {
      throw new Error(`Artwork title missing from ${entry.details}.`);
    }
    return { ...entry, placard };
  }
}
