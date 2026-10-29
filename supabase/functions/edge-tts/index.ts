// supabase/functions/edge-tts/index.ts
import { UniversalEdgeTTS } from 'npm:edge-tts-universal@1.4.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { text, voice } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Parâmetro "text" é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vozFinal = voice || 'pt-BR-FranciscaNeural';

    console.log(`[edge-tts] Sintetizando: voz=${vozFinal}, chars=${text.length}`);

    const tts = new UniversalEdgeTTS(text, vozFinal);
    const result = await tts.synthesize();

    // O `result.audio` é um Uint8Array (áudio MP3)
    const audioBuffer = result.audio;

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Nenhum áudio gerado.');
    }

    console.log(`[edge-tts] Áudio gerado: ${audioBuffer.length} bytes`);

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[edge-tts] Erro:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});