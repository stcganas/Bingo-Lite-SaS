import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { Play, Pause, SkipForward, SkipBack, Volume2, Settings, Info, Square, Save, FolderOpen, Radio, HardDrive } from 'lucide-react';
import { apiFetch } from '../utils/api';
import toast from 'react-hot-toast';

const DEFAULT_TRACKS = [
  { id: 1, name: '8-bit Dungeon', duration: '03:45', url: 'https://upload.wikimedia.org/wikipedia/commons/4/41/Kevin_MacLeod_-_8bit_Dungeon_Level.ogg', activeColor: 'text-purple-400' },
  { id: 2, name: 'Electrodoodle', duration: '04:12', url: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Kevin_MacLeod_-_Electrodoodle.ogg', activeColor: 'text-blue-400' },
  { id: 3, name: 'Cipher', duration: '03:28', url: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Kevin_MacLeod_-_Cipher.ogg', activeColor: 'text-emerald-400' },
  { id: 4, name: 'RetroFuture', duration: '02:58', url: 'https://upload.wikimedia.org/wikipedia/commons/2/25/Kevin_MacLeod_-_RetroFuture_Clean.ogg', activeColor: 'text-orange-400' },
  { id: 5, name: 'The Complex', duration: '04:01', url: 'https://upload.wikimedia.org/wikipedia/commons/d/da/Kevin_MacLeod_-_The_Complex.ogg', activeColor: 'text-pink-400' },
];

const DEFAULT_EFFECTS = [
  { id: 1, name: 'Impacto', color: 'text-purple-400', borderColor: 'border-purple-500/20', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]', icon: '✨' },
  { id: 2, name: 'Risada', color: 'text-cyan-400', borderColor: 'border-cyan-500/20', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.15)]', icon: '🌀' },
  { id: 3, name: 'Energía', color: 'text-yellow-400', borderColor: 'border-yellow-500/20', glow: 'shadow-[0_0_15px_rgba(250,204,21,0.15)]', icon: '⚡' },
  { id: 4, name: 'Campana', color: 'text-orange-400', borderColor: 'border-orange-500/20', glow: 'shadow-[0_0_15px_rgba(251,146,60,0.15)]', icon: '🔔' },
  { id: 5, name: 'Bocina', color: 'text-amber-500', borderColor: 'border-amber-500/20', glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]', icon: '🎺' },
  { id: 6, name: 'Aplauso', color: 'text-orange-500', borderColor: 'border-orange-600/20', glow: 'shadow-[0_0_15px_rgba(234,88,12,0.15)]', icon: '👏' },
  { id: 7, name: 'Gota', color: 'text-blue-400', borderColor: 'border-blue-500/20', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]', icon: '💧' },
  { id: 8, name: 'Explosión', color: 'text-orange-500', borderColor: 'border-orange-500/20', glow: 'shadow-[0_0_15px_rgba(249,115,22,0.15)]', icon: '💥' },
  { id: 9, name: 'Láser', color: 'text-pink-500', borderColor: 'border-pink-500/20', glow: 'shadow-[0_0_15px_rgba(236,72,153,0.15)]', icon: '🪄' },
  { id: 10, name: 'Viento', color: 'text-emerald-400', borderColor: 'border-emerald-500/20', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.15)]', icon: '🍃' },
  { id: 11, name: 'Alarma', color: 'text-rose-500', borderColor: 'border-rose-500/20', glow: 'shadow-[0_0_15px_rgba(244,63,94,0.15)]', icon: '🚨' },
  { id: 12, name: 'Glitch', color: 'text-teal-400', borderColor: 'border-teal-500/20', glow: 'shadow-[0_0_15px_rgba(45,212,191,0.15)]', icon: '🎛️' },
];

