export type EttoreUsageRange = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

export interface EttoreModelUsageBreakdown {
  modelUsed: string;
  requestsCount: number;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export interface EttoreUserUsageSummary {
  userEmail: string;
  userId: string | null;
  userName: string;
  userRole: string;
  tenantId: string | null;
  tenantName: string | null;
  requestsCount: number;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  totalTokens: number;
  imagesCount: number;
  imagesRequests: number;
  audioRequests: number;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  modelsBreakdown: EttoreModelUsageBreakdown[];
}

export interface EttoreUsageLogItem {
  id: string;
  userId: string | null;
  userEmail: string;
  userName: string;
  userRole: string;
  tenantId: string | null;
  tenantName: string | null;
  modelUsed: string;
  actionType: string | null;
  hasImages: boolean;
  imagesCount: number;
  hasAudio: boolean;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  totalTokens: number;
  createdAt: string;
}

export interface EttoreUsageTotals {
  totalRequests: number;
  uniqueUsers: number;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  totalTokens: number;
  imagesRequests: number;
  audioRequests: number;
}

export interface EttoreUsageSummaryResponse {
  success: boolean;
  source: 'cloud' | 'local_fallback';
  range: string;
  totals: EttoreUsageTotals;
  byUser: EttoreUserUsageSummary[];
  byModel: EttoreModelUsageBreakdown[];
  recentLogs: EttoreUsageLogItem[];
  error?: string;
}

export interface EttoreModelRate {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface EttorePricingSettings {
  usdToClp: number;
  markupPercent: number; // % de margen sobre costo real para calcular precio sugerido a cobrar
  modelRates: Record<string, EttoreModelRate>;
  defaultRate: EttoreModelRate;
}

const PRICING_STORAGE_KEY = 'arquify_ettore_pricing_settings_v1';
const FALLBACK_LOGS_STORAGE_KEY = 'arquify_ettore_usage_fallback_v1';

export const DEFAULT_ETTORE_PRICING_SETTINGS: EttorePricingSettings = {
  usdToClp: 950,
  markupPercent: 150,
  modelRates: {
    'gemini-4-hydrogen': {
      inputUsdPerMillion: 0.5,
      outputUsdPerMillion: 3.0,
    },
    'gemini-3.1-pro-preview': {
      inputUsdPerMillion: 2.0,
      outputUsdPerMillion: 12.0,
    },
    'gemini-3.5-flash-lite': {
      inputUsdPerMillion: 0.25,
      outputUsdPerMillion: 1.5,
    },
  },
  defaultRate: {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 5.0,
  },
};

function getApiBaseUrl(): string {
  const metaEnv = (import.meta as any).env || {};
  const configured =
    typeof metaEnv.VITE_API_BASE_URL === 'string' ? metaEnv.VITE_API_BASE_URL.trim() : '';
  return configured ? configured.replace(/\/+$/, '') : '';
}

export function loadEttorePricingSettings(): EttorePricingSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_ETTORE_PRICING_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(PRICING_STORAGE_KEY);
    if (!raw) return DEFAULT_ETTORE_PRICING_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      usdToClp: Number.isFinite(Number(parsed?.usdToClp)) && Number(parsed.usdToClp) > 0
        ? Number(parsed.usdToClp)
        : DEFAULT_ETTORE_PRICING_SETTINGS.usdToClp,
      markupPercent: Number.isFinite(Number(parsed?.markupPercent)) && Number(parsed.markupPercent) >= 0
        ? Number(parsed.markupPercent)
        : DEFAULT_ETTORE_PRICING_SETTINGS.markupPercent,
      defaultRate: {
        inputUsdPerMillion: Number.isFinite(Number(parsed?.defaultRate?.inputUsdPerMillion))
          ? Math.max(0, Number(parsed.defaultRate.inputUsdPerMillion))
          : DEFAULT_ETTORE_PRICING_SETTINGS.defaultRate.inputUsdPerMillion,
        outputUsdPerMillion: Number.isFinite(Number(parsed?.defaultRate?.outputUsdPerMillion))
          ? Math.max(0, Number(parsed.defaultRate.outputUsdPerMillion))
          : DEFAULT_ETTORE_PRICING_SETTINGS.defaultRate.outputUsdPerMillion,
      },
      modelRates: {
        ...DEFAULT_ETTORE_PRICING_SETTINGS.modelRates,
        ...(parsed?.modelRates || {}),
      },
    };
  } catch {
    return DEFAULT_ETTORE_PRICING_SETTINGS;
  }
}

