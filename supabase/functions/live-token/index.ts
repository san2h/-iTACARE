// supabase/functions/live-token/index.ts
//
// Gera um "ephemeral token" do Gemini Live API.
// O frontend usa esse token para abrir o WebSocket SEM expor a API key.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const LIVE_MODEL = Deno.env.get('GEMINI_LIVE_MODEL') ?? 'gemini-3.8-live';
const VOICE_NAME = Deno.env.get('GEMINI_LIVE_VOICE') ?? 'Kore';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY não configurada' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const agora = Date.now();
    const body = {
      uses: 1,
      expireTime: new Date(agora + 60_000).toISOString(),           // sessão expira em 60s
      newSessionExpireTime: new Date(agora + 30_000).toISOString(), // início deve ocorrer em 30s
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const details = await res.text();
      console.error('[live-token] Gemini respondeu', res.status, details);
      return new Response(
        JSON.stringify({ error: 'Falha ao gerar token', status: res.status, details }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();
    // A resposta traz { name: "auth_tokens/..." }
    if (!data?.name) {
      return new Response(JSON.stringify({ error: 'Token vazio na resposta', data }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        token: data.name,
        model: LIVE_MODEL,
        voice: VOICE_NAME,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[live-token] exceção:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});