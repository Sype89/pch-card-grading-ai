/**
 * Corner, edge and surface defect heuristics.
 *
 * IMPORTANT LIMITATIONS (communicated to the user):
 * - A single photograph cannot reliably detect every defect.
 * - Whitening is approximated by high-luminance pixels near edges/corners.
 * - Fine scratches, micro-creases and holographic pattern damage usually
 *   require controlled lighting and multiple angles.
 * - All findings below a confidence threshold are marked as hypotheses.
 */

import type {
  CornerFinding,
  EdgeFinding,
  SurfaceFinding,
  CardDetection,
  ImageSide,
  CornerId,
  EdgeId,
  BoundingBox,
  DefectSeverity,
  Annotation,
} from '../types';

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function extractRegion(
  image: HTMLImageElement | ImageBitmap,
  box: BoundingBox,
  maxSide = 200
): { data: Uint8ClampedArray; w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(box.width, box.height));
  const w = Math.max(1, Math.round(box.width * scale));
  const h = Math.max(1, Math.round(box.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

function severityFromRatio(ratio: number): DefectSeverity {
  if (ratio < 0.02) return 'none';
  if (ratio < 0.06) return 'minor';
  if (ratio < 0.15) return 'moderate';
  return 'severe';
}

/** Examine a corner patch for whitening / high-luminance outliers */
function analyzeCornerPatch(
  data: Uint8ClampedArray,
  w: number,
  h: number
): { whitening: DefectSeverity; confidence: number; notes: string } {
  let bright = 0;
  let total = 0;
  let meanL = 0;
  for (let i = 0; i < data.length; i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2]);
    meanL += l;
    total++;
    if (l > 230) bright++;
  }
  meanL /= total || 1;
  const ratio = bright / (total || 1);

  // Very bright mean with many near-white pixels → possible whitening
  let whitening = severityFromRatio(ratio);
  let confidence = 0.35;
  let notes = 'Corner patch examined via luminance statistics.';

  if (meanL > 200 && ratio > 0.1) {
    whitening = ratio > 0.25 ? 'severe' : ratio > 0.12 ? 'moderate' : 'minor';
    confidence = 0.55;
    notes = 'Elevated bright pixels near corner – possible whitening or reflection.';
  } else if (ratio < 0.015) {
    whitening = 'none';
    confidence = 0.5;
    notes = 'No significant bright-pixel cluster detected in corner region.';
  }

  // We cannot reliably detect fraying/bending/rounding from a single flat photo
  return { whitening, confidence, notes };
}

export async function analyzeCorners(
  image: HTMLImageElement | ImageBitmap,
  detection: CardDetection,
  side: ImageSide
): Promise<CornerFinding[]> {
  const findings: CornerFinding[] = [];
  if (!detection.detected || !detection.boundingBox) {
    for (const corner of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as CornerId[]) {
      findings.push({
        side,
        corner,
        whitening: 'unknown',
        fraying: 'unknown',
        bending: 'unknown',
        rounding: 'unknown',
        overall: 'unknown',
        confidence: 0,
        notes: 'Card not detected – corner analysis skipped.',
      });
    }
    return findings;
  }

  const box = detection.boundingBox;
  const cornerSize = Math.round(Math.min(box.width, box.height) * 0.12);
  const corners: { id: CornerId; x: number; y: number }[] = [
    { id: 'topLeft', x: box.x, y: box.y },
    { id: 'topRight', x: box.x + box.width - cornerSize, y: box.y },
    { id: 'bottomLeft', x: box.x, y: box.y + box.height - cornerSize },
    { id: 'bottomRight', x: box.x + box.width - cornerSize, y: box.y + box.height - cornerSize },
  ];

  for (const c of corners) {
    const region: BoundingBox = {
      x: Math.max(0, c.x),
      y: Math.max(0, c.y),
      width: cornerSize,
      height: cornerSize,
    };
    const { data, w, h } = extractRegion(image, region);
    const result = analyzeCornerPatch(data, w, h);

    findings.push({
      side,
      corner: c.id,
      whitening: result.whitening,
      fraying: 'unknown', // requires side-light / macro
      bending: 'unknown',
      rounding: 'unknown',
      overall: result.whitening,
      confidence: result.confidence * detection.confidence,
      notes: result.notes + ' Fraying, bending and rounding cannot be assessed from this single view.',
      region,
    });
  }
  return findings;
}

