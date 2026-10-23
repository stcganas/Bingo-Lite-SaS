import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import { 
  Gift, 
  Share2, 
  Copy, 
  ExternalLink, 
  RefreshCcw, 
  Search, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Plus, 
  Loader2, 
  MessageCircle, 
  Calendar, 
  User, 
  Users,
  Sparkles,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export interface GiftInvitation {
  id: number;
  tenant_id: string;
  sender_phone: string;
  sender_name: string;
  is_room_sender: boolean;
  recipient_phone: string;
  status: 'pending' | 'claimed';
  card_count: number;
  created_at: string;
  claimed_at: string | null;
  claimed_by_phone: string | null;
  claimed_by_name: string | null;
  game_id: number | null;
  game_name: string;
  game_prize: string | null;
  game_start_time: string | null;
  game_status: string | null;
  smart_url: string;
}

interface Metrics {
  total: number;
  pending: number;
  claimed: number;
  conversion_rate: number;
}

interface AdminInvitationsProps {
  currentTenant?: string;
  isSuperAdmin?: boolean;
}

export default function AdminInvitations({ currentTenant = 'bingo-lite', isSuperAdmin = false }: AdminInvitationsProps) {
  const [invitations, setInvitations] = useState<GiftInvitation[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, pending: 0, claimed: 0, conversion_rate: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'claimed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Modal de nueva invitación generada
  const [newInviteData, setNewInviteData] = useState<{ id: number; smartUrl: string } | null>(null);

  const fetchInvitations = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (currentTenant) queryParams.set('tenantId', currentTenant);
      if (statusFilter !== 'all') queryParams.set('status', statusFilter);
      if (searchTerm.trim()) queryParams.set('search', searchTerm.trim());

      const res = await apiFetch(`/api/admin/gift-invitations?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Error al consultar invitaciones');
      const data = await res.json();
      if (data.success) {
        setInvitations(data.invitations || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err: any) {
      toast.error('Error al cargar invitaciones: ' + (err.message || 'Error de conexión'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [currentTenant, statusFilter]);

  // Manejar búsqueda con debouncing simple o Enter
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInvitations();
  };

  const handleQuickGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await apiFetch('/api/admin/gift-invitations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenant
        })
      });
      if (!res.ok) throw new Error('Error al generar enlace');
      const data = await res.json();
      if (data.success) {
        setNewInviteData({ id: data.invitation.id, smartUrl: data.smartUrl });
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data.smartUrl);
          toast.success(`🎁 ¡Invitación #${data.invitation.id} creada y enlace copiado al portapapeles!`);
        } else {
          toast.success(`🎁 ¡Invitación #${data.invitation.id} creada con éxito!`);
        }
        fetchInvitations();
      }
    } catch (err: any) {
      toast.error('No se pudo generar la invitación: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteInvitation = async (id: number) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la invitación #${id}? Esta acción revocará el cartón de cortesía no reclamado.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/admin/gift-invitations/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'No se pudo eliminar');
      }
      toast.success(`Invitación #${id} eliminada correctamente.`);
      setInvitations(prev => prev.filter(inv => inv.id !== id));
      setMetrics(prev => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        pending: Math.max(0, prev.pending - 1)
      }));
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = async (smartUrl: string, id: number) => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(smartUrl);
      toast.success(`¡Enlace de invitación #${id} copiado! Listo para enviar por WhatsApp.`);
    } else {
      toast(smartUrl, { icon: '📋' });
    }
  };

  const handleShareWhatsApp = (inv: GiftInvitation) => {
    const text = `🎉 *¡TE REGALO 1 CARTÓN DE BINGO!* 🎁✨\n\nVen y participa en vivo con nosotros en ${inv.game_name}. ¡Gana dinero real!\n\n👉 *Reclama tu cartón de cortesía aquí:*\n${inv.smart_url}`;
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    toast.success('Abriendo WhatsApp con la invitación...');
  };

  // Filtrado reactivo en frontend si ya hay datos
  const filteredInvitations = useMemo(() => {
    return invitations.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const idMatch = String(inv.id).includes(q);
      const senderPhoneMatch = (inv.sender_phone || '').toLowerCase().includes(q);
      const senderNameMatch = (inv.sender_name || '').toLowerCase().includes(q);
      const recipientMatch = (inv.recipient_phone || '').toLowerCase().includes(q);
      const claimedPhoneMatch = (inv.claimed_by_phone || '').toLowerCase().includes(q);
      const claimedNameMatch = (inv.claimed_by_name || '').toLowerCase().includes(q);
      const gameMatch = (inv.game_name || '').toLowerCase().includes(q);
      return idMatch || senderPhoneMatch || senderNameMatch || recipientMatch || claimedPhoneMatch || claimedNameMatch || gameMatch;
    });
  }, [invitations, statusFilter, searchTerm]);

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-xl border border-slate-200 max-w-7xl mx-auto space-y-6">
      {/* Cabecera del Módulo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Gift size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
                Rastreo de Invitaciones y Cartones de Cortesía
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-bold">
                Control de enlaces inteligentes, canjes únicos y nuevos jugadores captados ({currentTenant})
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            disabled={isGenerating}
            onClick={handleQuickGenerate}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>Generar Enlace Rápido</span>
          </button>

          <button
            type="button"
            onClick={fetchInvitations}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition cursor-pointer"
            title="Actualizar datos"
          >
            <RefreshCcw size={18} className={loading ? "animate-spin text-emerald-600" : ""} />
          </button>
        </div>
      </div>

      {/* 4 Tarjetas de Métricas Estadísticas (KPIs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Generadas */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Generadas</span>
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
              <Share2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">{metrics.total}</p>
          <span className="text-[10px] text-slate-400 font-bold">Enlaces inteligentes creados</span>
        </div>

        {/* Pendientes por Reclamar */}
        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80 shadow-sm">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider">Pendientes</span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-800">{metrics.pending}</p>
          <span className="text-[10px] text-amber-600 font-bold">Listas para un nuevo jugador</span>
        </div>

        {/* Canjeadas / Reclamadas */}
        <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200/80 shadow-sm">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider">Canjeadas</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-800">{metrics.claimed}</p>
          <span className="text-[10px] text-emerald-600 font-bold">Nuevos participantes registrados</span>
        </div>

        {/* Tasa de Conversión */}
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-4 rounded-2xl border border-indigo-200/80 shadow-sm">
          <div className="flex items-center justify-between text-indigo-700 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider">Conversión</span>
            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-800">{metrics.conversion_rate}%</p>
          <div className="w-full bg-indigo-200/60 rounded-full h-1.5 mt-2 overflow-hidden">
            <div 
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.max(0, metrics.conversion_rate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
        {/* Selector de Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={clsx(
              "px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              statusFilter === 'all'
                ? "bg-slate-800 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            )}
          >
            Todas ({metrics.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={clsx(
              "px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              statusFilter === 'pending'
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-white text-amber-700 hover:bg-amber-50 border border-amber-200"
            )}
          >
            <Clock size={13} /> Pendientes ({metrics.pending})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('claimed')}
            className={clsx(
              "px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap",
              statusFilter === 'claimed'
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
            )}
          >
            <CheckCircle2 size={13} /> Canjeadas ({metrics.claimed})
          </button>
        </div>

        {/* Input Buscador */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por #ID, celular o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-xs text-slate-700 transition"
          />
        </form>
      </div>

      {/* Tabla de Invitaciones */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 size={32} className="animate-spin text-emerald-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">Cargando invitaciones de la sala...</p>
        </div>
      ) : filteredInvitations.length === 0 ? (
        <div className="py-16 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-8">
          <Gift size={40} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-black text-slate-700 mb-1">No se encontraron invitaciones</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4 font-medium">
            {searchTerm || statusFilter !== 'all'
              ? 'No hay registros que coincidan con los filtros aplicados. Prueba buscando con otro término.'
              : 'Aún no se han generado invitaciones de regalo en esta sala. Haz clic en "Generar Enlace Rápido" para crear la primera.'}
          </p>
          <button
            type="button"
            onClick={handleQuickGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-md"
          >
            <Plus size={15} /> Crear Enlace de Prueba
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-black text-[10px]">
                <th className="py-3.5 px-4">Enlace (#ID)</th>
                <th className="py-3.5 px-4">Remitente</th>
                <th className="py-3.5 px-4">Sorteo en Vivo</th>
                <th className="py-3.5 px-4 text-center">Estado</th>
                <th className="py-3.5 px-4">Auditoría de Canje (Nuevo Jugador)</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvitations.map((inv) => {
                const isClaimed = inv.status === 'claimed';
                return (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                    {/* ID y Enlace Inteligente */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            #{inv.id}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {new Date(inv.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-600 break-all line-clamp-1 max-w-[200px]" title={inv.smart_url}>
                          /invitacion/{inv.id}
                        </span>
                      </div>
                    </td>

                    {/* Remitente */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1 font-black text-slate-800">
                          {inv.is_room_sender ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                              <Sparkles size={11} /> Sala / Admin
                            </span>
                          ) : (
                            <>
                              <User size={13} className="text-slate-400" />
                              <span className="text-xs">{inv.sender_name || 'Jugador'}</span>
                            </>
                          )}
                        </div>
                        {!inv.is_room_sender && inv.sender_phone && (
                          <span className="text-[11px] font-mono text-slate-500 font-semibold pl-4">
                            {inv.sender_phone}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Sorteo Asociado */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex flex-col gap-0.5 max-w-[220px]">
                        <span className="font-bold text-slate-800 truncate" title={inv.game_name}>
                          {inv.game_name}
                        </span>
                        {inv.game_prize && (
                          <span className="text-[11px] font-black text-emerald-600">
                            Premio: {inv.game_prize}
                          </span>
                        )}
                        {inv.game_start_time && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar size={10} />
                            {new Date(inv.game_start_time).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Estado de Canje */}
                    <td className="py-3.5 px-4 align-top text-center">
                      {isClaimed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 size={12} className="text-emerald-600" /> Canjeado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock size={12} className="text-amber-600" /> Pendiente
                        </span>
                      )}
                    </td>

                    {/* Auditoría de Canje */}
                    <td className="py-3.5 px-4 align-top">
                      {isClaimed ? (
                        <div className="flex flex-col gap-0.5 bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                          <div className="flex items-center gap-1 text-emerald-900 font-bold">
                            <User size={12} className="text-emerald-600" />
                            <span>{inv.claimed_by_name || 'Nuevo Participante'}</span>
                          </div>
                          {inv.claimed_by_phone && (
                            <span className="text-[11px] font-mono text-emerald-700 pl-4 font-semibold">
                              📱 {inv.claimed_by_phone}
                            </span>
                          )}
                          {inv.claimed_at && (
                            <span className="text-[10px] text-emerald-600/90 pl-4">
                              ⏰ Canjeado: {new Date(inv.claimed_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          <span className="text-[9px] text-emerald-700/80 font-black pl-4 uppercase tracking-wider">
                            ✓ 1 Cartón de cortesía activado
                          </span>
                        </div>
                      ) : (
                        <div className="text-slate-400 italic text-[11px] flex items-center gap-1.5 py-1">
                          <Clock size={13} className="text-amber-500" />
                          <span>Sin reclamar (1 uso disponible)</span>
                        </div>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-3.5 px-4 align-top text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(inv.smart_url, inv.id)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Copiar Enlace Inteligente"
                        >
                          <Copy size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleShareWhatsApp(inv)}
                          className="p-1.5 text-[#25D366] hover:text-[#128C7E] hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                          title="Compartir por WhatsApp"
                        >
                          <MessageCircle size={15} />
                        </button>

                        <a
                          href={inv.smart_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                          title="Abrir en nueva pestaña"
                        >
                          <ExternalLink size={15} />
                        </a>

                        {!isClaimed && (
                          <button
                            type="button"
                            disabled={deletingId === inv.id}
                            onClick={() => handleDeleteInvitation(inv.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer disabled:opacity-50"
                            title="Revocar invitación pendiente"
                          >
                            {deletingId === inv.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal / Toast emergente cuando se genera una nueva invitación */}
      {newInviteData && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
              #{newInviteData.id}
            </div>
            <div>
              <p className="text-xs font-black text-emerald-900">¡Nueva Invitación Inteligente Generada!</p>
              <p className="text-[11px] font-mono text-emerald-700 break-all select-all font-semibold">{newInviteData.smartUrl}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => handleCopyLink(newInviteData.smartUrl, newInviteData.id)}
              className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <Copy size={13} /> Copiar
            </button>
            <button
              type="button"
              onClick={() => {
                const text = `🎉 *¡TE REGALO 1 CARTÓN DE BINGO!* 🎁✨\n\nVen y participa en vivo con nosotros. ¡Gana dinero real!\n\n👉 *Reclama tu cartón aquí:*\n${newInviteData.smartUrl}`;
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-black rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <MessageCircle size={13} /> WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setNewInviteData(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold px-2 py-1"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
