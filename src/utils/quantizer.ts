import { DMCColor } from '../types';
import { getNearestDMCColor, DMC_COLORS } from './dmc';


// -------------------------------------------------------------
// 1. K-Means Quantization
// -------------------------------------------------------------
function kmeansQuantize(pixels: Uint8ClampedArray, k: number, allowedColors?: DMCColor[]): DMCColor[] {
  // Extract unique RGB values for seeding centroids
  const uniquePixels: {r: number; g: number; b: number}[] = [];
  const step = Math.max(1, Math.floor(pixels.length / 4 / 500)); // Sample 500 pixels for seeding
  for (let i = 0; i < pixels.length; i += step * 4) {
    uniquePixels.push({
      r: pixels[i],
      g: pixels[i+1],
      b: pixels[i+2]
    });
  }

  // Initialize centroids
  let centroids: {r: number; g: number; b: number}[] = [];
  if (uniquePixels.length <= k) {
    centroids = [...uniquePixels];
  } else {
    // Select k spaced seeds
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(i * uniquePixels.length / k);
      centroids.push({ ...uniquePixels[idx] });
    }
  }

  // Run K-Means (5 iterations is fast and sufficient for grids)
  const iterations = 5;
  for (let iter = 0; iter < iterations; iter++) {
    const clusters: {r: number; g: number; b: number}[][] = Array.from({ length: k }, () => []);
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i+1];
      const b = pixels[i+2];

      let minDist = Infinity;
      let clusterIdx = 0;

      for (let j = 0; j < centroids.length; j++) {
        const dr = r - centroids[j].r;
        const dg = g - centroids[j].g;
        const db = b - centroids[j].b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
          minDist = dist;
          clusterIdx = j;
        }
      }
      clusters[clusterIdx].push({ r, g, b });
    }

    // Recompute centroids
    for (let j = 0; j < centroids.length; j++) {
      if (clusters[j].length > 0) {
        let sumR = 0, sumG = 0, sumB = 0;
        for (const p of clusters[j]) {
          sumR += p.r;
          sumG += p.g;
          sumB += p.b;
        }
        centroids[j] = {
          r: Math.round(sumR / clusters[j].length),
          g: Math.round(sumG / clusters[j].length),
          b: Math.round(sumB / clusters[j].length),
        };
      }
    }
  }

  // Map centroids to nearest DMC colors
  const paletteMap = new Map<string, DMCColor>();
  for (const c of centroids) {
    const dmc = getNearestDMCColor(c.r, c.g, c.b, allowedColors);
    paletteMap.set(dmc.code, dmc);
  }

  return Array.from(paletteMap.values());
}

// -------------------------------------------------------------
// 2. Median Cut Quantization
// -------------------------------------------------------------
interface Box {
  pixels: {r: number; g: number; b: number}[];
  minR: number; maxR: number;
  minG: number; maxG: number;
  minB: number; maxB: number;
}

function createBox(pixels: {r: number; g: number; b: number}[]): Box {
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;

  for (const p of pixels) {
    if (p.r < minR) minR = p.r;
    if (p.r > maxR) maxR = p.r;
    if (p.g < minG) minG = p.g;
    if (p.g > maxG) maxG = p.g;
    if (p.b < minB) minB = p.b;
    if (p.b > maxB) maxB = p.b;
  }

  return { pixels, minR, maxR, minG, maxG, minB, maxB };
}

