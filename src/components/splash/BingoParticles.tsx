import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

// Generates random particles
const generateParticles = (count: number) => {
  return Array.from({ length: count }).map((_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * window.innerWidth * 1.5,
    y: (Math.random() - 0.5) * window.innerHeight * 1.5,
    size: Math.random() * 8 + 2,
    delay: Math.random() * 0.2
  }));
};

const BINGO_BALL_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500', 'bg-purple-500'];

export default function BingoParticles() {
  const [particles, setParticles] = useState<any[]>([]);

  useEffect(() => {
    setParticles(generateParticles(60));
  }, []);

  return (
    <>
      {/* Light Burst */}
      <motion.div
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="absolute w-64 h-64 bg-white rounded-full mix-blend-overlay blur-xl z-20"
      />
      <motion.div
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: [0, 8], opacity: [1, 0] }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="absolute w-32 h-32 bg-yellow-400 rounded-full blur-2xl z-10"
      />
      
      {/* Golden Particles Explosion */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 1, opacity: 0 }}
          transition={{ duration: 1.5, delay: p.delay, ease: "easeOut" }}
          className="absolute bg-yellow-400 rounded-full z-10"
          style={{ width: p.size, height: p.size, boxShadow: '0 0 10px #facc15' }}
        />
      ))}

      {/* Orbiting Bingo Balls */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="absolute w-[300px] h-[300px] md:w-[400px] md:h-[400px] z-30"
      >
        {BINGO_BALL_COLORS.map((color, i) => {
          const angle = (i * 360) / BINGO_BALL_COLORS.length;
          return (
            <motion.div
              key={`ball-${i}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.1, type: "spring" }}
              className={`absolute top-0 left-1/2 -ml-6 w-12 h-12 rounded-full shadow-xl flex items-center justify-center font-black text-white ${color} border-2 border-white/20`}
              style={{
                transformOrigin: `50% 150px`, // Orbit radius
                transform: `rotate(${angle}deg)`
              }}
            >
              <motion.span
                 // counter-rotate to keep numbers upright
                 animate={{ rotate: -360 }}
                 transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                 className="bg-white text-slate-800 w-8 h-8 rounded-full flex items-center justify-center text-sm"
              >
                {Math.floor(Math.random() * 75) + 1}
              </motion.span>
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
}
