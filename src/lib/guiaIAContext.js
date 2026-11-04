// src/lib/guiaIAContext.js

// Contexto seletivo do Guia IA.
// Em vez de carregar 99 comércios, 73 lugares e todas as tabelas em cada pergunta,
// este módulo consulta somente os grupos que combinam com a intenção do usuário.
import { supabase } from './supabaseConfig';

const MAX_TOTAL_CONTEXT_CHARS = 6500;
const MAX_RECORDS = 6;
const MAX_DESCRIPTION_CHARS = 260;

const STOP_WORDS = new Set([
  'a', 'o', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sobre', 'entre',
  'que', 'qual', 'quais', 'quem', 'como', 'quando', 'onde', 'porque', 'porquê',
  'me', 'mim', 'eu', 'voce', 'voces', 'meu', 'minha', 'seu', 'sua', 'tem', 'tenho',
  'ser', 'estar', 'fica', 'ficam', 'perto', 'mais', 'menos', 'melhor', 'melhores',
  'bom', 'boa', 'bons', 'boas', 'hoje', 'amanha', 'ontem', 'aqui', 'ali', 'la',
  'itacare', 'bahia', 'quero', 'queria', 'gostaria', 'pode', 'podem', 'indica',
  'indicar', 'recomenda', 'recomendar', 'mostra', 'mostrar', 'tem', 'existe',
]);

const CATEGORY_WORDS = new Set([
  'restaurante', 'restaurantes', 'gastronomia', 'comida', 'comer', 'jantar', 'almoco',
  'cafe', 'cafeteria', 'bar', 'bares', 'pizza', 'pizzaria', 'hamburguer', 'lanchonete',
  'hotel', 'hoteis', 'pousada', 'pousadas', 'hostel', 'hospedagem', 'hospedagens',
  'praia', 'praias', 'cachoeira', 'cachoeiras', 'trilha', 'trilhas', 'mirante', 'rios',
  'evento', 'eventos', 'festa', 'show', 'agenda', 'aluguel', 'alugar', 'temporada',
  'casa', 'apartamento', 'imovel', 'promocao', 'promocoes', 'cupom', 'desconto',
  'servico', 'servicos', 'passeio', 'passeios', 'aula', 'aulas', 'guia', 'guias',
  'surf', 'onda', 'ondas', 'mar', 'tempo', 'clima', 'previsao', 'carona', 'caronas',
  'motoboy', 'entrega', 'delivery', 'clube', 'clubes', 'liga', 'campeonato',
]);

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function textoSeguro(valor, limite = MAX_DESCRIPTION_CHARS) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, ' ').trim().slice(0, limite);
}

