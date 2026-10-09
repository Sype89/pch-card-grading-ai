/**
 * Card boundary detection using color/edge heuristics on Canvas.
 *
 * This is a WORKING heuristic prototype – not a production-grade CV model.
 * It looks for a high-contrast rectangular region (typical of a card on a
 * contrasting background). When detection confidence is low we return
 * detected:false and explain why.
 */

import type { CardDetection, Point, Quad, BoundingBox } from '../types';

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

interface PixelStats {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

function getImageData(img: HTMLImageElement | ImageBitmap, maxDim = 800): PixelStats {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** Simple Sobel magnitude at a point (sampled) */
function edgeStrength(stats: PixelStats, x: number, y: number): number {
  const { data, w, h } = stats;
  if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return 0;
  const idx = (yy: number, xx: number) => {
    const i = (yy * w + xx) * 4;
    return luminance(data[i], data[i + 1], data[i + 2]);
  };
  const gx =
    -idx(y - 1, x - 1) + idx(y - 1, x + 1) -
    2 * idx(y, x - 1) + 2 * idx(y, x + 1) -
    idx(y + 1, x - 1) + idx(y + 1, x + 1);
  const gy =
    -idx(y - 1, x - 1) - 2 * idx(y - 1, x) - idx(y - 1, x + 1) +
    idx(y + 1, x - 1) + 2 * idx(y + 1, x) + idx(y + 1, x + 1);
  return Math.sqrt(gx * gx + gy * gy);
}

/**
 * Find the dominant rectangular content region by projecting edge energy
 * onto horizontal and vertical axes (integral projection method).
 */
function findContentBounds(stats: PixelStats): BoundingBox | null {
  const { w, h } = stats;
  const step = 2;
  const colEnergy = new Float32Array(w);
  const rowEnergy = new Float32Array(h);

  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const e = edgeStrength(stats, x, y);
      colEnergy[x] += e;
      rowEnergy[y] += e;
    }
  }

  // Smooth
  const smooth = (arr: Float32Array, k = 5) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0, c = 0;
      for (let j = -k; j <= k; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < arr.length) {
          s += arr[idx];
          c++;
        }
      }
      out[i] = s / c;
    }
    return out;
  };
  const colS = smooth(colEnergy);
  const rowS = smooth(rowEnergy);

  const threshold = (arr: Float32Array) => {
    let max = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    return max * 0.18;
  };
  const colT = threshold(colS);
  const rowT = threshold(rowS);

  let left = 0;
  while (left < w && colS[left] < colT) left++;
  let right = w - 1;
  while (right > left && colS[right] < colT) right--;
  let top = 0;
  while (top < h && rowS[top] < rowT) top++;
  let bottom = h - 1;
  while (bottom > top && rowS[bottom] < rowT) bottom--;

  const bw = right - left;
  const bh = bottom - top;
  if (bw < w * 0.25 || bh < h * 0.25) return null;
  if (bw > w * 0.98 && bh > h * 0.98) {
    // Almost full frame – possible already-cropped card or no background
    return { x: left, y: top, width: bw, height: bh };
  }
  return { x: left, y: top, width: bw, height: bh };
}

function boundsToQuad(b: BoundingBox): Quad {
  return {
    topLeft: { x: b.x, y: b.y },
    topRight: { x: b.x + b.width, y: b.y },
    bottomRight: { x: b.x + b.width, y: b.y + b.height },
    bottomLeft: { x: b.x, y: b.y + b.height },
  };
}

/** Estimate alignment angle from the top edge energy (very coarse) */
function estimateAlignment(stats: PixelStats, box: BoundingBox): number {
  // Sample top edge and fit a simple slope
  const samples: { x: number; y: number }[] = [];
  const y0 = Math.max(1, box.y);
  const y1 = Math.min(stats.h - 2, box.y + Math.round(box.height * 0.08));
  for (let x = box.x + 5; x < box.x + box.width - 5; x += 4) {
    let maxE = 0;
    let bestY = y0;
    for (let y = y0; y <= y1; y++) {
      const e = edgeStrength(stats, x, y);
      if (e > maxE) {
        maxE = e;
        bestY = y;
      }
    }
    if (maxE > 20) samples.push({ x, y: bestY });
  }
  if (samples.length < 8) return 0;
  // Linear regression
  const n = samples.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (const p of samples) {
    sx += p.x;
    sy += p.y;
    sxy += p.x * p.y;
    sx2 += p.x * p.x;
  }
  const denom = n * sx2 - sx * sx;
  if (Math.abs(denom) < 1e-6) return 0;
  const slope = (n * sxy - sx * sy) / denom;
  return (Math.atan(slope) * 180) / Math.PI;
}

