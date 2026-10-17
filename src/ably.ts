import * as Ably from 'ably';

// Initialize Ably client using the token auth endpoint
const clientId = 'bingo-client-' + Math.random().toString(36).substring(2);
export const ably = new Ably.Realtime({ 
  clientId,
  authUrl: `/api/ably/auth?clientId=${clientId}`,
  autoConnect: true,
  // Increase timeouts for slow connections
  realtimeRequestTimeout: 30000,
  disconnectedRetryTimeout: 5000,
  // Ensure we use compatible transports
  transports: ['web_socket', 'xhr_polling']
});

// Cache channels to avoid recreating them
const channels: Record<string, Ably.RealtimeChannel> = {};

// Helper para resolver dinámicamente el tenant ID actual desde parámetros, URL o sesión local
export const resolveCurrentTenantId = (explicitTenantId?: string): string => {
  if (explicitTenantId && explicitTenantId.trim()) {
    return explicitTenantId.trim().toLowerCase();
  }

  if (typeof window !== 'undefined') {
    try {
      // 1. Detectar desde URL (/sala/:slug)
      const pathname = window.location.pathname || '';
      const match = pathname.match(/\/sala\/([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }

      // 2. Detectar desde sesión de Administrador
      const adminSession = localStorage.getItem('bingo_admin_user');
      if (adminSession) {
        const parsed = JSON.parse(adminSession);
        if (parsed.tenant_id && parsed.tenant_id !== 'global') {
          return String(parsed.tenant_id).toLowerCase();
        }
      }

      // 3. Detectar desde sesión de Jugador
      const playerSession = localStorage.getItem('bingo_player');
      if (playerSession) {
        const parsed = JSON.parse(playerSession);
        if (parsed.tenant_id && parsed.tenant_id !== 'global') {
          return String(parsed.tenant_id).toLowerCase();
        }
      }
    } catch (e) {
      // fallback silencioso
    }
  }

  return 'bingo-lite';
};

// Obtiene el nombre del canal aislado para la sala
export const getBingoChannelName = (explicitTenantId?: string): string => {
  const normTenant = resolveCurrentTenantId(explicitTenantId);
  if (normTenant && normTenant !== 'default' && normTenant !== 'bingo-lite' && normTenant !== 'global') {
    return `bingo-tenant-${normTenant}`;
  }
  return 'bingo-channel';
};

// Get the main bingo channel with isolated tenant scoping
export const getBingoChannel = (explicitTenantId?: string) => {
  const channelName = getBingoChannelName(explicitTenantId);
  
  if (!channels[channelName]) {
    const channel = ably.channels.get(channelName);

    channel.on('attached', () => {
      console.log(`[Ably] Channel ${channelName} attached`);
    });

    channel.on('failed', (err) => {
      console.error(`[Ably] Channel ${channelName} attach failed:`, err);
      // Attempt to re-attach after a delay if it fails
      setTimeout(() => {
        if (ably.connection.state === 'connected') {
          channel.detach();
          channel.attach();
        }
      }, 5000);
    });

    channels[channelName] = channel;
  }
  
  return channels[channelName];
};

// Log connection status for debugging
ably.connection.on('connected', () => {
  console.log('Ably connected successfully');
});

ably.connection.on('failed', (err) => {
  console.warn('Ably connection failed:', err);
});

ably.connection.on('disconnected', () => {
  console.log('Ably disconnected, attempting to reconnect...');
});

// Helper to safely publish messages
export const safePublish = async (name: string, data: any, explicitTenantId?: string) => {
  try {
    const channel = getBingoChannel(explicitTenantId);
    if (channel.state !== 'attached') {
      await channel.attach();
    }
    await channel.publish(name, data);
  } catch (err) {
    console.error(`Error publishing to Ably (${name}):`, err);
  }
};
