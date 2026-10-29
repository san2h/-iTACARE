// src/lib/useLiveSession.js
import { useCallback, useEffect, useRef, useState } from 'react';

const SUPABASE_PROJECT_ID = 'jjdrudvqkfqbvayhyfrh';
const TOKEN_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/live-token`;
const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

const LIVE_MODEL = 'gemini-3.8-live';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

// Volume padrão do Live (0.0 a 1.0). 0.35 = ~35% do máximo.
const LIVE_OUTPUT_GAIN = 0.35;

function float32ToPCM16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function pcm16ToFloat32(pcm) {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function useLiveSession({ systemInstruction = '', voice = 'Kore', anonKey, volume } = {}) {
  const [conectado, setConectado] = useState(false);
  const [falando, setFalando] = useState(false);
  const [transcricaoUser, setTranscricaoUser] = useState('');
  const [transcricaoIA, setTranscricaoIA] = useState('');
  const [erro, setErro] = useState(null);

  const wsRef = useRef(null);
  const ctxInRef = useRef(null);
  const ctxOutRef = useRef(null);
  const gainNodeRef = useRef(null);   // 🔧 NOVO: controla volume do áudio de saída
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const playHeadRef = useRef(0);
  const conectadoRef = useRef(false);
  const sistemaRef = useRef(systemInstruction);
  const vozRef = useRef(voice);
  const anonKeyRef = useRef(anonKey);
  const volumeRef = useRef(
    typeof volume === 'number' && volume >= 0 && volume <= 1 ? volume : LIVE_OUTPUT_GAIN
  );

  useEffect(() => { sistemaRef.current = systemInstruction; }, [systemInstruction]);
  useEffect(() => { vozRef.current = voice; }, [voice]);
  useEffect(() => { anonKeyRef.current = anonKey; }, [anonKey]);

  // 🔧 NOVO: se `volume` mudar em runtime, atualiza o GainNode sem reabrir a sessão
  useEffect(() => {
    if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
      volumeRef.current = volume;
      if (gainNodeRef.current) {
        try { gainNodeRef.current.gain.value = volume; } catch {}
      }
    }
  }, [volume]);

  const limpar = useCallback(() => {
    conectadoRef.current = false;
    setConectado(false);
    setFalando(false);

    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch {}
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (gainNodeRef.current) {
      try { gainNodeRef.current.disconnect(); } catch {}
      gainNodeRef.current = null;
    }
    if (ctxInRef.current) {
      ctxInRef.current.close().catch(() => {});
      ctxInRef.current = null;
    }
    if (ctxOutRef.current) {
      ctxOutRef.current.close().catch(() => {});
      ctxOutRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(1000); } catch {}
      wsRef.current = null;
    }
  }, []);

  useEffect(() => () => limpar(), [limpar]);

  const iniciar = useCallback(async () => {
    if (conectadoRef.current) return;
    setErro(null);
    setTranscricaoUser('');
    setTranscricaoIA('');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (anonKeyRef.current) {
        headers.Authorization = `Bearer ${anonKeyRef.current}`;
        headers.apikey = anonKeyRef.current;
      }

      const tRes = await fetch(TOKEN_URL, { method: 'POST', headers });
      if (!tRes.ok) throw new Error(`Falha ao obter token (HTTP ${tRes.status})`);
      const data = await tRes.json();
      const token = data?.token;
      if (!token) throw new Error('Token ausente na resposta');

      console.log('[LiveSession] conectando com modelo:', LIVE_MODEL);

      const ws = new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(token)}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      const ctxIn = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE, latencyHint: 'interactive' });
      const ctxOut = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE, latencyHint: 'interactive' });
      ctxInRef.current = ctxIn;
      ctxOutRef.current = ctxOut;
      playHeadRef.current = ctxOut.currentTime;

      // 🔧 NOVO: GainNode entre os buffers e o destination
      const gainNode = ctxOut.createGain();
      gainNode.gain.value = volumeRef.current;
      gainNode.connect(ctxOut.destination);
      gainNodeRef.current = gainNode;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${LIVE_MODEL}`,
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: { voice_name: vozRef.current },
                },
              },
            },
            system_instruction: { parts: [{ text: sistemaRef.current }] },
            input_audio_transcription: {},
            output_audio_transcription: {},
          },
        }));
      };

      ws.onmessage = async (evt) => {
        let data;
        try {
          const txt = typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data);
          data = JSON.parse(txt);
        } catch { return; }

        if (data.setupComplete) {
          conectadoRef.current = true;
          setConectado(true);
          return;
        }
        if (data.error) {
          setErro(data.error.message || 'Erro do servidor Live');
          return;
        }

        const sc = data.serverContent;
        if (sc?.inputTranscription?.text) {
          setTranscricaoUser((p) => (p + ' ' + sc.inputTranscription.text).trim());
        }
        if (sc?.outputTranscription?.text) {
          setTranscricaoIA((p) => (p + ' ' + sc.outputTranscription.text).trim());
        }

        const parts = sc?.modelTurn?.parts ?? [];
        for (const part of parts) {
          const b64 = part.inlineData?.data;
          if (!b64) continue;
          const bytes = base64ToBytes(b64);
          const pcm = new Int16Array(bytes.buffer);
          const float = pcm16ToFloat32(pcm);

          if (!ctxOutRef.current || ctxOutRef.current.state === 'closed') continue;
          const buf = ctxOutRef.current.createBuffer(1, float.length, OUTPUT_SAMPLE_RATE);
          buf.copyToChannel(float, 0);
          const src = ctxOutRef.current.createBufferSource();
          src.buffer = buf;
          // 🔧 CORRIGIDO: conecta no GainNode (volume controlado) em vez do destination
          src.connect(gainNodeRef.current || ctxOutRef.current.destination);
          const start = Math.max(ctxOutRef.current.currentTime, playHeadRef.current);
          src.start(start);
          playHeadRef.current = start + buf.duration;
          setFalando(true);
          src.onended = () => {
            if (ctxOutRef.current && ctxOutRef.current.currentTime >= playHeadRef.current - 0.15) {
              setFalando(false);
            }
          };
        }

        if (sc?.turnComplete) setFalando(false);
      };

      ws.onerror = () => setErro('Erro na conexao Live.');
      ws.onclose = (e) => {
        conectadoRef.current = false;
        setConectado(false);
        if (e.code !== 1000 && e.code !== 1005) {
          setErro(`Sessao encerrada (code=${e.code}${e.reason ? ' - ' + e.reason : ''})`);
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const srcNode = ctxIn.createMediaStreamSource(stream);
      const proc = ctxIn.createScriptProcessor(4096, 1, 1);
      processorRef.current = proc;

      proc.onaudioprocess = (e) => {
        if (!conectadoRef.current) return;
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const inp = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPCM16(inp);
        const b64 = bytesToBase64(new Uint8Array(pcm16.buffer));
        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: b64,
              mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
            },
          },
        }));
      };

      srcNode.connect(proc);
      proc.connect(ctxIn.destination);
    } catch (err) {
      console.error('[LiveSession]', err);
      setErro(err.message || 'Falha ao iniciar sessao Live.');
      limpar();
    }
  }, [limpar]);

  const parar = useCallback(() => {
    limpar();
  }, [limpar]);

  return { conectado, falando, transcricaoUser, transcricaoIA, erro, iniciar, parar };
}