import { getGlobalFxVolume } from './sound';

// Prevent browser Garbage Collection from prematurely cutting off active utterances (Chrome/Safari bug)
const activeUtterances = new Set<SpeechSynthesisUtterance>();

export interface SpeechQueueItem {
  id: string;
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  resolve?: () => void;
}

const queue: SpeechQueueItem[] = [];
let isSpeaking = false;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];

// Determine standard Bingo 75 letter
export const getBallLetter = (ball: number): string => {
  if (ball >= 1 && ball <= 15) return 'B';
  if (ball >= 16 && ball <= 30) return 'I';
  if (ball >= 31 && ball <= 45) return 'N';
  if (ball >= 46 && ball <= 60) return 'G';
  if (ball >= 61 && ball <= 75) return 'O';
  return '';
};

export const isSpeechSupported = (): boolean => {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
};

// Cache and update available system voices
const loadVoices = () => {
  if (!isSpeechSupported()) return;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      cachedVoices = voices;
    }
  } catch (e) {
    console.warn('[SpeechSynthesis] Failed to load voices:', e);
  }
};

// Initialize voice listener & unlock audio on user gesture
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      loadVoices();
    };
  }

  const unlockSpeech = () => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {
      // ignore
    }
  };
  window.addEventListener('click', unlockSpeech, { passive: true });
  window.addEventListener('touchstart', unlockSpeech, { passive: true });
  window.addEventListener('keydown', unlockSpeech, { passive: true });
}

// Find the best quality Spanish voice
export const getBestSpanishVoice = (): SpeechSynthesisVoice | null => {
  if (!isSpeechSupported()) return null;
  loadVoices();

  const spanishVoices = cachedVoices.filter(v => v.lang && (v.lang.toLowerCase().startsWith('es')));
  if (spanishVoices.length === 0) return null;

  // Preferred high clarity Spanish voices
  const preferred = spanishVoices.find(v => {
    const name = v.name.toLowerCase();
    return (
      name.includes('google') ||
      name.includes('paulina') ||
      name.includes('sabina') ||
      name.includes('helena') ||
      name.includes('laura') ||
      name.includes('monica') ||
      name.includes('jorge') ||
      name.includes('pablo') ||
      name.includes('microsoft') ||
      name.includes('natural')
    );
  });

  return preferred || spanishVoices[0] || null;
};

// Chrome keep-alive hack: periodically resumes synthesis to prevent it from stalling on long audio or background
const startKeepAlive = () => {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    if (isSpeechSupported()) {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  }, 250);
};

const stopKeepAlive = () => {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
};

// Sequential queue processor: ensures each locution completes 100% without being cut off
const processNextInQueue = () => {
  if (isSpeaking) return;
  if (queue.length === 0) {
    stopKeepAlive();
    return;
  }
  if (!isSpeechSupported()) {
    queue.length = 0;
    return;
  }

  isSpeaking = true;
  startKeepAlive();

  const item = queue.shift()!;
  const utterance = new SpeechSynthesisUtterance(item.text);

  utterance.lang = item.lang || 'es-ES';
  // Natural, loud, articulate cadence so both letter and number are 100% audible and complete
  utterance.rate = item.rate ?? 0.92;
  utterance.pitch = item.pitch ?? 1.0;
  // Maximum volume to ensure the first ball and every ball sounds loud and clear
  utterance.volume = 1.0;

  const voice = getBestSpanishVoice();
  if (voice) {
    utterance.voice = voice;
  }

  // Prevent Garbage Collection in browser engines while speech is active
  activeUtterances.add(utterance);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;

    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }

    activeUtterances.delete(utterance);
    utterance.onend = null;
    utterance.onerror = null;

    if (item.resolve) {
      try {
        item.resolve();
      } catch (e) {
        console.error('[SpeechSynthesis] Error in resolve callback:', e);
      }
    }

    isSpeaking = false;
    // Short pause between locutions
    setTimeout(() => {
      processNextInQueue();
    }, 60);
  };

  utterance.onend = () => {
    finish();
  };

  utterance.onerror = (e) => {
    console.warn('[SpeechSynthesis] Utterance event:', e);
    finish();
  };

  // Safety watchdog: guarantees queue progression even if browser drops onend (e.g. mobile tab backgrounded)
  const maxSafeDurationMs = Math.max(3000, item.text.length * 150 + 2000);
  watchdogTimer = setTimeout(() => {
    finish();
  }, maxSafeDurationMs);

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('[SpeechSynthesis] speak() failed:', err);
    finish();
  }
};

// Deduplication trackers to prevent repeated voice announcements
const recentAnnouncedBalls = new Map<number, number>();
const recentSpokenTexts = new Map<string, number>();

// Track active winner locution to strictly protect it from being cut off by balls or cancellation
let isWinnerSpeechActive = false;
let winnerSpeechTimer: ReturnType<typeof setTimeout> | null = null;

