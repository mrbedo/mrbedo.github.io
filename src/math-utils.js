/**
 * Restrict a number to an inclusive range.
 * @param {number} value Value to restrict.
 * @param {number} minimum Lower bound.
 * @param {number} maximum Upper bound.
 * @returns {number} The restricted value.
 */
export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}


/**
 * Calculate the scale needed to fit dimensions within a bounding box.
 * @param {number} contentWidth Original content width.
 * @param {number} contentHeight Original content height.
 * @param {number} maxWidth Available width.
 * @param {number} maxHeight Available height.
 * @returns {number} Scale factor that fits both bounds.
 */
export function fitScale(contentWidth, contentHeight, maxWidth, maxHeight) {
  return Math.min(maxWidth / contentWidth, maxHeight / contentHeight);
}


/**
 * Calculate the area occupied when an aspect ratio is fitted to a bounding box.
 * @param {number} aspectRatio Content width divided by height.
 * @param {number} maxWidth Available width.
 * @param {number} maxHeight Available height.
 * @returns {number} Fitted area in square units.
 */
export function fittedArea(aspectRatio, maxWidth, maxHeight) {
  const width = Math.min(maxWidth, maxHeight * aspectRatio);
  return width * width / aspectRatio;
}