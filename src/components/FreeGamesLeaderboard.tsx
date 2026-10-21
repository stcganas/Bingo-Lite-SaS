import React, { useState, useEffect } from 'react';
import { 
  Trophy, Medal, Award, Gift, Calendar, Clock, Sparkles, 
  ChevronDown, ChevronUp, Search, RefreshCw, Plus, Trash2, 
  AlertCircle, CheckCircle2, User, Phone, DollarSign, ShieldAlert,
  Gamepad2, Check, Edit3, X, RotateCcw, History, AlertTriangle, Crown
} from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '../utils/api';
import toast from 'react-hot-toast';

interface PrizeEntry {
  id: string;
  game_id?: number | null;
  game_name: string;
  pattern_name: string;
  prize_str: string;
  amount: number;
  won_at: string;
  formatted_date: string;
  formatted_time: string;
  notes?: string;
  source: 'automatic' | 'manual';
}

interface RankedWinner {
  rank: number;
  player_id: number;
  player_name: string;
  player_phone: string;
  total_won: number;
  prizes_count: number;
  prizes: PrizeEntry[];
  latest_win_at: string | null;
  goal_amount: number;
  progress_percent: number;
  remaining_amount: number;
  reached_goal: boolean;
  // Paid games counter & 30 games progress
  paid_games_count: number;
  paid_games_required: number;
  paid_games_progress: number;
  paid_games_remaining: number;
  is_eligible: boolean;
}

export interface TournamentSeasonHistory {
  id: string;
  closed_at: string;
  started_at?: string;
  reason?: string;
  closed_by?: string;
  total_distributed: number;
  total_players_winning: number;
  goal_winner?: {
    player_id: number;
    player_name: string;
    player_phone: string;
    total_won: number;
    reached_goal?: boolean;
  } | null;
  second_place_winner?: {
    player_id: number;
    player_name: string;
    player_phone: string;
    total_won: number;
  } | null;
  third_place_winner?: {
    player_id: number;
    player_name: string;
    player_phone: string;
    total_won: number;
  } | null;
}

interface LeaderboardData {
  goal_amount: number;
  goal_amount_formatted: string;
  required_paid_games: number;
  fundamental_rule: string;
  has_goal_winner: boolean;
  goal_winner: RankedWinner | null;
  second_place_winner: RankedWinner | null;
  third_place_winner: RankedWinner | null;
  top_three: RankedWinner[];
  ranking: RankedWinner[];
  total_players_winning: number;
  total_distributed: number;
  free_games_count: number;
  paid_games_count_total: number;
  tournament_reset_at?: string | null;
  tournament_history?: TournamentSeasonHistory[];
}

interface FreeGamesLeaderboardProps {
  isAdmin?: boolean;
  tenantId?: string;
  onClose?: () => void;
}

