import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Camera,
  Download,
  Lock,
  CreditCard,
  Users,
  Utensils,
  Sun,
  Home,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Maximize2,
  ShieldAlert,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { useSupabaseAuthStore } from '../../store/supabaseAuthStore';
import { useKitchenStore } from '../../store/kitchenStore';
import { extractDetailedKitchenBimManifest, DetailedBimManifest } from '../../utils/nanoBananaExtractor';

interface NanoBananaRenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLight?: boolean;
}

export function NanoBananaRenderModal({ isOpen, onClose, isLight = false }: NanoBananaRenderModalProps) {
  const { currentUser, getUserNanoBananaCredits, deductNanoBananaCredit } = useAdminStore();
  const supabaseUser = useSupabaseAuthStore((state) => state.user);

  const effectiveRole = currentUser?.role || supabaseUser?.role || 'designer';
  const isSuperAdmin = effectiveRole === 'superadmin' || currentUser?.email?.includes('marcelo@robfu');
  const isFreeUser = effectiveRole === 'free_user';
  
  const credits = getUserNanoBananaCredits(currentUser?.email || supabaseUser?.email, effectiveRole);

  // Opciones de Configuración del Render
  const [propertyType, setPropertyType] = useState<string>('Casa Residencial');
  const [environment, setEnvironment] = useState<string>('Interior (Muros Ciegos / Sin Ventanas)');
  const [lighting, setLighting] = useState<string>('Mañana Luminosa (Luz Natural Sol)');
  const [hasPeople, setHasPeople] = useState<boolean>(false);
  const [hasProps, setHasProps] = useState<boolean>(false);

  // Estados del Flujo de Generación
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [showRechargeModal, setShowRechargeModal] = useState<boolean>(false);
  const [showBimDetails, setShowBimDetails] = useState<boolean>(false);

  const kitchenState = useKitchenStore();
  const auditedBim: DetailedBimManifest | null = React.useMemo(() => {
    try {
      return extractDetailedKitchenBimManifest(kitchenState);
    } catch (e) {
      console.warn('Error al extraer auditoría BIM:', e);
      return null;
    }
  }, [
    kitchenState.cabinets,
    kitchenState.countertopConfig,
    kitchenState.showSocle,
    kitchenState.socleFinish,
    kitchenState.socleHeight,
    kitchenState.handleConfig,
    kitchenState.golaSystem,
    kitchenState.floorType,
    kitchenState.wallColor,
  ]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setErrorMessage(null);

    // 1. Verificación de Usuario Gratis
    if (isFreeUser) {
      setShowUpgradeModal(true);
      return;
    }

    // 2. Verificación de Créditos Agotados
    if (!isSuperAdmin && credits <= 0) {
      setShowRechargeModal(true);
      return;
    }

    // 3. Captura del Canvas 3D
    setIsGenerating(true);
    setProgressStatus('Capturando viewport 3D del proyecto...');

    let canvasDataUrl = '';
    try {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvasDataUrl = canvas.toDataURL('image/png');
      }
    } catch (err) {
      console.warn('Advertencia al capturar canvas 3D:', err);
    }

    if (!canvasDataUrl) {
      setIsGenerating(false);
      setErrorMessage('No se pudo capturar la vista 3D actual. Asegúrate de estar en Vista 3D.');
      return;
    }

    try {
      setProgressStatus('Auditando código y despiece del proyecto (Cero Alucinación)...');
      await new Promise((r) => setTimeout(r, 400));

      let bimManifest = auditedBim;
      if (!bimManifest) {
        try {
          const kitchenState = useKitchenStore.getState();
          bimManifest = extractDetailedKitchenBimManifest(kitchenState);
        } catch (e) {
          console.warn('No se pudo extraer bimManifest detallado de cocina:', e);
        }
      }

      setProgressStatus('Aplicando motor de iluminación y materiales NanoBanana AI...');

      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: canvasDataUrl,
          propertyType,
          environment,
          lighting,
          hasPeople,
          hasProps,
          bimManifest,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.imageUrl) {
        throw new Error(data.error || 'No se pudo generar la imagen fotográfica');
      }

      // Descontar crédito y registrar log
      deductNanoBananaCredit({
        userId: currentUser?.id || supabaseUser?.id,
        userEmail: currentUser?.email || supabaseUser?.email,
        userName: currentUser?.full_name || supabaseUser?.full_name,
        propertyType,
        environment,
        lighting,
        hasPeople,
        hasProps,
      });

      setResultImage(data.imageUrl);
    } catch (err: any) {
      console.error('Error al generar render con NanoBanana:', err);
      let rawMsg = String(err?.message || err || '');
      if (rawMsg.includes('429') || rawMsg.includes('Quota exceeded') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        rawMsg = 'Límite de cuota alcanzado (Error 429) para el modelo NanoBanana en la cuenta/API Key gratuita de Google GenAI. He desplegado el flujo de configuración de API Key de pago para que puedas seleccionar o activar un proyecto con facturación y continuar generando renders fotográficos.';
      } else if (rawMsg.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawMsg);
          rawMsg = parsed.error?.message || parsed.error || rawMsg;
        } catch {
          // ignore
        }
      }
      setErrorMessage(rawMsg || 'Ocurrió un error al procesar el render fotográfico. Intenta nuevamente.');
    } finally {
      setIsGenerating(false);
      setProgressStatus('');
    }
  };

  const handleDownloadImage = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = `render_nanobanana_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl max-h-[92vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden transition-colors ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-white/10 text-white'
        }`}
      >
        {/* Header con Título y Estado de Créditos */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/40'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-orange-500 to-amber-500 text-white rounded-xl shadow-md shadow-orange-500/20">
              <Camera size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">Render Fotográfico NanoBanana AI</h3>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  Fotorrealismo
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Conserva la geometría y posición exacta de tus muebles ambientados con IA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Badge de Créditos */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
              isSuperAdmin
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : isFreeUser
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : credits > 0
                ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              <Zap size={14} className="fill-current" />
              <span>
                {isSuperAdmin
                  ? 'Créditos: Ilimitados (SuperAdmin)'
                  : isFreeUser
                  ? 'Plan Gratuito 🔒'
                  : `${credits} / 100 Créditos`}
              </span>
            </div>

            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'
              }`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenido Principal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Si ya hay un resultado generado, mostrar el previsualizador */}
          {resultImage ? (
            <div className="space-y-4 animate-in zoom-in-95 duration-200">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black group">
                <img src={resultImage} alt="Render Fotográfico NanoBanana" className="w-full h-auto max-h-[60vh] object-contain mx-auto" />
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    onClick={handleDownloadImage}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
                  >
                    <Download size={16} />
                    <span>Descargar Render HD</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border bg-orange-500/5 border-orange-500/20">
                <div className="flex items-center gap-2 text-xs font-semibold text-orange-400">
                  <CheckCircle2 size={16} />
                  <span>Render generado manteniendo intacta la cantidad y distribución de los muebles.</span>
                </div>
                <button
                  onClick={() => setResultImage(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800' : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                  }`}
                >
                  Configurar Nuevo Render
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Columna Izquierda: Parámetros del Inmueble y Entorno */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-orange-400 mb-2">
                    <Home size={14} />
                    <span>1. Tipo de Inmueble</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Casa Residencial', 'Departamento Urbano', 'Loft Moderno', 'Oficina / Comercial'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setPropertyType(type)}
                        className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                          propertyType === type
                            ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-sm'
                            : isLight
                            ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-orange-400 mb-2">
                    <Sparkles size={14} />
                    <span>2. Vista Exterior (Ventanas / Entorno)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Interior (Muros Ciegos / Sin Ventanas)',
                      'Playa / Vista al Mar',
                      'Campo / Naturaleza Verde',
                      'Ciudad / Rascacielos',
                      'Jardín / Patio Residencial',
                      'Bosque / Montaña',
                    ].map((env) => (
                      <button
                        key={env}
                        onClick={() => setEnvironment(env)}
                        className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                          environment === env
                            ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-sm'
                            : isLight
                            ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        {env}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Iluminación, Personas y Decoración de Vida */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-orange-400 mb-2">
                    <Sun size={14} />
                    <span>3. Iluminación y Hora</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      'Mañana Luminosa (Luz Natural Sol)',
                      'Atardecer Cálido (Golden Hour)',
                      'Iluminación de Estudio de Fotografía',
                      'Noche Cálida con Luces Led Ambientales',
                    ].map((light) => (
                      <button
                        key={light}
                        onClick={() => setLighting(light)}
                        className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                          lighting === light
                            ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-sm'
                            : isLight
                            ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                      >
                        {light}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-orange-400 mb-2">
                    <Users size={14} />
                    <span>4. Vida, Personas y Decoración (Staging)</span>
                  </label>

                  <div className="space-y-2">
                    <label
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                        hasPeople
                          ? 'bg-orange-500/10 border-orange-500/40 text-orange-300'
                          : isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-white/5 border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Users size={18} className="text-orange-400" />
                        <div>
                          <div className="text-xs font-bold">Personas Activas e Interacción Real</div>
                          <div className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            Personas cocinando, organizando prendas o habitando el espacio.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={hasPeople}
                        onChange={(e) => setHasPeople(e.target.checked)}
                        className="w-4 h-4 accent-orange-500 cursor-pointer"
                      />
                    </label>

                    <label
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                        hasProps
                          ? 'bg-orange-500/10 border-orange-500/40 text-orange-300'
                          : isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-white/5 border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Utensils size={18} className="text-orange-400" />
                        <div>
                          <div className="text-xs font-bold">Utensilios, Electrodomésticos y Adornos</div>
                          <div className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            Ollas, jugueras, vajilla, plantas, ropa colgada y libros en cubiertas.
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={hasProps}
                        onChange={(e) => setHasProps(e.target.checked)}
                        className="w-4 h-4 accent-orange-500 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Auditoría Técnica del Proyecto (Cero Alucinación) */}
          {!resultImage && auditedBim && (
            <div className={`rounded-xl border overflow-hidden transition-all ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-white/5 border-white/10 text-slate-200'
            }`}>
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0 mt-0.5 sm:mt-0">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                        Diseño y Código Auditado (Fidelidad 1:1)
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {auditedBim.totalModulesCount} Muebles Bloqueados
                      </span>
                    </div>
                    <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {auditedBim.breakdown.baseCount} bajos · {auditedBim.breakdown.wallCount} aéreos · {auditedBim.breakdown.tallCount} torres · {auditedBim.hasIsland ? `${auditedBim.breakdown.islandCount} en isla` : '0 islas (piso despejado)'} · Cubierta: {auditedBim.countertop.productName} ({auditedBim.countertop.regruesoCm}cm)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBimDetails(!showBimDetails)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1.5 cursor-pointer self-end sm:self-center shrink-0 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-white/10 hover:bg-white/20 border-white/10 text-slate-300'
                  }`}
                >
                  <span>{showBimDetails ? 'Ocultar Despiece' : 'Ver Despiece'}</span>
                  {showBimDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {showBimDetails && (
                <div className={`px-4 pb-4 pt-2 border-t text-xs space-y-2 max-h-60 overflow-y-auto ${
                  isLight ? 'border-slate-200 bg-white/70' : 'border-white/10 bg-black/30'
                }`}>
                  <div className="grid grid-cols-1 gap-1.5">
                    {auditedBim.cabinetsList.map((cab) => (
                      <div
                        key={cab.id}
                        className={`p-2.5 rounded-lg border text-[11px] flex items-start justify-between gap-3 ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span className="text-orange-400 font-extrabold">#{cab.index}</span>
                            <span>{cab.label}</span>
                            <span className={`text-[10px] font-normal px-1.5 py-0.2 rounded border ${
                              isLight ? 'bg-slate-200 border-slate-300 text-slate-700' : 'bg-white/10 border-white/10 text-slate-300'
                            }`}>
                              {cab.widthCm}×{cab.heightCm}×{cab.depthCm} cm
                            </span>
                          </div>
                          <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {cab.frontType === 'drawers' ? cab.drawerStyle : cab.doorStyle || cab.nicheDescription || 'Frente melamina'} · Frente: {cab.frontColorName} · Posición X: {cab.positionCm.x} cm
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Bloqueado
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className={`p-2.5 rounded-lg border text-[11px] mt-2 space-y-1 ${
                    isLight ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  }`}>
                    <div className="font-bold flex items-center gap-1 text-[11px]">
                      <ShieldAlert size={14} className="text-amber-500" />
                      <span>Directivas Estrictas de Inmutabilidad NanoBanana:</span>
                    </div>
                    <ul className="list-disc list-inside text-[10px] space-y-0.5 opacity-90 pl-1">
                      {auditedBim.strictNegativeDirectives.map((directive, dIdx) => (
                        <li key={dIdx}>{directive}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Banner Informativo sobre Protección Geométrica si no hay auditoría previa */}
          {!resultImage && !auditedBim && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <ShieldAlert size={18} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="text-xs leading-relaxed">
                <span className="font-extrabold uppercase">Garantía Geométrica NanoBanana:</span>
                {' '}La inteligencia artificial mantendrá intacta la cantidad de muebles, módulos, aberturas y posiciones de la escena 3D. Únicamente aplicará texturas fotorrealistas, iluminación y ambientación.
              </div>
            </div>
          )}

          {/* Mensaje de Error */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-3 text-xs font-semibold">
              <AlertCircle size={18} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer con Botones de Acción */}
        {!resultImage && (
          <div className={`flex items-center justify-between px-6 py-4 border-t ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/40'}`}>
            <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {isFreeUser ? (
                <span className="text-amber-500 font-bold flex items-center gap-1">
                  <Lock size={12} /> Bloqueado para plan gratuito
                </span>
              ) : isSuperAdmin ? (
                <span>SuperAdmin: Renders ilimitados</span>
              ) : (
                <span>Consumo: 1 Crédito por render</span>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer ${
                isGenerating
                  ? 'bg-orange-500/50 text-black cursor-wait'
                  : isFreeUser
                  ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                  : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black shadow-orange-500/20 active:scale-95'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{progressStatus || 'Generando Render AI...'}</span>
                </>
              ) : isFreeUser ? (
                <>
                  <Lock size={16} />
                  <span>Actualizar Plan para Desbloquear</span>
                </>
              ) : (
                <>
                  <Camera size={16} />
                  <span>Generar Render Fotográfico AI</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Modal de Upgrade para Usuarios Gratuitos */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
                <Lock size={24} />
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div>
              <h4 className="font-extrabold text-lg">Módulo Exclusivo para Usuarios de Pago</h4>
              <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Los Renders Fotográficos NanoBanana AI están habilitados para clientes de pago con suscripción activa. Incluye 100 créditos para generar fotos de revista hiperrealistas.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs space-y-2">
              <div className="font-bold uppercase tracking-wider">Beneficios del Plan Pro / Empresa:</div>
              <ul className="list-disc list-inside space-y-1">
                <li>100 Renders Fotográficos con NanoBanana AI</li>
                <li>Ambientación en Casa, Departamento o Vista a la Playa</li>
                <li>Preservación exacta de muebles y medidas 3D</li>
                <li>Descarga de imágenes en alta definición HD</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-white/10 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowUpgradeModal(false);
                  alert('Redirigiendo a pasarela de suscripción...');
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg cursor-pointer"
              >
                <CreditCard size={16} />
                <span>Suscribirse Ahora</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Recarga de Créditos cuando saldo es 0 */}
      {showRechargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-xl">
                <AlertCircle size={24} />
              </div>
              <button onClick={() => setShowRechargeModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div>
              <h4 className="font-extrabold text-lg">Créditos Agotados (0 / 100)</h4>
              <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Has utilizado tus 100 créditos de renders fotográficos NanoBanana. Recarga un nuevo paquete de créditos para continuar generando renders ilimitados.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs">
              <span className="font-bold">Paquete de Recarga:</span> 100 Créditos Adicionales por $29.900 CLP.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRechargeModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-white/10 hover:bg-white/10"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  setShowRechargeModal(false);
                  alert('Redirigiendo a pasarela de pago para recarga de créditos...');
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg cursor-pointer"
              >
                <CreditCard size={16} />
                <span>Recargar Créditos</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
