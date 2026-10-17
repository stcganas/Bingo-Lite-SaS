import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Volume2, Download, Save, Radio, Play, Pause, Trash2, Edit3, 
  Sparkles, Check, Loader2, X, Plus, Search, RefreshCw, VolumeX, ArrowRight, Music
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { playBase64PCM, downloadBase64Audio, playSynthesizedDJEffect, getGlobalFxVolume, getAudioContext } from '../utils/sound';
import { speakNativeText } from '../utils/speech';

export interface AIPreset {
  id: string;
  title: string;
  text: string;
  voice?: string;
  audio_base64?: string | null;
  created_at?: string;
}

export const AI_VOICES = [
  // VOCES FEMENINAS
  { id: 'Kore', label: 'Kore', gender: 'Femenina', accent: 'Neutro / Latino', style: 'Locutora Institucional (Formal, clara, neutra y profesional) 👩‍💼', color: 'border-blue-500 bg-blue-50/60 text-blue-900' },
  { id: 'Aoede', label: 'Aoede', gender: 'Femenina', accent: 'Caribeño / Expresivo', style: 'Animadora de Fiesta (Cálida, alegre, eufórica y entusiasta) 🌸', color: 'border-pink-500 bg-pink-50/60 text-pink-900' },
  { id: 'Leda', label: 'Leda', gender: 'Femenina', accent: 'Elegante / VIP', style: 'Presentadora Premium (Sofisticada, moderna, suave y envolvente) 💃', color: 'border-purple-500 bg-purple-50/60 text-purple-900' },

  // VOCES MASCULINAS
  { id: 'Puck', label: 'Puck', gender: 'Masculina', accent: 'DJ Urbano / Dinámico', style: 'DJ de Impacto (Hiperdinámica, rápida, eufórica y apasionada) ⚡', color: 'border-amber-500 bg-amber-50/60 text-amber-900' },
  { id: 'Charon', label: 'Charon', gender: 'Masculina', accent: 'Locutor FM Clásico', style: 'Voz Radio FM (Grave, profunda, pausada, elegante y serena) 🎙️', color: 'border-indigo-500 bg-indigo-50/60 text-indigo-900' },
  { id: 'Fenrir', label: 'Fenrir', gender: 'Masculina', accent: 'Narrador Épico', style: 'Voz de Estadio (Potente, masculina, firme y con gran autoridad) 🦁', color: 'border-red-500 bg-red-50/60 text-red-900' },

  // VOCES BONUS
  { id: 'Orpheus', label: 'Orpheus', gender: 'Masculina', accent: 'Cálido / Narrativo', style: 'Narrador Expresivo (Cálida, amigable, cercana y expresiva) 📖', color: 'border-teal-500 bg-teal-50/60 text-teal-900' },
  { id: 'Zephyr', label: 'Zephyr', gender: 'Masculina', accent: 'Jovial / Espontáneo', style: 'Animador Carismático (Fresca, jovial, amigable y simpática) 🗣️', color: 'border-emerald-500 bg-emerald-50/60 text-emerald-900' }
];

export const QUICK_TEMPLATES = [
  {
    title: '🎰 Inicio de Partida',
    voice: 'Puck',
    text: '¡Bienvenidos a Bingo Lite! Por favor preparen sus cartones que el sorteo está a punto de comenzar. ¡Mucha suerte a todos!'
  },
  {
    title: '🏆 Ganador de Bingo',
    voice: 'Aoede',
    text: '¡Atención a todos los jugadores! Tenemos un afortunado ganador en la sala. ¡Felicitaciones por cantar Bingo!'
  },
  {
    title: '🔥 Última Balota',
    voice: 'Fenrir',
    text: '¡Mucha atención! Estamos a una sola balota de premiar la partida. Revisen muy bien sus cartones.'
  },
  {
    title: '💳 Recargas y Premios',
    voice: 'Kore',
    text: 'Recuerda que puedes recargar tu saldo o solicitar el retiro de tus premios desde tu billetera oficial.'
  },
  {
    title: '⏸️ Pausa de Descanso',
    voice: 'Charon',
    text: 'Haremos una breve pausa de dos minutos antes de la siguiente ronda. No te despegues de tu pantalla.'
  }
];

