import { DMCColor } from '../types';
import { getNearestDMCColor, DMC_COLORS, rgbToLab, getDmcLab } from './dmc';


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
    const centroidLabs = centroids.map(c => rgbToLab(c.r, c.g, c.b));
    
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i+1];
      const b = pixels[i+2];
      const pLab = rgbToLab(r, g, b);

      let minDist = Infinity;
      let clusterIdx = 0;

      for (let j = 0; j < centroids.length; j++) {
        const dL = pLab[0] - centroidLabs[j][0];
        const da = pLab[1] - centroidLabs[j][1];
        const db = pLab[2] - centroidLabs[j][2];
        const dist = dL * dL + da * da + db * db;
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

  // Map centroids to nearest DMC colors using CIELAB
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

  // 2. Map every pixel to the palette with CIELAB Delta-E distance
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
        const pIdx = (y * width + x) * 4;
        const origR = pixels[pIdx];
        const origG = pixels[pIdx + 1];
        const origB = pixels[pIdx + 2];
        const origLab = rgbToLab(origR, origG, origB);

        const bIdx = (y * width + x) * 3;
        const oldR = Math.max(0, Math.min(255, buffer[bIdx]));
        const oldG = Math.max(0, Math.min(255, buffer[bIdx + 1]));
        const oldB = Math.max(0, Math.min(255, buffer[bIdx + 2]));

        // Find nearest palette color using CIELAB + Hue Consistency Guard
        const targetLab = rgbToLab(oldR, oldG, oldB);
        let minDistance = Infinity;
        let nearestColor = palette[0];

        for (const col of palette) {
          const colLab = getDmcLab(col);
          const dL = targetLab[0] - colLab[0];
          const da = targetLab[1] - colLab[1];
          const db = targetLab[2] - colLab[2];

          // Hue/Chroma mismatch penalty against original un-dithered pixel
          // Prevents extreme stray spots and keeps skin, clothing, and background colors clean and cohesive
          const origDa = origLab[1] - colLab[1];
          const origDb = origLab[2] - colLab[2];
          const huePenalty = (origDa * origDa + origDb * origDb) * 0.16;

          // Prevent cool icy white DMC 3756 from creating white paint patch masks on warm skin tones
          // when alternative skin tones (977, 3864, or 3855) are available in the palette.
          let skinWhitePenalty = 0;
          const hasAlternativeSkinHighlight = palette.some(c => c.code === '3864' || c.code === '3855' || c.code === '977');
          const isNeutralEyeOrWhite = (origLab[1] < 10 && origLab[2] < 14) || (origR > 185 && origG > 185 && Math.abs(origR - origB) < 25);
          if (hasAlternativeSkinHighlight) {
            if (col.code === '3756' && !isNeutralEyeOrWhite && origR > 110 && origR > origB * 1.18 && origG > origB * 1.02) {
              skinWhitePenalty = 3500;
            }
          }

          const isTrueRedLip = origR > 140 && (origR - origG) > 50 && (origR - origB) > 50 && origG < origR * 0.70 && origB < origR * 0.70;
          const isSkinTone = origR > 85 && origR > origG && origG > origB && (origR - origB) > 18;

          // Strictly prevent lavender (209) from bleeding onto warm skin
          let skinLavenderPenalty = 0;
          if (col.code === '209' && isSkinTone && !isNeutralEyeOrWhite) {
            skinLavenderPenalty = 4500;
          }

          // Feature preservation bonuses:
          let darkOutlineBonus = 0;
          if (origLab[0] < 45 && (col.code === '310' || col.code === '413')) {
            darkOutlineBonus = -500;
          }

          let highlightBonus = 0;
          const isWhiteHighlight = (origR > 185 && origG > 185 && origB > 185) || (origLab[0] > 75 && Math.abs(origLab[1]) < 12 && Math.abs(origLab[2]) < 15);
          if (isWhiteHighlight && col.code === '3756') {
            highlightBonus = -450;
          }

          let redLipBonus = 0;
          let skinRedPenalty = 0;

          if (col.code === '304') {
            if (isTrueRedLip) {
              redLipBonus = -800;
            } else if (isSkinTone) {
              skinRedPenalty = 8000; // Strictly avoid red on skin
            }
          }

          let cartoonSkinBonus = 0;
          if (isSkinTone && !isTrueRedLip) {
            if (col.code === '977') {
              cartoonSkinBonus = -700; // Base illuminated golden skin
            } else if (col.code === '3855' || col.code === '3864') {
              cartoonSkinBonus = -500;
            } else if (col.code === '433' || col.code === '3862') {
              cartoonSkinBonus = -500; // Facial contour shadows (under glasses, cheek contour, nose)
            } else if (col.code === '640') {
              cartoonSkinBonus = -450; // Neck shadow & cool facial shadow
            }
          }

          let blueBonus = 0;
          if (col.code === '3843' && origB > origR * 1.12 && origB > 75) {
            blueBonus = -500;
          } else if (col.code === '3840' && (origB > origR * 1.05 || (origB > 130 && Math.abs(origB - origR) < 30))) {
            blueBonus = -450; // Forehead specular highlight & sky/glasses reflections
          }

          let lavenderBonus = 0;
          if (col.code === '209' && !isSkinTone && origR > origG && origB > origG && (origR + origB) > origG * 1.25) {
            lavenderBonus = -500; // Rich silk-screen lavender clothing
          }

          const dist = dL * dL + da * da + db * db + huePenalty + skinWhitePenalty + skinLavenderPenalty + skinRedPenalty + darkOutlineBonus + highlightBonus + redLipBonus + cartoonSkinBonus + blueBonus + lavenderBonus;
          if (dist < minDistance) {
            minDistance = dist;
            nearestColor = col;
          }
        }

        // Add to result
        result.push({ x, y, r: nearestColor.r, g: nearestColor.g, b: nearestColor.b, dmc: nearestColor });

        // Adaptive Error Diffusion:
        // Razor-sharp outlines for deep dark features and lips while smooth continuous gradients across background
        const isFacialFeature = (origLab[0] < 45) || (origR > 120 && origR > origG * 1.25 && origR > origB * 1.25);
        const errorFactor = isFacialFeature ? 0.25 : 0.75;

        const errR = (oldR - nearestColor.r) * errorFactor;
        const errG = (oldG - nearestColor.g) * errorFactor;
        const errB = (oldB - nearestColor.b) * errorFactor;

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
    // Standard mapping with CIELAB Delta-E (nearest perceptual color per pixel)
    const hasAlternativeSkinHighlight = palette.some(c => c.code === '3864' || c.code === '3855' || c.code === '977');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const origLab = rgbToLab(r, g, b);

        const targetLab = rgbToLab(r, g, b);
        let minDistance = Infinity;
        let nearestColor = palette[0];

        for (const col of palette) {
          const colLab = getDmcLab(col);
          const dL = targetLab[0] - colLab[0];
          const da = targetLab[1] - colLab[1];
          const db = targetLab[2] - colLab[2];

          // Feature preservation:
          // 1. Crisp dark facial outlines and eye features
          let darkOutlineBonus = 0;
          const origLuminance = origLab[0];
          if (origLuminance < 45 && (col.code === '310' || col.code === '413')) {
            darkOutlineBonus = -600; // Lock in crisp black/dark outlines for eyelashes, pupils, eyebrows
          }

          // 2. Crisp teeth and eye-white (sclera) highlights
          let highlightBonus = 0;
          const isWhiteHighlight = (r > 185 && g > 185 && b > 185) || (origLab[0] > 75 && Math.abs(origLab[1]) < 12 && Math.abs(origLab[2]) < 15);
          if (isWhiteHighlight && col.code === '3756') {
            highlightBonus = -500; // Pop out bright teeth and eye catchlights
          }

          // 3. Strict Red Restriction: DMC 304 ONLY for true lips and saturated crimson objects
          let redLipBonus = 0;
          let skinRedPenalty = 0;
          const isTrueRedLip = r > 140 && (r - g) > 50 && (r - b) > 50 && g < r * 0.70 && b < r * 0.70;
          const isSkinTone = (r > 80 && r > g && g > b && (r - b) > 18) || (origLab[1] > 12 && origLab[2] > 14);

          if (col.code === '304') {
            if (isTrueRedLip) {
              redLipBonus = -900; // Lock in vibrant red lips
            } else if (isSkinTone) {
              skinRedPenalty = 9999; // STRICTLY block red on skin, cheeks, forehead, nose, neck
            } else if (r < 155 || r < g * 1.5 || r < b * 1.5) {
              skinRedPenalty = 3500; // Strongly avoid red everywhere unless genuinely bright crimson
            }
          }

          // 4. Cartoon Skin Cel-Shading Affinity (Golden Ochre #977, Medium Brown #433, Khaki Gray #640)
          let cartoonSkinBonus = 0;
          if (isSkinTone && !isTrueRedLip) {
            if (col.code === '977') {
              cartoonSkinBonus = -700; // Lock in warm, radiant cartoon base skin
            } else if (col.code === '3855' || col.code === '3864') {
              cartoonSkinBonus = -550; // Cartoon skin highlight
            } else if (col.code === '433' || col.code === '3862') {
              cartoonSkinBonus = -500; // Facial contour shadows (under glasses, cheekbones, nose)
            } else if (col.code === '640') {
              cartoonSkinBonus = -450; // Neck shadow & cool facial shadow
            }
          }

          // 5. Electric Blue & Light Blue Accents (DMC 3843 & 3840)
          let blueBonus = 0;
          if (col.code === '3843' && b > r * 1.12 && b > 75) {
            blueBonus = -500; // Pop out vivid electric blue
          } else if (col.code === '3840' && (b > r * 1.05 || (b > 130 && Math.abs(b - r) < 30))) {
            blueBonus = -450; // Forehead specular highlight & sky/glasses reflections
          }

          // 6. Lavender Accent (DMC 209)
          let lavenderBonus = 0;
          if (col.code === '209' && !isSkinTone && r > g && b > g && (r + b) > g * 1.25) {
            lavenderBonus = -500; // Rich silk-screen lavender clothing
          }

          // Allow 3756 for highlights while penalizing on warm skin only if alternative skin tones exist
          let skinWhitePenalty = 0;
          let skinLavenderPenalty = 0;
          const isNeutralEyeOrWhite = (origLab[1] < 10 && origLab[2] < 14) || (r > 185 && g > 185 && Math.abs(r - b) < 25);
          if (hasAlternativeSkinHighlight) {
            if (col.code === '3756' && !isNeutralEyeOrWhite && r > 110 && r > b * 1.18 && g > b * 1.02) {
              skinWhitePenalty = 3500;
            }
          }
          if (col.code === '209' && isSkinTone && !isNeutralEyeOrWhite) {
            skinLavenderPenalty = 4500; // Strictly prevent purple on face/skin
          }

          const dist = dL * dL + da * da + db * db + skinWhitePenalty + skinLavenderPenalty + skinRedPenalty + darkOutlineBonus + highlightBonus + redLipBonus + cartoonSkinBonus + blueBonus + lavenderBonus;
          if (dist < minDistance) {
            minDistance = dist;
            nearestColor = col;
          }
        }

        result.push({ x, y, r: nearestColor.r, g: nearestColor.g, b: nearestColor.b, dmc: nearestColor });
      }
    }
  }

  // 3. Multi-Pass Spatial Regularization & Despeckle Pass
  // Consolidates isolated 1-2 pixel noise on skin, face, clothing, and background into clean,
  // bold planes of color (like authentic silk-screen and poster art), while strictly protecting
  // fine black outlines (310), dark pewter (413), catchlights (3756), and forehead/lens blue (3840).
  let currentGrid: DMCColor[][] = Array.from({ length: height }, () => new Array(width));
  result.forEach(p => { currentGrid[p.y][p.x] = p.dmc; });

  const runSmoothingPass = (grid: DMCColor[][], maxAllowedSame: number): DMCColor[][] => {
    const nextGrid: DMCColor[][] = grid.map(row => [...row]);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const cur = grid[y][x];

        // Always protect fine black outlines (310), dark gray (413), pinpoint catchlights (3756), and forehead/lens blue (3840)
        if (cur.code === '310' || cur.code === '413' || cur.code === '3756' || cur.code === '3840') {
          continue;
        }

        // Count occurrences of colors in 3x3 window (8 neighbors)
        const counts = new Map<string, { count: number; dmc: DMCColor }>();
        let matchingSelfCount = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighbor = grid[y + dy][x + dx];
            if (neighbor.code === cur.code) {
              matchingSelfCount++;
            }
            const existing = counts.get(neighbor.code);
            if (existing) {
              existing.count++;
            } else {
              counts.set(neighbor.code, { count: 1, dmc: neighbor });
            }
          }
        }

        // If the current pixel is isolated (fewer than maxAllowedSame neighbors matching it in 3x3 window)
        if (matchingSelfCount <= maxAllowedSame) {
          let maxCount = 0;
          let majorityDmc = cur;
          for (const entry of counts.values()) {
            if (entry.count > maxCount) {
              maxCount = entry.count;
              majorityDmc = entry.dmc;
            }
          }
          // Adopt the majority neighbor if strongly supported (>= 5 out of 8 neighbors when maxAllowedSame >= 2, or >= 4 otherwise)
          const threshold = maxAllowedSame >= 2 ? 5 : 4;
          if (maxCount >= threshold) {
            nextGrid[y][x] = majorityDmc;
          }
        }
      }
    }
    return nextGrid;
  };

  // Spatial Regularization / Despeckling for clean silk-screen pop art & posterized finishing:
  // Eliminates isolated 1-2 pixel noise while strictly protecting outlines (310, 413), catchlights (3756), and lips (304).
  if (!dither) {
    // Pass 1: Clean isolated 1x1 noise (matchingSelfCount === 0)
    currentGrid = runSmoothingPass(currentGrid, 0);
    // Pass 2: Clean 2-pixel noisy fragments on smooth areas (matchingSelfCount <= 1)
    currentGrid = runSmoothingPass(currentGrid, 1);
    // Pass 3: Polish boundaries on large solid fields (matchingSelfCount <= 2 when majority has >= 5)
    currentGrid = runSmoothingPass(currentGrid, 2);
  } else if (palette.length >= 7) {
    // When dithering with rich color palettes, run Pass 1 to prevent isolated single-pixel chromatic grain on skin
    currentGrid = runSmoothingPass(currentGrid, 0);
  }

  const cleanedPixels = result.map(p => {
    const dmc = currentGrid[p.y][p.x];
    return {
      ...p,
      r: dmc.r,
      g: dmc.g,
      b: dmc.b,
      dmc
    };
  });

  // 4. Return natural palette of colors assigned by CIELAB Delta-E matching
  const paletteMap = new Map<string, DMCColor>();
  cleanedPixels.forEach(p => paletteMap.set(p.dmc.code, p.dmc));

  return { pixels: cleanedPixels, palette: Array.from(paletteMap.values()) };
}

