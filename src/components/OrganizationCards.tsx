import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building, Calendar, Ticket, ArrowRight, Trophy, Clock, Star } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { motion } from 'motion/react';
import clsx from 'clsx';

interface Game {
  id: number;
  name: string;
  start_time: string;
  prize: number;
  card_value: number;
  status: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  games: Game[];
}

export default function OrganizationCards() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const res = await fetch('/api/public/organizations');
        if (!res.ok) throw new Error('Error fetching organizations');
        const data = await res.json();
        setOrganizations(data);
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizations();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-64 bg-slate-200 rounded-[2rem]"></div>
        ))}
      </div>
    );
  }

  if (organizations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
          <Building className="text-blue-600" size={28} />
          Organizaciones Activas
        </h2>
        <div className="h-px flex-1 bg-slate-200 mx-6 hidden sm:block"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {organizations.map((org) => (
          <motion.div
            key={org.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="group bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
          >
            {/* Header Section */}
            <div className="p-8 pb-4 flex items-start justify-between">
              <div className="flex items-center gap-5">
                {/* Logo Placeholder */}
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white shadow-lg transform -rotate-3 group-hover:rotate-0 transition-transform duration-300">
                  <span className="text-2xl font-black uppercase">{org.name.substring(0, 2)}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
                    {org.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-widest">
                      Verificada
                    </span>
                    <span className="text-slate-400 text-xs font-bold">/{org.slug}</span>
                  </div>
                </div>
              </div>
              <Link
                to={`/${org.slug}`}
                className="p-3 bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white rounded-2xl transition-all duration-300 shadow-sm"
                title="Visitar Organización"
              >
                <ArrowRight size={24} />
              </Link>
            </div>

            {/* Games Section */}
            <div className="px-8 pb-8 flex-1 flex flex-col">
              <div className="mt-4 space-y-4 flex-1">
                {org.games.length > 0 ? (
                  <>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Próximos Bingos</p>
                    {org.games.slice(0, 2).map((game) => (
                      <div key={game.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between group/game hover:bg-blue-50 hover:border-blue-100 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100 group-hover/game:scale-110 transition-transform">
                            <Calendar size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 leading-none mb-1">{game.name}</p>
                            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase">
                              <span className="flex items-center gap-1"><Clock size={12} /> {new Date(game.start_time).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                              <span className="flex items-center gap-1 text-blue-600"><Ticket size={12} /> {formatCurrency(game.card_value)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Premio</p>
                          <p className="text-sm font-black text-emerald-600">{formatCurrency(game.prize)}</p>
                        </div>
                      </div>
                    ))}
                    {org.games.length > 2 && (
                      <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">
                        + {org.games.length - 2} juegos más programados
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center py-6 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                    <Clock size={32} className="text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin juegos programados</p>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <Link
                to={`/${org.slug}`}
                className={clsx(
                  "mt-6 w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-3 shadow-lg",
                  org.games.length > 0 
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200" 
                    : "bg-slate-800 text-white hover:bg-slate-900 shadow-slate-200"
                )}
              >
                Ingresar a la Organización <ArrowRight size={18} />
              </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
