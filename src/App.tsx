import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles, Upload, Download, RefreshCw, ZoomIn, ZoomOut, Minus, Plus, Grid, Layers, Eye, EyeOff, ArrowRightLeft, Check
} from 'lucide-react';
import { Project, GeneratedPattern, FilterType, DMCColor } from './types';
import { quantizeImage } from './utils/quantizer';
import { generatePDF } from './utils/pdfGenerator';
import { DMC_COLORS } from './utils/dmc';
import cropTipsImage from './imports/crop-tips.jpg';
import giftKaroLogo from './imports/gift-karo-logo.png';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CHANGES IN THIS REFACTOR (see chat for the full write-up):
 * 1. The ~150-line per-pixel filter routine that used to be duplicated
 *    between the full-res processor and every thumbnail preview is now a
 *    single shared `applyFilterToPixels` function. Same for the sharpen
 *    convolution (`applySharpen`) and the color-swap remap (`applyColorSwaps`).
 * 2. `MiniGridPreview` moved OUT of the App component to module scope and is
 *    wrapped in React.memo. Previously it was redefined on every App render,
 *    so React treated it as a brand-new component type each time and
 *    remounted every thumbnail (losing all in-flight work) on any state
 *    change, including totally unrelated ones like panning the viewer.
 * 3. Added `previewCache`, a small in-memory cache keyed by
 *    (filterId, image, swaps) so the 3 style cards + filmstrip don't each
 *    independently re-run k-means quantization for the same combination.
 * 4. `activeFilterPreset` is now computed once via useMemo instead of being
 *    re-derived with `.find()` in half a dozen places.
 * 5. Rapid-fire state (crop pan/zoom/rotation while dragging) is now
 *    debounced before hitting IndexedDB, and the pattern-regeneration
 *    effect is debounced so quickly clicking through several color swaps
 *    doesn't trigger a full re-quantization per click.
 * 6. Fixed a dead "Master" premium sub-filter button that pointed at a
 *    preset id ('premium') which doesn't exist in FILTER_PRESETS — selecting
 *    it silently fell back to the vintage preset while still rendering as
 *    "selected", which was a confusing latent bug.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface DiamondArtKit {
  id: string;
  packId?: string;
  name: string;
  widthCm: number;
  heightCm: number;
  shape: 'square' | 'round';
  gridWidth: number;
  gridHeight: number;
  maxColors: number;
  diamondSizeMm: number;
  description: string;
  allowedColors?: string[];
}

const DIAMOND_ART_KITS: DiamondArtKit[] = [
  {
    id: 'primary-30-40',
    packId: 'primary',
    name: 'Primary Pack (30x40)',
    widthCm: 30,
    heightCm: 40,
    shape: 'square',
    gridWidth: 115,
    gridHeight: 155,
    maxColors: 13,
    diamondSizeMm: 2.5,
    description: '2.5 mm square diamonds • 115×155 grid with 10×10 sections • 17,825 drills.',
    allowedColors: ['304', '209', '3840', '3843', '3756', '3855', '977', '433', '3864', '3862', '640', '413', '310']
  }
];

interface FilterPreset {
  id: FilterType;
  name: string;
  subtitle: string;
  description: string;
  bestFor: string;
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  sharpen: boolean;
  algorithm: 'k-means' | 'median-cut' | 'octree';
  dither: boolean;
  isGrayscale: boolean;
  allowedColors: string[];
}

const FILTER_PRESETS: FilterPreset[] = [
  // --- 1. ORIGINAL A4 (Grayscale Monochrome Portrait) ---
  {
    id: 'vintage',
    name: 'Original Monochrome',
    subtitle: 'Black & White Effect | 5 Grayscale Tones',
    description: 'High-contrast monochrome portrait utilizing 5 grayscale DMC tones for crisp eyeglasses, sharp facial outlines, and timeless contrast.',
    bestFor: 'Black & White Lovers, Minimal Look, Fine Art Portraits',
    brightness: 4,
    contrast: 26,
    saturation: -100,
    exposure: 0,
    sharpen: true,
    algorithm: 'k-means',
    dither: false,
    isGrayscale: true,
    allowedColors: ['310', '413', '640', '3864', '3756']
  },
  {
    id: 'vintage-classic',
    name: 'Vintage Sepia',
    subtitle: 'Warm Sepia Portrait | 7 Colors',
    description: 'Retro sepia look using 5 monochrome tones plus rich Golden Brown and Medium Brown highlights for classic warmth and depth.',
    bestFor: 'Retro Photos, Nostalgic Portraits, Classic Sepia Aesthetics',
    brightness: 2,
    contrast: 20,
    saturation: 10,
    exposure: 0,
    sharpen: true,
    algorithm: 'k-means',
    dither: false,
    isGrayscale: false,
    allowedColors: ['310', '413', '640', '3864', '3756', '433', '977']
  },

  // --- 3. POP-ART A4 (Vivid Pop Art Poster) ---
  {
    id: 'pop-art',
    name: 'Pop Art Poster',
    subtitle: 'Vibrant Dark Peach & Blue Reflections | Fixed 7 Colors',
    description: 'Bold Andy Warhol posterized aesthetic featuring rich Dark Peach skin tones, Electric Blue reflections for highlights, vibrant Magenta suit, and sharp outlines.',
    bestFor: 'Pop Art Fans, Vibrant Gifts, Modern Graphic Decor',
    brightness: 8,
    contrast: 30,
    saturation: 45,
    exposure: 2,
    sharpen: true,
    algorithm: 'k-means',
    dither: false,
    isGrayscale: false,
    allowedColors: ['310', '3756', '3843', '3840', '209', '304', '977']
  },

  // --- SUB-VARIANTS FOR FINE-TUNING ---
  {
    id: 'pop-art-electric',
    name: 'Pop Art Electric Blue',
    subtitle: 'Electric Blue Backdrop & Reflections | Fixed 7 Colors',
    description: 'High-energy pop art style featuring intense Electric Blue reflections and backdrop, with rich Dark Peach skin tone contrast.',
    bestFor: 'Electric Blue Fans, High Impact Art, Modern Graphic Portraits',
    brightness: 12,
    contrast: 32,
    saturation: 55,
    exposure: 3,
    sharpen: true,
    algorithm: 'k-means',
    dither: false,
    isGrayscale: false,
    allowedColors: ['310', '3756', '3843', '3840', '209', '304', '977']
  },
  {
    id: 'pop-art-warm',
    name: 'Pop Art Warm Poster',
    subtitle: 'Dark Peach & Blue Highlight Retro | Fixed 7 Colors',
    description: 'Posterized retro aesthetic emphasizing rich Dark Peach skin tones, Electric Blue reflections for highlights, and deep brown depth.',
    bestFor: 'Retro Posters, Warm Photography, Vintage Comic Art',
    brightness: 6,
    contrast: 24,
    saturation: 35,
    exposure: 2,
    sharpen: true,
    algorithm: 'k-means',
    dither: false,
    isGrayscale: false,
    allowedColors: ['310', '3756', '3843', '3840', '209', '304', '977']
  },
  {
    id: 'premium-soft',
    name: 'Premium Soft Portrait',
    subtitle: 'Gentle Tones & Smooth Skin Polish | All 13 Colors',
    description: 'Soft, delicate tonal transitions tailored for natural skin tones, smooth cheeks, and clean portrait details across all 13 colors.',
    bestFor: 'Soft Portraits, Family Photos, Baby Pictures, Soft Lighting',
    brightness: 2,
    contrast: 12,
    saturation: 8,
    exposure: 0,
    sharpen: false,
    algorithm: 'k-means',
    dither: false,
    isGrayscale: false,
    allowedColors: ['304', '209', '3840', '3843', '3756', '3855', '977', '433', '3864', '3862', '640', '413', '310']
  },
  {
    id: 'premium-contrast',
    name: 'Premium High-Contrast',
    subtitle: 'Dramatic Outlines & Clean Blocks | All 13 Colors',
    description: 'Dramatic fine-art portrait look featuring deep black hair contours, sharp eye outlines, and rich shadow depth across all 13 colors.',
    bestFor: 'Dramatic Photography, Fine Art Portraits, High Contrast Shots',
    brightness: 0,
    contrast: 24,
    saturation: 12,
    exposure: 0,
    sharpen: true,
    algorithm: 'k-means',
    dither: false,
    isGrayscale: false,
    allowedColors: ['304', '209', '3840', '3843', '3756', '3855', '977', '433', '3864', '3862', '640', '413', '310']
  }
];

const DB_NAME = 'DearGiftsDB';
const STORE_NAME = 'AppState';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToDB(key: string, value: any): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
  } catch (err) {
    console.error('Failed to save to IndexedDB', err);
  }
}

async function getFromDB(key: string): Promise<any> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to read from IndexedDB', err);
    return null;
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * SHARED IMAGE-PROCESSING PIPELINE
 * Single source of truth for the pixel math. Used by both the full-res
 * processor (triggerImageProcessing) and every MiniGridPreview thumbnail —
 * previously these were two independently maintained copies of the same
 * ~150 lines.
 * ─────────────────────────────────────────────────────────────────────────
 */

// Mutates `data` (an ImageData.data Uint8ClampedArray) in place, applying
// brightness/contrast/saturation/exposure plus the per-style effects
// (premium face/skin/background heuristics, pop-art posterization).
function applyFilterToPixels(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  filterId: string,
  preset: FilterPreset
) {
  const { brightness, contrast, saturation, exposure, isGrayscale } = preset;
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const eFactor = Math.pow(2, exposure / 50);
  const isPremiumFilter = filterId.startsWith('premium');



  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % W;
    const y = Math.floor(pixelIndex / W);

    const origR = data[i];
    const origG = data[i + 1];
    const origB = data[i + 2];

    if (isPremiumFilter) {
      const cy = H * 0.52;

      // Identify if pixel is skin or lips (lips are strictly below the nose region cy)
      const isSkin = origR > origG && origG > origB && origR > 95 && origR > origB * 1.25 && (origR - origB) > 30;
      const isLips = y > cy + H * 0.02 && origR > 125 && origR - origG > 55 && origR - origB > 65 && origG < origR * 0.68 && origB < origR * 0.65;
      const grayVal = 0.2989 * origR + 0.587 * origG + 0.114 * origB;

      // 1. Natural Subject-Shaped Background Masking
      const cx = W / 2;
      let inSubject = false;
      if (y < H * 0.52) {
        // Upper head: vertical ellipse
        const dx = (x - cx) / (W * 0.44);
        const dy = (y - cy) / (H * 0.46);
        inSubject = (dx * dx + dy * dy) <= 1.0;
      } else {
        // Lower body: trapezoid that widens to cover the shoulders
        const progress = (y - H * 0.52) / (H * 0.48); // 0 to 1
        const halfWidth = W * (0.44 + 0.36 * progress); // widens from 0.44*W to 0.80*W
        inSubject = Math.abs(x - cx) <= halfWidth;
      }

      // We only black out pixels inside the subject if they match background colors, are in the upper head area, and are definitely NOT skin/lips


      if (!inSubject) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        continue;
      }

      // 2. Sharpen key facial features (eyes, eyebrows, nostrils, outlines)
      if (grayVal < 55) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        continue;
      }

      // 3. Lips -> DMC 304 Red Medium
      if (isLips) {
        data[i] = 179;
        data[i + 1] = 22;
        data[i + 2] = 46;
        continue;
      }

      // 4. Skin -> primary skin color mapping with high-detail blend (62% original, 38% target)
      let r = origR;
      let g = origG;
      let b = origB;
      if (isSkin) {
        let targetR = 249, targetG = 212, targetB = 147; // 3855 for premium-soft
        if (filterId === 'premium-contrast') {
          targetR = 220;
          targetG = 142;
          targetB = 78; // 977 for premium-contrast
        }
        r = origR * 0.62 + targetR * 0.38;
        g = origG * 0.62 + targetG * 0.38;
        b = origB * 0.62 + targetB * 0.38;
      }

      r *= eFactor;
      g *= eFactor;
      b *= eFactor;

      r += brightness;
      g += brightness;
      b += brightness;

      r = cFactor * (r - 128) + 128;
      g = cFactor * (g - 128) + 128;
      b = cFactor * (b - 128) + 128;

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      continue;
    }

    let r = origR;
    let g = origG;
    let b = origB;

    r *= eFactor;
    g *= eFactor;
    b *= eFactor;

    r += brightness;
    g += brightness;
    b += brightness;

    r = cFactor * (r - 128) + 128;
    g = cFactor * (g - 128) + 128;
    b = cFactor * (b - 128) + 128;

    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    if (isGrayscale) {
      r = gray;
      g = gray;
      b = gray;
    } else {
      const satRatio = (saturation + 100) / 100;
      r = gray + (r - gray) * satRatio;
      g = gray + (g - gray) * satRatio;
      b = gray + (b - gray) * satRatio;
    }

    // Pop Art sub-filter enhancements
    if (filterId === 'pop-art-electric') {
      // Boost cool electric blue channel for high-energy backdrop and cool tones
      if (b > r * 0.85 && b > 70) {
        b = Math.min(255, b * 1.15 + 12);
        g = Math.min(255, g * 1.05 + 5);
      }
    } else if (filterId === 'pop-art-warm') {
      // Boost warm tones for rich retro poster warmth
      if (r > b * 1.1 && r > 80) {
        r = Math.min(255, r * 1.08 + 10);
      }
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
}

