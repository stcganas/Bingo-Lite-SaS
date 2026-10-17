import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

// Global cached prompt so it isn't lost if fired before component mounts
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  if (window.deferredPWAInstallPrompt) {
    globalDeferredPrompt = window.deferredPWAInstallPrompt;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    window.deferredPWAInstallPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
  });

  window.addEventListener('pwa-prompt-ready', (e: any) => {
    if (e.detail) {
      globalDeferredPrompt = e.detail;
      window.deferredPWAInstallPrompt = e.detail;
    }
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined') {
      return globalDeferredPrompt || window.deferredPWAInstallPrompt || null;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(isStandaloneMode);
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    const updatePrompt = (prompt: BeforeInstallPromptEvent | null) => {
      if (prompt) {
        globalDeferredPrompt = prompt;
        window.deferredPWAInstallPrompt = prompt;
        setDeferredPrompt(prompt);
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      updatePrompt(promptEvent);
    };

    const handlePromptAvailable = () => {
      const p = globalDeferredPrompt || window.deferredPWAInstallPrompt || null;
      if (p) setDeferredPrompt(p);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      globalDeferredPrompt = null;
      window.deferredPWAInstallPrompt = null;
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    window.addEventListener('pwa-prompt-ready', handlePromptAvailable);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Initial check in case it arrived before listener attached
    if (window.deferredPWAInstallPrompt && !deferredPrompt) {
      setDeferredPrompt(window.deferredPWAInstallPrompt);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
      window.removeEventListener('pwa-prompt-ready', handlePromptAvailable);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const install = useCallback(async (): Promise<{ success: boolean; outcome?: 'accepted' | 'dismissed'; error?: string }> => {
    setIsInstalling(true);

    try {
      // Find the prompt or wait a short moment if it is arriving
      let promptToUse = deferredPrompt || globalDeferredPrompt || window.deferredPWAInstallPrompt || null;

      if (!promptToUse && !isIOS) {
        // Wait up to 2.5s for beforeinstallprompt event if browser is still evaluating
        promptToUse = await new Promise<BeforeInstallPromptEvent | null>((resolve) => {
          const timeout = setTimeout(() => {
            cleanup();
            resolve(globalDeferredPrompt || window.deferredPWAInstallPrompt || null);
          }, 2500);

          const onEvent = (e: any) => {
            cleanup();
            resolve(e.detail || globalDeferredPrompt || window.deferredPWAInstallPrompt || null);
          };

          const onBip = (e: Event) => {
            e.preventDefault();
            cleanup();
            resolve(e as BeforeInstallPromptEvent);
          };

          const cleanup = () => {
            clearTimeout(timeout);
            window.removeEventListener('pwa-prompt-available', onEvent);
            window.removeEventListener('pwa-prompt-ready', onEvent);
            window.removeEventListener('beforeinstallprompt', onBip);
          };

          window.addEventListener('pwa-prompt-available', onEvent);
          window.addEventListener('pwa-prompt-ready', onEvent);
          window.addEventListener('beforeinstallprompt', onBip);
        });
      }

      if (promptToUse) {
        // Call native prompt directly from user click
        await promptToUse.prompt();
        const choiceResult = await promptToUse.userChoice;

        if (choiceResult.outcome === 'accepted') {
          setIsInstalled(true);
          globalDeferredPrompt = null;
          window.deferredPWAInstallPrompt = null;
          setDeferredPrompt(null);
          return { success: true, outcome: 'accepted' };
        } else {
          return { success: false, outcome: 'dismissed' };
        }
      }

      return { success: false, error: 'no-prompt' };
    } catch (err: any) {
      console.warn('[PWA] Error executing install prompt:', err);
      return { success: false, error: err?.message || 'unknown' };
    } finally {
      setIsInstalling(false);
    }
  }, [deferredPrompt, isIOS]);

  return {
    isInstallable: !!(deferredPrompt || globalDeferredPrompt || (typeof window !== 'undefined' && window.deferredPWAInstallPrompt)),
    isInstalled,
    isStandalone,
    isIOS,
    isInstalling,
    install,
    deferredPrompt: deferredPrompt || globalDeferredPrompt || (typeof window !== 'undefined' ? window.deferredPWAInstallPrompt : null)
  };
}
