import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  ImagePlus,
  CheckCircle2,
  Maximize2,
  Undo2,
  Loader2,
  Lock,
  CreditCard,
  AlertTriangle,
  Info,
  Trash2,
  RotateCcw,
  Check,
  Wand2,
} from 'lucide-react';
import { useKitchenStore } from '../../store/kitchenStore';
import { useAdminStore } from '../../store/adminStore';
import { useSupabaseAuthStore } from '../../store/supabaseAuthStore';
import {
  buildAiCatalogSnapshot,
  buildCurrentKitchenStateSummary,
} from '../../utils/kitchenAiCatalog';
import {
  AiAgentStructuredResponse,
  AiExecutionReport,
  executeFloorPlanAction,
  executeFullDesignAction,
  executePatchDesignAction,
} from '../../utils/kitchenAiExecutor';

interface ChatAttachment {
  id: string;
  dataUrl: string;
  name: string;
  label: 'plano' | 'inspiracion';
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  images?: ChatAttachment[];
  actionType?: AiAgentStructuredResponse['actionType'];
  report?: AiExecutionReport;
  timestamp: number;
}

interface KitchenAiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isLight?: boolean;
}

async function compressImageToDataUrl(file: File, maxDim = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no soportado.'));
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const INITIAL_WELCOME_MESSAGE: ChatMessageItem = {
  id: 'welcome_ai_designer',
  role: 'assistant',
  text: 'Hola, soy tu Diseñador de Cocinas IA. Sube una foto o croquis a mano del plano de tu cocina (con medidas, puertas, ventanas o conexiones) y lo cargaré en el Configurador de Área para que lo valides. Si ya configuraste tu espacio en pantalla, presiona "Confirmar área actual (OK)" y sube una foto de inspiración o descríbeme el estilo que buscas.',
  timestamp: Date.now(),
};

export function KitchenAiChatPanel({ isOpen, onClose, isLight = false }: KitchenAiChatPanelProps) {
  const { currentUser } = useAdminStore();
  const supabaseUser = useSupabaseAuthStore((state) => state.user);

  const effectiveRole = currentUser?.role || supabaseUser?.role || 'designer';
  const isFreeUser = effectiveRole === 'free_user';

  const setRoomPlannerOpen = useKitchenStore((s) => s.setRoomPlannerOpen);
  const setViewMode = useKitchenStore((s) => s.setViewMode);
  const undo = useKitchenStore((s) => s.undo);
  const canUndo = useKitchenStore((s) => s.canUndo);
  const cabinetsCount = useKitchenStore((s) => s.cabinets.length);

  const [messages, setMessages] = useState<ChatMessageItem[]>([INITIAL_WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [planLoadedFromChat, setPlanLoadedFromChat] = useState(false);
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isSending]);

  if (!isOpen) return null;

  const currentStage: 1 | 2 | 3 = planConfirmed ? 3 : planLoadedFromChat ? 2 : 1;

  const handleFilesSelected = async (files: FileList | File[]) => {
    if (isFreeUser) return;
    setErrorBanner(null);
    const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 4 - attachments.length);
    if (list.length === 0) return;

    const defaultLabel: 'plano' | 'inspiracion' = planConfirmed ? 'inspiracion' : 'plano';
    const loaded: ChatAttachment[] = [];

    for (const file of list) {
      try {
        const dataUrl = await compressImageToDataUrl(file, 1280);
        loaded.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          dataUrl,
          name: file.name || 'imagen.jpg',
          label: defaultLabel,
        });
      } catch (err: any) {
        setErrorBanner(err?.message || 'Error al procesar una de las imágenes.');
      }
    }

    if (loaded.length > 0) {
      setAttachments((prev) => [...prev, ...loaded].slice(0, 4));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (isFreeUser) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFilesSelected(files);
    }
  };

  const handleConfirmPlan = () => {
    setPlanConfirmed(true);
    setViewMode('3d');
    setMessages((prev) => [
      ...prev,
      {
        id: `usr_ok_${Date.now()}`,
        role: 'user',
        text: 'OK, confirmo el plano y las medidas actuales del espacio.',
        timestamp: Date.now(),
      },
      {
        id: `ast_ok_${Date.now() + 1}`,
        role: 'assistant',
        text: 'Perfecto, plano validado. Ahora puedes subir una o varias fotos de cocinas de inspiración o describirme el estilo, distribución y colores que buscas. Adaptaré la propuesta estrictamente a nuestros módulos y acabados de catálogo.',
        timestamp: Date.now(),
      },
    ]);
  };

  const handleResetChat = () => {
    setMessages([INITIAL_WELCOME_MESSAGE]);
    setAttachments([]);
    setInputText('');
    setPlanLoadedFromChat(false);
    setPlanConfirmed(false);
    setErrorBanner(null);
  };

  const sendMessage = async (overrideText?: string) => {
    if (isFreeUser || isSending) return;

    const textToSend = (overrideText !== undefined ? overrideText : inputText).trim();
    const imagesToSend = [...attachments];

    if (!textToSend && imagesToSend.length === 0) return;

    // Detectar confirmación explícita del usuario por texto cuando está en etapa 2
    const lowerText = textToSend.toLowerCase();
    const looksLikeSimpleOk =
      !planConfirmed &&
      imagesToSend.length === 0 &&
      /^(ok|listo|aprobado|confirmado|confirmo|dale|esta bien|está bien|perfecto|si|sí)[.! ]*$/i.test(lowerText);

    if (looksLikeSimpleOk) {
      setInputText('');
      handleConfirmPlan();
      return;
    }

    setErrorBanner(null);
    setIsSending(true);
    setInputText('');
    setAttachments([]);

    const userMsg: ChatMessageItem = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text:
        textToSend ||
        (imagesToSend[0]?.label === 'plano'
          ? 'Te adjunto el plano de mi cocina para cargarlo al configurador.'
          : 'Te adjunto imagen de inspiración para diseñar mi cocina.'),
      images: imagesToSend.length > 0 ? imagesToSend : undefined,
      timestamp: Date.now(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);

    try {
      const currentState = buildCurrentKitchenStateSummary();
      const catalog = buildAiCatalogSnapshot();

      const res = await fetch('/api/kitchen-ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userRole: effectiveRole,
          message: userMsg.text,
          images: imagesToSend.map((img) => ({ dataUrl: img.dataUrl, label: img.label })),
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          planConfirmed,
          currentState,
          catalog,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Error al comunicarse con el Diseñador IA.');
      }

      const structured = data as AiAgentStructuredResponse;
      let report: AiExecutionReport | undefined;

      if (structured.actionType === 'apply_floor_plan' && structured.floorPlan) {
        report = executeFloorPlanAction(structured.floorPlan);
        setPlanLoadedFromChat(true);
        setPlanConfirmed(false);
        setViewMode('2d');
      } else if (structured.actionType === 'apply_full_design' && structured.fullDesign) {
        report = executeFullDesignAction(structured.fullDesign);
        setPlanConfirmed(true);
        setViewMode('3d');
      } else if (structured.actionType === 'patch_design' && structured.patchDesign) {
        report = executePatchDesignAction(structured.patchDesign);
        setPlanConfirmed(true);
      }

      // Combinar adaptaciones declaradas por la IA + adaptaciones detectadas por el ejecutor determinista
      const mergedAdaptations = Array.from(
        new Set([...(structured.catalogAdaptations || []), ...(report?.adaptations || [])])
      ).filter(Boolean);

      if (report) {
        report = { ...report, adaptations: mergedAdaptations };
      } else if (mergedAdaptations.length > 0) {
        report = {
          success: true,
          appliedSummary: [],
          warnings: [],
          adaptations: mergedAdaptations,
          mepClashesCount: 0,
        };
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ast_${Date.now()}`,
          role: 'assistant',
          text: structured.reply || 'Cambios aplicados en el configurador.',
          actionType: structured.actionType,
          report,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      setErrorBanner(err?.message || 'No se pudo procesar tu solicitud.');
    } finally {
      setIsSending(false);
    }
  };

  const quickSuggestions = !planConfirmed
    ? [
        'Cocina rectangular de 360 × 280 cm, puerta en muro D y ventana en muro A',
        'Cocina en L con ventana sobre muro A y conexiones de agua ahí',
      ]
    : cabinetsCount === 0
    ? [
        'Diseña una cocina moderna minimalista blanca con detalles madera y cubierta cuarzo',
        'Cocina nórdica bicolor con isla central, sin tiradores (perfil gola negro)',
      ]
    : [
        'Cambia la cubierta a Cuarzo Calacatta Gold',
        'Cambia los tiradores a sistema Gola Negro sin tirador',
        'Cambia los frentes a un tono madera cálido de catálogo',
      ];

  return (
    <aside
      className={`fixed top-14 right-3 bottom-3 w-[410px] max-w-[calc(100vw-1.5rem)] z-40 rounded-2xl border shadow-2xl flex flex-col overflow-hidden transition-all ${
        isLight
          ? 'bg-white/98 border-slate-200 text-slate-900'
          : 'bg-zinc-950/96 border-white/15 text-slate-100 backdrop-blur-xl'
      }`}
      onDragOver={(e) => {
        if (isFreeUser) return;
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (isFreeUser) return;
        if (e.dataTransfer?.files?.length) {
          handleFilesSelected(e.dataTransfer.files);
        }
      }}
    >
      {/* Cabecera */}
      <div
        className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/60 border-white/10'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-black shadow-sm shrink-0">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold tracking-tight truncate">Diseñador IA</h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500 font-mono font-bold uppercase">
                PRO
              </span>
            </div>
            <p className={`text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Planos, inspiración y modulación real de catálogo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isFreeUser && (
            <>
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo()}
                title="Deshacer último cambio en el configurador (Ctrl+Z)"
                className={`p-1.5 rounded-lg border transition-colors ${
                  canUndo()
                    ? isLight
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer'
                      : 'border-white/10 text-slate-300 hover:bg-white/10 cursor-pointer'
                    : 'opacity-30 border-transparent cursor-not-allowed'
                }`}
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                onClick={handleResetChat}
                title="Nueva conversación"
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isLight
                    ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <RotateCcw size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Cerrar Diseñador IA"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* BLOQUEO PARA USUARIOS GRATUITOS (Idéntico a NanoBanana AI) */}
      {isFreeUser ? (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-center gap-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="p-4 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/30">
              <Lock size={30} />
            </div>
            <div>
              <h4 className="font-extrabold text-base">Módulo Exclusivo para Usuarios de Pago</h4>
              <p className={`text-xs mt-1.5 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                El Agente de Diseño de Cocinas con Inteligencia Artificial está habilitado únicamente para clientes con suscripción activa, al igual que los Renders Fotográficos NanoBanana AI.
              </p>
            </div>
          </div>

          <div
            className={`p-4 rounded-xl border text-xs space-y-2 ${
              isLight
                ? 'bg-orange-50 border-orange-200 text-orange-950'
                : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
            }`}
          >
            <div className="font-bold uppercase tracking-wider text-[11px] text-orange-500">
              Qué desbloqueas con el Plan Pro / Empresa:
            </div>
            <ul className="list-disc list-inside space-y-1.5 leading-relaxed">
              <li>Interpretación automática de fotos y planos a mano al Configurador de Área</li>
              <li>Diseño completo de cocinas a partir de fotos de inspiración</li>
              <li>Modulación 100% ajustada a tu catálogo real, medidas y reglas técnicas</li>
              <li>Edición conversacional en vivo combinada con ajuste manual 3D/2D</li>
              <li>Acceso conjunto a Renders Fotográficos NanoBanana AI</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => alert('Redirigiendo a pasarela de suscripción...')}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg cursor-pointer transition-all"
            >
              <CreditCard size={16} />
              <span>Suscribirse para Desbloquear</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`w-full py-2 text-xs font-bold rounded-xl border cursor-pointer transition-colors ${
                isLight
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Indicador de Etapas del Flujo */}
          <div
            className={`px-3 py-2 border-b flex items-center justify-between gap-1 text-[10px] font-bold shrink-0 ${
              isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-white/[0.03] border-white/10'
            }`}
          >
            {[
              { step: 1, label: '1. Plano' },
              { step: 2, label: '2. Validación' },
              { step: 3, label: '3. Diseño IA' },
            ].map((item) => {
              const isDone = currentStage > item.step;
              const isActive = currentStage === item.step;
              return (
                <div
                  key={item.step}
                  className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-500'
                      : isDone
                      ? isLight
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : isLight
                      ? 'bg-white border-slate-200 text-slate-400'
                      : 'bg-black/30 border-white/5 text-slate-500'
                  }`}
                >
                  {isDone && <Check size={11} />}
                  <span className="truncate">{item.label}</span>
                </div>
              );
            })}
          </div>

          {/* Barra contextual de validación de plano cuando aún no está confirmado */}
          {!planConfirmed && (
            <div
              className={`px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
                isLight
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              }`}
            >
              <span className="text-[11px] leading-tight">
                {planLoadedFromChat
                  ? 'Revisa el plano en pantalla y confirma para diseñar.'
                  : '¿Tu área actual ya está lista?'}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setRoomPlannerOpen(true)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-white border-amber-300 text-amber-900 hover:bg-amber-100'
                      : 'bg-black/40 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                  }`}
                  title="Ajustar muros y cotas manualmente"
                >
                  <Maximize2 size={11} />
                  <span>Área</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPlan}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                >
                  <CheckCircle2 size={11} />
                  <span>OK</span>
                </button>
              </div>
            </div>
          )}

          {/* Lista de Mensajes */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 relative">
            {isDraggingFile && (
              <div className="absolute inset-2 z-20 rounded-xl border-2 border-dashed border-orange-500 bg-orange-500/15 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none">
                <ImagePlus size={28} className="text-orange-500" />
                <span className="text-xs font-extrabold text-orange-500">
                  Suelta aquí tu plano o foto de inspiración
                </span>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                      isUser
                        ? 'bg-orange-500 text-black font-medium rounded-br-sm'
                        : isLight
                        ? 'bg-slate-100 border border-slate-200 text-slate-800 rounded-bl-sm'
                        : 'bg-white/[0.06] border border-white/10 text-slate-200 rounded-bl-sm'
                    }`}
                  >
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.images.map((img) => (
                          <div key={img.id} className="relative rounded-lg overflow-hidden border border-black/20">
                            <img src={img.dataUrl} alt={img.name} className="w-24 h-20 object-cover" />
                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-bold uppercase">
                              {img.label === 'plano' ? 'Plano' : 'Inspiración'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {/* Resumen de ejecución real en el configurador */}
                    {msg.report && (
                      <div className="mt-2.5 space-y-1.5">
                        {msg.report.appliedSummary.length > 0 && (
                          <div
                            className={`p-2 rounded-xl border text-[11px] space-y-1 ${
                              isLight
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            }`}
                          >
                            <div className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider">
                              <CheckCircle2 size={12} />
                              <span>Aplicado en el configurador</span>
                            </div>
                            <ul className="space-y-0.5">
                              {msg.report.appliedSummary.map((line, i) => (
                                <li key={i}>• {line}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {msg.report.adaptations.length > 0 && (
                          <div
                            className={`p-2 rounded-xl border text-[11px] space-y-1 ${
                              isLight
                                ? 'bg-sky-50 border-sky-200 text-sky-900'
                                : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                            }`}
                          >
                            <div className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider">
                              <Info size={12} />
                              <span>Adaptaciones al catálogo real</span>
                            </div>
                            <ul className="space-y-0.5">
                              {msg.report.adaptations.map((line, i) => (
                                <li key={i}>• {line}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {msg.report.warnings.length > 0 && (
                          <div
                            className={`p-2 rounded-xl border text-[11px] space-y-1 ${
                              isLight
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            }`}
                          >
                            <div className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider">
                              <AlertTriangle size={12} />
                              <span>Restricciones técnicas respetadas</span>
                            </div>
                            <ul className="space-y-0.5">
                              {msg.report.warnings.map((line, i) => (
                                <li key={i}>• {line}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Botones rápidos tras cargar un plano */}
                    {msg.actionType === 'apply_floor_plan' && !planConfirmed && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={handleConfirmPlan}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 size={13} />
                          <span>Confirmar plano (OK)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoomPlannerOpen(true)}
                          className={`px-2.5 py-1.5 rounded-lg border font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors ${
                            isLight
                              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              : 'bg-black/40 border-white/15 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          <Maximize2 size={13} />
                          <span>Configurador de Área</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-start">
                <div
                  className={`rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs border flex items-center gap-2 ${
                    isLight
                      ? 'bg-slate-100 border-slate-200 text-slate-600'
                      : 'bg-white/[0.06] border-white/10 text-slate-300'
                  }`}
                >
                  <Loader2 size={14} className="animate-spin text-orange-500" />
                  <span>Analizando medidas, reglas y catálogo...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Sugerencias rápidas */}
          {!isSending && messages.length <= 4 && (
            <div
              className={`px-3 py-2 border-t flex gap-1.5 overflow-x-auto no-scrollbar shrink-0 ${
                isLight ? 'border-slate-200 bg-slate-50/70' : 'border-white/10 bg-black/30'
              }`}
            >
              {quickSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => sendMessage(sug)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer flex items-center gap-1 ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:border-orange-400 hover:text-orange-600'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-orange-500/50 hover:text-orange-400'
                  }`}
                >
                  <Wand2 size={10} className="text-orange-500" />
                  <span className="max-w-[220px] truncate">{sug}</span>
                </button>
              ))}
            </div>
          )}

          {/* Banner de error */}
          {errorBanner && (
            <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] flex items-center justify-between gap-2 shrink-0">
              <span>{errorBanner}</span>
              <button type="button" onClick={() => setErrorBanner(null)} className="cursor-pointer">
                <X size={13} />
              </button>
            </div>
          )}

          {/* Previsualización de imágenes adjuntas */}
          {attachments.length > 0 && (
            <div
              className={`px-3 pt-2 pb-1 border-t flex flex-wrap gap-2 shrink-0 ${
                isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/40'
              }`}
            >
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className={`relative rounded-xl overflow-hidden border group ${
                    isLight ? 'border-slate-300' : 'border-white/20'
                  }`}
                >
                  <img src={att.dataUrl} alt={att.name} className="w-16 h-16 object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) =>
                        prev.map((a) =>
                          a.id === att.id
                            ? { ...a, label: a.label === 'plano' ? 'inspiracion' : 'plano' }
                            : a
                        )
                      )
                    }
                    title="Click para alternar entre Plano e Inspiración"
                    className="absolute bottom-0 inset-x-0 bg-black/80 text-white text-[9px] font-bold uppercase py-0.5 text-center cursor-pointer hover:bg-orange-500 hover:text-black transition-colors"
                  >
                    {att.label === 'plano' ? 'Plano' : 'Insp.'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/75 text-white hover:bg-red-500 cursor-pointer"
                    title="Quitar imagen"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Barra de Entrada */}
          <div
            className={`p-3 border-t shrink-0 ${
              isLight ? 'bg-white border-slate-200' : 'bg-black/60 border-white/10'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleFilesSelected(e.target.files);
                }
                e.target.value = '';
              }}
            />

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || attachments.length >= 4}
                title={
                  planConfirmed
                    ? 'Subir foto de cocina de inspiración'
                    : 'Subir foto o dibujo del plano de tu cocina'
                }
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                  isLight
                    ? 'bg-slate-100 hover:bg-orange-50 border-slate-300 text-slate-700 hover:text-orange-600'
                    : 'bg-white/5 hover:bg-orange-500/15 border-white/10 text-slate-300 hover:text-orange-400'
                }`}
              >
                <ImagePlus size={17} />
              </button>

              <textarea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  !planConfirmed
                    ? 'Sube tu plano o describe medidas, puertas y conexiones...'
                    : 'Sube una foto de inspiración o pide cambios (colores, isla, cubierta)...'
                }
                className={`flex-1 resize-none rounded-xl border px-3 py-2 text-xs focus:outline-none focus:border-orange-500 transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-white/5 border-white/10 text-white placeholder:text-slate-500'
                }`}
              />

              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={isSending || (!inputText.trim() && attachments.length === 0)}
                className={`p-2.5 rounded-xl font-bold transition-all shrink-0 ${
                  isSending || (!inputText.trim() && attachments.length === 0)
                    ? 'bg-orange-500/30 text-black/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black shadow-md cursor-pointer active:scale-95'
                }`}
                title="Enviar al Diseñador IA"
              >
                {isSending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
