import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../utils/api';
import { getBingoChannel } from '../ably';
import { getProxyUrl } from './DJConsole';

import { useTenant } from '../TenantContext';

interface DJBgState {
  url: string | null;
  command: 'play' | 'pause' | 'stop';
  name: string;
  volume: number;
  timestamp: number;
}

export default function BackgroundMusicPlayer() {
  const { tenant } = useTenant();
  const [djState, setDjState] = useState<DJBgState>({
    url: null,
    command: 'stop',
    name: '',
    volume: 0.6,
    timestamp: 0
  });

  // Check stored user preference: default to muted/disabled if user previously deactivated it
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const savedMute = localStorage.getItem('bg_audio_muted');
      const savedDisabled = localStorage.getItem('bg_audio_disabled');
      return savedMute === 'true' || savedDisabled === 'true';
    } catch {
      return false;
    }
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const currentTenantId = tenant?.id || 'bingo-lite';

    // Initial fetch of current DJ background state for this specific room
    apiFetch(`/api/dj-bg-state?tenantId=${encodeURIComponent(currentTenantId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.url) {
          setDjState(data);
        } else {
          setDjState({ url: null, command: 'stop', name: '', volume: 0.6, timestamp: 0 });
          if (audioRef.current) {
            audioRef.current.pause();
          }
        }
      })
      .catch(err => console.warn('DJ audio state fetch notice:', err?.message || err));

    // Subscribe to real-time DJ background events exclusively on this room's channel
    const channel = getBingoChannel(currentTenantId);
    
    const onPlayDjBg = (message: any) => {
      const newState = message.data;
      if (!newState) return;
      setDjState(newState);

      // Check current user preference before playing
      const userIsMuted = localStorage.getItem('bg_audio_muted') === 'true' || localStorage.getItem('bg_audio_disabled') === 'true';

      if (newState.command === 'play' && newState.url && !userIsMuted) {
        if (audioRef.current) {
          const proxiedUrl = getProxyUrl(newState.url);
          if (audioRef.current.src !== proxiedUrl) {
            audioRef.current.src = proxiedUrl;
          }
          audioRef.current.volume = newState.volume !== undefined ? newState.volume : 0.6;
          audioRef.current.muted = false;
          audioRef.current.play().catch(e => console.log('Auto-play blocked, interaction needed:', e));
        }
      } else if (newState.command === 'pause' || newState.command === 'stop' || userIsMuted) {
        if (audioRef.current) {
          audioRef.current.pause();
          if (newState.command === 'stop') {
            audioRef.current.currentTime = 0;
          }
        }
      }
    };

    channel.subscribe('play_dj_bg', onPlayDjBg);
    return () => {
      channel.unsubscribe('play_dj_bg', onPlayDjBg);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [tenant?.id]);

  // Sync mute state with localStorage and audio element
  useEffect(() => {
    try {
      localStorage.setItem('bg_audio_muted', isMuted ? 'true' : 'false');
      localStorage.setItem('bg_audio_disabled', isMuted ? 'true' : 'false');
    } catch {}

    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.pause();
        audioRef.current.muted = true;
      } else {
        audioRef.current.muted = false;
        if (djState.command === 'play' && djState.url) {
          const proxiedUrl = getProxyUrl(djState.url);
          if (audioRef.current.src !== proxiedUrl) {
            audioRef.current.src = proxiedUrl;
          }
          audioRef.current.volume = djState.volume || 0.6;
          audioRef.current.play().catch(e => console.log('Interaction needed:', e));
        }
      }
    }
  }, [isMuted, djState.command, djState.url, djState.volume]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    
    try {
      localStorage.setItem('bg_audio_muted', nextMuted ? 'true' : 'false');
      localStorage.setItem('bg_audio_disabled', nextMuted ? 'true' : 'false');
    } catch {}

    if (audioRef.current) {
      if (nextMuted) {
        audioRef.current.pause();
        audioRef.current.muted = true;
        setIsPlaying(false);
      } else {
        audioRef.current.muted = false;
        if (djState.url) {
          const proxiedUrl = getProxyUrl(djState.url);
          if (audioRef.current.src !== proxiedUrl) {
            audioRef.current.src = proxiedUrl;
          }
          audioRef.current.volume = djState.volume || 0.6;
          audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(err => console.log('Playback interaction required:', err));
        }
      }
    }
  };

  // If no track url is configured or broadcast is stopped, don't show the widget
  if (!djState.url || djState.command === 'stop') return null;

  return (
    <>
      <audio
        ref={audioRef}
        src={djState.url ? getProxyUrl(djState.url) : ''}
        loop
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      <div className="fixed bottom-36 sm:bottom-40 right-6 flex flex-col items-end gap-2 z-[9999]">
        <AnimatePresence>
          {!isMuted && isPlaying && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white/95 backdrop-blur-md shadow-lg border border-slate-200 px-3 py-1.5 rounded-2xl flex items-center gap-2 mb-1"
            >
              <div className="flex gap-0.5 items-end h-3">
                {[1, 2, 3, 4].map(i => (
                  <motion.div
                    key={i}
                    animate={{ height: ['20%', '100%', '40%', '80%', '20%'] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    className="w-0.5 bg-emerald-500 rounded-full"
                  />
                ))}
              </div>
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight truncate max-w-[120px]">
                {djState.name || 'Ambiente DJ'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={toggleMute}
          className="bg-white/95 backdrop-blur-md shadow-xl border border-slate-200 p-3 rounded-full text-slate-800 flex items-center justify-center hover:bg-white transition-all relative"
          title={isMuted ? "Activar música de fondo" : "Desactivar música de fondo"}
        >
          <AnimatePresence mode="wait">
            {isMuted ? (
              <motion.div
                key="muted"
                initial={{ opacity: 0, rotate: -45 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 45 }}
              >
                <VolumeX size={22} className="text-red-500" />
              </motion.div>
            ) : (
              <motion.div
                key="unmuted"
                initial={{ opacity: 0, rotate: 45 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -45 }}
              >
                <Volume2 size={22} className="text-emerald-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
}
