import React from 'react';
import { createPortal } from 'react-dom';

export interface HoveredModulePreview {
  toolId: string;
  anchorRight: number;
  anchorCenterY: number;
}

interface ModuleHoverPreviewPopupProps {
  preview: HoveredModulePreview | null;
  isLight: boolean;
}

const POPUP_SIZE = 204;
const VIEWPORT_MARGIN = 12;
const ARROW_HALF = 8;
const ARROW_MIN_OFFSET = 22;

export function ModuleHoverPreviewPopup({ preview, isLight }: ModuleHoverPreviewPopupProps) {
  if (!preview || typeof document === 'undefined') return null;

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
  const rawTop = preview.anchorCenterY - POPUP_SIZE / 2;
  const clampedTop = Math.max(
    VIEWPORT_MARGIN,
    Math.min(viewportH - POPUP_SIZE - VIEWPORT_MARGIN, rawTop)
  );

  // Mantener el puntero callout alineado al botón activo incluso si el popup se ajusta al borde
  const arrowTop = Math.max(
    ARROW_MIN_OFFSET,
    Math.min(POPUP_SIZE - ARROW_MIN_OFFSET, preview.anchorCenterY - clampedTop)
  );

  const left = preview.anchorRight + 24;

  return createPortal(
    <div
      aria-hidden="true"
      className="hidden lg:block fixed z-[80] pointer-events-none select-none"
      style={{
        left: `${left}px`,
        top: `${clampedTop}px`,
        width: `${POPUP_SIZE}px`,
        height: `${POPUP_SIZE}px`,
      }}
    >
      {/* Puntero triangular estilo callout apuntando al ítem del menú */}
      <div
        className={`absolute -left-[8px] w-4 h-4 rotate-45 border-l-2 border-b-2 transition-colors ${
          isLight
            ? 'bg-white border-slate-800/80'
            : 'bg-zinc-900 border-zinc-400/70'
        }`}
        style={{
          top: `${arrowTop - ARROW_HALF}px`,
        }}
      />

      {/* Marco limpio estilo captura (solo imagen, sin textos) */}
      <div
        className={`relative w-full h-full rounded-2xl border-2 p-1 overflow-hidden ${
          isLight
            ? 'bg-white border-slate-800/80 shadow-[0_14px_34px_rgba(15,23,42,0.22)]'
            : 'bg-zinc-900 border-zinc-400/70 shadow-[0_14px_34px_rgba(0,0,0,0.6)]'
        }`}
      >
        <img
          key={preview.toolId}
          src={`/module-previews/${preview.toolId}.webp`}
          alt=""
          draggable={false}
          decoding="async"
          className="w-full h-full object-cover rounded-[11px] block bg-slate-200"
        />
      </div>
    </div>,
    document.body
  );
}
