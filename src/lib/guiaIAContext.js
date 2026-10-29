// src/lib/guiaIAContext.js
import { supabase } from './supabaseConfig';

const MAX_CHARS_PER_TABLE = 2000;

function trim(texto) {
  if (!texto) return '';
  if (texto.length <= MAX_CHARS_PER_TABLE) return texto;
  return texto.slice(0, MAX_CHARS_PER_TABLE) + '\n[... texto truncado ...]';
}

function formatarData(data) {
  if (!data) return 'N/I';
  if (typeof data === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(data)) {
    return data;
  }
  try {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(data);
  }
}

function formatarDataHora(data) {
  if (!data) return 'N/I';
  try {
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(data);
  }
}

// ============================================================
// SANITIZACAO AGRESSIVA: forca o texto a ser 100% ASCII
// ============================================================
function sanitizarParaJSON(str) {
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

export async function montarContextoDaCidade() {
  // ============================================================
  // DATA E HORA ATUAIS
  // ============================================================
  const agora = new Date();
  const dataAtual = agora.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const horaAtual = agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  let texto = `# DATA E HORA ATUAIS\nHoje e ${dataAtual}, as ${horaAtual} (horario de Brasilia).\nUse SEMPRE esta data como referencia para julgar se um evento e passado, presente ou futuro.\n`;

  // ============================================================
  // CONSULTAS EM PARALELO
  // ============================================================
  const consultas = [
    supabase
      .from('merchants')
      .select('name, category, description, address, latitude, longitude, rating, phone, is_partner')
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
  // MERCHANTS
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

    Object.entries(porCategoria).forEach(([categoria, itens]) => {
      bloco += `\n## ${categoria.toUpperCase()}\n`;
      itens.forEach(m => {
        bloco += `- ${m.name}`;
        if (m.description) bloco += ` -- ${String(m.description).slice(0, 120)}`;
        if (m.address) bloco += ` | Endereco: ${m.address}`;
        if (m.phone) bloco += ` | Tel: ${m.phone}`;
        if (m.rating) bloco += ` | rating: ${m.rating}`;
        if (m.is_partner) bloco += ' | PARCEIRO VIP';
        if (m.latitude && m.longitude) {
          bloco += ` | GPS: ${m.latitude},${m.longitude}`;
        }
        bloco += '\n';
      });
    });

    texto += trim(bloco);
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
    texto += trim(bloco);
  }

  // ============================================================
  // EVENTOS
  // ============================================================
  if (events.length) {
    let bloco = '\n\n# PROXIMOS EVENTOS DA CIDADE\n';
    events.forEach(e => {
      bloco += `- ${e.title || 'Evento'}`;
      if (e.date) bloco += ` -- ${formatarData(e.date)}`;
      if (e.time) bloco += ` as ${e.time}`;
      if (e.end_date) bloco += ` ate ${formatarData(e.end_date)}`;
      if (e.location) bloco += ` | Local: ${e.location}`;
      if (e.category) bloco += ` | Categoria: ${e.category}`;
      if (e.is_free) bloco += ' | GRATUITO';
      else if (e.price) bloco += ` | R$ ${e.price}`;
      if (e.is_featured) bloco += ' | DESTAQUE';
      if (e.ticket_url) bloco += ' | ingressos disponiveis no app';
      if (e.description) bloco += `\n  ${String(e.description).slice(0, 150)}`;
      bloco += '\n';
    });
    texto += trim(bloco);
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
    texto += trim(bloco);
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
      if (p.end_time) bloco += ` | Valida ate ${formatarDataHora(p.end_time)}`;
      bloco += '\n';
    });
    texto += trim(bloco);
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
    texto += trim(bloco);
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
    texto += trim(bloco);
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
    texto += trim(bloco);
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
    texto += trim(bloco);
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
    texto += trim(bloco);
  }

  // ============================================================
  // CONHECIMENTO GERAL
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
  texto = sanitizarParaJSON(texto);

  console.log(`[GuiaIA] Contexto montado: ${texto.length} caracteres (${merchants.length} merchants)`);
  return texto;
}