function medianCutQuantize(pixels: Uint8ClampedArray, k: number, allowedColors?: DMCColor[]): DMCColor[] {
  const pts: {r: number; g: number; b: number}[] = [];
  const step = Math.max(1, Math.floor(pixels.length / 4 / 2000));
  for (let i = 0; i < pixels.length; i += step * 4) {
    pts.push({ r: pixels[i], g: pixels[i+1], b: pixels[i+2] });
  }

  if (pts.length === 0) return [DMC_COLORS[0]];

  let boxes: Box[] = [createBox(pts)];

  while (boxes.length < k) {
    // Find the box with largest volume/range to split
    let targetBoxIdx = -1;
    let maxRange = -1;

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.pixels.length < 2) continue;
      const dr = box.maxR - box.minR;
      const dg = box.maxG - box.minG;
      const db = box.maxB - box.minB;
      const r = Math.max(dr, dg, db);
      if (r > maxRange) {
        maxRange = r;
        targetBoxIdx = i;
      }
    }

    if (targetBoxIdx === -1) break; // Can't split any further

    const boxToSplit = boxes[targetBoxIdx];
    boxes.splice(targetBoxIdx, 1);

    // Determine axis with largest range
    const dr = boxToSplit.maxR - boxToSplit.minR;
    const dg = boxToSplit.maxG - boxToSplit.minG;
    const db = boxToSplit.maxB - boxToSplit.minB;

    let sortKey: 'r' | 'g' | 'b' = 'r';
    if (dg >= dr && dg >= db) sortKey = 'g';
    else if (db >= dr && db >= dg) sortKey = 'b';

    // Sort pixels and split at median
    boxToSplit.pixels.sort((a, b) => a[sortKey] - b[sortKey]);
    const medianIdx = Math.floor(boxToSplit.pixels.length / 2);
    
    boxes.push(createBox(boxToSplit.pixels.slice(0, medianIdx)));
    boxes.push(createBox(boxToSplit.pixels.slice(medianIdx)));
  }

  const paletteMap = new Map<string, DMCColor>();
  for (const box of boxes) {
    if (box.pixels.length === 0) continue;
    let sumR = 0, sumG = 0, sumB = 0;
    for (const p of box.pixels) {
      sumR += p.r;
      sumG += p.g;
      sumB += p.b;
    }
    const avgR = Math.round(sumR / box.pixels.length);
    const avgG = Math.round(sumG / box.pixels.length);
    const avgB = Math.round(sumB / box.pixels.length);
    
    const dmc = getNearestDMCColor(avgR, avgG, avgB, allowedColors);
    paletteMap.set(dmc.code, dmc);
  }

  return Array.from(paletteMap.values());
}

// -------------------------------------------------------------
// 3. Octree Quantization
// -------------------------------------------------------------
class OctreeNode {
  r = 0; g = 0; b = 0;
  pixelCount = 0;
  children: (OctreeNode | null)[] = Array(8).fill(null);
  isLeaf = false;

  constructor(public level: number) {}
}

function octreeQuantize(pixels: Uint8ClampedArray, k: number, allowedColors?: DMCColor[]): DMCColor[] {
  const root = new OctreeNode(0);
  let leafCount = 0;
  const levels: OctreeNode[][] = Array.from({ length: 9 }, () => []);

  const addColor = (node: OctreeNode, r: number, g: number, b: number) => {
    if (node.level === 8) {
      node.r += r;
      node.g += g;
      node.b += b;
      node.pixelCount++;
      if (!node.isLeaf) {
        node.isLeaf = true;
        leafCount++;
      }
      return;
    }

    // Determine index based on rgb bits
    const shift = 7 - node.level;
    const idx = (((r >> shift) & 1) << 2) |
                (((g >> shift) & 1) << 1) |
                ((b >> shift) & 1);

    if (!node.children[idx]) {
      node.children[idx] = new OctreeNode(node.level + 1);
      levels[node.level + 1].push(node.children[idx]!);
    }
    addColor(node.children[idx]!, r, g, b);
  };

  // Sample pixels to build octree
  const step = Math.max(1, Math.floor(pixels.length / 4 / 2000));
  for (let i = 0; i < pixels.length; i += step * 4) {
    addColor(root, pixels[i], pixels[i+1], pixels[i+2]);
  }

  // Reduce the leaf count to <= k by merging leaves starting from the bottom level
  for (let level = 7; level >= 0; level--) {
    if (leafCount <= k) break;
    const nodes = levels[level];
    
    // Sort nodes to reduce those with fewest pixels or children
    for (const node of nodes) {
      if (leafCount <= k) break;
      
      let sumR = 0, sumG = 0, sumB = 0;
      let count = 0;
      let childrenCount = 0;

      for (let i = 0; i < 8; i++) {
        if (node.children[i]) {
          const child = node.children[i]!;
          sumR += child.r;
          sumG += child.g;
          sumB += child.b;
          count += child.pixelCount;
          node.children[i] = null;
          childrenCount++;
          if (child.isLeaf) leafCount--;
        }
      }

      if (childrenCount > 0) {
        node.r = sumR;
        node.g = sumG;
        node.b = sumB;
        node.pixelCount = count;
        node.isLeaf = true;
        leafCount++;
      }
    }
  }

  const paletteMap = new Map<string, DMCColor>();

  const collectColors = (node: OctreeNode) => {
    if (node.isLeaf) {
      const avgR = Math.round(node.r / node.pixelCount);
      const avgG = Math.round(node.g / node.pixelCount);
      const avgB = Math.round(node.b / node.pixelCount);
      const dmc = getNearestDMCColor(avgR, avgG, avgB, allowedColors);
      paletteMap.set(dmc.code, dmc);
      return;
    }
    for (let i = 0; i < 8; i++) {
      if (node.children[i]) collectColors(node.children[i]!);
    }
  };

  collectColors(root);
  return Array.from(paletteMap.values());
}

