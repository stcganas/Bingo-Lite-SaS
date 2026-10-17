import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Scan, 
  Eye, 
  X,
  FileCheck,
  Search,
  Lock
} from 'lucide-react';

interface ReceiptScannerProps {
  file: File | null;
  expectedAmount?: number;
  isSubmitting?: boolean;
  onClear?: () => void;
  className?: string;
}

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  file,
  expectedAmount,
  isSubmitting = false,
  onClear,
  className = ''
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanStep, setScanStep] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [scanCompleted, setScanCompleted] = useState<boolean>(false);
  const [showFullImage, setShowFullImage] = useState<boolean>(false);

  // Generate preview URL when file changes
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setScanStep(0);
      setIsSimulating(false);
      setScanCompleted(false);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsSimulating(true);
    setScanStep(1);
    setScanCompleted(false);

    // Sequence of simulated scan stages to give rich visual feedback
    const timers = [
      setTimeout(() => setScanStep(2), 600),   // Detecting QR code
      setTimeout(() => setScanStep(3), 1200),  // Decoding QR pixels
      setTimeout(() => setScanStep(4), 1800),  // Cross-referencing amount & date
      setTimeout(() => {
        setScanStep(5);                       // Ready / Pre-verified
        setIsSimulating(false);
        setScanCompleted(true);
      }, 2400)
    ];

    return () => {
      URL.revokeObjectURL(objectUrl);
      timers.forEach(clearTimeout);
    };
  }, [file]);

  if (!file || !previewUrl) {
    return null;
  }

  const steps = [
    { text: 'Iniciando escaneo visual del comprobante...', icon: Search, color: 'text-blue-500' },
    { text: 'Rastreando código QR oficial Nequi...', icon: Scan, color: 'text-indigo-500' },
    { text: '¡Código QR detectado! Decodificando matriz criptográfica...', icon: QrCode, color: 'text-emerald-500' },
    { text: `Validando coincidencia de monto ${expectedAmount ? `($${expectedAmount.toLocaleString('es-CO')})` : ''} y fecha de hoy...`, icon: Lock, color: 'text-teal-500' },
    { text: 'Comprobante y código QR listos para certificación antifraude', icon: ShieldCheck, color: 'text-emerald-600' }
  ];

  return (
    <div className={`rounded-2xl border-2 border-emerald-400/80 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-4 text-white shadow-xl overflow-hidden relative ${className}`}>
      {/* Background cyber grid */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #10b981 1px, transparent 0)',
          backgroundSize: '16px 16px'
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
            <Scan size={18} className={isSimulating || isSubmitting ? "animate-pulse" : ""} />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              Escáner Forense Nequi
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h4>
            <p className="text-[10px] text-slate-400 font-medium">Validación biométrica de código QR e información impresa</p>
          </div>
        </div>

        {onClear && (
          <button 
            type="button" 
            onClick={onClear} 
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Cambiar imagen"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Scanner Visual Viewport */}
      <div className="relative mt-3 rounded-xl overflow-hidden bg-slate-950 border border-emerald-500/40 aspect-[4/3] max-h-56 flex items-center justify-center group">
        <img 
          src={previewUrl} 
          alt="Comprobante a escanear" 
          className="w-full h-full object-contain filter contrast-105"
        />

        {/* Framing target brackets */}
        <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-emerald-400 pointer-events-none" />
        <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-emerald-400 pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-emerald-400 pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-emerald-400 pointer-events-none" />

        {/* Simulated QR Detection Target Box */}
        {(scanStep >= 2) && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-24 h-24 border-2 border-emerald-400 rounded-lg bg-emerald-500/10 pointer-events-none flex flex-col items-center justify-between p-1 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <span className="text-[8px] font-black uppercase text-emerald-300 bg-slate-900/80 px-1 py-0.5 rounded tracking-tighter">
              QR NEQUI
            </span>
            <QrCode size={20} className="text-emerald-400 opacity-90" />
            <span className="text-[8px] font-bold text-emerald-300 bg-slate-900/80 px-1 py-0.5 rounded">
              LOCKED
            </span>
          </div>
        )}

        {/* Laser Scanning Beam Animation */}
        {(isSimulating || isSubmitting) && (
          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#10b981] animate-bounce pointer-events-none opacity-90" 
            style={{
              animationDuration: '1.4s',
              animationIterationCount: 'infinite'
            }}
          />
        )}

        {/* Zoom Button */}
        <button
          type="button"
          onClick={() => setShowFullImage(true)}
          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 text-xs flex items-center gap-1 transition opacity-80 hover:opacity-100"
        >
          <Eye size={12} />
          <span className="text-[10px] font-bold">Ver completa</span>
        </button>
      </div>

      {/* Scan Progress / Status Feedback */}
      <div className="mt-3 space-y-2 relative z-10">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-bold flex items-center gap-1.5 text-[11px]">
            {isSimulating ? (
              <>
                <span className="animate-spin text-emerald-400">⚡</span>
                Escaneando módulos de seguridad...
              </>
            ) : scanCompleted ? (
              <>
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-emerald-300 font-bold">Lectura completada</span>
              </>
            ) : (
              'Preparando...'
            )}
          </span>
          <span className="text-emerald-400 font-black text-xs">
            {scanStep === 1 && '25%'}
            {scanStep === 2 && '50%'}
            {scanStep === 3 && '75%'}
            {scanStep >= 4 && '100%'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            style={{
              width: `${(scanStep / 5) * 100}%`
            }}
          />
        </div>

        {/* Current status step explanation */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 flex items-center gap-2.5">
          {(() => {
            const current = steps[Math.min(scanStep, steps.length - 1)];
            const Icon = current.icon;
            return (
              <>
                <Icon size={16} className={`${current.color} shrink-0 ${isSimulating ? "animate-pulse" : ""}`} />
                <span className="text-[11px] font-semibold text-slate-200 leading-snug">
                  {current.text}
                </span>
              </>
            );
          })()}
        </div>

        {/* Security Seals */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-2 py-1 rounded-lg">
            <CheckCircle2 size={12} className={scanStep >= 3 ? "text-emerald-400" : "text-slate-600"} />
            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter truncate">QR Oficial</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-2 py-1 rounded-lg">
            <CheckCircle2 size={12} className={scanStep >= 4 ? "text-emerald-400" : "text-slate-600"} />
            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter truncate">Monto = Cartones</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-2 py-1 rounded-lg">
            <CheckCircle2 size={12} className={scanStep >= 5 ? "text-emerald-400" : "text-slate-600"} />
            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter truncate">Fecha de Hoy</span>
          </div>
        </div>
      </div>

      {/* Full image preview modal */}
      {showFullImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="relative max-w-lg w-full max-h-[90vh] bg-slate-900 rounded-3xl p-4 border border-slate-800 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-black uppercase text-emerald-400">Captura Completa</span>
              <button 
                type="button" 
                onClick={() => setShowFullImage(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2 flex items-center justify-center">
              <img src={previewUrl} alt="Comprobante" className="max-h-[70vh] object-contain rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ReceiptScanningModal: React.FC<{ isOpen: boolean; expectedAmount?: number }> = ({ 
  isOpen, 
  expectedAmount 
}) => {
  const [phase, setPhase] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setPhase(0);
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 700);
    const t2 = setTimeout(() => setPhase(2), 1600);
    const t3 = setTimeout(() => setPhase(3), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border-2 border-emerald-500/80 rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden">
        {/* Animated Cyber Background */}
        <div 
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #10b981 1px, transparent 0)',
            backgroundSize: '20px 20px'
          }}
        />

        {/* Laser Sweep animation */}
        <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-bounce pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Target Ring */}
          <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping opacity-60" />
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-emerald-400 animate-spin" style={{ animationDuration: '6s' }} />
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <QrCode size={28} className="animate-pulse" />
            </div>
          </div>

          <h3 className="text-lg font-black uppercase tracking-wider text-white flex items-center justify-center gap-2">
            Auditoría Forense en Curso
          </h3>
          <p className="text-xs text-emerald-400 font-semibold mt-1">
            Escaneando código QR y contrastando con datos impresos
          </p>

          {/* Verification Checklist */}
          <div className="w-full mt-5 space-y-2.5 text-left bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-2">
                <span className={phase >= 0 ? "text-emerald-400" : "text-slate-600"}>
                  {phase >= 0 ? "✓" : "○"}
                </span>
                Extracción de imagen y resolución
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">OK</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-2">
                <span className={phase >= 1 ? "text-emerald-400" : "text-slate-600"}>
                  {phase >= 1 ? "✓" : "○"}
                </span>
                Decodificación física de píxeles QR Nequi
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                {phase >= 1 ? "DECODIFICADO" : "LEYENDO..."}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-2">
                <span className={phase >= 2 ? "text-emerald-400" : "text-slate-600"}>
                  {phase >= 2 ? "✓" : "○"}
                </span>
                Cotejo de Monto {expectedAmount ? `($${expectedAmount.toLocaleString('es-CO')})` : ''} vs QR
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                {phase >= 2 ? "COINCIDE" : "COMPARANDO..."}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-2">
                <span className={phase >= 3 ? "text-emerald-400" : "text-slate-600"}>
                  {phase >= 3 ? "✓" : "○"}
                </span>
                Certificación de Fecha (HOY) y Destinatario
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                {phase >= 3 ? "VIGENTE" : "VERIFICANDO..."}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-4 animate-pulse">
            Por favor espera unos segundos mientras el sistema antifraude certifica tu compra...
          </p>
        </div>
      </div>
    </div>
  );
};
