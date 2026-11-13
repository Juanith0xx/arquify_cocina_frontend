import type { CabinetType } from '../store/kitchenStore';

export type CncPreviewEligibility =
  | {
      eligible: true;
      cabinetId: string;
      hingeSide: 'left' | 'right';
    }
  | {
      eligible: false;
      reason: string;
    };

/**
 * Primera etapa: únicamente muebles base de una puerta.
 * No asigna orientaciones por defecto.
 */
export function validateCncPreviewEligibility(
  cabinet: CabinetType
): CncPreviewEligibility {
  if (cabinet.type !== 'base' || cabinet.variant !== '1_door') {
    return {
      eligible: false,
      reason: 'La previsualización CNC admite por ahora muebles base de una puerta.'
    };
  }

  if (cabinet.hasDoors === false) {
    return {
      eligible: false,
      reason: 'El gabinete no tiene puerta habilitada.'
    };
  }

  if (cabinet.hingeSide !== 'left' && cabinet.hingeSide !== 'right') {
    return {
      eligible: false,
      reason: 'Debes confirmar el lado de las bisagras.'
    };
  }

  if (!cabinet.id.trim()) {
    return {
      eligible: false,
      reason: 'El gabinete no tiene una identificación válida.'
    };
  }

  if (
    ![cabinet.width, cabinet.height, cabinet.depth].every(
      value => Number.isFinite(value) && value > 0
    )
  ) {
    return {
      eligible: false,
      reason: 'Las dimensiones del gabinete no son válidas.'
    };
  }

  return {
    eligible: true,
    cabinetId: cabinet.id,
    hingeSide: cabinet.hingeSide
  };
}

/**
 * Contrato de transporte.
 * El contenido debe construirse con las referencias
 * reales de BOM y orientaciones físicas verificadas.
 */
export interface GatewayCncPreviewRequest {
  cabinets: unknown[];
  config: unknown;
  includeHardware?: boolean;
  settings: unknown;
  orientations: unknown[];
}

export interface GatewayCncPreviewResult {
  readiness: 'NOT_MACHINE_READY';
  physicalPieceCount: number;
  pieces: unknown[];
  raw: Record<string, unknown>;
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Consulta exclusiva de previsualización.
 * No exporta DXF ni modifica archivos existentes.
 */
export async function requestGatewayCncPreview(
  gatewayBaseUrl: string,
  request: GatewayCncPreviewRequest,
  signal?: AbortSignal
): Promise<GatewayCncPreviewResult> {
  if (
    request.cabinets.length !== 1 ||
    request.orientations.length !== 1
  ) {
    throw new Error(
      'Se requiere exactamente un gabinete y una orientación.'
    );
  }

  if (
    !isRecord(request.config) ||
    !isRecord(request.settings)
  ) {
    throw new Error(
      'Faltan la configuración o los ajustes de fabricación.'
    );
  }

  const url = new URL(
    '/api/v1/manufacturing/cnc-preview',
    gatewayBaseUrl
  );

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request),
    signal
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isRecord(data)
      ? typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : `HTTP ${response.status}`
      : `HTTP ${response.status}`;

    throw new Error(`Gateway CNC: ${message}`);
  }

  if (!isRecord(data) || data.success !== true) {
    throw new Error('Respuesta CNC inválida.');
  }

  if (data.readiness !== 'NOT_MACHINE_READY') {
    throw new Error(
      'Estado CNC inesperado. Se requiere una nueva validación.'
    );
  }

  const summary = data.summary;
  const preview = data.preview;

  if (!isRecord(summary) || !isRecord(preview)) {
    throw new Error('Resumen CNC incompleto.');
  }

  const count = summary.physicalPieceCount;
  const pieces = preview.pieces;

  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    !Array.isArray(pieces) ||
    pieces.length !== count
  ) {
    throw new Error(
      'La cantidad de piezas físicas no coincide.'
    );
  }

  return {
    readiness: 'NOT_MACHINE_READY',
    physicalPieceCount: count,
    pieces,
    raw: data
  };
}