export const setWinnerSpeechActive = (active: boolean, durationMs: number = 18000) => {
  isWinnerSpeechActive = active;
  if (winnerSpeechTimer) {
    clearTimeout(winnerSpeechTimer);
    winnerSpeechTimer = null;
  }
  if (active) {
    winnerSpeechTimer = setTimeout(() => {
      isWinnerSpeechActive = false;
      winnerSpeechTimer = null;
    }, durationMs);
  }
};

export const getIsWinnerSpeechActive = (): boolean => {
  return isWinnerSpeechActive;
};

/**
 * Native SpeechSynthesis Ball Announcement:
 * Speaks the letter and number completely (e.g., "B, 15", "I, 24", "N, 32", "G, 54", "O, 72")
 * with a clean punctuation pause to ensure zero clipping.
 * Automatically synchronizes with the 8-second draw timing.
 */
export const announceBall = (ballNumber: number, _immediate: boolean = true): Promise<void> => {
  if (!isSpeechSupported()) {
    return Promise.resolve();
  }
  if (!ballNumber || ballNumber < 1 || ballNumber > 75 || isNaN(ballNumber)) {
    return Promise.resolve();
  }

  // Never interrupt or cancel an ongoing winner announcement!
  if (isWinnerSpeechActive) {
    console.log(`[Speech] Skipping ball announcement: ${ballNumber} because winner locution is active.`);
    return Promise.resolve();
  }

  const now = Date.now();
  const lastAnnounced = recentAnnouncedBalls.get(ballNumber);
  if (lastAnnounced && (now - lastAnnounced < 6000)) {
    console.log(`[Speech] Skipping duplicate ball announcement: ${ballNumber}`);
    return Promise.resolve();
  }
  recentAnnouncedBalls.set(ballNumber, now);

  // Clean old entries
  if (recentAnnouncedBalls.size > 80) {
    for (const [k, v] of recentAnnouncedBalls.entries()) {
      if (now - v > 30000) recentAnnouncedBalls.delete(k);
    }
  }

  const letter = getBallLetter(ballNumber);
  // Single, clean, fluent phrase: "B 12", "I 24", "N 38", "G 52", "O 71"
  const textToSpeak = letter ? `${letter} ${ballNumber}` : `${ballNumber}`;

  // Purge any stale non-ball items from queue so only the new ball is spoken
  queue.length = 0;

  // If another sound was active, cancel and wait 60ms for browser audio engine to settle
  // to prevent chopping off the first syllable ("I...") or canceling the new utterance
  const wasActive = isSpeaking || (window.speechSynthesis && window.speechSynthesis.speaking);
  if (wasActive && !isWinnerSpeechActive) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
    isSpeaking = false;
    activeUtterances.clear();
  }

  return new Promise<void>((resolve) => {
    queue.push({
      id: `ball_${ballNumber}_${now}`,
      text: textToSpeak,
      lang: 'es-ES',
      rate: 0.92,
      pitch: 1.0,
      volume: 1.0,
      resolve
    });

    if (wasActive) {
      setTimeout(() => {
        processNextInQueue();
      }, 60);
    } else {
      processNextInQueue();
    }
  });
};

/**
 * General speech text helper for announcements using native SpeechSynthesis
 */
export const speakNativeText = (
  text: string,
  options?: { rate?: number; pitch?: number; volume?: number }
): Promise<void> => {
  if (!isSpeechSupported()) return Promise.resolve();

  const cleanText = text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{E0020}-\u{E007F}\u{FE0F}]+|[\u{200D}]+/gu, '')
    .replace(/[*_~`#|]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) return Promise.resolve();

  const now = Date.now();
  const lastSpoken = recentSpokenTexts.get(cleanText);
  if (lastSpoken && (now - lastSpoken < 6000)) {
    console.log(`[Speech] Skipping duplicate speech text: "${cleanText.substring(0, 30)}..."`);
    return Promise.resolve();
  }
  recentSpokenTexts.set(cleanText, now);

  if (recentSpokenTexts.size > 80) {
    for (const [k, v] of recentSpokenTexts.entries()) {
      if (now - v > 30000) recentSpokenTexts.delete(k);
    }
  }

  // Check if identical item is already in queue
  if (queue.some(item => item.text === cleanText)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    queue.push({
      id: `text_${Date.now()}_${Math.random()}`,
      text: cleanText,
      lang: 'es-ES',
      rate: options?.rate ?? 0.92,
      pitch: options?.pitch ?? 1.0,
      volume: options?.volume ?? 1.0,
      resolve
    });

    processNextInQueue();
  });
};

/**
 * Clear queue and immediately stop any active browser speech
 */
export const cancelSpeech = (force: boolean = false) => {
  if (isWinnerSpeechActive && !force) {
    console.log('[Speech] cancelSpeech skipped because winner locution is active');
    return;
  }
  queue.length = 0;
  isSpeaking = false;
  activeUtterances.clear();

  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  stopKeepAlive();

  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('[SpeechSynthesis] cancel error:', e);
    }
  }
};
