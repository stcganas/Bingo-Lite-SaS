import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import { toast } from 'react-hot-toast';
import { useAuth } from '../AuthContext';
import { useNavigate, Link } from 'react-router-dom';

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ path, cls = 'w-5 h-5' }: { path: string; cls?: string }) => (
  <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);
const ICONS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  rooms: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  play: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  log: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  ban: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  globe: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
};

interface Room {
  id: string; slug: string; name: string; plan: string;
  subscription_plan?: string; subscription_status?: string; subscription_expires_at?: string;
  is_active?: boolean; player_count?: number; pending_count?: number; game_count?: number;
  admin_email?: string; contact_phone?: string; created_at?: string;
  primary_color?: string; max_players?: number; max_cards_per_game?: number; notes?: string;
}
interface Stats { totalRooms: number; totalPlayers: number; totalGames: number; activeGames: number; }
interface AuditEvent { id: number; admin_email: string; event_type: string; tenant_id: string; details?: any; created_at: string; }

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="sa-stat-card" style={{ '--accent': color } as any}>
      <div className="sa-stat-icon" style={{ background: `${color}22`, color }}>
        <Icon path={icon} cls="w-6 h-6" />
      </div>
      <div>
        <div className="sa-stat-value">{value.toLocaleString()}</div>
        <div className="sa-stat-label">{label}</div>
      </div>
    </div>
  );
}

function RoomCard({ room, onEdit, onStatusToggle, onNotify }: {
  room: Room; onEdit: (r: Room) => void; onStatusToggle: (r: Room) => void; onNotify: (r: Room) => void;
}) {
  const isActive = room.is_active !== false;
  const plan = room.subscription_plan || room.plan || 'basic';
  const planColors: Record<string, string> = { pro: '#8b5cf6', business: '#f59e0b', basic: '#3b82f6', enterprise: '#10b981' };
  const planColor = planColors[plan] || '#6b7280';
  return (
    <div className={`sa-room-card${!isActive ? ' sa-room-suspended' : ''}`}>
      <div className="sa-room-header">
        <div className="sa-room-avatar" style={{ background: room.primary_color || '#2563eb' }}>{room.name.charAt(0).toUpperCase()}</div>
        <div className="sa-room-info">
          <h3>{room.name}</h3>
          <code className="sa-room-slug">/{room.slug}</code>
        </div>
        <div className="sa-room-badges">
          <span className="sa-badge" style={{ background: `${planColor}22`, color: planColor, border: `1px solid ${planColor}44` }}>{plan.toUpperCase()}</span>
          <span className={`sa-badge ${isActive ? 'sa-badge-active' : 'sa-badge-suspended'}`}>{isActive ? 'ACTIVA' : 'SUSPENDIDA'}</span>
        </div>
      </div>
      <div className="sa-room-stats">
        <div className="sa-mini-stat"><Icon path={ICONS.users} cls="w-4 h-4" /><span>{room.player_count || 0} jugadores</span>{(room.pending_count || 0) > 0 && <span className="sa-pending-badge">{room.pending_count} pend.</span>}</div>
        <div className="sa-mini-stat"><Icon path={ICONS.play} cls="w-4 h-4" /><span>{room.game_count || 0} juegos</span></div>
        {room.admin_email && <div className="sa-mini-stat"><span className="sa-email-chip">{room.admin_email}</span></div>}
      </div>
      <div className="sa-room-actions">
        <button className="sa-btn sa-btn-ghost" onClick={() => onEdit(room)}><Icon path={ICONS.edit} cls="w-4 h-4" />Editar</button>
        <button className="sa-btn sa-btn-ghost" onClick={() => onNotify(room)}><Icon path={ICONS.bell} cls="w-4 h-4" />Notificar</button>
        <button className={`sa-btn ${isActive ? 'sa-btn-danger' : 'sa-btn-success'}`} onClick={() => onStatusToggle(room)}>
          <Icon path={isActive ? ICONS.ban : ICONS.check} cls="w-4 h-4" />{isActive ? 'Suspender' : 'Activar'}
        </button>
        <a href={`/sala/${room.slug}/admin`} target="_blank" rel="noopener noreferrer" className="sa-btn sa-btn-primary">
          <Icon path={ICONS.globe} cls="w-4 h-4" />Ver sala
        </a>
      </div>
    </div>
  );
}

