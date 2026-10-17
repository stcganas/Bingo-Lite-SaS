let audioContext: AudioContext | null = null;
let masterFxGain: GainNode | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
let globalFxVolume = parseFloat(localStorage.getItem('bingo-fx-volume') || '1.0');

export const setGlobalFxVolume = (volume: number) => {
  if (typeof volume !== 'number' || isNaN(volume)) return;
  
  const clampedVolume = Math.max(0.0001, Math.min(1.5, volume));
  globalFxVolume = clampedVolume;
  localStorage.setItem('bingo-fx-volume', clampedVolume.toString());
  
  if (masterFxGain && audioContext) {
    try {
      const now = audioContext.currentTime;
      masterFxGain.gain.setTargetAtTime(clampedVolume, now, 0.03);
    } catch (e) {
      masterFxGain.gain.setValueAtTime(clampedVolume, audioContext.currentTime);
    }
  }
};

export const getGlobalFxVolume = () => {
  return globalFxVolume;
};

export const playBallDrawSound = (volume: number = 1.0) => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    
    // 1. Primary harmonic oscillator
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.07); // G5
    osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.16); // C6

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.50, now); // C6
    osc2.frequency.exponentialRampToValueAtTime(1567.98, now + 0.07); // G6
    osc2.frequency.exponentialRampToValueAtTime(2093.00, now + 0.16); // C7

    const effectiveVol = Math.max(0.1, volume * globalFxVolume);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(effectiveVol, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.55);
    osc2.stop(now + 0.55);
  } catch (e) {
    // ignored
  }
};

/**
 * Plays a sound effect from a URL and pipes it through the Master FX Gain.
 * This ensures the sound respects global FX volume changes in real-time even while playing.
 * Uses decodeAudioData for reliable Web Audio integration.
 */
const audioBufferCache = new Map<string, AudioBuffer>();

export const playFxFromUrl = async (url: string, volume: number = 1.0) => {
  try {
    const ctx = getAudioContext();
    
    let buffer = audioBufferCache.get(url);
    if (!buffer) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      buffer = await ctx.decodeAudioData(arrayBuffer);
      audioBufferCache.set(url, buffer);
    }
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const perSoundGain = ctx.createGain();
    perSoundGain.gain.setValueAtTime(Math.max(0.1, volume * 1.3), ctx.currentTime);
    
    source.connect(perSoundGain);
    perSoundGain.connect(getMasterFxGain());
    
    source.start(ctx.currentTime);
  } catch (e) {
    // Fallback to legacy Audio if Web Audio / fetch fails (e.g. CORS)
    const audio = new Audio(url);
    audio.volume = Math.min(1.0, Math.max(0.1, volume));
    audio.play().catch(() => {});
  }
};

