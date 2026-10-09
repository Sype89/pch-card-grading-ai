import { create } from 'zustand';
import type { AnalysisResult, ImageSide } from '../types';

export type Theme = 'dark' | 'light';
export type WorkflowStep = 'upload' | 'analyzing' | 'results';

interface AppState {
  theme: Theme;
  step: WorkflowStep;
  frontFile: File | null;
  backFile: File | null;
  frontPreviewUrl: string | null;
  backPreviewUrl: string | null;
  extraPhotos: File[];
  analysis: AnalysisResult | null;
  error: string | null;
  selectedSide: ImageSide;
  selectedAnnotationId: string | null;
  overlayVisible: boolean;
  zoom: number;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setFront: (file: File | null, url: string | null) => void;
  setBack: (file: File | null, url: string | null) => void;
  addExtraPhoto: (file: File) => void;
  removeExtraPhoto: (index: number) => void;
  setStep: (s: WorkflowStep) => void;
  setAnalysis: (r: AnalysisResult | null) => void;
  setError: (e: string | null) => void;
  setSelectedSide: (s: ImageSide) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  setOverlayVisible: (v: boolean) => void;
  setZoom: (z: number) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches)
    ? 'light'
    : 'dark',
  step: 'upload',
  frontFile: null,
  backFile: null,
  frontPreviewUrl: null,
  backPreviewUrl: null,
  extraPhotos: [],
  analysis: null,
  error: null,
  selectedSide: 'front',
  selectedAnnotationId: null,
  overlayVisible: true,
  zoom: 1,

  setTheme: (theme) => set({ theme }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setFront: (frontFile, frontPreviewUrl) => set({ frontFile, frontPreviewUrl }),
  setBack: (backFile, backPreviewUrl) => set({ backFile, backPreviewUrl }),
  addExtraPhoto: (file) =>
    set((s) => ({ extraPhotos: [...s.extraPhotos, file] })),
  removeExtraPhoto: (index) =>
    set((s) => ({
      extraPhotos: s.extraPhotos.filter((_, i) => i !== index),
    })),
  setStep: (step) => set({ step }),
  setAnalysis: (analysis) => set({ analysis }),
  setError: (error) => set({ error }),
  setSelectedSide: (selectedSide) => set({ selectedSide }),
  setSelectedAnnotationId: (selectedAnnotationId) => set({ selectedAnnotationId }),
  setOverlayVisible: (overlayVisible) => set({ overlayVisible }),
  setZoom: (zoom) => set({ zoom }),
  reset: () =>
    set({
      step: 'upload',
      frontFile: null,
      backFile: null,
      frontPreviewUrl: null,
      backPreviewUrl: null,
      extraPhotos: [],
      analysis: null,
      error: null,
      selectedAnnotationId: null,
      zoom: 1,
    }),
}));
