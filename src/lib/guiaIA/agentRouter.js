// src/lib/guiaIA/agentRouter.js

import { jevEscolher } from '../jevClient';

// Opções apresentadas ao JEV.
// Cada uma descreve o tipo de pergunta que deve ser encaminhada.
const OPCOES_JEV = {
  surf: 'Surf, surfe, ondas, swell, maré, vento, condições do mar e melhor praia para surfar.',
  gastronomia: 'Restaurantes, bares, pizzarias, cafés, comidas, cardápios, delivery e onde comer.',
  hospedagem: 'Hotéis, pousadas, hostels, hospedagem, imóveis, aluguel e estadia.',
  turismo: 'Praias, cachoeiras, trilhas, passeios, lugares turísticos e o que fazer em Itacaré.',
  eventos: 'Eventos, festas, shows, festivais, agenda e programação da cidade.',
  servicos: 'Serviços, profissionais, aulas, guias, transportes, caronas e motoboy.',
  clima: 'Clima, temperatura, chuva, previsão meteorológica e condições do tempo.',
  app: 'Funcionamento do aplicativo +iTA, clubes, benefícios, pontos, moedas e funcionalidades.',
  geral: 'História, cultura, informações gerais e assuntos que não pertencem às outras categorias.'
};

const AGENTES_VALIDOS = Object.keys(OPCOES_JEV);

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Identificação local para funcionar mesmo quando o JEV falhar.
function classificarLocal(pergunta) {
  const q = normalizar(pergunta);

  if (/surf|surfe|surfar|swell|ondas?|arrebentacao|condicoes do mar/.test(q)) {
    return 'surf';
  }

  if (/restaurante|gastronom|jantar|almoco|comer|pizza|pizzaria|hamburg|cafeteria|cardapio/.test(q)) {
    return 'gastronomia';
  }

  if (/hotel|pousada|hostel|hospedagem|hospedar|aluguel|temporada|imovel/.test(q)) {
    return 'hospedagem';
  }

  if (/evento|festa|show|festival|agenda|ingresso|programacao/.test(q)) {
    return 'eventos';
  }

  if (/motoboy|delivery|entrega|carona|transfer|servico|aula|guia turistico/.test(q)) {
    return 'servicos';
  }

  if (/clima|temperatura|previsao do tempo|chuva|chover/.test(q)) {
    return 'clima';
  }

  if (/praia|cachoeira|trilha|passeio|mirante|visitar|turismo|o que fazer/.test(q)) {
    return 'turismo';
  }

  if (/itacoins|clube|assinatura|aplicativo|app|cadastro|conta|perfil/.test(q)) {
    return 'app';
  }

  return 'geral';
}

function normalizarEscolha(escolha) {
  const valor = normalizar(escolha).trim();

  const aliases = {
    restaurante: 'gastronomia',
    restaurantes: 'gastronomia',
    comida: 'gastronomia',
    praia: 'turismo',
    praias: 'turismo',
    aluguel: 'hospedagem',
    carona: 'servicos',
    outro: 'geral'
  };

  const agente = aliases[valor] || valor;

  return AGENTES_VALIDOS.includes(agente) ? agente : null;
}

export async function rotearAgente(pergunta, historico = []) {
  const fallback = classificarLocal(pergunta);

  // Inclui parte da conversa para entender perguntas como:
  // "E amanhã?", "E na Tiririca?" ou "Qual delas é melhor?"
  const conversaAnterior = historico
    .slice(-4)
    .map((m) => {
      const papel = m.role === 'assistant' ? 'Guia' : 'Usuário';
      return `${papel}: ${String(m.content || '').slice(0, 350)}`;
    })
    .join('\n');

  const estado = `
CONVERSA ANTERIOR:
${conversaAnterior}

PERGUNTA ATUAL:
${pergunta}
`.slice(-1800);

  try {
    const resultado = await jevEscolher(
      estado,
      'Classifique a intenção principal da pergunta atual. Escolha somente a especialidade mais adequada. Considere a conversa anterior para entender perguntas de continuação.',
      OPCOES_JEV
    );

    const escolhido = normalizarEscolha(resultado?.escolha);
    const confianca = Number(resultado?.confianca || 0);

    if (escolhido && confianca >= 0.55) {
      // Uma menção explícita a surf tem prioridade sobre uma
      // classificação genérica de praia ou turismo.
      if (fallback === 'surf' && escolhido !== 'surf') {
        return {
          agente: 'surf',
          confianca,
          metodo: 'prioridade_surf'
        };
      }

      return {
        agente: escolhido,
        confianca,
        metodo: 'jev'
      };
    }
  } catch (error) {
    console.warn('[GuiaIA] JEV indisponível; usando classificação local:', error);
  }

  return {
    agente: fallback,
    confianca: 0,
    metodo: 'fallback_local'
  };
}