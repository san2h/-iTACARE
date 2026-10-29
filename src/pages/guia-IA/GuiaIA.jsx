import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Sparkles,
  Loader2,
  AlertCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  ExternalLink,
} from 'lucide-react';
import { montarContextoDaCidade } from '../../lib/guiaIAContext';
import { buscarClima, formatarClimaParaPrompt, buscarPrevisaoSurf, formatarPrevisaoSurfParaPrompt } from '../../lib/weatherContext';
import { useVoz } from '../../lib/useVoz';
import { useLiveSession } from '../../lib/useLiveSession';
import { ROTAS_PERMITIDAS } from '../../lib/guiaIARoutes';
import GuiaIAMapPreview from '../../components/GuiaIAMapPreview';

import { jevEscolher } from '../../lib/jevClient';
import { gerarAudioEdgeTTS } from '../../lib/edgeTTS';
import { SYSTEM_PROMPT, SUGGESTIONS } from '../../lib/guiaIAConfig';
import { SUPABASE_ANON_KEY } from '../../lib/supabaseConfig';

const SUPABASE_PROJECT_ID = 'jjdrudvqkfqbvayhyfrh';
const LLM_CHAT_FUNCTION_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/llm-chat`;
const REQUEST_TIMEOUT_MS = 15000;

async function perguntarParaIA(historico, contextoDinamico = '') {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + contextoDinamico },
    ...historico.slice(-6).map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(LLM_CHAT_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('[GuiaIA] Edge Function respondeu', res.status, errData);
      throw new Error(
        errData.error || `O guia está indisponível agora (HTTP ${res.status}). Tente novamente.`
      );
    }

    const data = await res.json();
    const conteudo = data?.content?.trim();
    if (!conteudo) throw new Error('O guia não retornou uma resposta válida.');
    return conteudo;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('O guia demorou demais para responder. Tente novamente.');
    }
    throw err;
  }
}

function limparTextoParaFala(texto) {
  return texto
    .replace(/\\?\[\s*(NAV|PREVIEW|MAP)\s*:[^\]]+\\?\]/gi, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function GuiaIA() {
  const [mensagens, setMensagens] = useState([
    {
      role: 'assistant',
      content:
        'Olá! 👋 Sou o Guia IA do +iTACARÉ. Posso te ajudar com praias, restaurantes, história, trilhas e dicas da cidade. O que você quer saber?',
    },
  ]);
  const [input, setInput] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [dynamicContext, setDynamicContext] = useState('');

  const [vozAtiva, setVozAtiva] = useState(false);

  const [falandoIdx, setFalandoIdx] = useState(null);
  const [gerandoAudioIdx, setGerandoAudioIdx] = useState(null);

  const [previewRota, setPreviewRota] = useState(null);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [mapCategoria, setMapCategoria] = useState(null);
  const [mapAberto, setMapAberto] = useState(false);

  const fimDaListaRef = useRef(null);
  const inputRef = useRef('');

  const mensagensRef = useRef(mensagens);
  const enviarMensagemRef = useRef(null);
  const ouvindoRef = useRef(false);
  const carregandoRef = useRef(false);
  const vozAtivaRef = useRef(vozAtiva);

  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);

  const { ouvindo, suporta, toggle, parar } = useVoz({
    timeoutSilencio: 2000,
    onResult: (texto) => {
      setInput(texto);
      inputRef.current = texto;
    },
    onError: (err) => console.warn('[Voz]', err),
    onEnd: () => {
      const textoAtual = inputRef.current.trim();
      if (textoAtual) enviarMensagemRef.current?.(textoAtual);
    },
  });

  const live = useLiveSession({
    voice: 'Kore',
    anonKey: SUPABASE_ANON_KEY,
    systemInstruction: `${SYSTEM_PROMPT}\n\nContexto atual da cidade:\n${dynamicContext}\n\nVocê está respondendo por VOZ. Respostas curtas (2 a 4 frases), sem listas ou formatação.`,
  });

  useEffect(() => { mensagensRef.current = mensagens; }, [mensagens]);
  useEffect(() => { ouvindoRef.current = ouvindo; }, [ouvindo]);
  useEffect(() => { carregandoRef.current = carregando; }, [carregando]);
  useEffect(() => { vozAtivaRef.current = vozAtiva; }, [vozAtiva]);

  useEffect(() => {
    const carregarContexto = async () => {
      try {
        const [contexto, clima, previsao] = await Promise.all([
          montarContextoDaCidade(),
          buscarClima().catch((err) => {
            console.warn('[GuiaIA] Clima indisponível:', err);
            return null;
          }),
          buscarPrevisaoSurf(7).catch((err) => {
            console.warn('[GuiaIA] Previsão 7d indisponível:', err);
            return null;
          }),
        ]);

        const climaTxt = clima ? formatarClimaParaPrompt(clima) : '';
        const previsaoTxt = previsao ? formatarPrevisaoSurfParaPrompt(previsao) : '';

        const partes = [contexto, climaTxt, previsaoTxt].filter(Boolean);
        const contextoFinal = partes.join('\n\n');

        setDynamicContext(contextoFinal);
        console.log('[GuiaIA] Contexto montado:', contextoFinal.length, 'caracteres');
        console.log('[GuiaIA] Clima hoje?', climaTxt ? 'SIM' : 'NÃO');
        console.log('[GuiaIA] Previsão 7d?', previsaoTxt ? 'SIM' : 'NÃO');
      } catch (err) {
        console.warn('[GuiaIA] Falha ao montar contexto:', err);
      }
    };
    carregarContexto();
  }, []);

  useEffect(() => {
    const aquecer = async () => {
      try {
        await gerarAudioEdgeTTS('Olá');
      } catch {}
    };
    const timer = setTimeout(aquecer, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, carregando, live.transcricaoUser, live.transcricaoIA]);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const pararAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setFalandoIdx(null);
    setGerandoAudioIdx(null);
  };

  const falar = async (texto, idx = null) => {
    if (idx !== null && falandoIdx === idx) {
      pararAudio();
      return;
    }
    pararAudio();

    const textoLimpo = limparTextoParaFala(texto);
    if (!textoLimpo) return;
    const textoFinal = textoLimpo.slice(0, 2500);

    try {
      setGerandoAudioIdx(idx);
      const audioBlob = await gerarAudioEdgeTTS(textoFinal);
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onplay = () => {
        setGerandoAudioIdx(null);
        setFalandoIdx(idx);
      };
      audio.onended = () => {
        setFalandoIdx(null);
        if (audioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
      };
      audio.onerror = () => {
        setFalandoIdx(null);
        setGerandoAudioIdx(null);
        if (audioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
      };
      await audio.play();
    } catch (err) {
      console.error('[GuiaIA] Erro no TTS (Gemini):', err);
      setFalandoIdx(null);
      setGerandoAudioIdx(null);
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      audioRef.current = null;
      setErro('Não foi possível gerar a voz. Tente novamente.');
    }
  };

  const enviarMensagem = async (textoParaEnviar) => {
    const pergunta = (typeof textoParaEnviar === 'string' ? textoParaEnviar : input).trim();
    if (!pergunta || carregandoRef.current) return;
    if (vozAtivaRef.current) return;

    if (ouvindoRef.current) parar();

    setInput('');
    inputRef.current = '';
    setErro(null);
    pararAudio();

    try {
      jevEscolher(pergunta, 'Classifique', {
        restaurante: '1',
        praia: '1',
        evento: '1',
        aluguel: '1',
        carona: '1',
        app: '1',
        outro: '1',
      });
    } catch {}

    const novasMensagens = [...mensagensRef.current, { role: 'user', content: pergunta }];
    mensagensRef.current = novasMensagens;
    setMensagens(novasMensagens);

    carregandoRef.current = true;
    setCarregando(true);

    try {
      const resposta = await perguntarParaIA(novasMensagens, dynamicContext);
      const comResposta = [
        ...mensagensRef.current,
        { role: 'assistant', content: resposta },
      ];
      mensagensRef.current = comResposta;
      setMensagens(comResposta);
    } catch (err) {
      setErro(err.message || 'Erro ao consultar o guia.');
    } finally {
      carregandoRef.current = false;
      setCarregando(false);
    }
  };

  enviarMensagemRef.current = enviarMensagem;

  const handleToggleVoz = async () => {
    if (vozAtiva) {
      const turnoUser = live.transcricaoUser.trim();
      const turnoIA = live.transcricaoIA.trim();
      if (turnoUser || turnoIA) {
        const novas = [...mensagensRef.current];
        if (turnoUser) novas.push({ role: 'user', content: turnoUser });
        if (turnoIA) novas.push({ role: 'assistant', content: turnoIA });
        mensagensRef.current = novas;
        setMensagens(novas);
      }
      live.parar();
      setVozAtiva(false);
    } else {
      if (ouvindo) parar();
      pararAudio();
      setVozAtiva(true);
      await live.iniciar();
    }
  };

  const handleToggleMic = () => {
    if (vozAtivaRef.current) return;
    toggle();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  };

  const renderizarConteudo = (conteudo) => {
    const textoLimpo = conteudo.replace(/[\u200B-\u200D\uFEFF]/g, '');
    const regex = /\[(PREVIEW|NAV|MAP):([^|\]｜]+)[|｜]([^\]]+)\]/g;

    const partes = [];
    let ultimoIndex = 0;
    let match;

    while ((match = regex.exec(textoLimpo)) !== null) {
      if (match.index > ultimoIndex) {
        partes.push({ tipo: 'texto', valor: textoLimpo.slice(ultimoIndex, match.index) });
      }
      partes.push({
        tipo: 'nav',
        modo: match[1],
        rota: match[2].trim(),
        label: match[3].trim(),
      });
      ultimoIndex = match.index + match[0].length;
    }
    if (ultimoIndex < textoLimpo.length) {
      partes.push({ tipo: 'texto', valor: textoLimpo.slice(ultimoIndex) });
    }
    return partes;
  };

  const mostrarSugestoes = mensagens.length === 1 && !carregando && !vozAtiva;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#0A1428] via-[#0A1428] to-[#0d1b35] text-white">
      <header className="flex items-center justify-between gap-3 px-4 h-16 border-b border-blue-900/50 backdrop-blur-md bg-[#0A1428]/80 relative z-50">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-full hover:bg-blue-900/50 transition">
            <ArrowLeft className="w-5 h-5 text-cyan-300" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <h1 className="text-sm font-black text-white">Guia IA</h1>
              <span className="text-[10px] text-cyan-300 font-medium">Assistente do +iTACARÉ</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleToggleVoz}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold border transition ${
            vozAtiva
              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
              : 'bg-blue-900/40 border-blue-700/50 text-cyan-300/70'
          }`}
        >
          {vozAtiva ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <Volume2 className="w-3.5 h-3.5" />
              <span>Voz ON</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5" />
              <span>Voz OFF</span>
            </>
          )}
        </button>
      </header>

      {vozAtiva && (
        <div className="px-3 pt-2">
          <div className="mx-auto max-w-md bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-400/40 rounded-xl px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  !live.conectado
                    ? 'bg-amber-400 animate-pulse'
                    : live.falando
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-cyan-400 animate-pulse'
                }`}
              />
              <span className="text-xs font-bold text-emerald-200">
                {!live.conectado
                  ? 'Conectando...'
                  : live.falando
                  ? '🔊 Guia IA falando...'
                  : '🎙️ Ouvindo...'}
              </span>
            </div>
            {live.transcricaoUser && (
              <div className="text-xs text-cyan-100 mb-1">
                <span className="font-bold text-cyan-300">Você: </span>
                {live.transcricaoUser}
              </div>
            )}
            {live.transcricaoIA && (
              <div className="text-xs text-cyan-50">
                <span className="font-bold text-emerald-300">Guia: </span>
                {live.transcricaoIA}
              </div>
            )}
            {live.erro && (
              <div className="text-xs text-red-300 mt-2">⚠️ {live.erro}</div>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {mensagens.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex items-end gap-1.5 max-w-[90%]">
              {msg.role === 'assistant' && !vozAtiva && (
                <button
                  onClick={() => falar(msg.content, i)}
                  disabled={gerandoAudioIdx === i}
                  title={gerandoAudioIdx === i ? 'Gerando áudio...' : 'Ouvir esta resposta'}
                  className={`flex-shrink-0 p-1.5 rounded-full border transition mb-1 disabled:opacity-60 ${
                    falandoIdx === i
                      ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200'
                      : 'bg-blue-900/40 border-blue-700/50 text-cyan-300/60 hover:text-cyan-200'
                  }`}
                >
                  {gerandoAudioIdx === i ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : falandoIdx === i ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-md ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-br-sm'
                    : 'bg-blue-900/50 border border-blue-700/50 text-cyan-50 rounded-bl-sm'
                }`}
              >
                {renderizarConteudo(msg.content).map((parte, j) => {
                  if (parte.tipo === 'texto') {
                    return (
                      <span key={j} className="whitespace-pre-wrap">
                        {parte.valor}
                      </span>
                    );
                  }
                  if (parte.modo === 'MAP') {
                    return (
                      <button
                        key={j}
                        onClick={() => {
                          setMapCategoria(parte.rota);
                          setMapAberto(true);
                          pararAudio();
                        }}
                        className="inline-flex items-center gap-1 my-1.5 mr-1 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-br from-emerald-500 to-cyan-600 text-white hover:scale-105 transition shadow-md"
                      >
                        📍 {parte.label} →
                      </button>
                    );
                  }
                  const rotaValida =
                    ROTAS_PERMITIDAS[parte.rota.split('?')[0]] || ROTAS_PERMITIDAS[parte.rota];
                  return (
                    <button
                      key={j}
                      onClick={() => {
                        if (!rotaValida) return;
                        if (parte.modo === 'PREVIEW') {
                          setPreviewRota(parte.rota);
                          setPreviewAberto(true);
                          pararAudio();
                        } else {
                          window.location.href = parte.rota;
                        }
                      }}
                      className="inline-flex items-center gap-1 my-1.5 mr-1 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-br from-cyan-500 to-blue-600 text-white hover:scale-105 transition shadow-md"
                    >
                      {parte.modo === 'PREVIEW' ? '👁️ ' : ''}
                      {parte.label} →
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {mostrarSugestoes && (
          <div className="pt-2 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-cyan-400 font-bold px-1">
              Sugestões
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => enviarMensagem(s)}
                  className="text-xs px-3 py-2 rounded-full bg-blue-900/50 border border-blue-700/50 text-cyan-100 hover:border-cyan-400/60 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {carregando && !vozAtiva && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-bl-sm bg-blue-900/50 border border-blue-700/50">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-xs text-cyan-200">
                {gerandoAudioIdx !== null ? 'Gerando voz...' : 'O guia está pensando...'}
              </span>
            </div>
          </div>
        )}

        {erro && !vozAtiva && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-xs text-red-300 bg-red-900/30 border border-red-700/50 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4" />
              <span>{erro}</span>
            </div>
          </div>
        )}

        <div ref={fimDaListaRef} />
      </main>

      {previewAberto && previewRota && (
        <div className="absolute inset-x-0 top-16 bottom-[90px] z-40 flex flex-col bg-[#0A1428]/98 backdrop-blur-md border-t border-blue-700/50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-blue-900/50 bg-[#0A1428]">
            <span className="text-xs font-bold text-cyan-300 truncate max-w-[60%]">
              {ROTAS_PERMITIDAS[previewRota] || previewRota}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => window.open(previewRota, '_blank')}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-blue-900/50 text-cyan-200 border border-blue-700/50"
              >
                <ExternalLink className="w-3 h-3" />
                Tela cheia
              </button>
              <button
                onClick={() => {
                  setPreviewAberto(false);
                  setPreviewRota(null);
                }}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-red-900/40 text-red-200 border border-red-700/50"
              >
                <X className="w-3 h-3" />
                Fechar
              </button>
            </div>
          </div>
          <iframe
            src={previewRota}
            title="Preview"
            className="flex-1 w-full bg-[#0A1428]"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>
      )}

      {mapAberto && (
        <GuiaIAMapPreview
          categoria={mapCategoria}
          onClose={() => {
            setMapAberto(false);
            setMapCategoria(null);
          }}
        />
      )}

      <footer
        className="px-3 pt-2 border-t border-blue-900/50 bg-[#0A1428]/90 backdrop-blur-md relative z-50"
        style={{ paddingBottom: '90px' }}
      >
        {vozAtiva ? (
          <div className="flex items-center justify-center gap-2 bg-emerald-900/20 border border-emerald-500/30 rounded-2xl px-3 py-4">
            <span className="text-sm text-emerald-200 font-medium">
              🎙️ Fale naturalmente — o Guia IA responde por voz
            </span>
          </div>
        ) : (
          <>
            {!suporta && (
              <p className="text-[10px] text-amber-300/70 text-center mb-2">
                ⚠️ Microfone indisponível.
              </p>
            )}
            {ouvindo && (
              <p className="text-[10px] text-cyan-300/80 text-center mb-2 animate-pulse">
                🎙️ Fale agora... (Envia sozinho ao pausar)
              </p>
            )}

            <div className="flex items-end gap-2 bg-blue-900/50 border border-blue-700/50 rounded-2xl px-3 py-2 focus-within:border-cyan-400/60 transition">
              {suporta && (
                <button
                  onClick={handleToggleMic}
                  disabled={carregando}
                  className={`flex-shrink-0 p-2 rounded-xl transition disabled:opacity-40 ${
                    ouvindo
                      ? 'bg-red-500/30 border border-red-400/70 animate-pulse'
                      : 'bg-blue-900/60 border border-blue-700/50 hover:border-cyan-400/60'
                  }`}
                >
                  {ouvindo ? (
                    <MicOff className="w-4 h-4 text-red-300" />
                  ) : (
                    <Mic className="w-4 h-4 text-cyan-300" />
                  )}
                </button>
              )}
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  inputRef.current = e.target.value;
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={ouvindo ? 'Ouvindo...' : 'Pergunte sobre Itacaré...'}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-cyan-200/50 max-h-32 py-1"
                disabled={carregando}
              />
              <button
                onClick={() => enviarMensagem()}
                disabled={!input.trim() || carregando}
                className="flex-shrink-0 p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 disabled:opacity-40 hover:scale-105 transition"
              >
                {carregando ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-center text-cyan-300/50 mt-2">
              O Guia IA pode cometer erros. Confirme informações.
            </p>
          </>
        )}
      </footer>
    </div>
  );
}
