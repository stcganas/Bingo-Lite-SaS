import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBingoChannel } from '../ably';
import { Play, Pause, Square, RefreshCcw, CheckCircle2, XCircle, Users, Trophy, Clock, Plus, Trash2, Calendar, Gamepad2, Grid, Settings, List, Volume2, Volume1, VolumeX, Radio, MessageSquare, Save, LogOut, ChevronDown, ChevronUp, HardDrive, Bot, Wallet, DollarSign, Ban, Shield, ShieldCheck, Edit3, Mail, MapPin, Share2, Copy, MessageCircle, X, BellRing, History, Loader2, Image, Upload, Music, Sliders, BarChart2, Sparkles, Gift, Download, Zap, Gauge, FastForward, Timer, PlayCircle, StopCircle, ArrowRight, Check, Key, QrCode, Scan, Star, SlidersHorizontal, Search, CheckSquare, Wrench, Smartphone } from 'lucide-react';
import { useTTS } from '../hooks/useTTS';
import { announceBall } from '../utils/speech';
import NotificationBell from '../components/NotificationBell';
import { PWAInstallButton } from '../components/PWAInstallButton';
import NotificationAdmin from '../components/NotificationAdmin';
import { useAuth } from '../AuthContext';
import toast, { Toaster } from 'react-hot-toast';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, normalizePhone, comparePhones } from '../utils/format';
import { getSafePatternGrid } from '../utils/bingo';
import BingoWinnerPopup from '../components/BingoWinnerPopup';
import GameSummaryPopup from '../components/GameSummaryPopup';
import EditGameModal from '../components/EditGameModal';
import PatternRow from '../components/PatternRow';
import BingoBoard from '../components/BingoBoard';
import ChatComponent from '../components/ChatComponent';
import LiveStream from '../components/LiveStream';
import { playChatOpenSound, playChatCloseSound, playSynthesizedDJEffect, getAudioContext, downloadBase64Audio, setGlobalFxVolume } from '../utils/sound';
import { getProxyUrl, DJSlot, DEFAULT_SLOTS } from '../components/DJConsole';
import { apiFetch } from '../utils/api';
import DJConsole from '../components/DJConsole';
import AdminSellers from "./AdminSellers";
import VirtualMixer from '../components/VirtualMixer';
import AIVoiceStudio from '../components/AIVoiceStudio';
import FreeGamesLeaderboard from '../components/FreeGamesLeaderboard';

type Tab = 'sellers' | 'control' | 'auto_draws' | 'games' | 'patterns' | 'users' | 'all_users' | 'settings' | 'wallet' | 'notifications' | 'tickets' | 'winners_history' | 'free_winners' | 'dj_board' | 'virtual_mixer' | 'statistics_history' | 'lottery_numbers' | 'ai_voice_studio';

const getBallLetter = (ball: number) => {
  if (ball >= 1 && ball <= 15) return 'B';
  if (ball >= 16 && ball <= 30) return 'I';
  if (ball >= 31 && ball <= 45) return 'N';
  if (ball >= 46 && ball <= 60) return 'G';
  if (ball >= 61 && ball <= 75) return 'O';
  return '';
};

const getBallColor = (ball: number) => {
  if (ball >= 1 && ball <= 15) return 'bg-blue-600';
  if (ball >= 16 && ball <= 30) return 'bg-red-500';
  if (ball >= 31 && ball <= 45) return 'bg-yellow-500';
  if (ball >= 46 && ball <= 60) return 'bg-green-500';
  if (ball >= 61 && ball <= 75) return 'bg-purple-600';
  return 'bg-slate-600';
};