export async function detectCard(
  image: HTMLImageElement | ImageBitmap
): Promise<CardDetection> {
  const stats = getImageData(image, 900);
  const scaleX = image.width / stats.w;
  const scaleY = image.height / stats.h;

  const bounds = findContentBounds(stats);

  if (!bounds) {
    return {
      detected: false,
      corners: null,
      boundingBox: null,
      alignmentAngle: 0,
      perspectiveSkew: 0,
      cropSuspicion: 'none',
      method: 'failed',
      confidence: 0,
      message:
        'Could not locate a card-like rectangular region. Ensure the card is fully visible against a contrasting, uncluttered background and is reasonably well lit.',
    };
  }

  // Scale back to original coordinates
  const origBox: BoundingBox = {
    x: Math.round(bounds.x * scaleX),
    y: Math.round(bounds.y * scaleY),
    width: Math.round(bounds.width * scaleX),
    height: Math.round(bounds.height * scaleY),
  };

  const aspect = origBox.width / origBox.height;
  // Standard trading card aspect ≈ 2.5/3.5 ≈ 0.714
  const ideal = 2.5 / 3.5;
  const aspectDiff = Math.abs(aspect - ideal) / ideal;

  let confidence = 0.55;
  let cropSuspicion: CardDetection['cropSuspicion'] = 'none';
  const notes: string[] = [];

  if (aspectDiff < 0.08) {
    confidence += 0.25;
  } else if (aspectDiff < 0.18) {
    confidence += 0.1;
    notes.push('Aspect ratio slightly off standard card proportions.');
  } else {
    confidence -= 0.15;
    notes.push('Detected region aspect ratio differs substantially from a standard trading card.');
    cropSuspicion = 'possible';
  }

  // Check if the box nearly fills the frame
  const fillX = origBox.width / image.width;
  const fillY = origBox.height / image.height;
  if (fillX > 0.96 && fillY > 0.96) {
    cropSuspicion = 'likely';
    notes.push('Image appears tightly cropped; borders may be incomplete.');
    confidence *= 0.7;
  } else if (fillX > 0.9 && fillY > 0.9) {
    cropSuspicion = 'possible';
  }

  const angle = estimateAlignment(stats, bounds);
  const absAngle = Math.abs(angle);
  if (absAngle > 8) {
    notes.push(`Card appears rotated ≈ ${absAngle.toFixed(1)}°.`);
    confidence *= 0.85;
  }

  // Perspective skew is only a coarse placeholder – real correction needs 4 reliable corners
  const perspectiveSkew = Math.min(1, absAngle / 25);

  const quad = boundsToQuad(origBox);

  // Final confidence clamp
  confidence = Math.max(0.1, Math.min(0.92, confidence));

  const message =
    confidence >= 0.6
      ? `Card region detected with ${(confidence * 100).toFixed(0)}% confidence.`
      : `Weak detection (${(confidence * 100).toFixed(0)}% confidence). Results may be unreliable – consider a cleaner photo.`;

  return {
    detected: true,
    corners: quad,
    boundingBox: origBox,
    alignmentAngle: Math.round(angle * 10) / 10,
    perspectiveSkew: Math.round(perspectiveSkew * 100) / 100,
    cropSuspicion,
    method: 'edge',
    confidence,
    message: notes.length ? `${message} ${notes.join(' ')}` : message,
  };
}

/**
 * Very lightweight perspective "correction" – only applies a 2-D rotation
 * when the detected angle is significant. Full homography is out of scope
 * for this pure-Canvas prototype.
 */
export function correctPerspective(
  image: HTMLImageElement | ImageBitmap,
  detection: CardDetection
): HTMLCanvasElement | null {
  if (!detection.detected || !detection.boundingBox) return null;
  const angle = detection.alignmentAngle;
  if (Math.abs(angle) < 2) return null; // no meaningful correction

  const canvas = document.createElement('canvas');
  const box = detection.boundingBox;
  // Expand slightly
  const pad = 8;
  const sx = Math.max(0, box.x - pad);
  const sy = Math.max(0, box.y - pad);
  const sw = Math.min(image.width - sx, box.width + pad * 2);
  const sh = Math.min(image.height - sy, box.height + pad * 2);

  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(sw / 2, sh / 2);
  ctx.rotate((-angle * Math.PI) / 180);
  ctx.drawImage(image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  return canvas;
}