function obterDataLocal() {
  const agora = new Date();
  const data = agora.toLocaleDateString('pt-BR', {
    timeZone: 'America/Bahia',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const hora = agora.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Bahia',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Hoje é ${data}, às ${hora} (horário de Itacaré-BA).`;
}

function obterDataISOlocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function extrairTermos(pergunta) {
  return [...new Set(
    normalizar(pergunta)
      .match(/[a-z0-9-]{3,}/g) || [],
  )].filter((termo) => !STOP_WORDS.has(termo));
}

function classificarPergunta(pergunta) {
  const q = normalizar(pergunta);
  const categorias = new Set();

  const pedeComercio = /restaur|gastronom|comer|jantar|almoco|cafe|cafeteria|bar\b|pizza|pizzaria|hamburg|lanchonete|hotel|pousada|hostel|hosped|farmacia|mercado|loja|servico|passeio|aula|guia turist|massag|transfer|taxi|transporte/.test(q);
  const pedeLugar = /praia|cachoeira|trilha|mirante|rio\b|ilha|peninsula|pontal|itacarezinho|resende|tiririca|concha|jeribucacu|engenhoca|havai|turismo|visitar|conhecer|o que fazer/.test(q);
  const pedeEvento = /evento|agenda|show|festa|festival|programacao|programação|acontece|ingresso|ingressos/.test(q);
  const pedeAluguel = /aluguel|alugar|temporada|imovel|imovel|casa para|apartamento|diaria|diarias|quarto para|hospedagem por/.test(q);
  const pedePromocao = /promoc|cupom|desconto|oferta/.test(q);
  const pedeCarona = /carona|caronas|viagem compartilhada/.test(q);
  const pedeDelivery = /delivery|entrega|motoboy/.test(q);
  const pedeClube = /clube|assinatura|assinante|beneficio|beneficios|ita?coins/.test(q);
  const pedeLiga = /liga|campeonato|torneio|competicao|competição/.test(q);
  const pedeCampanha = /campanha|publicidade|anuncio|anúncio/.test(q);
  const pedeClima = /clima|tempo|temperatura|previsao do tempo|chuva|chover|vento/.test(q);
  const pedeSurf = /surf|surfe|onda|ondas|ondulacao|mare|condicoes do mar|\bmar\b/.test(q);

  if (pedeComercio) categorias.add('merchants');
  if (pedeLugar) categorias.add('places');
  if (pedeEvento) categorias.add('events');
  if (pedeAluguel) categorias.add('rentals');
  if (pedePromocao) categorias.add('promotions');
  if (pedeCarona) categorias.add('rides');
  if (pedeDelivery) categorias.add('deliveries');
  if (pedeClube) categorias.add('clubs');
  if (pedeLiga) categorias.add('leagues');
  if (pedeCampanha) categorias.add('campaigns');
  if (pedeClima) categorias.add('weather');
  if (pedeSurf) categorias.add('surf');

  // Perguntas sobre um nome próprio (ex.: Ecoporan) também procuram comércios.
  const termos = extrairTermos(pergunta);
  const temNomeProvavel = termos.some((termo) => !CATEGORY_WORDS.has(termo));
  if (temNomeProvavel && categorias.size === 0) {
    categorias.add('merchants');
    categorias.add('places');
  }

  // Perguntas abertas sobre Itacaré normalmente pedem opções de turismo e comércio.
  if (categorias.size === 0) {
    categorias.add('merchants');
    categorias.add('places');
  }

  return { categorias: [...categorias], termos };
}

async function executarConsulta(nome, consulta) {
  try {
    const { data, error } = await consulta;
    if (error) {
      console.warn(`[GuiaIA] Consulta ${nome} falhou:`, error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`[GuiaIA] Exceção na consulta ${nome}:`, error?.message || error);
    return [];
  }
}

function combinarSemDuplicar(grupos, limite = MAX_RECORDS) {
  const mapa = new Map();
  for (const grupo of grupos) {
    for (const item of grupo || []) {
      const chave = String(item?.id ?? item?.name ?? item?.title ?? JSON.stringify(item));
      if (!mapa.has(chave)) mapa.set(chave, item);
      if (mapa.size >= limite) return [...mapa.values()];
    }
  }
  return [...mapa.values()];
}

async function buscarMerchants(termos, pergunta) {
  const colunas = 'name, category, description, address, latitude, longitude, rating, phone, is_partner, reservation_url, menu_url, shop_url, service_url';
  const termosNome = termos.filter((termo) => !CATEGORY_WORDS.has(termo)).slice(0, 2);
  const consultas = termosNome.map((termo) =>
    executarConsulta(`merchants:${termo}`,
      supabase.from('merchants').select(colunas).ilike('name', `%${termo}%`).limit(4)),
  );

  const q = normalizar(pergunta);
  const categorias = [];
  if (/restaur|gastronom|jantar|almoco|comer|pizza|hamburg|lanchonete/.test(q)) {
    categorias.push('Restaurante', 'Gastronomia', 'Alimentação', 'Bar', 'Pizzaria');
  }
  if (/hotel/.test(q)) categorias.push('Hotel');
  if (/pousada|hosped/.test(q)) categorias.push('Pousada', 'Hospedagem', 'Hostel');
  if (/servico|serviço|passeio|guia|aula|turismo|aventura|massag|transfer/.test(q)) {
    categorias.push('Serviço', 'Turismo', 'Passeio', 'Aventura');
  }
  if (/farmacia/.test(q)) categorias.push('Farmácia');
  if (/mercado/.test(q)) categorias.push('Mercado');

  if (categorias.length) {
    const filtro = categorias.map((categoria) => `category.ilike.%${categoria}%`).join(',');
    consultas.push(executarConsulta('merchants:categoria',
      supabase.from('merchants').select(colunas).or(filtro)
        .order('is_partner', { ascending: false })
        .order('rating', { ascending: false }).limit(MAX_RECORDS)));
  }

  let encontrados = combinarSemDuplicar(await Promise.all(consultas), MAX_RECORDS);

  if (!encontrados.length) {
    encontrados = await executarConsulta('merchants:destaques',
      supabase.from('merchants').select(colunas)
        .order('is_partner', { ascending: false })
        .order('rating', { ascending: false }).limit(5));
  }

  return encontrados;
}

async function buscarPlaces(termos, pergunta) {
  const colunas = 'name, category, address, is_partner, has_delivery, phone, menu_url, image_url';
  const termosNome = termos.filter((termo) => !CATEGORY_WORDS.has(termo)).slice(0, 2);
  const consultas = termosNome.map((termo) =>
    executarConsulta(`places:${termo}`,
      supabase.from('places').select(colunas).ilike('name', `%${termo}%`).limit(4)),
  );

  const q = normalizar(pergunta);
  const categorias = [];
  if (/praia|mar|surfe|surf|onda/.test(q)) categorias.push('Praia', 'Praias', 'Surf');
  if (/cachoeira/.test(q)) categorias.push('Cachoeira');
  if (/trilha/.test(q)) categorias.push('Trilha');
  if (/mirante/.test(q)) categorias.push('Mirante');
  if (/rio|ilha|pontal/.test(q)) categorias.push('Rio', 'Ilha', 'Pontal');

  if (categorias.length) {
    const filtro = categorias.map((categoria) => `category.ilike.%${categoria}%`).join(',');
    consultas.push(executarConsulta('places:categoria',
      supabase.from('places').select(colunas).or(filtro).limit(MAX_RECORDS)));
  }

  let encontrados = combinarSemDuplicar(await Promise.all(consultas), MAX_RECORDS);
  if (!encontrados.length) {
    encontrados = await executarConsulta('places:destaques',
      supabase.from('places').select(colunas).order('name').limit(5));
  }
  return encontrados;
}

function formatarMerchant(item) {
  const partes = [`- ${textoSeguro(item.name, 100)}`];
  if (item.category) partes.push(`Categoria: ${textoSeguro(item.category, 80)}`);
  if (item.description) partes.push(textoSeguro(item.description, MAX_DESCRIPTION_CHARS));
  if (item.address) partes.push(`Endereço: ${textoSeguro(item.address, 180)}`);
  if (item.phone) partes.push(`Telefone: ${textoSeguro(item.phone, 50)}`);
  if (item.rating) partes.push(`Avaliação cadastrada: ${item.rating}`);
  if (item.is_partner) partes.push('Parceiro VIP do app');
  if (item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))) {
    partes.push(`GPS: ${item.latitude}, ${item.longitude}`);
  }
  if (item.service_url) partes.push(`Serviço: ${textoSeguro(item.service_url, 240)}`);
  if (item.reservation_url) partes.push(`Reserva: ${textoSeguro(item.reservation_url, 240)}`);
  if (item.menu_url) partes.push(`Cardápio: ${textoSeguro(item.menu_url, 240)}`);
  if (item.shop_url) partes.push(`Loja: ${textoSeguro(item.shop_url, 240)}`);
  return partes.join(' | ');
}

function formatarPlace(item) {
  const partes = [`- ${textoSeguro(item.name, 120)}`];
  if (item.category) partes.push(`Categoria: ${textoSeguro(item.category, 80)}`);
  if (item.address) partes.push(`Endereço: ${textoSeguro(item.address, 180)}`);
  if (item.phone) partes.push(`Telefone: ${textoSeguro(item.phone, 50)}`);
  if (item.is_partner) partes.push('Parceiro VIP do app');
  if (item.has_delivery) partes.push('Delivery');
  if (item.menu_url) partes.push('Possui cardápio cadastrado no app');
  return partes.join(' | ');
}

function formatarRegistroGenerico(item, campos) {
  return campos
    .map(([chave, rotulo]) => {
      const valor = item?.[chave];
      if (valor === null || valor === undefined || valor === '') return '';
      if (Array.isArray(valor)) return valor.length ? `${rotulo}: ${valor.join(', ')}` : '';
      return `${rotulo}: ${textoSeguro(valor, 240)}`;
    })
    .filter(Boolean)
    .join(' | ');
}

function limitarContexto(blocos) {
  let resultado = '';
  for (const bloco of blocos.filter(Boolean)) {
    const disponivel = MAX_TOTAL_CONTEXT_CHARS - resultado.length;
    if (disponivel <= 0) break;
    if (bloco.length <= disponivel) {
      resultado += `${bloco}\n\n`;
      continue;
    }

    // Preserva linhas completas, sem cortar o nome de um estabelecimento no meio.
    const linhas = bloco.split('\n');
    let parcial = '';
    for (const linha of linhas) {
      if (parcial.length + linha.length + 1 > disponivel) break;
      parcial += `${linha}\n`;
    }
    if (parcial.trim()) resultado += `${parcial}\n`;
    break;
  }
  return resultado.trim();
}

/** Contexto pequeno e estável, usado também pela sessão de voz. */
export async function montarContextoDaCidade() {
  const partes = [`# DATA E HORA\n${obterDataLocal()}\nUse esta data para interpretar eventos e informações temporais.`];

  const knowledge = await executarConsulta('ai_knowledge:base',
    supabase.from('ai_knowledge').select('topic, title, content, priority')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(4));

  if (knowledge.length) {
    const linhas = knowledge.map((item) =>
      `- ${textoSeguro(item.topic, 80)} / ${textoSeguro(item.title, 120)}: ${textoSeguro(item.content, 420)}`,
    );
    partes.push(`# CONHECIMENTO GERAL DE ITACARÉ E DO APP\n${linhas.join('\n')}`);
  }

  return limitarContexto(partes);
}

/** Busca somente os dados relacionados à pergunta atual. */
export async function montarContextoDaPergunta(pergunta) {
  const { categorias, termos } = classificarPergunta(pergunta);
  const blocos = [
    `# CONTEXTO RECUPERADO PARA ESTA PERGUNTA\n${obterDataLocal()}`,
    'Use os registros abaixo como fonte factual. Não invente nomes, preços, telefones, endereços, horários ou disponibilidade. Se não houver um registro, informe que não encontrou essa informação no cadastro do app.',
  ];

  const consultas = [];
  if (categorias.includes('merchants')) {
    consultas.push(buscarMerchants(termos, pergunta).then((items) => ({ tipo: 'merchants', items })));
  }
  if (categorias.includes('places')) {
    consultas.push(buscarPlaces(termos, pergunta).then((items) => ({ tipo: 'places', items })));
  }
  if (categorias.includes('events')) {
    consultas.push(executarConsulta('events',
      supabase.from('events')
        .select('title, description, date, end_date, time, location, category, price, is_free, ticket_url, is_featured')
        .gte('date', obterDataISOlocal())
        .order('date', { ascending: true }).limit(8))
      .then((items) => ({ tipo: 'events', items })));
  }
  if (categorias.includes('rentals')) {
    consultas.push(executarConsulta('rentals',
      supabase.from('rentals')
        .select('title, description, property_type, bedrooms, bathrooms, beds, max_guests, price_per_night, address, amenities, host_name, checkin, checkout, rules, status')
        .limit(7))
      .then((items) => ({ tipo: 'rentals', items })));
  }
  if (categorias.includes('promotions')) {
    consultas.push(executarConsulta('promotions',
      supabase.from('promotions')
        .select('title, description, start_time, end_time, is_active, is_flash, is_top_ad, coupon_code')
        .eq('is_active', true).limit(7))
      .then((items) => ({ tipo: 'promotions', items })));
  }
  if (categorias.includes('rides')) {
    consultas.push(executarConsulta('rides',
      supabase.from('rides')
        .select('driver_name, origin, destination, date, time, seats_available, price_per_seat, status')
        .eq('status', 'active').limit(7))
      .then((items) => ({ tipo: 'rides', items })));
  }
  if (categorias.includes('clubs')) {
    consultas.push(executarConsulta('clubs',
      supabase.from('clubs').select('name, description, category, monthly_fee, uses_per_month, benefits, is_active, is_paid, price, member_limit')
        .eq('is_active', true).limit(7))
      .then((items) => ({ tipo: 'clubs', items })));
  }
  if (categorias.includes('leagues')) {
    consultas.push(executarConsulta('leagues',
      supabase.from('leagues').select('title, details, prize, status, description').limit(7))
      .then((items) => ({ tipo: 'leagues', items })));
  }
  if (categorias.includes('campaigns')) {
    consultas.push(executarConsulta('campaigns',
      supabase.from('campaigns').select('title, description, status').limit(5))
      .then((items) => ({ tipo: 'campaigns', items })));
  }

  // A base de conhecimento também é pesquisada pela pergunta, sem carregar
  // todo o conteúdo de ai_knowledge em todas as conversas.
  const termosConhecimento = termos.filter((termo) => !CATEGORY_WORDS.has(termo)).slice(0, 2);
  if (termosConhecimento.length) {
    const filtroConhecimento = termosConhecimento
      .flatMap((termo) => [
        `topic.ilike.%${termo}%`,
        `title.ilike.%${termo}%`,
        `content.ilike.%${termo}%`,
      ])
      .join(',');
    consultas.push(executarConsulta('ai_knowledge:busca',
      supabase.from('ai_knowledge').select('topic, title, content, priority')
        .eq('is_active', true).or(filtroConhecimento)
        .order('priority', { ascending: false }).limit(5))
      .then((items) => ({ tipo: 'knowledge', items })));
  }

  if (categorias.includes('deliveries')) {
    consultas.push(Promise.resolve({
      tipo: 'deliveries',
      items: [{ description: 'O app +iTACARE oferece serviço de entregas rápidas do tipo motoboy. Consulte a disponibilidade e os valores diretamente no app.' }],
    }));
  }

  const resultados = await Promise.all(consultas);

  for (const resultado of resultados) {
    const { tipo, items } = resultado;
    if (!items?.length) continue;

    if (tipo === 'merchants') {
      blocos.push(`# COMÉRCIOS E SERVIÇOS\n${items.map(formatarMerchant).join('\n')}`);
    } else if (tipo === 'places') {
      blocos.push(`# PRAIAS, PONTOS TURÍSTICOS E LOCAIS\n${items.map(formatarPlace).join('\n')}`);
    } else if (tipo === 'events') {
      blocos.push(`# PRÓXIMOS EVENTOS\n${items.map((item) => formatarRegistroGenerico(item, [
        ['title', 'Evento'], ['date', 'Data'], ['time', 'Horário'], ['end_date', 'Até'],
        ['location', 'Local'], ['category', 'Categoria'], ['price', 'Preço'],
        ['description', 'Descrição'], ['ticket_url', 'Ingressos'],
      ]) + (item.is_free ? ' | Gratuito' : '') + (item.is_featured ? ' | Destaque' : '')).join('\n')}`);
    } else if (tipo === 'rentals') {
      blocos.push(`# IMÓVEIS PARA ALUGUEL\n${items.map((item) => formatarRegistroGenerico(item, [
        ['title', 'Imóvel'], ['property_type', 'Tipo'], ['bedrooms', 'Quartos'],
        ['beds', 'Camas'], ['bathrooms', 'Banheiros'], ['max_guests', 'Capacidade'],
        ['price_per_night', 'Preço por noite'], ['address', 'Endereço'],
        ['amenities', 'Comodidades'], ['checkin', 'Check-in'], ['checkout', 'Check-out'],
        ['status', 'Status'],
      ])).join('\n')}`);
    } else if (tipo === 'promotions') {
      blocos.push(`# PROMOÇÕES ATIVAS\n${items.map((item) => formatarRegistroGenerico(item, [
        ['title', 'Promoção'], ['description', 'Descrição'], ['coupon_code', 'Cupom'],
        ['start_time', 'Início'], ['end_time', 'Fim'],
      ])).join('\n')}`);
    } else if (tipo === 'rides') {
      blocos.push(`# CARONAS ATIVAS\n${items.map((item) => formatarRegistroGenerico(item, [
        ['origin', 'Origem'], ['destination', 'Destino'], ['date', 'Data'],
        ['time', 'Horário'], ['driver_name', 'Motorista'], ['price_per_seat', 'Preço por assento'],
        ['seats_available', 'Vagas'],
      ])).join('\n')}`);
    } else if (tipo === 'clubs') {
      blocos.push(`# CLUBES ATIVOS\n${items.map((item) => formatarRegistroGenerico(item, [
        ['name', 'Clube'], ['category', 'Categoria'], ['description', 'Descrição'],
        ['price', 'Preço'], ['monthly_fee', 'Mensalidade'], ['uses_per_month', 'Usos por mês'],
        ['benefits', 'Benefícios'], ['member_limit', 'Limite de membros'],
      ])).join('\n')}`);
    } else if (tipo === 'leagues') {
      blocos.push(`# LIGAS E CAMPEONATOS\n${items.map((item) => formatarRegistroGenerico(item, [
        ['title', 'Liga'], ['status', 'Status'], ['prize', 'Prêmio'], ['details', 'Detalhes'],
        ['description', 'Descrição'],
      ])).join('\n')}`);
    } else if (tipo === 'campaigns') {
      blocos.push(`# CAMPANHAS\n${items.map((item) => formatarRegistroGenerico(item, [
        ['title', 'Campanha'], ['status', 'Status'], ['description', 'Descrição'],
      ])).join('\n')}`);
    } else if (tipo === 'knowledge') {
      blocos.push(`# CONHECIMENTO ESPECÍFICO DO APP\n${items.map((item) =>
        `- ${textoSeguro(item.topic, 80)} / ${textoSeguro(item.title, 120)}: ${textoSeguro(item.content, 600)}`,
      ).join('\n')}`);
    } else if (tipo === 'deliveries') {
      blocos.push(`# ENTREGAS\n${items.map((item) => textoSeguro(item.description, 300)).join('\n')}`);
    }
  }

  const texto = limitarContexto(blocos);
  console.log(
    `[GuiaIA] Contexto seletivo: ${texto.length} chars | ` +
    `categorias=${categorias.join(',')} | termos=${termos.slice(0, 5).join(',')}`,
  );
  return texto;
}

// Contexto amplo exclusivo da sessão de voz em tempo real.
// O chat textual NÃO envia este bloco; usa montarContextoDaPergunta().
const MAX_VOICE_CHARS_PER_TABLE = 8000;

function trimVoice(texto) {
  if (!texto) return '';
  if (texto.length <= MAX_VOICE_CHARS_PER_TABLE) return texto;
  return texto.slice(0, MAX_VOICE_CHARS_PER_TABLE) + '\n[... texto truncado ...]';
}

function formatarDataVoz(data) {
  if (!data) return 'N/I';
  if (typeof data === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(data)) return data;
  try {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return String(data); }
}

function formatarDataHoraVoz(data) {
  if (!data) return 'N/I';
  try {
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(data); }
}

function sanitizarParaJSONVoz(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[^\x09\x0A\x20-\x7E]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Detecta se um merchant e um servico (por URL ou categoria)
function ehServicoVoz(m) {
  if (m.service_url) return true;
  const c = String(m.category || '').toLowerCase();
  return /servi|prestad|passei|turismo|aventur|aula|consult|repar|manut/.test(c);
}

export async function montarContextoDaVoz() {
  const agora = new Date();
  const dataAtual = agora.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const horaAtual = agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });

  let texto = `# DATA E HORA ATUAIS\nHoje e ${dataAtual}, as ${horaAtual} (horario de Brasilia).\nUse SEMPRE esta data como referencia para julgar se um evento e passado, presente ou futuro.\n`;

  // ============================================================
  // CONSULTAS EM PARALELO
  // ============================================================
  const consultas = [
    supabase
      .from('merchants')
      .select('name, category, description, address, latitude, longitude, rating, phone, is_partner, reservation_url, menu_url, shop_url, service_url')
      .order('category')
      .order('name'),

    supabase
      .from('places')
      .select('name, category, address, is_partner, has_delivery, phone, menu_url, image_url')
      .order('name'),

    supabase
      .from('events')
      .select('title, description, date, end_date, time, location, category, price, is_free, ticket_url, is_featured')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .limit(60),

    supabase
      .from('rentals')
      .select('title, description, property_type, bedrooms, bathrooms, beds, max_guests, price_per_night, address, amenities, host_name, checkin, checkout, rules, status')
      .limit(60),

    supabase
      .from('promotions')
      .select('title, description, start_time, end_time, is_active, is_flash, is_top_ad, coupon_code')
      .eq('is_active', true)
      .limit(60),

    supabase
      .from('deliveries')
      .select('description, origin_address, dest_address, status, pickup_time, dropoff_time, distance_meters, rating')
      .order('created_at', { ascending: false })
      .limit(30),

    supabase
      .from('rides')
      .select('driver_name, origin, destination, date, time, seats_available, price_per_seat, status')
      .eq('status', 'active')
      .limit(60),

    supabase
      .from('leagues')
      .select('title, details, prize, status, description')
      .limit(40),

    supabase
      .from('clubs')
      .select('name, description, category, monthly_fee, uses_per_month, benefits, is_active, is_paid, price, member_limit')
      .eq('is_active', true)
      .limit(40),

    supabase
      .from('campaigns')
      .select('title, description, status, banner_url')
      .limit(40),

    supabase
      .from('ai_knowledge')
      .select('topic, title, content, priority')
      .eq('is_active', true)
      .order('priority', { ascending: false }),
  ];

  const resultados = await Promise.allSettled(consultas);
  const [
    merchants, places, events, rentals, promotions, deliveries,
    rides, leagues, clubs, campaigns, knowledge,
  ] = resultados.map(r => (r.status === 'fulfilled' ? r.value.data || [] : []));

  // ============================================================
  // SERVICOS DISPONIVEIS (derivado de merchants, SEM query extra)
  // Inserido ANTES do bloco de merchants para NUNCA ser cortado
  // ============================================================
  const servicos = merchants.filter(ehServicoVoz);

  if (servicos.length) {
    let bloco = '\n\n# SERVICOS DISPONIVEIS PARA COMPRA\n';
    bloco += 'Use este bloco SEMPRE que o usuario perguntar sobre servicos, passeios, aulas, consultas, tratamentos ou qualquer prestacao de servico.\n';
    bloco += 'IMPORTANTE: se houver URL, informe ao usuario que ele pode acessar diretamente pelo app.\n';

    servicos.forEach(s => {
      bloco += `- ${s.name}`;
      if (s.category) bloco += ` (${s.category})`;
      if (s.description) bloco += ` -- ${String(s.description).slice(0, 120)}`;
      if (s.address) bloco += ` | Endereco: ${s.address}`;
      if (s.phone) bloco += ` | Tel: ${s.phone}`;
      if (s.service_url) bloco += ` | Comprar servico: ${s.service_url}`;
      if (s.reservation_url) bloco += ` | Reservar: ${s.reservation_url}`;
      if (s.menu_url) bloco += ` | Cardapio: ${s.menu_url}`;
      if (s.shop_url) bloco += ` | Loja: ${s.shop_url}`;
      bloco += '\n';
    });

    // Limite ampliado para a sessão de voz; o chat de texto usa recuperação seletiva.
    texto += bloco.slice(0, 5000);
  }

  // ============================================================
  // MERCHANTS (formato ORIGINAL preservado, + URLs no fim de cada linha)
  // ============================================================
  if (merchants.length) {
    let bloco = '\n\n# COMERCIOS E SERVICOS DA CIDADE (por categoria)\n';
    bloco += 'Use estes dados quando o usuario perguntar sobre estabelecimentos, servicos ou comercios locais.\n';

    const porCategoria = merchants.reduce((acc, m) => {
      const cat = (m.category || 'Outros').trim();
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(m);
      return acc;
    }, {});

    // Servicos primeiro para nao serem cortados pelo trimVoice(2000)
    const categoriasOrdenadas = Object.keys(porCategoria).sort((a, b) => {
      const aServico = /servi|prestad|passei|turismo|aventur|aula|consult/i.test(a);
      const bServico = /servi|prestad|passei|turismo|aventur|aula|consult/i.test(b);
      if (aServico && !bServico) return -1;
      if (!aServico && bServico) return 1;
      return 0;
    });

    categoriasOrdenadas.forEach(categoria => {
      bloco += `\n## ${categoria.toUpperCase()}\n`;
      porCategoria[categoria].forEach(m => {
        bloco += `- ${m.name}`;
        if (m.description) bloco += ` -- ${String(m.description).slice(0, 120)}`;
        if (m.address) bloco += ` | Endereco: ${m.address}`;
        if (m.phone) bloco += ` | Tel: ${m.phone}`;
        if (m.rating) bloco += ` | rating: ${m.rating}`;
        if (m.is_partner) bloco += ' | PARCEIRO VIP';
        if (m.latitude && m.longitude) {
          bloco += ` | GPS: ${m.latitude},${m.longitude}`;
        }
        // URLs (novas)
        if (m.service_url) bloco += ` | Comprar: ${m.service_url}`;
        if (m.reservation_url) bloco += ` | Reservar: ${m.reservation_url}`;
        if (m.menu_url) bloco += ` | Cardapio: ${m.menu_url}`;
        if (m.shop_url) bloco += ` | Loja: ${m.shop_url}`;
        bloco += '\n';
      });
    });

    texto += bloco;
  }

  // ============================================================
  // PLACES
  // ============================================================
  if (places.length) {
    let bloco = '\n\n# PONTOS TURISTICOS E LOCAIS\n';
    places.forEach(p => {
      bloco += `- ${p.name}`;
      if (p.category) bloco += ` (${p.category})`;
      if (p.address) bloco += ` -- ${p.address}`;
      if (p.phone) bloco += ` | Tel: ${p.phone}`;
      if (p.is_partner) bloco += ' | PARCEIRO VIP';
      if (p.has_delivery) bloco += ' | Delivery';
      if (p.menu_url) bloco += ' | menu disponivel';
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // EVENTOS
  // ============================================================
  if (events.length) {
    let bloco = '\n\n# PROXIMOS EVENTOS DA CIDADE\n';
    events.forEach(e => {
      bloco += `- ${e.title || 'Evento'}`;
      if (e.date) bloco += ` -- ${formatarDataVoz(e.date)}`;
      if (e.time) bloco += ` as ${e.time}`;
      if (e.end_date) bloco += ` ate ${formatarDataVoz(e.end_date)}`;
      if (e.location) bloco += ` | Local: ${e.location}`;
      if (e.category) bloco += ` | Categoria: ${e.category}`;
      if (e.is_free) bloco += ' | GRATUITO';
      else if (e.price) bloco += ` | R$ ${e.price}`;
      if (e.is_featured) bloco += ' | DESTAQUE';
      if (e.ticket_url) bloco += ' | ingressos disponiveis no app';
      if (e.description) bloco += `\n  ${String(e.description).slice(0, 150)}`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // ALUGUEIS
  // ============================================================
  if (rentals.length) {
    let bloco = '\n\n# ALUGUEIS DISPONIVEIS\n';
    rentals.forEach(r => {
      bloco += `- ${r.title || 'Imovel'}`;
      if (r.property_type) bloco += ` (${r.property_type})`;
      const detalhes = [];
      if (r.bedrooms) detalhes.push(`${r.bedrooms} quarto(s)`);
      if (r.beds) detalhes.push(`${r.beds} cama(s)`);
      if (r.bathrooms) detalhes.push(`${r.bathrooms} banheiro(s)`);
      if (detalhes.length) bloco += ` | ${detalhes.join(', ')}`;
      if (r.max_guests) bloco += ` | ate ${r.max_guests} hospedes`;
      if (r.price_per_night) bloco += ` | R$ ${r.price_per_night}/noite`;
      if (r.address) bloco += ` | ${r.address}`;
      if (r.host_name) bloco += ` | Anfitria(o): ${r.host_name}`;
      if (r.amenities?.length) bloco += `\n  Comodidades: ${r.amenities.join(', ')}`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // PROMOCOES
  // ============================================================
  if (promotions.length) {
    let bloco = '\n\n# PROMOCOES ATIVAS\n';
    promotions.forEach(p => {
      bloco += `- ${p.title || 'Promocao'}`;
      if (p.is_flash) bloco += ' [FLASH]';
      if (p.is_top_ad) bloco += ' [DESTAQUE]';
      if (p.description) bloco += ` -- ${String(p.description).slice(0, 120)}`;
      if (p.coupon_code) bloco += ` | Cupom: ${p.coupon_code}`;
      if (p.end_time) bloco += ` | Valida ate ${formatarDataHoraVoz(p.end_time)}`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // DELIVERY
  // ============================================================
  if (deliveries.length) {
    let bloco = '\n\n# SERVICO DE ENTREGAS (motoboy)\n';
    bloco += 'O app +iTACARE oferece servico de entregas rapidas tipo motoboy.\n';
    deliveries.slice(0, 10).forEach(d => {
      bloco += `- ${d.origin_address || '?'} -> ${d.dest_address || '?'}`;
      if (d.status) bloco += ` | Status: ${d.status}`;
      if (d.distance_meters) bloco += ` | ${(d.distance_meters / 1000).toFixed(1)} km`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // CARONAS
  // ============================================================
  if (rides.length) {
    let bloco = '\n\n# CARONAS DISPONIVEIS\n';
    rides.forEach(r => {
      bloco += `- ${r.origin || '?'} -> ${r.destination || '?'}`;
      if (r.date) bloco += ` -- ${r.date}`;
      if (r.time) bloco += ` as ${r.time}`;
      if (r.driver_name) bloco += ` | Motorista: ${r.driver_name}`;
      if (r.price_per_seat) bloco += ` | R$ ${r.price_per_seat}/assento`;
      if (r.seats_available) bloco += ` | ${r.seats_available} vagas`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // LIGAS
  // ============================================================
  if (leagues.length) {
    let bloco = '\n\n# LIGAS ESPORTIVAS\n';
    leagues.forEach(l => {
      bloco += `- ${l.title || 'Liga'}`;
      if (l.status) bloco += ` [${l.status}]`;
      if (l.prize) bloco += ` -- Premio: ${l.prize}`;
      const desc = l.details || l.description;
      if (desc) bloco += `\n  ${String(desc).slice(0, 150)}`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // CLUBES
  // ============================================================
  if (clubs.length) {
    let bloco = '\n\n# CLUBES PARA ASSINANTES\n';
    clubs.forEach(c => {
      bloco += `- ${c.name || 'Clube'}`;
      if (c.category) bloco += ` (${c.category})`;
      const valor = c.price || c.monthly_fee;
      if (c.is_paid && valor) bloco += ` -- R$ ${valor}/mes`;
      else bloco += ' -- GRATIS';
      if (c.uses_per_month) bloco += ` | ${c.uses_per_month} usos/mes`;
      if (c.member_limit) bloco += ` | limite ${c.member_limit} membros`;
      if (c.benefits?.length) bloco += `\n  Beneficios: ${c.benefits.join(', ')}`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // CAMPANHAS
  // ============================================================
  if (campaigns.length) {
    let bloco = '\n\n# CAMPANHAS\n';
    campaigns.forEach(c => {
      bloco += `- ${c.title || 'Campanha'}`;
      if (c.status) bloco += ` [${c.status}]`;
      if (c.description) bloco += ` -- ${String(c.description).slice(0, 150)}`;
      bloco += '\n';
    });
    texto += trimVoice(bloco);
  }

  // ============================================================
  // CONHECIMENTO GERAL (SEM trim, igual ao original)
  // ============================================================
  if (knowledge.length) {
    const porTopico = knowledge.reduce((acc, item) => {
      if (!acc[item.topic]) acc[item.topic] = [];
      acc[item.topic].push(item);
      return acc;
    }, {});

    let bloco = '\n\n# CONHECIMENTO SOBRE ITACARE E O APP\n';
    Object.entries(porTopico).forEach(([topico, itens]) => {
      bloco += `\n## ${topico.toUpperCase()}\n`;
      itens.forEach(item => {
        bloco += `### ${item.title}\n${item.content}\n\n`;
      });
    });
    texto += bloco;
  }

  // ============================================================
  // SANITIZACAO FINAL
  // ============================================================
  texto = sanitizarParaJSONVoz(texto);

  console.log(
    `[GuiaIA] Contexto: ${texto.length} chars | ` +
    `${merchants.length} merchants | ${servicos.length} servicos | ` +
    `${places.length} places | ${events.length} eventos`
  );

  return texto;
}