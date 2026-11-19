import React, { useState } from 'react';
import {
  EyeOff,
  Calculator,
  Users,
  Sliders,
  TrendingUp,
  CheckCircle2,
  Info,
  Layers,
  Sparkles,
  Split,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';

interface LivePricingBackofficeCardProps {
  className?: string;
}

export function LivePricingBackofficeCard({ className = '' }: LivePricingBackofficeCardProps) {
  const {
    livePriceDisplayMode,
    setLivePriceDisplayMode,
    liveSaleMarginPercent,
    setLiveSaleMarginPercent,
    liveSaleMarginFurniturePercent,
    setLiveSaleMarginFurniturePercent,
    liveSaleMarginCountertopPercent,
    setLiveSaleMarginCountertopPercent,
    differentiateMargins,
    setDifferentiateMargins,
    themeMode,
  } = useAdminStore();

  const isLight = themeMode === 'light';
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleModeChange = (mode: 'none' | 'cost' | 'sale') => {
    setLivePriceDisplayMode(mode);
    if (mode === 'none') {
      showToast('Visualización desactivada: pantalla limpia en 3D');
    } else if (mode === 'cost') {
      showToast('Modo activo: Costo industrial en vivo');
    } else {
      showToast('Modo activo: Valor de venta al cliente');
    }
  };

  const handleUnifiedMarginChange = (val: number) => {
    const clamped = Math.max(0, Math.min(500, Math.round(val)));
    setLiveSaleMarginPercent(clamped);
    setLiveSaleMarginFurniturePercent(clamped);
    setLiveSaleMarginCountertopPercent(clamped);
  };

  const handleFurnitureMarginChange = (val: number) => {
    const clamped = Math.max(0, Math.min(500, Math.round(val)));
    setLiveSaleMarginFurniturePercent(clamped);
  };

  const handleCountertopMarginChange = (val: number) => {
    const clamped = Math.max(0, Math.min(500, Math.round(val)));
    setLiveSaleMarginCountertopPercent(clamped);
  };

  const effectiveFurnitureMargin = differentiateMargins
    ? liveSaleMarginFurniturePercent
    : liveSaleMarginPercent;
  const effectiveCountertopMargin = differentiateMargins
    ? liveSaleMarginCountertopPercent
    : liveSaleMarginPercent;

  // Simulación: Muebles base $1.500.000 + Cubierta base $500.000 = $2.000.000 costo neto
  const simCostFurniture = 1500000;
  const simCostCountertop = 500000;
  const simSaleFurnitureNeto = Math.round(simCostFurniture * (1 + effectiveFurnitureMargin / 100));
  const simSaleCountertopNeto = Math.round(simCostCountertop * (1 + effectiveCountertopMargin / 100));
  const simTotalSaleNeto = simSaleFurnitureNeto + simSaleCountertopNeto;
  const simTotalSaleBruto = Math.round(simTotalSaleNeto * 1.19);

  const presets = [0, 20, 35, 50, 75, 100, 150, 200, 300, 500];

  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 transition-colors relative overflow-hidden ${
        isLight
          ? 'bg-white border-zinc-200 shadow-sm text-zinc-900'
          : 'bg-zinc-900/70 border-zinc-800 text-slate-100'
      } ${className}`}
    >
      {/* Toast de confirmación rápida */}
      {toastMessage && (
        <div className="absolute top-4 right-4 z-20 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={14} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Cabecera de la Tarjeta */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <Sliders size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold tracking-tight flex items-center gap-2">
              <span>Visualización de Precios en Vivo & Modo Cliente</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 uppercase tracking-wider">
                Configurador 3D
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Elige qué información económica se muestra en pantalla mientras diseñas, o mantén la interfaz despejada.
            </p>
          </div>
        </div>

        {/* Estado actual badge */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400">Estado actual:</span>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
              livePriceDisplayMode === 'none'
                ? isLight
                  ? 'bg-zinc-100 border-zinc-300 text-zinc-600'
                  : 'bg-zinc-800 border-zinc-700 text-slate-400'
                : livePriceDisplayMode === 'cost'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
            }`}
          >
            {livePriceDisplayMode === 'none' && 'Oculto'}
            {livePriceDisplayMode === 'cost' && 'Costo en Vivo'}
            {livePriceDisplayMode === 'sale' &&
              (differentiateMargins
                ? `Venta (M:${effectiveFurnitureMargin}% | C:${effectiveCountertopMargin}%)`
                : `Venta (+${effectiveFurnitureMargin}%)`)}
          </span>
        </div>
      </div>

      {/* Selector de las 3 Opciones Principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-5">
        {/* Opción 1: No mostrar nada */}
        <button
          type="button"
          onClick={() => handleModeChange('none')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
            livePriceDisplayMode === 'none'
              ? isLight
                ? 'bg-orange-50/70 border-orange-500 shadow-md ring-2 ring-orange-500/20'
                : 'bg-orange-500/10 border-orange-500 shadow-md ring-2 ring-orange-500/20'
              : isLight
              ? 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200'
              : 'bg-zinc-950/60 hover:bg-zinc-800/50 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div
              className={`p-2 rounded-lg ${
                livePriceDisplayMode === 'none'
                  ? 'bg-orange-500 text-white'
                  : isLight
                  ? 'bg-zinc-200 text-zinc-700'
                  : 'bg-zinc-800 text-slate-400'
              }`}
            >
              <EyeOff size={18} />
            </div>
            {livePriceDisplayMode === 'none' && (
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Activo</span>
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold">1. No Mostrar Nada</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Pantalla limpia sin números ni cifras de costo ni precios. Máxima concentración en el diseño espacial.
            </p>
          </div>
        </button>

        {/* Opción 2: Mostrar el Costo */}
        <button
          type="button"
          onClick={() => handleModeChange('cost')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
            livePriceDisplayMode === 'cost'
              ? isLight
                ? 'bg-amber-50/80 border-amber-500 shadow-md ring-2 ring-amber-500/20'
                : 'bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-500/20'
              : isLight
              ? 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200'
              : 'bg-zinc-950/60 hover:bg-zinc-800/50 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div
              className={`p-2 rounded-lg ${
                livePriceDisplayMode === 'cost'
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : isLight
                  ? 'bg-zinc-200 text-zinc-700'
                  : 'bg-zinc-800 text-slate-400'
              }`}
            >
              <Calculator size={18} />
            </div>
            {livePriceDisplayMode === 'cost' && (
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Activo</span>
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold">2. Mostrar Costo de Fabricación</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Muestra en tiempo real el costo directo industrial (materiales, corte, canteado y herrajes) con cada cambio.
            </p>
          </div>
        </button>

        {/* Opción 3: Mostrar Valor de Venta (Modo Cliente) */}
        <button
          type="button"
          onClick={() => handleModeChange('sale')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
            livePriceDisplayMode === 'sale'
              ? isLight
                ? 'bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                : 'bg-emerald-500/10 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
              : isLight
              ? 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200'
              : 'bg-zinc-950/60 hover:bg-zinc-800/50 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div
              className={`p-2 rounded-lg ${
                livePriceDisplayMode === 'sale'
                  ? 'bg-emerald-500 text-white font-bold'
                  : isLight
                  ? 'bg-zinc-200 text-zinc-700'
                  : 'bg-zinc-800 text-slate-400'
              }`}
            >
              <Users size={18} />
            </div>
            {livePriceDisplayMode === 'sale' && (
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Activo</span>
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold">3. Mostrar Valor de Venta (Modo Cliente)</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Muestra el precio de venta final al cliente. Configura el margen libremente para muebles y cubiertas.
            </p>
          </div>
        </button>
      </div>

      {/* SECCIÓN DESPLEGABLE: Configuración de Margen de Venta (Muebles vs Cubiertas) */}
      {livePriceDisplayMode === 'sale' && (
        <div
          className={`mt-6 p-5 sm:p-6 rounded-xl border transition-all animate-in fade-in slide-in-from-top-3 ${
            isLight ? 'bg-emerald-50/40 border-emerald-200' : 'bg-emerald-950/15 border-emerald-800/40'
          }`}
        >
          {/* Barra de Modo de Margen: Unificado vs Diferenciado */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-emerald-500/20">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-500" />
              <span className="text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Margen Comercial de Venta (Scroll / Slider 0% a 500%)
              </span>
            </div>

            {/* Toggle para Diferenciar Margen Muebles vs Cubiertas */}
            <div className="flex items-center gap-2 bg-white/70 dark:bg-black/40 p-1 rounded-xl border border-emerald-500/30">
              <button
                type="button"
                onClick={() => setDifferentiateMargins(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !differentiateMargins
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isLight
                    ? 'text-zinc-600 hover:text-zinc-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Margen Unificado
              </button>
              <button
                type="button"
                onClick={() => setDifferentiateMargins(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  differentiateMargins
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isLight
                    ? 'text-zinc-600 hover:text-zinc-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Split size={14} />
                <span>Diferenciar Muebles / Cubiertas</span>
              </button>
            </div>
          </div>

          {/* CASO A: Margen Unificado (aplica por igual a muebles y cubiertas) */}
          {!differentiateMargins && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Margen General del Proyecto:
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">
                    Factor: <strong className="text-emerald-500">×{(1 + liveSaleMarginPercent / 100).toFixed(2)}</strong>
                  </span>
                  <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-lg">
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      value={liveSaleMarginPercent}
                      onChange={(e) => handleUnifiedMarginChange(Number(e.target.value))}
                      className="w-16 bg-transparent text-right font-mono font-extrabold text-base text-emerald-600 dark:text-emerald-400 focus:outline-none"
                    />
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">%</span>
                  </div>
                </div>
              </div>

              {/* Slider Unificado */}
              <input
                type="range"
                min="0"
                max="500"
                step="1"
                value={liveSaleMarginPercent}
                onChange={(e) => handleUnifiedMarginChange(Number(e.target.value))}
                className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400 px-0.5">
                <span>0% (Al costo)</span>
                <span>35% (Estándar B2B)</span>
                <span>100% (2x)</span>
                <span>250%</span>
                <span>500% (Máximo)</span>
              </div>

              {/* Presets Unificados */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleUnifiedMarginChange(preset)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      liveSaleMarginPercent === preset
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : isLight
                        ? 'bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700'
                        : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-slate-300'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CASO B: Márgenes Diferenciados (1. Muebles vs 2. Cubiertas) */}
          {differentiateMargins && (
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SLIDER 1: MUEBLES (Melamina + Herrajes + Manufactura) */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-white/90 border-emerald-200' : 'bg-black/40 border-emerald-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-500/15 text-amber-500 rounded-lg">
                      <Layers size={16} />
                    </div>
                    <div>
                      <h5 className="text-xs font-extrabold uppercase tracking-wider text-amber-500">
                        1. Margen para Muebles
                      </h5>
                      <span className="text-[10px] text-slate-400">Tableros, cantos, herrajes y mecanizados</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      value={liveSaleMarginFurniturePercent}
                      onChange={(e) => handleFurnitureMarginChange(Number(e.target.value))}
                      className="w-14 bg-transparent text-right font-mono font-extrabold text-sm text-amber-500 focus:outline-none"
                    />
                    <span className="font-extrabold text-amber-500 text-sm">%</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max="500"
                  step="1"
                  value={liveSaleMarginFurniturePercent}
                  onChange={(e) => handleFurnitureMarginChange(Number(e.target.value))}
                  className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400 transition-all"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>0%</span>
                  <span>35%</span>
                  <span>100%</span>
                  <span>500%</span>
                </div>

                {/* Presets rápidos para Muebles */}
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {[0, 20, 35, 50, 75, 100, 150, 200, 500].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleFurnitureMarginChange(p)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                        liveSaleMarginFurniturePercent === p
                          ? 'bg-amber-500 text-zinc-950 font-extrabold'
                          : isLight
                          ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-slate-300'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              {/* SLIDER 2: CUBIERTAS (Piedras, Cuarzo, Granito Qstone) */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-white/90 border-emerald-200' : 'bg-black/40 border-emerald-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sky-500/15 text-sky-500 rounded-lg">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h5 className="text-xs font-extrabold uppercase tracking-wider text-sky-400">
                        2. Margen para Cubiertas
                      </h5>
                      <span className="text-[10px] text-slate-400">Piedras sinterizadas y cuarzo Qstone</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-lg">
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      value={liveSaleMarginCountertopPercent}
                      onChange={(e) => handleCountertopMarginChange(Number(e.target.value))}
                      className="w-14 bg-transparent text-right font-mono font-extrabold text-sm text-sky-400 focus:outline-none"
                    />
                    <span className="font-extrabold text-sky-400 text-sm">%</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max="500"
                  step="1"
                  value={liveSaleMarginCountertopPercent}
                  onChange={(e) => handleCountertopMarginChange(Number(e.target.value))}
                  className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-400 hover:accent-sky-300 transition-all"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>100%</span>
                  <span>500%</span>
                </div>

                {/* Presets rápidos para Cubiertas */}
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {[0, 15, 25, 35, 50, 75, 100, 150, 500].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleCountertopMarginChange(p)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                        liveSaleMarginCountertopPercent === p
                          ? 'bg-sky-500 text-white font-extrabold'
                          : isLight
                          ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-slate-300'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cuadro Informativo de Valor Unificado al Cliente */}
          <div
            className={`mt-5 p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
              isLight ? 'bg-white/90 border-emerald-300 text-zinc-900' : 'bg-black/50 border-emerald-500/30 text-slate-100'
            }`}
          >
            <div className="flex items-start gap-3 max-w-xl">
              <Info size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed space-y-1">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px]">
                  Lo que verá tu cliente en vivo: Solo el Total Unificado
                </span>
                <p className="text-slate-500 dark:text-slate-400">
                  En el configurador 3D la cifra aparece <strong>completamente consolidada y sin desglose</strong>, protegiendo tus márgenes individuales de muebles y cubiertas ante el cliente sentado a tu lado.
                </p>
                {differentiateMargins && (
                  <div className="text-[11px] font-mono text-slate-400 pt-1 flex flex-wrap gap-x-4">
                    <span>Muebles: +{effectiveFurnitureMargin}%</span>
                    <span>Cubiertas: +{effectiveCountertopMargin}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                Total Venta Proyecto (Simulación)
              </span>
              <div className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                ${simTotalSaleBruto.toLocaleString('es-CL')} CLP
              </div>
              <span className="text-[10px] text-slate-400 font-semibold block">
                (IVA 19% Incluido • Cifra Unificada)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
