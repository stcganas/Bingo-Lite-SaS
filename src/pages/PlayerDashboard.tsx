import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trophy, RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock, Grid, Volume2, VolumeX, Radio, Maximize2, Minimize2, X, MessageSquare, Bot, Sparkles, Wallet, LogOut, Plus, Share2, Copy, MessageCircle, ChevronDown, ChevronUp, Users, List, BellRing, PlusCircle, Key, ShieldCheck, History } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, normalizePhone, comparePhones } from '../utils/format';
import BingoWinnerPopup from '../components/BingoWinnerPopup';
import GameSummaryPopup from '../components/GameSummaryPopup';
import PatternRow from '../components/PatternRow';
import BingoBoard from '../components/BingoBoard';
import ChatComponent from '../components/ChatComponent';
import AIChatAgent from '../components/AIChatAgent';
import LiveStream from '../components/LiveStream';
import NotificationBell from '../components/NotificationBell';
import WhatsAppLogo from '../components/WhatsAppLogo';
import { PWAInstallButton } from '../components/PWAInstallButton';
import PushSubscriptionBanner from '../components/PushSubscriptionBanner';
import { useTTS } from '../hooks/useTTS';
import { useAuth } from '../AuthContext';
import { useTenant } from '../TenantContext';
import { getBingoChannel, ably } from '../ably';
import { announceBall } from '../utils/speech';
import { playMarkSound, playUnmarkSound, playErrorSound, playChatOpenSound, playChatCloseSound, playSynthesizedDJEffect, getAudioContext, setGlobalFxVolume, getGlobalFxVolume, playBase64PCM, playFxFromUrl } from '../utils/sound';
import { Gift, Send, Info } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { checkCardPatternMatch, getAllWinningCellsForCard, getSafeCardGrid } from '../utils/bingo';
import FreeGamesLeaderboard from '../components/FreeGamesLeaderboard';
import { ReceiptScanner, ReceiptScanningModal } from '../components/ReceiptScanner';
import celebratingBingoBg from '../assets/images/celebrating_bingo_bg_1791949145658.jpg';

const normalizeBalls = (balls: any): number[] => {
  if (!balls) return [];
  let parsed = balls;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((b: any) => Number(b)).filter((n: number) => !isNaN(n) && n > 0);
};

export const getBallLetter = (ball: number): string => {
  if (ball >= 1 && ball <= 15) return 'B';
  if (ball >= 16 && ball <= 30) return 'I';
  if (ball >= 31 && ball <= 45) return 'N';
  if (ball >= 46 && ball <= 60) return 'G';
  if (ball >= 61 && ball <= 75) return 'O';
  return '';
};

export const getBallVisualTheme = (ball: number) => {
  const letter = getBallLetter(ball);
  switch (letter) {
    case 'B':
      return {
        letter: 'B',
        badgeBg: 'bg-rose-600',
        gradient: 'from-rose-500 via-red-600 to-rose-700',
        glow: 'shadow-rose-500/40',
        text: 'text-rose-600',
        border: 'border-rose-400',
        lightBg: 'bg-rose-50',
        chipBg: 'bg-rose-500 text-white'
      };
    case 'I':
      return {
        letter: 'I',
        badgeBg: 'bg-sky-600',
        gradient: 'from-sky-500 via-blue-600 to-indigo-700',
        glow: 'shadow-blue-500/40',
        text: 'text-blue-600',
        border: 'border-blue-400',
        lightBg: 'bg-blue-50',
        chipBg: 'bg-blue-600 text-white'
      };
    case 'N':
      return {
        letter: 'N',
        badgeBg: 'bg-amber-500',
        gradient: 'from-amber-400 via-orange-500 to-amber-600',
        glow: 'shadow-amber-500/40',
        text: 'text-amber-600',
        border: 'border-amber-400',
        lightBg: 'bg-amber-50',
        chipBg: 'bg-amber-500 text-white'
      };
    case 'G':
      return {
        letter: 'G',
        badgeBg: 'bg-emerald-600',
        gradient: 'from-emerald-400 via-green-600 to-emerald-700',
        glow: 'shadow-emerald-500/40',
        text: 'text-emerald-600',
        border: 'border-emerald-400',
        lightBg: 'bg-emerald-50',
        chipBg: 'bg-emerald-600 text-white'
      };
    case 'O':
      return {
        letter: 'O',
        badgeBg: 'bg-purple-600',
        gradient: 'from-purple-500 via-violet-600 to-indigo-800',
        glow: 'shadow-purple-500/40',
        text: 'text-purple-600',
        border: 'border-purple-400',
        lightBg: 'bg-purple-50',
        chipBg: 'bg-purple-600 text-white'
      };
    default:
      return {
        letter: '-',
        badgeBg: 'bg-slate-600',
        gradient: 'from-slate-500 via-slate-600 to-slate-700',
        glow: 'shadow-slate-500/40',
        text: 'text-slate-600',
        border: 'border-slate-400',
        lightBg: 'bg-slate-50',
        chipBg: 'bg-slate-600 text-white'
      };
  }
};

const getProxyUrl = (url: string): string => {
  if (!url) return '';
  if (url.includes('mixkit.co')) return ''; // Force fallback
  if (
    url.startsWith('/') || 
    url.startsWith('blob:') || 
    url.startsWith('data:') || 
    url.startsWith('http://localhost') || 
    url.includes('/api/audio-proxy') || 
    url.includes('ais-dev-') ||
    url.includes('githubusercontent.com') ||
    url.includes('supabase.co') ||
    url.includes('wikimedia.org')
  ) {
    return url;
  }
  return `/api/audio-proxy?url=${encodeURIComponent(url)}`;
};