export function saveEttorePricingSettings(settings: EttorePricingSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function getRateForModel(modelUsed: string, settings: EttorePricingSettings): EttoreModelRate {
  const exact = settings.modelRates[modelUsed];
  if (exact) return exact;
  const lower = (modelUsed || '').toLowerCase();
  for (const [key, rate] of Object.entries(settings.modelRates)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return rate;
    }
  }
  return settings.defaultRate;
}

export function calculateTokensCostUsd(
  modelUsed: string,
  promptTokens: number,
  outputTokens: number,
  thoughtsTokens: number,
  settings: EttorePricingSettings
): number {
  const rate = getRateForModel(modelUsed, settings);
  const inputCost = (Math.max(0, promptTokens) / 1_000_000) * Math.max(0, rate.inputUsdPerMillion);
  // En Gemini API los tokens de razonamiento (thoughtsTokens) se facturan a tarifa de salida
  const billableOutputTokens = Math.max(0, outputTokens) + Math.max(0, thoughtsTokens);
  const outputCost = (billableOutputTokens / 1_000_000) * Math.max(0, rate.outputUsdPerMillion);
  return inputCost + outputCost;
}

export function calculateUserCostUsd(
  user: EttoreUserUsageSummary,
  settings: EttorePricingSettings
): number {
  if (Array.isArray(user.modelsBreakdown) && user.modelsBreakdown.length > 0) {
    return user.modelsBreakdown.reduce(
      (sum, m) =>
        sum +
        calculateTokensCostUsd(
          m.modelUsed,
          m.promptTokens,
          m.outputTokens,
          m.thoughtsTokens,
          settings
        ),
      0
    );
  }
  return calculateTokensCostUsd(
    'default',
    user.promptTokens,
    user.outputTokens,
    user.thoughtsTokens,
    settings
  );
}

export function calculateSuggestedChargeClp(costUsd: number, settings: EttorePricingSettings): number {
  const costClp = costUsd * Math.max(1, settings.usdToClp);
  return costClp * (1 + Math.max(0, settings.markupPercent) / 100);
}

