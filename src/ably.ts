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

// Get the main bingo channel with custom options
export const getBingoChannel = () => {
  const channelName = 'bingo-channel';
  
  if (!channels[channelName]) {
    const channel = ably.channels.get(channelName);

    channel.on('attached', () => {
      console.log(`Ably channel ${channelName} attached`);
    });

    channel.on('failed', (err) => {
      console.error(`Ably channel ${channelName} attach failed:`, err);
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
export const safePublish = async (name: string, data: any) => {
  try {
    const channel = getBingoChannel();
    if (channel.state !== 'attached') {
      await channel.attach();
    }
    await channel.publish(name, data);
  } catch (err) {
    console.error(`Error publishing to Ably (${name}):`, err);
  }
};