interface AIVoiceStudioProps {
  onClose?: () => void;
  isModal?: boolean;
}

export default function AIVoiceStudio({ onClose, isModal = false }: AIVoiceStudioProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'library'>('create');
  
  // Creation States
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [title, setTitle] = useState('');
  const [generatedAudioBase64, setGeneratedAudioBase64] = useState<string | null>(null);
  
  // Loading & Playback States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Database Presets Library
  const [presets, setPresets] = useState<AIPreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);

  // Load Presets from DB
  const fetchPresets = async () => {
    try {
      setIsLoadingPresets(true);
      const res = await apiFetch('/api/ai-presets');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setPresets(data);
        }
      }
    } catch (err) {
      console.error('Error fetching AI presets:', err);
    } finally {
      setIsLoadingPresets(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  // Generate Audio via Gemini / Server TTS
  const handleGenerateAudio = async () => {
    if (!text.trim()) {
      toast.error('Escribe el texto que deseas convertir en voz');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await apiFetch('/api/admin/generate-ai-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice: selectedVoice
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audio_base64) {
          setGeneratedAudioBase64(data.audio_base64);
          toast.success('¡Audio de voz IA generado con éxito!', { icon: '✨' });
          // Auto play preview locally
          playBase64PCM(data.audio_base64, 24000, getGlobalFxVolume());
          setPlayingAudioId('preview-current');
          setTimeout(() => setPlayingAudioId(null), 3000);
        } else {
          toast.error('No se recibió el archivo de audio del servidor.');
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al generar voz');
      }
    } catch (err) {
      console.error('Error generating AI voice:', err);
      toast.error('Error de conexión al generar audio.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save Generated Audio to Database
  const handleSaveToDatabase = async () => {
    if (!text.trim()) {
      toast.error('El texto no puede estar vacío');
      return;
    }

    const finalTitle = title.trim() || `Voz ${selectedVoice} - ${text.substring(0, 24)}...`;
    setIsSaving(true);

    try {
      const res = await apiFetch('/api/ai-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalTitle,
          title: finalTitle,
          text: text.trim(),
          voice: selectedVoice,
          audio_base64: generatedAudioBase64 || ''
        })
      });

      if (res.ok) {
        const savedItem = await res.json();
        setPresets(prev => [savedItem, ...prev.filter(p => p.id !== savedItem.id)]);
        toast.success('¡Audio guardado en la base de datos!', { icon: '💾' });
        setTitle('');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al guardar en base de datos');
      }
    } catch (err) {
      console.error('Error saving AI preset:', err);
      toast.error('Error de red al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  // Broadcast Announcement in Live Game to Players
  const handleBroadcastLive = async (audioText: string, voiceName: string, audioBase64?: string | null) => {
    if (!audioText.trim()) return;

    setIsBroadcasting(true);
    try {
      const res = await apiFetch('/api/admin/broadcast-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: audioText.trim(),
          voice: voiceName || selectedVoice,
          audio_base64: audioBase64 || generatedAudioBase64 || null
        })
      });

      if (res.ok) {
        toast.success('¡Anuncio emitido en vivo a todos los jugadores!', { icon: '📢' });
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al emitir anuncio en vivo');
      }
    } catch (err) {
      console.error('Error broadcasting announcement:', err);
      toast.error('Error de conexión al emitir.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Play audio locally
  const handlePlayLocally = async (id: string, base64Audio?: string | null, fallbackText?: string, voiceName?: string) => {
    // Immediately unlock WebAudio context synchronously in user gesture
    try {
      const audioCtx = getAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (e) {}

    if (playingAudioId === id) {
      setPlayingAudioId(null);
      return;
    }

    setPlayingAudioId(id);

    const playVolume = Math.max(0.8, getGlobalFxVolume());

    if (base64Audio && base64Audio.trim().length > 20) {
      const success = await playBase64PCM(base64Audio, 24000, playVolume);
      if (!success && fallbackText) {
        toast('Reproduciendo audio...', { icon: '🔊' });
        speakNativeText(fallbackText);
      }
    } else if (fallbackText) {
      // Generate audio on the fly if not cached or fallback to speech
      try {
        const targetVoice = voiceName || selectedVoice || 'Kore';
        const res = await apiFetch('/api/admin/generate-ai-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fallbackText, voice: targetVoice })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.audio_base64) {
            const ok = await playBase64PCM(data.audio_base64, 24000, playVolume);
            if (!ok) speakNativeText(fallbackText);
          } else {
            speakNativeText(fallbackText);
          }
        } else {
          speakNativeText(fallbackText);
        }
      } catch {
        speakNativeText(fallbackText);
      }
    } else {
      toast.error('No hay audio ni texto disponible para reproducir.');
    }

    setTimeout(() => {
      setPlayingAudioId(prev => (prev === id ? null : prev));
    }, 4500);
  };

  // Download audio to disk
  const handleDownload = (base64Audio: string | null | undefined, customFilename: string) => {
    if (!base64Audio) {
      toast.error('Primero genera el audio antes de descargarlo');
      return;
    }

    const cleanFilename = (customFilename || 'audio_voz_ia')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_') + '.wav';

    downloadBase64Audio(base64Audio, cleanFilename);
    toast.success(`Descargando "${cleanFilename}"`, { icon: '⬇️' });
  };

  // Delete preset from database
  const handleDeletePreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Estás seguro de eliminar este audio de la base de datos?')) return;

    try {
      const res = await apiFetch(`/api/ai-presets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPresets(prev => prev.filter(p => String(p.id) !== String(id)));
        toast.success('Audio eliminado de la base de datos');
      } else {
        toast.error('Error al eliminar');
      }
    } catch {
      toast.error('Error de red al eliminar');
    }
  };

  // Apply a template
  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setText(tpl.text);
    setSelectedVoice(tpl.voice);
    setTitle(tpl.title);
    setGeneratedAudioBase64(null);
    toast(`Plantilla "${tpl.title}" cargada`, { icon: '📝' });
  };

  return (
    <div className={clsx(
      "bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col w-full",
      isModal ? "max-w-4xl max-h-[90vh]" : "max-w-5xl mx-auto my-4"
    )}>
      {/* Top Header */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-700 via-indigo-700 to-pink-600 text-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-inner">
            <Bot size={24} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight flex items-center gap-2">
              Creador y Estudio de Voz con IA
            </h2>
            <p className="text-xs text-purple-100 font-medium">
              Crea audios ultra realistas con inteligencia artificial, descárgalos y transmítelos en vivo.
            </p>
          </div>
        </div>

        {isModal && onClose && (
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition text-white cursor-pointer"
          >
            <X size={22} />
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between px-6 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('create')}
            className={clsx(
              "py-3.5 px-4 font-black text-xs sm:text-sm border-b-2 transition flex items-center gap-2 cursor-pointer",
              activeTab === 'create'
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Sparkles size={16} />
            <span>Generador de Audio IA</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('library');
              fetchPresets();
            }}
            className={clsx(
              "py-3.5 px-4 font-black text-xs sm:text-sm border-b-2 transition flex items-center gap-2 cursor-pointer",
              activeTab === 'library'
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Save size={16} />
            <span>Biblioteca Guardada ({presets.length})</span>
          </button>
        </div>

        <button
          onClick={fetchPresets}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition"
          title="Actualizar biblioteca"
        >
          <RefreshCw size={14} className={isLoadingPresets ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
        {activeTab === 'create' ? (
          <div className="space-y-6">
            {/* Quick Templates Bar */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                Plantillas Rápidas (1 Clic)
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200">
                {QUICK_TEMPLATES.map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-purple-100 hover:text-purple-800 text-slate-700 text-xs font-bold transition border border-slate-200/80 hover:border-purple-300 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{tpl.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Characters Grid */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                1. Selecciona la Voz del Personaje
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {AI_VOICES.map((voice) => {
                  const isSelected = selectedVoice === voice.id;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => setSelectedVoice(voice.id)}
                      className={clsx(
                        "p-3.5 rounded-2xl border-2 text-left transition select-none flex flex-col gap-1.5 cursor-pointer relative",
                        isSelected 
                          ? "border-purple-600 bg-purple-50/80 shadow-md ring-2 ring-purple-400/30" 
                          : "border-slate-200 hover:border-purple-300 bg-white hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center justify-between pr-5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900">{voice.label}</span>
                          <span className={clsx(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider",
                            voice.gender === 'Femenina' ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {voice.gender}
                          </span>
                        </div>
                        <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          {voice.accent}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {voice.style}
                      </p>
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-purple-600 text-white rounded-full flex items-center justify-center shadow">
                          <Check size={11} className="stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Text Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                  2. Escribe el Mensaje a Sintetizar
                </label>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                  {text.length}/5.000 caracteres
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe lo que quieres que diga la voz de IA... (Ejemplo: ¡Bienvenidos al gran Bingo en Vivo! Preparen sus cartones...)"
                rows={5}
                maxLength={5000}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-400/20 resize-none transition leading-relaxed"
              />
            </div>

            {/* Action: Generate Audio Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={handleGenerateAudio}
                disabled={isGenerating || !text.trim()}
                className="flex-1 py-3.5 px-6 rounded-2xl font-black text-sm text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-xl shadow-purple-600/25 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Sintetizando voz con Inteligencia Artificial...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Generar y Probar Voz 🔊</span>
                  </>
                )}
              </button>
            </div>

            {/* Generated Audio Card (Result / Player / Download / Save / Broadcast) */}
            <AnimatePresence>
              {generatedAudioBase64 && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="p-5 bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-950 text-white rounded-3xl border-2 border-purple-400/40 shadow-2xl space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-lg font-bold">
                        <Volume2 size={20} />
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-white flex items-center gap-1.5">
                          Audio Generado Listo para Usar
                        </h4>
                        <p className="text-[11px] text-purple-200">
                          Voz: <strong>{selectedVoice}</strong> • Calidad HD
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Play Preview Button */}
                      <button
                        type="button"
                        onClick={() => handlePlayLocally('preview-current', generatedAudioBase64, text)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                      >
                        {playingAudioId === 'preview-current' ? <Pause size={14} /> : <Play size={14} />}
                        <span>{playingAudioId === 'preview-current' ? 'Pausar' : 'Escuchar Audio'}</span>
                      </button>

                      {/* Download Audio File Button */}
                      <button
                        type="button"
                        onClick={() => handleDownload(generatedAudioBase64, title || `voz_ia_${selectedVoice}`)}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-white/20 shadow-md active:scale-95 cursor-pointer"
                        title="Descargar archivo .WAV a tu dispositivo"
                      >
                        <Download size={14} />
                        <span>Descargar (.WAV)</span>
                      </button>
                    </div>
                  </div>

                  {/* Save to Database Section */}
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
                    <label className="text-[11px] font-black uppercase tracking-wider text-purple-200 block">
                      Guardar en la Base de Datos para Reutilizar
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Título del audio (Ej: Anuncio de Bienvenida 2026)"
                        className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-xs text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-400"
                        maxLength={50}
                      />
                      <button
                        type="button"
                        onClick={handleSaveToDatabase}
                        disabled={isSaving}
                        className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>Guardar en Base de Datos</span>
                      </button>
                    </div>
                  </div>

                  {/* Broadcast Live Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleBroadcastLive(text, selectedVoice, generatedAudioBase64)}
                      disabled={isBroadcasting}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-red-500 via-pink-600 to-purple-600 hover:from-red-600 hover:to-purple-700 text-white font-black text-xs sm:text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-xl shadow-red-500/20 active:scale-98 cursor-pointer disabled:opacity-50"
                    >
                      {isBroadcasting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Transmitiendo a los jugadores...</span>
                        </>
                      ) : (
                        <>
                          <Radio size={16} />
                          <span>Emitir en Vivo a la Sala de Bingo 📢</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* Tab 2: Saved Presets in Database */
          <div className="space-y-4">
            {/* Search Filter */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar en audios guardados..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 transition"
                />
              </div>
              <span className="text-xs font-bold text-slate-400">
                {presets.length} guardados
              </span>
            </div>

            {isLoadingPresets ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 size={32} className="animate-spin mx-auto text-purple-600 mb-2" />
                <p className="text-xs font-bold">Cargando biblioteca de audios...</p>
              </div>
            ) : presets.length === 0 ? (
              <div className="py-12 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-6">
                <Bot size={40} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-700">No hay audios guardados en la base de datos</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">Crea tu primer anuncio con voz de IA y guárdalo para reutilizarlo siempre.</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition"
                >
                  Crear Nuevo Audio
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {presets
                  .filter(p => {
                    if (!searchFilter) return true;
                    const q = searchFilter.toLowerCase();
                    return p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q) || (p.voice && p.voice.toLowerCase().includes(q));
                  })
                  .map((preset) => {
                    const isPlaying = playingAudioId === `preset-${preset.id}`;
                    return (
                      <div
                        key={preset.id}
                        className="p-4 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-2xl transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-sm text-slate-900 truncate">
                              {preset.title}
                            </h4>
                            <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                              Voz: {preset.voice || 'Kore'}
                            </span>
                            {preset.audio_base64 && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                Audio WAV Listo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            "{preset.text}"
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Play Button */}
                          <button
                            type="button"
                            onClick={() => handlePlayLocally(`preset-${preset.id}`, preset.audio_base64, preset.text, preset.voice)}
                            className={clsx(
                              "px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1 shadow-sm cursor-pointer",
                              isPlaying
                                ? "bg-emerald-600 text-white animate-pulse"
                                : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-200"
                            )}
                            title="Escuchar audio"
                          >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                            <span>{isPlaying ? 'Pausar' : 'Escuchar'}</span>
                          </button>

                          {/* Download Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (preset.audio_base64) {
                                handleDownload(preset.audio_base64, preset.title);
                              } else {
                                // If not pre-cached, generate then download
                                toast('Generando archivo para descarga...', { icon: '⏳' });
                                apiFetch('/api/admin/generate-ai-audio', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ text: preset.text, voice: preset.voice || 'Kore' })
                                }).then(res => res.json()).then(data => {
                                  if (data.audio_base64) {
                                    handleDownload(data.audio_base64, preset.title);
                                  }
                                });
                              }
                            }}
                            className="p-2 bg-white hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition shadow-sm cursor-pointer"
                            title="Descargar archivo .WAV"
                          >
                            <Download size={14} />
                          </button>

                          {/* Load into Editor Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setText(preset.text);
                              setSelectedVoice(preset.voice || 'Kore');
                              setTitle(preset.title);
                              setGeneratedAudioBase64(preset.audio_base64 || null);
                              setActiveTab('create');
                              toast.success('Audio cargado en el creador');
                            }}
                            className="p-2 bg-white hover:bg-slate-200 text-purple-600 rounded-xl border border-slate-200 transition shadow-sm cursor-pointer"
                            title="Cargar en el creador para editar"
                          >
                            <Edit3 size={14} />
                          </button>

                          {/* Broadcast Live Button */}
                          <button
                            type="button"
                            onClick={() => handleBroadcastLive(preset.text, preset.voice || 'Kore', preset.audio_base64)}
                            disabled={isBroadcasting}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition shadow flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Emitir en vivo a todos los jugadores"
                          >
                            <Radio size={12} />
                            <span>Emitir</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={(e) => handleDeletePreset(preset.id, e)}
                            className="p-2 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl border border-slate-200 transition cursor-pointer"
                            title="Eliminar de la base de datos"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Note */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
        <span className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-purple-600" />
          Tecnología de Síntesis Vocal Neuronal Ultra Rápida
        </span>
        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}
