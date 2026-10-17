import 'dotenv/config';
import crypto from 'crypto';
import jsQR from 'jsqr';
import { Jimp } from 'jimp';
import * as OneSignal from 'onesignal-node';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { supabase } from './supabaseClient.ts';
import * as Ably from 'ably';
import { GoogleGenAI } from '@google/genai';

// Helper functions for game settings with cache to prevent Supabase N+1 query egress
const gameSettingsCache = new Map<string, { value: any, timestamp: number }>();
const SETTINGS_CACHE_TTL = 30000; // 30 seconds

async function getGameSettings(gameId: number | 'global') {
  const key = gameId === 'global' ? 'app_global_settings' : `gameSettings_${gameId}`;
  const now = Date.now();
  const cached = gameSettingsCache.get(key);
  if (cached && (now - cached.timestamp < SETTINGS_CACHE_TTL)) {
    return cached.value;
  }
  try {
    const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    if (error) {
      // ignored
      return cached ? cached.value : {};
    }
    const val = (data && data.value) ? JSON.parse(data.value) : {};
    gameSettingsCache.set(key, { value: val, timestamp: now });
    return val;
  } catch (e: any) {
    // ignored
  }
  return cached ? cached.value : {};
}

const settingsUpdateQueue = new Map<string, Promise<any>>();

async function saveGameSettings(gameId: number | 'global', settings: any) {
  const key = gameId === 'global' ? 'app_global_settings' : `gameSettings_${gameId}`;
  gameSettingsCache.delete(key); // Invalidate cache immediately on save


  // Get the existing queue or start a new one, and handle any previous failures so they don't block subsequent updates
  const currentQueue = settingsUpdateQueue.get(key) || Promise.resolve();
  const safeQueue = currentQueue.catch(() => ({}));

  const nextUpdate = safeQueue.then(async () => {
    try {
      const { data, error: fetchError } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
      if (fetchError) throw fetchError;

      let currentSettings = {};
      if (data && data.value) {
        try {
          currentSettings = JSON.parse(data.value);
        } catch (e) {

        }
      }

      const updated = { ...currentSettings, ...settings };
      const payload: any = { key, value: JSON.stringify(updated) };

      const { error: upsertError } = await supabase.from('settings').upsert(payload, { onConflict: 'key' });
      if (upsertError) throw upsertError;

      return updated;
    } catch (e: any) {

      return {};
    }
  });

  settingsUpdateQueue.set(key, nextUpdate);

  // Optional: Clean up the queue if it's idle for a while (not strictly necessary for few keys)
  return nextUpdate;
}

// Helper to normalize phone numbers
function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

// Criptografía segura de contraseñas con PBKDF2 (NIST SP 800-132)
function hashPassword(password: string): string {
  if (!password) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$100000$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHashOrPlain: string): boolean {
  if (!password || !storedHashOrPlain) return false;
  try {
    // Formato PBKDF2 recomendado (pbkdf2$iterations$salt$hash)
    if (storedHashOrPlain.startsWith('pbkdf2$')) {
      const parts = storedHashOrPlain.split('$');
      if (parts.length !== 4) return false;
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const expectedHash = parts[3];
      const calculatedHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
      return crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    }

    // Formato legado salt:hash (10000 iteraciones)
    if (storedHashOrPlain.includes(':')) {
      const [salt, originalHash] = storedHashOrPlain.split(':');
      if (salt && originalHash && originalHash.length === 128) {
        const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
      }
    }

    // Compatibilidad hacia atrás: si la contraseña en BD es texto plano previo a la migración
    return password === storedHashOrPlain;
  } catch (e) {
    return false;
  }
}

// Helper to sanitize uploaded image MIME types
function sanitizeUploadedFileMimeType(file: any) {
  if (!file) return;
  if (file.mimetype === 'application/octet-stream') {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.png') file.mimetype = 'image/png';
    else if (ext === '.webp') file.mimetype = 'image/webp';
    else if (ext === '.jpg' || ext === '.jpeg') file.mimetype = 'image/jpeg';
    else file.mimetype = 'image/jpeg'; // Default fallback for screenshots/receipts
  }
}

// Store online players in memory
const onlinePlayers = new Map<string, { timestamp: number, name: string, phone: string }>();

function touchPlayerPresence(phone: string, name?: string) {
  if (!phone) return;
  const normalized = normalizePhone(phone);
  onlinePlayers.set(normalized, {
    timestamp: Date.now(),
    name: name || 'Jugador',
    phone: normalized
  });
}

// Automatic clean-up of players offline for more than 120 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of onlinePlayers.entries()) {
    if (now - value.timestamp > 120000) {
      onlinePlayers.delete(key);
    }
  }
}, 30000);

// Players lists memory caching to prevent Supabase rate limits (invalidated on updates)
let cachedActiveGamePlayers: any = null;
let lastActiveGamePlayersFetchTime = 0;
const ACTIVE_GAME_PLAYERS_CACHE_TTL = 15000; // 15 seconds cache

let cachedAllPlayers: any = null;
let lastAllPlayersFetchTime = 0;
const ALL_PLAYERS_CACHE_TTL = 15000; // 15 seconds cache

function invalidatePlayersCaches() {
  cachedActiveGamePlayers = null;
  lastActiveGamePlayersFetchTime = 0;
  cachedAllPlayers = null;
  lastAllPlayersFetchTime = 0;
}

// Game and games list memory caching to prevent Supabase rate limits (invalidated on updates)
let cachedCurrentGame: any = null;
let lastCurrentGameFetchTime = 0;
const CURRENT_GAME_CACHE_TTL = 10000; // 10 seconds cache

let cachedGamesList: any = null;
let lastGamesListFetchTime = 0;
const GAMES_LIST_CACHE_TTL = 15000; // 15 seconds cache

function invalidateGameCaches(gameId?: number) {
  cachedCurrentGame = null;
  lastCurrentGameFetchTime = 0;
  cachedGamesList = null;
  lastGamesListFetchTime = 0;
  if (gameId) {
    invalidateGameCardsCache(gameId);
  } else {
    gameCardsMemoryCache.clear();
  }
}

// ============================================================================
// MOTOR DE ALTA ESCALA PARA 20.000 CARTONES (HIGH-SCALE CARDS ENGINE)
// ============================================================================
interface CachedCard {
  id: number;
  card_number: string;
  player_id: number;
  game_id: number;
  player: { name: string; city: string; phone: string };
  grid: number[][]; // Matriz 5x5 de enteros pre-procesada
}

const gameCardsMemoryCache = new Map<number, { cards: CachedCard[]; timestamp: number }>();
const CARDS_CACHE_TTL = 120000; // 2 minutos en RAM durante sorteos

function invalidateGameCardsCache(gameId: number) {
  gameCardsMemoryCache.delete(gameId);
  console.log(`[HighScaleEngine] Caché de cartones invalidada para juego ${gameId}`);
}

function parseCardGridNumbers(card: any): number[][] {
  const parseCol = (val: any): number[] => {
    if (Array.isArray(val)) return val.map(Number);
    if (typeof val === 'string') {
      try {
        if (val.startsWith('{') && val.endsWith('}')) {
          return val.slice(1, -1).split(',').map(x => (x === 'FREE' || isNaN(Number(x))) ? 0 : Number(x));
        }
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed.map(Number);
      } catch (e) {
        return val.replace(/[\[\]{}]/g, '').split(',').map(x => (x === 'FREE' || isNaN(Number(x))) ? 0 : Number(x));
      }
    }
    return [0, 0, 0, 0, 0];
  };

  const b = parseCol(card.b);
  const i = parseCol(card.i);
  const n = parseCol(card.n);
  const g = parseCol(card.g);
  const o = parseCol(card.o);

  return [
    [b[0] || 0, i[0] || 0, n[0] || 0, g[0] || 0, o[0] || 0],
    [b[1] || 0, i[1] || 0, n[1] || 0, g[1] || 0, o[1] || 0],
    [b[2] || 0, i[2] || 0, 0, g[2] || 0, o[2] || 0], // Casilla central FREE = 0
    [b[3] || 0, i[3] || 0, n[3] || 0, g[3] || 0, o[3] || 0],
    [b[4] || 0, i[4] || 0, n[4] || 0, g[4] || 0, o[4] || 0],
  ];
}

// Descarga paginada en lotes de 1.000 para sortear el límite por defecto de Supabase
async function getOrFetchAllGameCards(gameId: number): Promise<CachedCard[]> {
  const now = Date.now();
  const cached = gameCardsMemoryCache.get(gameId);
  if (cached && (now - cached.timestamp < CARDS_CACHE_TTL)) {
    return cached.cards;
  }

  const PAGE_SIZE = 1000;
  let page = 0;
  const rawCards: any[] = [];
  let hasMore = true;

  console.log(`[HighScaleEngine] Iniciando carga masiva de cartones para juego ${gameId}...`);
  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('cards')
      .select('id, card_number, player_id, game_id, b, i, n, g, o, players(id, name, city, phone)')
      .eq('game_id', gameId)
      .range(from, to);

    if (error) {
      console.error(`[HighScaleEngine] Error obteniendo lote ${page}:`, error.message);
      break;
    }

    if (data && data.length > 0) {
      rawCards.push(...data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  console.log(`[HighScaleEngine] Total de ${rawCards.length} cartones cargados. Pre-indexando en RAM...`);

  const processed: CachedCard[] = rawCards.map(c => {
    const rawPlayer = Array.isArray(c.players) ? c.players[0] : (c.players || {});
    const pId = c.player_id || rawPlayer.id;
    const player = {
      id: pId,
      name: rawPlayer.name || 'Jugador',
      city: rawPlayer.city || '',
      phone: rawPlayer.phone || ''
    };
    return {
      id: c.id,
      card_number: c.card_number,
      player_id: pId,
      game_id: c.game_id,
      player,
      grid: parseCardGridNumbers(c)
    };
  });

  gameCardsMemoryCache.set(gameId, { cards: processed, timestamp: now });
  return processed;
}

// Verificación ultra-rápida O(1) con Set en memoria (10-15ms para 20.000 cartones)
function checkCardPatternFast(card: CachedCard, pGrid: boolean[][], drawnSet: Set<number>) {
  const marked_cells: { r: number; c: number }[] = [];
  let totalRequired = 0;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (pGrid[r][c]) {
        totalRequired++;
        const val = card.grid[r][c];
        if (val === 0 || drawnSet.has(val)) {
          marked_cells.push({ r, c });
        } else {
          return { won: false, marked_cells: [] };
        }
      }
    }
  }

  return totalRequired > 0 ? { won: true, marked_cells } : { won: false, marked_cells: [] };
}

// Helper to aggregate gift invitations by sender phone
// Helper to aggregate gift invitations by sender phone (contextual to game)
async function getGiftStatsMap(targetGameId?: number) {
  const giftsMap = new Map<string, { total: number; claimed: number; pending: number; gifts: any[] }>();
  try {
    let query = supabase
      .from('gift_invitations')
      .select('id, sender_phone, recipient_phone, status, created_at, game_id')
      .order('created_at', { ascending: true });

    if (targetGameId) {
      query = query.eq('game_id', targetGameId);
    }

    const { data: allGifts } = await query;

    if (allGifts) {
      for (const g of allGifts) {
        const senderNorm = normalizePhone(g.sender_phone || '');
        if (!senderNorm) continue;
        let entry = giftsMap.get(senderNorm);
        if (!entry) {
          entry = { total: 0, claimed: 0, pending: 0, gifts: [] };
          giftsMap.set(senderNorm, entry);
        }
        entry.total += 1;
        if (g.status === 'claimed') {
          entry.claimed += 1;
        } else {
          entry.pending += 1;
        }
        entry.gifts.push(g);
      }
    }
  } catch (err) {
    console.warn('[Gift Stats] Error fetching gift stats:', err);
  }
  return giftsMap;
}

// Wallet helper functions con aislamiento estricto por sala (Tenant)
async function getWalletBalance(rawPhone: string, tenantId?: string): Promise<number> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return 0;
  const targetTenant = (tenantId || 'default').toLowerCase();
  try {
    let query = supabase.from('wallets').select('balance').eq('phone', phone);
    if (targetTenant !== 'default' && targetTenant !== 'bingo-lite') {
      query = query.eq('tenant_id', targetTenant);
    } else {
      query = query.or('tenant_id.eq.default,tenant_id.eq.bingo-lite,tenant_id.is.null');
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      if (error.code === '42703') { // Columna tenant_id no existe aún en la tabla wallets de Supabase
        // Si es una sala secundaria, no filtrar saldo global para no cruzar billeteras entre salas
        if (targetTenant !== 'default' && targetTenant !== 'bingo-lite') {
          return 0;
        }
        const fallback = await supabase.from('wallets').select('balance').eq('phone', phone).maybeSingle();
        return fallback.data ? fallback.data.balance : 0;
      }
      if (error.code !== 'PGRST116') throw error;
    }
    return data ? data.balance : 0;
  } catch (e: any) {
    return 0;
  }
}

// Cola por teléfono y sala para garantizar atomicidad y prevenir condiciones de carrera (double-spending)
const walletUpdateQueues = new Map<string, Promise<any>>();

async function updateWalletBalance(rawPhone: string, amount: number, description: string = 'Transacción de billetera', type: string = 'other', tenantId?: string): Promise<number> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return 0;
  const targetTenant = (tenantId || 'default').toLowerCase();
  const queueKey = `${targetTenant}:${phone}`;

  const currentQueue = walletUpdateQueues.get(queueKey) || Promise.resolve();

  const execution = currentQueue.catch(() => 0).then(async () => {
    try {
      const currentBalance = await getWalletBalance(phone, targetTenant);
      const newBalance = currentBalance + amount;

      const payload: any = { phone, balance: newBalance, tenant_id: targetTenant };

      let existingQ = supabase.from('wallets').select('id, phone').eq('phone', phone);
      if (targetTenant !== 'default' && targetTenant !== 'bingo-lite') {
        existingQ = existingQ.eq('tenant_id', targetTenant);
      }
      const { data: existing, error: selectError } = await existingQ.maybeSingle();

      if (existing) {
        let updateQ = supabase.from('wallets').update({ balance: newBalance }).eq('phone', phone);
        if (targetTenant !== 'default' && targetTenant !== 'bingo-lite') {
          updateQ = updateQ.eq('tenant_id', targetTenant);
        }
        await updateQ;
      } else {
        const { error: insertErr } = await supabase.from('wallets').insert(payload);
        if (insertErr && insertErr.code === '42703') {
          delete payload.tenant_id;
          await supabase.from('wallets').insert(payload);
        }
      }

      // Registrar transacción con tenant_id
      const txPayload: any = {
        player_phone: phone,
        amount: amount,
        description,
        type,
        tenant_id: targetTenant
      };
      const { error: txError } = await supabase.from('wallet_transactions').insert(txPayload);
      if (txError && txError.code === '42703') {
        delete txPayload.tenant_id;
        await supabase.from('wallet_transactions').insert(txPayload);
      }

      // Publish update en canal de la sala
      getChannel(targetTenant).publish('wallet_updated', { phone, balance: newBalance, tenantId: targetTenant });
      return newBalance;
    } catch (e: any) {
      console.error('[updateWalletBalance] Error actualizando balance:', e);
      return 0;
    }
  });

  walletUpdateQueues.set(queueKey, execution);
  return execution;
}

async function isWalletActivated(rawPhone: string, gameId: number): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  try {
    const balance = await getWalletBalance(phone);
    if (balance <= 0) return false;

    // Check if player has any approved recharge transaction in history
    const { data: txs } = await supabase
      .from('wallet_transactions')
      .select('type')
      .eq('player_phone', phone);

    const hasRecharge = txs && txs.some((t: any) => t.type === 'recharge');

    if (hasRecharge) {
      // Recharge of real money enables wallet automatically until balance runs out
      return true;
    }

    // Check if they have ever bought a card with real money (by uploading a real receipt, not WALLET_PAYMENT and not FREE_GAME)
    const { data: player } = await supabase.from('players').select('receipt_url').eq('phone', phone).maybeSingle();
    if (player && player.receipt_url) {
      try {
        const history = JSON.parse(player.receipt_url);
        if (Array.isArray(history) && history.length > 0) {
          const hasRealReceipt = history.some((h: any) => h.url && h.url !== 'WALLET_PAYMENT' && h.url !== 'FREE_GAME' && !h.is_silent_error);
          if (hasRealReceipt) return true;
        }
      } catch (e) {
        if (player.receipt_url !== 'WALLET_PAYMENT' && player.receipt_url !== 'FREE_GAME') {
          return true;
        }
      }
    }

    // Check if they have an activation record
    const { data: activation } = await supabase.from('wallet_activations').select('phone').eq('phone', phone).limit(1);
    if (activation && activation.length > 0) return true;

    return false;
  } catch (e: any) {
    return false;
  }
}

async function activateWallet(rawPhone: string, gameId: number) {
  const phone = normalizePhone(rawPhone);
  try {
    const isActivated = await isWalletActivated(phone, gameId);
    if (!isActivated) {
      const payload: any = { phone, game_id: gameId };
      const { error } = await supabase.from('wallet_activations').insert(payload);
      if (error) throw error;
    }
  } catch (e: any) {

  }
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging middleware to help with "Disappearing" connection issues
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Process-level error handling to keep server alive
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception thrown:', err);
});


// Initialize Supabase Storage Bucket

// Initialize Ably
const ablyKey = process.env.ABLY_API_KEY || '';
let ablyInstance: any = null;
if (ablyKey) {
  try {
    ablyInstance = new Ably.Rest({ key: ablyKey });
  } catch (err) {

  }
}
const ably = ablyInstance;

// ============================================================================
// CRIPTOGRAFÍA Y TOKENS SEGUROS (ADMINISTRACIÓN Y JUGADORES)
// ============================================================================
const ADMIN_HMAC_SECRET = process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || crypto.randomBytes(32).toString('hex');
const PLAYER_HMAC_SECRET = process.env.PLAYER_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ADMIN_HMAC_SECRET;

interface AdminTokenPayload {
  uid: string;
  email: string;
  role: 'admin';
  isSuperAdmin: boolean;
  tenant_id: string;
  exp: number;
}

function createAdminToken(payload: Omit<AdminTokenPayload, 'exp'>): string {
  const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 días de validez
  const data: AdminTokenPayload = { ...payload, exp };
  const encodedData = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_HMAC_SECRET).update(encodedData).digest('base64url');
  return `${encodedData}.${signature}`;
}

function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    if (!token || !token.includes('.')) return null;
    const [encodedData, signature] = token.split('.');
    const expectedSignature = crypto.createHmac('sha256', ADMIN_HMAC_SECRET).update(encodedData).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }
    const data: AdminTokenPayload = JSON.parse(Buffer.from(encodedData, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

interface PlayerTokenPayload {
  uid: string | number;
  phone: string;
  role: 'player';
  tenant_id: string;
  exp: number;
}

function createPlayerToken(payload: Omit<PlayerTokenPayload, 'exp'>): string {
  const exp = Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60); // 14 días
  const data: PlayerTokenPayload = { ...payload, exp };
  const encodedData = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', PLAYER_HMAC_SECRET).update(encodedData).digest('base64url');
  return `plyr.${encodedData}.${signature}`;
}

function verifyPlayerToken(token: string): PlayerTokenPayload | null {
  try {
    if (!token || !token.startsWith('plyr.')) return null;
    const parts = token.slice(5).split('.');
    if (parts.length !== 2) return null;
    const [encodedData, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', PLAYER_HMAC_SECRET).update(encodedData).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }
    const data: PlayerTokenPayload = JSON.parse(Buffer.from(encodedData, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// INFRAESTRUCTURA SAAS & MULTI-TENANCY
// ============================================================================
const tenantsCache = new Map<string, { tenant: any; timestamp: number }>();
const TENANTS_CACHE_TTL = 60000; // 1 minuto

function getTenantIdFromRequest(req: express.Request): string {
  // 1. Detección por ruta de URL (/sala/:slug o /sala/:slug/*)
  const pathToCheck = req.originalUrl || req.path || '';
  const salaMatch = pathToCheck.match(/\/sala\/([a-zA-Z0-9_-]+)/i);
  if (salaMatch && salaMatch[1]) {
    return salaMatch[1].trim().toLowerCase();
  }

  // 2. Query param (?slug=... o ?tenant=...)
  const queryTenant = req.query.slug || req.query.tenant;
  if (typeof queryTenant === 'string' && queryTenant.trim()) {
    return queryTenant.trim().toLowerCase();
  }

  // 3. Header explícito (X-Tenant-ID o X-Tenant-Slug)
  const headerTenant = req.headers['x-tenant-id'] || req.headers['x-tenant-slug'];
  if (typeof headerTenant === 'string' && headerTenant.trim()) {
    return headerTenant.trim().toLowerCase();
  }

  // 4. Subdominio automático (ej: sala1.bingolite.click -> "sala1")
  const host = (req.headers.host || req.hostname || '').toLowerCase();
  const cleanHost = host.split(':')[0];
  const parts = cleanHost.split('.');

  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub !== 'www' && sub !== 'api' && sub !== 'app' && sub !== 'localhost') {
      return sub;
    }
  }

  return 'default';
}

async function getTenantInfo(tenantId: string) {
  const normId = (tenantId || 'default').toLowerCase();
  const cached = tenantsCache.get(normId);
  const now = Date.now();
  if (cached && (now - cached.timestamp < TENANTS_CACHE_TTL)) {
    return cached.tenant;
  }

  // Si es la sala oficial 'bingo-lite' o 'default'
  if (normId === 'bingo-lite' || normId === 'default') {
    const defaultTenant = {
      id: 'bingo-lite',
      name: 'Bingo Lite Oficial',
      slug: 'bingo-lite',
      primary_color: '#2563eb',
      plan: 'pro',
      access_code: 'LITE777',
      max_cards_per_game: 20000,
      description: 'Sala oficial de Bingo en Vivo con sorteos continuos y premios garantizados.'
    };
    tenantsCache.set(normId, { tenant: defaultTenant, timestamp: now });
    return defaultTenant;
  }

  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .or(`id.eq.${normId},slug.eq.${normId},subdomain.eq.${normId}`)
      .maybeSingle();

    if (tenant) {
      tenantsCache.set(normId, { tenant, timestamp: now });
      return tenant;
    }
  } catch (err) {
    // ignorar error de base de datos
  }

  const fallbackTenant = {
    id: normId,
    name: normId.replace(/-/g, ' ').toUpperCase(),
    slug: normId,
    primary_color: '#2563eb',
    plan: 'pro',
    access_code: 'BINGO2026',
    max_cards_per_game: 20000,
    description: 'Sala de Bingo Virtual en Vivo'
  };
  return fallbackTenant;
}

// Canales de tiempo real aislados por Tenant con retrocompatibilidad global
function getChannel(tenantId?: string) {
  const primaryChannel = tenantId && tenantId !== 'default' && tenantId !== 'bingo-lite'
    ? `bingo-tenant-${tenantId}`
    : 'bingo-channel';

  return ably ? {
    publish: async (name: string, data: any) => {
      try {
        await ably.channels.get(primaryChannel).publish(name, data);
        if (primaryChannel !== 'bingo-channel') {
          await ably.channels.get('bingo-channel').publish(name, data);
        }
      } catch (e) {
        console.warn(`[Ably] Error publicando en ${primaryChannel}:`, e);
      }
    }
  } : {
    publish: async (name: string, data: any) => {
      console.warn(`Ably not configured. Skipping publish of ${name}`);
    }
  } as any;
}

if (!ably) {
  console.log('CRITICAL: ABLY_API_KEY is missing. Real-time features will not work.');
}

const BUCKET_NAME = 'receipts';
const BANNER_BUCKET = 'banners';
const AUDIO_BUCKET = 'audio';

// Middleware para inyectar tenantId en cada petición
app.use((req, res, next) => {
  (req as any).tenantId = getTenantIdFromRequest(req);
  next();
});

// Endpoint público para que el frontend resuelva la organización/marca blanca
app.get('/api/tenant/info', async (req, res) => {
  const slug = req.query.slug as string;
  const tenantId = slug || (req as any).tenantId || getTenantIdFromRequest(req);
  const tenant = await getTenantInfo(tenantId);
  res.json(tenant);
});

// Endpoint para que los organizadores creen su sala de bingo
// Endpoint para que los organizadores creen su sala de bingo con su propio administrador independiente
app.post('/api/tenants', async (req, res) => {
  try {
    const { 
      name, 
      slug: rawSlug, 
      access_code: rawCode, 
      primary_color, 
      logo_url, 
      banner_url, 
      organizer_name, 
      contact_phone,
      admin_email,
      admin_password
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la sala es obligatorio.' });
    }

    if (!admin_email || !admin_email.trim()) {
      return res.status(400).json({ error: 'El correo electrónico del administrador de la sala es obligatorio.' });
    }

    if (!admin_password || admin_password.length < 6) {
      return res.status(400).json({ error: 'La contraseña de administrador debe tener al menos 6 caracteres.' });
    }

    // Normalizar slug (solo letras, números y guiones)
    const slug = (rawSlug || name)
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Palabras reservadas del sistema
    const RESERVED_SLUGS = ['admin', 'api', 'seller', 'login', 'register', 'dynamics', 'free-games', 'sala', 'player', 'dashboard', 'settings', 'default'];
    if (RESERVED_SLUGS.includes(slug)) {
      return res.status(400).json({ error: `El identificador "${slug}" es una palabra reservada del sistema. Elige otro nombre.` });
    }

    // Código de acceso seguro a la sala (PIN alfanumérico)
    const accessCode = (rawCode && rawCode.trim())
      ? rawCode.trim().toUpperCase()
      : Math.random().toString(36).substring(2, 8).toUpperCase();

    const cleanAdminEmail = admin_email.trim().toLowerCase();
    const hashedAdminPassword = hashPassword(admin_password);

    const tenantPayload: any = {
      id: slug,
      name: name.trim(),
      slug: slug,
      subdomain: slug,
      access_code: accessCode,
      primary_color: primary_color || '#2563eb',
      logo_url: logo_url || null,
      banner_url: banner_url || null,
      plan: 'pro',
      max_cards_per_game: 20000,
      admin_email: cleanAdminEmail,
      admin_password: hashedAdminPassword,
      admin_name: (organizer_name || name).trim(),
      contact_phone: contact_phone ? contact_phone.trim() : null
    };

    // PREVENCIÓN ESTRICTA DE SECUESTRO DE SALAS (ROOM TAKEOVER)
    let existingTenant = null;
    try {
      const { data } = await supabase.from('tenants').select('id, slug, admin_email').eq('slug', slug).maybeSingle();
      if (data) existingTenant = data;
    } catch (e) {}

    if (!existingTenant && tenantsCache.has(slug)) {
      existingTenant = tenantsCache.get(slug)?.tenant;
    }

    if (existingTenant) {
      return res.status(409).json({ 
        error: `La sala con identificador "${slug}" ya existe en el sistema. Por favor, elige un nombre diferente.` 
      });
    }

    let tenantRecord = tenantPayload;
    const { data: createdTenant, error: insertError } = await supabase
      .from('tenants')
      .insert(tenantPayload)
      .select()
      .single();

    if (insertError) {
      console.warn('[CreateTenant] Supabase notice (tabla tenants pendiente de migración):', insertError.message);
      // Fallback a memoria para desarrollo y tolerancia inmediata
      tenantsCache.set(slug, { tenant: tenantPayload, timestamp: Date.now() });
    } else if (createdTenant) {
      tenantRecord = createdTenant;
      tenantsCache.set(slug, { tenant: createdTenant, timestamp: Date.now() });
    }

    const host = req.headers.host || 'bingolite.click';
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = (typeof forwardedProto === 'string' ? forwardedProto : '') || (req.secure ? 'https' : 'http');
    const fullUrl = `${proto}://${host}/sala/${slug}`;
    const adminUrl = `${proto}://${host}/sala/${slug}/admin`;

    // Sanitizar respuesta (no retornar hash de contraseña)
    const sanitizedTenant = { ...tenantRecord };
    delete sanitizedTenant.admin_password;

    res.json({
      success: true,
      message: '¡Sala de bingo creada con éxito con su propio administrador independiente!',
      tenant: sanitizedTenant,
      url: fullUrl,
      admin_url: adminUrl,
      access_code: accessCode,
      admin_email: cleanAdminEmail
    });
  } catch (error: any) {
    console.error('[CreateTenant] Excepción:', error);
    res.status(500).json({ error: 'Error interno al crear la sala.' });
  }
});

// Endpoint para verificar código de seguridad de una sala
app.post('/api/tenants/verify-code', async (req, res) => {
  try {
    const { slug, code } = req.body;
    if (!slug || !code) {
      return res.status(400).json({ error: 'Sala y código de acceso requeridos.' });
    }

    const tenant = await getTenantInfo(slug);
    const isValid = (tenant.access_code || 'BINGO2026').toUpperCase() === code.trim().toUpperCase();

    if (isValid) {
      res.json({ success: true, valid: true });
    } else {
      res.status(401).json({ success: false, valid: false, error: 'Código de acceso incorrecto para esta sala.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Error verificando código de sala.' });
  }
});

// Endpoint de autenticación blindado para administradores (Super Admins y Admins de Sala)
app.post('/api/admin/tenant-login', async (req, res) => {
  try {
    const { email: rawEmail, password, room_slug } = req.body;
    const email = (rawEmail || '').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña de administrador requeridos.' });
    }

    const targetRoomSlug = (room_slug || (req as any).tenantId || '').trim().toLowerCase();

    // 1. Identificar si es un Super Administrador Global del sistema
    const superAdminEmails = [
      'comamosexpress@gmail.com', 
      'stcganas@gmail.com',
      ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [])
    ];

    if (superAdminEmails.includes(email)) {
      // SEGURIDAD CRÍTICA: Validar obligatoriamente la contraseña del Super Administrador con Supabase
      if (!supabase) {
        return res.status(500).json({ error: 'Servicio de autenticación no disponible.' });
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError || !authData?.user) {
        return res.status(401).json({ error: 'Contraseña de Super Administrador incorrecta.' });
      }

      // Emitir token HMAC firmado de sesión administrativa
      const adminToken = createAdminToken({
        uid: authData.user.id,
        email,
        role: 'admin',
        isSuperAdmin: true,
        tenant_id: targetRoomSlug || 'global'
      });

      return res.json({
        success: true,
        token: adminToken,
        user: {
          uid: authData.user.id,
          email,
          name: authData.user.user_metadata?.full_name || 'Super Administrador Global',
          role: 'admin',
          isSuperAdmin: true,
          tenant_id: targetRoomSlug || 'global'
        }
      });
    }

    // 2. Administrador de sala específica
    let targetTenant: any = null;
    if (targetRoomSlug && targetRoomSlug !== 'default' && targetRoomSlug !== 'global') {
      targetTenant = await getTenantInfo(targetRoomSlug);
    } else {
      // Buscar tenant por admin_email
      for (const [key, val] of tenantsCache.entries()) {
        if ((val.tenant.admin_email || '').toLowerCase() === email) {
          targetTenant = val.tenant;
          break;
        }
      }
      if (!targetTenant) {
        try {
          const { data } = await supabase.from('tenants').select('*').eq('admin_email', email).maybeSingle();
          if (data) targetTenant = data;
        } catch (e) {}
      }
    }

    if (!targetTenant || !targetTenant.admin_email) {
      return res.status(401).json({ 
        error: 'No se encontró ninguna sala de bingo asignada a este correo de administrador.' 
      });
    }

    // Comprobación estricta de aislamiento de administración por sala:
    if (targetRoomSlug && targetRoomSlug !== 'default' && targetTenant.slug !== targetRoomSlug) {
      return res.status(403).json({ 
        error: `Acceso denegado: Tus credenciales de administrador pertenecen a la sala "${targetTenant.name || targetTenant.slug}". No tienes autorización para administrar la sala "${targetRoomSlug}".` 
      });
    }

    // Verificar que el correo coincida con el registrado para esa sala
    if (targetTenant.admin_email.toLowerCase() !== email) {
      return res.status(401).json({ 
        error: 'El correo no corresponde al administrador registrado en esta sala.' 
      });
    }

    // Validar contraseña PBKDF2
    if (!targetTenant.admin_password) {
      return res.status(401).json({ error: 'Esta sala aún no tiene credenciales de administrador configuradas.' });
    }

    const isMatch = verifyPassword(password, targetTenant.admin_password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Contraseña de administrador incorrecta para esta sala.' });
    }

    // Emitir token HMAC firmado de sesión de administrador de sala
    const adminToken = createAdminToken({
      uid: `admin-${targetTenant.slug}`,
      email: targetTenant.admin_email,
      role: 'admin',
      isSuperAdmin: false,
      tenant_id: targetTenant.slug
    });

    res.json({
      success: true,
      token: adminToken,
      user: {
        uid: `admin-${targetTenant.slug}`,
        email: targetTenant.admin_email,
        name: targetTenant.admin_name || targetTenant.name,
        role: 'admin',
        isSuperAdmin: false,
        tenant_id: targetTenant.slug,
        tenant_name: targetTenant.name
      }
    });
  } catch (err: any) {
    console.error('Error en tenant-login:', err);
    res.status(500).json({ error: 'Error interno en autenticación de administrador.' });
  }
});

app.get('/api/test-db', async (req, res) => {
  const { data, error } = await supabase.from('wallet_transactions').select('*').limit(1);
  res.json({ error: error ? error : "Success", data });
});

// Initialize Supabase Storage Buckets
async function initStorage() {
  if (!supabase) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();

    // Receipt bucket
    if (!buckets?.some(b => b.name === BUCKET_NAME)) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        fileSizeLimit: 5242880
      });
    }

    // Banner bucket
    if (!buckets?.some(b => b.name === BANNER_BUCKET)) {
      await supabase.storage.createBucket(BANNER_BUCKET, {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        fileSizeLimit: 5242880
      });
    }

    // Audio bucket
    // if (!buckets?.some(b => b.name === AUDIO_BUCKET)) {
    // await supabase.storage.createBucket(AUDIO_BUCKET, {
    // public: true,
    // allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav'],
    // fileSizeLimit: 10485760 // 10MB limit for audio
    // });
    // }
  } catch (err) {

  }
}

// Ensure database tables exist
async function initDatabase() {
  if (!supabase) return;
  try {
    // Check if notifications table exists by trying a dummy select
    const { error } = await supabase.from('notifications').select('id').limit(1);

    if (error && error.code === '42P01') {
      console.log('Notifications table missing, attempting to create it via RPC if available or informing admin...');
      // Typically we'd run a migration here, but Supabase JS doesn't support CREATE TABLE directly
      // However, the server will skip it if missing. We should just warn.
    }
  } catch (err) {

  }
}

initStorage();
initDatabase();

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Use memory storage for multer to upload directly to Supabase
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware to check if database is configured
app.use('/api', (req, res, next) => {
  if (!supabase && req.path !== '/health') {
    return res.status(503).json({
      error: 'Base de datos no configurada o error en la conexión. Por favor, revisa las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'
    });
  }
  next();
});

// Helper para extraer token Bearer del encabezado Authorization
function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  return (token && token.trim()) ? token.trim() : null;
}

// Middleware de seguridad para autenticar y autorizar administradores
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No autorizado: Token de sesión de administrador requerido.' });
    }

    // 1. Validar si es un token HMAC firmado de administrador
    const adminSession = verifyAdminToken(token);
    if (adminSession) {
      const targetTenantId = (req as any).tenantId;

      // Si es un admin de sala (no superadmin), aislar estrictamente a su sala asignada
      if (!adminSession.isSuperAdmin) {
        const adminTenant = (adminSession.tenant_id || '').toLowerCase();
        if (targetTenantId && targetTenantId.toLowerCase() !== adminTenant && targetTenantId !== 'default') {
          return res.status(403).json({ 
            error: `Acceso denegado: Tus permisos de administrador pertenecen exclusivamente a la sala "${adminSession.tenant_id}". No puedes gestionar "${targetTenantId}".` 
          });
        }
        // Sobrescribir tenantId con el tenant verificado del admin para garantizar aislamiento
        (req as any).tenantId = adminTenant;
        (req as any).isSuperAdmin = false;
      } else {
        (req as any).isSuperAdmin = true;
      }

      (req as any).adminUser = adminSession;
      return next();
    }

    // 2. Si no es un token HMAC, validar si es una sesión de Supabase Auth
    if (supabase) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        const email = user.email?.toLowerCase();
        const authorizedEmails = (process.env.ADMIN_EMAILS || 'comamosexpress@gmail.com,stcganas@gmail.com')
          .toLowerCase()
          .split(',')
          .map(e => e.trim());

        // SEGURIDAD CRÍTICA: Solo correos explícitamente autorizados pueden actuar como Super Admin
        if (email && authorizedEmails.includes(email)) {
          (req as any).adminUser = {
            uid: user.id,
            email,
            role: 'admin',
            isSuperAdmin: true,
            tenant_id: (req as any).tenantId || 'global'
          };
          (req as any).isSuperAdmin = true;
          return next();
        }
      }
    }

    return res.status(403).json({ error: 'Acceso denegado: Credenciales de administrador no autorizadas.' });
  } catch (err: any) {
    console.error('[requireAdmin] Error validando credenciales:', err);
    return res.status(500).json({ error: 'Error interno al validar la sesión de administrador.' });
  }
}

// Middleware de seguridad exclusivo para Super Administradores Globales
async function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  return requireAdmin(req, res, () => {
    const adminUser = (req as any).adminUser;
    if (!adminUser || !adminUser.isSuperAdmin) {
      return res.status(403).json({ 
        error: 'Acceso denegado: Esta operación sensible requiere permisos exclusivos de Super Administrador Global.' 
      });
    }
    next();
  });
}

// Helper para obtener el usuario autenticado (jugador o administrador)
async function getAuthenticatedUser(req: express.Request): Promise<{ role: 'admin' | 'player'; isSuperAdmin?: boolean; tenant_id?: string; phone?: string; uid?: string | number } | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  // 1. Probar token de administrador
  const adminSession = verifyAdminToken(token);
  if (adminSession) {
    return {
      role: 'admin',
      isSuperAdmin: adminSession.isSuperAdmin,
      tenant_id: adminSession.tenant_id,
      uid: adminSession.uid
    };
  }

  // 2. Probar token de jugador
  const playerSession = verifyPlayerToken(token);
  if (playerSession) {
    return {
      role: 'player',
      phone: playerSession.phone,
      tenant_id: playerSession.tenant_id,
      uid: playerSession.uid
    };
  }

  // 3. Probar sesión de Supabase Auth
  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        const email = user.email?.toLowerCase();
        const authorizedEmails = (process.env.ADMIN_EMAILS || 'comamosexpress@gmail.com,stcganas@gmail.com')
          .toLowerCase()
          .split(',')
          .map(e => e.trim());
        if (email && authorizedEmails.includes(email)) {
          return { role: 'admin', isSuperAdmin: true, tenant_id: 'global', uid: user.id };
        }
      }
    } catch {}
  }

  return null;
}

// Proteger universalmente todas las rutas administrativas
app.use('/api/admin', requireAdmin);

// Notifications Endpoints
app.get('/api/notifications/:id', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    const { id } = req.params;
    console.log(`[Notifications][${requestId}] Request for ID: ${id}`);

    if (!supabase) {
      console.warn(`[Notifications][${requestId}] Supabase not configured`);
      return res.json([]);
    }

    if (!id || id === 'undefined' || id === 'null' || id === '[object Object]') {
      console.warn(`[Notifications][${requestId}] Invalid ID received: ${id}`);
      return res.json([]);
    }

    const decodedId = decodeURIComponent(id);
    console.log(`[Notifications][${requestId}] Decoded ID: ${decodedId}`);

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', decodedId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn(`[Notifications][${requestId}] Supabase error (skipping):`, error.message || error);
      return res.json([]);
    }

    console.log(`[Notifications][${requestId}] Found ${data?.length || 0} notifications`);
    res.json(data || []);
  } catch (error: any) {
    // ignored
    res.json([]);
  }
});

app.post('/api/notifications/:notification_id/read', async (req, res) => {
  try {
    const { notification_id } = req.params;
    // Require authentication to prevent IDOR on notification read
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notification_id);

    res.json({ success: true });
  } catch (error) {

    res.json({ success: true });
  }
});

app.post('/api/notifications/user/:id/read-all', async (req, res) => {
  try {
    const { id } = req.params;
    // Require authentication to prevent IDOR on bulk notification read
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    const decodedId = decodeURIComponent(id);
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', decodedId);

    res.json({ success: true });
  } catch (error) {

    res.json({ success: true });
  }
});

// Automated 24-hour notification cleanup to reduce Supabase storage and query egress
async function clearOldNotifications() {
  if (!supabase) return;
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    console.log(`[Notifications] Running automatic cleanup of notifications older than 24h: ${twentyFourHoursAgo}`);
    const { error } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', twentyFourHoursAgo);

    if (error) {
      // ignored
    } else {
      console.log('[Notifications] Automatic cleanup of old notifications completed successfully.');
    }
  } catch (err: any) {
    // ignored
  }
}

// Run cleanup immediately 5 seconds after boot, and then every 12 hours
setTimeout(clearOldNotifications, 5000);
setInterval(clearOldNotifications, 12 * 60 * 60 * 1000);

// Endpoint for manual purge of notifications older than 24 hours
app.post('/api/admin/notifications/clear-old', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database connection is not configured.' });
  }
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    console.log(`[Notifications] Manual cleanup requested for notifications older than 24h: ${twentyFourHoursAgo}`);
    const { error } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', twentyFourHoursAgo);

    if (error) {
      // ignored
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, message: 'Se eliminaron correctamente las notificaciones antiguas de más de 24 horas.' });
  } catch (err: any) {
    // ignored
    res.status(500).json({ error: err.message || 'Error interno al limpiar las notificaciones.' });
  }
});

// Helper to get complete game state including patterns and settings
async function getGameFullState(gameId: number) {
  const { data: game, error: gameError } = await supabase.from('game').select('*').eq('id', gameId).maybeSingle();
  if (!game) return null;

  // Safely parse drawn_balls
  let parsedDrawnBalls: number[] = [];
  if (game.drawn_balls) {
    if (Array.isArray(game.drawn_balls)) {
      parsedDrawnBalls = game.drawn_balls.map(Number);
    } else if (typeof game.drawn_balls === 'string') {
      try {
        const parsed = JSON.parse(game.drawn_balls);
        if (Array.isArray(parsed)) {
          parsedDrawnBalls = parsed.map(Number);
        }
      } catch (e) {
        parsedDrawnBalls = [];
      }
    }
  }
  game.drawn_balls = parsedDrawnBalls;

  const patternsQuery = supabase
    .from('game_patterns')
    .select(`
      id, prize, winner_player_id, won_at, payment_status,
      patterns (id, name, grid),
      players (name)
    `)
    .eq('game_id', gameId)
    .order('id', { ascending: true });

  let { data: gamePatterns, error: patternsError }: { data: any[] | null, error: any } = await patternsQuery;

  if (patternsError && patternsError.code === '42703') {
    console.warn('Columnas payment_status missing in game_patterns. Retrying minimal fetch.');
    const retry = await supabase
      .from('game_patterns')
      .select(`
        id, prize, winner_player_id, won_at,
        patterns (id, name, grid),
        players (name)
      `)
      .eq('game_id', gameId)
      .order('id', { ascending: true });

    if (!retry.error) {
      gamePatterns = retry.data as any;
      patternsError = null;
    }
  }

  if (patternsError) {
    // ignored
    // Silent fail for patterns to allow game to at least load
    gamePatterns = [];
  }

  const gameSettings = await getGameSettings(gameId);
  const globalSettings = await getGameSettings('global');
  const settings = { ...globalSettings, ...gameSettings };
  const rematchIds = settings.rematch_game_pattern_ids || [];

  // Get all unique winner player IDs
  const winnerPlayerIds = (gamePatterns || [])
    .map((gp: any) => gp.winner_player_id)
    .filter(Boolean);

  let gameCardsForWinners: any[] = [];
  let playersDict: Record<string, string> = {};

  if (winnerPlayerIds.length > 0) {
    // Fetch Cards for Winners
    const { data: cardsData } = await supabase
      .from('cards')
      .select('card_number, player_id, b, i, n, g, o')
      .eq('game_id', gameId)
      .in('player_id', winnerPlayerIds);
    if (cardsData) {
      gameCardsForWinners = cardsData;
    }

    // Fetch Players for Winners to guarantee name mapping
    const { data: playersData } = await supabase
      .from('players')
      .select('id, name')
      .in('id', winnerPlayerIds);
    if (playersData) {
      playersData.forEach(p => playersDict[String(p.id)] = p.name);
    }
  }

  const formattedPatterns = (gamePatterns || []).map((gp: any) => {
    // Map winner name securely from the dict, falling back to join data if it somehow exists
    const player = gp.players;
    let winnerName = (gp.winner_player_id && playersDict[String(gp.winner_player_id)]) || null;
    if (!winnerName && player) {
      winnerName = Array.isArray(player) ? player[0]?.name : player.name;
    }

    // Handle patterns being object or array (Supabase join result can vary)
    const pData: any = Array.isArray(gp.patterns) ? gp.patterns[0] : gp.patterns;

    // Fallback for grid to prevent frontend crashes
    const safeGrid = pData?.grid || Array(5).fill(0).map(() => Array(5).fill(false));

    let winnerCardNumber = null;
    if (gp.winner_player_id) {
      const playerCards = gameCardsForWinners.filter(c => String(c.player_id) === String(gp.winner_player_id));
      const pGrid = safeGrid;
      const drawnBalls = parsedDrawnBalls;

      if (playerCards.length > 0 && pGrid) {
        for (const card of playerCards) {
          const winResult = checkCardPattern(card, pGrid, drawnBalls);
          if (winResult.won) {
            winnerCardNumber = card.card_number;
            break;
          }
        }
        if (!winnerCardNumber) {
          winnerCardNumber = playerCards[0]?.card_number;
        }
      }
    }

    return {
      game_pattern_id: gp.id,
      pattern_id: pData?.id,
      name: pData?.name || 'Patrón Desconocido',
      grid: safeGrid,
      prize: gp.prize,
      winner_player_id: gp.winner_player_id,
      won_at: gp.won_at,
      winner_name: winnerName,
      winner_card_number: winnerCardNumber,
      is_rematch: rematchIds.includes(gp.id)
    };
  });

  // Safe fallback to resolve player names for any won patterns where winner_name is null
  const missingWinnerPlayerIds = formattedPatterns
    .filter(p => p.winner_player_id && !p.winner_name)
    .map(p => p.winner_player_id);

  if (missingWinnerPlayerIds.length > 0) {
    const { data: fallbackPlayers } = await supabase
      .from('players')
      .select('id, name')
      .in('id', missingWinnerPlayerIds);

    if (fallbackPlayers && fallbackPlayers.length > 0) {
      formattedPatterns.forEach(p => {
        if (p.winner_player_id && !p.winner_name) {
          const match = fallbackPlayers.find(fp => String(fp.id) === String(p.winner_player_id));
          if (match) {
            p.winner_name = match.name;
          }
        }
      });
    }
  }

  const { data: allCards } = await supabase.from('cards').select('card_number, b, i, n, g, o').eq('game_id', gameId);
  const detected_pattern_ids: number[] = [];
  if (allCards && allCards.length > 0) {
    for (const p of formattedPatterns) {
      if (p.winner_player_id) continue;
      const pGrid = p.grid;
      if (!pGrid) continue;

      for (const card of allCards) {
        if (checkCardPattern(card, pGrid, parsedDrawnBalls).won) {
          detected_pattern_ids.push(p.game_pattern_id);
          break;
        }
      }
    }
  }

  return {
    ...game,
    detected_pattern_ids,
    stream_id: settings.stream_id !== undefined ? settings.stream_id : (game.stream_id || ''),
    stream_active: settings.stream_active !== undefined ? settings.stream_active : (game.stream_active || false),
    patterns: formattedPatterns,
    final_note: settings.final_note,
    is_free: settings.is_free === true || settings.type === 'free',
    type: settings.type || 'paid',
    prize_type: settings.prize_type || 'wallet',
    ai_knowledge_base: settings.ai_knowledge_base,
    ai_model: settings.ai_model || 'gemini-3.8-flash',
    ai_animator_enabled: settings.ai_animator_enabled !== false,
    ai_chat_enabled: settings.ai_chat_enabled !== false,
    ai_fraud_detection_enabled: settings.ai_fraud_detection_enabled !== false,
    whatsapp_template: settings.whatsapp_template || globalSettings.whatsapp_template,
    whatsapp_group_link: settings.whatsapp_group_link || globalSettings.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk',
    active_lottery: settings.active_lottery === true,
    lottery_name: settings.lottery_name || '',
    lottery_date: settings.lottery_date || '',
    lottery_time: settings.lottery_time || '',
    lottery_digits: settings.lottery_digits || '3',
    lottery_prize_type: settings.lottery_prize_type || 'cash',
    lottery_prize_value: settings.lottery_prize_value || '',
    lottery_confirmed: settings.lotteryConfirmed === true,
    lottery_winner_card_number: settings.lotteryWinnerCardNumber || null,
    active_draw: settings.active_draw === true,
    nequi_number: settings.nequi_number || globalSettings.nequi_number || '3235304996',
    header_image_url: settings.header_image_url || null,
    header_opacity: settings.header_opacity !== undefined ? settings.header_opacity : 0.4,
    header_title: settings.header_title || 'BINGO ONLINE',
    header_subtitle: settings.header_subtitle || 'Juega desde tu celular, gana premios al instante y diviértete en grande.',
    login_bg_image_url: settings.login_bg_image_url || null,
    login_bg_opacity: settings.login_bg_opacity !== undefined ? settings.login_bg_opacity : 0.4,
    bg_volume: settings.bg_volume !== undefined ? settings.bg_volume : 0.5,
    fx_volume: settings.fx_volume !== undefined ? settings.fx_volume : 0.7
  };
}

// Helper to broadcast game updates
async function broadcastGameUpdate(gameId: number, manualState?: any) {
  if (!supabase || !ably) return;
  try {
    invalidateAutoplayCache();
    let gameState = manualState;
    // CRITICAL SHIELD: Never broadcast a state without patterns, ensuring figures are never hidden
    if (!gameState || !gameState.patterns || !Array.isArray(gameState.patterns) || gameState.patterns.length === 0) {
      gameState = await getGameFullState(gameId);
    }
    if (!gameState) return;

    // Ensure drawn_balls is always parsed correctly before broadcasting
    if (gameState.drawn_balls && typeof gameState.drawn_balls === 'string') {
      try {
        gameState.drawn_balls = JSON.parse(gameState.drawn_balls);
      } catch (e) { }
    }

    await getChannel().publish('game_update', gameState);
    console.log(`Broadcasted game_update for game ${gameId} (Patterns count: ${gameState.patterns?.length || 0})`);
  } catch (err) {
    console.error(`Error broadcasting game update for ${gameId}:`, err);
  }
}

app.get('/api/wallet', async (req, res) => {
  try {
    const { phone: rawPhone, gameId, tenantId: qTenantId } = req.query;
    const phone = normalizePhone(rawPhone as string);
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    const tenantId = (qTenantId as string) || (req as any).tenantId || 'default';

    // Touch player presence
    touchPlayerPresence(phone);

    const activated = gameId ? await isWalletActivated(phone, parseInt(gameId as string)) : false;

    // Check if player already exists in this tenant and has a password
    let playerQ = supabase.from('players').select('id, password').eq('phone', phone);
    if (tenantId !== 'default' && tenantId !== 'bingo-lite') {
      playerQ = playerQ.eq('tenant_id', tenantId);
    }
    const { data: player } = await playerQ.maybeSingle();
    const hasPassword = !!(player?.password && player.password.trim() !== '');

    // Verificar si el solicitante está autenticado como el dueño o como administrador
    const authUser = await getAuthenticatedUser(req);
    let canViewBalance = false;
    if (authUser) {
      if (authUser.role === 'admin') {
        canViewBalance = true;
      } else if (authUser.role === 'player' && normalizePhone(authUser.phone || '') === phone) {
        canViewBalance = true;
      }
    }

    const balance = canViewBalance ? await getWalletBalance(phone, tenantId) : 0;

    res.json({ balance, activated, hasPassword, authenticated: canViewBalance });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/wallet/history', async (req, res) => {
  const { phone: rawPhone, tenantId: qTenantId } = req.query;
  if (!rawPhone || typeof rawPhone !== 'string') return res.status(400).json({ error: 'Favor proporcionar un número de teléfono válido' });
  const phone = normalizePhone(rawPhone);
  const tenantId = (qTenantId as string) || (req as any).tenantId || 'default';

  // CONTROL DE ACCESO ESTRICTO: Solo el titular autenticado o un administrador autorizado pueden ver el historial
  const authUser = await getAuthenticatedUser(req);
  if (!authUser) {
    return res.status(401).json({ error: 'No autorizado: Debes iniciar sesión para consultar el historial financiero.' });
  }

  if (authUser.role === 'player') {
    if (normalizePhone(authUser.phone || '') !== phone) {
      return res.status(403).json({ error: 'Acceso denegado: Solo puedes consultar tu propio historial de billetera.' });
    }
  } else if (authUser.role === 'admin' && !authUser.isSuperAdmin) {
    if (authUser.tenant_id && authUser.tenant_id.toLowerCase() !== tenantId.toLowerCase()) {
      return res.status(403).json({ error: 'Acceso denegado: No puedes consultar datos de jugadores de otra sala.' });
    }
  }

  try {
    console.log(`[API] Fetching history for ${phone} in tenant ${tenantId}`);
    let query = supabase.from('wallet_transactions').select('*').eq('player_phone', phone);
    if (tenantId !== 'default' && tenantId !== 'bingo-lite') {
      query = query.eq('tenant_id', tenantId);
    }
    const { data: history, error } = await query.order('created_at', { ascending: false });
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.warn('History table not found, returning empty');
        return res.json([]);
      }
      if (error.code === '42703') { // Columna tenant_id no existe en BD
        if (tenantId !== 'default' && tenantId !== 'bingo-lite') {
          return res.json([]); // En salas externas no filtrar transacciones de otras salas
        }
        const fallback = await supabase.from('wallet_transactions').select('*').eq('player_phone', phone).order('created_at', { ascending: false });
        return res.json(fallback.data || []);
      }
      throw error;
    }
    res.json(history || []);
  } catch (err: any) {
    res.status(500).json({ error: 'Error interno al cargar historial' });
  }
});

app.post('/api/admin/wallet/recharge', async (req, res) => {
  const { phone: rawPhone, amount, tenantId: qTenantId } = req.body;
  const phone = normalizePhone(rawPhone);
  const numAmount = parseFloat(amount);
  if (!phone || isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Teléfono y un monto numérico positivo válido son requeridos.' });
  }

  const adminUser = (req as any).adminUser;
  let targetTenant = adminUser?.isSuperAdmin ? (qTenantId || (req as any).tenantId || 'default') : (adminUser?.tenant_id || 'default');

  // Verificar que el jugador existe en el tenant asignado
  let playerQ = supabase.from('players').select('id, phone, tenant_id').eq('phone', phone);
  if (targetTenant !== 'default' && targetTenant !== 'bingo-lite') {
    playerQ = playerQ.eq('tenant_id', targetTenant);
  }
  const { data: player } = await playerQ.maybeSingle();
  if (!player && adminUser && !adminUser.isSuperAdmin) {
    return res.status(404).json({ error: `El jugador no se encuentra registrado en tu sala (${targetTenant}).` });
  }

  const actualTenant = player?.tenant_id || targetTenant;
  await updateWalletBalance(phone, numAmount, `Recarga por el administrador por $${numAmount}`, 'recharge', actualTenant);
  res.json({ success: true, newBalance: await getWalletBalance(phone, actualTenant) });
});

app.get('/api/admin/players/wallets', async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    let query = supabase.from('players').select('name, phone, tenant_id');
    if (adminUser && !adminUser.isSuperAdmin && adminUser.tenant_id) {
      query = query.eq('tenant_id', adminUser.tenant_id);
    }
    const { data: players, error } = await query;
    if (error) throw error;

    const targetTenant = (adminUser && !adminUser.isSuperAdmin && adminUser.tenant_id) ? adminUser.tenant_id : 'default';
    const wallets = await Promise.all((players || []).map(async (p: any) => ({
      ...p,
      balance: await getWalletBalance(p.phone, p.tenant_id || targetTenant)
    })));
    res.json(wallets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Winners History (Global)
app.get('/api/admin/winners', async (req, res) => {
  try {
    // 1. Fetch raw game_patterns with winners
    let { data: rawData, error }: { data: any[] | null, error: any } = await supabase
      .from('game_patterns')
      .select('id, game_id, pattern_id, winner_player_id, prize, won_at, payment_status, rejection_reason')
      .not('winner_player_id', 'is', null)
      .order('won_at', { ascending: false });

    // Fallback if payment_status or rejection_reason columns don't exist
    if (error && error.code === '42703') {
      console.warn('Columnas payment_status o rejection_reason no existen; reintentando sin ellas.');
      const fallbackData = await supabase
        .from('game_patterns')
        .select('id, game_id, pattern_id, winner_player_id, prize, won_at')
        .not('winner_player_id', 'is', null)
        .order('won_at', { ascending: false });

      rawData = fallbackData.data as any;
      error = fallbackData.error;
    }

    if (error) {

      throw error;
    }

    const data = rawData || [];
    const winnerPlayerIds = Array.from(new Set(data.map(d => d.winner_player_id).filter(Boolean)));
    const gameIds = Array.from(new Set(data.map(d => d.game_id).filter(Boolean)));
    const patternIds = Array.from(new Set(data.map(d => d.pattern_id).filter(Boolean)));

    const playersDict: Record<string, any> = {};
    const gamesDict: Record<string, any> = {};
    const patternsDict: Record<string, any> = {};

    // 2. Fetch all referenced players
    if (winnerPlayerIds.length > 0) {
      const { data: playersData } = await supabase
        .from('players')
        .select('id, name, phone')
        .in('id', winnerPlayerIds);
      if (playersData) {
        playersData.forEach(p => playersDict[String(p.id)] = p);
      }
    }

    // 3. Fetch all referenced games
    if (gameIds.length > 0) {
      const { data: gamesData } = await supabase
        .from('game')
        .select('id, name, start_time')
        .in('id', gameIds);
      if (gamesData) {
        gamesData.forEach(g => gamesDict[String(g.id)] = g);
      }
    }

    // 4. Fetch all referenced patterns
    if (patternIds.length > 0) {
      const { data: patternsData } = await supabase
        .from('patterns')
        .select('id, name')
        .in('id', patternIds);
      if (patternsData) {
        patternsData.forEach(pt => patternsDict[String(pt.id)] = pt);
      }
    }

    // 5. Format and Group results
    const grouped = new Map();

    data.forEach((item: any) => {
      const p = item.winner_player_id ? playersDict[String(item.winner_player_id)] : null;
      const g = item.game_id ? gamesDict[String(item.game_id)] : null;
      const pt = item.pattern_id ? patternsDict[String(item.pattern_id)] : null;

      const key = `${item.game_id}_${item.winner_player_id}`;

      const prizeValue = Number(item.prize?.replace(/[^0-9.-]+/g, "")) || 0;

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: String(item.id),
          all_ids: [item.id],
          prize: item.prize,
          total_prize_num: prizeValue,
          won_at: item.won_at,
          payment_status: item.payment_status || 'pending',
          rejection_reason: item.rejection_reason || '',
          player_name: p?.name || 'Desconocido',
          player_phone: p?.phone || 'Desconocido',
          game_name: g?.name || `Bingo #${item.game_id || '?'}`,
          pattern_name: pt?.name || 'Patrón',
          patterns_won: [pt?.name || 'Patrón'],
          prizes_won: [String(item.prize || '')]
        });
      } else {
        const existing = grouped.get(key);
        existing.all_ids.push(item.id);
        existing.patterns_won.push(pt?.name || 'Patrón');
        existing.prizes_won.push(String(item.prize || ''));
        existing.total_prize_num += prizeValue;

        existing.pattern_name = existing.patterns_won.join(' + ');
        existing.prize = `$${existing.total_prize_num}`;
        existing.id = existing.all_ids.join(',');

        // If one is pending, leave it pending. We'll simplify and just use the first item's won_at.
      }
    });

    res.json(Array.from(grouped.values()));
  } catch (err: any) {
    // ignored
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// UPDATE Winner Payment Status
app.patch('/api/admin/winners/:ids/status', async (req, res) => {
  const idsParam = req.params.ids;
  const { status, reason } = req.body;

  if (!idsParam) return res.status(400).json({ error: 'IDs no proporcionados' });

  const ids = idsParam.split(',').map(Number).filter(n => !isNaN(n));

  try {
    const { data: winners, error: fetchError } = await supabase
      .from('game_patterns')
      .select('*, players(*), patterns(*)')
      .in('id', ids);

    if (fetchError || !winners || winners.length === 0) return res.status(404).json({ error: 'Ganadores no encontrados' });

    const { error: updateError } = await supabase
      .from('game_patterns')
      .update({
        payment_status: status,
        rejection_reason: status === 'rejected' ? (reason || 'Su pago no pudo ser comprobado. Su evidencia es insuficiente.') : null
      })
      .in('id', ids);

    if (updateError) throw updateError;

    // We only need to notify the player once, so we take the first winner (they are grouped by player & game normally anyway)
    const winner = winners[0];
    const player = winner.players;

    // Group pattern names for the notification
    const patternNames = winners.map((w: any) => w.patterns?.name || 'Patrón').join(' + ');

    // Just sum the prizes for notification if possible, or use the first if strings
    let totalPrizeStr = '';
    const totalNum = winners.reduce((sum: number, w: any) => sum + (Number(w.prize?.replace(/[^0-9.-]+/g, "")) || 0), 0);
    if (totalNum > 0) totalPrizeStr = `$${totalNum}`;
    else totalPrizeStr = winner.prize || 'felicidad';

    let title = '';
    let message = '';

    if (status === 'paid') {
      title = '¡Felicitaciones por tu premio! 🏆';
      message = `¡Felicidades ${player?.name || 'Participante'}! Tu premio de ${totalPrizeStr} por tu combo "${patternNames}" ya fue pagado. ¡Disfrútalo y te esperamos en nuevos juegos!`;
    } else if (status === 'rejected') {
      title = 'Aviso sobre tu premio ⚠️';
      message = `Hola ${player?.name || 'Participante'}, el pago de tu premio por "${patternNames}" fue rechazado. Motivo: ${reason || 'Evidencia insuficiente o nula'}.`;
    }

    if (title && message && player?.phone) {
      await sendPushNotification({
        recipient: 'single',
        phone: player.phone,
        title,
        message
      });
    }

    res.json({ success: true });
  } catch (err: any) {

    res.status(500).json({ error: err.message });
  }
});

// Audio Settings Endpoints
app.get('/api/settings/audio', async (req, res) => {
  try {
    const settings = await getGameSettings('global');
    res.json({
      url: settings.background_audio_url || '',
      active: settings.background_audio_active === true
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching audio settings' });
  }
});

app.post('/api/admin/settings/audio', async (req, res) => {
  try {
    const { url, active } = req.body;
    await saveGameSettings('global', {
      background_audio_url: url,
      background_audio_active: active
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving audio settings' });
  }
});

// DJ Soundboard Settings Endpoints
app.get('/api/settings/dj-board', async (req, res) => {
  try {
    const settings = await getGameSettings('global');
    res.json(settings.dj_slots || {});
  } catch (err) {
    res.status(500).json({ error: 'Error fetching DJ soundboard settings' });
  }
});

app.post('/api/admin/settings/dj-board', async (req, res) => {
  try {
    const { slots } = req.body;
    await saveGameSettings('global', { dj_slots: slots });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving DJ soundboard settings' });
  }
});

app.get('/api/settings/dj-bg', async (req, res) => {
  try {
    const settings = await getGameSettings('global');
    res.json({
      url: settings.dj_bg_url || null,
      name: settings.dj_bg_name || null,
      playlist: settings.dj_bg_playlist || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching DJ BG settings' });
  }
});

app.post('/api/admin/settings/dj-bg', async (req, res) => {
  try {
    const { url, name, playlist } = req.body;

    const updates: any = {};
    if (url !== undefined) updates.dj_bg_url = url;
    if (name !== undefined) updates.dj_bg_name = name;
    if (playlist !== undefined) updates.dj_bg_playlist = playlist;

    await saveGameSettings('global', updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving DJ BG settings' });
  }
});

// Player Commission Settings
app.get('/api/settings/player-commission', async (req, res) => {
  try {
    const settings = await getGameSettings('global');
    res.json({
      percentage: settings.player_commission_percentage || 10
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching player commission settings' });
  }
});

app.post('/api/admin/settings/player-commission', async (req, res) => {
  try {
    const { percentage } = req.body;
    await saveGameSettings('global', {
      player_commission_percentage: percentage
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving player commission settings' });
  }
});

// Maintenance & Updates Mode Endpoints
app.get('/api/maintenance-status', async (req, res) => {
  try {
    const settings = await getGameSettings('global');
    res.json({
      maintenance_mode: settings.maintenance_mode === true,
      maintenance_message: settings.maintenance_message || 'Estamos actualizando la plataforma para traerte mejoras increíbles. Vuelve pronto.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching maintenance status' });
  }
});

app.post('/api/admin/maintenance', async (req, res) => {
  try {
    const { maintenance_mode, maintenance_message } = req.body;
    const updates: any = {};
    if (maintenance_mode !== undefined) updates.maintenance_mode = Boolean(maintenance_mode);
    if (maintenance_message !== undefined) updates.maintenance_message = maintenance_message;

    await saveGameSettings('global', updates);

    try {
      await getChannel().publish('maintenance_updated', {
        maintenance_mode: updates.maintenance_mode,
        maintenance_message: updates.maintenance_message
      });
    } catch (pubErr) {
      console.warn('[Maintenance] Error publishing maintenance update:', pubErr);
    }

    res.json({ success: true, ...updates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Player Referral Stats
app.get('/api/player/referral-stats/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    // 1. Get the player to find their referral code
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (playerError) return res.status(500).json({ error: playerError.message });
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

    // Ensure player has a referral code
    if (!player.referral_code) {
      const generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
      await supabase.from('players').update({ referral_code: generatedCode }).eq('id', player.id);
      player.referral_code = generatedCode;
    }

    // 2. Get referred players (by referral_code or by phone)
    const { data: referredPlayers, error: refError } = await supabase
      .from('players')
      .select('*')
      .or(`referred_by_player_code.eq.${player.referral_code},referred_by_player_code.eq.${player.phone}`);

    if (refError) return res.status(500).json({ error: refError.message });

    const refPlayerIds = referredPlayers?.map(p => p.id) || [];
    let totalCommissions = 0;
    const playersWithCardCount: any[] = [];

    if (refPlayerIds.length > 0) {
      // Fetch all cards for these players
      const { data: cards } = await supabase.from('cards').select('game_id, player_id').in('player_id', refPlayerIds);

      const cardCountsPerPlayer = new Map();
      cards?.forEach(c => {
        cardCountsPerPlayer.set(c.player_id, (cardCountsPerPlayer.get(c.player_id) || 0) + 1);
      });

      // Get game values
      const { data: games } = await supabase.from('game').select('id, card_value, is_free');
      const gameValueMap = new Map();
      games?.forEach(g => {
        const val = parseInt(String(g.card_value || '0').replace(/[^0-9]/g, ''), 10) || 0;
        gameValueMap.set(g.id, g.is_free ? 0 : val);
      });

      // Get global player commission setting
      const settings = await getGameSettings('global');
      const commissionPercent = Number(settings.player_commission_percentage ?? 10);

      cards?.forEach(c => {
        const val = gameValueMap.get(c.game_id) || 0;
        if (val > 0) {
          totalCommissions += val * (commissionPercent / 100);
        }
      });

      referredPlayers?.forEach(p => {
        playersWithCardCount.push({
          ...p,
          card_count: cardCountsPerPlayer.get(p.id) || 0
        });
      });
    }

    res.json({
      success: true,
      referral_code: player.referral_code,
      totalCommissions: Math.round(totalCommissions),
      referrals: playersWithCardCount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pay commission to the referrer player when their referred player purchases cards
async function payReferralCommission(player: any, game: any, cardCount: number) {
  try {
    if (!player || !game || !cardCount || cardCount <= 0) return;
    const refCode = String(player.referred_by_player_code || '').trim();
    if (!refCode || refCode === 'null' || refCode === 'undefined' || refCode === 'ADMIN') return;

    // Check if the game is paid
    const cardVal = parseInt(String(game.card_value || '0').replace(/[^0-9]/g, ''), 10) || 0;
    if (cardVal <= 0 || game.is_free) return;

    // Find referrer by referral_code or by phone
    const { data: referrer, error: refError } = await supabase
      .from('players')
      .select('*')
      .or(`referral_code.eq.${refCode},phone.eq.${refCode}`)
      .maybeSingle();

    if (refError || !referrer) {
      console.log(`[Referral] Referrer not found for code/phone: ${refCode}`);
      return;
    }

    // Do not pay commission to self
    if (referrer.phone === player.phone || referrer.id === player.id) return;

    // Fetch commission percentage from global settings
    const settings = await getGameSettings('global');
    const commissionPercent = Number(settings.player_commission_percentage ?? 10);
    if (commissionPercent <= 0) return;

    const totalCost = cardVal * cardCount;
    const commissionAmount = Math.round(totalCost * (commissionPercent / 100));

    if (commissionAmount > 0) {
      console.log(`[Referral] Paying commission of $${commissionAmount} (${commissionPercent}%) to referrer ${referrer.phone} for purchase of ${cardCount} cards by ${player.name} (${player.phone})`);

      await updateWalletBalance(
        referrer.phone,
        commissionAmount,
        `Comisión del ${commissionPercent}% por compra de ${cardCount} cartón(es) de tu referido ${player.name || player.phone}`,
        'referral_commission'
      );

      const title = '🎉 ¡Ganaste una Comisión de Referido!';
      const msg = `Tu referido ${player.name || 'un amigo'} compró ${cardCount} cartón(es) y has ganado $${commissionAmount.toLocaleString('es-CO')} (${commissionPercent}%) acreditados a tu billetera.`;

      sendPushNotification({
        recipient: 'single',
        phone: referrer.phone,
        title,
        message: msg
      }).catch(() => { });

      try {
        await getChannel().publish(`player_${referrer.phone}`, {
          type: 'commission_received',
          amount: commissionAmount,
          title,
          message: msg
        });
      } catch (err) { }
    }
  } catch (err) {
    console.error('[Referral] Error paying referral commission:', err);
  }
}

app.post('/api/admin/trigger-dj-sound', async (req, res) => {
  try {
    const { slotId, url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'URL de audio requerida' });

    await getChannel().publish('play_dj_sound', {
      slotId,
      url,
      name: name || 'Efecto DJ',
      timestamp: Date.now()
    });

    console.log(`[DJ] Broadcasted track: ${name} URL: ${url}`);
    res.json({ success: true });
  } catch (err: any) {

    res.status(500).json({ error: 'Error al reproducir el sonido en vivo' });
  }
});

// Proxy endpoint to load audio assets bypassing CORS and hotlink protections (e.g. Mixkit)
app.get('/api/audio-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('Falta el parámetro URL');
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://mixkit.co/'
      }
    });

    if (!response.ok) {
      // ignored
      // ignored
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err: any) {

    res.status(500).send('Error al proxyar el archivo de audio');
  }
});

let currentDjBgState: { url: string | null; command: 'play' | 'pause' | 'stop'; name: string; volume: number; timestamp: number } = {
  url: null,
  command: 'stop',
  name: '',
  volume: 0.6,
  timestamp: 0
};

app.get('/api/dj-bg-state', (req, res) => {
  res.json(currentDjBgState);
});

app.post('/api/admin/trigger-dj-bg', async (req, res) => {
  try {
    const { url, command, name, volume } = req.body;
    if (command === 'play' && !url) {
      return res.status(400).json({ error: 'URL de audio de fondo requerida' });
    }

    currentDjBgState = {
      url: url || currentDjBgState.url,
      command: command === 'volume_update' ? currentDjBgState.command : command, // Preserve 'play' or 'stop' state
      name: name || currentDjBgState.name || 'Pista de fondo DJ',
      volume: volume !== undefined ? volume : currentDjBgState.volume,
      timestamp: Date.now()
    };

    // We can just broadcast the volume_update directly to clients but retain the 'play' state in memory so new clients still play
    const broadcastState = command === 'volume_update'
      ? { ...currentDjBgState, command: 'volume_update' }
      : currentDjBgState;

    await getChannel().publish('play_dj_bg', broadcastState);

    console.log(`[DJ BG] Broadcasted background track command: ${command}, track: ${currentDjBgState.name}`);
    res.json({ success: true, state: currentDjBgState });
  } catch (err: any) {

    res.status(500).json({ error: 'Error al controlar la música de fondo' });
  }
});


app.get('/api/admin/sellers', async (req, res) => {
  try {
    const { data: sellers, error } = await supabase.from('sellers').select('*').order('created_at', { ascending: false });
    if (error) {
      // ignored
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, sellers: sellers || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/sellers', async (req, res) => {
  try {
    const { name, phone, email, commission_percentage } = req.body;

    // 1. Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: '123456',
      email_confirm: true,
      user_metadata: { role: 'seller', name, full_name: name }
    });

    if (authError) return res.status(500).json({ error: authError.message });

    // 2. Generate random code
    const code = Math.random().toString(36).substr(2, 4).toUpperCase();

    // 3. Insert into sellers table
    const { data, error } = await supabase.from('sellers').insert([{
      id: authUser.user.id,
      name,
      phone,
      email,
      code,
      commission_percentage
    }]).select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, seller: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/sellers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, commission_percentage } = req.body;

    // Check if email changed and update auth
    if (email || name) {
      const updateData: any = {};
      if (email) updateData.email = email;
      if (name) updateData.user_metadata = { role: 'seller', name, full_name: name };

      const { error: authError } = await supabase.auth.admin.updateUserById(id, updateData);
      if (authError) return res.status(500).json({ error: authError.message });
    }

    const { data, error } = await supabase.from('sellers').update({ name, phone, email, commission_percentage }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, seller: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/sellers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete from auth first
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) return res.status(500).json({ error: authError.message });

    // Should cascade to sellers table due to ON DELETE CASCADE
    // but just in case:
    await supabase.from('sellers').delete().eq('id', id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/trigger-fx-volume', async (req, res) => {
  try {
    const { volume } = req.body;
    await getChannel().publish('fx_volume_update', { volume });
    res.json({ success: true });
  } catch (err: any) {

    res.status(500).json({ error: 'Error' });
  }
});

app.post('/api/admin/upload-audio', upload.single('audio'), async (req, res) => {
  // Audio upload is disabled to save Supabase egress bandwidth.
  // The user will use direct GitHub URLs instead.
  return res.status(403).json({
    error: 'La subida de audios está deshabilitada para ahorrar ancho de banda. Por favor, pega la URL directa de GitHub.'
  });
});

// ABAuth Endpoint
app.get('/api/app-settings', async (req, res) => {
  try {
    const globalSettings = await getGameSettings('global');
    res.json({
      ai_chat_enabled: globalSettings.ai_chat_enabled !== false,
      whatsapp_template: globalSettings.whatsapp_template || ''
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching global settings' });
  }
});

app.get('/api/ably/auth', async (req, res) => {
  if (!ably) {
    return res.status(503).json({ error: 'Ably is not configured on the server' });
  }
  try {
    const clientId = req.query.clientId as string;
    const tokenParams = clientId ? { clientId } : {};
    const tokenRequest = await ably.auth.createTokenRequest(tokenParams);
    res.json(tokenRequest);
  } catch (err) {

    res.status(500).json({ error: 'Error generating Ably token' });
  }
});

// Get Games
// Player Login/Check

app.get('/api/sellers/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' });
    const token = authHeader.split(' ')[1];

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase.from('sellers').select('*').eq('id', user.id).single();
    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true, seller: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sellers/update-credentials', async (req, res) => {
  try {
    // Get user id from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' });
    const token = authHeader.split(' ')[1];

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Unauthorized' });

    if (user.user_metadata?.role !== 'seller') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { email, password } = req.body;

    const updateData: any = {};
    if (email) updateData.email = email;
    if (password) updateData.password = password;

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, updateData);
    if (updateError) return res.status(500).json({ error: updateError.message });

    if (email) {
      await supabase.from('sellers').update({ email }).eq('id', user.id);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sellers/send-push', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' });
    const token = authHeader.split(' ')[1];

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: seller, error: sErr } = await supabase.from('sellers').select('*').eq('id', user.id).single();
    if (sErr || !seller) return res.status(403).json({ error: 'No tienes perfil de vendedor activo' });

    const { title, message, targetAudience } = req.body;

    const finalTitle = title?.trim() || `🚨 ¡Nuevas ventas de cartones abiertas! 🎟️`;
    const finalMessage = message?.trim() || `¡Atención! Se han abierto nuevas ventas de cartones para el Bingo. Ingresa ahora, asegura tus cartones con el código ${seller.code} y participa por los premios. 🏆`;
    const appUrl = getAppUrl();

    let notifyCount = 0;

    if (targetAudience === 'all_players') {
      await sendPushNotification({
        recipient: 'all',
        title: finalTitle,
        message: finalMessage,
        url: appUrl
      });
      const { data: players } = await supabase.from('players').select('id');
      notifyCount = players?.length || 1;
    } else {
      // Send to seller's affiliated players
      const { data: myPlayers, error: pErr } = await supabase
        .from('players')
        .select('id, name, phone')
        .eq('referred_by_player_code', seller.code);

      if (pErr) throw pErr;

      if (!myPlayers || myPlayers.length === 0) {
        return res.status(400).json({
          error: 'No tienes jugadores registrados con tu código de afiliado aún. Comparte tu código para registrar afiliados.'
        });
      }

      notifyCount = myPlayers.length;

      // Send push notification to each affiliated player
      for (const player of myPlayers) {
        if (player.phone) {
          await sendPushNotification({
            recipient: 'single',
            phone: player.phone,
            title: finalTitle,
            message: finalMessage,
            url: appUrl
          });
        }
      }
    }

    res.json({
      success: true,
      count: notifyCount,
      message: `¡Notificación OneSignal enviada exitosamente a ${notifyCount} jugador(es)!`
    });
  } catch (error: any) {
    console.error('[Seller Push] Error sending push notification:', error);
    res.status(500).json({ error: error.message || 'Error interno enviando la notificación' });
  }
});

app.get('/api/sellers/:code/stats', async (req, res) => {
  try {
    const { code } = req.params;

    // Validate seller exists
    const { data: seller, error: sErr } = await supabase.from('sellers').select('*').eq('code', code).maybeSingle();
    if (sErr) return res.status(500).json({ error: sErr.message });
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // CONTROL DE AUTORIZACIÓN: Solo el propio vendedor autenticado o un administrador pueden ver sus estadísticas
    const token = extractBearerToken(req);
    let isAuthorized = false;

    if (token) {
      // 1. Verificar si es admin
      const adminSession = verifyAdminToken(token);
      if (adminSession) {
        if (adminSession.isSuperAdmin || !seller.tenant_id || seller.tenant_id.toLowerCase() === adminSession.tenant_id.toLowerCase()) {
          isAuthorized = true;
        }
      }

      // 2. Verificar si es el vendedor autenticado vía Supabase Auth
      if (!isAuthorized && supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user && user.id === seller.id) {
            isAuthorized = true;
          }
        } catch {}
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Acceso denegado: No tienes autorización para consultar las estadísticas de este vendedor.' });
    }

    // Fetch players with this seller code
    const { data: players, error } = await supabase.from('players').select('*').eq('seller_code', code);
    if (error) return res.status(500).json({ error: error.message });

    const playerIds = players?.map(p => p.id) || [];
    let totalCommissions = 0;
    let totalCardsSold = 0;
    let totalRevenue = 0;
    const playersWithCardCount: any[] = [];
    const salesByGameMap = new Map<number, { game_id: number; game_name: string; cards_sold: number; revenue: number; commissions: number }>();

    if (playerIds.length > 0) {
      // Fetch all cards for these players to calculate total commissions and sales stats
      const { data: cards } = await supabase.from('cards').select('game_id, player_id').in('player_id', playerIds);
      totalCardsSold = cards?.length || 0;

      // Map player IDs to card counts for the UI
      const cardCountsPerPlayer = new Map<number, number>();
      const playerRevenueMap = new Map<number, number>();
      cards?.forEach(c => {
        cardCountsPerPlayer.set(c.player_id, (cardCountsPerPlayer.get(c.player_id) || 0) + 1);
      });

      // Calculate commissions and revenues based on games
      const { data: games } = await supabase.from('game').select('id, name, card_value');
      const gameValueMap = new Map<number, number>();
      const gameNameMap = new Map<number, string>();
      games?.forEach(g => {
        gameValueMap.set(g.id, g.card_value || 0);
        gameNameMap.set(g.id, g.name || `Bingo #${g.id}`);
      });

      // Identify the first game for each player to apply the configured commission
      // Subsequent games will use a fixed 5% commission
      const playerFirstGameMap = new Map<number, number>();
      cards?.forEach(c => {
        const currentFirst = playerFirstGameMap.get(c.player_id);
        if (currentFirst === undefined || c.game_id < currentFirst) {
          playerFirstGameMap.set(c.player_id, c.game_id);
        }
      });

      cards?.forEach(c => {
        const val = gameValueMap.get(c.game_id) || 0;
        const gameName = gameNameMap.get(c.game_id) || `Bingo #${c.game_id}`;
        const isFirstGame = playerFirstGameMap.get(c.player_id) === c.game_id;
        const commissionPercent = isFirstGame ? (seller.commission_percentage || 0) : 5;
        const commissionEarned = val * (commissionPercent / 100);

        totalCommissions += commissionEarned;
        totalRevenue += val;

        playerRevenueMap.set(c.player_id, (playerRevenueMap.get(c.player_id) || 0) + val);

        const existingGameStat = salesByGameMap.get(c.game_id) || {
          game_id: c.game_id,
          game_name: gameName,
          cards_sold: 0,
          revenue: 0,
          commissions: 0
        };
        existingGameStat.cards_sold += 1;
        existingGameStat.revenue += val;
        existingGameStat.commissions += commissionEarned;
        salesByGameMap.set(c.game_id, existingGameStat);
      });

      // Assemble final player list with counts and revenue
      players?.forEach(p => {
        playersWithCardCount.push({
          ...p,
          card_count: cardCountsPerPlayer.get(p.id) || 0,
          total_revenue: playerRevenueMap.get(p.id) || 0
        });
      });
    }

    const salesByGame = Array.from(salesByGameMap.values()).sort((a, b) => b.game_id - a.game_id);
    const salesByPlayer = [...playersWithCardCount]
      .filter(p => p.card_count > 0)
      .sort((a, b) => b.card_count - a.card_count)
      .slice(0, 10);

    res.json({
      success: true,
      players: playersWithCardCount.length > 0 ? playersWithCardCount : (players || []),
      totalCommissions,
      totalCardsSold,
      totalRevenue,
      salesByGame,
      salesByPlayer,
      seller
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players/login', async (req, res) => {
  try {
    const { phone: rawPhone, password, access_code, room_slug, tenant_id } = req.body;
    const phone = normalizePhone(rawPhone);

    if (!phone) return res.status(400).json({ error: 'Teléfono requerido' });
    if (!password) return res.status(400).json({ error: 'Contraseña requerida' });
    if (!access_code || !access_code.trim()) {
      return res.status(400).json({ error: 'El código de seguridad de la sala es obligatorio' });
    }

    const inputCode = access_code.trim().toUpperCase();

    // 1. Identificar la sala (tenant)
    let targetTenantId = (room_slug || tenant_id || (req as any).tenantId || '').toLowerCase();
    let tenantInfo: any = null;

    if (targetTenantId && targetTenantId !== 'default') {
      tenantInfo = await getTenantInfo(targetTenantId);
    } else {
      // Si no se proporcionó sala explícita (e.g. desde la página principal),
      // buscar qué sala tiene este access_code
      for (const [key, val] of tenantsCache.entries()) {
        if ((val.tenant.access_code || '').toUpperCase() === inputCode) {
          tenantInfo = val.tenant;
          targetTenantId = val.tenant.slug || val.tenant.id;
          break;
        }
      }

      if (!tenantInfo) {
        try {
          const { data: foundTenant } = await supabase
            .from('tenants')
            .select('*')
            .ilike('access_code', inputCode)
            .maybeSingle();
          if (foundTenant) {
            tenantInfo = foundTenant;
            targetTenantId = foundTenant.slug || foundTenant.id;
          }
        } catch (e) {}
      }

      // Si aún no se encuentra, verificar si es el código de la sala oficial
      if (!tenantInfo && inputCode === 'LITE777') {
        tenantInfo = await getTenantInfo('bingo-lite');
        targetTenantId = 'bingo-lite';
      }
    }

    if (!tenantInfo) {
      return res.status(401).json({
        error: 'Código de seguridad no válido. No se encontró ninguna sala activa con este código.'
      });
    }

    // 2. Validar el código de seguridad de la sala
    const roomValidCode = (tenantInfo.access_code || 'BINGO2026').toUpperCase();
    if (inputCode !== roomValidCode) {
      return res.status(401).json({
        error: `El código de seguridad "${inputCode}" es incorrecto para la sala ${tenantInfo.name || targetTenantId}. Solicita el código correcto al organizador.`
      });
    }

    // Modo mantenimiento
    const globalSettings = await getGameSettings('global');
    if (globalSettings.maintenance_mode) {
      const allowedPhones: string[] = (globalSettings.maintenance_allowed_phones || ['3145261451']).map((p: string) => normalizePhone(p));
      if (!allowedPhones.includes(phone)) {
        return res.status(503).json({
          error: 'La aplicación se encuentra en mantenimiento y actualizaciones.',
          maintenance: true
        });
      }
    }

    // 3. Buscar al jugador ESTRICTAMENTE dentro de esta sala (tenant_id)
    let playerQuery = supabase
      .from('players')
      .select('*')
      .eq('phone', phone);

    if (targetTenantId && targetTenantId !== 'default' && targetTenantId !== 'bingo-lite') {
      playerQuery = playerQuery.eq('tenant_id', targetTenantId);
    } else {
      playerQuery = playerQuery.or('tenant_id.eq.default,tenant_id.eq.bingo-lite,tenant_id.is.null');
    }

    let { data: player, error: fetchError } = await playerQuery.maybeSingle();

    if (fetchError) {
      // Si la columna tenant_id aún no existe en Supabase (error 42703), buscar por teléfono
      if (fetchError.code === '42703') {
        const fallbackRes = await supabase.from('players').select('*').eq('phone', phone).maybeSingle();
        player = fallbackRes.data;
      } else {
        throw fetchError;
      }
    }

    if (!player) {
      return res.status(404).json({
        error: `No estás registrado en la sala "${tenantInfo.name || targetTenantId}". Cada sala es privada e independiente. Por favor regístrate en esta sala para poder ingresar.`,
        notRegisteredInRoom: true,
        roomSlug: tenantInfo.slug || targetTenantId
      });
    }

    if (player.is_blocked) {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada en esta sala. Contacta al organizador.' });
    }

    // 4. Validar contraseña
    if (player.password && player.password.trim() !== '') {
      const isMatch = verifyPassword(password, player.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Contraseña incorrecta. Por favor verifícala.' });
      }

      // Auto-migración a PBKDF2 si estaba en texto plano
      if (!player.password.startsWith('pbkdf2$')) {
        const secureHash = hashPassword(password);
        try {
          await supabase.from('players').update({ password: secureHash }).eq('id', player.id);
        } catch {}
      }
    } else {
      // Si el jugador no tenía contraseña asignada, establecer la ingresada
      const secureHash = hashPassword(password);
      try {
        await supabase.from('players').update({ password: secureHash }).eq('id', player.id);
      } catch {}
    }

    // Generar token firmado de sesión de jugador
    const playerToken = createPlayerToken({
      uid: player.id,
      phone: player.phone,
      role: 'player',
      tenant_id: targetTenantId
    });

    // Sanitización
    delete player.password;
    player.tenant_id = targetTenantId;
    player.room_slug = tenantInfo.slug || targetTenantId;
    player.token = playerToken;

    res.json(player);
  } catch (err: any) {
    console.error('Error en login de jugador:', err);
    res.status(500).json({ error: 'No se pudo conectar a la base de datos.' });
  }
});

// Endpoint to set/change player password
app.post('/api/players/change-password', async (req, res) => {
  try {
    const { phone: rawPhone, oldPassword, newPassword } = req.body;
    const phone = normalizePhone(rawPhone);

    if (!phone) return res.status(400).json({ error: 'Teléfono requerido' });
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
    }

    // Require authentication: players must present their own token to change their password
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Autenticación requerida para cambiar la contraseña.' });
    }
    if (authUser.role === 'player') {
      const authPhone = normalizePhone(authUser.phone || '');
      if (authPhone && phone && authPhone !== phone) {
        return res.status(403).json({ error: 'Acceso denegado: Solo puedes cambiar tu propia contraseña.' });
      }
    }

    const { data: player, error: fetchError } = await supabase
      .from('players')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (fetchError || !player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    // If they already have a password, we must verify the old password
    if (player.password && player.password.trim() !== '') {
      const isOldMatch = verifyPassword(oldPassword || '', player.password);
      if (!isOldMatch) {
        return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      }
    }

    // Hasheo seguro con PBKDF2
    const secureHash = hashPassword(newPassword);

    // Update password in players table
    const { error: updateError } = await supabase
      .from('players')
      .update({ password: secureHash })
      .eq('phone', phone);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Contraseña actualizada con éxito y cifrada de forma segura.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/games', async (req, res) => {
  const targetTenant = ((req.query.tenantId as string) || (req as any).tenantId || '').toLowerCase();
  const now = Date.now();
  if (!targetTenant && cachedGamesList && (now - lastGamesListFetchTime < GAMES_LIST_CACHE_TTL)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json(cachedGamesList);
  }

  console.log(`--- FETCHING GAMES (Tenant: ${targetTenant || 'all'}) ---`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    let gamesQuery = supabase
      .from('game')
      .select(`
        *,
        game_patterns (
          id, prize, winner_player_id, won_at,
          patterns (id, name, grid)
        )
      `)
      .order('id', { ascending: false });

    if (targetTenant && targetTenant !== 'global' && targetTenant !== 'default') {
      gamesQuery = gamesQuery.eq('tenant_id', targetTenant);
    }

    const { data, error } = await gamesQuery;

    if (error) {
      // ignored
      return res.json([]);
    }

    if (!data) {
      console.log('No games found in the game table.');
      return res.json([]);
    }

    console.log(`Found ${data.length} games. Starting settings mapping...`);

    const formattedGames = await Promise.all(data.map(async (game) => {
      try {
        const settings = await getGameSettings(game.id);
        const rematchIds = settings.rematch_game_pattern_ids || [];

        return {
          ...game,
          final_note: settings.final_note,
          is_free: settings.is_free === true || settings.type === 'free',
          type: settings.type || 'paid',
          prize_type: settings.prize_type || 'wallet',
          active_lottery: settings.active_lottery === true,
          active_draw: settings.active_draw === true,
          ai_knowledge_base: settings.ai_knowledge_base,
          ai_model: settings.ai_model || 'gemini-3.8-flash',
          ai_animator_enabled: settings.ai_animator_enabled !== false,
          ai_chat_enabled: settings.ai_chat_enabled !== false,
          patterns: (game.game_patterns || []).map((gp: any) => ({
            id: gp.id,
            game_pattern_id: gp.id,
            name: gp.patterns?.name || 'Patrón sin nombre',
            prize: gp.prize,
            winner_player_id: gp.winner_player_id,
            won_at: gp.won_at,
            is_rematch: rematchIds.includes(gp.id)
          }))
        };
      } catch (innerErr) {
        console.warn(`Notice mapping game ${game.id}:`, innerErr);
        return { ...game, patterns: [] };
      }
    }));

    console.log(`Successfully formatted ${formattedGames.length} games.`);
    cachedGamesList = formattedGames;
    lastGamesListFetchTime = Date.now();
    res.json(formattedGames);
  } catch (err: any) {
    // ignored
    res.json([]);
  }
});

// ==========================================
// MÓDULO DE GANADORES Y METAS EN JUEGOS GRATIS ($300.000 COP)
// ==========================================

// Helper unificado para determinar si un juego es gratis
function isGameFree(g: any, settings?: any): boolean {
  if (!g && !settings) return false;
  if (g?.is_free === true || settings?.is_free === true) return true;
  if (g?.type === 'free' || settings?.type === 'free') return true;
  const rawVal = g?.card_value ?? settings?.card_value;
  if (rawVal === 0 || rawVal === '0' || rawVal === '$0' || rawVal === '0.00') return true;
  const numVal = parseInt(String(rawVal || '').replace(/[^0-9]/g, ''), 10);
  if (!isNaN(numVal) && numVal === 0) return true;
  return false;
}

// Persistir permanentemente un premio de juego gratis en Supabase (free_game_prizes) y globalSettings
async function persistFreeGamePrize(prize: {
  playerId: number;
  playerPhone?: string | null;
  playerName?: string | null;
  gameId?: number | null;
  gameName?: string | null;
  patternId?: number | null;
  patternName?: string | null;
  prizeAmount: number;
  prizeFormatted?: string;
  notes?: string;
  source?: 'automatic' | 'manual';
  wonAt?: string;
}) {
  const wonIso = prize.wonAt || new Date().toISOString();
  const numAmt = Number(prize.prizeAmount) || 0;
  const formattedStr = prize.prizeFormatted || `$${numAmt.toLocaleString('es-CO')}`;

  let phone = prize.playerPhone;
  let name = prize.playerName;
  if (!phone || !name) {
    try {
      const { data: p } = await supabase.from('players').select('id, name, phone').eq('id', prize.playerId).maybeSingle();
      if (p) {
        if (!phone) phone = p.phone;
        if (!name) name = p.name;
      }
    } catch (e) { }
  }

  // 1. Guardar en tabla permanente free_game_prizes
  try {
    if (prize.gameId && prize.patternId) {
      const { data: existing } = await supabase.from('free_game_prizes')
        .select('id')
        .eq('game_id', prize.gameId)
        .eq('pattern_id', prize.patternId)
        .eq('player_id', prize.playerId)
        .maybeSingle();

      if (existing) {
        await supabase.from('free_game_prizes').update({
          game_name: prize.gameName || 'Juego Gratuito',
          pattern_name: prize.patternName || 'Figura Ganadora',
          prize_amount: numAmt,
          prize_formatted: formattedStr,
          player_phone: phone || null
        }).eq('id', existing.id);
      } else {
        await supabase.from('free_game_prizes').insert({
          player_id: prize.playerId,
          player_phone: phone || null,
          game_id: prize.gameId || null,
          game_name: prize.gameName || 'Juego Gratuito',
          pattern_id: prize.patternId || null,
          pattern_name: prize.patternName || 'Figura Ganadora',
          prize_amount: numAmt,
          prize_formatted: formattedStr,
          notes: prize.notes || 'Ganador en juego gratis',
          source: prize.source || 'automatic',
          won_at: wonIso
        });
      }
    } else {
      await supabase.from('free_game_prizes').insert({
        player_id: prize.playerId,
        player_phone: phone || null,
        game_id: prize.gameId || null,
        game_name: prize.gameName || 'Juego Gratuito',
        pattern_id: prize.patternId || null,
        pattern_name: prize.patternName || 'Figura Ganadora',
        prize_amount: numAmt,
        prize_formatted: formattedStr,
        notes: prize.notes || 'Ganador en juego gratis',
        source: prize.source || 'automatic',
        won_at: wonIso
      });
    }
  } catch (e) {
    console.error('[FreeGamePrizes] Error inserting/updating free_game_prizes:', e);
  }

  // 2. Respaldo duradero e inmune a borrados en globalSettings
  try {
    const globalSettings = await getGameSettings('global');
    const existingPrizes = Array.isArray(globalSettings.custom_free_game_prizes) ? globalSettings.custom_free_game_prizes : [];
    const autoId = `auto_${prize.gameId || 'g'}_${prize.patternId || 'p'}_${prize.playerId}`;
    const idx = existingPrizes.findIndex((item: any) => String(item.id) === autoId);
    const entry = {
      id: autoId,
      player_id: prize.playerId,
      player_phone: phone || null,
      player_name: name || `Jugador #${prize.playerId}`,
      game_id: prize.gameId || null,
      game_name: prize.gameName || 'Juego Gratuito',
      pattern_id: prize.patternId || null,
      pattern_name: prize.patternName || 'Figura Ganadora',
      amount: numAmt,
      prize_str: formattedStr,
      notes: prize.notes || 'Ganador en juego gratis',
      source: prize.source || 'automatic',
      won_at: wonIso
    };
    if (idx >= 0) {
      existingPrizes[idx] = entry;
    } else {
      existingPrizes.push(entry);
    }
    await saveGameSettings('global', { custom_free_game_prizes: existingPrizes });
  } catch (e) {
    console.error('[FreeGamePrizes] Error guardando respaldo en globalSettings:', e);
  }
}

// Registrar participación en juego pago en la base de datos
async function recordPaidGameParticipation(playerId: number, gameId: number) {
  try {
    const { data: g } = await supabase.from('game').select('id, card_value, is_free').eq('id', gameId).maybeSingle();
    const gSettings = await getGameSettings(gameId);
    if (g && isGameFree(g, gSettings)) {
      return; // Solo cuentan los juegos pagos
    }

    // 1. Intentar insertar en la tabla dedicada player_paid_game_participations
    try {
      await supabase.from('player_paid_game_participations').upsert({
        player_id: playerId,
        game_id: gameId,
        participated_at: new Date().toISOString()
      }, { onConflict: 'player_id,game_id' });
    } catch (e) { }

    // 2. Persistir en la configuración global para respaldo duradero e inmune a cascada de borrado
    const globalSettings = await getGameSettings('global');
    const existing = globalSettings.paid_game_participations || {};
    const playerKey = String(playerId);
    const gamesSet = new Set<number>((existing[playerKey] || []).map(Number));
    gamesSet.add(Number(gameId));
    existing[playerKey] = Array.from(gamesSet);

    await saveGameSettings('global', { paid_game_participations: existing });
    console.log(`[PaidGamesCounter] Participación de jugador ${playerId} en juego pago ${gameId} registrada. Total juegos pagos: ${gamesSet.size}`);
  } catch (err) {
    console.error('[PaidGamesCounter] Error al registrar participación en juego pago:', err);
  }
}

app.get('/api/free-games/leaderboard', async (req, res) => {
  try {
    // 1. Obtener juegos activos para detectar cuáles son gratis y pagos
    const { data: gamesData } = await supabase
      .from('game')
      .select('id, name, is_free, card_value, created_at, status');

    const freeGameIds = new Set<number>();
    const paidGameIds = new Set<number>();
    const gamesDict = new Map<number, any>();

    if (gamesData) {
      for (const g of gamesData) {
        gamesDict.set(Number(g.id), g);
        const settings = await getGameSettings(Number(g.id));
        if (isGameFree(g, settings)) {
          freeGameIds.add(Number(g.id));
        } else {
          paidGameIds.add(Number(g.id));
        }
      }
    }

    const freeGameIdList = Array.from(freeGameIds);

    // 2. Obtener patrones ganadores de juegos gratis activos en la tabla game_patterns
    let freeWinningPatterns: any[] = [];
    if (freeGameIdList.length > 0) {
      const { data: wpData } = await supabase
        .from('game_patterns')
        .select('id, game_id, pattern_id, winner_player_id, prize, won_at')
        .in('game_id', freeGameIdList)
        .not('winner_player_id', 'is', null)
        .order('won_at', { ascending: false });

      if (wpData) {
        freeWinningPatterns = wpData;
      }
    }

    // 3. Obtener premios históricos de la tabla persistente free_game_prizes
    const dbFreePrizesList: any[] = [];
    try {
      const { data: dbFreePrizes } = await supabase.from('free_game_prizes').select('*');
      if (dbFreePrizes && Array.isArray(dbFreePrizes)) {
        dbFreePrizesList.push(...dbFreePrizes);
      }
    } catch (e) { }

    // 4. Obtener premios de respaldo en globalSettings
    const globalSettings = await getGameSettings('global');
    const customPrizes: any[] = Array.isArray(globalSettings.custom_free_game_prizes)
      ? [...globalSettings.custom_free_game_prizes]
      : [];

    // Recolectar todos los IDs de jugadores y patrones para buscar sus nombres
    const playerIds = new Set<number>();
    const patternIds = new Set<number>();

    dbFreePrizesList.forEach((p: any) => {
      if (p.player_id) playerIds.add(Number(p.player_id));
      if (p.pattern_id) patternIds.add(Number(p.pattern_id));
    });

    freeWinningPatterns.forEach(item => {
      if (item.winner_player_id) playerIds.add(Number(item.winner_player_id));
      if (item.pattern_id) patternIds.add(Number(item.pattern_id));
    });

    customPrizes.forEach(cp => {
      if (cp.player_id) playerIds.add(Number(cp.player_id));
      if (cp.pattern_id) patternIds.add(Number(cp.pattern_id));
    });

    // 5. Cargar información de jugadores y patrones
    const playersMap = new Map<number, any>();
    if (playerIds.size > 0) {
      const { data: pData } = await supabase
        .from('players')
        .select('id, name, phone, email')
        .in('id', Array.from(playerIds));
      if (pData) {
        pData.forEach(p => playersMap.set(Number(p.id), p));
      }
    }

    const patternsMap = new Map<number, any>();
    if (patternIds.size > 0) {
      const { data: ptData } = await supabase
        .from('patterns')
        .select('id, name')
        .in('id', Array.from(patternIds));
      if (ptData) {
        ptData.forEach(pt => patternsMap.set(Number(pt.id), pt));
      }
    }

    // 6. Contador de juegos pagos: Consultar cards, player_paid_game_participations y globalSettings
    const paidGamesPlayedMap = new Map<number, Set<number>>();

    // 6a. De la tabla cards para juegos activos
    const { data: allCardsData } = await supabase
      .from('cards')
      .select('player_id, game_id');

    if (allCardsData) {
      allCardsData.forEach(c => {
        const pid = Number(c.player_id);
        const gid = Number(c.game_id);
        if (pid && gid && paidGameIds.has(gid)) {
          if (!paidGamesPlayedMap.has(pid)) {
            paidGamesPlayedMap.set(pid, new Set());
          }
          paidGamesPlayedMap.get(pid)!.add(gid);
        }
      });
    }

    // 6b. De la tabla player_paid_game_participations
    try {
      const { data: dbParts } = await supabase.from('player_paid_game_participations').select('player_id, game_id');
      if (dbParts && Array.isArray(dbParts)) {
        dbParts.forEach((dp: any) => {
          const pid = Number(dp.player_id);
          const gid = Number(dp.game_id);
          if (pid && gid) {
            if (!paidGamesPlayedMap.has(pid)) {
              paidGamesPlayedMap.set(pid, new Set());
            }
            paidGamesPlayedMap.get(pid)!.add(gid);
          }
        });
      }
    } catch (e) { }

    // 6c. Del respaldo globalSettings.paid_game_participations (inmune a borrado de juegos)
    const recordedParticipations = globalSettings.paid_game_participations || {};
    for (const [pKey, gList] of Object.entries(recordedParticipations)) {
      const pid = Number(pKey);
      if (pid && Array.isArray(gList)) {
        if (!paidGamesPlayedMap.has(pid)) {
          paidGamesPlayedMap.set(pid, new Set());
        }
        gList.forEach((gid: any) => paidGamesPlayedMap.get(pid)!.add(Number(gid)));
      }
    }

    // 7. Consolidación y deduplicación inteligente de premios
    interface PlayerFreeStats {
      player_id: number;
      player_name: string;
      player_phone: string;
      total_won: number;
      prizes_count: number;
      prizes: any[];
      latest_win_at: string | null;
    }

    const playerStatsMap = new Map<number, PlayerFreeStats>();

    const getOrCreatePlayerStats = (playerId: number, fallbackPhone?: string): PlayerFreeStats => {
      if (!playerStatsMap.has(playerId)) {
        const pInfo = playersMap.get(playerId);
        playerStatsMap.set(playerId, {
          player_id: playerId,
          player_name: pInfo?.name || `Jugador #${playerId}`,
          player_phone: pInfo?.phone || fallbackPhone || '',
          total_won: 0,
          prizes_count: 0,
          prizes: [],
          latest_win_at: null
        });
      }
      return playerStatsMap.get(playerId)!;
    };

    const seenPrizeKeys = new Set<string>();

    // 7a. Procesar primero los registros de la tabla permanente free_game_prizes
    dbFreePrizesList.forEach((p: any) => {
      const pid = Number(p.player_id);
      if (!pid) return;

      const dedupeKey = p.game_id && p.pattern_id
        ? `game_${p.game_id}_pat_${p.pattern_id}_p_${pid}`
        : `db_prize_${p.id}`;

      if (seenPrizeKeys.has(dedupeKey)) return;
      seenPrizeKeys.add(dedupeKey);

      const prizeNum = Number(p.prize_amount) || 0;
      const signatureKey = `sig_${pid}_${p.game_name || ''}_${p.pattern_name || ''}_${prizeNum}`;
      seenPrizeKeys.add(signatureKey);

      const stats = getOrCreatePlayerStats(pid, p.player_phone);
      const wonAtDate = p.won_at ? new Date(p.won_at) : new Date();

      const prizeEntry = {
        id: `db_${p.id}`,
        game_id: p.game_id || null,
        game_name: p.game_name || 'Bingo Gratis Especial',
        pattern_name: p.pattern_name || 'Figura Ganadora',
        prize_str: p.prize_formatted || `$${prizeNum.toLocaleString('es-CO')}`,
        amount: prizeNum,
        won_at: p.won_at || new Date().toISOString(),
        formatted_date: wonAtDate.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' }),
        formatted_time: wonAtDate.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        notes: p.notes || '',
        source: p.source || 'automatic'
      };

      stats.total_won += prizeNum;
      stats.prizes_count += 1;
      stats.prizes.push(prizeEntry);

      if (!stats.latest_win_at || new Date(p.won_at).getTime() > new Date(stats.latest_win_at).getTime()) {
        stats.latest_win_at = p.won_at;
      }
    });

    // 7b. Procesar patrones ganadores de juegos en vivo (si aún no estaban en free_game_prizes)
    freeWinningPatterns.forEach(item => {
      const pid = Number(item.winner_player_id);
      if (!pid) return;

      const dedupeKey = `game_${item.game_id}_pat_${item.pattern_id}_p_${pid}`;
      if (seenPrizeKeys.has(dedupeKey)) return;
      seenPrizeKeys.add(dedupeKey);

      const prizeNum = parseInt(String(item.prize || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const gameObj = gamesDict.get(Number(item.game_id));
      const patternObj = patternsMap.get(Number(item.pattern_id));
      const gName = gameObj?.name || `Bingo Gratis #${item.game_id}`;
      const patName = patternObj?.name || 'Figura Ganadora';

      const signatureKey = `sig_${pid}_${gName}_${patName}_${prizeNum}`;
      if (seenPrizeKeys.has(signatureKey)) return;
      seenPrizeKeys.add(signatureKey);

      const stats = getOrCreatePlayerStats(pid);
      const wonAtDate = item.won_at ? new Date(item.won_at) : new Date();
      const prizeEntry = {
        id: `gp_${item.id}`,
        game_id: item.game_id,
        game_name: gName,
        pattern_name: patName,
        prize_str: item.prize || `$${prizeNum.toLocaleString('es-CO')}`,
        amount: prizeNum,
        won_at: item.won_at || new Date().toISOString(),
        formatted_date: wonAtDate.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' }),
        formatted_time: wonAtDate.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        source: 'automatic'
      };

      stats.total_won += prizeNum;
      stats.prizes_count += 1;
      stats.prizes.push(prizeEntry);

      if (!stats.latest_win_at || new Date(item.won_at).getTime() > new Date(stats.latest_win_at).getTime()) {
        stats.latest_win_at = item.won_at;
      }

      // Auto-sincronizar de forma preventiva a free_game_prizes
      persistFreeGamePrize({
        playerId: pid,
        gameId: item.game_id,
        gameName: prizeEntry.game_name,
        patternId: item.pattern_id,
        patternName: prizeEntry.pattern_name,
        prizeAmount: prizeNum,
        prizeFormatted: prizeEntry.prize_str,
        wonAt: item.won_at
      }).catch(() => { });
    });

    // 7c. Procesar premios de respaldo en globalSettings
    customPrizes.forEach(cp => {
      const pid = Number(cp.player_id);
      if (!pid) return;

      const dedupeKey = cp.game_id && cp.pattern_id
        ? `game_${cp.game_id}_pat_${cp.pattern_id}_p_${pid}`
        : String(cp.id || `cp_${pid}_${cp.won_at}_${cp.amount}`);

      if (seenPrizeKeys.has(dedupeKey)) return;
      seenPrizeKeys.add(dedupeKey);

      const prizeNum = Number(cp.amount) || 0;
      const signatureKey = `sig_${pid}_${cp.game_name || ''}_${cp.pattern_name || ''}_${prizeNum}`;
      if (seenPrizeKeys.has(signatureKey)) return;
      seenPrizeKeys.add(signatureKey);

      const stats = getOrCreatePlayerStats(pid, cp.player_phone);
      const wonAtDate = cp.won_at ? new Date(cp.won_at) : new Date();

      const prizeEntry = {
        id: cp.id || `cp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        game_id: cp.game_id || null,
        game_name: cp.game_name || 'Juego Gratuito Especial',
        pattern_name: cp.pattern_name || 'Premio Adicional',
        prize_str: cp.prize_str || `$${prizeNum.toLocaleString('es-CO')}`,
        amount: prizeNum,
        won_at: cp.won_at || new Date().toISOString(),
        formatted_date: wonAtDate.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' }),
        formatted_time: wonAtDate.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        notes: cp.notes || '',
        source: cp.source || 'manual'
      };

      stats.total_won += prizeNum;
      stats.prizes_count += 1;
      stats.prizes.push(prizeEntry);

      if (!stats.latest_win_at || new Date(cp.won_at).getTime() > new Date(stats.latest_win_at).getTime()) {
        stats.latest_win_at = cp.won_at;
      }
    });

    // Ordenar premios de cada jugador del más reciente al más antiguo
    for (const stats of playerStatsMap.values()) {
      stats.prizes.sort((a, b) => new Date(b.won_at).getTime() - new Date(a.won_at).getTime());
    }

    const GOAL_TARGET = 300000;
    const REQUIRED_PAID_GAMES = 30;

    // 8. Ordenar todos los jugadores por total_won descendente (mayor a menor)
    const ranking = Array.from(playerStatsMap.values())
      .sort((a, b) => {
        if (b.total_won !== a.total_won) {
          return b.total_won - a.total_won;
        }
        return (new Date(a.latest_win_at || 0).getTime()) - (new Date(b.latest_win_at || 0).getTime());
      })
      .map((item, index) => {
        const progress = Math.min(100, Math.round((item.total_won / GOAL_TARGET) * 100));
        const remaining = Math.max(0, GOAL_TARGET - item.total_won);
        const reachedGoal = item.total_won >= GOAL_TARGET;

        // Paid Games Counter & Progress for the 30 games rule
        const paidGamesSet = paidGamesPlayedMap.get(item.player_id) || new Set();
        const paidGamesCount = paidGamesSet.size;
        const paidGamesProgress = Math.min(100, Math.round((paidGamesCount / REQUIRED_PAID_GAMES) * 100));
        const paidGamesRemaining = Math.max(0, REQUIRED_PAID_GAMES - paidGamesCount);
        const isEligible = paidGamesCount >= REQUIRED_PAID_GAMES;

        return {
          rank: index + 1,
          ...item,
          goal_amount: GOAL_TARGET,
          progress_percent: progress,
          remaining_amount: remaining,
          reached_goal: reachedGoal,
          paid_games_count: paidGamesCount,
          paid_games_required: REQUIRED_PAID_GAMES,
          paid_games_progress: paidGamesProgress,
          paid_games_remaining: paidGamesRemaining,
          is_eligible: isEligible
        };
      });

    const hasGoalWinner = ranking.length > 0 && ranking[0].total_won >= GOAL_TARGET;
    const topThree = ranking.slice(0, 3);
    const totalDistributed = ranking.reduce((acc, curr) => acc + curr.total_won, 0);

    res.json({
      success: true,
      goal_amount: GOAL_TARGET,
      goal_amount_formatted: '$300.000 COP',
      required_paid_games: REQUIRED_PAID_GAMES,
      fundamental_rule: 'Al completarse el primer premio de los $300.000 pesos por parte del primer ganador, se pagarán dos premios más a los que anteceden en el podio (2° y 3° puesto en el ranking). En total son 3 grandes premios. CONDICIÓN OBLIGATORIA: Los participantes deben ser jugadores activos de los Bingos Pagos y haber jugado por lo menos 30 juegos pagos para calificar y recibir los premios.',
      has_goal_winner: hasGoalWinner,
      goal_winner: hasGoalWinner ? ranking[0] : null,
      second_place_winner: hasGoalWinner && ranking[1] ? ranking[1] : null,
      third_place_winner: hasGoalWinner && ranking[2] ? ranking[2] : null,
      top_three: topThree,
      ranking,
      total_players_winning: ranking.length,
      total_distributed: totalDistributed,
      free_games_count: freeGameIdList.length,
      paid_games_count_total: paidGameIds.size
    });
  } catch (err: any) {
    console.error('Error in /api/free-games/leaderboard:', err);
    res.status(500).json({ error: err.message || 'Error al obtener tabla de ganadores de juegos gratis' });
  }
});

// Endpoint para que el Administrador pueda ajustar o acreditar juegos pagos a un jugador
app.post('/api/admin/free-games/adjust-paid-games', async (req, res) => {
  try {
    const { player_id, phone, count } = req.body;
    let resolvedPlayerId = player_id ? Number(player_id) : null;
    if (!resolvedPlayerId && phone) {
      const cleanPhone = String(phone).replace(/[^0-9]/g, '');
      const { data: p } = await supabase.from('players').select('id').eq('phone', cleanPhone).maybeSingle();
      if (p) resolvedPlayerId = p.id;
    }
    if (!resolvedPlayerId) return res.status(404).json({ error: 'Jugador no encontrado' });

    const targetCount = Math.max(0, parseInt(String(count || '0'), 10));
    const globalSettings = await getGameSettings('global');
    const existing = globalSettings.paid_game_participations || {};
    const playerKey = String(resolvedPlayerId);

    const list: number[] = [];
    for (let i = 1; i <= targetCount; i++) {
      list.push(i);
    }
    existing[playerKey] = list;

    await saveGameSettings('global', { paid_game_participations: existing });
    res.json({ success: true, player_id: resolvedPlayerId, paid_games_count: targetCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar premio manual en juegos gratis (Administrador)
app.post('/api/admin/free-games/record-prize', async (req, res) => {
  try {
    const { player_id, phone, amount, game_name, pattern_name, notes, won_at } = req.body;
    const numAmount = parseInt(String(amount || '0').replace(/[^0-9]/g, ''), 10);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Monto de premio inválido' });
    }

    let resolvedPlayerId = player_id ? Number(player_id) : null;
    let resolvedPlayerPhone = phone ? String(phone).replace(/[^0-9]/g, '') : null;

    if (!resolvedPlayerId && resolvedPlayerPhone) {
      const { data: p } = await supabase.from('players').select('id, name, phone').eq('phone', resolvedPlayerPhone).maybeSingle();
      if (p) {
        resolvedPlayerId = p.id;
      }
    } else if (resolvedPlayerId && !resolvedPlayerPhone) {
      const { data: p } = await supabase.from('players').select('id, name, phone').eq('id', resolvedPlayerId).maybeSingle();
      if (p) {
        resolvedPlayerPhone = p.phone;
      }
    }

    if (!resolvedPlayerId) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    const newPrize = {
      id: `cp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      player_id: resolvedPlayerId,
      amount: numAmount,
      game_name: game_name || 'Juego Gratuito Especial',
      pattern_name: pattern_name || 'Premio de Juego Gratis',
      notes: notes || '',
      won_at: won_at || new Date().toISOString()
    };

    const globalSettings = await getGameSettings('global');
    const existingPrizes = Array.isArray(globalSettings.custom_free_game_prizes)
      ? globalSettings.custom_free_game_prizes
      : [];

    existingPrizes.push(newPrize);
    await saveGameSettings('global', { custom_free_game_prizes: existingPrizes });

    // Also try saving directly to free_game_prizes table if present
    try {
      await supabase.from('free_game_prizes').insert({
        player_id: resolvedPlayerId,
        player_phone: resolvedPlayerPhone,
        game_name: game_name || 'Juego Gratuito Especial',
        pattern_name: pattern_name || 'Premio de Juego Gratis',
        prize_amount: numAmount,
        prize_formatted: `$${numAmount.toLocaleString('es-CO')}`,
        notes: notes || '',
        source: 'manual',
        won_at: won_at || new Date().toISOString()
      });
    } catch (e) { }

    res.json({ success: true, prize: newPrize });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar premio manual en juegos gratis (Administrador)
app.delete('/api/admin/free-games/prize/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Si viene de la tabla free_game_prizes
    if (String(id).startsWith('db_')) {
      const realId = String(id).replace('db_', '');
      try {
        await supabase.from('free_game_prizes').delete().eq('id', realId);
      } catch (e) { }
    }

    const globalSettings = await getGameSettings('global');
    let existingPrizes = Array.isArray(globalSettings.custom_free_game_prizes)
      ? globalSettings.custom_free_game_prizes
      : [];

    existingPrizes = existingPrizes.filter((p: any) => String(p.id) !== String(id));
    await saveGameSettings('global', { custom_free_game_prizes: existingPrizes });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to build formatted game push notification content
function formatGameNotificationDetails(game: any, settings: any = {}, startTimeIso?: string) {
  const gameName = game?.name || game?.title || 'Bingo Lite';

  const isFree = (game?.is_free === true || game?.type === 'free' || settings?.type === 'free' || settings?.is_free === true) && !(game?.is_free === false || game?.type === 'paid');
  const typeText = isFree ? '🎁 Juego GRATIS' : '💰 Juego de PAGO';

  // Format Prize
  const rawPrize = game?.prize !== undefined && game?.prize !== null && game?.prize !== '' ? game.prize : (settings?.prize || 0);
  let formattedPrize = '';
  if (typeof rawPrize === 'number') {
    formattedPrize = rawPrize > 0 ? `$${rawPrize.toLocaleString('es-CO')} COP` : (isFree ? 'Gratis' : '$0 COP');
  } else if (rawPrize) {
    const num = parseInt(String(rawPrize).replace(/\D/g, '')) || 0;
    formattedPrize = num > 0 ? `$${num.toLocaleString('es-CO')} COP` : String(rawPrize);
  } else {
    formattedPrize = isFree ? 'Premios especiales' : '$0 COP';
  }

  // Format Card Value
  const rawCardVal = game?.card_value !== undefined && game?.card_value !== null && game?.card_value !== '' ? game.card_value : (settings?.card_value || 0);
  let formattedCardVal = '';
  if (isFree) {
    formattedCardVal = 'Gratis ($0)';
  } else if (typeof rawCardVal === 'number') {
    formattedCardVal = rawCardVal > 0 ? `$${rawCardVal.toLocaleString('es-CO')} COP` : 'Gratis ($0)';
  } else if (rawCardVal) {
    const num = parseInt(String(rawCardVal).replace(/\D/g, '')) || 0;
    formattedCardVal = num > 0 ? `$${num.toLocaleString('es-CO')} COP` : 'Gratis ($0)';
  } else {
    formattedCardVal = '$2.000 COP';
  }

  // Format Date & Time in Colombia Timezone (America/Bogota)
  const isoToUse = startTimeIso || game?.start_time;
  const targetDate = isoToUse ? new Date(isoToUse) : new Date();

  let formattedDateTime = 'Por definir';
  if (!isNaN(targetDate.getTime())) {
    try {
      const dateParts = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).formatToParts(targetDate);

      let weekday = '', day = '', month = '', hour = '', minute = '', dayPeriod = '';
      for (const p of dateParts) {
        if (p.type === 'weekday') weekday = p.value.charAt(0).toUpperCase() + p.value.slice(1);
        if (p.type === 'day') day = p.value;
        if (p.type === 'month') month = p.value.charAt(0).toUpperCase() + p.value.slice(1);
        if (p.type === 'hour') hour = p.value;
        if (p.type === 'minute') minute = p.value;
        if (p.type === 'dayPeriod') dayPeriod = p.value.toUpperCase();
      }

      if (weekday && day && month) {
        formattedDateTime = `${weekday}, ${day} de ${month} - ${hour}:${minute} ${dayPeriod}`;
      } else {
        formattedDateTime = targetDate.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      }
    } catch (e) {
      formattedDateTime = targetDate.toLocaleString('es-CO');
    }
  }

  const title = isFree ? `🎁 ¡Nuevo Juego GRATIS Programado!` : `🎱 ¡Nuevo Juego Programado!`;

  const message = [
    `🎮 Juego: ${gameName}`,
    `🏷️ Tipo: ${typeText}`,
    `🏆 Premio Total: ${formattedPrize}`,
    `🎟️ Valor Cartón: ${formattedCardVal}`,
    `📅 Fecha/Hora: ${formattedDateTime}`
  ].join('\n');

  return { title, message };
}

// Create Game
app.post('/api/games', requireAdmin, async (req, res) => {
  console.log('--- CREATING NEW GAME ---');
  try {
    const adminUser = (req as any).adminUser;
    const targetTenant = adminUser.isSuperAdmin
      ? (req.body.tenant_id || (req as any).tenantId || req.query.tenantId || 'default').toLowerCase()
      : (adminUser.tenant_id || 'default').toLowerCase();

    const {
      name, start_time, prize, card_value, patterns, rematchPatterns, type, prize_type,
      active_lottery, active_draw, lottery_name, lottery_date, lottery_time, lottery_digits,
      lottery_prize_type, lottery_prize_value
    } = req.body;
    console.log('Creation data:', { name, start_time, type, prize_type, active_lottery, active_draw, targetTenant });

    const newGame: any = {
      name, start_time, prize, card_value, status: 'scheduled', drawn_balls: []
    };
    if (targetTenant && targetTenant !== 'global') {
      newGame.tenant_id = targetTenant;
    }

    const { data: game, error } = await supabase.from('game').insert(newGame).select().single();

    if (error || !game) {

      return res.status(500).json({ error: error?.message });
    }

    console.log('Game basic record created with ID:', game.id);

    // Save game type, prize_type, and active_lottery/active_draw in settings
    await saveGameSettings(game.id, {
      type: type || 'paid',
      prize_type: prize_type || 'wallet',
      active_lottery: active_lottery === true,
      active_draw: active_draw === true,
      lottery_name: lottery_name || '',
      lottery_date: lottery_date || '',
      lottery_time: lottery_time || '',
      lottery_digits: lottery_digits || '3',
      lottery_prize_type: lottery_prize_type || 'cash',
      lottery_prize_value: lottery_prize_value || ''
    });

    if (patterns && patterns.length > 0) {
      console.log(`Adding ${patterns.length} patterns to game ${game.id}`);
      const gamePatterns = patterns.map((p: any) => ({
        game_id: game.id,
        pattern_id: p.pattern_id,
        prize: p.prize
      }));
      const { error: pErr } = await supabase.from('game_patterns').insert(gamePatterns);

    }

    let rematchGamePatternIds: number[] = [];
    if (rematchPatterns && rematchPatterns.length > 0) {
      console.log(`Adding ${rematchPatterns.length} rematch patterns to game ${game.id}`);
      const rematchGamePatterns = rematchPatterns.map((p: any) => ({
        game_id: game.id,
        pattern_id: p.pattern_id,
        prize: p.prize
      }));
      const { data: insertedRematch, error: rErr } = await supabase.from('game_patterns').insert(rematchGamePatterns).select();
      if (rErr) {

      } else if (insertedRematch) {
        rematchGamePatternIds = insertedRematch.map(r => r.id);
      }
    }

    if (rematchGamePatternIds.length > 0) {
      await saveGameSettings(game.id, { rematch_game_pattern_ids: rematchGamePatternIds });
    }

    console.log('Game creation process completed successfully.');

    // Notify all players about the new game
    try {
      const gameSettings = await getGameSettings(game.id);
      const { title: notifTitle, message: notifMessage } = formatGameNotificationDetails(
        { ...game, name, prize, card_value, is_free: type === 'free', type },
        gameSettings,
        start_time
      );

      await sendPushNotification({
        recipient: 'all',
        title: notifTitle,
        message: notifMessage,
        url: getAppUrl(req)
      });
    } catch (notifErr) {
      console.warn('Error sending formatted game creation push:', notifErr);
    }

    invalidateGameCaches();
    setTimeout(() => getChannel().publish('games_updated', {}), 500);
    res.json(game);
  } catch (err: any) {
    console.log('CRITICAL ERROR in POST /api/games:', err.message || err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Game
app.patch('/api/games/:id', requireAdmin, async (req, res) => {
  console.log('--- UPDATING GAME ---', req.params.id);
  try {
    const { id } = req.params;
    const { data: existingGame } = await supabase.from('game').select('*').eq('id', id).maybeSingle();
    if (!existingGame) return res.status(404).json({ error: 'Juego no encontrado' });

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const gTenant = (existingGame.tenant_id || 'default').toLowerCase();
      if (gTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ error: 'Acceso denegado: Este juego pertenece a otra sala.' });
      }
    }

    const { name, start_time, prize, card_value } = req.body;

    // Only update fields allowed to be updated without breaking existing sold cards
    const updateData: any = {};
    if (name) updateData.name = name;
    if (start_time) updateData.start_time = start_time;
    if (prize) updateData.prize = prize;
    if (card_value) updateData.card_value = card_value;

    const { data: updatedGame, error } = await supabase.from('game').update(updateData).eq('id', id).select().single();

    if (error) {

      return res.status(500).json({ error: error.message });
    }

    invalidateGameCaches();

    // Broadcast push notification for game updates
    if (updatedGame) {
      try {
        const fullGame = await getGameFullState(updatedGame.id);
        const gameSettings = await getGameSettings(updatedGame.id);
        const { title: notifTitle, message: notifMessage } = formatGameNotificationDetails(
          fullGame || updatedGame,
          gameSettings,
          updatedGame.start_time
        );

        sendPushNotification({
          recipient: 'all',
          title: `🎮 ¡Sorteo Actualizado: ${updatedGame.name || 'Bingo'}!`,
          message: notifMessage,
          url: getAppUrl(req)
        }).catch(e => console.warn('[Notification] Game edit push note error:', e));
      } catch (e) {
        console.warn('[Notification] Game edit push format error:', e);
      }
    }

    setTimeout(() => getChannel().publish('games_updated', {}), 500);
    res.json(updatedGame);
  } catch (err: any) {
    console.log('CRITICAL ERROR in PATCH /api/games/:id:', err.message || err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Game - Protege permanentemente el historial de ganadores y participaciones
app.delete('/api/games/:id', requireAdmin, async (req, res) => {
  const gameId = Number(req.params.id);
  try {
    // 1. Obtener los datos del juego antes de borrarlo
    const { data: gameToDelete } = await supabase.from('game').select('*').eq('id', gameId).maybeSingle();
    if (!gameToDelete) return res.status(404).json({ error: 'Juego no encontrado' });

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const gTenant = (gameToDelete.tenant_id || 'default').toLowerCase();
      if (gTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ error: 'Acceso denegado: Este juego pertenece a otra sala.' });
      }
    }
    const gameSettings = await getGameSettings(gameId);
    const wasFree = isGameFree(gameToDelete, gameSettings);

    // 2. Si es juego gratis o tiene patrones con ganador, respaldar en free_game_prizes y globalSettings
    const { data: gps } = await supabase.from('game_patterns')
      .select('id, pattern_id, winner_player_id, prize, won_at, patterns(name)')
      .eq('game_id', gameId)
      .not('winner_player_id', 'is', null);

    if (gps && gps.length > 0) {
      console.log(`[DeleteGame] Respaldando permanentemente ${gps.length} ganadores de juego #${gameId} antes de eliminar`);
      const playerIds = gps.map(g => Number(g.winner_player_id)).filter(Boolean);
      const { data: pList } = await supabase.from('players').select('id, name, phone').in('id', playerIds);
      const pMap = new Map((pList || []).map(p => [Number(p.id), p]));

      for (const gp of gps) {
        const pId = Number(gp.winner_player_id);
        const pInfo = pMap.get(pId);
        const prizeNum = parseInt(String(gp.prize || '0').replace(/[^0-9]/g, ''), 10) || 0;
        const patName = Array.isArray(gp.patterns) ? gp.patterns[0]?.name : (gp.patterns as any)?.name || 'Figura Ganadora';

        await persistFreeGamePrize({
          playerId: pId,
          playerPhone: pInfo?.phone,
          playerName: pInfo?.name,
          gameId: gameId,
          gameName: gameToDelete?.name || `Bingo Gratis #${gameId}`,
          patternId: gp.pattern_id || null,
          patternName: patName,
          prizeAmount: prizeNum,
          prizeFormatted: gp.prize || `$${prizeNum.toLocaleString('es-CO')}`,
          notes: `Histórico consolidado del juego #${gameId}`,
          source: 'automatic',
          wonAt: gp.won_at || new Date().toISOString()
        });
      }
    }

    // Asegurar que todos los registros en free_game_prizes con este game_id tengan el nombre del juego congelado
    try {
      await supabase.from('free_game_prizes')
        .update({
          game_name: gameToDelete?.name || `Bingo Gratis #${gameId}`
        })
        .eq('game_id', gameId);
    } catch (e) { }

    // 3. Si fue juego pago, asegurar que todos los participantes tengan su conteo preservado
    if (!wasFree) {
      const { data: cardsInGame } = await supabase.from('cards').select('player_id').eq('game_id', gameId);
      if (cardsInGame && cardsInGame.length > 0) {
        const uniquePids = Array.from(new Set(cardsInGame.map(c => Number(c.player_id)).filter(Boolean)));
        for (const pid of uniquePids) {
          await recordPaidGameParticipation(pid, gameId);
        }
      }
    }

    // 4. Proceder con el borrado seguro del juego
    const { error } = await supabase.from('game').delete().eq('id', gameId);
    if (error) return res.status(500).json({ error: error.message });

    invalidateGameCaches();
    setTimeout(() => getChannel().publish('games_updated', {}), 500);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error in DELETE /api/games/:id:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar juego' });
  }
});

// Activate Game
async function doActivateGame(gameId: number) {
  // End all currently active games
  const { data: previousGames } = await supabase.from('game')
    .select('id')
    .in('status', ['waiting', 'playing', 'paused']);

  if (previousGames && previousGames.length > 0) {
    const previousGameIds = previousGames.map((g: any) => g.id);
    await supabase.from('cards').delete().in('game_id', previousGameIds);

    // reset players because we are starting fresh or ending previous games
    await supabase.from('players').update({
      card_count: 0,
      status: 'pending'
    }).neq('phone', '0000000000');
  }

  await supabase.from('game')
    .update({ status: 'ended' })
    .in('status', ['waiting', 'playing', 'paused']);

  // Activate selected game
  const { error } = await supabase.from('game')
    .update({ status: 'playing' }) // Sets directly to playing for automatic games
    .eq('id', gameId);

  if (error) throw new Error(error.message);

  winLocks.clear(); // Clear memory locks for the new game

  invalidateGameCaches();
  await broadcastGameUpdate(gameId);
  setTimeout(() => getChannel().publish('games_updated', {}), 500);

  // Send push notification to all subscribed players that the game has started
  try {
    const fullState = await getGameFullState(gameId);
    sendPushNotification({
      recipient: 'all',
      title: '🎱 ¡El Bingo ha Comenzado!',
      message: `El sorteo para "${fullState?.name || 'la partida'}" ya está en vivo. ¡Ingresa para seguir tus cartones!`,
      url: getAppUrl()
    }).catch(() => { });
  } catch (e) { }
}

app.post('/api/games/:id/activate', requireAdmin, async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { data: targetGame, error: targetErr } = await supabase.from('game').select('*').eq('id', gameId).maybeSingle();
    if (targetErr || !targetGame) return res.status(404).json({ error: 'Juego no encontrado' });

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const gTenant = (targetGame.tenant_id || 'default').toLowerCase();
      if (gTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ error: 'Acceso denegado: Este juego pertenece a otra sala.' });
      }
    }

    const tenantFilter = (targetGame.tenant_id || 'default').toLowerCase();

    // End all currently active games ONLY for this tenant
    let prevGamesQ = supabase.from('game')
      .select('id')
      .in('status', ['waiting', 'playing', 'paused']);
    if (tenantFilter !== 'default' && tenantFilter !== 'bingo-lite') {
      prevGamesQ = prevGamesQ.eq('tenant_id', tenantFilter);
    } else {
      prevGamesQ = prevGamesQ.or('tenant_id.eq.default,tenant_id.eq.bingo-lite,tenant_id.is.null');
    }
    const { data: previousGames } = await prevGamesQ;

    if (previousGames && previousGames.length > 0) {
      const previousGameIds = previousGames.map((g: any) => g.id);
      await supabase.from('cards').delete().in('game_id', previousGameIds);

      // Reset players ONLY for this tenant
      let playerResetQ = supabase.from('players').update({
        card_count: 0,
        status: 'pending'
      }).neq('phone', '0000000000');
      if (tenantFilter !== 'default' && tenantFilter !== 'bingo-lite') {
        playerResetQ = playerResetQ.eq('tenant_id', tenantFilter);
      } else {
        playerResetQ = playerResetQ.or('tenant_id.eq.default,tenant_id.eq.bingo-lite,tenant_id.is.null');
      }
      await playerResetQ;
    }

    let endGamesQ = supabase.from('game')
      .update({ status: 'ended' })
      .in('status', ['waiting', 'playing', 'paused']);
    if (tenantFilter !== 'default' && tenantFilter !== 'bingo-lite') {
      endGamesQ = endGamesQ.eq('tenant_id', tenantFilter);
    } else {
      endGamesQ = endGamesQ.or('tenant_id.eq.default,tenant_id.eq.bingo-lite,tenant_id.is.null');
    }
    await endGamesQ;

    // Activate selected game
    const { error } = await supabase.from('game')
      .update({ status: 'waiting' }) // Manual activations go to waiting
      .eq('id', gameId);

    if (error) return res.status(500).json({ error: error.message });

    winLocks.clear(); // Clear memory locks for the new game

    invalidateGameCaches();
    await broadcastGameUpdate(gameId);
    setTimeout(() => getChannel().publish('games_updated', {}), 500);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function getActiveGame() {
  try {
    // First try to find a paid game that is active (playing, paused, waiting or scheduled)
    let { data: paidGame } = await supabase.from('game')
      .select('*')
      .in('status', ['waiting', 'playing', 'paused', 'scheduled'])
      .eq('is_free', false)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (paidGame) {
      return await getGameFullState(paidGame.id);
    }

    // If no paid active game, try any active game
    let { data: anyActiveGame } = await supabase.from('game')
      .select('*')
      .in('status', ['waiting', 'playing', 'paused', 'scheduled'])
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (anyActiveGame) {
      return await getGameFullState(anyActiveGame.id);
    }

    // If still no game, try scheduled paid game
    let { data: scheduledPaid } = await supabase.from('game')
      .select('*')
      .eq('status', 'scheduled')
      .eq('is_free', false)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (scheduledPaid) {
      return await getGameFullState(scheduledPaid.id);
    }

    // Finally, any scheduled game
    let { data: scheduledAny } = await supabase.from('game')
      .select('*')
      .eq('status', 'scheduled')
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (scheduledAny) {
      return await getGameFullState(scheduledAny.id);
    }
  } catch (err: any) {

  }

  return null;
}

// Get Current Game
app.get('/api/game', async (req, res) => {
  const { id } = req.query;
  const now = Date.now();

  if (!id && cachedCurrentGame && (now - lastCurrentGameFetchTime < CURRENT_GAME_CACHE_TTL)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json(cachedCurrentGame);
  }

  console.log('GET /api/game requested', id ? `for ID: ${id}` : '');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    let activeGameFull;
    if (id) {
      activeGameFull = await getGameFullState(parseInt(id as string));
    } else {
      activeGameFull = await getActiveGame();
    }

    if (!activeGameFull) {
      const globalSettings = await getGameSettings('global');
      console.log('GET /api/game returning global settings (no active game) header_image_url:', globalSettings.header_image_url);
      const guestState = {
        id: null,
        status: 'waiting',
        stream_id: globalSettings.stream_id || '',
        stream_active: globalSettings.stream_active || false,
        ai_knowledge_base: globalSettings.ai_knowledge_base,
        ai_model: globalSettings.ai_model || 'gemini-3.8-flash',
        ai_animator_enabled: globalSettings.ai_animator_enabled !== false,
        ai_chat_enabled: globalSettings.ai_chat_enabled !== false,
        ai_fraud_detection_enabled: globalSettings.ai_fraud_detection_enabled !== false,
        whatsapp_template: globalSettings.whatsapp_template,
        whatsapp_group_link: globalSettings.whatsapp_group_link || 'https://chat.whatsapp.com/CDgs5mXL8HWGJjbJn0VxHk',
        nequi_number: globalSettings.nequi_number || '3235304996',
        header_image_url: globalSettings.header_image_url || null,
        header_opacity: globalSettings.header_opacity !== undefined ? globalSettings.header_opacity : 0.4,
        header_title: globalSettings.header_title || 'BINGO ONLINE',
        header_subtitle: globalSettings.header_subtitle || 'Juega desde tu celular, gana premios al instante y diviértete en grande.',
        patterns: []
      };
      cachedCurrentGame = guestState;
      lastCurrentGameFetchTime = Date.now();
      return res.json(guestState);
    }

    cachedCurrentGame = activeGameFull;
    lastCurrentGameFetchTime = Date.now();
    res.json(activeGameFull);
  } catch (err: any) {
    // ignored
    res.json({
      id: null,
      status: 'waiting',
      stream_id: '',
      stream_active: false,
      ai_animator_enabled: true,
      header_title: 'BINGO ONLINE',
      header_subtitle: 'Juega desde tu celular, gana premios al instante y diviértete en grande.',
      patterns: []
    });
  }
});

// Get Patterns (with in-memory cache)
let cachedPatterns: any[] | null = null;
let lastPatternsFetchTime = 0;
const PATTERNS_CACHE_TTL = 60000; // 1 minute cache

app.get('/api/patterns', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const now = Date.now();
  if (cachedPatterns && (now - lastPatternsFetchTime < PATTERNS_CACHE_TTL)) {
    return res.json(cachedPatterns);
  }
  try {
    const { data, error } = await supabase.from('patterns').select('*').order('name', { ascending: true });
    if (error) {
      return res.json(cachedPatterns || []);
    }
    cachedPatterns = data || [];
    lastPatternsFetchTime = now;
    res.json(cachedPatterns);
  } catch (err: any) {
    res.json(cachedPatterns || []);
  }
});

// Create/Update Pattern
app.post('/api/patterns', requireAdmin, async (req, res) => {
  const { id, name, grid, is_active } = req.body;
  cachedPatterns = null; // Invalidate cache

  if (id) {
    // Try updating with is_active first, fallback to without is_active if column doesn't exist
    let updatePayload: any = { name, grid, is_active: is_active ?? true };
    let { data, error } = await supabase.from('patterns')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error && error.message && error.message.includes('is_active')) {
      const fallback = await supabase.from('patterns')
        .update({ name, grid })
        .eq('id', id)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } else {
    // Try inserting with is_active first, fallback to without is_active if column doesn't exist
    let newPattern: any = { name, grid, is_active: is_active ?? true };
    let { data, error } = await supabase.from('patterns')
      .insert(newPattern)
      .select()
      .single();

    if (error && error.message && error.message.includes('is_active')) {
      const fallback = await supabase.from('patterns')
        .insert({ name, grid })
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
});

// Delete Pattern (Hard delete)
app.delete('/api/patterns/:id', requireAdmin, async (req, res) => {
  cachedPatterns = null; // Invalidate cache
  const { error } = await supabase.from('patterns').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Get AI Announcement Presets
app.get('/api/ai-presets', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ai_presets').select('*').order('id', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    const formatted = (data || []).map((item: any) => ({
      ...item,
      title: item.title || item.name || 'Anuncio IA',
      name: item.name || item.title || 'Anuncio IA'
    }));
    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create/Update AI Announcement Preset
app.post('/api/ai-presets', requireAdmin, async (req, res) => {
  try {
    const { id, title, name, text, voice, audio_base64 } = req.body;
    const presetName = (name || title || 'Anuncio IA').trim();
    const presetTitle = (title || name || 'Anuncio IA').trim();

    const payloadWithBoth: any = {
      name: presetName,
      title: presetTitle,
      text: text || '',
      voice: voice || 'Puck',
      audio_base64: audio_base64 || ''
    };

    if (id && !String(id).startsWith('preset_')) {
      let { data, error } = await supabase.from('ai_presets')
        .update(payloadWithBoth)
        .eq('id', id)
        .select()
        .single();

      if (error && error.message?.includes('title')) {
        const payloadNameOnly = { name: presetName, text: text || '', voice: voice || 'Puck', audio_base64: audio_base64 || '' };
        const retry = await supabase.from('ai_presets').update(payloadNameOnly).eq('id', id).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) return res.status(500).json({ error: error.message });
      const result = data ? { ...data, title: data.title || data.name || presetTitle, name: data.name || data.title || presetName } : {};
      return res.json(result);
    } else {
      let { data, error } = await supabase.from('ai_presets')
        .insert(payloadWithBoth)
        .select()
        .single();

      if (error && error.message?.includes('title')) {
        const payloadNameOnly = { name: presetName, text: text || '', voice: voice || 'Puck', audio_base64: audio_base64 || '' };
        const retry = await supabase.from('ai_presets').insert(payloadNameOnly).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) return res.status(500).json({ error: error.message });
      const result = data ? { ...data, title: data.title || data.name || presetTitle, name: data.name || data.title || presetName } : {};
      return res.json(result);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete AI Announcement Preset
app.delete('/api/ai-presets/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id.startsWith('preset_')) {
      return res.json({ success: true, message: 'Default preset handled locally' });
    }
    const { error } = await supabase.from('ai_presets').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// LOTTERY NUMBERS IN PLAY ENDPOINTS (BINGO LITE)
// ==========================================

async function saveLotteryCodeFallback(playerId: number, gameId: number, lotteryCode: string, cardNumber: string | null) {
  try {
    const key = `lottery_data_game_${gameId}`;
    const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    let list: any[] = [];
    if (data && data.value) {
      try {
        list = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      } catch (e) {
        list = [];
      }
    }
    if (!Array.isArray(list)) list = [];

    const exists = list.some((item: any) =>
      Number(item.player_id) === Number(playerId) &&
      String(item.lottery_code) === String(lotteryCode) &&
      String(item.card_number) === String(cardNumber)
    );

    if (!exists) {
      list.push({
        player_id: Number(playerId),
        lottery_code: String(lotteryCode),
        card_number: cardNumber ? String(cardNumber) : null,
        created_at: new Date().toISOString()
      });
      await supabase.from('settings').upsert({ key, value: JSON.stringify(list) }, { onConflict: 'key' });
      console.log(`[Lottery Fallback Save] Saved fallback code ${lotteryCode} for player ${playerId} on game ${gameId}`);
    }
  } catch (err: any) {
    console.error('[Lottery Fallback Save Error]:', err.message);
  }
}

async function getLotteryCodesFallback(gameId: number): Promise<any[]> {
  try {
    const key = `lottery_data_game_${gameId}`;
    const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    if (data && data.value) {
      try {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { }
    }
  } catch (e) { }
  return [];
}

async function clearLotteryCodesFallback(gameId: number) {
  try {
    const key = `lottery_data_game_${gameId}`;
    await supabase.from('settings').delete().eq('key', key);
  } catch (e) { }
}

// Save a lottery number for a player and game
app.post('/api/lottery-numbers', async (req, res) => {
  try {
    const { player_id, game_id, lottery_code, card_number } = req.body;

    console.log(`[POST /api/lottery-numbers] Received payload:`, { player_id, game_id, lottery_code, card_number });

    if (!player_id || !game_id || !lottery_code) {
      return res.status(400).json({ error: 'player_id, game_id, and lottery_code are required' });
    }

    // Require authentication and verify player identity to prevent cross-player fraud
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Autenticación requerida para registrar números de lotería.' });
    }
    if (authUser.role === 'player') {
      // Look up the player in DB to cross-reference the authenticated uid
      const { data: dbPlayer } = await supabase.from('players').select('id').eq('id', Number(player_id)).maybeSingle();
      if (!dbPlayer || String(dbPlayer.id) !== String(authUser.uid)) {
        return res.status(403).json({ error: 'Acceso denegado: Solo puedes registrar números de lotería para tu propio perfil.' });
      }
    }

    let finalCardNumber = card_number ? String(card_number) : null;
    if (finalCardNumber) {
      // Normalize card number format (pad with leading zeros to match DB format, e.g. "0001")
      if (!isNaN(Number(finalCardNumber)) && finalCardNumber.length < 4) {
        finalCardNumber = finalCardNumber.padStart(4, '0');
      }

      console.log(`[POST /api/lottery-numbers] Querying card for game ${game_id}, number ${finalCardNumber}`);
      const { data: targetCard } = await supabase.from('cards')
        .select('*')
        .eq('game_id', Number(game_id))
        .eq('card_number', finalCardNumber)
        .maybeSingle();

      if (targetCard) {
        console.log(`[POST /api/lottery-numbers] Card found with ID ${targetCard.id}. Updating owner to player ${player_id} and lottery_code to ${lottery_code}`);
        const { error: updateErr } = await supabase.from('cards')
          .update({
            player_id: Number(player_id),
            lottery_code: String(lottery_code),
            status: String(lottery_code)
          })
          .eq('id', targetCard.id);

        if (updateErr) {
          console.error(`[POST /api/lottery-numbers] Error updating card:`, updateErr.message);
        }
      } else {
        console.log(`[POST /api/lottery-numbers] Card ${finalCardNumber} not found for game ${game_id}. Creating fallback card record.`);
        const { error: createErr } = await supabase.from('cards').insert({
          player_id: Number(player_id),
          game_id: Number(game_id),
          card_number: finalCardNumber,
          lottery_code: String(lottery_code),
          status: String(lottery_code),
          b: [], i: [], n: [], g: [], o: []
        });

        if (createErr) {
          console.error(`[POST /api/lottery-numbers] Error creating card record:`, createErr.message);
        }
      }
    }

    // Save to fallback settings storage as a bulletproof backup
    await saveLotteryCodeFallback(Number(player_id), Number(game_id), String(lottery_code), finalCardNumber);

    // 2. Insert into lottery_numbers_in_play
    try {
      const { data: existing, error: selectErr } = await supabase.from('lottery_numbers_in_play')
        .select('id')
        .eq('player_id', Number(player_id))
        .eq('game_id', Number(game_id))
        .eq('lottery_code', String(lottery_code))
        .maybeSingle();

      if (selectErr) {
        console.error('[POST /api/lottery-numbers] Select error in lottery_numbers_in_play:', selectErr.message);
      }

      if (!existing) {
        console.log(`[POST /api/lottery-numbers] Inserting lottery_numbers_in_play: player ${player_id}, game ${game_id}, code ${lottery_code}`);
        const { error: insertErr } = await supabase.from('lottery_numbers_in_play')
          .insert({
            player_id: Number(player_id),
            game_id: Number(game_id),
            lottery_code: String(lottery_code),
            card_number: finalCardNumber
          });

        if (insertErr) {
          console.error('[POST /api/lottery-numbers] Insert error in lottery_numbers_in_play:', insertErr.message);
        } else {
          console.log('[POST /api/lottery-numbers] Successfully inserted into lottery_numbers_in_play.');
        }
      } else {
        console.log(`[POST /api/lottery-numbers] Record already exists in lottery_numbers_in_play (ID: ${existing.id})`);
      }
    } catch (tblErr: any) {
      console.warn('Notice inserting into lottery_numbers_in_play (fallback active):', tblErr.message || tblErr);
    }

    res.json({ success: true, message: '¡Código de lotería registrado exitosamente!' });
  } catch (err: any) {
    console.error('[POST /api/lottery-numbers] Fatal Error:', err.message || err);
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Get all saved lottery numbers with player and game details
app.get('/api/lottery-numbers', async (req, res) => {
  try {
    const resultsMap = new Map<string, any>();

    // Fetch players and games first to join in-memory and prevent Join errors if constraints are loose
    const { data: rawPlayers } = await supabase.from('players').select('id, name, phone');
    const { data: rawGames } = await supabase.from('game').select('id, name');

    const playersMap = new Map<number, any>();
    if (rawPlayers) {
      rawPlayers.forEach((p: any) => playersMap.set(Number(p.id), p));
    }

    const gamesMap = new Map<number, any>();
    if (rawGames) {
      rawGames.forEach((g: any) => gamesMap.set(Number(g.id), g));
    }

    // 1. Fetch from lottery_numbers_in_play if available
    try {
      const { data: list, error: listError } = await supabase.from('lottery_numbers_in_play')
        .select('id, lottery_code, card_number, created_at, player_id, game_id')
        .order('created_at', { ascending: false });

      if (listError) {
        console.warn('Error fetching lottery_numbers_in_play directly:', listError.message);
      }

      if (list) {
        list.forEach((item: any) => {
          const playerId = Number(item.player_id);
          const gameId = Number(item.game_id);
          const player = playersMap.get(playerId);
          const game = gamesMap.get(gameId);

          const key = `${gameId}-${playerId}-${item.lottery_code}-${item.card_number}`;
          resultsMap.set(key, {
            id: item.id,
            lottery_code: item.lottery_code,
            card_number: item.card_number,
            created_at: item.created_at,
            player_name: player?.name || 'Desconocido',
            player_phone: player?.phone || 'Desconocido',
            game_name: game?.name || 'Juego Desconocido'
          });
        });
      }
    } catch (e: any) {
      console.error('Catch block error in lottery_numbers_in_play fetch:', e?.message);
    }

    // 2. Also fetch all active cards from cards table to guarantee 100% of player numbers are present
    try {
      const { data: cardsList, error: cardsErr } = await supabase.from('cards')
        .select('id, card_number, lottery_code, status, created_at, player_id, game_id')
        .not('card_number', 'ilike', 'RESERVADO%')
        .order('id', { ascending: true });

      if (cardsErr) {
        console.warn('Error fetching cards directly for lottery:', cardsErr.message);
      }

      if (cardsList) {
        for (const c of cardsList) {
          let code = c.lottery_code || c.status;
          const playerId = Number(c.player_id);
          const gameId = Number(c.game_id);
          const player = playersMap.get(playerId);
          const game = gamesMap.get(gameId);

          // Dynamic healing: If a card exists but doesn't have a valid lottery code, heal it on the fly!
          if (!code || code.trim() === '' || code === '---' || isNaN(Number(code))) {
            const settings = await getGameSettings(gameId);
            const numDigits = parseInt(String(settings.lottery_digits || '3'), 10) || 3;
            const maxVal = Math.pow(10, numDigits);
            const rand = Math.floor(Math.random() * maxVal);
            code = rand.toString().padStart(numDigits, '0');

            await supabase.from('cards')
              .update({ lottery_code: code, status: code })
              .eq('id', c.id);
          }

          const key = `${gameId}-${playerId}-${code}-${c.card_number}`;
          if (!resultsMap.has(key)) {
            resultsMap.set(key, {
              id: c.id,
              lottery_code: code,
              card_number: c.card_number,
              created_at: c.created_at || new Date().toISOString(),
              player_name: player?.name || 'Desconocido',
              player_phone: player?.phone || 'Desconocido',
              game_name: game?.name || 'Juego Desconocido'
            });
          }
        }
      }
    } catch (e: any) {
      console.error('Catch block error in cards fetch:', e?.message);
    }

    // 3. Also merge from settings-based fallback storage to guarantee 100% fail-safety
    try {
      for (const gameId of gamesMap.keys()) {
        const fallbackList = await getLotteryCodesFallback(gameId);
        fallbackList.forEach((item: any) => {
          const playerId = Number(item.player_id);
          const player = playersMap.get(playerId);
          const game = gamesMap.get(gameId);

          const key = `${gameId}-${playerId}-${item.lottery_code}-${item.card_number}`;
          if (!resultsMap.has(key)) {
            resultsMap.set(key, {
              id: `fallback-${gameId}-${playerId}-${item.lottery_code}`,
              lottery_code: item.lottery_code,
              card_number: item.card_number || '---',
              created_at: item.created_at || new Date().toISOString(),
              player_name: player?.name || 'Desconocido',
              player_phone: player?.phone || 'Desconocido',
              game_name: game?.name || 'Juego Desconocido'
            });
          }
        });
      }
    } catch (fallbackErr: any) {
      console.error('Error in fallback lottery fetch:', fallbackErr.message);
    }

    const formattedList = Array.from(resultsMap.values());
    console.log(`Debug: Returned ${formattedList.length} lottery numbers for the admin panel.`);
    res.json(formattedList);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Get saved card numbers for a specific player and game, along with confirmed drawing result if any
app.get('/api/lottery-numbers/player/:playerId/game/:gameId', async (req, res) => {
  try {
    const { playerId, gameId } = req.params;
    const codesSet = new Set<string>();

    // 1. Fetch from lottery_numbers_in_play
    try {
      const { data } = await supabase.from('lottery_numbers_in_play')
        .select('lottery_code')
        .eq('player_id', Number(playerId))
        .eq('game_id', Number(gameId));
      (data || []).forEach((item: any) => {
        if (item.lottery_code) codesSet.add(String(item.lottery_code));
      });
    } catch (e) { }

    // 2. Fetch directly from cards table for this player and game
    try {
      const { data: cards } = await supabase.from('cards')
        .select('lottery_code, status')
        .eq('player_id', Number(playerId))
        .eq('game_id', Number(gameId))
        .not('card_number', 'ilike', 'RESERVADO%');
      (cards || []).forEach((c: any) => {
        const code = c.lottery_code || c.status;
        if (code && !code.startsWith('RESERVADO') && !isNaN(Number(code))) {
          codesSet.add(String(code));
        }
      });
    } catch (e) { }

    // 3. Fetch from fallback settings storage
    try {
      const fallbackList = await getLotteryCodesFallback(Number(gameId));
      fallbackList.forEach((item: any) => {
        if (Number(item.player_id) === Number(playerId) && item.lottery_code) {
          codesSet.add(String(item.lottery_code));
        }
      });
    } catch (e) { }

    const savedLotteryCodes = Array.from(codesSet);

    // Fetch game settings to check if the drawing is confirmed/winner declared
    const settings = await getGameSettings(Number(gameId));
    const confirmed = settings.lotteryConfirmed === true;
    const winningCode = settings.lotteryWinnerCode !== undefined && settings.lotteryWinnerCode !== null
      ? String(settings.lotteryWinnerCode)
      : null;

    let isWinner = false;
    if (confirmed && winningCode !== null) {
      isWinner = savedLotteryCodes.includes(winningCode);
    }

    res.json({
      savedLotteryCodes,
      confirmed,
      winningCode,
      isWinner
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// GET the lottery winner drawing settings for a game
app.get('/api/lottery-numbers/winner/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const settings = await getGameSettings(Number(gameId));
    res.json({
      confirmed: settings.lotteryConfirmed === true,
      winningCode: settings.lotteryWinnerCode !== undefined && settings.lotteryWinnerCode !== null
        ? String(settings.lotteryWinnerCode)
        : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// POST to confirm a lottery drawing winner for a game
app.post('/api/lottery-numbers/winner', requireAdmin, async (req, res) => {
  try {
    const { game_id, winning_code } = req.body;

    if (!game_id || winning_code === undefined || winning_code === null) {
      return res.status(400).json({ error: 'game_id and winning_code are required' });
    }

    const codeStr = String(winning_code);

    // Capture winner detail from cards table or lottery_numbers_in_play
    let winnerNames: string[] = [];

    // Check cards safely without foreign key joins (which fail if name mismatches or relationships aren't configured)
    const { data: winningCards } = await supabase.from('cards')
      .select('card_number, player_id')
      .eq('game_id', Number(game_id))
      .or(`lottery_code.eq.${codeStr},status.eq.${codeStr}`);

    if (winningCards && winningCards.length > 0) {
      const playerIds = winningCards.map((wc: any) => Number(wc.player_id)).filter(id => !isNaN(id));
      if (playerIds.length > 0) {
        const { data: players } = await supabase.from('players').select('id, name').in('id', playerIds);
        if (players) {
          const playerMap = new Map<number, string>();
          players.forEach((p: any) => playerMap.set(Number(p.id), p.name));
          winningCards.forEach((wc: any) => {
            const name = playerMap.get(Number(wc.player_id));
            if (name && !winnerNames.includes(name)) winnerNames.push(name);
          });
        }
      }
    }

    // Check lottery_numbers_in_play safely
    try {
      const { data: winInPlay } = await supabase.from('lottery_numbers_in_play')
        .select('card_number, player_id')
        .eq('game_id', Number(game_id))
        .eq('lottery_code', codeStr);

      if (winInPlay && winInPlay.length > 0) {
        const playerIds = winInPlay.map((w: any) => Number(w.player_id)).filter(id => !isNaN(id));
        if (playerIds.length > 0) {
          const { data: players } = await supabase.from('players').select('id, name').in('id', playerIds);
          if (players) {
            const playerMap = new Map<number, string>();
            players.forEach((p: any) => playerMap.set(Number(p.id), p.name));
            winInPlay.forEach((w: any) => {
              const name = playerMap.get(Number(w.player_id));
              if (name && !winnerNames.includes(name)) winnerNames.push(name);
            });
          }
        }
      }
    } catch (e) { }

    // Check fallback winners safely
    try {
      const fallbackList = await getLotteryCodesFallback(Number(game_id));
      const fallbackWinners = fallbackList.filter((item: any) => String(item.lottery_code) === codeStr);
      if (fallbackWinners.length > 0) {
        const playerIds = fallbackWinners.map((w: any) => Number(w.player_id)).filter(id => !isNaN(id));
        if (playerIds.length > 0) {
          const { data: players } = await supabase.from('players').select('id, name').in('id', playerIds);
          if (players) {
            const playerMap = new Map<number, string>();
            players.forEach((p: any) => playerMap.set(Number(p.id), p.name));
            fallbackWinners.forEach((w: any) => {
              const name = playerMap.get(Number(w.player_id));
              if (name && !winnerNames.includes(name)) winnerNames.push(name);
            });
          }
        }
      }
    } catch (e) { }

    let notificationSent = false;
    const winnerName = winnerNames.length > 0 ? winnerNames.join(', ') : 'Un jugador de la comunidad';
    const title = '🎉 ¡Tenemos Ganador de Lotería!';
    const message = `El premio de lotería ha sido para ${winnerName} con el código ganador #${codeStr}. ¡Felicidades!`;

    sendPushNotification({
      recipient: 'all',
      title,
      message,
    }).catch(() => { });

    notificationSent = true;

    try {
      await getChannel().publish('lottery_winner_announced', {
        title,
        message,
        winnerName,
        winningCode: codeStr
      });
    } catch (err) { }

    // Save lottery drawing status in game settings
    await saveGameSettings(Number(game_id), {
      lotteryConfirmed: true,
      lotteryWinnerCode: codeStr
    });

    // Cleanup non-winning records in lottery_numbers_in_play if table exists
    try {
      await supabase.from('lottery_numbers_in_play')
        .delete()
        .eq('game_id', Number(game_id))
        .neq('lottery_code', codeStr);
    } catch (e) { }

    await broadcastGameUpdate(Number(game_id));

    res.json({ success: true, message: 'Lotería confirmada. Se guardó el código ganador y se notificó a los jugadores.', notificationSent });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// POST to reset a lottery drawing winner (undo/clear confirmation)
app.post('/api/lottery-numbers/reset-winner', requireAdmin, async (req, res) => {
  try {
    const { game_id } = req.body;

    if (!game_id) {
      return res.status(400).json({ error: 'game_id is required' });
    }

    await saveGameSettings(Number(game_id), {
      lotteryConfirmed: false,
      lotteryWinnerCode: null
    });

    await broadcastGameUpdate(Number(game_id));

    res.json({ success: true, message: 'Se ha restablecido el sorteo de lotería para este juego.' });
  } catch (err: any) {

    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Clear all lottery numbers list (mass action)
app.delete('/api/lottery-numbers/clear', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('lottery_numbers_in_play')
      .delete()
      .gte('id', 0);

    // Also clear fallback settings for active game
    try {
      const activeGame = await getActiveGame();
      if (activeGame) {
        await clearLotteryCodesFallback(activeGame.id);
      }
    } catch (fallbackErr) { }

    res.json({ success: true, message: 'Se ha vaciado el listado de números en juego correctamente.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Delete a single lottery number entry
app.delete('/api/lottery-numbers/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('lottery_numbers_in_play')
      .delete()
      .eq('id', Number(id));

    if (error) {
      throw error;
    }

    res.json({ success: true, message: 'Registro eliminado correctamente.' });
  } catch (err: any) {

    res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
});

// Record a gift invitation
// Create a general gift invitation without a specific recipient phone
app.post('/api/gift-invitations/generate', async (req, res) => {
  try {
    const { sender_phone, game_id } = req.body;
    const cleanSender = normalizePhone(sender_phone);

    if (!cleanSender) {
      return res.status(400).json({ error: 'Sender phone is required' });
    }

    // Determine target game (either passed or active)
    let activeGame: any = null;
    if (game_id) {
      activeGame = await getGameFullState(Number(game_id));
    }
    if (!activeGame) {
      activeGame = await getActiveGame();
    }
    if (!activeGame) {
      return res.status(400).json({ error: 'No hay juego activo actualmente.' });
    }

    // Find sender player (with or without '57' country code)
    let { data: senderPlayer } = await supabase.from('players')
      .select('*')
      .eq('phone', cleanSender)
      .maybeSingle();

    if (!senderPlayer) {
      const altPhone = cleanSender.startsWith('57') ? cleanSender.slice(2) : `57${cleanSender}`;
      const { data: altPlayer } = await supabase.from('players')
        .select('*')
        .eq('phone', altPhone)
        .maybeSingle();
      if (altPlayer) senderPlayer = altPlayer;
    }

    if (!senderPlayer) {
      return res.status(400).json({ error: 'Jugador no encontrado en el sistema.' });
    }

    // Check sender's cards for the active game (supports both free games and paid games)
    const { data: senderCards } = await supabase.from('cards')
      .select('id')
      .eq('player_id', senderPlayer.id)
      .eq('game_id', activeGame.id)
      .not('card_number', 'ilike', 'RESERVADO%');

    const cardCountFromDb = senderCards?.length || 0;
    const cardCountFromPlayer = senderPlayer.card_count || 0;

    let cardCountFromHistory = 0;
    if (senderPlayer.receipt_url) {
      try {
        let history = [];
        try {
          history = JSON.parse(senderPlayer.receipt_url);
        } catch (e) {
          if (typeof senderPlayer.receipt_url === 'string' && (senderPlayer.receipt_url.includes('FREE_GAME') || senderPlayer.receipt_url.includes('free'))) {
            cardCountFromHistory = 2;
          }
        }
        if (Array.isArray(history)) {
          const gameEntry = history.find((h: any) => Number(h.game_id) === Number(activeGame.id)) || history[history.length - 1];
          if (gameEntry && gameEntry.card_count) {
            cardCountFromHistory = Number(gameEntry.card_count) || 0;
          }
        }
      } catch (e) { }
    }

    const effectiveCardCount = Math.max(cardCountFromDb, cardCountFromPlayer, cardCountFromHistory);

    if (effectiveCardCount < 2) {
      return res.status(400).json({
        error: 'Requisito de seguridad',
        message: 'Debes adquirir al menos dos (2) cartones en el juego activo para poder desbloquear y regalar cartones.'
      });
    }

    // Check how many generic invitations they already made for THIS game
    let giftQuery = supabase.from('gift_invitations')
      .select('id')
      .eq('sender_phone', cleanSender);

    if (activeGame?.id) {
      giftQuery = giftQuery.eq('game_id', activeGame.id);
    }
    const { data: existingGifts } = await giftQuery;

    if (existingGifts && existingGifts.length >= 4) {
      return res.status(400).json({ error: 'Ya has generado el límite máximo de 4 regalos permitidos para este juego.' });
    }

    const dummyRecipient = `via-link-${Math.random().toString(36).substring(2, 10)}`;

    const { data, error } = await supabase.from('gift_invitations')
      .insert({
        sender_phone: cleanSender,
        recipient_phone: dummyRecipient,
        status: 'pending',
        game_id: activeGame?.id || null,
        card_count: 1
      })
      .select()
      .single();

    invalidatePlayersCaches();

    if (error) {
      console.warn('Error inserting into gift_invitations, returning fallback id:', error.message);
      return res.json({ id: Date.now(), sender_phone: cleanSender, recipient_phone: dummyRecipient, status: 'pending', game_id: activeGame?.id || null });
    }
    return res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reenviar regalo / Cambiar destinatario de un cartón no redimido
app.post('/api/gift-invitations/resend', async (req, res) => {
  try {
    const { invite_id, sender_phone, new_recipient_phone } = req.body;
    const cleanSender = normalizePhone(sender_phone);
    if (!cleanSender || !invite_id) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (invite_id, sender_phone).' });
    }

    // 1. Verificar que la invitación exista, pertenezca al remitente y siga en estado 'pending'
    const { data: invite, error: fetchErr } = await supabase.from('gift_invitations')
      .select('*')
      .eq('id', Number(invite_id))
      .eq('sender_phone', cleanSender)
      .maybeSingle();

    if (fetchErr || !invite) {
      return res.status(404).json({ error: 'Invitación de regalo no encontrada o no pertenece a tu cuenta.' });
    }

    if (invite.status === 'claimed') {
      return res.status(400).json({
        error: 'Regalo ya redimido',
        message: 'Este cartón de regalo ya fue aceptado y redimido por el usuario. No se puede reenviar un regalo que ya fue activado.'
      });
    }

    // 2. Si se proporciona un nuevo número de teléfono, normalizarlo
    let targetRecipient = `via-link-${Math.random().toString(36).substring(2, 10)}`;
    if (new_recipient_phone && String(new_recipient_phone).trim() !== '') {
      const cleanNew = normalizePhone(new_recipient_phone);
      if (cleanNew) {
        targetRecipient = cleanNew;
      }
    }

    // 3. Actualizar únicamente esta invitación, sin afectar las demás invitaciones pendientes
    const { data: updatedInvite, error: updateErr } = await supabase.from('gift_invitations')
      .update({
        recipient_phone: targetRecipient,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message });
    }

    invalidatePlayersCaches();
    res.json({
      success: true,
      message: 'Regalo actualizado y listo para reenviar.',
      invite: updatedInvite
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al reenviar regalo' });
  }
});

// Get gifts summary for a player (used by player dashboard and admin)
app.get('/api/gift-invitations/my-gifts', async (req, res) => {
  try {
    const rawPhone = String(req.query.phone || '');
    const cleanPhone = normalizePhone(rawPhone);
    if (!cleanPhone) {
      return res.json({ gifts: [], count: 0, claimed: 0, pending: 0 });
    }

    let targetGameId: number | null = req.query.game_id ? Number(req.query.game_id) : null;
    if (!targetGameId) {
      const activeGame = await getActiveGame();
      if (activeGame?.id) targetGameId = activeGame.id;
    }

    let query = supabase
      .from('gift_invitations')
      .select('*')
      .eq('sender_phone', cleanPhone)
      .order('created_at', { ascending: true });

    if (targetGameId) {
      query = query.eq('game_id', targetGameId);
    }

    const { data: gifts, error } = await query;

    if (error) throw error;
    const safeGifts = gifts || [];
    res.json({
      game_id: targetGameId,
      gifts: safeGifts.slice(0, 4),
      count: Math.min(4, safeGifts.length),
      claimed: safeGifts.filter(g => g.status === 'claimed').length,
      pending: safeGifts.filter(g => g.status === 'pending').length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check status of a gift invitation
app.get('/api/gift-invitations/check', async (req, res) => {
  try {
    const { invite_id, sender_phone } = req.query;
    const cleanSender = normalizePhone(String(sender_phone || ''));

    if (!invite_id && !cleanSender) {
      return res.json({ valid: true });
    }

    if (invite_id) {
      const { data: invite } = await supabase.from('gift_invitations')
        .select('*')
        .eq('id', invite_id)
        .maybeSingle();

      if (!invite) {
        return res.json({ valid: false, reason: 'not_found', message: 'Invitación no encontrada o expirada.' });
      }

      if (invite.status === 'claimed') {
        return res.json({ valid: false, reason: 'claimed', message: 'Este cartón de regalo ya fue redimido por otro usuario. Cada enlace es de uso único.' });
      }

      return res.json({ valid: true, invite });
    }

    if (cleanSender) {
      const { data: pendingInvite } = await supabase.from('gift_invitations')
        .select('*')
        .eq('sender_phone', cleanSender)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();

      if (!pendingInvite) {
        return res.json({ valid: false, reason: 'no_pending', message: 'No hay regalos pendientes disponibles de este remitente.' });
      }

      return res.json({ valid: true, invite: pendingInvite });
    }

    return res.json({ valid: true });
  } catch (err: any) {
    res.json({ valid: true });
  }
});

app.post('/api/gift-invitations', async (req, res) => {
  try {
    const { sender_phone, recipient_phone } = req.body;
    const cleanSender = normalizePhone(sender_phone);
    const cleanRecipient = normalizePhone(recipient_phone);

    if (!cleanSender || !cleanRecipient) {
      return res.status(400).json({ error: 'Sender and recipient phones are required' });
    }

    // Security check: Sender must have purchased/approved active cards >= 2 for the active game to gift cards.
    const activeGame = await getActiveGame();
    if (!activeGame) {
      return res.status(400).json({ error: 'No hay juego activo actualmente.' });
    }

    const { data: senderPlayer } = await supabase.from('players')
      .select('*')
      .eq('phone', cleanSender)
      .eq('status', 'approved')
      .maybeSingle();

    if (!senderPlayer) {
      return res.status(400).json({ error: 'Tu cuenta o registro no está aprobado o activo para poder regalar cartones.' });
    }

    const { data: senderCards, error: cardsCountError } = await supabase.from('cards')
      .select('id')
      .eq('player_id', senderPlayer.id)
      .eq('game_id', activeGame.id)
      .not('card_number', 'ilike', 'RESERVADO%');

    if (cardsCountError) {
      return res.status(500).json({ error: 'Error al verificar la cantidad de cartones comprados.' });
    }

    if (!senderCards || senderCards.length < 2) {
      return res.status(400).json({
        error: 'Requisito de seguridad',
        message: 'Debes adquirir al menos dos (2) cartones previamente en el juego activo para poder regalar o habilitar la opción de regalo de cartones.'
      });
    }

    const { data: existing, error: findError } = await supabase.from('gift_invitations')
      .select('*')
      .eq('sender_phone', cleanSender)
      .eq('recipient_phone', cleanRecipient)
      .maybeSingle();

    if (findError) return res.status(500).json({ error: findError.message });

    if (existing) {
      const { data, error } = await supabase.from('gift_invitations')
        .update({ status: 'pending', created_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    } else {
      const { data, error } = await supabase.from('gift_invitations')
        .insert({ sender_phone: cleanSender, recipient_phone: cleanRecipient, status: 'pending' })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Full Database Purge (Reset to zero, preserving only admin stcganas@gmail.com)
app.post('/api/admin/reset-database-clean', async (req, res) => {
  try {
    console.log('[DB Reset] Starting complete database purge requested by admin...');
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase no está configurado.' });
    }

    const adminEmail = 'stcganas@gmail.com';

    // 1. Delete all cards
    await supabase.from('cards').delete().neq('id', -999999);

    // 2. Delete all bingo claims / alerts
    await supabase.from('bingo_claims').delete().neq('id', -999999);

    // 3. Delete all receipts
    await supabase.from('receipts').delete().neq('id', -999999);

    // 4. Delete all lottery numbers in play
    await supabase.from('lottery_numbers_in_play').delete().neq('id', -999999);

    // 5. Delete all notifications
    await supabase.from('notifications').delete().neq('id', -999999);

    // 6. Delete all gift invitations
    await supabase.from('gift_invitations').delete().neq('id', -999999);

    // 7. Delete all wallet transactions & activations
    await supabase.from('wallet_transactions').delete().neq('id', -999999);
    await supabase.from('wallet_activations').delete().neq('id', -999999);

    // 8. Find if admin exists in players table
    const { data: existingAdmin } = await supabase
      .from('players')
      .select('*')
      .or(`email.eq.${adminEmail},name.ilike.%stcganas%`)
      .maybeSingle();

    let preservedAdminId: number | null = existingAdmin?.id || null;

    if (preservedAdminId) {
      // Delete all players EXCEPT admin
      await supabase.from('players').delete().neq('id', preservedAdminId);
      // Reset admin player to clean 0 cards
      await supabase.from('players').update({
        card_count: 0,
        receipt_url: null,
        status: 'approved',
        is_blocked: false
      }).eq('id', preservedAdminId);
    } else {
      // Delete all players
      await supabase.from('players').delete().neq('id', -999999);
      // Create clean Admin player record with stcganas@gmail.com
      const { data: newAdmin } = await supabase.from('players').insert({
        name: 'Administrador',
        email: adminEmail,
        phone: '3005191519',
        city: 'Colombia',
        card_count: 0,
        status: 'approved',
        is_blocked: false,
        receipt_url: null,
        referral_code: 'ADMIN'
      }).select().single();
      if (newAdmin) preservedAdminId = newAdmin.id;
    }

    // 9. Reset wallets (keep only admin wallet with 0 balance)
    await supabase.from('wallets').delete().neq('id', -999999);
    if (existingAdmin?.phone || '3005191519') {
      const adminPhone = existingAdmin?.phone || '3005191519';
      await supabase.from('wallets').insert({
        phone: adminPhone,
        balance: 0
      });
    }

    // 10. Clean receipt images from storage
    try {
      const { data: fileList } = await supabase.storage.from(BUCKET_NAME).list('receipts', { limit: 1000 });
      if (fileList && fileList.length > 0) {
        const paths = fileList.map(f => `receipts/${f.name}`);
        await supabase.storage.from(BUCKET_NAME).remove(paths);
      }
    } catch (storageErr: any) {
      console.warn('[DB Reset] Notice cleaning storage receipts:', storageErr?.message);
    }

    // 11. Reset game patterns winners to null
    await supabase.from('game_patterns').update({
      winner_player_id: null,
      won_at: null,
      payment_status: null,
      rejection_reason: null
    }).neq('id', -999999);

    // 12. Reset active game state
    const { data: games } = await supabase.from('game').select('id');
    if (games && games.length > 0) {
      for (const g of games) {
        await supabase.from('game').update({
          drawn_balls: [],
          status: 'waiting'
        }).eq('id', g.id);
      }
    }

    winLocks.clear();
    invalidatePlayersCaches();
    invalidateGameCaches();

    console.log('[DB Reset] Database successfully purged and reset to zero.');
    res.json({
      success: true,
      message: 'Limpieza total completada. Base de datos reseteada a cero exitosamente, conservando únicamente la cuenta de administrador stcganas@gmail.com.',
      adminEmail
    });
  } catch (err: any) {
    console.error('[DB Reset] Error in full database purge:', err);
    res.status(500).json({ error: `Error al purgar base de datos: ${err.message}` });
  }
});

// Cleanup Storage and Receipt History
app.post('/api/admin/cleanup-storage', async (req, res) => {
  try {
    // 1. Get all players with receipt history
    const { data: players, error: fetchError } = await supabase
      .from('players')
      .select('id, receipt_url')
      .not('receipt_url', 'is', null);

    if (fetchError) throw fetchError;

    let deletedFilesCount = 0;
    let updatedPlayersCount = 0;

    for (const player of players) {
      try {
        let history = JSON.parse(player.receipt_url);
        if (Array.isArray(history) && history.length > 1) {
          // Keep only the last (most recent) receipt
          const keep = history[history.length - 1];
          const toDelete = history.slice(0, history.length - 1);

          const pathsToDelete: string[] = [];
          for (const item of toDelete) {
            const url = typeof item === 'string' ? item : item.url;
            // Extract filename from Supabase URL
            // Format: .../public/receipts/receipts/filename.ext
            const parts = url.split('/');
            const filename = parts[parts.length - 1];
            if (filename) pathsToDelete.push(`receipts/${filename}`);
          }

          if (pathsToDelete.length > 0) {
            const { error: storageError } = await supabase.storage
              .from(BUCKET_NAME)
              .remove(pathsToDelete);

            if (!storageError) {
              deletedFilesCount += pathsToDelete.length;

              // Update player record to only keep the last receipt
              await supabase.from('players')
                .update({ receipt_url: JSON.stringify([keep]) })
                .eq('id', player.id);

              updatedPlayersCount++;
            } else {
              console.log(`Error deleting files for player ${player.id}:`, storageError.message);
            }
          }
        }
      } catch (e) {
        // Not a JSON array or other error, skip
      }
    }

    res.json({
      success: true,
      message: `Limpieza completada. Se eliminaron ${deletedFilesCount} archivos y se actualizaron ${updatedPlayersCount} registros de jugadores.`,
      deletedFilesCount,
      updatedPlayersCount
    });
  } catch (err: any) {

    res.status(500).json({ error: err.message });
  }
});

// Update Game Status
app.post('/api/game/status', requireAdmin, async (req, res) => {
  const { gameId, status, prize, card_value, final_note, is_free, ai_knowledge_base, ai_model, ai_animator_enabled, ai_chat_enabled, whatsapp_template } = req.body;

  let game;
  if (gameId) {
    const { data } = await supabase.from('game').select('*').eq('id', gameId).maybeSingle();
    game = data;
    if (game) {
      // Refresh with full state for logic below
      game = await getGameFullState(game.id);
    }
  }

  if (!game) {
    const rawGame = await getActiveGame();
    if (rawGame) {
      game = await getGameFullState(rawGame.id);
    }
  }

  const globalSettingsUpdates: any = {};
  if (ai_knowledge_base !== undefined) globalSettingsUpdates.ai_knowledge_base = ai_knowledge_base;
  if (ai_model !== undefined) globalSettingsUpdates.ai_model = ai_model;
  if (ai_animator_enabled !== undefined) globalSettingsUpdates.ai_animator_enabled = ai_animator_enabled;
  if (ai_chat_enabled !== undefined) globalSettingsUpdates.ai_chat_enabled = ai_chat_enabled;
  if (req.body.ai_fraud_detection_enabled !== undefined) globalSettingsUpdates.ai_fraud_detection_enabled = req.body.ai_fraud_detection_enabled;
  if (whatsapp_template !== undefined) globalSettingsUpdates.whatsapp_template = whatsapp_template;
  if (final_note !== undefined) globalSettingsUpdates.final_note = final_note;
  if (is_free !== undefined) globalSettingsUpdates.is_free = is_free;
  if (req.body.whatsapp_group_link !== undefined) globalSettingsUpdates.whatsapp_group_link = req.body.whatsapp_group_link;
  if (req.body.nequi_number !== undefined) globalSettingsUpdates.nequi_number = req.body.nequi_number;
  if (req.body.header_image_url !== undefined) globalSettingsUpdates.header_image_url = req.body.header_image_url;
  if (req.body.header_opacity !== undefined) globalSettingsUpdates.header_opacity = req.body.header_opacity;
  if (req.body.header_title !== undefined) globalSettingsUpdates.header_title = req.body.header_title;
  if (req.body.header_subtitle !== undefined) globalSettingsUpdates.header_subtitle = req.body.header_subtitle;
  if (req.body.login_bg_image_url !== undefined) globalSettingsUpdates.login_bg_image_url = req.body.login_bg_image_url;
  if (req.body.login_bg_opacity !== undefined) globalSettingsUpdates.login_bg_opacity = req.body.login_bg_opacity;
  if (req.body.bg_volume !== undefined) globalSettingsUpdates.bg_volume = req.body.bg_volume;
  if (req.body.fx_volume !== undefined) globalSettingsUpdates.fx_volume = req.body.fx_volume;

  if (Object.keys(globalSettingsUpdates).length > 0) {
    await saveGameSettings('global', globalSettingsUpdates);
  }

  if (!game) {
    invalidateGameCaches();
    if (status || prize !== undefined || card_value !== undefined) {
      return res.status(404).json({ error: 'No game found' });
    }
    return res.json({ success: true, message: 'Updated global settings' });
  }

  const updates: any = {};
  if (status) updates.status = status;
  if (prize !== undefined) updates.prize = prize;
  if (card_value !== undefined) updates.card_value = card_value;

  const settingsUpdates: any = {};
  if (final_note !== undefined) settingsUpdates.final_note = final_note;
  if (is_free !== undefined) settingsUpdates.is_free = is_free;
  if (req.body.whatsapp_group_link !== undefined) settingsUpdates.whatsapp_group_link = req.body.whatsapp_group_link;
  if (req.body.nequi_number !== undefined) settingsUpdates.nequi_number = req.body.nequi_number;

  if (Object.keys(settingsUpdates).length > 0) {
    await saveGameSettings(game.id, settingsUpdates);
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('game').update(updates).eq('id', game.id);

    // If manually unpausing/starting, clear any celebration pause
    if (status === 'playing' || status === 'waiting') {
      serverAutoplay.isPausedForWinner = false;
      serverAutoplay.winnerPauseUntil = 0;
    }
  }

  if (status === 'ended' || status === 'finished') {
    await endGameCleanup(game.id, game.final_note || "");
  }

  invalidateGameCaches();
  await broadcastGameUpdate(game.id);
  res.json({ success: true });
});

app.post('/api/admin/upload-login-bg', upload.single('login_bg_image'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    sanitizeUploadedFileMimeType(req.file);

    await initStorage();

    const fileExt = path.extname(req.file.originalname);
    const fileName = `login-bg-${Date.now()}${fileExt}`;
    const filePath = `assets/${fileName}`;

    console.log(`Iniciando subida de imagen de fondo de login, ruta: ${filePath}...`);
    let uploadData;
    let uploadError;

    const { data: bData, error: bError } = await supabase.storage
      .from(BANNER_BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (bError) {
      const { data: rData, error: rError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      uploadData = rData;
      uploadError = rError;
    } else {
      uploadData = bData;
      uploadError = null;
    }

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(uploadData.path.startsWith('assets') ? BANNER_BUCKET : BUCKET_NAME)
      .getPublicUrl(filePath);

    res.json({ url: publicUrl });
  } catch (err: any) {

    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/upload-header', upload.single('header_image'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    sanitizeUploadedFileMimeType(req.file);

    await initStorage();

    const fileExt = path.extname(req.file.originalname);
    const fileName = `header-${Date.now()}${fileExt}`;
    const filePath = `assets/${fileName}`;

    console.log(`Iniciando subida de imagen de cabecera, ruta: ${filePath}...`);
    let uploadData;
    let uploadError;
    let activeBucket = BANNER_BUCKET;

    // Intentamos subir al bucket 'banners' primero
    const { data: bData, error: bError } = await supabase.storage
      .from(BANNER_BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (bError) {

      // Fallback a 'receipts'
      const { data: rData, error: rError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      uploadData = rData;
      uploadError = rError;
      activeBucket = BUCKET_NAME;
    } else {
      uploadData = bData;
      uploadError = bError;
    }

    if (uploadError) {

      return res.status(500).json({
        error: `Error de acceso al almacenamiento: ${uploadError.message}.`
      });
    }

    console.log(`Imagen de cabecera subida exitosamente a bucket ${activeBucket}:`, uploadData);
    const { data: { publicUrl } } = supabase.storage
      .from(activeBucket)
      .getPublicUrl(filePath);

    // Guardar inmediatamente la URL de la cabecera en los ajustes de la base de datos
    await saveGameSettings('global', { header_image_url: publicUrl });

    res.json({ success: true, url: publicUrl });
  } catch (err: any) {

    res.status(500).json({ error: err.message });
  }
});

// Update Stream Status
app.post('/api/game/stream', requireAdmin, async (req, res) => {
  const { stream_id, stream_active } = req.body;

  // Save to global settings so it is persistent across games
  const globalUpdates: any = {};
  if (stream_id !== undefined) globalUpdates.stream_id = stream_id;
  if (stream_active !== undefined) globalUpdates.stream_active = stream_active;

  if (Object.keys(globalUpdates).length > 0) {
    try {
      await saveGameSettings('global', globalUpdates);
      console.log('Saved Twitch settings to app_global_settings:', globalUpdates);
    } catch (err: any) {

    }
  }

  let game = await getActiveGame();
  if (game) {
    const updates: any = {};
    if (stream_id !== undefined) updates.stream_id = stream_id;
    if (stream_active !== undefined) updates.stream_active = stream_active;

    await supabase.from('game').update(updates).eq('id', game.id);
    invalidateGameCaches();
    await broadcastGameUpdate(game.id);
  }

  invalidateGameCaches();
  if (stream_id !== undefined) getChannel().publish('stream_updated', stream_id);
  if (stream_active !== undefined) getChannel().publish('stream_status_updated', { active: stream_active });

  res.json({ success: true });
});

// Update Chat Status
app.post('/api/game/chat', requireAdmin, async (req, res) => {
  const { chat_enabled } = req.body;
  getChannel().publish('chat_status_updated', { enabled: chat_enabled });
  res.json({ success: true });
});

const winLocks = new Set<number>();
const sentPushLocks = new Set<string>();

// Helper to process wins (mark winners, credit wallets, notify)
async function processBingoWin(game: any, gp: any, winners: { card: any, player: any, winResult: any }[]) {
  if (!winners || winners.length === 0) return false;

  // Prevent duplicate processing in memory for this session
  if (winLocks.has(gp.id)) {
    console.log(`Pattern ${gp.id} win event already being processed/sent. Skipping duplicate.`);
    return false;
  }

  // Group winners by player ID to handle prize splitting by person (defensive extraction)
  const uniquePlayersMap = new Map<string, any>();
  for (const w of winners) {
    const pId = w.player?.id || w.card?.player_id || (w as any).player_id;
    if (pId) {
      const pData = w.player || {};
      uniquePlayersMap.set(String(pId), {
        id: pId,
        name: pData.name || (w as any).player_name || 'Jugador',
        city: pData.city || '',
        phone: pData.phone || (w as any).player_phone || ''
      });
    }
  }

  // Safety fallback: if uniquePlayersMap is still empty, look up player from card.player_id in Supabase
  if (uniquePlayersMap.size === 0 && winners[0]?.card?.player_id) {
    const fallbackPlayerId = winners[0].card.player_id;
    try {
      const { data: dbPlayer } = await supabase.from('players').select('id, name, city, phone').eq('id', fallbackPlayerId).maybeSingle();
      if (dbPlayer) {
        uniquePlayersMap.set(String(dbPlayer.id), dbPlayer);
      } else {
        uniquePlayersMap.set(String(fallbackPlayerId), { id: fallbackPlayerId, name: 'Jugador', city: '', phone: '' });
      }
    } catch (e) {
      uniquePlayersMap.set(String(fallbackPlayerId), { id: fallbackPlayerId, name: 'Jugador', city: '', phone: '' });
    }
  }

  const uniquePlayersCount = uniquePlayersMap.size;
  const uniquePlayers = Array.from(uniquePlayersMap.values());

  if (uniquePlayers.length === 0) {
    console.error(`[processBingoWin] Could not resolve any players for pattern ${gp.id}`);
    winLocks.delete(gp.id);
    return false;
  }

  // Acquire session lock immediately to prevent race conditions
  winLocks.add(gp.id);

  try {
    const pData: any = Array.isArray(gp.patterns) ? gp.patterns[0] : gp.patterns;
    const primaryWinner = uniquePlayers[0];
    const primaryCardNumber = winners[0]?.card?.card_number || null;

    // 1. IMMEDIATELY pause server autoplay and set timestamps (0ms delay!)
    serverAutoplay.isPausedForWinner = true;
    const pauseDurationMs = 22000;
    serverAutoplay.winnerPauseUntil = Date.now() + pauseDurationMs;
    serverAutoplay.lastAnnouncementTime = Date.now();
    const currentInterval = Math.max(8000, serverAutoplay.intervalMs || 8000);
    serverAutoplay.lastDrawTime = Date.now() + pauseDurationMs - currentInterval;

    const originalPrizeStr = String(gp.prize || '');
    const originalNumericPrize = parseInt(originalPrizeStr.replace(/[^0-9]/g, '')) || 0;
    const numericPrizePerPlayer = (originalNumericPrize > 0 && uniquePlayersCount > 0)
      ? Math.floor(originalNumericPrize / uniquePlayersCount)
      : 0;
    const prizePerPlayerStr = numericPrizePerPlayer > 0 ? `$${numericPrizePerPlayer.toLocaleString()}` : originalPrizeStr;

    const parseLetterArray = (val: any): any[] => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try {
          if (val.startsWith('{') && val.endsWith('}')) {
            return val.slice(1, -1).split(',').map(x => isNaN(Number(x)) ? x : Number(x));
          }
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {
          return val.replace(/[\[\]{}]/g, '').split(',').map(x => isNaN(Number(x)) ? x : Number(x));
        }
      }
      return [];
    };

    // Prepare data for multiple winners event
    const winnersData = winners.map(w => {
      const b = parseLetterArray(w.card.b);
      const i = parseLetterArray(w.card.i);
      const n = parseLetterArray(w.card.n);
      const g = parseLetterArray(w.card.g);
      const o = parseLetterArray(w.card.o);

      const pId = w.player?.id || w.card?.player_id || primaryWinner.id;
      const pName = w.player?.name || primaryWinner.name || 'Jugador';
      const pCity = w.player?.city || primaryWinner.city || '';

      return {
        player_id: pId,
        player_name: pName,
        player_city: pCity,
        card_number: w.card.card_number,
        grid: [
          [b[0], i[0], n[0], g[0], o[0]],
          [b[1], i[1], n[1], g[1], o[1]],
          [b[2], i[2], n[2], g[2], o[2]],
          [b[3], i[3], n[3], g[3], o[3]],
          [b[4], i[4], n[4], g[4], o[4]],
        ],
        marked_cells: w.winResult.marked_cells
      };
    });

    // 2. Persist winner in DB immediately and update in-memory pattern so all subsequent checks know it was won
    try {
      const { data: updatedPattern, error: winUpdateError } = await supabase.from('game_patterns')
        .update({
          winner_player_id: primaryWinner.id,
          winner_card_number: primaryCardNumber,
          won_at: new Date().toISOString()
        })
        .eq('id', gp.id)
        .is('winner_player_id', null)
        .select();

      if (winUpdateError) {
        console.error(`[processBingoWin] Error actualizando game_patterns ${gp.id}:`, winUpdateError);
      } else {
        console.log(`[processBingoWin] Patrón ${gp.id} marcado como ganado por jugador ${primaryWinner.id}`);
      }

      // Memory sync on the active gp object
      gp.winner_player_id = primaryWinner.id;
      gp.won_at = new Date().toISOString();
    } catch (dbErr) {
      console.error('[processBingoWin] DB update exception:', dbErr);
    }

    // Invalidate game cache so fullState reflects the new winner immediately
    invalidateGameCaches(game.id);

    // 3. Publish Bingo Event IMMEDIATELY to all players and admin (0ms delay!)
    getChannel().publish('bingo_called', {
      game_pattern_id: gp.id,
      winners: winnersData,
      pattern_name: pData?.name || 'Patrón',
      prize: gp.prize,
      shared_prize_per_player: prizePerPlayerStr,
      player_count: uniquePlayersCount,
      pattern_grid: pData?.grid
    }).catch(err => console.error('Error publishing bingo_called:', err));

    // Also broadcast full game update with winner reflected
    await broadcastGameUpdate(game.id);

    const winnerNames = uniquePlayers.map(p => p.name).join(', ');
    const prizeAnnouncement = uniquePlayersCount > 1
      ? `un premio compartido de ${originalPrizeStr} (${prizePerPlayerStr} c/u)`
      : (numericPrizePerPlayer > 0 ? `un premio de ${originalPrizeStr}` : `el premio: ${gp.prize}`);

    // Trigger celebratory voice announcement delayed by 7.5 seconds so Canto Bingo audio finishes first
    setTimeout(() => {
      broadcastVoiceAnnouncement(`¡Atención a todos los participantes! ¡Tenemos Bingo ganador! Felicitaciones a ${winnerNames} por ganar la figura ${pData?.name || 'del bingo'} y llevarse ${prizeAnnouncement}!`, 'Kore');
    }, 7500);

    // 4. Wallet crediting and notifications asynchronously in background
    (async () => {
      try {
        const settings = await getGameSettings(game.id);
        const isFreeGame = isGameFree(game, settings);
        const isWalletPrize = (settings.prize_type || 'wallet') === 'wallet';

        // Wallet Credit for Free Games & Wallet Prizes
        if ((isWalletPrize || isFreeGame) && originalNumericPrize > 0) {
          for (const player of uniquePlayers) {
            if (player.phone) {
              await updateWalletBalance(player.phone, numericPrizePerPlayer, `Premio compartido (${uniquePlayersCount}): ${pData?.name || 'Patrón'}`, 'prize');
              console.log(`Credited ${numericPrizePerPlayer} to wallet of player ${player.phone} for shared prize`);
            }
          }

          // Auto-approve payment status in history
          await supabase.from('game_patterns')
            .update({ payment_status: 'paid' })
            .eq('id', gp.id);
        }

        if (isFreeGame) {
          for (const player of uniquePlayers) {
            const wonAmount = numericPrizePerPlayer > 0 ? numericPrizePerPlayer : originalNumericPrize;
            persistFreeGamePrize({
              playerId: player.id,
              playerPhone: player.phone || null,
              playerName: player.name || null,
              gameId: game.id,
              gameName: game.name || `Bingo Gratis #${game.id}`,
              patternId: gp.pattern_id || null,
              patternName: pData?.name || 'Figura Ganadora',
              prizeAmount: wonAmount,
              prizeFormatted: `$${wonAmount.toLocaleString('es-CO')}`,
              notes: `Ganador en vivo de ${pData?.name || 'figura'} en juego gratis #${game.id}`,
              source: 'automatic',
              wonAt: new Date().toISOString()
            });
          }
        }
      } catch (bgErr) {
        console.error('[processBingoWin] Background DB/Wallet error:', bgErr);
      }
    })();

    return true;
  } catch (err: any) {
    console.error('[processBingoWin] Error:', err);
    winLocks.delete(gp.id);
    return false;
  }
}



// Helper for endGameCleanup
async function endGameCleanup(gameId: number, finalNote: string) {
  console.log(`--- RUNNING CLEANUP FOR GAME ${gameId} ---`);

  // 1. Mark game as finished
  await supabase.from('game').update({ status: 'finished' }).eq('id', gameId);

  // 2. Get winners history before deleting cards (optional, but keep patterns)
  const { data: gpWinners, error: gpSelectError } = await supabase.from('game_patterns')
    .select('winner_player_id, prize')
    .eq('game_id', gameId)
    .not('winner_player_id', 'is', null)
    .order('won_at', { ascending: true });

  if (gpSelectError) {

  }

  console.log(`--- endGameCleanup gpWinners for game ${gameId}:`, gpWinners);

  const formattedWinners: any[] = [];
  if (gpWinners && gpWinners.length > 0) {
    const playerIds = gpWinners.map((w: any) => w.winner_player_id).filter(Boolean);
    if (playerIds.length > 0) {
      const { data: playersList, error: pSelectError } = await supabase.from('players')
        .select('id, name')
        .in('id', playerIds);

      if (pSelectError) {
        // ignored
      }

      // Group winners
      const grouped = new Map();
      gpWinners.forEach(gp => {
        const playerObj = (playersList || []).find(p => String(p.id) === String(gp.winner_player_id));
        const pId = gp.winner_player_id;
        const prizeValue = Number(gp.prize?.replace(/[^0-9.-]+/g, "")) || 0;

        if (!grouped.has(pId)) {
          grouped.set(pId, {
            player_name: playerObj?.name || 'Invitado',
            prize: gp.prize || '',
            total_prize_num: prizeValue
          });
        } else {
          const existing = grouped.get(pId);
          existing.total_prize_num += prizeValue;
          existing.prize = `$${existing.total_prize_num}`;
        }
      });

      formattedWinners.push(...Array.from(grouped.values()).map(w => ({
        player_name: w.player_name,
        prize: w.prize
      })));
    }
  }

  // 3. Notify everyone and signal refresh
  await getChannel().publish('game_finished', {
    game_id: gameId,
    winners: formattedWinners,
    final_note: finalNote
  });

  // Deduplicate game finished notification
  const finishPushKey = `game_finished_${gameId}`;
  if (!sentPushLocks.has(finishPushKey)) {
    sentPushLocks.add(finishPushKey);
    // Keep lock for 5 minutes (game cleanup is permanent usually)
    setTimeout(() => sentPushLocks.delete(finishPushKey), 300000);

    sendPushNotification({
      recipient: 'all',
      title: '🏆 El juego ha finalizado',
      message: finalNote || 'El bingo ha terminado. ¡Gracias por participar y felicitaciones a los ganadores!'
    }).catch(() => { });
  }

  await getChannel().publish('games_updated', {});

  // 3b. Sincronizar permanentemente historial de ganadores o participaciones antes de limpiar cartones
  try {
    const { data: gameInfo } = await supabase.from('game').select('*').eq('id', gameId).maybeSingle();
    const gSettings = await getGameSettings(gameId);
    const wasFree = isGameFree(gameInfo, gSettings);

    if (wasFree) {
      // Si fue juego gratis, asegurar que todos los ganadores estén guardados en free_game_prizes
      const { data: fullPatterns } = await supabase.from('game_patterns')
        .select('id, pattern_id, winner_player_id, prize, won_at, patterns(name)')
        .eq('game_id', gameId)
        .not('winner_player_id', 'is', null);

      if (fullPatterns && fullPatterns.length > 0) {
        for (const fp of fullPatterns) {
          const pId = Number(fp.winner_player_id);
          const pAmount = parseInt(String(fp.prize || '0').replace(/[^0-9]/g, ''), 10) || 0;
          const patName = Array.isArray(fp.patterns) ? fp.patterns[0]?.name : (fp.patterns as any)?.name || 'Figura Ganadora';

          await persistFreeGamePrize({
            playerId: pId,
            gameId: gameId,
            gameName: gameInfo?.name || `Bingo Gratis #${gameId}`,
            patternId: fp.pattern_id || null,
            patternName: patName,
            prizeAmount: pAmount,
            prizeFormatted: fp.prize || `$${pAmount.toLocaleString('es-CO')}`,
            notes: `Consolidación de fin de juego #${gameId}`,
            source: 'automatic',
            wonAt: fp.won_at || new Date().toISOString()
          });
        }
      }
    } else {
      // Si fue juego pago, asegurar que todos los participantes tengan su conteo preservado antes de borrar cards
      const { data: cardsInGame } = await supabase.from('cards').select('player_id').eq('game_id', gameId);
      if (cardsInGame && cardsInGame.length > 0) {
        const uniquePids = Array.from(new Set(cardsInGame.map(c => Number(c.player_id)).filter(Boolean)));
        for (const pid of uniquePids) {
          await recordPaidGameParticipation(pid, gameId);
        }
      }
    }
  } catch (syncErr) {
    console.error('[endGameCleanup] Error sincronizando histórico de fin de juego:', syncErr);
  }

  // 4. Delete all cards for this game
  await supabase.from('cards').delete().eq('game_id', gameId);

  // 5. Reset player session flags
  // We clear card_count to "reset" the platform active cards, but keep receipt_url history.
  await supabase.from('players').update({
    card_count: 0,
    status: 'pending'
  }).neq('phone', '0000000000');

  console.log(`--- CLEANUP COMPLETED FOR GAME ${gameId} ---`);
}

// Global concurrency lock and interval enforcement to guarantee balls are drawn strictly one by one
// and respect the minimum 8-second interval required for locution and gameplay.
let isGloballyDrawingBall = false;
let lastGlobalBallDrawTime = 0;
const MIN_DRAW_INTERVAL_MS = 8000;

// Function to draw the next ball automatically
async function drawNextBall(game: any, isManual: boolean = false) {
  const now = Date.now();
  const timeSinceLastDraw = now - lastGlobalBallDrawTime;

  if (isGloballyDrawingBall) {
    console.log('[drawNextBall] Skipping concurrent draw execution');
    return { error: 'Draw already in progress' };
  }

  // SHIELD: Strictly enforce 8-second interval unless admin explicitly sets higher
  const minInterval = 8000;
  if (timeSinceLastDraw < minInterval) {
    const waitRemaining = Math.ceil((minInterval - timeSinceLastDraw) / 1000);
    console.log(`[drawNextBall] Rate limit triggered: please wait ${waitRemaining}s`);
    return { error: `Intervalo de seguridad activo. Por favor espera ${waitRemaining} segundos para la siguiente balota.` };
  }

  isGloballyDrawingBall = true;
  // IMMEDIATE TIMESTAMP UPDATE to occupy the time slot and prevent rapid successive calls
  lastGlobalBallDrawTime = now;
  if (serverAutoplay.gameId === game.id) {
    serverAutoplay.lastDrawTime = now;
  }

  try {
    // Audit: Re-fetch latest game state from DB to avoid stale data (race conditions with manual draws)
    const { data: freshGame, error: fetchError } = await supabase.from('game').select('*').eq('id', game.id).single();
    if (fetchError || !freshGame) {
      console.error('[drawNextBall] Error fetching fresh game state:', fetchError);
      return { error: 'Error al obtener estado del juego' };
    }

    invalidateAutoplayCache();
    let drawnBalls = freshGame.drawn_balls || [];
    if (typeof drawnBalls === 'string') {
      try {
        drawnBalls = JSON.parse(drawnBalls);
      } catch (e) {
        drawnBalls = [];
      }
    }

    if (!Array.isArray(drawnBalls)) {
      console.warn('drawn_balls is not an array, resetting to empty');
      drawnBalls = [];
    }

    if (drawnBalls.length >= 75) {
      return { error: 'All balls drawn' };
    }

    // Pure uniform random selection from remaining available balls (1 to 75)
    const remainingBalls: number[] = [];
    for (let b = 1; b <= 75; b++) {
      if (!drawnBalls.includes(b)) {
        remainingBalls.push(b);
      }
    }

    if (remainingBalls.length === 0) {
      return { error: 'All balls drawn' };
    }

    const randomIndex = Math.floor(Math.random() * remainingBalls.length);
    const newBall = remainingBalls[randomIndex];

    drawnBalls.push(newBall);

    // Check if autoplay was stopped while we were preparing the draw
    // (only relevant if called from the autonomous engine)
    if (serverAutoplay.gameId === game.id && !serverAutoplay.isRunning && !isManual) {
      console.log(`[Autoplay] Draw aborted for ball ${newBall} as autoplay was stopped.`);
      return { error: 'Autoplay stopped' };
    }

    const { error: updateError } = await supabase.from('game').update({
      drawn_balls: drawnBalls,
      status: 'playing'
    }).eq('id', game.id);

    if (updateError) {
      return { error: updateError.message };
    }

    // 1. BROADCAST IMMEDIATELY to users so locution starts exactly on time
    // We send the ball number AND the full state with all patterns updated with that ball
    await getChannel().publish('ball_drawn', String(newBall));

    // SHIELD: Build full state with patterns so figures in play never disappear
    const fullState = await getGameFullState(game.id);
    if (fullState) {
      fullState.drawn_balls = drawnBalls;
      fullState.status = 'playing';
      await broadcastGameUpdate(game.id, fullState);
    } else {
      freshGame.drawn_balls = drawnBalls;
      freshGame.status = 'playing';
      await broadcastGameUpdate(game.id, freshGame);
    }
    console.log(`Ball drawn and broadcasted: ${newBall} for game ${game.id}`);

    // 2. Sync autoplay timer immediately after broadcast
    // (This ensures the next 8s interval starts counting FROM this moment)
    const finalNow = Date.now();
    lastGlobalBallDrawTime = finalNow;
    if (serverAutoplay.gameId === game.id) {
      serverAutoplay.lastDrawTime = finalNow;
    }

    // 3. Perform winner checking asynchronously so drawNextBall returns IMMEDIATELY
    // and never delays the 8s ball interval or causes queue backlogs
    (async () => {
      try {
        const { data: gamePatterns } = await supabase.from('game_patterns')
          .select('*, patterns(grid, name)')
          .eq('game_id', game.id)
          .is('winner_player_id', null)
          .order('id', { ascending: true });

        if (gamePatterns && gamePatterns.length > 0) {
          // Motor de Alta Escala: Carga paginada en RAM que rompe el límite de 1.000 filas
          const gameCards = await getOrFetchAllGameCards(game.id);

          if (gameCards && gameCards.length > 0) {
            const drawnSet = new Set<number>(drawnBalls.map(Number));
            const t0 = Date.now();

            for (const gp of gamePatterns) {
              if (gp.winner_player_id) continue;

              let pGrid = gp.patterns?.grid;
              let pName = gp.patterns?.name;
              if (Array.isArray(gp.patterns) && gp.patterns.length > 0) {
                pGrid = gp.patterns[0].grid;
                pName = gp.patterns[0].name;
              }

              if (!pGrid) {
                console.warn(`No grid found for pattern ${pName || gp.id}, skipping.`);
                continue;
              }

              const safePGrid = getSafePatternGrid(pGrid);
              const winnersForGP: any[] = [];

              for (const card of gameCards) {
                const winResult = checkCardPatternFast(card, safePGrid, drawnSet);
                if (winResult.won) {
                  console.log(`[Bingo HighScale] Bingo detectado para cartón #${card.card_number} (Jugador: ${card.player?.name}) en patrón ${pName || gp.id}`);
                  winnersForGP.push({ card, player: card.player, winResult });
                }
              }

              const evalDuration = Date.now() - t0;
              if (evalDuration > 25) {
                console.log(`[HighScaleEngine] Evaluación de ${gameCards.length} cartones completada en ${evalDuration}ms.`);
              }

              if (winnersForGP.length > 0) {
                try {
                  const won = await processBingoWin(game, gp, winnersForGP);
                  if (won) {
                    console.log(`[HighScaleEngine] Patrón ${gp.id} procesado con éxito. Pausando sorteo para celebración.`);
                    break; // Stop evaluating further patterns on this ball: celebrate this figure first!
                  }
                } catch (winErr) {
                  console.error('Error processing bingo win:', winErr);
                }
              }
            }

            // Check if all patterns for this game have been won
            const { data: allGamePatterns } = await supabase.from('game_patterns')
              .select('id, winner_player_id')
              .eq('game_id', game.id);

            if (allGamePatterns && allGamePatterns.length > 0) {
              const unwonPatterns = allGamePatterns.filter(p => !p.winner_player_id);
              if (unwonPatterns.length === 0) {
                console.log(`All ${allGamePatterns.length} patterns won for game ${game.id}. Completing game after full celebration pause.`);
                if (!serverAutoplay.isRunning) {
                  // In manual mode, wait 22 seconds before ending game so winner locution is fully respected
                  setTimeout(async () => {
                    await endGameCleanup(game.id, game.final_note || "");
                  }, 22000);
                }
              }
            }
          }
        }
      } catch (checkErr) {
        console.error('[drawNextBall] Async winner check notice:', checkErr);
      }
    })();

    return { ball: newBall };
  } finally {
    isGloballyDrawingBall = false;
  }
}

// Draw Ball
app.post('/api/game/draw', requireAdmin, async (req, res) => {
  console.log('[API] DRAW: Start');
  try {
    let game = await getActiveGame();

    if (!game) {
      console.warn('[Draw] No active game');
      return res.status(404).json({ error: 'No hay juego activo para sortear' });
    }

    if (serverAutoplay.isPausedForWinner && Date.now() < serverAutoplay.winnerPauseUntil) {
      const remaining = Math.ceil((serverAutoplay.winnerPauseUntil - Date.now()) / 1000);
      return res.status(400).json({ error: `Celebración de ganador en curso. Por favor espera ${remaining} segundos para continuar.` });
    }

    const drawResult = await drawNextBall(game, true);
    if (drawResult.error) {
      console.warn(`[Draw] Result-level error: ${drawResult.error}`);
      return res.status(400).json({ error: drawResult.error });
    }

    console.log(`[Draw] SUCCESS: Ball ${drawResult.ball}`);
    invalidateGameCaches();
    res.json({ ball: drawResult.ball });
  } catch (err: any) {
    console.log('[Draw] SERVER EXCEPTION:', err);
    res.status(500).json({ error: 'Error del servidor al sortear. Reportado el incidente.' });
  }
});

// Reset Game
app.post('/api/game/reset', requireAdmin, async (req, res) => {
  let game = await getActiveGame();

  if (!game) return res.status(404).json({ error: 'No active game' });

  await supabase.from('game').update({ drawn_balls: [], status: 'waiting' }).eq('id', game.id);
  await supabase.from('game_patterns').update({ winner_player_id: null, won_at: null }).eq('game_id', game.id);
  winLocks.clear(); // Clear win locks on reset
  currentDjBgState = {
    url: null,
    command: 'stop',
    name: '',
    volume: 0.6,
    timestamp: Date.now()
  };
  try {
    await getChannel().publish('play_dj_bg', currentDjBgState);
  } catch (e) { }

  invalidateGameCaches();
  await broadcastGameUpdate(game.id);
  res.json({ success: true });
});

async function generateCardsForPlayer(playerId: number, gameId: number, cardCount: number, isReserved: boolean = false, deleteExisting: boolean = true) {
  // First, delete any existing cards for this player and game to prevent duplicates if called multiple times
  if (deleteExisting) {
    await supabase.from('cards').delete().eq('player_id', playerId).eq('game_id', gameId);
  }

  const gameSettings = await getGameSettings(gameId);
  const numDigits = parseInt(String(gameSettings.lottery_digits || '3'), 10) || 3;

  const { data: maxCard } = await supabase.from('cards')
    .select('card_number')
    .order('card_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextCardNum = 1;
  if (maxCard && !isNaN(parseInt(maxCard.card_number))) {
    nextCardNum = parseInt(maxCard.card_number) + 1;
  }

  // Get existing lottery codes to ensure uniqueness for this game
  const { data: existingCodes } = await supabase.from('cards')
    .select('status, lottery_code')
    .eq('game_id', gameId);
  const usedCodes = new Set((existingCodes || []).map(c => c.status || c.lottery_code || ''));

  function generateUniqueLotteryCode() {
    const maxVal = Math.pow(10, numDigits);
    let code = '';
    let attempts = 0;
    do {
      const rand = Math.floor(Math.random() * maxVal);
      code = rand.toString().padStart(numDigits, '0');
      attempts++;
      if (attempts > 10000) break;
    } while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
  }

  const cardsToInsert = [];
  const lotteryInPlayToInsert: any[] = [];

  for (let i = 0; i < cardCount; i++) {
    const card = isReserved ? null : generateBingoCard();
    const lCode = generateUniqueLotteryCode();
    const cNum = isReserved ? `RESERVADO-${gameId}-${Math.random().toString(36).substring(2, 7)}` : nextCardNum.toString().padStart(4, '0');

    const cardData: any = {
      player_id: playerId,
      game_id: gameId,
      card_number: cNum,
      lottery_code: lCode,
      status: lCode,
      b: card ? card.B : [],
      i: card ? card.I : [],
      n: card ? card.N : [],
      g: card ? card.G : [],
      o: card ? card.O : []
    };
    cardsToInsert.push(cardData);

    if (!isReserved) {
      lotteryInPlayToInsert.push({
        player_id: playerId,
        game_id: gameId,
        lottery_code: lCode,
        card_number: cNum
      });
      nextCardNum++;
    }
  }

  if (cardsToInsert.length > 0) {
    console.log(`Debug: Inserting ${cardsToInsert.length} cards for player ${playerId} with ${numDigits} lottery digits`);
    const { error: insertError } = await supabase.from('cards').insert(cardsToInsert);
    if (insertError) {
      console.warn('Failed inserting cards with lottery_code, retrying without lottery_code and using status instead:', insertError.message);
      // Fallback: Copy lottery_code to status column, and remove lottery_code property
      const safeCardsToInsert = cardsToInsert.map(c => {
        const copy = { ...c };
        copy.status = c.lottery_code; // Store it in status column!
        delete copy.lottery_code;
        return copy;
      });
      const { error: retryError } = await supabase.from('cards').insert(safeCardsToInsert);
      if (retryError) {
        console.error('Fatal retry error inserting cards:', retryError);
      } else {
        console.log('Cards inserted successfully via fallback using status column!');
      }
    } else {
      console.log('Debug: Cards inserted successfully');
    }

    // Try auto-inserting to lottery_numbers_in_play
    if (lotteryInPlayToInsert.length > 0) {
      try {
        await supabase.from('lottery_numbers_in_play').insert(lotteryInPlayToInsert);
      } catch (e) { }
    }

    // Invalidar caché de cartones en RAM para que el motor de sorteo los indexe
    invalidateGameCardsCache(gameId);

    // Registrar participación en juego pago si corresponde (para el contador del premio $300K)
    try {
      recordPaidGameParticipation(playerId, gameId).catch(console.error);
    } catch (e) { }
  }
}

// Assign a reserved card to a game (generate numbers)
app.post('/api/cards/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get the reserved card
    const { data: card, error: fetchError } = await supabase.from('cards')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !card) return res.status(404).json({ error: 'Tarjeta no encontrada' });
    if (!String(card.card_number || '').startsWith('RESERVADO')) return res.status(400).json({ error: 'Esta tarjeta ya está asignada' });

    // Validar autorización de asignación: el usuario debe ser el titular del cartón o un administrador
    const authUser = await getAuthenticatedUser(req);
    if (authUser) {
      if (authUser.role === 'player') {
        const cardPhone = normalizePhone(card.player_phone || '');
        const authPhone = normalizePhone(authUser.phone || '');
        if (cardPhone && authPhone && cardPhone !== authPhone) {
          return res.status(403).json({ error: 'Acceso denegado: No puedes asignar un cartón perteneciente a otro jugador.' });
        }
      } else if (authUser.role === 'admin' && !authUser.isSuperAdmin) {
        if (card.tenant_id && card.tenant_id.toLowerCase() !== (authUser.tenant_id || '').toLowerCase()) {
          return res.status(403).json({ error: 'Acceso denegado: Este cartón pertenece a otra sala.' });
        }
      }
    }

    // 2. Check if the game is still valid for assignment (waiting, scheduled, playing, or paused)
    const { data: game } = await supabase.from('game').select('status').eq('id', card.game_id).single();
    if (!game || !['waiting', 'scheduled', 'playing', 'paused'].includes(game.status)) {
      return res.status(400).json({ error: 'El juego ya ha finalizado o no es válido' });
    }

    // 3. Generate a real card number
    const { data: maxCard } = await supabase.from('cards')
      .select('card_number')
      .not('card_number', 'ilike', 'RESERVADO%')
      .order('card_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextCardNum = 1;
    if (maxCard && !isNaN(parseInt(maxCard.card_number))) {
      nextCardNum = parseInt(maxCard.card_number) + 1;
    }

    // Ensure lottery_code exists or update it if needed
    // Typically it should already have one from reservation, but let's re-verify or generate if missing
    let lotteryCode = card.lottery_code || card.status;
    if (!lotteryCode) {
      const { data: existingCodes } = await supabase.from('cards').select('*');
      const usedCodes = new Set((existingCodes || []).map(c => c.status || c.lottery_code || ''));
      do {
        lotteryCode = Math.floor(1000 + Math.random() * 9000).toString();
      } while (usedCodes.has(lotteryCode));
    }

    const newCard = generateBingoCard();
    const updatePayload: any = {
      card_number: nextCardNum.toString().padStart(4, '0'),
      b: newCard.B,
      i: newCard.I,
      n: newCard.N,
      g: newCard.G,
      o: newCard.O
    };

    updatePayload.lottery_code = lotteryCode;

    let updatedCard: any = null;
    let updateError: any = null;

    const { data: resCard, error: firstErr } = await supabase.from('cards')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (firstErr) {
      console.warn('Update with lottery_code failed, retrying using status instead:', firstErr.message);
      delete updatePayload.lottery_code;
      updatePayload.status = lotteryCode;
      const { data: retryCard, error: retryError } = await supabase.from('cards')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (retryError) {
        updateError = retryError;
      } else {
        updatedCard = retryCard;
      }
    } else {
      updatedCard = resCard;
    }

    if (updateError) throw updateError;

    res.json(updatedCard);
  } catch (err: any) {

    res.status(500).json({ error: err.message });
  }
});

// Helper to get Colombia date and time details
function getColombiaDateInfo() {
  const now = new Date();
  const colombiaFormatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = colombiaFormatter.formatToParts(now);
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';

  const monthNamesEs = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = monthNamesEs[monthIndex] || '';

  return {
    formattedDate: `${day}/${month}/${year}`,
    day,
    month,
    year,
    monthName,
    fullDescription: `${weekday} ${day} de ${monthName} de ${year}`,
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
    currentTimeStr: `${hour}:${minute}`
  };
}

// Helper to parse date string from Nequi
function checkIsDateTodayInColombia(dateStr: string, colDate: { day: string, month: string, year: string, monthName: string }): boolean {
  if (!dateStr || dateStr === 'NONE') return false;
  const clean = dateStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const colDay = parseInt(colDate.day, 10);
  const colYear = parseInt(colDate.year, 10);
  const colMonth = parseInt(colDate.month, 10);
  const colMonthName = colDate.monthName.toLowerCase();

  // Extract all numbers
  const nums = clean.match(/\d+/g);
  if (!nums || nums.length < 1) return false;

  // Check if today's day number is present
  const hasDay = nums.some(n => parseInt(n, 10) === colDay);
  if (!hasDay) return false;

  // If year is present, it must match current year
  const hasWrongYear = nums.some(n => n.length === 4 && parseInt(n, 10) !== colYear);
  if (hasWrongYear) return false;

  // Check month
  const hasMonthName = clean.includes(colMonthName) || clean.includes(colMonthName.substring(0, 3));
  const hasMonthNum = nums.some(n => parseInt(n, 10) === colMonth);
  if (!hasMonthName && !hasMonthNum) return false;

  return true;
}

// Helper to parse time string and check if within 90 minutes window
function checkIsTimeWithinWindow(timeStr: string, currentHour: number, currentMinute: number, maxMinutesDiff: number = 240): boolean {
  if (!timeStr || timeStr === 'NONE') return true;

  const clean = timeStr.toLowerCase().replace(/\s+/g, ' ').trim();
  const isPM = clean.includes('p') || clean.includes('pm') || clean.includes('p. m.') || clean.includes('p.m.');
  const isAM = clean.includes('a') || clean.includes('am') || clean.includes('a. m.') || clean.includes('a.m.');

  const timeMatch = clean.match(/(\d{1,2})[:.](\d{1,2})/);
  if (!timeMatch) return true;

  let h = parseInt(timeMatch[1], 10);
  const m = parseInt(timeMatch[2], 10);

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  const receiptTotalMinutes = h * 60 + m;
  const currentTotalMinutes = currentHour * 60 + currentMinute;

  const diffMinutes = currentTotalMinutes - receiptTotalMinutes;

  // Allow clock skew up to -60 mins or positive age up to maxMinutesDiff (240 mins)
  return diffMinutes >= -60 && diffMinutes <= maxMinutesDiff;
}

interface ReceiptAuditResult {
  isNequi: boolean;
  detectedContent: string;
  isUnrelatedImage: boolean;
  isAltered: boolean;
  isBlurry: boolean;
  reference: string;
  extractedAmount: number;
  receiptDate: string;
  receiptTime: string;
  recipientName: string;
  destinationAccount: string;
  destinationBank: string;
  transferType: string;
  sourceStatus: string;
  hasQrCode: boolean;
  qrMatchesPrintedData: boolean;
  qrMismatchReason: string;
  isDateToday: boolean;
  isWithinOneHour: boolean;
  isDuplicate: boolean;
  isSilentlyInvalid: boolean;
  silentReason: string;
  immediateRejectionMessage: string | null;
  qrDecoded?: boolean;
  qrPayload?: string | null;
  qrValidationDetails?: {
    matches: string[];
    mismatches: string[];
    qrAmount?: number;
    qrDate?: string;
    qrRecipient?: string;
    qrReference?: string;
  };
}

// Decode QR code directly from image pixel buffer using Jimp + jsQR
async function decodeQrFromImageBuffer(buffer: Buffer): Promise<{ hasDecodedQr: boolean; decodedPayload: string | null }> {
  try {
    const image = await Jimp.read(buffer);
    const { width, height } = image.bitmap;

    // 1. Direct pass on native resolution
    let qr = jsQR(new Uint8ClampedArray(image.bitmap.data), width, height, {
      inversionAttempts: 'attemptBoth'
    });

    if (qr && qr.data && qr.data.trim()) {
      console.log('[QR Decoder] Successfully decoded QR code (native):', qr.data.substring(0, 100));
      return { hasDecodedQr: true, decodedPayload: qr.data.trim() };
    }

    // 2. Second pass: resize large high-res screenshot
    if (width > 1000 || height > 1000) {
      const cloned = image.clone();
      const scale = Math.min(1000 / width, 1000 / height);
      const newW = Math.round(width * scale);
      const newH = Math.round(height * scale);
      cloned.resize({ w: newW, h: newH });
      qr = jsQR(new Uint8ClampedArray(cloned.bitmap.data), cloned.bitmap.width, cloned.bitmap.height, {
        inversionAttempts: 'attemptBoth'
      });
      if (qr && qr.data && qr.data.trim()) {
        console.log('[QR Decoder] Successfully decoded QR code (resized):', qr.data.substring(0, 100));
        return { hasDecodedQr: true, decodedPayload: qr.data.trim() };
      }
    }

    // 3. Third pass: crop to center/lower region where Nequi renders verification QR
    if (height > 400 && width > 300) {
      const cloned = image.clone();
      const cropW = Math.round(width * 0.85);
      const cropH = Math.round(height * 0.65);
      const cropX = Math.round(width * 0.075);
      const cropY = Math.round(height * 0.20);
      cloned.crop({ x: cropX, y: cropY, w: cropW, h: cropH });
      qr = jsQR(new Uint8ClampedArray(cloned.bitmap.data), cloned.bitmap.width, cloned.bitmap.height, {
        inversionAttempts: 'attemptBoth'
      });
      if (qr && qr.data && qr.data.trim()) {
        console.log('[QR Decoder] Successfully decoded QR code (cropped):', qr.data.substring(0, 100));
        return { hasDecodedQr: true, decodedPayload: qr.data.trim() };
      }
    }

    return { hasDecodedQr: false, decodedPayload: null };
  } catch (err: any) {
    console.warn('[QR Decoder] Info:', err?.message || err);
    return { hasDecodedQr: false, decodedPayload: null };
  }
}

interface DecodedQrValidationResult {
  isValid: boolean;
  mismatches: string[];
  matches: string[];
  qrAmount: number | null;
  qrDateStr: string | null;
  qrReference: string | null;
  qrRecipient: string | null;
}

// Robust parser for Colombian currency amounts with or without two-decimal cents (,00 or .00)
function parseAmountWithDecimals(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return Math.round(val);
  }
  let str = String(val).trim();
  if (!str) return 0;

  // 1. Remove currency symbols ($), letters, spaces
  str = str.replace(/[^0-9.,]/g, '');

  // 2. Handle 2-digit decimal cents at end (e.g., "1.000,00" -> "1.000", "1000,00" -> "1000", "2.000.00" -> "2.000")
  if (/[,.][0-9]{2}$/.test(str)) {
    str = str.slice(0, -3);
  }

  // 3. Remove all remaining thousands separator dots or commas
  str = str.replace(/[^0-9]/g, '');

  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// Cross-validate decoded QR payload against printed receipt data (amount, date, recipient, reference)
function parseAndValidateQrPayload(
  rawPayload: string,
  printedAmount: number,
  expectedAmount: number,
  printedDate: string,
  printedRecipient: string,
  printedReference: string,
  colombiaDate: { day: string | number; month: string | number; year: string | number; formattedDate: string }
): DecodedQrValidationResult {
  const mismatches: string[] = [];
  const matches: string[] = [];

  const payload = rawPayload.trim();
  let parsedJson: any = null;
  let queryParams: URLSearchParams | null = null;

  try {
    if (payload.startsWith('{') && payload.endsWith('}')) {
      parsedJson = JSON.parse(payload);
    } else if (payload.startsWith('http://') || payload.startsWith('https://')) {
      const u = new URL(payload);
      queryParams = u.searchParams;
      const dataParam = u.searchParams.get('data') || u.searchParams.get('payload') || u.searchParams.get('d');
      if (dataParam) {
        try {
          const decoded = Buffer.from(dataParam, 'base64').toString('utf8');
          if (decoded.startsWith('{')) parsedJson = JSON.parse(decoded);
        } catch (_) { }
      }
    } else if (payload.includes('=')) {
      queryParams = new URLSearchParams(payload);
    }
  } catch (_) { }

  // 1. Extraer y contrastar Monto
  let qrAmount: number | null = null;
  if (parsedJson) {
    const val = parsedJson.amount ?? parsedJson.valor ?? parsedJson.val ?? parsedJson.monto ?? parsedJson.v;
    if (val !== undefined && val !== null) {
      qrAmount = parseAmountWithDecimals(val);
    }
  } else if (queryParams) {
    const val = queryParams.get('val') || queryParams.get('valor') || queryParams.get('amount') || queryParams.get('monto') || queryParams.get('v');
    if (val) {
      qrAmount = parseAmountWithDecimals(val);
    }
  }

  if (qrAmount === null || isNaN(qrAmount)) {
    const amountRegex = /(?:valor|amount|monto|val|v)[:=]?\s*\$?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i;
    const match = payload.match(amountRegex);
    if (match && match[1]) {
      qrAmount = parseAmountWithDecimals(match[1]);
    }
  }

  if (qrAmount !== null && !isNaN(qrAmount) && qrAmount > 0) {
    if (printedAmount > 0 && qrAmount !== printedAmount) {
      mismatches.push(`Monto en QR ($${qrAmount.toLocaleString('es-CO')}) no coincide con el valor impreso en el comprobante ($${printedAmount.toLocaleString('es-CO')})`);
    } else if (expectedAmount > 0 && qrAmount !== expectedAmount) {
      mismatches.push(`Monto en QR ($${qrAmount.toLocaleString('es-CO')}) no coincide con el valor de los cartones solicitados ($${expectedAmount.toLocaleString('es-CO')})`);
    } else {
      matches.push(`Monto en QR ($${qrAmount.toLocaleString('es-CO')}) coincide exactamente`);
    }
  }

  // 2. Extraer y contrastar Referencia
  let qrReference: string | null = null;
  if (parsedJson) {
    const r = parsedJson.reference ?? parsedJson.referencia ?? parsedJson.ref ?? parsedJson.id;
    if (r) qrReference = String(r).trim();
  } else if (queryParams) {
    const r = queryParams.get('ref') || queryParams.get('referencia') || queryParams.get('reference') || queryParams.get('id');
    if (r) qrReference = r.trim();
  }

  if (!qrReference) {
    const refRegex = /(?:ref|referencia|id)[:=]?\s*([M|m]?[0-9]{6,12})/i;
    const match = payload.match(refRegex);
    if (match && match[1]) {
      qrReference = match[1].trim();
    } else if (printedReference && printedReference !== 'NONE' && printedReference.length >= 5) {
      if (payload.toLowerCase().includes(printedReference.toLowerCase())) {
        qrReference = printedReference;
      }
    }
  }

  if (qrReference && printedReference && printedReference !== 'NONE') {
    const cleanQrRef = qrReference.replace(/^M/i, '').toLowerCase();
    const cleanPrintedRef = printedReference.replace(/^M/i, '').toLowerCase();
    if (cleanQrRef && cleanPrintedRef && !cleanQrRef.includes(cleanPrintedRef) && !cleanPrintedRef.includes(cleanQrRef)) {
      mismatches.push(`Referencia en QR (#${qrReference}) no coincide con la impresa (#${printedReference})`);
    } else {
      matches.push(`Referencia en QR (#${printedReference}) coincide exactamente`);
    }
  }

  // 3. Extraer y contrastar Fecha
  let qrDateStr: string | null = null;
  if (parsedJson) {
    const d = parsedJson.date ?? parsedJson.fecha ?? parsedJson.f ?? parsedJson.timestamp;
    if (d) qrDateStr = String(d).trim();
  } else if (queryParams) {
    const d = queryParams.get('fecha') || queryParams.get('date') || queryParams.get('f') || queryParams.get('timestamp');
    if (d) qrDateStr = d.trim();
  }

  if (!qrDateStr) {
    const dateMatch = payload.match(/(?:fecha|date)[:=]?\s*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2}|[0-9]{2}[-/][0-9]{2}[-/][0-9]{4}|[0-9]{8})/i);
    if (dateMatch && dateMatch[1]) {
      qrDateStr = dateMatch[1];
    }
  }

  if (qrDateStr) {
    const todayY = String(colombiaDate.year);
    const todayM = String(colombiaDate.month).padStart(2, '0');
    const todayD = String(colombiaDate.day).padStart(2, '0');

    if (/^[0-9]{10,13}$/.test(qrDateStr)) {
      let ts = parseInt(qrDateStr, 10);
      if (ts < 10000000000) ts *= 1000;
      const d = new Date(ts);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      if (String(y) !== todayY || m !== todayM || Math.abs(parseInt(day, 10) - parseInt(todayD, 10)) > 1) {
        mismatches.push(`Fecha en QR (${y}-${m}-${day}) no corresponde a hoy (${colombiaDate.formattedDate})`);
        return { isValid: false, mismatches, matches, qrAmount, qrDateStr, qrReference, qrRecipient: null };
      } else {
        matches.push(`Fecha de emisión en QR certificada de hoy`);
      }
    } else {
      const hasTodayYear = qrDateStr.includes(todayY);
      const hasTodayMonth = qrDateStr.includes(todayM);
      const hasTodayDay = qrDateStr.includes(todayD);

      if (!hasTodayYear || (!hasTodayDay && !qrDateStr.includes(`${todayD}-${todayM}`))) {
        mismatches.push(`Fecha en QR (${qrDateStr}) no corresponde al día de hoy (${colombiaDate.formattedDate})`);
        return { isValid: false, mismatches, matches, qrAmount, qrDateStr, qrReference, qrRecipient: null };
      } else {
        matches.push(`Fecha en QR (${qrDateStr}) certificada de hoy`);
      }
    }
  }

  // 4. Extraer y contrastar Destinatario
  let qrRecipient: string | null = null;
  if (parsedJson) {
    const dest = parsedJson.destination ?? parsedJson.destinatario ?? parsedJson.para ?? parsedJson.celular ?? parsedJson.phone ?? parsedJson.dest;
    if (dest) qrRecipient = String(dest).trim();
  } else if (queryParams) {
    const dest = queryParams.get('para') || queryParams.get('dest') || queryParams.get('destinatario') || queryParams.get('phone') || queryParams.get('celular');
    if (dest) qrRecipient = dest.trim();
  }

  if (qrRecipient && printedRecipient && printedRecipient !== 'NONE') {
    const cleanQrRec = qrRecipient.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPrintedRec = printedRecipient.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (/^[0-9]{7,12}$/.test(cleanQrRec)) {
      const printedNums = cleanPrintedRec.replace(/[^0-9]/g, '');
      if (printedNums && printedNums.length >= 7 && !cleanQrRec.includes(printedNums) && !printedNums.includes(cleanQrRec)) {
        mismatches.push(`Destinatario/Cuenta en QR (${qrRecipient}) no coincide con el impreso (${printedRecipient})`);
      } else {
        matches.push(`Cuenta destinataria en QR verificada (${qrRecipient})`);
      }
    } else if (cleanQrRec.length >= 4 && cleanPrintedRec.length >= 4) {
      const qrWords = qrRecipient.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !w.includes('*'));
      const printedWords = printedRecipient.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !w.includes('*'));
      let wordMatched = false;
      for (const qw of qrWords) {
        if (cleanPrintedRec.includes(qw)) {
          wordMatched = true;
          break;
        }
      }
      for (const pw of printedWords) {
        if (cleanQrRec.includes(pw)) {
          wordMatched = true;
          break;
        }
      }
      if (qrWords.length > 0 && printedWords.length > 0 && !wordMatched) {
        mismatches.push(`Destinatario en QR (${qrRecipient}) no coincide con el impreso en el comprobante (${printedRecipient})`);
      } else if (wordMatched) {
        matches.push(`Destinatario en QR (${qrRecipient}) verificado y coincidente`);
      }
    }
  }

  return {
    isValid: mismatches.length === 0,
    mismatches,
    matches,
    qrAmount,
    qrDateStr,
    qrReference,
    qrRecipient
  };
}

// Complete Gemini Vision audit for receipts with QR verification, strict date, hour, recipient, and amount checks
async function auditReceiptWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
  expectedAmount: number
): Promise<ReceiptAuditResult> {
  const colombiaDate = getColombiaDateInfo();
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // AGGRESSIVE ANTI-FRAUD PRE-CHECK: Duplicate Hash
  if (supabase && fileHash) {
    const searchHashPattern = `%#hash#${fileHash}#hash#%`;
    const { data: hashPlayers } = await supabase
      .from('players')
      .select('id, name, phone')
      .ilike('receipt_url', searchHashPattern)
      .limit(1);

    if (hashPlayers && hashPlayers.length > 0) {
      const reason = `Esta misma captura/imagen de comprobante ya fue subida previamente por otro usuario (${hashPlayers[0].name || 'usuario registrado'}). No se permite reutilizar imágenes.`;
      return {
        isNequi: true,
        detectedContent: 'comprobante reutilizado',
        isUnrelatedImage: false,
        isAltered: false,
        isBlurry: false,
        reference: 'NONE',
        extractedAmount: 0,
        receiptDate: 'NONE',
        receiptTime: 'NONE',
        recipientName: 'NONE',
        destinationAccount: 'NONE',
        destinationBank: 'NONE',
        transferType: 'NONE',
        sourceStatus: 'NONE',
        hasQrCode: false,
        qrMatchesPrintedData: false,
        qrMismatchReason: '',
        isDateToday: false,
        isWithinOneHour: false,
        isDuplicate: true,
        isSilentlyInvalid: true,
        silentReason: reason,
        immediateRejectionMessage: `❌ COMPROBANTE REUTILIZADO:\n\n${reason}\n\nPor favor realiza una nueva transferencia y sube tu propio comprobante.`
      };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;

  // Execute digital QR decoder from image pixel buffer first (~140ms)
  const decodedQr = await decodeQrFromImageBuffer(fileBuffer);
  const hasHardwareQr = decodedQr.hasDecodedQr;
  let qrRefDetected: string | null = null;

  // AGGRESSIVE ANTI-FRAUD PRE-CHECK: Duplicate Reference from QR
  if (supabase && hasHardwareQr && decodedQr.decodedPayload) {
    const payload = decodedQr.decodedPayload;
    const refMatch = payload.match(/(?:ref|referencia|id)[:=]?\s*([M|m]?[0-9]{6,12})/i);
    qrRefDetected = refMatch ? refMatch[1].trim() : null;

    if (qrRefDetected) {
      const searchRefPattern = `%#ref#${qrRefDetected}#ref#%`;
      const { data: refPlayers } = await supabase
        .from('players')
        .select('id, name, phone')
        .ilike('receipt_url', searchRefPattern)
        .limit(1);

      if (refPlayers && refPlayers.length > 0) {
        const reason = `La referencia Nequi #${qrRefDetected} (detectada en el QR) ya fue registrada previamente por otro usuario (${refPlayers[0].name || 'usuario registrado'}). No se permite reutilizar comprobantes.`;
        return {
          isNequi: true,
          detectedContent: 'referencia duplicada (QR)',
          isUnrelatedImage: false,
          isAltered: false,
          isBlurry: false,
          reference: qrRefDetected,
          extractedAmount: 0,
          receiptDate: 'NONE',
          receiptTime: 'NONE',
          recipientName: 'NONE',
          destinationAccount: 'NONE',
          destinationBank: 'NONE',
          transferType: 'NONE',
          sourceStatus: 'NONE',
          hasQrCode: true,
          qrMatchesPrintedData: false,
          qrMismatchReason: 'Referencia ya utilizada',
          isDateToday: false,
          isWithinOneHour: false,
          isDuplicate: true,
          isSilentlyInvalid: true,
          silentReason: reason,
          immediateRejectionMessage: `❌ COMPROBANTE YA UTILIZADO:\n\n${reason}\n\nPor favor realiza una nueva transferencia legítima.`
        };
      }
    }
  }

  let effectiveMimeType = mimeType;
  if (!effectiveMimeType || !effectiveMimeType.startsWith('image/')) {
    effectiveMimeType = 'image/jpeg';
  }

  if (!apiKey) {
    const reason = 'Sistema de validación no disponible momentáneamente (API Key).';
    const rejection = `⚠️ AUDITORÍA FALLIDA:\n\n${reason}\n\nPor favor intenta de nuevo en unos minutos con una captura nítida.`;
    console.warn('[AI Audit] GEMINI_API_KEY no detectada. Rechazando por seguridad.');
    return {
      isNequi: true,
      detectedContent: 'comprobante de Nequi',
      isUnrelatedImage: false,
      isAltered: false,
      isBlurry: false,
      reference: qrRefDetected || 'NONE',
      extractedAmount: expectedAmount,
      receiptDate: colombiaDate.formattedDate,
      receiptTime: colombiaDate.currentTimeStr,
      recipientName: 'NONE',
      destinationAccount: 'NONE',
      destinationBank: 'Nequi',
      transferType: 'Envío Realizado',
      sourceStatus: 'Disponible',
      hasQrCode: true,
      qrMatchesPrintedData: true,
      qrMismatchReason: '',
      isDateToday: false,
      isWithinOneHour: false,
      isDuplicate: false,
      isSilentlyInvalid: true,
      silentReason: reason,
      immediateRejectionMessage: rejection,
      qrDecoded: hasHardwareQr,
      qrPayload: decodedQr.decodedPayload
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  const base64Data = fileBuffer.toString('base64');

  const qrForensicSection = (hasHardwareQr && decodedQr.decodedPayload)
    ? `3. VALIDACIÓN CRUZADA FORENSE DEL CÓDIGO QR CON DATOS IMPRESOS:
- Hemos decodificado exitosamente los módulos de píxeles del código QR del comprobante y extraído este texto/payload:
  "${decodedQr.decodedPayload}"
- CONTRASTE OBLIGATORIO ENTRE EL QR Y EL TEXTO IMPRESO:
  * Monto: ¿El valor monetario en el QR coincide con el monto impreso ("amount")?
  * Fecha: ¿La fecha en el QR coincide con la fecha impresa ("receipt_date") y es de HOY (${colombiaDate.formattedDate})?
  * Destinatario: ¿El destinatario o número en el QR coincide con el campo "Para" impreso?
  * Referencia: ¿El identificador en el QR coincide con el número de transacción en "Referencia"?
- Si detectas que el código QR pertenece a otra transacción (distinto monto, distinta fecha, distinto destinatario o distinta referencia), DEBES marcar 'qr_matches_printed_data': false y detallar la inconsistencia en 'qr_mismatch_reason'.`
    : `3. INSPECCIÓN Y CONTRASTE CON EL CÓDIGO QR DE VALIDACIÓN:
- 'has_qr_code': ¿Contiene el código QR oficial de Nequi (cuadrado con fondo verde menta/turquesa y la 'N' central estilizada, con la leyenda "¡Escanea este QR con Nequi para verificar tu envío al instante!")?
- 'qr_matches_printed_data': Evalúa la coherencia entre el código QR y los datos impresos legibles:
  * El código QR NO debe presentar señales de estar pegado, sobrepuesto o recortado de otro comprobante.
  * La posición, márgenes, proporciones y estilo visual del QR deben corresponder exactamente al diseño oficial de Nequi.
  * Si el código QR está ausente, cortado, borroso, tapado, manipulado o no corresponde a los datos impresos, debe ser FALSE.
- 'qr_mismatch_reason': Si 'qr_matches_printed_data' es false o hay irregularidades, describe la inconsistencia exacta.`;

  const prompt = `Eres un auditor forense de seguridad financiera y visión artificial de máxima precisión para Bingo Lite en Colombia.
Tu misión es inspeccionar minuciosamente el comprobante de pago de NEQUI Colombia adjunto, verificando cada campo de texto legible y contrastándolo rigurosamente con los datos decodificados y la estructura del código QR de validación.

FECHA Y HORA ACTUAL EXACTA EN COLOMBIA (Zona Horaria America/Bogota UTC-5):
- Fecha de hoy: ${colombiaDate.day} de ${colombiaDate.monthName} de ${colombiaDate.year} (${colombiaDate.formattedDate})
- Hora actual de referencia: ${colombiaDate.currentTimeStr}

REGLAS DE AUDITORÍA FORENSE:

1. CLASIFICACIÓN Y AUTENTICIDAD:
- 'is_nequi': Marca TRUE para cualquier comprobante oficial de Nequi Colombia (que tenga "Comprobante de pago", "Envío Realizado", "Envío a Nequi", "Envío a persona", "Envío a banco", o la interfaz/QR verde de Nequi).
- 'detected_content': Si NO es de Nequi, describe qué es (ej. "meme", "recibo de Daviplata", "foto personal", "imagen en blanco", etc.).
- 'is_altered': ¿Presenta señales de edición digital, fotomontaje, tipografía inconsistente, recorte, o alteración en cifras o textos?
- 'is_blurry': ¿Está borroso, recortado o con baja resolución que impida leer con certeza los datos?

2. EXTRACCIÓN DETALLADA DE DATOS IMPRESOS:
- 'amount': Valor total transferido en pesos colombianos como número entero sin puntos ni decimales (ej. Si la imagen muestra "$ 1.000,00", debe ser 1000; si muestra "$ 2.000,00", debe ser 2000; si muestra "$ 10.000,00", debe ser 10000). ATENCIÓN: Nequi coloca ",00" como centavos al final. IGNORA completamente los decimales ",00" finales y NUNCA los multipliques por 100. Por ejemplo, "$ 1.000,00" es MIL (1000), NUNCA 100000.
- 'receipt_date': Fecha exacta visible en el campo "Fecha" (ej. "29 de septiembre de 2026", "27 De Septiembre De 2026", "29 Sep 2026", "27/09/2026"). Si no se lee, 'NONE'.
- 'receipt_time': Hora exacta visible en el comprobante (ej. "02:25 p. m.", "11:12 A. M.", "03:45 P. M.", "10:30 a. m."). Si está dentro del texto de la Fecha (ej. "29 de septiembre de 2026 a las 02:25 p. m."), extrae la hora "02:25 p. m.". Si no se lee, 'NONE'.
- 'recipient_name': Nombre del destinatario en el campo "Para" (ej. "Maria Gomez", "Eri*** Erb***", "BINGO LITE", etc.).
- 'destination_bank': Nombre del banco en el campo "Banco" si aplica (ej. "Bancolombia", "Nequi").
- 'destination_account': Número de cuenta o celular en "Número Nequi" o "Número de cuenta" o destino si aparece (ej. "321 308 2034").
- 'reference': Número de transacción en el campo "Referencia" (inicia típicamente con 'M' como M12812507, M05191363).
- 'transfer_type': Tipo de envío en el encabezado (ej. "Envío Realizado", "Envío a banco", "Envío a Nequi", "Envío a persona").
- 'source_status': Estado o fondo en "¿De dónde salió la plata?" o encabezado (ej. "Disponible", "Envío Realizado", "Bolsillo", "Exitoso").

${qrForensicSection}

4. VALIDACIÓN DE VIGENCIA TEMPORAL:
- 'is_date_today': ¿La fecha del comprobante es exactamente HOY (${colombiaDate.day} de ${colombiaDate.monthName} de ${colombiaDate.year} o ${colombiaDate.formattedDate})? Si es de días anteriores (como ayer, anteayer o meses pasados), DEBE ser false.
- 'is_within_one_hour': ¿La transferencia fue realizada hoy recientemente (hace minutos o pocas horas respecto a la hora actual ${colombiaDate.currentTimeStr})? Si la transferencia se realizó hoy de forma reciente, DEBE ser true.

Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "is_nequi": boolean,
  "detected_content": string,
  "is_altered": boolean,
  "is_blurry": boolean,
  "amount": number,
  "receipt_date": string,
  "receipt_time": string,
  "recipient_name": string,
  "destination_bank": string,
  "destination_account": string,
  "reference": string,
  "transfer_type": string,
  "source_status": string,
  "has_qr_code": boolean,
  "qr_matches_printed_data": boolean,
  "qr_mismatch_reason": string,
  "is_date_today": boolean,
  "is_within_one_hour": boolean
}`;

  const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let resultText = '';
  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: effectiveMimeType, data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });
      resultText = response.text?.trim() || '{}';
      if (resultText && resultText !== '{}') {
        console.log(`[AI Audit] Successfully analyzed receipt with model ${modelName}`);
        break;
      }
    } catch (err: any) {
      console.log(`[AI Audit] Notice with ${modelName}:`, err?.message?.substring(0, 100) || err);
    }
  }

  if (!resultText || resultText === '{}') {
    const reason = 'El sistema antifraude no pudo certificar el comprobante debido a saturación. No se permite aprobación ni revisión manual por seguridad.';
    const rejection = `⚠️ ERROR DE PROCESAMIENTO:\n\n${reason}\n\nPor favor intenta subir el comprobante de nuevo.`;
    console.warn('[AI Audit] Fallback por IA ocupada. Rechazando por seguridad.');
    return {
      isNequi: true,
      detectedContent: 'comprobante de Nequi',
      isUnrelatedImage: false,
      isAltered: false,
      isBlurry: false,
      reference: qrRefDetected || 'NONE',
      extractedAmount: expectedAmount,
      receiptDate: colombiaDate.formattedDate,
      receiptTime: colombiaDate.currentTimeStr,
      recipientName: 'NONE',
      destinationAccount: 'NONE',
      destinationBank: 'Nequi',
      transferType: 'Envío Realizado',
      sourceStatus: 'Disponible',
      hasQrCode: true,
      qrMatchesPrintedData: true,
      qrMismatchReason: '',
      isDateToday: false,
      isWithinOneHour: false,
      isDuplicate: false,
      isSilentlyInvalid: true,
      silentReason: reason,
      immediateRejectionMessage: rejection,
      qrDecoded: hasHardwareQr,
      qrPayload: decodedQr.decodedPayload
    };
  }

  let parsed: any = {};
  try {
    const cleanJson = resultText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleanJson);
  } catch (e) {
    console.warn('[AI Audit] Could not parse JSON from Gemini:', resultText);
  }

  const isNequi = parsed.is_nequi === true;
  const rawDetected = (parsed.detected_content || '').trim();
  const detectedContent = rawDetected && rawDetected.toLowerCase() !== 'comprobante de nequi'
    ? rawDetected
    : (isNequi ? 'comprobante de Nequi' : 'una imagen no relacionada');

  const isAltered = parsed.is_altered === true;
  const isBlurry = parsed.is_blurry === true;
  const reference = (parsed.reference && parsed.reference !== 'NONE') ? String(parsed.reference).trim() : 'NONE';
  const extractedAmount = parseAmountWithDecimals(parsed.amount);
  const receiptDate = parsed.receipt_date || 'NONE';
  const receiptTime = parsed.receipt_time || 'NONE';
  const recipientName = parsed.recipient_name || 'NONE';
  const destinationBank = parsed.destination_bank || 'NONE';
  const destinationAccount = parsed.destination_account || 'NONE';
  const transferType = parsed.transfer_type || 'NONE';
  const sourceStatus = parsed.source_status || 'Disponible';

  // Cross-validate decoded QR payload against extracted data
  let qrValidation: DecodedQrValidationResult = {
    isValid: true,
    mismatches: [],
    matches: [],
    qrAmount: null,
    qrDateStr: null,
    qrReference: null,
    qrRecipient: null
  };

  if (hasHardwareQr && decodedQr.decodedPayload) {
    qrValidation = parseAndValidateQrPayload(
      decodedQr.decodedPayload,
      extractedAmount,
      expectedAmount,
      receiptDate,
      recipientName,
      reference,
      colombiaDate
    );
  }

  const hasVisualQr = parsed.has_qr_code !== false;
  const hasQrCode = hasHardwareQr || hasVisualQr;
  let qrMatchesPrintedData = hasHardwareQr ? qrValidation.isValid : (parsed.qr_matches_printed_data !== false);
  let qrMismatchReason = parsed.qr_mismatch_reason || '';

  if (hasHardwareQr && !qrValidation.isValid) {
    qrMatchesPrintedData = false;
    qrMismatchReason = qrValidation.mismatches.join(' | ');
  }

  // Perform deterministic server-side checks in addition to model boolean
  const deterministicIsDateToday = checkIsDateTodayInColombia(receiptDate, colombiaDate);
  const deterministicIsTimeValid = checkIsTimeWithinWindow(receiptTime, colombiaDate.hour, colombiaDate.minute, 120);

  // AGGRESSIVE: If the date/time was extracted, the deterministic check MUST pass. 
  // We no longer allow the AI model to override a failed deterministic check if text was legible.
  const isDateToday = (receiptDate !== 'NONE') ? deterministicIsDateToday : (parsed.is_date_today === true);
  const isWithinOneHour = (receiptTime !== 'NONE') ? deterministicIsTimeValid : (parsed.is_within_one_hour === true);

  console.log('[AI Audit Results Forensic Details]:', {
    isNequi,
    detectedContent,
    isAltered,
    isBlurry,
    reference,
    extractedAmount,
    expectedAmount,
    receiptDate,
    receiptTime,
    deterministicIsDateToday,
    deterministicIsTimeValid,
    isDateToday,
    isWithinOneHour,
    recipientName,
    hasHardwareQr,
    hasVisualQr,
    hasQrCode,
    qrMatchesPrintedData,
    qrPayload: decodedQr.decodedPayload,
    qrValidationMatches: qrValidation.matches,
    qrValidationMismatches: qrValidation.mismatches
  });

  // AGGRESSIVE ANTI-FRAUD VALIDATIONS:
  // 1. Check duplicate reference (Hash already checked at start)
  let isDuplicate = false;
  let duplicateReason = '';

  if (supabase) {
    if (reference !== 'NONE' && reference.length >= 3) {
      const searchRefPattern = `%#ref#${reference}#ref#%`;
      const { data: refPlayers } = await supabase
        .from('players')
        .select('id, name, phone')
        .ilike('receipt_url', searchRefPattern)
        .limit(1);

      if (refPlayers && refPlayers.length > 0) {
        isDuplicate = true;
        duplicateReason = `La referencia Nequi #${reference} ya fue registrada previamente en otra compra o por otro usuario (${refPlayers[0].name || 'usuario registrado'}).`;
      }
    }
  }

  const failurePoints: string[] = [];

  // RULE 1: Anti-Reutilización / Duplicados
  if (isDuplicate) {
    failurePoints.push(`❌ Comprobante Reutilizado: ${duplicateReason} No se permite reutilizar comprobantes de pago.`);
  }

  // RULE 2: Validar Monto total de los cartones a comprar
  if (expectedAmount > 0) {
    const isExactMatch = (extractedAmount === expectedAmount);
    const isCentsMultiplierMatch = (extractedAmount > 0 && Math.round(extractedAmount / 100) === expectedAmount);
    const isCentsDivisorMatch = (extractedAmount > 0 && Math.round(extractedAmount * 100) === expectedAmount);

    if (extractedAmount > 0 && !isExactMatch && !isCentsMultiplierMatch && !isCentsDivisorMatch) {
      const formattedExtracted = `$${extractedAmount.toLocaleString('es-CO')}`;
      const formattedExpected = `$${expectedAmount.toLocaleString('es-CO')}`;
      failurePoints.push(`❌ Monto inadecuado: El valor transferido (${formattedExtracted}) no concuerda con el valor exacto de los cartones solicitados (${formattedExpected}).`);
    } else if (extractedAmount === 0) {
      failurePoints.push(`❌ Monto no detectado: No se pudo leer el valor transferido en el comprobante. Asegúrate de que la captura sea nítida.`);
    }
  }

  // RULE 3: Validar Fecha de hoy
  if (!isDateToday) {
    const displayDate = receiptDate !== 'NONE' ? receiptDate : 'no identificada';
    failurePoints.push(`❌ Fecha no vigente: La fecha del comprobante (${displayDate}) no corresponde al día de hoy (${colombiaDate.formattedDate}). No se aceptan comprobantes de días anteriores.`);
  }

  // RULE 4: Validar Vigencia Máxima de 2 Horas (120 Minutos)
  if (!isWithinOneHour) {
    const displayTime = receiptTime !== 'NONE' ? receiptTime : 'no vigente';
    failurePoints.push(`❌ Comprobante vencido (> 2 horas): La hora del comprobante (${displayTime}) fue realizada hace más de 2 horas respecto a la hora actual de Colombia (${colombiaDate.currentTimeStr}). La transferencia debe ser realizada al momento de la compra.`);
  }

  if (hasHardwareQr && !qrValidation.isValid) {
    for (const m of qrValidation.mismatches) {
      failurePoints.push(`❌ Datos del código QR no coinciden: ${m}`);
    }
  }

  // AGGRESSIVE: Even if QR is internally valid (matches printed data), 
  // if the QR contains a date that is NOT today, it MUST be rejected.
  if (hasHardwareQr && qrValidation.isValid) {
    const hasQrDateMismatch = qrValidation.mismatches.some(m => m.toLowerCase().includes('fecha') || m.toLowerCase().includes('hoy'));
    if (hasQrDateMismatch) {
      const qrDateReport = qrValidation.mismatches.find(m => m.toLowerCase().includes('fecha')) || 'Fecha no vigente en QR';
      failurePoints.push(`❌ Código QR desactualizado: ${qrDateReport}. Aunque el QR sea auténtico, pertenece a una transacción antigua.`);
    }
  }

  // If any failure point exists, compile the FULL comprehensive report
  if (failurePoints.length > 0) {
    const qrStatusDescription = hasHardwareQr
      ? (qrValidation.isValid
        ? `✅ Auténtico y Certificado Digitalmente • Datos verificados (${qrValidation.matches.join(' • ') || decodedQr.decodedPayload})`
        : `❌ Discordancia detectada entre QR y texto impreso (${qrValidation.mismatches.join(' • ')})`)
      : (hasVisualQr ? '✅ Auténtico e Inspeccionado Visualmente' : '❌ No detectado');

    const fullReport = [
      `⚠️ INFORME COMPLETO DE AUDITORÍA ANTIFRAUDE:`,
      `Tu solicitud de compra no ha sido aprobada debido a los siguientes ${failurePoints.length} problema(s) detectado(s):\n`,
      ...failurePoints.map((item, idx) => `${idx + 1}. ${item}`),
      `\n📊 DATOS EXTRAÍDOS DEL COMPROBANTE:`,
      `• Valor transferido: ${extractedAmount > 0 ? `$${extractedAmount.toLocaleString('es-CO')}` : 'No identificado'} (Requerido: $${expectedAmount.toLocaleString('es-CO')})`,
      `• Fecha: ${receiptDate !== 'NONE' ? receiptDate : 'No visible'} (Hoy: ${colombiaDate.formattedDate})`,
      `• Hora: ${receiptTime !== 'NONE' ? receiptTime : 'No visible'} (Hora Col: ${colombiaDate.currentTimeStr})`,
      `• Destinatario ("Para"): ${recipientName !== 'NONE' ? recipientName : 'No identificado'}${destinationBank !== 'NONE' ? ` • Banco: ${destinationBank}` : ''}`,
      `• Referencia: ${reference !== 'NONE' ? `#${reference}` : 'No identificada'}`,
      `• Estado / Origen: ${sourceStatus} • Tipo: ${transferType !== 'NONE' ? transferType : 'Envío Nequi'}`,
      `• Verificación Código QR: ${qrStatusDescription}`,
      `\n💡 INSTRUCCIÓN:\nPor favor realiza la transferencia por Nequi en este momento por el valor exacto de tus cartones y sube una captura completa y nítida donde el código QR y todos los datos sean legibles.`
    ].join('\n');

    return {
      isNequi,
      detectedContent,
      isUnrelatedImage: !isNequi,
      isAltered,
      isBlurry,
      reference,
      extractedAmount,
      receiptDate,
      receiptTime,
      recipientName,
      destinationAccount,
      destinationBank,
      transferType,
      sourceStatus,
      hasQrCode,
      qrMatchesPrintedData,
      qrMismatchReason,
      isDateToday,
      isWithinOneHour,
      isDuplicate,
      isSilentlyInvalid: true,
      silentReason: failurePoints.join(' | '),
      immediateRejectionMessage: fullReport,
      qrDecoded: hasHardwareQr,
      qrPayload: decodedQr.decodedPayload,
      qrValidationDetails: {
        matches: qrValidation.matches,
        mismatches: qrValidation.mismatches,
        qrAmount: qrValidation.qrAmount ?? undefined,
        qrDate: qrValidation.qrDateStr ?? undefined,
        qrRecipient: qrValidation.qrRecipient ?? undefined,
        qrReference: qrValidation.qrReference ?? undefined
      }
    };
  }

  return {
    isNequi: true,
    detectedContent,
    isUnrelatedImage: false,
    isAltered: false,
    isBlurry: false,
    reference,
    extractedAmount,
    receiptDate,
    receiptTime,
    recipientName,
    destinationAccount,
    destinationBank,
    transferType,
    sourceStatus,
    hasQrCode: true,
    qrMatchesPrintedData: true,
    qrMismatchReason: '',
    isDateToday: true,
    isWithinOneHour: true,
    isDuplicate: false,
    isSilentlyInvalid: false,
    silentReason: '',
    immediateRejectionMessage: null,
    qrDecoded: hasHardwareQr,
    qrPayload: decodedQr.decodedPayload,
    qrValidationDetails: {
      matches: qrValidation.matches,
      mismatches: qrValidation.mismatches,
      qrAmount: qrValidation.qrAmount ?? undefined,
      qrDate: qrValidation.qrDateStr ?? undefined,
      qrRecipient: qrValidation.qrRecipient ?? undefined,
      qrReference: qrValidation.qrReference ?? undefined
    }
  };
}

// Claim Free Cards Endpoint (Instant auto-approval and card assignment for free games)
app.post('/api/players/claim-free-cards', async (req, res) => {
  try {
    const { phone: rawPhone, name, gameId } = req.body;
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      return res.status(400).json({ error: 'Número de WhatsApp requerido' });
    }

    const globalSettings = await getGameSettings('global');
    if (globalSettings.maintenance_mode) {
      if (phone !== '3145261451') {
        return res.status(503).json({
          error: 'La aplicación se encuentra en mantenimiento y actualizaciones. Solo el administrador y el jugador autorizado (3145261451) pueden ingresar en este momento.',
          maintenance: true
        });
      }
    }

    let game;
    if (gameId) {
      game = await getGameFullState(parseInt(gameId));
    } else {
      game = await getActiveGame();
    }

    if (!game) {
      return res.status(400).json({ error: 'No se encontró el juego especificado.' });
    }

    const settings = await getGameSettings(game.id);
    const cardValNum = parseAmountWithDecimals(game.card_value || '0') || 0;
    const isFreeGame = game.is_free === true || game.type === 'free' || settings.is_free === true || settings.type === 'free' || cardValNum === 0 || (typeof game.card_value === 'string' && game.card_value.toLowerCase().includes('gratis'));

    if (!isFreeGame) {
      return res.status(400).json({ error: 'Este juego no es gratuito.' });
    }

    // Check if player exists
    let { data: player } = await supabase.from('players').select('*').eq('phone', phone).maybeSingle();

    if (!player) {
      const referralCode = Math.floor(1000 + Math.random() * 9000).toString();
      const currentReceipt = {
        url: 'FREE_GAME',
        date: new Date().toISOString(),
        game_id: game.id,
        card_count: 2,
        payment_method: 'free'
      };

      const { data: newPlayer, error: createErr } = await supabase.from('players')
        .insert({
          name: name || 'Jugador Gratis',
          phone,
          card_count: 2,
          status: 'approved',
          referral_code: referralCode,
          receipt_url: JSON.stringify([currentReceipt])
        })
        .select()
        .single();

      if (createErr || !newPlayer) {
        return res.status(500).json({ error: `Error al crear jugador: ${createErr?.message || 'Error desconocido'}` });
      }
      player = newPlayer;
    } else {
      let history = [];
      if (player.receipt_url) {
        try {
          const parsed = JSON.parse(player.receipt_url);
          history = Array.isArray(parsed) ? parsed : [{ url: player.receipt_url, date: player.created_at, game_id: null, card_count: player.card_count }];
        } catch (e) {
          history = [{ url: player.receipt_url, date: player.created_at, game_id: null, card_count: player.card_count }];
        }
      }

      const gameClaims = history.filter((h: any) => h.game_id === game.id);
      if (gameClaims.length >= 1) {
        // Already claimed for this game, ensure approved status and 2 cards assigned
        await supabase.from('players').update({ status: 'approved' }).eq('id', player.id);
        const { data: existingCards } = await supabase.from('cards').select('id').eq('player_id', player.id).eq('game_id', game.id);
        if (!existingCards || existingCards.length < 2) {
          await generateCardsForPlayer(player.id, game.id, 2, false, false);
        }
        return res.json({ success: true, message: 'Tus 2 cartones gratis ya están asignados y aprobados.' });
      }

      const currentReceipt = {
        url: 'FREE_GAME',
        date: new Date().toISOString(),
        game_id: game.id,
        card_count: 2,
        payment_method: 'free'
      };
      history.push(currentReceipt);

      const { data: updatedPlayer } = await supabase.from('players')
        .update({
          card_count: (player.card_count || 0) + 2,
          status: 'approved',
          receipt_url: JSON.stringify(history)
        })
        .eq('id', player.id)
        .select()
        .single();

      if (updatedPlayer) {
        player = updatedPlayer;
      }
    }

    // Always generate 2 cards for this game and ensure approved status
    await generateCardsForPlayer(player.id, game.id, 2, false, false);
    getChannel().publish('new_player', player);
    invalidatePlayersCaches();

    return res.json({ success: true, message: '¡2 cartones gratis asignados exitosamente!', player });
  } catch (err: any) {
    console.error('Error en claim-free-cards:', err);
    return res.status(500).json({ error: `Error al reclamar cartones gratis: ${err.message}` });
  }
});

// Register Player
app.post('/api/players', upload.single('receipt'), async (req: any, res) => {
  console.log('--- NUEVA SOLICITUD DE REGISTRO ---');
  if (req.file) {
    sanitizeUploadedFileMimeType(req.file);
  }
  console.log('Body:', req.body);
  console.log('File:', req.file ? `Recibido: ${req.file.originalname}` : 'No se recibió archivo');

  const { name, phone: rawPhone, city, card_count, payment_method, invited_by, invite_id, gameId, player_ref, password, email, tenant_id: rawTenantId } = req.body;
  const phone = normalizePhone(rawPhone);

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del jugador es requerido.' });
  }

  if (!phone) {
    return res.status(400).json({ error: 'El número de teléfono es requerido.' });
  }

  if (phone.length !== 10) {
    return res.status(400).json({ error: 'El número de teléfono de WhatsApp debe tener exactamente 10 dígitos.' });
  }

  let receipt_url = null;
  let referenceNumber: string | null = null;
  let finalCardCount = 1;

  let finalStatus = 'approved';
  let isSilentlyInvalid = false;
  let silentReason = '';
  let audit: any = null;

  try {
    // Buscar el juego
    let game;
    if (gameId) {
      game = await getGameFullState(parseInt(gameId));
    } else {
      game = await getActiveGame();
    }

    if (!game) {
      return res.status(400).json({ error: 'No hay juego activo' });
    }

    const settings = await getGameSettings(game.id);
    const isFreeGame = (game.is_free === true || game.type === 'free' || settings.is_free === true || settings.type === 'free') && !(game.is_free === false || game.type === 'paid');

    if (payment_method === 'gift' || invited_by) {
      const cleanInvitedBy = normalizePhone(invited_by);
      if (!cleanInvitedBy) {
        return res.status(400).json({ error: 'El número de WhatsApp del amigo que te invitó es requerido.' });
      }

      // Check if there is a pending gift invitation using invite_id if provided
      let invite: any = null;
      if (invite_id) {
        const { data: idInvite } = await supabase.from('gift_invitations')
          .select('*')
          .eq('id', invite_id)
          .eq('sender_phone', cleanInvitedBy)
          .maybeSingle();

        if (idInvite) {
          if (idInvite.status === 'claimed') {
            return res.status(400).json({
              error: 'Enlace de regalo ya utilizado',
              message: 'Este enlace de regalo ya fue utilizado y redimido por otro usuario. Cada enlace de regalo solo se puede usar una única vez.'
            });
          }
          invite = idInvite;
        } else {
          return res.status(400).json({
            error: 'Regalo no encontrado',
            message: 'El enlace de regalo no es válido o ya expiró.'
          });
        }
      }

      if (!invite) {
        const { data: phoneInvite } = await supabase.from('gift_invitations')
          .select('*')
          .eq('sender_phone', cleanInvitedBy)
          .eq('recipient_phone', phone)
          .maybeSingle();

        if (phoneInvite) {
          if (phoneInvite.status === 'claimed') {
            return res.status(400).json({
              error: 'Regalo ya utilizado',
              message: 'Tu invitación de regalo ya fue redimida para este juego.'
            });
          }
          invite = phoneInvite;
        }
      }

      if (!invite) {
        const { data: genericInvite } = await supabase.from('gift_invitations')
          .select('*')
          .eq('sender_phone', cleanInvitedBy)
          .eq('status', 'pending')
          .like('recipient_phone', 'via-link-%')
          .limit(1)
          .maybeSingle();
        invite = genericInvite;
      }

      if (!invite) {
        return res.status(400).json({
          error: 'No hay regalos disponibles',
          message: 'No se encontró ningún regalo pendiente disponible con este remitente. El enlace ya fue redimido o se agotaron los 4 regalos disponibles.'
        });
      }

      // Atomically claim the invitation (ensures strictly one-time use under concurrency)
      const { data: claimedRow, error: claimErr } = await supabase.from('gift_invitations')
        .update({ status: 'claimed', recipient_phone: phone })
        .eq('id', invite.id)
        .eq('status', 'pending')
        .select();

      if (claimErr || !claimedRow || claimedRow.length === 0) {
        return res.status(400).json({
          error: 'Regalo ya redimido',
          message: 'Este cartón de regalo acaba de ser redimido por otro participante. Cada enlace solo puede usarse una única vez.'
        });
      }

      finalCardCount = 1;
      receipt_url = `GIFT_INSTRUCTED_BY_${cleanInvitedBy}`;
    } else {
      finalCardCount = isFreeGame ? 2 : parseInt(card_count);

      if (payment_method === 'wallet') {
        if (isFreeGame) {
          return res.status(400).json({ error: 'No es necesario usar la billetera para juegos gratuitos' });
        }

        const effectiveWalletTenant = (rawTenantId || (req as any).tenantId || game?.tenant_id || 'default').toLowerCase();

        // SEGURIDAD FINANCIERA: Verificar que quien gasta el saldo sea el titular autorizado
        let existingPlayerForWallet = null;
        try {
          const { data } = await supabase.from('players').select('id, password, tenant_id').eq('phone', phone).maybeSingle();
          existingPlayerForWallet = data;
        } catch {}

        if (existingPlayerForWallet && existingPlayerForWallet.password) {
          const authUser = await getAuthenticatedUser(req);
          const isTokenVerified = authUser?.role === 'player' && normalizePhone(authUser.phone || '') === phone;
          const isPasswordVerified = password && verifyPassword(password, existingPlayerForWallet.password);

          if (!isTokenVerified && !isPasswordVerified) {
            return res.status(401).json({
              error: 'Para realizar compras con saldo de tu billetera, debes ingresar tu contraseña correcta.',
              passwordRequired: true
            });
          }
        }

        const balance = await getWalletBalance(phone, effectiveWalletTenant);
        const cardVal = parseAmountWithDecimals(game.card_value || '0') || 0;
        const totalCost = cardVal * finalCardCount;

        if (balance < totalCost) {
          return res.status(400).json({ error: 'Saldo insuficiente en la billetera' });
        }

        const activated = await isWalletActivated(phone, game.id);
        if (!activated) {
          return res.status(400).json({
            error: 'Billetera no activada',
            message: 'Para usar tu saldo en este juego, primero debes realizar al menos una compra con dinero real para activarla.'
          });
        }

        // Deduct balance with tenant scoping
        await updateWalletBalance(phone, -totalCost, `Compra de ${finalCardCount} cartones por $${totalCost}`, 'purchase', effectiveWalletTenant);
        receipt_url = 'WALLET_PAYMENT';
      } else if (req.file) {
        const rawCardVal = game.card_value || settings.card_value || '2000';
        const cardVal = parseAmountWithDecimals(rawCardVal) || 2000;
        const totalCost = cardVal * (finalCardCount || 1);

        const globalSettings = await getGameSettings('global');
        const aiFraudEnabled = globalSettings.ai_fraud_detection_enabled !== false;

        audit = {
          isValid: true,
          reference: 'NONE',
          isSilentlyInvalid: false,
          silentReason: '',
          detectedContent: 'Revisión IA Desactivada'
        };

        if (aiFraudEnabled) {
          // 1. Auditar comprobante con IA Gemini Vision
          audit = await auditReceiptWithGemini(req.file.buffer, req.file.mimetype, totalCost);

          // Rechazo inmediato ante cualquier inconsistencia (fecha anterior, hora no vigente, no concuerda, monto inadecuado)
          if (audit.immediateRejectionMessage) {
            console.log('[AI Audit] Rechazo inmediato de venta:', audit.immediateRejectionMessage);
            return res.status(400).json({
              error: 'Comprobante no válido',
              message: audit.immediateRejectionMessage,
              detected_content: audit.detectedContent
            });
          }
        } else {
          console.log('[AI Audit] AI Anti-Fraud is DISABLED for registration. Skipping strict check.');
        }

        const fileExt = path.extname(req.file.originalname);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;
        const filePath = `receipts/${fileName}`;

        console.log('Subiendo comprobante a Supabase Storage...');
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });

        if (uploadError) {
          return res.status(500).json({ error: `Error al subir el comprobante: ${uploadError.message}` });
        }

        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(filePath);

        const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
        receipt_url = `${publicUrl}#hash#${fileHash}#hash#`;
        console.log('Comprobante subido con éxito:', receipt_url);

        referenceNumber = audit.reference !== 'NONE' ? audit.reference : null;
        if (referenceNumber) {
          receipt_url = `${receipt_url}#ref#${referenceNumber}#ref#`;
        }
        if (audit.qrDecoded) {
          receipt_url = `${receipt_url}#qr_verified#true#qr_verified#`;
        }

        if (audit.isSilentlyInvalid) {
          isSilentlyInvalid = true;
          silentReason = audit.silentReason;
          finalStatus = 'pending';
          console.log('[AI Audit] Inconsistencia en comprobante Nequi. Estado: PENDIENTE. Motivo:', silentReason);
        } else if (!aiFraudEnabled) {
          // Si la IA está desactivada, dejamos el estado en PENDIENTE para aprobación manual del administrador
          // tal como lo solicita el usuario (excepto si el juego es gratuito, lo cual se maneja arriba)
          finalStatus = 'pending';
          console.log('[AI Audit] AI Anti-Fraud DESACTIVADO. Estado: PENDIENTE para aprobación manual.');
        } else {
          finalStatus = 'approved';
          console.log('[AI Audit] Comprobante de Nequi 100% verificado y aprobado por IA.');
        }

        // Activar la billetera para este juego ÚNICAMENTE si la compra fue legítimamente aprobada
        if (finalStatus === 'approved') {
          await activateWallet(phone, game.id);
        }
      } else if (!isFreeGame && payment_method !== 'free' && req.body.is_free !== 'true' && req.body.is_free !== true) {
        return res.status(400).json({ error: 'Por favor, adjunta el comprobante de pago o usa tu billetera.' });
      } else {
        // Free game or free registration, no receipt needed
        receipt_url = 'FREE_GAME';
      }
    }

    // Free games and gift invitations NEVER require approval - ALWAYS auto-approve with cards!
    const isFreeRegistration = Boolean(
      isFreeGame ||
      payment_method === 'free' ||
      payment_method === 'gift' ||
      req.body.is_free === 'true' ||
      req.body.is_free === true
    );

    if (isFreeRegistration) {
      finalStatus = 'approved';
      isSilentlyInvalid = false;
      silentReason = '';
      if (!receipt_url) {
        receipt_url = payment_method === 'gift' ? `GIFT_INSTRUCTED_BY_${invited_by || ''}` : 'FREE_GAME';
      }
      if (payment_method !== 'gift') {
        finalCardCount = 2;
      }
      console.log(`[Free Game Auto-Approval] Player ${phone} set to APPROVED with ${finalCardCount} cards.`);
    }

    const effectiveTenant = (rawTenantId || (req as any).tenantId || 'default').toLowerCase();
    let selectPlayerQuery = supabase
      .from('players')
      .select('*')
      .eq('phone', phone);

    if (effectiveTenant && effectiveTenant !== 'default' && effectiveTenant !== 'bingo-lite') {
      selectPlayerQuery = selectPlayerQuery.eq('tenant_id', effectiveTenant);
    } else {
      selectPlayerQuery = selectPlayerQuery.or('tenant_id.eq.default,tenant_id.eq.bingo-lite,tenant_id.is.null');
    }

    let { data: existingPlayer, error: selectError } = await selectPlayerQuery.maybeSingle();
    if (selectError && selectError.code === '42703') {
      const fallback = await supabase.from('players').select('*').eq('phone', phone).maybeSingle();
      existingPlayer = fallback.data;
    }

    const currentReceipt = receipt_url ? {
      url: receipt_url,
      date: new Date().toISOString(),
      game_id: game?.id,
      card_count: finalCardCount,
      payment_method: payment_method || (isFreeGame ? 'free' : 'receipt'),
      reference: referenceNumber ? `#ref#${referenceNumber}#ref#` : null,
      is_silent_error: isSilentlyInvalid,
      validation_reason: silentReason || null,
      qr_verified: audit?.qrDecoded === true,
      qr_matches: audit?.qrValidationDetails?.matches || []
    } : null;

    if (existingPlayer) {
      console.log('Actualizando jugador existente ID:', existingPlayer.id);

      // Verificar contraseña si el jugador ya tiene una establecida
      if (existingPlayer.password && existingPlayer.password.trim() !== '') {
        const isMatch = verifyPassword(password, existingPlayer.password);
        if (!password || !isMatch) {
          return res.status(401).json({
            error: 'Contraseña incorrecta. Por favor verifícala.',
            passwordRequired: true
          });
        }
      }

      // Manejar historial de comprobantes para evitar fraude
      let history = [];
      if (existingPlayer.receipt_url) {
        try {
          const parsed = JSON.parse(existingPlayer.receipt_url);
          history = Array.isArray(parsed) ? parsed : [{ url: existingPlayer.receipt_url, date: existingPlayer.created_at, game_id: null, card_count: existingPlayer.card_count }];
        } catch (e) {
          history = [{ url: existingPlayer.receipt_url, date: existingPlayer.created_at, game_id: null, card_count: existingPlayer.card_count }];
        }
      }

      // Límite de 2 compras por juego
      const gamePurchases = history.filter((h: any) => h.game_id === game?.id);

      if (isFreeGame && gamePurchases.length >= 1) {
        return res.status(400).json({
          error: 'Límite alcanzado',
          message: 'Ya estás registrado en este juego gratuito. Solo se permite un registro por jugador.'
        });
      }

      if (gamePurchases.length >= 2) {
        return res.status(400).json({
          error: 'Límite alcanzado',
          message: 'Has alcanzado el límite de 2 compras por juego. Por favor, procura comprar la totalidad de tus cartones en las dos compras permitidas para mantener el orden.'
        });
      }

      if (currentReceipt) {
        history.push(currentReceipt);
      }

      const status = finalStatus;
      // Ensure the existing player has a referral code
      let referralCode = existingPlayer.referral_code;
      if (!referralCode) {
        referralCode = Math.floor(1000 + Math.random() * 9000).toString();
      }

      const isGiftReg = Boolean(payment_method === 'gift' || invited_by);
      const updateData: any = {
        seller_code: existingPlayer.seller_code || req.body.seller_code,
        referral_code: referralCode,
        referred_by_player_code: existingPlayer.referred_by_player_code || player_ref || req.body.referred_by || req.body.ref || null,
        name,
        city,
        card_count: isGiftReg ? 1 : (existingPlayer.card_count + finalCardCount),
        receipt_url: JSON.stringify(history),
        status
      };

      if (email && typeof email === 'string' && email.trim()) {
        updateData.email = email.trim();
      }
      const effectiveTenant = rawTenantId || (req as any).tenantId;
      if (effectiveTenant) {
        updateData.tenant_id = effectiveTenant;
      }

      if (password) {
        updateData.password = hashPassword(password);
      }

      let { data: updatedPlayer, error: updateError } = await supabase.from('players')
        .update(updateData)
        .eq('id', existingPlayer.id)
        .select()
        .single();

      if (updateError && (updateError.message?.includes('referred_by_player_code') || updateError.message?.includes('referral_code') || updateError.message?.includes('email') || updateError.message?.includes('tenant_id'))) {
        console.warn('Retrying player update without extra columns:', updateError.message);
        const safeUpdate = { ...updateData };
        delete safeUpdate.referred_by_player_code;
        delete safeUpdate.referral_code;
        delete safeUpdate.email;
        delete safeUpdate.tenant_id;
        const retryRes = await supabase.from('players').update(safeUpdate).eq('id', existingPlayer.id).select().single();
        updatedPlayer = retryRes.data;
        updateError = retryRes.error;
      }

      if (updateError) {
        return res.status(500).json({ error: `Error de base de datos: ${updateError.message}` });
      }

      if (status === 'approved') {
        const cardsToMake = isGiftReg ? 1 : finalCardCount;
        console.log(`Debug: Generating ${cardsToMake} cards for updated player ${updatedPlayer.id} for game ${game.id}`);
        await generateCardsForPlayer(updatedPlayer.id, game.id, cardsToMake, false, isGiftReg);
        if (payment_method !== 'gift' && payment_method !== 'free') {
          payReferralCommission(updatedPlayer, game, finalCardCount).catch(console.error);
        }
      }

      getChannel().publish('new_player', updatedPlayer);
      invalidatePlayersCaches();
      try {
        await supabase.from('gift_invitations').update({ status: 'claimed' }).eq('recipient_phone', phone);
      } catch (err) {

      }
      if (updatedPlayer && updatedPlayer.password) {
        delete updatedPlayer.password;
      }
      const playerToken = createPlayerToken({
        uid: updatedPlayer.id,
        phone: updatedPlayer.phone,
        role: 'player',
        tenant_id: effectiveTenant || 'default'
      });
      return res.json({ success: true, player: updatedPlayer, token: playerToken });
    }

    console.log('Insertando nuevo jugador...');
    const status = finalStatus;
    const referralCode = Math.floor(1000 + Math.random() * 9000).toString();
    const isGiftReg = Boolean(payment_method === 'gift' || invited_by);
    const newPlayerData: any = {
      seller_code: req.body.seller_code,
      referred_by_player_code: player_ref || req.body.referred_by || req.body.ref || null,
      referral_code: referralCode,
      name,
      phone,
      city,
      card_count: isGiftReg ? 1 : finalCardCount,
      receipt_url: currentReceipt ? JSON.stringify([currentReceipt]) : null,
      status
    };

    if (email && typeof email === 'string' && email.trim()) {
      newPlayerData.email = email.trim();
    }
    const effectiveTenantNew = rawTenantId || (req as any).tenantId;
    if (effectiveTenantNew) {
      newPlayerData.tenant_id = effectiveTenantNew;
    }

    if (password) {
      newPlayerData.password = hashPassword(password);
    }

    let { data: newPlayer, error: insertError } = await supabase.from('players')
      .insert(newPlayerData)
      .select()
      .single();

    if (insertError && (insertError.message?.includes('referred_by_player_code') || insertError.message?.includes('referral_code') || insertError.message?.includes('email') || insertError.message?.includes('tenant_id'))) {
      console.warn('Retrying player insert without extra columns:', insertError.message);
      const safeData = { ...newPlayerData };
      delete safeData.referred_by_player_code;
      delete safeData.referral_code;
      delete safeData.email;
      delete safeData.tenant_id;
      const retryResult = await supabase.from('players').insert(safeData).select().single();
      newPlayer = retryResult.data;
      insertError = retryResult.error;
    }

    if (insertError) {
      return res.status(500).json({ error: `Error de base de datos: ${insertError.message}` });
    }

    if (status === 'approved') {
      const cardsToMake = isGiftReg ? 1 : finalCardCount;
      console.log(`Debug: Generating ${cardsToMake} cards for new player ${newPlayer.id} for game ${game.id}`);
      await generateCardsForPlayer(newPlayer.id, game.id, cardsToMake, false, isGiftReg);
      if (payment_method !== 'gift' && payment_method !== 'free') {
        payReferralCommission(newPlayer, game, finalCardCount).catch(console.error);
      }
    }

    console.log('Jugador registrado con éxito:', newPlayer.id);
    getChannel().publish('new_player', newPlayer);
    invalidatePlayersCaches();
    try {
      await supabase.from('gift_invitations').update({ status: 'claimed' }).eq('recipient_phone', phone);
    } catch (err) {

    }
    if (newPlayer && newPlayer.password) {
      delete newPlayer.password;
    }
    const playerToken = createPlayerToken({
      uid: newPlayer?.id || phone,
      phone: phone,
      role: 'player',
      tenant_id: effectiveTenantNew || 'default'
    });
    res.json({ success: true, player: newPlayer, token: playerToken });
  } catch (err: any) {

    res.status(500).json({ error: `Error inesperado: ${err.message || 'Error desconocido'}` });
  }
});


// Wallet Recharge Request Endpoint (with optional receipt file upload & validation)
app.post('/api/wallet/recharge-request', upload.single('receipt'), async (req: any, res) => {
  try {
    const { phone: rawPhone, amount, note } = req.body;
    const phone = normalizePhone(rawPhone);
    const numericAmount = parseInt(amount || '0');

    if (!phone) {
      return res.status(400).json({ error: 'Número de teléfono requerido' });
    }
    if (numericAmount <= 0) {
      return res.status(400).json({ error: 'El monto de recarga debe ser mayor a 0' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Comprobante requerido' });
    }

    const globalSettings = await getGameSettings('global');
    const aiFraudEnabled = globalSettings.ai_fraud_detection_enabled !== false;

    let audit: any = {
      isValid: true,
      reference: 'NONE',
      isSilentlyInvalid: false,
      silentReason: '',
      detectedContent: 'Revisión IA Desactivada'
    };

    if (aiFraudEnabled) {
      // 1. Auditar comprobante con IA Gemini Vision
      audit = await auditReceiptWithGemini(req.file.buffer, req.file.mimetype, numericAmount);

      // Rechazo inmediato ante cualquier inconsistencia (fecha anterior, hora no vigente, no concuerda, monto inadecuado)
      if (audit.immediateRejectionMessage) {
        console.log('[Recharge AI Audit] Rechazo inmediato:', audit.immediateRejectionMessage);
        return res.status(400).json({
          error: 'Comprobante no válido',
          message: audit.immediateRejectionMessage,
          detected_content: audit.detectedContent
        });
      }
    } else {
      console.log('[Recharge AI Audit] AI Anti-Fraud is DISABLED for recharge. Skipping strict check.');
    }

    // 2. Subir a Supabase Storage
    const fileExt = path.extname(req.file.originalname);
    const fileName = `recharge-${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;
    const filePath = `receipts/${fileName}`;

    console.log('[Recharge] Uploading receipt to Supabase Storage...');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      return res.status(500).json({ error: `Error al subir el comprobante: ${uploadError.message}` });
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    let referenceNumber = audit.reference;
    let receipt_url = `${publicUrl}#hash#${fileHash}#hash#`;
    if (referenceNumber && referenceNumber !== 'NONE') {
      receipt_url = `${receipt_url}#ref#${referenceNumber}#ref#`;
    }
    console.log('[Recharge] Receipt uploaded successfully:', receipt_url);

    let isSilentlyInvalid = audit.isSilentlyInvalid;
    let silentReason = audit.silentReason;

    if (!aiFraudEnabled) {
      isSilentlyInvalid = true;
      silentReason = 'Antifraude desactivado. Requiere aprobación manual.';
    }

    // 3. Save receipt / transaction to player's history or notifications
    // Locate player to update history and wallet activations
    const { data: player } = await supabase.from('players').select('*').eq('phone', phone).maybeSingle();

    if (player) {
      let historyArray: any[] = [];
      if (player.receipt_url) {
        try {
          historyArray = JSON.parse(player.receipt_url);
        } catch (e) {
          if (typeof player.receipt_url === 'string' && player.receipt_url.length > 0) {
            historyArray = [{ url: player.receipt_url, date: new Date().toISOString() }];
          }
        }
      }
      if (!Array.isArray(historyArray)) {
        historyArray = [];
      }

      const receiptRecord = {
        url: receipt_url,
        date: new Date().toISOString(),
        amount: numericAmount,
        type: 'recharge',
        note: note || '',
        reference: referenceNumber !== 'NONE' ? `#ref#${referenceNumber}#ref#` : 'NONE',
        is_silent_error: isSilentlyInvalid,
        validation_reason: isSilentlyInvalid ? silentReason : 'Verificado automáticamente por el sistema anti-fraude.',
        qr_verified: audit?.qrDecoded === true,
        qr_matches: audit?.qrValidationDetails?.matches || []
      };

      historyArray.push(receiptRecord);
      await supabase.from('players').update({ receipt_url: JSON.stringify(historyArray) }).eq('id', player.id);
    }

    if (!isSilentlyInvalid) {
      // Auto-approve recharge: Automatically update wallet balance
      await updateWalletBalance(phone, numericAmount, `Recarga automática aprobada por $${numericAmount} (Ref: ${referenceNumber})`, 'recharge');

      // Auto-send approved notification
      await sendPushNotification({
        recipient: 'single',
        phone,
        title: '✅ ¡Recarga Exitosa!',
        message: `Tu billetera digital ha sido recargada con éxito por $${numericAmount}. Tu saldo está disponible y tu billetera ha sido activada.`
      });

      res.json({
        success: true,
        message: '¡Recarga aprobada y acreditada de forma inmediata!',
        status: 'approved',
        amount: numericAmount
      });
    } else {
      // Create admin / support internal notification for manual review
      await supabase.from('notifications').insert({
        user_id: 'admin',
        title: '📥 Solicitud de Recarga Manual Pendiente',
        message: `El jugador con celular ${phone} solicita una recarga de $${numericAmount}. Estado anti-fraude: PENDIENTE. Razón: ${silentReason}`,
        read: false
      });

      // Notify player that request was received and is under fast manual review
      await sendPushNotification({
        recipient: 'single',
        phone,
        title: '⏳ Solicitud de Recarga Recibida',
        message: 'Tu solicitud de recarga está siendo revisada de forma manual por un administrador. Te notificaremos en un momento.'
      });

      res.json({
        success: true,
        message: 'Tu comprobante de recarga está en verificación manual. Se activará en unos momentos.',
        status: 'pending',
        amount: numericAmount
      });
    }

  } catch (err: any) {
    console.error('[Recharge Request Endpoint] Error:', err);
    res.status(500).json({ error: `Error interno al procesar recarga: ${err.message || 'Desconocido'}` });
  }
});


// Client error logging endpoint
app.post('/api/log/client-error', express.json(), (req, res) => {
  console.log('CLIENT ERROR LOG:', req.body);
  res.json({ success: true });
});

// Get All Registered Players (Admin)
app.get('/api/admin/all-players', async (req, res) => {
  try {
    const now = Date.now();
    if (cachedAllPlayers && (now - lastAllPlayersFetchTime < ALL_PLAYERS_CACHE_TTL)) {
      return res.json(cachedAllPlayers);
    }

    const { data: players, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const activeGameForGifts = await getActiveGame();
    const giftsMap = await getGiftStatsMap(activeGameForGifts?.id);

    const enriched = (players || []).map((p: any) => {
      const normPhone = normalizePhone(p.phone || '');
      const stats = giftsMap.get(normPhone) || { total: 0, claimed: 0, pending: 0, gifts: [] };
      return {
        ...p,
        gift_count: Math.min(4, stats.total),
        raw_gift_count: stats.total,
        gifts_claimed: stats.claimed,
        gifts_pending: stats.pending,
        gift_details: stats.gifts.slice(0, 4)
      };
    });

    cachedAllPlayers = enriched;
    lastAllPlayersFetchTime = now;
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Player Block Status (Admin)
app.post('/api/admin/players/:id/toggle-block', async (req, res) => {
  try {
    const { data: player, error: fetchError } = await supabase
      .from('players')
      .select('id, is_blocked, tenant_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchError || !player) return res.status(404).json({ error: 'Jugador no encontrado' });

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const pTenant = (player.tenant_id || 'default').toLowerCase();
      if (pTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ error: 'Acceso denegado: Este jugador pertenece a otra sala.' });
      }
    }

    const { error: updateError } = await supabase
      .from('players')
      .update({ is_blocked: !player.is_blocked })
      .eq('id', req.params.id);

    if (updateError) throw updateError;

    invalidatePlayersCaches();
    res.json({ success: true, is_blocked: !player.is_blocked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update Player Details (Admin)
app.put('/api/admin/players/:id', async (req, res) => {
  try {
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id, tenant_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!existingPlayer) return res.status(404).json({ error: 'Jugador no encontrado' });

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const pTenant = (existingPlayer.tenant_id || 'default').toLowerCase();
      if (pTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ error: 'Acceso denegado: Este jugador pertenece a otra sala.' });
      }
    }

    const { name, phone: rawPhone, email, state, city } = req.body;
    const phone = normalizePhone(rawPhone);
    const { error } = await supabase
      .from('players')
      .update({ name, phone, email, state, city })
      .eq('id', req.params.id);

    if (error) throw error;
    invalidatePlayersCaches();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Player (Admin)
app.delete('/api/admin/players/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get player phone first to delete related records
    const { data: player, error: fetchError } = await supabase
      .from('players')
      .select('phone, tenant_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !player) return res.status(404).json({ error: 'Jugador no encontrado' });

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const pTenant = (player.tenant_id || 'default').toLowerCase();
      if (pTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ error: 'Acceso denegado: Este jugador pertenece a otra sala.' });
      }
    }

    if (player) {
      const phone = player.phone;

      // 2. Delete related records in other tables
      // We use Promise.all to delete in parallel
      await Promise.all([
        supabase.from('cards').delete().eq('player_id', id),
        supabase.from('cards').delete().eq('player_phone', phone),
        supabase.from('receipts').delete().eq('player_phone', phone),
        supabase.from('wallet_transactions').delete().eq('player_phone', phone),
        supabase.from('bingo_claims').delete().eq('player_phone', phone),
        supabase.from('wallets').delete().eq('phone', phone)
      ]);
    } else {
      await supabase.from('cards').delete().eq('player_id', id);
    }

    // 3. Delete the player record
    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    invalidatePlayersCaches();
    invalidateGameCaches();
    getChannel().publish('player_rejected', { id });
    res.json({ success: true });
  } catch (err: any) {

    res.status(500).json({ error: err.message });
  }
});

// Get Players
app.get('/api/players', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const now = Date.now();
    if (cachedActiveGamePlayers && (now - lastActiveGamePlayersFetchTime < ACTIVE_GAME_PLAYERS_CACHE_TTL)) {
      return res.json(cachedActiveGamePlayers);
    }

    // 1. Get active game
    let game = await getActiveGame();

    // 2. Get all players and only fetch card_number and game_id columns (avoiding huge b, i, n, g, o arrays)
    // filtered to the current game if active to drastically reduce egress.
    const targetTenant = ((req.query.tenantId as string) || (req as any).tenantId || '').toLowerCase();
    let playersQuery = supabase
      .from('players')
      .select('*, cards(card_number, game_id)')
      .order('created_at', { ascending: false });

    if (targetTenant && targetTenant !== 'global' && targetTenant !== 'default') {
      playersQuery = playersQuery.eq('tenant_id', targetTenant);
    }

    if (game?.id) {
      playersQuery = playersQuery.eq('cards.game_id', game.id);
    }

    const { data: players, error } = await playersQuery;

    if (error) return res.status(500).json({ error: error.message });

    // Auto-heal/auto-approve any players stuck in 'pending' for free games or gift invitations
    const isCurrentGameFree = Boolean(game && (game.is_free || game.type === 'free' || parseAmountWithDecimals(game.card_value || '0') === 0));

    for (const p of players) {
      if (p.status === 'pending') {
        const isGiftReceipt = Boolean(p.receipt_url && p.receipt_url.includes('GIFT_'));
        const isFreeReceipt = Boolean(p.receipt_url && (p.receipt_url.includes('FREE_GAME') || p.receipt_url.includes('free')));
        if (isGiftReceipt || isFreeReceipt || isCurrentGameFree) {
          p.status = 'approved';
          const targetCards = isGiftReceipt ? 1 : 2;
          await supabase.from('players').update({ status: 'approved', card_count: targetCards }).eq('id', p.id);
          if (game?.id) {
            const { data: existingCards } = await supabase.from('cards').select('id').eq('player_id', p.id).eq('game_id', game.id);
            if (!existingCards || existingCards.length < targetCards) {
              await generateCardsForPlayer(p.id, game.id, targetCards - (existingCards?.length || 0), false, false);
            }
          }
          console.log(`[Auto-Approve Fix] Player ID ${p.id} (${p.phone}) auto-approved for ${isGiftReceipt ? 'gift' : 'free'} game with ${targetCards} card(s).`);
        }
      }
    }

    const giftsMap = await getGiftStatsMap(game?.id);

    const formattedPlayers = players.map((p: any) => {
      let history = [];
      try {
        const parsed = JSON.parse(p.receipt_url || '[]');
        history = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        history = [];
      }

      // Filter history for current game
      const gamePurchases = history.filter((h: any) => h.game_id === game?.id);
      const gameCardCount = gamePurchases.reduce((sum: number, h: any) => sum + (h.card_count || 0), 0);

      // Filter cards for current game
      const gameCards = p.cards?.filter((c: any) => c.game_id === game?.id).map((c: any) => c.card_number) || [];

      const normPhone = normalizePhone(p.phone || '');
      const stats = giftsMap.get(normPhone) || { total: 0, claimed: 0, pending: 0, gifts: [] };

      return {
        ...p,
        card_count: gamePurchases.length > 0 ? gameCardCount : p.card_count,
        cards: gameCards,
        is_active_in_game: gamePurchases.length > 0 || gameCards.length > 0,
        gift_count: Math.min(4, stats.total),
        raw_gift_count: stats.total,
        gifts_claimed: stats.claimed,
        gifts_pending: stats.pending,
        gift_details: stats.gifts.slice(0, 4)
      };
    });

    // Return players active in the current game, pending players, or approved players
    const activeCurrentPlayers = formattedPlayers.filter(p => p.is_active_in_game || p.status === 'pending' || p.status === 'approved');

    cachedActiveGamePlayers = activeCurrentPlayers;
    lastActiveGamePlayersFetchTime = now;
    res.json(activeCurrentPlayers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Approve Player
app.post('/api/players/:id/approve', requireAdmin, async (req, res) => {
  try {
    const playerId = req.params.id;
    const { data: player, error: fetchErr } = await supabase.from('players').select('*').eq('id', playerId).maybeSingle();

    if (fetchErr || !player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const playerTenant = (player.tenant_id || 'default').toLowerCase();
      if (playerTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ 
          error: `Acceso denegado: El jugador pertenece a la sala "${player.tenant_id}". No tienes autorización para aprobarlo.` 
        });
      }
    }

    // 1. Update player status to approved (using safest columns first)
    const { error: firstUpdateErr } = await supabase.from('players').update({
      status: 'approved',
      is_approved: true,
      is_paid: true
    }).eq('id', playerId);

    if (firstUpdateErr) {
      console.warn('[Approve Player] First update failed (likely missing columns), falling back to status-only update:', firstUpdateErr.message);
      const { error: fallbackErr } = await supabase.from('players').update({ status: 'approved' }).eq('id', playerId);
      if (fallbackErr) {
        throw new Error(`Fallback update failed: ${fallbackErr.message}`);
      }
    }

    // 2. Clear any fraud/silent errors on the receipt history (SAFE JSON PARSING)
    if (player.receipt_url) {
      try {
        let history = [];
        try {
          history = JSON.parse(player.receipt_url);
        } catch (e) {
          // If not JSON, it might be a single URL string
          if (typeof player.receipt_url === 'string' && player.receipt_url.length > 0) {
            history = [{ url: player.receipt_url, date: new Date().toISOString() }];
          }
        }

        if (Array.isArray(history) && history.length > 0) {
          const updatedHistory = history.map((h: any) => ({
            ...h,
            is_silent_error: false,
            validation_reason: 'Aprobado manualmente por el organizador.'
          }));
          await supabase.from('players').update({ receipt_url: JSON.stringify(updatedHistory) }).eq('id', playerId);
        }
      } catch (e) {
        console.warn('[Approve Player] Could not update history JSON:', e);
      }
    }

    // 3. Determine the target game
    let targetGameId: number | null = null;
    try {
      let history = [];
      try {
        history = JSON.parse(player.receipt_url || '[]');
      } catch (e) {
        if (typeof player.receipt_url === 'string' && player.receipt_url.length > 0) {
          history = [{ url: player.receipt_url, date: new Date().toISOString() }];
        }
      }

      if (Array.isArray(history) && history.length > 0) {
        const last = history[history.length - 1];
        if (last && last.game_id) {
          targetGameId = Number(last.game_id);
        }
      }
    } catch (e) { }

    let game: any = null;
    if (targetGameId) {
      game = await getGameFullState(targetGameId);
    }
    if (!game) {
      game = await getActiveGame();
    }

    if (game) {
      // 4. Check existing cards for this player and game
      const { data: existingCards } = await supabase.from('cards')
        .select('id')
        .eq('player_id', player.id)
        .eq('game_id', game.id);

      const currentCardCount = existingCards ? existingCards.length : 0;
      const targetCount = player.card_count || 1;

      if (currentCardCount < targetCount) {
        const cardsToGenerate = targetCount - currentCardCount;
        console.log(`[Approve Player] Generating ${cardsToGenerate} missing cards for player ${player.id} (had ${currentCardCount}, target ${targetCount}) in game ${game.id}`);
        await generateCardsForPlayer(player.id, game.id, cardsToGenerate, false, false);
      } else if (currentCardCount === 0) {
        console.log(`[Approve Player] Generating ${targetCount} cards for player ${player.id} in game ${game.id}`);
        await generateCardsForPlayer(player.id, game.id, targetCount, false, false);
      }

      await activateWallet(player.phone, game.id);
      payReferralCommission(player, game, targetCount).catch(console.error);
    }

    // Send push notification to player that their payment and cards are approved
    if (player?.phone) {
      const countStr = player.card_count ? `${player.card_count} cartón(es)` : 'tus cartones';
      sendPushNotification({
        recipient: 'single',
        phone: player.phone,
        title: '✅ ¡Pago y Cartones Aprobados!',
        message: `Hola ${player.name || 'Jugador'}, tu pago ha sido verificado y ${countStr} ya están disponibles en tu panel para jugar.`,
        url: getAppUrl(req)
      }).catch(() => { });
    }

    getChannel().publish('player_approved', { id: playerId, phone: player.phone });
    invalidatePlayersCaches();
    invalidateGameCaches();
    res.json({ success: true, message: 'Jugador aprobado y cartones asignados correctamente' });
  } catch (err: any) {
    console.error('[Approve Player] Error:', err);
    res.status(500).json({ error: err.message || 'Error al aprobar jugador' });
  }
});

app.post('/api/admin/players/approve-all', async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    let query = supabase.from('players').select('id, tenant_id').eq('status', 'pending');
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      query = query.eq('tenant_id', adminUser.tenant_id);
    }
    const { data: pendingPlayers, error: fetchErr } = await query;

    if (fetchErr) throw fetchErr;

    if (!pendingPlayers || pendingPlayers.length === 0) {
      return res.json({ success: true, message: 'No hay jugadores pendientes por aprobar' });
    }

    console.log(`[Bulk Approve] Starting approval for ${pendingPlayers.length} players...`);

    let approvedCount = 0;
    for (const p of pendingPlayers) {
      try {
        // Reuse the logic (I'll extract it to a local function within the endpoint for safety if needed, 
        // or just re-implement concisely since we already have the ID)

        // We need the full player data for card generation and notifications
        const { data: player } = await supabase.from('players').select('*').eq('id', p.id).single();
        if (!player) continue;

        // 1. Update status
        const { error: bulkUpdateErr } = await supabase.from('players').update({
          status: 'approved',
          is_approved: true,
          is_paid: true
        }).eq('id', player.id);

        if (bulkUpdateErr) {
          console.warn('[Bulk Approve Player] Update failed (likely missing columns), falling back to status-only update:', bulkUpdateErr.message);
          await supabase.from('players').update({ status: 'approved' }).eq('id', player.id);
        }

        // 2. History update
        if (player.receipt_url) {
          try {
            let history = [];
            try { history = JSON.parse(player.receipt_url); } catch (e) {
              if (typeof player.receipt_url === 'string' && player.receipt_url.length > 0) {
                history = [{ url: player.receipt_url, date: new Date().toISOString() }];
              }
            }
            if (Array.isArray(history)) {
              const updatedHistory = history.map((h: any) => ({ ...h, is_silent_error: false, validation_reason: 'Aprobado masivamente.' }));
              await supabase.from('players').update({ receipt_url: JSON.stringify(updatedHistory) }).eq('id', player.id);
            }
          } catch (e) { }
        }

        // 3. Card generation
        let targetGameId: number | null = null;
        try {
          let history = JSON.parse(player.receipt_url || '[]');
          if (Array.isArray(history) && history.length > 0) {
            const last = history[history.length - 1];
            if (last && last.game_id) targetGameId = Number(last.game_id);
          }
        } catch (e) { }

        let game = targetGameId ? await getGameFullState(targetGameId) : await getActiveGame();
        if (game) {
          const { data: existingCards } = await supabase.from('cards').select('id').eq('player_id', player.id).eq('game_id', game.id);
          const currentCardCount = existingCards ? existingCards.length : 0;
          const targetCount = player.card_count || 1;
          if (currentCardCount < targetCount) {
            await generateCardsForPlayer(player.id, game.id, targetCount - currentCardCount, false, false);
          }
          await activateWallet(player.phone, game.id);
          payReferralCommission(player, game, targetCount).catch(() => { });
        }

        getChannel().publish('player_approved', { id: player.id, phone: player.phone });
        if (player.phone) {
          sendPushNotification({
            recipient: 'single',
            phone: player.phone,
            title: '✅ ¡Pago y Cartones Aprobados!',
            message: `Hola ${player.name || 'Jugador'}, tus cartones han sido verificados y ya están listos en tu panel para jugar.`,
            url: getAppUrl(req)
          }).catch(() => { });
        }
        approvedCount++;
      } catch (err) {
        console.error(`[Bulk Approve] Error approving player ${p.id}:`, err);
      }
    }

    invalidatePlayersCaches();
    invalidateGameCaches();
    res.json({ success: true, message: `Se han aprobado ${approvedCount} jugadores masivamente.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reject Player Purchase (Anti-Fraud) & Delete Cards
app.post('/api/players/:id/reject', requireAdmin, async (req, res) => {
  try {
    const playerId = req.params.id;
    const { data: player, error: fetchErr } = await supabase.from('players').select('*').eq('id', playerId).maybeSingle();

    if (fetchErr || !player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    // 1. Delete all generated cards for this player so they cannot participate or win
    const { error: cardsDeleteErr } = await supabase.from('cards').delete().eq('player_id', playerId);
    if (cardsDeleteErr) {
      console.warn('[Reject Player] Error deleting cards:', cardsDeleteErr.message);
    }

    // 2. Update status to rejected and clear card count
    const { error: updateErr } = await supabase
      .from('players')
      .update({ status: 'rejected', card_count: 0 })
      .eq('id', playerId);

    if (updateErr) {
      return res.status(500).json({ error: `Error al actualizar estado: ${updateErr.message}` });
    }

    // 3. Send Anti-fraud notification
    const title = "⚠️ Venta No Aprobada / Rechazada";
    const message = "SISTEMA ANTIFRAUDE: La compra de cartones ha sido rechazada y cancelada por el administrador debido a inconsistencias en el comprobante de pago o datos no válidos. Los cartones han sido eliminados de tu cuenta.";

    if (player.phone) {
      await sendPushNotification({
        recipient: 'single',
        phone: player.phone,
        title,
        message
      });
    }

    getChannel().publish('player_rejected', { id: playerId });
    invalidatePlayersCaches();
    invalidateGameCaches();
    res.json({ success: true, message: 'Compra rechazada y cartones eliminados exitosamente.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al rechazar compra' });
  }
});

// Admin endpoint: List all pending and processed recharge requests
app.get('/api/admin/recharge-requests', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const adminUser = (req as any).adminUser;
    let query = supabase.from('players')
      .select('id, name, phone, receipt_url, created_at, tenant_id');

    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      query = query.eq('tenant_id', adminUser.tenant_id);
    }

    const { data: players, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    const rechargeRequests: any[] = [];

    (players || []).forEach((player: any) => {
      if (player.receipt_url) {
        try {
          const receipts = JSON.parse(player.receipt_url);
          if (Array.isArray(receipts)) {
            receipts.forEach((receipt: any, idx: number) => {
              if (receipt.type === 'recharge') {
                rechargeRequests.push({
                  id: `${player.id}:::${idx}`,
                  playerId: player.id,
                  playerName: player.name,
                  phone: player.phone,
                  tenantId: player.tenant_id,
                  amount: receipt.amount || 0,
                  receiptUrl: receipt.url,
                  note: receipt.note || '',
                  reference: receipt.reference ? receipt.reference.replace(/#ref#/g, '') : 'NONE',
                  date: receipt.date || player.created_at,
                  is_silent_error: receipt.is_silent_error === true,
                  validation_reason: receipt.validation_reason || '',
                  // Better status logic: if not silent error, it is approved. If silent error and has "Rechazado", it is rejected. Otherwise pending.
                  status: (receipt.is_silent_error === false || receipt.validation_reason?.includes('Aprobado'))
                    ? 'approved'
                    : (receipt.validation_reason?.includes('Rechazado') ? 'rejected' : 'pending')
                });
              }
            });
          }
        } catch (e) {
          // Ignore json parse error
        }
      }
    });

    // Sort requests by date descending
    rechargeRequests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(rechargeRequests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin endpoint: Approve a manual recharge request
app.post('/api/admin/recharge-requests/:id/approve', async (req, res) => {
  try {
    const parts = req.params.id.split(':::');
    if (parts.length < 2) return res.status(400).json({ error: 'ID de solicitud inválido' });

    const playerId = parts[0];
    const index = parseInt(parts[1]);

    const { data: player, error } = await supabase.from('players').select('*').eq('id', playerId).single();
    if (error || !player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const playerTenant = (player.tenant_id || 'default').toLowerCase();
      if (playerTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ 
          error: `Acceso denegado: Esta solicitud pertenece a la sala "${player.tenant_id}". No puedes gestionarla.` 
        });
      }
    }

    if (!player.receipt_url) {
      return res.status(400).json({ error: 'Comprobante no encontrado' });
    }

    let receipts = [];
    try {
      receipts = JSON.parse(player.receipt_url);
    } catch (e) {
      if (typeof player.receipt_url === 'string' && player.receipt_url.length > 0) {
        receipts = [{ url: player.receipt_url, date: new Date().toISOString() }];
      }
    }

    if (!Array.isArray(receipts) || !receipts[index]) {
      return res.status(400).json({ error: 'Recarga no encontrada' });
    }

    const receipt = receipts[index];
    if (receipt.validation_reason?.includes('Aprobado')) {
      return res.status(400).json({ error: 'Esta recarga ya ha sido aprobada' });
    }

    const amount = Number(receipt.amount) || 0;
    if (amount <= 0) {
      return res.status(400).json({ error: 'Monto de recarga inválido' });
    }

    const targetTenant = (player.tenant_id || adminUser.tenant_id || 'default').toLowerCase();

    // 1. Credit wallet balance with tenant isolation
    await updateWalletBalance(player.phone, amount, `Recarga de billetera aprobada por administrador`, 'recharge', targetTenant);

    // 2. Mark as approved in receipt logs
    receipt.is_silent_error = false;
    receipt.validation_reason = 'Aprobado manualmente por el organizador.';

    await supabase.from('players')
      .update({ receipt_url: JSON.stringify(receipts) })
      .eq('id', playerId);

    invalidatePlayersCaches();

    // 3. Notify player
    await sendPushNotification({
      recipient: 'single',
      phone: player.phone,
      title: '✅ Recarga Aprobada',
      message: `¡Tu solicitud de recarga por $${amount} ha sido verificada y aprobada de forma manual por el organizador!`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin endpoint: Reject a manual recharge request
app.post('/api/admin/recharge-requests/:id/reject', async (req, res) => {
  try {
    const parts = req.params.id.split(':::');
    if (parts.length < 2) return res.status(400).json({ error: 'ID de solicitud inválido' });

    const playerId = parts[0];
    const index = parseInt(parts[1]);

    const { data: player, error } = await supabase.from('players').select('*').eq('id', playerId).single();
    if (error || !player) {
      return res.status(404).json({ error: 'Jugador no encontrado' });
    }

    const adminUser = (req as any).adminUser;
    if (!adminUser.isSuperAdmin && adminUser.tenant_id) {
      const playerTenant = (player.tenant_id || 'default').toLowerCase();
      if (playerTenant !== adminUser.tenant_id.toLowerCase()) {
        return res.status(403).json({ 
          error: `Acceso denegado: Esta solicitud pertenece a la sala "${player.tenant_id}". No puedes gestionarla.` 
        });
      }
    }

    if (!player.receipt_url) {
      return res.status(400).json({ error: 'Comprobante no encontrado' });
    }

    let receipts = [];
    try {
      receipts = JSON.parse(player.receipt_url);
    } catch (e) {
      if (typeof player.receipt_url === 'string' && player.receipt_url.length > 0) {
        receipts = [{ url: player.receipt_url, date: new Date().toISOString() }];
      }
    }

    if (!Array.isArray(receipts) || !receipts[index]) {
      return res.status(400).json({ error: 'Recarga no encontrada' });
    }

    const receipt = receipts[index];
    if (receipt.validation_reason?.includes('Rechazado')) {
      return res.status(400).json({ error: 'Esta recarga ya ha sido rechazada' });
    }

    const amount = receipt.amount || 0;

    // 1. Mark as rejected in receipt logs
    receipt.is_silent_error = true;
    receipt.validation_reason = 'Rechazado manualmente por el organizador.';

    await supabase.from('players')
      .update({ receipt_url: JSON.stringify(receipts) })
      .eq('id', playerId);

    invalidatePlayersCaches();

    // 2. Notify player
    await sendPushNotification({
      recipient: 'single',
      phone: player.phone,
      title: '❌ Recarga Rechazada',
      message: `Tu comprobante de recarga por $${amount} no pudo ser aprobado debido a inconsistencias o falta de claridad. Por favor inténtalo de nuevo.`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Player Cards
app.get('/api/players/:phone/cards', async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone);
    const targetTenant = ((req.query.tenantId as string) || (req as any).tenantId || '').toLowerCase();

    let playerQuery = supabase.from('players').select('*').eq('phone', phone);
    if (targetTenant && targetTenant !== 'default' && targetTenant !== 'bingo-lite') {
      playerQuery = playerQuery.eq('tenant_id', targetTenant);
    } else {
      playerQuery = playerQuery.or('tenant_id.eq.default,tenant_id.eq.bingo-lite,tenant_id.is.null');
    }

    let { data: player, error: playerErr } = await playerQuery.maybeSingle();

    if (playerErr && playerErr.code === '42703') {
      if (targetTenant && targetTenant !== 'default' && targetTenant !== 'bingo-lite') {
        return res.status(404).json({ error: 'Player not found' });
      }
      const fallback = await supabase.from('players').select('*').eq('phone', phone).maybeSingle();
      player = fallback.data;
      playerErr = fallback.error;
    }

    if (playerErr || !player) return res.status(404).json({ error: 'Player not found' });

    // Touch player presence
    touchPlayerPresence(phone, player.name);

    // 1. Get active game (can be null)
    let game = await getActiveGame();

    // --- AUTO-ASSIGNMENT FOR FREE GAMES ---
    if (game && (game.is_free || game.type === 'free')) {
      try {
        const { count } = await supabase.from('cards')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', player.id)
          .eq('game_id', game.id);

        if (count === 0 || count === null) {
          const isGiftUser = Boolean(player.receipt_url && String(player.receipt_url).includes('GIFT_'));
          const cardsToAssign = isGiftUser ? 1 : 2;
          console.log(`[Auto-Assign] Player ${player.phone} has no cards for free game ${game.id}. Assigning ${cardsToAssign} card(s).`);
          await generateCardsForPlayer(player.id, game.id, cardsToAssign, false, false);
          if (player.status !== 'approved') {
            const { error: updateErr } = await supabase.from('players').update({
              status: 'approved',
              card_count: cardsToAssign,
              is_approved: true,
              is_paid: true
            }).eq('id', player.id);

            if (updateErr) {
              console.warn('[Auto-Assign Player] Update failed (likely missing columns), falling back to status-only update:', updateErr.message);
              await supabase.from('players').update({ status: 'approved', card_count: cardsToAssign }).eq('id', player.id);
            }
            player.status = 'approved';
            player.card_count = cardsToAssign;
          }
          getChannel().publish('player_approved', { id: player.id, phone: player.phone });
        }
      } catch (autoErr) {
        console.error('[Auto-Assign] Error:', autoErr);
      }
    }

    // 2. Fetch all cards for this player
    let cardsData: any[] = [];
    const { data: cardsWithGame, error: cardsError } = await supabase.from('cards')
      .select(`
        *,
        game (
          id, name, status, start_time
        )
      `)
      .eq('player_id', player.id);

    if (!cardsError && cardsWithGame) {
      cardsData = cardsWithGame;
    } else {
      // Fallback direct query without join
      const { data: rawCards } = await supabase.from('cards')
        .select('*')
        .eq('player_id', player.id);
      cardsData = rawCards || [];
    }

    const uniqueGameIds = Array.from(new Set(cardsData.map(c => c.game_id).filter(Boolean))) as number[];
    const gameSettingsMap: Record<number, any> = {};
    for (const gid of uniqueGameIds) {
      gameSettingsMap[gid] = await getGameSettings(gid);
    }

    const formattedCards = [];
    for (const card of cardsData) {
      const b = Array.isArray(card.b) ? card.b : [];
      const i = Array.isArray(card.i) ? card.i : [];
      const n = Array.isArray(card.n) ? card.n : [];
      const g = Array.isArray(card.g) ? card.g : [];
      const o = Array.isArray(card.o) ? card.o : [];

      const isReserved = String(card.card_number || '').startsWith('RESERVADO');
      const settings = gameSettingsMap[card.game_id] || {};
      const isFreeGame = settings.is_free === true || settings.type === 'free';

      let lotteryCode = card.lottery_code || card.status;

      // Dynamic healing: If a card exists but doesn't have a valid lottery code, heal it on the fly!
      if (!isReserved && (!lotteryCode || lotteryCode.trim() === '' || lotteryCode === '---' || isNaN(Number(lotteryCode)))) {
        const numDigits = parseInt(String(settings.lottery_digits || '3'), 10) || 3;
        const maxVal = Math.pow(10, numDigits);
        const rand = Math.floor(Math.random() * maxVal);
        lotteryCode = rand.toString().padStart(numDigits, '0');

        await supabase.from('cards')
          .update({ lottery_code: lotteryCode, status: lotteryCode })
          .eq('id', card.id);

        card.lottery_code = lotteryCode;
        card.status = lotteryCode;
      }

      formattedCards.push({
        id: card.id,
        card_number: card.card_number,
        lottery_code: lotteryCode,
        game_id: card.game_id,
        isReserved,
        isFreeGame,
        game_name: card.game?.name || 'Juego En Vivo',
        game_status: card.game?.status,
        game_start_time: card.game?.start_time,
        grid: isReserved ? null : [
          [b[0], i[0], n[0], g[0], o[0]],
          [b[1], i[1], n[1], g[1], o[1]],
          [b[2], i[2], n[2], g[2], o[2]],
          [b[3], i[3], n[3], g[3], o[3]],
          [b[4], i[4], n[4], g[4], o[4]],
        ],
        marked_cells: []
      });
    }

    const activeCards = game
      ? formattedCards.filter(c => c.game_id === game.id && !c.isReserved)
      : formattedCards.filter(c => !c.isReserved);

    res.json({
      player,
      all_cards: formattedCards,
      cards: activeCards.length > 0 ? activeCards : formattedCards.filter(c => !c.isReserved),
      status: player.status
    });
  } catch (err: any) {
    console.error('[Get Player Cards] Error:', err);
    res.status(500).json({ error: err.message || 'Error fetching cards' });
  }
});

// Bingo Claim
app.post('/api/bingo', async (req, res) => {
  const { card_number, phone: rawPhone, marked_cells } = req.body;
  const phone = normalizePhone(rawPhone);

  const { data: player } = await supabase.from('players').select('*').eq('phone', phone).single();

  if (!player) return res.status(400).json({ error: 'Player not found' });

  const { data: card } = await supabase.from('cards')
    .select('*')
    .eq('card_number', card_number)
    .eq('player_id', player.id)
    .maybeSingle();

  if (!card) return res.status(400).json({ error: 'Card not found for this player' });

  let game = await getActiveGame();

  if (!game) return res.status(400).json({ error: 'No active game' });

  let drawnBalls = game.drawn_balls || [];
  if (typeof drawnBalls === 'string') {
    try {
      drawnBalls = JSON.parse(drawnBalls);
    } catch (e) {
      drawnBalls = [];
    }
  }

  const { data: gamePatterns } = await supabase.from('game_patterns')
    .select('*, patterns(grid, name)')
    .eq('game_id', game.id)
    .order('id', { ascending: true });

  let wonPattern = null;

  if (gamePatterns) {
    for (const gp of gamePatterns) {
      const pGrid = Array.isArray(gp.patterns) && gp.patterns.length > 0 ? gp.patterns[0].grid : gp.patterns?.grid;
      if (!pGrid) continue;

      const winResult = checkCardPattern(card, pGrid, drawnBalls);
      if (winResult.won) {
        // If this pattern was already registered for this player (e.g. by auto-detection 0.5s ago)
        if (gp.winner_player_id && String(gp.winner_player_id) === String(player.id)) {
          wonPattern = {
            ...gp,
            marked_cells: winResult.marked_cells
          };
          break;
        }

        // If pattern has no winner yet, process the win immediately
        if (!gp.winner_player_id) {
          const processed = await processBingoWin(game, gp, [{ card, player, winResult }]);
          if (processed) {
            wonPattern = {
              ...gp,
              marked_cells: winResult.marked_cells
            };
            break;
          }
        }
      }
    }
  }

  if (wonPattern) {
    await broadcastGameUpdate(game.id);
    res.json({ success: true, message: '¡BINGO VÁLIDO! ¡Felicitaciones!', pattern: wonPattern });
  } else {
    // Check if player had already won a pattern in this game
    const alreadyWon = (gamePatterns || []).find(gp => gp.winner_player_id && String(gp.winner_player_id) === String(player.id));
    if (alreadyWon) {
      return res.json({ success: true, message: '¡Bingo ya verificado!', pattern: alreadyWon });
    }
    res.status(400).json({ error: 'Bingo no válido. Revisa tus números o espera a que salgan más balotas.' });
  }
});

// Helper: Generate Bingo Card
function generateBingoCard() {
  const getNumbers = (min: number, max: number, count: number) => {
    const nums = new Set<number>();
    while (nums.size < count) nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
    return Array.from(nums).sort((a, b) => a - b);
  };

  const b = getNumbers(1, 15, 5);
  const i = getNumbers(16, 30, 5);
  const n = getNumbers(31, 45, 5);
  n[2] = 0; // FREE space
  const g = getNumbers(46, 60, 5);
  const o = getNumbers(61, 75, 5);

  return { B: b, I: i, N: n, G: g, O: o };
}

// Helper: Check Pattern
// Helper to normalize pattern grid to 5x5 matrix
function getSafePatternGrid(rawGrid: any): boolean[][] {
  let gridArray: any = rawGrid;
  if (typeof gridArray === 'string') {
    try {
      gridArray = JSON.parse(gridArray);
    } catch {
      gridArray = [];
    }
  }

  if (!Array.isArray(gridArray)) {
    return Array(5).fill(null).map(() => Array(5).fill(false));
  }

  // Case 1: 1D array of 25 items
  if (gridArray.length === 25 && !Array.isArray(gridArray[0])) {
    const matrix: boolean[][] = [];
    for (let r = 0; r < 5; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < 5; c++) {
        row.push(Boolean(gridArray[r * 5 + c]));
      }
      matrix.push(row);
    }
    return matrix;
  }

  // Case 2: 2D array of rows
  if (Array.isArray(gridArray[0])) {
    return Array(5).fill(null).map((_, r) => {
      const row = Array.isArray(gridArray[r]) ? gridArray[r] : [];
      return Array(5).fill(null).map((_, c) => Boolean(row[c]));
    });
  }

  return Array(5).fill(null).map(() => Array(5).fill(false));
}

// Helper to normalize card grid to 5x5 matrix
function getSafeCardGrid(card: any): (string | number)[][] {
  const parseLetterArray = (val: any): any[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        if (val.startsWith('{') && val.endsWith('}')) {
          return val.slice(1, -1).split(',').map(x => isNaN(Number(x)) ? x : Number(x));
        }
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        return val.replace(/[\[\]{}]/g, '').split(',').map(x => isNaN(Number(x)) ? x : Number(x));
      }
    }
    return [];
  };

  const b = parseLetterArray(card.b);
  const i = parseLetterArray(card.i);
  const n = parseLetterArray(card.n);
  const g = parseLetterArray(card.g);
  const o = parseLetterArray(card.o);

  return [
    [b[0], i[0], n[0], g[0], o[0]],
    [b[1], i[1], n[1], g[1], o[1]],
    [b[2], i[2], n[2], g[2], o[2]],
    [b[3], i[3], n[3], g[3], o[3]],
    [b[4], i[4], n[4], g[4], o[4]],
  ];
}

function checkCardPattern(card: any, patternGridInput: any, rawDrawnBalls: any) {
  let drawnBalls: number[] = [];
  if (Array.isArray(rawDrawnBalls)) {
    drawnBalls = rawDrawnBalls.map(Number);
  } else if (typeof rawDrawnBalls === 'string') {
    try {
      const parsed = JSON.parse(rawDrawnBalls);
      if (Array.isArray(parsed)) {
        drawnBalls = parsed.map(Number);
      }
    } catch (e) {
      drawnBalls = [];
    }
  }

  const pGrid = getSafePatternGrid(patternGridInput);
  const grid = getSafeCardGrid(card);

  const marked_cells: { r: number; c: number }[] = [];
  let totalRequiredCells = 0;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (pGrid[r][c]) {
        totalRequiredCells++;
        const cellValue = grid[r][c];
        const isFree = cellValue === 'FREE' || cellValue === 0 || cellValue === '0';

        if (isFree || (cellValue !== undefined && cellValue !== null && drawnBalls.includes(Number(cellValue)))) {
          marked_cells.push({ r, c });
        } else {
          return { won: false, marked_cells: [] };
        }
      }
    }
  }

  if (totalRequiredCells === 0) {
    return { won: false, marked_cells: [] };
  }

  return { won: true, marked_cells };
}

// Health Check

function getAppUrl(req?: any): string {
  const envUrl = process.env.APP_URL || process.env.VITE_APP_URL;
  if (envUrl && envUrl !== 'MY_APP_URL' && envUrl !== 'tu_app_url') {
    return envUrl.replace(/\/$/, '');
  }
  if (req) {
    const host = req.get('host');
    if (host) {
      const protocol = req.protocol || 'https';
      return `${protocol}://${host}`;
    }
    const origin = req.get('origin') || req.get('referer');
    if (origin) {
      return origin.replace(/\/$/, '');
    }
  }
  return "https://bingolite.click";
}




// Helper to send notifications and save to DB
async function sendPushNotification({ recipient, phone, title, message, url }: { recipient: 'all' | 'single', phone?: string, title: string, message: string, url?: string }) {
  console.log(`[Notification] Initiating send: recipient=${recipient}, phone=${phone}, title=${title}`);
  try {
    const globalSettings = await getGameSettings('global') || {};
    if (globalSettings.maintenance_mode && recipient === 'all') {
      console.log('[Notification] Suppressed broadcast push notification due to maintenance mode.');
      return { success: true, message: 'Skipped due to maintenance mode' };
    }
    const onesignalAppId = process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || globalSettings.onesignal_app_id;
    const rawApiKey = process.env.ONESIGNAL_REST_API_KEY || globalSettings.onesignal_rest_api_key;
    const onesignalApiKey = rawApiKey ? String(rawApiKey).replace(/^Basic\s+/i, '').replace(/^Key\s+/i, '').trim() : '';

    let targetIds: string[] = [];
    let playersToNotifyInApp: string[] = [];

    if (recipient === 'all') {
      if (supabase) {
        const { data: players } = await supabase.from('players').select('id, phone');
        if (players) {
          players.forEach(p => {
            playersToNotifyInApp.push(`player-${p.id}`);
            if (p.phone) playersToNotifyInApp.push(p.phone);
          });
        }

        // Also notify all admins if possible (optional but good for the bell)
        try {
          const { data: admins } = await supabase.auth.admin.listUsers() as any;
          if (admins?.users) {
            admins.users.forEach(u => playersToNotifyInApp.push(u.id));
          }
        } catch (e) {
          console.warn('[Notification] Could not list admins for in-app notification:', e);
        }
      }
    } else if (phone) {
      const normalizedPhone = normalizePhone(phone);
      targetIds = [normalizedPhone, `player-${normalizedPhone}`];
      playersToNotifyInApp = [normalizedPhone, `player-${normalizedPhone}`];

      if (supabase) {
        const { data: p } = await supabase.from('players').select('id, phone').eq('phone', normalizedPhone).maybeSingle();
        if (p?.id) {
          targetIds.push(`player-${p.id}`);
          targetIds.push(String(p.id));
          playersToNotifyInApp.push(`player-${p.id}`);
        }
      }
    }

    // Save to DB for the in-app Bell
    if (playersToNotifyInApp.length > 0 && supabase) {
      const uniqueInApp = Array.from(new Set(playersToNotifyInApp));
      console.log(`[Notification] Saving to DB for ${uniqueInApp.length} user keys`);
      const notificationsToInsert = uniqueInApp.map(id => ({
        user_id: id,
        title,
        message,
        read: false
      }));

      const BATCH_SIZE = 500;
      for (let i = 0; i < notificationsToInsert.length; i += BATCH_SIZE) {
        const batch = notificationsToInsert.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase.from('notifications').insert(batch);
        if (insertErr) {
          console.warn('[DB Notification Insert Error]:', insertErr.message);
        }
      }
    }

    const isConfigured = Boolean(
      onesignalAppId &&
      onesignalApiKey &&
      onesignalAppId !== 'tu_onesignal_app_id' &&
      onesignalApiKey !== 'tu_onesignal_rest_api_key' &&
      onesignalApiKey !== 'undefined'
    );

    if (!isConfigured) {
      console.log('[Notification] OneSignal credentials not configured; in-app notification delivered to DB.');
      return { success: true, delivered_in_app: true, push_status: 'not_configured', warning: 'Credenciales de OneSignal no configuradas en el servidor.' };
    }

    const appUrl = url || getAppUrl();

    // Direct fetch for OneSignal with full Mobile & Desktop Web Push compatibility
    const notificationPayload: any = {
      app_id: onesignalAppId,
      headings: { "en": title, "es": title },
      contents: { "en": message, "es": message },
      web_url: appUrl,
      priority: 10,
      ttl: 259200,
      isAnyWeb: true,
      chrome_web_icon: "https://cdn-icons-png.flaticon.com/512/591/591559.png",
      chrome_web_badge: "https://cdn-icons-png.flaticon.com/512/591/591559.png",
      firefox_icon: "https://cdn-icons-png.flaticon.com/512/591/591559.png",
      small_icon: "https://cdn-icons-png.flaticon.com/512/591/591559.png",
      large_icon: "https://cdn-icons-png.flaticon.com/512/591/591559.png",
      adm_small_icon: "https://cdn-icons-png.flaticon.com/512/591/591559.png",
      icon: "https://cdn-icons-png.flaticon.com/512/591/591559.png"
    };

    if (recipient === 'all') {
      notificationPayload.included_segments = ["Subscribed Users", "Total Subscriptions", "Active Users", "All"];
    } else if (targetIds.length > 0) {
      const uniqueTargetIds = Array.from(new Set(targetIds.map(t => String(t))));
      notificationPayload.include_external_user_ids = uniqueTargetIds;
      if (phone) {
        const cleanPhone = normalizePhone(phone);
        if (cleanPhone) {
          notificationPayload.filters = [{ field: "tag", key: "phone", relation: "=", value: cleanPhone }];
        }
      }
    } else {
      console.log('[Notification] In-app notification delivered to DB. No external user IDs mapped for browser push.');
      return { success: true, delivered_in_app: true };
    }

    console.log('[Notification Dispatch] Sending payload to OneSignal:', JSON.stringify(notificationPayload));

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Key ${onesignalApiKey}`
      },
      body: JSON.stringify(notificationPayload)
    });

    const result = await response.json();
    console.log('[Notification Dispatch] Response Status:', response.status, 'Body:', JSON.stringify(result));

    const rawErrors = result?.errors || [];
    const errorList = Array.isArray(rawErrors) ? rawErrors.map(String) : [String(rawErrors)];
    let isNotSubscribedError = errorList.some(e => e.toLowerCase().includes('not subscribed'));

    // Retry with phone tag filter if single player by external_id was not subscribed
    if (isNotSubscribedError && recipient === 'single' && phone) {
      const normalizedPhone = normalizePhone(phone);
      console.log(`[Notification Dispatch] Retrying with tag filter for phone: ${normalizedPhone}...`);
      const fallbackPayload = {
        ...notificationPayload,
        include_external_user_ids: undefined,
        filters: [{ field: "tag", key: "phone", relation: "=", value: normalizedPhone }]
      };

      try {
        const retryTagRes = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': `Key ${onesignalApiKey}`
          },
          body: JSON.stringify(fallbackPayload)
        });
        const retryTagResult = await retryTagRes.json();
        console.log('[Notification Dispatch] Retry Tag Response Status:', retryTagRes.status, 'Body:', JSON.stringify(retryTagResult));

        if (retryTagRes.ok && retryTagResult?.id) {
          return { success: true, delivered_in_app: true, onesignal: retryTagResult };
        }

        const retryErrors = retryTagResult?.errors || [];
        const retryErrorList = Array.isArray(retryErrors) ? retryErrors.map(String) : [String(retryErrors)];
        isNotSubscribedError = retryErrorList.some(e => e.toLowerCase().includes('not subscribed'));
      } catch (e) {
        console.warn('[Notification Dispatch] Retry Tag Error:', e);
      }
    }

    if (!response.ok || isNotSubscribedError) {
      // If Key auth returned 401/403, retry with Basic header
      if (response.status === 401 || response.status === 403) {
        console.log('[Notification Dispatch] Retrying with Basic authorization header...');
        const retryRes = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': `Basic ${onesignalApiKey}`
          },
          body: JSON.stringify(notificationPayload)
        });
        const retryResult = await retryRes.json();
        console.log('[Notification Dispatch] Retry Status:', retryRes.status, 'Body:', JSON.stringify(retryResult));
        if (retryRes.ok) {
          return { success: true, delivered_in_app: true, onesignal: retryResult };
        }
      }

      if (isNotSubscribedError) {
        console.log('[Notification Dispatch] Target user(s) currently not subscribed to browser push. In-app notification delivered to DB.');
        return {
          success: true,
          delivered_in_app: true,
          push_status: 'unsubscribed',
          message: 'Notificación guardada en la app. El jugador aún no ha aceptado los permisos de notificación Web Push en su navegador.'
        };
      }
    }

    return {
      success: response.ok,
      delivered_in_app: true,
      onesignal: result,
      error: !response.ok ? (result?.errors?.[0] || 'Error en OneSignal API') : undefined
    };
  } catch (error) {
    console.log('[Notification] Note during push dispatch:', (error as any)?.message || String(error));
    return { success: true, delivered_in_app: true, push_status: 'fallback' };
  }
}

// Public endpoint for client app to retrieve active OneSignal App ID
app.get('/api/config/onesignal', async (req, res) => {
  try {
    const globalSettings = await getGameSettings('global') || {};
    const onesignalAppId = process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || globalSettings.onesignal_app_id || '';
    const isValid = Boolean(
      onesignalAppId &&
      onesignalAppId !== 'tu_onesignal_app_id' &&
      onesignalAppId !== 'undefined'
    );
    res.json({ appId: isValid ? onesignalAppId : '' });
  } catch (err) {
    res.json({ appId: '' });
  }
});

// Explicit Service Worker handlers for OneSignal Web Push to prevent HTML MIME type errors
app.get('/OneSignalSDKWorker.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send("importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');");
});

app.get('/OneSignalSDKUpdaterWorker.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send("importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');");
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const swPath = path.join(process.cwd(), 'dist', 'sw.js');
  if (fs.existsSync(swPath)) {
    res.sendFile(swPath);
  } else {
    res.send("importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');");
  }
});

// Endpoint to get current OneSignal push settings
app.get('/api/admin/notifications/settings', async (req, res) => {
  try {
    const globalSettings = await getGameSettings('global') || {};
    const onesignalAppId = process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || globalSettings.onesignal_app_id || '';
    const rawApiKey = process.env.ONESIGNAL_REST_API_KEY || globalSettings.onesignal_rest_api_key || '';

    const isConfigured = Boolean(
      onesignalAppId &&
      rawApiKey &&
      onesignalAppId !== 'tu_onesignal_app_id' &&
      rawApiKey !== 'tu_onesignal_rest_api_key'
    );

    res.json({
      onesignal_app_id: onesignalAppId,
      has_api_key: Boolean(rawApiKey && rawApiKey !== 'tu_onesignal_rest_api_key'),
      is_configured: isConfigured,
      source: process.env.ONESIGNAL_APP_ID ? 'env' : (globalSettings.onesignal_app_id ? 'database' : 'none')
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to save OneSignal push settings in global database configuration
app.post('/api/admin/notifications/settings', async (req, res) => {
  try {
    const { onesignal_app_id, onesignal_rest_api_key } = req.body;
    const updates: any = {};
    if (onesignal_app_id !== undefined) updates.onesignal_app_id = onesignal_app_id.trim();
    if (onesignal_rest_api_key !== undefined && onesignal_rest_api_key.trim()) {
      updates.onesignal_rest_api_key = onesignal_rest_api_key.trim();
    }

    await saveGameSettings('global', updates);
    invalidateGameCaches();

    res.json({ success: true, message: 'Configuración de OneSignal guardada exitosamente' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/welcome', async (req, res) => {
  try {
    const { phone: rawPhone, name } = req.body;
    const phone = normalizePhone(rawPhone);
    const playerName = name || 'Jugador';

    // Require authentication: admin can send to any player, player can only notify themselves
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Autenticación requerida para enviar notificaciones de bienvenida.' });
    }
    if (authUser.role === 'player') {
      const authPhone = normalizePhone(authUser.phone || '');
      if (authPhone && phone && authPhone !== phone) {
        return res.status(403).json({ error: 'Acceso denegado: Solo puedes enviar notificaciones a tu propio número.' });
      }
    }

    const title = '👋 ¡BIENVENIDO A BINGO LITE!';
    const message = [
      `🎉 ¡Hola ${playerName}, qué alegría tenerte aquí!`,
      `✨ Tu cuenta ha sido activada con éxito.`,
      `💰 Revisa tus sorteos activos y tu saldo disponible.`,
      `🎟️ Asegura tus cartones para las próximas partidas.`,
      `🍀 ¡Te deseamos muchísima suerte en el juego!`
    ].join('\n');

    const result = await sendPushNotification({
      recipient: 'single',
      phone: phone || undefined,
      title,
      message,
      url: getAppUrl(req)
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/send', requireAdmin, async (req, res) => {
  const { recipient, phone, title, message } = req.body;
  const result = await sendPushNotification({
    recipient,
    phone,
    title,
    message,
    url: req.headers.origin
  });

  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

app.post('/api/ai/stream', requireAdmin, async (req, res) => {
  try {
    const { contents, config, model } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const ai = new GoogleGenAI({ apiKey });

    const responseStream = await ai.models.generateContentStream({
      model: model || 'gemini-3.8-flash',
      contents: Array.isArray(contents) ? contents : [{ parts: [{ text: contents }] }],
      config: {
        ...config,
        systemInstruction: config?.systemInstruction
      }
    });

    for await (const chunk of responseStream) {
      res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota')) {
      console.warn(`[Quota Exceeded] /api/ai/stream: ${error.message.split('\n')[0]}`);
      res.write(`data: ${JSON.stringify({ error: 'Quota exceeded for Gemini API' })}\n\n`);
    } else {

      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    }
    res.end();
  }
});
app.post('/api/ai/generate', requireAdmin, async (req, res) => {
  try {
    const { contents, config, model } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada en el servidor' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: model || 'gemini-3.8-flash',
      contents: Array.isArray(contents) ? contents : [{ parts: [{ text: contents }] }],
      config: {
        ...config,
        systemInstruction: config?.systemInstruction
      }
    });

    // Check for audio data
    const audioData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    res.json({
      text: result.text,
      audioData: audioData || null
    });
  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Quota')) {
      console.warn(`[Quota Exceeded] /api/ai/generate: ${error.message.split('\n')[0]}`);
      res.status(429).json({ error: 'Quota exceeded for Gemini API' });
    } else {

      res.status(500).json({ error: error.message || 'Error interno al generar contenido de IA' });
    }
  }
});

// In-memory cache for recent AI announcements to avoid Ably message payload size limits (64KB)
const recentAnnouncements = new Map<string, { audio: string; text: string; voice: string }>();

// Pre-warmed voice audio cache for zero-latency instant announcements (especially resumption)
const RESUME_ANNOUNCEMENT_TEXT = "¡Atención jugadores! Reanudamos el sorteo de balotas. ¡Mucha suerte a todos con sus cartones!";
const prewarmedVoiceAudioCache = new Map<string, string>();
let geminiTssDisabledDueToAuthError = false;

app.get('/api/announcements/audio', (req, res) => {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Falta el ID del anuncio' });
  }
  const announcement = recentAnnouncements.get(id);
  if (!announcement) {
    return res.status(404).json({ error: 'El anuncio expiró o no existe' });
  }
  res.json({ audio: announcement.audio });
});

app.get('/api/announcements/prewarm-resume', async (req, res) => {
  try {
    const cleanKey = RESUME_ANNOUNCEMENT_TEXT.trim().toLowerCase();
    let audio = prewarmedVoiceAudioCache.get(cleanKey);
    if (!audio) {
      audio = await generateVoiceAudioDirect(RESUME_ANNOUNCEMENT_TEXT, 'Kore');
      if (audio) prewarmedVoiceAudioCache.set(cleanKey, audio);
    }
    res.json({ text: RESUME_ANNOUNCEMENT_TEXT, audio: audio || '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function getFallbackTTSAudio(text: string): Promise<string> {
  try {
    if (!text || !text.trim()) return '';
    // Split text into chunks <= 150 chars on sentence/word boundaries
    const rawSentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let current = '';

    for (const s of rawSentences) {
      if ((current + ' ' + s).trim().length <= 150) {
        current = (current + ' ' + s).trim();
      } else {
        if (current) chunks.push(current);
        if (s.length > 150) {
          const words = s.split(' ');
          let wChunk = '';
          for (const w of words) {
            if ((wChunk + ' ' + w).trim().length <= 150) {
              wChunk = (wChunk + ' ' + w).trim();
            } else {
              if (wChunk) chunks.push(wChunk);
              wChunk = w;
            }
          }
          if (wChunk) current = wChunk;
          else current = '';
        } else {
          current = s.trim();
        }
      }
    }
    if (current) chunks.push(current);

    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=es&client=tw-ob`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        audioBuffers.push(Buffer.from(arrayBuffer));
      }
    }

    if (audioBuffers.length === 0) return '';
    return Buffer.concat(audioBuffers).toString('base64');
  } catch (err: any) {
    console.error('[Fallback TTS Error]', err);
    return '';
  }
}

function pcm16ToWavBuffer(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
  if (!pcmBuffer || pcmBuffer.length === 0) return Buffer.alloc(0);

  // If it's already a standard WAV or MP3 container header, return as is
  if (pcmBuffer.length > 4) {
    const isWav = pcmBuffer[0] === 0x52 && pcmBuffer[1] === 0x49 && pcmBuffer[2] === 0x46 && pcmBuffer[3] === 0x46; // RIFF
    const isId3 = pcmBuffer[0] === 0x49 && pcmBuffer[1] === 0x44 && pcmBuffer[2] === 0x33; // ID3
    const isMp3 = pcmBuffer[0] === 0xFF && (pcmBuffer[1] & 0xE0) === 0xE0; // MPEG
    if (isWav || isId3 || isMp3) {
      return pcmBuffer;
    }
  }

  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const wavBuf = Buffer.alloc(headerSize + dataSize);

  // RIFF chunk descriptor
  wavBuf.write('RIFF', 0);
  wavBuf.writeUInt32LE(36 + dataSize, 4);
  wavBuf.write('WAVE', 8);

  // fmt sub-chunk
  wavBuf.write('fmt ', 12);
  wavBuf.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavBuf.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  wavBuf.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
  wavBuf.writeUInt32LE(sampleRate, 24); // SampleRate
  wavBuf.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  wavBuf.writeUInt16LE(2, 32);  // BlockAlign
  wavBuf.writeUInt16LE(16, 34); // BitsPerSample

  // data sub-chunk
  wavBuf.write('data', 36);
  wavBuf.writeUInt32LE(dataSize, 40);

  // Copy raw PCM audio samples
  pcmBuffer.copy(wavBuf, headerSize);

  return wavBuf;
}

async function generateAIAudioInChunks(ai: any, text: string, voice: string, styleGuide: string): Promise<{ audio_base64: string; is_quota_exceeded: boolean }> {
  let is_quota_exceeded = false;
  if (!text || !text.trim()) return { audio_base64: '', is_quota_exceeded: false };

  // If text is short (<= 300 chars), process directly in 1 call
  if (text.length <= 300) {
    try {
      const styledText = `[Estilo: ${styleGuide}] ${text}`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [{ parts: [{ text: styledText }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
            },
          },
        },
      });
      const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (data) {
        const rawBuf = Buffer.from(data, 'base64');
        const wavBuf = pcm16ToWavBuffer(rawBuf, 24000);
        return { audio_base64: wavBuf.toString('base64'), is_quota_exceeded: false };
      }
    } catch (err: any) {
      if (err.message?.includes('429') || err.message?.toLowerCase().includes('quota')) {
        is_quota_exceeded = true;
      }
    }
    const fallback = await getFallbackTTSAudio(text);
    return { audio_base64: fallback, is_quota_exceeded };
  }

  // For long text (> 300 chars), split into sentence chunks of <= 280 chars
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if ((current + ' ' + s).trim().length <= 280) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length > 280) {
        const parts = s.split(/([,;:]\s+)/);
        let sub = '';
        for (const p of parts) {
          if ((sub + p).length <= 280) {
            sub += p;
          } else {
            if (sub) chunks.push(sub.trim());
            sub = p;
          }
        }
        if (sub) current = sub.trim();
        else current = '';
      } else {
        current = s.trim();
      }
    }
  }
  if (current) chunks.push(current);

  const audioBuffers: Buffer[] = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    let chunkBase64 = '';
    try {
      const styledText = `[Estilo: ${styleGuide}] ${chunk}`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [{ parts: [{ text: styledText }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
            },
          },
        },
      });
      chunkBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
    } catch (err: any) {
      if (err.message?.includes('429') || err.message?.toLowerCase().includes('quota')) {
        is_quota_exceeded = true;
      }
    }

    if (!chunkBase64) {
      chunkBase64 = await getFallbackTTSAudio(chunk);
    }

    if (chunkBase64) {
      const rawBuf = Buffer.from(chunkBase64, 'base64');
      audioBuffers.push(rawBuf);
    }
  }

  if (audioBuffers.length === 0) {
    const totalFallback = await getFallbackTTSAudio(text);
    return { audio_base64: totalFallback, is_quota_exceeded };
  }

  const combinedRawPcm = Buffer.concat(audioBuffers);
  const finalWavBuffer = pcm16ToWavBuffer(combinedRawPcm, 24000);

  return { audio_base64: finalWavBuffer.toString('base64'), is_quota_exceeded };
}

app.post('/api/admin/broadcast-announcement', async (req, res) => {
  try {
    const { text, voice, audio_base64 } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Texto del anuncio es requerido' });
    }

    let base64Audio = audio_base64 || '';
    let isFallbackSpeech = false;

    if (!base64Audio) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada' });
      }

      const ai = new GoogleGenAI({ apiKey });

      let styleGuide = "profesional y neutro";
      if (voice === 'Kore') styleGuide = "formal, profesional, claro, neutro y televisivo";
      else if (voice === 'Aoede') styleGuide = "¡cálido, alegre, amigable, entusiasta y muy festivo!";
      else if (voice === 'Leda') styleGuide = "elegante, sofisticado, moderno, suave y envolvente";
      else if (voice === 'Puck') styleGuide = "¡con extrema energía, euforia, velocidad rápida, emocionante y apasionado de fiesta!";
      else if (voice === 'Charon') styleGuide = "grave, profundo, pausado, elegante, sereno y de locutor FM profesional";
      else if (voice === 'Fenrir') styleGuide = "potente, masculino, firme, autoritario y con gran presencia de estadio";
      else if (voice === 'Orpheus') styleGuide = "cálido, narrativo, amigable y expresivo";
      else if (voice === 'Zephyr') styleGuide = "jovial, fresco, espontáneo y dinámico";

      const genResult = await generateAIAudioInChunks(ai, text, voice || 'Kore', styleGuide);
      base64Audio = genResult.audio_base64;
      if (!base64Audio) {
        isFallbackSpeech = true;
      }
    }

    // Save in cache (even if empty, so the endpoint can respond or we flag it)
    const announcementId = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    recentAnnouncements.set(announcementId, {
      audio: base64Audio,
      text,
      voice: voice || 'Kore'
    });

    if (recentAnnouncements.size > 50) {
      const keys = Array.from(recentAnnouncements.keys());
      recentAnnouncements.delete(keys[0]);
    }

    await getChannel().publish('announcement_tts', {
      id: announcementId,
      text,
      voice: voice || 'Kore',
      isFallbackSpeech,
      timestamp: Date.now()
    });

    res.json({ success: true, voice, id: announcementId, textLength: text.length, isFallbackSpeech, audio_base64: base64Audio });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al transmitir el anuncio inteligente' });
  }
});

app.post('/api/admin/generate-ai-audio', async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Texto del anuncio es requerido' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    let styleGuide = "profesional y neutro";
    if (voice === 'Kore') styleGuide = "formal, profesional, claro, neutro y televisivo";
    else if (voice === 'Aoede') styleGuide = "¡cálido, alegre, amigable, entusiasta y muy festivo!";
    else if (voice === 'Leda') styleGuide = "elegante, sofisticado, moderno, suave y envolvente";
    else if (voice === 'Puck') styleGuide = "¡con extrema energía, euforia, velocidad rápida, emocionante y apasionado de fiesta!";
    else if (voice === 'Charon') styleGuide = "grave, profundo, pausado, elegante, sereno y de locutor FM profesional";
    else if (voice === 'Fenrir') styleGuide = "potente, masculino, firme, autoritario y con gran presencia de estadio";
    else if (voice === 'Orpheus') styleGuide = "cálido, narrativo, amigable y expresivo";
    else if (voice === 'Zephyr') styleGuide = "jovial, fresco, espontáneo y dinámico";

    console.log(`[AI TTS] Generating audio for text length: ${text.length} chars with voice: ${voice || 'Kore'}`);
    const genResult = await generateAIAudioInChunks(ai, text, voice || 'Kore', styleGuide);

    res.json({
      success: true,
      audio_base64: genResult.audio_base64,
      warning: genResult.is_quota_exceeded ? 'Límite de cuota API excedido. Usando voz de respaldo.' : null,
      is_fallback: !genResult.audio_base64 || genResult.is_quota_exceeded
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al generar audio AI' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    supabase: !!supabase,
    ably: !!ably,
    env: {
      has_url: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      has_key: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      has_ably: !!process.env.ABLY_API_KEY
    }
  });
});

// Manifest routes
app.get(['/manifest.json', '/manifest.webmanifest'], (req, res) => {
  const distPath = path.join(process.cwd(), 'dist');
  const manifestPath = path.join(distPath, req.path.substring(1));

  if (fs.existsSync(manifestPath)) {
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.sendFile(manifestPath);
  }

  // Fallback to public folder in dev
  const publicPath = path.join(process.cwd(), 'public', req.path.substring(1));
  if (fs.existsSync(publicPath)) {
    res.setHeader('Content-Type', 'application/manifest+json');
    return res.sendFile(publicPath);
  }

  // If not found, let it go to 404 or SPA fallback
  res.status(404).send('Manifest not found');
});


async function migratePhoneNumbers() {
  console.log('Running phone number migration...');
  try {
    // 1. Normalize players
    const { data: players } = await supabase.from('players').select('id, phone');
    if (players) {
      for (const p of players) {
        const normalized = normalizePhone(p.phone);
        if (normalized !== p.phone) {
          await supabase.from('players').update({ phone: normalized }).eq('id', p.id);
        }
      }
    }

    // 2. Normalize wallets
    const { data: wallets } = await supabase.from('wallets').select('phone');
    if (wallets) {
      for (const w of wallets) {
        const normalized = normalizePhone(w.phone);
        if (normalized !== w.phone) {
          // Since phone is primary key, we need to be careful.
          // In this case, it's easier to just delete and re-insert or use a temp table if it was complex.
          // But here we can just update if no conflict.
          const { data: existing } = await supabase.from('wallets').select('phone').eq('phone', normalized).maybeSingle();
          if (!existing) {
            // We can't easily update a PK in Supabase via JS if it's referenced? 
            // Actually wallets doesn't have FKs pointing to it in the schema.
            // But let's just do it.
            const { data: fullWallet } = await supabase.from('wallets').select('*').eq('phone', w.phone).single();
            if (fullWallet) {
              await supabase.from('wallets').delete().eq('phone', w.phone);
              await supabase.from('wallets').insert({ ...fullWallet, phone: normalized });
            }
          }
        }
      }
    }

    // 3. Normalize wallet_activations
    const { data: activations } = await supabase.from('wallet_activations').select('phone, game_id');
    if (activations) {
      for (const a of activations) {
        const normalized = normalizePhone(a.phone);
        if (normalized !== a.phone) {
          const { data: existing } = await supabase.from('wallet_activations').select('*').eq('phone', normalized).eq('game_id', a.game_id).maybeSingle();
          if (!existing) {
            await supabase.from('wallet_activations').update({ phone: normalized }).eq('phone', a.phone).eq('game_id', a.game_id);
          } else {
            await supabase.from('wallet_activations').delete().eq('phone', a.phone).eq('game_id', a.game_id);
          }
        }
      }
    }
    console.log('Phone number migration completed.');
  } catch (err) {

  }
}

process.on('uncaughtException', (err) => {
  console.log('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

// Helper for broadcasting voice announcements via Gemini TTS or browser speech
const recentBroadcastTexts = new Map<string, number>();

async function generateVoiceAudioDirect(text: string, voice: string = 'Kore'): Promise<string> {
  const cleanKey = (text || '').trim().toLowerCase();
  if (prewarmedVoiceAudioCache.has(cleanKey)) {
    return prewarmedVoiceAudioCache.get(cleanKey)!;
  }

  // Strict 3.0s safety timeout: guarantees server engine loops and timing are never blocked
  const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(''), 3000));

  const generatePromise = (async () => {
    let base64Audio = '';
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && !geminiTssDisabledDueToAuthError) {
      try {
        const aiClient = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ parts: [{ text: `[Estilo: formal, profesional, claro y neutro] ${text}` }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
              },
            },
          },
        });
        base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('ACCOUNT_STATE_INVALID') || msg.includes('service account')) {
          geminiTssDisabledDueToAuthError = true;
          console.log('[Voice Announcement] Gemini TTS disabled due to service account status; using high-quality fallback TTS.');
        } else {
          console.warn('[Voice Announcement] Gemini TTS synthesis error, using fallback:', msg);
        }
      }
    }

    if (!base64Audio) {
      base64Audio = await getFallbackTTSAudio(text);
    }

    if (base64Audio) {
      prewarmedVoiceAudioCache.set(cleanKey, base64Audio);
    }

    return base64Audio;
  })();

  return Promise.race([generatePromise, timeoutPromise]);
}

// Pre-warm the resume announcement at boot time so it's instantly available
setTimeout(() => {
  generateVoiceAudioDirect(RESUME_ANNOUNCEMENT_TEXT, 'Kore')
    .then((audio) => {
      if (audio) console.log('[TTS Prewarm] Resume announcement audio ready in cache.');
    })
    .catch((err) => console.warn('[TTS Prewarm] Notice:', err?.message || err));
}, 1000);

async function broadcastVoiceAnnouncement(text: string, voice: string = 'Kore') {
  try {
    const cleanKey = (text || '').trim().toLowerCase();
    const now = Date.now();
    const lastSent = recentBroadcastTexts.get(cleanKey);
    if (lastSent && (now - lastSent < 20000)) {
      console.log(`[Voice Announcement] Skipping repeated server broadcast within 20s: "${cleanKey.substring(0, 40)}..."`);
      return { success: true, skipped: true };
    }
    recentBroadcastTexts.set(cleanKey, now);
    if (recentBroadcastTexts.size > 80) {
      for (const [k, v] of recentBroadcastTexts.entries()) {
        if (now - v > 30000) recentBroadcastTexts.delete(k);
      }
    }

    let base64Audio = prewarmedVoiceAudioCache.get(cleanKey) || '';
    let isFallbackSpeech = false;

    if (!base64Audio) {
      base64Audio = await generateVoiceAudioDirect(text, voice || 'Kore');
      if (!base64Audio) {
        isFallbackSpeech = true;
      }
    }

    const announcementId = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    recentAnnouncements.set(announcementId, {
      audio: base64Audio,
      text,
      voice: voice || 'Kore'
    });

    if (recentAnnouncements.size > 50) {
      const keys = Array.from(recentAnnouncements.keys());
      recentAnnouncements.delete(keys[0]);
    }

    await getChannel().publish('announcement_tts', {
      id: announcementId,
      text,
      voice: voice || 'Kore',
      isFallbackSpeech,
      timestamp: Date.now()
    });

    console.log(`[Voice Announcement] Broadcasted: "${text}" (instant: ${!!prewarmedVoiceAudioCache.has(cleanKey)})`);
    return { success: true, id: announcementId };
  } catch (err: any) {
    console.error('[Voice Announcement] Error broadcasting voice announcement:', err);
    return { success: false, error: err.message };
  }
}

// Tracking scheduled game announcements & automated state
interface GameAnnouncementState {
  announced_5min?: boolean;
  announced_1min?: boolean;
  announced_start?: boolean;
  announced_auto_start?: boolean;
}
const gameAnnouncements = new Map<number, GameAnnouncementState>();
const announcedStartIds = new Set<number>();

// Distributed Database Lock for Multi-instance / Scaled environments
async function acquireAnnouncementLock(gameId: number, lockKey: 'announced_5min' | 'announced_1min' | 'announced_start'): Promise<boolean> {
  const key = `announcement_lock_${gameId}`;
  try {
    const { data, error: fetchError } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    if (fetchError) throw fetchError;

    let current: any = {};
    if (data && data.value) {
      try {
        current = JSON.parse(data.value);
      } catch (e) { }
    }

    if (current[lockKey]) {
      return false; // Already locked/announced!
    }

    current[lockKey] = true;
    const { error: upsertError } = await supabase.from('settings').upsert({
      key,
      value: JSON.stringify(current)
    }, { onConflict: 'key' });

    if (upsertError) throw upsertError;
    return true;
  } catch (err) {
    console.error(`[BingoEngine] Failed to acquire announcement lock ${lockKey} for game ${gameId}:`, err);
    // Fallback to local sets to prevent hard breaks if database has temporary connection issues
    return false;
  }
}

const GAME_INTRO_TEXT = "¡Bienvenidos, jugadores! ¡Ya vamos a comenzar nuestro bingo! Estén muy atentos a sus cartones, marquen cada número que vaya saliendo y completen sus figuras, las figuras se completaran al azar. Y recuerden… cuando completen una figura, ¡presionen BINGO para reclamar su premio! . ¡Mucha suerte para todos! ¡Que comience el juego… y que gane el mejor!";

async function broadcastGameStartAnnouncement(gameId: number) {
  const numId = Number(gameId);

  // Distributed database lock to prevent concurrent container double-play
  const locked = await acquireAnnouncementLock(numId, 'announced_start');
  if (!locked) {
    console.log(`[BingoEngine] Start announcement already sent/locked for game ${numId} (Database Block)`);
    return false;
  }

  if (announcedStartIds.has(numId)) return false;
  announcedStartIds.add(numId);

  // Update state in map for consistency
  const state = gameAnnouncements.get(numId) || {};
  state.announced_start = true;
  state.announced_auto_start = true;
  gameAnnouncements.set(numId, state);

  await broadcastVoiceAnnouncement(GAME_INTRO_TEXT, 'Kore');
  serverAutoplay.lastAnnouncementTime = Date.now();
  console.log(`[BingoEngine] Start announcement sent once for game ${numId}`);
  return true;
}

// Server-authoritative autoplay state
interface ServerAutoplayState {
  gameId: number | null;
  isRunning: boolean;
  intervalMs: number;
  isPausedForWinner: boolean;
  winnerPauseUntil: number;
  lastDrawTime: number;
  isDrawing: boolean;
  lastAnnouncementTime: number; // To prevent balls while announcing
}
const serverAutoplay: ServerAutoplayState = {
  gameId: null,
  isRunning: false,
  intervalMs: 8000,
  isPausedForWinner: false,
  winnerPauseUntil: 0,
  lastDrawTime: 0,
  isDrawing: false,
  lastAnnouncementTime: 0
};

// API routes for Admin Autoplay control
app.post('/api/admin/game/autoplay/start', async (req, res) => {
  try {
    const { interval, gameId } = req.body;
    let game: any = null;
    if (gameId) {
      game = await getGameFullState(Number(gameId));
    }
    if (!game) {
      game = await getActiveGame();
    }
    if (!game) {
      const { data: schedGame } = await supabase.from('game')
        .select('*')
        .in('status', ['waiting', 'scheduled', 'playing', 'paused'])
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (schedGame) {
        game = await getGameFullState(schedGame.id);
      }
    }
    if (!game) {
      return res.status(404).json({ error: 'No hay juego activo para iniciar autoplay' });
    }

    const prevStatus = game.status;
    if (game.status === 'waiting' || game.status === 'scheduled' || game.status === 'paused') {
      const { data: updatedRows, error: updateError } = await supabase.from('game')
        .update({ status: 'playing' })
        .eq('id', game.id)
        .in('status', ['waiting', 'scheduled', 'paused'])
        .select('id');

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      // If rows were updated, this container is the official starter!
      if (updatedRows && updatedRows.length > 0) {
        game.status = 'playing';
        await broadcastGameUpdate(game.id);

        const nowTime = Date.now();
        const drawnCount = Array.isArray(game.drawn_balls) ? game.drawn_balls.length : 0;
        const isResumingGame = prevStatus === 'paused' || drawnCount > 0;

        if (isResumingGame) {
          const lastResumeKey = `resume_announcement_${game.id}`;
          const lastResumeSent = recentBroadcastTexts.get(lastResumeKey) || 0;
          if (nowTime - lastResumeSent > 15000) {
            recentBroadcastTexts.set(lastResumeKey, nowTime);
            broadcastVoiceAnnouncement(RESUME_ANNOUNCEMENT_TEXT, 'Kore');
            serverAutoplay.lastAnnouncementTime = nowTime;
          } else {
            console.log(`[Autoplay] Resume announcement skipped (already announced within 15s for game ${game.id})`);
          }
        } else {
          await broadcastGameStartAnnouncement(Number(game.id));
        }
      } else {
        // Just sync our local variable but don't re-trigger announcements
        game.status = 'playing';
      }
    }

    // If autoplay is already actively running for this game, do not reset timers or interrupt ongoing balls
    if (serverAutoplay.isRunning && serverAutoplay.gameId === game.id) {
      console.log(`[Autoplay] Already actively running for game ${game.id}`);
      return res.json({ success: true, isRunning: true, interval: serverAutoplay.intervalMs / 1000 });
    }

    serverAutoplay.gameId = game.id;
    serverAutoplay.isRunning = true;
    const finalInterval = (interval && Number(interval) >= 8) ? Number(interval) * 1000 : 8000;
    serverAutoplay.intervalMs = finalInterval;
    serverAutoplay.isPausedForWinner = false;
    serverAutoplay.winnerPauseUntil = 0;

    const drawnBallsCount = Array.isArray(game.drawn_balls) ? game.drawn_balls.length : 0;
    const isResuming = prevStatus === 'paused' || drawnBallsCount > 0;

    if (isResuming) {
      // Ensure resume announcement is broadcasted immediately if not sent recently
      const lastResumeKey = `resume_announcement_${game.id}`;
      const lastResumeSent = recentBroadcastTexts.get(lastResumeKey) || 0;
      if (Date.now() - lastResumeSent > 15000) {
        recentBroadcastTexts.set(lastResumeKey, Date.now());
        broadcastVoiceAnnouncement(RESUME_ANNOUNCEMENT_TEXT, 'Kore');
        serverAutoplay.lastAnnouncementTime = Date.now();
      }

      // User requirement: When reactivating automatic manually after pause, start the game in exactly 5 seconds
      serverAutoplay.lastDrawTime = Date.now() + 5000 - finalInterval;
      console.log(`[Autoplay] Resumed for game ${game.id}. Next ball scheduled in exactly 5 seconds.`);
    } else {
      // First ball of brand-new game: Intro (approx 27s) + 10s buffer = 37s total
      // Subtract one interval to sync with the drawing logic
      serverAutoplay.lastDrawTime = Date.now() + 37000 - finalInterval;
      console.log(`[Autoplay] Brand new start for game ${game.id}. Next ball scheduled in 37s (after intro).`);
    }

    await getChannel().publish('server_autoplay_updated', {
      isRunning: true,
      gameId: game.id,
      interval: finalInterval / 1000
    });

    console.log(`[Autoplay] Started on server for game ${game.id} with interval ${serverAutoplay.intervalMs}ms`);
    res.json({ success: true, isRunning: true, interval: serverAutoplay.intervalMs / 1000 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/game/autoplay/stop', async (req, res) => {
  try {
    serverAutoplay.isRunning = false;
    serverAutoplay.isPausedForWinner = false;

    let targetGameId = serverAutoplay.gameId;
    if (!targetGameId) {
      const activeGame = await getActiveGame();
      if (activeGame) targetGameId = activeGame.id;
    }

    if (targetGameId) {
      // Formally pause the game in database so autoplay engines and background loops stop permanently
      await supabase.from('game').update({ status: 'paused' }).eq('id', targetGameId);
      await broadcastGameUpdate(targetGameId);
    }

    invalidateAutoplayCache();
    invalidateGameCaches();

    await getChannel().publish('server_autoplay_updated', {
      isRunning: false,
      gameId: targetGameId,
      interval: serverAutoplay.intervalMs / 1000
    });

    console.log(`[Autoplay] Stopped on server and game ${targetGameId} set to paused.`);
    res.json({ success: true, isRunning: false, gameId: targetGameId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/game/autoplay/status', (req, res) => {
  res.json({
    isRunning: serverAutoplay.isRunning,
    gameId: serverAutoplay.gameId,
    interval: serverAutoplay.intervalMs / 1000,
    isPausedForWinner: serverAutoplay.isPausedForWinner
  });
});

app.post('/api/admin/game/autoplay/update-interval', async (req, res) => {
  try {
    const { interval } = req.body;
    const numInterval = Number(interval);
    const validInterval = (numInterval && numInterval >= 8) ? numInterval : 8;

    serverAutoplay.intervalMs = validInterval * 1000;

    // Save to settings
    await saveGameSettings('global', { autoplay_interval: validInterval });

    await getChannel().publish('server_autoplay_updated', {
      isRunning: serverAutoplay.isRunning,
      gameId: serverAutoplay.gameId,
      interval: validInterval
    });

    console.log(`[Autoplay] Updated interval on server to ${validInterval}s`);
    res.json({ success: true, interval: validInterval, isRunning: serverAutoplay.isRunning });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to schedule or modify scheduled start time of a game
app.post('/api/admin/game/schedule', async (req, res) => {
  try {
    const { gameId, startTime, interval } = req.body;
    let targetGameId = gameId;

    if (!targetGameId) {
      const activeGame = await getActiveGame();
      if (activeGame) {
        targetGameId = activeGame.id;
      } else {
        const { data: schedGame } = await supabase.from('game')
          .select('id')
          .in('status', ['waiting', 'scheduled', 'paused'])
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (schedGame) targetGameId = schedGame.id;
      }
    }

    if (!targetGameId) {
      return res.status(404).json({ error: 'No se encontró un juego para programar' });
    }

    const isoDate = new Date(startTime).toISOString();

    // Update game start_time and set status to 'scheduled'
    const { data: updatedGame, error } = await supabase
      .from('game')
      .update({
        start_time: isoDate,
        status: 'scheduled'
      })
      .eq('id', targetGameId)
      .select()
      .single();

    if (error) throw error;

    if (interval && Number(interval) >= 1) {
      serverAutoplay.intervalMs = Number(interval) * 1000;
      await saveGameSettings('global', { autoplay_interval: Number(interval) });
    }

    // Reset announcement tracking for this game
    gameAnnouncements.delete(targetGameId);

    await broadcastGameUpdate(targetGameId);
    invalidateGameCaches();

    // Trigger automatic broadcast push notification with exact game details
    try {
      const fullGame = await getGameFullState(targetGameId);
      const gameSettings = await getGameSettings(targetGameId);
      const { title: notifTitle, message: notifMessage } = formatGameNotificationDetails(
        fullGame || updatedGame,
        gameSettings,
        isoDate
      );

      sendPushNotification({
        recipient: 'all',
        title: notifTitle,
        message: notifMessage,
        url: getAppUrl(req)
      }).catch(e => console.warn('[Notification] Game schedule push note error:', e));
    } catch (schedNotifErr) {
      console.warn('[Notification] Game schedule format error:', schedNotifErr);
    }

    console.log(`[Schedule] Scheduled game ${targetGameId} for start_time: ${isoDate}`);
    res.json({ success: true, game: updatedGame });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to cancel a scheduled game start time
app.post('/api/admin/game/schedule/cancel', async (req, res) => {
  try {
    const { gameId } = req.body;
    let targetGameId = gameId;

    if (!targetGameId) {
      const { data: schedGame } = await supabase.from('game')
        .select('id')
        .eq('status', 'scheduled')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (schedGame) targetGameId = schedGame.id;
    }

    if (!targetGameId) {
      return res.status(404).json({ error: 'No hay juego programado para cancelar' });
    }

    const { data: updatedGame, error } = await supabase
      .from('game')
      .update({
        status: 'waiting'
      })
      .eq('id', targetGameId)
      .select()
      .single();

    if (error) throw error;

    gameAnnouncements.delete(targetGameId);
    await broadcastGameUpdate(targetGameId);
    invalidateGameCaches();

    res.json({ success: true, game: updatedGame });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Autonomous Game Loop & Scheduled Engine (Runs every 500ms for high-precision timing, optimized with memory caches)
let autoGameInterval: NodeJS.Timeout | null = null;
const AUTO_LOOP_MS = 500;
let isLoopRunning = false;

// Optimization: Cache scheduled games in the background loop to prevent Supabase log/resource exhaustion
let cachedLoopScheduledGames: any[] | null = null;
let lastLoopScheduledGamesCheckTime = 0;

let cachedAutoplayGame: any = null;
let lastAutoplayGameFetchTime = 0;

function invalidateAutoplayCache() {
  cachedAutoplayGame = null;
  lastAutoplayGameFetchTime = 0;
  cachedLoopScheduledGames = null;
  lastLoopScheduledGamesCheckTime = 0;
}

async function startBackgroundGameLoop() {
  if (autoGameInterval) clearInterval(autoGameInterval);

  console.log('[AutoEngine] Starting Autonomous Server-Side Game Engine (Pre-announcements & Autonomous Drawing)...');
  autoGameInterval = setInterval(async () => {
    if (isLoopRunning) return;
    isLoopRunning = true;

    try {
      const now = Date.now();

      // 1. Check Scheduled Games for 5min / 1min / Start Pre-announcements (cached for 15 seconds to reduce Supabase queries)
      let scheduledGames = cachedLoopScheduledGames;
      if (!scheduledGames || (now - lastLoopScheduledGamesCheckTime > 15000)) {
        const { data } = await supabase.from('game')
          .select('*')
          .in('status', ['scheduled', 'waiting'])
          .not('start_time', 'is', null);
        scheduledGames = data || [];
        cachedLoopScheduledGames = scheduledGames;
        lastLoopScheduledGamesCheckTime = now;
      }

      if (scheduledGames && scheduledGames.length > 0) {
        for (const game of scheduledGames) {
          const startTime = new Date(game.start_time).getTime();
          const diffMs = startTime - now;
          const gameId = Number(game.id);
          let state = gameAnnouncements.get(gameId) || {};

          // A. 5-Minute Warning (triggered once between 5m and 1m before)
          if (diffMs <= 5 * 60 * 1000 && diffMs > 65 * 1000 && !state.announced_5min) {
            const locked = await acquireAnnouncementLock(gameId, 'announced_5min');
            if (locked) {
              state.announced_5min = true;
              gameAnnouncements.set(gameId, state);
              console.log(`[AutoEngine] Triggering 5-minute pre-announcement for game ${gameId}`);

              broadcastVoiceAnnouncement(`¡Atención jugadores! El Bingo ${game.name || ''} comenzará en 5 minutos. Por favor alisten sus cartones y prepárense para jugar. ¡Buena suerte a todos!`, 'Kore');
              serverAutoplay.lastAnnouncementTime = Date.now();
            }
          }

          // B. 1-Minute Warning (triggered once between 1m and 0 before)
          if (diffMs <= 60 * 1000 && diffMs > 5000 && !state.announced_1min) {
            const locked = await acquireAnnouncementLock(gameId, 'announced_1min');
            if (locked) {
              state.announced_1min = true;
              gameAnnouncements.set(gameId, state);
              console.log(`[AutoEngine] Triggering 1-minute warning for game ${gameId}`);

              broadcastVoiceAnnouncement(`¡Atención! Falta 1 minuto para iniciar el Bingo. Verifiquen sus cartones en pantalla.`, 'Kore');
              serverAutoplay.lastAnnouncementTime = Date.now();
            }
          }

          // C. Start Time Reached (diffMs <= 0)
          if (diffMs <= 0 && !state.announced_start && !announcedStartIds.has(gameId)) {
            // Set game to playing atomically using optimistic database status transition
            const { data: updatedRows, error: updateError } = await supabase.from('game')
              .update({ status: 'playing' })
              .eq('id', gameId)
              .in('status', ['scheduled', 'waiting'])
              .select('id');

            if (updateError || !updatedRows || updatedRows.length === 0) {
              console.log(`[AutoEngine] Game ${gameId} already activated or playing. Skipping scheduled start process.`);
              continue;
            }

            console.log(`[AutoEngine] Scheduled start time reached for game ${gameId}. Auto-activating...`);
            await broadcastGameUpdate(gameId);
            invalidateGameCaches();

            // Announce start via consolidated helper (non-blocking)
            broadcastGameStartAnnouncement(gameId);

            // Engage Server Autoplay
            serverAutoplay.gameId = gameId;
            serverAutoplay.isRunning = true;
            serverAutoplay.isPausedForWinner = false;

            // Default interval is 8s
            const interval = serverAutoplay.intervalMs || 8000;
            // After intro (approx 27s) wait 10 more seconds -> 37s total from now
            serverAutoplay.lastDrawTime = Date.now() + 37000 - interval;

            await getChannel().publish('server_autoplay_updated', {
              isRunning: true,
              gameId: gameId,
              interval: interval / 1000
            });
          }
        }
      }

      // 2. Server-Side Autonomous Ball Drawing
      if (serverAutoplay.isRunning && serverAutoplay.gameId && !serverAutoplay.isDrawing) {
        // Prevent drawing if an announcement was just made (intro, winner, or manual)
        const timeSinceAnnouncement = now - serverAutoplay.lastAnnouncementTime;
        if (timeSinceAnnouncement < 4000) {
          // Brief pause for introductory voice before ball drawing starts
          return;
        }

        // Fetch and cache the game state during autoplay for 3 seconds to drastically reduce Supabase query rate
        let game = cachedAutoplayGame;
        if (!game || !lastAutoplayGameFetchTime || (now - lastAutoplayGameFetchTime > 3000) || game.id !== serverAutoplay.gameId) {
          game = await getGameFullState(serverAutoplay.gameId);
          cachedAutoplayGame = game;
          lastAutoplayGameFetchTime = now;
        }

        // If game not found, skip this iteration (might be temporary network issue)
        if (!game) return;

        // If game is finished, stop autoplay and notify UI
        if (game.status === 'finished') {
          serverAutoplay.isRunning = false;
          serverAutoplay.gameId = null;
          await getChannel().publish('server_autoplay_updated', {
            isRunning: false,
            gameId: null,
            interval: 8
          });
          return;
        }

        // A. Handle Winner Celebration Pause
        if (serverAutoplay.isPausedForWinner) {
          if (now < serverAutoplay.winnerPauseUntil) {
            // Still in celebration pause (showing modal, playing fanfare)
            return;
          } else {
            // Celebration pause finished! Resume autonomous ball drawing
            serverAutoplay.isPausedForWinner = false;
            console.log(`[AutoEngine] Winner celebration completed. Resuming autonomous ball drawing for game ${game.id}...`);

            const { data: allPatterns } = await supabase.from('game_patterns')
              .select('id, winner_player_id')
              .eq('game_id', game.id);

            const remainingPatterns = (allPatterns || []).filter(p => !p.winner_player_id);

            if (allPatterns && allPatterns.length > 0 && remainingPatterns.length === 0) {
              console.log(`[AutoEngine] All patterns won for game ${game.id}. Completing game after celebration.`);
              broadcastVoiceAnnouncement(`¡Felicitaciones a todos los ganadores! Todos los patrones han sido completados. El juego ha finalizado.`, 'Kore');
              serverAutoplay.isRunning = false;
              serverAutoplay.gameId = null;
              await endGameCleanup(game.id, game.final_note || "¡Todos los patrones han sido completados!");
              await getChannel().publish('server_autoplay_updated', {
                isRunning: false,
                gameId: null,
                interval: 8
              });
              return;
            }

            if (allPatterns && allPatterns.length > 0 && remainingPatterns.length > 0) {
              console.log(`[AutoEngine] Continuing game ${game.id} with ${remainingPatterns.length} remaining patterns.`);
              broadcastVoiceAnnouncement(`¡Continuamos en el juego con la siguiente figura ganadora! ¡Mucha suerte a todos los participantes!`, 'Kore');
            } else {
              console.log(`[AutoEngine] Continuing ball draws for game ${game.id}.`);
              broadcastVoiceAnnouncement(`¡Continuamos en el juego con el sorteo de balotas! ¡Mucha suerte a todos los participantes!`, 'Kore');
            }

            serverAutoplay.lastAnnouncementTime = Date.now();

            // Force game status back to playing in DB and memory
            await supabase.from('game').update({ status: 'playing' }).eq('id', game.id);
            invalidateAutoplayCache();
            await broadcastGameUpdate(game.id);

            const currentInt = Math.max(8000, serverAutoplay.intervalMs || 8000);
            // Allow 4 seconds transition for locution before next ball is drawn
            serverAutoplay.lastDrawTime = Date.now() + 4000 - currentInt;
            lastGlobalBallDrawTime = Date.now() - currentInt; // Reset rate limiter to ensure next ball is drawn immediately after locution
            serverAutoplay.isRunning = true;
            return;
          }
        }

        // If game is paused or finished, double check with fresh database query before stopping autoplay
        if (game.status === 'paused' && !serverAutoplay.isPausedForWinner) {
          const { data: dbCheck } = await supabase.from('game').select('status').eq('id', game.id).maybeSingle();
          if (dbCheck && dbCheck.status === 'paused') {
            serverAutoplay.isRunning = false;
            await getChannel().publish('server_autoplay_updated', {
              isRunning: false,
              gameId: game.id,
              interval: (serverAutoplay.intervalMs || 8000) / 1000
            });
            return;
          } else if (dbCheck && dbCheck.status === 'playing') {
            game.status = 'playing';
            if (cachedAutoplayGame) cachedAutoplayGame.status = 'playing';
          }
        }

        // B. Check if it is time to draw the next ball (strictly enforcing at least 8 seconds)
        const currentIntervalMs = Math.max(8000, serverAutoplay.intervalMs || 8000);
        if (now - serverAutoplay.lastDrawTime >= currentIntervalMs) {
          serverAutoplay.isDrawing = true;

          try {
            const drawResult = await drawNextBall(game);

            if (drawResult.error) {
              console.log(`[AutoEngine] Ball draw result notice: ${drawResult.error}`);
              if (drawResult.error === 'All balls drawn') {
                await endGameCleanup(game.id, game.final_note || "");
                serverAutoplay.isRunning = false;
              }
            }
          } finally {
            serverAutoplay.isDrawing = false;
          }
        }
      }

    } catch (e: any) {
      console.warn('[AutoEngine] Background loop notice:', e?.message);
    } finally {
      isLoopRunning = false;
    }
  }, AUTO_LOOP_MS);
}

// Ping presence route for players
app.post('/api/players/ping', (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone is required for ping' });
    }
    touchPlayerPresence(phone, name);
    res.json({ success: true, online_count: onlinePlayers.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Online players list and count for admins
app.get('/api/admin/online-players', (req, res) => {
  try {
    const now = Date.now();
    const activeOnline: any[] = [];
    for (const [key, value] of onlinePlayers.entries()) {
      if (now - value.timestamp <= 120000) {
        activeOnline.push({
          phone: value.phone,
          name: value.name,
          last_active: value.timestamp
        });
      } else {
        onlinePlayers.delete(key);
      }
    }
    res.json({
      online_count: activeOnline.length,
      players: activeOnline
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Games stats and historical summary endpoint
app.get('/api/admin/games-stats-history', async (req, res) => {
  try {
    // 1. Fetch all games with their patterns
    const { data: games, error: gamesError } = await supabase
      .from('game')
      .select(`
          id,
          name,
          status,
          start_time,
          drawn_balls,
          game_patterns (
            id, prize, winner_player_id, won_at,
            patterns (id, name)
          )
        `)
      .order('id', { ascending: false });

    if (gamesError) {
      throw gamesError;
    }

    // 2. Fetch all cards to compute statistics per game
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('game_id, card_number, player_id, players(name, phone)');

    // 3. Fetch count of all registered players
    const { data: allRegPlayers, error: playersError } = await supabase
      .from('players')
      .select('id, name, phone, created_at, status');

    const totalRegistered = allRegPlayers?.length || 0;

    // Group cards by game_id
    const cardsByGame: Record<number, any[]> = {};
    if (cards) {
      for (const card of cards) {
        const gid = card.game_id;
        if (!cardsByGame[gid]) {
          cardsByGame[gid] = [];
        }
        cardsByGame[gid].push(card);
      }
    }

    // 4. Construct response
    const statsHistory = (games || []).map((game) => {
      const gameCards = cardsByGame[game.id] || [];
      const uniquePlayersInGame = new Map<string, string>(); // phone -> name

      for (const card of gameCards) {
        let pNode: any = card.players;
        if (Array.isArray(pNode)) {
          pNode = pNode[0];
        }
        if (pNode) {
          const pPhone = pNode.phone || card.player_id || 'Unknown';
          const pName = pNode.name || 'Sin nombre';
          uniquePlayersInGame.set(pPhone, pName);
        }
      }

      const participantsCount = uniquePlayersInGame.size;
      const participantsList = Array.from(uniquePlayersInGame.entries()).map(([phone, name]) => ({
        phone,
        name
      }));

      const totalCardsInGame = gameCards.length;

      // Extract winner details
      const winners: any[] = [];
      if (game.game_patterns) {
        for (const gp of game.game_patterns) {
          const gpAny = gp as any;
          if (gpAny.winner_player_id) {
            const matchedPlayer = (allRegPlayers || []).find(p => p.id === gpAny.winner_player_id);
            let pName = matchedPlayer?.name || 'Jugador Desconocido';
            let pPhone = matchedPlayer?.phone || '';

            let patternName = 'Patrón';
            if (gpAny.patterns) {
              patternName = Array.isArray(gpAny.patterns)
                ? (gpAny.patterns[0]?.name || 'Patrón')
                : (gpAny.patterns?.name || 'Patrón');
            }

            winners.push({
              winner_id: gpAny.winner_player_id,
              winner_name: pName,
              winner_phone: pPhone,
              pattern_name: patternName,
              prize: gpAny.prize,
              won_at: gpAny.won_at
            });
          }
        }
      }

      return {
        game_id: game.id,
        name: game.name || `Juego #${game.id}`,
        status: game.status,
        date: game.start_time,
        created_at: game.start_time,
        drawn_balls_count: game.drawn_balls?.length || 0,
        cards_sold: totalCardsInGame,
        unique_players_count: participantsCount,
        players_list: participantsList,
        winners
      };
    });

    res.json({
      total_registered_users: totalRegistered,
      games_count: statsHistory.length,
      history: statsHistory
    });

  } catch (err: any) {
    // ignored
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const distExists = fs.existsSync(path.join(process.cwd(), 'dist'));

  console.log('Starting server in', isProduction ? 'production' : 'development', 'mode');

  // Start the background game loop
  startBackgroundGameLoop();

  // Load global autoplay interval if set
  try {
    const settings = await getGameSettings('global');
    if (settings.autoplay_interval) {
      serverAutoplay.intervalMs = Number(settings.autoplay_interval) * 1000;
      console.log(`[Autoplay] Loaded global interval from settings: ${settings.autoplay_interval}s`);
    }
  } catch (err) {
    console.warn('[Autoplay] Could not load global settings on start');
  }

  // Run migration in background to avoid blocking the server startup
  migratePhoneNumbers().then(() => {
    console.log('Phone number migration completed.');
  }).catch(err => {

  });

  if (distExists) {
    console.log('Production build found: Serving static assets and SPA routes from dist folder.');
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    console.log('Dist folder not found: Initializing Vite development middleware mode.');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Global error handler for debugging
  app.use((err: any, req: any, res: any, next: any) => {

    res.status(500).json({
      error: err.message || 'Internal Server Error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bingo Server is ACTIVE and listening on port ${PORT}`);
    console.log(`Targeting host: 0.0.0.0`);
    if (!supabase) {
      console.log('WARNING: Supabase client is NOT initialized. Check your environment variables.');
    } else {
      console.log('Supabase client initialized.');
    }
    if (!process.env.GEMINI_API_KEY) {
      console.log('WARNING: GEMINI_API_KEY is missing. AI Voice features will NOT work.');
    }
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} is already in use. Assuming server is already running.`);
    } else {

    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.log('Uncaught Exception thrown:', err);
  });
}

startServer();
