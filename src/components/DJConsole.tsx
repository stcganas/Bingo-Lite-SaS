import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Volume2, Upload, RefreshCw, Music, Check, Edit2, 
  VolumeX, AlertTriangle, HelpCircle, Plus, Trash2, Pause, 
  Square, Music4, Sparkles, X, Star 
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { playSynthesizedDJEffect, playFxFromUrl } from '../utils/sound';

export const getProxyUrl = (url: string): string => {
  if (!url) return '';
  if (url.includes('mixkit.co')) return ''; // Force fallback
  if (
    url.startsWith('/') || 
    url.startsWith('blob:') || 
    url.startsWith('data:') || 
    url.startsWith('http://localhost') || 
    url.includes('/api/audio-proxy') || 
    url.includes('ais-dev-') ||
    url.includes('githubusercontent.com') ||
    url.includes('supabase.co') ||
    url.includes('wikimedia.org')
  ) {
    return url;
  }
  return `/api/audio-proxy?url=${encodeURIComponent(url)}`;
};

export interface DJSlot {
  id: string;
  label: string;
  description: string;
  name: string;
  url: string;
  color: string;
  emoji: string;
  fallbackUrl: string;
  isCustom?: boolean;
  selectedForGamePanel?: boolean;
}

export interface SFXPreset {
  name: string;
  url: string;
  description: string;
}

export interface BgPlaylistTrack {
  id: string;
  name: string;
  url: string;
}

