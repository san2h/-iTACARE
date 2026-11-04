// supabase/functions/llm-chat/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_PRIMARY_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
const GEMINI_FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') || 'gemini-3.8-flash';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b';
const NVIDIA_MODEL = Deno.env.get('NVIDIA_MODEL') || 'nvidia/nemotron-3.5-lightning-30b-a3b';

const DEFAULT_MAX_TOKENS = 700;
const MAX_ALLOWED_TOKENS = 1200;

// Perfis dos especialistas. Cada agente pode receber um modelo Gemini próprio
// por variável de ambiente; sem configuração, todos usam GEMINI_MODEL.
const AGENT_PROFILES = {
  surf: {
    modelEnv: 'GEMINI_MODEL_SURF',
    maxTokens: 900,
    instruction: `Você é o especialista de SURF, PRAIAS E OCEANOGRAFIA do Guia IA do +iTACARÉ.
Analise altura e período das ondas, direção do swell, vento, maré e características conhecidas das praias de Itacaré.
Diferencie dados medidos, previsão e características gerais. Não invente condições por praia nem diga que uma praia está boa agora sem dados suficientes.
A previsão marítima disponível pode ter como referência a Praia da Tiririca; quando o contexto indicar isso, deixe claro que ela não representa medições individuais de todas as praias.
Ao comparar praias, explique a adequação provável considerando exposição e características conhecidas, sem fabricar medições locais. Se faltarem dados, diga exatamente o que está faltando e dê uma orientação prudente.`,
  },
  clima: {
    modelEnv: 'GEMINI_MODEL_CLIMA',
    maxTokens: 700,
    instruction: `Você é o especialista de CLIMA, TEMPO E MARÉS de Itacaré.
Priorize os dados atuais e a previsão incluídos no contexto, informando período e local de referência. Diferencie condição atual de previsão. Não invente chuva, vento, temperatura, maré ou horários que não estejam nos dados.`,
  },
  gastronomia: {
    modelEnv: 'GEMINI_MODEL_GASTRONOMIA',
    maxTokens: 700,
    instruction: `Você é o especialista em GASTRONOMIA de Itacaré.
Ajude a encontrar restaurantes, cafés, bares, pizzarias e pratos usando os registros fornecidos. Respeite nomes, endereços, categorias, faixas de preço e informações presentes no contexto. Não invente estabelecimentos, cardápios, preços, horários ou disponibilidade.`,
  },
  hospedagem: {
    modelEnv: 'GEMINI_MODEL_HOSPEDAGEM',
    maxTokens: 700,
    instruction: `Você é o especialista em HOSPEDAGEM de Itacaré.
Ajude a comparar hotéis, pousadas, hostels e outras acomodações com base nos registros fornecidos. Não invente tarifas, vagas, comodidades, localização ou políticas. Avise quando for necessário confirmar disponibilidade e preço diretamente com o estabelecimento.`,
  },
  turismo: {
    modelEnv: 'GEMINI_MODEL_TURISMO',
    maxTokens: 850,
    instruction: `Você é o especialista em TURISMO, PRAIAS, TRILHAS, CACHOEIRAS E PASSEIOS de Itacaré.
Use os lugares e detalhes do contexto para sugerir opções adequadas ao pedido. Considere deslocamento, perfil do passeio e cuidados práticos quando houver dados. Não invente distâncias, condições de acesso, taxas ou funcionamento.`,
  },
  eventos: {
    modelEnv: 'GEMINI_MODEL_EVENTOS',
    maxTokens: 700,
    instruction: `Você é o especialista em EVENTOS E PROGRAMAÇÃO de Itacaré.
Use datas, horários e locais presentes no contexto. Diferencie evento confirmado de informação incompleta ou antiga. Não invente agenda, atrações, ingressos ou horários. Quando não houver evento cadastrado, informe isso com clareza.`,
  },
  servicos: {
    modelEnv: 'GEMINI_MODEL_SERVICOS',
    maxTokens: 700,
    instruction: `Você é o especialista em SERVIÇOS LOCAIS de Itacaré, incluindo transportes, aluguéis, aulas, guias e prestadores.
Baseie recomendações nos registros fornecidos. Não invente telefone, preço, disponibilidade, contato ou serviço oferecido.`,
  },
  app: {
    modelEnv: 'GEMINI_MODEL_APP',
    maxTokens: 700,
    instruction: `Você é o assistente de suporte do aplicativo +iTACARÉ.
Explique funcionalidades e navegação do aplicativo apenas com base no contexto disponível. Se não souber se uma função existe ou onde está, não invente; peça ao usuário que descreva a tela ou informe que precisa confirmar.`,
  },
  geral: {
    modelEnv: 'GEMINI_MODEL_GERAL',
    maxTokens: 700,
    instruction: `Você é o Guia IA do +iTACARÉ, assistente local de Itacaré-BA.
Responda em português brasileiro, de forma natural, útil e direta. Use o contexto fornecido, não invente informações locais e diga quando não houver dados suficientes.`,
  },
} as const;

