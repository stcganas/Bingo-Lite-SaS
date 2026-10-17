import { motion } from 'motion/react';

export default function LogoReveal() {
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0, filter: 'blur(20px)' }}
      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
      transition={{ 
        type: 'spring', 
        stiffness: 200, 
        damping: 15,
        duration: 0.8
      }}
      className="absolute flex flex-col items-center justify-center z-50"
    >
      <div className="relative">
        {/* Glow */}
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5]
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 bg-yellow-400 blur-3xl rounded-full z-0" 
        />
        
        {/* Main Logo Text */}
        <div className="relative z-10 text-center">
          <motion.h1 
            className="text-6xl md:text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-yellow-500 to-amber-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] pr-2 pb-1"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
          >
            BINGO
          </motion.h1>
          <motion.h2 
            className="text-3xl md:text-4xl font-extrabold tracking-widest text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)] uppercase mt-[-10px]"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Lite
          </motion.h2>
        </div>
      </div>
    </motion.div>
  );
}
