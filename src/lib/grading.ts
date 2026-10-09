/**
 * Transparent grading engine.
 *
 * Produces unofficial 1–10 estimates only when photographic evidence is
 * sufficient. Prefer INCONCLUSIVE over fabricated high grades.
 */

import type {
  AnalysisResult,
  CategoryScore,
  OverallAssessment,
  CenteringAnalysis,
  CornerFinding,
  EdgeFinding,
  SurfaceFinding,
  ImageQuality,
  CardDetection,
} from '../types';
import { ANALYSIS_RESULT_VERSION } from '../types';

function severityToPenalty(s: string): number {
  switch (s) {
    case 'none':
      return 0;
    case 'minor':
      return 0.6;
    case 'moderate':
      return 1.8;
    case 'severe':
      return 3.5;
    default:
      return 0; // unknown does not add penalty (but lowers confidence)
  }
}

function scoreCentering(c: CenteringAnalysis | null): CategoryScore {
  if (!c || !c.measurable || c.centeringScore == null) {
    return {
      category: 'centering',
      score: null,
      confidence: c?.confidence ?? 0,
      explanation:
        'Centering could not be measured from the provided images. Borders were not reliably identified.',
      defects: c?.notes ?? ['Unmeasurable'],
    };
  }
  return {
    category: 'centering',
    score: c.centeringScore,
    confidence: c.confidence,
    explanation: `Estimated L/R ${c.leftRightRatio}, T/B ${c.topBottomRatio}. Score derived from border imbalance (prototype heuristic).`,
    defects: c.notes,
  };
}

function scoreCorners(corners: CornerFinding[]): CategoryScore {
  if (corners.length === 0 || corners.every((c) => c.overall === 'unknown')) {
    return {
      category: 'corners',
      score: null,
      confidence: 0,
      explanation:
        'Corner condition could not be assessed. Card detection failed or image quality is insufficient for corner analysis.',
      defects: ['Insufficient evidence'],
    };
  }

  let penalty = 0;
  let known = 0;
  let confSum = 0;
  const defects: string[] = [];

  for (const c of corners) {
    confSum += c.confidence;
    if (c.overall !== 'unknown') {
      known++;
      penalty += severityToPenalty(c.overall);
      if (c.overall !== 'none') {
        defects.push(`${c.side} ${c.corner}: ${c.overall} (${c.notes.slice(0, 60)})`);
      }
    }
  }

  const avgConf = confSum / corners.length;
  if (known < 4) {
    return {
      category: 'corners',
      score: null,
      confidence: avgConf * 0.5,
      explanation: `Only ${known}/8 corner views produced usable signals. Fraying, bending and rounding remain unassessed from single photos.`,
      defects: defects.length ? defects : ['Partial evidence only'],
    };
  }

  const score = Math.max(1, Math.min(10, 10 - penalty));
  return {
    category: 'corners',
    score: Math.round(score * 10) / 10,
    confidence: avgConf,
    explanation:
      penalty === 0
        ? 'No strong whitening signals detected at corners. Other corner defects (fray, bend, round) cannot be ruled out from these photos alone.'
        : `Whitening signals contributed a penalty of ${penalty.toFixed(1)}. Physical wear beyond whitening is not fully observable.`,
    defects,
  };
}

function scoreEdges(edges: EdgeFinding[]): CategoryScore {
  if (edges.length === 0 || edges.every((e) => e.overall === 'unknown')) {
    return {
      category: 'edges',
      score: null,
      confidence: 0,
      explanation: 'Edge condition could not be assessed due to insufficient detection or image quality.',
      defects: ['Insufficient evidence'],
    };
  }

  let penalty = 0;
  let known = 0;
  let confSum = 0;
  const defects: string[] = [];

  for (const e of edges) {
    confSum += e.confidence;
    if (e.overall !== 'unknown') {
      known++;
      penalty += severityToPenalty(e.overall) * 0.7; // edges slightly less weighted per side
      if (e.overall !== 'none') {
        defects.push(`${e.side} ${e.edge}: ${e.overall}`);
      }
    }
  }

  const avgConf = confSum / edges.length;
  if (known < 4) {
    return {
      category: 'edges',
      score: null,
      confidence: avgConf * 0.5,
      explanation: `Only ${known} edge strips yielded usable data.`,
      defects,
    };
  }

  const score = Math.max(1, Math.min(10, 10 - penalty));
  return {
    category: 'edges',
    score: Math.round(score * 10) / 10,
    confidence: avgConf,
    explanation:
      penalty === 0
        ? 'No strong whitening along examined edge strips. Chipping and micro-wear require closer photos.'
        : `Edge whitening signals produced a penalty of ${penalty.toFixed(1)}.`,
    defects,
  };
}

function scoreSurface(surface: SurfaceFinding[]): CategoryScore {
  const confirmed = surface.filter((s) => !s.isHypothesis && s.severity !== 'none' && s.severity !== 'unknown');
  const hypotheses = surface.filter((s) => s.isHypothesis && s.severity !== 'none');

  if (surface.every((s) => s.severity === 'unknown')) {
    return {
      category: 'surface',
      score: null,
      confidence: 0,
      explanation: 'Surface could not be analysed.',
      defects: ['Insufficient evidence'],
    };
  }

  let penalty = 0;
  const defects: string[] = [];
  for (const s of confirmed) {
    penalty += severityToPenalty(s.severity);
    defects.push(`Confirmed: ${s.type} – ${s.description.slice(0, 80)}`);
  }
  // Hypotheses add smaller penalty and are listed separately
  for (const s of hypotheses) {
    penalty += severityToPenalty(s.severity) * 0.35;
    defects.push(`Hypothesis: ${s.type} – ${s.description.slice(0, 80)}`);
  }

  const conf =
    surface.reduce((a, s) => a + s.confidence, 0) / (surface.length || 1);

  // Single photo limitation
  const score = Math.max(1, Math.min(10, 10 - penalty));
  return {
    category: 'surface',
    score: Math.round(score * 10) / 10,
    confidence: Math.min(0.55, conf), // surface always capped – single photo limit
    explanation:
      confirmed.length === 0 && hypotheses.length === 0
        ? 'No strong surface anomalies detected. Fine scratches, creases and holographic wear are frequently invisible under ambient lighting.'
        : `Surface signals (including ${hypotheses.length} hypotheses) produced a penalty of ${penalty.toFixed(1)}. A single photograph is insufficient for definitive surface grading.`,
    defects,
  };
}