// 3x3 sharpen convolution, extracted so both call sites share it.
function applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sharpenKernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  const src = ctx.getImageData(0, 0, w, h).data;
  const dstImgData = ctx.createImageData(w, h);
  const dst = dstImgData.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const dstIdx = (y * w + x) * 4;
      let sumR = 0, sumG = 0, sumB = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const srcIdx = ((y + ky) * w + (x + kx)) * 4;
          const weight = sharpenKernel[(ky + 1) * 3 + (kx + 1)];
          sumR += src[srcIdx] * weight;
          sumG += src[srcIdx + 1] * weight;
          sumB += src[srcIdx + 2] * weight;
        }
      }

      dst[dstIdx] = Math.max(0, Math.min(255, sumR));
      dst[dstIdx + 1] = Math.max(0, Math.min(255, sumG));
      dst[dstIdx + 2] = Math.max(0, Math.min(255, sumB));
      dst[dstIdx + 3] = 255;
    }
  }
  ctx.putImageData(dstImgData, 0, 0);
}

// Remaps a quantization result's pixels/palette through the user's custom
// color swaps. Shared by the full-res processor and the previews.
function applyColorSwaps(
  result: { pixels: any[]; palette: DMCColor[] },
  customColorSwaps: Record<string, string>,
  allowedColorsList: string[]
): { pixels: any[]; palette: DMCColor[] } {
  if (Object.keys(customColorSwaps).length === 0) return result;

  const swapMap = new Map<string, DMCColor>();
  for (const [sourceCode, targetCode] of Object.entries(customColorSwaps)) {
    if (allowedColorsList.includes(sourceCode) && allowedColorsList.includes(targetCode)) {
      const targetColor = DMC_COLORS.find(c => c.code === targetCode);
      if (targetColor) {
        swapMap.set(sourceCode, targetColor);
      }
    }
  }

  if (swapMap.size === 0) return result;

  const remappedPixels = result.pixels.map(p => {
    const swappedColor = swapMap.get(p.dmc.code) || p.dmc;
    return {
      ...p,
      r: swappedColor.r,
      g: swappedColor.g,
      b: swappedColor.b,
      dmc: swappedColor
    };
  });

  const remappedPalette: DMCColor[] = [];
  const seenCodes = new Set<string>();
  for (const c of result.palette) {
    const newColor = swapMap.get(c.code) || c;
    if (!seenCodes.has(newColor.code)) {
      seenCodes.add(newColor.code);
      remappedPalette.push(newColor);
    }
  }

  return { pixels: remappedPixels, palette: remappedPalette };
}

// Generic trailing-edge debounce. Used to stop rapid drag/click bursts from
// hammering IndexedDB or triggering repeated full re-quantization passes.
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
  };
  return debounced;
}

// Module-level cache: identical (filter, image, swaps) combinations are
// quantized once even though several thumbnails (style cards + filmstrip)
// may request the same preview on the same screen.
const previewCache = new Map<string, { pixels: any[]; palette: DMCColor[] }>();
function previewCacheKey(filterId: string, croppedImage: string, swaps: Record<string, string>): string {
  // croppedImage is a data URL; a length + short prefix is enough entropy
  // to distinguish crops without hashing the entire (large) string.
  return `${filterId}::${croppedImage.length}:${croppedImage.slice(0, 64)}::${JSON.stringify(swaps)}`;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * MiniGridPreview — moved to module scope (was previously defined *inside*
 * the App component on every render, which meant React saw a new component
 * type each render and remounted every thumbnail on any unrelated state
 * change, discarding in-flight quantization work).
 * ─────────────────────────────────────────────────────────────────────────
 */
interface MiniGridPreviewProps {
  filterId: string;
  allowedColors: string[];
  croppedImage: string | null;
  customColorSwaps: Record<string, string>;
}

const MiniGridPreview = React.memo(function MiniGridPreview({
  filterId,
  allowedColors,
  croppedImage,
  customColorSwaps
}: MiniGridPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !croppedImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    setIsLoading(true);

    const previewWidth = 90;
    const previewHeight = 120;

    const drawResult = (result: { pixels: any[]; palette: DMCColor[] }) => {
      if (cancelled) return;
      // Crisp 2x retina canvas rendering
      canvas.width = 360;
      canvas.height = 480;
      const cellW = canvas.width / previewWidth;
      const cellH = canvas.height / previewHeight;

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      result.pixels.forEach(p => {
        ctx.fillStyle = p.dmc.hex;
        ctx.fillRect(p.x * cellW, p.y * cellH, cellW + 0.4, cellH + 0.4);
      });

      setIsLoading(false);
    };

    const cacheKey = previewCacheKey(filterId, croppedImage, customColorSwaps);
    const cached = previewCache.get(cacheKey);
    if (cached) {
      drawResult(cached);
      return () => { cancelled = true; };
    }

    const tempImg = new Image();
    tempImg.onload = () => {
      if (cancelled) return;

      const tempCanvas = document.createElement('canvas');
      const tCtx = tempCanvas.getContext('2d');
      if (!tCtx) {
        setIsLoading(false);
        return;
      }
      tempCanvas.width = previewWidth;
      tempCanvas.height = previewHeight;
      tCtx.imageSmoothingEnabled = true;
      tCtx.imageSmoothingQuality = 'high';
      tCtx.drawImage(tempImg, 0, 0, previewWidth, previewHeight);

      const imgData = tCtx.getImageData(0, 0, previewWidth, previewHeight);
      const preset = FILTER_PRESETS.find(p => p.id === filterId);
      if (preset) {
        applyFilterToPixels(imgData.data, previewWidth, previewHeight, filterId, preset);
        tCtx.putImageData(imgData, 0, 0);
        if (preset.sharpen) {
          applySharpen(tCtx, previewWidth, previewHeight);
          const sharpenedData = tCtx.getImageData(0, 0, previewWidth, previewHeight);
          imgData.data.set(sharpenedData.data);
        }
      }

      const allowedDMC = DMC_COLORS.filter(c => allowedColors.includes(c.code));
      let result = quantizeImage(imgData.data, previewWidth, previewHeight, 'k-means', allowedDMC.length, false, allowedDMC);

      const isGrayscalePreset = preset?.isGrayscale || filterId === 'vintage';
      if (!isGrayscalePreset) {
        result = applyColorSwaps(result, customColorSwaps, allowedColors);
      }

      previewCache.set(cacheKey, result);
      drawResult(result);
    };
    tempImg.src = croppedImage;

    return () => {
      cancelled = true;
    };
  }, [croppedImage, filterId, allowedColors, customColorSwaps]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center">
      <canvas ref={canvasRef} className="w-full h-full block object-cover" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/85">
          <RefreshCw className="h-5 w-5 text-pink-500 animate-spin" />
        </div>
      )}
    </div>
  );
});