export const downloadBase64Audio = (base64Data: string, filename: string = 'audio_ia.wav', sampleRate: number = 24000) => {
  try {
    let trimmed = base64Data.trim();
    if (trimmed.includes(',')) {
      trimmed = trimmed.split(',')[1];
    }
    trimmed = trimmed.replace(/\s+/g, '');

    const binary = window.atob(trimmed);
    const len = binary.length;
    const array = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      array[i] = binary.charCodeAt(i);
    }
    
    // Check magic byte signatures
    const isWav = array[0] === 0x52 && array[1] === 0x49 && array[2] === 0x46 && array[3] === 0x46; // RIFF
    const isId3Mp3 = array[0] === 0x49 && array[1] === 0x44 && array[2] === 0x33; // ID3
    const isRawMp3 = array[0] === 0xFF && (array[1] & 0xE0) === 0xE0; // MPEG frame sync
    const isMp3 = isId3Mp3 || isRawMp3;
    const isOgg = array[0] === 0x4F && array[1] === 0x67 && array[2] === 0x67 && array[3] === 0x53; // OggS
    const isFlac = array[0] === 0x66 && array[1] === 0x4C && array[2] === 0x61 && array[3] === 0x43; // fLaC
      
    if (isWav || isMp3 || isOgg || isFlac) {
      const mime = isWav ? 'audio/wav' : isMp3 ? 'audio/mpeg' : isOgg ? 'audio/ogg' : 'audio/flac';
      let ext = isWav ? '.wav' : isMp3 ? '.mp3' : isOgg ? '.ogg' : '.flac';
      let finalName = filename;
      if (!finalName.toLowerCase().endsWith(ext)) {
        finalName = finalName.replace(/\.[a-z0-9]+$/i, '') + ext;
      }

      const blob = new Blob([array], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    
    // Convert raw 16-bit PCM to WAV
    let pcmBytes = array;
    if (pcmBytes.byteLength % 2 !== 0) {
      pcmBytes = pcmBytes.subarray(0, pcmBytes.byteLength - 1);
    }
    
    const dataSize = pcmBytes.byteLength;
    const headerSize = 44;
    const wavBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(wavBuffer);
    
    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    
    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true); // NumChannels (1 = Mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    
    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Copy exact PCM samples
    new Uint8Array(wavBuffer, headerSize).set(pcmBytes);
    
    let finalName = filename;
    if (!finalName.toLowerCase().endsWith('.wav')) {
      finalName = finalName.replace(/\.[a-z0-9]+$/i, '') + '.wav';
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
  } catch (err) {
    console.error('[AI] Error downloading audio:', err);
  }
};

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Master Compressor for loud, punchy, clear audio without clipping
    masterCompressor = audioContext.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-14, audioContext.currentTime);
    masterCompressor.knee.setValueAtTime(10, audioContext.currentTime);
    masterCompressor.ratio.setValueAtTime(4, audioContext.currentTime);
    masterCompressor.attack.setValueAtTime(0.003, audioContext.currentTime);
    masterCompressor.release.setValueAtTime(0.25, audioContext.currentTime);

    masterFxGain = audioContext.createGain();
    masterFxGain.gain.setValueAtTime(Math.max(0.001, globalFxVolume), audioContext.currentTime);

    masterFxGain.connect(masterCompressor);
    masterCompressor.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
};

export const getMasterFxGain = () => {
  getAudioContext(); // Ensure initialized
  return masterFxGain!;
};

// Convert raw 16-bit linear PCM byte buffer into a clean RIFF/WAVE ArrayBuffer with proper 44-byte header
const pcm16ToWavBuffer = (pcmBytes: Uint8Array, sampleRate: number = 24000, numChannels: number = 1): ArrayBuffer => {
  // Ensure even byte length for 16-bit samples
  let cleanPcm = pcmBytes;
  if (cleanPcm.byteLength % 2 !== 0) {
    cleanPcm = cleanPcm.subarray(0, cleanPcm.byteLength - 1);
  }

  const dataSize = cleanPcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // 1. RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // chunkSize
  writeString(8, 'WAVE');

  // 2. "fmt " sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16-bit)

  // 3. "data" sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // 4. Copy PCM sample data
  new Uint8Array(buffer, 44).set(cleanPcm);

  return buffer;
};

let activePcmSource: AudioBufferSourceNode | null = null;

export const stopBase64PCM = () => {
  if (activePcmSource) {
    try {
      activePcmSource.stop();
      activePcmSource.disconnect();
    } catch (e) {
      // ignore
    }
    activePcmSource = null;
  }
};

