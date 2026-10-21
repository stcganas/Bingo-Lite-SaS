import { playLoginSound, playLogoutSound } from './utils/sound';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { apiFetch } from './utils/api';
import { normalizePhone } from './utils/format';
import { initializeOneSignal, loginOneSignal, logoutOneSignal, promptPushPermission, setUserRoleTag } from './lib/onesignal';

interface User {
  uid: string;
  name: string | null;
  role: 'admin' | 'player' | 'seller';
  phone?: string;
  email?: string;
  isSuperAdmin?: boolean;
  city?: string;
  tenant_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  loginAdmin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginTenantAdmin: (email: string, password: string, roomSlug?: string) => Promise<{ success: boolean; error?: string; user?: any }>;
  registerAdmin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginPlayer: (phone: string, password?: string, name?: string, accessCode?: string, roomSlug?: string) => Promise<any>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  loginAdmin: async () => ({ success: false }),
  loginTenantAdmin: async () => ({ success: false }),
  registerAdmin: async () => ({ success: false }),
  loginPlayer: async () => {},
  logout: async () => {},
  resetPassword: async () => ({ success: false }),
  updatePassword: async () => ({ success: false }),
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dedicated useEffect hook to trigger OneSignal.login(userId) immediately upon successful authentication
  useEffect(() => {
    if (!user || !user.uid) return;

    let isSubscribed = true;
    const syncOneSignalUser = async () => {
      try {
        console.log(`[Auth Hook] User authenticated (${user.role}). Executing OneSignal.login for database ID: ${user.uid}...`);
        await initializeOneSignal();
        if (!isSubscribed) return;
        
        await loginOneSignal(user.uid, user.phone, user.role);
        console.log(`[Auth Hook] OneSignal.login successfully synchronized for DB user: ${user.uid}`);

        // Trigger welcome web push notification now that device is registered on OneSignal
        // Throttled per session to prevent double notifications
        if (user.phone) {
          const sessionKey = `bingo_welcome_triggered_${user.phone}`;
          if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, 'true');
            apiFetch('/api/notifications/welcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: user.phone, name: user.name || 'Jugador', userId: user.uid })
            }).catch(e => console.warn('[Auth Hook] Welcome push trigger warning:', e));
          }
        }
      } catch (err) {
        console.warn('[Auth Hook] OneSignal login error:', err);
      }
    };

    syncOneSignalUser();

    return () => {
      isSubscribed = false;
    };
  }, [user?.uid, user?.phone, user?.role]);

  useEffect(() => {
    // OneSignal initialization should happen after login for players/admins
    // Removed initializeOneSignal() from here

    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    let initialLoadComplete = false;

    // Use a timer to ensure setLoading(false) is called if it hangs
    const timer = setTimeout(() => {
      if (isMounted && !initialLoadComplete) {
        console.warn('Auth check timed out after 10s. Defaulting to logged out state.');
        setLoading(false);
      }
    }, 10000);

    // Proactively verify session on mount and wipe invalid tokens
    const verifyInitialSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          if (error.message?.toLowerCase().includes('refresh token') || error.message?.toLowerCase().includes('invalid')) {
            console.warn('[Auth] Stale refresh token detected on startup. Clearing local session...');
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          }
        }
      } catch (err: any) {
        console.warn('[Auth] Initial getSession error caught safely:', err);
        try {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        } catch {}
      }
    };
    verifyInitialSession();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      console.log('Auth event:', event);

      // Clear timeout as soon as we get ANY response from auth
      clearTimeout(timer);
      initialLoadComplete = true;

      if (session?.user) {
        const userEmail = (session.user.email || '').toLowerCase();
        const isSuperAdmin = userEmail === 'comamosexpress@gmail.com' || userEmail === 'stcganas@gmail.com';
        const isSeller = session.user.user_metadata?.role === 'seller';
        
        // REFUERZO DE SEGURIDAD ESTRICTA: Nadie recibe rol 'admin' por defecto.
        // Solo los correos autorizados de Super Admin tienen rol 'admin'.
        const resolvedRole: 'admin' | 'seller' | 'player' = isSuperAdmin ? 'admin' : (isSeller ? 'seller' : 'player');

        const basicUser: User = {
          uid: session.user.id,
          name: session.user.user_metadata?.full_name || (isSuperAdmin ? 'Super Administrador' : (isSeller ? 'Revendedor' : 'Jugador')),
          role: resolvedRole,
          email: session.user.email,
          isSuperAdmin: isSuperAdmin
        };
        
        // Clear any previous dismissed state on active login so banner shows for authenticated users
        try { sessionStorage.removeItem('push_banner_dismissed'); } catch (e) {}

        setUser(basicUser);
        
        // Use a safer async wrapper for OneSignal login
        const doOneSignalLogin = async () => {
          try {
            await initializeOneSignal();
            await loginOneSignal(basicUser.uid, undefined, basicUser.role);
            
            // Only prompt if it's an explicit sign in event
            if (event === 'SIGNED_IN') {
              setTimeout(() => promptPushPermission(), 5000);
            }
          } catch (e) {
            console.warn('OneSignal login from AuthProvider error:', e);
          }
        };
        doOneSignalLogin();
        
        setLoading(false);
      } else {
        // Verificar si hay una sesión activa de administrador de sala guardada
        let savedAdmin = null;
        try {
          savedAdmin = localStorage.getItem('bingo_admin_user');
        } catch (e) {}

        if (savedAdmin) {
          try {
            const admin = JSON.parse(savedAdmin);
            const currentPath = window.location.pathname;
            const salaMatch = currentPath.match(/^\/sala\/([^\/]+)/);
            const urlTenant = salaMatch ? salaMatch[1].toLowerCase() : null;

            // Si está en /sala/:slug/admin, verificar que el admin pertenezca a esa sala (o sea superadmin)
            if (urlTenant && !admin.isSuperAdmin && (admin.tenant_id || '').toLowerCase() !== urlTenant) {
              console.warn(`[Auth] Sesión de admin pertenece a "${admin.tenant_id}", pero estás en "${urlTenant}". Limpiando sesión de admin para esta ruta.`);
              setUser(null);
              setLoading(false);
              return;
            }

            setUser(admin);
            setLoading(false);
            return;
          } catch (e) {}
        }

        let savedPlayer = null;
        try {
          savedPlayer = localStorage.getItem('bingo_player');
        } catch (e) {
          console.error('Error reading localStorage:', e);
        }
        
        if (isMounted) {
          if (savedPlayer) {
            try {
              const player = JSON.parse(savedPlayer);

              // Validar aislamiento por sala: si la URL es /sala/:slug, verificar que el jugador pertenezca a esa sala
              const currentPath = window.location.pathname;
              const salaMatch = currentPath.match(/^\/sala\/([^\/]+)/);
              const urlTenant = salaMatch ? salaMatch[1].toLowerCase() : null;
              const cleanUrlTenant = urlTenant === 'default' ? 'demo' : urlTenant;
              const rawPlayerTenant = (player.tenant_id || 'bingo-lite').toLowerCase();
              const playerTenant = rawPlayerTenant === 'default' ? 'demo' : rawPlayerTenant;

              if (cleanUrlTenant && playerTenant !== cleanUrlTenant) {
                console.log(`[Auth] Sesión guardada pertenece a "${playerTenant}", no a "${cleanUrlTenant}". Requiere login en esta sala.`);
                setUser(null);
                setLoading(false);
                return;
              }

              setUser(prev => prev?.uid === player.uid ? prev : player);
              
              // Validate in background if saved player still exists in database
              const validateSavedPlayer = async () => {
                try {
                  const rawPhone = player.phone || '';
                  const cleanPhone = rawPhone.replace(/\D/g, '');
                  if (cleanPhone) {
                    const tenantQuery = playerTenant ? `&tenantId=${encodeURIComponent(playerTenant)}` : '';
                    const checkRes = await fetch(`/api/players/${cleanPhone}/cards?_t=${Date.now()}${tenantQuery}`);
                    const checkData = await checkRes.json().catch(() => ({}));
                    if (checkRes.status === 404 || checkData.error === 'Player not found' || checkData.status === 'not_found') {
                      console.log('[Auth] Jugador guardado ya no existe en la base de datos de esta sala. Limpiando sesión...');
                      try { localStorage.removeItem('bingo_player'); } catch (e) {}
                      if (isMounted) {
                        setUser(null);
                        logoutOneSignal();
                      }
                    }
                  }
                } catch (e) {
                  // Ignore background network issues
                }
              };
              validateSavedPlayer();

              const doOneSignalLogin = async () => {
                try {
                  await initializeOneSignal();
                  await loginOneSignal(player.uid, player.phone, player.role || 'player');
                } catch (e) {
                  console.warn('OneSignal login (saved player) error:', e);
                }
              };
              doOneSignalLogin();
              
            } catch (e) {
              console.error('Error parsing bingo_player from localstorage:', e);
              try { localStorage.removeItem('bingo_player'); } catch (err) {}
              setUser(null);
            }
          } else {
            setUser(null);
            logoutOneSignal();
          }
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);


  const loginAdmin = async (email: string, password: string) => {
    console.log('loginAdmin start');
    if (!supabase) return { success: false, error: 'Configuración de Supabase no encontrada' };

    const cleanEmail = (email || '').trim().toLowerCase();
    const authorizedSuperAdmins = ['comamosexpress@gmail.com', 'stcganas@gmail.com'];

    // SEGURIDAD CRÍTICA: Impedir que cualquier usuario no superadmin intente login global
    if (!authorizedSuperAdmins.includes(cleanEmail)) {
      return { 
        success: false, 
        error: 'Acceso denegado: Este correo no tiene autorización de Super Administrador. Si eres organizador de una sala, inicia sesión desde el panel de tu sala.' 
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      console.log('loginAdmin result:', error);
      if (error || !data.user) {
        return { success: false, error: error?.message || 'Contraseña de Super Administrador incorrecta.' };
      }

      // Validar doblemente que el usuario autenticado sea superadmin
      if (!authorizedSuperAdmins.includes((data.user.email || '').toLowerCase())) {
        await supabase.auth.signOut().catch(() => {});
        return { success: false, error: 'Acceso denegado: Usuario no autorizado como Super Administrador.' };
      }
      
      const soundSettings = JSON.parse(localStorage.getItem('bingo-sound-settings') || '{}');
      if (soundSettings.login) playLoginSound();
      
      return { success: true };
    } catch (err: any) {
      console.error('loginAdmin error:', err);
      return { success: false, error: err.message || 'Error inesperado al iniciar sesión.' };
    }
  };

  const registerAdmin = async (email: string, password: string) => {
    // El registro público de administradores generales queda estrictamente deshabilitado
    return { 
      success: false, 
      error: 'El registro público de administradores está deshabilitado por seguridad. Para gestionar sorteos, crea tu propia sala de bingo en la página principal.' 
    };
  };

  const loginPlayer = async (rawPhone: string, password?: string, name?: string, accessCode?: string, roomSlug?: string) => {
    const phone = normalizePhone(rawPhone);
    try {
      const res = await apiFetch('/api/players/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone, 
          password,
          access_code: accessCode,
          room_slug: roomSlug,
          tenant_id: roomSlug
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar sesión');
      }
      
      const resolvedTenant = data.tenant_id || data.room_slug || roomSlug || 'default';
      const playerUser: User = { 
        uid: data.id ? `player-${data.id}` : `player-${data.phone}`, 
        name: data.name || name || 'Invitado', 
        role: 'player', 
        phone: data.phone,
        email: data.email,
        city: data.city,
        tenant_id: resolvedTenant
      };
      
      try { sessionStorage.removeItem('push_banner_dismissed'); } catch (e) {}
      setUser(playerUser);
      localStorage.setItem('bingo_player', JSON.stringify(playerUser));
      localStorage.setItem(`bingo_player_${resolvedTenant.toLowerCase()}`, JSON.stringify(playerUser));
      if (data.token) {
        localStorage.setItem('bingo_player_token', data.token);
      }
      
      const doOneSignalLogin = async () => {
        try {
          await loginOneSignal(playerUser.uid, playerUser.phone, playerUser.role);
          setTimeout(() => promptPushPermission(), 5000);
        } catch (e) {
          console.warn('OneSignal loginPlayer error:', e);
        }
      };
      doOneSignalLogin();
      
      const soundSettings = JSON.parse(localStorage.getItem('bingo-sound-settings') || '{}');
      if (soundSettings.login) playLoginSound();

      return data;
    } catch (err: any) {
      throw err;
    }
  };

  const loginTenantAdmin = async (email: string, password: string, roomSlug?: string) => {
    try {
      const res = await apiFetch('/api/admin/tenant-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, room_slug: roomSlug })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Credenciales de administrador incorrectas' };
      }

      const adminUser: User = {
        uid: data.user.uid,
        name: data.user.name,
        role: 'admin',
        email: data.user.email,
        isSuperAdmin: !!data.user.isSuperAdmin,
        tenant_id: data.user.tenant_id
      };

      setUser(adminUser);
      localStorage.setItem('bingo_admin_user', JSON.stringify(adminUser));
      if (data.token) {
        localStorage.setItem('bingo_admin_token', data.token);
      }
      
      const soundSettings = JSON.parse(localStorage.getItem('bingo-sound-settings') || '{}');
      if (soundSettings.login) playLoginSound();

      return { success: true, user: adminUser };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión con el servidor' };
    }
  };

  const logout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut().catch(err => {
          console.warn('Supabase signOut error:', err);
        });
      }
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      localStorage.removeItem('bingo_player');
      localStorage.removeItem('bingo_player_token');
      localStorage.removeItem('bingo_admin_user');
      localStorage.removeItem('bingo_admin_token');
      setUser(null);
      
      try {
        const saved = localStorage.getItem('bingo-sound-settings');
        const soundSettings = saved ? JSON.parse(saved) : {};
        if (soundSettings.logout) playLogoutSound();
      } catch (e) {
        console.warn('Error playing logout sound:', e);
      }
    }
  };

  const resetPassword = async (email: string) => {
    if (!supabase) return { success: false, error: 'Configuración de Supabase no encontrada' };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/admin/reset-password',
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const updatePassword = async (password: string) => {
    if (!supabase) return { success: false, error: 'Configuración de Supabase no encontrada' };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, loginAdmin, loginTenantAdmin, registerAdmin, loginPlayer, logout, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};