export default function FreeGamesLeaderboard({ isAdmin = false, tenantId, onClose }: FreeGamesLeaderboardProps) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  // Resolve effective tenant for strict room isolation
  const resolveTenant = (): string => {
    if (tenantId && tenantId.trim() && tenantId !== 'global') {
      return tenantId.trim().toLowerCase();
    }
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/sala\/([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) {
        return match[1].trim().toLowerCase();
      }
      try {
        const adminSession = localStorage.getItem('bingo_admin_user');
        if (adminSession) {
          const parsed = JSON.parse(adminSession);
          if (parsed.tenant_id && parsed.tenant_id !== 'global') {
            return parsed.tenant_id.trim().toLowerCase();
          }
        }
        const playerSession = localStorage.getItem('bingo_player');
        if (playerSession) {
          const parsed = JSON.parse(playerSession);
          if (parsed.tenant_id && parsed.tenant_id !== 'global') {
            return parsed.tenant_id.trim().toLowerCase();
          }
        }
      } catch (e) {}
    }
    return 'default';
  };

  const currentTenant = resolveTenant();

  // Admin Modal for Manual Free Prize
  const [showAddModal, setShowAddModal] = useState(false);
  const [playerIdentifier, setPlayerIdentifier] = useState('');
  const [amount, setAmount] = useState('');
  const [gameName, setGameName] = useState('Juego Gratuito Especial');
  const [patternName, setPatternName] = useState('Premio de Juego Gratis');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Admin Modal for Adjusting Paid Games Count
  const [showAdjustPaidModal, setShowAdjustPaidModal] = useState(false);
  const [adjustPlayerId, setAdjustPlayerId] = useState<number | null>(null);
  const [adjustPlayerName, setAdjustPlayerName] = useState('');
  const [adjustCount, setAdjustCount] = useState<number>(0);
  const [adjustingPaid, setAdjustingPaid] = useState(false);

  // Admin Modal para Reiniciar Torneo a $0
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetReason, setResetReason] = useState('Meta de $300.000 COP completada');
  const [confirmSafetyCheck, setConfirmSafetyCheck] = useState(false);
  const [resettingTournament, setResettingTournament] = useState(false);

  // Modal para ver Historial de Temporadas Anteriores
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/free-games/leaderboard?tenantId=${encodeURIComponent(currentTenant)}&_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Error al cargar la tabla de ganadores');
      }
    } catch (e) {
      console.error('Error fetching free games leaderboard:', e);
      toast.error('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [currentTenant]);

  const toggleExpand = (playerId: number) => {
    setExpandedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleAddPrize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerIdentifier || !amount) {
      toast.error('Favor completar el teléfono/ID y el monto');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/free-games/record-prize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: playerIdentifier,
          amount,
          game_name: gameName,
          pattern_name: patternName,
          notes,
          tenantId: currentTenant
        })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success('¡Premio en juego gratis registrado exitosamente!');
        setShowAddModal(false);
        setPlayerIdentifier('');
        setAmount('');
        setNotes('');
        fetchLeaderboard();
      } else {
        toast.error(resData.error || 'Error al registrar premio');
      }
    } catch (err: any) {
      toast.error('Error de conexión al registrar premio');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePrize = async (prizeId: string) => {
    try {
      const res = await apiFetch(`/api/admin/free-games/prize/${prizeId}?tenantId=${encodeURIComponent(currentTenant)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('Premio eliminado');
        fetchLeaderboard();
      } else {
        toast.error('No se pudo eliminar el premio');
      }
    } catch (e) {
      toast.error('Error al eliminar premio');
    }
  };

  const openAdjustPaidModal = (winner: RankedWinner) => {
    setAdjustPlayerId(winner.player_id);
    setAdjustPlayerName(winner.player_name);
    setAdjustCount(winner.paid_games_count);
    setShowAdjustPaidModal(true);
  };

  const handleSaveAdjustPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustPlayerId) return;
    setAdjustingPaid(true);
    try {
      const res = await apiFetch('/api/admin/free-games/adjust-paid-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: adjustPlayerId,
          count: adjustCount,
          tenantId: currentTenant
        })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success('¡Contador de juegos pagos actualizado!');
        setShowAdjustPaidModal(false);
        fetchLeaderboard();
      } else {
        toast.error(resData.error || 'Error al actualizar contador');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setAdjustingPaid(false);
    }
  };

  const handleResetTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmSafetyCheck) {
      toast.error('Debes marcar la casilla de confirmación para reiniciar el torneo a $0');
      return;
    }

    setResettingTournament(true);
    try {
      const res = await apiFetch('/api/admin/free-games/reset-tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentTenant,
          reason: resetReason.trim() || 'Meta de $300.000 COP completada'
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success('¡Torneo de Juegos Gratuitos reiniciado exitosamente a $0!', {
          duration: 5000,
          icon: '🔄'
        });
        setShowResetModal(false);
        setConfirmSafetyCheck(false);
        setResetReason('Meta de $300.000 COP completada');
        await fetchLeaderboard();
      } else {
        toast.error(resData.error || 'Error al reiniciar el torneo');
      }
    } catch (err: any) {
      console.error('Error resetting tournament:', err);
      toast.error('Error de conexión al reiniciar el torneo');
    } finally {
      setResettingTournament(false);
    }
  };

  const filteredRanking = data?.ranking.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.player_name.toLowerCase().includes(term) ||
      item.player_phone.toLowerCase().includes(term) ||
      String(item.rank).includes(term)
    );
  }) || [];

  const maskPhone = (phone: string) => {
    if (!phone) return '';
    if (isAdmin) return phone;
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length <= 4) return '***' + clean;
    return `***${clean.slice(-4)}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-yellow-600 to-amber-700 text-white p-6 sm:p-8 shadow-2xl border-4 border-yellow-300/40">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/20 backdrop-blur-md border border-white/20 text-yellow-200 text-xs font-black uppercase tracking-widest">
              <Gift size={14} className="text-yellow-300 animate-bounce" />
              <span>Torneo de Juegos Gratuitos</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Trophy className="text-yellow-300 drop-shadow-[0_2px_10px_rgba(253,224,71,0.5)]" size={32} />
              <span>Tabla de Ganadores & Gran Meta</span>
            </h2>
            <p className="text-yellow-100 text-xs sm:text-sm font-medium max-w-2xl leading-relaxed">
              Acumula premios en todas nuestras partidas gratuitas. Todos los premios se suman y se ordenan de mayor a menor para disputar los 3 grandes premios de la meta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchLeaderboard}
              disabled={loading}
              className="p-3 bg-white/20 hover:bg-white/30 text-white rounded-2xl backdrop-blur-md border border-white/30 transition shadow-md active:scale-95 flex items-center gap-2 text-xs font-bold"
              title="Actualizar datos"
            >
              <RefreshCw size={16} className={clsx(loading && "animate-spin")} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>

            {data?.tournament_history && data.tournament_history.length > 0 && (
              <button
                onClick={() => setShowHistoryModal(true)}
                className="px-3.5 py-3 bg-yellow-400/25 hover:bg-yellow-400/40 text-yellow-100 rounded-2xl backdrop-blur-md border border-yellow-300/40 transition shadow-md active:scale-95 flex items-center gap-2 text-xs font-black uppercase tracking-wider"
                title="Ver temporadas finalizadas anteriores"
              >
                <History size={16} className="text-yellow-300" />
                <span>Historial ({data.tournament_history.length})</span>
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-3 bg-white text-yellow-950 hover:bg-yellow-100 rounded-2xl font-black transition shadow-lg flex items-center gap-2 text-xs uppercase tracking-wider active:scale-95"
                >
                  <Plus size={16} />
                  <span>+ Premio</span>
                </button>

                <button
                  onClick={() => {
                    setConfirmSafetyCheck(false);
                    setShowResetModal(true);
                  }}
                  className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black transition shadow-lg flex items-center gap-2 text-xs uppercase tracking-wider active:scale-95 border-2 border-red-400"
                  title="Reiniciar acumulados de los juegos gratis a $0"
                >
                  <RotateCcw size={16} />
                  <span>Reiniciar a $0</span>
                </button>
              </>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-3 bg-black/30 hover:bg-black/40 text-white rounded-2xl font-black transition text-xs uppercase tracking-wider"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>

        {/* Highlight Meta Card ($300.000 COP) */}
        <div className="mt-6 pt-6 border-t border-white/20 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center gap-3">
            <div className="p-3 bg-yellow-400 text-yellow-950 rounded-2xl shadow-inner font-black text-xl">
              🎯
            </div>
            <div>
              <p className="text-[10px] font-black text-yellow-200 uppercase tracking-widest">Meta de Premios</p>
              <p className="text-lg sm:text-xl font-black text-white tracking-tight">$300.000 COP</p>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center gap-3">
            <div className="p-3 bg-blue-400 text-blue-950 rounded-2xl shadow-inner font-black text-xl">
              🎮
            </div>
            <div>
              <p className="text-[10px] font-black text-yellow-200 uppercase tracking-widest">Requisito Obligatorio</p>
              <p className="text-lg sm:text-xl font-black text-blue-200 tracking-tight">30 Juegos Pagos</p>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center gap-3">
            <div className="p-3 bg-emerald-400 text-emerald-950 rounded-2xl shadow-inner font-black text-xl">
              💰
            </div>
            <div>
              <p className="text-[10px] font-black text-yellow-200 uppercase tracking-widest">Total Entregado</p>
              <p className="text-lg sm:text-xl font-black text-emerald-300 tracking-tight">
                ${data ? data.total_distributed.toLocaleString('es-CO') : '0'} COP
              </p>
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center gap-3">
            <div className="p-3 bg-purple-400 text-purple-950 rounded-2xl shadow-inner font-black text-xl">
              👥
            </div>
            <div>
              <p className="text-[10px] font-black text-yellow-200 uppercase tracking-widest">En Clasificación</p>
              <p className="text-lg sm:text-xl font-black text-white tracking-tight">
                {data ? data.total_players_winning : 0} Jugadores
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* BANNER ESPECIAL: GRAN META ALCANZADA */}
      {data?.has_goal_winner && (
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 text-white rounded-3xl p-6 sm:p-7 shadow-2xl border-4 border-emerald-300/80 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white text-emerald-800 flex items-center justify-center font-black text-3xl shadow-xl shrink-0 border-2 border-emerald-200">
              🏆
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-black/20 border border-white/20 text-yellow-300 text-[10px] font-black uppercase tracking-widest">
                <Crown size={12} className="text-yellow-300" />
                <span>¡Gran Meta de $300.000 COP Alcanzada!</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {data.goal_winner?.player_name} ha ganado el Primer Premio
              </h3>
              <p className="text-xs sm:text-sm text-emerald-100 font-medium max-w-2xl leading-relaxed">
                ¡Los 3 grandes premios del podio han sido liberados! Una vez entregados los premios a los ganadores, puedes archivar la temporada y reiniciar todos los acumulados a $0 COP.
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => {
                setConfirmSafetyCheck(false);
                setShowResetModal(true);
              }}
              className="px-6 py-4 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 font-black text-xs uppercase tracking-wider rounded-2xl shadow-2xl transition active:scale-95 shrink-0 flex items-center gap-2.5 border-2 border-white/60 relative z-10"
            >
              <RotateCcw size={18} className="text-yellow-950" />
              <span>Reiniciar a $0 Ahora</span>
            </button>
          )}
        </div>
      )}

      {/* REGLA FUNDAMENTAL BOX */}
      <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-2 border-yellow-400/80 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-yellow-500 text-white rounded-2xl shadow-md shrink-0 mt-0.5">
            <Sparkles size={24} className="text-white" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="bg-yellow-400 text-yellow-950 font-black text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-sm">
                Regla Fundamental
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">
                ¡Gran Premio de la Meta de los $300.000 COP & 3 Premios de Podio!
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 font-semibold leading-relaxed">
              Al completarse el primer premio de los <span className="font-black text-yellow-800 underline decoration-yellow-400 underline-offset-2">$300.000 pesos</span> por parte del primer jugador que alcance la meta, <span className="font-black text-emerald-700">se pagarán dos premios más a los que anteceden en el podio</span> (2° y 3° puesto del ranking). ¡En total son <strong className="font-black text-slate-900">3 premios garantizados</strong> al cumplirse la gran meta!
            </p>

            {/* CONDICIÓN OBLIGATORIA: 30 JUEGOS PAGOS */}
            <div className="p-4 bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-300 rounded-2xl flex items-start gap-3 shadow-inner">
              <ShieldAlert className="text-amber-800 shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                  <span>Condición Obligatoria de Participación:</span>
                </p>
                <p className="text-xs text-amber-900 font-bold leading-relaxed">
                  Para ser elegible a cobrar cualquiera de los 3 premios, los participantes deben ser <strong>jugadores activos de los Bingos Pagos y haber jugado por lo menos 30 juegos pagos</strong>. Cada vez que compras cartones para un bingo de pago, se registra automáticamente en tu contador personal de participación.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* State Banner */}
        <div className="mt-4 pt-4 border-t border-yellow-200/80 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-600">
          <div className="flex items-center gap-2">
            {data?.has_goal_winner ? (
              <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-xl">
                <CheckCircle2 size={16} /> ¡Meta alcanzada por {data.goal_winner?.player_name}! Se liberan los 3 premios para jugadores que cumplan los 30 juegos pagos.
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-800 bg-amber-100 border border-amber-300 px-3 py-1 rounded-xl">
                <Clock size={16} /> Meta en progreso: Ningún jugador ha completado aún los $300.000 COP. ¡Juega gratis y participa en bingos pagos para calificar!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* TOP 3 PODIUM */}
      {data && data.top_three.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1st Place */}
          {data.top_three[0] && (
            <div className="bg-gradient-to-b from-yellow-500/10 via-white to-white rounded-3xl p-6 border-2 border-yellow-400 shadow-xl relative overflow-hidden order-1 md:order-2 md:-translate-y-2">
              <div className="absolute top-0 right-0 p-3 bg-yellow-400 text-yellow-950 font-black rounded-bl-2xl text-xs uppercase tracking-widest shadow-md">
                👑 1° LUGAR
              </div>
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-yellow-400 text-yellow-950 flex items-center justify-center font-black text-2xl shadow-lg border-2 border-yellow-200">
                  🥇
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-800 truncate">{data.top_three[0].player_name}</h4>
                  <p className="text-xs font-bold text-slate-400">{maskPhone(data.top_three[0].player_phone)}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-2xl">
                  <p className="text-[10px] font-black text-yellow-800 uppercase tracking-widest">Total Acumulado</p>
                  <p className="text-2xl font-black text-yellow-600">${data.top_three[0].total_won.toLocaleString('es-CO')}</p>
                </div>

                {/* Progress bar to $300K */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                    <span>Meta $300K</span>
                    <span>{data.top_three[0].progress_percent}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div 
                      className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-1000"
                      style={{ width: `${data.top_three[0].progress_percent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold text-right">
                    {data.top_three[0].remaining_amount > 0 
                      ? `Faltan $${data.top_three[0].remaining_amount.toLocaleString('es-CO')}` 
                      : '¡Meta de $300K completada!'}
                  </p>
                </div>

                {/* Progress bar for 30 Paid Games */}
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-600">
                    <span className="flex items-center gap-1">
                      <Gamepad2 size={13} className="text-blue-600" />
                      Bingos Pagos
                    </span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full font-black text-[9px]",
                      data.top_three[0].is_eligible ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                    )}>
                      {data.top_three[0].paid_games_count} / 30 ({data.top_three[0].paid_games_progress}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div 
                      className={clsx(
                        "h-full rounded-full transition-all duration-700",
                        data.top_three[0].is_eligible ? "bg-emerald-500" : "bg-blue-500"
                      )}
                      style={{ width: `${data.top_three[0].paid_games_progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className={data.top_three[0].is_eligible ? "text-emerald-700 flex items-center gap-1" : "text-amber-700"}>
                      {data.top_three[0].is_eligible ? "✓ Requisito 30 Juegos Cumplido" : `Faltan ${data.top_three[0].paid_games_remaining} juegos pagos`}
                    </span>
                    {isAdmin && (
                      <button 
                        onClick={() => openAdjustPaidModal(data.top_three[0])}
                        className="text-blue-600 hover:underline text-[9px] font-black uppercase"
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2nd Place */}
          {data.top_three[1] ? (
            <div className="bg-gradient-to-b from-slate-100 via-white to-white rounded-3xl p-6 border-2 border-slate-300 shadow-lg relative overflow-hidden order-2 md:order-1">
              <div className="absolute top-0 right-0 p-3 bg-slate-200 text-slate-800 font-black rounded-bl-2xl text-xs uppercase tracking-widest">
                🥈 2° LUGAR
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center font-black text-xl shadow border border-slate-300">
                  🥈
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-800 truncate">{data.top_three[1].player_name}</h4>
                  <p className="text-xs font-bold text-slate-400">{maskPhone(data.top_three[1].player_phone)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Total Acumulado</p>
                  <p className="text-xl font-black text-slate-700">${data.top_three[1].total_won.toLocaleString('es-CO')}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                    <span>Meta $300K</span>
                    <span>{data.top_three[1].progress_percent}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div 
                      className="h-full bg-slate-400 rounded-full transition-all duration-1000"
                      style={{ width: `${data.top_three[1].progress_percent}%` }}
                    />
                  </div>
                </div>

                {/* Progress bar for 30 Paid Games */}
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-600">
                    <span className="flex items-center gap-1">
                      <Gamepad2 size={13} className="text-blue-600" />
                      Bingos Pagos
                    </span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full font-black text-[9px]",
                      data.top_three[1].is_eligible ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                    )}>
                      {data.top_three[1].paid_games_count} / 30 ({data.top_three[1].paid_games_progress}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div 
                      className={clsx(
                        "h-full rounded-full transition-all duration-700",
                        data.top_three[1].is_eligible ? "bg-emerald-500" : "bg-blue-500"
                      )}
                      style={{ width: `${data.top_three[1].paid_games_progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className={data.top_three[1].is_eligible ? "text-emerald-700 flex items-center gap-1" : "text-amber-700"}>
                      {data.top_three[1].is_eligible ? "✓ Requisito 30 Juegos Cumplido" : `Faltan ${data.top_three[1].paid_games_remaining} juegos pagos`}
                    </span>
                    {isAdmin && (
                      <button 
                        onClick={() => openAdjustPaidModal(data.top_three[1])}
                        className="text-blue-600 hover:underline text-[9px] font-black uppercase"
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center text-slate-400 space-y-2 order-2 md:order-1">
              <Medal size={32} className="text-slate-300" />
              <p className="text-xs font-black uppercase tracking-wider">2° Puesto Disponible</p>
              <p className="text-[11px] font-medium">¡Juega gratis y reclama este lugar!</p>
            </div>
          )}

          {/* 3rd Place */}
          {data.top_three[2] ? (
            <div className="bg-gradient-to-b from-amber-900/5 via-white to-white rounded-3xl p-6 border-2 border-amber-300 shadow-lg relative overflow-hidden order-3">
              <div className="absolute top-0 right-0 p-3 bg-amber-100 text-amber-900 font-black rounded-bl-2xl text-xs uppercase tracking-widest">
                🥉 3° LUGAR
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xl shadow border border-amber-200">
                  🥉
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-800 truncate">{data.top_three[2].player_name}</h4>
                  <p className="text-xs font-bold text-slate-400">{maskPhone(data.top_three[2].player_phone)}</p>
                </div>
                <div className="bg-amber-50/50 border border-amber-200 p-3 rounded-2xl">
                  <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Total Acumulado</p>
                  <p className="text-xl font-black text-amber-700">${data.top_three[2].total_won.toLocaleString('es-CO')}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                    <span>Meta $300K</span>
                    <span>{data.top_three[2].progress_percent}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div 
                      className="h-full bg-amber-600/70 rounded-full transition-all duration-1000"
                      style={{ width: `${data.top_three[2].progress_percent}%` }}
                    />
                  </div>
                </div>

                {/* Progress bar for 30 Paid Games */}
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-600">
                    <span className="flex items-center gap-1">
                      <Gamepad2 size={13} className="text-blue-600" />
                      Bingos Pagos
                    </span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full font-black text-[9px]",
                      data.top_three[2].is_eligible ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                    )}>
                      {data.top_three[2].paid_games_count} / 30 ({data.top_three[2].paid_games_progress}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div 
                      className={clsx(
                        "h-full rounded-full transition-all duration-700",
                        data.top_three[2].is_eligible ? "bg-emerald-500" : "bg-blue-500"
                      )}
                      style={{ width: `${data.top_three[2].paid_games_progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className={data.top_three[2].is_eligible ? "text-emerald-700 flex items-center gap-1" : "text-amber-700"}>
                      {data.top_three[2].is_eligible ? "✓ Requisito 30 Juegos Cumplido" : `Faltan ${data.top_three[2].paid_games_remaining} juegos pagos`}
                    </span>
                    {isAdmin && (
                      <button 
                        onClick={() => openAdjustPaidModal(data.top_three[2])}
                        className="text-blue-600 hover:underline text-[9px] font-black uppercase"
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center text-slate-400 space-y-2 order-3">
              <Award size={32} className="text-slate-300" />
              <p className="text-xs font-black uppercase tracking-wider">3° Puesto Disponible</p>
              <p className="text-[11px] font-medium">¡Juega gratis y reclama este lugar!</p>
            </div>
          )}
        </div>
      )}

      {/* SEARCH AND CONTROLS */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar jugador por nombre o teléfono..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white transition"
            />
          </div>

          <div className="text-xs font-bold text-slate-500">
            Mostrando <span className="font-black text-slate-800">{filteredRanking.length}</span> jugadores en competencia
          </div>
        </div>

        {/* RANKED LIST OF WINNERS */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="animate-spin text-yellow-500 mx-auto" size={32} />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cargando clasificación de juegos gratis...</p>
          </div>
        ) : filteredRanking.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Gift className="text-slate-300 mx-auto" size={48} />
            <p className="text-sm font-black text-slate-600 uppercase tracking-tight">No se han registrado ganadores en juegos gratis aún</p>
            <p className="text-xs font-medium text-slate-400 max-w-md mx-auto">
              Los premios y figuras ganadas en los juegos gratuitos aparecerán aquí automáticamente en tiempo real ordenados de mayor a menor.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRanking.map((winner) => {
              const isExpanded = expandedPlayerIds.has(winner.player_id);
              const isTop1 = winner.rank === 1;
              const isTop2 = winner.rank === 2;
              const isTop3 = winner.rank === 3;

              return (
                <div 
                  key={winner.player_id}
                  className={clsx(
                    "rounded-2xl border transition-all duration-200 overflow-hidden",
                    isTop1 ? "border-yellow-400 bg-yellow-50/30 shadow-md" :
                    isTop2 ? "border-slate-300 bg-slate-50/30 shadow-sm" :
                    isTop3 ? "border-amber-300 bg-amber-50/20 shadow-sm" :
                    "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  {/* Card Header Row */}
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {/* Rank badge */}
                      <div className={clsx(
                        "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm shrink-0 border",
                        isTop1 ? "bg-yellow-400 text-yellow-950 border-yellow-300" :
                        isTop2 ? "bg-slate-200 text-slate-800 border-slate-300" :
                        isTop3 ? "bg-amber-100 text-amber-900 border-amber-200" :
                        "bg-slate-100 text-slate-600 border-slate-200"
                      )}>
                        #{winner.rank}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-sm sm:text-base text-slate-800 tracking-tight">
                            {winner.player_name}
                          </h4>
                          {isTop1 && (
                            <span className="bg-yellow-400 text-yellow-950 font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full">
                              Líder Meta
                            </span>
                          )}
                          {(isTop2 || isTop3) && (
                            <span className="bg-emerald-100 text-emerald-800 font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full">
                              Podio
                            </span>
                          )}
                          {winner.is_eligible ? (
                            <span className="bg-emerald-100 text-emerald-800 font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                              <Check size={10} /> Calificado (30/30)
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-800 font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-amber-200">
                              Faltan {winner.paid_games_remaining} juegos pagos
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-400 flex items-center gap-2 mt-0.5">
                          <Phone size={12} /> {maskPhone(winner.player_phone)} • {winner.prizes_count} {winner.prizes_count === 1 ? 'premio gratis' : 'premios gratis'}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bars & Total */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-end gap-4 sm:gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                      {/* Bar 1: Paid Games Counter (30 Games) */}
                      <div className="w-full sm:w-36 space-y-1">
                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-600">
                          <span className="flex items-center gap-1">
                            <Gamepad2 size={12} className="text-blue-600" />
                            Bingos Pagos
                          </span>
                          <span className={winner.is_eligible ? "text-emerald-700" : "text-blue-700"}>
                            {winner.paid_games_count}/30
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div 
                            className={clsx(
                              "h-full rounded-full transition-all duration-700",
                              winner.is_eligible ? "bg-emerald-500" : "bg-blue-500"
                            )}
                            style={{ width: `${winner.paid_games_progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                          <span>{winner.is_eligible ? "✓ Requisito listo" : `Faltan ${winner.paid_games_remaining}`}</span>
                          {isAdmin && (
                            <button 
                              onClick={() => openAdjustPaidModal(winner)}
                              className="text-blue-600 hover:underline uppercase text-[8px] font-black"
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Bar 2: Meta $300k */}
                      <div className="w-full sm:w-36 space-y-1">
                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                          <span>Meta $300K</span>
                          <span>{winner.progress_percent}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div 
                            className={clsx(
                              "h-full rounded-full transition-all duration-700",
                              isTop1 ? "bg-yellow-500" : "bg-emerald-500"
                            )}
                            style={{ width: `${winner.progress_percent}%` }}
                          />
                        </div>
                        <p className="text-[9px] font-bold text-slate-400">
                          {winner.remaining_amount > 0 
                            ? `Faltan $${winner.remaining_amount.toLocaleString('es-CO')}` 
                            : '¡Meta alcanzada!'}
                        </p>
                      </div>

                      {/* Total Won */}
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Ganado</p>
                        <p className="text-base sm:text-lg font-black text-emerald-600 tracking-tight">
                          ${winner.total_won.toLocaleString('es-CO')}
                        </p>
                      </div>

                      <button
                        onClick={() => toggleExpand(winner.player_id)}
                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition shrink-0 self-end sm:self-center"
                        title={isExpanded ? "Ocultar detalle" : "Ver detalle de premios"}
                      >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </div>
                  </div>

                  {/* Accordion: Detailed Prizes List with Date & Time */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-3 animate-in fade-in duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h5 className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar size={14} className="text-yellow-600" />
                          Detalle de Premios Ganados (Fecha, Hora y Partida):
                        </h5>

                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600">
                          <Gamepad2 size={14} className="text-blue-600" />
                          <span>Participación en Bingos Pagos: <strong>{winner.paid_games_count} de 30 juegos</strong></span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              <th className="pb-2">Fecha y Hora</th>
                              <th className="pb-2">Partida / Juego</th>
                              <th className="pb-2">Figura Ganadora</th>
                              <th className="pb-2 text-right">Monto Ganado</th>
                              {isAdmin && <th className="pb-2 text-center">Acciones</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60 font-medium text-slate-700">
                            {winner.prizes.map((pz) => (
                              <tr key={pz.id} className="hover:bg-white/80 transition">
                                <td className="py-2.5 pr-2 whitespace-nowrap">
                                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                    <Clock size={12} className="text-slate-400 shrink-0" />
                                    <span>{pz.formatted_date}</span>
                                  </div>
                                  <div className="text-[10px] font-bold text-slate-400 pl-4">
                                    {pz.formatted_time}
                                  </div>
                                </td>

                                <td className="py-2.5 px-2">
                                  <span className="font-bold text-slate-800">{pz.game_name}</span>
                                  {pz.notes && (
                                    <span className="block text-[10px] text-slate-400 italic">{pz.notes}</span>
                                  )}
                                </td>

                                <td className="py-2.5 px-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-yellow-100 text-yellow-900 text-[10px] font-black uppercase">
                                    {pz.pattern_name}
                                  </span>
                                </td>

                                <td className="py-2.5 pl-2 text-right whitespace-nowrap font-black text-emerald-600 text-sm">
                                  ${pz.amount.toLocaleString('es-CO')}
                                </td>

                                {isAdmin && (
                                  <td className="py-2.5 text-center">
                                    {pz.source === 'manual' ? (
                                      <button 
                                        onClick={() => handleDeletePrize(pz.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                        title="Eliminar registro manual"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    ) : (
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
                                        Auto
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADMIN MODAL: REGISTRAR PREMIO MANUAL */}
      {isAdmin && showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Gift className="text-yellow-500" size={20} />
                <span>Registrar Premio en Juego Gratis</span>
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-black p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPrize} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Teléfono o ID del Jugador
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: 3201234567 o ID de jugador" 
                  value={playerIdentifier}
                  onChange={e => setPlayerIdentifier(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Monto del Premio ($ COP)
                </label>
                <input 
                  type="number" 
                  required
                  min="1"
                  placeholder="Ej: 20000" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Nombre de la Partida Gratuita
                </label>
                <input 
                  type="text" 
                  placeholder="Ej: Bingo Gratuito Especial Fin de Semana" 
                  value={gameName}
                  onChange={e => setGameName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Figura / Patrón Ganado
                </label>
                <input 
                  type="text" 
                  placeholder="Ej: Cuatro Esquinas, Línea, Bingo Lleno" 
                  value={patternName}
                  onChange={e => setPatternName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Notas Adicionales (Opcional)
                </label>
                <textarea 
                  rows={2}
                  placeholder="Ej: Premio promocional por participación especial" 
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-black text-xs uppercase tracking-wider rounded-xl transition shadow-md active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : 'Guardar Premio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN MODAL: AJUSTAR CONTADOR DE JUEGOS PAGOS */}
      {isAdmin && showAdjustPaidModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Gamepad2 className="text-blue-600" size={20} />
                <span>Ajustar Contador de Juegos Pagos</span>
              </h3>
              <button 
                onClick={() => setShowAdjustPaidModal(false)}
                className="text-slate-400 hover:text-slate-600 font-black p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAdjustPaid} className="space-y-4">
              <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-200 text-xs">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Jugador:</p>
                <p className="font-black text-blue-950 text-sm">{adjustPlayerName}</p>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Número de Bingos Pagos Jugados
                </label>
                <input 
                  type="number" 
                  required
                  min="0"
                  max="1000"
                  value={adjustCount}
                  onChange={e => setAdjustCount(parseInt(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white"
                />
                <p className="text-[10px] font-medium text-slate-400 mt-1">
                  Meta requerida para calificar al premio: <strong>30 juegos pagos</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustPaidModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adjustingPaid}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-md active:scale-95 disabled:opacity-50"
                >
                  {adjustingPaid ? 'Guardando...' : 'Actualizar Contador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN MODAL: REINICIAR TORNEO A $0 */}
      {isAdmin && showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border-2 border-red-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                  <RotateCcw size={22} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">
                    Reiniciar Torneo a $0
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Sala: <strong className="text-slate-800 uppercase">{currentTenant}</strong>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-slate-600 font-black p-1.5 rounded-xl hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Resumen del podio que se archivará */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-amber-600" />
                <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider">
                  Podio de la temporada que se archivará
                </span>
              </div>

              {data?.ranking && data.ranking.length > 0 ? (
                <div className="space-y-2 text-xs">
                  {data.ranking.slice(0, 3).map((w, idx) => (
                    <div key={w.player_id} className="flex items-center justify-between bg-white/80 px-3 py-2 rounded-xl border border-amber-200/60">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-amber-700">
                          {idx === 0 ? '🥇 1°' : idx === 1 ? '🥈 2°' : '🥉 3°'}
                        </span>
                        <span className="font-bold text-slate-800 truncate max-w-[170px] sm:max-w-[220px]">
                          {w.player_name}
                        </span>
                      </div>
                      <span className="font-black text-amber-800">
                        ${w.total_won.toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[11px] font-bold text-amber-900 pt-1 px-1">
                    <span>Total entregado en la temporada:</span>
                    <span className="font-black">${data.total_distributed.toLocaleString('es-CO')} COP</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No hay ganadores acumulados en este momento.
                </p>
              )}
            </div>

            {/* Advertencia destructiva */}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 space-y-1">
                <p className="font-black uppercase tracking-wider">¿Qué sucede al reiniciar?</p>
                <p className="font-medium leading-relaxed">
                  1. Todos los acumulados de los juegos gratis de esta sala <strong className="text-red-700">volverán a $0 COP</strong>.
                </p>
                <p className="font-medium leading-relaxed">
                  2. El contador de los <strong className="text-red-700">30 juegos pagos</strong> se reiniciará para que los jugadores comiencen una nueva carrera.
                </p>
                <p className="font-medium leading-relaxed">
                  3. La temporada que termina se guardará intacta en el <strong className="text-slate-900">Historial de Temporadas</strong> con sus ganadores y fechas.
                </p>
              </div>
            </div>

            <form onSubmit={handleResetTournament} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Motivo o Notas del Cierre (Opcional)
                </label>
                <input
                  type="text"
                  value={resetReason}
                  onChange={e => setResetReason(e.target.value)}
                  placeholder="Ej: Meta de $300k alcanzada y entregada"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white"
                />
              </div>

              {/* Casilla de confirmación obligatoria */}
              <label className="flex items-start gap-3 p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 cursor-pointer select-none transition">
                <input 
                  type="checkbox"
                  checked={confirmSafetyCheck}
                  onChange={e => setConfirmSafetyCheck(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-700 leading-tight">
                  Confirmo que deseo colocar los acumulados en <span className="font-black text-red-600">$0 COP</span> y comenzar una nueva temporada del Torneo de Juegos Gratuitos para la sala <strong className="text-slate-900">{currentTenant}</strong>.
                </span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resettingTournament}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!confirmSafetyCheck || resettingTournament}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <RotateCcw size={15} className={clsx(resettingTournament && "animate-spin")} />
                  <span>{resettingTournament ? 'Reiniciando a $0...' : 'Confirmar y Colocar en $0'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTORIAL DE TEMPORADAS ANTERIORES */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-100 text-yellow-700 rounded-2xl">
                  <History size={22} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">
                    Historial de Temporadas del Torneo
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Cuadro de Honor de Ganadores de la Sala <strong className="text-slate-800 uppercase">{currentTenant}</strong>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 font-black p-1.5 rounded-xl hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Listado de temporadas */}
            <div className="overflow-y-auto space-y-4 pr-1 grow">
              {data?.tournament_history && data.tournament_history.length > 0 ? (
                data.tournament_history.map((season, index) => {
                  const closedDate = new Date(season.closed_at);
                  const formattedClosed = !isNaN(closedDate.getTime()) 
                    ? closedDate.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : season.closed_at;

                  return (
                    <div 
                      key={season.id || index}
                      className="bg-gradient-to-br from-slate-50 to-amber-50/40 rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-yellow-400 text-yellow-950 text-[10px] font-black uppercase tracking-wider">
                            Temporada #{data.tournament_history!.length - index}
                          </span>
                          <span className="text-xs font-bold text-slate-600">
                            Finalizada: {formattedClosed}
                          </span>
                        </div>
                        <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          Total: ${season.total_distributed.toLocaleString('es-CO')} COP
                        </span>
                      </div>

                      {season.reason && (
                        <p className="text-xs text-slate-600 font-medium italic">
                          "{season.reason}"
                        </p>
                      )}

                      {/* Podio de la temporada */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        {/* 1° Lugar */}
                        <div className="bg-white p-3 rounded-xl border border-yellow-200 shadow-sm flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-yellow-400 text-yellow-950 flex items-center justify-center font-black text-base shrink-0">
                            🥇
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase text-yellow-800 tracking-wider">1° Lugar</p>
                            <p className="text-xs font-black text-slate-900 truncate">
                              {season.goal_winner?.player_name || 'Sin registro'}
                            </p>
                            <p className="text-[11px] font-bold text-yellow-600">
                              ${season.goal_winner ? season.goal_winner.total_won.toLocaleString('es-CO') : 0}
                            </p>
                          </div>
                        </div>

                        {/* 2° Lugar */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-800 flex items-center justify-center font-black text-base shrink-0">
                            🥈
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase text-slate-600 tracking-wider">2° Lugar</p>
                            <p className="text-xs font-black text-slate-900 truncate">
                              {season.second_place_winner?.player_name || 'Sin registro'}
                            </p>
                            <p className="text-[11px] font-bold text-slate-600">
                              ${season.second_place_winner ? season.second_place_winner.total_won.toLocaleString('es-CO') : 0}
                            </p>
                          </div>
                        </div>

                        {/* 3° Lugar */}
                        <div className="bg-white p-3 rounded-xl border border-amber-100 shadow-sm flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-black text-base shrink-0">
                            🥉
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase text-amber-800 tracking-wider">3° Lugar</p>
                            <p className="text-xs font-black text-slate-900 truncate">
                              {season.third_place_winner?.player_name || 'Sin registro'}
                            </p>
                            <p className="text-[11px] font-bold text-amber-700">
                              ${season.third_place_winner ? season.third_place_winner.total_won.toLocaleString('es-CO') : 0}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 space-y-3">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-2xl font-black">
                    🏆
                  </div>
                  <h4 className="font-black text-slate-700 text-base">Aún no hay temporadas archivadas</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Cuando los jugadores alcancen la meta de los $300.000 COP y el Administrador reinicie el torneo a $0, la temporada se archivará automáticamente aquí en el Cuadro de Honor.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-md"
              >
                Cerrar Historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
