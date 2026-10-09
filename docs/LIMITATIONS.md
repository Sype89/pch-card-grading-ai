# Limitations & Unresolved Challenges

This document is part of the deliverable. It deliberately lists what the prototype **cannot** do reliably so that future adopters can plan verification work.

## 1. Detection

- The current algorithm uses horizontal/vertical edge-energy projections. It returns an **axis-aligned bounding box**, not four precise corners.
- Highly skewed cards, busy backgrounds, or cards already cropped to the border will lower confidence or cause detection failure.
- Full perspective (homography) correction is **not implemented**. Only a 2-D rotation is applied when the estimated angle exceeds ~2°.

## 2. Centering

- Border measurement depends on a sustained luminance transition from the outer edge inward. Cards with:
  - very thin or coloured borders,
  - heavy glare on the border,
  - already-cropped images,
  produce `measurable: false`.
- Ratios are approximate; they are **not** a substitute for a mechanical centering gauge.

## 3. Corners & Edges

- Only **whitening** (bright-pixel clusters) is estimated.
- Fraying, fibre lift, bending, soft corners and micro-chipping are returned as `unknown` because a single flat photograph lacks the necessary side-lighting and magnification.
- Glare can produce false-positive whitening signals; the UI always shows confidence.

## 4. Surface

- Local variance patches are reported as **hypotheses** (`isHypothesis: true`).
- Fine scratches, print lines, holo-rainbow disruption and pressure dents are frequently invisible under ordinary room lighting.
- A professional surface grade requires multiple controlled light angles and, often, a loupe — outside the scope of a browser prototype.

## 5. Grading engine

- The 1–10 scale is a **prototype mapping**, not calibrated against PSA/BGS/CGC populations.
- When fewer than two categories can be scored, the engine returns **INCONCLUSIVE** rather than inventing a number.
- High provisional grades are capped when overall confidence is low.

## 6. Hardware & performance

- All work runs on the client main thread (or a future worker). Very large images are down-scaled for analysis.
- No WebGL / WASM computer-vision library is bundled; adding OpenCV.js would increase download size by several MB and is left as a future optional path.

## 7. Unresolved challenges for a production HoloScan module

1. Robust 4-corner + contour detection under consumer smartphone conditions.
2. Multi-image fusion (front, back, corner macros, edge macros).
3. Calibrated scoring against a labelled dataset of professionally graded cards.
4. Holographic pattern integrity measurement.
5. Consistent behaviour across device colour profiles and camera processing pipelines.
6. Privacy-preserving optional cloud offload for heavy models (not required for the current prototype).

Until these challenges are addressed under controlled evaluation, the prototype must remain labelled experimental and must never present its output as a certification.