export default function AdminDashboard() {
  const { user, logout, updatePassword } = useAuth();
  const { slug } = useParams<{ slug?: string }>();
  const currentTenant = slug || (user?.tenant_id && user.tenant_id !== 'global' ? user.tenant_id : undefined);
  const channel = getBingoChannel(currentTenant);
  const { speak, stop, speakNative, setWinnerSpeechActive } = useTTS();
  const lastAnnouncedBallIdRef = useRef<string | null>(null);
  const lastAnnouncedBallTimeRef = useRef<number>(0);
  
  const [activeTab, setActiveTab] = useState<Tab>('control');
  const [gameState, setGameState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bingoAlerts, setBingoAlerts] = useState<any[]>([]);
  const [winnerQueue, setWinnerQueue] = useState<any[]>([]);
  const activeWinnersIdsRef = useRef<Set<string>>(new Set());
  const winnersArchiveRef = useRef<Set<string>>(new Set());
  const isAnnouncingWinnerRef = useRef<boolean>(false);
  const [winner, setWinner] = useState<any>(null);
  const [gameCountdown, setGameCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [patterns, setPatterns] = useState<any[]>([]);

  // Tickets de recuperación de clave
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [resettingTicketId, setResettingTicketId] = useState<string | null>(null);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  // Online and accounting stats states
  const [onlinePlayersCount, setOnlinePlayersCount] = useState(0);
  const [onlinePlayers, setOnlinePlayers] = useState<any[]>([]);
  const [showOnlinePlayersModal, setShowOnlinePlayersModal] = useState(false);
  const [editingGame, setEditingGame] = useState<any>(null);
  const [showEditGameModal, setShowEditGameModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showAIAnnouncementModal, setShowAIAnnouncementModal] = useState(false);
  const [aiAnnouncementText, setAiAnnouncementText] = useState('');
  const [aiAnnouncementVoice, setAiAnnouncementVoice] = useState('Kore');
  const [aiAnnouncementAudioBase64, setAiAnnouncementAudioBase64] = useState<string | null>(null);
  const [aiAnnouncementSaveAsPreset, setAiAnnouncementSaveAsPreset] = useState(false);
  const [aiAnnouncementPresetTitle, setAiAnnouncementPresetTitle] = useState('');
  const [isBroadcastingAI, setIsBroadcastingAI] = useState(false);

  // States for customizable AI announcement presets (loaded/saved via localStorage)
  const [aiPresets, setAiPresets] = useState<{ id: string; title: string; text: string; voice?: string; audio_base64?: string }[]>(() => {
    try {
      const saved = localStorage.getItem('bingo_ai_announcement_presets');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error reading AI presets from localStorage:', e);
    }
    return [
      { id: 'preset_1', title: 'Reglas de Juego 📋', text: 'Atención jugadores, las reglas para esta ronda son las siguientes: el primer jugador en completar el patrón de juego ganará el premio mayor. ¡Mucha suerte a todos!' },
      { id: 'preset_2', title: 'Lobby Inicio ⏳', text: 'Hola a todos los apasionados del Bingo. Estamos preparando las balotas de la suerte, el juego iniciará en breve. ¡Preparen sus cartones!' },
      { id: 'preset_3', title: 'Advertencia 🚨', text: '¡Último llamado para adquirir y recargar saldo para participar en esta gran ronda! No se queden por fuera de los grandes sorteos.' }
    ];
  });

  // DJ Background tracks state
  const [djBgPlaylist, setDjBgPlaylist] = useState<any[]>([]);
  const [showDjTracksModal, setShowDjTracksModal] = useState(false);
  const [activeDjTrackId, setActiveDjTrackId] = useState<string | null>(null);

  const fetchDjBgPlaylist = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/dj-bg');
      if (res.ok) {
        const data = await res.json();
        if (data && data.playlist) {
          setDjBgPlaylist(data.playlist);
        } else {
          setDjBgPlaylist([
            { id: 'bg_1', name: 'Lounge (Por defecto)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
            { id: 'bg_2', name: 'Pista 2 (Vacía)', url: '' },
            { id: 'bg_3', name: 'Pista 3 (Vacía)', url: '' },
            { id: 'bg_4', name: 'Pista 4 (Vacía)', url: '' },
            { id: 'bg_5', name: 'Pista 5 (Vacía)', url: '' }
          ]);
        }
      }
    } catch (err) {
      // ignored
    }
  }, []);

  const triggerDjBgTrack = async (track: any) => {
    if (!track.url) {
      toast.error('Esta pista no tiene una URL configurada en la consola DJ.');
      return;
    }
    
    try {
      const res = await apiFetch('/api/admin/trigger-dj-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track.url,
          command: 'play',
          name: track.name,
          volume: bgVolume
        })
      });
      
      if (res.ok) {
        setActiveDjTrackId(track.id);
        toast.success(`Activando ambiente: ${track.name}`);
        setShowDjTracksModal(false);
      } else {
        toast.error('Error al activar sonido de ambiente');
      }
    } catch (err) {
      console.error('Error triggering DJ BG:', err);
      toast.error('Error de conexión');
    }
  };

  const stopDjBgTrack = async () => {
    try {
      const res = await apiFetch('/api/admin/trigger-dj-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'stop' })
      });
      if (res.ok) {
        setActiveDjTrackId(null);
        toast.success('Ambiente musical detenido');
      }
    } catch (err) {
      console.error('Error stopping DJ BG:', err);
    }
  };

  useEffect(() => {
    const fetchAIPresets = async () => {
      try {
        const res = await apiFetch('/api/ai-presets');
        if (res.ok) {
          const dbPresets = await res.json();
          const defaults: { id: string; title: string; text: string; voice?: string; audio_base64?: string; }[] = [
            { id: 'preset_1', title: 'Reglas de Juego 📋', text: 'Atención jugadores, las reglas para esta ronda son las siguientes: el primer jugador en completar el patrón de juego ganará el premio mayor. ¡Mucha suerte a todos!' },
            { id: 'preset_2', title: 'Lobby Inicio ⏳', text: 'Hola a todos los apasionados del Bingo. Estamos preparando las balotas de la suerte, el juego iniciará en breve. ¡Preparen sus cartones!' },
            { id: 'preset_3', title: 'Advertencia 🚨', text: '¡Último llamado para adquirir y recargar saldo para participar en esta gran ronda! No se queden por fuera de los grandes sorteos.' }
          ];
          
          const combined = [...defaults];
          dbPresets.forEach((dbp: any) => {
            if (!combined.some(c => String(c.id) === String(dbp.id))) {
                  combined.push({
                    id: String(dbp.id),
                    title: dbp.title,
                    text: dbp.text,
                    voice: dbp.voice,
                    audio_base64: dbp.audio_base64
                  });
            }
          });
          setAiPresets(combined);
        }
      } catch (err) {
        // ignored
      }
    };
    fetchAIPresets();
    fetchDjBgPlaylist();
  }, [fetchDjBgPlaylist]);

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetFormTitle, setPresetFormTitle] = useState('');
  const [presetFormText, setPresetFormText] = useState('');
  const [presetFormVoice, setPresetFormVoice] = useState('Kore');
  const [isGeneratingPresetAudio, setIsGeneratingPresetAudio] = useState(false);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [statsHistory, setStatsHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [totalRegisteredUsers, setTotalRegisteredUsers] = useState(0);
  
  // Pattern Creator state
  const [newPatternName, setNewPatternName] = useState('');
  const [newPatternGrid, setNewPatternGrid] = useState<boolean[][]>(
    Array(5).fill(null).map(() => Array(5).fill(false))
  );
  const [editingPatternId, setEditingPatternId] = useState<number | null>(null);
  const [newPatternIsActive, setNewPatternIsActive] = useState(true);

  // Game Wizard state
  const [gameWizardStep, setGameWizardStep] = useState(1);
  const [gameWizardPatterns, setGameWizardPatterns] = useState<{pattern_id: number, prize: string}[]>([]);
  const [gameWizardRematchPatterns, setGameWizardRematchPatterns] = useState<{pattern_id: number, prize: string}[]>([]);
  
  // Autoplay state (standard 8 seconds per ball draw)
  const [autoplay, setAutoplay] = useState(false);
  const [autoplayInterval, setAutoplayInterval] = useState(() => {
    const saved = localStorage.getItem('bingo-autoplay-interval');
    const parsed = saved ? Number(saved) : 8;
    return parsed >= 8 ? parsed : 8;
  });

  const saveAutoplayInterval = (val: number) => {
    const safeVal = val >= 8 ? val : 8;
    setAutoplayInterval(safeVal);
    localStorage.setItem('bingo-autoplay-interval', safeVal.toString());
  };

  // Automatic Draw & Scheduling Management States
  const [scheduledTimeInput, setScheduledTimeInput] = useState<string>(() => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    const tzOffset = future.getTimezoneOffset();
    return new Date(future.getTime() - tzOffset * 60000).toISOString().slice(0, 16);
  });
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const [isUpdatingSpeed, setIsUpdatingSpeed] = useState(false);

  const handleScheduleGameSubmit = async (customTime?: string) => {
    const targetTime = customTime || scheduledTimeInput;
    if (!targetTime) {
      toast.error('Selecciona una fecha y hora válida');
      return;
    }
    setIsSubmittingSchedule(true);
    try {
      const res = await apiFetch('/api/admin/game/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameState?.id,
          startTime: targetTime,
          interval: autoplayInterval
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`⏰ Juego programado para las ${new Date(targetTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
        if (data.game) setGameState(data.game);
      } else {
        toast.error(data.error || 'Error al programar juego');
      }
    } catch (err) {
      toast.error('Error de conexión al programar juego');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const handleQuickScheduleMinutes = (minutes: number) => {
    const futureDate = new Date(Date.now() + minutes * 60 * 1000);
    const tzOffset = futureDate.getTimezoneOffset();
    const localIso = new Date(futureDate.getTime() - tzOffset * 60000).toISOString().slice(0, 16);
    setScheduledTimeInput(localIso);
    handleScheduleGameSubmit(futureDate.toISOString());
  };

  const handleCancelScheduleSubmit = async () => {
    setIsSubmittingSchedule(true);
    try {
      const res = await apiFetch('/api/admin/game/schedule/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameState?.id })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Programación cancelada correctamente');
        if (data.game) setGameState(data.game);
      } else {
        toast.error(data.error || 'Error al cancelar programación');
      }
    } catch (err) {
      toast.error('Error de conexión al cancelar programación');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const handleSpeedChangeAndSave = async (newSpeedSeconds: number) => {
    const safeSpeed = newSpeedSeconds >= 8 ? newSpeedSeconds : 8;
    saveAutoplayInterval(safeSpeed);
    setIsUpdatingSpeed(true);
    try {
      const res = await apiFetch('/api/admin/game/autoplay/update-interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: safeSpeed })
      });
      if (res.ok) {
        toast.success(`⚡ Velocidad ajustada: ${safeSpeed}s por balota`);
      } else {
        toast.error('Error al actualizar velocidad en el servidor');
      }
    } catch (err) {
      toast.error('Error de conexión al guardar velocidad');
    } finally {
      setIsUpdatingSpeed(false);
    }
  };
  const [finalNote, setFinalNote] = useState('');
  const [aiKnowledgeBase, setAiKnowledgeBase] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash');
  const [aiChatEnabled, setAiChatEnabled] = useState(true);
  const [aiFraudDetectionEnabled, setAiFraudDetectionEnabled] = useState(true);
  const [isUpdatingAiChat, setIsUpdatingAiChat] = useState(false);
  const isUpdatingAiChatRef = useRef(false);
  const [whatsappTemplate, setWhatsappTemplate] = useState('¡Hola! 👋 ¡Tengo una excelente noticia para ti! Te acabo de regalar un CARTÓN 100% GRATIS 🎁 para que juegues y ganes conmigo en nuestro gran bingo.\n\n1️⃣ Reclama tu regalo:\nRegístrate totalmente GRATIS usando mi invitación oficial aquí:\n👉 {url}\n\n2️⃣ Únete al VIP (¡Fundamental!):\nEs estrictamente fundamental que te unas a nuestro Grupo VIP de WhatsApp para validar tu jugada.\n\n¡Entra ya mismo y prepárate para cantar BINGO en familia! Nos vemos allí. 👨‍👩‍👧‍👦🍀');
  const [whatsappGroupLink, setWhatsappGroupLink] = useState('');
  const [nequiNumber, setNequiNumber] = useState('3235304996');
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [headerTitle, setHeaderTitle] = useState('BINGO ONLINE');
  const [headerSubtitle, setHeaderSubtitle] = useState('Juega desde tu celular, gana premios al instante y diviértete en grande.');
  const [headerOpacity, setHeaderOpacity] = useState(0.4);
  const [loginBgImageUrl, setLoginBgImageUrl] = useState<string | null>(null);
  const [loginBgOpacity, setLoginBgOpacity] = useState(0.4);
  const [bgVolume, setBgVolume] = useState(0.8);
  const [fxVolume, setFxVolume] = useState(1.0);
  const [isSavingAIConfig, setIsSavingAIConfig] = useState(false);
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
  const [isSavingNequi, setIsSavingNequi] = useState(false);
  const [isSavingHeader, setIsSavingHeader] = useState(false);
  const [isUploadingHeader, setIsUploadingHeader] = useState(false);
  const [isSavingLoginBg, setIsSavingLoginBg] = useState(false);
  const [isUploadingLoginBg, setIsUploadingLoginBg] = useState(false);
  const [bgAudioUrl, setBgAudioUrl] = useState('');
  const [bgAudioActive, setBgAudioActive] = useState(false);
  const [isSavingAudio, setIsSavingAudio] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [gritoBingoConfig, setGritoBingoConfig] = useState<{ url: string; fallbackUrl: string; name: string }>({
    url: '',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav',
    name: 'Grito Bingo'
  });

  const [anunciosConfig, setAnunciosConfig] = useState<{ url: string; fallbackUrl: string; name: string }>({
    url: '',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav',
    name: 'Anuncio Alerta'
  });

  // DJ Soundboard Slots & Game Control integration
  const [allDjSlots, setAllDjSlots] = useState<DJSlot[]>(DEFAULT_SLOTS);
  const [showSelectDjEffectsModal, setShowSelectDjEffectsModal] = useState(false);
  const [activeLiveDjPadId, setActiveLiveDjPadId] = useState<string | null>(null);
  const [searchDjTerm, setSearchDjTerm] = useState('');
  const [previewingAudioSlotId, setPreviewingAudioSlotId] = useState<string | null>(null);

  const selectedDjSlots = useMemo(() => {
    return allDjSlots.filter(s => s.selectedForGamePanel);
  }, [allDjSlots]);

  const loadDJBoardConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/dj-board');
      if (res.ok) {
        const savedSlots = await res.json();
        if (savedSlots && typeof savedSlots === 'object') {
          // Standard slots merged with saved settings
          const standardWithSaved = DEFAULT_SLOTS.map(slot => {
            const saved = savedSlots[slot.id];
            if (saved) {
              return {
                ...slot,
                name: saved.name || slot.name,
                url: saved.url || slot.url,
                fallbackUrl: saved.fallbackUrl || slot.fallbackUrl,
                selectedForGamePanel: !!saved.selectedForGamePanel
              };
            }
            return slot;
          });

          // Custom slots added in DJ console
          const customWithSaved = Object.values(savedSlots)
            .filter((s: any) => s && s.isCustom)
            .map((s: any) => ({
              id: s.id,
              label: s.label || 'Efecto Adicional',
              description: s.description || 'Efecto creado dinámicamente',
              name: s.name || 'Extra Sound FX',
              url: s.url || '',
              color: s.color || 'blue',
              emoji: s.emoji || '🎵',
              fallbackUrl: s.fallbackUrl || 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav',
              isCustom: true,
              selectedForGamePanel: !!s.selectedForGamePanel
            }));

          const combined = [...standardWithSaved, ...customWithSaved];
          setAllDjSlots(combined);

          const targetSlot = savedSlots['slot_grito_bingo'];
          if (targetSlot) {
            setGritoBingoConfig({
              url: targetSlot.url || '',
              fallbackUrl: targetSlot.fallbackUrl || 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav',
              name: targetSlot.name || 'Grito Bingo'
            });
          }
          const targetAnunciosSlot = savedSlots['slot_anuncios'];
          if (targetAnunciosSlot) {
            setAnunciosConfig({
              url: targetAnunciosSlot.url || '',
              fallbackUrl: targetAnunciosSlot.fallbackUrl || 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav',
              name: targetAnunciosSlot.name || 'Anuncio Alerta'
            });
          }
        }
      }
    } catch (err) {
      console.error('Error loading DJ slots config for AdminDashboard:', err);
    }
  }, []);

  // Listen to cross-component DJ slot updates in real time
  useEffect(() => {
    const onDjSlotsUpdated = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setAllDjSlots(e.detail);
      } else {
        loadDJBoardConfig();
      }
    };
    window.addEventListener('dj-slots-updated', onDjSlotsUpdated);
    return () => {
      window.removeEventListener('dj-slots-updated', onDjSlotsUpdated);
    };
  }, [loadDJBoardConfig]);

  // Toggle single effect for game control panel
  const toggleSlotForGamePanel = async (slotId: string) => {
    const updatedSlots = allDjSlots.map(s => {
      if (s.id === slotId) {
        return { ...s, selectedForGamePanel: !s.selectedForGamePanel };
      }
      return s;
    });
    setAllDjSlots(updatedSlots);

    try {
      const payload: Record<string, any> = {};
      updatedSlots.forEach(s => {
        payload[s.id] = {
          id: s.id,
          label: s.label,
          description: s.description,
          name: s.name,
          url: s.url,
          color: s.color,
          emoji: s.emoji,
          fallbackUrl: s.fallbackUrl || '',
          isCustom: s.isCustom || false,
          selectedForGamePanel: !!s.selectedForGamePanel
        };
      });

      await apiFetch('/api/admin/settings/dj-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: payload })
      });

      window.dispatchEvent(new CustomEvent('dj-slots-updated', { detail: updatedSlots }));
      const target = updatedSlots.find(s => s.id === slotId);
      if (target?.selectedForGamePanel) {
        toast.success(`Efecto "${target.name}" añadido al panel del juego`, { icon: '⭐' });
      } else if (target) {
        toast(`Efecto "${target.name}" quitado del panel`, { icon: '➖' });
      }
    } catch (err) {
      console.error('Error toggling DJ slot:', err);
      toast.error('Error al guardar selección de efecto');
    }
  };

  // Trigger DJ sound in live game (local preview + broadcast to players)
  const triggerDjSoundFromSlot = async (slot: DJSlot) => {
    const finalUrl = slot.url || slot.fallbackUrl;

    setActiveLiveDjPadId(slot.id);
    setTimeout(() => {
      setActiveLiveDjPadId(null);
    }, 1200);

    // Play locally for admin if not muted
    if (!isMuted) {
      try {
        if (!finalUrl || finalUrl.includes('mixkit.co')) {
          playSynthesizedDJEffect(slot.id || slot.name, fxVolume);
        } else {
          const proxiedUrl = getProxyUrl(finalUrl);
          const sfxAudio = new Audio(proxiedUrl);
          sfxAudio.volume = fxVolume;
          sfxAudio.onerror = () => {
            playSynthesizedDJEffect(slot.id || slot.name, fxVolume);
          };
          sfxAudio.play().catch(() => {
            playSynthesizedDJEffect(slot.id || slot.name, fxVolume);
          });
        }
      } catch {
        playSynthesizedDJEffect(slot.id || slot.name, fxVolume);
      }
    }

    // Broadcast globally to all players
    try {
      const res = await apiFetch('/api/admin/trigger-dj-sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: slot.id,
          url: finalUrl,
          name: slot.name
        })
      });

      if (res.ok) {
        toast(`¡Efecto "${slot.name}" disparado en vivo!`, { icon: slot.emoji || '🔥' });
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al transmitir sonido');
      }
    } catch (err) {
      console.error('Error triggering sound:', err);
      toast.error('Error de red al transmitir sonido');
    }
  };

  // Preview sound locally without broadcasting
  const previewDjSoundLocally = (slot: DJSlot) => {
    const finalUrl = slot.url || slot.fallbackUrl;
    setPreviewingAudioSlotId(slot.id);
    setTimeout(() => setPreviewingAudioSlotId(null), 1500);

    try {
      if (!finalUrl || finalUrl.includes('mixkit.co')) {
        playSynthesizedDJEffect(slot.id || slot.name, fxVolume);
      } else {
        const proxiedUrl = getProxyUrl(finalUrl);
        const audio = new Audio(proxiedUrl);
        audio.volume = fxVolume;
        audio.play().catch(() => playSynthesizedDJEffect(slot.id || slot.name, fxVolume));
      }
    } catch {
      playSynthesizedDJEffect(slot.id || slot.name, fxVolume);
    }
  };

  useEffect(() => {
    loadDJBoardConfig();
  }, [loadDJBoardConfig, activeTab]);

  useEffect(() => {
    const loadAudioSettings = async () => {
      try {
        const res = await apiFetch('/api/settings/audio');
        if (res.ok) {
          const data = await res.json();
          setBgAudioUrl(data.url || '');
          setBgAudioActive(!!data.active);
        }
      } catch (err) {
        console.error('Error loading audio settings:', err);
      }
    };
    loadAudioSettings();
  }, []);

  useEffect(() => {
    const loadPlayerCommission = async () => {
      try {
        const res = await apiFetch('/api/settings/player-commission');
        if (res.ok) {
          const data = await res.json();
          setPlayerCommission(data.percentage || 10);
        }
      } catch (err) {
        console.error('Error loading player commission settings:', err);
      }
    };
    loadPlayerCommission();
  }, []);
  const [isSavingTwitch, setIsSavingTwitch] = useState(false);
  const [playerCommission, setPlayerCommission] = useState(10);
  const [isSavingPlayerCommission, setIsSavingPlayerCommission] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);

  useEffect(() => {
    const effectiveSlug = (slug || user?.tenant_id || 'bingo-lite').toLowerCase();
    apiFetch(`/api/maintenance-status?slug=${encodeURIComponent(effectiveSlug)}`)
      .then(res => res.json())
      .then(data => {
        if (data) {
          setMaintenanceMode(!!data.maintenance_mode);
          setMaintenanceMessage(data.maintenance_message || '');
        }
      })
      .catch(() => {});

    apiFetch('/api/admin/settings/social-share')
      .then(res => res.json())
      .then(data => {
        if (data) {
          if (data.message) setSocialShareMessage(data.message);
          if (data.image_url) setSocialShareImageUrl(data.image_url);
        }
      })
      .catch(() => {});

    apiFetch('/api/admin/settings/theme-template')
      .then(res => res.json())
      .then(data => {
        if (data?.theme_template) setRoomThemeTemplate(data.theme_template);
      })
      .catch(() => {});
  }, [slug, user?.tenant_id]);

  const [socialShareMessage, setSocialShareMessage] = useState('');
  const [socialShareImageUrl, setSocialShareImageUrl] = useState('');
  const [isSavingSocialShare, setIsSavingSocialShare] = useState(false);
  const [isUploadingSocialImage, setIsUploadingSocialImage] = useState(false);

  // Plantilla visual de la sala: 'classic' o 'neon_glow'
  const [roomThemeTemplate, setRoomThemeTemplate] = useState<'classic' | 'neon_glow'>('classic');
  const [isSavingRoomTheme, setIsSavingRoomTheme] = useState(false);

  const handleSaveRoomTheme = async (newTheme: 'classic' | 'neon_glow') => {
    setIsSavingRoomTheme(true);
    setRoomThemeTemplate(newTheme);
    try {
      const res = await apiFetch('/api/admin/settings/theme-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_template: newTheme })
      });
      if (res.ok) {
        toast.success(`Plantilla cambiada a ${newTheme === 'neon_glow' ? 'Neón Glow VIP ✨' : 'Clásica (Original) 🎲'} exitosamente.`);
      } else {
        toast.error('Error al guardar plantilla');
      }
    } catch (e) {
      toast.error('Error de conexión');
    } finally {
      setIsSavingRoomTheme(false);
    }
  };

  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingAutoplay, setIsSavingAutoplay] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [gameFinished, setGameFinished] = useState<any>(null);

  const detectedPatternIds = React.useMemo(() => {
    return new Set<number>(gameState?.detected_pattern_ids || []);
  }, [gameState?.detected_pattern_ids]);

  // Queue effect to process winners one by one
  useEffect(() => {
    if (winnerQueue.length > 0 && !winner && !isAnnouncingWinnerRef.current) {
      const nextWinner = winnerQueue[0];
      
      // Update queue and set winner state
      setWinnerQueue(prev => prev.slice(1));
      setWinner(nextWinner);
      
      const processAnnouncement = async () => {
        isAnnouncingWinnerRef.current = true;
        setWinnerSpeechActive(true, 22000);

        if (!isMutedRef.current) {
          stop(true);
        }

        const alertName = nextWinner.winners ? nextWinner.winners.map((w: any) => w.player_name).join(', ') : nextWinner.player_name;
        toast.success(`¡BINGO CANTADO POR ${alertName}!`, { duration: 10000 });

        // Wait full 22 seconds before closing and allowing next winner
        setTimeout(() => {
          setWinner(null);
          handleCloseWinner();
          setWinnerSpeechActive(false);
          isAnnouncingWinnerRef.current = false;
        }, 22000);
      };

      processAnnouncement();
    }
  }, [winnerQueue, winner]);
  const lastAiChatUpdateRef = useRef<number>(0);

  // Countdown state
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);
  const [timeToStart, setTimeToStart] = useState<string | null>(null);
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatEnabled, setIsChatEnabled] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [twitchChannel, setTwitchChannel] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [isSavingAdminPassword, setIsSavingAdminPassword] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const bgVolumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fxVolumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMutedRef = useRef(false);
  const gameStateRef = useRef<any>(null);
  const [playerFilter, setPlayerFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [rechargeFilter, setRechargeFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [expandedReceipts, setExpandedReceipts] = useState<Record<string, boolean>>({});
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [walletPlayers, setWalletPlayers] = useState<any[]>([]);
  
  // Wallet recharge requests state
  const [rechargeRequests, setRechargeRequests] = useState<any[]>([]);
  const [isRechargeLoading, setIsRechargeLoading] = useState(false);
  const [processingRechargeId, setProcessingRechargeId] = useState<string | null>(null);
  const isFetchingRechargeRef = useRef(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [rechargeAmount, setRechargeAmount] = useState<string>('');
  const [selectedWalletPlayer, setSelectedWalletPlayer] = useState<string | null>(null);
  const [showDirectRechargeModal, setShowDirectRechargeModal] = useState(false);
  const [directRechargePhone, setDirectRechargePhone] = useState('');
  const [directRechargeAmount, setDirectRechargeAmount] = useState('');
  const [isSubmittingDirectRecharge, setIsSubmittingDirectRecharge] = useState(false);
  const [historyPlayer, setHistoryPlayer] = useState<any>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [walletHistoryData, setWalletHistoryData] = useState<any[]>([]);
  const [userGiftFilter, setUserGiftFilter] = useState<'all' | 'gifted' | 'completed' | 'none'>('all');
  const [selectedGiftingPlayer, setSelectedGiftingPlayer] = useState<any | null>(null);
  
  // Winners History state
  const [winners, setWinners] = useState<any[]>([]);
  const [isWinnersLoading, setIsWinnersLoading] = useState(false);
  const [selectedWinnerForRejection, setSelectedWinnerForRejection] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('Su pago no pudo ser comprobado su evidencia de pago es insuficiente o nula');
  const [isUpdatingWinnerStatus, setIsUpdatingWinnerStatus] = useState<string | null>(null);

  // Lottery numbers in play state
  const [lotteryNumbers, setLotteryNumbers] = useState<any[]>([]);
  const [isLotteryLoading, setIsLotteryLoading] = useState(false);
  const [lotteryWinnerCodeInput, setLotteryWinnerCodeInput] = useState('');
  const [lotterySearchTerm, setLotterySearchTerm] = useState('');
  const [isConfirmingLottery, setIsConfirmingLottery] = useState(false);
  const [confirmedWinningCode, setConfirmedWinningCode] = useState<string | null>(null);
  const [isLotteryConfirmed, setIsLotteryConfirmed] = useState(false);

  const fetchLotteryNumbers = async () => {
    setIsLotteryLoading(true);
    try {
      const res = await apiFetch(`/api/lottery-numbers?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setLotteryNumbers(data || []);
      }
      if (gameState?.id) {
        const winRes = await apiFetch(`/api/lottery-numbers/winner/${gameState.id}`);
        if (winRes.ok) {
          const winData = await winRes.json();
          setIsLotteryConfirmed(winData.confirmed === true);
          setConfirmedWinningCode(winData.winningCode);
          if (winData.winningCode !== null) {
            setLotteryWinnerCodeInput(String(winData.winningCode));
          } else {
            setLotteryWinnerCodeInput('');
          }
        }
      }
    } catch (err) {
      // ignored
    } finally {
      setIsLotteryLoading(false);
    }
  };

  const filteredLotteryNumbers = useMemo(() => {
    if (!lotterySearchTerm) return lotteryNumbers;
    return lotteryNumbers.filter(item => 
      String(item.lottery_code).includes(lotterySearchTerm) ||
      String(item.card_number).includes(lotterySearchTerm) ||
      item.player_name.toLowerCase().includes(lotterySearchTerm.toLowerCase()) ||
      item.player_phone.includes(lotterySearchTerm)
    );
  }, [lotteryNumbers, lotterySearchTerm]);

  const confirmLotteryWinnerDirectly = async (code: string) => {
    if (!gameState?.id) {
      toast.error('No hay un juego activo para asociar el sorteo de lotería.');
      return;
    }
    
    if (confirm(`¿Estás seguro de que quieres confirmar el código #${code} como el ganador oficial del sorteo? Esto notificará a los jugadores y eliminará los demás registros de sus paneles.`)) {
      setLotteryWinnerCodeInput(String(code));
      setIsConfirmingLottery(true);
      try {
        const res = await apiFetch('/api/lottery-numbers/winner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_id: gameState.id,
            winning_code: code
          })
        });
        if (res.ok) {
          toast.success('🎉 ¡Sorteo de lotería confirmado exitosamente! Los registros no ganadores han sido eliminados.');
          fetchLotteryNumbers();
        } else {
          const errData = await res.json();
          toast.error(errData.error || 'No se pudo confirmar la lotería');
        }
      } catch (err) {
        console.error('Error confirming lottery winner:', err);
        toast.error('Error de red al confirmar...');
      } finally {
        setIsConfirmingLottery(false);
      }
    }
  };

  const confirmLotteryWinner = async () => {
    if (!gameState?.id) {
      toast.error('No hay un juego activo para asociar el sorteo de lotería.');
      return;
    }
    if (!lotteryWinnerCodeInput) {
      toast.error('Por favor ingresa un código de lotería ganador o selecciónalo arriba.');
      return;
    }
    setIsConfirmingLottery(true);
    try {
      const res = await apiFetch('/api/lottery-numbers/winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: gameState.id,
          winning_code: lotteryWinnerCodeInput
        })
      });
      if (res.ok) {
        toast.success('🎉 ¡Sorteo de lotería confirmado exitosamente! Los registros no ganadores han sido eliminados de los paneles de los usuarios.');
        fetchLotteryNumbers();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Error al confirmar la lotería');
      }
    } catch (err) {
      console.error('Error in confirmLotteryWinner:', err);
      toast.error('Error de conexión al confirmar la lotería');
    } finally {
      setIsConfirmingLottery(false);
    }
  };

  const resetLotteryWinner = async () => {
    if (!gameState?.id) return;
    if (!window.confirm('¿Estás seguro de que deseas restablecer el sorteo de lotería para este juego? Podrás designar un nuevo número ganador.')) return;
    setIsConfirmingLottery(true);
    try {
      const res = await apiFetch('/api/lottery-numbers/reset-winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameState.id })
      });
      if (res.ok) {
        toast.success('Sorteo de lotería restablecido.');
        fetchLotteryNumbers();
      }
    } catch (err) {
      console.error('Error in resetLotteryWinner:', err);
      toast.error('Error al restablecer la lotería');
    } finally {
      setIsConfirmingLottery(false);
    }
  };

  const deleteLotteryNumber = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este registro del sorteo?')) return;
    try {
      const res = await apiFetch(`/api/lottery-numbers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Registro eliminado correctamente del sorteo');
        fetchLotteryNumbers();
      } else {
        toast.error('Error al eliminar el registro');
      }
    } catch (err) {
      console.error('Error deleting lottery number:', err);
      toast.error('Error de conexión');
    }
  };

  const clearLotteryNumbers = async () => {
    if (!window.confirm('🚨 ¡ATENCIÓN! ¿Estás seguro de vaciar la lista de números en juego? Esto borrará COMPLETAMENTE todos los registros de los jugadores para poder iniciar un nuevo sorteo/lotería.')) return;
    try {
      const res = await apiFetch('/api/lottery-numbers/clear', { method: 'DELETE' });
      if (res.ok) {
        toast.success('El listado ha sido vaciado correctamente');
        fetchLotteryNumbers();
      } else {
        toast.error('Error al vaciar el listado');
      }
    } catch (err) {
      console.error('Error clearing lottery numbers:', err);
      toast.error('Error de conexión');
    }
  };

  const fetchWinners = async () => {
    setIsWinnersLoading(true);
    try {
      const timestamp = Date.now();
      const res = await apiFetch(`/api/admin/winners?_t=${timestamp}`);
      if (res.ok) {
        const data = await res.json();
        setWinners(data);
      }
    } catch (err) {
      // ignored
    } finally {
      setIsWinnersLoading(false);
    }
  };

  const updateWinnerStatus = async (winnerId: string | number, status: 'paid' | 'rejected', reason?: string) => {
    const idStr = String(winnerId);
    setIsUpdatingWinnerStatus(idStr);
    try {
      const res = await apiFetch(`/api/admin/winners/${idStr}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason })
      });

      if (res.ok) {
        toast.success(status === 'paid' ? 'Pago marcado como completado' : 'Pago rechazado');
        fetchWinners();
        if (status === 'rejected') setSelectedWinnerForRejection(null);
      } else {
        toast.error('Error al actualizar estado');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setIsUpdatingWinnerStatus(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'winners_history') {
      fetchWinners();
    } else if (activeTab === 'lottery_numbers') {
      fetchLotteryNumbers();
    }
  }, [activeTab]);

  const [soundSettings, setSoundSettings] = useState(() => {
    const saved = localStorage.getItem('bingo-sound-settings');
    return saved ? JSON.parse(saved) : {
      login: true,
      logout: true,
      buyCard: true,
      navigate: true
    };
  });

  useEffect(() => {
    localStorage.setItem('bingo-sound-settings', JSON.stringify(soundSettings));
  }, [soundSettings]);

  const toggleSoundSetting = (key: keyof typeof soundSettings) => {
    setSoundSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchAllPlayers = async () => {
    try {
      const timestamp = Date.now();
      const res = await apiFetch(`/api/admin/all-players?_t=${timestamp}`);
      if (res.ok) {
        const data = await res.json();
        setAllPlayers(data);
      }
    } catch (err) {
      // ignored
    }
  };

  const fetchOnlinePlayers = async () => {
    try {
      const res = await apiFetch(`/api/admin/online-players?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setOnlinePlayersCount(data.online_count || 0);
        setOnlinePlayers(data.players || []);
      }
    } catch (err) {
      // ignored
    }
  };

  const fetchCurrentGamePlayers = async () => {
    try {
      const res = await apiFetch(`/api/players?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data);
      }
    } catch (err) {
      // ignored
    }
  };

  const fetchGamesStatsHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/admin/games-stats-history?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setStatsHistory(data.history || []);
        setTotalRegisteredUsers(data.total_registered_users || 0);
      }
    } catch (err) {
      // ignored
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    // Fetch stats immediately
    fetchOnlinePlayers();
    setTimeout(fetchAllPlayers, 500);
    setTimeout(fetchCurrentGamePlayers, 1000);

    const interval = setInterval(() => {
      fetchOnlinePlayers();
      // fetchAllPlayers y fetchCurrentGamePlayers removidos del intervalo global
      // para evitar alto consumo (Egress) en Supabase (PostgREST)
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'all_users') {
      fetchAllPlayers();
    } else if (activeTab === 'statistics_history') {
      fetchGamesStatsHistory();
    } else if (activeTab === 'control') {
      fetchCurrentGamePlayers();
    }
  }, [activeTab]);

  const toggleBlockUser = async (id: string) => {
    try {
      const res = await apiFetch(`/api/admin/players/${id}/toggle-block`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.is_blocked ? 'Usuario bloqueado' : 'Usuario desbloqueado');
        fetchAllPlayers();
      }
    } catch (err) {
      toast.error('Error al cambiar estado de bloqueo');
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Log for debugging
    console.log('File selected:', file.name, file.size, file.type);

    // Filter by extension since we removed 'accept' to avoid crash
    if (!file.name.toLowerCase().endsWith('.mp3') && !file.type.includes('audio')) {
      toast.error('Por favor sube un archivo de audio (MP3)');
      e.target.value = '';
      return;
    }

    // Limit to 10MB on client side
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande. El límite es 10MB.');
      return;
    }

    const formData = new FormData();
    formData.append('audio', file);

    setIsUploadingAudio(true);
    try {
      // Use a fresh AbortController to allow longer uploads for audio
      const res = await apiFetch('/api/admin/upload-audio', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          setBgAudioUrl(data.url);
          toast.success('Audio subido correctamente');
        } else {
          throw new Error('No se recibió la URL del servidor');
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.error || 'Error al subir el audio');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Error de conexión al subir: ${err.message || 'Desconocido'}`);
    } finally {
      setIsUploadingAudio(false);
      // Reset input value to allow re-uploading the same file
      e.target.value = '';
    }
  };

  const saveAudioSettings = async () => {
    setIsSavingAudio(true);
    try {
      const res = await apiFetch('/api/admin/settings/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: bgAudioUrl, active: bgAudioActive }),
      });

      if (res.ok) {
        toast.success('Ajustes de audio guardados');
      } else {
        toast.error('Error al guardar ajustes');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setIsSavingAudio(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    setIsUpdatingUser(true);
    try {
      const res = await apiFetch(`/api/admin/players/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingUser.name,
          phone: editingUser.phone,
          email: editingUser.email,
          state: editingUser.state,
          city: editingUser.city
        })
      });
      
      if (res.ok) {
        toast.success('Usuario actualizado correctamente');
        setEditingUser(null);
        fetchAllPlayers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al actualizar usuario');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error de conexión');
    } finally {
      setIsUpdatingUser(false);
    }
  };


  const deleteUser = async (id: string | number) => {
    setIsDeletingUser(String(id));
    try {
      const res = await apiFetch(`/api/admin/players/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Registro de usuario eliminado con éxito');
        fetchAllPlayers();
        fetchData();
        setShowDeleteModal(false);
        setUserToDelete(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Error al eliminar usuario');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setIsDeletingUser(null);
    }
  };

  const fetchWalletPlayers = async () => {
    try {
      const timestamp = Date.now();
      const tenantParam = currentTenant ? `&tenantId=${encodeURIComponent(currentTenant)}` : '';
      const res = await apiFetch(`/api/admin/players/wallets?_t=${timestamp}${tenantParam}`);
      if (res.ok) {
        const data = await res.json();
        setWalletPlayers(data);
      }
    } catch (err) {
      // ignored
    }
  };

  const fetchSupportTickets = useCallback(async () => {
    setIsLoadingTickets(true);
    try {
      const tenantParam = currentTenant ? `?tenantId=${encodeURIComponent(currentTenant)}` : '';
      const res = await apiFetch(`/api/admin/support/tickets${tenantParam}`);
      if (res.ok) {
        const data = await res.json();
        setSupportTickets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching support tickets:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  }, [currentTenant]);

  const handleResetPasswordTicket = async (ticket: any) => {
    if (!window.confirm(`¿Confirmas restablecer la contraseña de ${ticket.name} (${ticket.phone}) a 123456? Se le enviará una notificación push a su teléfono inmediatamente.`)) {
      return;
    }
    setResettingTicketId(ticket.id);
    try {
      const res = await apiFetch(`/api/admin/support/tickets/${encodeURIComponent(ticket.id)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPassword: '123456' })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.success(`Contraseña de ${ticket.name} restablecida a 123456 y notificación push enviada.`);
        fetchSupportTickets();
      } else {
        toast.error(result.error || 'Error al restablecer contraseña.');
      }
    } catch (err) {
      toast.error('Error al conectar con el servidor.');
    } finally {
      setResettingTicketId(null);
    }
  };

  const fetchRechargeRequests = async (isBackground = false) => {
    if (isFetchingRechargeRef.current) return;
    isFetchingRechargeRef.current = true;
    if (!isBackground && rechargeRequests.length === 0) {
      setIsRechargeLoading(true);
    }
    try {
      const timestamp = Date.now();
      const tenantParam = currentTenant ? `&tenantId=${encodeURIComponent(currentTenant)}` : '';
      const res = await apiFetch(`/api/admin/recharge-requests?_t=${timestamp}${tenantParam}`);
      if (res.ok) {
        const data = await res.json();
        setRechargeRequests(data);
      }
    } catch (err) {
      console.error('Error fetching recharge requests:', err);
    } finally {
      setIsRechargeLoading(false);
      isFetchingRechargeRef.current = false;
    }
  };

  const handleApproveRechargeRequest = async (requestId: string) => {
    if (processingRechargeId) return;
    setProcessingRechargeId(requestId);
    try {
      const res = await apiFetch(`/api/admin/recharge-requests/${encodeURIComponent(requestId)}/approve`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.success('¡Recarga aprobada con éxito!');
        setRechargeRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'approved', validation_reason: 'Aprobado manualmente por el organizador.' } : r));
        if (data.phone && typeof data.balance === 'number') {
          setWalletPlayers(prev => prev.map(p => comparePhones(p.phone, data.phone) ? { ...p, balance: data.balance } : p));
        }
        fetchRechargeRequests(true);
        fetchWalletPlayers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al aprobar recarga');
      }
    } catch (err) {
      toast.error('Error al conectar con el servidor');
    } finally {
      setProcessingRechargeId(null);
    }
  };

  const handleRejectRechargeRequest = async (requestId: string) => {
    if (processingRechargeId) return;
    setProcessingRechargeId(requestId);
    try {
      const res = await apiFetch(`/api/admin/recharge-requests/${encodeURIComponent(requestId)}/reject`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success('¡Recarga rechazada con éxito!');
        setRechargeRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'rejected', validation_reason: 'Rechazado manualmente por el organizador.' } : r));
        fetchRechargeRequests(true);
        fetchWalletPlayers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al rechazar recarga');
      }
    } catch (err) {
      toast.error('Error al conectar con el servidor');
    } finally {
      setProcessingRechargeId(null);
    }
  };

  const openWalletHistory = async (player: any) => {
    setHistoryPlayer(player);
    setHistoryModalOpen(true);
    setWalletHistoryData([]);
    try {
      const res = await apiFetch(`/api/wallet/history?phone=${encodeURIComponent(player.phone)}`);
      if (res.ok) {
        const data = await res.json();
        setWalletHistoryData(data);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al obtener historial');
      }
    } catch (err) {
      // ignored
      toast.error('Error de conexión al cargar historial');
    }
  };

  useEffect(() => {
    if (activeTab === 'wallet') {
      fetchWalletPlayers();
      fetchRechargeRequests();

      // Sincronización periódica de seguridad cada 15s mientras la pestaña wallet está activa (en segundo plano)
      const interval = setInterval(() => {
        fetchWalletPlayers();
        fetchRechargeRequests(true);
      }, 15000);

      // Refrescar al volver a la pestaña del navegador (en segundo plano sin parpadeo)
      const onFocus = () => {
        fetchWalletPlayers();
        fetchRechargeRequests(true);
      };
      window.addEventListener('focus', onFocus);

      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', onFocus);
      };
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'tickets') {
      fetchSupportTickets();
    }
  }, [activeTab, fetchSupportTickets]);

  const handleRecharge = async (phone: string) => {
    if (!rechargeAmount || isNaN(parseFloat(rechargeAmount))) {
      toast.error('Monto inválido');
      return;
    }

    const amountNum = parseFloat(rechargeAmount);

    try {
      const res = await apiFetch('/api/admin/wallet/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone, 
          amount: amountNum,
          tenantId: currentTenant || undefined
        })
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const confirmedBalance = typeof data.newBalance === 'number' ? data.newBalance : null;
        toast.success('Recarga exitosa');
        setRechargeAmount('');
        setSelectedWalletPlayer(null);
        // Actualización inmediata con el balance confirmado por el servidor
        setWalletPlayers((prev) =>
          prev.map((player) =>
            comparePhones(player.phone, phone)
              ? { ...player, balance: confirmedBalance !== null ? confirmedBalance : (Number(player.balance) || 0) + amountNum }
              : player
          )
        );
        // Sincronización oficial con el backend
        await fetchWalletPlayers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al recargar');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const handleDirectRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(directRechargePhone);
    const amountNum = parseFloat(directRechargeAmount);
    if (!phone || phone.length < 10) {
      toast.error('Ingresa un número de teléfono válido (al menos 10 dígitos)');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Ingresa un monto válido mayor a 0');
      return;
    }
    setIsSubmittingDirectRecharge(true);
    try {
      const res = await apiFetch('/api/admin/wallet/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          amount: amountNum,
          tenantId: currentTenant || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Recarga de ${formatCurrency(amountNum)} acreditada exitosamente al teléfono ${phone}`);
        setShowDirectRechargeModal(false);
        setDirectRechargePhone('');
        setDirectRechargeAmount('');
        await fetchWalletPlayers();
      } else {
        toast.error(data.error || 'Error al recargar saldo');
      }
    } catch (err) {
      toast.error('Error de conexión al procesar la recarga');
    } finally {
      setIsSubmittingDirectRecharge(false);
    }
  };

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) {
      stop();
    }
  }, [isMuted, stop]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // New game form state
  const [newGame, setNewGame] = useState<any>({
    name: '',
    start_time: '',
    prize: '',
    card_value: '',
    winning_pattern: 'full',
    type: 'paid', // 'paid' | 'free'
    prize_type: 'wallet', // 'wallet' | 'cash'
    active_lottery: false,
    active_draw: false,
    lottery_name: '',
    lottery_date: '',
    lottery_time: '',
    lottery_digits: '3',
    lottery_prize_type: 'cash',
    lottery_prize_value: ''
  });

  const fetchData = async () => {
    try {
      const timestamp = Date.now();
      const [gameRes, playersRes, gamesRes, patternsRes] = await Promise.all([
        apiFetch(`/api/game?_t=${timestamp}`),
        apiFetch(`/api/players?_t=${timestamp}`),
        apiFetch(`/api/games?_t=${timestamp}`),
        apiFetch(`/api/patterns?_t=${timestamp}`)
      ]);

      if (!gameRes.ok || !playersRes.ok || !gamesRes.ok || !patternsRes.ok) {
        throw new Error('Error al cargar datos de la API');
      }

      const gameData = await gameRes.json();
      if (gameData && typeof gameData.drawn_balls === 'string') {
        try { gameData.drawn_balls = JSON.parse(gameData.drawn_balls); } catch(e) { gameData.drawn_balls = []; }
      }
      console.log('fetchData', gameData);
      setGameState(gameData);
      if (gameData?.stream_id) setTwitchChannel(gameData.stream_id);
      if (gameData?.final_note) setFinalNote(gameData.final_note);
      if (gameData?.ai_knowledge_base) setAiKnowledgeBase(gameData.ai_knowledge_base);
      if (gameData?.ai_model) setAiModel(gameData.ai_model);
      const now = Date.now();
      if (gameData?.ai_chat_enabled !== undefined && !isUpdatingAiChatRef.current && (now - lastAiChatUpdateRef.current > 15000)) {
        setAiChatEnabled(gameData.ai_chat_enabled !== false);
      }
      if (gameData?.ai_fraud_detection_enabled !== undefined) {
        setAiFraudDetectionEnabled(gameData.ai_fraud_detection_enabled !== false);
      }
      if (gameData?.whatsapp_template !== undefined) setWhatsappTemplate(gameData.whatsapp_template);
      if (gameData?.whatsapp_group_link !== undefined) setWhatsappGroupLink(gameData.whatsapp_group_link);
      if (gameData?.nequi_number !== undefined) setNequiNumber(gameData.nequi_number);
      if (gameData?.header_image_url !== undefined) setHeaderImageUrl(gameData.header_image_url);
      if (gameData?.header_title !== undefined) setHeaderTitle(gameData.header_title);
      if (gameData?.header_subtitle !== undefined) setHeaderSubtitle(gameData.header_subtitle);
      if (gameData?.header_opacity !== undefined) setHeaderOpacity(gameData.header_opacity);
      if (gameData?.login_bg_image_url !== undefined) setLoginBgImageUrl(gameData.login_bg_image_url);
      if (gameData?.login_bg_opacity !== undefined) setLoginBgOpacity(gameData.login_bg_opacity);
      if (gameData?.bg_volume !== undefined) setBgVolume(gameData.bg_volume);
      if (gameData?.fx_volume !== undefined) setFxVolume(gameData.fx_volume);
      setPlayers(await playersRes.json());
      const fetchedGames = await gamesRes.json();
      console.log('Fetched games list:', fetchedGames);
      setGames(fetchedGames);
      setPatterns(await patternsRes.json());
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || '';
      if (errorMessage.includes('conexión') || errorMessage.includes('Failed to fetch')) {
        console.log('Admin: Server connection not ready yet, retrying in 5 seconds...');
        setTimeout(fetchData, 5000);
      } else {
        toast.error('Error al conectar con el servidor');
      }
    } finally {
      setLoading(false);
    }
  };

  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showResetDbConfirm, setShowResetDbConfirm] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);

  const handleResetDatabaseClean = async () => {
    setIsResettingDb(true);
    try {
      const res = await apiFetch('/api/admin/reset-database-clean', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchData();
        fetchAllPlayers();
      } else {
        toast.error(data.error || 'Error al purgar la base de datos');
      }
    } catch (err) {
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsResettingDb(false);
      setShowResetDbConfirm(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    try {
      const res = await apiFetch('/api/admin/cleanup-storage', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchData();
      } else {
        toast.error('Error al realizar la limpieza');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setIsCleaning(false);
      setShowCleanupConfirm(false);
    }
  };

  const handleCloseWinner = () => {
    setWinner(null);
    isAnnouncingWinnerRef.current = false;
  };

  useEffect(() => {
    if (!channel) return;
    fetchData();

    const onGameUpdate = (msg: any) => {
      const state = msg.data;
      if (state && typeof state.drawn_balls === 'string') {
        try { state.drawn_balls = JSON.parse(state.drawn_balls); } catch(e) { state.drawn_balls = []; }
      }
      console.log('game_update', state);
      
      const prevState = gameStateRef.current;
      const safePatterns = (state?.patterns && state.patterns.length > 0) ? state.patterns : (prevState?.patterns || []);

      setGameState((prev: any) => ({
        ...prev,
        ...state,
        patterns: safePatterns
      }));
      if (state?.stream_id) setTwitchChannel(state.stream_id);
      
      // Sync local AI toggles with broadcasted state (only if not manually updating)
      const now = Date.now();
      if (state?.ai_chat_enabled !== undefined && !isUpdatingAiChatRef.current && (now - lastAiChatUpdateRef.current > 15000)) {
        setAiChatEnabled(state.ai_chat_enabled !== false);
      }
    };
    channel.subscribe('game_update', onGameUpdate);

    const onGamesUpdated = () => {
      fetchData();
    };
    channel.subscribe('games_updated', onGamesUpdated);

    const onBallDrawn = (msg: any) => {
      console.log('DEBUG: Evento ball_drawn recibido en AdminDashboard:', msg.data);
      const ball = Number(msg.data);
      const msgId = msg.id || `${ball}-${Date.now()}`;
      
      // Deduplicate audio events to prevent overlapping locutions ("se medio menciona una y termina cantando otra")
      const now = Date.now();
      if (lastAnnouncedBallIdRef.current === msgId || (now - lastAnnouncedBallTimeRef.current < 4000)) {
        console.log('DEBUG: Omitiendo locución duplicada o muy cercana:', ball);
      } else {
        lastAnnouncedBallIdRef.current = msgId;
        lastAnnouncedBallTimeRef.current = now;
        
        console.log('DEBUG: isMutedRef.current:', isMutedRef.current);
        if (!isMutedRef.current && !isAnnouncingWinnerRef.current) {
          console.log('DEBUG: Llamando a speakBall...');
          speakBall(ball);
        } else {
          console.log('DEBUG: speakBall omitido (silenciado o anunciando ganador).');
        }
      }

      setGameState((prev: any) => {
        if (!prev) return prev;
        let currentBalls = prev.drawn_balls || [];
        if (typeof currentBalls === 'string') {
          try { currentBalls = JSON.parse(currentBalls); } catch(e) { currentBalls = []; }
        }
        if (currentBalls.includes(ball)) return prev;
        return { ...prev, drawn_balls: [...currentBalls, ball] };
      });
    };
    channel.subscribe('ball_drawn', onBallDrawn);

    const onGameReset = () => {
      setGameState((prev: any) => prev ? { ...prev, status: 'waiting', drawn_balls: [] } : prev);
      setBingoAlerts([]);
      setWinner(null);
      setWinnerQueue([]);
      activeWinnersIdsRef.current.clear();
      winnersArchiveRef.current.clear();
    };
    channel.subscribe('game_reset', onGameReset);

    const onNewPlayer = (msg: any) => {
      const player = msg.data;
      setPlayers((prev: any) => {
        const index = prev.findIndex((p: any) => p.id === player.id);
        if (index >= 0) {
          const newPlayers = [...prev];
          newPlayers[index] = player;
          return newPlayers;
        }
        return [player, ...prev];
      });
    };
    channel.subscribe('new_player', onNewPlayer);

    const onPlayerApproved = () => {
      fetchData();
    };
    channel.subscribe('player_approved', onPlayerApproved);

    const onBingoCalled = async (msg: any) => {
      const alert = msg.data;
      const winners = alert.winners || [{ 
        player_id: alert.player_id, 
        player_name: alert.player_name, 
        card_number: alert.card_number,
        grid: alert.grid,
        marked_cells: alert.marked_cells
      }];
      
      const firstWinner = winners[0];
      const winId = alert.game_pattern_id ? `${alert.game_pattern_id}` : `${firstWinner.player_id}-${alert.pattern_name}`;
      
      // Update local patterns state for immediate UI feedback
      setGameState((prev: any) => {
        if (!prev || !prev.patterns) return prev;
        return {
          ...prev,
          patterns: prev.patterns.map((p: any) => 
            (alert.game_pattern_id ? String(p.game_pattern_id) === String(alert.game_pattern_id) : p.name === alert.pattern_name)
              ? { 
                  ...p, 
                  winner_player_id: firstWinner.player_id, 
                  winner_name: winners.length > 1 ? winners.map(w => w.player_name).join(', ') : firstWinner.player_name, 
                  winner_card_number: winners.length > 1 ? 'Múltiples' : firstWinner.card_number, 
                  won_at: new Date().toISOString() 
                }
              : p
          )
        };
      });

      // Update winners list
      setWinners((prev) => {
        const newWinners = winners.map(w => ({
          id: alert.game_pattern_id || Math.random(),
          prize: alert.shared_prize_per_player || alert.prize || '0',
          won_at: new Date().toISOString(),
          payment_status: 'pending',
          rejection_reason: '',
          player_name: w.player_name || 'Desconocido',
          player_phone: w.player_phone || 'Desconocido', 
          game_name: 'Juego Actual', 
          pattern_name: alert.pattern_name || 'Patrón'
        }));
        return [...newWinners, ...prev];
      });

      // Strict duplicate prevention for the queue
      if (winnersArchiveRef.current.has(winId)) return;
      winnersArchiveRef.current.add(winId);

      // Add to queue for sequential processing
      setWinnerQueue(prev => [...prev, alert]);
      setBingoAlerts((prev: any) => [alert, ...prev]);
    };
    channel.subscribe('bingo_called', onBingoCalled);

    const onGameFinished = (msg: any) => {
      setAutoplay(false);
      // Wait 10 seconds before showing summary to allow last winner popup to be seen
      setTimeout(() => {
        setGameFinished(msg.data);
      }, 10000);
    };
    channel.subscribe('game_finished', onGameFinished);

    const onStreamStatusUpdated = (msg: any) => {
      const active = msg.data.active;
      setGameState((prev: any) => prev ? { ...prev, stream_active: active ? 1 : 0 } : prev);
    };
    channel.subscribe('stream_status_updated', onStreamStatusUpdated);

    const onStreamUpdated = (msg: any) => {
      const id = msg.data;
      setTwitchChannel(id);
      setGameState((prev: any) => prev ? { ...prev, stream_id: id } : prev);
    };
    channel.subscribe('stream_updated', onStreamUpdated);

    const onChatStatusUpdated = (msg: any) => {
      const enabled = msg.data.enabled;
      setIsChatEnabled(enabled);
    };
    channel.subscribe('chat_status_updated', onChatStatusUpdated);

    const onWalletUpdated = (msg: any) => {
      console.log('DEBUG: Evento wallet_updated recibido en AdminDashboard:', msg.data);
      const { phone, balance } = msg.data;
      // Actualizar saldo en la lista de billeteras inmediatamente (si el jugador ya está en la vista)
      setWalletPlayers((prev) => {
        const exists = prev.some((player) => comparePhones(player.phone, phone));
        if (exists) {
          return prev.map((player) =>
            comparePhones(player.phone, phone)
              ? { ...player, balance }
              : player
          );
        }
        // Si el jugador no está en la lista, refrescar la lista completa
        fetchWalletPlayers();
        return prev;
      });
      // También refrescar solicitudes de recarga en segundo plano para mostrar cambios de estado sin parpadeo
      fetchRechargeRequests(true);
    };
    channel.subscribe('wallet_updated', onWalletUpdated);

    const onServerAutoplayUpdated = (msg: any) => {
      console.log('DEBUG: Evento server_autoplay_updated:', msg.data);
      if (typeof msg.data?.isRunning === 'boolean') {
        setAutoplay(msg.data.isRunning);
      }
    };
    channel.subscribe('server_autoplay_updated', onServerAutoplayUpdated);

    const onRechargeRequestSubmitted = (msg: any) => {
      console.log('DEBUG: Evento recharge_request_submitted recibido en AdminDashboard:', msg.data);
      fetchRechargeRequests(true);
    };
    channel.subscribe('recharge_request_submitted', onRechargeRequestSubmitted);

    const onTicketCreated = (msg: any) => {
      toast('Nueva solicitud de recuperación de contraseña', { icon: '🔐' });
      fetchSupportTickets();
    };
    const onTicketResolved = (msg: any) => {
      fetchSupportTickets();
    };
    channel.subscribe('ticket_created', onTicketCreated);
    channel.subscribe('ticket_resolved', onTicketResolved);

    return () => {
      channel.unsubscribe('game_update', onGameUpdate);
      channel.unsubscribe('games_updated', onGamesUpdated);
      channel.unsubscribe('ball_drawn', onBallDrawn);
      channel.unsubscribe('game_reset', onGameReset);
      channel.unsubscribe('new_player', onNewPlayer);
      channel.unsubscribe('player_approved', onPlayerApproved);
      channel.unsubscribe('bingo_called', onBingoCalled);
      channel.unsubscribe('game_finished', onGameFinished);
      channel.unsubscribe('stream_status_updated', onStreamStatusUpdated);
      channel.unsubscribe('stream_updated', onStreamUpdated);
      channel.unsubscribe('chat_status_updated', onChatStatusUpdated);
      channel.unsubscribe('wallet_updated', onWalletUpdated);
      channel.unsubscribe('server_autoplay_updated', onServerAutoplayUpdated);
      channel.unsubscribe('recharge_request_submitted', onRechargeRequestSubmitted);
      channel.unsubscribe('ticket_created', onTicketCreated);
      channel.unsubscribe('ticket_resolved', onTicketResolved);
    };
  }, [channel, fetchSupportTickets]);

  // Sync server autoplay status on mount
  useEffect(() => {
    apiFetch('/api/admin/game/autoplay/status')
      .then(res => res.json())
      .then(data => {
        if (typeof data.isRunning === 'boolean') {
          setAutoplay(data.isRunning);
        }
      })
      .catch(() => {});
  }, []);

  // Countdown and Auto-start logic sincronizado con jugadores
  useEffect(() => {
    const timer = setInterval(() => {
      if ((gameState?.status === 'waiting' || gameState?.status === 'scheduled') && gameState?.start_time) {
        const now = new Date().getTime();
        const start = new Date(gameState.start_time).getTime();
        const diff = start - now;

        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);

          setTimeLeft({ days, hours, minutes, seconds });
          setTimeToStart(`${days > 0 ? `${days}d ` : ''}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
          setAutoStartTimer(null);
        } else {
          setTimeLeft(null);
          setTimeToStart(null);
          // If server already activated the game or autoplay is active, clear local timer and avoid dual-trigger
          if (gameState?.status === 'playing' || autoplay) {
            setAutoStartTimer(null);
            return;
          }
          // Fallback manual countdown only if server didn't auto-activate
          if (autoStartTimer === null) {
            setAutoStartTimer(30);
          } else if (autoStartTimer > 0) {
            setAutoStartTimer(prev => (prev !== null ? prev - 1 : null));
          } else if (autoStartTimer === 0) {
            setAutoStartTimer(null);
            if (gameState?.status === 'waiting' || gameState?.status === 'scheduled') {
              updateGameStatus('playing');
              apiFetch('/api/admin/game/autoplay/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ interval: autoplayInterval, gameId: gameState.id })
              }).catch(() => {});
            }
          }
        }
      } else {
        setTimeLeft(null);
        setTimeToStart(null);
        setAutoStartTimer(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState?.status, gameState?.start_time, autoStartTimer, autoplay, autoplayInterval]);

  const [isPreGameCountdown, setIsPreGameCountdown] = useState(false);
  const [preGameTime, setPreGameTime] = useState(5);

  // Pre-game Countdown & Rules Announcement
  useEffect(() => {
    let timer: any;
    if (isPreGameCountdown && preGameTime > 0) {
      timer = setInterval(() => {
        setPreGameTime(prev => prev - 1);
      }, 1000);
    } else if (isPreGameCountdown && preGameTime === 0) {
      setIsPreGameCountdown(false);
      toggleAutoplay();
    }
    return () => clearInterval(timer);
  }, [isPreGameCountdown, preGameTime]);

  const handleStartAutoplayServer = async (overrideSpeed?: number) => {
    if (!gameState?.id) {
      toast.error('No hay juego activo');
      return;
    }
    const speed = overrideSpeed || autoplayInterval;
    setAutoplay(true);
    try {
      const res = await apiFetch('/api/admin/game/autoplay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: speed, gameId: gameState.id })
      });
      if (res.ok) {
        toast.success(`Sorteo automático iniciado (${speed}s / balota)`);
      } else {
        setAutoplay(false);
        toast.error('Error al iniciar sorteo automático');
      }
    } catch (err) {
      setAutoplay(false);
      toast.error('Error de conexión al iniciar sorteo automático');
    }
  };

  const handleStopAutoplayServer = async () => {
    setAutoplay(false);
    try {
      const res = await apiFetch('/api/admin/game/autoplay/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameState?.id })
      });
      if (res.ok) {
        toast.success('Sorteo automático detenido');
      }
    } catch (err) {
      toast.error('Error de conexión al detener sorteo automático');
    }
  };

  const toggleAutoplay = async () => {
    if (!gameState?.id) {
      toast.error('No hay juego activo');
      return;
    }
    const nextState = !autoplay;
    setAutoplay(nextState);
    try {
      if (nextState) {
        const res = await apiFetch('/api/admin/game/autoplay/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interval: autoplayInterval, gameId: gameState.id })
        });
        if (res.ok) {
          toast.success(`Autoplay iniciado en Servidor (${autoplayInterval}s)`);
        } else {
          setAutoplay(false);
          toast.error('Error al iniciar autoplay en el servidor');
        }
      } else {
        const res = await apiFetch('/api/admin/game/autoplay/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameState.id })
        });
        if (res.ok) {
          toast.success('Autoplay detenido en Servidor');
        }
      }
    } catch (err) {
      toast.error('Error de conexión al controlar autoplay');
    }
  };

  const startPreGameSequence = () => {
    if (!gameState?.id) {
      toast.error('No hay juego activo, por favor crea uno nuevo o activa uno existente en el Lobby.');
      return;
    }
    winnersArchiveRef.current.clear();
    setWinnerQueue([]);
    setIsPreGameCountdown(true);
    setPreGameTime(5);
  };

  const toggleAudio = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    isMutedRef.current = newMutedState;
  };

  const triggerGritoBingoSound = async () => {
    const finalUrl = gritoBingoConfig.url || gritoBingoConfig.fallbackUrl;
    
    // Play Locally for Admin
    if (!isMuted) {
      try {
        if (!finalUrl || finalUrl.includes('mixkit.co')) {
          playSynthesizedDJEffect('slot_grito_bingo', fxVolume);
        } else {
          const proxiedUrl = getProxyUrl(finalUrl);
          const sfxAudio = new Audio(proxiedUrl);
          sfxAudio.volume = fxVolume;
          sfxAudio.onerror = () => {
             playSynthesizedDJEffect('slot_grito_bingo', fxVolume);
          };
          sfxAudio.play().catch((e) => {
             console.warn('Local admin playback blocked, falling back to Web Audio synth', e);
             playSynthesizedDJEffect('slot_grito_bingo', fxVolume);
          });
        }
      } catch (audioErr) {
        console.error('Local SFX local playback exception, playing synthesized:', audioErr);
        playSynthesizedDJEffect('slot_grito_bingo', fxVolume);
      }
    }

    // Broadcast globally to players!
    try {
      const res = await apiFetch('/api/admin/trigger-dj-sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: 'slot_grito_bingo',
          url: finalUrl,
          name: gritoBingoConfig.name
        })
      });

      if (res.ok) {
        toast(`¡Efecto "${gritoBingoConfig.name}" disparado en vivo!`, { icon: '🔥' });
      } else {
        const errData = await res.json();
        toast.error(`Error de transmisión: ${errData.error || 'falla del servidor'}`);
      }
    } catch (err) {
      console.error('Error triggering DJ sound:', err);
      toast.error('Error de red al transmitir sonido');
    }
  };

  const triggerAnunciosSound = async () => {
    const finalUrl = anunciosConfig.url || anunciosConfig.fallbackUrl;
    
    // Play Locally for Admin
    if (!isMuted) {
      try {
        if (!finalUrl || finalUrl.includes('mixkit.co')) {
          playSynthesizedDJEffect('slot_anuncios', fxVolume);
        } else {
          const proxiedUrl = getProxyUrl(finalUrl);
          const sfxAudio = new Audio(proxiedUrl);
          sfxAudio.volume = fxVolume;
          sfxAudio.onerror = () => {
             playSynthesizedDJEffect('slot_anuncios', fxVolume);
          };
          sfxAudio.play().catch((e) => {
             console.warn('Local admin playback blocked, falling back to Web Audio synth', e);
             playSynthesizedDJEffect('slot_anuncios', fxVolume);
          });
        }
      } catch (audioErr) {
        console.error('Local SFX local playback exception, playing synthesized:', audioErr);
        playSynthesizedDJEffect('slot_anuncios', fxVolume);
      }
    }

    // Broadcast globally to players!
    try {
      const res = await apiFetch('/api/admin/trigger-dj-sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: 'slot_anuncios',
          url: finalUrl,
          name: anunciosConfig.name
        })
      });

      if (res.ok) {
        toast(`¡Efecto "${anunciosConfig.name}" disparado en vivo!`, { icon: '📢' });
      } else {
        const errData = await res.json();
        toast.error(`Error de transmisión: ${errData.error || 'falla del servidor'}`);
      }
    } catch (err) {
      console.error('Error triggering DJ sound:', err);
      toast.error('Error de red al transmitir sonido');
    }
  };

  const handleSendAIAnnouncement = async () => {
    if (!aiAnnouncementText.trim()) {
      toast.error('Por favor escribe algún texto para el anuncio inteligente.');
      return;
    }
    if (aiAnnouncementSaveAsPreset && !aiAnnouncementPresetTitle.trim()) {
      toast.error('Por favor ingresa un título para guardar la plantilla.');
      return;
    }
    setIsBroadcastingAI(true);
    try {
      const res = await apiFetch('/api/admin/broadcast-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiAnnouncementText.trim(),
          voice: aiAnnouncementVoice,
          audio_base64: aiAnnouncementAudioBase64
        })
      });
      if (res.ok) {
        toast.success('¡Anuncio Inteligente por Voz de IA emitido a todo el juego!', { icon: '🤖' });
        
        const data = await res.json();
        const generatedAudio = data.audio_base64 || aiAnnouncementAudioBase64;

        if (aiAnnouncementSaveAsPreset) {
          try {
            const saveRes = await apiFetch('/api/ai-presets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: aiAnnouncementPresetTitle.trim(),
                text: aiAnnouncementText.trim(),
                voice: aiAnnouncementVoice,
                audio_base64: generatedAudio
              })
            });
            if (saveRes.ok) {
              const newPreset = await saveRes.json();
              setAiPresets(prev => [...prev, {
                id: String(newPreset.id),
                title: newPreset.title,
                text: newPreset.text,
                voice: newPreset.voice,
                audio_base64: newPreset.audio_base64
              }]);
              toast.success('¡Anuncio guardado como plantilla en la base de datos!');
            }
          } catch(err) {
            console.error('Error auto-saving preset', err);
          }
        }

        setAiAnnouncementText('');
        setAiAnnouncementAudioBase64(null);
        setAiAnnouncementSaveAsPreset(false);
        setAiAnnouncementPresetTitle('');
        setShowAIAnnouncementModal(false);
      } else {
        const errData = await res.json();
        toast.error(`Error al emitir anuncio de IA: ${errData.error || 'falla del servidor'}`);
      }
    } catch (err: any) {
      console.error('Error sending AI announcement:', err);
      toast.error('Error de red al emitir el anuncio inteligente.');
    } finally {
      setIsBroadcastingAI(false);
    }
  };

  const handleSendSavedAudio = async (item: { id: string; title: string; text: string; voice?: string; audio_base64?: string }) => {
    setIsBroadcastingAI(true);
    try {
      const res = await apiFetch('/api/admin/broadcast-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: item.text,
          voice: item.voice || 'Kore',
          audio_base64: item.audio_base64
        })
      });
      if (res.ok) {
        toast.success(`¡Audio reutilizado emitido: ${item.title}!`, { icon: '📢' });
      } else {
        const errData = await res.json();
        toast.error(`Error al emitir anuncio de IA: ${errData.error || 'falla del servidor'}`);
      }
    } catch (err: any) {
      console.error('Error sending saved AI announcement:', err);
      toast.error('Error de red al emitir el anuncio inteligente.');
    } finally {
      setIsBroadcastingAI(false);
    }
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetFormTitle.trim() || !presetFormText.trim()) {
      toast.error('El título y contenido del mensaje son obligatorios.');
      return;
    }

    setIsGeneratingPresetAudio(true);
    let audio_base64 = '';
    try {
      const audioRes = await apiFetch('/api/admin/generate-ai-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: presetFormText.trim(), voice: presetFormVoice })
      });
      if (audioRes.ok) {
        const audioData = await audioRes.json();
        audio_base64 = audioData.audio_base64 || '';
      }
    } catch(err) {
      console.warn('Could not generate voice for preset', err);
    }
    setIsGeneratingPresetAudio(false);

    try {
      const res = await apiFetch('/api/ai-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPresetId,
          title: presetFormTitle.trim(),
          text: presetFormText.trim(),
          voice: presetFormVoice,
          audio_base64
        })
      });
      if (res.ok) {
        const dbPreset = await res.json();
        let updated;
        if (editingPresetId) {
          updated = aiPresets.map((p) => p.id === editingPresetId ? { ...p, title: dbPreset.title, text: dbPreset.text, voice: dbPreset.voice, audio_base64: dbPreset.audio_base64 } : p);
          toast.success('¡Plantilla personalizada y voz AI guardadas!');
        } else {
          updated = [...aiPresets, { id: String(dbPreset.id), title: dbPreset.title, text: dbPreset.text, voice: dbPreset.voice, audio_base64: dbPreset.audio_base64 }];
          toast.success('¡Nueva plantilla de voz AI guardada en la lista!');
        }
        setAiPresets(updated);
      } else {
        toast.error('Error al guardar mensaje en la base de datos.');
      }
    } catch (err) {
      console.error('Error saving preset to DB:', err);
      toast.error('Error de red al guardar la plantilla.');
    }

    // Reset Form
    setEditingPresetId(null);
    setPresetFormTitle('');
    setPresetFormText('');
    setShowPresetForm(false);
  };

  const startEditPreset = (preset: { id: string; title: string; text: string }) => {
    setEditingPresetId(preset.id);
    setPresetFormTitle(preset.title);
    setPresetFormText(preset.text);
    setShowPresetForm(true);
  };

  const handleDeletePreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Estás seguro de eliminar este mensaje personalizado de la lista?')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/ai-presets/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const updated = aiPresets.filter((p) => p.id !== id);
        setAiPresets(updated);
        toast.success('Mensaje eliminado de la lista.');
      } else {
        toast.error('Error al eliminar mensaje de la base de datos.');
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
      toast.error('Error de red al eliminar la plantilla.');
    }
    
    // If we were editing that deleted preset, reset form
    if (editingPresetId === id) {
      setEditingPresetId(null);
      setPresetFormTitle('');
      setPresetFormText('');
      setShowPresetForm(false);
    }
  };

  const handleResetPresets = async () => {
    if (!window.confirm('¿Deseas restaurar la lista de mensajes predeterminados? Se perderán tus mensajes personalizados.')) {
      return;
    }

    try {
      const customPresets = aiPresets.filter(p => !p.id.startsWith('preset_'));
      for (const cp of customPresets) {
        await apiFetch(`/api/ai-presets/${cp.id}`, { method: 'DELETE' });
      }
    } catch (err) {
      console.error('Error resetting custom presets in DB:', err);
    }

    const defaults = [
      { id: 'preset_1', title: 'Reglas de Juego 📋', text: 'Atención jugadores, las reglas para esta ronda son las siguientes: el primer jugador en completar el patrón de juego ganará el premio mayor. ¡Mucha suerte a todos!' },
      { id: 'preset_2', title: 'Lobby Inicio ⏳', text: 'Hola a todos los apasionados del Bingo. Estamos preparando las balotas de la suerte, el juego iniciará en breve. ¡Preparen sus cartones!' },
      { id: 'preset_3', title: 'Advertencia 🚨', text: '¡Último llamado para adquirir y recargar saldo para participar en esta gran ronda! No se queden por fuera de los grandes sorteos.' }
    ];
    setAiPresets(defaults);
    toast.success('Mensajes predeterminados restaurados.');
  };

  const speakBall = (ball: number) => {
    if (isMutedRef.current) return; // No hablar si está silenciado
    announceBall(ball);
  };

  const createPattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatternName.trim()) {
      toast.error('El patrón debe tener un nombre');
      return;
    }
    
    // Normalizar a cuadrícula 5x5 segura antes de validar y enviar
    const safeGrid = getSafePatternGrid(newPatternGrid);
    const hasMarkedCell = safeGrid.some(row => row.some(cell => cell));
    if (!hasMarkedCell) {
      toast.error('Debes marcar al menos una casilla en el patrón');
      return;
    }

    try {
      const res = await apiFetch('/api/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: editingPatternId,
          name: newPatternName.trim(), 
          grid: safeGrid,
          is_active: newPatternIsActive
        }),
      });
      if (res.ok) {
        toast.success(editingPatternId ? 'Patrón actualizado' : 'Patrón creado correctamente');
        setNewPatternName('');
        setNewPatternGrid(Array(5).fill(null).map(() => Array(5).fill(false)));
        setEditingPatternId(null);
        setNewPatternIsActive(true);
        fetchData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Error al guardar el patrón');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar el patrón');
    }
  };

  const editPattern = (pattern: any) => {
    setEditingPatternId(pattern.id);
    setNewPatternName(pattern.name || '');
    // Normalizar explícitamente la cuadrícula a matriz 5x5 booleana para evitar que arrays 1D rompan el componente
    setNewPatternGrid(getSafePatternGrid(pattern.grid));
    setNewPatternIsActive(pattern.is_active !== false);
    setActiveTab('patterns');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const togglePatternStatus = async (pattern: any) => {
    try {
      const res = await apiFetch('/api/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: pattern.id,
          name: pattern.name, 
          grid: getSafePatternGrid(pattern.grid),
          is_active: !pattern.is_active
        }),
      });
      if (res.ok) {
        toast.success(pattern.is_active ? 'Patrón ocultado' : 'Patrón activado');
        fetchData();
      }
    } catch (err) {
      toast.error('Error al actualizar el estado');
    }
  };

  const deletePattern = async (id: number) => {
    try {
      const res = await apiFetch(`/api/patterns/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Patrón eliminado');
        fetchData();
      }
    } catch (err) {
      toast.error('Error al eliminar el patrón');
    }
  };

  const togglePatternCell = (r: number, c: number) => {
    if (r === 2 && c === 2) return; // FREE space
    const safeGrid = getSafePatternGrid(newPatternGrid);
    const newGrid = safeGrid.map(row => [...row]);
    newGrid[r][c] = !newGrid[r][c];
    setNewPatternGrid(newGrid);
  };

  const createGame = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (gameWizardStep === 1) {
      if (!newGame.name?.trim()) {
        toast.error('Ingresa el nombre del juego');
        return;
      }
      if (!newGame.start_time) {
        toast.error('Selecciona la fecha y hora de inicio');
        return;
      }
      if (newGame.type === 'paid') {
        const valNum = Number(String(newGame.card_value || '').replace(/\D/g, ''));
        if (!valNum || valNum <= 0) {
          toast.error('Ingresa un valor válido para el cartón');
          return;
        }
      }
      if (!newGame.prize?.trim()) {
        toast.error('Ingresa los premios a repartir');
        return;
      }
      if (newGame.active_lottery) {
        if (!newGame.lottery_name?.trim() || !newGame.lottery_prize_value?.trim()) {
          toast.error('Completa el nombre y premio de la lotería, o desactiva la opción.');
          return;
        }
      }
      setGameWizardStep(2);
      return;
    }
    
    if (gameWizardStep === 2) {
      if (gameWizardPatterns.length === 0) {
        toast.error('Debes asignar al menos un patrón');
        return;
      }
      setGameWizardStep(3);
      return;
    }

    if (gameWizardStep === 3) {
      setGameWizardStep(4);
      return;
    }

    if (gameWizardStep === 4) {
      let isoString = new Date().toISOString();
      try {
        if (newGame.start_time) {
          isoString = new Date(newGame.start_time).toISOString();
        }
      } catch (e) {
        isoString = new Date().toISOString();
      }

      try {
        const res = await apiFetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ...newGame, 
            card_value: newGame.type === 'free' ? 0 : newGame.card_value,
            start_time: isoString,
            patterns: gameWizardPatterns,
            rematchPatterns: gameWizardRematchPatterns
          }),
        });
        if (res.ok) {
          const createdGame = await res.json();
          setGames(prev => [createdGame, ...prev]);
          toast.success('Juego programado correctamente');
          setNewGame({ 
            name: '', 
            start_time: '', 
            prize: '', 
            card_value: '', 
            winning_pattern: 'full', 
            type: 'paid', 
            prize_type: 'wallet', 
            active_lottery: false, 
            active_draw: false, 
            lottery_name: '', 
            lottery_date: '', 
            lottery_time: '', 
            lottery_digits: '3',
            lottery_prize_type: 'cash',
            lottery_prize_value: ''
          });
          setGameWizardStep(1);
          setGameWizardPatterns([]);
          setGameWizardRematchPatterns([]);
          
          // Add a small delay robustly for the replica DB update
          setTimeout(() => {
            fetchData();
          }, 1000);
        } else {
          try {
            const data = await res.json();
            toast.error(data.error || 'Error al crear el juego (Servidor)');
          } catch(e) {
            toast.error('Error al crear el juego (Estado: ' + res.status + ')');
          }
        }
      } catch (err: any) {
        toast.error(err?.message || 'Error al crear el juego');
      }
    }
  };

  const addPatternToGame = (patternId: number, prize: string) => {
    if (!prize.trim()) {
      toast.error('Debes asignar un premio al patrón');
      return;
    }
    if (gameWizardPatterns.some(p => p.pattern_id === patternId)) {
      toast.error('Este patrón ya está asignado');
      return;
    }
    setGameWizardPatterns([...gameWizardPatterns, { pattern_id: patternId, prize }]);
  };

  const removePatternFromGame = (patternId: number) => {
    setGameWizardPatterns(gameWizardPatterns.filter(p => p.pattern_id !== patternId));
  };

  const addRematchPatternToGame = (patternId: number, prize: string) => {
    if (!prize.trim()) {
      toast.error('Debes asignar un premio al patrón de revancha');
      return;
    }
    if (gameWizardRematchPatterns.some(p => p.pattern_id === patternId)) {
      toast.error('Este patrón de revancha ya está asignado');
      return;
    }
    setGameWizardRematchPatterns([...gameWizardRematchPatterns, { pattern_id: patternId, prize }]);
  };

  const removeRematchPatternFromGame = (patternId: number) => {
    setGameWizardRematchPatterns(gameWizardRematchPatterns.filter(p => p.pattern_id !== patternId));
  };

  const deleteGame = async (id: number) => {
    const res = await apiFetch(`/api/games/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Juego eliminado');
    } else {
      toast.error('No se puede eliminar el juego por defecto');
    }
  };

  const updateGame = async (gameId: number, data: any) => {
    try {
      const res = await apiFetch(`/api/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast.success('Juego actualizado');
        setShowEditGameModal(false);
        setEditingGame(null);
        fetchData();
      } else {
        toast.error('Error al actualizar el juego');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const activateGame = async (id: number) => {
    try {
      const res = await apiFetch(`/api/games/${id}/activate`, { method: 'POST' });
      if (res.ok) {
        toast.success('Juego activado');
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al activar el juego');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  const updateGameStatus = async (status: string) => {
    if (status === 'paused') {
      setAutoplay(false);
    }
    try {
      const res = await apiFetch('/api/game/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, gameId: gameState?.id }),
      });
      if (res.ok) {
        toast.success(`Estado del juego actualizado a: ${status}`);
        fetchData();
      } else {
        toast.error('Error al actualizar estado del juego');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const updateWinningPattern = async (winning_pattern: string) => {
    try {
      const res = await apiFetch('/api/game/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winning_pattern }),
      });
      if (res.ok) {
        toast.success(`Patrón de victoria cambiado a: ${winning_pattern}`);
        fetchData();
      } else {
        toast.error('Error al cambiar patrón');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const isDrawingBall = useRef(false);
  const drawBall = async () => {
    if (!gameState?.id) {
      toast.error('No hay juego activo, por favor crea uno nuevo.');
      return;
    }

    if (isDrawingBall.current) {
      console.log('Ball drawing in progress...');
      return;
    }

    if (isAnnouncingWinnerRef.current) {
      console.log('Cannot draw ball: AI is announcing a winner');
      return;
    }
    
    if (!['waiting', 'playing'].includes(gameState?.status)) {
      console.warn('Cannot draw ball: game status is', gameState?.status);
      return;
    }

    if ((gameState?.drawn_balls?.length || 0) >= 75) {
      toast.error('Todas las balotas ya han sido jugadas.');
      setAutoplay(false);
      return;
    }
    
    try {
      isDrawingBall.current = true;
      console.log('Drawing ball...');
      const res = await apiFetch('/api/game/draw', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        console.error('Error drawing ball:', data.error);
        toast.error(`Error: ${data.error || 'No se pudo sortear'}`);
      } else {
        console.log('Ball drawn successfully:', data.ball);
      }
    } catch (err) {
      console.error('Network error drawing ball:', err);
      toast.error('Error de conexión al sortear balota');
      if (autoplay) {
        setAutoplay(false);
        console.warn('Autoplay disabled due to network error');
      }
    } finally {
      isDrawingBall.current = false;
    }
  };

  const resetGame = async () => {
    try {
      const res = await apiFetch('/api/game/reset', { method: 'POST' });
      if (res.ok) {
        toast.success('Juego reiniciado');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al reiniciar juego');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  const approvePlayer = async (id: number | string) => {
    try {
      const res = await apiFetch(`/api/players/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        toast.success('Jugador aprobado y cartones generados');
        fetchData();
        fetchAllPlayers();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al aprobar jugador');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const approveAllPlayers = async () => {
    const pendingCount = players.filter(p => p.status === 'pending').length;
    if (pendingCount === 0) {
      toast.error('No hay jugadores pendientes para aprobar');
      return;
    }

    if (!confirm(`¿Estás seguro de aprobar a los ${pendingCount} jugadores pendientes de forma masiva? Esto generará sus cartones automáticamente.`)) return;

    try {
      const res = await apiFetch('/api/admin/players/approve-all', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || '¡Jugadores aprobados masivamente!');
        fetchData();
        fetchAllPlayers();
      } else {
        toast.error(data.error || 'Error al aprobar masivamente');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const rejectPlayer = async (id: number | string) => {
    if (!confirm('¿Estás seguro de rechazar la solicitud de este jugador y eliminar sus cartones?')) return;
    try {
      const res = await apiFetch(`/api/players/${id}/reject`, { method: 'POST' });
      if (res.ok) {
        toast.success('Compra rechazada y cartones eliminados exitosamente');
        fetchData();
        fetchAllPlayers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al rechazar jugador');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando panel...</div>;
  if (!user) return null; // Early return to avoid renders without user during logout

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-slate-800 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2 whitespace-nowrap">
                <Trophy className="text-yellow-400" size={24} />
                PANEL DE CONTROL
              </h1>
              <button 
                onClick={() => setShowStatsModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider transition transform hover:scale-105 active:scale-95 shadow-md shadow-blue-600/30"
              >
                <BarChart2 size={13} className="text-blue-200" />
                <span>Ver Estadísticas</span>
              </button>
            </div>
            <p className="text-slate-400 font-medium mt-1">Administración de Bingo Online</p>
          </div>
          
          <div className="flex items-center gap-3">
            {user?.isSuperAdmin && (
              <Link 
                to="/superadmin"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition transform hover:scale-105 active:scale-95"
              >
                <Shield size={20} />
                <span>Super Admin</span>
              </Link>
            )}
            <PWAInstallButton className="hidden sm:flex" />
            <NotificationBell />
            <button 
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border-2 border-red-500/50 rounded-xl font-bold transition"
            >
              <LogOut size={20} />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
            <span className={clsx(
              "px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider border-2",
              gameState?.status === 'playing' ? "bg-green-500/20 text-green-400 border-green-500" : 
              gameState?.status === 'paused' ? "bg-yellow-500/20 text-yellow-400 border-yellow-500" : 
              gameState?.status === 'finished' ? "bg-red-500/20 text-red-400 border-red-500" : 
              "bg-slate-700 text-slate-300 border-slate-600"
            )}>
              Estado: {gameState?.status}
            </span>
          </div>
        </div>

        {/* Tabs Navigation - Slide Tabs */}
        <div className="bg-white p-2 rounded-2xl shadow-lg border border-slate-200 mb-6 sticky top-0 z-40 backdrop-blur-md bg-white/90">
          <div className="flex overflow-x-auto pb-1.5 gap-2 scrollbar-hide snap-x scroll-smooth px-1">
            {[
              { id: 'control', icon: <Play size={16} />, label: 'Consola', color: 'bg-blue-600' },
              { id: 'auto_draws', icon: <Zap size={16} />, label: 'Sorteo Auto', color: 'bg-emerald-600' },
              { id: 'games', icon: <Calendar size={16} />, label: 'Lobby', color: 'bg-blue-600' },
              { id: 'patterns', icon: <Grid size={16} />, label: 'Patrones', color: 'bg-blue-600' },
              { id: 'users', icon: <Clock size={16} />, label: 'Pagos', color: 'bg-blue-600' },
              { id: 'all_users', icon: <Users size={16} />, label: 'Jugadores', color: 'bg-blue-600' },
              { id: 'sellers', icon: <Users size={16} />, label: 'Sellers', color: 'bg-blue-600' },
              { id: 'wallet', icon: <Wallet size={16} />, label: 'Billeteras', color: 'bg-blue-600' },
              { id: 'notifications', icon: <BellRing size={16} />, label: 'Push', color: 'bg-indigo-600' },
              { id: 'tickets', icon: <Key size={16} />, label: 'Tickets Claves 🔐', color: 'bg-amber-600' },
              { id: 'winners_history', icon: <Trophy size={16} />, label: 'Ganadores', color: 'bg-yellow-600' },
              { id: 'free_winners', icon: <Gift size={16} />, label: 'Premios Gratis $300K', color: 'bg-gradient-to-r from-amber-500 to-yellow-600' },
              { id: 'lottery_numbers', icon: <Gift size={16} />, label: 'Lotería', color: 'bg-amber-600' },
              { id: 'dj_board', icon: <Music size={16} />, label: 'DJ Board', color: 'bg-purple-600' },
              { id: 'ai_voice_studio', icon: <Bot size={16} />, label: 'Voz IA 🤖', color: 'bg-gradient-to-r from-purple-600 to-pink-600' },
              { id: 'virtual_mixer', icon: <Sliders size={16} />, label: 'Mezclador', color: 'bg-pink-600' },
              { id: 'statistics_history', icon: <BarChart2 size={16} />, label: 'Historial', color: 'bg-slate-600' },
              { id: 'settings', icon: <Settings size={16} />, label: 'Ajustes', color: 'bg-slate-700' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as Tab);
                  // Optional: scroll to active tab on click
                }}
                className={clsx(
                  "flex-none flex items-center gap-2 px-4 py-2.5 rounded-xl font-black transition-all text-[11px] uppercase tracking-widest snap-start",
                  activeTab === tab.id 
                    ? `${tab.color} text-white shadow-lg scale-[1.02]` 
                    : "bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200"
                )}
              >
                {tab.icon}
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Content Area */}
        <div className="flex-1">

        {/* Modal de Estadísticas Instantáneas */}
        <AnimatePresence>
          {showStatsModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
              onClick={() => setShowStatsModal(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Subtle background glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="p-6 md:p-8 space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div>
                      <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        Estadísticas en Tiempo Real
                      </h3>
                      <p className="text-xs text-slate-400 font-medium mt-1">
                        Monitoreo activo de la sala y los jugadores del Bingo
                      </p>
                    </div>
                    <button 
                      onClick={() => setShowStatsModal(false)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {(() => {
                    const totalCardsSold = (players || []).reduce((sum: number, p: any) => sum + (p.cards?.length || 0), 0);
                    return (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 py-4">
                        {/* 1. Online Count */}
                        <div className="space-y-2 bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">
                            En Línea (Streaming)
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-extrabold text-white tracking-tight">
                              {onlinePlayersCount}
                            </span>
                            {onlinePlayersCount > 0 && (
                              <button 
                                onClick={() => {
                                  setShowStatsModal(false);
                                  setShowOnlinePlayersModal(true);
                                }}
                                className="text-[11px] text-blue-400 hover:text-blue-300 font-bold underline transition"
                              >
                                Ver quiénes
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-sans">
                            Navegando o jugando interactivo en vivo
                          </p>
                        </div>

                        {/* 2. Active Game Players */}
                        <div className="space-y-2 bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">
                            Jugadores (Juego Actual)
                          </span>
                          <span className="text-4xl font-extrabold text-white tracking-tight">
                            {players.length}
                          </span>
                          <p className="text-[11px] text-slate-500 font-sans">
                            Participantes con cartones activos
                          </p>
                        </div>

                        {/* 3. Total Cards Sold / Assigned */}
                        <div className="space-y-2 bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">
                            Cartones Vendidos
                          </span>
                          <span className="text-4xl font-extrabold text-blue-400 tracking-tight">
                            {totalCardsSold}
                          </span>
                          <p className="text-[11px] text-slate-500 font-sans">
                            Cartones generados aprobados hoy
                          </p>
                        </div>

                        {/* 4. Global Registration */}
                        <div className="space-y-2 bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">
                            Registros (Global)
                          </span>
                          <span className="text-4xl font-extrabold text-slate-300 tracking-tight">
                            {allPlayers.length}
                          </span>
                          <p className="text-[11px] text-slate-500 font-sans">
                            Historial total en base de datos
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex justify-end pt-2 border-t border-slate-800">
                    <button 
                      onClick={() => setShowStatsModal(false)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl transition"
                    >
                      Cerrar Panel
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal de Jugadores en Línea */}
        <AnimatePresence>
          {showOnlinePlayersModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
              onClick={() => setShowOnlinePlayersModal(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full overflow-hidden max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="bg-slate-800 text-white p-5 flex justify-between items-center">
                  <div>
                    <h3 className="text-md font-bold flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Jugadores en Línea ({onlinePlayers.length})
                    </h3>
                    <p className="text-[11px] text-slate-400">Activos en tiempo real</p>
                  </div>
                  <button 
                    onClick={() => setShowOnlinePlayersModal(false)}
                    className="p-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto space-y-3 flex-1 divide-y divide-slate-100">
                  {onlinePlayers.length === 0 ? (
                    <p className="text-center text-slate-500 py-4 font-medium text-xs">No hay jugadores activos hoy</p>
                  ) : (
                    onlinePlayers.map((p, index) => (
                      <div key={`${p.phone}-${index}`} className="flex justify-between items-center pt-3 first:pt-0">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-800 text-xs">{p.name || 'Invitado'}</p>
                          <p className="font-mono text-[11px] text-slate-500">{p.phone}</p>
                        </div>
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                          <span className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce"></span>
                          activo
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button 
                    onClick={() => setShowOnlinePlayersModal(false)}
                    className="px-4 py-2 bg-slate-800 text-white text-[11px] font-bold rounded-lg hover:bg-slate-900 transition"
                  >
                    Cerrar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal de Editar Juego */}
        <EditGameModal 
          isOpen={showEditGameModal} 
          onClose={() => setShowEditGameModal(false)} 
          game={editingGame} 
          onUpdate={(data) => updateGame(editingGame.id, data)} 
        />

        {/* Modal Creador y Estudio de Anuncios de Voz con IA */}
        <AnimatePresence>
          {showAIAnnouncementModal && (
            <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4">
              <motion.div 
                initial={{ scale: 0.95, y: 15, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 15, opacity: 0 }}
                className="w-full max-w-4xl flex justify-center"
              >
                <AIVoiceStudio isModal onClose={() => setShowAIAnnouncementModal(false)} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Tab Content */}
        <div className="mt-6">
          
          {/* CONTROL TAB */}
          {activeTab === 'control' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                
                {/* Bingo Alerts */}
                {bingoAlerts.length > 0 && (
                  <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 rounded-r-2xl shadow-md">
                    <h3 className="text-yellow-800 font-bold mb-2 flex items-center gap-2">
                      <Trophy size={20} /> ¡BINGOS CANTADOS!
                    </h3>
                    <div className="space-y-2">
                      {bingoAlerts.map((alert, i) => (
                        <div key={`${alert.player_id}-${alert.card_number}-${i}`} className="bg-white p-3 rounded-xl shadow-sm text-sm font-medium text-slate-700 flex justify-between items-center">
                          <span>Jugador: <strong className="text-slate-900">{alert.player_name}</strong></span>
                          <span>Cartón: <strong className="text-slate-900">#{alert.card_number}</strong></span>
                          <span className="text-green-600 bg-green-50 px-2 py-1 rounded-lg text-xs uppercase">{alert.pattern_name}</span>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => setBingoAlerts([])}
                      className="mt-3 text-sm text-yellow-700 hover:text-yellow-900 underline font-medium"
                    >
                      Limpiar alertas
                    </button>
                  </div>
                )}

                {/* Patterns in Play */}
                {gameState?.patterns && gameState.patterns.length > 0 && (
                  <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                    <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
                      <Grid className="text-blue-500" size={24} /> Patrones en Juego
                    </h2>
                    <PatternRow patterns={gameState.patterns || []} detectedPatternIds={detectedPatternIds} />
                  </div>
                )}

                <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                  <h2 className="text-xl font-black text-slate-800 mb-6 border-b pb-4">Control de Partida</h2>
                  
                  {!gameState ? (
                    <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-100 text-center">
                      <Gamepad2 className="mx-auto text-blue-400 mb-3" size={48} />
                      <h3 className="text-lg font-black text-blue-900 mb-2">No hay un juego activo</h3>
                      <p className="text-blue-700 text-sm mb-4">Ve a la pestaña "Crear Juegos" para programar o activar una partida.</p>
                      <button 
                        onClick={() => setActiveTab('games')}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition"
                      >
                        Ir a Crear Juegos
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                        {gameState?.status === 'waiting' || gameState?.status === 'scheduled' ? (
                          <button 
                            onClick={startPreGameSequence}
                            disabled={!gameState?.id || isPreGameCountdown}
                            className={clsx(
                              "w-full py-3 px-4 font-bold rounded-xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-sm active:scale-95 text-white overflow-hidden relative",
                              isPreGameCountdown ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                            )}
                          >
                            {isPreGameCountdown ? (
                              <>
                                <Clock size={18} className="animate-spin shrink-0" />
                                <span className="truncate">Inicio {preGameTime}s</span>
                                <motion.div 
                                  initial={{ width: '0%' }}
                                  animate={{ width: `${((5 - preGameTime) / 5) * 100}%` }}
                                  className="absolute bottom-0 left-0 h-1 bg-white/50"
                                />
                              </>
                            ) : (
                              <>
                                <Play size={18} className="shrink-0" /> <span className="truncate">Preparar e Iniciar</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button 
                            onClick={() => updateGameStatus('playing')}
                            disabled={gameState?.status === 'playing'}
                            className="w-full py-3 px-4 font-bold rounded-xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-sm active:scale-95 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-green-500/10"
                          >
                            <Play size={18} className="shrink-0" /> <span className="truncate">Iniciar</span>
                          </button>
                        )}

                        <button 
                          onClick={() => updateGameStatus('paused')}
                          disabled={gameState?.status !== 'playing'}
                          className="w-full py-3 px-4 font-bold rounded-xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-sm active:scale-95 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-yellow-500/10"
                        >
                          <Pause size={18} className="shrink-0" /> <span className="truncate">Pausar</span>
                        </button>

                        <button 
                          onClick={() => updateGameStatus('finished')}
                          disabled={gameState?.status === 'finished'}
                          className="w-full py-3 px-4 font-bold rounded-xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-sm active:scale-95 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-slate-800/10"
                        >
                          <Square size={18} className="shrink-0" /> <span className="truncate">Finalizar</span>
                        </button>

                        <button 
                          onClick={resetGame}
                          className="w-full py-3 px-4 font-bold rounded-xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-sm active:scale-95 bg-red-100 hover:bg-red-200 text-red-700 shadow-red-500/5 border border-red-200"
                        >
                          <RefreshCcw size={18} className="shrink-0" /> <span className="truncate">Reiniciar</span>
                        </button>
                      </div>

                      {/* Pinned DJ Sound Effects & Live Audio Bar */}
                      <div className="mb-8 p-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/30 rounded-3xl text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 relative z-10">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-400 to-orange-500 text-amber-950 flex items-center justify-center shadow-md font-bold shrink-0">
                              <Sparkles size={18} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-black text-sm tracking-wide text-white uppercase flex items-center gap-1.5">
                                  Efectos DJ en Vivo
                                </h3>
                                {selectedDjSlots.length > 0 && (
                                  <span className="text-[10px] bg-amber-400 text-amber-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    {selectedDjSlots.length} activos
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-300">
                                Dispara audios de fondo, voz IA y efectos de sonido en vivo para todos los jugadores
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowSelectDjEffectsModal(true)}
                              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                            >
                              <SlidersHorizontal size={14} />
                              <span>Seleccionar Efectos</span>
                            </button>
                            <button
                              onClick={() => setActiveTab('dj_board')}
                              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Abrir mesa DJ completa"
                            >
                              <Music size={14} />
                              <span className="hidden sm:inline">Mesa DJ</span>
                            </button>
                          </div>
                        </div>

                        {/* Predetermined Core Audio Tools */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4 relative z-10">
                          <button 
                            onClick={() => setShowAIAnnouncementModal(true)}
                            className="w-full py-3 px-4 font-black rounded-2xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-md active:scale-95 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white border border-white/10"
                          >
                            <Bot size={18} className="shrink-0 animate-pulse" /> 
                            <span className="truncate">Anuncios de Voz IA 🤖</span>
                          </button>

                          <button 
                            onClick={() => {
                              fetchDjBgPlaylist();
                              setShowDjTracksModal(true);
                            }}
                            className="w-full py-3 px-4 font-black rounded-2xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-md active:scale-95 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border border-white/10"
                          >
                            <Music size={18} className="shrink-0" /> 
                            <span className="truncate">Ambiente DJ 🎧</span>
                          </button>

                          <button 
                            onClick={toggleAudio}
                            className={clsx(
                              "w-full py-3 px-4 font-black rounded-2xl flex items-center justify-center gap-2 transition text-xs sm:text-sm text-center select-none shadow-md active:scale-95 border",
                              isMuted 
                                ? "bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-400/40" 
                                : "bg-slate-800/90 hover:bg-slate-700 text-slate-100 border-slate-700"
                            )}
                            title={isMuted ? "Sonido Silenciado" : "Sonido Activado"}
                          >
                            {isMuted ? (
                              <>
                                <XCircle size={18} className="text-red-400 shrink-0" /> 
                                <span className="truncate">Sonido: Silencio</span>
                              </>
                            ) : (
                              <>
                                <Volume2 size={18} className="text-emerald-400 shrink-0" /> 
                                <span className="truncate">Sonido: Activo</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Selected DJ Soundboard Pads */}
                        {selectedDjSlots.length === 0 ? (
                          <div 
                            onClick={() => setShowSelectDjEffectsModal(true)}
                            className="p-5 bg-slate-800/60 border border-dashed border-indigo-400/40 rounded-2xl text-center cursor-pointer hover:bg-slate-800 hover:border-indigo-400 transition group"
                          >
                            <div className="w-10 h-10 mx-auto rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center mb-2 group-hover:scale-110 transition">
                              <Plus size={20} />
                            </div>
                            <p className="text-xs font-bold text-slate-200">No hay efectos DJ individuales seleccionados</p>
                            <p className="text-[11px] text-indigo-300/80 mt-1">Haz clic aquí para seleccionar efectos (Bocina, Aplausos, Suspenso, Risas, Grito Bingo, etc.) y tenerlos como botones rápidos.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 relative z-10 pt-2 border-t border-white/10">
                            {selectedDjSlots.map((slot) => {
                              const isLivePlaying = activeLiveDjPadId === slot.id;
                              
                              let colorStyle = 'from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 border-blue-400/30 text-white';
                              if (slot.color === 'emerald') colorStyle = 'from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 border-emerald-400/30 text-white';
                              else if (slot.color === 'yellow') colorStyle = 'from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 border-amber-300/40 text-amber-950 font-black';
                              else if (slot.color === 'purple') colorStyle = 'from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 border-purple-400/30 text-white';
                              else if (slot.color === 'pink') colorStyle = 'from-pink-600 to-rose-700 hover:from-pink-500 hover:to-rose-600 border-pink-400/30 text-white';
                              else if (slot.color === 'orange') colorStyle = 'from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 border-orange-300/40 text-white';

                              return (
                                <div key={slot.id} className="relative group/btn">
                                  <button
                                    onClick={() => triggerDjSoundFromSlot(slot)}
                                    className={clsx(
                                      "w-full p-3 rounded-2xl font-bold flex items-center gap-2.5 transition-all text-xs text-left select-none shadow-md active:scale-95 border bg-gradient-to-r",
                                      colorStyle,
                                      isLivePlaying && "ring-4 ring-white animate-pulse scale-[1.02]"
                                    )}
                                    title={`Disparar "${slot.name}" en vivo`}
                                  >
                                    <span className="text-xl shrink-0 drop-shadow">{slot.emoji}</span>
                                    <div className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-black leading-tight">
                                        {slot.name}
                                      </span>
                                      <span className="block text-[9px] opacity-80 uppercase tracking-wider truncate font-semibold">
                                        {isLivePlaying ? '¡Sonando Live!' : 'Disparar Live'}
                                      </span>
                                    </div>
                                    <Play size={12} className={clsx("shrink-0", isLivePlaying ? "fill-current animate-bounce" : "opacity-75")} />
                                  </button>

                                  {/* Quick Unpin button on hover */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSlotForGamePanel(slot.id);
                                    }}
                                    title="Quitar este efecto del panel"
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-900 text-slate-300 hover:text-white hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition shadow border border-white/20 cursor-pointer z-10"
                                  >
                                    <X size={11} className="stroke-[2.5]" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    {/* Stream Toggle Switch */}
                    <div className="border-t pt-6 flex flex-col items-center">
                      <div className="w-full flex justify-between items-center mb-6 bg-purple-50 p-4 rounded-2xl border border-purple-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <Radio className="text-purple-600" size={20} />
                          </div>
                          <div>
                            <h3 className="font-black text-slate-800 text-sm">Transmisión en Vivo</h3>
                            <p className="text-xs text-slate-500 font-medium">{twitchChannel ? `Canal: ${twitchChannel}` : 'Sin configurar'}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (!twitchChannel) {
                              toast.error('Configura tu canal de Twitch en la pestaña Configuración');
                              return;
                            }
                            const newState = !gameState?.stream_active;
                            apiFetch('/api/game/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stream_active: newState }) });
                          }}
                          className={clsx(
                            "relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2",
                            gameState?.stream_active ? 'bg-purple-600' : 'bg-slate-200'
                          )}
                        >
                          <span
                            className={clsx(
                              "inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm",
                              gameState?.stream_active ? 'translate-x-7' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>

                      {/* Countdown UI Sincronizado sobre la Balota Saliente Oficial */}
                      <div className="w-full mb-4 flex flex-col items-center justify-center">
                        <AnimatePresence>
                          {timeLeft && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="w-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/40 text-white rounded-2xl p-3 shadow-xl flex flex-col items-center text-center"
                            >
                              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-indigo-300 mb-2">
                                <Clock size={14} className="animate-pulse" />
                                <span>Iniciación del Juego (Sincronizado)</span>
                              </div>
                              
                              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                                {timeLeft.days > 0 && (
                                  <div className="flex flex-col items-center">
                                    <span className="bg-white/10 px-2 py-1 rounded-lg text-base sm:text-lg font-black text-amber-300 border border-white/10 min-w-[36px]">
                                      {String(timeLeft.days).padStart(2, '0')}
                                    </span>
                                    <span className="text-[8px] font-bold uppercase text-slate-400 mt-0.5">Días</span>
                                  </div>
                                )}
                                <div className="flex flex-col items-center">
                                  <span className="bg-white/10 px-2 py-1 rounded-lg text-base sm:text-lg font-black text-white border border-white/10 min-w-[36px]">
                                    {String(timeLeft.hours).padStart(2, '0')}
                                  </span>
                                  <span className="text-[8px] font-bold uppercase text-slate-400 mt-0.5">Hrs</span>
                                </div>
                                <span className="text-indigo-400 font-black text-base sm:text-lg">:</span>
                                <div className="flex flex-col items-center">
                                  <span className="bg-white/10 px-2 py-1 rounded-lg text-base sm:text-lg font-black text-white border border-white/10 min-w-[36px]">
                                    {String(timeLeft.minutes).padStart(2, '0')}
                                  </span>
                                  <span className="text-[8px] font-bold uppercase text-slate-400 mt-0.5">Min</span>
                                </div>
                                <span className="text-indigo-400 font-black text-base sm:text-lg">:</span>
                                <div className="flex flex-col items-center">
                                  <span className="bg-white/10 px-2 py-1 rounded-lg text-base sm:text-lg font-black text-emerald-400 border border-white/10 min-w-[36px]">
                                    {String(timeLeft.seconds).padStart(2, '0')}
                                  </span>
                                  <span className="text-[8px] font-bold uppercase text-slate-400 mt-0.5">Seg</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                          {autoStartTimer !== null && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="w-full bg-red-950/90 border-2 border-red-500 text-white rounded-2xl p-3 shadow-xl flex flex-col items-center text-center mt-2"
                            >
                              <span className="text-red-300 font-black text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <Clock size={12} className="animate-spin text-red-400" />
                                Inicio Automático en {autoStartTimer}s
                              </span>
                              <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-red-500/40 mt-1">
                                <motion.div 
                                  initial={{ width: '100%' }}
                                  animate={{ width: `${(autoStartTimer / 30) * 100}%` }}
                                  transition={{ duration: 1, ease: "linear" }}
                                  className="h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="relative w-full max-w-[140px] aspect-square mx-auto mb-6">
                        <AnimatePresence mode="wait">
                          <motion.button
                            key={gameState?.drawn_balls?.length || 0}
                            initial={{ scale: 0.8, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 1.1, opacity: 0, y: -10 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            onClick={drawBall}
                            disabled={!gameState?.id || !['waiting', 'playing', 'paused'].includes(gameState?.status) || (gameState?.drawn_balls?.length || 0) >= 75 || autoplay}
                            className={clsx(
                              "w-full h-full rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center border-[6px] border-white/30 relative overflow-hidden group transition-all active:scale-95 disabled:opacity-80",
                              gameState?.drawn_balls?.length > 0 
                                ? getBallColor(gameState.drawn_balls[gameState.drawn_balls.length - 1])
                                : "bg-slate-800"
                            )}
                          >
                            {/* Glossy effect */}
                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/40 via-transparent to-black/20 pointer-events-none" />
                            <div className="absolute top-2 left-1/4 w-1/2 h-1/4 bg-white/20 rounded-full blur-lg pointer-events-none" />
                            
                            {gameState?.drawn_balls?.length > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="text-white/90 font-black text-2xl mb-0.5 drop-shadow-lg">
                                  {getBallLetter(gameState.drawn_balls[gameState.drawn_balls.length - 1])}
                                </span>
                                <div className="bg-white w-14 h-14 rounded-full flex items-center justify-center shadow-[inset_0_2px_5px_rgba(0,0,0,0.3)] border-2 border-black/5">
                                  <span className="text-slate-900 font-black text-3xl">
                                    {gameState.drawn_balls[gameState.drawn_balls.length - 1]}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center px-2">
                                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2 border border-white/20">
                                  <Play size={24} className="text-white fill-white ml-0.5" />
                                </div>
                                <span className="text-white font-black text-[10px] uppercase tracking-wider leading-tight">Siguiente Balota</span>
                              </div>
                            )}
                            
                            {/* Hover overlay */}
                            {!autoplay && (
                              <div className="absolute inset-0 bg-black/10 transition-colors flex items-center justify-center">
                                 <div className="transform transition-all duration-300">
                                   <span className="text-white font-black text-[8px] uppercase tracking-widest bg-black/60 px-2 py-1 rounded-full backdrop-blur-md border border-white/10">
                                     Cantar
                                   </span>
                                 </div>
                              </div>
                            )}
                          </motion.button>
                        </AnimatePresence>
                      </div>
                      
                      <button 
                        onClick={autoplay ? toggleAutoplay : ((gameState?.status === 'paused' || (gameState?.drawn_balls?.length || 0) > 0) ? toggleAutoplay : startPreGameSequence)}
                        disabled={!gameState?.id || !['waiting', 'playing', 'paused', 'scheduled'].includes(gameState?.status) || isPreGameCountdown}
                        className={clsx(
                          "w-full py-4 font-bold text-lg rounded-xl shadow-md transition flex items-center justify-center gap-2",
                          isPreGameCountdown ? "bg-orange-500 text-white cursor-wait" :
                          autoplay ? "bg-red-500 hover:bg-red-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-200 disabled:text-slate-400"
                        )}
                      >
                        {isPreGameCountdown ? (
                          <>
                            <Clock className="animate-spin" size={24} />
                            Iniciando en {preGameTime}s
                          </>
                        ) : autoplay ? (
                          <><Pause size={24} /> DETENER AUTOPLAY</>
                        ) : (
                          <><Play size={24} /> INICIAR AUTOPLAY ({autoplayInterval}s)</>
                        )}
                      </button>

                      {/* Volume Controls */}
                      <div className="mt-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1.5 mb-1">
                          <Volume2 size={12} /> Control de Volumen Global
                        </h4>
                        
                        <div className="space-y-3">
                          {/* Background Music Volume */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Música de Fondo</span>
                              <span className="text-[10px] font-black text-indigo-600">{Math.round(bgVolume * 100)}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setBgVolume(0)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                                {bgVolume === 0 ? <VolumeX size={14} /> : <Volume1 size={14} />}
                              </button>
                              <input 
                                type="range" 
                                min="0" max="1" step="0.05"
                                value={bgVolume}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setBgVolume(val);
                                  
                                  const now = Date.now();
                                  const lastFired = (window as any).lastBgVolumeBroadcastDashboard || 0;

                                  if (bgVolumeTimeoutRef.current) {
                                    clearTimeout(bgVolumeTimeoutRef.current);
                                  }
                                  
                                  const broadcast = () => {
                                    (window as any).lastBgVolumeBroadcastDashboard = Date.now();
                                    apiFetch('/api/game/status', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ bg_volume: val })
                                    });
                                    apiFetch('/api/admin/trigger-dj-bg', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ command: 'volume_update', volume: val })
                                    });
                                  };

                                  if (now - lastFired > 50) {
                                    broadcast();
                                  } else {
                                    bgVolumeTimeoutRef.current = setTimeout(broadcast, 50);
                                  }
                                }}
                                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                              />
                            </div>
                          </div>

                          {/* Sound Effects Volume */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Efectos y TTS</span>
                              <span className="text-[10px] font-black text-indigo-600">{Math.round(fxVolume * 100)}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setFxVolume(0)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                                {fxVolume === 0 ? <VolumeX size={14} /> : <Volume1 size={14} />}
                              </button>
                              <input 
                                type="range" 
                                min="0" max="1" step="0.05"
                                value={fxVolume}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setFxVolume(val);
                                  setGlobalFxVolume(val);
                                  
                                  const now = Date.now();
                                  const lastFired = (window as any).lastFxVolumeBroadcast || 0;
                                  
                                  if (fxVolumeTimeoutRef.current) {
                                    clearTimeout(fxVolumeTimeoutRef.current);
                                  }
                                  
                                  const broadcast = () => {
                                    (window as any).lastFxVolumeBroadcast = Date.now();
                                    apiFetch('/api/game/status', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ fx_volume: val })
                                    });
                                    apiFetch('/api/admin/trigger-fx-volume', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ volume: val })
                                    });
                                  };

                                  if (now - lastFired > 50) {
                                    broadcast();
                                  } else {
                                    fxVolumeTimeoutRef.current = setTimeout(broadcast, 50);
                                  }
                                }}
                                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Quick DJ Track Access */}
                      <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                            <Music size={12} /> Ambiente Musical DJ
                          </h4>
                          {activeDjTrackId && (
                            <button 
                              onClick={stopDjBgTrack}
                              className="text-[10px] font-black text-red-600 hover:text-red-700 uppercase"
                            >
                              Detener
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {djBgPlaylist.map((track, i) => (
                            <button
                              key={track.id || i}
                              onClick={() => activeDjTrackId === track.id ? stopDjBgTrack() : triggerDjBgTrack(track)}
                              disabled={!track.url}
                              className={clsx(
                                "h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all border-2",
                                activeDjTrackId === track.id
                                  ? "bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20"
                                  : track.url
                                    ? "bg-white text-slate-600 border-slate-100 hover:border-indigo-300 hover:text-indigo-600"
                                    : "bg-slate-100 text-slate-300 border-transparent cursor-not-allowed"
                              )}
                              title={track.name || `Pista ${i + 1}`}
                            >
                              {i + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 h-fit">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h2 className="text-xl font-black text-slate-800">Tablero de Balotas</h2>
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">
                    {gameState?.drawn_balls?.length || 0} / 75
                  </span>
                </div>
                
                <BingoBoard drawnBalls={gameState?.drawn_balls || []} compact />
              </div>

              <div className="h-[400px] hidden">
                <ChatComponent userName="Administrador" isAdmin={true} />
              </div>
            </div>
          )}

          {/* SORTEO AUTOMÁTICO TAB */}
          {activeTab === 'auto_draws' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              
              {/* Top Banner Status Hub */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-2xl border border-indigo-500/30 relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={clsx(
                        "px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm",
                        autoplay 
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 animate-pulse"
                          : gameState?.status === 'scheduled'
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      )}>
                        <span className={clsx("w-2 h-2 rounded-full", autoplay ? "bg-emerald-400 animate-ping" : gameState?.status === 'scheduled' ? "bg-amber-400" : "bg-slate-400")} />
                        {autoplay ? "Sorteo Automático Activo" : gameState?.status === 'scheduled' ? "Sorteo Programado" : "Modo Manual"}
                      </span>

                      <span className="bg-white/10 text-slate-200 px-3 py-1 rounded-full text-xs font-bold border border-white/10 flex items-center gap-1.5">
                        <Gauge size={14} className="text-emerald-400" />
                        {autoplayInterval}s / Balota
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                      <Zap className="text-emerald-400 fill-emerald-400" />
                      Gestión de Sorteos Automáticos
                    </h2>
                    
                    <p className="text-slate-300 text-sm font-medium">
                      Controla el motor autónomo de extracción de balotas, programa horarios de inicio y configura la velocidad de locución en vivo.
                    </p>
                  </div>

                  {/* Main Action Toggle Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto shrink-0">
                    <button
                      onClick={autoplay ? handleStopAutoplayServer : () => handleStartAutoplayServer()}
                      disabled={!gameState?.id}
                      className={clsx(
                        "px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50",
                        autoplay
                          ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 border border-red-400/30"
                          : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-emerald-500/20 border border-emerald-400/30"
                      )}
                    >
                      {autoplay ? (
                        <>
                          <Pause size={20} className="fill-white" />
                          <span>Pausar Sorteo Auto</span>
                        </>
                      ) : (
                        <>
                          <Play size={20} className="fill-white" />
                          <span>Iniciar Sorteo Auto ({autoplayInterval}s)</span>
                        </>
                      )}
                    </button>

                    {gameState?.status === 'scheduled' && (
                      <button
                        onClick={() => handleStartAutoplayServer()}
                        className="px-5 py-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition flex items-center justify-center gap-2 border border-amber-300/40"
                      >
                        <PlayCircle size={20} />
                        <span>Iniciar Ahora</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Game Overview Quick Bar */}
                {gameState && (
                  <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold">
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <span className="text-slate-400 block font-normal text-[10px] uppercase">Juego Actual</span>
                      <span className="text-white font-bold text-sm truncate block">{gameState.name || `Juego #${gameState.id}`}</span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <span className="text-slate-400 block font-normal text-[10px] uppercase">Balotas Extraídas</span>
                      <span className="text-emerald-400 font-bold text-sm block">{gameState.drawn_balls?.length || 0} / 75</span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <span className="text-slate-400 block font-normal text-[10px] uppercase">Premio de la Ronda</span>
                      <span className="text-yellow-300 font-bold text-sm block">{gameState.prize || '$0'}</span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <span className="text-slate-400 block font-normal text-[10px] uppercase">Cartones Vendidos</span>
                      <span className="text-blue-300 font-bold text-sm block">{gameState.cards_sold || 0}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid 2 Columns: Speed Controls & Schedule Engine */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Card 1: Velocidad de Salida de Balotas */}
                <div className="bg-white p-6 sm:p-7 rounded-3xl shadow-xl border border-slate-200 space-y-6 flex flex-col justify-between col-span-1 lg:col-span-2">
                  <div>
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                      <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <Gauge className="text-emerald-600" size={22} />
                        Velocidad de Salida de Balotas
                      </h3>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                        {autoplayInterval}s por balota
                      </span>
                    </div>

                    <p className="text-slate-600 text-xs font-medium mb-5">
                      Selecciona la velocidad entre balotas. El cambio se aplica <strong>en tiempo real</strong> durante el juego sin pausar la transmisión.
                    </p>

                    {/* Speed Preset Chips */}
                    <div className="space-y-2 mb-6">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Presets Rápidos Recomendados:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                          { seconds: 8, label: '🎯 8s', desc: 'Estándar Oficial (Locución IA)', badge: 'RECOMENDADO' },
                          { seconds: 10, label: '⏱️ 10s', desc: 'Pausado' },
                          { seconds: 12, label: '☕ 12s', desc: 'Tranquilo' },
                          { seconds: 15, label: '🐢 15s', desc: 'Relajado' },
                        ].map((preset) => (
                          <button
                            key={preset.seconds}
                            type="button"
                            onClick={() => handleSpeedChangeAndSave(preset.seconds)}
                            className={clsx(
                              "p-3 rounded-2xl border text-left transition flex flex-col justify-between relative overflow-hidden group",
                              autoplayInterval === preset.seconds
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/20 scale-[1.02]"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
                            )}
                          >
                            {preset.badge && (
                              <span className={clsx(
                                "absolute top-2 right-2 text-[7px] font-black px-1 py-0.5 rounded-full uppercase tracking-widest",
                                autoplayInterval === preset.seconds ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                              )}>
                                <Check size={8} />
                              </span>
                            )}
                            <div className="font-extrabold text-xs mb-0.5">{preset.label}</div>
                            <div className={clsx("text-[9px] font-bold uppercase tracking-tighter opacity-70", autoplayInterval === preset.seconds ? "text-emerald-100" : "text-slate-500")}>
                              {preset.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Custom Range Slider & Input */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                          <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                            <span>Ajuste Personalizado de Intervalo</span>
                            <span className="text-emerald-700 font-black text-sm">{autoplayInterval} Segundos</span>
                          </div>

                          <input
                            type="range"
                            min="8"
                            max="30"
                            step="1"
                            value={autoplayInterval}
                            onChange={(e) => handleSpeedChangeAndSave(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                          />

                          <div className="flex gap-2 pt-1">
                            <input
                              type="number"
                              min="8"
                              max="60"
                              value={autoplayInterval}
                              onChange={(e) => setAutoplayInterval(Math.max(8, Number(e.target.value)))}
                              className="w-28 p-2.5 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none font-bold text-slate-800 text-sm"
                            />
                            <button
                              disabled={isUpdatingSpeed}
                              onClick={() => handleSpeedChangeAndSave(autoplayInterval)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10"
                            >
                              {isUpdatingSpeed ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                              <span>Aplicar Cambio</span>
                            </button>
                          </div>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex gap-3 items-center text-xs text-emerald-800 font-medium">
                            <Sparkles className="text-emerald-600 shrink-0" size={24} />
                            <div>
                            <strong className="block text-emerald-950 font-bold mb-0.5 text-sm">Sugerencia de Locución</strong>
                            El intervalo recomendado de <strong>8 segundos</strong> le permite al sintetizador cantar la balota, pronunciar la letra y número, y dar tiempo libre para los jugadores sin cortar audio.
                            </div>
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Recent Drawn Balls Live Board */}
              {gameState?.drawn_balls && gameState.drawn_balls.length > 0 && (
                <div className="bg-white p-6 sm:p-7 rounded-3xl shadow-xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <List className="text-purple-600" size={20} />
                      Balotas Extraídas en la Transmisión
                    </h3>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                      Total: {gameState.drawn_balls.length} / 75
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2.5 pt-2">
                    {gameState.drawn_balls.map((ball: number, idx: number) => {
                      const letter = getBallLetter(ball);
                      const colorClass = getBallColor(ball);
                      const isLatest = idx === gameState.drawn_balls.length - 1;

                      return (
                        <div
                          key={`auto-ball-${ball}-${idx}`}
                          className={clsx(
                            "w-11 h-11 rounded-full flex flex-col items-center justify-center font-black text-white text-xs shadow-md transition transform",
                            colorClass,
                            isLatest && "ring-4 ring-yellow-400 scale-110 animate-bounce"
                          )}
                        >
                          <span className="text-[9px] leading-none opacity-80">{letter}</span>
                          <span className="leading-none">{ball}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* GAMES TAB */}
          {activeTab === 'games' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 max-w-4xl mx-auto flex flex-col gap-8">
              <div className="order-2 border-t pt-8">
                <h2 className="text-xl font-black text-slate-800 mb-6 border-b pb-4 flex items-center gap-2">
                  <Calendar className="text-blue-500" /> Programador de Juegos
                </h2>
                <div className="mb-8 bg-slate-50 p-6 rounded-2xl border-2 border-slate-200">
                <div className="flex items-start sm:items-center justify-between mb-6 overflow-x-auto pb-2 hide-scrollbar">
                  <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 shrink-0 w-16 sm:w-auto">
                    <div className={clsx("w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm", gameWizardStep >= 1 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}>1</div>
                    <span className={clsx("font-bold text-[10px] sm:text-sm text-center", gameWizardStep >= 1 ? "text-blue-800" : "text-slate-500")}>Datos</span>
                  </div>
                  <div className={clsx("flex-1 h-1 mx-1 sm:mx-4 rounded-full min-w-[10px] sm:min-w-[20px] mt-4 sm:mt-0", gameWizardStep >= 2 ? "bg-blue-600" : "bg-slate-200")} />
                  <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 shrink-0 w-16 sm:w-auto">
                    <div className={clsx("w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm", gameWizardStep >= 2 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}>2</div>
                    <span className={clsx("font-bold text-[10px] sm:text-sm text-center", gameWizardStep >= 2 ? "text-blue-800" : "text-slate-500")}>Patrones</span>
                  </div>
                  <div className={clsx("flex-1 h-1 mx-1 sm:mx-4 rounded-full min-w-[10px] sm:min-w-[20px] mt-4 sm:mt-0", gameWizardStep >= 3 ? "bg-blue-600" : "bg-slate-200")} />
                  <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 shrink-0 w-16 sm:w-auto">
                    <div className={clsx("w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm", gameWizardStep >= 3 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}>3</div>
                    <span className={clsx("font-bold text-[10px] sm:text-sm text-center", gameWizardStep >= 3 ? "text-blue-800" : "text-slate-500")}>Revancha</span>
                  </div>
                  <div className={clsx("flex-1 h-1 mx-1 sm:mx-4 rounded-full min-w-[10px] sm:min-w-[20px] mt-4 sm:mt-0", gameWizardStep >= 4 ? "bg-blue-600" : "bg-slate-200")} />
                  <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 shrink-0 w-16 sm:w-auto">
                    <div className={clsx("w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm", gameWizardStep >= 4 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}>4</div>
                    <span className={clsx("font-bold text-[10px] sm:text-sm text-center", gameWizardStep >= 4 ? "text-blue-800" : "text-slate-500")}>Revisión</span>
                  </div>
                </div>

                <form onSubmit={createGame} className="space-y-4">
                  {gameWizardStep === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Nombre del Juego</label>
                        <input required type="text" value={newGame.name} onChange={e => setNewGame({...newGame, name: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" placeholder="Ej: Gran Bingo Bailable" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Fecha y Hora</label>
                        <input required type="datetime-local" value={newGame.start_time} onChange={e => setNewGame({...newGame, start_time: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Juego</label>
                        <select value={newGame.type} onChange={e => setNewGame({...newGame, type: e.target.value, card_value: e.target.value === 'free' ? '0' : newGame.card_value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none">
                          <option value="paid">Pago</option>
                          <option value="free">Gratis</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Premio</label>
                        <select value={newGame.prize_type} onChange={e => setNewGame({...newGame, prize_type: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none">
                          <option value="wallet">Saldo para Billetera</option>
                          <option value="cash">Premio en Efectivo</option>
                        </select>
                      </div>
                      {newGame.type === 'paid' && (
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Valor del Cartón (COP)</label>
                          <input required type="text" value={newGame.card_value} onChange={e => setNewGame({...newGame, card_value: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" placeholder="Ej: 10000" />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Premios a repartir (COP)</label>
                        <input required type="text" value={newGame.prize} onChange={e => setNewGame({...newGame, prize: e.target.value})} className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" placeholder="Ej: 1000000" />
                      </div>
                      <div className="col-span-1 md:col-span-2 bg-blue-50 border border-blue-150 p-4 rounded-xl space-y-2">
                        <p className="text-xs font-black text-blue-900 uppercase tracking-wider">Configuración de Lotería Especial</p>
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={newGame.active_lottery || false} 
                              onChange={e => setNewGame({...newGame, active_lottery: e.target.checked})}
                              className="w-5 h-5 rounded text-blue-600 border-slate-300 focus:ring-blue-500" 
                            />
                            <span className="text-xs font-black text-slate-700 uppercase">Activar lotería</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={newGame.active_draw || false} 
                              onChange={e => setNewGame({...newGame, active_draw: e.target.checked})}
                              className="w-5 h-5 rounded text-blue-600 border-slate-300 focus:ring-blue-500" 
                            />
                            <span className="text-xs font-black text-slate-700 uppercase">Activar sorteo</span>
                          </label>
                        </div>
                        <p className="text-[10px] text-blue-800 font-bold leading-normal">
                          Si activas la lotería, se mostrará el aviso a los compradores indicando los detalles del sorteo y con qué cifras participan.
                        </p>

                        {/* DETALLES DE LA LOTERÍA */}
                        {newGame.active_lottery && (
                          <div className="mt-4 p-4 bg-white rounded-xl border border-blue-100 shadow-sm space-y-3 animate-in slide-in-from-top-2 duration-200">
                            <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5 border-b pb-1.5 border-slate-100">
                              <span>📋</span> Detalles del Sorteo de Lotería Nocturna
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nombre de la Lotería</label>
                                <input 
                                  type="text" 
                                  value={newGame.lottery_name || ''} 
                                  onChange={e => setNewGame({...newGame, lottery_name: e.target.value})} 
                                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 hover:border-slate-300 outline-none text-slate-800 font-extrabold" 
                                  placeholder="Ej: Lotería de Medellín, El Chontico" 
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cifras que juegan</label>
                                <select 
                                  value={newGame.lottery_digits || '3'} 
                                  onChange={e => setNewGame({...newGame, lottery_digits: e.target.value})} 
                                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 hover:border-slate-300 outline-none text-slate-800 font-extrabold"
                                >
                                  <option value="3">Últimas 3 cifras</option>
                                  <option value="2">Últimas 2 cifras</option>
                                  <option value="4">Últimas 4 cifras</option>
                                </select>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Premio</label>
                                <select 
                                  value={newGame.lottery_prize_type || 'cash'} 
                                  onChange={e => setNewGame({...newGame, lottery_prize_type: e.target.value})} 
                                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 hover:border-slate-300 outline-none text-slate-800 font-extrabold"
                                >
                                  <option value="cash">💵 Dinero en Efectivo</option>
                                  <option value="item">🛍️ Artículo Físico</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Premio al Ganador</label>
                                <input 
                                  type="text" 
                                  value={newGame.lottery_prize_value || ''} 
                                  onChange={e => setNewGame({...newGame, lottery_prize_value: e.target.value})} 
                                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 hover:border-slate-300 outline-none text-slate-800 font-extrabold" 
                                  placeholder={newGame.lottery_prize_type === 'cash' ? "Ej: $500.000 COP" : "Ej: Licuadora Ninja, TV 50 pulgadas"} 
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fecha del Sorteo</label>
                                <input 
                                  type="text" 
                                  value={newGame.lottery_date || ''} 
                                  onChange={e => setNewGame({...newGame, lottery_date: e.target.value})} 
                                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 hover:border-slate-300 outline-none text-slate-800 font-extrabold" 
                                  placeholder="Ej: Hoy de Noviembre, 25 de Octubre" 
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hora del Sorteo</label>
                                <input 
                                  type="text" 
                                  value={newGame.lottery_time || ''} 
                                  onChange={e => setNewGame({...newGame, lottery_time: e.target.value})} 
                                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 hover:border-slate-300 outline-none text-slate-800 font-extrabold" 
                                  placeholder="Ej: 10:30 PM, Noche" 
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {gameWizardStep === 2 && (
                    <div className="space-y-6">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                          <label className="block text-sm font-bold text-slate-700 mb-1">Seleccionar Patrón</label>
                          <select id="patternSelect" className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none">
                            <option value="">Seleccionar un patrón...</option>
                            {patterns.filter(p => p.is_active !== false).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 w-full">
                          <label className="block text-sm font-bold text-slate-700 mb-1">Premio para este patrón (COP)</label>
                          <input id="patternPrize" type="text" className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" placeholder="Ej: 500000" />
                        </div>
                        <button 
                          type="button" 
                          onClick={() => {
                            const select = document.getElementById('patternSelect') as HTMLSelectElement;
                            const input = document.getElementById('patternPrize') as HTMLInputElement;
                            if (select.value && input.value) {
                              addPatternToGame(parseInt(select.value), input.value);
                              input.value = '';
                            } else {
                              toast.error('Selecciona un patrón y asigna un premio');
                            }
                          }}
                          className="py-3 px-6 bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold rounded-xl flex items-center justify-center gap-2 transition"
                        >
                          <Plus size={20} /> Añadir
                        </button>
                      </div>

                      {gameWizardPatterns.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-bold text-slate-700">Patrones Asignados:</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {gameWizardPatterns.map(gp => {
                              const pattern = patterns.find(p => p.id === gp.pattern_id);
                              return (
                                <div key={gp.pattern_id} className="flex flex-col p-3 bg-white border border-slate-200 rounded-xl relative group">
                                  <button type="button" onClick={() => removePatternFromGame(gp.pattern_id)} className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1 transition-opacity">
                                    <XCircle size={20} />
                                  </button>
                                  <div className="flex items-center gap-4">
                                    <div className="grid grid-cols-5 gap-0.5 w-12 h-12 shrink-0">
                                      {getSafePatternGrid(pattern?.grid).map((row: boolean[], r: number) => (
                                        <React.Fragment key={r}>
                                          {row.map((isMarked: boolean, c: number) => {
                                            const isFree = r === 2 && c === 2;
                                            return (
                                              <div
                                                key={`${r}-${c}`}
                                                className={clsx(
                                                  "w-full h-full rounded-sm border-[0.5px]",
                                                  isFree ? "bg-yellow-400 border-yellow-500" :
                                                  isMarked ? "bg-blue-600 border-blue-700" :
                                                  "bg-white border-slate-200"
                                                )}
                                              />
                                            );
                                          })}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-bold text-slate-800 text-sm">{pattern?.name}</span>
                                      <span className="text-green-600 font-bold text-xs">Premio: {formatCurrency(gp.prize)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {gameWizardStep === 3 && (
                    <div className="space-y-6">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                          <label className="block text-sm font-bold text-slate-700 mb-1">Seleccionar Patrón de Revancha</label>
                          <select id="rematchPatternSelect" className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none">
                            <option value="">Seleccionar un patrón...</option>
                            {patterns.filter(p => p.is_active !== false).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 w-full">
                          <label className="block text-sm font-bold text-slate-700 mb-1">Premio para este patrón (COP)</label>
                          <input id="rematchPatternPrize" type="text" className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none" placeholder="Ej: 500000" />
                        </div>
                        <button 
                          type="button" 
                          onClick={() => {
                            const select = document.getElementById('rematchPatternSelect') as HTMLSelectElement;
                            const input = document.getElementById('rematchPatternPrize') as HTMLInputElement;
                            if (select.value && input.value) {
                              addRematchPatternToGame(parseInt(select.value), input.value);
                              input.value = '';
                            } else {
                              toast.error('Selecciona un patrón y asigna un premio');
                            }
                          }}
                          className="py-3 px-6 bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold rounded-xl flex items-center justify-center gap-2 transition"
                        >
                          <Plus size={20} /> Añadir
                        </button>
                      </div>

                      {gameWizardRematchPatterns.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-bold text-slate-700">Patrones de Revancha Asignados:</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {gameWizardRematchPatterns.map(gp => {
                              const pattern = patterns.find(p => p.id === gp.pattern_id);
                              return (
                                <div key={gp.pattern_id} className="flex flex-col p-3 bg-white border border-slate-200 rounded-xl relative group">
                                  <button type="button" onClick={() => removeRematchPatternFromGame(gp.pattern_id)} className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1 transition-opacity">
                                    <XCircle size={20} />
                                  </button>
                                  <div className="flex items-center gap-4">
                                    <div className="grid grid-cols-5 gap-0.5 w-12 h-12 shrink-0">
                                      {getSafePatternGrid(pattern?.grid).map((row: boolean[], r: number) => (
                                        <React.Fragment key={r}>
                                          {row.map((isMarked: boolean, c: number) => {
                                            const isFree = r === 2 && c === 2;
                                            return (
                                              <div
                                                key={`${r}-${c}`}
                                                className={clsx(
                                                  "w-full h-full rounded-sm border-[0.5px]",
                                                  isFree ? "bg-yellow-400 border-yellow-500" :
                                                  isMarked ? "bg-blue-600 border-blue-700" :
                                                  "bg-white border-slate-200"
                                                )}
                                              />
                                            );
                                          })}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-bold text-slate-800 text-sm">{pattern?.name}</span>
                                      <span className="text-green-600 font-bold text-xs">Premio: {formatCurrency(gp.prize)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {gameWizardStep === 4 && (
                    <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200">
                      <h3 className="font-black text-lg text-slate-800 border-b pb-2">Resumen del Juego</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="font-bold text-slate-500">Nombre:</span> <span className="font-bold text-slate-800">{newGame.name}</span></div>
                        <div><span className="font-bold text-slate-500">Fecha:</span> <span className="font-bold text-slate-800">{new Date(newGame.start_time).toLocaleString()}</span></div>
                        <div><span className="font-bold text-slate-500">Tipo:</span> <span className="font-bold text-slate-800">{newGame.type === 'free' ? 'Gratis' : 'Pago'}</span></div>
                        <div><span className="font-bold text-slate-500">Premios a repartir:</span> <span className="font-bold text-slate-800">{newGame.prize_type === 'wallet' ? 'Saldo Billetera' : 'Efectivo'}</span></div>
                        {newGame.type === 'paid' && (
                          <div><span className="font-bold text-slate-500">Valor Cartón:</span> <span className="font-bold text-slate-800">{formatCurrency(newGame.card_value)}</span></div>
                        )}
                      </div>
                      <div className="mt-4">
                        <span className="font-bold text-slate-500 text-sm">Patrones en juego:</span>
                        <ul className="mt-2 space-y-2">
                          {gameWizardPatterns.map(gp => {
                            const pattern = patterns.find(p => p.id === gp.pattern_id);
                            return (
                              <li key={`review-pattern-${gp.pattern_id}`} className="flex justify-between text-sm bg-slate-50 p-2 rounded-lg">
                                <span className="font-bold text-slate-700">{pattern?.name}</span>
                                <span className="text-green-700 font-bold">{formatCurrency(gp.prize)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      {gameWizardRematchPatterns.length > 0 && (
                        <div className="mt-4">
                          <span className="font-bold text-slate-500 text-sm">Patrones de revancha:</span>
                          <ul className="mt-2 space-y-2">
                            {gameWizardRematchPatterns.map(gp => {
                              const pattern = patterns.find(p => p.id === gp.pattern_id);
                              return (
                                <li key={`review-rematch-${gp.pattern_id}`} className="flex justify-between text-sm bg-slate-50 p-2 rounded-lg">
                                  <span className="font-bold text-slate-700">{pattern?.name}</span>
                                  <span className="text-green-700 font-bold">{formatCurrency(gp.prize)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
                    {gameWizardStep > 1 ? (
                      <button type="button" onClick={() => setGameWizardStep(gameWizardStep - 1)} className="py-3 px-6 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition">
                        Atrás
                      </button>
                    ) : <div></div>}
                    
                    <button type="submit" className="py-3 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition">
                      {gameWizardStep === 4 ? (
                        <><CheckCircle2 size={20} /> Crear Juego</>
                      ) : (
                        'Siguiente'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="order-1 space-y-3">
                <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                      <List size={24} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 text-lg">Lobby de Juegos</h3>
                      <p className="text-sm text-slate-500 font-medium">{games.filter(g => ['scheduled', 'waiting'].includes(g.status)).length} juegos pendientes</p>
                    </div>
                  </div>
                </div>
                <div className="max-h-[600px] overflow-y-auto pr-2 space-y-4">
                  {games.map(game => (
                    <div key={game.id} className={clsx("p-4 rounded-xl border-2 flex flex-col md:flex-row justify-between items-center gap-4 transition-all shadow-sm", game.id === gameState?.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300")}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-black text-slate-800">{game.name || `Juego #${game.id}`}</h4>
                          <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-black uppercase", game.type === 'free' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>
                            {game.type === 'free' ? 'Gratis' : 'Pago'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 font-medium mb-3">
                          {game.start_time ? new Date(game.start_time).toLocaleString() : 'Sin fecha'} • Valor: {formatCurrency(game.card_value) || '-'}
                        </p>
                        
                        {game.patterns && game.patterns.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {game.patterns.map((p: any) => (
                              <span key={p.id} className={clsx("text-[10px] border px-2 py-1 rounded-md font-medium", p.is_rematch ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-slate-50 border-slate-200 text-slate-600")}>
                                {p.is_rematch && <span className="font-bold mr-1 italic">REVANCHA:</span>}
                                {p.name}: <span className="text-green-600 font-bold">{formatCurrency(p.prize)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <span className={clsx("text-[10px] font-bold uppercase px-2 py-1 rounded-md mt-4 inline-block shadow-sm border", 
                          game.status === 'playing' ? "bg-green-100 text-green-800 border-green-200" :
                          game.status === 'waiting' ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                          "bg-slate-100 text-slate-800 border-slate-200"
                        )}>{game.status}</span>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={() => activateGame(game.id)} disabled={game.id === gameState?.id} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:bg-slate-200 disabled:text-slate-400 shadow-md transition active:scale-95">
                          Activar
                        </button>
                        <button onClick={() => { setEditingGame(game); setShowEditGameModal(true); }} className="p-3 bg-blue-100 hover:bg-blue-200 text-blue-600 font-bold rounded-xl transition active:scale-90 shadow-sm border border-blue-200">
                          <Edit3 size={20} />
                        </button>
                        <button onClick={() => deleteGame(game.id)} className="p-3 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-xl transition active:scale-90 shadow-sm border border-red-200">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {games.length === 0 && (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                      <Calendar className="mx-auto text-slate-300 mb-2" size={48} />
                      <p className="text-slate-500 font-bold uppercase text-xs">No hay juegos programados.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'patterns' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 max-w-4xl mx-auto space-y-8">
              <div>
                <h2 className="text-xl font-black text-slate-800 mb-6 border-b pb-4 flex items-center gap-2">
                  <Grid className="text-blue-500" /> {editingPatternId ? 'Editar Patrón' : 'Creador de Patrones'}
                </h2>
                
                <form onSubmit={createPattern} className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="flex-1 w-full">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Nombre del Patrón</label>
                    <input 
                      required 
                      type="text" 
                      value={newPatternName} 
                      onChange={e => setNewPatternName(e.target.value)} 
                      className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none mb-4" 
                      placeholder="Ej: Cuatro Esquinas, Letra X..." 
                    />
                    
                    <div className="flex items-center gap-3 mb-6">
                      <label className="text-sm font-bold text-slate-700">Estado:</label>
                      <button 
                        type="button"
                        onClick={() => setNewPatternIsActive(!newPatternIsActive)}
                        className={clsx(
                          "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition",
                          newPatternIsActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {newPatternIsActive ? 'Activo' : 'Oculto'}
                      </button>
                    </div>

                    <p className="text-sm text-slate-500 mb-4">Haz clic en las casillas de la cuadrícula para dibujar el patrón ganador.</p>
                    
                    <div className="flex gap-3">
                      <button type="submit" className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition">
                        <Plus size={20} /> {editingPatternId ? 'Actualizar' : 'Guardar'} Patrón
                      </button>
                      {editingPatternId && (
                        <button 
                          type="button" 
                          onClick={() => {
                            setEditingPatternId(null);
                            setNewPatternName('');
                            setNewPatternGrid(Array(5).fill(null).map(() => Array(5).fill(false)));
                            setNewPatternIsActive(true);
                          }}
                          className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 mx-auto">
                    <div className="grid grid-cols-5 gap-1 w-64 h-64">
                      {getSafePatternGrid(newPatternGrid).map((row, r) => (
                        <React.Fragment key={r}>
                          {row.map((isMarked, c) => {
                            const isFree = r === 2 && c === 2;
                            return (
                              <button
                                key={`${r}-${c}`}
                                type="button"
                                onClick={() => togglePatternCell(r, c)}
                                className={clsx(
                                  "w-full h-full rounded-lg border-2 transition-all",
                                  isFree ? "bg-yellow-400 border-yellow-500 flex items-center justify-center text-xs font-black text-yellow-900" :
                                  isMarked ? "bg-blue-600 border-blue-700 shadow-inner" :
                                  "bg-white border-slate-300 hover:bg-slate-200"
                                )}
                              >
                                {isFree && 'FREE'}
                              </button>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </form>
              </div>

              <div>
                <h3 className="font-bold text-slate-700 border-b pb-2 mb-4">Patrones Guardados</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {patterns.map(pattern => (
                    <div key={pattern.id} className={clsx("bg-slate-50 border-2 rounded-2xl p-4 flex flex-col items-center relative group transition", pattern.is_active ? "border-slate-200" : "border-slate-300 opacity-60")}>
                      <div className="absolute top-2 right-2 flex gap-1 transition-opacity">
                        <button 
                          onClick={() => togglePatternStatus(pattern)}
                          className={clsx(
                            "p-1.5 rounded-lg transition",
                            pattern.is_active ? "bg-slate-200 text-slate-600 hover:bg-slate-300" : "bg-green-100 text-green-600 hover:bg-green-200"
                          )}
                          title={pattern.is_active ? "Ocultar" : "Mostrar"}
                        >
                          {pattern.is_active ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                        </button>
                        <button 
                          onClick={() => editPattern(pattern)}
                          className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                          title="Editar"
                        >
                          <Settings size={16} />
                        </button>
                        <button 
                          onClick={() => deletePattern(pattern.id)}
                          className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <h4 className="font-bold text-slate-800 mb-1 text-center w-full truncate pr-16 text-sm">{pattern.name}</h4>
                      <div className="text-[10px] font-bold uppercase mb-2 text-slate-500">
                        {pattern.is_active ? <span className="text-green-600">Activo</span> : <span className="text-slate-400">Oculto</span>}
                      </div>
                      <div className="grid grid-cols-5 gap-0.5 w-24 h-24">
                        {getSafePatternGrid(pattern.grid).map((row: boolean[], r: number) => (
                          <React.Fragment key={r}>
                            {row.map((isMarked: boolean, c: number) => {
                              const isFree = r === 2 && c === 2;
                              return (
                                <div
                                  key={`${r}-${c}`}
                                  className={clsx(
                                    "w-full h-full rounded-sm border",
                                    isFree ? "bg-yellow-400 border-yellow-500" :
                                    isMarked ? "bg-blue-600 border-blue-700" :
                                    "bg-white border-slate-200"
                                  )}
                                />
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                  {patterns.length === 0 && (
                    <p className="text-slate-500 col-span-full text-center py-4">No hay patrones guardados.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'sellers' && <AdminSellers />}

          {activeTab === 'users' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <Users size={24} className="text-blue-500" /> Jugadores
                </h2>
                <button 
                  onClick={fetchData}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition flex items-center gap-2 text-sm font-bold"
                  title="Refrescar lista"
                >
                  <RefreshCcw size={16} className={loading ? "animate-spin" : ""} /> Refrescar
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-6 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setPlayerFilter('all')}
                    className={clsx(
                      "px-4 py-2 rounded-xl text-sm font-bold transition",
                      playerFilter === 'all' ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Todos ({players.length})
                  </button>
                  <button 
                    onClick={() => setPlayerFilter('pending')}
                    className={clsx(
                      "px-4 py-2 rounded-xl text-sm font-bold transition",
                      playerFilter === 'pending' ? "bg-yellow-500 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Pendientes ({players.filter(p => p.status === 'pending').length})
                  </button>
                  <button 
                    onClick={() => setPlayerFilter('approved')}
                    className={clsx(
                      "px-4 py-2 rounded-xl text-sm font-bold transition",
                      playerFilter === 'approved' ? "bg-green-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Aprobados ({players.filter(p => p.status === 'approved').length})
                  </button>
                  <button 
                    onClick={() => setPlayerFilter('rejected')}
                    className={clsx(
                      "px-4 py-2 rounded-xl text-sm font-bold transition",
                      playerFilter === 'rejected' ? "bg-red-500 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Rechazados ({players.filter(p => p.status === 'rejected').length})
                  </button>
                </div>

                {players.some(p => p.status === 'pending') && (
                  <button 
                    onClick={approveAllPlayers}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black uppercase tracking-wider shadow-lg hover:bg-emerald-700 transition flex items-center gap-2 active:scale-95"
                  >
                    <CheckCircle2 size={16} /> Aprobar Pendientes ({players.filter(p => p.status === 'pending').length})
                  </button>
                )}
              </div>
              
              <div className="space-y-4">
                {players.filter(p => playerFilter === 'all' || p.status === playerFilter).length === 0 ? (
                  <p className="text-slate-500 text-center py-8 font-medium">No hay jugadores que coincidan con el filtro.</p>
                ) : (
                  players
                    .filter(p => playerFilter === 'all' || p.status === playerFilter)
                    .map((player) => (
                    <div key={player.id} className="border-2 border-slate-100 rounded-2xl p-4 hover:border-blue-100 transition">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-slate-800 text-lg">{player.name}</h3>
                          <div className="flex gap-3 text-slate-500 text-sm font-medium">
                            <span className="font-mono">{player.phone}</span>
                            {player.city && <span>• {player.city}</span>}
                          </div>
                        </div>
                        <span className={clsx(
                          "px-2 py-1 rounded-lg text-xs font-bold uppercase",
                          player.status === 'approved' ? "bg-green-100 text-green-700" : 
                          player.status === 'rejected' ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        )}>
                          {player.status === 'rejected' ? 'Rechazado' : player.status}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Cartones</span>
                          <div className="flex gap-4 mt-1">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-500 font-bold uppercase">Comprados</span>
                              <span className="text-lg font-black text-blue-600">{player.card_count}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-500 font-bold uppercase">Asignados</span>
                              <span className={clsx(
                                "text-lg font-black",
                                (player.cards?.length || 0) >= player.card_count ? "text-green-600" : "text-red-500"
                              )}>
                                {player.cards?.length || 0}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] text-purple-700 font-black uppercase flex items-center gap-1">
                                <Gift size={10} /> Regalados
                              </span>
                              <button
                                onClick={() => setSelectedGiftingPlayer(player)}
                                className={clsx(
                                  "text-xs font-black flex items-center gap-1 px-2.5 py-1 rounded-xl border transition active:scale-95 cursor-pointer mt-0.5",
                                  (player.gift_count || 0) >= 4
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                                    : (player.gift_count || 0) > 0
                                      ? "bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200"
                                      : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                                )}
                                title="Ver visor de cartones regalados"
                              >
                                🎁 {player.gift_count || 0} / 4
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {player.status === 'pending' && (
                            <button 
                              onClick={() => approvePlayer(player.id)}
                              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all shadow-[0_8px_20px_-6px_rgba(16,185,129,0.5)] active:scale-95"
                            >
                              <CheckCircle2 size={16} /> Aprobar Registro
                            </button>
                          )}
                          
                          {player.status !== 'rejected' && (
                            <button 
                              onClick={() => rejectPlayer(player.id)}
                              className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-bold rounded-xl flex items-center gap-1 transition border border-red-200 shadow-xs active:scale-95"
                              title="Rechazar compra y retirar de la partida actual"
                            >
                              <XCircle size={16} /> Rechazar y Quitar Cartones
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {player.status === 'pending' && (() => {
                        try {
                          const history = JSON.parse(player.receipt_url);
                          const lastReceipt = Array.isArray(history) ? history[history.length - 1] : null;
                          if (lastReceipt?.validation_reason) {
                            return (
                              <div className="mt-3 p-2.5 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2 shadow-xs">
                                <span className="text-base shrink-0">🔍</span>
                                <div>
                                  <span className="font-black uppercase text-[10px] text-amber-800 tracking-wider block">Auditoría Anti-Fraude (IA):</span>
                                  <p className="font-medium text-[11px] leading-snug text-slate-700 mt-0.5">{lastReceipt.validation_reason}</p>
                                </div>
                              </div>
                            );
                          }
                        } catch (e) {}
                        return null;
                      })()}

                      {/* QR Validation Status Badge for Admin */}
                      {(() => {
                        const isQrVerified = player.receipt_url?.includes('#qr_verified#true#');
                        let lastReceipt: any = null;
                        try {
                          const history = JSON.parse(player.receipt_url);
                          lastReceipt = Array.isArray(history) ? history[history.length - 1] : null;
                        } catch (e) {}

                        const qrOk = isQrVerified || lastReceipt?.qr_verified === true;
                        if (!player.receipt_url || player.receipt_url === 'FREE_GAME' || player.receipt_url === 'WALLET_PAYMENT') return null;

                        return (
                          <div className={`mt-2.5 p-2 rounded-xl border text-xs flex items-center justify-between ${qrOk ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${qrOk ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                <QrCode size={14} />
                              </div>
                              <div>
                                <span className="font-black text-[10px] uppercase tracking-wider block">
                                  {qrOk ? 'QR Nequi: Certificado Digitalmente' : 'QR Nequi: Inspección Visual'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {qrOk ? 'Monto, fecha y receptor contrastados con el QR' : 'Comprobante inspeccionado por el sistema'}
                                </span>
                              </div>
                            </div>
                            {qrOk && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[9px] uppercase tracking-tight shrink-0">
                                QR Válido ✓
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      
                      {player.status === 'approved' && player.cards && player.cards.length > 0 && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Números Asignados</p>
                          <div className="flex flex-wrap gap-1">
                            {player.cards.map((cardNum: any, idx: number) => {
                              const isWinner = bingoAlerts.some((a: any) => {
                                const cNum = cardNum != null ? String(cardNum) : '';
                                if (!cNum) return false;
                                if (a?.card_number != null && String(a.card_number) === cNum) return true;
                                if (Array.isArray(a?.winners)) {
                                  return a.winners.some((w: any) => w?.card_number != null && String(w.card_number) === cNum);
                                }
                                return false;
                              });
                              return (
                                <span 
                                  key={`${cardNum}-${idx}`} 
                                  className={clsx(
                                    "px-2 py-1 text-xs font-mono font-bold rounded-md border shadow-sm flex items-center gap-1",
                                    isWinner 
                                      ? "bg-emerald-600 text-white border-emerald-400 animate-pulse" 
                                      : "bg-white text-slate-700 border-slate-200"
                                  )}
                                >
                                  #{cardNum}
                                  {isWinner && <Trophy size={10} className="text-white" />}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {player.receipt_url && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <button 
                            onClick={() => setExpandedReceipts(prev => ({ ...prev, [player.id]: !prev[player.id] }))}
                            className="flex items-center justify-between w-full group/toggle"
                          >
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover/toggle:text-blue-500 transition-colors">
                              Historial de Comprobantes (Máx 2)
                            </p>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                              {expandedReceipts[player.id] ? (
                                <><ChevronUp size={12} /> Contraer</>
                              ) : (
                                <><ChevronDown size={12} /> Expandir</>
                              )}
                            </div>
                          </button>
                          
                          {expandedReceipts[player.id] && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="flex flex-wrap gap-3 mt-3">
                                {(() => {
                                  try {
                                    const history = JSON.parse(player.receipt_url);
                                    if (Array.isArray(history)) {
                                      return history.map((item, idx) => {
                                        const url = typeof item === 'string' ? item : item.url;
                                        const rawDate = typeof item === 'object' && item.date ? item.date : player.created_at;
                                        const date = rawDate ? new Date(rawDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                                        
                                        return (
                                          <div key={idx} className="group relative">
                                            <a 
                                              href={url} 
                                              target="_blank" 
                                              rel="noreferrer"
                                              className="block"
                                            >
                                              <div className={clsx(
                                                "w-20 h-20 rounded-lg overflow-hidden border-2 transition-all group-hover:scale-105",
                                                idx === history.length - 1 ? "border-blue-500 shadow-md" : "border-slate-200 opacity-70"
                                              )}>
                                                <img 
                                                  src={url} 
                                                  alt={`Recibo ${idx + 1}`} 
                                                  className="w-full h-full object-cover"
                                                  referrerPolicy="no-referrer"
                                                />
                                              </div>
                                              <div className="mt-1 text-center bg-slate-50 rounded p-1 border border-slate-100">
                                                <span className={clsx(
                                                  "text-[9px] font-black block uppercase",
                                                  idx === history.length - 1 ? "text-blue-600" : "text-slate-400"
                                                )}>
                                                  {idx === history.length - 1 ? 'Actual' : `Ant. ${idx + 1}`}
                                                </span>
                                                <span className="text-[8px] text-slate-600 font-bold block leading-tight">
                                                  {date}
                                                </span>
                                              </div>
                                            </a>
                                          </div>
                                        );
                                      });
                                    }
                                  } catch (e) {
                                    // Not a JSON array
                                  }
                                  const fallbackDate = player.created_at ? new Date(player.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                                  return (
                                    <div className="group relative">
                                      <a 
                                        href={player.receipt_url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="block"
                                      >
                                        <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-blue-500 shadow-md transition-all group-hover:scale-105">
                                          <img 
                                            src={player.receipt_url} 
                                            alt="Recibo" 
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                          />
                                        </div>
                                        <div className="mt-1 text-center bg-slate-50 rounded p-1 border border-slate-100">
                                          <span className="text-[9px] font-black block uppercase text-blue-600">
                                            Actual
                                          </span>
                                          <span className="text-[8px] text-slate-600 font-bold block leading-tight">
                                            {fallbackDate}
                                          </span>
                                        </div>
                                      </a>
                                    </div>
                                  );
                                })()}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ALL USERS MANAGEMENT TAB */}
          {activeTab === 'all_users' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 max-w-5xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b pb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                    <Users size={32} className="text-blue-500" /> Gestión de Usuarios
                  </h2>
                  <p className="text-slate-500 font-bold text-sm">Administra todos los jugadores registrados en el sistema</p>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text"
                      placeholder="Buscar por nombre o celular..."
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold transition"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={fetchAllPlayers}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition"
                    title="Refrescar"
                  >
                    <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* Filtro Rápido de Cartones Regalados */}
              <div className="flex flex-wrap items-center gap-2 mb-6 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest mr-1 flex items-center gap-1.5">
                  <Gift size={15} className="text-purple-600" /> Filtro Regalos:
                </span>
                <button
                  onClick={() => setUserGiftFilter('all')}
                  className={clsx(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer",
                    userGiftFilter === 'all'
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  )}
                >
                  Todos ({allPlayers.length})
                </button>
                <button
                  onClick={() => setUserGiftFilter('gifted')}
                  className={clsx(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer",
                    userGiftFilter === 'gifted'
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                      : "bg-white text-purple-700 hover:bg-purple-50 border border-purple-200"
                  )}
                >
                  <Gift size={12} /> Han Regalado ({allPlayers.filter(p => (p.gift_count || 0) > 0).length})
                </button>
                <button
                  onClick={() => setUserGiftFilter('completed')}
                  className={clsx(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer",
                    userGiftFilter === 'completed'
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                      : "bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
                  )}
                >
                  ✨ 4 de 4 Completos ({allPlayers.filter(p => (p.gift_count || 0) >= 4).length})
                </button>
                <button
                  onClick={() => setUserGiftFilter('none')}
                  className={clsx(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer",
                    userGiftFilter === 'none'
                      ? "bg-slate-700 text-white shadow-md"
                      : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
                  )}
                >
                  Sin Regalar ({allPlayers.filter(p => (p.gift_count || 0) === 0).length})
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-xs font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-4 py-2">Nombre</th>
                      <th className="px-4 py-2">Celular</th>
                      <th className="px-4 py-2">Ubicación</th>
                      <th className="px-4 py-2 text-center">Cartones Regalados (Visor)</th>
                      <th className="px-4 py-2">Registro</th>
                      <th className="px-4 py-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPlayers
                      .filter(p => {
                        const matchesSearch = p.name.toLowerCase().includes(userSearch.toLowerCase()) || p.phone.includes(userSearch);
                        if (!matchesSearch) return false;
                        const gifts = p.gift_count || 0;
                        if (userGiftFilter === 'gifted') return gifts > 0;
                        if (userGiftFilter === 'completed') return gifts >= 4;
                        if (userGiftFilter === 'none') return gifts === 0;
                        return true;
                      })
                      .map((player) => (
                      <tr key={player.id} className={clsx(
                        "transition group",
                        player.is_blocked ? "bg-red-50 hover:bg-red-100 opacity-80" : "bg-slate-50 hover:bg-blue-50"
                      )}>
                        <td className="px-4 py-4 rounded-l-2xl border-y border-l border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              "w-10 h-10 rounded-full flex items-center justify-center font-black",
                              player.is_blocked ? "bg-red-200 text-red-700" : "bg-blue-100 text-blue-600"
                            )}>
                              {player.is_blocked ? <Ban size={18} /> : player.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className={clsx("font-bold block", player.is_blocked ? "text-red-800" : "text-slate-800")}>
                                {player.name}
                              </span>
                              {player.email && (
                                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                  <Mail size={10} /> {player.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-100">
                          <span className="font-mono font-bold text-slate-600">{player.phone}</span>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-100">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-1">
                              <MapPin size={12} className="text-slate-400" /> {player.city || 'N/A'}
                            </span>
                            {player.state && (
                              <span className="text-[10px] text-slate-400 font-bold uppercase ml-4">{player.state}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-100 text-center">
                          <button
                            onClick={() => setSelectedGiftingPlayer(player)}
                            className={clsx(
                              "inline-flex flex-col items-center justify-center p-2 px-3 rounded-2xl transition active:scale-95 border group text-left cursor-pointer",
                              (player.gift_count || 0) >= 4
                                ? "bg-emerald-50 border-emerald-300 hover:bg-emerald-100 text-emerald-950"
                                : (player.gift_count || 0) > 0
                                  ? "bg-purple-50 border-purple-300 hover:bg-purple-100 text-purple-950"
                                  : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600"
                            )}
                            title="Haz clic para abrir el visor detallado de cartones regalados"
                          >
                            <div className="flex items-center gap-1.5">
                              <Gift size={15} className={(player.gift_count || 0) > 0 ? "text-purple-600" : "text-slate-400"} />
                              <span className="font-black text-sm">
                                {player.gift_count || 0} / 4
                              </span>
                              <span className={clsx(
                                "text-[10px] font-black uppercase px-2 py-0.5 rounded-full ml-1",
                                (player.gift_count || 0) >= 4
                                  ? "bg-emerald-600 text-white"
                                  : (player.gift_count || 0) > 0
                                    ? "bg-purple-600 text-white"
                                    : "bg-slate-200 text-slate-600"
                              )}>
                                {(player.gift_count || 0) >= 4 ? '4 de 4 ✓' : (player.gift_count || 0) > 0 ? `${player.gift_count} de 4` : '0 de 4'}
                              </span>
                            </div>

                            {/* Mini Visor Indicador 1, 2, 3, 4 */}
                            <div className="flex items-center gap-1 mt-1.5">
                              {[0, 1, 2, 3].map(slotIdx => {
                                const isGiven = (player.gift_count || 0) > slotIdx;
                                const detail = player.gift_details?.[slotIdx];
                                const isClaimed = detail?.status === 'claimed';
                                return (
                                  <div
                                    key={slotIdx}
                                    className={clsx(
                                      "w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-black shadow-xs",
                                      isClaimed
                                        ? "bg-emerald-500 text-white"
                                        : isGiven
                                          ? "bg-purple-500 text-white"
                                          : "bg-slate-200 text-slate-400"
                                    )}
                                    title={isClaimed ? `Regalo ${slotIdx+1}: Reclamado por amigo` : isGiven ? `Regalo ${slotIdx+1}: Enviado por WhatsApp (Pendiente)` : `Regalo ${slotIdx+1}: Disponible sin enviar`}
                                  >
                                    {slotIdx + 1}
                                  </div>
                                );
                              })}
                              <span className="text-[10px] text-slate-400 font-bold ml-1 group-hover:text-purple-600 transition">
                                Ver 👁️
                              </span>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-100">
                          <span className="text-xs font-bold text-slate-400">
                            {new Date(player.created_at).toLocaleDateString('es-ES')}
                          </span>
                        </td>
                        <td className="px-4 py-4 rounded-r-2xl border-y border-r border-slate-100 text-center">
                          <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => setEditingUser(player)}
                              className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition"
                              title="Editar Datos"
                            >
                              <Edit3 size={18} />
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedWalletPlayer(player.phone);
                                setActiveTab('wallet');
                              }}
                              className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition"
                              title="Ver Billetera"
                            >
                              <Wallet size={18} />
                            </button>
                            <button 
                              onClick={() => toggleBlockUser(player.id)}
                              className={clsx(
                                "p-2 rounded-lg transition",
                                player.is_blocked ? "bg-green-100 text-green-600 hover:bg-green-200" : "bg-orange-100 text-orange-600 hover:bg-orange-200"
                              )}
                              title={player.is_blocked ? "Desbloquear" : "Bloquear"}
                            >
                              {player.is_blocked ? <ShieldCheck size={18} /> : <Ban size={18} />}
                            </button>
                            <button 
                              onClick={() => {
                                setUserToDelete(player);
                                setShowDeleteModal(true);
                              }}
                              disabled={isDeletingUser === player.id}
                              className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition disabled:opacity-50"
                              title="Eliminar Usuario"
                            >
                              {isDeletingUser === player.id ? <RefreshCcw size={18} className="animate-spin" /> : <Trash2 size={18} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {allPlayers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 font-bold">
                          No hay usuarios registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <NotificationAdmin />
            </div>
          )}

          {/* TICKETS DE RECUPERACIÓN DE CONTRASEÑA */}
          {activeTab === 'tickets' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                      <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
                        <Key size={24} />
                      </div>
                      Tickets: Recuperación de Claves
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                      Gestiona solicitudes técnicas de jugadores que olvidaron su contraseña.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchSupportTickets}
                      disabled={isLoadingTickets}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition disabled:opacity-50"
                    >
                      <RefreshCcw size={14} className={isLoadingTickets ? "animate-spin" : ""} />
                      Actualizar
                    </button>
                  </div>
                </div>

                {/* Banner de Instrucción / Advertencia */}
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6 text-amber-900 text-xs sm:text-sm flex items-start gap-3">
                  <Key className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black uppercase tracking-wider block mb-0.5 text-amber-800">
                      Instrucción del Procedimiento
                    </span>
                    Al presionar <strong>"Restablecer a 123456"</strong>, la contraseña del jugador se actualizará automáticamente a <strong>123456</strong>, el ticket quedará resuelto y se enviará una <strong>notificación push inmediata</strong> al teléfono del jugador indicándole que su contraseña se restableció a 123456 y debe personalizarla lo más pronto posible.
                  </div>
                </div>

                {/* Filtros */}
                <div className="flex gap-2 mb-6">
                  {(['all', 'pending', 'resolved'] as const).map((filter) => {
                    const count = filter === 'all' 
                      ? supportTickets.length 
                      : supportTickets.filter(t => t.status === filter).length;
                    const labels = { all: 'Todos', pending: 'Pendientes', resolved: 'Resueltos' };
                    return (
                      <button
                        key={filter}
                        onClick={() => setTicketFilter(filter)}
                        className={clsx(
                          "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2",
                          ticketFilter === filter 
                            ? "bg-slate-900 text-white shadow" 
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        {labels[filter]}
                        <span className={clsx(
                          "px-2 py-0.5 rounded-full text-[10px]",
                          ticketFilter === filter ? "bg-amber-500 text-slate-950 font-black" : "bg-slate-200 text-slate-700 font-bold"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Lista de Tickets */}
                {isLoadingTickets && supportTickets.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                    <Loader2 size={32} className="animate-spin text-amber-500" />
                    <p className="text-sm font-bold">Cargando solicitudes...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {supportTickets
                      .filter(t => ticketFilter === 'all' || t.status === ticketFilter)
                      .map((ticket) => {
                        const isPending = ticket.status === 'pending';
                        const isResetting = resettingTicketId === ticket.id;
                        return (
                          <div 
                            key={ticket.id} 
                            className={clsx(
                              "p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4",
                              isPending 
                                ? "bg-amber-50/40 border-amber-200 hover:border-amber-300 shadow-sm" 
                                : "bg-slate-50 border-slate-200 opacity-80"
                            )}
                          >
                            <div className="space-y-2 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-slate-900 text-base">
                                  {ticket.name}
                                </span>
                                <span className={clsx(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                                  isPending ? "bg-amber-500 text-white animate-pulse" : "bg-emerald-500 text-white"
                                )}>
                                  {isPending ? 'Pendiente' : 'Resuelto'}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {new Date(ticket.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
                                <div className="flex items-center gap-1.5">
                                  <Smartphone size={14} className="text-emerald-600" />
                                  <span>Teléfono: <strong>{ticket.phone}</strong></span>
                                </div>
                                {ticket.email && (
                                  <div className="flex items-center gap-1.5">
                                    <Mail size={14} className="text-blue-500" />
                                    <span>{ticket.email}</span>
                                  </div>
                                )}
                              </div>

                              {ticket.message && (
                                <div className="text-xs text-slate-700 bg-white/80 p-2.5 rounded-xl border border-slate-200/60 mt-1.5">
                                  <span className="font-bold text-slate-500 mr-1.5">Mensaje del jugador:</span>
                                  "{ticket.message}"
                                </div>
                              )}

                              {!isPending && ticket.resolved_at && (
                                <p className="text-[11px] text-emerald-700 font-semibold">
                                  ✓ Resuelto el {new Date(ticket.resolved_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} (Clave restablecida a 123456 y push enviado)
                                </p>
                              )}
                            </div>

                            {/* Botón de Restablecimiento */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleResetPasswordTicket(ticket)}
                                disabled={isResetting}
                                className={clsx(
                                  "w-full md:w-auto px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition transform active:scale-95",
                                  isPending
                                    ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-amber-500/25"
                                    : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                                )}
                              >
                                {isResetting ? (
                                  <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Restableciendo...</span>
                                  </>
                                ) : (
                                  <>
                                    <Key size={16} />
                                    <span>{isPending ? 'Restablecer a 123456' : 'Volver a Restablecer (123456)'}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                    {supportTickets.filter(t => ticketFilter === 'all' || t.status === ticketFilter).length === 0 && (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                        <CheckCircle2 size={36} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-bold text-sm">No hay solicitudes en esta categoría.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WINNERS HISTORY TAB */}
          {activeTab === 'winners_history' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <div className="p-3 bg-yellow-100 rounded-2xl text-yellow-600">
                    <Trophy size={24} />
                  </div>
                  Historial de Ganadores
                </h2>
                <button 
                  onClick={fetchWinners}
                  disabled={isWinnersLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition disabled:opacity-50"
                >
                  <RefreshCcw size={18} className={isWinnersLoading ? 'animate-spin' : ''} />
                  Actualizar
                </button>
              </div>

              <div className="overflow-x-auto rounded-3xl border-2 border-slate-100 shadow-inner">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-100">
                      <th className="px-6 py-5 font-black text-slate-600 text-xs uppercase tracking-widest">Bingo / Fecha / Hora</th>
                      <th className="px-6 py-5 font-black text-slate-600 text-xs uppercase tracking-widest">Ganador (Nombre / Tel)</th>
                      <th className="px-6 py-5 font-black text-slate-600 text-xs uppercase tracking-widest">Patrón / Premio</th>
                      <th className="px-6 py-5 font-black text-slate-600 text-xs uppercase tracking-widest text-center">Estado de Pago</th>
                      <th className="px-6 py-5 font-black text-slate-600 text-xs uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-50">
                    {winners.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-300">
                            <Trophy size={64} className="opacity-20" />
                            <p className="font-black text-lg text-slate-400 italic">
                              {isWinnersLoading ? 'Sincronizando ganadores...' : 'Aún no hay ganadores en el registro'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      winners.map((winner) => (
                        <tr key={winner.id} className="group hover:bg-blue-50/30 transition-colors duration-300">
                          <td className="px-6 py-6 transition-all group-hover:pl-8">
                            <div className="font-black text-slate-900 leading-tight uppercase tracking-tight mb-1">{winner.game_name}</div>
                            <div className="flex items-center gap-2 text-slate-500">
                              <Calendar size={12} className="text-blue-500" />
                              <span className="text-[10px] font-black uppercase tracking-tight">{(new Date(winner.won_at)).toLocaleDateString()}</span>
                              <span className="w-1 h-1 bg-slate-300 rounded-full" />
                              <Clock size={12} className="text-indigo-500" />
                              <span className="text-[10px] font-black uppercase tracking-tight">{(new Date(winner.won_at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </td>
                          <td className="px-6 py-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center font-black group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                {winner.player_name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <div className="font-black text-slate-900 leading-tight group-hover:text-blue-700 transition-colors">{winner.player_name}</div>
                                <div className="text-[11px] font-black text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  <MessageCircle size={12} className="text-green-500" /> {winner.player_phone}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-6">
                            <div className="px-3 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg inline-block border border-blue-100 uppercase tracking-widest mb-1.5">
                              {winner.pattern_name}
                            </div>
                            <div className="text-lg font-black text-emerald-600 leading-none drop-shadow-sm">{formatCurrency(winner.prize || 0)}</div>
                          </td>
                          <td className="px-6 py-6 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={clsx(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] shadow-sm border-2",
                                winner.payment_status === 'paid' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                winner.payment_status === 'rejected' ? "bg-red-50 text-red-700 border-red-100" :
                                "bg-amber-50 text-amber-700 border-amber-100 animate-pulse"
                              )}>
                                {winner.payment_status === 'paid' && <CheckCircle2 size={14} />}
                                {winner.payment_status === 'rejected' && <XCircle size={14} />}
                                {winner.payment_status === 'pending' && <Clock size={14} />}
                                {winner.payment_status === 'paid' ? 'Pagado' :
                                 winner.payment_status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                              </span>
                              {winner.rejection_reason && (
                                <p className="text-[9px] text-red-500 font-bold max-w-[120px] mx-auto italic break-words line-clamp-2" title={winner.rejection_reason}>
                                  "{winner.rejection_reason}"
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-6">
                            <div className="flex justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                              {winner.payment_status !== 'paid' && (
                                <button 
                                  onClick={() => updateWinnerStatus(winner.id, 'paid')}
                                  disabled={isUpdatingWinnerStatus === winner.id}
                                  className="w-10 h-10 bg-white border-2 border-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all duration-300 shadow-sm flex items-center justify-center group/btn"
                                  title="Marcar como Pagado"
                                >
                                  {isUpdatingWinnerStatus === winner.id ? <RefreshCcw size={18} className="animate-spin" /> : <CheckCircle2 size={18} className="group-hover/btn:scale-110 transition-transform" />}
                                </button>
                              )}
                              {winner.payment_status !== 'rejected' && (
                                <button 
                                  onClick={() => setSelectedWinnerForRejection(winner)}
                                  disabled={isUpdatingWinnerStatus === winner.id}
                                  className="w-10 h-10 bg-white border-2 border-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all duration-300 shadow-sm flex items-center justify-center group/btn"
                                  title="Rechazar Pago"
                                >
                                  {isUpdatingWinnerStatus === winner.id ? <RefreshCcw size={18} className="animate-spin" /> : <XCircle size={18} className="group-hover/btn:scale-110 transition-transform" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GANADORES Y METAS EN JUEGOS GRATIS TAB */}
          {activeTab === 'free_winners' && (
            <div className="space-y-6">
              <FreeGamesLeaderboard isAdmin={true} tenantId={currentTenant || undefined} />
            </div>
          )}

          {/* NÚMEROS EN SORTEO DE LOTERÍA TAB */}
          {activeTab === 'lottery_numbers' && (
            <div className="space-y-6">
              {/* Controles de Acción Rápidos */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                    <span>🎰</span> Números en Sorteo de Lotería
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    Listado de números de cartones registrados por los jugadores para participar en el sorteo nocturno de la lotería
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
                  <button 
                    onClick={fetchLotteryNumbers}
                    disabled={isLotteryLoading}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-bold text-slate-700 text-xs rounded-xl flex items-center justify-center gap-1.5 transition border border-slate-200 cursor-pointer"
                  >
                    🔄 Actualizar Listado
                  </button>
                  <button 
                    onClick={clearLotteryNumbers}
                    disabled={isLotteryLoading || lotteryNumbers.length === 0}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-rose-600 hover:bg-rose-700 font-black text-white text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm hover:shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    🗑️ Vaciar Listado
                  </button>
                </div>
              </div>

              {/* Estadísticas Rápidas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex items-center gap-4 shadow-sm">
                  <div className="text-3xl bg-amber-100 p-2.5 rounded-2xl">🍀</div>
                  <div>
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest leading-none">Total Números en Juego</p>
                    <p className="text-2xl font-black text-amber-950 mt-1">{lotteryNumbers.length}</p>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-3xl p-5 flex items-center gap-4 shadow-sm">
                  <div className="text-3xl bg-blue-100 p-2.5 rounded-2xl">👥</div>
                  <div>
                    <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest leading-none">Jugadores Únicos</p>
                    <p className="text-2xl font-black text-blue-950 mt-1">
                      {new Set(lotteryNumbers.map(item => item.player_phone)).size}
                    </p>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 flex items-center gap-4 shadow-sm">
                  <div className="text-3xl bg-slate-100 p-2.5 rounded-2xl">🏟️</div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Juegos con Números</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">
                      {new Set(lotteryNumbers.map(item => item.game_name)).size}
                    </p>
                  </div>
                </div>
              </div>

              {/* PANEL DE CONFIRMACIÓN DEL GANADOR DEL SORTEO DE LOTERÍA */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                      <span>🏆</span> Confirmar Ganador de Lotería
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Establece el código de 4 cifras ganador oficial de la lotería para resolver automáticamente el sorteo actual.
                    </p>
                  </div>
                  {isLotteryConfirmed && (
                    <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Sorteo Confirmado
                    </div>
                  )}
                </div>

                {isLotteryConfirmed ? (
                  <div className="bg-emerald-50 border-2 border-emerald-200 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="text-4xl text-amber-500 drop-shadow">👑</div>
                      <div>
                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest leading-none">Código Ganador</p>
                        <p className="text-xl font-extrabold text-emerald-950 mt-1">
                          Código #{confirmedWinningCode}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={resetLotteryWinner}
                      disabled={isConfirmingLottery}
                      className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs rounded-xl transition cursor-pointer shrink-0"
                    >
                      {isConfirmingLottery ? 'Cargando...' : '🔄 Restablecer Sorteo'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="w-full sm:w-auto flex-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Código Ganador Oficial (4 Cifras)</label>
                      <input
                        type="text"
                        placeholder="Escribe el código ganador (p.ej. 1234)"
                        value={lotteryWinnerCodeInput}
                        onChange={(e) => setLotteryWinnerCodeInput(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={confirmLotteryWinner}
                      disabled={isConfirmingLottery}
                      className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-sm hover:shadow active:scale-95 duration-150 mt-2 sm:mt-5 cursor-pointer shrink-0"
                    >
                      {isConfirmingLottery ? 'Confirmando...' : '🎉 Confirmar Ganador'}
                    </button>
                  </div>
                )}
              </div>

              {/* Lista Principal */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                {isLotteryLoading ? (
                  <div className="p-12 text-center text-sm font-semibold text-slate-400 flex flex-col justify-center items-center gap-2">
                    <span className="animate-spin text-2xl">⏳</span>
                    <span>Cargando números registrados...</span>
                  </div>
                ) : lotteryNumbers.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 max-w-md mx-auto space-y-3">
                    <span className="text-4xl text-amber-500 drop-shadow">🎰</span>
                    <h3 className="font-bold text-slate-800 text-base">No hay números registrados aún</h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                      Los números de cartón guardados por los jugadores aparecerán automáticamente en esta lista junto con su nombre y teléfono para poder consultar de forma simple quién fue el ganador con el sorteo de lotería nocturno.
                    </p>
                    <button 
                      onClick={fetchLotteryNumbers}
                      className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-extrabold text-xs rounded-xl transition inline-flex items-center gap-1 cursor-pointer"
                    >
                      🔄 Reintentar Actualización
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
                      <div className="flex-1 max-w-md relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                        <input
                          type="text"
                          placeholder="Buscar número de cartón, nombre o teléfono..."
                          value={lotterySearchTerm}
                          onChange={(e) => setLotterySearchTerm(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition"
                        />
                      </div>
                      <div className="text-xs font-black text-slate-500 uppercase tracking-widest hidden sm:block">
                        {filteredLotteryNumbers.length} Resultados
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-black tracking-widest uppercase text-slate-400">
                            <th className="py-4 px-6 text-center">Código Lotería</th>
                            <th className="py-4 px-6 text-center">Nº Cartón</th>
                            <th className="py-4 px-6">Jugador</th>
                            <th className="py-4 px-6">Teléfono / WhatsApp</th>
                            <th className="py-4 px-6">Juego</th>
                            <th className="py-4 px-6 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredLotteryNumbers.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500 text-sm font-bold">
                                No se encontraron resultados para la búsqueda "{lotterySearchTerm}"
                              </td>
                            </tr>
                          ) : (
                            filteredLotteryNumbers.map((item) => (
                              <tr key={item.id} className="hover:bg-slate-50/50 transition">
                                <td className="py-4 px-6 text-center">
                                  <span className={`inline-block font-black text-sm px-3.5 py-1.5 rounded-xl shadow-sm border ${
                                    isLotteryConfirmed && confirmedWinningCode === item.lottery_code
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : 'bg-indigo-100 text-indigo-950 border-indigo-200'
                                  }`}>
                                    #{item.lottery_code || 'N/A'}
                                    {isLotteryConfirmed && confirmedWinningCode === item.lottery_code && ' 👑'}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-center font-bold text-slate-500 text-xs">
                                  #{item.card_number}
                                </td>
                                <td className="py-4 px-6 font-extrabold text-slate-850 text-sm">
                                  {item.player_name}
                                </td>
                                <td className="py-4 px-6 font-semibold text-slate-500 text-xs">
                                  {item.player_phone}
                                </td>
                                <td className="py-4 px-6 font-bold text-slate-600 text-xs truncate max-w-[200px]">
                                  {item.game_name}
                                </td>
                                <td className="py-4 px-6 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    {(lotterySearchTerm.trim() !== '' || isLotteryConfirmed) && (!isLotteryConfirmed || confirmedWinningCode === item.lottery_code) ? (
                                      <button
                                        onClick={() => confirmLotteryWinnerDirectly(item.lottery_code)}
                                        disabled={isLotteryConfirmed || isConfirmingLottery}
                                        className="px-4 py-2 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white uppercase tracking-wider rounded-lg shadow-sm hover:shadow transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1 shrink-0 font-sans"
                                        title={isLotteryConfirmed ? "Ganador confirmado" : "Confirmar como ganador de la lotería"}
                                      >
                                        👑 {isLotteryConfirmed ? 'Ganador Confirmado' : 'Confirmar Ganador'}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setLotteryWinnerCodeInput(String(item.lottery_code));
                                          toast.success(`Se seleccionó el código #${item.lottery_code} como ganador. Presiona "Confirmar Ganador" arriba para consolidarlo.`);
                                        }}
                                        disabled={isLotteryConfirmed}
                                        className="p-1 px-3 text-[10px] font-black bg-amber-50 hover:bg-amber-100/80 text-amber-700 rounded-lg border border-amber-100 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1 shrink-0 font-sans"
                                        title="Establecer como código ganador oficial de la lotería"
                                      >
                                        👑 Seleccionar
                                      </button>
                                    )}
                                    <button
                                      onClick={() => deleteLotteryNumber(item.id)}
                                      disabled={isLotteryConfirmed}
                                      className="p-1 px-3 text-[10px] font-black bg-rose-50 hover:bg-rose-100/80 text-rose-600 rounded-lg border border-rose-100 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1 shrink-0 font-sans"
                                      title="Eliminar de la lista de sorteo"
                                    >
                                      ❌ Eliminar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HISTORIAL Y ESTADÍSTICAS TAB */}
          {activeTab === 'statistics_history' && (
            <div className="space-y-6">
              {/* Controles de Acción Rápidos */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Historial e Indicadores Generales</h2>
                  <p className="text-xs text-slate-400 font-medium mt-1">Análisis y rendimiento histórico de todas las sesiones de juego</p>
                </div>
                <button
                  onClick={fetchGamesStatsHistory}
                  disabled={historyLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 disabled:opacity-50"
                >
                  <RefreshCcw size={14} className={clsx(historyLoading && "animate-spin")} />
                  <span>Actualizar Historial</span>
                </button>
              </div>

              {/* Grid de KPIs Globales */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* 1. Usuarios Registrados */}
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
                  <div className="absolute -right-5 -bottom-5 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-black tracking-widest text-indigo-200">
                      Audiencia Global
                    </span>
                    <h3 className="text-4xl font-black tracking-tight">{totalRegisteredUsers}</h3>
                    <p className="text-xs text-indigo-100 font-medium pt-1">
                      Usuarios totales registrados en el sistema
                    </p>
                  </div>
                </div>

                {/* 2. Juegos Realizados */}
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
                  <div className="absolute -right-5 -bottom-5 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-black tracking-widest text-blue-200">
                      Sesiones del Sistema
                    </span>
                    <h3 className="text-4xl font-black tracking-tight">{statsHistory.length}</h3>
                    <p className="text-xs text-blue-100 font-medium pt-1">
                      Juegos programados, activos o completados
                    </p>
                  </div>
                </div>

                {/* 3. Rendimiento / Promedio de Cartones */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden border border-slate-750">
                  <div className="absolute -right-5 -bottom-5 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                      Promedio de Venta
                    </span>
                    <h3 className="text-4xl font-black tracking-tight text-emerald-400">
                      {(() => {
                        const totalCards = statsHistory.reduce((sum, g) => sum + (g.cards_sold || 0), 0);
                        const gamesCount = statsHistory.length || 1;
                        return (totalCards / gamesCount).toFixed(1);
                      })()}
                    </h3>
                    <p className="text-xs text-slate-300 font-medium pt-1">
                      Cartones aprobados por juego en promedio
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista Principal de Juegos */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-md font-bold text-slate-800">Cronología de Sesiones</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Detalle retrospectivo de jugadores, venta de cartones y premiaciones</p>
                </div>

                {historyLoading ? (
                  <div className="p-12 text-center text-slate-500 space-y-3">
                    <RefreshCcw size={28} className="animate-spin mx-auto text-blue-500" />
                    <p className="font-medium text-xs">Cargando métricas sofisticadas...</p>
                  </div>
                ) : statsHistory.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <p className="font-bold text-xs">No se encontraron juegos en el historial</p>
                    <p className="text-[11px] text-slate-400">Agenda o inicia una sesión de Bingo para poblar las estadísticas</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 font-sans">
                    {statsHistory.map((game) => (
                      <GameStatsCollapsible key={game.game_id} game={game} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'wallet' && (
          <div className="space-y-6">
            {/* SOLICITUDES DE RECARGA PENDIENTES */}
            <div className="bg-white rounded-3xl shadow-xl border-4 border-emerald-500 overflow-hidden font-sans">
              <div className="bg-emerald-600 p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={32} />
                  <div>
                    <h2 className="text-2xl font-black tracking-tight uppercase">Solicitudes de Recarga (Anti-Fraude IA)</h2>
                    <p className="text-emerald-100 text-xs font-bold">Verifica y acredita las recargas de saldo de los jugadores</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="bg-white/20 border border-white/30 text-white font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider">
                    {rechargeRequests.filter(r => r.status === 'pending').length} Pendientes
                  </span>
                </div>
              </div>

              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => setRechargeFilter('pending')}
                    className={clsx(
                      "px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
                      rechargeFilter === 'pending' 
                        ? "bg-amber-500 text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.5)] scale-105" 
                        : "bg-white text-slate-500 hover:bg-amber-50 hover:text-amber-600 border border-slate-200"
                    )}
                  >
                    <Clock size={14} className={rechargeFilter === 'pending' ? "animate-pulse" : ""} />
                    Pendientes ({rechargeRequests.filter(r => r.status === 'pending').length})
                  </button>
                  <button 
                    onClick={() => setRechargeFilter('approved')}
                    className={clsx(
                      "px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
                      rechargeFilter === 'approved' 
                        ? "bg-emerald-600 text-white shadow-[0_8px_20px_-6px_rgba(5,150,105,0.5)] scale-105" 
                        : "bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 border border-slate-200"
                    )}
                  >
                    <CheckCircle2 size={14} />
                    Aprobados ({rechargeRequests.filter(r => r.status === 'approved').length})
                  </button>
                  <button 
                    onClick={() => setRechargeFilter('rejected')}
                    className={clsx(
                      "px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
                      rechargeFilter === 'rejected' 
                        ? "bg-rose-600 text-white shadow-[0_8px_20px_-6px_rgba(225,29,72,0.5)] scale-105" 
                        : "bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600 border border-slate-200"
                    )}
                  >
                    <XCircle size={14} />
                    Rechazados ({rechargeRequests.filter(r => r.status === 'rejected').length})
                  </button>
                  <button 
                    onClick={() => setRechargeFilter('all')}
                    className={clsx(
                      "px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2",
                      rechargeFilter === 'all' 
                        ? "bg-slate-800 text-white shadow-[0_8px_20px_-6px_rgba(30,41,59,0.5)] scale-105" 
                        : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
                    )}
                  >
                    <Shield size={14} />
                    Todos ({rechargeRequests.length})
                  </button>
                </div>
              </div>

              <div className="p-6">
                {isRechargeLoading ? (
                  <div className="text-center py-12 text-slate-400">
                    <Loader2 className="animate-spin mx-auto mb-4 opacity-50" size={48} />
                    <p className="font-bold">Cargando solicitudes...</p>
                  </div>
                ) : rechargeRequests.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Shield size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="font-bold">No hay solicitudes de recarga registradas</p>
                  </div>
                ) : rechargeRequests.filter(r => rechargeFilter === 'all' || r.status === rechargeFilter).length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <CheckCircle2 size={48} className="mx-auto mb-4 opacity-20 text-emerald-500" />
                    <p className="font-bold">No hay solicitudes en esta categoría</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <th className="pb-3">Jugador</th>
                          <th className="pb-3">Monto</th>
                          <th className="pb-3">Comprobante</th>
                          <th className="pb-3">Auditoría Anti-Fraude (IA)</th>
                          <th className="pb-3">Nota</th>
                          <th className="pb-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rechargeRequests
                          .filter(r => rechargeFilter === 'all' || r.status === rechargeFilter)
                          .map((req) => (
                          <tr key={req.id} className="text-sm">
                            <td className="py-4">
                              <div>
                                <p className="font-black text-slate-800">{req.playerName}</p>
                                <p className="text-xs text-slate-500 font-bold">{req.phone}</p>
                                <p className="text-[10px] text-slate-400 font-bold">{(new Date(req.date)).toLocaleString()}</p>
                              </div>
                            </td>
                            <td className="py-4 font-black text-slate-800">
                              {formatCurrency(req.amount)}
                            </td>
                            <td className="py-4">
                              {req.receiptUrl ? (
                                <button
                                  onClick={() => setSelectedReceiptUrl(req.receiptUrl)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-100 transition shrink-0"
                                >
                                  <Image size={14} /> Ver Comprobante
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 font-bold">Sin comprobante</span>
                              )}
                            </td>
                            <td className="py-4 max-w-xs">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {req.status === 'approved' ? (
                                    <span className="bg-green-100 text-green-800 font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full">Aprobado</span>
                                  ) : req.status === 'rejected' ? (
                                    <span className="bg-red-100 text-red-800 font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full">Rechazado</span>
                                  ) : (
                                    <span className="bg-amber-100 text-amber-800 font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full">Pendiente</span>
                                  )}
                                  {req.reference && req.reference !== 'NONE' && (
                                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Ref: {req.reference}</span>
                                  )}
                                </div>
                                {req.validation_reason && (
                                  <p className="text-[11px] leading-relaxed text-slate-500 font-medium italic">
                                    "{req.validation_reason}"
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-4 max-w-[150px] text-xs text-slate-600 font-medium truncate" title={req.note}>
                              {req.note || '-'}
                            </td>
                            <td className="py-4 text-right">
                              {req.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleApproveRechargeRequest(req.id)}
                                    disabled={processingRechargeId === req.id}
                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black text-xs rounded-xl border border-emerald-400/50 shadow-md transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                  >
                                    {processingRechargeId === req.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Aprobar
                                  </button>
                                  <button
                                    onClick={() => handleRejectRechargeRequest(req.id)}
                                    disabled={processingRechargeId === req.id}
                                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 font-black text-xs rounded-xl border border-rose-100 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                  >
                                    {processingRechargeId === req.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                    Rechazar
                                  </button>
                                </div>
                              ) : req.status === 'approved' ? (
                                <div className="flex items-center justify-end gap-2 text-emerald-600 font-black text-xs bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                                  <CheckCircle2 size={16} /> APROBADA
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2 text-rose-600 font-black text-xs bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">
                                  <XCircle size={16} /> RECHAZADA
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Control de Billeteras */}
            <div className="bg-white rounded-3xl shadow-xl border-4 border-blue-500 overflow-hidden font-sans">
              <div className="bg-blue-600 p-6 text-white flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-3">
                  <Wallet size={32} />
                  <div>
                    <h2 className="text-2xl font-black tracking-tight uppercase">Control de Billeteras</h2>
                    <p className="text-blue-100 text-xs font-bold">Gestiona el saldo de los jugadores</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDirectRechargeModal(true)}
                  className="flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md transition transform active:scale-95 cursor-pointer"
                >
                  <Plus size={18} className="stroke-[3]" />
                  Recarga Manual por Teléfono
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {walletPlayers.map((player, idx) => (
                    <div key={`${player.phone}-${idx}`} className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-slate-800">{player.name}</p>
                          <p className="text-xs text-slate-500 font-bold">{player.phone}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Saldo Actual</p>
                          <p className="text-lg font-black text-green-600">{formatCurrency(player.balance)}</p>
                        </div>
                      </div>

                      {selectedWalletPlayer === player.phone ? (
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                              type="number"
                              className="w-full pl-9 pr-3 py-2 border-2 border-blue-500 rounded-xl outline-none text-sm font-bold"
                              placeholder="Monto"
                              value={rechargeAmount}
                              onChange={(e) => setRechargeAmount(e.target.value)}
                            />
                          </div>
                          <button
                            onClick={() => handleRecharge(player.phone)}
                            className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-green-700 transition"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => setSelectedWalletPlayer(null)}
                            className="bg-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-300 transition"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedWalletPlayer(player.phone);
                              setRechargeAmount('');
                            }}
                            className="flex-1 py-2 bg-blue-100 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-200 transition flex items-center justify-center gap-2"
                          >
                            <Plus size={16} /> Recargar
                          </button>
                          <button
                            onClick={() => openWalletHistory(player)}
                            className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition flex items-center justify-center gap-2"
                          >
                            <List size={16} /> Historial
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {walletPlayers.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <Users size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="font-bold">No hay jugadores registrados con billetera</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal de Recarga Manual Directa */}
            {showDirectRechargeModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border-4 border-blue-500 space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="text-blue-600" size={24} />
                      <h3 className="text-lg font-black text-slate-800 uppercase">Recarga Manual a Billetera</h3>
                    </div>
                    <button
                      onClick={() => setShowDirectRechargeModal(false)}
                      className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleDirectRecharge} className="space-y-4">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                        Número de Teléfono del Jugador
                      </label>
                      <div className="relative">
                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="tel"
                          required
                          placeholder="Ej: 3001234567"
                          value={directRechargePhone}
                          onChange={(e) => setDirectRechargePhone(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-blue-500 font-bold text-slate-800 text-sm outline-none transition"
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Si el jugador no está registrado previamente, se le acreditará el saldo para cuando ingrese.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                        Monto a Recargar ($)
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="number"
                          required
                          min="1000"
                          step="500"
                          placeholder="Ej: 20000"
                          value={directRechargeAmount}
                          onChange={(e) => setDirectRechargeAmount(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-blue-500 font-bold text-slate-800 text-sm outline-none transition"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowDirectRechargeModal(false)}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingDirectRecharge}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-500/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSubmittingDirectRecharge ? 'Procesando...' : 'Acreditar Saldo'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'dj_board' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <DJConsole />
          </div>
        )}

        {activeTab === 'ai_voice_studio' && (
          <div className="max-w-5xl mx-auto">
            <AIVoiceStudio />
          </div>
        )}

        {activeTab === 'virtual_mixer' && (
          <div className="max-w-7xl mx-auto h-auto min-h-[800px]">
            <VirtualMixer />
          </div>
        )}

        {activeTab === 'settings' && (
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 max-w-2xl mx-auto">
              <h2 className="text-xl font-black text-slate-800 mb-6 border-b pb-4 flex items-center gap-2">
                <Settings className="text-blue-500" /> Configuraciones
              </h2>
              
              <div className="space-y-6">

                {/* Módulo de Plantilla Visual de la Sala */}
                <div className="pt-2 pb-2 border-b border-slate-100">
                  <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
                    <Sparkles className="text-purple-600" /> Plantilla Visual de la Sala
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 font-medium">
                    Elige el diseño visual activo para esta sala. La plantilla <b>Clásica</b> es la predeterminada; puedes alternar a la plantilla <b>Neón Glow VIP</b> según la ocasión o evento.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Opción Clásica */}
                    <div 
                      onClick={() => handleSaveRoomTheme('classic')}
                      className={clsx(
                        "p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between",
                        roomThemeTemplate === 'classic'
                          ? "bg-blue-50/70 border-blue-500 shadow-md ring-2 ring-blue-500/20"
                          : "bg-slate-50 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-black text-slate-900 text-sm">Plantilla Clásica (Original)</span>
                          {roomThemeTemplate === 'classic' && (
                            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase">Activa</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                          Diseño sobrio original con tarjetas limpias, contador regresivo formal y estructura tradicional.
                        </p>
                      </div>
                      <div className="mt-4 pt-2 border-t border-slate-200/60 text-right">
                        <span className="text-xs font-black text-blue-600">Por Defecto</span>
                      </div>
                    </div>

                    {/* Opción Neón Glow VIP */}
                    <div 
                      onClick={() => handleSaveRoomTheme('neon_glow')}
                      className={clsx(
                        "p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between",
                        roomThemeTemplate === 'neon_glow'
                          ? "bg-purple-950/10 border-purple-500 shadow-md ring-2 ring-purple-500/20"
                          : "bg-slate-50 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-black text-purple-900 text-sm flex items-center gap-1.5">
                            <Sparkles size={14} className="text-purple-600" /> Neón Glow VIP ✨
                          </span>
                          {roomThemeTemplate === 'neon_glow' && (
                            <span className="px-2 py-0.5 bg-purple-600 text-white rounded-full text-[10px] font-black uppercase">Activa</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                          Diseño espacial oscuro con balotas 3D flotantes, coronas doradas, resplandor neón cyan/fucsia y botones luminosos.
                        </p>
                      </div>
                      <div className="mt-4 pt-2 border-t border-purple-100 text-right">
                        <span className="text-xs font-black text-purple-600">Estilo Evento / Especial</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Módulo de Configuración de Redes Sociales (Facebook & WhatsApp) */}
                <div className="pt-2">
                  <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
                    <Share2 className="text-blue-600" /> Promoción en Redes Sociales (Facebook & WhatsApp)
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 font-medium">
                    Personaliza el mensaje persuasivo y la imagen que se mostrarán en Facebook y WhatsApp cuando los jugadores compartan la invitación. Cada enlace regala automáticamente <b>1 cartón gratis</b> (1 uso por persona, invitaciones ilimitadas).
                  </p>

                  <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 p-5 rounded-2xl border-2 border-blue-200/80 space-y-4 shadow-sm">
                    {/* Mensaje de Invitación */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <MessageCircle size={15} className="text-[#25D366]" /> Mensaje Persuasivo de Invitación (WhatsApp / Redes)
                      </label>
                      <textarea
                        rows={4}
                        value={socialShareMessage}
                        onChange={(e) => setSocialShareMessage(e.target.value)}
                        placeholder="Ej: ¡Hola! 👋 ¡Tengo un regalo especial para ti! Te acabo de obsequiar 1 CARTÓN 100% GRATIS 🎁 para jugar en nuestro bingo y ganar dinero real a tu Nequi. Únete gratis con este enlace:"
                        className="w-full p-3.5 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-medium text-slate-800 text-sm bg-white"
                      />
                      <p className="text-[11px] text-slate-500 font-medium">
                        💡 Puedes dejarlo en blanco para usar la plantilla persuasiva automática del sistema con la fecha, premios y cartón de regalo.
                      </p>
                    </div>

                    {/* Imagen personalizada para Facebook OpenGraph */}
                    <div className="space-y-2 pt-2 border-t border-blue-100">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Image size={15} className="text-[#1877F2]" /> Imagen Promocional para Facebook / OpenGraph
                      </label>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="url"
                          value={socialShareImageUrl}
                          onChange={(e) => setSocialShareImageUrl(e.target.value)}
                          placeholder="https://ejemplo.com/imagen-promocional.jpg"
                          className="flex-1 p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-medium text-slate-800 text-sm bg-white"
                        />
                        <label className={clsx(
                          "px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition border shadow-sm",
                          isUploadingSocialImage
                            ? "bg-slate-200 text-slate-500 cursor-not-allowed border-slate-300"
                            : "bg-blue-600 hover:bg-blue-700 text-white border-blue-700 active:scale-95"
                        )}>
                          {isUploadingSocialImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                          <span>{isUploadingSocialImage ? 'Subiendo...' : 'Subir Imagen'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={isUploadingSocialImage}
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setIsUploadingSocialImage(true);
                              try {
                                const formData = new FormData();
                                formData.append('social_image', file);
                                const res = await apiFetch('/api/admin/upload-social-image', {
                                  method: 'POST',
                                  body: formData
                                });
                                if (!res.ok) throw new Error('Error al subir la imagen');
                                const data = await res.json();
                                if (data.url) {
                                  setSocialShareImageUrl(data.url);
                                  toast.success('¡Imagen subida y lista para compartir!');
                                }
                              } catch (err: any) {
                                toast.error(err.message || 'Error al subir la imagen');
                              } finally {
                                setIsUploadingSocialImage(false);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      {socialShareImageUrl && (
                        <div className="relative mt-2 p-2 bg-white rounded-xl border border-blue-200 inline-block shadow-sm">
                          <img
                            src={socialShareImageUrl}
                            alt="Vista previa para Facebook"
                            className="h-28 w-auto max-w-full rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setSocialShareImageUrl('')}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 shadow"
                            title="Quitar imagen"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 font-medium">
                        🖼️ Esta imagen aparecerá automáticamente en el feed de Facebook cuando los jugadores compartan la invitación. (Recomendado: 1200x630 px).
                      </p>
                    </div>

                    {/* Botón Guardar */}
                    <button
                      type="button"
                      disabled={isSavingSocialShare}
                      onClick={async () => {
                        setIsSavingSocialShare(true);
                        try {
                          const res = await apiFetch('/api/admin/settings/social-share', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              message: socialShareMessage,
                              image_url: socialShareImageUrl
                            })
                          });
                          if (!res.ok) throw new Error('Error al guardar');
                          toast.success('¡Configuración de redes sociales guardada correctamente!');
                        } catch (err) {
                          toast.error('Error al guardar configuración de redes');
                        } finally {
                          setIsSavingSocialShare(false);
                        }
                      }}
                      className={clsx(
                        "w-full py-3 px-6 text-white font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md",
                        isSavingSocialShare ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                      )}
                    >
                      {isSavingSocialShare ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Guardar Configuración de Redes Sociales
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Wrench className="text-amber-500" /> Modo Mantenimiento y Actualizaciones
                  </h3>
                  <div className={clsx("p-5 rounded-2xl border-2 space-y-4 transition", maintenanceMode ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-slate-800 text-sm">Estado de Mantenimiento de esta Sala</p>
                        <p className="text-xs text-slate-500">
                          {maintenanceMode ? "⚠️ Esta sala está en mantenimiento. Solo tú (admin) y el jugador de pruebas pueden ingresar." : "✅ Esta sala está funcionando con normalidad para todos los jugadores."}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={maintenanceMode}
                          onChange={(e) => setMaintenanceMode(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500 shadow-inner"></div>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Mensaje Personalizado de Mantenimiento:</label>
                      <textarea 
                        rows={3}
                        value={maintenanceMessage}
                        onChange={(e) => setMaintenanceMessage(e.target.value)}
                        placeholder="Ej: Estamos actualizando la plataforma con nuevas funciones. Vuelve pronto."
                        className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 outline-none font-medium text-slate-800 text-sm bg-white"
                      />
                    </div>

                    <button
                      disabled={isSavingMaintenance}
                      onClick={async () => {
                        setIsSavingMaintenance(true);
                        try {
                          const effectiveSlug = (slug || user?.tenant_id || 'bingo-lite').toLowerCase();
                          const res = await apiFetch('/api/admin/maintenance', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              maintenance_mode: maintenanceMode,
                              maintenance_message: maintenanceMessage,
                              tenant_id: effectiveSlug
                            })
                          });
                          if (res.ok) {
                            toast.success(maintenanceMode ? '¡Modo mantenimiento activado!' : '¡Modo mantenimiento desactivado!');
                          } else {
                            throw new Error('Error al guardar');
                          }
                        } catch (err) {
                          toast.error('Error al guardar el estado de mantenimiento');
                        } finally {
                          setIsSavingMaintenance(false);
                        }
                      }}
                      className={clsx("w-full py-3 px-6 text-white font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md", isSavingMaintenance ? "bg-slate-400 cursor-not-allowed" : maintenanceMode ? "bg-amber-600 hover:bg-amber-700" : "bg-slate-800 hover:bg-slate-900")}
                    >
                      {isSavingMaintenance ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Guardar Configuración de Mantenimiento
                    </button>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      💡 <b>Nota importante:</b> Cuando está activo, no se enviarán notificaciones ni alertas de juegos creados a los jugadores, y solo el administrador y el jugador con celular <code>3145261451</code> podrán ingresar para realizar pruebas.
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <DollarSign className="text-emerald-500" /> Comisión de Referidos para Jugadores (%)
                  </h3>
                  <div className="bg-emerald-50 p-5 rounded-2xl border-2 border-emerald-100 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {[5, 10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setPlayerCommission(pct)}
                          className={clsx(
                            "px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition cursor-pointer border",
                            playerCommission === pct
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                              : "bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-100/60"
                          )}
                        >
                          {pct}% {pct === 10 ? '(Recomendado)' : pct === 5 ? '(Mínimo)' : ''}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input 
                          type="number" 
                          min="1" 
                          max="100"
                          value={playerCommission}
                          onChange={(e) => setPlayerCommission(Number(e.target.value))}
                          className="w-full p-4 border-2 border-emerald-200 rounded-xl focus:border-emerald-500 outline-none font-black text-slate-800 text-lg bg-white"
                          placeholder="Ej: 10"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-emerald-600 text-lg">%</span>
                      </div>
                      <button 
                        disabled={isSavingPlayerCommission}
                        onClick={async () => {
                          setIsSavingPlayerCommission(true);
                          try {
                            const res = await apiFetch('/api/admin/settings/player-commission', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ percentage: playerCommission })
                            });
                            if (res.ok) {
                              toast.success('Comisión de jugadores guardada exitosamente');
                            } else {
                              throw new Error('Error al guardar');
                            }
                          } catch (err) {
                            toast.error('Error al guardar comisión');
                          } finally {
                            setIsSavingPlayerCommission(false);
                          }
                        }}
                        className={clsx("px-6 text-white font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md", isSavingPlayerCommission ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700")}
                      >
                        {isSavingPlayerCommission ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Guardar Comisión
                      </button>
                    </div>
                    <p className="text-xs text-emerald-800 font-medium">
                      💡 <b>Comisión automática:</b> Cada vez que un referido compre cartones en un juego pago, se acreditará este porcentaje ({playerCommission}%) automáticamente a la billetera del jugador referente.
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Clock className="text-blue-500" /> Intervalo de Autoplay
                  </h3>
                  <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 italic space-y-4">
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        min="1" 
                        max="60"
                        value={autoplayInterval}
                        onChange={(e) => setAutoplayInterval(Number(e.target.value))}
                        className="flex-1 p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-lg"
                      />
                      <button 
                        disabled={isSavingAutoplay}
                        onClick={async () => {
                          setIsSavingAutoplay(true);
                          try {
                            await saveAutoplayInterval(autoplayInterval);
                            toast.success('Intervalo guardado correctamente');
                          } finally {
                            setIsSavingAutoplay(false);
                          }
                        }}
                        className={clsx("px-6 text-white font-black rounded-xl transition flex items-center justify-center gap-2", isSavingAutoplay ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700")}
                      >
                        {isSavingAutoplay ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Guardar
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Tiempo que transcurre entre cada balota cuando el Autoplay está activado (8 segundos recomendado para locución completa sin interrupciones).
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <BellRing className="text-blue-500" /> Notificaciones Push
                  </h3>
                </div>



                <div className="pt-6 border-t border-slate-200">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Nota Final del Juego</label>
                  <textarea 
                    value={finalNote}
                    onChange={(e) => setFinalNote(e.target.value)}
                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-lg"
                    rows={3}
                  />
                  <button 
                    disabled={isSavingNote}
                    onClick={async () => {
                      setIsSavingNote(true);
                        const promise = apiFetch('/api/game/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ final_note: finalNote }) })
                        .then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando nota...',
                          success: 'Nota final guardada exitosamente',
                          error: 'Error al guardar la nota'
                        });

                        try {
                          await promise;
                        } catch (err) {
                          // Handled by toast.promise
                        } finally {
                          setIsSavingNote(false);
                        }
                    }}
                    className={clsx("mt-2 px-6 py-3 text-white font-black rounded-xl transition flex items-center justify-center gap-2", isSavingNote ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95")}
                  >
                    {isSavingNote ? <Loader2 size={18} className="animate-spin" /> : null}
                    {isSavingNote ? 'Guardando...' : 'Guardar Nota'}
                  </button>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Radio className="text-purple-500" size={16} /> Canal de Twitch
                  </label>
                  <div className="space-y-4">
                    <input 
                      type="text" 
                      placeholder="Ej: ibai, auronplay"
                      value={twitchChannel}
                      onChange={(e) => setTwitchChannel(e.target.value)}
                      className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-purple-500 outline-none font-bold text-slate-700 text-lg"
                    />
                    <button 
                      disabled={isSavingTwitch}
                      onClick={async () => {
                        setIsSavingTwitch(true);
                        const promise = apiFetch('/api/game/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stream_id: twitchChannel }) })
                        .then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando canal...',
                          success: 'Canal de Twitch actualizado',
                          error: 'Error al actualizar canal'
                        });

                        try {
                          await promise;
                        } catch (err) {
                          // Handled by toast.promise
                        } finally {
                          setIsSavingTwitch(false);
                        }
                      }}
                      className={clsx("w-full px-6 py-4 text-white font-black rounded-xl transition flex items-center justify-center gap-2", isSavingTwitch ? "bg-slate-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700 active:scale-95")}
                    >
                      {isSavingTwitch ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
                      {isSavingTwitch ? 'Guardando...' : 'Guardar Canal'}
                    </button>
                    
                    {twitchChannel && (
                      <div className="mt-4 aspect-video rounded-xl overflow-hidden bg-slate-900 border-2 border-slate-200">
                        <LiveStream streamId={twitchChannel} isAdmin={true} />
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-2">
                    Ingresa el nombre de usuario de tu canal de Twitch para integrarlo en la aplicación.
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Bot className="text-blue-500" /> Configuración de Agente IA
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-100">
                      <div>
                        <h4 className="font-bold text-slate-800">IA del Chat</h4>
                        <p className="text-xs text-slate-500">Activa el asistente virtual en el chat para jugadores.</p>
                      </div>
                      <button
                        disabled={isUpdatingAiChat}
                        onClick={async () => {
                          const newValue = !aiChatEnabled;
                          setIsUpdatingAiChat(true);
                          isUpdatingAiChatRef.current = true;
                          setAiChatEnabled(newValue);
                          lastAiChatUpdateRef.current = Date.now();
                          try {
                            const res = await apiFetch('/api/game/status', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ 
                                gameId: gameState?.id,
                                ai_chat_enabled: newValue 
                              })
                            });
                            if (res.ok) {
                              toast.success(`IA del Chat ${newValue ? 'activada' : 'desactivada'}`);
                            } else {
                              setAiChatEnabled(!newValue);
                              toast.error('Error al actualizar la IA');
                            }
                          } catch (err) {
                            setAiChatEnabled(!newValue);
                            toast.error('Error de conexión');
                          } finally {
                            setIsUpdatingAiChat(false);
                            isUpdatingAiChatRef.current = false;
                            lastAiChatUpdateRef.current = Date.now();
                          }
                        }}
                        className={clsx(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                          aiChatEnabled ? "bg-blue-600" : "bg-slate-300",
                          isUpdatingAiChat && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <span
                          className={clsx(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            aiChatEnabled ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-100">
                      <div>
                        <h4 className="font-bold text-slate-800">Anti-Fraude IA</h4>
                        <p className="text-xs text-slate-500">Auditoría automática de comprobantes de pago mediante Visión Artificial.</p>
                      </div>
                      <button
                        onClick={() => setAiFraudDetectionEnabled(!aiFraudDetectionEnabled)}
                        className={clsx(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                          aiFraudDetectionEnabled ? "bg-emerald-600" : "bg-slate-300"
                        )}
                      >
                        <span
                          className={clsx(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            aiFraudDetectionEnabled ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Modelo de Gemini</label>
                      <select 
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-lg bg-white"
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Básico)</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Avanzado)</option>
                        <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Económico)</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">Selecciona el modelo según tu plan de API.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Base de Conocimientos</label>
                      <textarea 
                        value={aiKnowledgeBase}
                        onChange={(e) => setAiKnowledgeBase(e.target.value)}
                        placeholder="Escribe aquí la información que el agente debe conocer sobre el bingo, premios, reglas, etc."
                        className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-lg"
                        rows={6}
                      />
                      <p className="text-xs text-slate-500 mt-1">Esta información alimentará las respuestas del agente de IA.</p>
                    </div>

                    <button 
                      disabled={isSavingAIConfig}
                      onClick={async () => {
                        setIsSavingAIConfig(true);
                        const promise = apiFetch('/api/game/status', { 
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' }, 
                          body: JSON.stringify({ 
                            ai_knowledge_base: aiKnowledgeBase, 
                            ai_model: aiModel,
                            ai_chat_enabled: aiChatEnabled,
                            ai_fraud_detection_enabled: aiFraudDetectionEnabled
                          }) 
                        }).then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando configuración de IA...',
                          success: 'Configuración de IA guardada',
                          error: 'Error al guardar la configuración'
                        });

                        try {
                          await promise;
                        } catch (err) {
                          // Already handled by toast.promise
                        } finally {
                          setIsSavingAIConfig(false);
                        }
                      }}
                      className={clsx("w-full px-6 py-4 text-white font-black rounded-xl transition flex items-center justify-center gap-2", isSavingAIConfig ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95")}
                    >
                      {isSavingAIConfig ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
                      {isSavingAIConfig ? 'Guardando...' : 'Guardar Configuración IA'}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <MessageCircle className="text-[#25D366]" /> Mensaje de Compartir (WhatsApp)
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Plantilla del Mensaje</label>
                      <textarea 
                        value={whatsappTemplate}
                        onChange={(e) => setWhatsappTemplate(e.target.value)}
                        placeholder="Escribe el mensaje que se enviará por WhatsApp. Usa {url} para insertar el enlace de registro."
                        className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-lg"
                        rows={4}
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        <strong>Nota:</strong> El texto <code>{'{url}'}</code> será reemplazado automáticamente por el enlace de registro de tu organización.
                      </p>
                    </div>

                    <button 
                      disabled={isSavingWhatsapp}
                      onClick={async () => {
                        setIsSavingWhatsapp(true);
                        const promise = apiFetch('/api/game/status', { 
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' }, 
                          body: JSON.stringify({ whatsapp_template: whatsappTemplate }) 
                        }).then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando mensaje...',
                          success: 'Plantilla de WhatsApp guardada',
                          error: 'Error al guardar plantilla'
                        });

                        try {
                          await promise;
                        } catch (err) {
                           // Handled by toast.promise
                        } finally {
                           setIsSavingWhatsapp(false);
                        }
                      }}
                      className={clsx("w-full px-6 py-4 text-white font-black rounded-xl transition flex items-center justify-center gap-2 shadow-md", isSavingWhatsapp ? "bg-slate-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 active:scale-95")}
                    >
                      {isSavingWhatsapp ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
                      {isSavingWhatsapp ? 'Guardando...' : 'Guardar Mensaje'}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Image className="text-blue-500" /> Configuración de Cabecera
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                      <label className="block text-sm font-bold text-slate-700 mb-4 italic">Imagen del Banner Superior</label>
                      
                      <div className="flex flex-col items-center gap-6">
                        {headerImageUrl && (
                          <div className="relative w-full aspect-[4/1] rounded-2xl overflow-hidden shadow-lg border-2 border-slate-200 bg-slate-200">
                            <img 
                              src={headerImageUrl} 
                              alt="Header Preview" 
                              className="w-full h-full object-cover"
                              style={{ opacity: headerOpacity }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <span className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full text-xs font-black text-slate-800 shadow-sm border border-white/20 uppercase tracking-widest">Vista Previa</span>
                            </div>
                          </div>
                        )}

                        <div className="w-full">
                          <label className={clsx(
                            "group flex flex-col items-center justify-center w-full h-32 border-4 border-dashed rounded-3xl cursor-pointer transition-all duration-300",
                            isUploadingHeader ? "bg-slate-100 border-slate-300 cursor-not-allowed" : "bg-white border-slate-300 hover:border-blue-400 hover:bg-blue-50"
                          )}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              {isUploadingHeader ? (
                                <Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
                              ) : (
                                <Upload size={32} className="text-slate-400 group-hover:text-blue-500 mb-3 transition-colors" />
                              )}
                              <p className="mb-2 text-sm text-slate-600 font-bold">
                                {isUploadingHeader ? "Subiendo imagen..." : <><span className="text-blue-600">Haz clic para subir</span> o arrastra y suelta</>}
                              </p>
                              <p className="text-xs text-slate-400 uppercase tracking-tighter">Imagen (PNG, JPG, WEBP hasta 5MB)</p>
                            </div>
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*"
                              disabled={isUploadingHeader}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                if (file.size > 5 * 1024 * 1024) {
                                  toast.error("La imagen es demasiado grande (máximo 5MB)");
                                  return;
                                }

                                setIsUploadingHeader(true);
                                const formData = new FormData();
                                formData.append('header_image', file);

                               try {
                                  const res = await apiFetch('/api/admin/upload-header', {
                                    method: 'POST',
                                    body: formData
                                  });

                                  if (!res.ok) {
                                    const errData = await res.json();
                                    throw new Error(errData.error || 'Error al subir imagen');
                                  }

                                  const data = await res.json();
                                  setHeaderImageUrl(data.url);
                                  toast.success("Imagen subida correctamente");
                                } catch (err: any) {
                                  console.error("Upload error:", err);
                                  toast.error(err.message || "Error al subir la imagen");
                                } finally {
                                  setIsUploadingHeader(false);
                                }
                              }}
                            />
                          </label>
                        </div>

                        <div className="w-full bg-slate-100 p-4 rounded-xl border border-slate-200">
                          <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">URL Manual (Opcional)</label>
                          <input 
                            type="text" 
                            value={headerImageUrl || ''}
                            onChange={(e) => setHeaderImageUrl(e.target.value)}
                            placeholder="URL de la imagen..."
                            className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-sm"
                          />
                        </div>

                        <div className="w-full space-y-4">
                          <div className="bg-white p-4 rounded-xl border border-slate-200">
                             <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">Título de Cabecera</label>
                             <input 
                               type="text" 
                               value={headerTitle}
                               onChange={(e) => setHeaderTitle(e.target.value)}
                               placeholder="Ej: BINGO ONLINE"
                               className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700"
                             />
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-200">
                             <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">Subtítulo de Cabecera</label>
                             <textarea 
                               value={headerSubtitle}
                               onChange={(e) => setHeaderSubtitle(e.target.value)}
                               placeholder="Frase motivadora o descripción..."
                               rows={2}
                               className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-sm resize-none"
                             />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                      <div className="flex justify-between items-center mb-4">
                        <label className="block text-sm font-bold text-slate-700 uppercase tracking-widest italic">Opacidad de la Imagen</label>
                        <span className="text-lg font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">{Math.round(headerOpacity * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={headerOpacity}
                        onChange={(e) => setHeaderOpacity(parseFloat(e.target.value))}
                        className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between mt-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                        <span>Invisible</span>
                        <span>Sutil</span>
                        <span>Visible</span>
                        <span>Sólido</span>
                      </div>
                    </div>

                    <button 
                      disabled={isSavingHeader || isUploadingHeader}
                      onClick={async () => {
                        setIsSavingHeader(true);
                        const promise = apiFetch('/api/game/status', { 
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' }, 
                          body: JSON.stringify({ 
                            header_image_url: headerImageUrl,
                            header_title: headerTitle,
                            header_subtitle: headerSubtitle,
                            header_opacity: headerOpacity
                          }) 
                        }).then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando configuración de cabecera...',
                          success: 'Configuración de cabecera guardada exitosamente',
                          error: 'Error al actualizar la cabecera'
                        });

                        try {
                          await promise;
                          await fetchData();
                        } catch (err) {
                           // Handled by toast.promise
                        } finally {
                           setIsSavingHeader(false);
                        }
                      }}
                      className={clsx(
                        "w-full px-8 py-5 text-white font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 shadow-xl transform active:scale-95", 
                        (isSavingHeader || isUploadingHeader) ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 hover:shadow-blue-200 border-b-4 border-blue-800"
                      )}
                    >
                      {isSavingHeader ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />} 
                      {isSavingHeader ? 'Guardando...' : 'Aplicar Cambios en la Cabecera'}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Grid className="text-emerald-500" /> Fondo Tarjeta Login Jugadores
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                      <label className="block text-sm font-bold text-slate-700 mb-4 italic">Imagen de Fondo (Login)</label>
                      
                      <div className="flex flex-col items-center gap-6">
                        {loginBgImageUrl && (
                          <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-lg border-2 border-slate-200 bg-slate-900">
                            <img 
                              src={loginBgImageUrl} 
                              alt="Login Bg Preview" 
                              className="w-full h-full object-cover"
                              style={{ opacity: loginBgOpacity }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <span className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full text-xs font-black text-slate-800 shadow-sm border border-white/20 uppercase tracking-widest">Vista Previa Login</span>
                            </div>
                          </div>
                        )}

                        <div className="w-full">
                          <label className={clsx(
                            "group flex flex-col items-center justify-center w-full h-32 border-4 border-dashed rounded-3xl cursor-pointer transition-all duration-300",
                            isUploadingLoginBg ? "bg-slate-100 border-slate-300 cursor-not-allowed" : "bg-white border-slate-300 hover:border-emerald-400 hover:bg-emerald-50"
                          )}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              {isUploadingLoginBg ? (
                                <Loader2 size={32} className="text-emerald-500 animate-spin mb-3" />
                              ) : (
                                <Upload size={32} className="text-slate-400 group-hover:text-emerald-500 mb-3 transition-colors" />
                              )}
                              <p className="mb-2 text-sm text-slate-600 font-bold">
                                {isUploadingLoginBg ? "Subiendo imagen..." : <><span className="text-emerald-600">Haz clic para subir</span> o arrastra y suelta</>}
                              </p>
                              <p className="text-xs text-slate-400 uppercase tracking-tighter">Imagen de fondo login (PNG, JPG, hasta 5MB)</p>
                            </div>
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*"
                              disabled={isUploadingLoginBg}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                if (file.size > 5 * 1024 * 1024) {
                                  toast.error("La imagen es demasiado grande (máximo 5MB)");
                                  return;
                                }

                                setIsUploadingLoginBg(true);
                                const formData = new FormData();
                                formData.append('login_bg_image', file);

                               try {
                                  const res = await apiFetch('/api/admin/upload-login-bg', {
                                    method: 'POST',
                                    body: formData
                                  });

                                  if (!res.ok) {
                                    const errData = await res.json();
                                    throw new Error(errData.error || 'Error al subir imagen');
                                  }

                                  const data = await res.json();
                                  setLoginBgImageUrl(data.url);
                                  toast.success("Fondo de login subido correctamente");
                                } catch (err: any) {
                                  console.error("Upload error:", err);
                                  toast.error(err.message || "Error al subir la imagen");
                                } finally {
                                  setIsUploadingLoginBg(false);
                                }
                              }}
                            />
                          </label>
                        </div>

                        <div className="w-full bg-slate-100 p-4 rounded-xl border border-slate-200">
                          <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">URL Manual Fondo (Opcional)</label>
                          <input 
                            type="text" 
                            value={loginBgImageUrl || ''}
                            onChange={(e) => setLoginBgImageUrl(e.target.value)}
                            placeholder="URL de la imagen de fondo..."
                            className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none font-bold text-slate-700 text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                      <div className="flex justify-between items-center mb-4">
                        <label className="block text-sm font-bold text-slate-700 uppercase tracking-widest italic">Opacidad del Fondo (Login)</label>
                        <span className="text-lg font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">{Math.round(loginBgOpacity * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={loginBgOpacity}
                        onChange={(e) => setLoginBgOpacity(parseFloat(e.target.value))}
                        className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                      <div className="flex justify-between mt-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                        <span>Transparente</span>
                        <span>Medio</span>
                        <span>Más Visible</span>
                        <span>Total</span>
                      </div>
                    </div>

                    <button 
                      disabled={isSavingLoginBg || isUploadingLoginBg}
                      onClick={async () => {
                        setIsSavingLoginBg(true);
                        const promise = apiFetch('/api/game/status', { 
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' }, 
                          body: JSON.stringify({ 
                            login_bg_image_url: loginBgImageUrl,
                            login_bg_opacity: loginBgOpacity
                          }) 
                        }).then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando fondo de login...',
                          success: 'Fondo de login actualizado correctamente',
                          error: 'Error al actualizar el fondo'
                        });

                        try {
                          await promise;
                          await fetchData();
                        } catch (err) {
                           // Handled by toast.promise
                        } finally {
                           setIsSavingLoginBg(false);
                        }
                      }}
                      className={clsx(
                        "w-full px-8 py-5 text-white font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 shadow-xl transform active:scale-95", 
                        (isSavingLoginBg || isUploadingLoginBg) ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-200 border-b-4 border-emerald-800"
                      )}
                    >
                      {isSavingLoginBg ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />} 
                      {isSavingLoginBg ? 'Guardando...' : 'Guardar Fondo de Login'}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <MessageCircle className="text-green-500" /> Grupo de WhatsApp
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Enlace del Grupo de WhatsApp</label>
                      <input 
                        type="text" 
                        value={whatsappGroupLink}
                        onChange={(e) => setWhatsappGroupLink(e.target.value)}
                        placeholder="Ej: https://chat.whatsapp.com/..."
                        className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Este enlace se usará en el botón flotante "Únete al grupo" en la página principal.
                      </p>
                    </div>

                    <button 
                      disabled={isSavingWhatsapp}
                      onClick={async () => {
                        setIsSavingWhatsapp(true);
                        const promise = apiFetch('/api/game/status', { 
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' }, 
                          body: JSON.stringify({ whatsapp_group_link: whatsappGroupLink }) 
                        }).then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando enlace del grupo...',
                          success: 'Enlace del grupo actualizado correctamente',
                          error: 'Error al actualizar el enlace'
                        });

                        try {
                          await promise;
                          await fetchData();
                        } catch (err) {
                           // Handled by toast.promise
                        } finally {
                           setIsSavingWhatsapp(false);
                        }
                      }}
                      className={clsx("w-full px-6 py-4 text-white font-black rounded-xl transition flex items-center justify-center gap-2 shadow-md", isSavingWhatsapp ? "bg-slate-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 active:scale-95")}
                    >
                      {isSavingWhatsapp ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
                      {isSavingWhatsapp ? 'Guardando...' : 'Guardar Enlace del Grupo'}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                    <DollarSign className="text-blue-500" /> Configuración de Pagos (Nequi)
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Número de Nequi para Recaudos</label>
                      <input 
                        type="text" 
                        value={nequiNumber}
                        onChange={(e) => setNequiNumber(e.target.value)}
                        placeholder="Ej: 3235304996"
                        className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold text-slate-700 text-lg"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Este número se mostrará a los jugadores en el formulario de compra de cartones como destino para el pago.
                      </p>
                    </div>

                    <button 
                      disabled={isSavingNequi}
                      onClick={async () => {
                        setIsSavingNequi(true);
                        const promise = apiFetch('/api/game/status', { 
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' }, 
                          body: JSON.stringify({ nequi_number: nequiNumber }) 
                        }).then(res => {
                          if (!res.ok) throw new Error('Error al guardar');
                          return res.json();
                        });

                        toast.promise(promise, {
                          loading: 'Guardando número Nequi...',
                          success: 'Número Nequi actualizado correctamente',
                          error: 'Error al actualizar el número'
                        });

                        try {
                          await promise;
                          await fetchData();
                        } catch (err) {
                           // Handled by toast.promise
                        } finally {
                           setIsSavingNequi(false);
                        }
                      }}
                      className={clsx("w-full px-6 py-4 text-white font-black rounded-xl transition flex items-center justify-center gap-2 shadow-md", isSavingNequi ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95")}
                    >
                      {isSavingNequi ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
                      {isSavingNequi ? 'Guardando...' : 'Guardar Número Nequi'}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                  <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-6">
                    <h3 className="text-lg font-black text-red-700 flex items-center gap-2 mb-2">
                      <HardDrive size={20} /> Mantenimiento de Almacenamiento
                    </h3>
                    <p className="text-sm text-red-600 mb-4 font-medium">
                      Esta acción eliminará todos los comprobantes antiguos del historial de los jugadores y del servidor de archivos, dejando únicamente el comprobante más reciente de cada jugador. Úsalo para liberar espacio y mantener el sistema ágil.
                    </p>
                    
                    {!showCleanupConfirm ? (
                      <button 
                        onClick={() => setShowCleanupConfirm(true)}
                        className="px-6 py-3 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 transition flex items-center gap-2 shadow-md active:scale-95"
                      >
                        <Trash2 size={20} /> Ejecutar Limpieza Masiva
                      </button>
                    ) : (
                      <div className="flex flex-col gap-3 p-4 bg-white rounded-xl border-2 border-red-200">
                        <p className="text-sm font-bold text-red-700">¿Estás completamente seguro? Esta acción eliminará permanentemente los archivos antiguos.</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={handleCleanup}
                            disabled={isCleaning}
                            className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                          >
                            {isCleaning ? 'Limpiando...' : 'Sí, eliminar archivos antiguos'}
                          </button>
                          <button 
                            onClick={() => setShowCleanupConfirm(false)}
                            disabled={isCleaning}
                            className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Purga Total de Base de Datos */}
                  <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-6 mt-4">
                    <h3 className="text-lg font-black text-rose-800 flex items-center gap-2 mb-2">
                      <Trash2 size={20} className="text-rose-600" /> Purga Total de Base de Datos (Reset a Cero)
                    </h3>
                    <p className="text-sm text-rose-700 mb-4 font-medium">
                      Esta acción eliminará todos los jugadores, cartones generados, alertas, notificaciones, historial de billeteras e invitaciones, <strong>dejando la base de datos completamente en cero</strong> y conservando únicamente la cuenta del administrador <strong>stcganas@gmail.com</strong>.
                    </p>
                    
                    {!showResetDbConfirm ? (
                      <button 
                        onClick={() => setShowResetDbConfirm(true)}
                        className="px-6 py-3 bg-gradient-to-r from-rose-700 to-red-800 text-white font-black rounded-xl hover:from-rose-800 hover:to-red-900 transition flex items-center gap-2 shadow-md active:scale-95"
                      >
                        <Trash2 size={20} /> Purgar Todo y Dejar en Cero
                      </button>
                    ) : (
                      <div className="flex flex-col gap-3 p-4 bg-white rounded-xl border-2 border-rose-300">
                        <p className="text-sm font-black text-rose-800">
                          ⚠️ ATENCIÓN: Esta acción es irreversible. Se borrarán todos los datos de juego y jugadores, conservando únicamente el administrador stcganas@gmail.com. ¿Deseas proceder?
                        </p>
                        <div className="flex gap-2">
                          <button 
                            onClick={handleResetDatabaseClean}
                            disabled={isResettingDb}
                            className="flex-1 px-4 py-2 bg-rose-700 text-white font-black rounded-lg hover:bg-rose-800 transition disabled:opacity-50"
                          >
                            {isResettingDb ? 'Purgando Base de Datos...' : 'Sí, purgar todo y resetear a cero'}
                          </button>
                          <button 
                            onClick={() => setShowResetDbConfirm(false)}
                            disabled={isResettingDb}
                            className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cambiar Contraseña del Administrador */}
                  <div className="pt-6 border-t border-slate-200">
                    <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                      <Key className="text-amber-500" size={20} /> Cambiar Contraseña de Administrador
                    </h3>
                    <div className="bg-amber-50 p-5 rounded-2xl border-2 border-amber-100 space-y-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-black text-amber-800 uppercase mb-1">Nueva Contraseña</label>
                          <input 
                            type="password" 
                            placeholder="Mínimo 6 caracteres"
                            value={adminNewPassword}
                            onChange={(e) => setAdminNewPassword(e.target.value)}
                            className="w-full p-4 border-2 border-amber-200 rounded-xl focus:border-amber-500 outline-none font-bold text-slate-700 text-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-amber-800 uppercase mb-1">Confirmar Nueva Contraseña</label>
                          <input 
                            type="password" 
                            placeholder="Repite la contraseña"
                            value={adminConfirmPassword}
                            onChange={(e) => setAdminConfirmPassword(e.target.value)}
                            className="w-full p-4 border-2 border-amber-200 rounded-xl focus:border-amber-500 outline-none font-bold text-slate-700 text-lg bg-white"
                          />
                        </div>
                      </div>
                      <button 
                        disabled={isSavingAdminPassword}
                        onClick={async () => {
                          if (!adminNewPassword || adminNewPassword.length < 6) {
                            toast.error('La contraseña debe tener al menos 6 caracteres');
                            return;
                          }
                          if (adminNewPassword !== adminConfirmPassword) {
                            toast.error('Las contraseñas no coinciden');
                            return;
                          }
                          setIsSavingAdminPassword(true);
                          try {
                            const { success, error } = await updatePassword(adminNewPassword);
                            if (success) {
                              toast.success('Contraseña de administrador actualizada con éxito');
                              setAdminNewPassword('');
                              setAdminConfirmPassword('');
                            } else {
                              toast.error(error || 'Error al cambiar contraseña');
                            }
                          } catch (err: any) {
                            toast.error(err.message || 'Error al cambiar contraseña');
                          } finally {
                            setIsSavingAdminPassword(false);
                          }
                        }}
                        className={clsx("w-full px-6 py-4 text-white font-black rounded-xl transition flex items-center justify-center gap-2", isSavingAdminPassword ? "bg-slate-400 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-700 active:scale-95")}
                      >
                        {isSavingAdminPassword ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Actualizar Contraseña Admin
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      
      {winner && (
        <BingoWinnerPopup 
          winners={winner.winners} 
          winner={!winner.winners ? winner : undefined}
          prize={winner.prize}
          pattern_name={winner.pattern_name}
          pattern_grid={winner.pattern_grid}
          patterns={gameState?.patterns || []}
          onClose={handleCloseWinner} 
        />
      )}

      {gameFinished && (
        <GameSummaryPopup 
          winners={gameFinished.winners || []}
          finalNote={gameFinished.final_note || ""}
          onClose={() => setGameFinished(null)}
        />
      )}

      {/* Rejection Reason Modal */}
      <AnimatePresence>
        {selectedWinnerForRejection && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-2 border-slate-100"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-red-100 rounded-2xl">
                  <Ban className="text-red-500" size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800">Rechazar Premio</h3>
                  <p className="text-slate-500 font-medium">Especifica el motivo del rechazo.</p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">Motivo del Rechazo</label>
                <textarea 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-red-500 outline-none text-slate-700 font-medium bg-slate-50"
                  rows={4}
                  placeholder="Ej: Su pago no pudo ser comprobado..."
                />
                <p className="text-xs text-slate-400 mt-2">Este motivo se enviará al jugador en una notificación.</p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => updateWinnerStatus(selectedWinnerForRejection.id, 'rejected', rejectionReason)}
                  disabled={isUpdatingWinnerStatus === selectedWinnerForRejection.id}
                  className="flex-1 px-6 py-4 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 hover:scale-105 active:scale-95 transition flex items-center justify-center gap-2 shadow-lg shadow-red-200"
                >
                  {isUpdatingWinnerStatus === selectedWinnerForRejection.id ? (
                    <RefreshCcw size={20} className="animate-spin" />
                  ) : (
                    "Confirmar Rechazo"
                  )}
                </button>
                <button 
                  onClick={() => setSelectedWinnerForRejection(null)}
                  className="px-6 py-4 bg-slate-100 text-slate-600 font-black rounded-xl hover:bg-slate-200 transition"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
                <h3 className="text-xl font-black uppercase tracking-tight">Editar Usuario</h3>
                <button onClick={() => setEditingUser(null)} className="hover:bg-white/20 p-1 rounded-lg transition">
                  <XCircle size={24} />
                </button>
              </div>
              
              <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-1">Nombre Completo</label>
                  <input 
                    type="text"
                    required
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-1">Celular</label>
                    <input 
                      type="text"
                      required
                      className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                      value={editingUser.phone}
                      onChange={(e) => setEditingUser({...editingUser, phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-1">Correo (Opcional)</label>
                    <input 
                      type="email"
                      className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                      value={editingUser.email || ''}
                      onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-1">Ciudad</label>
                    <input 
                      type="text"
                      className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                      value={editingUser.city || ''}
                      onChange={(e) => setEditingUser({...editingUser, city: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-1">Estado</label>
                    <input 
                      type="text"
                      className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                      value={editingUser.state || ''}
                      onChange={(e) => setEditingUser({...editingUser, state: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button 
                    type="submit"
                    disabled={isUpdatingUser}
                    className="flex-1 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition disabled:opacity-50 shadow-lg active:scale-95"
                  >
                    {isUpdatingUser ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyModalOpen && historyPlayer && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="font-black text-slate-800 flex items-center gap-2">
                    <Wallet size={20} className="text-blue-500" />
                    Historial de Billetera
                  </h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">{historyPlayer.name} ({historyPlayer.phone})</p>
                </div>
                <button
                  onClick={() => setHistoryModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {walletHistoryData.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="mx-auto text-slate-300 mb-3" size={48} />
                    <p className="font-bold text-slate-500">No hay movimientos registrados.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {walletHistoryData.map((txn, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-800">{txn.description}</p>
                          <p className="text-xs text-slate-500 font-medium">{(new Date(txn.created_at)).toLocaleString()}</p>
                          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 bg-slate-200 px-2 py-0.5 rounded mt-1 inline-block">{txn.type}</span>
                        </div>
                        <span className={clsx("font-black text-xl", txn.amount > 0 ? "text-green-500" : "text-red-500")}>
                          {txn.amount > 0 ? '+' : ''}{formatCurrency(txn.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && userToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="bg-red-600 p-6 text-white text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">¿Eliminar Usuario?</h3>
                <p className="text-red-100 font-medium mt-2">
                  Esta acción es irreversible y borrará todos los datos de <strong>{userToDelete.name}</strong>.
                </p>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                      {userToDelete.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-black text-slate-800">{userToDelete.name}</p>
                      <p className="text-xs font-bold text-slate-400">{userToDelete.phone}</p>
                    </div>
                  </div>
                  <ul className="text-xs font-bold text-slate-500 space-y-1 list-disc list-inside">
                    <li>Se eliminarán sus cartones</li>
                    <li>Se eliminarán sus recibos de pago</li>
                    <li>Se eliminará su historial de billetera</li>
                    <li>Se eliminarán sus reclamos de bingo</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => deleteUser(userToDelete.id)}
                    disabled={isDeletingUser === userToDelete.id}
                    className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition shadow-lg active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isDeletingUser === userToDelete.id ? (
                      <RefreshCcw size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={20} /> Sí, Eliminar
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeleteModal(false);
                      setUserToDelete(null);
                    }}
                    disabled={isDeletingUser === userToDelete.id}
                    className="px-6 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Chat Bubble */}
      <div className={clsx(
        "fixed bottom-6 right-6 z-[100] transition-all duration-300",
        isChatOpen ? "opacity-0 scale-0 pointer-events-none" : "opacity-100 scale-100"
      )}>
        <button
          onClick={() => {
            if (isChatOpen) {
              playChatCloseSound();
            } else {
              playChatOpenSound();
            }
            setIsChatOpen(!isChatOpen);
            setHasUnreadMessages(false);
          }}
          className="bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-700 transition-all active:scale-90 relative"
        >
          <MessageSquare size={24} />
          {hasUnreadMessages && (
            <span className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </button>
      </div>

      {/* Floating Chat Window (Always mounted to keep state, visually hidden) */}
      <div
        className={clsx(
          "fixed z-[100] shadow-2xl rounded-3xl overflow-hidden transition-all duration-300 origin-bottom-right flex flex-col",
          "bottom-6 left-4 right-4 h-[80vh] md:left-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[600px]",
          isChatOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 translate-y-10 pointer-events-none"
        )}
      >
        <ChatComponent 
          userName="Administrador" 
          isAdmin={true} 
          onNewMessage={() => !isChatOpen && setHasUnreadMessages(true)}
          isChatEnabled={isChatEnabled}
          onToggleChat={(enabled) => {
            setIsChatEnabled(enabled);
            apiFetch('/api/game/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_enabled: enabled }) });
          }}
          onClose={() => {
            playChatCloseSound();
            setIsChatOpen(false);
          }}
        />
      </div>

      {/* DJ Tracks Selection Modal */}
      <AnimatePresence>
        {showDjTracksModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <Music size={24} /> Pistas de Ambiente
                  </h3>
                  <button onClick={() => setShowDjTracksModal(false)} className="p-2 hover:bg-white/20 rounded-full transition">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-indigo-100 text-xs font-medium">Selecciona una pista para que suene de fondo para todos los jugadores.</p>
              </div>

              <div className="p-6 space-y-3">
                {activeDjTrackId && (
                  <button
                    onClick={stopDjBgTrack}
                    className="w-full p-4 rounded-2xl border-2 bg-red-50 border-red-200 flex items-center gap-4 transition hover:bg-red-100 mb-4 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0">
                      <Square size={20} className="fill-current" />
                    </div>
                    <div className="flex-1">
                      <p className="font-black text-sm text-red-700">DETENER MÚSICA</p>
                      <p className="text-[10px] text-red-500 font-bold uppercase">Apagar sonido de ambiente actual</p>
                    </div>
                  </button>
                )}

                {djBgPlaylist.length === 0 ? (
                  <div className="text-center py-8">
                    <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold text-sm">Cargando pistas...</p>
                  </div>
                ) : (
                  <>
                    {djBgPlaylist.map((track, i) => (
                      <button
                        key={track.id || i}
                        onClick={() => activeDjTrackId === track.id ? stopDjBgTrack() : triggerDjBgTrack(track)}
                        disabled={!track.url}
                        className={clsx(
                          "w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition group text-left",
                          activeDjTrackId === track.id
                            ? "bg-emerald-50 border-emerald-500"
                            : track.url 
                              ? "bg-slate-50 border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30" 
                              : "bg-slate-100 border-slate-100 opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className={clsx(
                          "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors",
                          activeDjTrackId === track.id ? "bg-emerald-500 text-white" : "bg-white text-slate-400 group-hover:text-indigo-600 border border-slate-100"
                        )}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={clsx("font-black text-sm truncate", activeDjTrackId === track.id ? "text-emerald-700" : "text-slate-800")}>
                            {track.name || `Pista ${i + 1}`}
                          </p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                            {track.url ? (activeDjTrackId === track.id ? 'Reproduciendo ahora' : 'Lista para reproducir') : 'Sin configurar'}
                          </p>
                        </div>
                        {track.url && (
                          <div className={clsx(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                            activeDjTrackId === track.id 
                              ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200" 
                              : "bg-white text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white border border-slate-100 shadow-sm"
                          )}>
                            {activeDjTrackId === track.id ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                          </div>
                        )}
                      </button>
                    ))}
                    
                    <div className="pt-4 border-t flex flex-col gap-3">
                      {activeDjTrackId && (
                        <button 
                          onClick={stopDjBgTrack}
                          className="w-full py-3.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-2xl font-black text-xs uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-sm"
                        >
                          <Square size={16} fill="currentColor" /> Detener Música Actual
                        </button>
                      )}
                      <p className="text-[10px] text-slate-400 font-medium text-center px-4 leading-relaxed">
                        * Selecciona una pista para activarla. Si ya está sonando, presiónala de nuevo para detenerla.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DJ Effects Selector Modal for Game Panel */}
      <AnimatePresence>
        {showSelectDjEffectsModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col"
            >
              <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white shrink-0">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <SlidersHorizontal size={22} /> Efectos DJ en el Panel de Control
                  </h3>
                  <button 
                    onClick={() => setShowSelectDjEffectsModal(false)} 
                    className="p-2 hover:bg-white/20 rounded-full transition cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-indigo-100 text-xs font-medium">
                  Selecciona los efectos que quieres tener a mano durante la partida. A medida que los marques, aparecerán de inmediato en el panel del juego.
                </p>
                
                {/* Search Bar & Filter */}
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-indigo-300 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Buscar efecto por nombre o etiqueta..."
                      value={searchDjTerm}
                      onChange={(e) => setSearchDjTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/20 rounded-xl text-xs text-white placeholder-indigo-200 focus:outline-none transition"
                    />
                  </div>
                  {searchDjTerm && (
                    <button
                      onClick={() => setSearchDjTerm('')}
                      className="px-2.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {/* Effects List */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {allDjSlots.filter(s => s.selectedForGamePanel).length} seleccionados
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const popularIds = ['slot_airhorn', 'slot_applause', 'slot_suspense', 'slot_cheer', 'slot_coins', 'slot_bingo'];
                        const updatedSlots = allDjSlots.map(s => ({
                          ...s,
                          selectedForGamePanel: popularIds.includes(s.id) ? true : s.selectedForGamePanel
                        }));
                        setAllDjSlots(updatedSlots);
                        const payload: Record<string, any> = {};
                        updatedSlots.forEach(s => {
                          payload[s.id] = { ...s, selectedForGamePanel: !!s.selectedForGamePanel };
                        });
                        await apiFetch('/api/admin/settings/dj-board', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ slots: payload })
                        });
                        window.dispatchEvent(new CustomEvent('dj-slots-updated', { detail: updatedSlots }));
                        toast.success('Efectos populares activados', { icon: '⭐' });
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                    >
                      + Populares
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      onClick={async () => {
                        const updatedSlots = allDjSlots.map(s => ({ ...s, selectedForGamePanel: false }));
                        setAllDjSlots(updatedSlots);
                        const payload: Record<string, any> = {};
                        updatedSlots.forEach(s => {
                          payload[s.id] = { ...s, selectedForGamePanel: false };
                        });
                        await apiFetch('/api/admin/settings/dj-board', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ slots: payload })
                        });
                        window.dispatchEvent(new CustomEvent('dj-slots-updated', { detail: updatedSlots }));
                        toast('Todos los efectos han sido desmarcados', { icon: '🧹' });
                      }}
                      className="text-xs text-slate-500 hover:text-red-600 font-bold hover:underline cursor-pointer"
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allDjSlots
                    .filter(s => {
                      if (!searchDjTerm) return true;
                      const term = searchDjTerm.toLowerCase();
                      return s.name.toLowerCase().includes(term) || s.label.toLowerCase().includes(term) || s.description.toLowerCase().includes(term);
                    })
                    .map((slot) => {
                      const isSelected = !!slot.selectedForGamePanel;
                      const isPreviewing = previewingAudioSlotId === slot.id;

                      return (
                        <div
                          key={slot.id}
                          onClick={() => toggleSlotForGamePanel(slot.id)}
                          className={clsx(
                            "p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 cursor-pointer select-none group",
                            isSelected 
                              ? "bg-amber-50 border-amber-400 shadow-sm" 
                              : "bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Checkbox */}
                            <div className={clsx(
                              "w-6 h-6 rounded-lg flex items-center justify-center border transition shrink-0",
                              isSelected 
                                ? "bg-amber-400 border-amber-500 text-amber-950 font-black shadow-sm" 
                                : "bg-white border-slate-300 group-hover:border-slate-400 text-transparent"
                            )}>
                              <Check size={14} className="stroke-[3]" />
                            </div>

                            <span className="text-2xl shrink-0">{slot.emoji}</span>

                            <div className="min-w-0">
                              <h4 className={clsx(
                                "font-black text-xs sm:text-sm truncate",
                                isSelected ? "text-amber-950" : "text-slate-800"
                              )}>
                                {slot.name}
                              </h4>
                              <p className="text-[10px] text-slate-500 truncate">
                                {slot.label} {slot.isCustom && '• Personalizado'}
                              </p>
                            </div>
                          </div>

                          {/* Preview Play Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              previewDjSoundLocally(slot);
                            }}
                            className={clsx(
                              "p-2 rounded-xl transition shrink-0 cursor-pointer shadow-sm",
                              isPreviewing
                                ? "bg-emerald-500 text-white animate-pulse"
                                : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-200"
                            )}
                            title="Probar sonido (solo para ti)"
                          >
                            <Volume2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                <button
                  onClick={() => {
                    setShowSelectDjEffectsModal(false);
                    setActiveTab('dj_board');
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Music size={14} /> Ir a la Mesa DJ para subir más audios
                </button>
                <button
                  onClick={() => setShowSelectDjEffectsModal(false)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition active:scale-95 shadow cursor-pointer"
                >
                  Listo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox Receipt Viewer */}
      <AnimatePresence>
        {selectedReceiptUrl && (
          <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans" onClick={() => setSelectedReceiptUrl(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl overflow-hidden max-w-lg w-full shadow-2xl relative" 
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <span className="text-sm font-black text-slate-800 uppercase tracking-wider">Comprobante de Pago</span>
                <div className="flex items-center gap-2">
                  <a
                    href={selectedReceiptUrl.split('#hash#')[0]}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-1 transition-colors"
                  >
                    Abrir original ↗
                  </a>
                  <button onClick={() => setSelectedReceiptUrl(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="p-4 flex justify-center bg-slate-100 max-h-[75vh] overflow-y-auto">
                <img 
                  src={selectedReceiptUrl.split('#hash#')[0]} 
                  alt="Comprobante" 
                  className="max-w-full h-auto object-contain rounded-xl shadow-inner cursor-zoom-in" 
                  onClick={() => window.open(selectedReceiptUrl.split('#hash#')[0], '_blank')}
                  title="Haz clic para ver en tamaño completo"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: VISOR DE CARTONES REGALADOS POR EL JUGADOR */}
      <AnimatePresence>
        {selectedGiftingPlayer && (
          <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans" onClick={() => setSelectedGiftingPlayer(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-yellow-300 shadow-inner">
                    <Gift size={26} className="animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight leading-tight">
                      Visor de Cartones Regalados
                    </h3>
                    <p className="text-xs text-purple-200 font-bold mt-0.5">
                      Jugador: <span className="text-white font-black">{selectedGiftingPlayer.name}</span> ({selectedGiftingPlayer.phone})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedGiftingPlayer(null)}
                  className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Resumen Indicador */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-100 rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-purple-700 block">
                      Total de Cartones Regalados
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-slate-800">
                        {selectedGiftingPlayer.gift_count || 0}
                      </span>
                      <span className="text-slate-400 font-bold text-sm">/ 4 cartones permitidos</span>
                    </div>
                  </div>
                  <div className={clsx(
                    "px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm",
                    (selectedGiftingPlayer.gift_count || 0) >= 4
                      ? "bg-emerald-500 text-white"
                      : (selectedGiftingPlayer.gift_count || 0) > 0
                        ? "bg-purple-600 text-white"
                        : "bg-slate-200 text-slate-600"
                  )}>
                    {(selectedGiftingPlayer.gift_count || 0) >= 4
                      ? '4 de 4 Completo 🎉'
                      : (selectedGiftingPlayer.gift_count || 0) > 0
                        ? `${selectedGiftingPlayer.gift_count} de 4 enviados`
                        : 'Sin regalar aún'}
                  </div>
                </div>

                {/* 4 Slots Detail */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span>Desglose de los 4 Sobres de Regalo</span>
                  </h4>

                  {[0, 1, 2, 3].map((idx) => {
                    const isGiven = (selectedGiftingPlayer.gift_count || 0) > idx;
                    const detail = selectedGiftingPlayer.gift_details?.[idx];
                    const isClaimed = detail?.status === 'claimed';

                    return (
                      <div 
                        key={idx}
                        className={clsx(
                          "p-4 rounded-2xl border-2 transition flex items-center justify-between gap-4",
                          isClaimed
                            ? "bg-emerald-50/70 border-emerald-300"
                            : isGiven
                              ? "bg-purple-50/70 border-purple-300"
                              : "bg-slate-50 border-slate-200 opacity-60"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm",
                            isClaimed
                              ? "bg-emerald-500 text-white"
                              : isGiven
                                ? "bg-purple-600 text-white"
                                : "bg-slate-200 text-slate-500"
                          )}>
                            {isGiven ? <Gift size={18} /> : (idx + 1)}
                          </div>
                          <div>
                            <h5 className="font-black text-sm text-slate-800 flex items-center gap-2">
                              Regalo #{idx + 1}
                              {isClaimed ? (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-extrabold uppercase">
                                  ✅ Redimido / Reclamado
                                </span>
                              ) : isGiven ? (
                                <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-extrabold uppercase">
                                  📲 Enviado por WhatsApp (Pendiente)
                                </span>
                              ) : (
                                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase">
                                  Disponible (Sin enviar)
                                </span>
                              )}
                            </h5>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                              {isClaimed ? (
                                <span>
                                  Reclamado por amigo: <strong className="text-slate-700 font-mono">{detail.recipient_phone}</strong>
                                  {detail.created_at && ` • ${new Date(detail.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`}
                                </span>
                              ) : isGiven ? (
                                <span>
                                  Enlace generado y compartido por WhatsApp.
                                  {detail?.created_at && ` (${new Date(detail.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })})`}
                                </span>
                              ) : (
                                <span>El jugador aún no ha compartido este cartón de regalo.</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={clsx(
                            "text-xs font-black px-2.5 py-1 rounded-lg",
                            isClaimed
                              ? "bg-emerald-600 text-white"
                              : isGiven
                                ? "bg-purple-600 text-white"
                                : "bg-slate-200 text-slate-500"
                          )}>
                            {isClaimed ? "Redimido" : isGiven ? "Enviado" : "Pendiente"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setSelectedGiftingPlayer(null)}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl transition active:scale-95 cursor-pointer"
                >
                  Cerrar Visor
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}

function GameStatsCollapsible({ game }: { game: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);

  return (
    <div className="p-5 hover:bg-slate-50/50 transition">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        {/* Left info: Title and timestamp */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-black text-slate-800 text-sm">
              {game.name}
            </h4>
            <span className={clsx(
              "text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider border",
              game.status === 'finished' ? "bg-red-50 text-red-600 border-red-200" :
              game.status === 'playing' ? "bg-green-50 text-green-600 border-green-200 animate-pulse" :
              "bg-slate-100 text-slate-600 border-slate-200"
            )}>
              {game.status}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Fecha: {new Date(game.created_at || game.date).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>

        {/* Middle stats indicators */}
        <div className="flex items-center gap-4 sm:gap-8 text-xs flex-wrap">
          <div className="space-y-0.5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block">
              Cartones
            </span>
            <span className="font-extrabold text-slate-700 text-sm">
              {game.cards_sold} unidades
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block">
              Jugadores
            </span>
            <span className="font-extrabold text-slate-700 text-sm">
              {game.unique_players_count} activos
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block">
              Esferas Cantadas
            </span>
            <span className="font-extrabold text-slate-700 text-sm">
              {game.drawn_balls_count} extraídas
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block">
              Ganadores
            </span>
            <span className={clsx(
              "font-extrabold text-sm block",
              (game.winners && game.winners.length > 0) ? 'text-green-600' : 'text-slate-400'
            )}>
              {game.winners?.length || 0} bingo(s)
            </span>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition border border-slate-200 self-start lg:self-auto"
        >
          <span>{isOpen ? 'Ocultar info' : 'Ver analíticas'}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded statistical content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-4 pt-4 border-t border-slate-100 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Detail section 1: Winners */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <Trophy size={14} className="text-yellow-500" />
                  Premios y Ganadores Registrados
                </h5>
                {(!game.winners || game.winners.length === 0) ? (
                  <p className="text-[11px] text-slate-400 italic font-medium">No se registraron ganadores para este juego o quedó suspendido.</p>
                ) : (
                  <div className="space-y-2">
                    {game.winners.map((w: any, idx: number) => (
                      <div key={`${w.winner_id}-${idx}`} className="bg-white p-3 rounded-xl border border-slate-100 text-xs flex justify-between items-center gap-2">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-800">{w.winner_name}</p>
                          <p className="font-mono text-[10px] text-slate-500">{w.winner_phone}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block text-[10px]">
                            {w.pattern_name}
                          </p>
                          <p className="font-extrabold text-slate-700 text-[10px]">
                            Premio: {formatCurrency(parseFloat(w.prize) || 0)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detail section 2: Player connections list */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={14} className="text-blue-500" />
                    Jugadores Participantes ({game.unique_players_count})
                  </h5>
                  {game.players_list?.length > 0 && (
                    <button
                      onClick={() => setShowPlayers(!showPlayers)}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      {showPlayers ? 'Colapsar lista' : 'Expandir lista'}
                    </button>
                  )}
                </div>

                {(!game.players_list || game.players_list.length === 0) ? (
                  <p className="text-[11px] text-slate-400 italic font-medium">No hubo jugadores asignados con cartones en esta sesión.</p>
                ) : showPlayers ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {game.players_list.map((p: any, idx: number) => (
                      <div key={`${p.phone}-${idx}`} className="bg-white px-3 py-2 rounded-xl border border-slate-100 text-[11px]">
                        <p className="font-bold text-slate-800 truncate">{p.name || 'Invitado'}</p>
                        <p className="font-mono text-[9px] text-slate-400 truncate">{p.phone}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 font-medium font-sans">
                    {game.players_list.slice(0, 5).map((p: any) => p.name || 'Invitado').join(', ')}
                    {game.players_list.length > 5 && ` y ${game.players_list.length - 5} jugadores más.`}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