/** Edge strip analysis – similar luminance approach along the four edges */
export async function analyzeEdges(
  image: HTMLImageElement | ImageBitmap,
  detection: CardDetection,
  side: ImageSide
): Promise<EdgeFinding[]> {
  const findings: EdgeFinding[] = [];
  if (!detection.detected || !detection.boundingBox) {
    for (const edge of ['top', 'right', 'bottom', 'left'] as EdgeId[]) {
      findings.push({
        side,
        edge,
        whitening: 'unknown',
        chipping: 'unknown',
        wear: 'unknown',
        overall: 'unknown',
        confidence: 0,
        notes: 'Card not detected – edge analysis skipped.',
      });
    }
    return findings;
  }

  const box = detection.boundingBox;
  const strip = Math.round(Math.min(box.width, box.height) * 0.06);

  const edges: { id: EdgeId; region: BoundingBox }[] = [
    {
      id: 'top',
      region: { x: box.x, y: box.y, width: box.width, height: strip },
    },
    {
      id: 'bottom',
      region: {
        x: box.x,
        y: box.y + box.height - strip,
        width: box.width,
        height: strip,
      },
    },
    {
      id: 'left',
      region: { x: box.x, y: box.y, width: strip, height: box.height },
    },
    {
      id: 'right',
      region: {
        x: box.x + box.width - strip,
        y: box.y,
        width: strip,
        height: box.height,
      },
    },
  ];

  for (const e of edges) {
    const { data } = extractRegion(image, e.region, 300);
    let bright = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (luminance(data[i], data[i + 1], data[i + 2]) > 225) bright++;
      total++;
    }
    const ratio = bright / (total || 1);
    const whitening = severityFromRatio(ratio);

    findings.push({
      side,
      edge: e.id,
      whitening,
      chipping: 'unknown',
      wear: whitening === 'none' ? 'none' : 'unknown',
      overall: whitening,
      confidence: Math.min(0.55, 0.3 + (1 - ratio) * 0.3) * detection.confidence,
      notes:
        whitening === 'none'
          ? 'No strong bright-pixel signal along edge strip.'
          : 'Bright pixels detected along edge – possible whitening or glare. Chipping requires closer inspection.',
      highlightedSegments: whitening !== 'none' ? [e.region] : undefined,
    });
  }
  return findings;
}

/**
 * Surface scan – looks for large luminance discontinuities that *might*
 * indicate scratches, stains or creases. Explicitly flags hypotheses.
 */
