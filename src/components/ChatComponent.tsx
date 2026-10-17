import React, { useState, useEffect, useRef } from 'react';
import { Send, User as UserIcon, ShieldCheck, X, Lock, Unlock, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useAuth } from '../AuthContext';
import { getBingoChannel } from '../ably';

interface Message {
  id: string;
  text?: string;
  sender: string;
  isAdmin: boolean;
  timestamp: any;
  isPrivate?: boolean;
  targetUser?: string;
}

interface ChatComponentProps {
  userName: string;
  isAdmin?: boolean;
  onNewMessage?: () => void;
  isChatEnabled?: boolean;
  onToggleChat?: (enabled: boolean) => void;
  onClose?: () => void;
}

export default function ChatComponent({ 
  userName, 
  isAdmin = false, 
  onNewMessage,
  isChatEnabled = true,
  onToggleChat,
  onClose
}: ChatComponentProps) {
  const { user } = useAuth();
  const channel = getBingoChannel();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [replyingToUser, setReplyingToUser] = useState<string | null>(null);
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !channel) return;

    // Load history
    const loadHistory = async () => {
      try {
        const result = await channel.history({ limit: 50 });
        if (result && result.items) {
          const historyMsgs = result.items
            .filter(item => item.name === 'chat_message')
            .map(item => item.data)
            .reverse();
          
          const filteredMsgs = historyMsgs.filter(msg => {
            if (!msg.isPrivate) return true;
            if (isAdmin) {
              return msg.targetUser === 'Administrador' || msg.sender === userName || msg.targetUser === userName;
            } else {
              return msg.targetUser === userName || msg.sender === userName;
            }
          });
          setMessages(filteredMsgs);
        }
      } catch (err: any) {
        // Ignore timeout/abort errors which happen when Ably is not configured, offline, or request takes too long
        const errMsg = (err?.message || '').toLowerCase();
        if (errMsg.includes('timeout') || errMsg.includes('abort') || errMsg.includes('closed')) {
          console.warn('Ably history load timeout/abort (likely network issue or not configured).');
        } else {
          console.error('Error loading history:', err);
        }
      }
    };
    loadHistory();

    const onMessage = (ablyMsg: any) => {
      const msg = ablyMsg.data;
      if (!msg.isPrivate || 
         (isAdmin && (msg.targetUser === 'Administrador' || msg.sender === userName || msg.targetUser === userName)) ||
         (!isAdmin && (msg.targetUser === userName || msg.sender === userName))) {
        
        setMessages(prev => [...prev, msg]);
        if (onNewMessage) onNewMessage();
      }
    };

    channel.subscribe('chat_message', onMessage);

    return () => {
      channel.unsubscribe('chat_message', onMessage);
    };
  }, [user, isAdmin, userName, onNewMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleMessageClick = (msg: Message) => {
    if (msg.sender !== userName) {
      setReplyingToUser(msg.sender);
      if (msg.isPrivate) {
        setIsPrivateMode(true);
      }
      
      const mention = `@${msg.sender} `;
      if (!inputValue.startsWith(mention)) {
        const cleanedInput = inputValue.replace(/^@.+?\s/, '');
        setInputValue(mention + cleanedInput);
      }
      inputRef.current?.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (replyingToUser && !val.includes(`@${replyingToUser}`)) {
      setReplyingToUser(null);
      if (isPrivateMode && isAdmin) {
        setIsPrivateMode(false);
      }
    }
  };

  const handleEmojiClick = (emojiObject: any) => {
    setInputValue(prev => prev + emojiObject.emoji);
    inputRef.current?.focus();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !isChatEnabled) return;

    let targetUser = undefined;
    if (isPrivateMode) {
      if (isAdmin) {
        if (!replyingToUser) {
          alert("Para enviar un mensaje privado, debes responder a un usuario específico.");
          return;
        }
        targetUser = replyingToUser;
      } else {
        targetUser = 'Administrador';
      }
    }

    try {
      const newMsg = {
        id: Date.now().toString(),
        text: inputValue,
        sender: userName,
        isAdmin: isAdmin,
        isPrivate: isPrivateMode,
        targetUser: targetUser,
        timestamp: new Date().toISOString()
      };
      
      await channel.publish('chat_message', newMsg);

      setInputValue('');
      setReplyingToUser(null);
      setIsPrivateMode(false);
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800 p-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-sm uppercase tracking-widest flex items-center gap-2">
            <div className={clsx("w-2 h-2 rounded-full", isChatEnabled ? "bg-green-500 animate-pulse" : "bg-red-500")} />
            Chat en Vivo
          </h3>
          {isAdmin && onToggleChat && (
            <button
              onClick={() => onToggleChat(!isChatEnabled)}
              className={clsx(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                isChatEnabled ? "bg-green-500" : "bg-slate-500"
              )}
            >
              <span
                className={clsx(
                  "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                  isChatEnabled ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400 font-bold uppercase">
            {messages.length} mensajes
          </span>
          {onClose && (
            <button onClick={onClose} className="hover:bg-slate-700 p-1.5 rounded-full transition-colors">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-50"
      >
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-6">
              <UserIcon size={32} className="mb-2 opacity-20" />
              <p className="text-xs font-medium italic">¡Sé el primero en saludar!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: msg.sender === userName ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={clsx(
                  "flex flex-col max-w-[85%]",
                  msg.sender === userName ? "ml-auto items-end" : "items-start"
                )}
              >
                <div className="flex items-center gap-1 mb-1 px-1">
                  {msg.isAdmin && <ShieldCheck size={12} className="text-blue-600" />}
                  <span className={clsx(
                    "text-[10px] font-black uppercase tracking-tighter",
                    msg.isAdmin ? "text-blue-600" : "text-slate-500"
                  )}>
                    {msg.sender}
                  </span>
                </div>
                <div 
                  className={clsx(
                    "px-4 py-2 rounded-2xl text-sm shadow-sm relative group cursor-pointer transition-all",
                    msg.sender === userName 
                      ? (msg.isPrivate ? "bg-purple-600 text-white rounded-tr-none" : "bg-blue-600 text-white rounded-tr-none")
                      : (msg.isPrivate ? "bg-purple-100 text-purple-900 border border-purple-200 rounded-tl-none" : "bg-white text-slate-800 border border-slate-200 rounded-tl-none")
                  )}
                  onClick={() => handleMessageClick(msg)}
                >
                  {msg.isPrivate && (
                    <div className="flex items-center gap-1 text-[10px] opacity-75 mb-1 font-bold">
                      <Lock size={10} />
                      Privado
                    </div>
                  )}
                  {msg.text}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="relative">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-full right-0 mb-2 z-50"
            >
              <div className="shadow-2xl rounded-2xl overflow-hidden border border-slate-200">
                <EmojiPicker 
                  onEmojiClick={handleEmojiClick}
                  theme={Theme.LIGHT}
                  searchDisabled={false}
                  skinTonesDisabled
                  height={350}
                  width={300}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <form 
          onSubmit={handleSendMessage}
          className="p-3 bg-white border-t border-slate-100 flex flex-col gap-2"
        >
        {replyingToUser && (
          <div className="flex items-center justify-between text-[10px] bg-slate-100 p-2 rounded-lg">
            <span>Respondiendo a <strong className="font-bold">{replyingToUser}</strong></span>
            <button 
              type="button" 
              onClick={() => {
                setReplyingToUser(null);
                setIsPrivateMode(false);
                setInputValue(inputValue.replace(/^@.+?\s/, ''));
              }} 
              className="text-slate-500 hover:text-red-500"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => {
              if (!isPrivateMode && isAdmin && !replyingToUser) {
                alert("Para enviar un mensaje privado, primero haz clic en un mensaje del jugador al que deseas responder.");
                return;
              }
              setIsPrivateMode(!isPrivateMode);
            }}
            className={clsx(
              "p-2 rounded-xl transition-all",
              isPrivateMode ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
            )}
            title={isPrivateMode ? "Mensaje Privado Activado" : "Mensaje Privado"}
            disabled={!isChatEnabled && !isAdmin}
          >
            {isPrivateMode ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
          <div className="relative flex-1 flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder={isChatEnabled ? "Escribe un mensaje..." : "El chat está deshabilitado"}
              disabled={!isChatEnabled && !isAdmin}
              className="w-full bg-slate-100 border-none rounded-xl pl-4 pr-10 py-2 text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={clsx(
                "absolute right-1 p-1.5 rounded-lg transition-all",
                showEmojiPicker ? "bg-yellow-100 text-yellow-600" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              )}
              disabled={!isChatEnabled && !isAdmin}
            >
              <Smile size={18} />
            </button>
          </div>
          <button 
            type="submit"
            disabled={!inputValue.trim() || (!isChatEnabled && !isAdmin)}
            className={clsx(
              "text-white p-2 rounded-xl transition-all active:scale-90",
              isPrivateMode ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700",
              "disabled:bg-slate-200"
            )}
          >
            <Send size={18} />
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
