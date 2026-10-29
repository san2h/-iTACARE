// src/lib/jevClient.js
// ============================================================
// Cliente Jev — decisões estruturadas via OpenRouter
// Endpoint: POST /api/alpha/decisions
// Modelo: typesafe/jev-1.13
// ============================================================

const JEV_URL = 'https://openrouter.ai/api/alpha/decisions';
const JEV_API_KEY = import.meta.env.VITE_JEV_API_KEY;
const JEV_MODEL = 'typesafe/jev-1.13';

/**
 * Faz uma pergunta "choice" para a Jev.
 * Retorna a opção escolhida + confiança.
 *
 * @param {string} texto - O texto do usuário (state)
 * @param {string} instrucao - O que perguntar (ex: "Qual categoria?")
 * @param {object} opcoes - Mapa de opções { chave: "descrição" }
 * @returns {Promise<{escolha: string, confianca: number}>}
 */
export async function jevEscolher(texto, instrucao, opcoes) {
  if (!JEV_API_KEY) {
    throw new Error('VITE_JEV_API_KEY não configurada no .env.local');
  }

  const res = await fetch(JEV_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JEV_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: texto,
      questions: {
        escolha: {
          type: 'choice',
          instructions: instrucao,
          criteria: opcoes,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Jev] Erro HTTP:', res.status, err);
    throw new Error(`Jev falhou: ${res.status}`);
  }

  const data = await res.json();

  // Estrutura da resposta do Jev:
  // {
  //   answers: {
  //     escolha: {
  //       type: "choice",
  //       choice: "restaurante",
  //       confidence: 0.92,
  //       probabilities: { ... }
  //     }
  //   }
  // }
  const answer = data?.answers?.escolha;

  if (!answer) {
    console.warn('[Jev] Resposta inesperada:', data);
    return { escolha: Object.keys(opcoes)[0], confianca: 0 };
  }

  return {
    escolha: answer.choice || Object.keys(opcoes)[0],
    confianca: answer.confidence ?? 0,
    probabilidades: answer.probabilities || {},
  };
}