export default function VirtualMixer() {
  const [activeTrackId, setActiveTrackId] = useState<number | null>(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackVolume, setTrackVolume] = useState(80);
  const [masterVolume, setMasterVolume] = useState(90);
  const [activeEffectsQueue, setActiveEffectsQueue] = useState<number[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(60));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const activeTrack = DEFAULT_TRACKS.find(t => t.id === activeTrackId);

  const setupWebAudio = () => {
    if (!audioRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtxRef.current = new AudioContextClass();
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        sourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioCtxRef.current.destination);
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      startVisualizer();
    } catch (e) {
      console.warn("Could not setup Web Audio API:", e);
    }
  };

  const startVisualizer = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const draw = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const UI_BARS = 60;
      const mappedData = new Uint8Array(UI_BARS);
      const step = Math.floor(Math.min(dataArray.length, 100) / UI_BARS);
      for (let i = 0; i < UI_BARS; i++) {
        // Average the bin
        let sum = 0;
        let count = 0;
        for (let j = 0; j < (step || 1); j++) {
            const idx = i * step + j;
            if (idx < dataArray.length) {
               sum += dataArray[idx];
               count++;
            }
        }
        mappedData[i] = count > 0 ? sum / count : 0;
      }
      
      setFrequencyData(mappedData);
      rafIdRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  // Load and configure audio when track changes
  useEffect(() => {
    if (activeTrack) {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.crossOrigin = "anonymous";
        audioRef.current.src = activeTrack.url;
        audioRef.current.loop = true;
      } else {
        audioRef.current.src = activeTrack.url;
      }
      audioRef.current.volume = (trackVolume / 100) * (masterVolume / 100);
      
      if (isPlaying) {
        setupWebAudio();
        audioRef.current.play().catch(e => console.warn(e));
        broadcastBg(activeTrack, 'play');
      } else {
        audioRef.current.pause();
      }
    }
  }, [activeTrackId]);

  useEffect(() => {
    return () => {
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(console.error);
        }
    };
  }, []);

  // Handle Play/Pause local UI
  const togglePlay = () => {
    if (!activeTrackId) return;
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);
    
    if (audioRef.current) {
      if (newIsPlaying) {
        setupWebAudio();
        audioRef.current.play().catch(e => console.warn(e));
        broadcastBg(activeTrack, 'play');
      } else {
        audioRef.current.pause();
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        broadcastBg(activeTrack, 'pause');
      }
    }
  };

  // Sync volume with player and broadcast
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = (trackVolume / 100) * (masterVolume / 100);
    }
    if (isLive && isPlaying && activeTrack) {
      // Debounce volume updates for live broadcast
      const timeout = setTimeout(() => {
        broadcastBg(activeTrack, 'volume_update');
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [trackVolume, masterVolume, isLive, isPlaying, activeTrack]);

  const broadcastBg = async (track: any, cmd: string) => {
    if (!isLive) return;
    try {
      await apiFetch('/api/admin/trigger-dj-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track?.url || '',
          command: cmd,
          name: track?.name || '',
          volume: (trackVolume / 100) * (masterVolume / 100)
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleEffectClick = async (effect: typeof DEFAULT_EFFECTS[0]) => {
    // Add to queue visualization
    setActiveEffectsQueue(prev => {
      const updated = [...prev, effect.id];
      if (updated.length > 8) updated.shift();
      return updated;
    });

    // Timeout visual removal
    setTimeout(() => {
      setActiveEffectsQueue(prev => prev.filter(id => id !== effect.id));
    }, 2000);

    // Play locally
    const effectUrl = 'https://upload.wikimedia.org/wikipedia/commons/2/27/Censor_beep_sound_effect.ogg';
    const synth = new Audio(effectUrl); // Placeholder generic synth
    synth.volume = masterVolume / 100;
    synth.play().catch(e => console.warn(e));

    // Broadcast LIVE
    if (isLive) {
      try {
        await apiFetch('/api/admin/trigger-dj-sound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotId: `effect_${effect.id}`,
            url: effectUrl,
            name: effect.name
          })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const stopAll = () => {
    setIsPlaying(false);
    if (audioRef.current) audioRef.current.pause();
    broadcastBg(activeTrack, 'stop');
  };

  return (
    <div className="flex flex-col w-full bg-[#0B0F13] text-slate-300 font-sans p-4 sm:p-6 rounded-xl shadow-2xl relative ring-1 ring-white/10 lg:h-full lg:min-h-[800px] overflow-y-auto lg:overflow-hidden">
      
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
        
        {/* LEFT PANEL: PISTAS DE FONDO */}
        <div className="col-span-12 xl:col-span-3 lg:col-span-4 bg-[#11161D] rounded-xl border border-slate-800/80 p-4 flex flex-col min-h-[300px] lg:h-auto">
          <h2 className="text-xs font-bold text-slate-400 mb-4 tracking-wider uppercase">Pistas de fondo</h2>
          
          <div className="space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 flex-1">
            {DEFAULT_TRACKS.map(track => {
              const isActive = activeTrackId === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => setActiveTrackId(track.id)}
                  className={clsx(
                    "flex flex-row items-center w-full p-3 rounded-xl transition-all border text-left flex-shrink-0 min-h-[64px]",
                    isActive ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-50" : "border-slate-800 bg-[#151B23] hover:bg-slate-800/80"
                  )}
                >
                  <div className={clsx(
                    "w-6 h-6 rounded flex items-center justify-center font-bold text-xs mr-3 flex-shrink-0",
                    isActive ? "bg-emerald-500 text-white" : "text-slate-500"
                  )}>
                    {track.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx("text-sm font-semibold truncate", isActive ? "" : "text-slate-300")}>{track.name}</p>
                    <p className="text-xs text-slate-500">{track.duration}</p>
                  </div>
                  
                  <div className="ml-2 flex items-center gap-2 flex-shrink-0">
                    <div className={clsx("flex gap-0.5 items-end h-4", track.activeColor, !isActive && "opacity-40 grayscale")}>
                       <span className="w-0.5 h-[40%] bg-current animate-pulse"></span>
                       <span className="w-0.5 h-[80%] bg-current animate-pulse delay-75"></span>
                       <span className="w-0.5 h-[100%] bg-current animate-pulse delay-100"></span>
                       <span className="w-0.5 h-[60%] bg-current animate-pulse delay-150"></span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                       {isActive && isPlaying ? <Pause size={14} className="text-emerald-500" fill="currentColor" /> : <Play size={14} className="text-slate-400 ml-0.5" fill="currentColor"/>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* CENTER PANEL: REPRODUCIENDO & PLAYER */}
        <div className="col-span-12 xl:col-span-5 lg:col-span-4 bg-[#11161D] rounded-xl border border-slate-800/80 p-5 sm:p-6 flex flex-col items-center justify-between relative overflow-hidden min-h-[350px]">
          <div className="w-full flex justify-between items-start z-10 gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-emerald-400 text-[10px] sm:text-xs font-bold tracking-widest uppercase mb-1">REPRODUCIENDO</p>
              <h1 className="text-lg sm:text-2xl font-semibold text-white truncate">{activeTrack?.name || 'Ninguna pista'}</h1>
            </div>
            <div className="text-emerald-400 font-mono text-xs sm:text-sm tracking-widest opacity-80 mt-1 sm:mt-2 text-right shrink-0 whitespace-nowrap">
              {isPlaying ? '01:24' : '00:00'} <span className="text-slate-500 block sm:inline">/ {activeTrack?.duration || '00:00'}</span>
            </div>
          </div>

          {/* LARGE WAVEFORM VISUALIZER */}
          <div className="w-full h-24 sm:h-32 flex items-center justify-center my-6 relative z-10 opacity-90 mx-8">
             <div className="absolute inset-0 flex items-center gap-[1px] sm:gap-[2px] justify-center px-2 sm:px-4">
               {Array.from(frequencyData).map((freq, i) => {
                 // Convert freq (0-255) to height percentage
                 const h = 5 + (freq / 255) * 95;
                 const isCenter = i === 30; // approx center of 60 bars
                 return (
                   <div 
                     key={i} 
                     className={clsx(
                       "w-[2px] sm:w-1 rounded-full transition-all duration-75",
                       isCenter ? "bg-emerald-300" : "bg-emerald-500"
                     )}
                     style={{ 
                       height: `${isCenter ? Math.max(20, h) : h}%`,
                       opacity: isCenter ? 1 : 0.6 + (Math.random() * 0.4)
                     }}
                   />
                 )
               })}
             </div>
             {/* Progress scrub line */}
             <div className="absolute top-0 bottom-0 left-[42%] w-px bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" />
             <div className="absolute top-[-5px] left-[42%] ml-[-3px] w-2 h-2 rounded-full bg-emerald-200 shadow-[0_0_8px_#a7f3d0]" />
          </div>

          {/* PLAYBACK CONTROLS */}
          <div className="flex items-center gap-4 sm:gap-6 z-10 my-2">
             <button className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition">
               <SkipBack size={18} fill="currentColor" />
             </button>
             <button 
               onClick={togglePlay}
               className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-500 text-slate-900 hover:bg-emerald-400 hover:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition shrink-0 flex items-center justify-center"
             >
               {isPlaying ? <Pause size={24} className="sm:w-[28px] sm:h-[28px]" fill="currentColor" /> : <Play size={24} className="sm:w-[28px] sm:h-[28px] ml-1" fill="currentColor" />}
             </button>
             <button className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition">
               <SkipForward size={18} fill="currentColor" />
             </button>
          </div>

          <div className="w-full mt-4 flex items-center gap-2 sm:gap-4 z-10 flex-wrap sm:flex-nowrap">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider">VOLUMEN</span>
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
               <Volume2 size={16} className="text-slate-400 shrink-0" />
               <input 
                 type="range" 
                 min="0" max="100" 
                 value={trackVolume}
                 onChange={(e) => setTrackVolume(parseInt(e.target.value))}
                 className="flex-1 h-3 sm:h-1.5 appearance-none bg-slate-800 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 sm:[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-5 sm:[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
               />
               <span className="text-xs font-mono text-emerald-500 w-8 shrink-0 text-right">{trackVolume}%</span>
            </div>
          </div>
          
          {/* Subtle bg glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
        </div>

        {/* RIGHT PANEL: EFECTOS */}
        <div className="col-span-12 xl:col-span-4 lg:col-span-4 bg-[#11161D] rounded-xl border border-slate-800/80 p-4 flex flex-col min-h-[350px]">
           <div className="flex justify-between items-center mb-4">
             <h2 className="text-xs font-bold text-slate-400 tracking-wider uppercase">EFECTOS (12)</h2>
           </div>
           
           <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2 sm:gap-3 flex-1 overflow-y-auto min-h-0 content-start pb-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
             {DEFAULT_EFFECTS.map(effect => (
               <button
                 key={effect.id}
                 onClick={() => handleEffectClick(effect)}
                 className={clsx(
                   "relative flex flex-col items-center justify-center p-2 sm:p-0 sm:aspect-[1.1] rounded-xl border bg-[#151B23] transition-all group overflow-hidden hover:-translate-y-0.5",
                   effect.borderColor,
                   "hover:bg-[#1A222C]"
                 )}
               >
                 <span className="absolute top-1 sm:top-1.5 left-1.5 sm:left-2 text-[9px] sm:text-[10px] font-mono text-slate-500 hidden sm:block">{effect.id}</span>
                 <span className={clsx("text-xl sm:text-3xl mb-1 drop-shadow-md group-hover:scale-110 transition-transform", effect.color)}>
                   {effect.icon}
                 </span>
                 <span className="text-[9px] sm:text-[10px] font-semibold text-slate-300 uppercase tracking-wide truncate w-full text-center px-1">{effect.name}</span>
                 
                 {/* Internal glow on hover */}
                 <div className={clsx("absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 pointer-events-none", effect.glow)} />
               </button>
             ))}
           </div>
           
           <div className="mt-2 sm:mt-4 px-3 sm:px-4 py-2 sm:py-3 bg-slate-800/30 rounded-lg flex items-center justify-center gap-2 border border-slate-800/50 shrink-0">
             <Info size={14} className="text-slate-400 shrink-0" />
             <span className="text-[10px] sm:text-xs text-slate-400 font-medium tracking-wide">Toca un efecto para activarlo</span>
           </div>
        </div>

      </div>

      {/* BOTTOM SECTION */}
      <div className="mt-4 flex flex-col lg:grid lg:grid-cols-12 gap-4 shrink-0">
        
        {/* EFECTOS ACTIVOS COLA */}
        <div className="col-span-12 xl:col-span-8 lg:col-span-7 bg-[#11161D] p-4 sm:p-5 rounded-xl border border-slate-800/80 flex flex-col justify-between">
           <div className="flex items-center gap-2 mb-3">
             <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">EFECTOS ACTIVOS / COLA</span>
           </div>
           
           {/* Queue Container */}
           <div className="w-full overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
             <div className="flex gap-2 min-w-max h-16 sm:h-auto">
               {Array.from({ length: 8 }).map((_, i) => {
                 const activeId = activeEffectsQueue[i];
                 const activeEffect = activeId ? DEFAULT_EFFECTS.find(e => e.id === activeId) : null;

                 return (
                   <div 
                     key={i} 
                     className={clsx(
                       "w-16 h-16 sm:w-auto sm:flex-1 sm:aspect-square shrink-0 rounded-xl border-2 flex items-center justify-center transition-all overflow-hidden relative",
                       activeEffect ? "border-slate-600 bg-slate-800 shadow-inner" : "border-slate-800/80 border-dashed bg-[#151B23]"
                     )}
                   >
                     {activeEffect ? (
                       <span className="text-2xl sm:text-3xl animate-pulse">{activeEffect.icon}</span>
                     ) : (
                       <span className="text-slate-600 text-xl font-light">+</span>
                     )}
                   </div>
                 );
               })}
             </div>
           </div>
           
           <p className="text-[10px] sm:text-xs text-slate-500 font-medium tracking-wide mt-2 sm:mt-3">Los efectos activados aparecerán aquí.</p>
        </div>

        {/* VOLUMEN MAESTRO */}
        <div className="col-span-12 xl:col-span-4 lg:col-span-5 bg-[#11161D] p-4 sm:p-5 rounded-xl border border-slate-800/80 flex flex-col justify-between gap-4">
           <div className="mb-2 sm:mb-4">
              <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">VOLUMEN MAESTRO</span>
              <div className="flex items-center gap-3 mt-3">
                 <Volume2 size={18} className="text-slate-400 shrink-0" />
                 <input 
                   type="range" 
                   min="0" max="100" 
                   value={masterVolume}
                   onChange={(e) => setMasterVolume(parseInt(e.target.value))}
                   className="flex-1 h-2 sm:h-1.5 appearance-none bg-slate-800 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 sm:[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-5 sm:[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                 />
                 <span className="text-sm font-mono text-purple-400 font-bold w-10 shrink-0 text-right">{masterVolume}%</span>
              </div>
           </div>

           <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
             <button 
               onClick={togglePlay}
               className="flex-1 py-3 bg-[#2D1B4E] hover:bg-[#3D256A] text-purple-200 text-[10px] sm:text-sm font-bold tracking-widest rounded-lg flex items-center justify-center gap-2 border border-purple-900/50 transition shadow-[0_0_15px_rgba(88,28,135,0.15)]"
             >
               {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
               {isPlaying ? 'PAUSA GENERAL' : 'PLAY GENERAL'}
             </button>
             <button 
                onClick={() => {
                  if (audioRef.current) audioRef.current.currentTime = 0;
                }}
               className="flex-1 py-3 bg-[#151B23] hover:bg-slate-800 border border-slate-700/80 text-[10px] sm:text-sm text-slate-300 font-bold tracking-widest rounded-lg flex items-center justify-center gap-2 transition"
             >
               <SkipBack size={16} /> REINICIAR PISTA
             </button>
           </div>
        </div>

      </div>

      {/* FOOTER ACTIONS */}
      <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 shrink-0">
        <button 
          onClick={() => setIsLive(!isLive)}
          className={clsx(
            "w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-bold text-[10px] sm:text-sm tracking-widest flex justify-center items-center gap-2 transition border",
            isLive ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-[#11161D] border-slate-800 hover:bg-slate-800 text-slate-300"
          )}
        >
          <Radio className={isLive && "animate-pulse"} size={16} /> MODO EN VIVO
        </button>
        <button className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-slate-800 bg-[#11161D] hover:bg-slate-800 text-slate-300 font-bold text-[10px] sm:text-sm tracking-widest flex justify-center items-center gap-2 transition">
          <Save size={16} /> GUARDAR MIX
        </button>
        <button className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-slate-800 bg-[#11161D] hover:bg-slate-800 text-slate-300 font-bold text-[10px] sm:text-sm tracking-widest flex justify-center items-center gap-2 transition">
          <FolderOpen size={16} /> CARGAR MIX
        </button>
        <button className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-slate-800 bg-[#11161D] hover:bg-slate-800 text-slate-300 font-bold text-[10px] sm:text-sm tracking-widest flex justify-center items-center gap-2 transition sm:mr-auto">
          <Settings size={16} /> AJUSTES
        </button>
        
        <button 
           onClick={stopAll}
           className="w-full sm:w-auto px-4 sm:px-8 py-3 sm:py-4 rounded-xl border border-red-900/50 bg-red-950/30 hover:bg-red-900/80 text-red-400 hover:text-red-300 font-bold text-[10px] sm:text-sm tracking-widest flex justify-center items-center gap-2 transition sm:ml-auto"
         >
          <Square size={14} fill="currentColor" /> DETENER TODO
        </button>
      </div>
      
    </div>
  );
}
