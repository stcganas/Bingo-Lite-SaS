import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Mic, MicOff } from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/api';

interface AIChatAgentProps {
  onClose?: () => void;
  aiModel?: string;
  knowledgeBase?: string;
}

export default function AIChatAgent({ onClose, aiModel, knowledgeBase }: AIChatAgentProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const inputRef = useRef(input);
  const handleSendRef = useRef<() => void>(undefined);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    try {
      const welcomeMsg = '¡Hola! Soy el asistente virtual del Bingo. ¿En qué te puedo ayudar hoy? Pregúntame sobre las reglas, cómo jugar o cómo comprar cartones.';
      setMessages([{ role: 'model', text: welcomeMsg }]);
    } catch (error) {
      console.error("Error initializing AI chat:", error);
      setMessages([{ role: 'model', text: 'Error al inicializar el asistente. Por favor, verifica la configuración.' }]);
    }
    
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleListen = async () => {
    if (isListening) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      setIsListening(false);
    } else {
      // Start recording
      try {
        toast('Por favor, permite el acceso al micrófono en tu navegador.', { icon: '🎙️' });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          setIsTranscribing(true);
          try {
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              const base64data = (reader.result as string).split(',')[1];
              
              const res = await apiFetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: aiModel || "gemini-2.5-flash",
                  contents: [
                    {
                      parts: [
                        { inlineData: { data: base64data, mimeType: audioBlob.type || 'audio/webm' } },
                        { text: 'Transcribe this audio exactly as spoken in Spanish. Return ONLY the transcription, nothing else. If it is empty or unintelligible, return nothing.' }
                      ]
                    }
                  ]
                })
              });
              
              const response = await res.json();
              const transcription = response.text?.trim();
              if (transcription) {
                setInput(transcription);
                // Wait a tiny bit for state to update then send
                setTimeout(() => {
                  if (handleSendRef.current) handleSendRef.current();
                }, 100);
              } else {
                toast.error("No se pudo entender el audio.");
              }
              setIsTranscribing(false);
            };
          } catch (error) {
            console.error("Error transcribing audio:", error);
            toast.error("Error al procesar el audio.");
            setIsTranscribing(false);
          }
        };

        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        setIsListening(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        toast.error("No se pudo acceder al micrófono. Verifica los permisos.");
      }
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const userText = inputRef.current.trim();
    if (!userText || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setInput('');
    setIsLoading(true);

    // Add empty model message to stream into
    setMessages(prev => [...prev, { role: 'model', text: '' }]);

    try {
      const systemInstruction = `Eres un asistente virtual amigable para un juego de Bingo online. Tu objetivo es ayudar a los jugadores a entender cómo jugar, cómo comprar cartones, las reglas del juego y cualquier otra información relacionada con el bingo. Reglas generales: El administrador canta las balotas (B1-B15, I16-I30, N31-N45, G46-G60, O61-O75). Los jugadores marcan los números en sus cartones. Para ganar, el jugador debe completar el patrón activo (ej. Línea, Cuatro Esquinas, Cartón Lleno). Una vez completado, el jugador debe presionar el botón '¡CANTAR BINGO!'. Para comprar cartones, los jugadores deben contactar al administrador. Sé conciso, útil y usa un tono entusiasta. Habla de forma natural y humanizada. ${knowledgeBase ? `Información adicional de conocimiento: ${knowledgeBase}` : ''}`;
      
      const sessionDataStr = sessionStorage.getItem('supabase.auth.token');
      const token = sessionDataStr ? JSON.parse(sessionDataStr)?.access_token : undefined;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: aiModel || "gemini-2.5-flash",
          contents: messages.concat([{ role: 'user', text: userText }]).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          config: {
            systemInstruction
          }
        })
      });
      
      if (!res.ok) throw new Error('Failed to generate response');
      if (!res.body) throw new Error('No streaming body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let fullText = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') {
                done = true;
                break;
              }
              try {
                const data = JSON.parse(dataStr);
                if (data.error) throw new Error(data.error);
                if (data.text) {
                  fullText += data.text;
                  
                  setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].text = fullText;
                    return newMessages;
                  });
                }
              } catch (e) {
                // Ignore parsing errors for partial chunks if any
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].text = 'Hubo un error al conectar con el asistente. Por favor, intenta de nuevo.';
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Keep ref updated for auto-send
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 bg-purple-600 text-white flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <Bot size={24} />
          <h3 className="font-bold">Asistente de Bingo</h3>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button onClick={onClose} className="hover:bg-purple-700 p-2 rounded-full transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={clsx(
              "max-w-[85%] rounded-2xl p-3",
              msg.role === 'user' 
                ? "bg-purple-600 text-white ml-auto rounded-tr-sm" 
                : "bg-white border border-slate-200 text-slate-800 mr-auto rounded-tl-sm shadow-sm"
            )}
          >
            {msg.role === 'model' ? (
              <div className="markdown-body text-sm prose prose-sm prose-slate max-w-none">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm">{msg.text}</p>
            )}
          </div>
        ))}
        {(isLoading || isTranscribing) && (
          <div className="bg-white border border-slate-200 text-slate-800 mr-auto rounded-2xl rounded-tl-sm shadow-sm p-3 max-w-[85%] flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-purple-600" />
            {isTranscribing && <span className="text-xs text-slate-500">Procesando audio...</span>}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 flex gap-2 items-center">
        <button
          type="button"
          onClick={toggleListen}
          className={clsx(
            "p-2 rounded-xl transition-colors flex items-center justify-center",
            isListening 
              ? "bg-red-100 text-red-600 animate-pulse" 
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
          title={isListening ? "Detener grabación" : "Hablar"}
        >
          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? "Escuchando... (toca para detener)" : "Escribe tu pregunta..."}
          className="flex-1 bg-slate-100 border-transparent focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 rounded-xl px-4 py-2 text-sm transition-all outline-none"
          disabled={isLoading || isTranscribing}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading || isTranscribing}
          className="bg-purple-600 text-white p-2 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:hover:bg-purple-600 flex items-center justify-center"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
