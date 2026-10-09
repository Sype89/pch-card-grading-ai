/**
 * Public integration entry point.
 *
 * analyzeCard(frontImage, backImage?, options?) → structured AnalysisResult
 *
 * Designed for future adoption by Pokémon Card Hunter HoloScan.
 * All processing is browser-local; no network calls.
 */

import type {
  AnalyzeOptions,
  AnalyzeCardResult,
  AnalysisResult,
  Annotation,
} from '../types';
import { ANALYSIS_RESULT_VERSION } from '../types';
import { analyzeImageQuality, loadImageFromFile, validateImageFile } from './imageQuality';
import { detectCard } from './cardDetection';
import { analyzeCentering } from './centering';
import {
  analyzeCorners,
  analyzeEdges,
  analyzeSurface,
  buildAnnotations,
} from './defects';
import { buildOverallAssessment, createEmptyResult } from './grading';

export { loadImageFromFile, validateImageFile };

export async function analyzeCard(
  frontImage: HTMLImageElement | ImageBitmap | File,
  backImage?: HTMLImageElement | ImageBitmap | File | null,
  options: AnalyzeOptions = {}
): Promise<AnalyzeCardResult> {
  const start = performance.now();
  const warnings: string[] = [];

  try {
    // Normalise inputs to HTMLImageElement
    let front: HTMLImageElement | ImageBitmap;
    if (frontImage instanceof File) {
      const v = validateImageFile(frontImage);
      if (!v.ok) return { success: false, result: null, error: v.error };
      front = await loadImageFromFile(frontImage);
    } else {
      front = frontImage;
    }

    let back: HTMLImageElement | ImageBitmap | null = null;
    if (backImage && !options.skipBack) {
      if (backImage instanceof File) {
        const v = validateImageFile(backImage);
        if (!v.ok) {
          warnings.push(`Back image rejected: ${v.error}`);
        } else {
          back = await loadImageFromFile(backImage);
        }
      } else {
        back = backImage;
      }
    }

    // 1. Quality
    const frontQuality = await analyzeImageQuality(front, options.maxDimension ?? 1400);
    warnings.push(...frontQuality.warnings.map((w) => `[Front] ${w}`));

    let backQuality = null;
    if (back) {
      backQuality = await analyzeImageQuality(back, options.maxDimension ?? 1400);
      warnings.push(...backQuality.warnings.map((w) => `[Back] ${w}`));
    }

    // 2. Detection
    const frontDetection = await detectCard(front);
    let backDetection = null;
    if (back) {
      backDetection = await detectCard(back);
    }

    // 3. Centering (prefer front)
    const centering = await analyzeCentering(front, frontDetection);

    // 4. Corners / Edges / Surface – both sides
    const frontCorners = await analyzeCorners(front, frontDetection, 'front');
    const frontEdges = await analyzeEdges(front, frontDetection, 'front');
    const frontSurface = await analyzeSurface(front, frontDetection, 'front');

    let backCorners = await analyzeCorners(
      back ?? front,
      backDetection ?? { detected: false, corners: null, boundingBox: null, alignmentAngle: 0, perspectiveSkew: 0, cropSuspicion: 'none', method: 'failed', confidence: 0, message: 'No back image' },
      'back'
    );
    let backEdges = await analyzeEdges(
      back ?? front,
      backDetection ?? { detected: false, corners: null, boundingBox: null, alignmentAngle: 0, perspectiveSkew: 0, cropSuspicion: 'none', method: 'failed', confidence: 0, message: 'No back image' },
      'back'
    );
    let backSurface = await analyzeSurface(
      back ?? front,
      backDetection ?? { detected: false, corners: null, boundingBox: null, alignmentAngle: 0, perspectiveSkew: 0, cropSuspicion: 'none', method: 'failed', confidence: 0, message: 'No back image' },
      'back'
    );

    if (!back) {
      // Mark back findings as unavailable rather than using front image
      backCorners = backCorners.map((c) => ({
        ...c,
        overall: 'unknown' as const,
        whitening: 'unknown' as const,
        confidence: 0,
        notes: 'No back image provided.',
      }));
      backEdges = backEdges.map((e) => ({
        ...e,
        overall: 'unknown' as const,
        whitening: 'unknown' as const,
        confidence: 0,
        notes: 'No back image provided.',
      }));
      backSurface = [
        {
          side: 'back',
          type: 'other',
          severity: 'unknown',
          confidence: 0,
          description: 'No back image provided.',
          isHypothesis: true,
        },
      ];
    }

    const corners = [...frontCorners, ...backCorners];
    const edges = [...frontEdges, ...backEdges];
    const surface = [...frontSurface, ...backSurface];

    // 5. Annotations
    const annotations: Annotation[] = [
      ...buildAnnotations(frontCorners, frontEdges, frontSurface, frontDetection, 'front'),
      ...(back
        ? buildAnnotations(backCorners, backEdges, backSurface, backDetection, 'back')
        : []),
    ];

    // 6. Overall
    const overall = buildOverallAssessment(
      centering,
      corners,
      edges,
      surface,
      frontQuality,
      backQuality,
      frontDetection,
      backDetection
    );

    const processingTimeMs = Math.round(performance.now() - start);

    const result: AnalysisResult = {
      version: ANALYSIS_RESULT_VERSION,
      timestamp: new Date().toISOString(),
      frontQuality,
      backQuality,
      frontDetection,
      backDetection,
      centering,
      corners,
      edges,
      surface,
      overall,
      annotations,
      processingTimeMs,
      warnings: [...warnings, ...overall.warnings],
    };

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      result: createEmptyResult(Math.round(performance.now() - start)),
      error: `Analysis failed: ${message}`,
    };
  }
}

/** Convenience for File-only callers */
export async function analyzeCardFiles(
  frontFile: File,
  backFile?: File | null,
  options?: AnalyzeOptions
): Promise<AnalyzeCardResult> {
  return analyzeCard(frontFile, backFile ?? null, options);
}
