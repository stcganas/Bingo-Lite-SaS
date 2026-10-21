import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Calendar, ArrowLeft, Gift, Loader2, Check } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { apiFetch } from '../utils/api';
import { useAuth } from '../AuthContext';
import { useTenant } from '../TenantContext';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import FreeGamesLeaderboard from '../components/FreeGamesLeaderboard';

export default function FreeGames() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant, tenantPrefix, tenantSlug } = useTenant();
  const [currentView, setCurrentView] = useState<'games' | 'leaderboard'>('games');
  const [freeGames, setFreeGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingGameId, setClaimingGameId] = useState<number | null>(null);
  const [claimedGameIds, setClaimedGameIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const gamesRes = await apiFetch('/api/games');
        if (!gamesRes.ok) throw new Error('Error al cargar datos');
        
        const fetchedGames = await gamesRes.json();
        const free = fetchedGames.filter((g: any) => {
          const cardValNum = parseInt(String(g.card_value || '0').replace(/[^0-9]/g, ''), 10) || 0;
          const isFree = Boolean(g.is_free || g.type === 'free' || cardValNum === 0 || g.card_value === '0' || g.card_value === '$0');
          return isFree && ['waiting', 'scheduled', 'playing', 'paused'].includes(g.status);
        });
        
        const statusOrder: Record<string, number> = { 'playing': 1, 'paused': 2, 'scheduled': 3, 'waiting': 4 };
        setFreeGames(free.sort((a: any, b: any) => {
          if (a.status !== b.status) {
            return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
          }
          return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        }));

        // Check if player has already claimed cards for these free games
        if (user && user.role === 'player' && user.phone) {
          try {
            const cleanPhone = user.phone.replace(/[^0-9]/g, '');
            const cardsRes = await apiFetch(`/api/players/${cleanPhone}/cards?_t=${Date.now()}`);
            if (cardsRes.ok) {
              const cardsData = await cardsRes.json();
              const claimed = new Set<number>();
              if (cardsData.cards && Array.isArray(cardsData.cards)) {
                cardsData.cards.forEach((c: any) => { if (c.game_id) claimed.add(Number(c.game_id)); });
              }
              if (cardsData.all_cards && Array.isArray(cardsData.all_cards)) {
                cardsData.all_cards.forEach((c: any) => { if (c.game_id) claimed.add(Number(c.game_id)); });
              }
              setClaimedGameIds(claimed);
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (err: any) {
        toast.error('Error al cargar juegos gratuitos');
      } finally {
        setLoading(false);
      }
    };
    fetchGames();
  }, [user]);

  const handleGetCards = async (gameId: number) => {
    if (claimedGameIds.has(gameId)) {
      toast('Ya adquiriste tus cartones gratis para este juego. ¡Mucha suerte!', { icon: 'ℹ️' });
      navigate(`/player?gameId=${gameId}`);
      return;
    }

    if (user && user.role === 'player' && user.phone) {
      setClaimingGameId(gameId);
      try {
        const rawTenant = tenantSlug || tenant?.slug || 'bingo-lite';
        const cleanTenant = rawTenant === 'default' ? 'demo' : rawTenant.toLowerCase();
        const res = await apiFetch(`/api/players/claim-free-cards?tenantId=${encodeURIComponent(cleanTenant)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: user.phone,
            name: user.name,
            gameId,
            tenantId: cleanTenant
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setClaimedGameIds(prev => new Set([...prev, gameId]));
          toast.success('¡Tus 2 cartones gratis se han cargado exitosamente! 🎉');
          navigate(`${tenantPrefix || ''}/player?gameId=${gameId}`);
          return;
        }
        if (!res.ok && (data.alreadyClaimed || data.error?.includes('Ya has reclamado'))) {
          setClaimedGameIds(prev => new Set([...prev, gameId]));
          toast('Ya adquiriste tus cartones gratis para este juego. ¡Mucha suerte!', { icon: 'ℹ️' });
          navigate(`${tenantPrefix || ''}/player?gameId=${gameId}`);
          return;
        }
      } catch (err) {
        // fallback to register page
      } finally {
        setClaimingGameId(null);
      }
    }
    navigate(`${tenantPrefix || ''}/register?gameId=${gameId}&free=true`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-24">
      <button 
        onClick={() => navigate(tenantPrefix || '/')}
        className="flex items-center gap-2 text-slate-600 font-bold mb-6 hover:text-slate-900 transition"
      >
        <ArrowLeft size={20} /> Volver al Inicio
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">
          {currentView === 'games' 
            ? `Juegos Gratuitos Disponibles (${freeGames.length})` 
            : 'Tabla de Ganadores & Meta de $300.000'}
        </h1>

        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
          <button
            onClick={() => setCurrentView('games')}
            className={clsx(
              "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              currentView === 'games'
                ? "bg-emerald-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Gift size={16} />
            <span>Partidas Gratis</span>
          </button>

          <button
            onClick={() => setCurrentView('leaderboard')}
            className={clsx(
              "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              currentView === 'leaderboard'
                ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-md"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Trophy size={16} className="text-yellow-300" />
            <span>Tabla Ganadores ($300K)</span>
          </button>
        </div>
      </div>

      {currentView === 'leaderboard' ? (
        <FreeGamesLeaderboard isAdmin={false} tenantId={tenantSlug || undefined} />
      ) : loading ? (
        <div className="text-center py-12 font-bold text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="animate-spin text-emerald-600" size={24} /> Cargando juegos...
        </div>
      ) : freeGames.length === 0 ? (
        <div className="text-center py-12 text-slate-500 font-bold">No hay juegos gratuitos disponibles en este momento.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {freeGames.map((game, idx) => (
            <div 
              key={game.id || idx} 
              className="bg-gradient-to-b from-emerald-50 to-teal-50 rounded-[2.25rem] shadow-2xl shadow-emerald-900/10 border-2 border-emerald-200 overflow-hidden transform transition hover:scale-[1.02] flex flex-col"
            >
              <div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-600 shadow-md p-4 text-center relative overflow-hidden">
                <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[9px] font-black text-white uppercase tracking-[0.2em] mb-1.5 border border-white/30 shadow-sm">
                  {game.status === 'playing' ? 'En Vivo' : 'Programado'}
                </div>
                <h4 className="text-lg font-black text-white uppercase tracking-tight truncate px-2 leading-tight drop-shadow-sm">
                  {game.name || 'Bingo Veloz'}
                </h4>
              </div>
              
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div className="space-y-4 mb-4">
                  <div className="flex justify-between items-center bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-emerald-100 shadow-sm">
                    <span className="text-xs font-black text-emerald-800 uppercase tracking-widest">Premio</span>
                    <span className="text-xl font-black text-emerald-600 flex items-center gap-1.5">
                      <Trophy size={18} className="text-yellow-500" /> 
                      {formatCurrency(game.prize)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-blue-100 shadow-sm">
                    <span className="text-xs font-black text-blue-800 uppercase tracking-widest">Costo</span>
                    <span className="text-xl font-black text-blue-600 uppercase drop-shadow-sm font-black">¡GRATIS! (2 CARTONES)</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-100 border-2 border-amber-300 shadow-inner">
                    <p className="text-xs leading-relaxed text-amber-900 font-black text-center">
                      * Todos los premios ganados en los juegos gratis se podrán usar para comprar más cartones en los juegos de pago. Además, podrás retirar el saldo ganado si el monto acumulado es superior a $300.000. ¡El saldo no vence!
                    </p>
                  </div>

                  <div className="bg-white/60 p-3 rounded-2xl border border-teal-100 text-center">
                    <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em] mb-1">FECHA DE SORTEO</p>
                    <div className="flex items-center justify-center gap-2 text-teal-900 font-bold text-xs mb-0.5">
                      <Calendar size={14} /> 
                      {new Date(game.start_time).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="text-[11px] font-black text-teal-700 uppercase tracking-[0.1em]">
                      {new Date(game.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                
                {(() => {
                  const isAlreadyClaimed = claimedGameIds.has(Number(game.id));
                  return (
                    <button 
                      onClick={() => handleGetCards(game.id)}
                      disabled={claimingGameId === game.id || isAlreadyClaimed}
                      className={`w-full py-3.5 font-black text-sm rounded-2xl transition shadow-lg uppercase tracking-widest flex items-center justify-center gap-2 ${
                        isAlreadyClaimed
                          ? 'bg-slate-500 text-white cursor-not-allowed opacity-80 border-b-4 border-slate-600 shadow-slate-500/20'
                          : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-green-600/30 active:scale-95 border-b-4 border-green-700 disabled:opacity-50'
                      }`}
                      title={isAlreadyClaimed ? "Ya has adquirido tus cartones gratis para este juego" : "Obtener cartones gratis"}
                    >
                      {claimingGameId === game.id ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : isAlreadyClaimed ? (
                        <Check size={18} />
                      ) : (
                        <Gift size={18} />
                      )}
                      {claimingGameId === game.id
                        ? 'Cargando cartones...'
                        : isAlreadyClaimed
                        ? '¡Cartones gratis ya adquiridos!'
                        : '¡Obtener mis 2 cartones gratis!'}
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