function EditRoomModal({ room, onClose, onSave }: { room: Room; onClose: () => void; onSave: (u: any) => Promise<void> }) {
  const [form, setForm] = useState({
    name: room.name || '',
    subscription_plan: room.subscription_plan || room.plan || 'basic',
    subscription_status: room.subscription_status || 'active',
    subscription_expires_at: room.subscription_expires_at ? room.subscription_expires_at.split('T')[0] : '',
    max_players: room.max_players || 500,
    max_cards_per_game: room.max_cards_per_game || 20000,
    notes: room.notes || '',
    primary_color: room.primary_color || '#2563eb',
  });
  const [saving, setSaving] = useState(false);
  const f = (key: string) => (e: any) => setForm(p => ({ ...p, [key]: e.target.value }));
  const fn = (key: string) => (e: any) => setForm(p => ({ ...p, [key]: Number(e.target.value) }));
  return (
    <div className="sa-modal-overlay" onClick={onClose}>
      <div className="sa-modal" onClick={e => e.stopPropagation()}>
        <div className="sa-modal-header"><h2>Editar Sala: {room.name}</h2><button className="sa-modal-close" onClick={onClose}>x</button></div>
        <div className="sa-modal-body">
          <div className="sa-form-grid">
            <div className="sa-field"><label>Nombre</label><input value={form.name} onChange={f('name')} /></div>
            <div className="sa-field"><label>Color</label><input type="color" value={form.primary_color} onChange={f('primary_color')} /></div>
            <div className="sa-field"><label>Plan</label>
              <select value={form.subscription_plan} onChange={f('subscription_plan')}>
                <option value="basic">Basico</option><option value="pro">Pro</option>
                <option value="business">Business</option><option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="sa-field"><label>Estado</label>
              <select value={form.subscription_status} onChange={f('subscription_status')}>
                <option value="active">Activa</option><option value="suspended">Suspendida</option>
                <option value="expired">Expirada</option><option value="trial">Prueba</option>
              </select>
            </div>
            <div className="sa-field"><label>Expira el</label><input type="date" value={form.subscription_expires_at} onChange={f('subscription_expires_at')} /></div>
            <div className="sa-field"><label>Max jugadores</label><input type="number" value={form.max_players} onChange={fn('max_players')} /></div>
            <div className="sa-field"><label>Max cartones/juego</label><input type="number" value={form.max_cards_per_game} onChange={fn('max_cards_per_game')} /></div>
            <div className="sa-field sa-field-full"><label>Notas internas</label><textarea value={form.notes} onChange={f('notes')} rows={3} /></div>
          </div>
        </div>
        <div className="sa-modal-footer">
          <button className="sa-btn sa-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="sa-btn sa-btn-primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(form); onClose(); } finally { setSaving(false); } }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotifyModal({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const isGlobal = !room;
  const send = async () => {
    if (!title.trim() || !message.trim()) { toast.error('Completa el titulo y el mensaje'); return; }
    setSending(true);
    try {
      const endpoint = isGlobal ? '/api/superadmin/notify-all' : `/api/superadmin/rooms/${room!.slug}/notify`;
      const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ title, message }) });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        toast.success(isGlobal ? 'Notificacion global enviada' : `Notificacion enviada a "${room!.name}"`);
        onClose();
      } else {
        toast.error(data.error || 'Error enviando notificacion');
      }
    } catch (e: any) { toast.error(e.message); } finally { setSending(false); }
  };
  return (
    <div className="sa-modal-overlay" onClick={onClose}>
      <div className="sa-modal" onClick={e => e.stopPropagation()}>
        <div className="sa-modal-header">
          <h2>{isGlobal ? 'Notificacion Global - todas las salas' : `Notificar: ${room!.name}`}</h2>
          <button className="sa-modal-close" onClick={onClose}>x</button>
        </div>
        <div className="sa-modal-body">
          {isGlobal && <div className="sa-warn-box">Esta notificacion llegara a TODOS los jugadores de TODAS las salas activas.</div>}
          <div className="sa-field"><label>Titulo</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titulo de la notificacion" /></div>
          <div className="sa-field" style={{ marginTop: 12 }}><label>Mensaje</label><textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Escribe el mensaje aqui..." /></div>
        </div>
        <div className="sa-modal-footer">
          <button className="sa-btn sa-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="sa-btn sa-btn-primary" disabled={sending} onClick={send}>{sending ? 'Enviando...' : 'Enviar notificacion'}</button>
        </div>
      </div>
    </div>
  );
}

