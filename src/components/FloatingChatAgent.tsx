import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Sparkles } from 'lucide-react';
import AIChatAgent from './AIChatAgent';
import clsx from 'clsx';
import { apiFetch } from '../utils/api';

export default function FloatingChatAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSettings = async () => {
      try {
        const res = await apiFetch('/api/app-settings');
        if (res.ok) {
          const data = await res.json();
          if (data.ai_chat_enabled === false) {
            setIsEnabled(false);
            setIsOpen(false);
          } else {
            setIsEnabled(true);
          }
        }
      } catch (err) {
        setIsEnabled(false);
      }
    };
    checkSettings();
  }, []);

  if (isEnabled === false || isEnabled === null) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
      {/* Tooltip / Welcome Message */}
      <AnimatePresence mode="wait">
        {showTooltip && !isOpen && (
          <motion.div
            key="chat-tooltip"
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="mb-4 bg-white px-4 py-2 rounded-2xl shadow-xl border border-purple-100 flex items-center gap-2 pointer-events-auto"
          >
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-bold text-slate-700">¡Hola! ¿Necesitas ayuda?</span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowTooltip(false);
              }}
              className="ml-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            key="chat-window-container"
            initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-[90vw] max-w-[400px] h-[600px] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-purple-100 overflow-hidden flex flex-col pointer-events-auto"
          >
            <AIChatAgent onClose={() => setIsOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        animate={!isOpen ? {
          y: [0, -4, 0],
          rotate: [0, -2, 2, -2, 0],
        } : {}}
        transition={!isOpen ? {
          duration: 4,
          repeat: Infinity,
          repeatType: "reverse",
          ease: "easeInOut"
        } : {}}
        onClick={() => {
          setIsOpen(!isOpen);
          setShowTooltip(false);
        }}
        className={clsx(
          "w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 pointer-events-auto relative",
          isOpen 
            ? "bg-slate-800 text-white rotate-90" 
            : "bg-gradient-to-br from-purple-600 to-indigo-700 text-white"
        )}
      >
        {/* Pulse Effect */}
        {!isOpen && (
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-purple-500 -z-10"
          />
        )}
        
        {isOpen ? (
          <X size={32} />
        ) : (
          <div className="relative">
            <MessageCircle size={32} fill="currentColor" className="opacity-20 absolute inset-0" />
            <MessageCircle size={32} className="relative z-10" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute -top-1 -right-1 text-yellow-300"
            >
              <Sparkles size={16} fill="currentColor" />
            </motion.div>
          </div>
        )}
      </motion.button>
    </div>
  );
}
