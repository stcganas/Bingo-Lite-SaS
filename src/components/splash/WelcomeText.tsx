import { motion } from 'motion/react';

interface WelcomeTextProps {
  stage: number;
}

export default function WelcomeText({ stage }: WelcomeTextProps) {
  const letters = "A jugar con...".split('');

  const colors = [
    'text-blue-400', 'text-red-400', 'text-yellow-400', 'text-green-400', 'text-purple-400',
    'text-pink-400', 'text-indigo-400', 'text-emerald-400', 'text-orange-400', 'text-teal-400', 
    'text-rose-400', 'text-cyan-400', 'text-fuchsia-400', 'text-lime-400'
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40 overflow-hidden">
      <div className="flex justify-center items-center">
        {letters.map((char, i) => (
          <motion.span
            key={i}
            initial={{ y: 50, opacity: 0, scale: 0.5, rotate: Math.random() * 20 - 10 }}
            animate={
              stage >= 1
                ? { y: 0, opacity: 1, scale: 1, rotate: 0 }
                : {}
            }
            transition={{
              type: 'spring',
              damping: 8,
              stiffness: 150,
              delay: i * 0.08, // Staggered reveal
            }}
            className={`text-4xl sm:text-6xl md:text-7xl font-black ${colors[i % colors.length]} drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]`}
            style={{ 
              marginRight: char === ' ' ? '1rem' : '0.1rem',
              WebkitTextStroke: '2px rgba(255,255,255,0.5)' 
            }}
          >
            {char}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
