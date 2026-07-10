export interface DMCColor {
  code: string;
  name: string;
  r: number;
  g: number;
  b: number;
  hex: string;
}

export type DiamondShape = 'square' | 'round';
export type QuantizationAlgorithm = 'k-means' | 'median-cut' | 'octree';
export type GridResolutionPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface EditorSettings {
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  saturation: number; // -100 to 100
  exposure: number;   // -100 to 100
  sharpen: boolean;
  rotate: number;     // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface CanvasSettings {
  preset: string; // '20x20', '30x30', '30x40', '40x50', '50x70', 'custom'
  widthCm: number;
  heightCm: number;
  shape: DiamondShape;
}

export interface ResolutionSettings {
  preset: GridResolutionPreset;
  width: number; // grid columns
  height: number; // grid rows
}

export interface ColorSettings {
  paletteType: 'dmc' | 'custom';
  maxColors: number;
  dither: boolean;
  algorithm: QuantizationAlgorithm;
}

export interface GeneratedPattern {
  width: number;
  height: number;
  pixels: {
    x: number;
    y: number;
    colorCode: string; // DMC code or hex code
    completed: boolean;
  }[];
  palette: {
    code: string;
    name: string;
    r: number;
    g: number;
    b: number;
    hex: string;
    symbol: string;
    count: number;
    percentage: number;
  }[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  originalImage: string; // Data URL or URL
  processedImage: string; // Data URL or URL
  editorSettings: EditorSettings;
  canvasSettings: CanvasSettings;
  resolutionSettings: ResolutionSettings;
  colorSettings: ColorSettings;
  pattern: GeneratedPattern | null;
  activationCodeUsed?: string;
  isUnlocked: boolean;
}

export interface ActivationCode {
  code: string;
  expirationDate: string;
  maxActivations: number;
  remainingActivations: number;
  productType: string;
}

export interface AdminStats {
  totalUsers: number;
  totalProjects: number;
  revenue: number;
  conversionRate: number;
  activationCodeUsage: number;
}