type AgentName = keyof typeof AGENT_PROFILES;
type ChatRole = 'system' | 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ProviderResult = {
  ok: boolean;
  content?: string;
  provider?: string;
  model?: string;
  usage?: unknown;
  motivo?: string;
  status?: number;
  erro?: string;
  retryAfterMs?: number;
};

const cooldowns = new Map<string, number>();

const groqBudget: {
  remainingTokens: number | null;
  resetAt: number;
} = {
  remainingTokens: null,
  resetAt: 0,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampTokens(value: unknown, fallback = DEFAULT_MAX_TOKENS): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(128, Math.min(Math.floor(parsed), MAX_ALLOWED_TOKENS));
}

function obterPerfilAgente(value: unknown): {
  agent: AgentName;
  model: string;
  maxTokens: number;
  instruction: string;
} {
  const candidate = cleanText(value).toLowerCase();
  const aliases: Record<string, AgentName> = {
    restaurante: 'gastronomia',
    restaurantes: 'gastronomia',
    praia: 'turismo',
    praias: 'turismo',
    aluguel: 'servicos',
    carona: 'servicos',
    servico: 'servicos',
    outro: 'geral',
  };

  const agent = (
    Object.prototype.hasOwnProperty.call(AGENT_PROFILES, candidate)
      ? candidate
      : aliases[candidate] || 'geral'
  ) as AgentName;

  const profile = AGENT_PROFILES[agent];
  const configuredModel = Deno.env.get(profile.modelEnv);

  return {
    agent,
    model: cleanText(configuredModel) || GEMINI_PRIMARY_MODEL,
    maxTokens: profile.maxTokens,
    instruction: profile.instruction,
  };
}

function estimateTokens(messages: ChatMessage[]): number {
  const characters = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  return Math.ceil(characters / 3.5);
}

function parseDurationMs(value: string | null): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const match = trimmed.match(/^([\d.]+)\s*(ms|s|m)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  return amount * (
    unit === 'm' ? 60000 :
    unit === 's' ? 1000 : 1
  );
}

function getRetryAfterMs(headers: Headers): number {
  return parseDurationMs(headers.get('retry-after')) ?? 15000;
}

function applyCooldown(name: string, durationMs: number) {
  cooldowns.set(name, Date.now() + Math.max(1000, durationMs));
}

function cooldownRemaining(name: string): number {
  const until = cooldowns.get(name) ?? 0;
  const remaining = until - Date.now();

  if (remaining <= 0) {
    cooldowns.delete(name);
    return 0;
  }

  return remaining;
}

function parseErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error?.message ?? parsed?.message ?? raw).slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

// ============================================================
// PREPARAÇÃO DO HISTÓRICO PARA GEMINI
// ============================================================

function prepararConteudoGemini(messages: ChatMessage[]) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter(Boolean)
    .join('\n\n');

  const turns: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }> = [];

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;

    const content = cleanText(message.content);
    if (!content) continue;

    const role = message.role === 'assistant' ? 'model' : 'user';
    const previous = turns[turns.length - 1];

    if (previous?.role === role) {
      previous.parts[0].text += `\n\n${content}`;
    } else {
      turns.push({
        role,
        parts: [{ text: content }],
      });
    }
  }

  // Remove uma eventual saudação fixa do assistente antes da primeira pergunta.
  while (turns.length && turns[0].role !== 'user') {
    turns.shift();
  }

  return { system, contents: turns };
}

// ============================================================
// GEMINI
// ============================================================

