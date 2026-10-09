import { useCallback, useEffect } from 'react';
import { Moon, Sun, Scan, RotateCcw, Loader2 } from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { ImageUploader, ExtraPhotosUploader } from './components/ImageUploader';
import { DefectInspector } from './components/DefectInspector';
import { ResultsPanel } from './components/ResultsPanel';
import { analyzeCardFiles } from './lib/analyzeCard';
import clsx from 'clsx';

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const step = useAppStore((s) => s.step);
  const setStep = useAppStore((s) => s.setStep);
  const frontFile = useAppStore((s) => s.frontFile);
  const backFile = useAppStore((s) => s.backFile);
  const setAnalysis = useAppStore((s) => s.setAnalysis);
  const setError = useAppStore((s) => s.setError);
  const error = useAppStore((s) => s.error);
  const reset = useAppStore((s) => s.reset);
  const analysis = useAppStore((s) => s.analysis);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const runAnalysis = useCallback(async () => {
    if (!frontFile) {
      setError('Please upload at least a front image.');
      return;
    }
    setError(null);
    setStep('analyzing');
    setAnalysis(null);

    const result = await analyzeCardFiles(frontFile, backFile);
    if (!result.success || !result.result) {
      setError(result.error ?? 'Analysis failed');
      setStep('upload');
      return;
    }
    setAnalysis(result.result);
    setStep('results');
  }, [frontFile, backFile, setError, setStep, setAnalysis]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <Scan size={22} strokeWidth={1.75} />
          <div>
            <h1>PCH Card Grading AI</h1>
            <span className="tagline">Independent prototype · Unofficial estimates only</span>
          </div>
        </div>
        <div className="header-actions">
          {step !== 'upload' && (
            <button type="button" className="btn ghost" onClick={reset}>
              <RotateCcw size={16} /> New scan
            </button>
          )}
          <button
            type="button"
            className="btn icon"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className={clsx('main', step)}>
        {step === 'upload' && (
          <section className="upload-stage">
            <div className="intro">
              <h2>Analyse card condition</h2>
              <p>
                Upload clear photographs of the front and back of a Pokémon trading card.
                Processing runs entirely in your browser — no images are uploaded to a server.
              </p>
            </div>

            <div className="upload-grid">
              <ImageUploader side="front" label="Front" />
              <ImageUploader side="back" label="Back (recommended)" />
            </div>

            <ExtraPhotosUploader />

            {error && <div className="alert-block error">{error}</div>}

            <div className="actions">
              <button
                type="button"
                className="btn primary"
                disabled={!frontFile}
                onClick={runAnalysis}
              >
                <Scan size={18} /> Analyse card
              </button>
            </div>

            <div className="prototype-notice">
              <h3>What this prototype actually does</h3>
              <ul>
                <li>Measures image sharpness, brightness, contrast and glare risk</li>
                <li>Attempts rectangular card region detection via edge energy projections</li>
                <li>Estimates border ratios for centering when borders are visible</li>
                <li>Flags possible corner/edge whitening via luminance heuristics</li>
                <li>Scans for high-variance surface patches (hypotheses only)</li>
                <li>Produces an unofficial 1–10 estimate only when evidence is sufficient; otherwise returns INCONCLUSIVE</li>
              </ul>
              <p className="muted">
                It does <strong>not</strong> claim professional grading accuracy. Fine scratches,
                holographic wear, micro-chipping and structural damage often require additional
                lighting angles and close-ups that a single photo cannot provide.
              </p>
            </div>
          </section>
        )}

        {step === 'analyzing' && (
          <section className="analyzing-stage">
            <Loader2 size={40} className="spin" />
            <h2>Analysing images…</h2>
            <p className="muted">Running local computer-vision heuristics. This usually takes a few seconds.</p>
          </section>
        )}

        {step === 'results' && analysis && (
          <section className="results-stage">
            <div className="results-layout">
              <div className="inspector-col">
                <DefectInspector />
              </div>
              <div className="panel-col">
                <ResultsPanel />
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>PCH Card Grading AI · Experimental module for Pokémon Card Hunter</span>
        <span>Browser-local · No cloud dependency · Not a certification service</span>
      </footer>
    </div>
  );
}
