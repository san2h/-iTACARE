import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export const isNative = () => Capacitor.isNativePlatform();

export const hasWebSpeech = () => {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};

export function useVoz({ onResult, onError, onEnd, timeoutSilencio = 2000 }) {
  const [ouvindo, setOuvindo] = useState(false);
  const [suporta, setSuporta] = useState(false);
  const recRef = useRef(null);

  const silenceTimerRef = useRef(null);
  const ultimoResultadoTsRef = useRef(0);
  const ouvindoRef = useRef(false);

  useEffect(() => {
    let ativo = true;
    const init = async () => {
      if (isNative()) {
        try {
          const { available } = await SpeechRecognition.available();
          if (ativo && available) {
            setSuporta(true);
            const perm = await SpeechRecognition.checkPermissions();
            if (perm.speechRecognition !== 'granted') {
              await SpeechRecognition.requestPermissions();
            }
          }
        } catch (err) {
          console.warn('[Voz] Plugin nativo indisponível:', err);
        }
      } else if (hasWebSpeech()) {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SpeechRecognitionAPI();
        rec.lang = 'pt-BR';
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (event) => {
          let texto = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            texto += event.results[i][0].transcript;
          }
          onResult?.(texto);
        };
        rec.onerror = (event) => {
          pararInterno();
          onError?.(event.error);
        };
        rec.onend = () => pararInterno();

        recRef.current = rec;
        setSuporta(true);
      }
    };
    init();

    return () => {
      ativo = false;
      pararInterno();
    };
  }, []);

  const iniciarWatchdog = () => {
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    
    silenceTimerRef.current = setInterval(() => {
      if (!ouvindoRef.current) return;
      
      const tempoParado = Date.now() - ultimoResultadoTsRef.current;
      const jaTemTexto = ultimoResultadoTsRef.current > 0;

      // Se já captou voz e passou 2 segundos em silêncio, manda parar instantaneamente
      if (jaTemTexto && tempoParado >= timeoutSilencio) {
        pararInterno();
      }
    }, 250);
  };

  const pararInterno = useCallback(() => {
    if (!ouvindoRef.current) return;

    // � A SOLUÇÃO: Atualiza o React e envia a mensagem ANTES de falar com o hardware
    ouvindoRef.current = false;
    setOuvindo(false);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    
    onEnd?.(); // Dispara a função de enviar a mensagem no GuiaIA

    // Tenta desligar o hardware em background (não congela o App se o Android falhar)
    setTimeout(async () => {
      try {
        if (isNative()) {
          await SpeechRecognition.stop();
          await SpeechRecognition.removeAllListeners();
        } else if (recRef.current) {
          recRef.current.stop();
        }
      } catch (err) {}
    }, 50);
  }, [onEnd]);

  const toggle = async () => {
    if (!suporta) return;

    if (ouvindoRef.current) {
      pararInterno();
      return;
    }

    try {
      ultimoResultadoTsRef.current = 0;
      ouvindoRef.current = true;
      setOuvindo(true);
      iniciarWatchdog();

      if (isNative()) {
        await SpeechRecognition.removeAllListeners();
        
        SpeechRecognition.addListener('partialResults', (data) => {
          const texto = data?.matches?.[0] || '';
          if (texto) {
            ultimoResultadoTsRef.current = Date.now();
            onResult?.(texto);
          }
        });

        SpeechRecognition.addListener('error', (err) => {
          // Se o Android der erro mas já tivermos texto, ignoramos o erro
          if (ultimoResultadoTsRef.current === 0) {
            pararInterno();
            onError?.(err.message || String(err));
          }
        });

        SpeechRecognition.start({
          language: 'pt-BR',
          maxResults: 1,
          partialResults: true,
          popup: false,
        }).catch((err) => {
          pararInterno();
        });
      } else {
        recRef.current.start();
      }
    } catch (err) {
      pararInterno();
    }
  };

  return { ouvindo, suporta, toggle, parar: pararInterno };
}