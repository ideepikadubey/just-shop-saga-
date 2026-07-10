import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Upload, Download, RefreshCw, ZoomIn, ZoomOut
} from 'lucide-react';
import { Project, GeneratedPattern } from './types';
import { VISUAL_SYMBOLS } from './utils/symbols';
import { quantizeImage } from './utils/quantizer';
import { generatePDF } from './utils/pdfGenerator';
import { DMC_COLORS } from './utils/dmc';
import cropTipsImage from './imports/crop-tips.jpg';

interface DiamondArtKit {
  id: string;
  packId: 'current' | 'upcoming';
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
    id: 'current-30-40',
    packId: 'current',
    name: 'Current Pack (30x40)',
    widthCm: 30,
    heightCm: 40,
    shape: 'square',
    gridWidth: 75,
    gridHeight: 100,
    maxColors: 6,
    diamondSizeMm: 4.0,
    description: 'Canvas center crops image. Uses 6 standard colors.',
    allowedColors: ['796', 'B5200', '415', '444', '310', '754']
  },
  {
    id: 'current-40-50',
    packId: 'current',
    name: 'Current Pack (40x50)',
    widthCm: 40,
    heightCm: 50,
    shape: 'square',
    gridWidth: 100,
    gridHeight: 125,
    maxColors: 6,
    diamondSizeMm: 4.0,
    description: 'Canvas center crops image. Uses 6 standard colors.',
    allowedColors: ['796', 'B5200', '415', '444', '310', '754']
  },
  {
    id: 'upcoming-30-40',
    packId: 'upcoming',
    name: 'Upcoming Pack (30x40)',
    widthCm: 30,
    heightCm: 40,
    shape: 'square',
    gridWidth: 107,
    gridHeight: 143,
    maxColors: 13,
    diamondSizeMm: 2.8,
    description: 'Vibrant 13-color palette for fine-grain detail.',
  },
  {
    id: 'upcoming-40-50',
    packId: 'upcoming',
    name: 'Upcoming Pack (40x50)',
    widthCm: 40,
    heightCm: 50,
    shape: 'square',
    gridWidth: 143,
    gridHeight: 179,
    maxColors: 13,
    diamondSizeMm: 2.8,
    description: 'Vibrant 13-color palette for fine-grain detail.',
  }
];



type FilterType = 'classic' | 'pop-art' | 'premium';

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
  {
    id: 'classic',
    name: 'Classic (Black & White)',
    subtitle: 'Timeless | Elegant | Pencil Sketch Look',
    description: 'Beautiful black and white/grayscale palette mimicking a hand-drawn pencil sketch.',
    bestFor: 'Beginners, Minimal Look, Classic Lovers',
    brightness: 5,
    contrast: 20,
    saturation: -100,
    exposure: 0,
    sharpen: true,
    algorithm: 'k-means',
    dither: true,
    isGrayscale: true,
    allowedColors: ['310', '413', '640', '3864']
  },
  {
    id: 'pop-art',
    name: 'Pop Art',
    subtitle: 'Bold | Vibrant | Modern & Eye Catching',
    description: 'Vibrant, saturated color palette with high contrast for a modern, artistic comic/pop-art look.',
    bestFor: 'Bold Look, Gifts, Social Media Lovers',
    brightness: 10,
    contrast: 25,
    saturation: 40,
    exposure: 5,
    sharpen: true,
    algorithm: 'k-means',
    dither: true,
    isGrayscale: false,
    allowedColors: ['304', '3843', '3756', '976', '3862', '433', '310']
  },
  {
    id: 'premium',
    name: 'Premium Portrait',
    subtitle: 'Soft | Artistic | Hand Painted Look',
    description: 'Warm skin tones combined with cool backgrounds to produce a realistic, hand-painted portrait effect.',
    bestFor: 'Most Realistic, Family Portraits, Premium Gifts',
    brightness: 5,
    contrast: 15,
    saturation: 15,
    exposure: 0,
    sharpen: true,
    algorithm: 'k-means',
    dither: true,
    isGrayscale: false,
    allowedColors: ['304', '976', '3840', '3843', '3756', '640', '433', '3864', '3862', '413', '310']
  }
];

