import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

interface LiveStreamProps {
  streamId: string; // This will be the Twitch channel name
  isAdmin?: boolean;
  isMaximized?: boolean;
  isMuted?: boolean;
}

export default function LiveStream({ streamId, isAdmin = false, isMaximized = false, isMuted = true }: LiveStreamProps) {
  const [parentDomain, setParentDomain] = useState<string>('');
  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get the current hostname for the Twitch parent parameter
    setParentDomain(window.location.hostname);
  }, []);

  useEffect(() => {
    if (!parentDomain || !streamId || !playerContainerRef.current) return;

    // Clear previous player if any
    playerContainerRef.current.innerHTML = '';

    const loadTwitchPlayer = () => {
      try {
        if ((window as any).Twitch && (window as any).Twitch.Player) {
          new (window as any).Twitch.Player(playerContainerRef.current, {
            channel: streamId,
            width: '100%',
            height: '100%',
            parent: [
              parentDomain,
              'aistudio.google.com',
              'build.aistudio.google.com',
              'ai.studio',
              'localhost',
              'bingolite.click',
              'www.bingolite.click'
            ],
            autoplay: true,
            muted: isMuted,
          });
        }
      } catch (error) {
        console.error('Error loading Twitch player:', error);
      }
    };

    let script = document.getElementById('twitch-embed-script') as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = 'twitch-embed-script';
      script.src = 'https://player.twitch.tv/js/embed/v1.js';
      document.body.appendChild(script);
      script.onload = loadTwitchPlayer;
    } else {
      loadTwitchPlayer();
    }

    return () => {
      if (playerContainerRef.current) {
        playerContainerRef.current.innerHTML = '';
      }
    };
  }, [parentDomain, streamId, isMuted]);

  if (!streamId) {
    return (
      <div className="w-full h-full bg-slate-900 rounded-2xl flex items-center justify-center text-slate-500 flex-col gap-4 border-2 border-dashed border-slate-700">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="M2 12h4l3-9 5 18 3-9h5" />
          </svg>
        </div>
        <p className="font-medium text-sm text-center px-4">
          {isAdmin ? 'Ingresa el nombre del canal de Twitch en Configuraciones' : 'Esperando transmisión...'}
        </p>
      </div>
    );
  }

  if (!parentDomain) return null;

  return (
    <div className="w-full h-full bg-black overflow-hidden relative group">
      <div ref={playerContainerRef} className="absolute inset-0 w-full h-full border-0"></div>
      
      {/* Fallback button if cookies/classification blocks the iframe */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex flex-col gap-2 items-end">
        <a 
          href={`https://twitch.tv/${streamId}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="px-4 py-2 bg-purple-600/90 hover:bg-purple-600 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 backdrop-blur-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.149 0l-1.612 4.119v16.836h5.731v3.045h3.224l3.045-3.045h4.657l6.269-6.264v-14.691h-21.314zm19.164 13.612l-4.299 4.299h-4.657l-3.045 3.045v-3.045h-4.836v-15.045h16.836v10.746zm-5.015-7.164v5.373h-1.791v-5.373h1.791zm-4.836 0v5.373h-1.791v-5.373h1.791z"/></svg>
          Abrir en Twitch
        </a>
      </div>
    </div>
  );
}
