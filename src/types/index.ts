/**
 * PCH Card Grading AI – Core Types & JSON Schema
 * All analysis results are structured for future HoloScan integration.
 */

export type ImageSide = 'front' | 'back';
export type CornerId = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
export type EdgeId = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

/** Image quality metrics derived from pixel statistics */
export interface ImageQuality {
  width: number;
  height: number;
  aspectRatio: number;
  blurScore: number;          // Laplacian variance; higher = sharper
  brightness: number;         // 0–255 mean luminance
  contrast: number;           // std-dev of luminance
  reflectionRisk: 'low' | 'medium' | 'high';
  lightingQuality: 'poor' | 'acceptable' | 'good';
  resolutionAdequate: boolean;
  warnings: string[];
  confidence: number;         // 0–1 overall image suitability
}

/** Card detection result */
export interface CardDetection {
  detected: boolean;
  corners: Quad | null;
  boundingBox: BoundingBox | null;
  alignmentAngle: number;     // degrees from horizontal
  perspectiveSkew: number;    // 0–1 estimate of distortion
  cropSuspicion: 'none' | 'possible' | 'likely';
  method: 'contour' | 'edge' | 'color-threshold' | 'manual' | 'failed';
  confidence: number;
  message: string;
}

/** Centering measurements (ratios of border widths) */
export interface CenteringAnalysis {
  measurable: boolean;
  leftBorderRatio: number | null;   // fraction of total horizontal border
  rightBorderRatio: number | null;
  topBorderRatio: number | null;
  bottomBorderRatio: number | null;
  leftRightRatio: string | null;    // e.g. "55/45"
  topBottomRatio: string | null;
  centeringScore: number | null;    // 0–10
  confidence: number;
  notes: string[];
}

export type DefectSeverity = 'none' | 'minor' | 'moderate' | 'severe' | 'unknown';

export interface CornerFinding {
  side: ImageSide;
  corner: CornerId;
  whitening: DefectSeverity;
  fraying: DefectSeverity;
  bending: DefectSeverity;
  rounding: DefectSeverity;
  overall: DefectSeverity;
  confidence: number;
  notes: string;
  /** Pixel region examined (relative to detected card) */
  region?: BoundingBox;
}

export interface EdgeFinding {
  side: ImageSide;
  edge: EdgeId;
  whitening: DefectSeverity;
  chipping: DefectSeverity;
  wear: DefectSeverity;
  overall: DefectSeverity;
  confidence: number;
  notes: string;
  highlightedSegments?: BoundingBox[];
}

export interface SurfaceFinding {
  side: ImageSide;
  type: 'scratch' | 'crease' | 'dent' | 'stain' | 'print-defect' | 'holo-damage' | 'other';
  severity: DefectSeverity;
  confidence: number;
  description: string;
  location?: BoundingBox;
  isHypothesis: boolean;  // true = uncertain / needs closer photo
}

export interface CategoryScore {
  category: 'centering' | 'corners' | 'edges' | 'surface';
  score: number | null;       // 0–10, null if inconclusive
  confidence: number;
  explanation: string;
  defects: string[];
}

export interface OverallAssessment {
  provisionalGrade: number | null;  // 1–10 unofficial estimate
  conditionLabel: string;           // e.g. "Near Mint", "Inconclusive"
  confidence: number;
  summary: string;
  categoryScores: CategoryScore[];
  warnings: string[];
  limitations: string[];
}

export interface Annotation {
  id: string;
  side: ImageSide;
  type: 'corner' | 'edge' | 'surface' | 'centering' | 'detection';
  label: string;
  reason: string;
  severity: DefectSeverity;
  geometry: BoundingBox | Point | Quad;
  confidence: number;
}

export interface AnalysisResult {
  version: string;
  timestamp: string;
  frontQuality: ImageQuality | null;
  backQuality: ImageQuality | null;
  frontDetection: CardDetection | null;
  backDetection: CardDetection | null;
  centering: CenteringAnalysis | null;
  corners: CornerFinding[];
  edges: EdgeFinding[];
  surface: SurfaceFinding[];
  overall: OverallAssessment;
  annotations: Annotation[];
  processingTimeMs: number;
  warnings: string[];
}

/** Options for the public analyzeCard API */
export interface AnalyzeOptions {
  skipBack?: boolean;
  maxDimension?: number;      // downscale for performance
  enablePerspectiveCorrection?: boolean;
  debug?: boolean;
}

/** Public integration interface return type */
export interface AnalyzeCardResult {
  success: boolean;
  result: AnalysisResult | null;
  error?: string;
}

/** JSON Schema (documented) for AnalysisResult – see docs/schema.md */
export const ANALYSIS_RESULT_VERSION = '1.0.0-prototype';
