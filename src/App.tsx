/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { useEffect } from 'react';
import Home from './pages/Home';
import Register from './pages/Register';
import SaaSMarketingLanding from './pages/SaaSMarketingLanding';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Auto-recuperación ante actualizaciones de Vite en producción
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Vite] Error de precarga de módulo diferido detectado. Recargando para actualizar bundle...', event);
    window.location.reload();
  });
}

// Code-Splitting con carga diferida bajo demanda protegida con auto-reintento
const FreeGames = lazyWithRetry(() => import('./pages/FreeGames'), 'FreeGames');
const PlayerDashboard = lazyWithRetry(() => import('./pages/PlayerDashboard'), 'PlayerDashboard');
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'), 'AdminDashboard');
const AdminLogin = lazyWithRetry(() => import('./pages/AdminLogin'), 'AdminLogin');
const AdminRegister = lazyWithRetry(() => import('./pages/AdminRegister'), 'AdminRegister');
const ForgotPassword = lazyWithRetry(() => import('./pages/ForgotPassword'), 'ForgotPassword');
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'), 'ResetPassword');
const RegistrationSuccess = lazyWithRetry(() => import('./pages/RegistrationSuccess'), 'RegistrationSuccess');
const DynamicsInfo = lazyWithRetry(() => import('./pages/DynamicsInfo'), 'DynamicsInfo');
const SellerDashboard = lazyWithRetry(() => import('./pages/SellerDashboard'), 'SellerDashboard');
const SuperAdminDashboard = lazyWithRetry(() => import('./pages/SuperAdminDashboard'), 'SuperAdminDashboard');

