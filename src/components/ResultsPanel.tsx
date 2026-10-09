import { useAppStore } from '../store/useAppStore';
import type { CategoryScore, DefectSeverity } from '../types';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, HelpCircle, Info } from 'lucide-react';

function ScoreBar({ score, confidence }: { score: number | null; confidence: number }) {
  if (score == null) {
    return (
      <div className="score-bar inconclusive">
        <span>Inconclusive</span>
      </div>
    );
  }
  const pct = (score / 10) * 100;
  return (
    <div className="score-bar">
      <div className="score-fill" style={{ width: `${pct}%` }} />
      <span className="score-text">
        {score.toFixed(1)} / 10 · conf {(confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function CategoryCard({ cat }: { cat: CategoryScore }) {
  return (
    <div className="category-card">
      <div className="cat-header">
        <h4>{cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}</h4>
        {cat.score == null ? (
          <HelpCircle size={16} className="icon-muted" />
        ) : cat.score >= 8 ? (
          <CheckCircle2 size={16} className="icon-good" />
        ) : (
          <AlertTriangle size={16} className="icon-warn" />
        )}
      </div>
      <ScoreBar score={cat.score} confidence={cat.confidence} />
      <p className="cat-explanation">{cat.explanation}</p>
      {cat.defects.length > 0 && (
        <ul className="defect-list">
          {cat.defects.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QualityCard({
  label,
  q,
}: {
  label: string;
  q: NonNullable<ReturnType<typeof useAppStore.getState>['analysis']>['frontQuality'];
}) {
  if (!q) return null;
  return (
    <div className="quality-card">
      <h4>{label} image quality</h4>
      <div className="quality-grid">
        <div>
          <span className="q-label">Resolution</span>
          <span>
            {q.width}×{q.height}
            {!q.resolutionAdequate && ' ⚠️'}
          </span>
        </div>
        <div>
          <span className="q-label">Sharpness</span>
          <span>{q.blurScore.toFixed(0)} {q.blurScore < 40 && '⚠️'}</span>
        </div>
        <div>
          <span className="q-label">Brightness</span>
          <span>{q.brightness.toFixed(0)}</span>
        </div>
        <div>
          <span className="q-label">Lighting</span>
          <span className={clsx(q.lightingQuality === 'poor' && 'bad')}>{q.lightingQuality}</span>
        </div>
        <div>
          <span className="q-label">Reflection</span>
          <span className={clsx(q.reflectionRisk === 'high' && 'bad')}>{q.reflectionRisk}</span>
        </div>
        <div>
          <span className="q-label">Confidence</span>
          <span>{(q.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      {q.warnings.length > 0 && (
        <ul className="warn-list">
          {q.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ResultsPanel() {
  const analysis = useAppStore((s) => s.analysis);
  if (!analysis) return null;

  const { overall, centering, frontDetection, backDetection, frontQuality, backQuality } =
    analysis;

  return (
    <div className="results-panel">
      {/* Hero grade */}
      <div className="grade-hero">
        <div className="grade-number">
          {overall.provisionalGrade != null ? (
            <>
              <span className="grade-value">{overall.provisionalGrade.toFixed(1)}</span>
              <span className="grade-max">/10</span>
            </>
          ) : (
            <span className="grade-inconclusive">INCONCLUSIVE</span>
          )}
        </div>
        <div className="grade-meta">
          <div className="condition-label">{overall.conditionLabel}</div>
          <div className="confidence">
            Overall confidence: {(overall.confidence * 100).toFixed(0)}%
          </div>
          <p className="disclaimer">
            Unofficial prototype estimate — not a PSA, BGS or CGC certification.
          </p>
        </div>
      </div>

      <p className="summary-text">{overall.summary}</p>

      {overall.warnings.length > 0 && (
        <div className="alert-block warn">
          <AlertTriangle size={16} />
          <ul>
            {overall.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Category scores */}
      <section>
        <h3>Category scores</h3>
        <div className="category-grid">
          {overall.categoryScores.map((c) => (
            <CategoryCard key={c.category} cat={c} />
          ))}
        </div>
      </section>

      {/* Centering detail */}
      {centering && (
        <section>
          <h3>Centering measurements</h3>
          {centering.measurable ? (
            <div className="centering-visual">
              <div className="centering-ratios">
                <div>
                  <span className="q-label">Left / Right</span>
                  <strong>{centering.leftRightRatio}</strong>
                </div>
                <div>
                  <span className="q-label">Top / Bottom</span>
                  <strong>{centering.topBottomRatio}</strong>
                </div>
                <div>
                  <span className="q-label">Score</span>
                  <strong>{centering.centeringScore?.toFixed(1)} / 10</strong>
                </div>
                <div>
                  <span className="q-label">Confidence</span>
                  <strong>{(centering.confidence * 100).toFixed(0)}%</strong>
                </div>
              </div>
              {centering.notes.length > 0 && (
                <ul className="muted small">
                  {centering.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="muted">{centering.notes[0]}</p>
          )}
        </section>
      )}

      {/* Detection */}
      <section>
        <h3>Card detection</h3>
        <div className="detection-row">
          <div>
            <strong>Front:</strong>{' '}
            {frontDetection?.detected
              ? `${(frontDetection.confidence * 100).toFixed(0)}% — ${frontDetection.message}`
              : frontDetection?.message ?? '—'}
          </div>
          <div>
            <strong>Back:</strong>{' '}
            {backDetection
              ? backDetection.detected
                ? `${(backDetection.confidence * 100).toFixed(0)}% — ${backDetection.message}`
                : backDetection.message
              : 'No back image'}
          </div>
        </div>
      </section>

      {/* Quality */}
      <section className="quality-section">
        <QualityCard label="Front" q={frontQuality} />
        <QualityCard label="Back" q={backQuality} />
      </section>

      {/* Limitations */}
      <section className="limitations">
        <h3>
          <Info size={16} /> Known limitations
        </h3>
        <ul>
          {overall.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>

      <div className="meta-footer">
        <span>Processed in {analysis.processingTimeMs} ms</span>
        <span>Schema v{analysis.version}</span>
        <span>{new Date(analysis.timestamp).toLocaleString()}</span>
      </div>
    </div>
  );
}