export const playBase64PCM = async (base64Data: string, sampleRate: number = 24000, volume: number = 1.0): Promise<boolean> => {
  if (!base64Data || typeof base64Data !== 'string') return false;

  try {
    // 1. Clean base64 string: remove data URL prefix and whitespace
    let cleaned = base64Data.trim();
    if (cleaned.includes(',')) {
      cleaned = cleaned.split(',')[1];
    }
    cleaned = cleaned.replace(/\s+/g, '');

    const binaryString = window.atob(cleaned);
    const len = binaryString.length;
    if (len < 16) return false;

    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. Identify audio container by examining magic bytes
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // RIFF
    const isId3Mp3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33; // ID3
    const isRawMp3 = bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0; // MPEG frame sync
    const isMp3 = isId3Mp3 || isRawMp3;
    const isOgg = bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53; // OggS
    const isFlac = bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43; // fLaC
    const isAac = bytes[0] === 0xFF && (bytes[1] & 0xF6) === 0xF0; // AAC ADTS
    const isWebm = bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3;

    const isEncodedContainer = isWav || isMp3 || isOgg || isFlac || isAac || isWebm;
    const effectiveVolume = Math.max(0.8, Math.min(1.5, (volume <= 0 ? 1.0 : volume) * 1.35));

    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }

    // If raw PCM from Gemini (not standard container), wrap it with a clean WAV header first
    const arrayBufferToDecode: ArrayBuffer = isEncodedContainer 
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : pcm16ToWavBuffer(bytes, sampleRate, 1);

    // 3. Decode cleanly using AudioContext decodeAudioData
    try {
      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        audioCtx.decodeAudioData(arrayBufferToDecode.slice(0), resolve, reject);
      });

      // Stop any previously playing PCM before starting the new single locution
      stopBase64PCM();

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      activePcmSource = source;

      source.onended = () => {
        if (activePcmSource === source) {
          activePcmSource = null;
        }
      };

      const gainNode = audioCtx.createGain();
      const now = audioCtx.currentTime;
      
      // Smooth anti-pop attack and release curve (prevents initial and final DC static clicks)
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01, effectiveVolume), now + 0.015);
      
      const duration = audioBuffer.duration;
      if (duration > 0.05) {
        gainNode.gain.setValueAtTime(Math.max(0.01, effectiveVolume), now + duration - 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      }

      source.connect(gainNode);
      try {
        const masterFx = getMasterFxGain();
        if (masterFx) {
          gainNode.connect(masterFx);
        } else {
          gainNode.connect(audioCtx.destination);
        }
      } catch (e) {
        gainNode.connect(audioCtx.destination);
      }

      source.start(0);

      console.log(`[AI Audio] Decoded and played clean audio (${audioBuffer.sampleRate}Hz, ${audioBuffer.duration.toFixed(1)}s)`);
      return true;
    } catch (decodeErr) {
      console.warn('[AI Audio] WebAudio decodeAudioData failed, trying HTML5 Audio fallback:', decodeErr);
    }

    // 4. HTML5 Audio element fallback
    try {
      const mimeType = isWav ? 'audio/wav' : isMp3 ? 'audio/mpeg' : isOgg ? 'audio/ogg' : 'audio/wav';
      const blobBytes = isEncodedContainer ? bytes : new Uint8Array(pcm16ToWavBuffer(bytes, sampleRate, 1));
      const blob = new Blob([blobBytes], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      audio.volume = 1.0;
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(blobUrl);
      console.log(`[AI Audio] Played cleanly via HTML5 Audio element (${mimeType})`);
      return true;
    } catch (html5Err) {
      console.warn('[AI Audio] HTML5 Audio fallback also failed:', html5Err);
    }

    return false;
  } catch (err) {
    console.error('[AI Audio] Error in playBase64PCM:', err);
    return false;
  }
};

/**
 * Decodes base64 audio into an in-memory AudioBuffer so it can be played instantaneously on demand.
 */
export const decodeAudioFromBase64 = async (base64Data: string, sampleRate: number = 24000): Promise<AudioBuffer | null> => {
  if (!base64Data || typeof base64Data !== 'string') return null;
  try {
    let cleaned = base64Data.trim();
    if (cleaned.includes(',')) cleaned = cleaned.split(',')[1];
    cleaned = cleaned.replace(/\s+/g, '');
    const binaryString = window.atob(cleaned);
    const len = binaryString.length;
    if (len < 16) return null;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isId3Mp3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    const isRawMp3 = bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0;
    const isOgg = bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
    const isEncodedContainer = isWav || isId3Mp3 || isRawMp3 || isOgg;

    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }

    const arrayBufferToDecode: ArrayBuffer = isEncodedContainer
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : pcm16ToWavBuffer(bytes, sampleRate, 1);

    return await new Promise<AudioBuffer>((resolve, reject) => {
      audioCtx.decodeAudioData(arrayBufferToDecode.slice(0), resolve, reject);
    });
  } catch (err) {
    console.warn('[AI Audio] Failed to decode AudioBuffer from base64:', err);
    return null;
  }
};

