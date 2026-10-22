import OneSignal from 'react-onesignal';
import { apiFetch } from '../utils/api';

let initializationPromise: Promise<void> | null = null;
let isInitialized = false;

export const initializeOneSignal = async () => {
  if (isInitialized) return;
  if (initializationPromise) return initializationPromise;

  // Disable inside iframe previews where push notifications are blocked
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) {
    return;
  }

  initializationPromise = (async () => {
    let appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    
    if (!appId || appId === 'undefined' || appId === 'tu_onesignal_app_id') {
      try {
        const res = await apiFetch('/api/config/onesignal');
        if (res.ok) {
          const data = await res.json();
          if (data?.appId) {
            appId = data.appId;
          }
        }
      } catch (e) {
        console.warn('[OneSignal] Could not fetch dynamic appId from server:', e);
      }
    }

    if (!appId || appId === 'undefined' || appId === 'tu_onesignal_app_id') {
      console.warn('[OneSignal] No valid OneSignal App ID found. Web push initialization skipped.');
      return;
    }

    try {
      await (OneSignal.init as any)({
        appId,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerParam: { scope: '/' },
        serviceWorkerPath: 'OneSignalSDKWorker.js',
        notifyButton: {
          enable: false,
        },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false, // DISABLED: Only authenticated logged-in users get prompted
                text: {
                  actionMessage: "¿Deseas recibir notificaciones de nuevos juegos, pagos aprobados y ganadores de Bingo Lite?",
                  acceptButton: "Permitir",
                  cancelButton: "Ahora no"
                }
              }
            ]
          }
        }
      });
      
      // Wait for the SDK to be fully ready
      await new Promise(resolve => setTimeout(resolve, 500));
      isInitialized = true;
    } catch (error: any) {
      initializationPromise = null;
      const errorMsg = String(error?.message || error || '');
      
      if (errorMsg.includes('already initialized')) {
        isInitialized = true;
        return;
      }

      if (errorMsg.includes('Can only be used on')) {
        isInitialized = false;
        return;
      }
      
      isInitialized = false;
    }
  })();

  return initializationPromise;
};

export const setUserRoleTag = async (role: string) => {
  if (!role) return;

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) return;

  try {
    await initializeOneSignal();
    if (!isInitialized) return;

    const rawRole = role.toLowerCase().trim();
    let normalizedRole = rawRole;
    if (rawRole === 'player' || rawRole === 'jugador') {
      normalizedRole = 'jugador';
    } else if (rawRole === 'seller' || rawRole === 'vendedor') {
      normalizedRole = 'vendedor';
    } else if (rawRole === 'admin' || rawRole === 'administrador') {
      normalizedRole = 'admin';
    }

    const tagsToAdd: Record<string, string> = {
      role: normalizedRole,
      user_type: normalizedRole,
      [normalizedRole]: 'true'
    };

    if (OneSignal.User) {
      await OneSignal.User.addTags(tagsToAdd);
    }
  } catch (error) {
    console.warn('[OneSignal] Error en setUserRoleTag:', error);
  }
};