export default function App() {
  // Wizard & Settings States
  const [activePackId, setActivePackId] = useState<'current' | 'upcoming'>('current');
  const [selectedKit, setSelectedKit] = useState<DiamondArtKit>(DIAMOND_ART_KITS[0]);
  const getFilterPresets = () => {
    return FILTER_PRESETS.map(preset => {
      if (activePackId === 'current') {
        if (preset.id === 'classic') {
          return {
            ...preset,
            allowedColors: ['310', '415', 'B5200']
          };
        }
        if (preset.id === 'pop-art') {
          return {
            ...preset,
            allowedColors: ['796', '444', '310', 'B5200', '754']
          };
        }
        if (preset.id === 'premium') {
          return {
            ...preset,
            allowedColors: ['796', 'B5200', '415', '444', '310', '754']
          };
        }
      } else {
        if (preset.id === 'classic') {
          return {
            ...preset,
            allowedColors: ['310', '413', '640', '3864']
          };
        }
        if (preset.id === 'pop-art') {
          return {
            ...preset,
            allowedColors: ['304', '3843', '3756', '976', '3862', '433', '310']
          };
        }
        if (preset.id === 'premium') {
          return {
            ...preset,
            allowedColors: ['304', '976', '3840', '3843', '3756', '640', '433', '3864', '3862', '413', '310', 'B5200', '754']
          };
        }
      }
      return preset;
    });
  };

  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [processedImageObj, setProcessedImageObj] = useState<HTMLImageElement | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('premium');
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterPreviews, setFilterPreviews] = useState<Record<FilterType, string | null>>({
    classic: null,
    'pop-art': null,
    premium: null
  });

  // Wizard Screen Router States
  const [activeScreen, setActiveScreen] = useState<'landing' | 'select-kit' | 'crop' | 'choose-style' | 'grid-viewer'>('landing');
  const [showCropTip, setShowCropTip] = useState(false);

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
  const [selectedColorCode, setSelectedColorCode] = useState<string | null>(null);
  const showSymbols = true;
  const showCompleted = true;
  const searchQuery = '';
  const [completedCells, setCompletedCells] = useState<Set<string>>(new Set());
  
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

  // Generate three filter previews using canvas
  useEffect(() => {
    if (!croppedImage) {
      setFilterPreviews({ classic: null, 'pop-art': null, premium: null });
      return;
    }

    const tempImg = new Image();
    tempImg.onload = () => {
      const previews: Record<FilterType, string> = { classic: '', 'pop-art': '', premium: '' };

      getFilterPresets().forEach(preset => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Scale down to a preview size (max width 160px)
        const maxDim = 160;
        let w = tempImg.width;
        let h = tempImg.height;
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }

        canvas.width = w;
        canvas.height = h;

        // Previews use the cropped image directly
        ctx.drawImage(tempImg, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const { brightness, contrast, saturation, exposure, sharpen, isGrayscale } = preset;
        const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        const eFactor = Math.pow(2, exposure / 50);

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          r *= eFactor; g *= eFactor; b *= eFactor;
          r += brightness; g += brightness; b += brightness;
          r = cFactor * (r - 128) + 128;
          g = cFactor * (g - 128) + 128;
          b = cFactor * (b - 128) + 128;

          const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
          if (isGrayscale) {
            r = gray; g = gray; b = gray;
          } else {
            const satRatio = (saturation + 100) / 100;
            r = gray + (r - gray) * satRatio;
            g = gray + (g - gray) * satRatio;
            b = gray + (b - gray) * satRatio;
          }

          data[i] = Math.max(0, Math.min(255, r));
          data[i + 1] = Math.max(0, Math.min(255, g));
          data[i + 2] = Math.max(0, Math.min(255, b));
        }
        ctx.putImageData(imgData, 0, 0);

        if (sharpen) {
          const sharpenKernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
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

        previews[preset.id] = canvas.toDataURL('image/jpeg', 0.85);
      });

      setFilterPreviews(previews);
    };
    tempImg.src = croppedImage;
  }, [croppedImage, selectedKit]);

  // Regenerate pattern when kit, filter, or cropped image changes
  useEffect(() => {
    if (croppedImage) {
      triggerImageProcessing();
    }
  }, [selectedKit, activeFilter, croppedImage]);

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
      fCtx.drawImage(tempImg, 0, 0);

      const imgData = fCtx.getImageData(0, 0, filterCanvas.width, filterCanvas.height);
      const data = imgData.data;

      // 2. Retrieve preset attributes
      const preset = getFilterPresets().find(f => f.id === activeFilter) || getFilterPresets()[0];
      const { brightness, contrast, saturation, exposure, sharpen, algorithm, dither, isGrayscale } = preset;

      const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      const eFactor = Math.pow(2, exposure / 50);

      // 3. Process pixels (exposure, brightness, contrast, saturation/grayscale)
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Exposure
        r *= eFactor;
        g *= eFactor;
        b *= eFactor;

        // Brightness
        r += brightness;
        g += brightness;
        b += brightness;

        // Contrast
        r = cFactor * (r - 128) + 128;
        g = cFactor * (g - 128) + 128;
        b = cFactor * (b - 128) + 128;

        // Saturation / Grayscale
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

        // Clamp
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }
      fCtx.putImageData(imgData, 0, 0);

      // 4. Apply sharpen convolution filter
      if (sharpen) {
        const sharpenKernel = [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ];
        const w = filterCanvas.width;
        const h = filterCanvas.height;
        const src = fCtx.getImageData(0, 0, w, h).data;
        const dstImgData = fCtx.createImageData(w, h);
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
        fCtx.putImageData(dstImgData, 0, 0);
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

      qCtx.drawImage(filterCanvas, 0, 0, selectedKit.gridWidth, selectedKit.gridHeight);
      const gridImgData = qCtx.getImageData(0, 0, selectedKit.gridWidth, selectedKit.gridHeight);

      // Run quantization helper
      const activeFilterPreset = getFilterPresets().find(f => f.id === activeFilter) || getFilterPresets()[0];
      const allowedColorsList = activeFilterPreset.allowedColors;
      const allowedDMCColors = DMC_COLORS.filter(c => allowedColorsList.includes(c.code));

      const maxColors = allowedDMCColors.length;
      
      const quantResult = quantizeImage(
        gridImgData.data,
        selectedKit.gridWidth,
        selectedKit.gridHeight,
        algorithm,
        maxColors,
        dither,
        allowedDMCColors
      );

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
          symbol: VISUAL_SYMBOLS[index % VISUAL_SYMBOLS.length],
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

      const aspect = selectedKit.gridWidth / selectedKit.gridHeight;
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
    }
  };

  const handleCropTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!cropIsDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - cropDragStart.current.x;
    const dy = touch.clientY - cropDragStart.current.y;
    
    setCropPan(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
    
    cropDragStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleCropTouchEnd = () => {
    setCropIsDragging(false);
  };

  // Bind non-passive wheel listener directly for scroll zoom
  useEffect(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.05;
      if (e.deltaY < 0) {
        setCropZoom(prev => Math.min(15, prev * zoomFactor));
      } else {
        setCropZoom(prev => Math.max(0.1, prev / zoomFactor));
      }
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
      
      const aspect = selectedKit.gridWidth / selectedKit.gridHeight;
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
      // Verticals
      ctx.moveTo(frameX + frameW / 3, frameY);
      ctx.lineTo(frameX + frameW / 3, frameY + frameH);
      ctx.moveTo(frameX + (frameW * 2) / 3, frameY);
      ctx.lineTo(frameX + (frameW * 2) / 3, frameY + frameH);
      // Horizontals
      ctx.moveTo(frameX, frameY + frameH / 3);
      ctx.lineTo(frameX + frameW, frameY + frameH / 3);
      ctx.moveTo(frameX, frameY + (frameH * 2) / 3);
      ctx.lineTo(frameX + frameW, frameY + (frameH * 2) / 3);
      ctx.stroke();
    };
    img.src = originalImage;
  }, [originalImage, activeScreen, cropPan, cropZoom, cropRotation, selectedKit]);

  // Canvas Pattern Drawing Engine (With Split Comparison View Support)
  useEffect(() => {
    if (!pattern) return;

    const canvas = viewerCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fit canvas bounds
    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 800;
    const h = rect?.height || 600;
    canvas.width = w;
    canvas.height = h;

    // Layout configuration
    const cellBaseSize = 16;
    const gridWidth = pattern.width * cellBaseSize;
    const gridHeight = pattern.height * cellBaseSize;

    // Auto-fit zoom on first load
    if (!hasAutoZoomedRef.current && w > 0 && h > 0) {
      const fitZoomX = (w - 48) / gridWidth;
      const fitZoomY = (h - 48) / gridHeight;
      const fitZoom = Math.min(fitZoomX, fitZoomY);
      setViewerZoom(fitZoom);
      setViewerPan({ x: 0, y: 0 });
      hasAutoZoomedRef.current = true;
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Zoom & Pan adjustments
    ctx.translate(canvas.width / 2 + viewerPan.x, canvas.height / 2 + viewerPan.y);
    ctx.scale(viewerZoom, viewerZoom);
    ctx.translate(-gridWidth / 2, -gridHeight / 2);

    // 1. Draw dark background as the base layer
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, gridWidth, gridHeight);

    // Color Lookup mapping
    const colorMap = new Map<string, { hex: string; symbol: string; r: number; g: number; b: number }>();
    pattern.palette.forEach(p => colorMap.set(p.code, { hex: p.hex, symbol: p.symbol, r: p.r, g: p.g, b: p.b }));

    // Reconstruct coordinate pixel grids
    const pixelGrid = new Array(pattern.height).fill(null).map(() => new Array(pattern.width).fill(null));
    pattern.pixels.forEach(p => {
      pixelGrid[p.y][p.x] = p.colorCode;
    });

    // Frustum Culling limits
    const viewLeft = (-canvas.width / 2 - viewerPan.x) / viewerZoom + gridWidth / 2;
    const viewRight = (canvas.width / 2 - viewerPan.x) / viewerZoom + gridWidth / 2;
    const viewTop = (-canvas.height / 2 - viewerPan.y) / viewerZoom + gridHeight / 2;
    const viewBottom = (canvas.height / 2 - viewerPan.y) / viewerZoom + gridHeight / 2;

    const startCellX = Math.max(0, Math.floor(viewLeft / cellBaseSize));
    const endCellX = Math.min(pattern.width - 1, Math.floor(viewRight / cellBaseSize));
    const startCellY = Math.max(0, Math.floor(viewTop / cellBaseSize));
    const endCellY = Math.min(pattern.height - 1, Math.floor(viewBottom / cellBaseSize));

    // 2. Draw Diamond drills
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
        const isSearched = true;

        ctx.fillStyle = info.hex;

        // Darken non-matches
        if (!isHighlighted || !isSearched) {
          ctx.fillStyle = `rgba(${info.r}, ${info.g}, ${info.b}, 0.15)`;
        }

        ctx.beginPath();
        if (selectedKit.shape === 'square') {
          ctx.rect(cx + 0.5, cy + 0.5, cellBaseSize - 1, cellBaseSize - 1);
          ctx.fill();
        } else {
          ctx.arc(cx + cellBaseSize / 2, cy + cellBaseSize / 2, cellBaseSize / 2 - 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw symbol
        if (showSymbols && viewerZoom >= 0.8 && (!isCellCompleted || showCompleted)) {
          ctx.fillStyle = isHighlighted && isSearched ? '#1e293b' : 'rgba(30, 41, 59, 0.4)';
          ctx.font = `bold ${cellBaseSize * 0.7}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(info.symbol, cx + cellBaseSize / 2, cy + cellBaseSize / 2 + 0.5);
        }

        // Complete checkmark overlay
        if (isCellCompleted && showCompleted) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.3)'; // translucent pink overlay
          ctx.fillRect(cx, cy, cellBaseSize, cellBaseSize);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${cellBaseSize * 0.8}px sans-serif`;
          ctx.fillText('✓', cx + cellBaseSize / 2, cy + cellBaseSize / 2);
        }

        // Borders
        if (viewerZoom >= 0.5) {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cx, cy, cellBaseSize, cellBaseSize);
        }
      }
    }

    // Draw vertical and horizontal thick grid lines every 10 cells
    if (viewerZoom >= 0.3) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1.0;
      
      // Vertical lines
      for (let x = 0; x <= pattern.width; x += 10) {
        const lx = x * cellBaseSize;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, pattern.height * cellBaseSize);
        ctx.stroke();
      }
      
      // Horizontal lines
      for (let y = 0; y <= pattern.height; y += 10) {
        const ly = y * cellBaseSize;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(pattern.width * cellBaseSize, ly);
        ctx.stroke();
      }
    }

    ctx.restore();

    // Draw Minimap overlay
    const miniW = 120;
    const miniH = 120 * (pattern.height / pattern.width);
    const miniX = canvas.width - miniW - 16;
    const miniY = canvas.height - miniH - 16;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(miniX - 4, miniY - 4, miniW + 8, miniH + 8);
    ctx.strokeStyle = 'rgba(244, 63, 139, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(miniX - 4, miniY - 4, miniW + 8, miniH + 8);

    const miniCellW = miniW / pattern.width;
    const miniCellH = miniH / pattern.height;

    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const colorCode = pixelGrid[y][x];
        const info = colorMap.get(colorCode);
        if (info) {
          ctx.fillStyle = completedCells.has(`${x},${y}`) && !showCompleted ? 'rgba(30, 41, 59, 0.2)' : info.hex;
          ctx.fillRect(miniX + x * miniCellW, miniY + y * miniCellH, miniCellW + 0.1, miniCellH + 0.1);
        }
      }
    }

    // Viewport window outline on minimap
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

  }, [pattern, processedImageObj, viewerZoom, viewerPan, selectedColorCode, showSymbols, showCompleted, searchQuery, completedCells, selectedKit]);

  // Click / Drag handlers to support panning and completing cells
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

  // Click / Drag handlers to support panning and completing cells
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

  // Touch handlers for mobile devices
  const handleViewerTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!pattern || e.touches.length !== 1) return;
    isDraggingRef.current = false;
    const touch = e.touches[0];
    dragStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleViewerTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!pattern || e.touches.length !== 1) return;
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
  };

  const handleViewerTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!pattern) return;
    if (!isDraggingRef.current && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      handleCellInteraction(touch.clientX, touch.clientY);
    }
  };

  // PDF Download action
  const triggerPDFExport = () => {
    if (!pattern || !processedImage) return;

    const updatedPixels = pattern.pixels.map(p => ({
      ...p,
      completed: completedCells.has(`${p.x},${p.y}`)
    }));

    const activeFilterPreset = getFilterPresets().find(f => f.id === activeFilter) || getFilterPresets()[0];

    const finalProject: Project = {
      id: `saga-kit-${selectedKit.id}`,
      name: `${selectedKit.name} - ${activeFilterPreset.name}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      originalImage: originalImage || '',
      processedImage: processedImage || '',
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-50 via-pink-50/20 to-slate-100 relative overflow-hidden">
        {/* Glow behind */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl w-full text-center space-y-6 z-10 my-auto">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 bg-pink-50 border border-pink-100 px-3.5 py-1.5 rounded-full text-pink-600 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Official Saga Creator</span>
          </div>

          {/* Big Hero Title */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none bg-gradient-to-r from-slate-900 via-slate-800 to-pink-600 bg-clip-text text-transparent">
            Saga Diamond Painting
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
            Instantly turn your favorite photos into a personalized diamond grid guide. Upload any picture and get custom pixel instructions.
          </p>

          {/* Action card */}
          <div className="pt-6 max-w-md mx-auto w-full">
            <div className="bg-white border border-slate-200/80 hover:border-pink-500/30 rounded-3xl p-8 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/5 flex flex-col items-center space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-pink-50 flex items-center justify-center border border-pink-100 text-pink-600">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Create Your Diamond Art</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Upload a photo from your library and see what your diamond painting will look like. Adjust composition and preview filters instantly!
                </p>
              </div>
              <button
                onClick={() => {
                  setOriginalImage(null);
                  setCroppedImage(null);
                  setPattern(null);
                  setActiveScreen('select-kit');
                }}
                className="w-full py-3.5 rounded-full bg-pink-600 hover:bg-pink-500 text-white font-extrabold text-xs tracking-wider uppercase shadow-lg shadow-pink-500/20 transition active:scale-[0.98] cursor-pointer text-center font-bold"
              >
                Upload Photo / View Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCropTipModal = () => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        {/* Modal Box */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6.5 max-w-md w-full shadow-2xl relative space-y-5 animate-in fade-in zoom-in duration-200">
          
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-pink-50 border border-pink-100 text-pink-600 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900">Tips for the best result</h3>
          </div>

          {/* Infographic Comparison Image */}
          <div className="w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
            <img src={cropTipsImage} alt="Crop tips" className="w-full object-contain" />
          </div>

          <button
            onClick={() => {
              setShowCropTip(false);
              hiddenFileInputRef.current?.click();
            }}
            className="w-full py-3.5 rounded-full bg-pink-600 hover:bg-pink-500 text-white font-extrabold text-xs tracking-wider uppercase transition cursor-pointer text-center font-bold"
          >
            OK, got it! Select Photo
          </button>
        </div>
      </div>
    );
  };

  const renderSelectKitScreen = () => {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 p-6 sm:p-8 max-w-3xl mx-auto w-full relative justify-center">
        {/* Back Button */}
        <button
          onClick={() => setActiveScreen('landing')}
          className="inline-flex items-center space-x-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:text-slate-800 mb-6 cursor-pointer self-start transition duration-150"
        >
          <span>← Back</span>
        </button>

        {/* Header */}
        <div className="mb-6">
          <span className="text-[11px] font-bold uppercase tracking-wider text-pink-500">Step 1 of 3</span>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 mt-1">Configure & Upload</h2>
          <p className="text-xs text-slate-500 mt-1">
            Choose your diamond painting kit type, canvas dimensions, and upload your photo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left panel: Kit Configuration */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">1. Select Art Kit</h3>
            
            {/* Pack Tabs */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 border border-slate-200 rounded-2xl">
              <button
                onClick={() => {
                  setActivePackId('current');
                  const kit = DIAMOND_ART_KITS.find(k => k.packId === 'current');
                  if (kit) setSelectedKit(kit);
                }}
                className={`py-2 px-3 text-xs font-extrabold rounded-xl transition duration-200 cursor-pointer text-center ${
                  activePackId === 'current'
                    ? 'bg-pink-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Current Pack
              </button>
              <button
                onClick={() => {
                  setActivePackId('upcoming');
                  const kit = DIAMOND_ART_KITS.find(k => k.packId === 'upcoming');
                  if (kit) setSelectedKit(kit);
                }}
                className={`py-2 px-3 text-xs font-extrabold rounded-xl transition duration-200 cursor-pointer text-center ${
                  activePackId === 'upcoming'
                    ? 'bg-pink-600 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Upcoming Pack
              </button>
            </div>

            {/* Size select grid */}
            <div className="space-y-2.5">
              {DIAMOND_ART_KITS.filter(k => k.packId === activePackId).map(kit => {
                const isSelected = selectedKit.id === kit.id;
                return (
                  <button
                    key={kit.id}
                    onClick={() => setSelectedKit(kit)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition duration-200 relative group flex items-start space-x-3.5 cursor-pointer ${
                      isSelected 
                        ? 'bg-white border-pink-500 shadow-md' 
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-600 group-hover:text-slate-800'
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

          {/* Right panel: Upload Picture */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">2. Upload Your Image</h3>
            
            <input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              ref={hiddenFileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />

            <button
              onClick={() => setShowCropTip(true)}
              className="w-full border-2 border-dashed border-slate-200 hover:border-pink-500/50 rounded-3xl p-8 text-center bg-slate-100/50 transition cursor-pointer relative group flex flex-col items-center justify-center min-h-[220px]"
            >
              <Upload className="h-10 w-10 text-slate-500 group-hover:text-pink-500 transition mb-3" />
              <span className="text-sm font-bold text-slate-800 block mb-1">Click to select photo</span>
              <span className="text-[10px] text-slate-600 max-w-[200px] leading-normal mx-auto">
                Supports PNG, JPG, WEBP formats up to 15MB file size
              </span>
            </button>

            {/* Crop Tip Overlay Modal */}
            {showCropTip && renderCropTipModal()}
          </div>
        </div>
      </div>
    );
  };

  const renderCropScreen = () => {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-between p-6 bg-slate-50 text-slate-900 relative">
        {/* Hidden File Input for "Change Photo" */}
        <input
          type="file"
          accept="image/png, image/jpeg, image/webp"
          ref={hiddenFileInputRef}
          onChange={handleImageUpload}
          className="hidden"
        />

        {/* Progress indicator */}
        <div className="w-full text-center mt-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-pink-500">Step 2 of 3</span>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 mt-1">Select the desired area</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-normal">
            Drag the photo to pan • Scroll or use buttons below to zoom
          </p>
        </div>

        {/* Canvas Workspace container */}
        <div className="flex-1 w-full max-h-[460px] my-6 flex items-center justify-center relative bg-slate-100/50 border border-slate-200 rounded-3xl overflow-hidden shadow-inner">
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

        {/* Circular Controls Row */}
        <div className="flex items-center space-x-5 mb-8">
          {/* Change Photo */}
          <button
            onClick={() => hiddenFileInputRef.current?.click()}
            className="w-12 h-12 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center justify-center shadow-md transition active:scale-95 cursor-pointer shrink-0"
            title="Upload New Photo"
          >
            <Upload className="h-5 w-5" />
          </button>
          {/* Zoom Out */}
          <button
            onClick={() => setCropZoom(prev => Math.max(0.1, prev - 0.1))}
            className="w-12 h-12 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center justify-center shadow-md transition active:scale-95 cursor-pointer shrink-0 animate-none"
            title="Zoom Out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          {/* Rotate */}
          <button
            onClick={() => setCropRotation(prev => (prev + 90) % 360)}
            className="w-12 h-12 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center justify-center shadow-md transition active:scale-95 cursor-pointer shrink-0"
            title="Rotate 90°"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          {/* Zoom In */}
          <button
            onClick={() => setCropZoom(prev => Math.min(15, prev + 0.1))}
            className="w-12 h-12 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center justify-center shadow-md transition active:scale-95 cursor-pointer shrink-0 animate-none"
            title="Zoom In"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
        </div>

        {/* Bottom BACK / NEXT Actions */}
        <div className="flex items-center space-x-4 w-full max-w-sm mb-4 shrink-0">
          <button
            onClick={() => {
              setActiveScreen('select-kit');
            }}
            className="flex-1 py-3.5 px-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-xs tracking-wider uppercase hover:bg-slate-200 active:scale-95 transition cursor-pointer text-center font-bold"
          >
            Back
          </button>
          <button
            onClick={applyCrop}
            className="flex-1 py-3.5 px-6 rounded-full bg-pink-600 text-white font-extrabold text-xs tracking-wider uppercase hover:bg-pink-500 active:scale-95 transition cursor-pointer text-center font-bold"
          >
            Next
          </button>
        </div>
      </div>
    );
  };





  // Helper component to render small canvas grid previews for style selection
  const MiniGridPreview = ({ filterId, allowedColors }: { filterId: string; allowedColors: string[] }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !croppedImage) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const tempImg = new Image();
      tempImg.onload = () => {
        const previewWidth = 32;
        const previewHeight = 24;

        const tempCanvas = document.createElement('canvas');
        const tCtx = tempCanvas.getContext('2d');
        if (!tCtx) return;
        tempCanvas.width = previewWidth;
        tempCanvas.height = previewHeight;
        tCtx.drawImage(tempImg, 0, 0, previewWidth, previewHeight);

        const imgData = tCtx.getImageData(0, 0, previewWidth, previewHeight);
        const data = imgData.data;

        const allowedDMC = DMC_COLORS.filter(c => allowedColors.includes(c.code));
        const result = quantizeImage(data, previewWidth, previewHeight, 'k-means', allowedDMC.length, true, allowedDMC);

        canvas.width = 180;
        canvas.height = 120;
        const cellW = canvas.width / previewWidth;
        const cellH = canvas.height / previewHeight;

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        result.pixels.forEach(p => {
          ctx.fillStyle = p.dmc.hex;
          ctx.fillRect(p.x * cellW, p.y * cellH, cellW - 0.5, cellH - 0.5);

          // Render symbol on cell
          ctx.fillStyle = (p.dmc.r * 0.299 + p.dmc.g * 0.587 + p.dmc.b * 0.114) > 128 ? '#000000' : '#ffffff';
          ctx.font = '6px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Get visual symbol from symbols list
          const symbolIndex = allowedColors.indexOf(p.dmc.code);
          const symbol = VISUAL_SYMBOLS[symbolIndex % VISUAL_SYMBOLS.length] || '•';
          ctx.fillText(symbol, p.x * cellW + cellW / 2, p.y * cellH + cellH / 2);
        });
      };
      tempImg.src = croppedImage;
    }, [croppedImage, filterId, allowedColors]);

    return (
      <canvas ref={canvasRef} className="rounded-xl border border-slate-200 w-[180px] h-[120px] shadow-inner bg-slate-50" />
    );
  };

  const renderChooseStyleScreen = () => {
    return (
      <div className="flex-1 w-full bg-slate-50 p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="border-b border-slate-200 pb-6">
            <button
              onClick={() => setActiveScreen('crop')}
              className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer mb-2"
            >
              <span>← Back to Crop</span>
            </button>
            <h2 className="text-2xl font-black bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent uppercase tracking-tight">
              JUST SHOP SAGA – 3 ART STYLE PREVIEW
            </h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              SAME PHOTO – 3 DIFFERENT STYLES | CHOOSE YOUR FAVOURITE
            </p>
          </div>

          {/* Grid layout for 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {getFilterPresets().map((preset, idx) => {
              const previewSrc = filterPreviews[preset.id];
              const allowedDMC = DMC_COLORS.filter(c => preset.allowedColors.includes(c.code));
              return (
                <div key={preset.id} className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 hover:border-slate-350 hover:shadow-md transition duration-200">
                  
                  {/* Card Header */}
                  <div className="text-center space-y-1">
                    <span className="text-xs font-black text-pink-600 uppercase tracking-widest">
                      {idx + 1}. {preset.name}
                    </span>
                    <h3 className="text-[10px] font-bold text-slate-500 leading-normal">
                      {preset.subtitle}
                    </h3>
                  </div>

                  {/* Previews Frame */}
                  <div className="flex flex-col items-center space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    {/* Processed photo */}
                    <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center relative">
                      {previewSrc ? (
                        <img src={previewSrc} alt={preset.name} className="w-full h-full object-cover" />
                      ) : (
                        <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
                      )}
                    </div>

                    {/* Small guide preview canvas */}
                    <div className="flex flex-col items-center space-y-1 w-full pt-1.5 border-t border-slate-200">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                        Diamond Guide Preview (Zoom)
                      </span>
                      <MiniGridPreview filterId={preset.id} allowedColors={preset.allowedColors} />
                    </div>
                  </div>

                  {/* Colors List */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block text-center">
                      Colors Used in this Style ({preset.allowedColors.length} Colors)
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      {allowedDMC.map((c, sIdx) => {
                        const symbol = VISUAL_SYMBOLS[sIdx % VISUAL_SYMBOLS.length] || '•';
                        return (
                          <div key={c.code} className="flex flex-col items-center bg-slate-50 border border-slate-200 p-1.5 rounded-xl min-w-[42px] shrink-0 text-center">
                            <div className="w-4 h-4 rounded border border-slate-200 shadow-inner flex items-center justify-center" style={{ backgroundColor: c.hex }}>
                              <span className="text-[8px] font-black text-slate-950 font-sans" style={{ color: (c.r*0.299+c.g*0.587+c.b*0.114)>128 ? '#000000':'#ffffff' }}>
                                {symbol}
                              </span>
                            </div>
                            <span className="text-[8px] font-black text-slate-800 mt-1">DMC {c.code}</span>
                            <span className="text-[6px] text-slate-500 font-bold truncate max-w-[40px]">{c.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Best For Info */}
                  <div className="text-[10px] text-slate-500 text-center leading-normal pt-2 border-t border-slate-200">
                    <span className="text-slate-400 font-bold">Best For: </span>
                    <span className="text-slate-700 font-semibold">{preset.bestFor}</span>
                  </div>

                  {/* Action Select Button */}
                  <button
                    onClick={() => {
                      setActiveFilter(preset.id);
                      hasAutoZoomedRef.current = false;
                      setActiveScreen('grid-viewer');
                    }}
                    className="w-full py-3 rounded-2xl bg-pink-600 hover:bg-pink-500 text-white font-black text-xs uppercase tracking-wider transition duration-150 cursor-pointer active:scale-95 shadow-md shadow-pink-600/10"
                  >
                    Select this Style
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    );
  };

  const renderGridViewerScreen = () => {
    return (
      <div className="flex-1 flex flex-col-reverse lg:flex-row overflow-y-auto lg:overflow-hidden bg-slate-50">
        
        {/* LEFT COLUMN: SETTINGS PANEL */}
        <div className="w-full lg:w-[420px] bg-slate-50 border-t lg:border-t-0 lg:border-r border-slate-200 overflow-visible lg:overflow-y-auto p-6 space-y-8 shrink-0 flex flex-col">
          
          <button
            onClick={() => setActiveScreen('choose-style')}
            className="inline-flex items-center space-x-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:text-slate-800 cursor-pointer transition duration-150 self-start"
          >
            <span>← Back to Style Selection</span>
          </button>

          {/* STEP 1: READ-ONLY SELECTION DETAILS */}
          <div className="space-y-3.5 bg-white border border-slate-200 p-4 rounded-2xl">
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
          <div className="space-y-4 border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-pink-500">Selected Style</span>
              <span className="text-xs text-slate-500 font-medium">Style Details</span>
            </div>

            {/* Selected Filter Details (matching layout preview) */}
            {activeFilter && (() => {
              const currentPreset = getFilterPresets().find(f => f.id === activeFilter);
              if (!currentPreset) return null;
              return (
                <div className="bg-white border border-slate-200 p-3.5 rounded-2xl space-y-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Selected Style Details</span>
                    <span className="text-[9px] text-pink-600 font-mono font-bold bg-pink-50 px-2 py-0.5 rounded border border-pink-100">
                      {currentPreset.allowedColors.length} Colors
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-800 leading-tight">
                    {currentPreset.subtitle}
                  </div>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    {currentPreset.description}
                  </p>
                  <div className="text-[10px] leading-normal pt-1.5 border-t border-slate-200">
                    <span className="text-slate-500 font-bold">Best For: </span>
                    <span className="text-slate-700 font-semibold">{currentPreset.bestFor}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* DOWNLOAD & INSTRUCTIONS BUTTON */}
          <div className="space-y-3.5 border-t border-slate-200 pt-6">
            <button
              onClick={triggerPDFExport}
              disabled={!pattern}
              className={`w-full py-4 rounded-2xl font-extrabold text-xs flex items-center justify-center space-x-2 shadow-xl transition-all duration-200 ${
                pattern 
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
          
          {/* Canvas or Welcome states */}
          <div className="flex-1 w-full h-full p-6 flex items-center justify-center select-none bg-slate-100/30">
            <div className="w-full max-w-[800px] aspect-[4/3] max-h-[60vh] bg-white border border-slate-200 rounded-3xl relative overflow-hidden shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing">
              {isProcessing ? (
                <div className="text-center p-8 flex flex-col items-center space-y-4">
                  <RefreshCw className="h-10 w-10 text-pink-500 animate-spin" />
                  <div>
                    <h4 className="font-extrabold text-base text-slate-800">Processing Painting</h4>
                    <p className="text-xs text-slate-500 mt-1">Generating custom DMC legend guide and grid coordinates...</p>
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

          {/* Color Legend Footer Strip */}
          {pattern && !isProcessing && (
            <div className="h-28 bg-slate-50 border-t border-slate-200 p-4 flex items-center space-x-3.5 overflow-x-auto shrink-0 z-10">
              {pattern.palette.map(c => {
                const isSelected = selectedColorCode === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => setSelectedColorCode(isSelected ? null : c.code)}
                    className={`p-3 rounded-2xl border flex flex-col items-center space-y-1.5 shrink-0 transition cursor-pointer ${
                      isSelected 
                        ? 'bg-white border-pink-500 shadow-md shadow-pink-500/5' 
                        : 'bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded border border-slate-200 shadow-inner" style={{ backgroundColor: c.hex }} />
                      <span className="text-sm font-extrabold text-slate-800">{c.symbol}</span>
                    </div>
                    <span className="text-[10px] font-bold font-mono text-slate-600">DMC {c.code}</span>
                    <span className="text-[9px] text-slate-500 font-medium">{c.count} pcs</span>
                  </button>
                );
              })}
            </div>
          )}

        </div>

      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-pink-500 selection:text-white">
      
      {/* Sleek Gradient Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="bg-gradient-to-tr from-pink-500 to-indigo-500 p-2 sm:p-2.5 rounded-xl shadow-lg shadow-pink-500/20 shrink-0">
            <Sparkles className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-white animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm sm:text-lg tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-pink-600 bg-clip-text text-transparent font-premium-heading truncate">
              Saga Diamond Art Creator
            </h1>
            <p className="text-[8px] sm:text-[10px] text-slate-500 font-semibold uppercase tracking-wider truncate">
              Instantly turn custom photos into diamond grids
            </p>
          </div>
        </div>

        <a
          href="https://justshopsaga.shop/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-full border border-slate-200 hover:border-pink-500/50 bg-slate-100/50 text-slate-700 hover:text-slate-950 font-extrabold text-[10px] sm:text-xs tracking-wider uppercase transition-all duration-200 active:scale-95 shadow-md shadow-slate-100/50 cursor-pointer shrink-0"
        >
          <span>Visit Shop</span>
          <span className="text-[8px] sm:text-[10px] text-pink-400">→</span>
        </a>
      </header>

      {/* Screen Router Views */}
      {activeScreen === 'landing' && renderLandingScreen()}
      {activeScreen === 'select-kit' && renderSelectKitScreen()}
      {activeScreen === 'crop' && renderCropScreen()}
      {activeScreen === 'choose-style' && renderChooseStyleScreen()}
      {activeScreen === 'grid-viewer' && renderGridViewerScreen()}
    </div>
  );
}
