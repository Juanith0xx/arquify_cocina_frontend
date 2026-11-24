import React, { createContext, useContext } from 'react';
import { isAssemblyPartMatch } from '../../utils/assemblyPartMapper';

export interface AssemblyHighlightState {
  active: boolean;
  targetCabinetId: string | null;
  targetPartKey: string | null;
  xrayMode: boolean;
}

const DEFAULT_ASSEMBLY_HIGHLIGHT: AssemblyHighlightState = {
  active: false,
  targetCabinetId: null,
  targetPartKey: null,
  xrayMode: false,
};

const AssemblyHighlightContext = createContext<AssemblyHighlightState>(DEFAULT_ASSEMBLY_HIGHLIGHT);
const AssemblyCabinetIdContext = createContext<string | null>(null);

export function AssemblyHighlightProvider({
  value,
  children,
}: {
  value: AssemblyHighlightState;
  children: React.ReactNode;
}) {
  return (
    <AssemblyHighlightContext.Provider value={value}>
      {children}
    </AssemblyHighlightContext.Provider>
  );
}

export function AssemblyCabinetIdProvider({
  cabinetId,
  children,
}: {
  cabinetId: string;
  children: React.ReactNode;
}) {
  return (
    <AssemblyCabinetIdContext.Provider value={cabinetId}>
      {children}
    </AssemblyCabinetIdContext.Provider>
  );
}

export function useAssemblyHighlight(): AssemblyHighlightState {
  return useContext(AssemblyHighlightContext);
}

export interface AssemblyBoardStyle {
  isHighlighted: boolean;
  forceTransparent: boolean;
  xrayOpacity: number;
  edgeColor: string;
  isSameCabinet: boolean;
}

/**
 * Devuelve `null` cuando la aplicación está en el configurador normal (cero impacto).
 * En el visor QR de armado, determina si este tablero es la pieza escaneada (sólida y destacada)
 * o si debe mostrarse en modo Rayos X.
 */
export function useAssemblyBoardStyle(assemblyPartKey?: string): AssemblyBoardStyle | null {
  const ctx = useContext(AssemblyHighlightContext);
  const cabinetId = useContext(AssemblyCabinetIdContext);

  if (!ctx.active) return null;

  const isSameCabinet = Boolean(cabinetId && ctx.targetCabinetId && cabinetId === ctx.targetCabinetId);
  const isHighlighted = isSameCabinet && isAssemblyPartMatch(assemblyPartKey, ctx.targetPartKey);

  if (isHighlighted) {
    return {
      isHighlighted: true,
      forceTransparent: false,
      xrayOpacity: 1,
      edgeColor: '#f97316',
      isSameCabinet: true,
    };
  }

  return {
    isHighlighted: false,
    forceTransparent: ctx.xrayMode,
    xrayOpacity: isSameCabinet ? 0.24 : 0.11,
    edgeColor: isSameCabinet ? '#38bdf8' : '#64748b',
    isSameCabinet,
  };
}
