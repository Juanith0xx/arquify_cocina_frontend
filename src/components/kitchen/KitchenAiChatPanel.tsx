import React, { useState, useRef, useEffect } from 'react';
import {
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
  Mic,
  Square,
  Minimize2,
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
  AiUiAction,
  AiUiContext,
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
  uiContext?: AiUiContext;
  onExecuteUiActions?: (actions: AiUiAction[]) => Promise<{ applied: string[]; warnings: string[] }>;
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

const ETTORE_AVATAR_URL = '/assets/ettore-avatar.jpg';

const INITIAL_WELCOME_MESSAGE: ChatMessageItem = {
  id: 'welcome_ai_designer',
  role: 'assistant',
  text: '¡Hola! Soy Ettore, tu diseñador de cocinas IA. Sube un plano o croquis (prometo no juzgar el pulso) y lo cargo en tu área. Si tu espacio ya está listo, pulsa "OK" y cuéntame o muéstrame qué estilo tienes en mente.',
  timestamp: Date.now(),
};

export function KitchenAiChatPanel({
  isOpen,
  onClose,
  isLight = false,
  uiContext,
  onExecuteUiActions,
}: KitchenAiChatPanelProps) {
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
  const [isMinimized, setIsMinimized] = useState(false);

  // Estado de dictado / voz por micrófono
  const [isListening, setIsListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'speech' | 'recorder' | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [pendingAudioDataUrl, setPendingAudioDataUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const baseTextBeforeSpeechRef = useRef<string>('');

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsListening(false);
    setVoiceMode(null);
    setInterimTranscript('');
  };

  useEffect(() => {
    if (!isOpen) {
      stopVoiceCapture();
      setIsMinimized(false);
    }
    return () => {
      stopVoiceCapture();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isSending]);

  if (!isOpen) return null;

  const handleToggleMicrophone = async () => {
    if (isFreeUser || isSending) return;
    setErrorBanner(null);

    // Si ya está escuchando/grabando, detener
    if (isListening) {
      if (voiceMode === 'recorder' && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        return;
      }
      stopVoiceCapture();
      return;
    }

    const win = window as any;
    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

    // 1. Modo preferido: Web Speech API (transcripción en vivo en español)
    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = 'es-CL';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        baseTextBeforeSpeechRef.current = inputText.trim();
        let accumulatedFinal = '';

        recognition.onstart = () => {
          setIsListening(true);
          setVoiceMode('speech');
          setInterimTranscript('');
        };

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              accumulatedFinal += (accumulatedFinal ? ' ' : '') + chunk.trim();
            } else {
              interim += chunk;
            }
          }
          const combinedFinal = [baseTextBeforeSpeechRef.current, accumulatedFinal].filter(Boolean).join(' ').trim();
          setInputText(combinedFinal);
          setInterimTranscript(interim.trim());
        };

        recognition.onerror = (event: any) => {
          const code = event?.error;
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            setErrorBanner('Permiso de micrófono denegado. Habilita el micrófono en tu navegador para dictar instrucciones.');
          } else if (code === 'no-speech') {
            setErrorBanner('No se detectó voz. Intenta hablar más cerca del micrófono.');
          } else if (code === 'audio-capture') {
            setErrorBanner('No se encontró ningún micrófono disponible en tu equipo.');
          } else if (code !== 'aborted') {
            setErrorBanner('No se pudo completar el reconocimiento de voz. Intenta nuevamente.');
          }
          stopVoiceCapture();
        };

        recognition.onend = () => {
          setIsListening(false);
          setVoiceMode(null);
          setInterimTranscript('');
          recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch {
        stopVoiceCapture();
      }
    }

    // 2. Respaldo universal (ej. Firefox): grabar nota de voz con MediaRecorder para envío multimodal a Gemini
    if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
          }
          setIsListening(false);
          setVoiceMode(null);
          mediaRecorderRef.current = null;

          if (blob.size > 0) {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                setPendingAudioDataUrl(reader.result);
              }
            };
            reader.readAsDataURL(blob);
          }
        };

        recorder.start();
        setIsListening(true);
        setVoiceMode('recorder');
        return;
      } catch {
        stopVoiceCapture();
        setErrorBanner('No se pudo acceder al micrófono. Verifica los permisos del navegador.');
        return;
      }
    }

    setErrorBanner('Tu navegador no soporta entrada de voz por micrófono.');
  };

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
        text: '¡Excelente, plano aprobado! Ahora viene la parte entretenida: sube fotos de inspiración o cuéntame el estilo y colores que buscas, y lo aterrizo con módulos reales de catálogo.',
        timestamp: Date.now(),
      },
    ]);
  };

  const handleResetChat = () => {
    stopVoiceCapture();
    setMessages([INITIAL_WELCOME_MESSAGE]);
    setAttachments([]);
    setInputText('');
    setPendingAudioDataUrl(null);
    setPlanLoadedFromChat(false);
    setPlanConfirmed(false);
    setErrorBanner(null);
  };

  const sendMessage = async (overrideText?: string) => {
    if (isFreeUser || isSending) return;

    if (isListening) {
      stopVoiceCapture();
    }

    const combinedDictated = [inputText.trim(), interimTranscript.trim()].filter(Boolean).join(' ').trim();
    const textToSend = (overrideText !== undefined ? overrideText : combinedDictated).trim();
    const imagesToSend = [...attachments];
    const audioToSend = overrideText !== undefined ? null : pendingAudioDataUrl;

    if (!textToSend && imagesToSend.length === 0 && !audioToSend) return;

    // Detectar confirmación explícita del usuario por texto cuando está en etapa 2
    const lowerText = textToSend.toLowerCase();
    const looksLikeSimpleOk =
      !planConfirmed &&
      imagesToSend.length === 0 &&
      !audioToSend &&
      /^(ok|listo|aprobado|confirmado|confirmo|dale|esta bien|está bien|perfecto|si|sí)[.! ]*$/i.test(lowerText);

    if (looksLikeSimpleOk) {
      setInputText('');
      handleConfirmPlan();
      return;
    }

    setErrorBanner(null);
    setIsSending(true);
    setInputText('');
    setInterimTranscript('');
    setAttachments([]);
    setPendingAudioDataUrl(null);

    const userMsg: ChatMessageItem = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text:
        textToSend ||
        (audioToSend
          ? '🎤 Instrucción enviada por voz'
          : imagesToSend[0]?.label === 'plano'
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
          message: textToSend || (audioToSend ? '' : userMsg.text),
          images: imagesToSend.map((img) => ({ dataUrl: img.dataUrl, label: img.label })),
          ...(audioToSend ? { audioDataUrl: audioToSend } : {}),
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          planConfirmed,
          currentState,
          catalog,
          ...(uiContext ? { uiContext } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Error al comunicarse con Ettore.');
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

      if (Array.isArray(structured.uiActions) && structured.uiActions.length > 0 && onExecuteUiActions) {
        const uiResult = await onExecuteUiActions(structured.uiActions);
        if (report) {
          report = {
            ...report,
            appliedSummary: [...report.appliedSummary, ...uiResult.applied],
            warnings: [...report.warnings, ...uiResult.warnings],
          };
        } else if (uiResult.applied.length > 0 || uiResult.warnings.length > 0) {
          report = {
            success: uiResult.warnings.length === 0 || uiResult.applied.length > 0,
            appliedSummary: uiResult.applied,
            warnings: uiResult.warnings,
            adaptations: [],
            mepClashesCount: 0,
          };
        }
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

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[600] print:hidden flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full border shadow-2xl transition-all cursor-pointer ${
            isLight
              ? 'bg-white border-orange-300 text-slate-900 hover:bg-orange-50'
              : 'bg-zinc-950/95 border-orange-500/40 text-white hover:bg-zinc-900 backdrop-blur-xl'
          }`}
          title="Restaurar chat con Ettore"
        >
          <img
            src={ETTORE_AVATAR_URL}
            alt="Ettore"
            className="w-6 h-6 rounded-full object-cover border border-black/15 shrink-0"
          />
          <span className="text-xs font-extrabold tracking-tight">Ettore</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500 font-mono font-bold uppercase">
            PRO
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar chat con Ettore"
          className={`p-2 rounded-full border shadow-lg transition-colors cursor-pointer ${
            isLight
              ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
              : 'bg-zinc-950/95 border-white/15 text-slate-400 hover:text-white hover:bg-zinc-900'
          }`}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`fixed top-14 right-3 bottom-3 w-[410px] max-w-[calc(100vw-1.5rem)] z-[600] print:hidden rounded-2xl border shadow-2xl flex flex-col overflow-hidden transition-all ${
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
          <img
            src={ETTORE_AVATAR_URL}
            alt="Ettore"
            className="w-9 h-9 rounded-xl object-cover border border-black/15 shadow-sm shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-extrabold tracking-tight truncate">Ettore</h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500 font-mono font-bold uppercase">
                PRO
              </span>
            </div>
            <p className={`text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Diseñador IA · Planos y catálogo real
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
            onClick={() => setIsMinimized(true)}
            title="Minimizar chat de Ettore"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Minimize2 size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar chat con Ettore"
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
                Ettore, tu Diseñador de Cocinas IA, está habilitado únicamente para clientes con suscripción activa, al igual que los Renders Fotográficos NanoBanana AI.
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
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'flex-col items-end' : 'items-end gap-2'}`}
                >
                  {!isUser && (
                    <img
                      src={ETTORE_AVATAR_URL}
                      alt="Ettore"
                      className="w-6 h-6 rounded-full object-cover border border-black/15 shrink-0 mb-0.5"
                    />
                  )}
                  <div
                    className={`${isUser ? 'max-w-[92%]' : 'max-w-[86%]'} rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
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
              <div className="flex items-end gap-2">
                <img
                  src={ETTORE_AVATAR_URL}
                  alt="Ettore"
                  className="w-6 h-6 rounded-full object-cover border border-black/15 shrink-0 mb-0.5"
                />
                <div
                  className={`rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs border flex items-center gap-2 ${
                    isLight
                      ? 'bg-slate-100 border-slate-200 text-slate-600'
                      : 'bg-white/[0.06] border-white/10 text-slate-300'
                  }`}
                >
                  <Loader2 size={14} className="animate-spin text-orange-500" />
                  <span>Ettore está revisando medidas y catálogo...</span>
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

          {/* Indicador de escucha activa / nota de voz lista */}
          {isListening && (
            <div className="mx-3 mb-2 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[11px] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span className="font-semibold truncate">
                  {voiceMode === 'recorder'
                    ? 'Grabando nota de voz... pulsa detener al terminar'
                    : interimTranscript
                    ? `Escuchando: "${interimTranscript}"`
                    : 'Escuchando... dicta tu cambio o diseño en español'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleMicrophone}
                className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-bold uppercase cursor-pointer shrink-0 hover:bg-rose-600"
              >
                Detener
              </button>
            </div>
          )}

          {!isListening && pendingAudioDataUrl && (
            <div
              className={`mx-3 mb-2 px-3 py-1.5 rounded-xl border text-[11px] flex items-center justify-between gap-2 shrink-0 ${
                isLight
                  ? 'bg-orange-50 border-orange-200 text-orange-900'
                  : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <Mic size={13} className="text-orange-500" />
                <span>Instrucción de voz grabada y lista para enviar</span>
              </div>
              <button
                type="button"
                onClick={() => setPendingAudioDataUrl(null)}
                className="p-0.5 rounded hover:bg-black/10 cursor-pointer"
                title="Descartar nota de voz"
              >
                <Trash2 size={12} />
              </button>
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

            <div className="flex items-end gap-1.5">
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

              <button
                type="button"
                onClick={handleToggleMicrophone}
                disabled={isSending}
                title={
                  isListening
                    ? 'Detener dictado por voz'
                    : 'Dictar instrucciones de diseño o modificaciones con el micrófono'
                }
                aria-label={isListening ? 'Detener micrófono' : 'Usar micrófono'}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                  isListening
                    ? 'bg-rose-500 hover:bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-500/30 animate-pulse'
                    : isLight
                    ? 'bg-slate-100 hover:bg-orange-50 border-slate-300 text-slate-700 hover:text-orange-600'
                    : 'bg-white/5 hover:bg-orange-500/15 border-white/10 text-slate-300 hover:text-orange-400'
                }`}
              >
                {isListening ? <Square size={16} className="fill-current" /> : <Mic size={17} />}
              </button>

              <textarea
                rows={2}
                value={interimTranscript ? `${inputText}${inputText ? ' ' : ''}${interimTranscript}` : inputText}
                onChange={(e) => {
                  setInterimTranscript('');
                  setInputText(e.target.value);
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  isListening
                    ? 'Habla ahora para dictar tu instrucción...'
                    : !planConfirmed
                    ? 'Sube tu plano, escribe o dicta medidas y conexiones...'
                    : 'Escribe, dicta con el micrófono o sube inspiración...'
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
                disabled={isSending || (!inputText.trim() && !interimTranscript.trim() && attachments.length === 0 && !pendingAudioDataUrl)}
                className={`p-2.5 rounded-xl font-bold transition-all shrink-0 ${
                  isSending || (!inputText.trim() && !interimTranscript.trim() && attachments.length === 0 && !pendingAudioDataUrl)
                    ? 'bg-orange-500/30 text-black/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black shadow-md cursor-pointer active:scale-95'
                }`}
                title="Enviar a Ettore"
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
