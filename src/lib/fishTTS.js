// src/lib/fishTTS.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig';

// �️ Voz escolhida na Fish Audio Voice Library
const VOZ_PADRAO = '3401d6c0245643908e849d3d4cde9fcd';

// Guardamos o contexto de áudio globalmente para máxima performance
let audioContext = null;

export async function gerarAudioFishTTS(texto, referenceId = VOZ_PADRAO) {
  if (!texto || !texto.trim()) return;

  const url = `${SUPABASE_URL}/functions/v1/fish-tts-proxy`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        text: texto,
        model: 's2.1-pro-free',
        reference_id: referenceId,
      }),
    });

    if (!res.ok) {
      const erroTexto = await res.text();
      console.error('[FishTTS] Erro HTTP', res.status, ':', erroTexto.slice(0, 500));
      throw new Error(`Servidor devolveu ${res.status}.`);
    }

    // � SOLUÇÃO ANDROID: Em vez de Blob ou Base64, pegamos o binário puro!
    const arrayBuffer = await res.arrayBuffer();
    console.log('[FishTTS] Binário puro recebido. Tamanho:', arrayBuffer.byteLength, 'bytes');

    return new Promise((resolve, reject) => {
      try {
        // Inicializa o motor de som do dispositivo
        if (!audioContext) {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Tenta reativar o contexto caso o Android o tenha suspendido por inatividade
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }

        // Descodifica o binário diretamente no hardware de som
        audioContext.decodeAudioData(
          arrayBuffer,
          (buffer) => {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);

            source.onended = () => {
              resolve(); // IA terminou de falar
            };

            source.start(0); // Começa a tocar imediatamente!
            console.log('[FishTTS] Áudio a tocar usando a Web Audio API de hardware!');
          },
          (err) => {
            console.error('[FishTTS] Erro ao descodificar hardware:', err);
            reject(new Error('Falha ao processar a faixa de áudio.'));
          }
        );
      } catch (e) {
        console.error('[FishTTS] Erro fatal no motor de áudio:', e);
        reject(e);
      }
    });

  } catch (error) {
    console.error('[FishTTS] Erro:', error);
    throw new Error('Não foi possível gerar a voz. Tente novamente.');
  }
}