/**
 * Plays a pre-decoded AudioBuffer with 0ms latency, anti-pop envelope, and volume controls.
 */
export const playAudioBuffer = async (audioBuffer: AudioBuffer, volume: number = 1.0): Promise<boolean> => {
  if (!audioBuffer) return false;
  try {
    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }

    stopBase64PCM();

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    activePcmSource = source;

    source.onended = () => {
      if (activePcmSource === source) {
        activePcmSource = null;
      }
    };

    const gainNode = audioCtx.createGain();
    const effectiveVolume = Math.max(0.8, Math.min(1.5, (volume <= 0 ? 1.0 : volume) * 1.35));
    const now = audioCtx.currentTime;

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01, effectiveVolume), now + 0.015);

    const duration = audioBuffer.duration;
    if (duration > 0.05) {
      gainNode.gain.setValueAtTime(Math.max(0.01, effectiveVolume), now + duration - 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    }

    source.connect(gainNode);
    try {
      const masterFx = getMasterFxGain();
      if (masterFx) {
        gainNode.connect(masterFx);
      } else {
        gainNode.connect(audioCtx.destination);
      }
    } catch (e) {
      gainNode.connect(audioCtx.destination);
    }

    source.start(0);
    console.log(`[AI Audio] Preloaded buffer played instantly (${audioBuffer.duration.toFixed(1)}s)`);
    return true;
  } catch (err) {
    console.error('[AI Audio] Error playing preloaded audio buffer:', err);
    return false;
  }
};

// Automatically unlock the shared AudioContext on first user interaction (safari, mobile browsers)
if (typeof window !== 'undefined') {
  const unlockCtx = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('[Audio] Shared AudioContext unlocked successfully');
        window.removeEventListener('click', unlockCtx, { capture: true });
        window.removeEventListener('touchstart', unlockCtx, { capture: true });
        window.removeEventListener('keydown', unlockCtx, { capture: true });
      }).catch((e) => {
        console.warn('[Audio] Failed to unlock AudioContext:', e);
      });
    } else if (ctx) {
      window.removeEventListener('click', unlockCtx, { capture: true });
      window.removeEventListener('touchstart', unlockCtx, { capture: true });
      window.removeEventListener('keydown', unlockCtx, { capture: true });
    }
  };
  window.addEventListener('click', unlockCtx, { capture: true });
  window.addEventListener('touchstart', unlockCtx, { capture: true });
  window.addEventListener('keydown', unlockCtx, { capture: true });
}

