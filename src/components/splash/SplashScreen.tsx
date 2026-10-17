import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import WelcomeText from './WelcomeText';
import LogoReveal from './LogoReveal';
import BingoParticles from './BingoParticles';

interface SplashScreenProps {
  onComplete: () => void;
}

const getAudioContext = () => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
};

const playSplashStadium = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    
    // Background creative track (synth chords)
    // C major 7 chord
    [261.63, 329.63, 392.00, 493.88].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 4.6);
    });

    // Fun upbeat melody sequence
    const melody = [
      { f: 523.25, time: 0 },
      { f: 659.25, time: 0.2 },
      { f: 783.99, time: 0.4 },
      { f: 1046.50, time: 0.6 },
      { f: 1318.51, time: 1.4 }, // Big reveal note matches impact timing
      { f: 1567.98, time: 1.6 },
      { f: 2093.00, time: 1.8 },
      { f: 2637.02, time: 2.2 }, // Sparkle trail
    ];

    melody.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.f, ctx.currentTime + note.time);
      gain.gain.setValueAtTime(0, ctx.currentTime + note.time);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + note.time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + note.time + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + note.time);
      osc.stop(ctx.currentTime + note.time + 0.6);
    });
  } catch(e) {}
};

const playSweepSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    // Magical sweep up for text reveal
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 1.5);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.5);

    // Add some magical sparkles (arpeggio)
    const sparkles = [440, 554, 659, 880, 1108, 1318, 1760];
    sparkles.forEach((freq, idx) => {
      const sOsc = ctx.createOscillator();
      const sGain = ctx.createGain();
      sOsc.type = 'triangle';
      sOsc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
      
      sGain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.15);
      sGain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + idx * 0.15 + 0.05);
      sGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.15 + 0.4);
      
      sOsc.connect(sGain);
      sGain.connect(ctx.destination);
      sOsc.start(ctx.currentTime + idx * 0.15);
      sOsc.stop(ctx.currentTime + idx * 0.15 + 0.5);
    });
  } catch(e) {}
};

const playImpactMagic = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    // Explosion thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);

    // Magic chime
    [440, 554.37, 659.25, 880, 1108.73, 1318.51].forEach((freq, idx) => {
      const gOsc = ctx.createOscillator();
      const gGain = ctx.createGain();
      gOsc.type = 'sine';
      gOsc.frequency.setValueAtTime(freq, ctx.currentTime);
      
      const startTime = ctx.currentTime + idx * 0.08;
      gGain.gain.setValueAtTime(0, startTime);
      gGain.gain.linearRampToValueAtTime(0.3, startTime + 0.1);
      gGain.gain.exponentialRampToValueAtTime(0.01, startTime + 2.5);
      
      gOsc.connect(gGain);
      gGain.connect(ctx.destination);
      gOsc.start(startTime);
      gOsc.stop(startTime + 2.6);
    });
  } catch(e) {}
};

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    playSplashStadium();

    // Stage 0 -> 1: Balls drop
    const t1 = setTimeout(() => {
      setStage(1);
      playSweepSound();
    }, 100);
    
    // Stage 1 -> 2: Ball impacts / Bingo Lite Reveal
    const t2 = setTimeout(() => {
      setStage(2);
      playImpactMagic();
    }, 2400);

    // Stage 2 -> 3: Finish splash (Extended to give Bingo Lite more screen time)
    const t3 = setTimeout(() => setStage(3), 5500);

    // End splash (total 6000ms duration)
    const t4 = setTimeout(() => {
      onComplete();
    }, 6000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {stage < 3 && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center overflow-hidden"
        >
          {/* Background Stadium Glow */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[150%] h-[150%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/30 via-slate-950 to-slate-950 opacity-80" />
            
            {/* Stadium Lights */}
            <motion.div 
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute top-0 left-[20%] w-32 h-64 bg-yellow-500/10 blur-3xl transform -rotate-45"
            />
            <motion.div 
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              className="absolute top-0 right-[20%] w-32 h-64 bg-blue-500/10 blur-3xl transform rotate-45"
            />
          </div>

          {/* Interactive Elements */}
          <div className="relative w-full h-full flex flex-col items-center justify-center perspective-[1000px]">
            {stage < 2 && <WelcomeText stage={stage} />}
            
            {stage >= 2 && <BingoParticles />}
            {stage >= 2 && <LogoReveal />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
