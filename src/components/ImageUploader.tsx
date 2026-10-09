import { useCallback, useRef, useState } from 'react';
import { Upload, Image as ImageIcon, X, Replace } from 'lucide-react';
import { validateImageFile } from '../lib/analyzeCard';
import { useAppStore } from '../store/useAppStore';
import clsx from 'clsx';

interface Props {
  side: 'front' | 'back';
  label: string;
}

export function ImageUploader({ side, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const file = useAppStore((s) => (side === 'front' ? s.frontFile : s.backFile));
  const previewUrl = useAppStore((s) =>
    side === 'front' ? s.frontPreviewUrl : s.backPreviewUrl
  );
  const setFront = useAppStore((s) => s.setFront);
  const setBack = useAppStore((s) => s.setBack);

  const assign = useCallback(
    (f: File | null, url: string | null) => {
      if (side === 'front') setFront(f, url);
      else setBack(f, url);
    },
    [side, setFront, setBack]
  );

  const handleFile = useCallback(
    (f: File) => {
      setLocalError(null);
      const v = validateImageFile(f);
      if (!v.ok) {
        setLocalError(v.error ?? 'Invalid file');
        return;
      }
      const url = URL.createObjectURL(f);
      // Revoke previous
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      assign(f, url);
    },
    [assign, previewUrl]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    assign(null, null);
    setLocalError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="uploader-card">
      <div className="uploader-header">
        <span className="uploader-label">{label}</span>
        {file && (
          <button type="button" className="icon-btn" onClick={clear} title="Remove">
            <X size={16} />
          </button>
        )}
      </div>

      {previewUrl ? (
        <div className="preview-wrap">
          <img src={previewUrl} alt={`${label} preview`} className="preview-img" />
          <button
            type="button"
            className="replace-btn"
            onClick={() => inputRef.current?.click()}
          >
            <Replace size={14} /> Replace
          </button>
        </div>
      ) : (
        <div
          className={clsx('drop-zone', dragOver && 'drag-over')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <Upload size={28} strokeWidth={1.5} />
          <p>Drop image or click to browse</p>
          <span className="hint">JPG · PNG · WebP · max 25 MB</span>
        </div>
      )}

      {localError && <p className="field-error">{localError}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

export function ExtraPhotosUploader() {
  const extra = useAppStore((s) => s.extraPhotos);
  const add = useAppStore((s) => s.addExtraPhoto);
  const remove = useAppStore((s) => s.removeExtraPhoto);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="extra-photos">
      <div className="section-title-row">
        <ImageIcon size={16} />
        <span>Close-up / damage detail photos (optional)</span>
      </div>
      <p className="muted small">
        Additional shots of corners, edges or surface issues improve human review.
        They are stored with the session but are not yet fed into automated scoring.
      </p>
      <div className="extra-list">
        {extra.map((f, i) => (
          <div key={i} className="extra-chip">
            <span>{f.name}</span>
            <button type="button" onClick={() => remove(i)}>
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-extra-btn"
          onClick={() => inputRef.current?.click()}
        >
          + Add photo
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden-input"
        multiple
        onChange={(e) => {
          Array.from(e.target.files || []).forEach((f) => {
            const v = validateImageFile(f);
            if (v.ok) add(f);
          });
          e.target.value = '';
        }}
      />
    </div>
  );
}