export default function PlayerDashboard() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const { user, loading: authLoading, logout } = useAuth();
  const { tenantSlug, tenantPrefix } = useTenant();
  const fetchReferralStats = useCallback(async () => {
    if (!user?.phone) return;
    setIsFetchingStats(true);
    try {
      const res = await apiFetch(`/api/player/referral-stats/${user.phone}`);
      if (res.ok) {
        const data = await res.json();
        setReferralStats(data);
      }
    } catch (err) {
      // ignored
    } finally {
      setIsFetchingStats(false);
    }
  }, [user?.phone]);

  const handleShareReferralWhatsApp = (targetPhone?: string) => {
    const senderName = player?.name || user?.name || 'Tu amigo(a)';
    const refCode = referralStats?.referral_code || user?.phone || 'BINGO';
    const baseOrigin = window.location.origin.includes('localhost') || window.location.origin.includes('ais-dev-') 
      ? 'https://bingolite.click' 
      : window.location.origin;
    const refUrl = `${baseOrigin}/register?player_ref=${refCode}&ref=${refCode}`;
    const groupLink = gameState?.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk';

    const message = `¡Hola! 👋 Te saludo con mucho cariño y te traigo una excelente noticia ✨

Te invito cordialmente a ser parte de nuestra gran familia en *Bingo Lite* 👨‍👩‍👧‍👦🍀, donde la emoción y los premios en dinero real son de todos los días.

🎉 *¿Por qué unirte hoy mismo?*
🎁 *¡Tenemos Bingos 100% GRATIS todos los días!* Puedes jugar, cantar bingo y ganar sin pagar un solo peso.
💰 *Premios reales a tu Billetera:* Acumula saldo con cada victoria y sorteo.
💸 *Retiros Fáciles:* Cuando tus premios o ganancias acumuladas alcancen un monto de *$300.000 COP*, ¡puedes retirar tu dinero en cualquier momento directamente a tu Nequi de forma rápida y segura! 📲💵
🎰 *Sorteos y Loterías Nocturnas:* Participa con códigos de la suerte por premios sorpresa exclusivos.

👉 *Regístrate totalmente GRATIS con mi invitación oficial aquí:*
${refUrl}

*(O ingresa mi código de referido:* *#${refCode}* *al registrarte)*

🚨 *Paso fundamental:* Únete también a nuestro Grupo VIP de WhatsApp para validar tus jugadas y estar al día con los sorteos y transmisiones en vivo:
👉 ${groupLink}

¡Ven a jugar, divertirte en familia y ganar juntos! ¡Te esperamos! 🍀🥳👨‍👩‍👧‍👦`;

    const encoded = encodeURIComponent(message);
    let nativeUrl = `whatsapp://send?text=${encoded}`;
    let webUrl = `https://api.whatsapp.com/send?text=${encoded}`;

    if (targetPhone) {
      const clean = targetPhone.replace(/\D/g, '');
      const finalPhone = clean.length === 10 ? `57${clean}` : clean;
      nativeUrl = `whatsapp://send?phone=${finalPhone}&text=${encoded}`;
      webUrl = `https://wa.me/${finalPhone}?text=${encoded}`;
    }

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = nativeUrl;
    } else {
      const a = document.createElement('a');
      a.href = nativeUrl;
      a.target = '_top';
      document.body.appendChild(a);
      a.click();
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      } else {
        a.remove?.();
      }
    }

    toast.success("Abriendo WhatsApp para enviar invitación cordial...");
  };

  const sendInvite = () => {
    if (!invitePhone) {
      handleShareReferralWhatsApp();
      return;
    }
    handleShareReferralWhatsApp(invitePhone);
    setInvitePhone('');
  };

  useEffect(() => {
    if (user?.phone) {
      fetchReferralStats();
    }
  }, [user?.phone, fetchReferralStats]);

  const [player, setPlayer] = useState<any>(null);
  const effectiveTenant = slug || tenantSlug || (user?.tenant_id && user.tenant_id !== 'global' ? user.tenant_id : undefined) || (player?.tenant_id && player.tenant_id !== 'global' ? player.tenant_id : undefined);
  const channel = getBingoChannel(effectiveTenant);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(ably.connection.state === 'connected');

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const { speak, stop, speakNative, setWinnerSpeechActive } = useTTS();
  const lastAnnouncedBallIdRef = useRef<string | null>(null);
  const lastAnnouncedBallTimeRef = useRef<number>(0);
  
  const [savedLotteryCodes, setSavedLotteryCodes] = useState<Set<string>>(new Set());
  const [lotteryConfirmed, setLotteryConfirmed] = useState<boolean>(false);
  const [lotteryWinningCode, setLotteryWinningCode] = useState<string | null>(null);
  const [isLotteryWinner, setIsLotteryWinner] = useState<boolean>(false);
  const [cards, setCards] = useState<any[]>([]);
  const [allCards, setAllCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningLoading, setAssigningLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletActivated, setWalletActivated] = useState<boolean>(false);
  const [showWalletHistoryModal, setShowWalletHistoryModal] = useState(false);
  const [walletHistory, setWalletHistory] = useState<any[]>([]);

  // States for Wallet Recharge Modal
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeReceipt, setRechargeReceipt] = useState<File | null>(null);
  const [rechargeNote, setRechargeNote] = useState('');
  const [rechargeSubmitting, setRechargeSubmitting] = useState(false);
  const [rechargeStatus, setRechargeStatus] = useState<'idle' | 'success' | 'pending' | 'error'>('idle');
  const [rechargeError, setRechargeError] = useState('');
  const [gameState, setGameState] = useState<any>(null);

  // Cálculos reactivos de balotas salientes, contador y progreso
  const currentDrawnBalls = useMemo(() => {
    return normalizeBalls(gameState?.drawn_balls);
  }, [gameState?.drawn_balls]);

  const drawnBallsSet = useMemo(() => {
    return new Set<number>(currentDrawnBalls);
  }, [currentDrawnBalls]);

  const lastDrawnBall = currentDrawnBalls.length > 0 ? currentDrawnBalls[currentDrawnBalls.length - 1] : null;

  const recentDrawnBalls = useMemo(() => {
    if (currentDrawnBalls.length <= 1) return [];
    return currentDrawnBalls.slice(0, -1).slice(-6).reverse();
  }, [currentDrawnBalls]);

  const totalDrawn = currentDrawnBalls.length;
  const remainingBalls = Math.max(0, 75 - totalDrawn);
  const progressPercent = Math.min(100, Math.round((totalDrawn / 75) * 100));
  const [markedCells, setMarkedCells] = useState<Record<string, boolean>>({});
  const [winningCards, setWinningCards] = useState<Set<string>>(new Set());
  const [bingoLoading, setBingoLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);
  const [winner, setWinner] = useState<any>(null);
  const activeWinnerIdRef = useRef<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<any>(null);
  const [gameFinished, setGameFinished] = useState<any>(null);
  const [paymentBanner, setPaymentBanner] = useState<any>(null);
  const [contactBanner, setContactBanner] = useState(false);
  const [isAnnouncingWinner, setIsAnnouncingWinner] = useState(false);
  const isAnnouncingWinnerRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'all-cards' | 'board' | 'live' | 'lottery' | 'referrals' | 'free_winners'>('cards');
  const [lastAnnouncedIndex, setLastAnnouncedIndex] = useState(-1);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isLiveOpen, setIsLiveOpen] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isStreamMinimized, setIsStreamMinimized] = useState(false);
  const [isStreamMaximized, setIsStreamMaximized] = useState(false);
  const [isStreamMuted, setIsStreamMuted] = useState(true);
  const [twitchChannel, setTwitchChannel] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [isChatEnabled, setIsChatEnabled] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(true);
  const [referralStats, setReferralStats] = useState<any>(null);
  const [invitePhone, setInvitePhone] = useState('');
  const [isFetchingStats, setIsFetchingStats] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showGiftSecureModal, setShowGiftSecureModal] = useState(false);
  const [giftSecureCountdown, setGiftSecureCountdown] = useState(30);
  const [hasAutoShownSecureModal, setHasAutoShownSecureModal] = useState(false);
  const [showDashboardWelcomeModal, setShowDashboardWelcomeModal] = useState(false);
  const [showWhatsAppGroupModal, setShowWhatsAppGroupModal] = useState(false);

  // Sequential Modal Management Logic (WhatsApp Group -> Welcome/Gift Info)
  useEffect(() => {
    if (!player || !player.id) return;
    
    // Only proceed if no other auto-showing modal is currently active
    if (showWhatsAppGroupModal || showDashboardWelcomeModal || showGiftSecureModal) return;

    // Small delay to allow the dashboard to render and provide a better UX
    const timer = setTimeout(() => {
      // 1. Dashboard Welcome / Gift Received Modal (Priority 1 - for players who entered via gift)
      const isGuest = Boolean(player.receipt_url && (String(player.receipt_url).includes('GIFT') || String(player.receipt_url).includes('gift')));
      if (isGuest) {
        const welcomed = localStorage.getItem(`bingo_welcomed_guest_${player.id}`);
        const welcomeSkippedSession = sessionStorage.getItem(`bingo_welcome_skipped_${player.id}`);
        if (!welcomed && !welcomeSkippedSession) {
          setShowDashboardWelcomeModal(true);
          return;
        }
      }

      // 2. WhatsApp Group Modal (Priority 2)
      const whatsappSeen = localStorage.getItem(`bingo_whatsapp_group_joined_${player.id}`);
      const whatsappSkippedSession = sessionStorage.getItem(`bingo_whatsapp_skipped_${player.id}`);
      if (!whatsappSeen && !whatsappSkippedSession) {
        setShowWhatsAppGroupModal(true);
        return;
      }

      // 3. Gift Explanation Secure Modal (Priority 3 - for regular players)
      if (!isGuest && !hasAutoShownSecureModal) {
        const autoShown = localStorage.getItem(`bingo_gift_secure_autoshown_${player.id}`);
        const secureSkippedSession = sessionStorage.getItem(`bingo_secure_skipped_${player.id}`);
        if (!autoShown && !secureSkippedSession) {
          setShowGiftSecureModal(true);
          setHasAutoShownSecureModal(true);
          localStorage.setItem(`bingo_gift_secure_autoshown_${player.id}`, 'true');
        }
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [player, showWhatsAppGroupModal, showDashboardWelcomeModal, showGiftSecureModal, hasAutoShownSecureModal]);

  // Timer for gift secure modal automatic close after 30 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showGiftSecureModal) {
      setGiftSecureCountdown(30);
      timer = setInterval(() => {
        setGiftSecureCountdown((prev) => {
          if (prev <= 1) {
            setShowGiftSecureModal(false);
            if (player?.id) sessionStorage.setItem(`bingo_secure_skipped_${player.id}`, 'true');
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showGiftSecureModal]);

  // Helper to check if player has unlocked gifting (requires at least 2 active cards in play)
  const hasGiftAccess = (cards && cards.length >= 2) || (player?.card_count && player.card_count >= 2);

  // Check if current game is free or player has acquired free cards to disable buying/acquiring more
  const cardPriceNumber = Math.max(0, Number(String(gameState?.card_value ?? '').replace(/[^0-9.-]+/g, "")) || 0);
  const isFreeGame = Boolean(
    gameState?.is_free === true ||
    gameState?.is_free === 'true' ||
    gameState?.is_free === 1 ||
    gameState?.type === 'free' ||
    cardPriceNumber === 0 ||
    (typeof gameState?.card_value === 'string' && gameState?.card_value.toLowerCase().includes('gratis'))
  );
  const hasFreeCards = Boolean(
    (isFreeGame && cards && cards.length > 0) ||
    (player?.receipt_url && typeof player.receipt_url === 'string' && player.receipt_url.includes('FREE_GAME') && cards && cards.length > 0)
  );

  const handleOpenGiftModal = () => {
    if (!hasGiftAccess) {
      setShowGiftSecureModal(true);
      return;
    }
    setShowGiftModal(true);
  };
  const [giftSentStatus, setGiftSentStatus] = useState<boolean[]>([false, false, false, false]);
  const [bingoWinningCard, setBingoWinningCard] = useState<any>(null);
  const dismissedWinningCardsRef = useRef<Set<string>>(new Set());
  const [playerGifts, setPlayerGifts] = useState<any[]>([]);
  const [resendingGift, setResendingGift] = useState<{ index: number; gift: any } | null>(null);
  const [isResending, setIsResending] = useState<boolean>(false);

  const fetchMyGifts = useCallback(() => {
    if (!player?.phone) return;
    const clean = normalizePhone(player.phone);
    const gameId = gameState?.id;
    const url = gameId 
      ? `/api/gift-invitations/my-gifts?phone=${clean}&game_id=${gameId}&_t=${Date.now()}`
      : `/api/gift-invitations/my-gifts?phone=${clean}&_t=${Date.now()}`;

    apiFetch(url)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.gifts)) {
          setPlayerGifts(data.gifts);
          const freshStatus = [0, 1, 2, 3].map(i => i < data.gifts.length);
          setGiftSentStatus(freshStatus);
          try {
            if (gameId) {
              localStorage.setItem(`bingo_gift_sent_${gameId}`, JSON.stringify(freshStatus));
            }
          } catch (err) {}
        }
      })
      .catch(err => console.warn('Could not sync gifts with server:', err));
  }, [player?.phone, gameState?.id]);

  useEffect(() => {
    const gameId = gameState?.id || 'no-game';
    // 1. Read local backup
    try {
      const savedStatus = localStorage.getItem(`bingo_gift_sent_${gameId}`);
      if (savedStatus) {
        const parsed = JSON.parse(savedStatus);
        if (Array.isArray(parsed) && parsed.length === 4) {
          setGiftSentStatus(parsed);
        } else {
          setGiftSentStatus([false, false, false, false]);
        }
      } else {
        setGiftSentStatus([false, false, false, false]);
      }
    } catch (e) {
      console.warn('Error reading gift sent status:', e);
      setGiftSentStatus([false, false, false, false]);
    }

    // 2. Fetch fresh database state from server for this specific game
    fetchMyGifts();
  }, [gameState?.id, player?.phone, fetchMyGifts]);

  const buildGiftWhatsAppMessage = (inviteIdStr: string) => {
    const sender = normalizePhone(player?.phone || '');
    const bingoName = gameState?.name || gameState?.title || 'nuestro gran bingo';
    const startDate = gameState?.start_time ? new Date(gameState.start_time).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : 'próximamente';
    const groupLink = gameState?.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk';
    const baseOrigin = window.location.origin.includes('localhost') || window.location.origin.includes('ais-dev-') 
      ? 'https://bingolite.click' 
      : window.location.origin;
    const regUrl = `${baseOrigin}/register?invited_by=${sender}${inviteIdStr}`;
    const senderName = player?.name || 'Tu amigo(a)';
    const prizeAmount = gameState?.prize ? formatCurrency(gameState.prize) : 'un gran premio';

    return `¡Hola! 👋 ¡Tengo una excelente noticia para ti! Tu amigo(a) *${senderName}* te acaba de regalar un CARTÓN 100% GRATIS 🎁 para que juegues y ganes con nosotros en *${bingoName}*.

📅 Anota la cita: ¡El juego será el *${startDate}*!
💰 ¡Hay un premio mayor de *${prizeAmount}* a repartir! 

🤝 *Premio Compartido:* Si ganas con este cartón, el premio se compartirá con la persona que te lo regaló. ¡Es un trabajo en equipo para ganar!

🎰 ¡Y atención especial! Tu cartón de regalo participa en la *Lotería del Sinuano Noche* con las últimas tres cifras de tu cartón. 🍀

1️⃣ *Paso 1: Reclama tu regalo* 🎁
Regístrate totalmente GRATIS usando mi invitación oficial aquí:
👉 ${regUrl}

2️⃣ *Paso 2: Únete al VIP (¡Fundamental!)* 🚨
Únete a nuestro Grupo VIP de WhatsApp para validar tu jugada y estar pendiente de los sorteos:
👉 ${groupLink}

¡Entra ya mismo y prepárate para cantar BINGO! Nos vemos allí. 👨‍👩‍👧‍👦🍀`;
  };

  const openWhatsAppUrl = (message: string) => {
    const encodedMsg = encodeURIComponent(message);
    const nativeUrl = `whatsapp://send?text=${encodedMsg}`;
    
    // Abrir directamente la aplicación nativa de WhatsApp (móvil o PC/escritorio) sin abrir ventanas o pestañas del navegador
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = nativeUrl;
    } else {
      const a = document.createElement('a');
      a.href = nativeUrl;
      a.target = '_top';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        } else {
          a.remove?.();
        }
      }, 300);
    }
  };

  const handleSendGiftWhatsApp = async (index: number) => {
    const sender = normalizePhone(player?.phone || '');
    let invite_idStr = '';

    // Generar invitación en el backend para el juego activo
    try {
      const res = await apiFetch('/api/gift-invitations/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender_phone: sender,
          game_id: gameState?.id
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.message || errorData.error || 'Debes tener al menos 2 cartones en juego para regalar.');
        return;
      }
      
      const data = await res.json();
      if (data?.id) {
        invite_idStr = `&invite_id=${data.id}`;
      }
    } catch (e) {
      console.error('Error guardando invitación en BD:', e);
      toast.error('Error de conexión al registrar el regalo.');
      return;
    }

    const message = buildGiftWhatsAppMessage(invite_idStr);
    openWhatsAppUrl(message);

    const updatedSent = [...giftSentStatus];
    updatedSent[index] = true;
    setGiftSentStatus(updatedSent);
    
    const gameId = gameState?.id || 'no-game';
    try {
      localStorage.setItem(`bingo_gift_sent_${gameId}`, JSON.stringify(updatedSent));
    } catch (e) {
      console.warn('Error saving gift sent status:', e);
    }
    
    toast.success(`Abriendo WhatsApp...`);
    fetchMyGifts();
  };

  const handleConfirmResend = async () => {
    if (!resendingGift || !resendingGift.gift) return;
    const sender = normalizePhone(player?.phone || '');
    const invite = resendingGift.gift;
    setIsResending(true);

    try {
      const res = await apiFetch('/api/gift-invitations/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_id: invite.id,
          sender_phone: sender
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        toast.error(resData.message || resData.error || 'Error al reenviar regalo');
        setIsResending(false);
        return;
      }

      // Re-arm message with this invite ID and open WhatsApp
      const inviteIdStr = `&invite_id=${invite.id}`;
      const message = buildGiftWhatsAppMessage(inviteIdStr);
      openWhatsAppUrl(message);

      toast.success(`¡Regalo #${resendingGift.index + 1} listo! Abriendo WhatsApp...`);
      setResendingGift(null);
      fetchMyGifts();
    } catch (e) {
      console.error('Error al reenviar regalo:', e);
      toast.error('Error de conexión al reenviar regalo');
    } finally {
      setIsResending(false);
    }
  };

  const isMutedRef = useRef(isMuted);
  const gameStateRef = React.useRef(gameState);

  useEffect(() => {
    if (!isStreamActive && isLiveOpen) {
      setIsLiveOpen(false);
    }
  }, [isStreamActive, isLiveOpen]);

  // Sync isMuted state and ref
  useEffect(() => {
    localStorage.setItem('bingo-app-muted', isMuted ? 'true' : 'false');
    isMutedRef.current = isMuted;
    if (isMuted) {
      stop();
    }
  }, [isMuted, stop]);

  useEffect(() => {
    if (gameState?.fx_volume !== undefined) {
      setGlobalFxVolume(gameState.fx_volume);
    }
  }, [gameState?.fx_volume]);

  // Storage listener to synchronize mute with App.tsx immediately
  useEffect(() => {
    const handleStorage = () => {
      const stored = localStorage.getItem('bingo-app-muted') === 'true';
      if (stored !== isMuted) {
        setIsMuted(stored);
      }
    };
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 1000);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [isMuted]);

  // Clear dismissed cards when game changes or when unwon patterns change (e.g. after winning a pattern)
  const unwonPatternIds = (gameState?.patterns || []).filter((p: any) => !p.winner_player_id).map((p: any) => p.game_pattern_id || p.id).join(',');
  useEffect(() => {
    dismissedWinningCardsRef.current.clear();
  }, [gameState?.id, unwonPatternIds]);

  useEffect(() => {
    // Only set if not already set, to avoid spamming
    if (bingoWinningCard) return;

    const winner = cards.find(card => {
      const cardNumStr = String(card.card_number);
      // If user deliberately closed/dismissed this card's modal, don't re-open it
      if (dismissedWinningCardsRef.current.has(cardNumStr)) {
        return false;
      }

      const isWinnerCard = winningCards.has(cardNumStr) || 
                           (!isNaN(Number(card.card_number)) && winningCards.has(String(Number(card.card_number))));
      const { hasWonPattern } = getAllWinningCellsForCard(
        card,
        gameState?.patterns || [],
        gameState?.drawn_balls || []
      );
      return isWinnerCard || hasWonPattern;
    });

    if (winner) {
      setBingoWinningCard(winner);
    }
  }, [cards, winningCards, gameState?.patterns, gameState?.drawn_balls, bingoWinningCard]);

  const handleCloseWinningModal = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (bingoWinningCard) {
      dismissedWinningCardsRef.current.add(String(bingoWinningCard.card_number));
    }
    setBingoWinningCard(null);
  }, [bingoWinningCard]);



  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
      toast.success('Sesión cerrada correctamente');
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error('Error al cerrar sesión');
    }
  };

  const fetchCards = async () => {
    const currentUser = userRef.current;
    if (!currentUser || currentUser.role !== 'player') {
      navigate("/");
      return;
    }

    try {
      const normalizedPhone = currentUser.phone ? normalizePhone(currentUser.phone) : '';
      if (!normalizedPhone) return;
      const tenantParam = effectiveTenant ? `&tenantId=${encodeURIComponent(effectiveTenant)}` : '';
      const res = await apiFetch(`/api/players/${normalizedPhone}/cards?_t=${Date.now()}${tenantParam}`);
      const data = await res.json();
      
      if (data.status === 'not_found' || data.error) {
        if (data.error === 'Player not found') {
           setStatus('not_found');
           await logout();
           navigate("/");
           toast('Tu sesión anterior ha finalizado. Por favor ingresa o regístrate para comenzar.', { icon: 'ℹ️' });
           setLoading(false);
           return;
        }
        throw new Error(data.error || 'Error fetching cards');
      }

      setPlayer(data.player);
      setStatus(data.status);
      setCards(data.cards || []);
      setAllCards(data.all_cards || []);
      setError('');
    } catch (err: any) {
      const errorMessage = err.message || '';
      console.log('Player connection not ready or network error, retrying fetchCards in 5 seconds...', errorMessage);
      setTimeout(fetchCards, 5000);
    } finally {
      setLoading(false);
    }
  };


  const fetchGameState = async () => {
    try {
      const tenantParam = effectiveTenant ? `&tenantId=${encodeURIComponent(effectiveTenant)}` : '';
      const res = await apiFetch(`/api/game?_t=${Date.now()}${tenantParam}`);
      if (!res.ok) {
        // ignored
        return;
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
          console.log('Received HTML instead of JSON for /api/game');
          return;
        }
      }

      const data = await res.json();
      if (data) {
        data.drawn_balls = normalizeBalls(data.drawn_balls);
      }
      setGameState(data);

      // Initialize winning cards from patterns
      if (data?.patterns) {
        const winners = new Set<string>();
        data.patterns.forEach((p: any) => {
          if (p?.winner_player_id && p?.winner_card_number != null) {
            winners.add(String(p.winner_card_number));
          }
        });
        setWinningCards(winners);
      }
      if (data?.stream_id) setTwitchChannel(data.stream_id);
      setIsStreamActive(!!data?.stream_active);
      if (!!data?.stream_active) setIsLiveOpen(true);
    } catch (err: any) {
      // ignored
      const errorMessage = err?.message || '';
      if (errorMessage.includes('conexión') || errorMessage.includes('Failed to fetch')) {
        console.log('Player: Server connection not ready yet, retrying in 5 seconds...');
        setTimeout(fetchGameState, 5000);
      }
    }
  };

  const fetchWalletBalance = async () => {
    const currentUser = userRef.current;
    if (!currentUser?.phone) return;
    try {
      const normalizedPhone = normalizePhone(currentUser.phone);
      const tenantParam = effectiveTenant ? `&tenantId=${encodeURIComponent(effectiveTenant)}` : '';
      const res = await apiFetch(`/api/wallet?phone=${normalizedPhone}${tenantParam}&gameId=${gameStateRef.current?.id || ''}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        // Solo actualizar balance si la respuesta es autenticada y trae un número válido
        if (typeof data.balance === 'number' && data.authenticated !== false) {
          setWalletBalance(data.balance);
        }
        if (typeof data.activated === 'boolean') {
          setWalletActivated(data.activated);
        }
      }
    } catch (err: any) {
      // Ignorar errores de red para no borrar el saldo actual en pantalla
    }
  };

  const fetchWalletHistory = async () => {
    const currentUser = userRef.current;
    if (!currentUser?.phone) return;
    try {
      const normalizedPhone = normalizePhone(currentUser.phone);
      const tenantParam = effectiveTenant ? `&tenantId=${encodeURIComponent(effectiveTenant)}` : '';
      const res = await apiFetch(`/api/wallet/history?phone=${normalizedPhone}${tenantParam}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setWalletHistory(data);
        }
      }
    } catch (err: any) {
      // ignored
    }
  };

  const handleRechargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechargeAmount || Number(rechargeAmount) <= 0) {
      setRechargeError('Por favor ingresa un monto válido.');
      return;
    }
    if (!rechargeReceipt) {
      setRechargeError('Por favor adjunta tu comprobante de transferencia.');
      return;
    }

    setRechargeSubmitting(true);
    setRechargeError('');
    setRechargeStatus('idle');

    try {
      const activePhone = (player?.phone || user?.phone || '').trim();
      if (!activePhone) {
        setRechargeError('No se pudo identificar tu número de teléfono. Por favor inicia sesión nuevamente.');
        return;
      }
      const formData = new FormData();
      formData.append('phone', activePhone);
      formData.append('amount', rechargeAmount);
      formData.append('note', rechargeNote);
      formData.append('receipt', rechargeReceipt);
      // Enviar tenantId con fallback para aislamiento correcto
      const currentTenantId = tenantSlug || (user as any)?.tenant_id || 'default';
      formData.append('tenantId', currentTenantId);

      const res = await apiFetch('/api/wallet/recharge-request', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Error al enviar la solicitud de recarga.');
      }

      const data = await res.json();
      if (data.status === 'approved') {
        setRechargeStatus('success');
        fetchWalletBalance();
        fetchWalletHistory();
      } else {
        setRechargeStatus('pending');
        fetchWalletHistory();
      }
      
      // Clear form inputs
      setRechargeAmount('');
      setRechargeReceipt(null);
      setRechargeNote('');
    } catch (err: any) {
      setRechargeStatus('error');
      setRechargeError(err.message || 'Ocurrió un error al enviar la recarga.');
      setRechargeReceipt(null);
    } finally {
      setRechargeSubmitting(false);
    }
  };

  const fetchSavedLotteryNumbers = async (playerId: number, gameId: number) => {
    try {
      const res = await apiFetch(`/api/lottery-numbers/player/${playerId}/game/${gameId}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.savedLotteryCodes) {
            setSavedLotteryCodes(new Set(data.savedLotteryCodes.map(String)));
          }
          setLotteryConfirmed(data.confirmed === true);
          setLotteryWinningCode(data.winningCode !== undefined && data.winningCode !== null ? String(data.winningCode) : null);
          setIsLotteryWinner(data.isWinner === true);
        }
      }
    } catch (err: any) {
      // ignored
    }
  };

  const saveLotteryNumber = async (lotteryCode: string, cardNumber: string) => {
    if (!player?.id || !gameState?.id) {
      toast.error('No se pudo identificar tu jugador o juego activo.');
      return;
    }
    try {
      const res = await apiFetch('/api/lottery-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: player.id,
          game_id: gameState.id,
          lottery_code: lotteryCode,
          card_number: cardNumber
        })
      });
      const data = await res.json();
      if (data.error === 'table_missing') {
        toast.error(data.message || 'Error: La tabla "lottery_numbers_in_play" no existe.');
        return;
      }
      if (res.ok) {
        toast.success(data.message || '¡Código registrado para el sorteo!');
        setSavedLotteryCodes(prev => {
          const next = new Set(prev);
          next.add(lotteryCode);
          return next;
        });
      } else {
        toast.error(data.error || 'Error al guardar el código');
      }
    } catch (err) {
      console.error('Error in saveLotteryNumber:', err);
      toast.error('Error de conexión al guardar el número.');
    }
  };

  useEffect(() => {
    if (player?.id && gameState?.id) {
      fetchSavedLotteryNumbers(player.id, gameState.id);
    }
  }, [player?.id, gameState?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'player') {
      navigate("/");
      return;
    }
    fetchCards();
    fetchGameState();
  }, [user?.role, user?.phone, authLoading]);

  useEffect(() => {
    if (user?.phone) {
      fetchWalletBalance();
      fetchWalletHistory();

      // Sincronización periódica de saldo en segundo plano
      const interval = setInterval(() => {
        fetchWalletBalance();
      }, 20000);

      // Refrescar inmediatamente al volver a la pestaña o al cambiar de foco
      const onFocusOrVisible = () => {
        if (document.visibilityState === 'visible') {
          console.log('[Realtime] Pestaña visible o en foco: sincronizando estado de juego, cartones y saldo...');
          fetchGameState();
          fetchCards();
          fetchWalletBalance();
          fetchWalletHistory();
        }
      };
      window.addEventListener('focus', onFocusOrVisible);
      document.addEventListener('visibilitychange', onFocusOrVisible);

      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', onFocusOrVisible);
        document.removeEventListener('visibilitychange', onFocusOrVisible);
      };
    }
  }, [user?.phone, gameState?.id, effectiveTenant]);

  // Listener de ciclo de vida de conexión en tiempo real con Ably (auto-recuperación de conexión)
  useEffect(() => {
    const handleConnected = () => {
      console.log('[Ably Realtime] Conectado exitosamente al canal en vivo');
      setRealtimeConnected(true);
      fetchGameState();
      fetchCards();
      fetchWalletBalance();
    };

    const handleDisconnected = () => {
      console.warn('[Ably Realtime] Desconectado temporalmente de la sala');
      setRealtimeConnected(false);
    };

    const handleSuspended = () => {
      console.warn('[Ably Realtime] Conexión de red suspendida');
      setRealtimeConnected(false);
    };

    ably.connection.on('connected', handleConnected);
    ably.connection.on('disconnected', handleDisconnected);
    ably.connection.on('suspended', handleSuspended);
    setRealtimeConnected(ably.connection.state === 'connected');

    return () => {
      ably.connection.off('connected', handleConnected);
      ably.connection.off('disconnected', handleDisconnected);
      ably.connection.off('suspended', handleSuspended);
    };
  }, [effectiveTenant]);

  // Heartbeat de auto-reconciliación activa durante el juego (garantiza cero desincronizaciones)
  useEffect(() => {
    if (!gameState?.id || (gameState.status !== 'playing' && gameState.status !== 'paused')) {
      return;
    }

    const reconcileGame = async () => {
      try {
        const tenantParam = effectiveTenant ? `&tenantId=${encodeURIComponent(effectiveTenant)}` : '';
        const res = await apiFetch(`/api/game?_t=${Date.now()}${tenantParam}`);
        if (!res.ok) return;
        const freshGame = await res.json();
        if (!freshGame || !freshGame.id) return;

        const serverBalls = normalizeBalls(freshGame.drawn_balls);
        const currentBalls = normalizeBalls(gameStateRef.current?.drawn_balls);

        // Si el servidor tiene más balotas o el estado de juego cambió, actualiza de inmediato
        if (serverBalls.length !== currentBalls.length || freshGame.status !== gameStateRef.current?.status) {
          console.log(`[Reconcile] Desincronización resuelta: local (${currentBalls.length}) vs servidor (${serverBalls.length})`);
          freshGame.drawn_balls = serverBalls;
          const safePatterns = (freshGame.patterns && freshGame.patterns.length > 0) ? freshGame.patterns : (gameStateRef.current?.patterns || []);
          setGameState((prev: any) => ({
            ...prev,
            ...freshGame,
            patterns: safePatterns
          }));
        }
      } catch (err) {
        // Silencioso
      }
    };

    const reconcileInterval = setInterval(reconcileGame, 3500);
    return () => clearInterval(reconcileInterval);
  }, [gameState?.id, gameState?.status, effectiveTenant]);

  // Keep player marked as online via a background heartbeat ping
  useEffect(() => {
    const activePhone = user?.phone || player?.phone;
    if (!activePhone) return;

    const sendPing = async () => {
      try {
        await fetch('/api/players/ping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: activePhone,
            name: user?.name || player?.name || 'Jugador'
          })
        });
      } catch (err) {
        // Silently ignore background presence ping failure
      }
    };

    // Send first ping immediately
    sendPing();

    // Repeat ping every 45 seconds to reduce server load
    const interval = setInterval(sendPing, 45000);

    return () => clearInterval(interval);
  }, [user?.phone, player?.phone, user?.name, player?.name]);

  useEffect(() => {
    if (gameState && gameState.ai_chat_enabled === false) {
      if (isAIOpen) setIsAIOpen(false);
    }
  }, [gameState?.ai_chat_enabled, isAIOpen]);

  useEffect(() => {
    if (!channel) return;
    const onGameUpdate = (msg: any) => {
      const game = msg.data;
      if (game && typeof game.drawn_balls === 'string') {
        try { game.drawn_balls = JSON.parse(game.drawn_balls); } catch(e) { game.drawn_balls = []; }
      }
      const prev = gameStateRef.current;
      
      if (prev && prev.id === game.id && prev.drawn_balls.length > 0 && game.drawn_balls.length === 0) {
        setMarkedCells({});
        setWinner(null);
        setWinningCards(new Set());
        activeWinnerIdRef.current = null;
      }

      // Detect status change to 'playing'
      
      if (prev && player && prev.lottery_confirmed !== game.lottery_confirmed) {
        fetchSavedLotteryNumbers(player.id, game.id);
      }
      
      // Shield: preserve patterns if incoming broadcast is missing them
      const safePatterns = (game.patterns && game.patterns.length > 0) ? game.patterns : (prev?.patterns || []);
      
      setGameState((prevState: any) => ({
        ...prevState,
        ...game,
        patterns: safePatterns
      }));

      if (safePatterns && safePatterns.length > 0) {
        const winners = new Set<string>();
        safePatterns.forEach((p: any) => {
          if (p?.winner_player_id && p?.winner_card_number != null) {
            winners.add(String(p.winner_card_number));
          }
        });
        setWinningCards(winners);
      }
      if (game.stream_id) setTwitchChannel(game.stream_id);
      setIsStreamActive(!!game.stream_active);
      if (!!game.stream_active) setIsLiveOpen(true);
      
      // Refresh wallet if game finished or bingo called
      if (game.status === 'finished' || (prev && prev.drawn_balls.length !== game.drawn_balls.length)) {
        fetchWalletBalance();
      }
    };

    const speakBall = (ball: number) => {
      if (isMutedRef.current) return;
      announceBall(ball);
    };

    channel.subscribe('game_update', onGameUpdate);

    const onBallDrawn = (msg: any) => {
      console.log('DEBUG: Evento ball_drawn recibido en PlayerDashboard:', msg.data);
      const ball = Number(msg.data);
      if (isNaN(ball) || ball <= 0) return;
      const msgId = msg.id || `${ball}-${Date.now()}`;
      
      // Deduplicate audio events to prevent overlapping locutions ("se medio menciona una y termina cantando otra")
      const now = Date.now();
      if (lastAnnouncedBallIdRef.current === msgId || (now - lastAnnouncedBallTimeRef.current < 4000)) {
        console.log('DEBUG: Omitiendo locución duplicada o muy cercana:', ball);
      } else {
        if (!isAnnouncingWinnerRef.current) {
          lastAnnouncedBallIdRef.current = msgId;
          lastAnnouncedBallTimeRef.current = now;
          speakBall(ball);
        }
      }
      
      // Update local state immediately
      setGameState((prev: any) => {
        if (!prev) return prev;
        const currentBalls = normalizeBalls(prev.drawn_balls);
        if (currentBalls.includes(ball)) return prev;
        return { ...prev, drawn_balls: [...currentBalls, ball] };
      });
    };
    channel.subscribe('ball_drawn', onBallDrawn);

    const onServerAutoplayUpdated = (msg: any) => {
      console.log('DEBUG: Evento server_autoplay_updated recibido en PlayerDashboard:', msg.data);
      fetchGameState();
    };
    channel.subscribe('server_autoplay_updated', onServerAutoplayUpdated);

    const onGamesUpdated = () => {
      console.log('DEBUG: Evento games_updated recibido en PlayerDashboard');
      fetchGameState();
      fetchCards();
    };
    channel.subscribe('games_updated', onGamesUpdated);

    const onPlayerApproved = (msg: any) => {
      console.log('DEBUG: Evento player_approved recibido, refrescando...');
      fetchCards();
    };
    channel.subscribe('player_approved', onPlayerApproved);

    const onChatStatusUpdated = (msg: any) => {
      const enabled = msg.data.enabled;
      setIsChatEnabled(enabled);
    };
    channel.subscribe('chat_status_updated', onChatStatusUpdated);

    const onWalletUpdated = (msg: any) => {
      console.log('DEBUG: Evento wallet_updated recibido en PlayerDashboard:', msg.data);
      if (userRef.current?.phone && comparePhones(userRef.current.phone, msg.data.phone)) {
        setWalletBalance(msg.data.balance);
        fetchWalletHistory();
      }
    };
    channel.subscribe('wallet_updated', onWalletUpdated);

    const onBingoCalled = async (msg: any) => {
      const winData = msg.data;
      const winners = winData.winners || [{ 
        player_id: winData.player_id, 
        player_name: winData.player_name, 
        card_number: winData.card_number,
        grid: winData.grid,
        marked_cells: winData.marked_cells
      }];
      
      const firstWinner = winners[0];
      const winId = winData.game_pattern_id ? `${winData.game_pattern_id}` : `${firstWinner.player_id}-${winData.pattern_name}`;
      
      // Actualizar patrones en juego localmente para reflejar el ganador de inmediato
      setGameState((prev: any) => {
        if (!prev || !prev.patterns) return prev;
        return {
          ...prev,
          patterns: prev.patterns.map((p: any) => 
            (winData.game_pattern_id ? String(p.game_pattern_id) === String(winData.game_pattern_id) : p.name === winData.pattern_name)
              ? { 
                  ...p, 
                  winner_player_id: firstWinner.player_id, 
                  winner_name: winners.length > 1 ? winners.map(w => w.player_name).join(', ') : firstWinner.player_name, 
                  winner_card_number: winners.length > 1 ? 'Múltiples' : firstWinner.card_number, 
                  won_at: new Date().toISOString() 
                }
              : p
          )
        };
      });

      // Identify if current player is one of the winners
      winners.forEach(w => {
        if (w?.card_number != null) {
          setWinningCards(prev => {
            const next = new Set(prev);
            next.add(String(w.card_number));
            return next;
          });
        }
      });

      // Avoid double-processing the exact same winId if already announcing
      if (activeWinnerIdRef.current === winId && isAnnouncingWinnerRef.current) return;
      
      activeWinnerIdRef.current = winId;
      isAnnouncingWinnerRef.current = true;
      setIsAnnouncingWinner(true);
      setWinner(winData);
      
      if (!isMutedRef.current) {
        stop(true); // Cancel previous ball utterances IMMEDIATELY to prepare for winner announcement
        setWinnerSpeechActive(true, 22000);
      }

      // Auto-unlock after full celebration duration (22 seconds for Canto Bingo audio + AI announcement)
      setTimeout(() => {
        setWinner(null);
        setWinnerSpeechActive(false);
        isAnnouncingWinnerRef.current = false;
        setIsAnnouncingWinner(false);
        activeWinnerIdRef.current = null;
      }, 22000);
    };

    channel.subscribe('bingo_called', onBingoCalled);
    
    const onLotteryWinnerAnnounced = (msg: any) => {
      console.log('DEBUG: Evento lottery_winner_announced recibido:', msg.data);
      const data = msg.data;
      if (data && data.title && data.message) {
        toast(data.message, {
          id: `lottery-winner-${data.id || data.lottery_number || data.message.slice(0, 25)}`,
          icon: '👑',
          duration: 10000,
          style: {
            background: '#FFFBEB',
            color: '#B45309',
            fontWeight: 'bold',
            border: '2px solid #FCD34D'
          }
        });
        if (!isMutedRef.current) {
          stop();
          speakNative(`¡Atención! ${data.message}`);
        }
      }
    };
    channel.subscribe('lottery_winner_announced', onLotteryWinnerAnnounced);

    const onGameFinished = (msg: any) => {
      // Delay high-impact summary modal by 10 seconds per user request
      setTimeout(() => {
        setGameFinished(msg.data);
        if (!isMutedRef.current) {
          const winnersText = (msg.data.winners || []).map((w: any) => w.player_name).join(', ');
          const summarySpeech = `¡Felicidades a todos los ganadores, especialmente a ${winnersText}! Queremos recordarles nuestro reglamento estricto de seguridad: Primero, para activar y usar el saldo de su billetera en cada nuevo juego, deben haber comprado al menos un cartón con dinero real enviando su comprobante. Segundo, la función para obsequiar o regalar cartones gratis a sus amigos se habilita únicamente si han comprado previamente un mínimo de dos cartones en el juego activo. Les agradecemos su participación y los animamos a reservar sus cartones. ¡Mucha suerte en la siguiente ronda!`;
          speakNative(summarySpeech);
        }
      }, 10000);
    };
    channel.subscribe('game_finished', onGameFinished);

    const onPaymentBanner = (msg: any) => {
      // Guardar el pago pendiente para mostrarlo después del modal
      setPendingPayment(msg.data);
      
      // Actualizar balance de inmediato internamente para el usuario correspondiente
      if (userRef.current?.phone && comparePhones(userRef.current.phone, msg.data.winner_phone)) {
        fetchWalletBalance();
      }
    };
    channel.subscribe('payment_banner', onPaymentBanner);

    const onPlayDjSound = (msg: any) => {
      const { url, name } = msg.data;
      console.log(`[DJ] Sonido en vivo recibido: "${name}" url: ${url}`);
      if (!isMutedRef.current) {
        try {
          if (!url || url.includes('mixkit.co')) {
            playSynthesizedDJEffect(name || '', 1.0);
          } else {
            // Use playFxFromUrl which connects to the master gain for live volume modulation
            playFxFromUrl(getProxyUrl(url), 1.0);
          }
        } catch (err) {
          console.error('[DJ] Error al reproducir sonido DJ, playing synthesized:', err);
          playSynthesizedDJEffect(name || '', 1.0);
        }
      }
    };
    channel.subscribe('play_dj_sound', onPlayDjSound);

    return () => {
      channel.unsubscribe('game_update', onGameUpdate);
      channel.unsubscribe('ball_drawn', onBallDrawn);
      channel.unsubscribe('player_approved', onPlayerApproved);
      channel.unsubscribe('chat_status_updated', onChatStatusUpdated);
      channel.unsubscribe('wallet_updated', onWalletUpdated);
      channel.unsubscribe('bingo_called', onBingoCalled);
      channel.unsubscribe('lottery_winner_announced', onLotteryWinnerAnnounced);
      channel.unsubscribe('game_finished', onGameFinished);
      channel.unsubscribe('payment_banner', onPaymentBanner);
      channel.unsubscribe('play_dj_sound', onPlayDjSound);
      channel.unsubscribe('server_autoplay_updated', onServerAutoplayUpdated);
      channel.unsubscribe('games_updated', onGamesUpdated);
    };
  }, [channel]);

  useEffect(() => {
    if (!gameState?.start_time || (gameState.status !== 'waiting' && gameState.status !== 'scheduled')) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const startTime = new Date(gameState.start_time).getTime();
      const distance = startTime - now;

      if (distance < 0) {
        setTimeLeft(null);
        clearInterval(interval);
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.start_time, gameState?.status]);

  const announceLastBalls = () => {
    if (isAnnouncingWinnerRef.current) return;
    if (!currentDrawnBalls.length) return;
    const lastBalls = currentDrawnBalls.slice(-5);
    toast.success('Re-anunciando últimas balotas...');
    lastBalls.forEach((ball: number) => {
      announceBall(ball, false);
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    await Promise.all([fetchCards(), fetchGameState(), fetchWalletBalance()]);
    setSyncing(false);
    toast.success('Juego sincronizado');
  };

  const handleAssignCard = async (cardId: string) => {
    setAssigningLoading(cardId);
    try {
      const res = await apiFetch(`/api/cards/${cardId}/assign`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success('¡Cartón asignado con éxito!');
        fetchCards();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al asignar el cartón');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setAssigningLoading(null);
    }
  };

  const toggleCell = (e: React.MouseEvent, cardId: string, row: number, col: number, value: any) => {
    e.stopPropagation();
    if (value === 'FREE' || value === 0 || value === '0') return;
    
    const numVal = Number(value);
    const isDrawn = !isNaN(numVal) && drawnBallsSet.has(numVal);
    
    if (!isDrawn) {
      if (!isMutedRef.current) {
        playErrorSound();
      }
      toast.error(`¡El número ${value} no ha salido!`, {
        position: 'top-center',
        style: {
          background: '#ef4444',
          color: '#fff',
          fontWeight: 'bold',
          borderRadius: '1rem',
          padding: '16px',
        },
      });
      return;
    }

    const key = `${cardId}-${row}-${col}`;
    const isNowMarked = !markedCells[key];
    
    setMarkedCells(prev => ({ ...prev, [key]: isNowMarked }));

    if (isNowMarked) {
      if (!isMutedRef.current) {
        playMarkSound();
      }
      toast.success('Correcto', {
        id: 'bingo-correct',
        position: 'top-center',
        style: {
          background: '#22c55e',
          color: '#fff',
          fontWeight: 'bold',
          borderRadius: '1rem',
          padding: '16px',
        },
      });
    } else {
      if (!isMutedRef.current) {
        playUnmarkSound();
      }
    }
  };

  const handleBingo = async (cardNumber: string) => {
    setBingoLoading(true);
    
    // Extract marked cells for this specific card
    const cardMarkedCells = Object.keys(markedCells)
      .filter(key => key.startsWith(`${cardNumber}-`) && markedCells[key])
      .map(key => {
        const [, r, c] = key.split('-');
        return { r: parseInt(r), c: parseInt(c) };
      });

    try {
      const res = await apiFetch('/api/bingo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: user.phone,
          card_number: cardNumber,
          marked_cells: cardMarkedCells,
        }),
      });
      if (res.ok) {
        toast.success('¡Bingo cantado! Esperando verificación...', { duration: 5000 });
      } else {
        if (!isMutedRef.current) {
          playErrorSound();
        }
        toast.error('Error al cantar bingo.');
      }
    } catch (err) {
      if (!isMutedRef.current) {
        playErrorSound();
      }
      toast.error('Error al cantar bingo.');
    } finally {
      setBingoLoading(false);
    }
  };

  const detectedPatternIds = React.useMemo(() => {
    if (!cards || !gameState?.patterns || !gameState?.drawn_balls) return new Set<number>();
    const detected = new Set<number>();
    
    cards.forEach(card => {
      gameState.patterns.forEach((pattern: any) => {
        if (!pattern.grid || pattern.winner_player_id) return;
        
        const { won } = checkCardPatternMatch(card.grid, pattern.grid, gameState.drawn_balls);
        if (won) {
          detected.add(pattern.game_pattern_id);
        }
      });
    });
    
    return detected;
  }, [cards, gameState?.patterns, gameState?.drawn_balls]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  if (!user) return null; // Early return if user is not available during logout transition

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-red-500 max-w-md w-full">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-black text-slate-800 mb-2">Estado de la cuenta</h2>
          <p className="text-slate-600 font-medium mb-6">{error}</p>
          <div className="space-y-3">
            <button 
              onClick={fetchCards}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
              <RefreshCw size={20} /> Actualizar
            </button>
            <button 
              onClick={handleLogout}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'approved' && showRules) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-blue-50">
        <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-blue-500 max-w-2xl w-full">
          <Trophy className="text-blue-500 mx-auto mb-4" size={64} />
          <h2 className="text-3xl font-black text-slate-800 mb-6 uppercase tracking-tight">Reglas del Juego</h2>
          
          <div className="text-left space-y-4 mb-8 text-slate-700 font-medium">
            <p className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
              <span>El juego comenzará a la hora programada. Asegúrate de estar conectado.</span>
            </p>
            <p className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
              <span>Marca los números en tus cartones a medida que vayan saliendo las balotas.</span>
            </p>
            <p className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">3</span>
              <span>Para ganar, debes completar uno de los <strong>Patrones en Juego</strong> mostrados en la pantalla.</span>
            </p>
            <p className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">4</span>
              <span>Cuando completes un patrón, presiona el botón <strong>¡CANTAR BINGO!</strong> en el cartón ganador.</span>
            </p>
            <p className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5">5</span>
              <span>El primer jugador en cantar bingo correctamente se lleva el premio del patrón.</span>
            </p>
          </div>

          <button 
            onClick={() => setShowRules(false)}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xl rounded-2xl shadow-lg transition active:scale-95 uppercase tracking-widest"
          >
            ¡Entendido, a jugar!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-slate-50 overflow-x-hidden">
      {bingoWinningCard && (
        <div 
          className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={handleCloseWinningModal}
        >
          <div 
            className="rounded-3xl p-6 sm:p-8 shadow-2xl max-w-md w-full border-4 border-emerald-400 relative overflow-hidden text-center"
            style={{
              backgroundImage: `url(${celebratingBingoBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 80% clear image overlay: subtle dark gradient overlay to make text pop while keeping the celebrating person 80% clear and vibrant */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/45 pointer-events-none" />

            {/* Close X Button at top right */}
            <button
              type="button"
              onClick={handleCloseWinningModal}
              className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-slate-900/85 hover:bg-slate-950 text-white flex items-center justify-center shadow-lg border-2 border-white/40 transition active:scale-90 cursor-pointer"
              title="Cerrar ventana"
            >
              <X size={22} className="text-white" />
            </button>

            <div className="relative z-10 pt-2 pb-1">
              {/* Resaltado de Título Principal */}
              <div className="bg-slate-950/90 backdrop-blur-md px-5 py-2.5 rounded-2xl border-2 border-emerald-400 shadow-2xl inline-block mb-4">
                <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-green-400 to-yellow-300 uppercase tracking-widest drop-shadow">
                  🎉 ¡ESTÁS GANANDO BINGO!
                </h2>
              </div>

              {/* Resaltado del Cartón y Estado */}
              <div className="bg-white/95 backdrop-blur-md p-5 rounded-3xl border-2 border-slate-900 shadow-2xl mb-6 space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full inline-block border border-emerald-300">
                  ⚡ Figura o Patrón Completado
                </span>
                <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                  Tu Cartón <span className="bg-emerald-600 text-white px-3 py-1 rounded-2xl font-mono text-2xl sm:text-3xl inline-block shadow-md border-2 border-emerald-500">#{bingoWinningCard.card_number}</span>
                </p>
                <p className="text-xs sm:text-sm text-slate-700 font-extrabold leading-snug pt-1">
                  ¡Acabas de completar el bingo! Toca el botón amarillo de abajo para cantarlo de inmediato.
                </p>
              </div>

              {/* Botón Cantar Bingo */}
              <button 
                type="button"
                onClick={(e) => {
                   e.stopPropagation();
                   handleBingo(bingoWinningCard.card_number);
                   handleCloseWinningModal(e);
                }}
                disabled={bingoLoading || gameState?.status !== 'playing'}
                className="w-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-slate-950 py-4 sm:py-5 rounded-2xl font-black text-xl sm:text-2xl shadow-2xl border-3 border-yellow-200 transform transition active:scale-95 uppercase tracking-tight flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>¡CANTAR BINGO!</span>
              </button>

              {/* Botón Cerrar */}
              <button 
                type="button"
                onClick={handleCloseWinningModal}
                className="w-full mt-3 bg-slate-950/85 hover:bg-slate-950 text-white font-black hover:text-yellow-300 uppercase tracking-wider text-xs sm:text-sm py-3.5 px-6 rounded-xl border-2 border-white/30 shadow-xl transition active:scale-95 cursor-pointer backdrop-blur-md"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto space-y-4">
          
          {/* Top Row: Brand & Status & Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-xl flex items-center justify-center shadow-lg shrink-0">
                <Trophy className="text-blue-600" size={24} />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-none truncate">
                  BINGO LIVE
                </h1>
                <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mt-0.5 truncate">{player?.name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block">
                <span className={clsx(
                  "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20",
                  gameState?.status === 'playing' ? "bg-green-500" : 
                  gameState?.status === 'paused' ? "bg-yellow-500 text-yellow-950" : 
                  "bg-slate-500"
                )}>
                  {gameState?.status === 'playing' ? 'En Juego' : 
                   gameState?.status === 'paused' ? 'Pausado' : 'Esperando'}
                </span>
              </div>
              <NotificationBell />
              <button
                onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
                className="flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl transition border border-white/10 text-white shadow-sm"
              >
                {isHeaderExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
          </div>

          {/* Actions Row: Grid layout for 100% visibility on all devices */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 w-full mt-3">
            <button 
              onClick={() => {
                fetchWalletHistory();
                setShowWalletHistoryModal(true);
              }}
              className="flex flex-col items-center justify-center py-2 px-1.5 sm:px-2.5 bg-blue-800/90 hover:bg-blue-900 transition rounded-xl border border-blue-400/50 shadow-md text-center"
            >
              <div className="flex items-center gap-1">
                <Wallet size={14} className={walletActivated ? "text-green-400" : "text-blue-200"} />
                <span className="text-[9px] sm:text-[10px] font-black text-blue-100 uppercase tracking-wider">Billetera</span>
              </div>
              <span className="text-[11px] sm:text-xs font-black text-white mt-0.5">{formatCurrency(walletBalance)}</span>
            </button>

            <button 
              onClick={() => {
                setRechargeStatus('idle');
                setRechargeError('');
                setShowRechargeModal(true);
              }}
              className="flex flex-col items-center justify-center py-2 px-1.5 sm:px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition shadow-md border border-emerald-400 text-center"
            >
              <div className="flex items-center gap-1">
                <PlusCircle size={14} />
                <span className="text-[10px] sm:text-xs uppercase tracking-wider">Recargar</span>
              </div>
              <span className="text-[8px] sm:text-[9px] text-emerald-100 font-bold uppercase mt-0.5">Saldo</span>
            </button>

            <button 
              onClick={() => navigate("/register")}
              disabled={hasFreeCards}
              className={clsx(
                "flex flex-col items-center justify-center py-2 px-1.5 sm:px-2.5 rounded-xl transition shadow-md border font-black text-center",
                hasFreeCards 
                  ? "bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed" 
                  : "bg-green-600 text-white hover:bg-green-700 border-green-400"
              )}
            >
              <div className="flex items-center gap-1">
                <Plus size={14} />
                <span className="text-[10px] sm:text-xs uppercase tracking-wider">{hasFreeCards ? "Obtenido" : "Comprar"}</span>
              </div>
              <span className="text-[8px] sm:text-[9px] text-white/80 font-bold uppercase mt-0.5">Cartones</span>
            </button>

            <button 
              onClick={handleOpenGiftModal}
              className={clsx(
                "flex flex-col items-center justify-center py-2 px-1.5 sm:px-2.5 text-white rounded-xl transition shadow-md border font-black text-center",
                hasGiftAccess 
                  ? "bg-purple-600 hover:bg-purple-700 border-purple-400" 
                  : "bg-purple-900 border-purple-800 text-purple-300"
              )}
            >
              <div className="flex items-center gap-1">
                <Gift size={14} className={hasGiftAccess ? "text-yellow-300" : "text-purple-300/50"} />
                <span className="text-[10px] sm:text-xs uppercase tracking-wider">Regalar</span>
              </div>
              <span className="text-[8px] sm:text-[9px] text-purple-200 font-bold uppercase mt-0.5">Cortesía</span>
            </button>

            <button 
              onClick={() => setShowPasswordModal(true)}
              className="flex flex-col items-center justify-center py-2 px-1.5 sm:px-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl transition shadow-md border border-slate-600 font-black text-center"
            >
              <div className="flex items-center gap-1">
                <Key size={14} className="text-yellow-400" />
                <span className="text-[10px] sm:text-xs uppercase tracking-wider">Seguridad</span>
              </div>
              <span className="text-[8px] sm:text-[9px] text-slate-300 font-bold uppercase mt-0.5">Clave</span>
            </button>

            <button 
              onClick={handleLogout}
              className="flex flex-col items-center justify-center py-2 px-1.5 sm:px-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition shadow-md border border-red-400 font-black text-center"
            >
              <div className="flex items-center gap-1">
                <LogOut size={14} />
                <span className="text-[10px] sm:text-xs uppercase tracking-wider">Cerrar Sesión</span>
              </div>
              <span className="text-[8px] sm:text-[9px] text-red-200 font-bold uppercase mt-0.5">Salir</span>
            </button>
          </div>

          {/* Optional: Stream Status Indicator if expanded */}
          {isHeaderExpanded && isStreamActive && (
            <div className="flex items-center gap-2 pt-2 border-t border-white/10 mt-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white border border-red-500 shrink-0">
                <Radio size={12} className="animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-wider">LIVE</span>
              </div>
              <p className="text-[10px] font-bold text-blue-100">Transmisión en vivo activa</p>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6 p-4">
        {/* Main Content */}
        <div className="flex-1 space-y-6">

          {/* Banner de Suscripción a Notificaciones Push */}
          <PushSubscriptionBanner />

          {/* Notice Banner */}
          {status === 'pending' && (
            <div className="relative overflow-hidden rounded-3xl p-0.5 bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="bg-gradient-to-r from-orange-50/95 via-amber-50/90 to-emerald-50/95 rounded-[22px] p-5 sm:p-6 text-center backdrop-blur-sm">
                <div className="flex items-center justify-center gap-2 mb-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-orange-500 to-emerald-500 text-white flex items-center justify-center shadow-md">
                    <ShieldCheck size={20} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-orange-900 bg-orange-100/90 px-3 py-1 rounded-full border border-orange-200">
                    Reglamento de Transparencia y Seguridad
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-tight leading-relaxed max-w-2xl mx-auto">
                  ⚠️ <span className="text-orange-700">IMPORTANTE:</span> Cartones sin pagar o con evidencia insuficiente del pago <span className="text-emerald-700 font-extrabold underline decoration-emerald-500">NO RECIBIRÁN</span> el pago de su premio. Debe enviar una evidencia verdadera y verificable.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-300/80 px-3.5 py-1 rounded-full shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Garantía de juego justo y premios certificados
                </div>
              </div>
            </div>
          )}
          
          {/* Rejected Banner */}
          {status === 'rejected' && (
            <div className="bg-red-50 border-4 border-red-500 p-6 rounded-3xl shadow-xl text-center animate-in fade-in slide-in-from-top-4 duration-500">
              <XCircle className="text-red-500 mx-auto mb-2" size={48} />
              <h2 className="text-2xl font-black text-red-900 uppercase tracking-tight">Solicitud Rechazada (Sistema Anti-fraude)</h2>
              <p className="text-red-800 font-medium mt-2">
                La venta de cartones no pudo ser completada debido a inconsistencias o falta de evidencia en tu comprobante de pago/QR.
                Por tu seguridad, esta solicitud fue anulada y los cartones no fueron habilitados.
              </p>
            </div>
          )}

          {/* Game Info */}
          {gameState && (
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{gameState.name || 'Juego Actual'}</h2>
                <div className="flex gap-6 text-sm font-bold text-slate-500 mt-2">
                  {gameState.prize && <span className="flex items-center gap-1.5"><Trophy size={14} className="text-yellow-500" /> Premios a repartir: <span className="text-green-600 font-black">{formatCurrency(gameState.prize)}</span></span>}
                  {gameState.card_value && <span className="flex items-center gap-1.5"><Grid size={14} className="text-blue-500" /> Cartón: <span className="text-blue-600 font-black">{formatCurrency(gameState.card_value)}</span></span>}
                </div>
              </div>
              <div className="bg-blue-50 px-5 py-3 rounded-2xl border border-blue-100 flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="flex h-2 w-2 relative">
                      <span className={clsx(
                        "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                        realtimeConnected ? "bg-emerald-400" : "bg-amber-400"
                      )} />
                      <span className={clsx(
                        "relative inline-flex rounded-full h-2 w-2",
                        realtimeConnected ? "bg-emerald-500" : "bg-amber-500"
                      )} />
                    </span>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {realtimeConnected ? 'En Vivo' : 'Conectando'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-end gap-1 mt-0.5">
                    <span className="font-black text-blue-900 text-2xl leading-none">{totalDrawn}</span>
                    <span className="font-bold text-slate-400 text-xs">/ 75</span>
                  </div>
                </div>
                <div className="w-px h-8 bg-blue-200" />
                <button 
                  onClick={announceLastBalls}
                  className="p-3 bg-yellow-400 hover:bg-yellow-500 rounded-xl transition text-yellow-900 shadow-sm active:scale-90"
                  title="Re-anunciar últimas balotas"
                  disabled={!totalDrawn}
                >
                  <Volume2 size={20} />
                </button>
                <button 
                  onClick={handleSync}
                  className={clsx(
                    "p-3 bg-blue-100 hover:bg-blue-200 rounded-xl transition text-blue-700 shadow-sm active:scale-90",
                    syncing && "animate-spin"
                  )}
                  title="Sincronizar juego"
                >
                  <RefreshCw size={20} />
                </button>
              </div>
            </div>
          )}

          {/* Patterns in Play */}
          {gameState?.patterns && gameState.patterns.length > 0 && (
            <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
              <h3 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                <Trophy size={16} className="text-yellow-500" /> Patrones en Juego
              </h3>
              <PatternRow patterns={gameState.patterns} detectedPatternIds={detectedPatternIds} />
            </div>
          )}

          {/* Tab Navigation - Slide Tabs Sticky */}
          <div className="sticky top-20 z-40 bg-white/80 backdrop-blur-md p-2 rounded-2xl shadow-lg border border-slate-200 mb-8 overflow-hidden mx-4 sm:mx-0">
            <div className="flex overflow-x-auto pb-1.5 gap-2 scrollbar-hide snap-x scroll-smooth px-1">
              {[
                { id: 'cards', icon: <Grid size={16} />, label: 'En Juego', color: 'bg-emerald-600' },
                { id: 'all-cards', icon: <List size={16} />, label: 'Mis Cartones', color: 'bg-blue-600' },
                { id: 'free_winners', icon: <Gift size={16} className="text-yellow-300" />, label: 'Premios Gratis ($300K)', color: 'bg-gradient-to-r from-amber-500 to-yellow-600' },
                { id: 'board', icon: <RefreshCw size={16} />, label: 'Tablero', color: 'bg-indigo-600' },
                { id: 'lottery', icon: <Trophy size={16} />, label: 'Loterías', color: 'bg-amber-600', hidden: !gameState?.active_lottery },
                { id: 'referrals', icon: <Users size={16} />, label: 'Referidos', color: 'bg-emerald-500' },
              ].filter(tab => !tab.hidden).map((tab) => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={clsx(
                    "flex-none flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap snap-start border-2",
                    activeTab === tab.id 
                      ? `${tab.color} text-white shadow-md border-transparent scale-[1.02]` 
                      : "bg-white text-slate-500 border-slate-100 hover:border-slate-200 shadow-sm"
                  )}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === 'free_winners' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <FreeGamesLeaderboard isAdmin={false} tenantId={tenantSlug || undefined} />
              </div>
            )}

            {activeTab === 'referrals' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-2 uppercase tracking-tight flex items-center gap-2">
                    <Sparkles className="text-emerald-500" /> Invita y Gana
                  </h3>
                  <p className="text-slate-400 text-xs font-bold uppercase mb-6 italic">Gana comisiones por cada compra de tus amigos referidos</p>
                  
                  <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border-2 border-emerald-200 rounded-3xl p-6 text-center space-y-3">
                    <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Tu Código Único de Referido</p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-3xl sm:text-4xl font-black text-emerald-700 font-mono tracking-wider bg-white px-5 py-2 rounded-2xl shadow-sm border border-emerald-200">
                        #{referralStats?.referral_code || '---'}
                      </span>
                      <button 
                        onClick={() => {
                          const baseOrigin = window.location.origin.includes('localhost') || window.location.origin.includes('ais-dev-') 
                            ? 'https://bingolite.click' 
                            : window.location.origin;
                          const code = referralStats?.referral_code || user?.phone || '';
                          navigator.clipboard.writeText(`${baseOrigin}/register?player_ref=${code}&ref=${code}`);
                          toast.success('¡Enlace de referido copiado al portapapeles!');
                        }}
                        className="p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer"
                        title="Copiar enlace de referido"
                      >
                        <Copy size={20} />
                      </button>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => handleShareReferralWhatsApp()}
                        className="w-full py-3.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-2xl font-black uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
                      >
                        <MessageCircle size={20} />
                        Invitar por WhatsApp (Elegir Contacto)
                      </button>
                    </div>
                  </div>

                  {/* Highlights Banner */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-slate-700 text-xs">
                    <h5 className="font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5 text-xs">
                      <span>✨</span> Beneficios para ti y tus amigos:
                    </h5>
                    <ul className="space-y-1.5 text-[11px] font-medium text-slate-600">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-black">✓</span>
                        <span><b>Bingos Gratis todos los días:</b> Tus amigos pueden participar sin pagar nada y ganar premios en vivo.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-black">✓</span>
                        <span><b>Comisiones en tu billetera:</b> Gana una comisión configurable cada vez que tus referidos compren cartones.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-black">✓</span>
                        <span><b>Retiros desde $300.000 COP:</b> Cuando acumulen $300.000 COP en premios, pueden solicitar su retiro directamente a Nequi en cualquier momento.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Send size={14} className="text-blue-500" /> O enviar a un número específico:
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="tel"
                        placeholder="Número de WhatsApp (Ej: 3001234567)"
                        value={invitePhone}
                        onChange={(e) => setInvitePhone(e.target.value)}
                        className="flex-1 p-3.5 border-2 border-slate-200 rounded-xl focus:border-[#25D366] outline-none font-bold text-slate-700 text-sm bg-slate-50 focus:bg-white"
                      />
                      <button 
                        onClick={sendInvite}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3.5 rounded-xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Send size={16} />
                        Enviar Directo
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                    <h3 className="text-sm font-black text-slate-800 mb-4 uppercase flex items-center gap-2">
                      <Wallet className="text-blue-500" size={18} /> Ganancias Totales
                    </h3>
                    <div className="flex flex-col items-center justify-center py-4">
                      <span className="text-4xl font-black text-emerald-600 tabular-nums">
                        {formatCurrency(referralStats?.totalCommissions || 0)}
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 italic">Saldo generado por referidos</p>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                    <h3 className="text-sm font-black text-slate-800 mb-4 uppercase flex items-center gap-2">
                      <Users className="text-purple-500" size={18} /> Amigos Referidos
                    </h3>
                    <div className="flex flex-col items-center justify-center py-4">
                      <span className="text-4xl font-black text-slate-800 tabular-nums">
                        {referralStats?.referrals?.length || 0}
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 italic">Personas que usaron tu código</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                  <h3 className="text-sm font-black text-slate-800 mb-6 uppercase flex items-center gap-2">
                    <List className="text-blue-500" size={18} /> Listado de Referidos
                  </h3>
                  
                  {referralStats?.referrals?.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                      <Users className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-slate-500 font-bold uppercase text-xs">Aún no tienes referidos</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {referralStats?.referrals?.map((ref: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 border border-slate-100">
                              <Users size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800 truncate max-w-[120px] sm:max-w-none">{ref.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{ref.phone}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="block text-[10px] font-black text-blue-600 uppercase tracking-tighter">
                              {ref.card_count} Cartones
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium italic">
                              {(new Date(ref.created_at)).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'lottery' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {gameState && (savedLotteryCodes.size > 0 || (lotteryConfirmed && isLotteryWinner)) ? (
                  <div className={clsx(
                    "rounded-3xl p-6 shadow-xl border",
                    lotteryConfirmed && isLotteryWinner 
                      ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-white border-yellow-400" 
                      : "bg-white border-slate-200"
                  )}>
                    {lotteryConfirmed && isLotteryWinner ? (
                      <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-4xl bg-white/20 p-3 rounded-2xl animate-bounce">🏆</div>
                          <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">¡Fuiste el ganador de la lotería!</h3>
                            <p className="text-amber-50 text-base font-semibold mt-1">
                              Tu código de lotería <span className="font-black border border-amber-200/50 bg-amber-500 text-white px-2 py-0.5 rounded font-mono shadow-sm">#{lotteryWinningCode}</span> ha resultado ganador oficial del sorteo.
                            </p>
                            <p className="text-white text-sm font-bold mt-2 bg-black/20 p-3 rounded-xl border border-black/10">
                              ¡Felicitaciones! Ponte en contacto con los administradores para reclamar tu premio.
                            </p>
                          </div>
                        </div>
                        <div className="bg-white/25 px-5 py-2.5 rounded-xl border border-white/30 font-black text-sm uppercase tracking-wider shrink-0 mt-3 md:mt-0">
                          🏆 Ganador Oficial 🎰
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <div className="space-y-1">
                            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                              <span>🎰</span> Códigos de Sorteo Registrados
                            </h3>
                            <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">
                              Tus códigos para el sorteo de dos, tres y cuatro cifras:
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            {[...savedLotteryCodes].map(code => (
                              <span key={code} className="inline-flex bg-amber-50 text-amber-800 border border-amber-200 font-black text-xs px-3.5 py-2 rounded-xl shadow-sm">
                                🍀 Código #{code}
                              </span>
                            ))}
                            <span className="text-[9px] bg-sky-50 text-sky-700 border border-sky-100 font-black px-2.5 py-1.5 rounded-lg uppercase tracking-widest ml-1 animate-pulse">
                              Sorteo Pendiente
                            </span>
                          </div>
                        </div>

                        {/* DETAILS OF THE ACTIVE LOTTERY */}
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-0.5">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">🎯 Lotería en Juego</span>
                              <p className="text-xs font-black text-slate-700 uppercase">
                                {gameState.lottery_name || 'Lotería Nocturna Oficial'}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">📅 Fecha de Juego</span>
                              <p className="text-xs font-black text-slate-700 uppercase">
                                {gameState.lottery_date || 'Noche de hoy'}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">⏰ Hora del Sorteo</span>
                              <p className="text-xs font-black text-slate-700 uppercase">
                                {gameState.lottery_time || 'Por la noche'}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">🎰 Cifras en Juego</span>
                              <p className="text-xs font-black text-slate-700 uppercase">
                                Últimas {gameState.lottery_digits || '3'} cifras
                              </p>
                            </div>
                          </div>
                          
                          {(gameState.lottery_prize_type || gameState.lottery_prize_value) && (
                            <div className="bg-amber-100/50 p-3 rounded-xl border border-amber-200/50 flex flex-col sm:flex-row items-center gap-3">
                              <div className="bg-white p-2 rounded-lg shadow-sm">
                                {gameState.lottery_prize_type === 'cash' ? '💵' : '🛍️'}
                              </div>
                              <div>
                                <span className="text-[9px] font-black uppercase text-amber-700/70 tracking-wider block">Premio a Ganar</span>
                                <p className="text-sm font-black text-amber-900 uppercase">
                                  {gameState.lottery_prize_value || 'Premio Sorpresa'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 font-bold leading-normal bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                          🍀 <strong>Nota de Participación:</strong> Ahora tus cartones participan con un <strong>código único de 4 cifras</strong> generado aleatoriamente. Este código es el que jugarás para los sorteos de dos, tres y cuatro cifras de la lotería oficial. ¡Asegúrate de guardar tu código para que quede registrado en el sistema!
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white rounded-3xl shadow-xl border border-slate-200">
                    <div className="text-5xl mb-4 grayscale opacity-50">🎟️</div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">No Tienes Códigos Registrados</h3>
                    <p className="text-slate-400 text-sm font-bold mt-2">
                      Registra el código de tus cartones en la pestaña "En Juego" para participar en el sorteo de la lotería oficial.
                    </p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'board' && (
              <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-wider flex items-center gap-2">
                  <Grid size={24} className="text-blue-500" /> Tablero General
                </h3>
                <BingoBoard drawnBalls={currentDrawnBalls} />
              </div>
            )}

            {activeTab === 'all-cards' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
                  <h3 className="text-lg font-black text-slate-800 mb-2 uppercase tracking-tight">Mis Cartones Y Reservas</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase mb-6">Aquí tienes todos tus cartones apartados para futuros juegos</p>
                  
                  {allCards.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                      <Grid className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-slate-500 font-bold uppercase text-xs">No tienes cartones en tu cuenta</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {allCards.map((card) => (
                        <div key={card.id} className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm overflow-hidden flex flex-col p-4 group hover:border-blue-400 transition-colors">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <span className="block text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1 italic">
                                {card.isReserved ? 'RESERVADO' : `NÚMERO: ${card.card_number}`}
                              </span>
                              <h4 className="text-sm font-black text-slate-800 uppercase leading-none">
                                {card.game_name}
                              </h4>
                            </div>
                            <span className={clsx(
                              "px-2 py-0.5 rounded-full text-[8px] font-black uppercase",
                              card.game_status === 'scheduled' || card.game_status === 'waiting' ? "bg-blue-100 text-blue-600" :
                              card.game_status === 'playing' ? "bg-green-100 text-green-600 animate-pulse" :
                              "bg-slate-100 text-slate-500"
                            )}>
                              {card.game_status === 'scheduled' ? 'Programado' :
                               card.game_status === 'waiting' ? 'Esperando' :
                               card.game_status === 'playing' ? 'En Juego' : 'Finalizado'}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Fecha del Juego</span>
                              <span className="text-[10px] font-black text-slate-700 uppercase">
                                {new Date(card.game_start_time).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            
                            {card.isReserved ? (
                              <button
                                disabled={assigningLoading === card.id || !['waiting', 'scheduled', 'playing', 'paused'].includes(card.game_status)}
                                onClick={() => handleAssignCard(card.id)}
                                className={clsx(
                                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95",
                                  ['waiting', 'scheduled', 'playing', 'paused'].includes(card.game_status)
                                    ? "bg-blue-600 text-white hover:bg-blue-700" 
                                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                )}
                              >
                                {assigningLoading === card.id ? (
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  'Asignar Ahora'
                                )}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1 text-green-500">
                                <CheckCircle2 size={14} />
                                <span className="text-[10px] font-black uppercase">Listo</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'cards' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Countdown Timer - Enhanced for Pre-Game */}
                {timeLeft && (gameState?.status === 'waiting' || gameState?.status === 'scheduled') && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={clsx(
                      "rounded-[2.5rem] shadow-2xl p-6 text-center relative overflow-hidden border-4",
                      gameState?.status === 'scheduled' ? "bg-gradient-to-br from-orange-600 to-red-600 border-orange-400" : "bg-slate-900 border-slate-800"
                    )}
                  >
                    {/* Animated background rings */}
                    {gameState?.status === 'scheduled' && (
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <motion.div 
                          animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 bg-white/20 rounded-full scale-0 m-auto w-64 h-64"
                        />
                      </div>
                    )}

                    <div className="relative z-10 flex flex-col items-center gap-4">
                      <div className="flex flex-col items-center">
                        <div className={clsx(
                          "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] mb-2 shadow-lg",
                          gameState?.status === 'scheduled' ? "bg-white text-red-600 animate-pulse" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        )}>
                          <Clock size={16} />
                          {gameState?.status === 'scheduled' ? 'El juego inicia pronto' : 'Próximo Juego'}
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter drop-shadow-xl">
                          {gameState.name}
                        </h2>
                      </div>
                      
                      <div className="flex justify-center gap-4">
                        {Object.entries(timeLeft).map(([unit, value], idx) => {
                          if (unit === 'days' && value === 0) return null;
                          return (
                            <div key={unit} className="flex flex-col items-center">
                              <div className={clsx(
                                "w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center border-2 shadow-2xl relative overflow-hidden",
                                gameState?.status === 'scheduled' ? "bg-white/10 border-white/30 backdrop-blur-md" : "bg-slate-800 border-slate-700"
                              )}>
                                <span className="text-2xl md:text-3xl font-black text-white relative z-10">{String(value ?? 0).padStart(2, '0')}</span>
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white/5" />
                              </div>
                              <span className={clsx(
                                "text-[10px] font-black mt-2 uppercase tracking-widest",
                                gameState?.status === 'scheduled' ? "text-white/80" : "text-slate-500"
                              )}>
                                {unit === 'days' ? 'Días' : unit === 'hours' ? 'Hrs' : unit === 'minutes' ? 'Min' : 'Seg'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="w-full max-w-xs h-1.5 bg-black/20 rounded-full overflow-hidden mt-2 p-px border border-white/10">
                        <motion.div 
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 60, ease: "linear" }}
                          className="h-full bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Panel de Balotas Salientes y Contador en Tiempo Real */}
                {gameState && (
                  <motion.div 
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-[2.5rem] p-5 sm:p-6 shadow-2xl border-4 border-slate-700/60 relative overflow-hidden"
                  >
                    {/* Efectos de luz ambiente de fondo */}
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                    {/* Cabecera superior del panel */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-700/80 relative z-10">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-3 w-3 relative">
                          <span className={clsx(
                            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                            realtimeConnected ? "bg-emerald-400" : "bg-amber-400"
                          )} />
                          <span className={clsx(
                            "relative inline-flex rounded-full h-3 w-3",
                            realtimeConnected ? "bg-emerald-500" : "bg-amber-500"
                          )} />
                        </span>
                        <div>
                          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                            Balotas Salientes & Tablero En Vivo
                          </h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {realtimeConnected ? 'Sincronizado en tiempo real' : 'Reconectando sala...'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={announceLastBalls}
                          disabled={!currentDrawnBalls.length}
                          className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Repetir locución de las últimas balotas"
                        >
                          <Volume2 size={14} />
                          <span className="hidden sm:inline">Repetir Balotas</span>
                        </button>

                        <button
                          onClick={handleSync}
                          disabled={syncing}
                          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl transition active:scale-95 disabled:opacity-50"
                          title="Sincronizar manualmente"
                        >
                          <RefreshCw size={16} className={clsx(syncing && "animate-spin text-blue-400")} />
                        </button>
                      </div>
                    </div>

                    {/* Contenido: Balota actual 3D + Contador con barra + Historial reciente */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-5 items-center relative z-10">
                      
                      {/* 1. Balota Actual Saliente en 3D */}
                      <div className="md:col-span-4 flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-800/80 rounded-3xl border border-slate-700/80 shadow-inner">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          {gameState.status === 'playing' ? '🔴 Balota Actual Cantada' : 'Balota en Juego'}
                        </span>

                        {lastDrawnBall ? (() => {
                          const theme = getBallVisualTheme(lastDrawnBall);
                          return (
                            <AnimatePresence mode="wait">
                              <motion.div
                                key={lastDrawnBall}
                                initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 350, damping: 20 }}
                                className={clsx(
                                  "relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1.5 shadow-2xl flex items-center justify-center bg-gradient-to-br",
                                  theme.gradient,
                                  theme.glow
                                )}
                              >
                                <div className="absolute top-1 left-4 w-1/2 h-1/3 bg-white/30 rounded-full blur-[2px] pointer-events-none" />
                                <div className="absolute inset-0 rounded-full ring-2 ring-white/40 pointer-events-none" />

                                <div className="w-full h-full rounded-full flex flex-col items-center justify-center text-center">
                                  <span className="text-white text-base sm:text-lg font-black tracking-widest drop-shadow-md leading-none">
                                    {theme.letter}
                                  </span>
                                  <div className="bg-white w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-lg border-2 border-black/10 mt-1">
                                    <span className="text-slate-900 font-black text-2xl sm:text-3xl leading-none">
                                      {lastDrawnBall}
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            </AnimatePresence>
                          );
                        })() : (
                          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-dashed border-slate-600 flex flex-col items-center justify-center text-slate-400">
                            <Clock size={28} className="animate-pulse mb-1 text-slate-500" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-center px-2">
                              En Espera...
                            </span>
                          </div>
                        )}

                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-300 mt-3 flex items-center gap-1.5">
                          {lastDrawnBall ? `Letra ${getBallLetter(lastDrawnBall)} - Número ${lastDrawnBall}` : 'Sin balotas sorteadas'}
                        </span>
                      </div>

                      {/* 2. Contador de Balotas y Progreso */}
                      <div className="md:col-span-4 flex flex-col justify-center space-y-3 p-4 bg-slate-800/80 rounded-3xl border border-slate-700/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Contador de Balotas
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {progressPercent}% Jugado
                          </span>
                        </div>

                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                            {totalDrawn}
                          </span>
                          <span className="text-xl sm:text-2xl font-bold text-slate-400">
                            / 75
                          </span>
                          <span className="text-xs font-bold text-slate-400 uppercase ml-auto">
                            Balotas
                          </span>
                        </div>

                        {/* Barra de progreso interactiva */}
                        <div className="w-full bg-slate-700/80 rounded-full h-3 p-0.5 overflow-hidden border border-slate-600">
                          <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 via-emerald-400 to-amber-400 rounded-full shadow-lg"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercent}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                          />
                        </div>

                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                          <span>Salieron: {totalDrawn}</span>
                          <span className="text-amber-400 font-extrabold">Faltan: {remainingBalls}</span>
                        </div>
                      </div>

                      {/* 3. Historial de Últimas Balotas Salientes */}
                      <div className="md:col-span-4 flex flex-col justify-center p-4 bg-slate-800/80 rounded-3xl border border-slate-700/80 h-full">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5">
                          <History size={12} className="text-slate-400" /> Últimas Balotas Cantadas
                        </span>

                        {recentDrawnBalls.length > 0 ? (
                          <div className="flex flex-wrap gap-2 items-center">
                            {recentDrawnBalls.map((ball, idx) => {
                              const theme = getBallVisualTheme(ball);
                              return (
                                <div
                                  key={`${ball}-${idx}`}
                                  className={clsx(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl border shadow-md transition transform hover:scale-105",
                                    theme.border,
                                    "bg-slate-900/90"
                                  )}
                                  title={`Balota ${theme.letter}-${ball}`}
                                >
                                  <span className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black", theme.chipBg)}>
                                    {theme.letter}
                                  </span>
                                  <span className="text-white font-black text-sm">
                                    {ball}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-slate-500 text-xs font-bold uppercase tracking-wider">
                            {totalDrawn > 0 ? 'Solo ha salido una balota' : 'Aún no han salido balotas'}
                          </div>
                        )}
                      </div>

                    </div>
                  </motion.div>
                )}

                {gameState?.active_lottery && gameState?.active_draw && cards.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 flex items-start gap-3.5 text-left shadow-lg"
                  >
                    <span className="text-2xl sm:text-3xl shrink-0">🎰</span>
                    <div>
                      <p className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-widest leading-none flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                        Lotería Activa para esta Ronda
                      </p>
                      <p className="text-[11px] sm:text-xs text-amber-900 leading-relaxed font-bold mt-1.5">
                        Atención: Tus cartones participan con las últimas tres cifras de la lotería en juego para la noche de hoy. ¡Conserva tu cartón y sigue los resultados oficiales! 🍀🏟️
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Cards Grid */}
                {cards.length === 0 ? (
                  <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 text-center">
                    <div className="w-20 h-20 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Grid size={40} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 mb-2">Sin Cartones</h3>
                    <p className="text-slate-500 font-medium mb-6">
                      Actualmente no tienes cartones asignados. Si ya pagaste, espera a que el administrador los apruebe. Si el juego anterior terminó, debes registrarte nuevamente para el próximo juego.
                    </p>
                    <button 
                      onClick={() => navigate("/register")}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xl rounded-2xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest"
                    >
                      <Plus size={24} /> Comprar cartón
                    </button>

                    {gameState?.whatsapp_group_link && (
                      <a 
                        href={gameState.whatsapp_group_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 w-full py-3.5 bg-[#25D366] hover:bg-[#128C7E] text-white font-black text-sm rounded-2xl shadow-md transition active:scale-95 flex items-center justify-center gap-2.5 uppercase tracking-wide"
                      >
                        <WhatsAppLogo size={24} />
                        <div className="flex flex-col items-start text-left leading-tight">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100 opacity-90">Comunidad VIP</span>
                          <span className="text-xs font-black">Únete al WhatsApp</span>
                        </div>
                      </a>
                    )}
                  </div>
                ) : (
                  <div className={clsx(
                    "grid gap-4 md:gap-8",
                    cards.length >= 3 ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"
                  )}>
                    {cards.map((card) => {
                      const grid = card.grid || [
                        [0,0,0,0,0],
                        [0,0,0,0,0],
                        [0,0,0,0,0],
                        [0,0,0,0,0],
                        [0,0,0,0,0]
                      ];

                      const cardNumStr = card?.card_number != null ? String(card.card_number) : '';
                      const isWinnerCard = (cardNumStr !== '' && winningCards.has(cardNumStr)) || 
                                           (card?.card_number != null && !isNaN(Number(card.card_number)) && winningCards.has(String(Number(card.card_number))));

                      const { hasWonPattern } = getAllWinningCellsForCard(
                        card,
                        gameState?.patterns || [],
                        gameState?.drawn_balls || []
                      );
                      const isWinner = isWinnerCard || hasWonPattern;

                      const isCompact = cards.length >= 3;

                      return (
                        <div key={card.id} className={clsx(
                          "shadow-2xl overflow-hidden border-slate-900 transform transition hover:scale-[1.02]",
                          isCompact 
                            ? "rounded-2xl sm:rounded-[2.5rem] border-2 sm:border-4" 
                            : "rounded-[2.5rem] border-4",
                          isWinner ? "border-green-500 shadow-green-500/20" : ""
                        )}>
                          <div className={clsx(
                            "flex justify-between items-center relative overflow-hidden bg-slate-900 text-white",
                            isCompact ? "p-2 sm:p-4" : "p-4"
                          )}>
                            <div className="flex items-center gap-2 relative z-10">
                              <span className={clsx(
                                "font-black tracking-widest italic",
                                isCompact ? "text-[10px] sm:text-xs md:text-sm" : "text-sm"
                              )}>
                                CARTÓN #{card.card_number}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 relative z-10">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse bg-green-500" />
                              <span className={clsx(
                                "font-black uppercase text-slate-400 truncate max-w-[60px] sm:max-w-none",
                                isCompact ? "text-[8px] sm:text-[10px]" : "text-[10px]"
                              )}>
                                {player?.name || 'JUGADOR'}
                              </span>
                            </div>
                          </div>
                          
                          <div className={clsx(
                            "bg-slate-50 relative",
                            isCompact ? "p-1.5 sm:p-3" : "p-3"
                          )}>
                            {/* Guardar Número Bar */}
                            {gameState?.active_lottery && (
                              <div className="bg-slate-100 text-slate-700 px-3 py-2 flex justify-between items-center text-[10px] sm:text-xs font-bold rounded-xl mb-1.5 border border-slate-200/60 shadow-sm relative z-20">
                                <div className="flex flex-col">
                                  <span className="text-slate-600 flex items-center gap-1 font-black uppercase tracking-wide">
                                    🎰 ¿Juegas con Lotería?
                                  </span>
                                  <span className="text-[10px] font-black text-blue-600 mt-0.5">
                                    CÓDIGO: {card.lottery_code || '---'}
                                  </span>
                                </div>
                                {savedLotteryCodes.has(String(card.lottery_code)) ? (
                                  <span className="bg-emerald-100 text-emerald-800 px-2 sm:px-2.5 py-1 rounded-lg font-black uppercase text-[10px] flex items-center gap-1 border border-emerald-200">
                                    ✅ GUARDADO
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => saveLotteryNumber(String(card.lottery_code), card.card_number)}
                                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white px-2.5 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 font-extrabold uppercase tracking-wider text-[9px] sm:text-[10px] shadow-md cursor-pointer hover:shadow-lg animate-pulse"
                                  >
                                    💾 Guardar número
                                  </button>
                                )}
                              </div>
                            )}

                            <div className={clsx(
                              "grid grid-cols-5 relative z-10",
                              isCompact ? "gap-1 sm:gap-1.5 mb-1 sm:mb-1.5" : "gap-1.5 mb-1.5"
                            )}>
                              {['B', 'I', 'N', 'G', 'O'].map((letter, i) => (
                                <div 
                                  key={`${card.id}-${i}`} 
                                  className={clsx(
                                    "bg-red-600 text-white font-black text-center shadow-lg",
                                    isCompact 
                                      ? "text-lg sm:text-3xl py-1 sm:py-3 rounded-lg sm:rounded-2xl" 
                                      : "text-3xl py-3 rounded-2xl"
                                  )}
                                >
                                  {letter}
                                </div>
                              ))}
                            </div>
                            
                            <div className={clsx(
                              "grid grid-cols-5 relative z-10",
                              isCompact ? "gap-1 sm:gap-1.5" : "gap-1.5"
                            )}>
                              {getSafeCardGrid(card.grid).map((row, rIdx) => (
                                <React.Fragment key={rIdx}>
                                  {row.map((cell, cIdx) => {
                                    const isFree = cell === 'FREE' || cell === 0 || cell === '0';
                                    const numCell = Number(cell);
                                    const isDrawn = !isFree && !isNaN(numCell) && drawnBallsSet.has(numCell);
                                    const isMarked = markedCells[`${card.id}-${rIdx}-${cIdx}`];
                                    const isWinner = winner !== null;
                                    const shouldShowCell = !isWinner || isMarked || isFree;
                                    
                                    return (
                                      <button
                                        key={`${rIdx}-${cIdx}`}
                                        data-no-click-sound="true"
                                        onClick={(e) => toggleCell(e, String(card?.id ?? ''), rIdx, cIdx, cell)}
                                        className={clsx(
                                          "aspect-square flex items-center justify-center font-black transition-all transform active:scale-90 shadow-sm relative",
                                          isCompact 
                                            ? "text-sm sm:text-xl md:text-2xl rounded-lg sm:rounded-2xl border sm:border-2" 
                                            : "text-2xl rounded-2xl border-2",
                                          isFree ? "bg-yellow-400 text-yellow-900 border-yellow-500" :
                                          isMarked ? "bg-blue-600 text-white border-blue-700 scale-95 shadow-inner" :
                                          (isDrawn && !isWinner) ? "bg-green-100 text-green-800 border-green-300" :
                                          "bg-white text-slate-800 border-slate-200 hover:bg-slate-100"
                                        )}
                                      >
                                        {isFree ? (isCompact ? '★' : 'FREE') : (shouldShowCell ? cell : '')}
                                        {isMarked && !isFree && (
                                          <div className="absolute inset-0 flex items-center justify-center opacity-20">
                                            <div className="w-4/5 h-4/5 rounded-full bg-black" />
                                          </div>
                                        )}
                                      </button>
                                    );
                                  })}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>

                          <div className={clsx(
                            "bg-white border-t border-slate-100 p-2 sm:p-4 text-center text-slate-400 text-[10px] font-bold uppercase italic flex items-center justify-center",
                            isCompact ? "h-12 sm:h-20" : "h-24"
                          )}>
                            Espacio para Publicidad
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Chat (Desktop) - HIDDEN */}
        <div className="hidden">
          <div className="sticky top-24 h-[calc(100vh-120px)]">
            <ChatComponent userName={player?.name || 'Bingo Player'} isAdmin={false} />
          </div>
        </div>
      </div>

      {/* Floating Chat Window (Always mounted to keep state, visually hidden) */}
      <div
        className={clsx(
          "fixed z-[60] shadow-2xl rounded-3xl overflow-hidden transition-all duration-300 origin-bottom-right flex flex-col",
          "bottom-6 left-4 right-4 h-[80vh] md:left-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[600px]",
          isChatOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 translate-y-10 pointer-events-none"
        )}
      >
        <ChatComponent 
          userName={player?.name || 'Bingo Player'} 
          isAdmin={false} 
          onNewMessage={() => !isChatOpen && setHasUnreadMessages(true)}
          isChatEnabled={isChatEnabled}
          onClose={() => {
            playChatCloseSound();
            setIsChatOpen(false);
          }}
        />
      </div>

      {/* Floating AI Chat Window */}
      <div
        className={clsx(
          "fixed z-[60] shadow-2xl rounded-3xl overflow-hidden transition-all duration-300 origin-bottom-right flex flex-col",
          "bottom-6 left-4 right-4 h-[80vh] md:left-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[600px]",
          isAIOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 translate-y-10 pointer-events-none"
        )}
      >
        <AIChatAgent 
          onClose={() => {
            playChatCloseSound();
            setIsAIOpen(false);
          }} 
          aiModel={gameState?.ai_model}
          knowledgeBase={gameState?.ai_knowledge_base}
        />
      </div>
      
      {/* Floating Chat Bubble */}
      <div className={clsx(
        "fixed bottom-6 right-6 z-[100] flex flex-col gap-4 transition-all duration-300",
        (isChatOpen || isAIOpen) ? "opacity-0 scale-0 pointer-events-none" : "opacity-100 scale-100"
      )}>
        {gameState && gameState.ai_chat_enabled !== false && (
          <div className="relative group">
            {/* Pulsing background effect */}
            <motion.div 
              animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.5, 0.2] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute inset-0 bg-purple-500 rounded-full"
            />
            
            {/* Message bubble */}
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="absolute -top-12 right-0 bg-purple-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl whitespace-nowrap shadow-lg border border-purple-400/30 flex items-center gap-1.5"
            >
              <Sparkles size={12} className="text-yellow-300" />
              Hola preguntame.!
              <div className="absolute -bottom-1 right-5 w-2 h-2 bg-purple-600 rotate-45" />
            </motion.div>

            <button
              onClick={() => {
                if (isAIOpen) {
                  playChatCloseSound();
                } else {
                  playChatOpenSound();
                  setIsChatOpen(false);
                }
                setIsAIOpen(!isAIOpen);
              }}
              className="bg-purple-600 text-white p-4 rounded-full shadow-2xl hover:bg-purple-700 transition-all active:scale-90 relative z-10"
            >
              <Bot size={24} />
            </button>
          </div>
        )}

        <motion.div
          animate={{ 
            x: [0, -2, 2, -2, 2, 0],
            rotate: [0, -5, 5, -5, 5, 0]
          }}
          transition={{ 
            duration: 0.5, 
            repeat: Infinity, 
            repeatDelay: 9.5,
            ease: "easeInOut"
          }}
        >
          <button
            onClick={() => {
              if (isChatOpen) {
                playChatCloseSound();
              } else {
                playChatOpenSound();
                setIsAIOpen(false);
              }
              setIsChatOpen(!isChatOpen);
              setHasUnreadMessages(false);
            }}
            className="bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-700 transition-all active:scale-90 relative"
          >
            <MessageSquare size={24} />
            {hasUnreadMessages && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            )}
          </button>
        </motion.div>
      </div>
      
      {winner && (
        <BingoWinnerPopup 
          winners={winner.winners} 
          winner={!winner.winners ? winner : undefined}
          prize={winner.prize}
          pattern_name={winner.pattern_name}
          pattern_grid={winner.pattern_grid}
          patterns={gameState?.patterns}
          onClose={() => {
            setWinner(null);
            isAnnouncingWinnerRef.current = false;
            setIsAnnouncingWinner(false);
            activeWinnerIdRef.current = null;
            setWinnerSpeechActive(false);
            // When modal closes, wait a few seconds before showing the appropriate banner
            if (pendingPayment) {
              const paymentToShow = pendingPayment;
              setPendingPayment(null);
              setTimeout(() => {
                setPaymentBanner(paymentToShow);
                // Display banner for 10 seconds
                setTimeout(() => setPaymentBanner(null), 10000);
              }, 2000);
            } else if (winner && gameState?.card_value > 0) {
              // Paid game winner - show contact banner
              setTimeout(() => {
                setContactBanner(true);
                setTimeout(() => setContactBanner(false), 10000);
              }, 2000);
            }
          }} 
        />
      )}

      {gameFinished && (
        <GameSummaryPopup 
          winners={gameFinished.winners || []}
          finalNote={gameFinished.final_note || ""}
          onClose={() => setGameFinished(null)}
        />
      )}

      {/* Floating Live Stream */}
      <AnimatePresence>
        {isLiveOpen && (
          <motion.div
            drag={!isStreamMaximized}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.1}
            initial={isStreamMaximized ? { scale: 0.8, opacity: 0 } : { x: 20, y: 20, opacity: 0 }}
            animate={isStreamMaximized ? { 
              x: 0, 
              y: 0, 
              scale: 1, 
              opacity: 1,
              width: '100vw',
              height: '100vh',
              top: 0,
              left: 0,
              borderRadius: 0,
              zIndex: 100
            } : { 
              x: '-50%', 
              y: 0, 
              scale: 1, 
              opacity: 1,
              width: isStreamMinimized ? 100 : 180,
              height: isStreamMinimized ? 178 : 320,
              bottom: 85,
              right: 'auto',
              top: 'auto',
              left: '50%',
              borderRadius: '20px',
              zIndex: 50
            }}
            exit={{ scale: 0.5, opacity: 0 }}
            className={clsx(
              "fixed shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden bg-black touch-none group",
              isStreamMaximized ? "border-0" : "border-2 border-slate-800"
            )}
          >
            {/* Header controls - visible on hover or if maximized */}
            <div className={clsx(
              "absolute z-20 flex transition-all duration-300",
              isStreamMaximized 
                ? "top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent items-center justify-between px-6 opacity-100"
                : "top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-end gap-1.5 opacity-40 group-hover:opacity-100"
            )}>
              <div className={clsx("flex items-center gap-2", isStreamMaximized ? "" : "hidden")}>
                <Radio size={18} className="text-red-500 animate-pulse" />
                <span className="font-black text-white uppercase tracking-widest text-sm">En Vivo</span>
              </div>
              
              <div className="flex items-center gap-1.5">
                {!isStreamMaximized && (
                  <button 
                    onClick={() => setIsStreamMinimized(!isStreamMinimized)}
                    className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition border border-white/10 backdrop-blur-md"
                    title={isStreamMinimized ? "Agrandar" : "Achicar"}
                  >
                    {isStreamMinimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                  </button>
                )}
                <button 
                  onClick={() => setIsStreamMaximized(!isStreamMaximized)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition border border-white/10 backdrop-blur-md"
                  title={isStreamMaximized ? "Minimizar" : "Pantalla Completa"}
                >
                  {isStreamMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                </button>
              </div>
            </div>

            <div className="w-full h-full relative">
              {/* Audio activation overlay (Fixed at bottom for visibility) */}
              {isStreamActive && isStreamMuted && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
                  <button 
                    onClick={() => {
                      setIsStreamMuted(false);
                      playMarkSound();
                    }}
                    className="flex flex-col items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-3xl shadow-2xl border-2 border-white/30 transition-all hover:scale-105 active:scale-95 group animate-in zoom-in duration-300"
                  >
                    <div className="bg-white/20 p-3 rounded-full group-hover:bg-white/30 transition-colors">
                      <Volume2 size={32} className="animate-pulse" />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-black uppercase tracking-widest whitespace-nowrap">Activar Audio</span>
                      <span className="text-[9px] font-bold opacity-70 uppercase tracking-tighter">Haz clic aquí</span>
                    </div>
                  </button>
                </div>
              )}

              {/* Stream active indicator for minimized state when not hovered */}
              {!isStreamMaximized && (
                <div className="absolute top-2 left-2 z-10 pointer-events-none transition-opacity group-hover:opacity-0">
                  <div className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-tighter">
                    <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                    Live
                  </div>
                </div>
              )}

              {isStreamActive ? (
                <LiveStream 
                  isAdmin={false} 
                  streamId={twitchChannel} 
                  isMaximized={isStreamMaximized} 
                  isMuted={isStreamMuted} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-slate-900 p-8 text-center gap-4">
                  <Radio size={isStreamMaximized ? 48 : 24} className="text-slate-700 animate-pulse" />
                  <div className={clsx(!isStreamMaximized && "hidden")}>
                    <p className="text-white font-black uppercase tracking-widest text-sm">Transmisión Desconectada</p>
                    <p className="text-slate-400 text-xs font-bold">Vuelve pronto, el administrador iniciará el en vivo en breve.</p>
                  </div>
                  {!isStreamMaximized && (
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-tighter">Sin Señal</p>
                  )}
                </div>
              )}
            </div>

            {isStreamMaximized && (
              <button 
                onClick={() => setIsStreamMaximized(false)}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 bg-white text-slate-900 font-black rounded-2xl shadow-2xl hover:bg-slate-100 transition uppercase tracking-widest text-sm z-50"
              >
                Cerrar Intervención
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Banner (Wallet/Free Games) */}
      <AnimatePresence>
        {paymentBanner && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-0 left-0 right-0 z-[150] p-4 flex justify-center"
          >
            <div className="bg-slate-900/95 backdrop-blur-md border-b-2 border-emerald-500 shadow-2xl w-full max-w-lg p-6 rounded-b-[2.5rem] flex items-center gap-6 overflow-hidden relative">
              <button 
                onClick={() => setPaymentBanner(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition z-10"
              >
                <X size={20} />
              </button>

              <div className="flex-shrink-0 w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Trophy size={32} className="text-white" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">
                  {paymentBanner.title || 'Pagando al Ganador'}
                </h4>
                <h3 className="text-xl font-black text-white truncate mb-1">
                  {paymentBanner.winner_name}
                </h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-tight">
                  {paymentBanner.message || 'Pago directo a la billetera'}
                </p>
              </div>
              
              <div className="flex flex-col items-end mr-6">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cantidad</span>
                <span className="text-2xl font-black text-emerald-400 tabular-nums">
                  {paymentBanner.amount}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact Banner (Paid Games) */}
      <AnimatePresence>
        {contactBanner && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-0 left-0 right-0 z-[150] p-4 flex justify-center"
          >
            <div className="bg-blue-600 border-b-4 border-blue-400 shadow-2xl w-full max-w-lg p-6 rounded-b-[2.5rem] flex items-center gap-6 relative">
              <button 
                onClick={() => setContactBanner(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition z-10"
              >
                <X size={20} />
              </button>

              <div className="flex-shrink-0 w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center border-2 border-white/30">
                <MessageSquare size={32} className="text-white" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="text-[10px] font-black text-blue-200 uppercase tracking-[0.2em] mb-1">
                  Aviso para Ganadores
                </h4>
                <h3 className="text-lg font-black text-white leading-tight uppercase">
                  Los ganadores serán contactados para coordinar el pago de su premio.
                </h3>
                <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mt-1">
                  ¡Gracias por jugar con nosotros!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

        {/* Wallet History Modal */}
        <AnimatePresence>
          {showWalletHistoryModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowWalletHistoryModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl w-[90%] max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[80vh]"
              >
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Wallet size={18} className="text-blue-500" /> Historial de Billetera
                  </h3>
                  <button 
                    onClick={() => setShowWalletHistoryModal(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                  {walletHistory.length === 0 ? (
                    <div className="text-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                      <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-blue-100 shadow-sm">
                        <Wallet size={28} />
                      </div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Sin Movimientos Aún</h4>
                      <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto mt-1 leading-relaxed">
                        Aquí verás reflejadas tus recargas, pagos de cartones y premios abonados a tu saldo.
                      </p>
                      <button 
                        onClick={() => {
                          setShowWalletHistoryModal(false);
                          setRechargeStatus('idle');
                          setRechargeError('');
                          setShowRechargeModal(true);
                        }}
                        className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition active:scale-95 inline-flex items-center gap-1.5"
                      >
                        <PlusCircle size={14} /> Recargar Saldo Ahora
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {walletHistory.map((txn, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center text-sm">
                          <div>
                            <p className="font-bold text-slate-800">{txn.description}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{(new Date(txn.created_at)).toLocaleString()}</p>
                          </div>
                          <span className={clsx("font-black text-lg", txn.amount > 0 ? "text-green-500" : "text-red-500")}>
                            {txn.amount > 0 ? '+' : ''}{formatCurrency(txn.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wallet Recharge Modal */}
        <AnimatePresence>
          {showRechargeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto"
              onClick={() => setShowRechargeModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-8"
              >
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <PlusCircle size={20} className="text-emerald-500" /> Solicitar Recarga
                  </h3>
                  <button 
                    onClick={() => setShowRechargeModal(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5">
                  {rechargeStatus === 'success' && (
                    <div className="text-center py-6 space-y-3">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                        <CheckCircle2 size={36} />
                      </div>
                      <h4 className="text-lg font-black text-slate-800 uppercase tracking-wide">¡Recarga Aprobada!</h4>
                      <p className="text-sm font-medium text-slate-500 leading-relaxed">
                        Tu comprobante fue validado automáticamente por el sistema de IA. El saldo ha sido acreditado en tu billetera y tu cuenta está activa para jugar.
                      </p>
                      <button
                        onClick={() => setShowRechargeModal(false)}
                        className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition"
                      >
                        Aceptar
                      </button>
                    </div>
                  )}

                  {rechargeStatus === 'pending' && (
                    <div className="text-center py-6 space-y-3">
                      <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                        <Clock size={36} className="animate-spin" style={{ animationDuration: '3s' }} />
                      </div>
                      <h4 className="text-lg font-black text-slate-800 uppercase tracking-wide">Recarga en Verificación</h4>
                      <p className="text-sm font-medium text-slate-500 leading-relaxed">
                        Hemos recibido tu comprobante de recarga. Está siendo verificado manualmente por nuestro equipo y tu billetera será activada en unos instantes.
                      </p>
                      <button
                        onClick={() => setShowRechargeModal(false)}
                        className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition"
                      >
                        Entendido
                      </button>
                    </div>
                  )}

                  {rechargeStatus !== 'success' && rechargeStatus !== 'pending' && (
                    <form onSubmit={handleRechargeSubmit} className="space-y-4">
                      {/* Instructions */}
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                        <p className="text-xs font-bold text-emerald-800 leading-relaxed">
                          Sigue estos pasos sencillos para recargar tu saldo:
                        </p>
                        <ol className="text-[11px] font-medium text-emerald-700 list-decimal pl-4 space-y-1">
                          <li>Envía el dinero desde tu app Nequi.</li>
                          <li>Toma una captura de pantalla clara del comprobante de transferencia exitosa.</li>
                          <li>Adjúntala a continuación indicando el monto enviado.</li>
                        </ol>

                        <div className="pt-2 border-t border-emerald-100/50 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Número Nequi Destinatario</p>
                            <p className="text-sm font-black text-emerald-900">{gameState?.nequi_number || '3235304996'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(gameState?.nequi_number || '3235304996');
                              toast.success('¡Número Nequi copiado!');
                            }}
                            className="bg-white text-emerald-600 hover:bg-emerald-100 p-2 rounded-lg border border-emerald-200 transition-colors flex items-center gap-1 text-[10px] font-bold shrink-0"
                          >
                            <Copy size={12} /> Copiar
                          </button>
                        </div>
                      </div>

                      {/* Amount Input */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Monto de la recarga ($ PESOS)</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                          <input
                            type="number"
                            required
                            min="1000"
                            placeholder="Ej: 10000"
                            value={rechargeAmount}
                            onChange={(e) => setRechargeAmount(e.target.value)}
                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                          />
                        </div>
                      </div>

                      {/* File Selector with ReceiptScanner */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                          Comprobante Nequi (con código QR visible)
                        </label>

                        {rechargeReceipt ? (
                          <ReceiptScanner 
                            file={rechargeReceipt}
                            expectedAmount={Number(rechargeAmount) || undefined}
                            isSubmitting={rechargeSubmitting}
                            onClear={() => setRechargeReceipt(null)}
                          />
                        ) : (
                          <div className="relative border-2 border-dashed border-emerald-400/80 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-2xl p-4 text-center transition cursor-pointer group">
                            <input
                              type="file"
                              required
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setRechargeReceipt(e.target.files[0]);
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="flex flex-col items-center gap-1.5 text-slate-600">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition transform">
                                <PlusCircle size={22} />
                              </div>
                              <span className="font-bold text-xs text-slate-800">Toca para seleccionar comprobante</span>
                              <span className="text-[10px] text-slate-500 font-medium">El escáner verificará el código QR y los datos impresos</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Note TextArea */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Notas adicionales (Opcional)</label>
                        <textarea
                          placeholder="Escribe alguna nota adicional aquí si es necesario..."
                          value={rechargeNote}
                          onChange={(e) => setRechargeNote(e.target.value)}
                          rows={2}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        />
                      </div>

                      {rechargeError && (
                        <div className="p-3.5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 font-bold text-xs flex items-start gap-2.5 shadow-xs">
                          <span className="text-base shrink-0">⚠️</span>
                          <div className="space-y-0.5">
                            <span className="font-black uppercase text-[10px] tracking-wider text-red-800 block">Comprobante no aceptado:</span>
                            <p className="leading-relaxed font-semibold text-slate-700">{rechargeError}</p>
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={rechargeSubmitting}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md border border-emerald-400/50 transition-all flex items-center justify-center gap-2"
                      >
                        {rechargeSubmitting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <PlusCircle size={14} />
                            Enviar Solicitud
                          </>
                        )}
                      </button>

                      {/* Modal de escaneo biométrico del comprobante de recarga */}
                      <ReceiptScanningModal 
                        isOpen={rechargeSubmitting} 
                        expectedAmount={Number(rechargeAmount) || undefined} 
                      />
                    </form>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* WhatsApp Group Reminder Modal */}
        <AnimatePresence>
          {showWhatsAppGroupModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[270] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
              >
                <div className="bg-gradient-to-br from-[#25D366] to-[#128C7E] p-6 text-center relative shrink-0">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-xl -ml-12 -mb-12 pointer-events-none"></div>
                  
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg mb-4">
                      <MessageCircle className="text-[#25D366] w-8 h-8" />
                    </div>
                    <h2 className="text-white text-2xl font-black tracking-tight leading-tight mb-2">
                      ¡Atención Jugador! 🚨<br/>Paso Fundamental
                    </h2>
                    <p className="text-white/90 text-sm font-medium">
                      Para estar activo en el juego es necesario pertenecer a nuestra comunidad.
                    </p>
                  </div>
                </div>
                
                <div className="p-6 overflow-y-auto">
                  <div className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl p-4 mb-6">
                    <p className="text-slate-700 text-sm font-medium text-center leading-relaxed">
                      El grupo de <span className="font-bold text-[#128C7E]">WhatsApp VIP</span> es nuestro canal de comunicación más directo y cercano. A través de este grupo vamos a:
                      <br/><br/>
                      🎯 Ampliar y resolver dudas<br/>
                      📣 Dar informaciones importantes<br/>
                      📅 Avisar sobre nuevos juegos programados
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => {
                        localStorage.setItem(`bingo_whatsapp_group_joined_${player?.id}`, 'true');
                        setShowWhatsAppGroupModal(false);
                        const groupUrl = gameState?.whatsapp_group_link || "https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk";
                        window.open(groupUrl, '_blank');
                      }}
                      className="w-full py-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-2xl font-bold transition flex items-center justify-center gap-2.5 shadow-lg shadow-[#25D366]/30 active:scale-95"
                    >
                      <WhatsAppLogo size={26} />
                      <div className="flex flex-col items-center leading-tight">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Comunidad VIP</span>
                        <span className="text-sm font-black">Únete al WhatsApp</span>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowWhatsAppGroupModal(false);
                        sessionStorage.setItem(`bingo_whatsapp_skipped_${player?.id}`, 'true');
                      }}
                      className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-bold transition flex items-center justify-center gap-2 active:scale-95"
                    >
                      Lo haré más tarde
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Welcome Guest Modal */}
        <AnimatePresence>
          {showDashboardWelcomeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => {
                setShowDashboardWelcomeModal(false);
                if (player && player.id) {
                  localStorage.setItem(`bingo_welcomed_guest_${player.id}`, 'true');
                  sessionStorage.setItem(`bingo_welcome_skipped_${player.id}`, 'true');
                }
              }}
              id="modal-bienvenida-invitado"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl w-[95%] max-w-md shadow-2xl overflow-hidden border-t-8 border-yellow-400 flex flex-col relative max-h-[90vh]"
              >
                {/* Header (Selection Colors Stripe) */}
                <div className="h-2 bg-gradient-to-r from-yellow-400 via-blue-500 to-red-500 w-full" />
                
                <div className="p-6 overflow-y-auto space-y-4">
                  {/* Banner / Title */}
                  <div className="text-center space-y-2">
                    <span className="text-4xl">🏠🎉✨</span>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight leading-snug">
                      Bienvenidos a Bingo Lite<br />
                      <span className="text-purple-600 font-black text-base uppercase tracking-wide">Entretenimiento desde Casa</span>
                    </h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                      Diversión, Premios y Emoción en Familia 👨‍👩‍👧‍👦🍀
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-slate-600 leading-relaxed text-center font-medium">
                      🏠 ¡Qué inmensa alegría nos da recibirte en nuestra gran comunidad de <strong className="text-purple-600 font-bold">Bingo Lite</strong>! 🤗 Aquí te vas a sentir como en casa, compartiendo con tu familia y viviendo la emoción de ganar premios reales al instante. ✨💵
                    </p>

                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-2xl space-y-2">
                      <p className="text-xs text-yellow-950 font-black flex items-center gap-2">
                        🎁 <span>Tu Cartón de Regalo Activado (1 Cartón):</span>
                      </p>
                      <p className="text-[11px] text-yellow-900 leading-relaxed font-bold">
                        Tu amigo(a) te ha regalado una jugada de cortesía 100% gratis. Tu cartón promocional ya fue cargado exitosamente y está listo en tu panel para participar en este juego. 🎫
                      </p>
                    </div>

                    <div className="bg-emerald-50 border-2 border-emerald-300 p-4 rounded-2xl space-y-2">
                      <p className="text-xs text-emerald-950 font-black flex items-center gap-2">
                        🚨 <span className="uppercase">¡Paso Fundamental Obligatorio!</span>
                      </p>
                      <p className="text-[11px] text-emerald-900 leading-relaxed font-bold">
                        Es <strong>estrictamente obligatorio</strong> que te unas a nuestro <strong>Grupo VIP de WhatsApp</strong> para validar tu participación, estar atento al sorteo de balotas en vivo y coordinar la entrega de tus premios. 📲✨
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
                      <p className="text-xs text-slate-800 font-black flex items-center gap-2">
                        ℹ️ <span>Información Importante:</span>
                      </p>
                      <ul className="text-[11px] text-slate-600 leading-relaxed font-semibold list-disc pl-4 space-y-1">
                        <li>Este obsequio promocional se puede utilizar por <strong className="text-slate-900 underline">una única vez (1 juego)</strong>.</li>
                        <li>A partir del próximo juego, adquiere tus propios cartones para seguir participando, acumulando saldo real en tu billetera y ganando grandes premios. 🏅💵</li>
                      </ul>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setShowDashboardWelcomeModal(false);
                        if (player && player.id) {
                          localStorage.setItem(`bingo_welcomed_guest_${player.id}`, 'true');
                          sessionStorage.setItem(`bingo_welcome_skipped_${player.id}`, 'true');
                          const whatsappSeen = localStorage.getItem(`bingo_whatsapp_group_joined_${player.id}`);
                          if (!whatsappSeen) {
                            setTimeout(() => setShowWhatsAppGroupModal(true), 400);
                          }
                        }
                      }}
                      className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:opacity-90 text-white text-sm font-black uppercase tracking-wider rounded-xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      ¡Ingresar a la Sala de Juego! 🏠🎉
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[9px] text-slate-400 font-black tracking-wider uppercase">
                  ✨ Bingo Lite - Entretenimiento Familiar desde Casa 🏠🍀
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gift Cards Secure Reminder Modal */}
        <AnimatePresence>
          {showGiftSecureModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => {
                setShowGiftSecureModal(false);
                if (player?.id) sessionStorage.setItem(`bingo_secure_skipped_${player.id}`, 'true');
              }}
              id="modal-seguridad-regalo"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl w-[90%] max-w-md shadow-2xl overflow-hidden border-2 border-purple-500 flex flex-col relative"
              >
                {/* Header */}
                <div className="p-5 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md">
                      <Gift size={18} className="text-yellow-300 animate-bounce" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none text-purple-750">
                        Regalar Cartones 🔒
                      </h3>
                      <p className="text-[9px] text-purple-750 font-black uppercase tracking-wider mt-1">
                        Requisito de Seguridad
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setShowGiftSecureModal(false);
                      sessionStorage.setItem(`bingo_secure_skipped_${player?.id}`, 'true');
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-150 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex gap-3 shadow-inner">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                      <Info size={16} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] leading-relaxed text-slate-700 font-bold">
                        Para poder habilitar la opción de regalar cartones, debes haber comprado previamente al menos <span className="text-amber-800 font-extrabold underline">dos (2) cartones</span> en el juego activo.
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-normal font-medium">
                    Tan pronto como completes la adquisición de 2 o más cartones, podrás regalar hasta 4 cartones a tus amigos o familiares totalmente gratis para que jueguen contigo.
                  </p>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        if (hasFreeCards) {
                          toast('Ya adquiriste tus cartones gratis para este juego. ¡Mucha suerte!', { icon: 'ℹ️' });
                          return;
                        }
                        setShowGiftSecureModal(false);
                        sessionStorage.setItem(`bingo_secure_skipped_${player?.id}`, 'true');
                        navigate("/register");
                      }}
                      disabled={hasFreeCards}
                      className={clsx(
                        "w-full py-3 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition flex items-center justify-center gap-2",
                        hasFreeCards
                          ? "bg-slate-700/60 text-slate-400 border border-slate-600/40 cursor-not-allowed opacity-60"
                          : "bg-gradient-to-r from-purple-600 to-indigo-650 hover:from-purple-700 hover:to-indigo-700 hover:shadow-lg"
                      )}
                    >
                      <Plus size={16} />
                      {hasFreeCards ? "Cartones Gratis Ya Adquiridos" : "Comprar Cartones Ahora"}
                    </button>
                  </div>
                </div>

                {/* Footer with countdown */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-bold">
                  <span>Código de Seguridad: BINGO-GIFT-SEC</span>
                  <span className="text-purple-600 font-black flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping inline-block" />
                    Cerrando en {giftSecureCountdown}s
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gift Cards Promotion Modal */}
        <AnimatePresence>
          {showGiftModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setShowGiftModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl w-[90%] max-w-lg shadow-2xl overflow-hidden border border-purple-100 flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="p-5 border-b border-purple-50 bg-gradient-to-r from-purple-50 to-indigo-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/20">
                      <Gift size={22} className="text-yellow-300 animate-bounce" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                        Regalar Cartones Gratis 🎁
                      </h3>
                      <p className="text-[10px] text-purple-700 font-bold uppercase tracking-wider mt-1">
                        ¡Invita amigos a ganar con nosotros!
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowGiftModal(false)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-4 flex-1">
                  {/* Visor / Contador de Cartones Regalados */}
                  <div className="bg-white border-2 border-purple-200/90 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
                        Contador de Regalos
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black text-slate-800">
                          {giftSentStatus.filter(Boolean).length}
                        </span>
                        <span className="text-xs font-bold text-slate-400">/ 4 cartones regalados</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2, 3].map(i => (
                        <div
                          key={i}
                          className={clsx(
                            "w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shadow-xs transition-all",
                            giftSentStatus[i]
                              ? "bg-emerald-500 text-white shadow-emerald-500/20"
                              : "bg-purple-100 text-purple-700 border border-purple-200"
                          )}
                          title={`Sobre ${i+1}: ${giftSentStatus[i] ? 'Enviado por WhatsApp' : 'Disponible'}`}
                        >
                          {giftSentStatus[i] ? '✓' : (i + 1)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50/30 p-4 rounded-2xl border border-purple-100/50 space-y-2">
                    <p className="text-xs font-bold text-purple-950 leading-relaxed">
                      🎁 ¿Cómo funciona?
                    </p>
                    <p className="text-[11px] text-purple-900/80 leading-relaxed">
                      Presiona el botón de cada regalo para abrir WhatsApp y seleccionar el contacto de tu amigo o familiar. Inmediatamente les enviarás un mensaje pre-escrito con un enlace para que reclamen su regalo y se unan al grupo VIP. ¡Ganas tú por compartir y ganan ellos!
                    </p>
                  </div>

                  {giftSentStatus.every(s => s === true) && (
                    <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/15 to-emerald-500/10 border-2 border-emerald-300 rounded-2xl p-4 text-center space-y-1">
                      <p className="text-xs font-black text-emerald-950 uppercase tracking-wide flex items-center justify-center gap-1.5 animate-bounce">
                        🎉 ¡TODOS LOS SOBRES ENVIADOS!
                      </p>
                      <p className="text-[11px] text-emerald-900 leading-relaxed font-bold">
                        Has enviado exitosamente tus 4 invitaciones promocionales con regalo para este juego. ¡Gracias por expandir nuestra hermosa comunidad de Bingo Lite en familia! 🏟️🍀
                      </p>
                    </div>
                  )}

                  <div className="space-y-4 pt-2">
                    {[0, 1, 2, 3].map((idx) => {
                      const gift = playerGifts[idx];
                      const isClaimed = gift?.status === 'claimed';
                      const isPending = gift?.status === 'pending';

                      return (
                        <div key={idx} className={clsx(
                          "p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition border-2",
                          isClaimed
                            ? "bg-emerald-50/70 border-emerald-300"
                            : isPending
                              ? "bg-amber-50/70 border-amber-300"
                              : "bg-slate-50 border-slate-200/80 hover:border-purple-200/80 hover:bg-purple-50/20"
                        )}>
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className={clsx(
                                "w-9 h-9 flex items-center justify-center font-black rounded-xl text-sm shadow-sm shrink-0",
                                isClaimed
                                  ? "bg-emerald-500 text-white shadow-emerald-500/20"
                                  : isPending
                                    ? "bg-amber-500 text-white shadow-amber-500/20"
                                    : "bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-purple-500/20"
                              )}>
                                {isClaimed ? '✓' : (idx + 1)}
                              </span>
                              <div className="flex flex-col">
                                <label className="text-sm font-black text-slate-800 flex items-center gap-2 flex-wrap">
                                  Regalo {idx + 1} de 4
                                  {isClaimed ? (
                                    <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full uppercase flex items-center gap-1">
                                      <CheckCircle2 size={12} className="text-emerald-600" /> Redimido / Aceptado
                                    </span>
                                  ) : isPending ? (
                                    <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full uppercase flex items-center gap-1">
                                      <Clock size={12} className="text-amber-600" /> Pendiente por reclamar
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-extrabold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full uppercase">
                                      Disponible
                                    </span>
                                  )}
                                </label>
                                <p className="text-slate-600 text-xs font-medium mt-0.5">
                                  {isClaimed ? (
                                    <span>
                                      Reclamado por tu amigo(a): <strong className="text-slate-800 font-mono">{gift.recipient_phone}</strong>. ¡Ya tiene su cartón cargado para el juego!
                                    </span>
                                  ) : isPending ? (
                                    <span>
                                      Enviado por WhatsApp, pero aún <strong>no ha sido redimido</strong>. Si tu amigo no lo recibió o no lo va a usar, puedes reenviarlo a otro número.
                                    </span>
                                  ) : (
                                    <span>Selecciona para abrir WhatsApp y elegir un amigo o familiar de tu agenda.</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            {isClaimed ? (
                              <div className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl font-bold text-xs uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 size={16} className="text-emerald-600" />
                                <span>Redimido ✓</span>
                              </div>
                            ) : isPending ? (
                              <button 
                                onClick={() => {
                                  setResendingGift({ index: idx, gift });
                                }}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md active:scale-95 cursor-pointer"
                                title="Reenviar a otro número sin anular los demás"
                              >
                                <RefreshCw size={15} />
                                <span>Reenviar Regalo</span>
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleSendGiftWhatsApp(idx)}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-xs uppercase tracking-wider transition bg-[#25D366] hover:bg-[#128C7E] text-white shadow-md hover:shadow-lg active:scale-95 shadow-emerald-500/20 cursor-pointer"
                                title="Abre WhatsApp para seleccionar contacto"
                              >
                                <MessageCircle size={18} />
                                <span>Enviar por WhatsApp</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end items-center">
                  <button 
                    onClick={() => setShowGiftModal(false)}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-wider transition"
                  >
                    Listo / Cerrar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal para Reenviar Regalo / Cambiar Destinatario */}
        <AnimatePresence>
          {resendingGift && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
              onClick={() => setResendingGift(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-md w-full shadow-2xl border-4 border-amber-400 overflow-hidden relative"
              >
                <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-5 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                      <RefreshCw size={20} className="text-white animate-spin-slow" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider">
                        Reenviar Regalo #{resendingGift.index + 1}
                      </h3>
                      <p className="text-[11px] text-amber-100 font-medium">
                        Reasignar a otro amigo o familiar
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setResendingGift(null)}
                    className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="bg-amber-50/90 border-2 border-amber-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wide">
                      <RefreshCw size={15} className="text-amber-600 shrink-0" />
                      <span>Reasignar Invitación No Reclamada</span>
                    </div>
                    <p className="text-xs text-amber-950 font-medium leading-relaxed">
                      Este cartón de regalo aún no ha sido redimido. Al presionar el botón se abrirá automáticamente tu <strong>aplicación de WhatsApp</strong>.
                    </p>
                    <div className="bg-white border-2 border-amber-300/80 rounded-xl p-3 shadow-xs">
                      <p className="text-xs text-amber-900 font-bold leading-relaxed">
                        ⚠️ <strong className="text-amber-950 font-black">Instrucción:</strong> Busca y selecciona un <u>destinatario DIFERENTE</u> en tu lista de contactos de WhatsApp para enviarle este cartón de regalo.
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        * Tus demás cartones de regalo pendientes se mantendrán activos sin anularse.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={handleConfirmResend}
                      disabled={isResending}
                      className="w-full py-4 px-5 bg-[#25D366] hover:bg-[#128C7E] text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <MessageCircle size={20} />
                      <span>{isResending ? 'Preparando...' : 'Abrir WhatsApp y Enviar Regalo'}</span>
                    </button>
                    <button
                      onClick={() => setResendingGift(null)}
                      disabled={isResending}
                      className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Floating Share Button */}
      <div className="fixed left-6 bottom-6 z-[100] flex flex-col items-start gap-3">
        <AnimatePresence>
          {isShareOpen && (
            <motion.div 
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.95 }}
              className="bg-white p-6 rounded-3xl shadow-2xl border-2 border-blue-100 w-80 mb-2"
            >
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <Share2 size={18} className="text-blue-500" /> Compartir Registro
                </h3>
                <button 
                  onClick={() => setIsShareOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tu Enlace</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value="https://bingolite.click/register"
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 focus:outline-none"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText("https://bingolite.click/register");
                        toast.success('¡Enlace copiado!');
                      }}
                      className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      const url = "https://bingolite.click/register";
                      const bingoName = gameState?.title || 'nuestro gran bingo';
                      const startDate = gameState?.start_time ? new Date(gameState.start_time).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : 'próximamente';
                      const groupLink = gameState?.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk';

                      let defaultTemplate = `¡Hola! 👋 ¡Tengo una excelente noticia para ti! Te acabo de regalar un CARTÓN 100% GRATIS 🎁 para que juegues y ganes conmigo en *${bingoName}*.

📅 Anota la cita: ¡El juego será el *${startDate}*!

Hay premios fantásticos con saldo real para tu billetera, sorteos increíbles y muchísima emoción en vivo. 🎉`;

                      if (gameState?.active_lottery && gameState?.active_draw) {
                        defaultTemplate += `\n\n🎰 ¡Y atención especial! Tu cartón de regalo participa con las últimas tres cifras de la lotería nocturna en juego para la noche. 🍀`;
                      }

                      defaultTemplate += `\n\n1️⃣ *Paso 1: Reclama tu regalo* 🎁
Regístrate totalmente GRATIS usando mi invitación oficial aquí:
👉 {url}

2️⃣ *Paso 2: Únete al VIP (¡Fundamental!)* 🚨
Es *estrictamente fundamental* que te unas a nuestro Grupo VIP de WhatsApp para validar tu jugada. Por ahí anunciamos los premios, daremos inducción, resolvemos dudas en tiempo real y publicamos nuevos juegos.

📲 Únete a nuestro Grupo VIP aquí:
👉 ${groupLink}

¡Entra ya mismo y prepárate para cantar BINGO en familia! Nos vemos allí. 👨‍👩‍👧‍👦🍀`;

                      const message = (gameState?.whatsapp_template || defaultTemplate).replace('{url}', url);
                      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                      window.open(whatsappUrl, '_blank');
                    }}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold text-sm rounded-xl transition shadow-md active:scale-95"
                  >
                    <MessageCircle size={18} /> WhatsApp
                  </button>
                  <button 
                    onClick={() => {
                      const url = "https://bingolite.click/register";
                      const bingoName = gameState?.title || 'nuestro gran bingo';
                      const startDate = gameState?.start_time ? new Date(gameState.start_time).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : 'próximamente';
                      const groupLink = gameState?.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk';

                      let defaultTemplate = `¡Hola! 👋 ¡Tengo una excelente noticia para ti! Te acabo de regalar un CARTÓN 100% GRATIS 🎁 para que juegues y ganes conmigo en *${bingoName}*.

📅 Anota la cita: ¡El juego será el *${startDate}*!

Hay premios fantásticos con saldo real para tu billetera, sorteos increíbles y muchísima emoción en vivo. 🎉`;

                      if (gameState?.active_lottery && gameState?.active_draw) {
                        defaultTemplate += `\n\n🎰 ¡Y atención especial! Tu cartón de regalo participa con las últimas tres cifras de la lotería nocturna en juego para la noche. 🍀`;
                      }

                      defaultTemplate += `\n\n1️⃣ *Paso 1: Reclama tu regalo* 🎁
Regístrate totalmente GRATIS usando mi invitación oficial aquí:
👉 {url}

2️⃣ *Paso 2: Únete al VIP (¡Fundamental!)* 🚨
Es *estrictamente fundamental* que te unas a nuestro Grupo VIP de WhatsApp para validar tu jugada. Por ahí anunciamos los premios, daremos inducción, resolvemos dudas en tiempo real y publicamos nuevos juegos.

📲 Únete a nuestro Grupo VIP aquí:
👉 ${groupLink}

¡Entra ya mismo y prepárate para cantar BINGO en familia! Nos vemos allí. 👨‍👩‍👧‍👦🍀`;

                      const message = (gameState?.whatsapp_template || defaultTemplate).replace('{url}', url);
                      if (navigator.share) {
                        navigator.share({
                          title: 'Registro Bingo Online',
                          text: message,
                          url: url
                        }).catch(console.error);
                      } else {
                        navigator.clipboard.writeText(`${message}\n\n${url}`);
                        toast.success('¡Copiado para compartir!');
                      }
                    }}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm rounded-xl transition shadow-md active:scale-95"
                  >
                    <Share2 size={18} /> Otras Redes
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Floating gift cards trigger */}
        <button 
          onClick={handleOpenGiftModal}
          className={clsx(
            "fixed bottom-6 left-6 z-[90] w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 border-white group",
            hasGiftAccess 
              ? "bg-purple-600 text-white hover:bg-purple-700 hover:scale-110 active:scale-90 cursor-pointer" 
              : "bg-purple-900/80 text-purple-200 hover:bg-purple-900 cursor-pointer"
          )}
          title={hasGiftAccess ? "Regalar Cartones Gratis 🎁" : "Requiere al menos 2 cartones en juego para regalar 🔒"}
        >
          <Gift size={26} className={clsx(hasGiftAccess ? "text-yellow-300 animate-pulse" : "text-purple-300/50")} />
          <span className="absolute left-16 bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider py-1 px-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md">
            {hasGiftAccess ? "Regalar Cartones 🎁" : "Requiere 2 cartones 🔒"}
          </span>
        </button>

        {/* Modal para cambiar/establecer contraseña del jugador */}
        <AnimatePresence>
          {showPasswordModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden relative"
              >
                <button 
                  onClick={() => setShowPasswordModal(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition p-1 bg-slate-50 rounded-full hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
                
                <div className="flex items-center gap-3 mb-6 border-b pb-4">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <Key className="text-amber-500" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Seguridad de tu Cuenta</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Establecer o cambiar tu contraseña</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Contraseña Actual (Si ya tienes una)</label>
                    <input 
                      type="password" 
                      placeholder="Déjalo en blanco si nunca has tenido una"
                      value={oldPassword}
                      onChange={e => setOldPassword(e.target.value)}
                      className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 outline-none font-bold text-slate-700 bg-slate-50 focus:bg-white transition text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Nueva Contraseña</label>
                    <input 
                      type="password" 
                      placeholder="Mínimo 4 caracteres"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 outline-none font-bold text-slate-700 transition text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Confirmar Nueva Contraseña</label>
                    <input 
                      type="password" 
                      placeholder="Repite la contraseña"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 outline-none font-bold text-slate-700 transition text-sm"
                    />
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6 border-t pt-4">
                  <button 
                    disabled={isChangingPassword}
                    onClick={async () => {
                      if (!newPassword || newPassword.length < 4) {
                        toast.error('La contraseña debe tener al menos 4 caracteres');
                        return;
                      }
                      if (newPassword !== confirmPassword) {
                        toast.error('Las contraseñas no coinciden');
                        return;
                      }
                      setIsChangingPassword(true);
                      try {
                        const response = await fetch('/api/players/change-password', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            phone: user?.phone,
                            oldPassword,
                            newPassword
                          })
                        });
                        const data = await response.json();
                        if (response.ok) {
                          toast.success('¡Seguridad de tu cuenta actualizada con éxito!');
                          setShowPasswordModal(false);
                          setOldPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                        } else {
                          toast.error(data.error || 'Error al cambiar contraseña');
                        }
                      } catch (err: any) {
                        toast.error('Error al conectar con el servidor');
                      } finally {
                        setIsChangingPassword(false);
                      }
                    }}
                    className={clsx(
                      "flex-1 py-3 text-white font-black text-sm rounded-xl transition flex items-center justify-center gap-2",
                      isChangingPassword ? "bg-slate-400 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-700"
                    )}
                  >
                    {isChangingPassword ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Actualizar Seguridad
                  </button>
                  <button 
                    onClick={() => {
                      setShowPasswordModal(false);
                      setOldPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition"
                  >
                    Cerrar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setIsShareOpen(!isShareOpen)}
          className={clsx(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 border-4 border-white",
            isShareOpen ? "bg-slate-800 text-white rotate-90" : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-110"
          )}
        >
          {isShareOpen ? <X size={28} /> : <Share2 size={28} />}
        </button>
      </div>
    </div>
  );
}
