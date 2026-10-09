/**
 * Image quality analysis using Canvas pixel statistics.
 * Real measurements – no fabricated scores.
 */

import type { ImageQuality } from '../types';

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Laplacian variance approximation for blur detection */
function computeBlurScore(data: Uint8ClampedArray, w: number, h: number): number {
  // Sample every 4th pixel for speed
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const step = 4;
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const i = (y * w + x) * 4;
      const c = luminance(data[i], data[i + 1], data[i + 2]);
      const left = luminance(data[i - 4], data[i - 3], data[i - 2]);
      const right = luminance(data[i + 4], data[i + 5], data[i + 6]);
      const up = luminance(data[i - w * 4], data[i - w * 4 + 1], data[i - w * 4 + 2]);
      const down = luminance(data[i + w * 4], data[i + w * 4 + 1], data[i + w * 4 + 2]);
      const lap = Math.abs(4 * c - left - right - up - down);
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

function computeBrightnessContrast(data: Uint8ClampedArray): { brightness: number; contrast: number } {
  let sum = 0;
  let sumSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2]);
    sum += l;
    sumSq += l * l;
  }
  const brightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));
  return { brightness, contrast };
}

/** Detect possible specular reflections via high-luminance clusters */
function estimateReflectionRisk(data: Uint8ClampedArray, w: number, h: number): 'low' | 'medium' | 'high' {
  let brightPixels = 0;
  const threshold = 245;
  const sample = 8;
  for (let y = 0; y < h; y += sample) {
    for (let x = 0; x < w; x += sample) {
      const i = (y * w + x) * 4;
      if (luminance(data[i], data[i + 1], data[i + 2]) > threshold) brightPixels++;
    }
  }
  const total = Math.ceil(w / sample) * Math.ceil(h / sample);
  const ratio = brightPixels / total;
  if (ratio > 0.08) return 'high';
  if (ratio > 0.03) return 'medium';
  return 'low';
}

export async function analyzeImageQuality(
  image: HTMLImageElement | ImageBitmap,
  maxDim = 1200
): Promise<ImageQuality> {
  const w = image.width;
  const h = image.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, cw, ch);
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const data = imageData.data;

  const blurScore = computeBlurScore(data, cw, ch);
  const { brightness, contrast } = computeBrightnessContrast(data);
  const reflectionRisk = estimateReflectionRisk(data, cw, ch);

  const warnings: string[] = [];
  let confidence = 1.0;

  // Resolution check – Pokémon cards are roughly 2.5×3.5 in; we need enough pixels
  const resolutionAdequate = Math.min(w, h) >= 600;
  if (!resolutionAdequate) {
    warnings.push('Image resolution is low (< 600 px on shortest side). Close-up detail may be unreliable.');
    confidence *= 0.6;
  }

  // Blur thresholds (empirical for photo-of-card scenarios)
  if (blurScore < 15) {
    warnings.push('Image appears significantly blurred. Corner and edge detail will be unreliable.');
    confidence *= 0.4;
  } else if (blurScore < 40) {
    warnings.push('Mild blur detected. Fine surface defects may be missed.');
    confidence *= 0.75;
  }

  // Lighting
  let lightingQuality: ImageQuality['lightingQuality'] = 'good';
  if (brightness < 40 || brightness > 220) {
    lightingQuality = 'poor';
    warnings.push(brightness < 40 ? 'Image is very dark.' : 'Image is over-exposed.');
    confidence *= 0.5;
  } else if (brightness < 70 || brightness > 190) {
    lightingQuality = 'acceptable';
    warnings.push('Sub-optimal lighting (too dark or bright).');
    confidence *= 0.8;
  }

  if (contrast < 25) {
    warnings.push('Low contrast; borders and defects may be hard to distinguish.');
    confidence *= 0.7;
  }

  if (reflectionRisk === 'high') {
    warnings.push('Strong specular reflections detected – surface analysis will be limited.');
    confidence *= 0.55;
  } else if (reflectionRisk === 'medium') {
    warnings.push('Possible glare present.');
    confidence *= 0.85;
  }

  // Aspect ratio sanity (raw photo, not yet cropped)
  const aspectRatio = w / h;
  if (aspectRatio < 0.4 || aspectRatio > 2.5) {
    warnings.push('Unusual aspect ratio – ensure the full card is visible.');
  }

  confidence = Math.max(0.05, Math.min(1, confidence));

  return {
    width: w,
    height: h,
    aspectRatio,
    blurScore: Math.round(blurScore * 10) / 10,
    brightness: Math.round(brightness * 10) / 10,
    contrast: Math.round(contrast * 10) / 10,
    reflectionRisk,
    lightingQuality,
    resolutionAdequate,
    warnings,
    confidence,
  };
}

/** Validate file type and basic constraints before loading */
export function validateImageFile(file: File): { ok: boolean; error?: string } {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return { ok: false, error: `Unsupported format: ${file.type || 'unknown'}. Use JPG, PNG or WebP.` };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: 'File exceeds 25 MB limit.' };
  }
  if (file.size < 5 * 1024) {
    return { ok: false, error: 'File is suspiciously small.' };
  }
  return { ok: true };
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image.'));
    };
    img.src = url;
  });
}