function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch('/api/superadmin/events?limit=80')
      .then(res => res.json())
      .then((d: any) => Array.isArray(d) ? setEvents(d) : [])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const eventColors: Record<string, string> = { room_updated: '#3b82f6', room_activated: '#10b981', room_suspended: '#ef4444', notification_sent: '#f59e0b', global_notification_sent: '#8b5cf6', room_created: '#06b6d4' };
  return (
    <div className="sa-section">
      <h2 className="sa-section-title">Registro de Auditoria</h2>
      {loading ? <div className="sa-loading">Cargando eventos...</div> : events.length === 0 ? <div className="sa-empty">No hay eventos registrados aun.</div> : (
        <div className="sa-audit-list">
          {events.map(ev => (
            <div key={ev.id} className="sa-audit-item">
              <div className="sa-audit-dot" style={{ background: eventColors[ev.event_type] || '#6b7280' }} />
              <div className="sa-audit-content">
                <div className="sa-audit-type">{ev.event_type}</div>
                <div className="sa-audit-meta">
                  <span>por {ev.admin_email}</span>
                  {ev.tenant_id && <span>sala: <code>{ev.tenant_id}</code></span>}
                  <span>{new Date(ev.created_at).toLocaleString('es-CO')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type TabId = 'overview' | 'rooms' | 'notifications' | 'audit';

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [search, setSearch] = useState('');
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [notifyRoom, setNotifyRoom] = useState<Room | null>(null);
  const [showNotify, setShowNotify] = useState(false);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'suspended'>('all');
  const [landingMaintenance, setLandingMaintenance] = useState({ active: false, message: '' });
  const [savingLandingMaintenance, setSavingLandingMaintenance] = useState(false);

  const fetchLandingMaintenance = useCallback(async () => {
    try {
      const res = await apiFetch('/api/landing-maintenance-status');
      if (res.ok) {
        const d: any = await res.json();
        setLandingMaintenance({ active: !!d.active, message: d.message || '' });
      }
    } catch { }
  }, []);

  const handleToggleLandingMaintenance = async () => {
    setSavingLandingMaintenance(true);
    try {
      const nextState = !landingMaintenance.active;
      const res = await apiFetch('/api/superadmin/landing-maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: nextState,
          message: landingMaintenance.message
        })
      });
      if (res.ok) {
        setLandingMaintenance(prev => ({ ...prev, active: nextState }));
        toast.success(nextState ? 'Mantenimiento de Página Principal activado' : 'Mantenimiento de Página Principal desactivado');
      } else {
        toast.error('Error al actualizar mantenimiento');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSavingLandingMaintenance(false);
    }
  };

  const handleSaveLandingMessage = async () => {
    setSavingLandingMaintenance(true);
    try {
      const res = await apiFetch('/api/superadmin/landing-maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: landingMaintenance.active,
          message: landingMaintenance.message
        })
      });
      if (res.ok) {
        toast.success('Mensaje de mantenimiento actualizado');
      } else {
        toast.error('Error al guardar mensaje');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSavingLandingMaintenance(false);
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/superadmin/stats');
      if (res.ok) {
        const d: any = await res.json();
        setStats(d);
      }
    } catch { }
  }, []);

  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const res = await apiFetch('/api/superadmin/rooms');
      if (res.ok) {
        const d: any = await res.json();
        setRooms(Array.isArray(d) ? d : []);
      }
    }
    catch (e: any) { toast.error('Error cargando salas: ' + e.message); }
    finally { setLoadingRooms(false); }
  }, []);

  useEffect(() => { 
    fetchStats(); 
    fetchLandingMaintenance();
  }, [fetchStats, fetchLandingMaintenance]);
  useEffect(() => { if (tab === 'rooms' || tab === 'overview') fetchRooms(); }, [tab, fetchRooms]);

  const handleStatusToggle = async (room: Room) => {
    const action = room.is_active !== false ? 'suspend' : 'activate';
    if (!window.confirm(action === 'suspend' ? `¿Estás seguro de SUSPENDER la sala "${room.name}"? Los jugadores no podrán ingresar hasta que la reactives.` : `¿Activar y habilitar la sala "${room.name}"?`)) return;
    
    // Actualización optimista inmediata en la UI
    setRooms(prev => prev.map(r => r.id === room.id || r.slug === room.slug ? { ...r, is_active: action === 'activate', subscription_status: action === 'activate' ? 'active' : 'suspended' } : r));

    try {
      const res = await apiFetch(`/api/superadmin/rooms/${room.slug}/status`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }) 
      });
      if (!res.ok) {
        const errData: any = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al cambiar estado de la sala');
      }
      toast.success(action === 'suspend' ? 'Sala suspendida correctamente' : 'Sala activada correctamente');
      await fetchRooms(); 
      await fetchStats();
    } catch (e: any) { 
      toast.error(e.message || 'Error al cambiar estado');
      await fetchRooms();
    }
  };

  const handleSaveRoom = async (updates: any) => {
    if (!editRoom) return;
    try {
      const res = await apiFetch(`/api/superadmin/rooms/${editRoom.slug}`, { method: 'PATCH', body: JSON.stringify(updates) });
      if (!res.ok) {
        const errData: any = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al actualizar');
      }
      toast.success('Sala actualizada');
      fetchRooms();
    } catch (e: any) {
      toast.error(e.message || 'Error al actualizar');
    }
  };

  const filtered = rooms.filter(r => {
    const ms = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.slug.toLowerCase().includes(search.toLowerCase()) || (r.admin_email || '').toLowerCase().includes(search.toLowerCase());
    const mf = filterActive === 'all' || (filterActive === 'active' && r.is_active !== false) || (filterActive === 'suspended' && r.is_active === false);
    return ms && mf;
  });

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview', label: 'Dashboard', icon: ICONS.home },
    { id: 'rooms', label: 'Salas', icon: ICONS.rooms },
    { id: 'notifications', label: 'Notificaciones', icon: ICONS.bell },
    { id: 'audit', label: 'Auditoria', icon: ICONS.log },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .sa-root{min-height:100vh;background:#090918;color:#e2e8f0;font-family:'Inter',sans-serif;display:flex;flex-direction:column}
        .sa-header{background:linear-gradient(135deg,#1e1b4b,#312e81,#1e3a5f);border-bottom:1px solid #312e8144;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:64px;position:sticky;top:0;z-index:100}
        .sa-logo{display:flex;align-items:center;gap:12px;font-size:1.15rem;font-weight:800;background:linear-gradient(90deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .sa-logo-badge{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:4px 10px;border-radius:8px;font-size:.68rem;font-weight:700;letter-spacing:.1em;-webkit-text-fill-color:#fff}
        .sa-header-right{display:flex;align-items:center;gap:10px}
        .sa-user-chip{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:5px 12px;font-size:.8rem;color:#a5b4fc}
        .sa-logout-btn{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#fca5a5;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:.8rem;display:flex;align-items:center;gap:5px;transition:all .2s}
        .sa-logout-btn:hover{background:rgba(239,68,68,.25)}
        .sa-layout{display:flex;flex:1}
        .sa-sidebar{width:210px;background:#0c0c1e;border-right:1px solid #1e1b4b;padding:16px 0;flex-shrink:0}
        .sa-nav-item{display:flex;align-items:center;gap:10px;padding:10px 18px;cursor:pointer;font-size:.88rem;color:#94a3b8;border-radius:0 8px 8px 0;margin:2px 8px 2px 0;transition:all .2s;border-left:3px solid transparent}
        .sa-nav-item:hover{background:rgba(99,102,241,.1);color:#c7d2fe}
        .sa-nav-item.active{background:rgba(99,102,241,.15);color:#818cf8;border-left-color:#818cf8;font-weight:600}
        .sa-content{flex:1;overflow-y:auto;padding:28px}
        .sa-page-title{font-weight:800;font-size:1.35rem;margin-bottom:4px;color:#e2e8f0}
        .sa-page-sub{color:#64748b;margin-bottom:24px;font-size:.87rem}
        .sa-stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-bottom:30px}
        .sa-stat-card{background:#0f0f22;border:1px solid #1e1b4b;border-radius:14px;padding:18px;display:flex;align-items:center;gap:14px;transition:transform .2s,border-color .2s}
        .sa-stat-card:hover{transform:translateY(-2px);border-color:var(--accent,#818cf8)}
        .sa-stat-icon{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .sa-stat-value{font-size:1.75rem;font-weight:800;line-height:1}
        .sa-stat-label{font-size:.76rem;color:#64748b;margin-top:2px}
        .sa-section{margin-bottom:28px}
        .sa-section-title{font-size:.95rem;font-weight:700;color:#c7d2fe;margin-bottom:14px;display:flex;align-items:center;gap:8px}
        .sa-toolbar{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center}
        .sa-search{flex:1;min-width:200px;background:#0f0f22;border:1px solid #2d2b55;border-radius:10px;padding:8px 13px;color:#e2e8f0;font-size:.88rem;outline:none;transition:border-color .2s}
        .sa-search:focus{border-color:#818cf8}
        .sa-filter-btns{display:flex;gap:6px}
        .sa-filter-btn{padding:7px 13px;border-radius:8px;border:1px solid #2d2b55;background:transparent;color:#94a3b8;cursor:pointer;font-size:.8rem;transition:all .2s}
        .sa-filter-btn.active{background:#4f46e5;border-color:#4f46e5;color:#fff}
        .sa-filter-btn:hover:not(.active){border-color:#818cf8;color:#c7d2fe}
        .sa-rooms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
        .sa-room-card{background:#0f0f22;border:1px solid #1e1b4b;border-radius:14px;padding:18px;transition:transform .2s,border-color .2s}
        .sa-room-card:hover{transform:translateY(-2px);border-color:#4f46e5}
        .sa-room-suspended{opacity:.6;border-color:#7f1d1d}
        .sa-room-header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
        .sa-room-avatar{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:800;color:#fff;flex-shrink:0}
        .sa-room-info{flex:1;min-width:0}
        .sa-room-info h3{font-weight:700;font-size:.95rem;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sa-room-slug{font-size:.72rem;color:#64748b;background:#090918;padding:1px 5px;border-radius:4px;display:block;margin-top:2px}
        .sa-room-badges{display:flex;flex-direction:column;gap:3px;align-items:flex-end}
        .sa-badge{font-size:.63rem;font-weight:700;padding:2px 7px;border-radius:20px}
        .sa-badge-active{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
        .sa-badge-suspended{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)}
        .sa-room-stats{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
        .sa-mini-stat{display:flex;align-items:center;gap:6px;font-size:.8rem;color:#94a3b8}
        .sa-pending-badge{background:rgba(245,158,11,.2);color:#fbbf24;padding:1px 6px;border-radius:10px;font-size:.68rem;font-weight:700}
        .sa-email-chip{font-size:.72rem;color:#64748b;background:#090918;padding:2px 7px;border-radius:5px}
        .sa-room-actions{display:flex;gap:7px;flex-wrap:wrap;border-top:1px solid #1e1b4b;padding-top:12px;margin-top:2px}
        .sa-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;transition:all .2s;text-decoration:none}
        .sa-btn:disabled{opacity:.5;cursor:not-allowed}
        .sa-btn-ghost{background:rgba(255,255,255,.05);color:#94a3b8;border:1px solid #2d2b55}
        .sa-btn-ghost:hover{background:rgba(99,102,241,.12);color:#c7d2fe;border-color:#4f46e5}
        .sa-btn-primary{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}
        .sa-btn-primary:hover{opacity:.85}
        .sa-btn-danger{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)}
        .sa-btn-danger:hover{background:rgba(239,68,68,.25)}
        .sa-btn-success{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
        .sa-btn-success:hover{background:rgba(16,185,129,.25)}
        .sa-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
        .sa-modal{background:#0f0f22;border:1px solid #312e81;border-radius:18px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;box-shadow:0 25px 60px rgba(0,0,0,.6)}
        .sa-modal-header{padding:18px 22px 14px;border-bottom:1px solid #1e1b4b;display:flex;align-items:center;justify-content:space-between}
        .sa-modal-header h2{font-size:1rem;font-weight:700}
        .sa-modal-close{background:none;border:none;color:#64748b;cursor:pointer;font-size:1.1rem;padding:3px 8px;border-radius:6px}
        .sa-modal-close:hover{background:rgba(239,68,68,.15);color:#f87171}
        .sa-modal-body{padding:18px 22px}
        .sa-modal-footer{padding:14px 22px;border-top:1px solid #1e1b4b;display:flex;justify-content:flex-end;gap:10px}
        .sa-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .sa-field{display:flex;flex-direction:column;gap:5px}
        .sa-field-full{grid-column:1/-1}
        .sa-field label{font-size:.76rem;color:#94a3b8;font-weight:600}
        .sa-field input,.sa-field select,.sa-field textarea{background:#090918;border:1px solid #2d2b55;border-radius:8px;padding:8px 11px;color:#e2e8f0;font-size:.86rem;outline:none;transition:border-color .2s;font-family:inherit}
        .sa-field input:focus,.sa-field select:focus,.sa-field textarea:focus{border-color:#818cf8}
        .sa-field textarea{resize:vertical;min-height:68px}
        .sa-warn-box{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:11px 14px;font-size:.83rem;color:#fbbf24;margin-bottom:14px}
        .sa-audit-list{display:flex;flex-direction:column;gap:4px}
        .sa-audit-item{display:flex;gap:10px;padding:10px 13px;background:#0c0c1e;border-radius:8px;border:1px solid #1e1b4b;transition:border-color .2s}
        .sa-audit-item:hover{border-color:#312e81}
        .sa-audit-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:5px}
        .sa-audit-content{flex:1;min-width:0}
        .sa-audit-type{font-size:.83rem;font-weight:600;color:#c7d2fe}
        .sa-audit-meta{font-size:.73rem;color:#64748b;display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
        .sa-audit-meta code{background:#090918;padding:1px 4px;border-radius:3px;color:#818cf8}
        .sa-loading{text-align:center;color:#64748b;padding:40px}
        .sa-empty{text-align:center;color:#475569;padding:40px;font-style:italic}
        .sa-notify-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px}
        .sa-notify-card{background:#0f0f22;border:1px solid #1e1b4b;border-radius:14px;padding:20px}
        .sa-notify-card h3{font-size:.92rem;font-weight:700;margin-bottom:6px}
        .sa-notify-card p{font-size:.8rem;color:#64748b;margin-bottom:14px;line-height:1.6}
        .sa-room-nlist{display:flex;flex-direction:column;gap:7px}
        .sa-room-ni{display:flex;align-items:center;gap:9px;padding:9px 12px;background:#090918;border:1px solid #1e1b4b;border-radius:9px}
        .sa-room-ni-dot{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;flex-shrink:0;font-size:.88rem}
        .sa-room-ni-name{flex:1;font-size:.86rem;font-weight:600}
        .sa-room-ni-cnt{font-size:.73rem;color:#64748b}
        .sa-iso-box{background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.2);border-radius:12px;padding:18px}
        .sa-iso-box h3{font-size:.9rem;font-weight:700;color:#34d399;margin-bottom:8px}
        .sa-iso-box p{font-size:.82rem;color:#64748b;line-height:1.7;margin:0}
        .sa-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        @media(max-width:768px){.sa-sidebar{display:none}.sa-rooms-grid{grid-template-columns:1fr}.sa-form-grid{grid-template-columns:1fr}.sa-notify-grid{grid-template-columns:1fr}.sa-stats-grid{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <div className="sa-root">
        <header className="sa-header">
          <div className="sa-logo">
            <span className="sa-logo-badge">SUPER ADMIN</span>
            Bingo Live Control Center
          </div>
          <div className="sa-header-right">
            <Link to="/admin" className="sa-btn sa-btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 12px' }}>
              <Icon path={ICONS.play} cls="w-4 h-4" /> Sala Oficial
            </Link>
            <span className="sa-user-chip">
              {user?.email || user?.name || 'Super Admin'}
            </span>
            <button className="sa-logout-btn" onClick={async () => { await logout(); navigate('/admin/login'); }}>
              <Icon path={ICONS.logout} cls="w-4 h-4" />Salir
            </button>
          </div>
        </header>

        <div className="sa-layout">
          <aside className="sa-sidebar">
            {tabs.map(t => (
              <div key={t.id} className={`sa-nav-item${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
                <Icon path={t.icon} cls="w-4 h-4" />{t.label}
              </div>
            ))}
          </aside>

          <main className="sa-content">
            {/* ── Overview ── */}
            {tab === 'overview' && (
              <>
                <div className="sa-page-title">Panel de Control Global</div>
                <div className="sa-page-sub">Gestion centralizada de todas las salas de bingo en la plataforma.</div>

                {/* ── Control de Mantenimiento de la Página Principal (SaaS Global) ── */}
                <div className="sa-section" style={{ background: 'linear-gradient(135deg, rgba(30,27,75,0.4), #0f0f22)', border: '1px solid #312e81', borderRadius: '16px', padding: '18px 22px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: landingMaintenance.active ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: landingMaintenance.active ? '#f87171' : '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon path={landingMaintenance.active ? ICONS.ban : ICONS.check} cls="w-6 h-6" />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Mantenimiento Página Principal (SaaS Global)
                          <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, background: landingMaintenance.active ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)', color: landingMaintenance.active ? '#fca5a5' : '#6ee7b7' }}>
                            {landingMaintenance.active ? 'BLOQUEADA' : 'DISPONIBLE'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                          Controla exclusivamente la pantalla de mantenimiento de la página de inicio (bingolite.click /). No afecta las salas individuales.
                        </div>
                      </div>
                    </div>
                    <button
                      className={`sa-btn ${landingMaintenance.active ? 'sa-btn-success' : 'sa-btn-danger'}`}
                      style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                      disabled={savingLandingMaintenance}
                      onClick={handleToggleLandingMaintenance}
                    >
                      <Icon path={landingMaintenance.active ? ICONS.check : ICONS.ban} cls="w-4 h-4" />
                      {savingLandingMaintenance ? 'Procesando...' : landingMaintenance.active ? 'Desactivar y Abrir Landing' : 'Activar Modo Mantenimiento'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                    <input
                      style={{ flex: 1, minWidth: '240px', background: '#090918', border: '1px solid #2d2b55', borderRadius: '8px', padding: '8px 12px', color: '#e2e8f0', fontSize: '0.82rem', outline: 'none' }}
                      placeholder="Mensaje de mantenimiento para la página principal..."
                      value={landingMaintenance.message}
                      onChange={e => setLandingMaintenance({ ...landingMaintenance, message: e.target.value })}
                    />
                    <button
                      className="sa-btn sa-btn-ghost"
                      style={{ padding: '8px 14px' }}
                      disabled={savingLandingMaintenance}
                      onClick={handleSaveLandingMessage}
                    >
                      <Icon path={ICONS.edit} cls="w-4 h-4" /> Guardar Mensaje
                    </button>
                  </div>
                </div>

                <div className="sa-stats-grid">
                  <StatCard label="Salas registradas" value={stats?.totalRooms || 0} icon={ICONS.rooms} color="#818cf8" />
                  <StatCard label="Jugadores totales" value={stats?.totalPlayers || 0} icon={ICONS.users} color="#34d399" />
                  <StatCard label="Juegos totales" value={stats?.totalGames || 0} icon={ICONS.chart} color="#60a5fa" />
                  <StatCard label="Juegos en vivo" value={stats?.activeGames || 0} icon={ICONS.play} color="#f59e0b" />
                </div>
                <div className="sa-section">
                  <div className="sa-row">
                    <h2 className="sa-section-title" style={{ marginBottom: 0 }}>Salas Recientes</h2>
                    <button className="sa-btn sa-btn-ghost" onClick={fetchRooms}><Icon path={ICONS.refresh} cls="w-4 h-4" />Actualizar</button>
                  </div>
                  {loadingRooms ? <div className="sa-loading">Cargando...</div> : (
                    <div className="sa-rooms-grid">
                      {rooms.slice(0, 6).map(r => (
                        <RoomCard key={r.id} room={r} onEdit={setEditRoom} onStatusToggle={handleStatusToggle} onNotify={r => { setNotifyRoom(r); setShowNotify(true); }} />
                      ))}
                    </div>
                  )}
                  {rooms.length > 6 && (
                    <div style={{ textAlign: 'center', marginTop: 14 }}>
                      <button className="sa-btn sa-btn-ghost" onClick={() => setTab('rooms')}>Ver todas las {rooms.length} salas</button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Rooms ── */}
            {tab === 'rooms' && (
              <>
                <div className="sa-page-title">Gestion de Salas</div>
                <div className="sa-page-sub">{rooms.length} salas registradas en la plataforma</div>
                <div className="sa-toolbar">
                  <input className="sa-search" placeholder="Buscar por nombre, slug o email..." value={search} onChange={e => setSearch(e.target.value)} />
                  <div className="sa-filter-btns">
                    {(['all', 'active', 'suspended'] as const).map(f => (
                      <button key={f} className={`sa-filter-btn${filterActive === f ? ' active' : ''}`} onClick={() => setFilterActive(f)}>
                        {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : 'Suspendidas'}
                      </button>
                    ))}
                  </div>
                  <button className="sa-btn sa-btn-ghost" onClick={fetchRooms}><Icon path={ICONS.refresh} cls="w-4 h-4" /></button>
                </div>
                {loadingRooms ? <div className="sa-loading">Cargando salas...</div> : filtered.length === 0 ? <div className="sa-empty">No se encontraron salas.</div> : (
                  <div className="sa-rooms-grid">
                    {filtered.map(r => (
                      <RoomCard key={r.id} room={r} onEdit={setEditRoom} onStatusToggle={handleStatusToggle} onNotify={r => { setNotifyRoom(r); setShowNotify(true); }} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Notifications ── */}
            {tab === 'notifications' && (
              <>
                <div className="sa-page-title">Centro de Notificaciones</div>
                <div className="sa-page-sub">Envia notificaciones aisladas por sala o transmisiones globales.</div>
                <div className="sa-notify-grid">
                  <div className="sa-notify-card" style={{ border: '1px solid rgba(99,102,241,.35)', background: 'linear-gradient(135deg,rgba(30,27,75,.3),#0f0f22)' }}>
                    <h3>Broadcast Global</h3>
                    <p>Envia un mensaje a todos los jugadores de TODAS las salas activas de forma simultanea. Cada sala recibe su canal aislado.</p>
                    <button className="sa-btn sa-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setNotifyRoom(null); setShowNotify(true); }}>
                      <Icon path={ICONS.globe} cls="w-4 h-4" />Enviar a todas las salas
                    </button>
                  </div>
                  <div className="sa-notify-card">
                    <h3>Notificacion por Sala</h3>
                    <p>Selecciona una sala especifica. El mensaje solo llegara a sus jugadores, nunca a otras salas.</p>
                    <div className="sa-room-nlist">
                      {rooms.slice(0, 5).map(r => (
                        <div key={r.id} className="sa-room-ni">
                          <div className="sa-room-ni-dot" style={{ background: r.primary_color || '#4f46e5' }}>{r.name.charAt(0)}</div>
                          <div className="sa-room-ni-name">{r.name}</div>
                          <div className="sa-room-ni-cnt">{r.player_count || 0} jugadores</div>
                          <button className="sa-btn sa-btn-ghost" style={{ padding: '4px 9px' }} onClick={() => { setNotifyRoom(r); setShowNotify(true); }}>
                            <Icon path={ICONS.bell} cls="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {rooms.length > 5 && <button className="sa-btn sa-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => setTab('rooms')}>Ver mas salas...</button>}
                    </div>
                  </div>
                </div>
                <div className="sa-iso-box">
                  <h3>Garantia de Aislamiento</h3>
                  <p>Cada notificacion enviada desde este panel esta estrictamente aislada por sala (tenant_id). Los jugadores de la Sala A nunca recibiran notificaciones de la Sala B. Los canales de tiempo real (Ably) y las notificaciones push (OneSignal) respetan completamente esta segregacion por sala.</p>
                </div>
              </>
            )}

            {/* ── Audit ── */}
            {tab === 'audit' && <AuditLog />}
          </main>
        </div>
      </div>

      {editRoom && <EditRoomModal room={editRoom} onClose={() => setEditRoom(null)} onSave={handleSaveRoom} />}
      {showNotify && <NotifyModal room={notifyRoom} onClose={() => setShowNotify(false)} />}
    </>
  );
}
