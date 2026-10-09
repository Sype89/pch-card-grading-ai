/**
 * Centering analysis.
 *
 * Measures the relative width of the left/right and top/bottom borders
 * inside the detected card region by sampling luminance transitions
 * near the edges. Only reports measurements when borders can be
 * identified with reasonable confidence; otherwise measurable=false.
 */

import type { CenteringAnalysis, CardDetection, BoundingBox } from '../types';

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function getCardPixels(
  image: HTMLImageElement | ImageBitmap,
  box: BoundingBox
): { data: Uint8ClampedArray; w: number; h: number } {
  const canvas = document.createElement('canvas');
  // Work at moderate resolution for speed
  const maxSide = 700;
  const scale = Math.min(1, maxSide / Math.max(box.width, box.height));
  const w = Math.round(box.width * scale);
  const h = Math.round(box.height * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(
    image,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    w,
    h
  );
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/**
 * Find the distance from the outer edge to the first strong interior
 * content transition by scanning inward and looking for a sustained
 * luminance change (border → artwork).
 */
function measureBorder(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  direction: 'left' | 'right' | 'top' | 'bottom'
): { width: number; confidence: number } {
  const maxSearch = Math.floor(
    (direction === 'left' || direction === 'right' ? w : h) * 0.22
  );
  const samples = 12; // parallel scan lines
  const widths: number[] = [];

  for (let s = 0; s < samples; s++) {
    let found = -1;
    if (direction === 'left' || direction === 'right') {
      const y = Math.floor((h * (s + 1)) / (samples + 1));
      let prev = -1;
      for (let d = 0; d < maxSearch; d++) {
        const x = direction === 'left' ? d : w - 1 - d;
        const i = (y * w + x) * 4;
        const l = luminance(data[i], data[i + 1], data[i + 2]);
        if (prev >= 0 && Math.abs(l - prev) > 28) {
          // require a few consecutive differences
          let confirm = 0;
          for (let k = 1; k <= 3; k++) {
            const xx = direction === 'left' ? x + k : x - k;
            if (xx < 0 || xx >= w) break;
            const ii = (y * w + xx) * 4;
            const ll = luminance(data[ii], data[ii + 1], data[ii + 2]);
            if (Math.abs(ll - l) < 18) confirm++;
          }
          if (confirm >= 2) {
            found = d;
            break;
          }
        }
        prev = l;
      }
    } else {
      const x = Math.floor((w * (s + 1)) / (samples + 1));
      let prev = -1;
      for (let d = 0; d < maxSearch; d++) {
        const y = direction === 'top' ? d : h - 1 - d;
        const i = (y * w + x) * 4;
        const l = luminance(data[i], data[i + 1], data[i + 2]);
        if (prev >= 0 && Math.abs(l - prev) > 28) {
          let confirm = 0;
          for (let k = 1; k <= 3; k++) {
            const yy = direction === 'top' ? y + k : y - k;
            if (yy < 0 || yy >= h) break;
            const ii = (yy * w + x) * 4;
            const ll = luminance(data[ii], data[ii + 1], data[ii + 2]);
            if (Math.abs(ll - l) < 18) confirm++;
          }
          if (confirm >= 2) {
            found = d;
            break;
          }
        }
        prev = l;
      }
    }
    if (found >= 0) widths.push(found);
  }

  if (widths.length < 4) {
    return { width: 0, confidence: 0 };
  }

  // Median
  widths.sort((a, b) => a - b);
  const mid = Math.floor(widths.length / 2);
  const median = widths.length % 2 ? widths[mid] : (widths[mid - 1] + widths[mid]) / 2;

  // Consistency → confidence
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const variance =
    widths.reduce((a, b) => a + (b - mean) ** 2, 0) / widths.length;
  const std = Math.sqrt(variance);
  const consistency = Math.max(0, 1 - std / (median + 1));
  const confidence = Math.min(0.9, 0.4 + consistency * 0.5);

  return { width: median, confidence };
}

function ratioString(a: number, b: number): string {
  const total = a + b;
  if (total < 1e-6) return '50/50';
  const leftPct = Math.round((a / total) * 100);
  const rightPct = 100 - leftPct;
  return `${leftPct}/${rightPct}`;
}

/** Map border imbalance to a 0–10 centering score (higher = better) */
function centeringScoreFromRatios(
  lrLeft: number,
  lrRight: number,
  tbTop: number,
  tbBottom: number
): number {
  const lrTotal = lrLeft + lrRight;
  const tbTotal = tbTop + tbBottom;
  if (lrTotal < 1 || tbTotal < 1) return 5; // neutral fallback

  const lrImbalance = Math.abs(lrLeft - lrRight) / lrTotal;
  const tbImbalance = Math.abs(tbTop - tbBottom) / tbTotal;

  // PSA-style rough mapping (prototype only)
  // Perfect 50/50 → 10; 60/40 → ~8; 70/30 → ~6; 80/20 → ~4
  const lrScore = Math.max(0, 10 - lrImbalance * 20);
  const tbScore = Math.max(0, 10 - tbImbalance * 20);
  return Math.round(((lrScore + tbScore) / 2) * 10) / 10;
}

export async function analyzeCentering(
  image: HTMLImageElement | ImageBitmap,
  detection: CardDetection
): Promise<CenteringAnalysis> {
  if (!detection.detected || !detection.boundingBox || detection.confidence < 0.35) {
    return {
      measurable: false,
      leftBorderRatio: null,
      rightBorderRatio: null,
      topBorderRatio: null,
      bottomBorderRatio: null,
      leftRightRatio: null,
      topBottomRatio: null,
      centeringScore: null,
      confidence: 0,
      notes: [
        'Centering cannot be measured: card boundaries were not reliably detected. Upload a clearer photo with the full card visible against a contrasting background.',
      ],
    };
  }

  const { data, w, h } = getCardPixels(image, detection.boundingBox);

  const left = measureBorder(data, w, h, 'left');
  const right = measureBorder(data, w, h, 'right');
  const top = measureBorder(data, w, h, 'top');
  const bottom = measureBorder(data, w, h, 'bottom');

  const avgConf =
    (left.confidence + right.confidence + top.confidence + bottom.confidence) / 4;

  if (avgConf < 0.3 || (left.width + right.width < 2 && top.width + bottom.width < 2)) {
    return {
      measurable: false,
      leftBorderRatio: null,
      rightBorderRatio: null,
      topBorderRatio: null,
      bottomBorderRatio: null,
      leftRightRatio: null,
      topBottomRatio: null,
      centeringScore: null,
      confidence: avgConf,
      notes: [
        'Could not identify consistent border transitions. Possible causes: card already tightly cropped, low contrast borders, heavy glare, or non-standard border design.',
      ],
    };
  }

  const lrTotal = left.width + right.width || 1;
  const tbTotal = top.width + bottom.width || 1;

  const leftRatio = left.width / lrTotal;
  const rightRatio = right.width / lrTotal;
  const topRatio = top.width / tbTotal;
  const bottomRatio = bottom.width / tbTotal;

  const score = centeringScoreFromRatios(left.width, right.width, top.width, bottom.width);

  const notes: string[] = [];
  if (avgConf < 0.55) {
    notes.push('Border detection confidence is moderate – treat ratios as approximate.');
  }
  if (detection.cropSuspicion !== 'none') {
    notes.push('Image may be cropped; measured borders could be incomplete.');
  }

  return {
    measurable: true,
    leftBorderRatio: Math.round(leftRatio * 1000) / 1000,
    rightBorderRatio: Math.round(rightRatio * 1000) / 1000,
    topBorderRatio: Math.round(topRatio * 1000) / 1000,
    bottomBorderRatio: Math.round(bottomRatio * 1000) / 1000,
    leftRightRatio: ratioString(left.width, right.width),
    topBottomRatio: ratioString(top.width, bottom.width),
    centeringScore: score,
    confidence: Math.round(avgConf * 100) / 100,
    notes,
  };
}