export const loginOneSignal = async (externalId: string, phone?: string, role?: string, tenantId?: string) => {
  if (!externalId) return;

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) return;

  try {
    await initializeOneSignal();
    
    if (!isInitialized) {
      return;
    }
    
    const os = (window as any).OneSignal;
    if (os && typeof os.push === 'function') {
      os.push(async () => {
        try {
          let waitAttempts = 0;
          while (!(window as any).OneSignal?.User && waitAttempts < 15) {
            await new Promise(resolve => setTimeout(resolve, 200));
            waitAttempts++;
          }

          if (!(window as any).OneSignal?.User) {
            return;
          }

          const currentId = OneSignal.User?.externalId;
          if (currentId !== externalId) {
            await OneSignal.login(externalId);
            await new Promise(resolve => setTimeout(resolve, 250));
          }

          const tagsToAdd: Record<string, string> = {};

          if (tenantId) {
            const rawTenant = tenantId.toLowerCase().trim();
            const cleanTenant = rawTenant === 'default' ? 'demo' : rawTenant;
            tagsToAdd['tenant_id'] = cleanTenant;
            tagsToAdd['room'] = cleanTenant;
          }

          if (phone) {
            const normalizedPhone = phone.replace(/[^0-9]/g, '');
            if (normalizedPhone) {
              tagsToAdd['phone'] = normalizedPhone;
              try {
                if (typeof (OneSignal.User as any)?.addAlias === 'function') {
                  await (OneSignal.User as any).addAlias('phone', normalizedPhone);
                }
              } catch (e) {}
            }
          }

          if (role) {
            const rawRole = role.toLowerCase().trim();
            let normalizedRole = rawRole;
            if (rawRole === 'player' || rawRole === 'jugador') {
              normalizedRole = 'jugador';
            } else if (rawRole === 'seller' || rawRole === 'vendedor') {
              normalizedRole = 'vendedor';
            } else if (rawRole === 'admin' || rawRole === 'administrador') {
              normalizedRole = 'admin';
            }

            tagsToAdd['role'] = normalizedRole;
            tagsToAdd['user_type'] = normalizedRole;
            tagsToAdd[normalizedRole] = 'true';
          }

          tagsToAdd['authenticated'] = 'true';
          tagsToAdd['user_id'] = externalId;

          if (Object.keys(tagsToAdd).length > 0 && OneSignal.User) {
            await OneSignal.User.addTags(tagsToAdd);
          }

          // Trigger push permission prompt ONLY for authenticated users after tags are set
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            setTimeout(async () => {
              try {
                if (OneSignal.Slidedown && typeof OneSignal.Slidedown.promptPush === 'function') {
                  await OneSignal.Slidedown.promptPush();
                }
              } catch (e) {
                console.warn('[OneSignal] Slidedown prompt error:', e);
              }
            }, 2000);
          }
        } catch (e) {
          // Handle silently
        }
      });
    } else {
      await OneSignal.login(externalId);
      if (role) {
        await setUserRoleTag(role);
      }
    }
  } catch (error) {
    // Handle silently
  }
};

export const logoutOneSignal = async () => {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe || !isInitialized) return;
  try {
    if ((window as any).OneSignal?.User) {
      await OneSignal.logout();
    }
  } catch (error) {
    // Handle silently
  }
};

export const promptPushPermission = async (): Promise<boolean> => {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) return false;

  if (!isInitialized) {
    await initializeOneSignal();
  }
  if (!isInitialized) return false;
  
  try {
    const isPushSupported = OneSignal.Notifications.isPushSupported();
    if (!isPushSupported) {
      return false;
    }

    try {
      await OneSignal.Notifications.requestPermission();
    } catch (e) {
      await OneSignal.Slidedown.promptPush();
    }

    // Re-check permission status
    const status = await getSubscriptionStatus();
    return status?.permission === 'granted' || !!status?.isSubscribed;
  } catch (error) {
    return false;
  }
};

export const getSubscriptionStatus = async () => {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) return null;
  
  try {
    if (!isInitialized) {
      await initializeOneSignal();
    }
    
    // Check native Notification API first if available
    let nativePermission = 'default';
    if (typeof window !== 'undefined' && 'Notification' in window) {
      nativePermission = Notification.permission;
    }

    const osPermission = OneSignal.Notifications ? OneSignal.Notifications.permission : (nativePermission === 'granted');
    const isSubscribed = OneSignal.User?.PushSubscription?.id ? true : (nativePermission === 'granted');

    return {
      permission: nativePermission || (osPermission ? 'granted' : 'default'),
      isSubscribed: !!isSubscribed,
      id: OneSignal.User?.PushSubscription?.id || null
    };
  } catch (e) {
    return null;
  }
};

export const sendTestNotification = async (phone: string) => {
  try {
    await apiFetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: 'single',
        phone,
        title: '¡Notificaciones Activas! 🔔',
        message: 'Esta es una prueba para confirmar que has habilitado las notificaciones correctamente.'
      })
    });
    return true;
  } catch (error) {
    console.error('Error sending test notification:', error);
    return false;
  }
};