async function chamarGemini(
  messages: ChatMessage[],
  maxTokens: number,
  model: string,
  providerName: string,
): Promise<ProviderResult> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) {
    return { ok: false, motivo: 'GEMINI_API_KEY ausente' };
  }

  const { system, contents } = prepararConteudoGemini(messages);
  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    return {
      ok: false,
      motivo: 'historico_gemini_invalido_ou_sem_pergunta_atual',
    };
  }

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.min(maxTokens, 900),
  };

  // Mantém o raciocínio econômico usado na configuração atual do projeto.
  if (model.startsWith('gemini-3.')) {
    generationConfig.thinkingConfig = {
      thinkingLevel: model === 'gemini-3.8-flash' ? 'low' : 'minimal',
    };
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig,
  };

  if (system) {
    body.systemInstruction = {
      parts: [{ text: system }],
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      const raw = await response.text();
      const retryAfterMs = response.status === 429
        ? getRetryAfterMs(response.headers)
        : undefined;

      if (retryAfterMs) applyCooldown(providerName, retryAfterMs);

      return {
        ok: false,
        status: response.status,
        erro: parseErrorBody(raw),
        retryAfterMs,
      };
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const parts = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : [];

    const content = parts
      .filter((part: any) => part?.thought !== true)
      .map((part: any) => cleanText(part?.text))
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!content) {
      return {
        ok: false,
        motivo: `sem_conteudo (finishReason=${candidate?.finishReason ?? 'N/I'})`,
        erro: JSON.stringify({
          usageMetadata: data?.usageMetadata ?? null,
          promptFeedback: data?.promptFeedback ?? null,
        }).slice(0, 500),
      };
    }

    return {
      ok: true,
      content,
      provider: providerName,
      model,
      usage: data?.usageMetadata ?? null,
    };
  } catch (error) {
    const err = error as Error;
    return {
      ok: false,
      motivo:
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'timeout'
          : (err.message || 'erro_de_rede'),
    };
  }
}

// ============================================================
// GROQ
// ============================================================

async function chamarGroq(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<ProviderResult> {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return { ok: false, motivo: 'GROQ_API_KEY ausente' };

  const cooldown = cooldownRemaining('groq');
  if (cooldown > 0) {
    return {
      ok: false,
      motivo: 'cooldown_ativo',
      retryAfterMs: cooldown,
    };
  }

  const estimated = estimateTokens(messages) + maxTokens;
  if (
    groqBudget.resetAt > Date.now() &&
    groqBudget.remainingTokens !== null &&
    groqBudget.remainingTokens < estimated
  ) {
    return {
      ok: false,
      motivo: 'orcamento_tpm_insuficiente_na_instancia',
      retryAfterMs: groqBudget.resetAt - Date.now(),
    };
  }

  try {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: 0.6,
          reasoning_effort: 'low',
          max_completion_tokens: Math.min(maxTokens, 700),
          stream: false,
        }),
        signal: AbortSignal.timeout(7000),
      },
    );

    const remainingHeader = response.headers.get('x-ratelimit-remaining-tokens');
    const remaining = remainingHeader === null ? NaN : Number(remainingHeader);
    const resetMs = parseDurationMs(
      response.headers.get('x-ratelimit-reset-tokens'),
    ) ?? 60000;

    if (Number.isFinite(remaining)) {
      groqBudget.remainingTokens = remaining;
      groqBudget.resetAt = Date.now() + resetMs;
    }

    if (!response.ok) {
      const raw = await response.text();
      const retryAfterMs = response.status === 429
        ? getRetryAfterMs(response.headers)
        : undefined;

      if (retryAfterMs) applyCooldown('groq', retryAfterMs);

      return {
        ok: false,
        status: response.status,
        erro: parseErrorBody(raw),
        retryAfterMs,
      };
    }

    const data = await response.json();
    const messageContent = data?.choices?.[0]?.message?.content;
    const content = typeof messageContent === 'string'
      ? messageContent.trim()
      : Array.isArray(messageContent)
        ? messageContent
            .map((part: any) => cleanText(part?.text))
            .filter(Boolean)
            .join('\n')
            .trim()
        : '';

    if (!content) {
      return {
        ok: false,
        motivo: `sem_conteudo (finish_reason=${data?.choices?.[0]?.finish_reason ?? 'N/I'})`,
      };
    }

    return {
      ok: true,
      content,
      provider: 'groq',
      model: GROQ_MODEL,
      usage: data?.usage ?? null,
    };
  } catch (error) {
    const err = error as Error;
    return {
      ok: false,
      motivo:
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'timeout'
          : (err.message || 'erro_de_rede'),
    };
  }
}

// ============================================================
// NVIDIA
// ============================================================

