import { useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Eye, EyeOff, Maximize2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { Annotation, BoundingBox } from '../types';
import clsx from 'clsx';

function isBox(g: Annotation['geometry']): g is BoundingBox {
  return 'width' in g && 'height' in g;
}

export function DefectInspector() {
  const analysis = useAppStore((s) => s.analysis);
  const selectedSide = useAppStore((s) => s.selectedSide);
  const setSelectedSide = useAppStore((s) => s.setSelectedSide);
  const frontUrl = useAppStore((s) => s.frontPreviewUrl);
  const backUrl = useAppStore((s) => s.backPreviewUrl);
  const overlayVisible = useAppStore((s) => s.overlayVisible);
  const setOverlayVisible = useAppStore((s) => s.setOverlayVisible);
  const selectedAnnotationId = useAppStore((s) => s.selectedAnnotationId);
  const setSelectedAnnotationId = useAppStore((s) => s.setSelectedAnnotationId);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const url = selectedSide === 'front' ? frontUrl : backUrl;
  const anns =
    analysis?.annotations.filter((a) => a.side === selectedSide) ?? [];

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(Math.min(4, Math.max(0.4, zoom + delta)));
    },
    [zoom, setZoom]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  };

  const onPointerUp = () => setDragging(false);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [selectedSide, setZoom]);

  if (!url) {
    return (
      <div className="inspector empty">
        <p>No image for this side.</p>
      </div>
    );
  }

  return (
    <div className="inspector">
      <div className="inspector-toolbar">
        <div className="side-toggle">
          <button
            type="button"
            className={clsx(selectedSide === 'front' && 'active')}
            onClick={() => setSelectedSide('front')}
          >
            Front
          </button>
          <button
            type="button"
            className={clsx(selectedSide === 'back' && 'active')}
            onClick={() => setSelectedSide('back')}
            disabled={!backUrl}
          >
            Back
          </button>
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={() => setZoom(Math.min(4, zoom + 0.25))} title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button type="button" onClick={() => setZoom(Math.max(0.4, zoom - 0.25))} title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Reset view"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setOverlayVisible(!overlayVisible)}
            title="Toggle overlays"
          >
            {overlayVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>
      </div>

      <div
        className="inspector-viewport"
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="inspector-canvas"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img src={url} alt={`${selectedSide} card`} draggable={false} />
          {overlayVisible &&
            anns.map((a) => {
              if (!isBox(a.geometry)) return null;
              const g = a.geometry;
              // Geometry is in original image pixels; we need % relative to displayed img
              // We use the natural size via a data approach – for prototype we assume
              // the img displays at natural size inside the transform.
              return (
                <div
                  key={a.id}
                  className={clsx(
                    'annotation-box',
                    a.severity,
                    selectedAnnotationId === a.id && 'selected'
                  )}
                  style={{
                    left: g.x,
                    top: g.y,
                    width: g.width,
                    height: g.height,
                  }}
                  title={`${a.label}\n${a.reason}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAnnotationId(a.id === selectedAnnotationId ? null : a.id);
                  }}
                />
              );
            })}
        </div>
      </div>

      {selectedAnnotationId && (
        <AnnotationDetail
          ann={anns.find((a) => a.id === selectedAnnotationId) ?? null}
          onClose={() => setSelectedAnnotationId(null)}
        />
      )}

      <div className="annotation-list">
        <h4>Detected annotations ({anns.length})</h4>
        {anns.length === 0 && (
          <p className="muted small">No annotations for this side (or detection confidence too low).</p>
        )}
        {anns.map((a) => (
          <button
            key={a.id}
            type="button"
            className={clsx('ann-item', selectedAnnotationId === a.id && 'active')}
            onClick={() => setSelectedAnnotationId(a.id)}
          >
            <span className={clsx('sev-dot', a.severity)} />
            <span className="ann-label">{a.label}</span>
            <span className="ann-conf">{(a.confidence * 100).toFixed(0)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnnotationDetail({
  ann,
  onClose,
}: {
  ann: Annotation | null;
  onClose: () => void;
}) {
  if (!ann) return null;
  return (
    <div className="ann-detail">
      <div className="ann-detail-header">
        <strong>{ann.label}</strong>
        <button type="button" onClick={onClose}>
          ×
        </button>
      </div>
      <p>{ann.reason}</p>
      <div className="ann-meta">
        <span>Severity: {ann.severity}</span>
        <span>Confidence: {(ann.confidence * 100).toFixed(0)}%</span>
        <span>Type: {ann.type}</span>
      </div>
    </div>
  );
}
