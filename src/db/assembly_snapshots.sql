-- ==============================================================================
-- TABLA DE SNAPSHOTS DE SOLO LECTURA PARA VISOR 3D DE ARMADO (POSTGRESQL RAILWAY)
-- ==============================================================================
-- Nota: el API Gateway (arquify_cocina_backend/gateway) crea esta tabla
-- automáticamente en el primer uso si aún no existe. Este script queda como
-- referencia / migración explícita para PostgreSQL en Railway.

CREATE TABLE IF NOT EXISTS assembly_snapshots (
  id TEXT PRIMARY KEY,
  project_name TEXT,
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assembly_snapshots_created_at
  ON assembly_snapshots (created_at DESC);
