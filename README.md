# PCH Card Grading AI

**Independent experimental prototype** for Pokémon trading-card condition analysis.

Designed for future evaluation and possible integration into *Pokémon Card Hunter* (PCH) HoloScan.  
This repository is **self-contained** — it does not modify or depend on any existing PCH application code.

---

## Quick start

```bash
cd pch-card-grading-ai
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

```bash
npm run build      # production build
npm test           # unit tests
npm run lint       # TypeScript check
```

**Requirements:** Node 18+, modern browser with Canvas support.

---

## What genuinely works

| Capability | Status | Notes |
|---|---|---|
| Front / back image upload (drag-drop, replace, preview) | **Working** | JPG, PNG, WebP; size & MIME validation |
| Extra close-up photo collection | **Working** | Stored in session; not yet scored automatically |
| Image quality metrics (blur, brightness, contrast, glare risk) | **Working** | Laplacian-variance approximation + luminance stats |
| Card region detection | **Heuristic** | Edge-energy integral projections; fails gracefully with explanation |
| Simple rotation correction | **Partial** | 2-D rotation only when angle is significant |
| Centering border ratios | **Heuristic** | Only when borders produce consistent luminance transitions |
| Corner / edge whitening signals | **Heuristic** | High-luminance pixel ratios in corner/edge strips |
| Surface anomaly hypotheses | **Experimental** | Local variance blocks; always labelled as hypotheses |
| Transparent 4-category scoring + overall 1–10 estimate | **Working** | Returns **INCONCLUSIVE** when evidence is insufficient |
| Interactive defect map (zoom, pan, overlays, annotation list) | **Working** | Overlays linked to real analysis output only |
| Dark / light themes, responsive layout | **Working** | |
| `analyzeCard()` integration API + typed result schema | **Working** | See `docs/INTEGRATION.md` |
| Browser-local processing (no paid API, no mandatory cloud) | **Working** | |

---

## What is experimental / incomplete

- **Perspective / homography correction** – only coarse rotation is applied.
- **True 4-corner detection** – current detector returns an axis-aligned box.
- **Fraying, bending, corner rounding, micro-chipping** – explicitly marked `unknown`; require macro / angled photography.
- **Holographic surface damage** – cannot be reliably inferred from a single ambient-light photo.
- **Print defect classification** – variance heuristics only; no learned model.
- **Extra close-up photos** – collected but not yet fused into the scoring engine.
- **OpenCV.js / ML models** – deliberately omitted to keep the prototype dependency-free and honest about capability. A future revision may optionally load a licensed open model for improved contour detection.

---

## Critical rules observed

- No fabricated detections or grades.
- No silent failures — every low-confidence path surfaces a clear message.
- Numerical grades are labelled **unofficial prototype estimates**, never PSA/BGS/CGC.
- Image-quality confidence, detection confidence and grading confidence are kept separate.
- When borders cannot be identified, centering is reported as unmeasurable (not invented).

---

## Project layout

```
src/
  components/     UI – uploader, inspector, results
  lib/            Pure analysis modules (quality, detection, centering, defects, grading)
  store/          Zustand app state
  types/          Shared TypeScript interfaces + schema version
  tests/          Vitest unit tests
docs/
  INTEGRATION.md  analyzeCard() contract & JSON schema
  LIMITATIONS.md  Detailed technical limitations
```

---

## Integration

```ts
import { analyzeCard, analyzeCardFiles } from './lib/analyzeCard';

const { success, result, error } = await analyzeCardFiles(frontFile, backFile);
// result conforms to AnalysisResult (see src/types/index.ts)
```

Full contract: [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

---

## Licence & disclaimer

Prototype code is provided for evaluation by the Pokémon Card Hunter team.  
**This software does not certify cards.** Any grade it produces is an unofficial, non-binding estimate intended solely for research and product development.