export const playMarkSound = () => {
  try {
    const finalVolume = 0.3;
    const ctx = getAudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    // Soft, harmonic bell sound
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6 (perfect fifth harmonic)

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    // Quick attack
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.01);
    // Long, smooth decay like a bell
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.6);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playUnmarkSound = () => {
  try {
    const finalVolume = 0.2;
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(300, ctx.currentTime); 
    oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playErrorSound = () => {
  try {
    const finalVolume = 0.3;
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, ctx.currentTime); 
    oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playLoginSound = () => {
  try {
    const finalVolume = 0.2;
    const ctx = getAudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.2);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(550, ctx.currentTime);
    osc2.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.5);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playLogoutSound = () => {
  try {
    const finalVolume = 0.2;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playBuyCardSound = () => {
  try {
    const finalVolume = 0.1;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playNavigateSound = (volume: number = 0.1) => {
  try {
    const finalVolume = volume;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(getMasterFxGain());

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playClickSound = (volume: number = 0.1) => {
  try {
    const finalVolume = volume;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const panner = ctx.createStereoPanner();

    osc.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(getMasterFxGain());

    // Spatial futuristic click
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);

    // Slight random pan for spatial effect
    panner.pan.value = (Math.random() - 0.5) * 0.8;

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(finalVolume, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playChatOpenSound = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const panner = ctx.createStereoPanner();

    osc.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(getMasterFxGain());

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);

    panner.pan.value = 0.4; // Pan slightly right for chat

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

export const playChatCloseSound = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const panner = ctx.createStereoPanner();

    osc.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(getMasterFxGain());

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15);

    panner.pan.value = 0.4;

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

/**
 * Highly responsive Web Audio API synthesizer for live DJ sound effects.
 * Eliminates remote asset hotlinking/proxying blocks (e.g. 403 Forbidden / CORS on Mixkit)
 * by generating high-quality synthesized sound waves directly in the browser with ZERO network latency.
 */
export const playSynthesizedDJEffect = (slotIdOrName: string, customVolume: number = 1.0) => {
  try {
    const ctx = getAudioContext();
    const id = slotIdOrName.toLowerCase();
    const baseVolume = Math.max(0.1, customVolume * 1.35);

    // 1. WELCOME/WELCOME CHIME: Ascending mystical arpeggio of pure bells
    if (id.includes('welcome') || id.includes('bienvenida') || id.includes('mágica') || id.includes('inicio') || id.includes('apertura')) {
      const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C5, E5, G5, C6, E6, G6
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(getMasterFxGain());
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.08);

        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.18 * baseVolume, ctx.currentTime + i * 0.08 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.7);

        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.72);
      });
    }
    // 2. BINGO / CELEBRATION: Major triad triumphant fanfare with upward pitch slide
    else if (id.includes('bingo') || id.includes('celebraci') || id.includes('fanfarria') || id.includes('gong') || id.includes('triunfo')) {
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 major chords
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(getMasterFxGain());
        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        // Pitch ramp up slightly for that celebratory energy
        osc.frequency.linearRampToValueAtTime(freq * 1.33, ctx.currentTime + 0.45);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12 * baseVolume, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.12 * baseVolume, ctx.currentTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.82);
      });
    }
    // 3. SUSPENSE / TENSION: Filtered noise drumroll + intense sub-bass drone
    else if (id.includes('suspense') || id.includes('ten') || id.includes('suspenso') || id.includes('redoble') || id.includes('latente')) {
      const duration = 1.3;
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      // Lower from 180Hz to 85Hz for a dark rolling sound
      filter.frequency.setValueAtTime(180, ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(85, ctx.currentTime + duration);

      // Amplitude Modulation LFO to simulate rolling hands beating a drum
      const ampMod = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 18; // 18 Beats per second (drumroll)
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.45;
      
      lfo.connect(lfoGain);
      lfoGain.connect(ampMod.gain);

      ampMod.gain.setValueAtTime(0.2 * baseVolume, ctx.currentTime);
      ampMod.gain.linearRampToValueAtTime(0.25 * baseVolume, ctx.currentTime + duration - 0.25);
      ampMod.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(ampMod);
      ampMod.connect(getMasterFxGain());

      // Low frequency pitch tension oscillator
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(65, ctx.currentTime);
      subOsc.frequency.linearRampToValueAtTime(50, ctx.currentTime + duration);
      
      subGain.gain.setValueAtTime(0.3 * baseVolume, ctx.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      subOsc.connect(subGain);
      subGain.connect(getMasterFxGain());

      lfo.start(ctx.currentTime);
      noise.start(ctx.currentTime);
      subOsc.start(ctx.currentTime);

      lfo.stop(ctx.currentTime + duration);
      noise.stop(ctx.currentTime + duration);
      subOsc.stop(ctx.currentTime + duration);
    }
    // 4. AIRHORN / BOCOINA: Triplet blast of aggressive synthesized reggae horn!
    else if (id.includes('airhorn') || id.includes('bocina') || id.includes('reggaeton') || id.includes('pitazo')) {
      // 3 quick blasts: bap, bap, baaaaap!
      const blasts = [
        { start: 0, duration: 0.16 },
        { start: 0.22, duration: 0.16 },
        { start: 0.44, duration: 0.85 }
      ];
      blasts.forEach((blast) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        
        const f1 = 155; // Sub-harmonics for full brassy thickness
        const f2 = 225;
        
        osc1.frequency.setValueAtTime(f1, ctx.currentTime + blast.start);
        osc1.frequency.linearRampToValueAtTime(f1 - 18, ctx.currentTime + blast.start + blast.duration);
        
        osc2.frequency.setValueAtTime(f2, ctx.currentTime + blast.start);
        osc2.frequency.linearRampToValueAtTime(f2 - 25, ctx.currentTime + blast.start + blast.duration);
        
        const bpFilter = ctx.createBiquadFilter();
        bpFilter.type = 'bandpass';
        bpFilter.frequency.setValueAtTime(650, ctx.currentTime + blast.start);
        bpFilter.Q.setValueAtTime(2.2, ctx.currentTime + blast.start);

        osc1.connect(bpFilter);
        osc2.connect(bpFilter);
        bpFilter.connect(gainNode);
        gainNode.connect(getMasterFxGain());

        gainNode.gain.setValueAtTime(0, ctx.currentTime + blast.start);
        gainNode.gain.linearRampToValueAtTime(0.28 * baseVolume, ctx.currentTime + blast.start + 0.012);
        gainNode.gain.setValueAtTime(0.28 * baseVolume, ctx.currentTime + blast.start + blast.duration - 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + blast.start + blast.duration);

        osc1.start(ctx.currentTime + blast.start);
        osc2.start(ctx.currentTime + blast.start);
        osc1.stop(ctx.currentTime + blast.start + blast.duration + 0.05);
        osc2.stop(ctx.currentTime + blast.start + blast.duration + 0.05);
      });
    }
    // 5. APPLAUSE / PÚBLICO: Generates realistic crowd clapping and cheering using filtered noise amplitude bursts
    else if (id.includes('applause') || id.includes('aplauso') || id.includes('público') || id.includes('sala') || id.includes('eufórico')) {
      const duration = 2.2;
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, ctx.currentTime);
      filter.Q.setValueAtTime(0.8, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15 * baseVolume, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.15 * baseVolume, ctx.currentTime + 1.8);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(getMasterFxGain());
      noise.start(ctx.currentTime);
      noise.stop(ctx.currentTime + duration);

      // Add a couple of sharp, high pitch hooray/whistle tones
      for (let i = 0; i < 3; i++) {
        const start = 0.2 + i * 0.4;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100 + i * 150, ctx.currentTime + start);
        osc.frequency.exponentialRampToValueAtTime(1400 + i * 100, ctx.currentTime + start + 0.3);
        
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(0.04 * baseVolume, ctx.currentTime + start + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.35);
        
        osc.connect(g);
        g.connect(getMasterFxGain());
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.36);
      }
    }
    // 6. BELL / ATENCIÓN: High nítido brass bell hotel resonance
    else if (id.includes('bell') || id.includes('campana') || id.includes('atención') || id.includes('llamado') || id.includes('aviso')) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(getMasterFxGain());

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1174.66, ctx.currentTime); // D6
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1567.98, ctx.currentTime); // G6 (perfect perfect fourth harmonic)

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.28 * customVolume, ctx.currentTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.25);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 1.3);
      osc2.stop(ctx.currentTime + 1.3);
    }
    // 7. ERROR / FAILS: Womp-womp descending sad cartoon buzzer
    else if (id.includes('error') || id.includes('falla') || id.includes('zumbador') || id.includes('buzzer') || id.includes('triste') || id.includes('falso')) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterFxGain());
      osc.type = 'sawtooth';
      
      osc.frequency.setValueAtTime(130, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.32 * baseVolume, ctx.currentTime + 0.012);
      gain.gain.setValueAtTime(0.32 * baseVolume, ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
    // 8. COINS / MONEDAS: Beautiful cascading minor/major triad sound of slot machine
    else if (id.includes('coin') || id.includes('dinero') || id.includes('fichas') || id.includes('monedas') || id.includes('caja') || id.includes('liquidaci')) {
      const tones = [987.77, 1318.51, 1567.98, 1975.53]; // B5 -> E6 -> G6 -> B6
      tones.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(getMasterFxGain());
        osc.type = i === 1 ? 'square' : 'sine';
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.08);

        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.18 * baseVolume, ctx.currentTime + i * 0.08 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.45);

        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.48);
      });
    }
    // 9. CHEER / LAUGHTER FUN: Sparkling upward chime cascades + celebratory shouts
    else if (id.includes('cheer') || id.includes('wahoo') || id.includes('alegr') || id.includes('sorpresa') || id.includes('gritar')) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterFxGain());
      osc.type = 'triangle';
      
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.22);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.45);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25 * baseVolume, ctx.currentTime + 0.04);
      gain.gain.linearRampToValueAtTime(0.25 * baseVolume, ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.52);
    }
    // 10. LASER / PARTY ZAP: Punchy high-pass Sci-Fi retro futuristic laser zap
    else if (id.includes('laser') || id.includes('disparo') || id.includes('universo') || id.includes('rayo') || id.includes('cruce') || id.includes('sintetizador')) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterFxGain());
      osc.type = 'sawtooth';

      osc.frequency.setValueAtTime(1900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(95, ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.22 * baseVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
    // 11. LAUGH / RISAS: A hilarious vocalized laughing sound effect
    else if (id.includes('laugh') || id.includes('risa') || id.includes('carcajadas') || id.includes('humor') || id.includes('sonrisa') || id.includes('colectivo')) {
      const pulses = 5;
      for (let i = 0; i < pulses; i++) {
        const start = i * 0.16;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(getMasterFxGain());
        osc.type = 'triangle';
        
        osc.frequency.setValueAtTime(320, ctx.currentTime + start);
        osc.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + start + 0.045);
        osc.frequency.linearRampToValueAtTime(260, ctx.currentTime + start + 0.14);

        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.22 * baseVolume, ctx.currentTime + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.14);

        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.15);
      }
    }
    // 12. WHISTLE / CARNAVAL: Nítido referee whistle with amplitude AM flutter modulation
    else if (id.includes('whistle') || id.includes('pito') || id.includes('silbato') || id.includes('árbitro') || id.includes('presi') || id.includes('competic')) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterFxGain());
      osc.type = 'sine';

      // Modulator to generate nítido referee whistle flutter tone
      const vibOsc = ctx.createOscillator();
      const vibGain = ctx.createGain();
      vibOsc.frequency.value = 25; // 25 Hz flutter rate
      vibGain.gain.value = 50; // Frequency swing
      
      vibOsc.connect(vibGain);
      vibGain.connect(osc.frequency);

      osc.frequency.setValueAtTime(1450, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1650, ctx.currentTime + 0.1);
      osc.frequency.linearRampToValueAtTime(1350, ctx.currentTime + 0.32);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.24 * baseVolume, ctx.currentTime + 0.015);
      gain.gain.linearRampToValueAtTime(0.24 * baseVolume, ctx.currentTime + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);

      vibOsc.start(ctx.currentTime);
      osc.start(ctx.currentTime);

      vibOsc.stop(ctx.currentTime + 0.33);
      osc.stop(ctx.currentTime + 0.33);
    }
    // Default: sweet chiptune coin notification sound
    else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(getMasterFxGain());
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1046, ctx.currentTime + 0.2);
      
      gain.gain.setValueAtTime(0.15 * baseVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (error) {
    console.warn('AudioContext synth error:', error);
  }
};