function loadLocalFallbackLogs(): EttoreUsageLogItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(FALLBACK_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function recordEttoreUsageFallback(item: EttoreUsageLogItem): Promise<void> {
  // 1. Intentar registrar en el gateway desde el cliente (con el mismo ID para evitar duplicados)
  try {
    const endpoint = `${getApiBaseUrl()}/api/v1/ettore-usage`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (res.ok) return;
  } catch {
    // continuar con respaldo local
  }

  // 2. Respaldo local en caso de entorno offline sin PostgreSQL
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = loadLocalFallbackLogs();
    if (current.some((x) => x.id === item.id)) return;
    const next = [item, ...current].slice(0, 300);
    localStorage.setItem(FALLBACK_LOGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function buildSummaryFromLogs(
  logs: EttoreUsageLogItem[],
  range: EttoreUsageRange,
  startDate?: string,
  endDate?: string
): EttoreUsageSummaryResponse {
  const now = new Date();
  const filtered = logs.filter((log) => {
    const d = new Date(log.createdAt);
    if (Number.isNaN(d.getTime())) return true;
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d >= start;
    }
    if (range === '7d') {
      return d >= new Date(now.getTime() - 7 * 86400_000);
    }
    if (range === '30d') {
      return d >= new Date(now.getTime() - 30 * 86400_000);
    }
    if (range === 'month') {
      return d >= new Date(now.getFullYear(), now.getMonth(), 1);
    }
    if (range === 'custom') {
      if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
      if (endDate && d > new Date(`${endDate}T23:59:59.999`)) return false;
    }
    return true;
  });

  const userMap = new Map<string, EttoreUserUsageSummary>();
  const modelMap = new Map<string, EttoreModelUsageBreakdown>();
  const totals: EttoreUsageTotals = {
    totalRequests: 0,
    uniqueUsers: 0,
    promptTokens: 0,
    outputTokens: 0,
    thoughtsTokens: 0,
    cachedTokens: 0,
    totalTokens: 0,
    imagesRequests: 0,
    audioRequests: 0,
  };

  for (const log of filtered) {
    const emailKey = (log.userEmail || 'usuario-sin-correo@arquify.local').toLowerCase();
    totals.totalRequests += 1;
    totals.promptTokens += log.promptTokens;
    totals.outputTokens += log.outputTokens;
    totals.thoughtsTokens += log.thoughtsTokens;
    totals.cachedTokens += log.cachedTokens;
    totals.totalTokens += log.totalTokens;
    if (log.hasImages) totals.imagesRequests += 1;
    if (log.hasAudio) totals.audioRequests += 1;

    let u = userMap.get(emailKey);
    if (!u) {
      u = {
        userEmail: log.userEmail || emailKey,
        userId: log.userId,
        userName: log.userName || log.userEmail || emailKey,
        userRole: log.userRole || 'designer',
        tenantId: log.tenantId,
        tenantName: log.tenantName,
        requestsCount: 0,
        promptTokens: 0,
        outputTokens: 0,
        thoughtsTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        imagesCount: 0,
        imagesRequests: 0,
        audioRequests: 0,
        firstUsedAt: log.createdAt,
        lastUsedAt: log.createdAt,
        modelsBreakdown: [],
      };
      userMap.set(emailKey, u);
    }
    u.requestsCount += 1;
    u.promptTokens += log.promptTokens;
    u.outputTokens += log.outputTokens;
    u.thoughtsTokens += log.thoughtsTokens;
    u.cachedTokens += log.cachedTokens;
    u.totalTokens += log.totalTokens;
    u.imagesCount += log.imagesCount;
    if (log.hasImages) u.imagesRequests += 1;
    if (log.hasAudio) u.audioRequests += 1;
    if (!u.firstUsedAt || log.createdAt < u.firstUsedAt) u.firstUsedAt = log.createdAt;
    if (!u.lastUsedAt || log.createdAt > u.lastUsedAt) u.lastUsedAt = log.createdAt;

    let um = u.modelsBreakdown.find((m) => m.modelUsed === log.modelUsed);
    if (!um) {
      um = {
        modelUsed: log.modelUsed,
        requestsCount: 0,
        promptTokens: 0,
        outputTokens: 0,
        thoughtsTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
      };
      u.modelsBreakdown.push(um);
    }
    um.requestsCount += 1;
    um.promptTokens += log.promptTokens;
    um.outputTokens += log.outputTokens;
    um.thoughtsTokens += log.thoughtsTokens;
    um.cachedTokens += log.cachedTokens;
    um.totalTokens += log.totalTokens;

    let mAgg = modelMap.get(log.modelUsed);
    if (!mAgg) {
      mAgg = {
        modelUsed: log.modelUsed,
        requestsCount: 0,
        promptTokens: 0,
        outputTokens: 0,
        thoughtsTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
      };
      modelMap.set(log.modelUsed, mAgg);
    }
    mAgg.requestsCount += 1;
    mAgg.promptTokens += log.promptTokens;
    mAgg.outputTokens += log.outputTokens;
    mAgg.thoughtsTokens += log.thoughtsTokens;
    mAgg.cachedTokens += log.cachedTokens;
    mAgg.totalTokens += log.totalTokens;
  }

  const byUser = Array.from(userMap.values()).sort((a, b) => b.totalTokens - a.totalTokens);
  totals.uniqueUsers = byUser.length;

  return {
    success: true,
    source: 'local_fallback',
    range,
    totals,
    byUser,
    byModel: Array.from(modelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
    recentLogs: filtered,
  };
}

export async function fetchEttoreUsageSummary(params: {
  range: EttoreUsageRange;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<EttoreUsageSummaryResponse> {
  const qs = new URLSearchParams();
  qs.set('range', params.range);
  if (params.range === 'custom') {
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
  }
  if (params.limit) qs.set('limit', String(params.limit));

  const endpoint = `${getApiBaseUrl()}/api/v1/ettore-usage/summary?${qs.toString()}`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data?.success) {
      throw new Error(data?.error || 'Respuesta inesperada del servidor');
    }

    return {
      success: true,
      source: 'cloud',
      range: data.range || params.range,
      totals: data.totals,
      byUser: Array.isArray(data.byUser) ? data.byUser : [],
      byModel: Array.isArray(data.byModel) ? data.byModel : [],
      recentLogs: Array.isArray(data.recentLogs) ? data.recentLogs : [],
    };
  } catch (err: any) {
    console.warn('[EttoreUsageAPI] No se pudo consultar PostgreSQL, usando respaldo local:', err?.message || err);
    const localLogs = loadLocalFallbackLogs();
    const fallbackSummary = buildSummaryFromLogs(
      localLogs,
      params.range,
      params.startDate,
      params.endDate
    );
    return {
      ...fallbackSummary,
      error:
        'No se pudo conectar con la base de datos centralizada (PostgreSQL). Mostrando respaldo local del navegador.',
    };
  }
}
