import { useCallback } from 'react';
import { speakNativeText, cancelSpeech, announceBall, setWinnerSpeechActive, getIsWinnerSpeechActive } from '../utils/speech';

export const useTTS = () => {
  const speak = useCallback(async (text: string): Promise<void> => {
    return speakNativeText(text);
  }, []);

  const speakNative = useCallback((text: string) => {
    speakNativeText(text);
  }, []);

  const speakBall = useCallback((ball: number) => {
    announceBall(ball);
  }, []);

  const stop = useCallback((force: boolean = false) => {
    cancelSpeech(force);
  }, []);

  return { 
    speak, 
    speakNative, 
    speakBall, 
    stop, 
    setWinnerSpeechActive, 
    getIsWinnerSpeechActive 
  };
};
