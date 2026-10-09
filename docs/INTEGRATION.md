# Integration Contract – `analyzeCard`

## Purpose

Provide a stable, typed entry point that Pokémon Card Hunter (HoloScan) can call after independent technical verification. The prototype remains a separate package; no PCH source files are modified.

## API

```ts
import {
  analyzeCard,
  analyzeCardFiles,
  loadImageFromFile,
  validateImageFile,
} from 'pch-card-grading-ai/lib/analyzeCard';

// Option A – File objects (typical for upload UI)
const res = await analyzeCardFiles(frontFile, backFile?, options?);

// Option B – already-decoded images
const res = await analyzeCard(frontImage, backImage?, options?);
```

### `AnalyzeOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `skipBack` | `boolean` | `false` | Ignore back image even if supplied |
| `maxDimension` | `number` | `1400` | Down-scale longest side for analysis speed |
| `enablePerspectiveCorrection` | `boolean` | `true` | Reserved; currently only 2-D rotation |
| `debug` | `boolean` | `false` | Reserved for future debug overlays |

### Return type – `AnalyzeCardResult`

```ts
{
  success: boolean;
  result: AnalysisResult | null;
  error?: string;
}
```

On failure `success === false` and `error` contains a human-readable message.  
`result` may still contain a partial empty structure for logging.

---

## `AnalysisResult` schema (v1.0.0-prototype)

```json
{
  "version": "1.0.0-prototype",
  "timestamp": "ISO-8601",
  "frontQuality": { /* ImageQuality | null */ },
  "backQuality": { /* ImageQuality | null */ },
  "frontDetection": { /* CardDetection | null */ },
  "backDetection": { /* CardDetection | null */ },
  "centering": { /* CenteringAnalysis | null */ },
  "corners": [ /* CornerFinding */ ],
  "edges": [ /* EdgeFinding */ ],
  "surface": [ /* SurfaceFinding */ ],
  "overall": {
    "provisionalGrade": "number 1-10 | null",
    "conditionLabel": "string",
    "confidence": "0-1",
    "summary": "string",
    "categoryScores": [ /* CategoryScore */ ],
    "warnings": ["string"],
    "limitations": ["string"]
  },
  "annotations": [ /* Annotation */ ],
  "processingTimeMs": "number",
  "warnings": ["string"]
}
```

Full TypeScript definitions live in `src/types/index.ts`.

### Confidence fields

Three distinct confidence numbers are exposed:

1. **Image quality confidence** (`frontQuality.confidence` / `backQuality.confidence`) – suitability of the photograph itself.
2. **Detection confidence** (`frontDetection.confidence`) – reliability of the card boundary.
3. **Grading confidence** (`overall.confidence`) – combined trust in the numerical estimate.

Never treat a high provisional grade with low grading confidence as actionable.

---

## Embedding recommendations

1. Ship the analysis modules as an ES module or copy `src/lib/*` + `src/types/*`.
2. Keep UI optional – HoloScan can call `analyzeCard` and render its own results view.
3. Persist the full `AnalysisResult` JSON alongside any user-submitted photos for auditability.
4. Surface `overall.limitations` and `overall.warnings` to the end user unchanged.

---

## Versioning

`ANALYSIS_RESULT_VERSION` is incremented when the shape of `AnalysisResult` changes incompatibly. Consumers should gate on the version string.
