import { MathUtils } from './math-utils.ts';

const DEFAULT_VIEWER_COLOR = '#263238';
const DARK_ACCENT_LUMINANCE_THRESHOLD = 0.25;
const DARK_BEDO_ACCENT_COLOR = '#01579b';
const LIGHT_BEDO_ACCENT_COLOR = '#81d4fa';
const DARK_WORKS_ACCENT_COLOR = '#b71c1c';
const LIGHT_WORKS_ACCENT_COLOR = '#ff8a80';

const RGB_CHANNEL_MAX = 255;
const HEX_RADIX = 16;
const HEX_CHANNEL_WIDTH = 2;
const SRGB_LINEARIZATION_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const RELATIVE_LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722];

const HUE_SECTOR_COUNT = 6;
const HUE_DEGREES_PER_SECTOR = 60;
const FULL_HUE_CIRCLE_DEGREES = 360;
const HSL_LIGHTNESS_SCALE = 2;
const HUE_SECTOR_GREEN_OFFSET = 2;
const HUE_SECTOR_BLUE_OFFSET = 4;
const HUE_SECTOR_PAIR_COUNT = 2;
const NORMALIZED_COLOR_MAX = 1;
const COLOR_DISTANCE_POWER = 2;

const OKLAB_RGB_TO_LMS_MATRIX = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005]
];
const OKLAB_LMS_TO_LAB_MATRIX = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766]
];

const COLOR_SAMPLE_CANVAS_SIZE_PX = 64;
const COLOR_SAMPLE_MIN_ALPHA = 128;
const RGBA_PIXEL_STRIDE = 4;
const RGBA_GREEN_CHANNEL_OFFSET = 1;
const RGBA_BLUE_CHANNEL_OFFSET = 2;
const RGBA_ALPHA_CHANNEL_OFFSET = 3;
const COLOR_SAMPLE_MIN_LIGHTNESS = 0.04;
const COLOR_SAMPLE_MAX_LIGHTNESS = 0.94;
const COLOR_SAMPLE_NEUTRAL_MAX_SATURATION = 0.12;
const COLOR_SAMPLE_GRAY_MAX_SATURATION = 0.08;
const COLOR_SAMPLE_HUE_BAND_WIDTH_DEGREES = 20;
const COLOR_SAMPLE_SATURATION_BUCKET_COUNT = 4;
const COLOR_SAMPLE_LIGHTNESS_BUCKET_COUNT = 5;
const CHROMATIC_HUE_BAND_OFFSET = 1;
const COLOR_CLUSTER_BASE_SIGNIFICANCE = 0.65;
const COLOR_CLUSTER_SATURATION_WEIGHT = 0.7;
const ARTWORK_BACKGROUND_SATURATION_FACTOR = 0.85;
const ARTWORK_BACKGROUND_MIN_SATURATION = 0.2;
const ARTWORK_BACKGROUND_MAX_SATURATION = 0.8;
const ARTWORK_BACKGROUND_LIGHTNESS_BASE = 0.24;
const ARTWORK_BACKGROUND_LIGHTNESS_FACTOR = 0.35;
const ARTWORK_BACKGROUND_MIN_LIGHTNESS = 0.3;
const ARTWORK_BACKGROUND_MAX_LIGHTNESS = 0.48;

// Palette used to keep viewer backgrounds within the site's material colors.
const materialBackgrounds = [
  '#f44336',
  '#e53935',
  '#d32f2f',
  '#c62828',
  '#b71c1c',
  '#e91e63',
  '#d81b60',
  '#c2185b',
  '#ad1457',
  '#880e4f',
  '#9c27b0',
  '#8e24aa',
  '#7b1fa2',
  '#6a1b9a',
  '#4a148c',
  '#673ab7',
  '#5e35b1',
  '#512da8',
  '#4527a0',
  '#311b92',
  '#3f51b5',
  '#3949ab',
  '#303f9f',
  '#283593',
  '#1a237e',
  '#2196f3',
  '#1e88e5',
  '#1976d2',
  '#1565c0',
  '#0d47a1',
  '#03a9f4',
  '#039be5',
  '#0288d1',
  '#0277bd',
  '#01579b',
  '#00bcd4',
  '#00acc1',
  '#0097a7',
  '#00838f',
  '#006064',
  '#009688',
  '#00897b',
  '#00796b',
  '#00695c',
  '#004d40',
  '#4caf50',
  '#43a047',
  '#388e3c',
  '#2e7d32',
  '#1b5e20',
  '#8bc34a',
  '#7cb342',
  '#689f38',
  '#558b2f',
  '#33691e',
  '#cddc39',
  '#c0ca33',
  '#afb42b',
  '#9e9d24',
  '#827717',
  '#ffeb3b',
  '#fdd835',
  '#fbc02d',
  '#f9a825',
  '#f57f17',
  '#ffc107',
  '#ffb300',
  '#ffa000',
  '#ff8f00',
  '#ff6f00',
  '#ff9800',
  '#fb8c00',
  '#f57c00',
  '#ef6c00',
  '#e65100',
  '#ff5722',
  '#f4511e',
  '#e64a19',
  '#d84315',
  '#bf360c',
  '#795548',
  '#6d4c41',
  '#5d4037',
  '#4e342e',
  '#3e2723',
  '#9e9e9e',
  '#757575',
  '#616161',
  '#424242',
  '#212121',
  '#607d8b',
  '#546e7a',
  '#455a64',
  '#37474f',
  '#263238'
];