export const DEFAULT_BG_PLAYLIST: BgPlaylistTrack[] = [
  { id: 'bg_1', name: 'Lounge (Por defecto)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'bg_2', name: 'Pista 2 (Vacía)', url: '' },
  { id: 'bg_3', name: 'Pista 3 (Vacía)', url: '' },
  { id: 'bg_4', name: 'Pista 4 (Vacía)', url: '' },
  { id: 'bg_5', name: 'Pista 5 (Vacía)', url: '' }
];

export const SFX_PRESETS_BY_CATEGORY: Record<string, SFXPreset[]> = {
  slot_welcome: [
    { name: 'Bienvenida Mágica 🎩', url: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav', description: 'Tono mágico ascendente, ideal para un inicio místico de sesión.' },
    { name: 'Apertura Cine 🎬', url: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav', description: 'Transición majestuosa y profunda para llamar la atención.' },
    { name: 'Arpa de Gala ✨', url: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav', description: 'Hermoso sonido de campanillas de agua celestial.' },
    { name: 'Impacto Cósmico ⚡', url: 'https://assets.mixkit.co/active_storage/sfx/2539/2539-84.wav', description: 'Sintetizador espacial vibrante de alta energía.' }
  ],
  slot_bingo: [
    { name: 'Celebración Fanfarria 🏆', url: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav', description: 'Efecto de triunfo majestuoso e inigualable de victoria.' },
    { name: 'Gong de Campeón 🥁', url: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav', description: 'Grito alegre de festejo con trompeta alegre.' },
    { name: 'Lluvia de Diamantes 💎', url: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav', description: 'Campanas brillantes estilo cascada triunfal.' },
    { name: 'Aplauso y Júbilo 🎉', url: 'https://assets.mixkit.co/active_storage/sfx/2813/2813-84.wav', description: 'Celebración festiva colectiva con vítores.' }
  ],
  slot_grito_bingo: [
    { name: '¡BINGO! Grito Pro ✨', url: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav', description: 'Grito de Bingo clásico para alertar victoria.' },
    { name: 'Gong Triunfal 🥁', url: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav', description: 'Gong con festejo y aplausos de victoria.' }
  ],
  slot_anuncios: [
    { name: 'Alerta de Anuncios 📢', url: 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav', description: 'Tono de campana de atención para anuncios importantes.' },
    { name: 'Campana de Entrada 🔔', url: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav', description: 'Sonido de campana nítida y agradable.' }
  ],
  slot_suspense: [
    { name: 'Suspenso / Alerta 🥁', url: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-84.wav', description: 'Tono de tensión electrónica sostenida por redoble.' },
    { name: 'Buzzer Latente 🚨', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav', description: 'Zumbido sintético que genera expectativa máxima.' },
    { name: 'Llamado de Misterio 🔔', url: 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav', description: 'Campana de alta frecuencia brillante de intriga.' }
  ],
  slot_airhorn: [
    { name: 'Bocina Pro DJ 📢', url: 'https://assets.mixkit.co/active_storage/sfx/2753/2753-84.wav', description: 'La icónica bocina de reggaeton estridente de fiesta.' },
    { name: 'Silbato de Presión 💨', url: 'https://assets.mixkit.co/active_storage/sfx/1271/1271-84.wav', description: 'Pito de carnaval penetrante de DJ.' },
    { name: 'Disparo de Energía ⚡', url: 'https://assets.mixkit.co/active_storage/sfx/2539/2539-84.wav', description: 'Sintetizador láser rápido de club en vivo.' }
  ],
  slot_applause: [
    { name: 'Público Eufórico 👏', url: 'https://assets.mixkit.co/active_storage/sfx/2813/2813-84.wav', description: 'Sonido de sala llena aplaudiendo de corazón.' },
    { name: 'Gritos con Silbidos 🙌', url: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav', description: 'Festejo animado con aplausos y silbidos.' },
    { name: 'Aplauso Ejecutivo 🤝', url: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav', description: 'Pequeño grupo celebrando formalmente.' }
  ],
  slot_bell: [
    { name: 'Atención Clientes 🔔', url: 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav', description: 'Campana impecable y nítida de hotel llamativa.' },
    { name: 'Tono de Aviso 📡', url: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-84.wav', description: 'Alerta cibernética moderna tipo ping de radar.' },
    { name: 'Campana Reluciente ✨', url: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav', description: 'Toque de inicio mágico dulce.' }
  ],
  slot_error: [
    { name: 'Zumbador de Falla ❌', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav', description: 'Zumbido de error rotundo para reclamos o faltas.' },
    { name: 'Error Triste 🤕', url: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-84.wav', description: 'Sonido melancólico de baja frecuencia.' },
    { name: 'Bocina Humorística 🤡', url: 'https://assets.mixkit.co/active_storage/sfx/2753/2753-84.wav', description: 'La bocina estridente como pitazo divertido.' }
  ],
  slot_coins: [
    { name: 'Cascada de Fichas 💰', url: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav', description: 'Monedas de oro tintineando continuamente por cobro.' },
    { name: 'Caja Registradora 💳', url: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav', description: 'Golpe metálico de compra o liquidación de sala.' },
    { name: 'Chime de Ganancia Mágica ✨', url: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav', description: 'Esfera mágica preciada súper nítida.' }
  ],
  slot_cheer: [
    { name: 'Grito ¡Wahoo! 🥳', url: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav', description: 'Grito de victoria espontánea súper alegre.' },
    { name: 'Campanas Estrellas ⭐', url: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav', description: 'Tintineo de magia cósmica espectacular.' },
    { name: 'Ovación Cerrada 🎭', url: 'https://assets.mixkit.co/active_storage/sfx/2813/2813-84.wav', description: 'Aplauso total de auditorio complacido.' }
  ],
  slot_laser: [
    { name: 'Rayo Cósmico ⚡', url: 'https://assets.mixkit.co/active_storage/sfx/2539/2539-84.wav', description: 'Zap futurista ideal para mezclas de DJ de reggaeton.' },
    { name: 'Cruce Eléctrico 🔌', url: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-84.wav', description: 'Señal de energía creciente cibernética.' },
    { name: 'Disparo de Sintetizador 🎚️', url: 'https://assets.mixkit.co/active_storage/sfx/2539/2539-84.wav', description: 'Efecto futurista acelerado de fiesta.' }
  ],
  slot_laugh: [
    { name: 'Risa de Multitud 😂', url: 'https://assets.mixkit.co/active_storage/sfx/2684/2684-84.wav', description: 'Risas alegres de público pasándola genial.' },
    { name: 'Aplauso con Sonrisa 🤠', url: 'https://assets.mixkit.co/active_storage/sfx/2813/2813-84.wav', description: 'Risas infantiles alegres con aplauso.' },
    { name: 'Humor Colectivo 🎤', url: 'https://assets.mixkit.co/active_storage/sfx/2684/2684-84.wav', description: 'Carcajada estruendosa muy contagiosa.' }
  ],
  slot_whistle: [
    { name: 'Pito Carnavalero 🎺', url: 'https://assets.mixkit.co/active_storage/sfx/1271/1271-84.wav', description: 'Pito festivo para bailar y saltar en carnaval.' },
    { name: 'Árbitro Directo 🏃', url: 'https://assets.mixkit.co/active_storage/sfx/1271/1271-84.wav', description: 'Dos pitazos rápidos de silbato deportivo.' },
    { name: 'Competición de Pito 🧭', url: 'https://assets.mixkit.co/active_storage/sfx/1271/1271-84.wav', description: 'Pitido agudo de alerta y partida.' }
  ]
};

export const DEFAULT_SLOTS: DJSlot[] = [
  {
    id: 'slot_welcome',
    label: 'Bienvenida de Inicio',
    description: 'Sonido majestuoso para dar la bienvenida antes de iniciar el juego.',
    name: 'Bienvenida Real',
    url: '',
    color: 'emerald',
    emoji: '🎬',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav'
  },
  {
    id: 'slot_bingo',
    label: '¡BINGO! Celebración',
    description: 'Música festiva o sonidos animados para celebrar al ganador de un Bingo.',
    name: 'Celebración Fanfarria',
    url: '',
    color: 'yellow',
    emoji: '🏆',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-84.wav'
  },
  {
    id: 'slot_grito_bingo',
    label: 'Grito de Bingo (Acción Rápida)',
    description: 'Efecto del Grito de Bingo que se activa también desde el Panel de Control.',
    name: 'Grito Bingo',
    url: '',
    color: 'orange',
    emoji: '🔥',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav'
  },
  {
    id: 'slot_anuncios',
    label: 'Anuncios y Alertas (Acción Rápida)',
    description: 'Efecto de atención para anuncios importantes activado desde el panel de control o DJ.',
    name: 'Anuncio Alerta',
    url: '',
    color: 'indigo',
    emoji: '📢',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav'
  },
  {
    id: 'slot_suspense',
    label: 'Redoble / Suspenso',
    description: 'Redoble de tambores o tono de tensión al sortear balotas decisivas.',
    name: 'Tensión Máxima',
    url: '',
    color: 'purple',
    emoji: '🥁',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-84.wav'
  },
  {
    id: 'slot_airhorn',
    label: 'Bocina de Aire DJ',
    description: 'La clásica bocina de aire para subir la fiesta y animar al público.',
    name: 'Bocina Reggaeton',
    url: '',
    color: 'pink',
    emoji: '📢',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2753/2753-84.wav'
  },
  {
    id: 'slot_applause',
    label: 'Aplausos y Vítores',
    description: 'Sonido de público aplaudiendo y celebrando para interactuar con los jugadores.',
    name: 'Aplausos del Público',
    url: '',
    color: 'blue',
    emoji: '👏',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2813/2813-84.wav'
  },
  {
    id: 'slot_bell',
    label: 'Campana de Alerta',
    description: 'Campana clara y llamánte para captar atención o anunciar cambios.',
    name: 'Atención Jugadores',
    url: '',
    color: 'orange',
    emoji: '🔔',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav'
  },
  {
    id: 'slot_error',
    label: 'Error / Falsa Alarma',
    description: 'Zumbido gracioso de error o reclamo falso cuando alguien se equivoca.',
    name: 'Buzzer de Falla',
    url: '',
    color: 'orange',
    emoji: '❌',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav'
  },
  {
    id: 'slot_coins',
    label: 'Premio o Dinero',
    description: 'Monedas de oro lloviendo y tintineo en caja registradora.',
    name: 'Lluvia de Monedas',
    url: '',
    color: 'emerald',
    emoji: '💰',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav'
  },
  {
    id: 'slot_cheer',
    label: 'Sorpresa / Alegría',
    description: 'Grito alegre de festejo grupal "¡Wahoo!" perfecto para momentos divertidos.',
    name: '¡Wahoo! Emoción',
    url: '',
    color: 'pink',
    emoji: '🥳',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-84.wav'
  },
  {
    id: 'slot_laser',
    label: 'Efecto Láser party',
    description: 'Rayo espacial retro de sintetizador, característico de mezclas electrónicas.',
    name: 'Láser Galáctico',
    url: '',
    color: 'purple',
    emoji: '⚡',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2539/2539-84.wav'
  },
  {
    id: 'slot_laugh',
    label: 'Risas del Público',
    description: 'Carcajadas contagiosas generadoras de buen humor en la sala.',
    name: 'Carcajadas Risas',
    url: '',
    color: 'yellow',
    emoji: '😂',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2684/2684-84.wav'
  },
  {
    id: 'slot_whistle',
    label: 'Pito de Carnaval',
    description: 'Silbato vibrante de fiesta y comparsa para levantar los ánimos.',
    name: 'Pito de Carnaval',
    url: '',
    color: 'blue',
    emoji: '🎺',
    fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/1271/1271-84.wav'
  }
];

export default function DJConsole() {
  const [slots, setSlots] = useState<DJSlot[]>(DEFAULT_SLOTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activePad, setActivePad] = useState<string | null>(null);
  const [expandedPresetsSlotId, setExpandedPresetsSlotId] = useState<string | null>(null);
  
  // Local preferences
  const [localPreview, setLocalPreview] = useState(true);
  const [localVolume, setLocalVolume] = useState(1.0);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  
  // Dynamic customized placement states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEmoji, setNewEmoji] = useState('🎵');
  const [newColor, setNewColor] = useState('blue');

  // Background DJ track states
  const [bgPlaylist, setBgPlaylist] = useState<BgPlaylistTrack[]>(DEFAULT_BG_PLAYLIST);
  const [bgSongUrl, setBgSongUrl] = useState('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3');
  const [bgSongName, setBgSongName] = useState('DJ Electronic Lounge Mix Loop');
  const [isBgPlaying, setIsBgPlaying] = useState(false);
  const [bgVolume, setBgVolume] = useState(0.5); // Global background volume multiplier
  
  // Custom prompt state for URLs
  const [linkPrompt, setLinkPrompt] = useState<{isOpen: boolean; target: string | null; inputUrl: string}>({
    isOpen: false,
    target: null,
    inputUrl: ''
  });

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const adminBgAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgVolumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load sound configurations
  const fetchDJSettings = async () => {
    try {
      const res = await apiFetch('/api/settings/dj-board');
      if (res.ok) {
        const savedSlots = await res.json();
        if (savedSlots && typeof savedSlots === 'object' && Object.keys(savedSlots).length > 0) {
          // Re-constitute default slots with saved values, preserving selected fallbacks
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

          // Fetch user-defined ones
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

          setSlots([...standardWithSaved, ...customWithSaved]);
        }
      }

      // Also get DJ background song configuration if saved previously
      const bgRes = await apiFetch('/api/settings/dj-bg');
      if (bgRes.ok) {
        const bgData = await bgRes.json();
        if (bgData && bgData.playlist && Array.isArray(bgData.playlist) && bgData.playlist.length === 5) {
          setBgPlaylist(bgData.playlist);
        }
        if (bgData && bgData.url) { 
          setBgSongUrl(bgData.url);
          if (bgData.name) setBgSongName(bgData.name);
        } else if (bgData && bgData.playlist) {
          // fallback to first item
          setBgSongUrl(bgData.playlist[0].url);
          setBgSongName(bgData.playlist[0].name);
        }
      }
    } catch (err) {
      console.error('Error loading DJ Settings:', err);
      toast.error('Error al cargar la consola DJ');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDJSettings();

    return () => {
      // Cleanup audio context on unmount to prevent leaks
      if (adminBgAudioRef.current) {
        try {
          adminBgAudioRef.current.pause();
          adminBgAudioRef.current = null;
        } catch (_) {}
      }
      if (activeAudioRef.current) {
        try {
          activeAudioRef.current.pause();
          activeAudioRef.current = null;
        } catch (_) {}
      }
    };
  }, []);

  // Sync local volume and preview preferences for background DJ loop
  useEffect(() => {
    if (adminBgAudioRef.current) {
      adminBgAudioRef.current.volume = localPreview ? (localVolume * bgVolume) : 0;
    }
  }, [localVolume, bgVolume, localPreview]);

  // Sync state & source changes to local DJ background player
  useEffect(() => {
    const proxiedUrl = getProxyUrl(bgSongUrl);
    if (!adminBgAudioRef.current) {
      adminBgAudioRef.current = new Audio(proxiedUrl);
      adminBgAudioRef.current.loop = true;
    } else {
      // Check if src is already proxied or matching
      const currentSrc = adminBgAudioRef.current.src;
      if (currentSrc !== proxiedUrl && !currentSrc.endsWith(encodeURIComponent(proxiedUrl)) && !currentSrc.endsWith(proxiedUrl)) {
        adminBgAudioRef.current.src = proxiedUrl;
      }
    }

    if (isBgPlaying) {
      adminBgAudioRef.current.volume = localPreview ? (localVolume * bgVolume) : 0;
      adminBgAudioRef.current.play().catch(e => console.warn('Admin local background loop deferred:', e));
    } else {
      adminBgAudioRef.current.pause();
    }
  }, [isBgPlaying, bgSongUrl, localPreview]);

  // Save changes to database
  const saveSlotsConfig = async (currentSlots: DJSlot[]) => {
    try {
      setIsSaving(true);
      const payload: Record<string, any> = {};
      currentSlots.forEach(s => {
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

      const res = await apiFetch('/api/admin/settings/dj-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: payload })
      });

      if (!res.ok) {
        throw new Error('No se pudo guardar la configuración');
      }

      window.dispatchEvent(new CustomEvent('dj-slots-updated', { detail: currentSlots }));
    } catch (err) {
      console.error('Error saving DJ slots:', err);
      toast.error('No se pudo sincronizar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  // Broadcast & stream standard soundboard effect (plays in parallel with background track)
  const handleTriggerSound = async (slot: DJSlot) => {
    const finalUrl = slot.url || slot.fallbackUrl;
    
    // Play Locally if checked
    if (localPreview) {
      try {
        if (!finalUrl || finalUrl.includes('mixkit.co')) {
          playSynthesizedDJEffect(slot.id || slot.name, localVolume);
        } else {
          // Use playFxFromUrl which pipes through master gain for real-time volume response
          playFxFromUrl(getProxyUrl(finalUrl), localVolume);
        }
      } catch (audioErr) {
        console.error('Local SFX audio initialization failed, playing synthesized:', audioErr);
        playSynthesizedDJEffect(slot.id || slot.name, localVolume);
      }
    }

    // Visual animation indicator on Pad
    setActivePad(slot.id);
    setTimeout(() => {
      setActivePad(null);
    }, 1500);

    // Broadcast globally via Ably Realtime
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
        toast(`¡Efecto "${slot.name}" disparado en vivo!`, { icon: '🔥' });
      } else {
        const errData = await res.json();
        toast.error(`Error de transmisión: ${errData.error || 'falla del servidor'}`);
      }
    } catch (err) {
      console.error('Error triggering DJ sound:', err);
      toast.error('Error de red al transmitir sonido');
    }
  };

  // Broadcast & stream dynamic Background DJ mix loop
  const handleTriggerBgCommand = async (command: 'play' | 'pause' | 'stop') => {
    if (command === 'play') {
      setIsBgPlaying(true);
    } else if (command === 'pause') {
      setIsBgPlaying(false);
    } else {
      setIsBgPlaying(false);
      if (adminBgAudioRef.current) {
        adminBgAudioRef.current.currentTime = 0;
      }
    }

    try {
      const res = await apiFetch('/api/admin/trigger-dj-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: bgSongUrl,
          command,
          name: bgSongName,
          volume: bgVolume
        })
      });

      if (res.ok) {
        if (command === 'play') {
          toast(`¡Música de fondo "${bgSongName}" sonando para todos!`, { icon: '🎵' });
        } else if (command === 'pause') {
          toast(`Música de fondo pausada`, { icon: '⏸️' });
        } else {
          toast(`Música de fondo detenida`, { icon: '⏹️' });
        }
      } else {
        const err = await res.json();
        toast.error(`Error al transmitir fondo: ${err.error || 'falla'}`);
      }
    } catch (err) {
      console.error('Error broadcasting DJ background mix:', err);
      toast.error('Falla de red al controlar música de fondo');
    }
  };



  const handleDJSlotUrlLink = (slotId: string) => {
    setLinkPrompt({ isOpen: true, target: slotId, inputUrl: '' });
  };

  const submitLinkPrompt = async () => {
    const { target, inputUrl } = linkPrompt;
    if (!target) return;
    
    setLinkPrompt({ isOpen: false, target: null, inputUrl: '' });
    
    const url = inputUrl.trim();
    if (!url.startsWith('http')) {
      if (url.length > 0) toast.error('URL inválida. Debe comenzar con http:// o https://');
      return;
    }

    if (target.startsWith('bg_')) {
      let name = 'Pista personalizada';
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/');
        const last = parts[parts.length - 1];
        if (last && last.length > 3) {
           name = decodeURIComponent(last).replace(/\.[^/.]+$/, ""); 
        }
      } catch (e) {}
      
      try {
        const updatedPlaylist = bgPlaylist.map(track => {
          if (track.id === target) {
            return { ...track, url, name };
          }
          return track;
        });
        
        setBgPlaylist(updatedPlaylist);
        // Also update playing song if the updated one is currently selected
        if (bgSongUrl === bgPlaylist.find(t => t.id === target)?.url || !bgSongUrl) {
           setBgSongUrl(url);
           setBgSongName(name);
        }

        await apiFetch('/api/admin/settings/dj-bg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
             playlist: updatedPlaylist,
             // only update global if it was the currently bound one or none set
             ...(bgSongUrl === bgPlaylist.find(t => t.id === target)?.url || !bgSongUrl ? {url, name} : {})
          })
        });
        toast.success('¡Enlace guardado en la lista de fondo!');
      } catch (e) {
        toast.error('Error al guardar lista de fondo');
      }
    } else {
      try {
        const updatedSlots = slots.map(s => {
          if (s.id === target) {
            return { ...s, url: url };
          }
          return s;
        });

        setSlots(updatedSlots);
        await saveSlotsConfig(updatedSlots);
        toast.success('¡Enlace configurado con éxito para este botón!');
      } catch (e) {
        toast.error('Error al guardar configuración');
      }
    }
  };

  // Dynamic sound effects insertion handler
  const handleAddSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newLabel.trim()) {
      toast.error('El nombre y la etiqueta son obligatorios');
      return;
    }

    const newSlot: DJSlot = {
      id: `slot_custom_${Date.now()}`,
      label: newLabel.trim(),
      description: newDesc.trim() || 'Efecto de sonido de DJ personalizado',
      name: newName.trim(),
      url: '', // Empty initially, prompts the user to upload a unique effect
      color: newColor,
      emoji: newEmoji || '🔊',
      fallbackUrl: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav',
      isCustom: true
    };

    const updated = [...slots, newSlot];
    setSlots(updated);
    await saveSlotsConfig(updated);

    // Reset fields
    setNewLabel('');
    setNewName('');
    setNewDesc('');
    setNewEmoji('🎵');
    setNewColor('blue');
    setShowAddForm(false);
    toast.success('¡Efecto creado! Ahora ya puedes cargar un MP3 o WAV personalizado para este Pad.');
  };

  // Delete dynamic custom slot
  const handleDeleteSlot = async (slotId: string) => {
    if (!window.confirm('¿Deseas eliminar permanentemente este efecto personalizado de la consola?')) {
      return;
    }

    const updated = slots.filter(s => s.id !== slotId);
    setSlots(updated);
    await saveSlotsConfig(updated);
    toast.success('Efecto eliminado con éxito');
  };

  // Reset a slot value back to fallback standard URL
  const handleResetSlot = async (slotId: string) => {
    const updatedSlots = slots.map(s => {
      if (s.id === slotId) {
        return { ...s, url: '' };
      }
      return s;
    });
    setSlots(updatedSlots);
    await saveSlotsConfig(updatedSlots);
    toast.success('Efecto devuelto a su audio original predeterminado');
  };

  // Inline renaming handlers
  const startEditing = (slot: DJSlot) => {
    setEditingSlotId(slot.id);
    setTempName(slot.name);
  };

  const saveNameEdit = async (slotId: string) => {
    if (!tempName.trim()) {
      toast.error('El nombre no puede estar vacío');
      return;
    }
    const updatedSlots = slots.map(s => {
      if (s.id === slotId) {
        return { ...s, name: tempName.trim() };
      }
      return s;
    });
    setSlots(updatedSlots);
    setEditingSlotId(null);
    await saveSlotsConfig(updatedSlots);
    toast.success('Nombre editado guardado');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-3xl min-h-[350px]">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400 font-bold">Iniciando Consola Pro DJ de Bingo...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl text-white space-y-8">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎧</span>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Consola DJ Estéreo de Bingo
                <span className="inline-block px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-xs font-semibold rounded-full border border-indigo-500/20 uppercase tracking-widest animate-pulse">
                  Módulo En Vivo
                </span>
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Lanza tracks de fondo y efectos especiales en tiempo real simultáneamente en los dispositivos de tus jugadores sin cortes ni conflictos.
              </p>
            </div>
          </div>
        </div>
        
        {/* MIXER AUDITOR CONTROLS */}
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input 
                type="checkbox" 
                checked={localPreview}
                onChange={() => setLocalPreview(!localPreview)}
                className="sr-only" 
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${localPreview ? 'bg-indigo-600' : 'bg-slate-700'}`} />
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${localPreview ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-xs font-bold text-slate-300 group-hover:text-white transition">
              Escucha Local (Admin)
            </span>
          </label>

          <div className="flex items-center gap-3">
            {localVolume === 0 ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-indigo-400" />}
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase">Volumen Base</span>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05"
                value={localVolume} 
                onChange={(e) => setLocalVolume(Number(e.target.value))} 
                className="w-24 accent-indigo-500 h-1 bg-slate-700 rounded-lg cursor-pointer" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* TRACK DE FONDO / CANCION DE FONDO DJ (MIX PANEL) */}
      <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl border border-indigo-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Music4 size={140} className="text-white" />
        </div>
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-black tracking-widest text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 animate-spin" /> CANCIÓN DE FONDO EN VIVO (DJ MIX BACKDROP)
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-2xl">🎵</span>
              <div>
                <h4 className="text-lg font-black text-white">{bgSongName}</h4>
                <p className="text-xs text-indigo-200 opacity-80">
                  Sonará continuamente en bucle en los celulares de los jugadores activos. ¡Tus efectos se mezclarán encima de ella!
                </p>
              </div>
            </div>
          </div>

          {/* BACKGROUND MIXER CONTROLS & PLAYLIST */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4 bg-slate-950/60 p-4 rounded-xl border border-indigo-950">
              {/* Play, Pause, Stop Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTriggerBgCommand('play')}
                  title="Reproducir música de fondo para todos"
                  className={`p-3 rounded-lg transition-all ${
                    isBgPlaying 
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
                <button
                  onClick={() => handleTriggerBgCommand('pause')}
                  title="Pausar música de fondo para todos"
                  className={`p-3 rounded-lg text-slate-300 transition-all ${
                    !isBgPlaying 
                      ? 'bg-amber-600/30 text-amber-400' 
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <Pause className="w-4 h-4 fill-current" />
                </button>
                <button
                  onClick={() => handleTriggerBgCommand('stop')}
                  title="Detener música de fondo por completo"
                  className="p-3 bg-slate-800 hover:bg-slate-700 hover:text-red-500 rounded-lg text-slate-300 transition-all"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              </div>

              {/* Background Volume Transmitted */}
              <div className="flex flex-col px-1">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Mute / Vol. Fondo Transmitido</span>
                <div className="flex items-center gap-2 mt-1">
                  <Music4 className="w-3.5 h-3.5 text-indigo-400" />
                  <input 
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={bgVolume}
                    onChange={(e) => {
                      const newVol = Number(e.target.value);
                      setBgVolume(newVol);
                      // Broadcast volume adjustment live if playing
                      if (isBgPlaying) {
                        const now = Date.now();
                        const lastFired = (window as any).lastBgVolumeBroadcast || 0;

                        if (bgVolumeTimeoutRef.current) {
                          clearTimeout(bgVolumeTimeoutRef.current);
                        }

                        const broadcast = () => {
                          (window as any).lastBgVolumeBroadcast = Date.now();
                          apiFetch('/api/admin/trigger-dj-bg', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: bgSongUrl, command: 'volume_update', name: bgSongName, volume: newVol })
                          }).catch(() => {});
                        };

                        if (now - lastFired > 100) {
                          broadcast();
                        } else {
                          bgVolumeTimeoutRef.current = setTimeout(broadcast, 100);
                        }
                      }
                    }}
                    className="w-24 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[10px] font-mono font-bold text-slate-300">{Math.round(bgVolume * 100)}%</span>
                </div>
              </div>
            </div>

            {/* BG Playlist */}
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2 block">
                Lista de Reproducción (Fondo)
              </span>
              <div className="flex flex-col gap-2">
                {bgPlaylist.map((track) => (
                  <div 
                    key={track.id} 
                    className={`flex items-center justify-between p-2 rounded-lg border transition ${bgSongUrl === track.url && track.url ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-slate-900/50 border-slate-800'}`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <button 
                        onClick={() => {
                          if (!track.url) return;
                          setBgSongUrl(track.url);
                          setBgSongName(track.name);
                        }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${bgSongUrl === track.url && track.url ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                        disabled={!track.url}
                      >
                        <Play size={10} className="ml-0.5" />
                      </button>
                      <span className={`text-xs font-medium truncate ${track.url ? 'text-slate-200' : 'text-slate-500'}`}>
                        {track.name}
                      </span>
                    </div>
                    <div className="flex items-center pl-2">
                      <button
                        onClick={() => {
                          setLinkPrompt({ isOpen: true, target: track.id, inputUrl: '' });
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold rounded text-slate-300 flex items-center gap-1 transition"
                        title="Enlazar nueva URL para esta pista"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Enlazar URL</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK INSTRUCTIONS BANNER */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-extrabold text-white">Guía de Mezcla Profesional:</span> La música de fondo se reproduce de manera <span className="font-bold text-indigo-300">continua en loop</span>. 
          Los efectos de sonido de la cuadricula inferior son <span className="font-bold text-indigo-300">instantáneos</span> y están optimizados para sonar en paralelo (por encima de la música de fondo sin apagarla). Puedes crear tantos efectos personalizados como quieras desde el panel "+ Añadir Efecto Extra".
        </div>
      </div>

      {/* DYNAMICS ADD COMPONENT DRAWER / FORM */}
      <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs font-black uppercase text-indigo-400 tracking-[0.2em] flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> BOTONES DE EFECTOS DE DJ
            </h3>
            {slots.some(s => s.selectedForGamePanel) && (
              <span className="text-[10px] bg-amber-400 text-amber-950 font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <Star size={10} className="fill-amber-950" />
                {slots.filter(s => s.selectedForGamePanel).length} en Panel del Juego
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-slate-300 hover:text-black transition-colors rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer"
          >
            {showAddForm ? <X size={14} /> : <Plus size={14} />}
            <span>{showAddForm ? 'Cancelar' : 'Añadir Efecto Extra (+)'}</span>
          </button>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleAddSlotSubmit}
              className="mt-4 p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">
                    Etiqueta Corta (Ej: Redoble, Risas, Fiesta)
                  </label>
                  <input 
                    type="text"
                    required
                    maxLength={30}
                    placeholder="Ej: Tono Alerta"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">
                    Nombre del Sonido (Botón)
                  </label>
                  <input 
                    type="text"
                    required
                    maxLength={35}
                    placeholder="Ej: Silbato de Árbitro"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">
                      Emoji
                    </label>
                    <input 
                      type="text"
                      maxLength={4}
                      placeholder="🔊"
                      value={newEmoji}
                      onChange={(e) => setNewEmoji(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-center text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">
                      Familia Color
                    </label>
                    <select
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="blue">Azul Eléctrico</option>
                      <option value="emerald">Verde Esmeralda</option>
                      <option value="yellow">Amarillo Fanfarria</option>
                      <option value="purple">Púrpura Suspenso</option>
                      <option value="pink">Rosa Neón</option>
                      <option value="orange">Naranja Alerta</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">
                  Descripción Corta
                </label>
                <input 
                  type="text"
                  maxLength={100}
                  placeholder="Detalles sobre cuándo disparar este audio..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 font-bold text-white rounded-lg text-xs transition"
                >
                  {isSaving ? 'Guardando...' : 'Crear Botón de Efecto'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      {/* DRUM PAD GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {slots.map((slot) => {
          const isUploaded = !!slot.url;
          const isCurrentActive = activePad === slot.id;
          
          let colorClass = 'border-slate-800 bg-slate-900 hover:bg-slate-900/80 hover:border-slate-700';
          let glowClass = '';
          
          if (isCurrentActive) {
            if (slot.color === 'emerald') { colorClass = 'border-emerald-500 bg-emerald-950/80'; glowClass = 'shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse'; }
            else if (slot.color === 'yellow') { colorClass = 'border-yellow-500 bg-yellow-950/80'; glowClass = 'shadow-[0_0_20px_rgba(234,179,8,0.3)] animate-pulse'; }
            else if (slot.color === 'purple') { colorClass = 'border-purple-500 bg-purple-950/80'; glowClass = 'shadow-[0_0_20px_rgba(168,85,247,0.3)] animate-pulse'; }
            else if (slot.color === 'pink') { colorClass = 'border-pink-500 bg-pink-950/80'; glowClass = 'shadow-[0_0_20px_rgba(236,72,153,0.3)] animate-pulse'; }
            else if (slot.color === 'blue') { colorClass = 'border-blue-500 bg-blue-950/80'; glowClass = 'shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-pulse'; }
            else { colorClass = 'border-orange-500 bg-orange-950/80'; glowClass = 'shadow-[0_0_20px_rgba(249,115,22,0.3)] animate-pulse'; }
          }
          
          return (
            <div 
              key={slot.id} 
              id={`dj-pad-${slot.id}`}
              className={`p-5 rounded-2xl border-2 transition-all duration-300 flex flex-col justify-between ${colorClass} ${glowClass} relative group/pad`}
            >
              {/* Delete button for dynamically added slots */}
              {slot.isCustom && (
                <button
                  onClick={() => handleDeleteSlot(slot.id)}
                  className="absolute -top-2.5 -right-2 p-1.5 bg-red-600/95 hover:bg-red-500 text-white rounded-full transition shadow-lg opacity-0 group-hover/pad:opacity-100 z-10 cursor-pointer"
                  title="Eliminar este efecto"
                >
                  <Trash2 size={11} className="stroke-[2.5]" />
                </button>
              )}

              {/* Slot Description and Settings */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-1.5 max-w-[80%]">
                  <span className="text-xl shrink-0">{slot.emoji}</span>
                  <div className="min-w-0">
                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 block truncate">
                      {slot.label}
                    </span>
                    
                    {/* Inline sound name editor */}
                    {editingSlotId === slot.id ? (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500 max-w-[110px]"
                          placeholder="Nombre"
                        />
                        <button 
                          onClick={() => saveNameEdit(slot.id)}
                          className="p-1 bg-green-600 hover:bg-green-500 text-white rounded transition"
                          title="Guardar"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-0.5 group/title">
                        <span className="text-sm font-black text-slate-200 truncate">
                          {slot.name}
                        </span>
                        <button 
                          onClick={() => startEditing(slot)}
                          className="opacity-0 group-hover/title:opacity-100 p-0.5 text-slate-400 hover:text-slate-200 transition"
                          title="Renombrar"
                        >
                          <Edit2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Upload Action / Reset */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isUploaded && (
                    <button 
                      onClick={() => handleResetSlot(slot.id)}
                      className="text-[9px] font-bold text-slate-500 hover:text-red-400 underline transition cursor-pointer"
                      title={slot.isCustom ? "Eliminar MP3 personalizado" : "Volver a audio original"}
                    >
                      {slot.isCustom ? 'Limpiar' : 'Original'}
                    </button>
                  )}
                  
                  <button 
                    onClick={() => handleDJSlotUrlLink(slot.id)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700"
                    title="Enlazar URL (Opc: GitHub, CDN)"
                  >
                    <Plus size={12} />
                  </button>

                </div>
              </div>

              {/* Status or Details text */}
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-4">
                {slot.description}
              </p>

              {/* Presets and Library variants selector */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setExpandedPresetsSlotId(expandedPresetsSlotId === slot.id ? null : slot.id)}
                  className="w-full px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-bold rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition border border-slate-700/60"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  <span>{expandedPresetsSlotId === slot.id ? 'Ocultar Variantes' : 'Biblioteca de Variantes ⚡'}</span>
                </button>
                
                <AnimatePresence>
                  {expandedPresetsSlotId === slot.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-2 p-2.5 bg-slate-950/95 border border-slate-800 rounded-xl space-y-2 text-left overflow-hidden z-10"
                    >
                      <div className="flex items-center justify-between px-1 border-b border-slate-800/80 pb-1.5">
                        <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">
                          Variaciones de Sonido:
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const defaultSlot = DEFAULT_SLOTS.find(df => df.id === slot.id);
                            if (defaultSlot) {
                              const updatedSlots = slots.map(s => {
                                if (s.id === slot.id) {
                                  return {
                                    ...s,
                                    name: defaultSlot.name,
                                    fallbackUrl: defaultSlot.fallbackUrl
                                  };
                                }
                                return s;
                              });
                              setSlots(updatedSlots);
                              await saveSlotsConfig(updatedSlots);
                              toast.success('Restaurado a variante por defecto original', { icon: '🔄' });
                            } else {
                              toast.error('Este sonido no posee variante por defecto');
                            }
                            setExpandedPresetsSlotId(null);
                          }}
                          className="text-[9px] font-bold text-slate-400 hover:text-white underline"
                        >
                          Predeterminado
                        </button>
                      </div>

                      <div className="max-h-44 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 pr-1 select-none">
                        {(SFX_PRESETS_BY_CATEGORY[slot.id] || Object.values(SFX_PRESETS_BY_CATEGORY).flat()).map((preset, idx) => {
                          const isCurrentActivePreset = slot.fallbackUrl === preset.url;
                          return (
                            <div 
                              key={idx}
                              className={`p-1.5 rounded-lg flex items-center justify-between text-[11px] transition ${
                                isCurrentActivePreset 
                                  ? 'bg-indigo-950/50 border border-indigo-700/50 text-indigo-200 shadow-sm' 
                                  : 'bg-slate-900 hover:bg-slate-900/80 border border-transparent text-slate-300'
                              }`}
                            >
                              <div className="min-w-0 pr-1.5 flex-1">
                                <span className="font-extrabold text-slate-200 block truncate">{preset.name}</span>
                                <span className="text-[9px] text-slate-400 block line-clamp-1">{preset.description}</span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Preview locally without broadcasting */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (activeAudioRef.current) {
                                      activeAudioRef.current.pause();
                                    }
                                    if (!preset.url || preset.url.includes('mixkit.co')) {
                                      playSynthesizedDJEffect(preset.name, localVolume);
                                    } else {
                                      const aud = new Audio(getProxyUrl(preset.url));
                                      aud.volume = localVolume;
                                      aud.onerror = () => {
                                        playSynthesizedDJEffect(preset.name, localVolume);
                                      };
                                      aud.play().catch(err => {
                                        console.warn('Local tasting blocked, playing synthesized fallback:', err);
                                        playSynthesizedDJEffect(preset.name, localVolume);
                                      });
                                      activeAudioRef.current = aud;
                                    }
                                  }}
                                  className="p-1 bg-slate-800 hover:bg-indigo-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                                  title="Pre-escuchar sonido local"
                                >
                                  <Play size={9} className="fill-current" />
                                </button>

                                {/* Select preset & save */}
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const cleanName = preset.name.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "").trim();
                                    const updatedSlots = slots.map(s => {
                                      if (s.id === slot.id) {
                                        return { 
                                          ...s, 
                                          fallbackUrl: preset.url,
                                          name: cleanName
                                        };
                                      }
                                      return s;
                                    });
                                    setSlots(updatedSlots);
                                    await saveSlotsConfig(updatedSlots);
                                    setExpandedPresetsSlotId(null);
                                    toast.success(`Variante "${cleanName}" asignada con éxito`, { icon: '🎧' });
                                  }}
                                  className={`p-1 rounded transition cursor-pointer ${
                                    isCurrentActivePreset
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-indigo-600 hover:bg-indigo-500 text-indigo-100'
                                  }`}
                                  title="Asignar esta variante"
                                >
                                  <Check size={9} className="stroke-[3]" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Pad Action: PLAY LIVE */}
              <button 
                onClick={() => handleTriggerSound(slot)}
                disabled={slot.isCustom && !slot.url}
                className={`w-full py-4 rounded-xl font-black text-xs tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 border-b-4 select-none ${
                  slot.isCustom && !slot.url
                    ? 'bg-slate-800/40 border-slate-900 text-slate-600 cursor-not-allowed opacity-50'
                    : isCurrentActive 
                      ? 'bg-gradient-to-r from-slate-100 to-white text-slate-950 border-white/50 active:scale-95 shadow-lg shadow-white/10' 
                      : slot.color === 'emerald'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-800 shadow-[0_4px_12px_rgba(16,185,129,0.15)] active:scale-95'
                        : slot.color === 'yellow'
                          ? 'bg-yellow-600 hover:bg-yellow-500 text-white border-yellow-800 shadow-[0_4px_12px_rgba(234,179,8,0.15)] active:scale-95'
                          : slot.color === 'purple'
                            ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-800 shadow-[0_4px_12px_rgba(168,85,247,0.15)] active:scale-95'
                            : slot.color === 'pink'
                              ? 'bg-pink-600 hover:bg-pink-500 text-white border-pink-800 shadow-[0_4px_12px_rgba(236,72,153,0.15)] active:scale-95'
                              : slot.color === 'blue'
                                ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-800 shadow-[0_4px_12px_rgba(59,130,246,0.15)] active:scale-95'
                                : 'bg-orange-600 hover:bg-orange-500 text-white border-orange-800 shadow-[0_4px_12px_rgba(249,115,22,0.15)] active:scale-95'
                }`}
              >
                <Play size={12} className={isCurrentActive ? 'fill-slate-950 animate-bounce' : 'fill-white'} />
                {isCurrentActive ? '¡Sonando Live!' : slot.isCustom && !slot.url ? 'Falta Subir Audio' : 'Tocar en Vivo'}
              </button>

              {/* Toggle in Game Control Panel */}
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const updatedSlots = slots.map(s => {
                    if (s.id === slot.id) {
                      return { ...s, selectedForGamePanel: !s.selectedForGamePanel };
                    }
                    return s;
                  });
                  setSlots(updatedSlots);
                  await saveSlotsConfig(updatedSlots);
                  if (!slot.selectedForGamePanel) {
                    toast.success(`"${slot.name}" añadido al Panel de Control`, { icon: '⭐' });
                  } else {
                    toast(`"${slot.name}" quitado del Panel de Control`, { icon: '➖' });
                  }
                }}
                className={`w-full mt-2 py-2 px-3 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 border cursor-pointer select-none active:scale-95 ${
                  slot.selectedForGamePanel
                    ? 'bg-amber-400 text-amber-950 border-amber-300 shadow-md shadow-amber-400/20'
                    : 'bg-slate-800/90 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800'
                }`}
                title={slot.selectedForGamePanel ? "Activo en el Panel de Control del juego. Clic para quitar." : "Mostrar botón rápido en el Panel de Control del juego"}
              >
                <Star size={12} className={slot.selectedForGamePanel ? 'fill-amber-950 text-amber-950' : 'text-slate-400'} />
                <span>{slot.selectedForGamePanel ? '⭐ En Panel del Juego' : '+ Agregar a Panel del Juego'}</span>
              </button>

              {/* Display source info */}
              <div className="mt-2.5 flex items-center justify-between text-[8px] tracking-wider text-slate-500 uppercase font-bold">
                <span className="flex items-center gap-1">
                  <Music size={8} /> Fuente: {isUploaded ? 'Personalizado MP3' : slot.isCustom ? 'Espera de Audio' : 'Predeterminado'}
                </span>
                {isUploaded && (
                  <span className="text-green-400 flex items-center gap-0.5 font-black uppercase">
                    <Check size={8} className="stroke-[3]" /> Listo
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER EXTRA CONTROLS */}
      <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-500/80" />
          <span>Atención: Modula tus sonidos de efectos y el fondo para que los anuncios de balotas por voz sigan entendiéndose bien.</span>
        </div>
        
        <div className="text-slate-400 text-xs font-semibold">
          Control De Sonidos Proporcionado por <span className="text-indigo-400 font-extrabold text-[13px] tracking-wide">Bingo DJ Deck Pro v2</span>
        </div>
      </div>

      {/* LINK PROMPT MODAL */}
      <AnimatePresence>
        {linkPrompt.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative"
            >
              <button
                onClick={() => setLinkPrompt({ ...linkPrompt, isOpen: false })}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white leading-tight">Enlazar Pista URL</h3>
                  <p className="text-xs text-slate-400">Introduce el enlace directo al archivo de audio (MP3 o WAV).</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-widest mb-1.5 ml-1">
                    URL de Audio (HTTP/HTTPS)
                  </label>
                  <input
                    type="url"
                    value={linkPrompt.inputUrl}
                    onChange={e => setLinkPrompt({ ...linkPrompt, inputUrl: e.target.value })}
                    placeholder="https://ejemplo.com/audio.mp3"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition text-sm"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500 mt-2 px-1 leading-relaxed">
                    Asegúrate de que sea un enlace <strong>directo</strong>. No funcionarán enlaces a páginas reproductoras de YouTube, Spotify o Soundcloud. Usa enlaces directos a archivos que terminen en .mp3 (como en GitHub Raw o Supabase Storage).
                  </p>
                </div>
                
                <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => setLinkPrompt({ ...linkPrompt, isOpen: false })}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submitLinkPrompt}
                    disabled={!linkPrompt.inputUrl.trim()}
                    className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 transition disabled:opacity-50 flex items-center gap-2 shadow-[0_0_20px_rgba(79,70,229,0.3)] shadow-indigo-500/50"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    Aplicar Enlace
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