import { AuthProvider, useAuth } from './AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { MaintenanceScreen } from './components/MaintenanceScreen';
import SplashScreen from './components/splash/SplashScreen';
import { AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { playNavigateSound, playClickSound, playBase64PCM, stopBase64PCM, getAudioContext, setGlobalFxVolume, decodeAudioFromBase64, playAudioBuffer, playFxFromUrl } from './utils/sound';
import { cancelSpeech, getIsWinnerSpeechActive } from './utils/speech';
import { useTTS } from './hooks/useTTS';
import { getBingoChannel } from './ably';
import BackgroundMusicPlayer from './components/BackgroundMusicPlayer';

import { apiFetch } from './utils/api';
import { initializeOneSignal } from './lib/onesignal';
import { TenantProvider } from './TenantContext';

export const getProxyUrl = (url: string): string => {
  if (!url) return '';
  // Force fallback for mixkit due to 403 blocks
  if (url.includes('mixkit.co')) return '';
  // Avoid proxying URLs that already have CORS or don't need hotlink bypassing
  if (url.includes('githubusercontent.com') || url.includes('supabase.co') || url.includes('wikimedia.org')) {
    return url;
  }
  return `/api/audio-proxy?url=${encodeURIComponent(url)}`;
};

const globalHandledAnnouncementTimes = new Map<string, number>();

function GlobalBackgroundMusic() {
  const location = useLocation();
  const isPlayerDashboard = location.pathname === '/player';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bingo-app-muted') === 'true';
    }
    return false;
  });
  const [isPlayingBg, setIsPlayingBg] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const { speakNative, stop } = useTTS();
  const speakNativeRef = useRef(speakNative);
  speakNativeRef.current = speakNative;

  // Listen for user interaction anywhere on the screen to unlock AudioContext and hide initial hint badge
  useEffect(() => {
    const handleUserInteraction = () => {
      setHasInteracted(true);
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      } catch (e) {}
    };

    window.addEventListener('pointerdown', handleUserInteraction, { capture: true, once: true });
    window.addEventListener('click', handleUserInteraction, { capture: true, once: true });
    window.addEventListener('touchstart', handleUserInteraction, { capture: true, once: true });
    window.addEventListener('keydown', handleUserInteraction, { capture: true, once: true });

    return () => {
      window.removeEventListener('pointerdown', handleUserInteraction, { capture: true } as any);
      window.removeEventListener('click', handleUserInteraction, { capture: true } as any);
      window.removeEventListener('touchstart', handleUserInteraction, { capture: true } as any);
      window.removeEventListener('keydown', handleUserInteraction, { capture: true } as any);
    };
  }, []);

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHasInteracted(true);
    
    // Resume audio context
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (err) {}

    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    localStorage.setItem('bingo-app-muted', newMutedState ? 'true' : 'false');
    localStorage.setItem('bg_audio_muted', newMutedState ? 'true' : 'false');

    if (newMutedState) {
      try { stopBase64PCM(); } catch (e) {}
      try { cancelSpeech(true); } catch (e) {}
      toast('🔇 Audio silenciado', { duration: 2000, id: 'global-sound-toggle' });
    } else {
      toast('🔊 Audio activado', { duration: 2000, id: 'global-sound-toggle' });
      try {
        playClickSound();
      } catch (e) {}
    }
  };

  // Sync with localStorage across components and tabs
  useEffect(() => {
    localStorage.setItem('bingo-app-muted', isMuted ? 'true' : 'false');
    if (isMuted) {
      stop();
    }
  }, [isMuted, stop]);

  useEffect(() => {
    const handleStorage = () => {
      const stored = localStorage.getItem('bingo-app-muted') === 'true';
      if (stored !== isMuted) {
        setIsMuted(stored);
      }
    };
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 1000);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [isMuted]);

  useEffect(() => {
    const channel = getBingoChannel();

    const handleGameUpdate = (msg: any) => {
      const data = msg.data;
      if (data && data.fx_volume !== undefined) {
        setGlobalFxVolume(data.fx_volume);
      }
    };

    const handleFxVolumeUpdate = (msg: any) => {
      if (msg.data && typeof msg.data.volume === 'number') {
        setGlobalFxVolume(msg.data.volume);
      }
    };

    channel.subscribe('game_update', handleGameUpdate);
    channel.subscribe('fx_volume_update', handleFxVolumeUpdate);

    return () => {
      channel.unsubscribe('game_update', handleGameUpdate);
      channel.unsubscribe('fx_volume_update', handleFxVolumeUpdate);
    };
  }, []);

  const preloadedResumeBufferRef = useRef<AudioBuffer | null>(null);
  const preloadedCantoBingoBufferRef = useRef<AudioBuffer | null>(null);
  const CANTO_BINGO_URL = "https://github.com/stcganas/Audiosbingo/raw/refs/heads/main/Canto%20Bingo%20corto.m4a";
  const tabSessionIdRef = useRef(`tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  // Pre-warm resume announcement audio into memory immediately for 0ms instant start
  useEffect(() => {
    apiFetch('/api/announcements/prewarm-resume')
      .then(res => res.json())
      .then(async data => {
        if (data && data.audio) {
          const buf = await decodeAudioFromBase64(data.audio);
          if (buf) {
            preloadedResumeBufferRef.current = buf;
            console.log('[AI Audio Prewarm] Resume announcement pre-decoded into memory.');
          }
        }
      })
      .catch(err => console.warn('[AI Audio Prewarm] Notice:', err?.message || err));
  }, []);

  // Preload Canto Bingo audio into memory for instant playback
  useEffect(() => {
    fetch(CANTO_BINGO_URL)
      .then(res => res.arrayBuffer())
      .then(async arrayBuffer => {
        const ctx = getAudioContext();
        const buf = await ctx.decodeAudioData(arrayBuffer);
        preloadedCantoBingoBufferRef.current = buf;
        console.log('[Audio Preload] Canto Bingo audio preloaded successfully.');
      })
      .catch(err => console.warn('[Audio Preload] Could not preload Canto Bingo audio:', err));
  }, []);

  const lastCantoAudioTimeRef = useRef<number>(0);

  // Listen to bingo_called event to play Canto Bingo audio instantly across the app
  useEffect(() => {
    const channel = getBingoChannel();

    const onBingoCalledGlobal = async (_msg: any) => {
      const storedMuted = localStorage.getItem('bingo-app-muted') === 'true';
      if (storedMuted) return;

      const now = Date.now();
      if (now - lastCantoAudioTimeRef.current < 5000) {
        return; // Avoid double triggering within 5s in this tab
      }
      lastCantoAudioTimeRef.current = now;

      // Stop any active ball speech or Web Audio immediately so Canto Bingo is heard loud & clear with 0ms delay
      try { stopBase64PCM(); } catch (e) {}
      try { cancelSpeech(true); } catch (e) {}

      console.log('[Canto Bingo] Playing instant Canto Bingo celebration audio!');
      if (preloadedCantoBingoBufferRef.current) {
        playAudioBuffer(preloadedCantoBingoBufferRef.current, 1.4).catch(() => {
          playFxFromUrl(CANTO_BINGO_URL, 1.4);
        });
      } else {
        playFxFromUrl(CANTO_BINGO_URL, 1.4);
      }
    };

    channel.subscribe('bingo_called', onBingoCalledGlobal);
    return () => {
      channel.unsubscribe('bingo_called', onBingoCalledGlobal);
    };
  }, []);

  // Subscribe to global AI announcement TTS events (strictly unified single voice)
  useEffect(() => {
    const channel = getBingoChannel();

    const onAnnouncementTts = async (msg: any) => {
      const { id, text, voice, isFallbackSpeech } = msg.data || {};
      if (!text || !text.trim()) return;

      const textKey = text.trim().toLowerCase();
      const now = Date.now();
      const lastPlayedTime = globalHandledAnnouncementTimes.get(textKey);
      
      // Strict 18-second deduplication: prevents repeated announcements in this tab
      if (lastPlayedTime && (now - lastPlayedTime < 18000)) {
        console.log(`[AI Announcement Global] Blocked duplicate announcement: "${textKey.substring(0, 30)}..."`);
        return;
      }

      // Atomic cross-tab coordination: prevents multiple tabs (e.g. Admin + Player) from speaking simultaneously
      const storageKey = `bingo_announcement_lock`;
      try {
        const rawLock = localStorage.getItem(storageKey);
        if (rawLock) {
          const parsedLock = JSON.parse(rawLock);
          if (parsedLock && parsedLock.key === textKey && (now - parsedLock.time < 18000)) {
            console.log(`[AI Announcement Global] Blocked cross-tab duplicate: "${textKey.substring(0, 30)}..."`);
            return;
          }
        }
        localStorage.setItem(storageKey, JSON.stringify({ key: textKey, tabId: tabSessionIdRef.current, time: now }));

        // Micro delay to allow leader election to settle across open tabs
        await new Promise(r => setTimeout(r, 25));
        const verifiedLock = localStorage.getItem(storageKey);
        if (verifiedLock) {
          const parsedV = JSON.parse(verifiedLock);
          if (parsedV && parsedV.key === textKey && parsedV.tabId !== tabSessionIdRef.current) {
            console.log(`[AI Announcement Global] Primary tab (${parsedV.tabId}) is handling audio, skipping duplicate in tab ${tabSessionIdRef.current}`);
            return;
          }
        }
      } catch (e) {}

      globalHandledAnnouncementTimes.set(textKey, now);

      if (globalHandledAnnouncementTimes.size > 80) {
        for (const [k, v] of globalHandledAnnouncementTimes.entries()) {
          if (now - v > 40000) globalHandledAnnouncementTimes.delete(k);
        }
      }

      console.log(`[AI Announcement Global] Unified Voice: ${voice}, Text: ${text}, ID: ${id}`);
      
      const storedMuted = localStorage.getItem('bingo-app-muted') === 'true';
      const toastId = `announcement-toast-${textKey.slice(0, 20)}`;

      if (!storedMuted) {
        // If a winner locution is actively playing, don't interrupt it unless this is also a winner announcement
        const isWinnerActive = getIsWinnerSpeechActive();
        const isWinnerAnnouncement = text.toLowerCase().includes('bingo') || text.toLowerCase().includes('ganador') || text.toLowerCase().includes('felicitaciones');
        if (isWinnerActive && !isWinnerAnnouncement) {
          console.log('[AI Global] Skipping non-winner announcement because winner locution is active');
          return;
        }

        // Stop any active non-protected audio or speech synthesis BEFORE playing new announcement
        try { stopBase64PCM(); } catch (e) {}
        try { cancelSpeech(true); } catch (e) {}

        toast(`📢 Anuncio: "${text.length > 80 ? text.substring(0, 80) + '...' : text}"`, { 
          id: toastId, 
          duration: 6000, 
          icon: '📢' 
        });

        let playedAudio = false;

        // Instant path: if this is the resume announcement and we have preloaded the decoded buffer, play with 0ms delay!
        if (textKey.includes('reanudamos') && preloadedResumeBufferRef.current) {
          try {
            playedAudio = await playAudioBuffer(preloadedResumeBufferRef.current, 1.0);
            if (playedAudio) {
              console.log('[AI Global] Played resume announcement INSTANTLY via preloaded memory buffer');
            }
          } catch (bufErr) {
            console.warn('[AI Global] Preloaded audio buffer error, falling back to fetch:', bufErr);
          }
        }

        if (!playedAudio && id && !isFallbackSpeech) {
          try {
            const res = await apiFetch(`/api/announcements/audio?id=${id}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.audio) {
                const ok = await playBase64PCM(data.audio, 24000, 1.0);
                if (ok) {
                  playedAudio = true;
                }
              }
            }
          } catch (err) {
            console.error('[AI Global] Error fetching AI announcement audio from server:', err);
          }
        }
        
        // Single fallback: native browser speech synthesis ONLY if PCM audio was not played AND it is marked fallback
        if (!playedAudio && isFallbackSpeech) {
          try {
            speakNativeRef.current(text);
            console.log('[AI Fallback Global] Native Browser SpeechSynthesis playing single voice:', text);
          } catch (voiceErr) {
            console.error('[AI Fallback Global] Failed native browser speech synthesis:', voiceErr);
          }
        }
      } else {
        toast(`📢 [Silenciado] Anuncio: "${text.length > 80 ? text.substring(0, 80) + '...' : text}"`, { 
          id: toastId, 
          duration: 4000, 
          icon: '🔕' 
        });
      }
    };

    channel.subscribe('announcement_tts', onAnnouncementTts);

    return () => {
      channel.unsubscribe('announcement_tts', onAnnouncementTts);
    };
  }, []);

  // Update muted state explicitly to handle users toggling mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Hide the floating sound icon when sound is activated and user has interacted with screen
  if (!isMuted && hasInteracted) {
    return null;
  }

  return (
    <div className={`fixed left-6 z-[110] flex items-center gap-2 transition-all duration-300 ${
      isPlayerDashboard ? 'bottom-[160px]' : 'bottom-20'
    }`}>
      <button 
        onClick={toggleMute}
        className={`p-3 rounded-full shadow-2xl border-2 transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
          isMuted 
            ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white ring-2 ring-red-500/30' 
            : isPlayingBg
              ? 'bg-indigo-600 border-indigo-400 text-white animate-pulse shadow-indigo-600/30 hover:bg-indigo-500'
              : 'bg-indigo-600 border-indigo-400 text-white hover:bg-indigo-500 shadow-indigo-900/30 ring-2 ring-emerald-400/40'
        }`}
        title={
          isMuted ? "Activar Sonido General (Balotas, Anuncios e IA)" : "Silenciar Sonido General"
        }
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {!hasInteracted && !isMuted && (
        <button 
          onClick={toggleMute}
          className="text-xs font-semibold bg-slate-900/95 backdrop-blur-md border border-yellow-500/50 text-yellow-300 px-3.5 py-2 rounded-xl shadow-xl animate-pulse flex items-center gap-1.5 cursor-pointer hover:bg-slate-800 transition-all active:scale-95" 
          style={{ animationDuration: '2s' }}
          title="Haz clic o toca la pantalla para activar el audio en tu navegador"
        >
          <span>✨ Toca la pantalla para activar el audio</span>
        </button>
      )}
    </div>
  );
}

