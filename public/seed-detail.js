// Threshold follows the 90-pixel scale bar, including its displayed rounding.
export const LARGE_STRUCTURES = new Set([5, 8, 9, 13, 18, 22, 23, 24, 28]);
export const scaleBlocks = (range, width) => width > 0 ? Math.round(range * 180 / width) : 0;
export function mapStructures(points, range, width) {
  return scaleBlocks(range, width) >= 850 ? points.filter(p => LARGE_STRUCTURES.has(p.type)) : points;
}
