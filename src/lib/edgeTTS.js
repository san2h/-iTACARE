// src/lib/edgeTTS.js
const SUPABASE_PROJECT_ID = 'jjdrudvqkfqbvayhyfrh';
// 👇 MUDOU AQUI: agora aponta para a função gemini-tts
const GEMINI_TTS_FUNCTION_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/gemini-tts`;

const VOICE = 'Kore'; 

export async function gerarAudioEdgeTTS(texto, estilo = null) {
  const response = await fetch(GEMINI_TTS_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texto,
      voice: VOICE,
      ...(estilo && { style: estilo }),
    }),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`Gemini TTS Function retornou ${response.status}: ${msg}`);
  }

  return await response.blob();
}