function NavigationSound() {
  const location = useLocation();
  useEffect(() => {
    const soundSettings = JSON.parse(localStorage.getItem('bingo-sound-settings') || '{}');
    if (soundSettings.navigate) playNavigateSound();
  }, [location]);
  return null;
}

function GlobalClickListener() {
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button') || target.closest('a') || target.closest('[role="button"]');
      
      if (button && !button.hasAttribute('data-no-click-sound')) {
        playClickSound();
      }
    };
    
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);
  return null;
}

function SupabaseWarning() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isConfigured = url && url.startsWith('https://') && !!key;
  
  if (isConfigured) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] bg-yellow-50 border-2 border-yellow-400 p-4 rounded-2xl shadow-2xl flex items-start gap-4 animate-bounce">
      <div className="bg-yellow-400 p-2 rounded-full text-white">
        <AlertTriangle size={24} />
      </div>
      <div>
        <h3 className="font-black text-yellow-800 uppercase text-sm">Configuración Requerida o Inválida</h3>
        <p className="text-xs text-yellow-700 font-bold">
          Faltan las variables de Supabase o son inválidas. La URL debe empezar con <code>https://</code>. Ve a <strong>Settings -&gt; Secrets</strong> y añade:
          <br />
          <code className="bg-white/50 px-1 rounded">VITE_SUPABASE_URL</code> y <code className="bg-white/50 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold">{error}</div>;
  
  const salaMatch = location.pathname.match(/^\/sala\/([^\/]+)/);
  const routeSlug = salaMatch ? salaMatch[1].toLowerCase() : null;

  if (!user || user.role !== 'admin') {
    if (routeSlug) {
      return <Navigate to={`/sala/${routeSlug}/admin/login`} replace />;
    }
    return <Navigate to="/admin/login" replace />;
  }

  // Aislamiento estricto de administradores por sala:
  if (routeSlug) {
    const isSuper = !!user.isSuperAdmin;
    const userTenant = (user.tenant_id || '').toLowerCase();
    // Si no es Super Admin global y no coincide el tenant_id con el slug de la sala, denegar acceso
    if (!isSuper && userTenant !== routeSlug) {
      return <Navigate to={`/sala/${routeSlug}/admin/login?error=unauthorized_room`} replace />;
    }
  } else {
    // Si accede a /admin general pero es un admin exclusivo de sala, redirigirlo a su sala
    if (!user.isSuperAdmin && user.tenant_id) {
      return <Navigate to={`/sala/${user.tenant_id}/admin`} replace />;
    }
  }

  return children;
}

function PlayerProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold">{error}</div>;
  
  if (!user || user.role !== 'player') {
    return <Navigate to="/" replace />;
  }

  // Verificar aislamiento por sala: Si la URL es /sala/:slug/player, el usuario debe pertenecer estrictamente a esa sala
  const salaMatch = location.pathname.match(/^\/sala\/([^\/]+)/);
  if (salaMatch) {
    const routeSlug = salaMatch[1].toLowerCase();
    const userTenant = (user.tenant_id || 'default').toLowerCase();
    if (userTenant !== routeSlug && !(routeSlug === 'bingo-lite' && userTenant === 'default')) {
      // El usuario pertenece a otra sala. Impedir acceso a sala ajena y redirigir al login de esta sala
      return <Navigate to={`/sala/${routeSlug}`} replace />;
    }
  }

  return children;
}

function SellerProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, error } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold">{error}</div>;
  
  if (!user || user.role !== 'seller') {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

// Super Admin: solo usuarios con isSuperAdmin=true pueden acceder
function SuperAdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, error } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#090918', color: '#818cf8' }}>Verificando permisos...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold">{error}</div>;

  if (!user || user.role !== 'admin' || !user.isSuperAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function MaintenanceWrapper({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const [landingMaintenance, setLandingMaintenance] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const { user } = useAuth();
  const location = useLocation();

  // Detectar si la ruta actual pertenece a una sala (/sala/:slug o /sala/:slug/*)
  const roomMatch = location.pathname.match(/\/sala\/([a-zA-Z0-9_-]+)/i);
  const currentRoomSlug = roomMatch ? roomMatch[1].toLowerCase() : null;

  useEffect(() => {
    // 1. Si no es una sala, verificar el estado de mantenimiento propio de la Página Principal / Plataforma
    if (!currentRoomSlug) {
      setMaintenance({ active: false, message: '' });

      apiFetch('/api/landing-maintenance-status')
        .then(res => res.json())
        .then(data => {
          if (data) {
            setLandingMaintenance({ active: Boolean(data.active), message: data.message || '' });
          }
        })
        .catch(() => {});

      const globalChannel = getBingoChannel('bingo-global');
      const handleLandingUpdate = (msg: any) => {
        if (msg.data) {
          setLandingMaintenance({
            active: Boolean(msg.data.active),
            message: msg.data.message || ''
          });
        }
      };
      globalChannel.subscribe('landing_maintenance_updated', handleLandingUpdate);
      return () => {
        globalChannel.unsubscribe('landing_maintenance_updated', handleLandingUpdate);
      };
    }

    // 2. Si es una sala (/sala/:slug), consultar el estado de mantenimiento exclusivo para esta sala
    setLandingMaintenance({ active: false, message: '' });
    apiFetch(`/api/maintenance-status?slug=${currentRoomSlug}`)
      .then(res => res.json())
      .then(data => {
        if (data && (data.tenant_id === currentRoomSlug || !data.tenant_id || currentRoomSlug === 'bingo-lite')) {
          setMaintenance({ active: Boolean(data.maintenance_mode), message: data.maintenance_message || '' });
        }
      })
      .catch(() => {});

    // Escuchar actualizaciones de tiempo real exclusivas para esta sala
    const channel = getBingoChannel(currentRoomSlug);
    const handleMaintenanceUpdate = (msg: any) => {
      if (msg.data) {
        const msgTenant = (msg.data.tenant_id || '').toLowerCase();
        if (!msgTenant || msgTenant === currentRoomSlug || (currentRoomSlug === 'bingo-lite' && msgTenant === 'default')) {
          setMaintenance({
            active: Boolean(msg.data.maintenance_mode),
            message: msg.data.maintenance_message || ''
          });
        }
      }
    };
    channel.subscribe('maintenance_updated', handleMaintenanceUpdate);
    return () => {
      channel.unsubscribe('maintenance_updated', handleMaintenanceUpdate);
    };
  }, [currentRoomSlug]);

  // Rutas administrativas (tanto /admin, /superadmin como /sala/:slug/admin) nunca deben ser bloqueadas
  const isAdminRoute = location.pathname.includes('/admin') || location.pathname.includes('/superadmin') || location.pathname.includes('/login');
  if (isAdminRoute) {
    return <>{children}</>;
  }

  // 1. Mantenimiento para salas individuales (/sala/:slug)
  if (currentRoomSlug && maintenance.active) {
    const isAdmin = user?.role === 'admin';
    const cleanUserPhone = user?.phone ? user.phone.replace(/\D/g, '').slice(-10) : '';
    const isAuthorizedPlayer = cleanUserPhone === '3145261451';

    if (!isAdmin && !isAuthorizedPlayer) {
      return <MaintenanceScreen message={maintenance.message} />;
    }
  }

  // 2. Mantenimiento para la página principal / plataforma global (controlada desde Super Admin)
  if (!currentRoomSlug && landingMaintenance.active) {
    const isSuperAdmin = user?.role === 'admin' && (user?.isSuperAdmin || user?.email === 'stcganas@gmail.com' || user?.email === 'comamosexpress@gmail.com');
    if (!isSuperAdmin) {
      return <MaintenanceScreen message={landingMaintenance.message} />;
    }
  }

  return <>{children}</>;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ErrorBoundary>
      <AuthProvider>
        {showSplash ? (
          <SplashScreen onComplete={() => setShowSplash(false)} />
        ) : (
          <Router>
            <TenantProvider>
              <ScrollToTop />
              <NavigationSound />
              <GlobalClickListener />
              <GlobalBackgroundMusic />
              <MaintenanceWrapper>
              <div className="min-h-screen bg-blue-50 text-slate-800 font-sans">
                <Toaster position="top-center" />
                <SupabaseWarning />
                <PWAInstallPrompt />
                <React.Suspense fallback={
                  <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cargando sala...</p>
                  </div>
                }>
                <Routes>
              {/* Rutas de Administrador (Globales) */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/register" element={<AdminRegister />} />
              <Route path="/admin/forgot-password" element={<ForgotPassword />} />
              <Route path="/admin/reset-password" element={<ResetPassword />} />
              <Route path="/admin" element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              
              {/* Landing Page Principal SaaS (Para organizadores) */}
              <Route path="/" element={<SaaSMarketingLanding />} />
              <Route path="/superadmin" element={
                <SuperAdminProtectedRoute>
                  <SuperAdminDashboard />
                </SuperAdminProtectedRoute>
              } />
              <Route path="/super-admin" element={<Navigate to="/superadmin" replace />} />
              <Route path="/dynamics" element={<DynamicsInfo />} />
              <Route path="/free-games" element={<FreeGames />} />
                            <Route path="/seller" element={
                <SellerProtectedRoute>
                  <SellerDashboard />
                </SellerProtectedRoute>
              } />

              <Route path="/register" element={<Register />} />
              <Route path="/registration-success" element={<RegistrationSuccess />} />
              <Route path="/player" element={
                <PlayerProtectedRoute>
                  <PlayerDashboard />
                </PlayerProtectedRoute>
              } />

              {/* Rutas Multi-Tenant por Sala (https://bingolite.click/sala/:slug) */}
              <Route path="/sala/:slug" element={<Home />} />
              <Route path="/sala/:slug/register" element={<Register />} />
              <Route path="/sala/:slug/player" element={
                <PlayerProtectedRoute>
                  <PlayerDashboard />
                </PlayerProtectedRoute>
              } />
              <Route path="/sala/:slug/dynamics" element={<DynamicsInfo />} />
              <Route path="/sala/:slug/free-games" element={<FreeGames />} />
              <Route path="/sala/:slug/registration-success" element={<RegistrationSuccess />} />
              <Route path="/sala/:slug/admin/login" element={<AdminLogin />} />
              <Route path="/sala/:slug/admin" element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              
              {/* Redirigir cualquier otra ruta a Home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </React.Suspense>
            <BackgroundMusicPlayer />
          </div>
            </MaintenanceWrapper>
            </TenantProvider>
        </Router>
        )}
      </AuthProvider>
    </ErrorBoundary>
  );
}
