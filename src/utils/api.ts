import { supabase } from '../lib/supabase';

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit, retries = 3): Promise<Response> => {
  const headers = new Headers(init?.headers);

  // Auto-adjuntar token de administrador (HMAC token), token de jugador o token de sesión de Supabase
  if (!headers.has('Authorization')) {
    try {
      const adminToken = typeof window !== 'undefined' ? localStorage.getItem('bingo_admin_token') : null;
      const playerToken = typeof window !== 'undefined' ? localStorage.getItem('bingo_player_token') : null;
      if (adminToken) {
        headers.set('Authorization', `Bearer ${adminToken}`);
      } else if (playerToken) {
        headers.set('Authorization', `Bearer ${playerToken}`);
      } else {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers.set('Authorization', `Bearer ${data.session.access_token}`);
        }
      }
    } catch (e) {
      // Continuar sin token si falla la obtención de sesión
    }
  }

  // Auto-adjuntar X-Tenant-Id si nos encontramos en la ruta de una sala o el usuario pertenece a una sala
  if (!headers.has('X-Tenant-Id')) {
    try {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const match = pathname.match(/\/sala\/([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) {
        headers.set('X-Tenant-Id', match[1].toLowerCase());
      } else {
        const adminSession = localStorage.getItem('bingo_admin_user');
        if (adminSession) {
          const parsed = JSON.parse(adminSession);
          if (parsed.tenant_id && parsed.tenant_id !== 'global') {
            headers.set('X-Tenant-Id', parsed.tenant_id.toLowerCase());
          }
        } else {
          const playerSession = localStorage.getItem('bingo_player');
          if (playerSession) {
            const parsed = JSON.parse(playerSession);
            if (parsed.tenant_id && parsed.tenant_id !== 'global') {
              headers.set('X-Tenant-Id', parsed.tenant_id.toLowerCase());
            }
          }
        }
      }
    } catch (e) {}
  }

  // If the body is FormData, we MUST let the browser set the Content-Type header with the boundary
  const isFormData = init?.body instanceof FormData;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds timeout

  try {
    const fetchInit: RequestInit = {
      ...init,
      cache: 'no-store',
      signal: controller.signal
    };

    // Only set headers if it's not FormData or if there are specific headers to set
    if (!isFormData) {
      fetchInit.headers = headers;
    } else {
      // If FormData, we still might want other headers (like Auth), but NOT Content-Type
      headers.delete('Content-Type');
      if (headers.entries().next().done === false) {
        fetchInit.headers = headers;
      }
    }

    const response = await fetch(input, fetchInit);
    clearTimeout(timeoutId);

    // Read the body as text once. If the stream download fails halfway through,
    // it will throw a real network error caught by the retry block below!
    let plainTextContent = '';
    const hasBody = response.status !== 204 && response.status !== 205 && response.status !== 304;
    if (hasBody) {
      plainTextContent = await response.text();
    }

    const trimmedText = plainTextContent.trim();
    const lowerText = trimmedText.toLowerCase();

    let isHtml = false;
    let isPlainRateLimit = false;
    let isPlainQuotaExceeded = false;

    if (lowerText.startsWith('<!doctype') || lowerText.startsWith('<html')) {
      isHtml = true;
    } else if (trimmedText.includes('Rate exceeded') || trimmedText.includes('rate exceeded') || trimmedText === 'Rate exceeded.') {
      isPlainRateLimit = true;
    } else if (trimmedText.includes('Quota exceeded') || trimmedText.includes('quota exceeded')) {
      isPlainQuotaExceeded = true;
    }

    if (isHtml) {
      console.log('API Error: Server returned HTML instead of JSON for', input, 'HTML:', trimmedText.substring(0, 100));
      return new Response(JSON.stringify({ error: `La ruta de API no existe o devolvió HTML: ${input}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (isPlainRateLimit) {
      if (retries > 0) {
        // Wait longer (3.5 seconds) and retry to respect rate limit
        await new Promise(r => setTimeout(r, 3500));
        return apiFetch(input, init, retries - 1);
      }
      console.log('API Error: Supabase or server rate limit hit for', input);
      return new Response(JSON.stringify({ error: 'Límite de peticiones de Supabase / Servidor excedido ("Rate exceeded"). Por favor, espera unos segundos e intenta de nuevo.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (isPlainQuotaExceeded) {
      console.log('API Error: Gemini API quota exceeded for', input);
      return new Response(JSON.stringify({ error: 'La cuota de peticiones del modelo de IA se ha agotado. Por favor, intenta de nuevo en unos minutos.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Safely override body consumer methods so they immediately return the cached string,
    // avoiding stream-already-consumed crashes or network failures after header resolution.
    response.text = async () => plainTextContent;
    response.json = async () => {
      if (!trimmedText) {
        return {};
      }
      try {
        return JSON.parse(trimmedText);
      } catch (err) {
        console.log('Failed to parse JSON in response.json():', err, 'Content was:', trimmedText.substring(0, 200));
        return { error: 'Error al decodificar la respuesta del servidor.' };
      }
    };

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado tiempo. Por favor, revisa tu conexión a internet.');
    }
    if (error.message === 'Failed to fetch' || error.message.includes('fetch') || error.message.includes('network') || error.message.includes('typeerror') || error.name === 'TypeError') {
      console.log(`Fetch attempt failed for ${input}: ${error.message} (Retries left: ${retries})`);
      if (retries > 0) {
        // Wait 2.5 seconds and retry
        await new Promise(r => setTimeout(r, 2500));
        return apiFetch(input, init, retries - 1);
      }
      throw new Error(`Error de conexión con el servidor (${input}). Revisa tu internet o el estado del servidor.`);
    }
    throw error;
  }
};