// -------------------------------------------------------------
// Core Quantization Function
// -------------------------------------------------------------
export function quantizeImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  algorithm: 'k-means' | 'median-cut' | 'octree',
  k: number,
  dither: boolean,
  allowedColors?: DMCColor[]
): {
  pixels: { x: number; y: number; r: number; g: number; b: number; dmc: DMCColor }[];
  palette: DMCColor[];
} {
  // 1. Get the palette using the selected algorithm
  let palette: DMCColor[] = [];
  if (allowedColors && allowedColors.length > 0 && allowedColors.length <= k) {
    palette = [...allowedColors];
  } else {
    if (algorithm === 'k-means') {
      palette = kmeansQuantize(pixels, k, allowedColors);
    } else if (algorithm === 'median-cut') {
      palette = medianCutQuantize(pixels, k, allowedColors);
    } else {
      palette = octreeQuantize(pixels, k, allowedColors);
    }
  }

  // Ensure palette has at least one color
  if (palette.length === 0) palette = [DMC_COLORS[0]];

  // 2. Map every pixel to the palette, optionally applying Floyd-Steinberg dithering
  const result: { x: number; y: number; r: number; g: number; b: number; dmc: DMCColor }[] = [];
  
  if (dither) {
    // Copy the original pixel buffer to perform error diffusion
    const buffer = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      buffer[i * 3] = pixels[i * 4];
      buffer[i * 3 + 1] = pixels[i * 4 + 1];
      buffer[i * 3 + 2] = pixels[i * 4 + 2];
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const oldR = buffer[idx];
        const oldG = buffer[idx + 1];
        const oldB = buffer[idx + 2];

        // Find nearest palette color
        let minDistance = Infinity;
        let nearestColor = palette[0];

        for (const col of palette) {
          const dr = oldR - col.r;
          const dg = oldG - col.g;
          const db = oldB - col.b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDistance) {
            minDistance = dist;
            nearestColor = col;
          }
        }

        // Add to result
        result.push({ x, y, r: nearestColor.r, g: nearestColor.g, b: nearestColor.b, dmc: nearestColor });

        // Calculate quantization error
        const errR = oldR - nearestColor.r;
        const errG = oldG - nearestColor.g;
        const errB = oldB - nearestColor.b;

        // Distribute error to neighbors
        const distribute = (nx: number, ny: number, factor: number) => {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 3;
            buffer[nIdx] += errR * factor;
            buffer[nIdx + 1] += errG * factor;
            buffer[nIdx + 2] += errB * factor;
          }
        };

        distribute(x + 1, y, 7 / 16);
        distribute(x - 1, y + 1, 3 / 16);
        distribute(x, y + 1, 5 / 16);
        distribute(x + 1, y + 1, 1 / 16);
      }
    }
  } else {
    // Standard mapping (nearest color per pixel)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        // Find nearest palette color
        let minDistance = Infinity;
        let nearestColor = palette[0];

        for (const col of palette) {
          const dr = r - col.r;
          const dg = g - col.g;
          const db = b - col.b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDistance) {
            minDistance = dist;
            nearestColor = col;
          }
        }

        result.push({ x, y, r: nearestColor.r, g: nearestColor.g, b: nearestColor.b, dmc: nearestColor });
      }
    }
  }

  return { pixels: result, palette };
}