async function chamarNvidia(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<ProviderResult> {
  const key = Deno.env.get('NVIDIA_API_KEY');
  if (!key) return { ok: false, motivo: 'NVIDIA_API_KEY ausente' };

  const cooldown = cooldownRemaining('nvidia');
  if (cooldown > 0) {
    return {
      ok: false,
      motivo: 'cooldown_ativo',
      retryAfterMs: cooldown,
    };
  }

  try {
    const response = await fetch(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages,
          max_tokens: Math.min(Math.max(maxTokens, 800), 1200),
          stream: false,
          reasoning_budget: 0,
          chat_template_kwargs: {
            enable_thinking: false,
            reasoning_budget: 0,
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      const raw = await response.text();
      const retryAfterMs = response.status === 429
        ? getRetryAfterMs(response.headers)
        : undefined;

      if (retryAfterMs) applyCooldown('nvidia', retryAfterMs);

      return {
        ok: false,
        status: response.status,
        erro: parseErrorBody(raw),
        retryAfterMs,
      };
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';

    if (!content) {
      return {
        ok: false,
        motivo: `sem_conteudo (finish_reason=${data?.choices?.[0]?.finish_reason ?? 'N/I'})`,
      };
    }

    return {
      ok: true,
      content,
      provider: 'nvidia',
      model: NVIDIA_MODEL,
      usage: data?.usage ?? null,
    };
  } catch (error) {
    const err = error as Error;
    return {
      ok: false,
      motivo:
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'timeout'
          : (err.message || 'erro_de_rede'),
    };
  }
}

// ============================================================
// EDGE FUNCTION
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  try {
    const payload = await req.json();
    const incomingMessages = payload?.messages;

    if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
      return jsonResponse(
        { error: 'messages é obrigatório e deve ser um array' },
        400,
      );
    }

    // Preserva as instruções system, mesmo quando o histórico da conversa cresce.
    const normalizedMessages: ChatMessage[] = incomingMessages
      .filter((message: any) =>
        message &&
        ['system', 'user', 'assistant'].includes(String(message.role)) &&
        typeof message.content === 'string'
      )
      .map((message: any) => ({
        role: message.role as ChatRole,
        content: message.content.slice(0, 20000),
      }));

    const systemMessages = normalizedMessages
      .filter((message) => message.role === 'system')
      .slice(0, 3);

    const conversation = normalizedMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-10);

    if (!conversation.length || conversation[conversation.length - 1].role !== 'user') {
      return jsonResponse(
        { error: 'A mensagem atual do usuário está vazia ou não é a última mensagem' },
        400,
      );
    }

    if (!conversation.some((message) => message.role === 'user' && message.content.trim())) {
      return jsonResponse({ error: 'A mensagem atual do usuário está vazia' }, 400);
    }

    const perfil = obterPerfilAgente(payload?.agent);
    const systemContent = [
      ...systemMessages.map((message) => message.content),
      perfil.instruction,
    ].filter(Boolean).join('\n\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent.slice(0, 30000) },
      ...conversation,
    ];

    const maxTokens = clampTokens(payload?.max_tokens, perfil.maxTokens);
    const erros: Array<Record<string, unknown>> = [];

    const providers: Array<{
      name: string;
      run: () => Promise<ProviderResult>;
    }> = [
      {
        name: 'gemini',
        run: () => chamarGemini(
          messages,
          maxTokens,
          perfil.model,
          'gemini',
        ),
      },
    ];

    if (GEMINI_FALLBACK_MODEL !== perfil.model) {
      providers.push({
        name: 'gemini-backup',
        run: () => chamarGemini(
          messages,
          maxTokens,
          GEMINI_FALLBACK_MODEL,
          'gemini-backup',
        ),
      });
    }

    providers.push(
      {
        name: 'groq',
        run: () => chamarGroq(messages, maxTokens),
      },
      {
        name: 'nvidia',
        run: () => chamarNvidia(messages, maxTokens),
      },
    );

    console.log(
      `[llm-chat] agente=${perfil.agent} modeloGemini=${perfil.model}`,
    );

    // Fallback sequencial: uma tentativa por provedor.
    for (const provider of providers) {
      const wait = cooldownRemaining(provider.name);
      if (wait > 0) {
        erros.push({
          provedor: provider.name,
          motivo: 'cooldown_ativo',
          retryAfterMs: wait,
        });
        continue;
      }

      console.log(`[llm-chat] Tentando ${provider.name} para ${perfil.agent}...`);
      const result = await provider.run();

      if (result.ok && result.content?.trim()) {
        console.log(
          `[llm-chat] Sucesso: ${result.provider}/${result.model} | ` +
          `uso=${JSON.stringify(result.usage ?? null).slice(0, 500)}`,
        );

        return jsonResponse({
          content: result.content.trim(),
          provider: result.provider,
          model: result.model,
          agent: perfil.agent,
          usage: result.usage ?? null,
        });
      }

      console.error(
        `[llm-chat] ${provider.name} falhou:`,
        JSON.stringify(result),
      );

      erros.push({
        provedor: provider.name,
        ...result,
      });

      if (result.status === 429 && result.retryAfterMs) {
        applyCooldown(provider.name, result.retryAfterMs);
      }
    }

    return jsonResponse(
      {
        error: 'Todos os provedores falharam. Nenhuma resposta válida foi gerada.',
        agent: perfil.agent,
        detalhes: erros,
      },
      503,
    );
  } catch (error) {
    const err = error as Error;
    console.error('[llm-chat] Erro fatal:', err);

    return jsonResponse(
      { error: `Erro interno: ${err.message || 'desconhecido'}` },
      500,
    );
  }
});