export default function App() {
  // Wizard & Settings States - Primary Pack (30x40)
  const [selectedKit, setSelectedKit] = useState<DiamondArtKit>(DIAMOND_ART_KITS[0]);


  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [processedImageObj, setProcessedImageObj] = useState<HTMLImageElement | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('vintage');
  const [isProcessing, setIsProcessing] = useState(false);
  const [customColorSwaps, setCustomColorSwaps] = useState<Record<string, string>>({});
  const [activeSwapSourceCode, setActiveSwapSourceCode] = useState<string | null>(null);
  const [popArtSubFilter, setPopArtSubFilter] = useState<FilterType>('pop-art');
  const [premiumSubFilter, setPremiumSubFilter] = useState<FilterType>('premium-soft');
  const [vintageSubFilter, setVintageSubFilter] = useState<FilterType>('vintage');

  // Wizard Screen Router States
  const [activeScreen, setActiveScreen] = useState<'landing' | 'select-kit' | 'crop' | 'choose-style' | 'grid-viewer'>('landing');


  // Crop Editor States
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPan, setCropPan] = useState({ x: 0, y: 0 });
  const [cropRotation, setCropRotation] = useState<number>(0);

  // Refs to store crop editor dimensions for high-res cropping calculations
  const cropEditorWidthRef = useRef(600);
  const cropEditorHeightRef = useRef(450);

  // Pattern Output
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);

  // Interactive Viewer States
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const hasAutoZoomedRef = useRef(false);
  const lastFittedSizeRef = useRef({ width: 0, height: 0 });
  const viewerTouchStartDistance = useRef<number>(0);
  const viewerTouchStartZoom = useRef<number>(1);
  const [selectedColorCode, setSelectedColorCode] = useState<string | null>(null);
  const [showSymbols, setShowSymbols] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [smoothPreviewMode, setSmoothPreviewMode] = useState(false);
  const [completedCells, setCompletedCells] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Memoized lookup of the active filter preset — replaces the half-dozen
  // repeated `FILTER_PRESETS.find(f => f.id === activeFilter) || ...`
  // call sites that used to be scattered through the component.
  const activeFilterPreset = useMemo(
    () => FILTER_PRESETS.find(f => f.id === activeFilter) || FILTER_PRESETS[0],
    [activeFilter]
  );

  // Load state from IndexedDB on mount
  useEffect(() => {
    async function loadState() {
      const activeScr = await getFromDB('activeScreen');
      const origImg = await getFromDB('originalImage');
      const cropImg = await getFromDB('croppedImage');
      const actFilter = await getFromDB('activeFilter');
      const colorSwaps = await getFromDB('customColorSwaps');
      const popFilter = await getFromDB('popArtSubFilter');
      const premFilter = await getFromDB('premiumSubFilter');
      const vintFilter = await getFromDB('vintageSubFilter');
      const selKit = await getFromDB('selectedKit');
      const cropZm = await getFromDB('cropZoom');
      const cropPn = await getFromDB('cropPan');
      const cropRot = await getFromDB('cropRotation');

      if (activeScr) setActiveScreen(activeScr);
      if (origImg) setOriginalImage(origImg);
      if (cropImg) setCroppedImage(cropImg);
      if (actFilter) setActiveFilter(actFilter);
      if (colorSwaps) setCustomColorSwaps(colorSwaps);
      if (popFilter) setPopArtSubFilter(popFilter);
      if (premFilter) setPremiumSubFilter(premFilter);
      if (vintFilter) setVintageSubFilter(vintFilter);
      if (selKit) setSelectedKit(selKit);
      if (cropZm !== undefined && cropZm !== null) setCropZoom(cropZm);
      if (cropPn) setCropPan(cropPn);
      if (cropRot !== undefined && cropRot !== null) setCropRotation(cropRot);

      setIsLoaded(true);
    }
    loadState();
  }, []);

  // Save states to IndexedDB when they change, only AFTER state is loaded
  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('activeScreen', activeScreen);
  }, [activeScreen, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('originalImage', originalImage);
  }, [originalImage, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('croppedImage', croppedImage);
  }, [croppedImage, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('activeFilter', activeFilter);
  }, [activeFilter, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('customColorSwaps', customColorSwaps);
  }, [customColorSwaps, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('popArtSubFilter', popArtSubFilter);
  }, [popArtSubFilter, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('premiumSubFilter', premiumSubFilter);
  }, [premiumSubFilter, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('vintageSubFilter', vintageSubFilter);
  }, [vintageSubFilter, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    saveToDB('selectedKit', selectedKit);
  }, [selectedKit, isLoaded]);

  // Crop pan/zoom/rotation change continuously while the user drags or
  // pinches. Previously each of the three had its own useEffect that wrote
  // to IndexedDB on every single mousemove tick. Combined + debounced here
  // so a drag gesture results in one write, ~400ms after it settles.
  const debouncedSaveCropStateRef = useRef(
    debounce((pan: { x: number; y: number }, zoom: number, rotation: number) => {
      saveToDB('cropPan', pan);
      saveToDB('cropZoom', zoom);
      saveToDB('cropRotation', rotation);
    }, 400)
  );

  useEffect(() => {
    if (!isLoaded) return;
    debouncedSaveCropStateRef.current(cropPan, cropZoom, cropRotation);
  }, [cropPan, cropZoom, cropRotation, isLoaded]);

  useEffect(() => {
    return () => debouncedSaveCropStateRef.current.cancel();
  }, []);

  // Refs for viewer canvas
  const viewerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  // Load processed image object for rendering on canvas
  useEffect(() => {
    if (!processedImage) {
      setProcessedImageObj(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setProcessedImageObj(img);
    };
    img.src = processedImage;
  }, [processedImage]);

  // Clean up color swaps and reset open swap modal when activeFilter changes
  useEffect(() => {
    setActiveSwapSourceCode(null);
    if (activeFilterPreset.isGrayscale || activeFilter === 'vintage') {
      setCustomColorSwaps({});
      return;
    }
    setCustomColorSwaps(prev => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const [src, tgt] of Object.entries(prev)) {
        if (activeFilterPreset.allowedColors.includes(src) && activeFilterPreset.allowedColors.includes(tgt)) {
          next[src] = tgt;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeFilter, activeFilterPreset]);

  // Regenerate pattern when kit, filter, cropped image, or customColorSwaps
  // changes. Debounced (150ms) so quickly clicking through several color
  // swaps doesn't trigger a full re-quantization pass per click.
  const debouncedTriggerRef = useRef(debounce((fn: () => void) => fn(), 150));

  useEffect(() => {
    if (croppedImage) {
      debouncedTriggerRef.current(triggerImageProcessing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKit, activeFilter, croppedImage, customColorSwaps]);

  useEffect(() => {
    return () => debouncedTriggerRef.current.cancel();
  }, []);

  // Main Image Quantization and Processing
  const triggerImageProcessing = () => {
    if (!croppedImage) return;
    setIsProcessing(true);

    const tempImg = new Image();
    tempImg.onload = () => {
      // 1. Setup filter canvas
      const filterCanvas = document.createElement('canvas');
      const fCtx = filterCanvas.getContext('2d');
      if (!fCtx) {
        setIsProcessing(false);
        return;
      }

      filterCanvas.width = tempImg.width;
      filterCanvas.height = tempImg.height;
      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'high';
      fCtx.drawImage(tempImg, 0, 0);

      const imgData = fCtx.getImageData(0, 0, filterCanvas.width, filterCanvas.height);
      const data = imgData.data;
      const W = filterCanvas.width;
      const H = filterCanvas.height;

      const preset = activeFilterPreset;
      const { algorithm, dither, sharpen } = preset;

      // 2/3. Apply brightness/contrast/saturation/exposure + per-style effects
      applyFilterToPixels(data, W, H, activeFilter, preset);
      fCtx.putImageData(imgData, 0, 0);

      // 4. Sharpen convolution
      if (sharpen) {
        applySharpen(fCtx, filterCanvas.width, filterCanvas.height);
      }

      const filteredUrl = filterCanvas.toDataURL('image/jpeg', 0.9);
      setProcessedImage(filteredUrl);

      // 5. Downsample to grid resolution and quantize
      const quantCanvas = document.createElement('canvas');
      const qCtx = quantCanvas.getContext('2d');
      if (!qCtx) {
        setIsProcessing(false);
        return;
      }

      quantCanvas.width = selectedKit.gridWidth;
      quantCanvas.height = selectedKit.gridHeight;
      qCtx.imageSmoothingEnabled = true;
      qCtx.imageSmoothingQuality = 'high';
      qCtx.drawImage(filterCanvas, 0, 0, selectedKit.gridWidth, selectedKit.gridHeight);
      if (sharpen) {
        applySharpen(qCtx, selectedKit.gridWidth, selectedKit.gridHeight);
      }
      const gridImgData = qCtx.getImageData(0, 0, selectedKit.gridWidth, selectedKit.gridHeight);

      const allowedColorsList = preset.allowedColors;
      const allowedDMCColors = allowedColorsList
        .map(code => DMC_COLORS.find(c => c.code === code))
        .filter((c): c is DMCColor => c !== undefined);

      const maxColors = allowedDMCColors.length;

      let quantResult = quantizeImage(
        gridImgData.data,
        selectedKit.gridWidth,
        selectedKit.gridHeight,
        algorithm,
        maxColors,
        dither,
        allowedDMCColors
      );

      const isGrayscaleFilter = preset.isGrayscale || activeFilter === 'vintage';
      if (!isGrayscaleFilter) {
        quantResult = applyColorSwaps(quantResult, customColorSwaps, allowedColorsList);
      }

      // Map to final pattern format
      const totalPixels = selectedKit.gridWidth * selectedKit.gridHeight;
      const countsMap = new Map<string, number>();

      const pixels = quantResult.pixels.map(p => {
        countsMap.set(p.dmc.code, (countsMap.get(p.dmc.code) || 0) + 1);
        return {
          x: p.x,
          y: p.y,
          colorCode: p.dmc.code,
          completed: false
        };
      });

      const palette = quantResult.palette.map((c, index) => {
        const count = countsMap.get(c.code) || 0;
        return {
          ...c,
          symbol: String(index + 1), // Sequential numbering instead of glyph symbols
          count,
          percentage: (count / totalPixels) * 100
        };
      });

      setPattern({
        width: selectedKit.gridWidth,
        height: selectedKit.gridHeight,
        pixels,
        palette
      });

      // Reset viewer selections
      setCompletedCells(new Set());
      setSelectedColorCode(null);
      hasAutoZoomedRef.current = false;
      setIsProcessing(false);
    };
    tempImg.src = croppedImage;
  };

  // Image Upload handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('File size exceeds the 20MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (img.width < 300 || img.height < 300) {
          alert('Image resolution must be at least 300x300 pixels.');
          return;
        }
        setOriginalImage(event.target?.result as string);
        setCroppedImage(null);
        setActiveScreen('crop');
        setCropZoom(1);
        setCropPan({ x: 0, y: 0 });
        setCropRotation(0);
        setViewerZoom(1);
        setViewerPan({ x: 0, y: 0 });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Extract cropped portion from original image
  const applyCrop = () => {
    if (!originalImage) return;

    const img = new Image();
    img.onload = () => {
      const cropCanvas = document.createElement('canvas');
      const ctx = cropCanvas.getContext('2d');
      if (!ctx) return;

      const aspect = (selectedKit.widthCm && selectedKit.heightCm)
        ? (selectedKit.widthCm / selectedKit.heightCm)
        : (30 / 40);
      const targetWidth = 1200;
      const targetHeight = Math.round(targetWidth / aspect);

      cropCanvas.width = targetWidth;
      cropCanvas.height = targetHeight;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      ctx.save();
      ctx.translate(targetWidth / 2, targetHeight / 2);

      const canvasWidth = cropEditorWidthRef.current || 600;
      const canvasHeight = cropEditorHeightRef.current || 450;
      const pad = 40;
      const maxW = canvasWidth - pad * 2;
      const maxH = canvasHeight - pad * 2;

      let frameW = maxW;
      let frameH = maxW / aspect;
      if (frameH > maxH) {
        frameH = maxH;
        frameW = maxH * aspect;
      }

      const drawScale = targetWidth / frameW;

      ctx.rotate(cropRotation * Math.PI / 180);
      ctx.translate(cropPan.x * drawScale, cropPan.y * drawScale);

      const baseScale = Math.min(frameW / img.width, frameH / img.height);
      const imgScale = baseScale * cropZoom * drawScale;

      ctx.scale(imgScale, imgScale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      const croppedUrl = cropCanvas.toDataURL('image/jpeg', 0.95);
      setCroppedImage(croppedUrl);
      setActiveScreen('choose-style');
    };
    img.src = originalImage;
  };

  // Crop Editor Canvas Reference and Interactions
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cropIsDragging, setCropIsDragging] = useState(false);
  const cropDragStart = useRef({ x: 0, y: 0 });
  const cropTouchStartDistance = useRef<number>(0);
  const cropTouchStartZoom = useRef<number>(1);

  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setCropIsDragging(true);
    cropDragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropIsDragging) return;
    const dx = e.clientX - cropDragStart.current.x;
    const dy = e.clientY - cropDragStart.current.y;

    setCropPan(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));

    cropDragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleCropMouseUp = () => {
    setCropIsDragging(false);
  };

  const handleCropTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      setCropIsDragging(true);
      const touch = e.touches[0];
      cropDragStart.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      setCropIsDragging(false);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      cropTouchStartDistance.current = dist;
      cropTouchStartZoom.current = cropZoom;
    }
  };

  const handleCropTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      if (!cropIsDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - cropDragStart.current.x;
      const dy = touch.clientY - cropDragStart.current.y;

      setCropPan(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));

      cropDragStart.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      if (cropTouchStartDistance.current > 0) {
        const scale = dist / cropTouchStartDistance.current;
        const targetZoom = cropTouchStartZoom.current * scale;
        setCropZoom(Math.max(0.1, Math.min(15, targetZoom)));
      }
    }
  };

  const handleCropTouchEnd = () => {
    setCropIsDragging(false);
    cropTouchStartDistance.current = 0;
  };

  // Bind non-passive wheel listener directly for scroll zoom
  useEffect(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const multiplier = e.ctrlKey ? 0.015 : 0.0015;
      const zoomFactor = Math.exp(-e.deltaY * multiplier);
      setCropZoom(prev => Math.max(0.1, Math.min(15, prev * zoomFactor)));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [activeScreen]);

  // Crop Editor Drawing Effect
  useEffect(() => {
    if (!originalImage || activeScreen !== 'crop') return;

    const canvas = cropCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width || 600;
    canvas.height = rect?.height || 450;

    cropEditorWidthRef.current = canvas.width;
    cropEditorHeightRef.current = canvas.height;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const aspect = (selectedKit.widthCm && selectedKit.heightCm)
        ? (selectedKit.widthCm / selectedKit.heightCm)
        : (30 / 40);
      const pad = 40;
      const maxW = canvas.width - pad * 2;
      const maxH = canvas.height - pad * 2;

      let frameW = maxW;
      let frameH = maxW / aspect;
      if (frameH > maxH) {
        frameH = maxH;
        frameW = maxH * aspect;
      }

      const frameX = (canvas.width - frameW) / 2;
      const frameY = (canvas.height - frameH) / 2;

      // 1. Draw image behind
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(cropRotation * Math.PI / 180);
      ctx.translate(cropPan.x, cropPan.y);

      const baseScale = Math.min(frameW / img.width, frameH / img.height);
      ctx.scale(baseScale * cropZoom, baseScale * cropZoom);

      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      // 2. Draw dark mask overlay
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.save();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(frameX, frameY, frameW, frameH);
      ctx.restore();

      // 3. Draw crop frame border
      ctx.strokeStyle = '#F43F8B';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(frameX, frameY, frameW, frameH);

      // Thirds lines (grid)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(frameX + frameW / 3, frameY);
      ctx.lineTo(frameX + frameW / 3, frameY + frameH);
      ctx.moveTo(frameX + (frameW * 2) / 3, frameY);
      ctx.lineTo(frameX + (frameW * 2) / 3, frameY + frameH);
      ctx.moveTo(frameX, frameY + frameH / 3);
      ctx.lineTo(frameX + frameW, frameY + frameH / 3);
      ctx.moveTo(frameX, frameY + (frameH * 2) / 3);
      ctx.lineTo(frameX + frameW, frameY + (frameH * 2) / 3);
      ctx.stroke();
    };
    img.src = originalImage;
  }, [originalImage, activeScreen, cropPan, cropZoom, cropRotation, selectedKit]);

  // Canvas Pattern Drawing Engine (With 10x10 Grid Overlay & Diamond Drills)
  useEffect(() => {
    if (!pattern) return;

    const canvas = viewerCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 0;
    const h = rect?.height || 0;
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;

    const cellBaseSize = 16;
    const gridWidth = pattern.width * cellBaseSize;
    const gridHeight = pattern.height * cellBaseSize;

    const sizeChanged = Math.abs(lastFittedSizeRef.current.width - w) > 8 || Math.abs(lastFittedSizeRef.current.height - h) > 8;
    if ((!hasAutoZoomedRef.current || sizeChanged) && w > 0 && h > 0) {
      const fitZoomX = (w - 48) / gridWidth;
      const fitZoomY = (h - 48) / gridHeight;
      const fitZoom = Math.min(fitZoomX, fitZoomY);
      setViewerZoom(fitZoom);
      setViewerPan({ x: 0, y: 0 });
      hasAutoZoomedRef.current = true;
      lastFittedSizeRef.current = { width: w, height: h };
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.translate(canvas.width / 2 + viewerPan.x, canvas.height / 2 + viewerPan.y);
    ctx.scale(viewerZoom, viewerZoom);
    ctx.translate(-gridWidth / 2, -gridHeight / 2);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, gridWidth, gridHeight);

    const colorMap = new Map<string, { hex: string; symbol: string; r: number; g: number; b: number }>();
    pattern.palette.forEach(p => colorMap.set(p.code, { hex: p.hex, symbol: p.symbol, r: p.r, g: p.g, b: p.b }));

    const pixelGrid = new Array(pattern.height).fill(null).map(() => new Array(pattern.width).fill(null));
    pattern.pixels.forEach(p => {
      pixelGrid[p.y][p.x] = p.colorCode;
    });

    const viewLeft = (-canvas.width / 2 - viewerPan.x) / viewerZoom + gridWidth / 2;
    const viewRight = (canvas.width / 2 - viewerPan.x) / viewerZoom + gridWidth / 2;
    const viewTop = (-canvas.height / 2 - viewerPan.y) / viewerZoom + gridHeight / 2;
    const viewBottom = (canvas.height / 2 - viewerPan.y) / viewerZoom + gridHeight / 2;

    const startCellX = Math.max(0, Math.floor(viewLeft / cellBaseSize));
    const endCellX = Math.min(pattern.width - 1, Math.floor(viewRight / cellBaseSize));
    const startCellY = Math.max(0, Math.floor(viewTop / cellBaseSize));
    const endCellY = Math.min(pattern.height - 1, Math.floor(viewBottom / cellBaseSize));

    for (let y = startCellY; y <= endCellY; y++) {
      for (let x = startCellX; x <= endCellX; x++) {
        const cx = x * cellBaseSize;
        const cy = y * cellBaseSize;

        const colorCode = pixelGrid[y][x];
        const cellId = `${x},${y}`;
        const isCellCompleted = completedCells.has(cellId);

        if (isCellCompleted && !showCompleted) continue;

        const info = colorMap.get(colorCode);
        if (!info) continue;

        const isHighlighted = selectedColorCode === null || selectedColorCode === colorCode;

        ctx.fillStyle = info.hex;

        if (!smoothPreviewMode && !isHighlighted) {
          ctx.fillStyle = `rgba(${info.r}, ${info.g}, ${info.b}, 0.18)`;
        } else if (smoothPreviewMode && !isHighlighted) {
          ctx.fillStyle = `rgba(${info.r}, ${info.g}, ${info.b}, 0.30)`;
        }

        ctx.beginPath();
        if (smoothPreviewMode) {
          ctx.rect(cx - 0.2, cy - 0.2, cellBaseSize + 0.4, cellBaseSize + 0.4);
          ctx.fill();
        } else if (selectedKit.shape === 'square') {
          ctx.rect(cx + 0.4, cy + 0.4, cellBaseSize - 0.8, cellBaseSize - 0.8);
          ctx.fill();
        } else {
          ctx.arc(cx + cellBaseSize / 2, cy + cellBaseSize / 2, cellBaseSize / 2 - 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (!smoothPreviewMode && showSymbols && viewerZoom >= 0.7 && (!isCellCompleted || showCompleted)) {
          const luminance = info.r * 0.299 + info.g * 0.587 + info.b * 0.114;
          ctx.fillStyle = luminance > 130 ? '#0f172a' : '#ffffff';
          ctx.font = `bold ${cellBaseSize * 0.55}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(info.symbol, cx + cellBaseSize / 2, cy + cellBaseSize / 2 + 0.5);
        }

        if (isCellCompleted && showCompleted) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
          ctx.fillRect(cx, cy, cellBaseSize, cellBaseSize);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${cellBaseSize * 0.75}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✓', cx + cellBaseSize / 2, cy + cellBaseSize / 2);
        }
      }
    }

    if (showGridLines) {
      if (viewerZoom >= 0.95 && !smoothPreviewMode) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 0.5;
        for (let x = startCellX; x <= endCellX + 1; x++) {
          const lx = x * cellBaseSize;
          ctx.beginPath();
          ctx.moveTo(lx, startCellY * cellBaseSize);
          ctx.lineTo(lx, (endCellY + 1) * cellBaseSize);
          ctx.stroke();
        }
        for (let y = startCellY; y <= endCellY + 1; y++) {
          const ly = y * cellBaseSize;
          ctx.beginPath();
          ctx.moveTo(startCellX * cellBaseSize, ly);
          ctx.lineTo((endCellX + 1) * cellBaseSize, ly);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = 'rgba(244, 63, 139, 0.75)';
      ctx.lineWidth = Math.max(1, 1.6 / Math.min(viewerZoom, 2));

      for (let gx = 0; gx <= pattern.width; gx += 10) {
        const lx = gx * cellBaseSize;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, gridHeight);
        ctx.stroke();
      }
      if (pattern.width % 10 !== 0) {
        const lx = pattern.width * cellBaseSize;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, gridHeight);
        ctx.stroke();
      }

      for (let gy = 0; gy <= pattern.height; gy += 10) {
        const ly = gy * cellBaseSize;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(gridWidth, ly);
        ctx.stroke();
      }
      if (pattern.height % 10 !== 0) {
        const ly = pattern.height * cellBaseSize;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(gridWidth, ly);
        ctx.stroke();
      }

      ctx.strokeStyle = '#f43f8b';
      ctx.lineWidth = Math.max(1.5, 2.2 / Math.min(viewerZoom, 2));
      ctx.strokeRect(0, 0, gridWidth, gridHeight);

      if (viewerZoom >= 0.55 && !smoothPreviewMode) {
        ctx.fillStyle = 'rgba(244, 63, 139, 0.95)';
        ctx.font = `bold ${Math.max(6.5, cellBaseSize * 0.4)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (let gx = 0; gx < pattern.width; gx += 10) {
          for (let gy = 0; gy < pattern.height; gy += 10) {
            if (gx >= startCellX - 10 && gx <= endCellX && gy >= startCellY - 10 && gy <= endCellY) {
              const colLabel = `${gx + 1}-${Math.min(gx + 10, pattern.width)}`;
              const rowLabel = `${gy + 1}-${Math.min(gy + 10, pattern.height)}`;
              ctx.fillText(`${rowLabel} • ${colLabel}`, gx * cellBaseSize + 2.5, gy * cellBaseSize + 2.5);
            }
          }
        }
      }
    }

    ctx.restore();

    // Draw Minimap overlay (viewportWidth >= 640 only)
    if (viewportWidth >= 640) {
    const miniW = 120;
    const miniH = 120 * (pattern.height / pattern.width);
    const miniX = canvas.width - miniW - 16;
    const miniY = canvas.height - miniH - 16;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(miniX - 4, miniY - 4, miniW + 8, miniH + 8);
    ctx.strokeStyle = 'rgba(244, 63, 139, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(miniX - 4, miniY - 4, miniW + 8, miniH + 8);

    const offscreen = document.createElement('canvas');
    offscreen.width = pattern.width;
    offscreen.height = pattern.height;
    const oCtx = offscreen.getContext('2d');
    if (oCtx) {
      const oImgData = oCtx.createImageData(pattern.width, pattern.height);
      const oData = oImgData.data;

      pattern.pixels.forEach(p => {
        const info = colorMap.get(p.colorCode);
        if (info) {
          const idx = (p.y * pattern.width + p.x) * 4;
          const isCellCompleted = completedCells.has(`${p.x},${p.y}`);

          if (isCellCompleted && !showCompleted) {
            oData[idx] = 30;
            oData[idx + 1] = 41;
            oData[idx + 2] = 59;
            oData[idx + 3] = 51;
          } else {
            oData[idx] = info.r;
            oData[idx + 1] = info.g;
            oData[idx + 2] = info.b;
            oData[idx + 3] = 255;
          }
        }
      });
      oCtx.putImageData(oImgData, 0, 0);

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, miniX, miniY, miniW, miniH);
    }

    const mapLeft = miniX + (viewLeft / gridWidth) * miniW;
    const mapRight = miniX + (viewRight / gridWidth) * miniW;
    const mapTop = miniY + (viewTop / gridHeight) * miniH;
    const mapBottom = miniY + (viewBottom / gridHeight) * miniH;

    ctx.strokeStyle = 'rgba(244, 63, 139, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(
      Math.max(miniX, mapLeft),
      Math.max(miniY, mapTop),
      Math.min(miniW, mapRight - mapLeft),
      Math.min(miniH, mapBottom - mapTop)
    );

    }
  }, [pattern, processedImageObj, viewerZoom, viewerPan, selectedColorCode, showSymbols, showCompleted, showGridLines, smoothPreviewMode, completedCells, selectedKit, viewportWidth]);

  // Shared helper for completing/uncompleting cells via click or touch tap
  const handleCellInteraction = (clientX: number, clientY: number) => {
    if (!pattern) return;
    const canvas = viewerCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const cellBaseSize = 16;
    const gridWidth = pattern.width * cellBaseSize;
    const gridHeight = pattern.height * cellBaseSize;

    const worldX = (clickX - canvas.width / 2 - viewerPan.x) / viewerZoom + gridWidth / 2;
    const worldY = (clickY - canvas.height / 2 - viewerPan.y) / viewerZoom + gridHeight / 2;

    const cellX = Math.floor(worldX / cellBaseSize);
    const cellY = Math.floor(worldY / cellBaseSize);

    if (cellX >= 0 && cellX < pattern.width && cellY >= 0 && cellY < pattern.height) {
      const cellKey = `${cellX},${cellY}`;
      const newCompleted = new Set(completedCells);
      if (newCompleted.has(cellKey)) {
        newCompleted.delete(cellKey);
      } else {
        newCompleted.add(cellKey);
      }
      setCompletedCells(newCompleted);
    }
  };

  const handleViewerMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pattern) return;

    const canvas = viewerCanvasRef.current;
    if (!canvas) return;

    isDraggingRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleViewerMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pattern) return;

    const canvas = viewerCanvasRef.current;
    if (!canvas) return;

    canvas.style.cursor = 'grab';

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      isDraggingRef.current = true;
    }

    if (e.buttons === 1 || e.buttons === 2) {
      canvas.style.cursor = 'grabbing';
      setViewerPan(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleViewerMouseUp = () => {
    // Panning complete
  };

  const handleViewerClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pattern || isDraggingRef.current) return;
    handleCellInteraction(e.clientX, e.clientY);
  };

  const handleViewerTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!pattern) return;
    if (e.touches.length === 1) {
      isDraggingRef.current = false;
      const touch = e.touches[0];
      dragStartRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      isDraggingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      viewerTouchStartDistance.current = dist;
      viewerTouchStartZoom.current = viewerZoom;
    }
  };

  const handleViewerTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!pattern) return;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartRef.current.x;
      const dy = touch.clientY - dragStartRef.current.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDraggingRef.current = true;
      }

      setViewerPan(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));
      dragStartRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      if (viewerTouchStartDistance.current > 0) {
        const scale = dist / viewerTouchStartDistance.current;
        const targetZoom = viewerTouchStartZoom.current * scale;
        setViewerZoom(Math.max(0.05, Math.min(10, targetZoom)));
      }
    }
  };

  const handleViewerTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!pattern) return;
    viewerTouchStartDistance.current = 0;

    if (!isDraggingRef.current && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      handleCellInteraction(touch.clientX, touch.clientY);
    }
  };

  // Bind non-passive wheel listener directly to viewer canvas for smooth scrolling zoom
  useEffect(() => {
    const canvas = viewerCanvasRef.current;
    if (!canvas || activeScreen !== 'grid-viewer') return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const multiplier = e.ctrlKey ? 0.015 : 0.0015;
      const zoomFactor = Math.exp(-e.deltaY * multiplier);
      setViewerZoom(prev => Math.max(0.05, Math.min(10, prev * zoomFactor)));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [activeScreen]);

  // PDF Download action
  const triggerPDFExport = () => {
    if (!pattern || !processedImage) return;

    const updatedPixels = pattern.pixels.map(p => ({
      ...p,
      completed: completedCells.has(`${p.x},${p.y}`)
    }));

    let patternPreviewUrl = processedImage;
    if (pattern) {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = pattern.width * 6;
      pCanvas.height = pattern.height * 6;
      const pCtx = pCanvas.getContext('2d');
      if (pCtx) {
        const paletteMap = new Map<string, string>();
        pattern.palette.forEach(c => paletteMap.set(c.code, c.hex));

        pattern.pixels.forEach(p => {
          const hex = paletteMap.get(p.colorCode) || '#000000';
          pCtx.fillStyle = hex;
          pCtx.fillRect(p.x * 6, p.y * 6, 6, 6);
        });
        patternPreviewUrl = pCanvas.toDataURL('image/jpeg', 0.95);
      }
    }

    const finalProject: Project = {
      id: `giftkaro-kit-${selectedKit.id}`,
      name: `${selectedKit.name} - ${activeFilterPreset.name}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      originalImage: originalImage || '',
      processedImage: patternPreviewUrl,
      editorSettings: {
        brightness: activeFilterPreset.brightness,
        contrast: activeFilterPreset.contrast,
        saturation: activeFilterPreset.saturation,
        exposure: activeFilterPreset.exposure,
        sharpen: activeFilterPreset.sharpen,
        rotate: 0,
        flipH: false,
        flipV: false,
        crop: null
      },
      canvasSettings: {
        preset: selectedKit.id,
        widthCm: selectedKit.widthCm,
        heightCm: selectedKit.heightCm,
        shape: selectedKit.shape
      },
      resolutionSettings: {
        preset: 'medium',
        width: selectedKit.gridWidth,
        height: selectedKit.gridHeight
      },
      colorSettings: {
        paletteType: 'dmc',
        maxColors: activeFilterPreset.allowedColors.length,
        dither: activeFilterPreset.dither,
        algorithm: activeFilterPreset.algorithm
      },
      pattern: { ...pattern, pixels: updatedPixels },
      isUnlocked: true
    };

    generatePDF(finalProject);
  };

  // --- WIZARD PAGE RENDER FUNCTIONS ---

  const renderLandingScreen = () => {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-gradient-to-b from-purple-50/40 via-pink-50/30 to-slate-100 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[550px] bg-gradient-to-tr from-pink-500/10 to-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl w-full text-center space-y-6 z-10 my-auto">
          <div className="flex justify-center mb-2">
            <div className="p-4 sm:p-5 bg-white/90 rounded-3xl shadow-lg border border-purple-100/80 backdrop-blur-md transition-transform duration-300 hover:scale-105">
              <img
                src={giftKaroLogo}
                alt="Gift Karo Official Logo"
                className="h-16 sm:h-24 w-auto object-contain max-w-[280px] sm:max-w-[360px]"
              />
            </div>
          </div>

          <div className="inline-flex items-center space-x-2 bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200/80 px-4 py-1.5 rounded-full text-pink-600 text-xs font-black uppercase tracking-wider shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-pink-500" />
            <span className="text-dear-gradient font-black">Official Diamond Art Creator</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight text-slate-900">
            Custom Diamond Painting Grid Guide
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed font-medium">
            Turn your treasured memories & custom photos into precision diamond grid instructions with physical DMC kit color matching.
          </p>

          <div className="pt-4 max-w-md mx-auto w-full">
            <div className="bg-white/95 border border-purple-100 hover:border-pink-300 rounded-3xl p-7 sm:p-8 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/10 flex flex-col items-center space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-dear-gradient flex items-center justify-center text-white shadow-md shadow-pink-500/20">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900">Create Your Diamond Art</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Select your kit size, upload a photo, adjust composition, and preview 3 distinct art styles instantly!
                </p>
              </div>
              <button
                onClick={() => {
                  setOriginalImage(null);
                  setCroppedImage(null);
                  setPattern(null);
                  setActiveScreen('select-kit');
                }}
                className="w-full py-4 rounded-full bg-dear-gradient hover:opacity-95 text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-pink-500/25 transition duration-200 active:scale-[0.98] cursor-pointer text-center"
              >
                Upload Photo / View Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };



  const renderSelectKitScreen = () => {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 p-6 sm:p-8 max-w-3xl mx-auto w-full relative justify-center">
        <button
          onClick={() => setActiveScreen('landing')}
          className="inline-flex items-center space-x-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:text-slate-800 mb-6 cursor-pointer self-start transition duration-150"
        >
          <span>← Back</span>
        </button>

        <div className="mb-6">
          <span className="text-[11px] font-bold uppercase tracking-wider text-pink-500">Step 1 of 3</span>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 mt-1">Configure & Upload</h2>
          <p className="text-xs text-slate-500 mt-1">
            Choose your diamond painting kit type, canvas dimensions, and upload your photo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">1. Select Art Kit</h3>

            <div className="space-y-2.5">
              {DIAMOND_ART_KITS.map(kit => {
                const isSelected = selectedKit.id === kit.id;
                return (
                  <button
                    key={kit.id}
                    onClick={() => setSelectedKit(kit)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition duration-200 relative group flex items-start space-x-3.5 cursor-pointer ${isSelected
                        ? 'bg-white border-pink-500 shadow-md'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${isSelected ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-600 group-hover:text-slate-800'
                      }`}>
                      ■
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-800 truncate">{kit.name}</span>
                        <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                          {kit.widthCm}x{kit.heightCm} cm
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 leading-normal">{kit.description}</p>
                      <div className="flex items-center space-x-2 mt-2 text-[9px] font-bold text-slate-600 flex-wrap gap-y-1">
                        <span>Grid: {kit.gridWidth} x {kit.gridHeight}</span>
                        <span>•</span>
                        <span className="text-pink-600">{(kit.gridWidth * kit.gridHeight).toLocaleString()} drills</span>
                        <span>•</span>
                        <span>{kit.diamondSizeMm} mm</span>
                        <span>•</span>
                        <span className="text-emerald-600">Pack: {
                          kit.gridWidth === 107 && kit.gridHeight === 143 ? '16,000' :
                            kit.gridWidth === 143 && kit.gridHeight === 179 ? '26,500' :
                              kit.gridWidth === 75 && kit.gridHeight === 100 ? '7,800' :
                                kit.gridWidth === 100 && kit.gridHeight === 125 ? '13,000' :
                                  (Math.ceil((kit.gridWidth * kit.gridHeight * 1.04) / 500) * 500).toLocaleString()
                        } beads</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">2. Upload Your Image</h3>

            <input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              ref={hiddenFileInputRef}
              onChange={handleImageUpload}
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              className="hidden"
            />

            <button
              onClick={() => hiddenFileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 hover:border-pink-500/50 rounded-3xl p-8 text-center bg-slate-100/50 transition cursor-pointer relative group flex flex-col items-center justify-center min-h-[220px]"
            >
              <Upload className="h-10 w-10 text-slate-500 group-hover:text-pink-500 transition mb-3" />
              <span className="text-sm font-bold text-slate-800 block mb-1">Click to select photo</span>
              <span className="text-[10px] text-slate-600 max-w-[200px] leading-normal mx-auto">
                Supports PNG, JPG, WEBP formats up to 15MB file size
              </span>
            </button>

            <div className="w-full rounded-2xl overflow-hidden border border-slate-200 bg-white p-3 shadow-xs space-y-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block text-center">
                Tips for the best result
              </span>
              <img src={cropTipsImage} alt="Crop tips" className="w-full object-contain max-h-[140px]" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCropScreen = () => {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-between p-6 bg-slate-50 text-slate-900 relative">
        <input
          type="file"
          accept="image/png, image/jpeg, image/webp"
          ref={hiddenFileInputRef}
          onChange={handleImageUpload}
          onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
          className="hidden"
        />

        <div className="w-full text-center mt-1 sm:mt-2 px-2">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-pink-500">Step 2 of 3</span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 mt-0.5 sm:mt-1">Select the desired area</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1 max-w-md mx-auto leading-normal">
            Drag the photo to pan • Pinch or use buttons below to zoom
          </p>
        </div>

        <div className="flex-1 w-full min-h-[260px] max-h-[360px] sm:max-h-[460px] my-4 sm:my-6 flex items-center justify-center relative bg-slate-100/50 border border-slate-200 rounded-3xl overflow-hidden shadow-inner">
          <canvas
            ref={cropCanvasRef}
            onMouseDown={handleCropMouseDown}
            onMouseMove={handleCropMouseMove}
            onMouseUp={handleCropMouseUp}
            onMouseLeave={handleCropMouseUp}
            onTouchStart={handleCropTouchStart}
            onTouchMove={handleCropTouchMove}
            onTouchEnd={handleCropTouchEnd}
            className="max-w-full max-h-full block cursor-move touch-none"
          />
        </div>

        <div className="flex items-center justify-center space-x-3 sm:space-x-5 mb-6 sm:mb-8 max-w-full px-2">
          <button
            onClick={() => hiddenFileInputRef.current?.click()}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Upload New Photo"
          >
            <Upload className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button
            onClick={() => setCropZoom(prev => Math.max(0.1, prev - 0.1))}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Zoom Out"
          >
            <Minus className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button
            onClick={() => setCropRotation(prev => (prev + 90) % 360)}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Rotate 90°"
          >
            <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button
            onClick={() => setCropZoom(prev => Math.min(15, prev + 0.1))}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Zoom In"
          >
            <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="flex items-center space-x-3 sm:space-x-4 w-full max-w-sm mb-2 sm:mb-4 shrink-0">
          <button
            onClick={() => {
              setActiveScreen('select-kit');
            }}
            className="flex-1 py-3 px-4 sm:py-3.5 sm:px-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-xs tracking-wider uppercase hover:bg-slate-200 active:scale-95 transition cursor-pointer text-center font-bold"
          >
            Back
          </button>
          <button
            onClick={applyCrop}
            className="flex-1 py-3 px-4 sm:py-3.5 sm:px-6 rounded-full bg-pink-600 text-white font-extrabold text-xs tracking-wider uppercase hover:bg-pink-500 active:scale-95 transition cursor-pointer text-center font-bold"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const renderChooseStyleScreen = () => {
    return (
      <div className="flex-1 w-full bg-slate-50 p-4 sm:p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">

          {/* Header */}
          <div className="border-b border-slate-200 pb-4 sm:pb-5 flex flex-col sm:flex-row items-center justify-between text-center sm:text-left gap-4">
            <div>
              <button
                onClick={() => setActiveScreen('crop')}
                className="inline-flex items-center space-x-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:text-slate-800 cursor-pointer transition duration-150 mb-1.5"
              >
                <span>← Back to Crop</span>
              </button>
              <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent uppercase tracking-tight">
                Choose Your Art Style
              </h2>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                4 Unique Aesthetic Styles • Select Your Preferred Diamond Art Guide
              </p>
            </div>
            <div className="flex items-center space-x-2 bg-white border border-slate-200 px-3.5 py-1.5 rounded-full shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-700 font-mono">
                Canvas: {selectedKit.widthCm}x{selectedKit.heightCm} cm ({selectedKit.gridWidth}x{selectedKit.gridHeight})
              </span>
            </div>
          </div>

          {/* 4 Style Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">

            {/* CARD 1: ORIGINAL MONOCHROME */}
            {(() => {
              const preset = FILTER_PRESETS[0]; // 'vintage'
              const allowedDMC = DMC_COLORS.filter(c => preset.allowedColors.includes(c.code));
              return (
                <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 hover:border-pink-300 hover:shadow-lg transition duration-200 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center space-x-1.5 bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-slate-200">
                        <span>Style 1: Monochrome</span>
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-700 leading-normal pt-1">
                        {preset.subtitle}
                      </h3>
                      <p className="text-[10px] text-slate-500 leading-relaxed px-1">
                        {preset.description}
                      </p>
                    </div>

                    <div className="flex flex-col items-center space-y-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        Diamond Art Style Preview
                      </span>
                      <div className="w-[160px] h-[213px] rounded-2xl overflow-hidden border border-slate-200 shadow-md shrink-0 relative">
                        <MiniGridPreview
                          filterId={preset.id}
                          allowedColors={preset.allowedColors}
                          croppedImage={croppedImage}
                          customColorSwaps={customColorSwaps}
                        />
                        <div className="absolute bottom-2 right-2 bg-slate-900/90 text-white font-black text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md border border-white/20">
                          MONOCHROME A4
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          Palette Used
                        </span>
                        <span className="text-[9px] font-extrabold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100 font-mono">
                          {preset.allowedColors.length} Colors (Fixed)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1.5 max-h-[140px] overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-100">
                        {allowedDMC.map((c, sIdx) => {
                          const symbol = String(sIdx + 1);
                          return (
                            <div key={c.code} className="flex flex-col items-center bg-white border border-slate-200 p-1.5 rounded-xl min-w-[40px] shrink-0 text-center shadow-xs">
                              <div className="w-4.5 h-4.5 rounded border border-slate-200 shadow-inner flex items-center justify-center" style={{ backgroundColor: c.hex }}>
                                <span className="text-[8px] font-black text-slate-950 font-sans" style={{ color: (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 128 ? '#000000' : '#ffffff' }}>
                                  {symbol}
                                </span>
                              </div>
                              <span className="text-[8px] font-black text-slate-800 mt-1 font-mono">#{c.code}</span>
                              <span className="text-[6px] text-slate-500 font-semibold truncate max-w-[42px]">{c.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block text-center">
                        Palette Type:
                      </span>
                      <div className="py-1.5 px-2 text-[9px] font-extrabold rounded-xl text-center bg-slate-100 text-slate-700">
                        Pure Grayscale (5 DMC Tones)
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 text-center leading-normal pt-2 border-t border-slate-100">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Best For: </span>
                      <span className="text-slate-800 font-bold">{preset.bestFor}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveFilter('vintage');
                      hasAutoZoomedRef.current = false;
                      setActiveScreen('grid-viewer');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-pink-600 hover:bg-pink-500 text-white font-black text-xs uppercase tracking-wider transition duration-150 cursor-pointer active:scale-95 shadow-md shadow-pink-600/10 mt-2"
                  >
                    Select Monochrome
                  </button>
                </div>
              );
            })()}

            {/* CARD 2: VINTAGE SEPIA */}
            {(() => {
              const preset = FILTER_PRESETS[1]; // 'vintage-classic'
              const allowedDMC = DMC_COLORS.filter(c => preset.allowedColors.includes(c.code));
              return (
                <div className="bg-white border border-amber-200/80 rounded-3xl p-5 space-y-4 hover:border-amber-400 hover:shadow-lg transition duration-200 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center space-x-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-amber-200/60">
                        <span>Style 2: Vintage Sepia</span>
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-700 leading-normal pt-1">
                        {preset.subtitle}
                      </h3>
                      <p className="text-[10px] text-slate-500 leading-relaxed px-1">
                        {preset.description}
                      </p>
                    </div>

                    <div className="flex flex-col items-center space-y-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        Diamond Art Style Preview
                      </span>
                      <div className="w-[160px] h-[213px] rounded-2xl overflow-hidden border border-slate-200 shadow-md shrink-0 relative">
                        <MiniGridPreview
                          filterId={preset.id}
                          allowedColors={preset.allowedColors}
                          croppedImage={croppedImage}
                          customColorSwaps={customColorSwaps}
                        />
                        <div className="absolute bottom-2 right-2 bg-amber-950/90 text-amber-200 font-black text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md border border-amber-400/30">
                          VINTAGE SEPIA
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          Palette Used
                        </span>
                        <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-mono">
                          {preset.allowedColors.length} Colors (Fixed)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1.5 max-h-[140px] overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-100">
                        {allowedDMC.map((c, sIdx) => {
                          const symbol = String(sIdx + 1);
                          return (
                            <div key={c.code} className="flex flex-col items-center bg-white border border-slate-200 p-1.5 rounded-xl min-w-[40px] shrink-0 text-center shadow-xs">
                              <div className="w-4.5 h-4.5 rounded border border-slate-200 shadow-inner flex items-center justify-center" style={{ backgroundColor: c.hex }}>
                                <span className="text-[8px] font-black text-slate-950 font-sans" style={{ color: (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 128 ? '#000000' : '#ffffff' }}>
                                  {symbol}
                                </span>
                              </div>
                              <span className="text-[8px] font-black text-slate-800 mt-1 font-mono">#{c.code}</span>
                              <span className="text-[6px] text-slate-500 font-semibold truncate max-w-[42px]">{c.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block text-center">
                        Palette Type:
                      </span>
                      <div className="py-1.5 px-2 text-[9px] font-extrabold rounded-xl text-center bg-amber-50 text-amber-800 border border-amber-200/60">
                        Warm Sepia & Brown Tones
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 text-center leading-normal pt-2 border-t border-slate-100">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Best For: </span>
                      <span className="text-slate-800 font-bold">{preset.bestFor}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveFilter('vintage-classic');
                      hasAutoZoomedRef.current = false;
                      setActiveScreen('grid-viewer');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-wider transition duration-150 cursor-pointer active:scale-95 shadow-md shadow-amber-600/20 mt-2"
                  >
                    Select Vintage Sepia
                  </button>
                </div>
              );
            })()}

            {/* CARD 3: POP ART */}
            {(() => {
              const preset = FILTER_PRESETS.find(p => p.id === popArtSubFilter) || FILTER_PRESETS[2];
              const allowedDMC = DMC_COLORS.filter(c => preset.allowedColors.includes(c.code));
              return (
                <div className="bg-white border border-pink-200 rounded-3xl p-5 space-y-4 hover:border-pink-400 hover:shadow-lg transition duration-200 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center space-x-1.5 bg-pink-50 text-pink-600 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-pink-100">
                        <span>Style 3: Pop Art</span>
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-700 leading-normal pt-1">
                        {preset.subtitle}
                      </h3>
                      <p className="text-[10px] text-slate-500 leading-relaxed px-1">
                        {preset.description}
                      </p>
                    </div>

                    <div className="flex flex-col items-center space-y-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        Diamond Art Style Preview
                      </span>
                      <div className="w-[160px] h-[213px] rounded-2xl overflow-hidden border border-slate-200 shadow-md shrink-0 relative">
                        <MiniGridPreview
                          filterId={preset.id}
                          allowedColors={preset.allowedColors}
                          croppedImage={croppedImage}
                          customColorSwaps={customColorSwaps}
                        />
                        <div className="absolute bottom-2 right-2 bg-slate-900/90 text-white font-black text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md border border-white/20">
                          POP-ART A4
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          Palette Used
                        </span>
                        <span className="text-[9px] font-extrabold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100 font-mono">
                          {preset.allowedColors.length} Colors (Fixed)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1.5 max-h-[140px] overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-100">
                        {allowedDMC.map((c, sIdx) => {
                          const symbol = String(sIdx + 1);
                          return (
                            <div key={c.code} className="flex flex-col items-center bg-white border border-slate-200 p-1.5 rounded-xl min-w-[40px] shrink-0 text-center shadow-xs">
                              <div className="w-4.5 h-4.5 rounded border border-slate-200 shadow-inner flex items-center justify-center" style={{ backgroundColor: c.hex }}>
                                <span className="text-[8px] font-black text-slate-950 font-sans" style={{ color: (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 128 ? '#000000' : '#ffffff' }}>
                                  {symbol}
                                </span>
                              </div>
                              <span className="text-[8px] font-black text-slate-800 mt-1 font-mono">#{c.code}</span>
                              <span className="text-[6px] text-slate-500 font-semibold truncate max-w-[42px]">{c.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block text-center">
                        Pop Art Style Options:
                      </span>
                      <div className="flex items-center justify-center space-x-1">
                        {[
                          { id: 'pop-art', label: 'Classic' },
                          { id: 'pop-art-electric', label: 'Electric' },
                          { id: 'pop-art-warm', label: 'Warm' }
                        ].map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => setPopArtSubFilter(sub.id as FilterType)}
                            className={`flex-1 py-1.5 text-[9px] font-extrabold rounded-xl transition cursor-pointer text-center ${popArtSubFilter === sub.id
                                ? 'bg-pink-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 text-center leading-normal pt-2 border-t border-slate-100">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Best For: </span>
                      <span className="text-slate-800 font-bold">{preset.bestFor}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveFilter(popArtSubFilter);
                      hasAutoZoomedRef.current = false;
                      setActiveScreen('grid-viewer');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-pink-600 hover:bg-pink-500 text-white font-black text-xs uppercase tracking-wider transition duration-150 cursor-pointer active:scale-95 shadow-md shadow-pink-600/10 mt-2"
                  >
                    Select Pop Art ({preset.name})
                  </button>
                </div>
              );
            })()}

            {/* CARD 4: PREMIUM */}
            {(() => {
              const preset = FILTER_PRESETS.find(p => p.id === premiumSubFilter) || FILTER_PRESETS[5];
              const allowedDMC = DMC_COLORS.filter(c => preset.allowedColors.includes(c.code));
              return (
                <div className="bg-white border border-purple-200/80 rounded-3xl p-5 space-y-4 hover:border-purple-400 hover:shadow-lg transition duration-200 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center space-x-1.5 bg-purple-50 text-purple-600 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-purple-100">
                        <span>Style 4: Premium</span>
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-700 leading-normal pt-1">
                        {preset.subtitle}
                      </h3>
                      <p className="text-[10px] text-slate-500 leading-relaxed px-1">
                        {preset.description}
                      </p>
                    </div>

                    <div className="flex flex-col items-center space-y-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        Diamond Art Style Preview
                      </span>
                      <div className="w-[160px] h-[213px] rounded-2xl overflow-hidden border border-slate-200 shadow-md shrink-0 relative">
                        <MiniGridPreview
                          filterId={preset.id}
                          allowedColors={preset.allowedColors}
                          croppedImage={croppedImage}
                          customColorSwaps={customColorSwaps}
                        />
                        <div className="absolute bottom-2 right-2 bg-purple-950/90 text-purple-200 font-black text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md border border-purple-400/30">
                          PREMIUM A4
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          Palette Used
                        </span>
                        <span className="text-[9px] font-extrabold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 font-mono">
                          {preset.allowedColors.length} Colors (Full)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1.5 max-h-[140px] overflow-y-auto p-1 bg-slate-50/70 rounded-xl border border-slate-100">
                        {allowedDMC.map((c, sIdx) => {
                          const symbol = String(sIdx + 1);
                          return (
                            <div key={c.code} className="flex flex-col items-center bg-white border border-slate-200 p-1.5 rounded-xl min-w-[40px] shrink-0 text-center shadow-xs">
                              <div className="w-4.5 h-4.5 rounded border border-slate-200 shadow-inner flex items-center justify-center" style={{ backgroundColor: c.hex }}>
                                <span className="text-[8px] font-black text-slate-950 font-sans" style={{ color: (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 128 ? '#000000' : '#ffffff' }}>
                                  {symbol}
                                </span>
                              </div>
                              <span className="text-[8px] font-black text-slate-800 mt-1 font-mono">#{c.code}</span>
                              <span className="text-[6px] text-slate-500 font-semibold truncate max-w-[42px]">{c.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block text-center">
                        Premium Style Options:
                      </span>
                      <div className="flex items-center justify-center space-x-1">
                        {[
                          { id: 'premium-soft', label: 'Soft' },
                          { id: 'premium-contrast', label: 'Contrast' }
                        ].map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => setPremiumSubFilter(sub.id as FilterType)}
                            className={`flex-1 py-1.5 text-[9px] font-extrabold rounded-xl transition cursor-pointer text-center ${premiumSubFilter === sub.id
                                ? 'bg-pink-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 text-center leading-normal pt-2 border-t border-slate-100">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Best For: </span>
                      <span className="text-slate-800 font-bold">{preset.bestFor}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveFilter(premiumSubFilter);
                      hasAutoZoomedRef.current = false;
                      setActiveScreen('grid-viewer');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-pink-600 hover:bg-pink-500 text-white font-black text-xs uppercase tracking-wider transition duration-150 cursor-pointer active:scale-95 shadow-md shadow-pink-600/10 mt-2"
                  >
                    Select Premium ({preset.name})
                  </button>
                </div>
              );
            })()}
          </div>

        </div>
      </div>
    );
  };

  const renderGridViewerScreen = () => {
    // Was: getFilterPresets().find(f => f.id === activeFilter) || getFilterPresets()[0]
    // Now reuses the memoized value computed once per activeFilter change.
    const currentFilterPreset = activeFilterPreset;
    const isGrayscaleFilter = currentFilterPreset.isGrayscale || activeFilter === 'vintage';

    return (
      <div className="flex-1 flex flex-col-reverse lg:flex-row overflow-y-auto lg:overflow-hidden bg-slate-50">

        {/* LEFT COLUMN: SETTINGS PANEL */}
        <div className="w-full lg:w-[420px] bg-slate-50 border-t lg:border-t-0 lg:border-r border-slate-200 overflow-visible lg:overflow-y-auto p-6 space-y-6 shrink-0 flex flex-col">

          <button
            onClick={() => setActiveScreen('choose-style')}
            className="inline-flex items-center space-x-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:text-slate-800 cursor-pointer transition duration-150 self-start"
          >
            <span>← Back to Style Selection</span>
          </button>

          {/* STEP 1: READ-ONLY SELECTION DETAILS */}
          <div className="space-y-3.5 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-pink-500">Canvas Configuration</span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-800">{selectedKit.name}</span>
              <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                {selectedKit.widthCm}x{selectedKit.heightCm} cm
              </span>
            </div>
            <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-500 mt-1 flex-wrap gap-y-1">
              <span>Grid: {selectedKit.gridWidth} x {selectedKit.gridHeight}</span>
              <span>•</span>
              <span className="text-pink-600">{(selectedKit.gridWidth * selectedKit.gridHeight).toLocaleString()} drills</span>
              <span>•</span>
              <span>{selectedKit.diamondSizeMm}mm {selectedKit.shape}</span>
              <span>•</span>
              <span className="text-emerald-600">Pack: {
                selectedKit.gridWidth === 115 && selectedKit.gridHeight === 155 ? '18,500' :
                  selectedKit.gridWidth === 107 && selectedKit.gridHeight === 143 ? '16,000' :
                    selectedKit.gridWidth === 143 && selectedKit.gridHeight === 179 ? '26,500' :
                      selectedKit.gridWidth === 75 && selectedKit.gridHeight === 100 ? '7,800' :
                        selectedKit.gridWidth === 100 && selectedKit.gridHeight === 125 ? '13,000' :
                          (Math.ceil((selectedKit.gridWidth * selectedKit.gridHeight * 1.04) / 500) * 500).toLocaleString()
              } beads</span>
            </div>
            <button
              onClick={() => setActiveScreen('select-kit')}
              className="text-[9px] font-extrabold text-pink-500 hover:text-pink-600 uppercase tracking-wider block mt-2 cursor-pointer"
            >
              Change Canvas Details →
            </button>
          </div>

          {/* ACTIVE STYLE INFORMATION */}
          <div className="space-y-4 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-pink-500">Selected Style</span>
              <span className="text-xs text-slate-500 font-medium">Style Details</span>
            </div>

            {(() => {
              const currentPreset = activeFilterPreset;
              return (
                <div className="bg-white border border-slate-200 p-4 rounded-2xl space-y-2 mt-2 shadow-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-pink-600 uppercase tracking-wide">{currentPreset.name}</span>
                    <span className="text-[9px] text-slate-700 font-mono font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {currentPreset.allowedColors.length} Colors
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-800 leading-tight">
                    {currentPreset.subtitle}
                  </div>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    {currentPreset.description}
                  </p>
                  <div className="text-[10px] leading-normal pt-1.5 border-t border-slate-100">
                    <span className="text-slate-400 font-bold">Best For: </span>
                    <span className="text-slate-700 font-semibold">{currentPreset.bestFor}</span>
                  </div>

                  {currentPreset.id.startsWith('pop-art') && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
                        Switch Pop Art Style:
                      </span>
                      <div className="flex items-center space-x-1">
                        {[
                          { id: 'pop-art', label: 'Classic' },
                          { id: 'pop-art-electric', label: 'Electric' },
                          { id: 'pop-art-warm', label: 'Warm' }
                        ].map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => setActiveFilter(sub.id as FilterType)}
                            className={`flex-1 py-1.5 text-[9px] font-extrabold rounded-xl transition cursor-pointer text-center ${activeFilter === sub.id
                                ? 'bg-pink-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentPreset.id.startsWith('premium') && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
                        Switch Premium Style:
                      </span>
                      <div className="flex items-center space-x-1">
                        {/*
                          FIX: removed the "Master" -> id 'premium' option that
                          used to be here. There is no FILTER_PRESETS entry
                          with id 'premium', so selecting it silently fell
                          back to the vintage preset in every lookup while
                          this button still rendered as "selected" — a
                          confusing dead state.
                        */}
                        {[
                          { id: 'premium-soft', label: 'Soft' },
                          { id: 'premium-contrast', label: 'Contrast' }
                        ].map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => setActiveFilter(sub.id as FilterType)}
                            className={`flex-1 py-1.5 text-[9px] font-extrabold rounded-xl transition cursor-pointer text-center ${activeFilter === sub.id
                                ? 'bg-pink-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* VIEW DISPLAY CONTROLS */}
          <div className="space-y-3 border-t border-slate-200 pt-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pink-500 block">Grid & Canvas Tools</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowGridLines(!showGridLines)}
                className={`py-2 px-3 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${showGridLines ? 'bg-pink-50 border-pink-300 text-pink-700 font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <Grid className="h-3.5 w-3.5" />
                <span>10x10 Grid</span>
              </button>
              <button
                onClick={() => setShowSymbols(!showSymbols)}
                className={`py-2 px-3 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${showSymbols ? 'bg-pink-50 border-pink-300 text-pink-700 font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Numbers</span>
              </button>
              <button
                onClick={() => setSmoothPreviewMode(!smoothPreviewMode)}
                className={`py-2 px-3 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${smoothPreviewMode ? 'bg-pink-50 border-pink-300 text-pink-700 font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {smoothPreviewMode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>Smooth View</span>
              </button>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className={`py-2 px-3 rounded-xl border text-[11px] font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${showCompleted ? 'bg-pink-50 border-pink-300 text-pink-700 font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <span>✓ Progress</span>
              </button>
            </div>
          </div>

          {/* CUSTOM COLOR SWAPS CONTROLS */}
          {!isGrayscaleFilter && (
            <div className="space-y-3 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-pink-500 block">Custom Color Swaps</span>
                {Object.keys(customColorSwaps).length > 0 && (
                  <button
                    onClick={() => setCustomColorSwaps({})}
                    className="text-[9px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-wider cursor-pointer"
                  >
                    Clear Swaps ({Object.keys(customColorSwaps).length})
                  </button>
                )}
              </div>

              {Object.keys(customColorSwaps).length > 0 ? (
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {Object.entries(customColorSwaps).map(([srcCode, targetCode]) => {
                    const srcColor = DMC_COLORS.find(c => c.code === srcCode);
                    const targetColor = DMC_COLORS.find(c => c.code === targetCode);
                    return (
                      <div key={srcCode} className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs">
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center space-x-1">
                            <div className="w-3.5 h-3.5 rounded border border-slate-200" style={{ backgroundColor: srcColor?.hex }} />
                            <span className="font-mono font-bold text-slate-800 text-[10px]">#{srcCode}</span>
                          </div>
                          <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                          <div className="flex items-center space-x-1">
                            <div className="w-3.5 h-3.5 rounded border border-slate-200" style={{ backgroundColor: targetColor?.hex }} />
                            <span className="font-mono font-bold text-pink-600 text-[10px]">#{targetCode}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setCustomColorSwaps(prev => {
                              const next = { ...prev };
                              delete next[srcCode];
                              return next;
                            });
                          }}
                          className="text-[10px] font-bold text-slate-400 hover:text-rose-600 px-1 cursor-pointer"
                          title="Remove swap"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[9px] text-slate-500 leading-normal">
                  Click "Swap" on any color in the legend below to change its assignment to another physical DMC color.
                </p>
              )}
            </div>
          )}

          {/* DOWNLOAD & INSTRUCTIONS BUTTON */}
          <div className="space-y-3.5 border-t border-slate-200 pt-5 mt-auto">
            <button
              onClick={triggerPDFExport}
              disabled={!pattern}
              className={`w-full py-4 rounded-2xl font-extrabold text-xs flex items-center justify-center space-x-2 shadow-xl transition-all duration-200 ${pattern
                  ? 'bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white shadow-pink-500/10 hover:shadow-pink-500/20 active:scale-[0.98] cursor-pointer'
                  : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                }`}
            >
              <Download className="h-4.5 w-4.5" />
              <span>Download Instructions (PDF)</span>
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: PREVIEW WORKSPACE */}
        <div className="flex-1 bg-slate-50 flex flex-col relative overflow-visible lg:overflow-hidden">

          <div className="p-3 bg-white/70 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between px-6 z-10">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-slate-600 font-mono">
                {selectedKit.gridWidth} × {selectedKit.gridHeight} Grid (10×10 Blocks)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewerZoom(prev => Math.max(0.1, prev * 0.8))}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  hasAutoZoomedRef.current = false;
                  setViewerPan({ x: 0, y: 0 });
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono transition cursor-pointer"
                title="Fit to Screen"
              >
                Fit
              </button>
              <button
                onClick={() => setViewerZoom(prev => Math.min(10, prev * 1.25))}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full aspect-[3/4] max-h-[55vh] sm:max-h-[65vh] lg:aspect-auto lg:h-full lg:max-h-none p-2 flex flex-col items-center justify-start select-none bg-slate-100/30 overflow-hidden">
            <div className="w-full h-full bg-white border border-slate-200 rounded-3xl relative overflow-hidden shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing">
              {/* Floating Vertical Toolbar (Icon Tabs) */}
              {pattern && !isProcessing && (
                <div className="absolute top-4 left-4 z-20 flex flex-col space-y-2 bg-white/90 backdrop-blur-md p-2 rounded-2xl border border-slate-200/80 shadow-lg select-none">
                  <button
                    onClick={() => setShowGridLines(!showGridLines)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center ${showGridLines ? 'bg-pink-500 border-pink-500 text-white shadow-md shadow-pink-500/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title="Toggle 10x10 Grid"
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowSymbols(!showSymbols)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center ${showSymbols ? 'bg-pink-500 border-pink-500 text-white shadow-md shadow-pink-500/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title="Toggle Symbols/Numbers"
                  >
                    <Layers className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSmoothPreviewMode(!smoothPreviewMode)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center ${smoothPreviewMode ? 'bg-pink-500 border-pink-500 text-white shadow-md shadow-pink-500/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title="Toggle Smooth View"
                  >
                    {smoothPreviewMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center ${showCompleted ? 'bg-pink-500 border-pink-500 text-white shadow-md shadow-pink-500/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title="Toggle Completed Progress"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              )}
              {isProcessing ? (
                <div className="text-center p-8 flex flex-col items-center space-y-4">
                  <RefreshCw className="h-10 w-10 text-pink-500 animate-spin" />
                  <div>
                    <h4 className="font-extrabold text-base text-slate-800">Processing Painting</h4>
                    <p className="text-xs text-slate-500 mt-1">Generating custom DMC legend guide and 10x10 grid coordinates...</p>
                  </div>
                </div>
              ) : pattern ? (
                <canvas
                  ref={viewerCanvasRef}
                  onMouseDown={handleViewerMouseDown}
                  onMouseMove={handleViewerMouseMove}
                  onClick={handleViewerClick}
                  onMouseUp={handleViewerMouseUp}
                  onMouseLeave={handleViewerMouseUp}
                  onTouchStart={handleViewerTouchStart}
                  onTouchMove={handleViewerTouchMove}
                  onTouchEnd={handleViewerTouchEnd}
                  className="w-full h-full block bg-slate-50 touch-none"
                />
              ) : null}
            </div>
          </div>

          {/* Bottom Filter Previews Bar (Filtered strictly by selected category) */}
          <div className="bg-white/95 backdrop-blur-md border-t border-slate-200 p-2 px-4 flex items-center space-x-3 overflow-x-auto shrink-0 z-10">
            <span className="text-[9px] font-black uppercase tracking-wider text-pink-600 shrink-0">
              {activeFilter === 'vintage' ? 'Monochrome Filter:' : activeFilter === 'vintage-classic' ? 'Sepia Filter:' : activeFilter.startsWith('pop-art') ? 'Pop Art Filters:' : 'Premium Filters:'}
            </span>
            <div className="flex items-center space-x-2">
              {FILTER_PRESETS.filter(p => {
                if (activeFilter === 'vintage') return p.id === 'vintage';
                if (activeFilter === 'vintage-classic') return p.id === 'vintage-classic';
                if (activeFilter.startsWith('pop-art')) return p.id.startsWith('pop-art');
                if (activeFilter.startsWith('premium')) return p.id.startsWith('premium');
                return true;
              }).map(preset => {
                const isActive = activeFilter === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setActiveFilter(preset.id as FilterType);
                      hasAutoZoomedRef.current = false;
                    }}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-2xl border transition cursor-pointer shrink-0 active:scale-95 ${isActive
                        ? 'bg-pink-600 border-pink-600 text-white shadow-md shadow-pink-600/20 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-pink-300'
                      }`}
                  >
                    <div className="w-7 h-9 rounded-lg overflow-hidden border border-slate-300/40 shrink-0 bg-slate-200 flex items-center justify-center">
                      <MiniGridPreview
                        filterId={preset.id}
                        allowedColors={preset.allowedColors}
                        croppedImage={croppedImage}
                        customColorSwaps={customColorSwaps}
                      />
                    </div>
                    <div className="text-left font-sans">
                      <span className={`text-[10px] font-extrabold block truncate max-w-[100px] ${isActive ? 'text-white' : 'text-slate-800'}`}>
                        {preset.name}
                      </span>
                      <span className={`text-[8px] block font-mono ${isActive ? 'text-pink-100' : 'text-slate-500'}`}>
                        {preset.allowedColors.length} DMC Colors
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Legend Footer Strip */}
          {pattern && !isProcessing && (
            <div className="h-32 bg-white border-t border-slate-200 p-3.5 flex items-center space-x-3 overflow-x-auto shrink-0 z-10">
              {pattern.palette.map(c => {
                const isSelected = selectedColorCode === c.code;
                const isSwapped = customColorSwaps[c.code] !== undefined;
                return (
                  <div
                    key={c.code}
                    className={`p-2.5 rounded-2xl border flex flex-col items-center space-y-1.5 shrink-0 transition relative group ${isSelected
                        ? 'bg-pink-50/50 border-pink-500 shadow-md shadow-pink-500/10'
                        : isSwapped
                          ? 'bg-amber-50/40 border-amber-300'
                          : 'bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-50'
                      }`}
                  >
                    <button
                      onClick={() => setSelectedColorCode(isSelected ? null : c.code)}
                      className="flex flex-col items-center space-y-1 cursor-pointer w-full"
                    >
                      <div className="flex items-center space-x-1.5">
                        <div className="w-4.5 h-4.5 rounded border border-slate-200 shadow-inner" style={{ backgroundColor: c.hex }} />
                        <span className="text-xs font-black text-slate-800 font-mono">{c.symbol}</span>
                      </div>
                      <span className="text-[10px] font-bold font-mono text-slate-700">DMC {c.code}</span>
                      <span className="text-[8px] text-slate-500 font-semibold">{c.count} pcs</span>
                    </button>

                    {!isGrayscaleFilter && (
                      <button
                        onClick={() => setActiveSwapSourceCode(c.code)}
                        className="w-full py-1 px-2 rounded-lg bg-slate-100 hover:bg-pink-500 hover:text-white text-slate-600 font-extrabold text-[9px] flex items-center justify-center space-x-1 transition cursor-pointer"
                        title="Swap this color"
                      >
                        <ArrowRightLeft className="h-2.5 w-2.5" />
                        <span>{isSwapped ? 'Swapped' : 'Swap'}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>
    );
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-10 w-10 text-pink-500 animate-spin" />
        <p className="text-xs text-slate-500 font-extrabold uppercase tracking-widest">Restoring Session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-pink-500 selection:text-white">

      {/* Gift Karo Brand Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-purple-100/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center space-x-3 min-w-0">
          <img
            src={giftKaroLogo}
            alt="Gift Karo Logo"
            className="h-8 sm:h-10 w-auto object-contain shrink-0 cursor-pointer"
            onClick={() => setActiveScreen('landing')}
          />
          <div className="hidden sm:block h-6 w-px bg-purple-200/60 mx-1" />
          <div className="min-w-0 hidden sm:block">
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 block">
              Diamond Art Creator
            </span>
            <p className="text-[10px] text-slate-500 font-semibold truncate">
              Turn custom photos into personalized diamond grid guides
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {originalImage && (
            <button
              onClick={() => {
                setOriginalImage(null);
                setCroppedImage(null);
                setPattern(null);
                setActiveScreen('select-kit');
                setTimeout(() => {
                  hiddenFileInputRef.current?.click();
                }, 100);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-full border border-slate-200 hover:border-pink-300 bg-white hover:bg-slate-50 text-slate-700 font-extrabold text-[10px] sm:text-xs tracking-wider uppercase transition active:scale-95 shadow-xs cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-pink-500" />
              <span className="hidden sm:inline">Upload New Photo</span>
              <span className="sm:hidden">New Photo</span>
            </button>
          )}

          <a
            href="https://deargifts.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-pink-200 hover:border-pink-500 bg-pink-50/60 hover:bg-pink-100/80 text-pink-600 hover:text-pink-700 font-black text-[10px] sm:text-xs tracking-wider uppercase transition-all duration-200 active:scale-95 shadow-xs cursor-pointer"
          >
            <span>Visit Shop</span>
            <span className="text-xs">→</span>
          </a>
        </div>
      </header>

      {/* Screen Router Views */}
      {activeScreen === 'landing' && renderLandingScreen()}
      {activeScreen === 'select-kit' && renderSelectKitScreen()}
      {activeScreen === 'crop' && renderCropScreen()}
      {activeScreen === 'choose-style' && renderChooseStyleScreen()}
      {activeScreen === 'grid-viewer' && renderGridViewerScreen()}

      {/* Interactive Color Swap Modal */}
      {activeSwapSourceCode && (() => {
        const currentPreset = activeFilterPreset;
        if (currentPreset.isGrayscale || activeFilter === 'vintage') return null;

        const categoryAllowedColors = currentPreset.allowedColors || [];
        const selectableColors = DMC_COLORS.filter(c => categoryAllowedColors.includes(c.code));

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-pink-500">Interactive Color Swap</span>
                  <h3 className="text-base font-extrabold text-slate-800">
                    Swap DMC #{activeSwapSourceCode} with:
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSwapSourceCode(null)}
                  className="text-slate-400 hover:text-slate-600 font-extrabold text-lg px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Select a target color from the {selectableColors.length} available colors in this category to replace all drills of DMC #{activeSwapSourceCode}:
              </p>

              <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto p-1">
                {selectableColors.map(c => {
                  const isCurrent = c.code === activeSwapSourceCode;
                  const isTargetOfThis = customColorSwaps[activeSwapSourceCode] === c.code;
                  return (
                    <button
                      key={c.code}
                      onClick={() => {
                        if (c.code === activeSwapSourceCode) {
                          setCustomColorSwaps(prev => {
                            const next = { ...prev };
                            delete next[activeSwapSourceCode];
                            return next;
                          });
                        } else {
                          setCustomColorSwaps(prev => ({
                            ...prev,
                            [activeSwapSourceCode]: c.code
                          }));
                        }
                        setActiveSwapSourceCode(null);
                      }}
                      className={`p-2.5 rounded-xl border flex items-center space-x-2.5 transition text-left cursor-pointer ${isTargetOfThis
                          ? 'bg-pink-50 border-pink-500 shadow-sm'
                          : isCurrent
                            ? 'bg-slate-100 border-slate-300 opacity-60'
                            : 'bg-white border-slate-200 hover:border-pink-300 hover:bg-pink-50/30'
                        }`}
                    >
                      <div className="w-5 h-5 rounded border border-slate-200 shrink-0 shadow-inner" style={{ backgroundColor: c.hex }} />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-bold text-slate-800">#{c.code}</div>
                        <div className="text-[9px] text-slate-500 truncate font-semibold">{c.name}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {customColorSwaps[activeSwapSourceCode] ? (
                  <button
                    onClick={() => {
                      setCustomColorSwaps(prev => {
                        const next = { ...prev };
                        delete next[activeSwapSourceCode];
                        return next;
                      });
                      setActiveSwapSourceCode(null);
                    }}
                    className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                  >
                    Reset This Swap
                  </button>
                ) : <div />}
                <button
                  onClick={() => setActiveSwapSourceCode(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
