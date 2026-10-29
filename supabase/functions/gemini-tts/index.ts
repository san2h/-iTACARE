// supabase/functions/gemini-tts/index.ts
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
    const { text, voice, style } = await req.json();
    const apiKey = Deno.env.get('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada.');
    }

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Parâmetro "text" é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text,
              // Opcional: controla o estilo da fala (ex: "cheerful and friendly")
              ...(style && { speech_metadata: { style } }),
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            voice: voice || 'Kore', // Voz padrão
          },
        },
      },
    };

    console.log(`[gemini-tts] Sintetizando: voz=${voice || 'Kore'}, chars=${text.length}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[gemini-tts] Erro Gemini:', response.status, errorText);
      throw new Error(`Gemini API retornou ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Extrai o áudio (base64) da resposta
    const audioBase64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioBase64) {
      console.error('[gemini-tts] Resposta sem áudio:', JSON.stringify(data).slice(0, 500));
      throw new Error('Nenhum áudio foi gerado pela API.');
    }

    // Converte base64 para buffer de áudio
    const audioBuffer = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));

    console.log(`[gemini-tts] Áudio gerado: ${audioBuffer.length} bytes`);

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[gemini-tts] Erro inesperado:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});