// Viewer palette selection.

export class ViewerColorManager {
  readonly viewerColors = new Map<string, string>();

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Required page element is missing: ${id}`);
    }
    return element as T;
  }

  /**
   * Convert an sRGB channel to its linear-light value.
   * @param {number} channel Channel value from 0 to 255.
   * @returns {number} Linear-light channel value from 0 to 1.
   */
  private linearizeSrgbChannel(channel: number): number {
    const normalizedChannel = channel / RGB_CHANNEL_MAX;

    return normalizedChannel <= SRGB_LINEARIZATION_THRESHOLD
      ? normalizedChannel / SRGB_LINEAR_DIVISOR
      : ((normalizedChannel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  }

  /**
   * Calculate the relative luminance of a six-digit hex color.
   * @param {string} hexColor Color in #RRGGBB form.
   * @returns {number} Relative luminance from 0 to 1.
   */
  private colorLuminance(hexColor: string): number {
    const channels = hexColor.match(/[a-f\d]{2}/gi)!.map((channel) => {
      return this.linearizeSrgbChannel(Number.parseInt(channel, HEX_RADIX));
    });

    return channels.reduce((luminance, channel, index) => {
      return luminance + channel * RELATIVE_LUMINANCE_WEIGHTS[index];
    }, 0);
  }

  /**
   * Apply a supported material background and matching accent colors.
   * @param {string} color Candidate background color.
   * @returns {void}
   */
  setViewerColor(color: string): void {
    const viewer = this.$('viewer');
    const normalizedColor = color.toLowerCase();
    const materialColor = materialBackgrounds.includes(normalizedColor)
      ? normalizedColor
      : DEFAULT_VIEWER_COLOR;
    const useDarkAccents = this.colorLuminance(materialColor) > DARK_ACCENT_LUMINANCE_THRESHOLD;

    viewer.style.setProperty('--viewer-color', materialColor);
    viewer.style.setProperty(
      '--viewer-bedo-color',
      useDarkAccents ? DARK_BEDO_ACCENT_COLOR : LIGHT_BEDO_ACCENT_COLOR
    );

    viewer.style.setProperty(
      '--viewer-works-color',
      useDarkAccents ? DARK_WORKS_ACCENT_COLOR : LIGHT_WORKS_ACCENT_COLOR
    );

  }

  // Color-space conversion helpers.

  /**
   * Convert RGB channel values to HSL.
   * @param {number} red Red channel from 0 to 255.
   * @param {number} green Green channel from 0 to 255.
   * @param {number} blue Blue channel from 0 to 255.
   * @returns {{hue: number, saturation: number, lightness: number}} HSL values.
   */
  private rgbToHsl(
    red: number,
    green: number,
    blue: number
  ): { hue: number; saturation: number; lightness: number } {
    red /= RGB_CHANNEL_MAX;
    green /= RGB_CHANNEL_MAX;
    blue /= RGB_CHANNEL_MAX;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const lightness = (max + min) / HSL_LIGHTNESS_SCALE;
    if (!delta) {
      return { hue: 0, saturation: 0, lightness };
    }

    let hue;
    if (max === red) {
      hue = ((green - blue) / delta) % HUE_SECTOR_COUNT;
    } else if (max === green) {
      hue = (blue - red) / delta + HUE_SECTOR_GREEN_OFFSET;
    } else {
      hue = (red - green) / delta + HUE_SECTOR_BLUE_OFFSET;
    }

    return {
      hue: (hue * HUE_DEGREES_PER_SECTOR + FULL_HUE_CIRCLE_DEGREES) % FULL_HUE_CIRCLE_DEGREES,
      saturation:
        delta /
        (NORMALIZED_COLOR_MAX - Math.abs(HSL_LIGHTNESS_SCALE * lightness - NORMALIZED_COLOR_MAX)),
      lightness
    };
  }

  /**
   * Convert HSL values to a six-digit hex color.
   * @param {number} hue Hue in degrees.
   * @param {number} saturation Saturation from 0 to 1.
   * @param {number} lightness Lightness from 0 to 1.
   * @returns {string} Hex color in #RRGGBB form.
   */
  private hslToHex(hue: number, saturation: number, lightness: number): string {
    const chroma = (NORMALIZED_COLOR_MAX - Math.abs(HSL_LIGHTNESS_SCALE * lightness - NORMALIZED_COLOR_MAX)) *
      saturation;
    const section = hue / HUE_DEGREES_PER_SECTOR;
    const second = chroma *
      (NORMALIZED_COLOR_MAX - Math.abs((section % HUE_SECTOR_PAIR_COUNT) - NORMALIZED_COLOR_MAX));
    const [red, green, blue] = section < 1
        ? [chroma, second, 0]
        : section < 2
          ? [second, chroma, 0]
          : section < 3
            ? [0, chroma, second]
            : section < 4
              ? [0, second, chroma]
              : section < 5
                ? [second, 0, chroma]
                : [chroma, 0, second];
    const match = lightness - chroma / HSL_LIGHTNESS_SCALE;
    const channels = [red, green, blue].map((channel) =>
      Math.round((channel + match) * RGB_CHANNEL_MAX)
        .toString(HEX_RADIX)
        .padStart(HEX_CHANNEL_WIDTH, '0')
    );

    return `#${channels.join('')}`;
  }

  /**
   * Convert a hex sRGB color to the OKLab color space.
   * @param {string} hexColor Color in #RRGGBB form.
   * @returns {[number, number, number]} OKLab lightness and color axes.
   */
  private colorToOklab(hexColor: string): [number, number, number] {
    const [red, green, blue] = hexColor
      .match(/[a-f\d]{2}/gi)!
      .map((channel) => this.linearizeSrgbChannel(Number.parseInt(channel, HEX_RADIX)));
    const [long, medium, short] = OKLAB_RGB_TO_LMS_MATRIX.map(
      ([redWeight, greenWeight, blueWeight]) => {
        return Math.cbrt(redWeight * red + greenWeight * green + blueWeight * blue);
      }
    );

    return OKLAB_LMS_TO_LAB_MATRIX.map(([longWeight, mediumWeight, shortWeight]) => {
      return longWeight * long + mediumWeight * medium + shortWeight * short;
    }) as [number, number, number];
  }

  /**
   * Find the palette color closest to a target in OKLab space.
   * @param {string} targetColor Candidate target color in #RRGGBB form.
   * @returns {string} The nearest supported material background.
   */
  private nearestMaterialBackground(targetColor: string): string {
    const target = this.colorToOklab(targetColor);

    return materialBackgrounds.reduce(
      (nearest, color) => {
        const candidate = this.colorToOklab(color);
        const distance = candidate.reduce((sum, channel, index) => {
          return sum + (channel - target[index]) ** COLOR_DISTANCE_POWER;
        }, 0);
        return distance < nearest.distance ? { color, distance } : nearest;
      },
      { color: DEFAULT_VIEWER_COLOR, distance: Infinity }
    ).color;
  }

  // Artwork image sampling.

  /**
   * Sample an artwork and choose its most representative material background.
   * @param {HTMLImageElement} image Loaded artwork or thumbnail image.
   * @returns {string} The nearest supported material background.
   */
  artworkBackground(image: HTMLImageElement): string {
    const canvas = document.createElement('canvas');
    canvas.width = COLOR_SAMPLE_CANVAS_SIZE_PX;
    canvas.height = COLOR_SAMPLE_CANVAS_SIZE_PX;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not create the artwork color sampling context.');
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const clusters = new Map();

    // Group similar pixels so single highlights do not dominate the result.
    for (let index = 0; index < pixels.length; index += RGBA_PIXEL_STRIDE) {
      const red = pixels[index];
      const green = pixels[index + RGBA_GREEN_CHANNEL_OFFSET];
      const blue = pixels[index + RGBA_BLUE_CHANNEL_OFFSET];
      const hsl = this.rgbToHsl(red, green, blue);
      if (
        pixels[index + RGBA_ALPHA_CHANNEL_OFFSET] < COLOR_SAMPLE_MIN_ALPHA ||
        hsl.lightness < COLOR_SAMPLE_MIN_LIGHTNESS ||
        (hsl.lightness > COLOR_SAMPLE_MAX_LIGHTNESS &&
          hsl.saturation < COLOR_SAMPLE_NEUTRAL_MAX_SATURATION)
      ) {
        continue;
      }

      const hueBand = hsl.saturation < COLOR_SAMPLE_GRAY_MAX_SATURATION
          ? 0
          : Math.floor(hsl.hue / COLOR_SAMPLE_HUE_BAND_WIDTH_DEGREES) + CHROMATIC_HUE_BAND_OFFSET;
      const saturationBand = Math.floor(hsl.saturation * COLOR_SAMPLE_SATURATION_BUCKET_COUNT);
      const lightnessBand = Math.floor(hsl.lightness * COLOR_SAMPLE_LIGHTNESS_BUCKET_COUNT);
      const key = `${hueBand}:${saturationBand}:${lightnessBand}`;
      const cluster = clusters.get(key) || {
        red: 0,
        green: 0,
        blue: 0,
        count: 0,
        significance: 0
      };
      cluster.red += red;
      cluster.green += green;
      cluster.blue += blue;
      cluster.count++;
      cluster.significance += COLOR_CLUSTER_BASE_SIGNIFICANCE + hsl.saturation * COLOR_CLUSTER_SATURATION_WEIGHT;
      clusters.set(key, cluster);
    }

    const selected = [...clusters.values()].reduce((best, cluster) => {
      return !best || cluster.significance > best.significance ? cluster : best;
    }, null);
    if (!selected) {
      return DEFAULT_VIEWER_COLOR;
    }

    const source = this.rgbToHsl(
      selected.red / selected.count,
      selected.green / selected.count,
      selected.blue / selected.count
    );

    const saturation = MathUtils.clamp(
      source.saturation * ARTWORK_BACKGROUND_SATURATION_FACTOR,
      ARTWORK_BACKGROUND_MIN_SATURATION,
      ARTWORK_BACKGROUND_MAX_SATURATION
    );

    const lightness = MathUtils.clamp(
      ARTWORK_BACKGROUND_LIGHTNESS_BASE + source.lightness * ARTWORK_BACKGROUND_LIGHTNESS_FACTOR,
      ARTWORK_BACKGROUND_MIN_LIGHTNESS,
      ARTWORK_BACKGROUND_MAX_LIGHTNESS
    );

    return this.nearestMaterialBackground(this.hslToHex(source.hue, saturation, lightness));
  }

  /**
   * Load one thumbnail and infer its background color.
   * @param {{name: string, thumbnail: string}} entry Artwork name and thumbnail path.
   * @returns {Promise<string>} Inferred background, with a fallback on failure.
   */
  private thumbnailBackground(entry: { name: string; thumbnail: string }): Promise<string> {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          resolve(this.artworkBackground(image));
        } catch (error) {
          console.error(`Failed to analyze ${entry.name} thumbnail colors:`, error);
          resolve(DEFAULT_VIEWER_COLOR);
        }
      };
      image.onerror = () => {
        console.error(`Failed to load ${entry.name} thumbnail for color analysis.`);
        resolve(DEFAULT_VIEWER_COLOR);
      };
      image.src = entry.thumbnail;
    });
  }

  /**
   * Cache background colors for a collection and update the selected artwork.
   * @param {Array<{name: string, thumbnail: string}>} entries Artwork records.
   * @param {() => string} getSelectedName Returns the currently selected artwork name.
   * @returns {Promise<void>} Resolves when all thumbnail colors have been cached.
   */
  async prepareViewerColors(
    entries: { name: string; thumbnail: string }[],
    getSelectedName: () => string
  ): Promise<void> {
    const colors = await Promise.all(entries.map((entry) => this.thumbnailBackground(entry)));
    entries.forEach((entry, index) => {
      this.viewerColors.set(entry.name, colors[index]);
    });

    const selectedColor = this.viewerColors.get(getSelectedName());
    if (selectedColor) {
      this.setViewerColor(selectedColor);
    }
  }
}

export const viewerColorManager = new ViewerColorManager();
