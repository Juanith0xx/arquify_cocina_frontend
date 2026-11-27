import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  Cpu,
  Coins,
  Users,
  Activity,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Sliders,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Calendar,
  Search,
  Database,
  AlertTriangle,
  Image as ImageIcon,
  Mic,
  TrendingUp,
} from 'lucide-react';
import {
  EttoreUsageRange,
  EttoreUsageSummaryResponse,
  EttorePricingSettings,
  DEFAULT_ETTORE_PRICING_SETTINGS,
  loadEttorePricingSettings,
  saveEttorePricingSettings,
  fetchEttoreUsageSummary,
  calculateUserCostUsd,
  calculateTokensCostUsd,
  calculateSuggestedChargeClp,
  getRateForModel,
} from '../../utils/ettoreUsageApiService';

interface EttoreUsageSectionProps {
  isLight: boolean;
}

const ACTION_LABELS: Record<string, { label: string; colorClass: string }> = {
  apply_floor_plan: {
    label: 'Plano / Área',
    colorClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  },
  apply_full_design: {
    label: 'Diseño Completo',
    colorClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  patch_design: {
    label: 'Ajuste Diseño',
    colorClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  ui_action: {
    label: 'Acción Interfaz',
    colorClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  reply_only: {
    label: 'Consulta / Chat',
    colorClass: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  },
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  tenant_admin: 'Admin Empresa',
  designer: 'Diseñador / Pago',
  operator: 'Operador CNC',
  free_user: 'Gratis',
};

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('es-CL');
}

function formatUsd(usd: number): string {
  if (usd === 0) return '$0,00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatClp(clp: number): string {
  return `$${Math.round(clp).toLocaleString('es-CL')} CLP`;
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function EttoreUsageSection({ isLight }: EttoreUsageSectionProps) {
  const [range, setRange] = useState<EttoreUsageRange>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<EttoreUsageSummaryResponse | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricing, setPricing] = useState<EttorePricingSettings>(() => loadEttorePricingSettings());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchEttoreUsageSummary({
        range,
        startDate: range === 'custom' ? startDate : undefined,
        endDate: range === 'custom' ? endDate : undefined,
        limit: 250,
      });
      setSummary(data);
    } finally {
      setIsLoading(false);
    }
  }, [range, startDate, endDate]);

  useEffect(() => {
    if (range === 'custom' && !startDate && !endDate) return;
    void loadData();
  }, [loadData, range, startDate, endDate]);

  const updatePricing = (next: EttorePricingSettings) => {
    setPricing(next);
    saveEttorePricingSettings(next);
  };

  const handleModelRateChange = (
    modelName: string,
    field: 'inputUsdPerMillion' | 'outputUsdPerMillion',
    rawValue: string
  ) => {
    const val = Math.max(0, Number(rawValue) || 0);
    const currentRate = getRateForModel(modelName, pricing);
    updatePricing({
      ...pricing,
      modelRates: {
        ...pricing.modelRates,
        [modelName]: {
          ...currentRate,
          [field]: val,
        },
      },
    });
  };

  const handleResetPricing = () => {
    updatePricing(DEFAULT_ETTORE_PRICING_SETTINGS);
  };

  // Modelos conocidos + modelos observados en los datos
  const allKnownModels = useMemo(() => {
    const set = new Set<string>(Object.keys(DEFAULT_ETTORE_PRICING_SETTINGS.modelRates));
    Object.keys(pricing.modelRates).forEach((m) => set.add(m));
    summary?.byModel.forEach((m) => {
      if (m.modelUsed && m.modelUsed !== 'unknown') set.add(m.modelUsed);
    });
    return Array.from(set);
  }, [pricing.modelRates, summary?.byModel]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    const list = summary?.byUser || [];
    if (!normalizedSearch) return list;
    return list.filter(
      (u) =>
        (u.userName || '').toLowerCase().includes(normalizedSearch) ||
        (u.userEmail || '').toLowerCase().includes(normalizedSearch) ||
        (u.tenantName || '').toLowerCase().includes(normalizedSearch) ||
        (u.userRole || '').toLowerCase().includes(normalizedSearch)
    );
  }, [summary?.byUser, normalizedSearch]);

  const filteredLogs = useMemo(() => {
    const list = summary?.recentLogs || [];
    if (!normalizedSearch) return list;
    return list.filter(
      (l) =>
        (l.userName || '').toLowerCase().includes(normalizedSearch) ||
        (l.userEmail || '').toLowerCase().includes(normalizedSearch) ||
        (l.tenantName || '').toLowerCase().includes(normalizedSearch) ||
        (l.modelUsed || '').toLowerCase().includes(normalizedSearch) ||
        (l.actionType || '').toLowerCase().includes(normalizedSearch)
    );
  }, [summary?.recentLogs, normalizedSearch]);

  // Cálculos de totales y costos sobre el conjunto filtrado de usuarios
  const metrics = useMemo(() => {
    let totalRequests = 0;
    let promptTokens = 0;
    let outputTokens = 0;
    let thoughtsTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;

    for (const u of filteredUsers) {
      totalRequests += u.requestsCount;
      promptTokens += u.promptTokens;
      outputTokens += u.outputTokens;
      thoughtsTokens += u.thoughtsTokens;
      totalTokens += u.totalTokens;
      totalCostUsd += calculateUserCostUsd(u, pricing);
    }

    const totalCostClp = totalCostUsd * Math.max(1, pricing.usdToClp);
    const totalSuggestedClp = calculateSuggestedChargeClp(totalCostUsd, pricing);
    const totalSuggestedUsd = totalCostUsd * (1 + Math.max(0, pricing.markupPercent) / 100);
    const avgTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;
    const avgCostClpPerUser = filteredUsers.length > 0 ? totalCostClp / filteredUsers.length : 0;

    return {
      totalRequests,
      uniqueUsers: filteredUsers.length,
      promptTokens,
      outputTokens,
      thoughtsTokens,
      totalTokens,
      totalCostUsd,
      totalCostClp,
      totalSuggestedUsd,
      totalSuggestedClp,
      avgTokensPerRequest,
      avgCostClpPerUser,
    };
  }, [filteredUsers, pricing]);

  const exportFileBaseName = `consumo_ettore_tokens_${range}_${new Date().toISOString().slice(0, 10)}`;

  const handleExportCsv = () => {
    const headers = [
      'Usuario',
      'Correo',
      'Empresa / Proveedor',
      'Rol',
      'Consultas',
      'Con Imágenes',
      'Con Audio',
      'Tokens Entrada',
      'Tokens Salida',
      'Tokens Razonamiento',
      'Tokens Totales',
      'Modelos Usados',
      'Costo Estimado (USD)',
      'Costo Estimado (CLP)',
      `Cobro Sugerido (+${pricing.markupPercent}% CLP)`,
      'Última Actividad',
    ];

    const rows = filteredUsers.map((u) => {
      const costUsd = calculateUserCostUsd(u, pricing);
      const costClp = Math.round(costUsd * pricing.usdToClp);
      const suggestedClp = Math.round(calculateSuggestedChargeClp(costUsd, pricing));
      const modelsStr = u.modelsBreakdown
        .map((m) => `${m.modelUsed} (${m.requestsCount})`)
        .join(' | ');
      return [
        u.userName,
        u.userEmail,
        u.tenantName || 'Sin Empresa',
        ROLE_LABELS[u.userRole] || u.userRole,
        u.requestsCount,
        u.imagesRequests,
        u.audioRequests,
        u.promptTokens,
        u.outputTokens,
        u.thoughtsTokens,
        u.totalTokens,
        modelsStr,
        costUsd.toFixed(4),
        costClp,
        suggestedClp,
        u.lastUsedAt ? new Date(u.lastUsedAt).toLocaleString('es-CL') : '-',
      ];
    });

    const csvContent =
      '\uFEFF' +
      [headers, ...rows].map((row) => row.map(escapeCsvCell).join(';')).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportFileBaseName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen por Usuario
    const userSheetRows = filteredUsers.map((u) => {
      const costUsd = calculateUserCostUsd(u, pricing);
      const costClp = Math.round(costUsd * pricing.usdToClp);
      const suggestedClp = Math.round(calculateSuggestedChargeClp(costUsd, pricing));
      return {
        Usuario: u.userName,
        Correo: u.userEmail,
        'Empresa / Proveedor': u.tenantName || 'Sin Empresa',
        Rol: ROLE_LABELS[u.userRole] || u.userRole,
        Consultas: u.requestsCount,
        'Consultas c/ Imagen': u.imagesRequests,
        'Consultas c/ Audio': u.audioRequests,
        'Tokens Entrada': u.promptTokens,
        'Tokens Salida': u.outputTokens,
        'Tokens Razonamiento': u.thoughtsTokens,
        'Tokens Totales': u.totalTokens,
        'Modelos Usados': u.modelsBreakdown
          .map((m) => `${m.modelUsed} (${m.requestsCount})`)
          .join(', '),
        'Costo Estimado (USD)': Number(costUsd.toFixed(4)),
        'Costo Estimado (CLP)': costClp,
        [`Cobro Sugerido (+${pricing.markupPercent}% CLP)`]: suggestedClp,
        'Última Actividad': u.lastUsedAt ? new Date(u.lastUsedAt).toLocaleString('es-CL') : '-',
      };
    });

    const wsUsers = XLSX.utils.json_to_sheet(
      userSheetRows.length > 0
        ? userSheetRows
        : [{ Mensaje: 'Sin registros de consumo en el período seleccionado' }]
    );
    wsUsers['!cols'] = [
      { wch: 24 },
      { wch: 28 },
      { wch: 24 },
      { wch: 16 },
      { wch: 11 },
      { wch: 16 },
      { wch: 16 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
      { wch: 15 },
      { wch: 32 },
      { wch: 18 },
      { wch: 18 },
      { wch: 24 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsUsers, 'Resumen por Usuario');

    // Hoja 2: Resumen por Modelo
    const modelSheetRows = (summary?.byModel || []).map((m) => {
      const rate = getRateForModel(m.modelUsed, pricing);
      const costUsd = calculateTokensCostUsd(
        m.modelUsed,
        m.promptTokens,
        m.outputTokens,
        m.thoughtsTokens,
        pricing
      );
      return {
        Modelo: m.modelUsed,
        Consultas: m.requestsCount,
        'Tokens Entrada': m.promptTokens,
        'Tokens Salida': m.outputTokens,
        'Tokens Razonamiento': m.thoughtsTokens,
        'Tokens Totales': m.totalTokens,
        'Tarifa Entrada (USD/1M)': rate.inputUsdPerMillion,
        'Tarifa Salida (USD/1M)': rate.outputUsdPerMillion,
        'Costo Estimado (USD)': Number(costUsd.toFixed(4)),
        'Costo Estimado (CLP)': Math.round(costUsd * pricing.usdToClp),
      };
    });
    const wsModels = XLSX.utils.json_to_sheet(
      modelSheetRows.length > 0 ? modelSheetRows : [{ Mensaje: 'Sin datos de modelos' }]
    );
    wsModels['!cols'] = [
      { wch: 26 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsModels, 'Detalle por Modelo');

    // Hoja 3: Historial Detallado
    const logSheetRows = filteredLogs.map((l) => {
      const costUsd = calculateTokensCostUsd(
        l.modelUsed,
        l.promptTokens,
        l.outputTokens,
        l.thoughtsTokens,
        pricing
      );
      return {
        'Fecha y Hora': new Date(l.createdAt).toLocaleString('es-CL'),
        Usuario: l.userName,
        Correo: l.userEmail,
        Empresa: l.tenantName || 'Sin Empresa',
        Rol: ROLE_LABELS[l.userRole] || l.userRole,
        Modelo: l.modelUsed,
        Acción: ACTION_LABELS[l.actionType || '']?.label || l.actionType || '-',
        Imágenes: l.imagesCount,
        Audio: l.hasAudio ? 'Sí' : 'No',
        'Tokens Entrada': l.promptTokens,
        'Tokens Salida': l.outputTokens,
        'Tokens Razonamiento': l.thoughtsTokens,
        'Tokens Totales': l.totalTokens,
        'Costo (USD)': Number(costUsd.toFixed(5)),
        'Costo (CLP)': Math.round(costUsd * pricing.usdToClp),
      };
    });
    const wsLogs = XLSX.utils.json_to_sheet(
      logSheetRows.length > 0 ? logSheetRows : [{ Mensaje: 'Sin consultas registradas' }]
    );
    wsLogs['!cols'] = [
      { wch: 20 },
      { wch: 22 },
      { wch: 26 },
      { wch: 22 },
      { wch: 14 },
      { wch: 24 },
      { wch: 18 },
      { wch: 10 },
      { wch: 8 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 13 },
      { wch: 13 },
    ];
    XLSX.utils.book_append_sheet(wb, wsLogs, 'Historial Consultas');

    // Hoja 4: Parámetros de Tarifa usados en el cálculo
    const wsParams = XLSX.utils.json_to_sheet([
      { Parámetro: 'Período Consultado', Valor: range === 'custom' ? `${startDate || '...'} a ${endDate || '...'}` : range },
      { Parámetro: 'Tipo de Cambio (USD → CLP)', Valor: pricing.usdToClp },
      { Parámetro: 'Margen Sugerido sobre Costo (%)', Valor: `${pricing.markupPercent}%` },
      { Parámetro: 'Fecha de Exportación', Valor: new Date().toLocaleString('es-CL') },
    ]);
    wsParams['!cols'] = [{ wch: 32 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, wsParams, 'Parámetros Cobro');

    XLSX.writeFile(wb, `${exportFileBaseName}.xlsx`);
  };

  const cardClass = isLight
    ? 'bg-white border-zinc-200 shadow-sm'
    : 'bg-zinc-900 border-zinc-800';

  const inputClass = isLight
    ? 'bg-zinc-50 border-zinc-300 text-zinc-900'
    : 'bg-zinc-950 border-zinc-700 text-white';

  return (
    <div className="space-y-6">
      {/* Barra de controles: Período, Buscador, Actualizar y Exportar CSV/Excel */}
      <div className={`p-4 rounded-2xl border flex flex-col gap-3 ${cardClass}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400">
              <Cpu size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`text-sm font-extrabold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  Consumo de Tokens — Ettore IA
                </h3>
                {summary?.source === 'cloud' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <Database size={10} /> PostgreSQL Centralizado
                  </span>
                ) : summary?.source === 'local_fallback' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <AlertTriangle size={10} /> Modo Respaldo Local
                  </span>
                ) : null}
              </div>
              <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Control real de tokens Gemini consumidos por usuario, costo operativo estimado y simulador de cobro.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                isLight
                  ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800'
                  : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-slate-200'
              }`}
              title="Actualizar métricas desde PostgreSQL"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-orange-400' : ''} />
              <span>Actualizar</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredUsers.length === 0}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800'
                  : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-slate-200'
              }`}
              title="Descargar resumen por usuario en CSV"
            >
              <Download size={14} className="text-orange-400" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredUsers.length === 0 && filteredLogs.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Descargar reporte completo en Excel (.xlsx)"
            >
              <FileSpreadsheet size={14} />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        {/* Filtros de Período + Buscador */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-zinc-200/70 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center p-0.5 rounded-xl text-xs font-semibold border ${
                isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-950 border-zinc-800'
              }`}
            >
              <Calendar size={13} className="ml-2 mr-1 text-orange-500 shrink-0" />
              {(
                [
                  { id: 'today', label: 'Hoy' },
                  { id: '7d', label: '7D' },
                  { id: '30d', label: '30D' },
                  { id: 'month', label: 'Mes' },
                  { id: 'all', label: 'Todo' },
                  { id: 'custom', label: 'Rango' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    range === item.id
                      ? 'bg-orange-500 text-white font-bold'
                      : isLight
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {range === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`px-2 py-1 border rounded-lg text-xs font-mono ${inputClass}`}
                />
                <span className="text-zinc-500">a</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`px-2 py-1 border rounded-lg text-xs font-mono ${inputClass}`}
                />
              </div>
            )}
          </div>

          <div className="relative w-full md:w-72">
            <Search
              size={14}
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                isLight ? 'text-zinc-400' : 'text-zinc-500'
              }`}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por usuario, correo o empresa..."
              className={`w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl focus:outline-none focus:border-orange-500 ${inputClass}`}
            />
          </div>
        </div>

        {summary?.error && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{summary.error}</span>
          </div>
        )}
      </div>

      {/* 4 Tarjetas KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={`p-4 rounded-2xl border ${cardClass}`}>
          <div className="flex items-center justify-between text-[11px] font-extrabold text-orange-400 uppercase tracking-wider mb-1">
            <span>Tokens Totales</span>
            <Cpu size={16} />
          </div>
          <div className="text-2xl font-black font-mono">{formatNumber(metrics.totalTokens)}</div>
          <p className={`text-[11px] mt-1 font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            In: {formatNumber(metrics.promptTokens)} · Out: {formatNumber(metrics.outputTokens + metrics.thoughtsTokens)}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${cardClass}`}>
          <div className="flex items-center justify-between text-[11px] font-extrabold text-sky-400 uppercase tracking-wider mb-1">
            <span>Consultas a Ettore</span>
            <Activity size={16} />
          </div>
          <div className="text-2xl font-black font-mono">{formatNumber(metrics.totalRequests)}</div>
          <p className={`text-[11px] mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {metrics.uniqueUsers} usuario{metrics.uniqueUsers === 1 ? '' : 's'} · ~{formatNumber(metrics.avgTokensPerRequest)} tok/consulta
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${cardClass}`}>
          <div className="flex items-center justify-between text-[11px] font-extrabold text-amber-400 uppercase tracking-wider mb-1">
            <span>Costo Real Estimado</span>
            <Coins size={16} />
          </div>
          <div className="text-2xl font-black font-mono text-amber-400">
            {formatClp(metrics.totalCostClp)}
          </div>
          <p className={`text-[11px] mt-1 font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {formatUsd(metrics.totalCostUsd)} USD · Prom. {formatClp(metrics.avgCostClpPerUser)}/usuario
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${cardClass}`}>
          <div className="flex items-center justify-between text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider mb-1">
            <span>Cobro Sugerido (+{pricing.markupPercent}%)</span>
            <TrendingUp size={16} />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">
            {formatClp(metrics.totalSuggestedClp)}
          </div>
          <p className={`text-[11px] mt-1 font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {formatUsd(metrics.totalSuggestedUsd)} USD · Dólar ref. ${formatNumber(pricing.usdToClp)} CLP
          </p>
        </div>
      </div>

      {/* Acordeón: Simulador de Tarifas y Margen de Cobro */}
      <div className={`rounded-2xl border overflow-hidden ${cardClass}`}>
        <button
          type="button"
          onClick={() => setPricingOpen((v) => !v)}
          className={`w-full px-5 py-3.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
            isLight ? 'hover:bg-zinc-50' : 'hover:bg-zinc-800/50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Sliders size={16} className="text-orange-400" />
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
                Configuración de Tarifas Gemini & Simulador de Cobro
              </div>
              <div className={`text-[11px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Ajusta el costo por millón de tokens, tipo de cambio USD→CLP y tu margen para definir cuánto cobrar.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
              {pricingOpen ? 'ABIERTO' : 'CONFIGURADO'}
            </span>
            {pricingOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {pricingOpen && (
          <div className="px-5 pb-5 pt-2 border-t border-zinc-200/70 dark:border-zinc-800 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                  Tipo de Cambio (1 USD en CLP)
                </label>
                <input
                  type="number"
                  min={100}
                  step={10}
                  value={pricing.usdToClp}
                  onChange={(e) =>
                    updatePricing({ ...pricing, usdToClp: Math.max(1, Number(e.target.value) || 950) })
                  }
                  className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none focus:border-orange-500 ${inputClass}`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                  Margen sobre Costo Real (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={10}
                  value={pricing.markupPercent}
                  onChange={(e) =>
                    updatePricing({
                      ...pricing,
                      markupPercent: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none focus:border-orange-500 ${inputClass}`}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  100% = cobrar 2x el costo · 200% = cobrar 3x el costo.
                </p>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleResetPricing}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-slate-300'
                  }`}
                >
                  <RotateCcw size={13} />
                  <span>Restaurar Tarifas Referencia</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr
                    className={`border-b text-[10px] uppercase font-extrabold tracking-wider ${
                      isLight ? 'border-zinc-200 text-zinc-500' : 'border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <th className="py-2 pr-3">Modelo Gemini</th>
                    <th className="py-2 px-3">Entrada (USD / 1M tokens)</th>
                    <th className="py-2 px-3">Salida + Razonamiento (USD / 1M tokens)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {allKnownModels.map((modelName) => {
                    const rate = getRateForModel(modelName, pricing);
                    return (
                      <tr key={modelName}>
                        <td className="py-2 pr-3 font-mono font-bold">{modelName}</td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            step={0.05}
                            value={rate.inputUsdPerMillion}
                            onChange={(e) =>
                              handleModelRateChange(modelName, 'inputUsdPerMillion', e.target.value)
                            }
                            className={`w-32 px-2.5 py-1 rounded-lg border font-mono ${inputClass}`}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={rate.outputUsdPerMillion}
                            onChange={(e) =>
                              handleModelRateChange(modelName, 'outputUsdPerMillion', e.target.value)
                            }
                            className={`w-32 px-2.5 py-1 rounded-lg border font-mono ${inputClass}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Desglose compacto por Modelo */}
      {summary && summary.byModel.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {summary.byModel.map((m) => {
            const costUsd = calculateTokensCostUsd(
              m.modelUsed,
              m.promptTokens,
              m.outputTokens,
              m.thoughtsTokens,
              pricing
            );
            return (
              <div
                key={m.modelUsed}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${cardClass}`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono font-extrabold truncate text-orange-400">
                    {m.modelUsed}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {formatNumber(m.requestsCount)} consultas · {formatNumber(m.totalTokens)} tokens
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-extrabold">{formatClp(costUsd * pricing.usdToClp)}</div>
                  <div className="text-[10px] font-mono text-zinc-500">{formatUsd(costUsd)} USD</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabla Consolidada por Usuario */}
      <div className={`p-5 rounded-2xl border space-y-4 ${cardClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-orange-400 flex items-center gap-2">
            <Users size={15} />
            <span>Consumo de Tokens por Usuario ({filteredUsers.length})</span>
          </h3>
          <span className={`text-[11px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Ordenado de mayor a menor consumo de tokens
          </span>
        </div>

        {isLoading && !summary ? (
          <div className="py-10 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
            <RefreshCw size={15} className="animate-spin text-orange-400" />
            <span>Cargando telemetría de Ettore...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className={`py-10 text-center text-xs italic ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Aún no hay consumo registrado de Ettore para el período seleccionado. Cada consulta nueva quedará registrada automáticamente aquí.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr
                  className={`border-b text-[10px] font-extrabold uppercase tracking-wider ${
                    isLight ? 'border-zinc-200 text-zinc-500' : 'border-zinc-800 text-zinc-400'
                  }`}
                >
                  <th className="pb-3 px-2">Usuario / Correo</th>
                  <th className="pb-3 px-2">Empresa / Rol</th>
                  <th className="pb-3 px-2 text-right">Consultas</th>
                  <th className="pb-3 px-2 text-right">Entrada</th>
                  <th className="pb-3 px-2 text-right">Salida</th>
                  <th className="pb-3 px-2 text-right">Total Tokens</th>
                  <th className="pb-3 px-2 text-right">Costo Est.</th>
                  <th className="pb-3 px-2 text-right">Cobro Sug.</th>
                  <th className="pb-3 px-2 text-right">Último Uso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredUsers.map((u) => {
                  const costUsd = calculateUserCostUsd(u, pricing);
                  const costClp = costUsd * pricing.usdToClp;
                  const suggestedClp = calculateSuggestedChargeClp(costUsd, pricing);
                  const totalOut = u.outputTokens + u.thoughtsTokens;

                  return (
                    <tr key={u.userEmail} className="hover:bg-orange-500/5 transition-colors">
                      <td className="py-3 px-2">
                        <div className="font-bold">{u.userName}</div>
                        <div className="text-[11px] font-mono opacity-70">{u.userEmail}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="text-[11px] font-medium">
                          {u.tenantName || 'Sin Empresa'}
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-zinc-500/15 text-zinc-400">
                          {ROLE_LABELS[u.userRole] || u.userRole}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right font-mono">
                        <div className="font-bold">{formatNumber(u.requestsCount)}</div>
                        {(u.imagesRequests > 0 || u.audioRequests > 0) && (
                          <div className="text-[10px] text-zinc-500 flex items-center justify-end gap-1.5 mt-0.5">
                            {u.imagesRequests > 0 && (
                              <span className="inline-flex items-center gap-0.5" title="Consultas con imágenes">
                                <ImageIcon size={10} /> {u.imagesRequests}
                              </span>
                            )}
                            {u.audioRequests > 0 && (
                              <span className="inline-flex items-center gap-0.5" title="Consultas con audio">
                                <Mic size={10} /> {u.audioRequests}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-zinc-400">
                        {formatNumber(u.promptTokens)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-zinc-400">
                        <div>{formatNumber(totalOut)}</div>
                        {u.thoughtsTokens > 0 && (
                          <div className="text-[10px] opacity-65">
                            incl. {formatNumber(u.thoughtsTokens)} raz.
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-extrabold text-orange-400">
                        {formatNumber(u.totalTokens)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono">
                        <div className="font-bold text-amber-400">{formatClp(costClp)}</div>
                        <div className="text-[10px] opacity-70">{formatUsd(costUsd)} USD</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-extrabold text-emerald-400">
                        {formatClp(suggestedClp)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-[11px] opacity-75 whitespace-nowrap">
                        {u.lastUsedAt ? new Date(u.lastUsedAt).toLocaleString('es-CL') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr
                  className={`border-t-2 font-mono font-extrabold ${
                    isLight
                      ? 'border-zinc-300 bg-zinc-50 text-zinc-900'
                      : 'border-zinc-700 bg-zinc-950/60 text-white'
                  }`}
                >
                  <td colSpan={2} className="py-3 px-2 text-xs uppercase tracking-wider">
                    Totales ({filteredUsers.length} usuarios)
                  </td>
                  <td className="py-3 px-2 text-right">{formatNumber(metrics.totalRequests)}</td>
                  <td className="py-3 px-2 text-right">{formatNumber(metrics.promptTokens)}</td>
                  <td className="py-3 px-2 text-right">
                    {formatNumber(metrics.outputTokens + metrics.thoughtsTokens)}
                  </td>
                  <td className="py-3 px-2 text-right text-orange-400">
                    {formatNumber(metrics.totalTokens)}
                  </td>
                  <td className="py-3 px-2 text-right text-amber-400">
                    <div>{formatClp(metrics.totalCostClp)}</div>
                    <div className="text-[10px] opacity-75">{formatUsd(metrics.totalCostUsd)} USD</div>
                  </td>
                  <td className="py-3 px-2 text-right text-emerald-400">
                    {formatClp(metrics.totalSuggestedClp)}
                  </td>
                  <td className="py-3 px-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Historial Detallado de Interacciones */}
      <div className={`p-5 rounded-2xl border space-y-4 ${cardClass}`}>
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
          Historial Detallado de Consultas Ettore ({filteredLogs.length})
        </h3>

        {filteredLogs.length === 0 ? (
          <div className={`p-6 text-center text-xs italic ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            No hay consultas registradas en este período.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10">
                <tr
                  className={`border-b text-[10px] font-extrabold uppercase tracking-wider ${
                    isLight
                      ? 'bg-white border-zinc-200 text-zinc-500'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <th className="py-2.5 px-2">Fecha</th>
                  <th className="py-2.5 px-2">Usuario</th>
                  <th className="py-2.5 px-2">Modelo</th>
                  <th className="py-2.5 px-2">Acción</th>
                  <th className="py-2.5 px-2">Adjuntos</th>
                  <th className="py-2.5 px-2 text-right">Entrada</th>
                  <th className="py-2.5 px-2 text-right">Salida</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2 text-right">Costo Est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredLogs.map((log) => {
                  const costUsd = calculateTokensCostUsd(
                    log.modelUsed,
                    log.promptTokens,
                    log.outputTokens,
                    log.thoughtsTokens,
                    pricing
                  );
                  const actionMeta = ACTION_LABELS[log.actionType || ''];

                  return (
                    <tr key={log.id} className="hover:bg-orange-500/5 transition-colors">
                      <td className="py-2.5 px-2 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-bold">{log.userName}</div>
                        <div className="text-[10px] font-mono opacity-70">{log.userEmail}</div>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[11px]">{log.modelUsed}</td>
                      <td className="py-2.5 px-2">
                        {actionMeta ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold ${actionMeta.colorClass}`}
                          >
                            {actionMeta.label}
                          </span>
                        ) : (
                          <span className="text-zinc-500 font-mono text-[11px]">
                            {log.actionType || '-'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          {log.hasImages && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-bold">
                              <ImageIcon size={11} /> {log.imagesCount || 1}
                            </span>
                          )}
                          {log.hasAudio && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-bold">
                              <Mic size={11} /> Voz
                            </span>
                          )}
                          {!log.hasImages && !log.hasAudio && (
                            <span className="text-zinc-500">Texto</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-zinc-400">
                        {formatNumber(log.promptTokens)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-zinc-400">
                        {formatNumber(log.outputTokens + log.thoughtsTokens)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-orange-400">
                        {formatNumber(log.totalTokens)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        <div className="font-bold text-amber-400">
                          {formatClp(costUsd * pricing.usdToClp)}
                        </div>
                        <div className="text-[10px] opacity-65">{formatUsd(costUsd)} USD</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