export async function analyzeSurface(
  image: HTMLImageElement | ImageBitmap,
  detection: CardDetection,
  side: ImageSide
): Promise<SurfaceFinding[]> {
  const findings: SurfaceFinding[] = [];

  if (!detection.detected || !detection.boundingBox) {
    findings.push({
      side,
      type: 'other',
      severity: 'unknown',
      confidence: 0,
      description: 'Surface analysis skipped – card region not detected.',
      isHypothesis: true,
    });
    return findings;
  }

  const box = detection.boundingBox;
  // Sample interior (exclude outer 8 %)
  const marginX = Math.round(box.width * 0.08);
  const marginY = Math.round(box.height * 0.08);
  const interior: BoundingBox = {
    x: box.x + marginX,
    y: box.y + marginY,
    width: box.width - marginX * 2,
    height: box.height - marginY * 2,
  };

  if (interior.width < 20 || interior.height < 20) {
    findings.push({
      side,
      type: 'other',
      severity: 'unknown',
      confidence: 0,
      description: 'Interior region too small after margin exclusion.',
      isHypothesis: true,
    });
    return findings;
  }

  const { data, w, h } = extractRegion(image, interior, 500);

  // Local variance map (coarse) to find anomalous patches
  const block = 16;
  const anomalies: { x: number; y: number; score: number }[] = [];
  for (let by = 0; by < h - block; by += block) {
    for (let bx = 0; bx < w - block; bx += block) {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let y = by; y < by + block; y++) {
        for (let x = bx; x < bx + block; x++) {
          const i = (y * w + x) * 4;
          const l = luminance(data[i], data[i + 1], data[i + 2]);
          sum += l;
          sumSq += l * l;
          n++;
        }
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      // High local variance can indicate a scratch, crease or print noise
      if (variance > 900) {
        anomalies.push({ x: bx, y: by, score: variance });
      }
    }
  }

  // Also check for large dark or bright stains
  let darkBlocks = 0;
  let brightBlocks = 0;
  for (let by = 0; by < h - block; by += block) {
    for (let bx = 0; bx < w - block; bx += block) {
      let sum = 0;
      let n = 0;
      for (let y = by; y < by + block; y += 2) {
        for (let x = bx; x < bx + block; x += 2) {
          const i = (y * w + x) * 4;
          sum += luminance(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      }
      const mean = sum / n;
      if (mean < 35) darkBlocks++;
      if (mean > 240) brightBlocks++;
    }
  }

  if (anomalies.length > 0) {
    anomalies.sort((a, b) => b.score - a.score);
    const top = anomalies.slice(0, 3);
    for (const a of top) {
      findings.push({
        side,
        type: 'scratch',
        severity: a.score > 2000 ? 'moderate' : 'minor',
        confidence: 0.3,
        description: `Local high-variance patch detected (possible scratch, texture or print noise). Variance=${Math.round(a.score)}.`,
        location: {
          x: interior.x + Math.round((a.x / w) * interior.width),
          y: interior.y + Math.round((a.y / h) * interior.height),
          width: Math.round((block / w) * interior.width),
          height: Math.round((block / h) * interior.height),
        },
        isHypothesis: true,
      });
    }
  }

  if (darkBlocks > 2) {
    findings.push({
      side,
      type: 'stain',
      severity: darkBlocks > 6 ? 'moderate' : 'minor',
      confidence: 0.25,
      description: `${darkBlocks} dark blocks found – possible stain, shadow or print defect. Requires visual confirmation.`,
      isHypothesis: true,
    });
  }

  if (brightBlocks > 3) {
    findings.push({
      side,
      type: 'other',
      severity: 'minor',
      confidence: 0.2,
      description: 'Multiple near-white interior blocks – possible glare, holographic flare or surface abrasion.',
      isHypothesis: true,
    });
  }

  if (findings.length === 0) {
    findings.push({
      side,
      type: 'other',
      severity: 'none',
      confidence: 0.4,
      description:
        'No strong anomalous patches detected in the interior. Fine scratches, micro-creases and holographic wear are often invisible in a single ambient-light photo.',
      isHypothesis: false,
    });
  }

  return findings;
}

/** Build annotation list from all findings for the visual defect map */
export function buildAnnotations(
  corners: CornerFinding[],
  edges: EdgeFinding[],
  surface: SurfaceFinding[],
  detection: CardDetection | null,
  side: ImageSide
): Annotation[] {
  const anns: Annotation[] = [];
  let id = 0;

  if (detection?.detected && detection.boundingBox) {
    anns.push({
      id: `${side}-det-${id++}`,
      side,
      type: 'detection',
      label: 'Detected card region',
      reason: detection.message,
      severity: 'none',
      geometry: detection.boundingBox,
      confidence: detection.confidence,
    });
  }

  for (const c of corners) {
    if (c.overall === 'none' || c.overall === 'unknown') continue;
    if (!c.region) continue;
    anns.push({
      id: `${side}-corner-${c.corner}`,
      side,
      type: 'corner',
      label: `${c.corner} – ${c.overall} whitening`,
      reason: c.notes,
      severity: c.overall,
      geometry: c.region,
      confidence: c.confidence,
    });
  }

  for (const e of edges) {
    if (e.overall === 'none' || e.overall === 'unknown') continue;
    const segs = e.highlightedSegments || [];
    for (const seg of segs) {
      anns.push({
        id: `${side}-edge-${e.edge}-${id++}`,
        side,
        type: 'edge',
        label: `${e.edge} edge – ${e.overall}`,
        reason: e.notes,
        severity: e.overall,
        geometry: seg,
        confidence: e.confidence,
      });
    }
  }

  for (const s of surface) {
    if (s.severity === 'none' || !s.location) continue;
    anns.push({
      id: `${side}-surf-${id++}`,
      side,
      type: 'surface',
      label: `${s.type} (${s.isHypothesis ? 'hypothesis' : 'observed'})`,
      reason: s.description,
      severity: s.severity,
      geometry: s.location,
      confidence: s.confidence,
    });
  }

  return anns;
}