function conditionLabel(grade: number | null, conf: number): string {
  if (grade == null || conf < 0.35) return 'Inconclusive';
  if (grade >= 9.5) return 'Gem Mint (estimate)';
  if (grade >= 9) return 'Mint (estimate)';
  if (grade >= 8) return 'Near Mint–Mint (estimate)';
  if (grade >= 7) return 'Near Mint (estimate)';
  if (grade >= 5) return 'Excellent / Excellent–Mint (estimate)';
  if (grade >= 3) return 'Very Good / Good (estimate)';
  return 'Poor / Heavily Played (estimate)';
}

export function buildOverallAssessment(
  centering: CenteringAnalysis | null,
  corners: CornerFinding[],
  edges: EdgeFinding[],
  surface: SurfaceFinding[],
  frontQuality: ImageQuality | null,
  backQuality: ImageQuality | null,
  frontDetection: CardDetection | null,
  backDetection: CardDetection | null
): OverallAssessment {
  const catCentering = scoreCentering(centering);
  const catCorners = scoreCorners(corners);
  const catEdges = scoreEdges(edges);
  const catSurface = scoreSurface(surface);

  const categories = [catCentering, catCorners, catEdges, catSurface];
  const usable = categories.filter((c) => c.score != null);

  const warnings: string[] = [];
  const limitations: string[] = [
    'This is an unofficial prototype estimate, not a PSA, BGS or CGC grade.',
    'A single pair of photographs cannot capture every defect (especially fine surface wear and holographic damage).',
    'Whitening detection is a luminance heuristic and can be confounded by glare or light borders.',
    'Fraying, bending, corner rounding and micro-chipping generally require additional close-up or angled photos.',
  ];

  if (frontQuality && frontQuality.confidence < 0.5) {
    warnings.push('Front image quality is low – overall confidence reduced.');
  }
  if (backQuality && backQuality.confidence < 0.5) {
    warnings.push('Back image quality is low – overall confidence reduced.');
  }
  if (frontDetection && !frontDetection.detected) {
    warnings.push('Front card detection failed.');
  }
  if (backDetection && !backDetection.detected) {
    warnings.push('Back card detection failed or was skipped.');
  }

  let provisionalGrade: number | null = null;
  let confidence = 0;

  if (usable.length < 2) {
    confidence = Math.min(...categories.map((c) => c.confidence), 0.25);
    warnings.push('Too few categories could be scored – result is INCONCLUSIVE.');
  } else {
    // Weighted average of available scores; missing categories pull confidence down
    const weights: Record<string, number> = {
      centering: 0.25,
      corners: 0.3,
      edges: 0.25,
      surface: 0.2,
    };
    let sum = 0;
    let wSum = 0;
    let confSum = 0;
    for (const c of categories) {
      const w = weights[c.category];
      confSum += c.confidence * w;
      if (c.score != null) {
        sum += c.score * w;
        wSum += w;
      }
    }
    if (wSum > 0) {
      provisionalGrade = Math.round((sum / wSum) * 10) / 10;
    }
    confidence = confSum;
    // Penalise missing categories
    confidence *= usable.length / 4;
    confidence = Math.max(0.05, Math.min(0.85, confidence));
  }

  // Never auto-award high grades when evidence is thin
  if (provisionalGrade != null && confidence < 0.4 && provisionalGrade > 7) {
    provisionalGrade = Math.min(provisionalGrade, 7);
    warnings.push('Grade capped because overall evidence confidence is low.');
  }

  const summary =
    provisionalGrade == null
      ? 'Insufficient photographic evidence to produce a reliable grade estimate. Please provide clearer, higher-resolution images of both sides with the full card visible.'
      : `Unofficial prototype grade estimate: ${provisionalGrade}/10 (${conditionLabel(provisionalGrade, confidence)}). Confidence ${(confidence * 100).toFixed(0)}%. Review category breakdowns and defect list before any collecting or trading decision.`;

  return {
    provisionalGrade,
    conditionLabel: conditionLabel(provisionalGrade, confidence),
    confidence: Math.round(confidence * 100) / 100,
    summary,
    categoryScores: categories,
    warnings,
    limitations,
  };
}

export function createEmptyResult(processingTimeMs = 0): AnalysisResult {
  return {
    version: ANALYSIS_RESULT_VERSION,
    timestamp: new Date().toISOString(),
    frontQuality: null,
    backQuality: null,
    frontDetection: null,
    backDetection: null,
    centering: null,
    corners: [],
    edges: [],
    surface: [],
    overall: {
      provisionalGrade: null,
      conditionLabel: 'Inconclusive',
      confidence: 0,
      summary: 'No images analysed.',
      categoryScores: [],
      warnings: ['No input provided'],
      limitations: [],
    },
    annotations: [],
    processingTimeMs,
    warnings: [],
  };
}
