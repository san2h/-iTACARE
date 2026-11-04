// src/lib/guiaIA/agentContext.js

import { montarContextoDaPergunta, montarContextoDaCidade }
  from '../guiaIAContext';

import {
  buscarClima,
  formatarClimaParaPrompt,
  buscarPrevisaoSurf,
  formatarPrevisaoSurfParaPrompt
} from '../weatherContext';

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function selecionarDiasPrevisao(previsao, pergunta) {
  if (!previsao?.previsao?.length) return null;

  const q = normalizar(pergunta);

  let maxOffset = 0;

  if (/semana|7 dias|proximos dias/.test(q)) {
    maxOffset = 6;
  } else if (/fim de semana|sabado|domingo/.test(q)) {
    maxOffset = 6;
  } else if (/amanha/.test(q)) {
    maxOffset = 1;
  }

  const dias = previsao.previsao.filter(
    (dia) => dia.offset >= 0 && dia.offset <= maxOffset
  );

  if (!dias.length) return null;

  return formatarPrevisaoSurfParaPrompt({
    ...previsao,
    previsao: dias
  });
}

export async function montarContextoDoAgente(agente, pergunta) {

  console.log(`[Agentes] Montando contexto: ${agente}`);

  // ==========================================
  // AGENTE SURF
  // ==========================================

  if (agente === 'surf') {
    const [lugares, clima, previsao] = await Promise.all([
      montarContextoDaPergunta(`${pergunta} praias`).catch(() => ''),
      buscarClima().catch((err) => {
        console.warn('[Agente Surf] Clima indisponível:', err);
        return null;
      }),
      buscarPrevisaoSurf(7).catch((err) => {
        console.warn('[Agente Surf] Previsão indisponível:', err);
        return null;
      })
    ]);

    const climaTexto = clima
      ? formatarClimaParaPrompt(clima)
      : 'Dados atuais de clima e mar indisponíveis.';

    const previsaoTexto = previsao
      ? selecionarDiasPrevisao(previsao, pergunta)
      : '';

    return [
      '# AGENTE ESPECIALISTA EM SURF E PRAIAS',
      lugares,
      climaTexto,
      previsaoTexto,

      `IMPORTANTE SOBRE A PRECISÃO:
A previsão oceanográfica disponível neste módulo utiliza como ponto de referência as coordenadas da Praia da Tiririca.
Não apresente os valores da Tiririca como se fossem medições individuais de todas as praias.
Utilize os dados meteorológicos disponíveis e as características cadastradas de cada local.
Quando não houver dados específicos de uma praia, deixe clara essa limitação.`

    ].filter(Boolean).join('\n\n');
  }

  // ==========================================
  // AGENTE CLIMA
  // ==========================================

  if (agente === 'clima') {
    const [clima, previsao] = await Promise.all([
      buscarClima().catch(() => null),
      buscarPrevisaoSurf(7).catch(() => null)
    ]);

    return [
      '# AGENTE ESPECIALISTA EM CLIMA',
      clima ? formatarClimaParaPrompt(clima) : 'Dados atuais indisponíveis.',
      previsao ? selecionarDiasPrevisao(previsao, pergunta) : ''
    ].filter(Boolean).join('\n\n');
  }

  // ==========================================
  // AGENTE GERAL / APP
  // ==========================================

  if (agente === 'geral' || agente === 'app') {
    return montarContextoDaPergunta(pergunta);
  }

  // ==========================================
  // DEMAIS AGENTES
  // ==========================================

  const pistas = {
    gastronomia: 'restaurantes',
    hospedagem: 'hotéis pousadas hospedagem',
    turismo: 'praias cachoeiras trilhas passeios',
    eventos: 'eventos',
    servicos: 'serviços passeios aulas profissionais'
  };

  const perguntaExpandida = [
    pergunta,
    pistas[agente] || ''
  ].join(' ');

  return montarContextoDaPergunta(perguntaExpandida);
}