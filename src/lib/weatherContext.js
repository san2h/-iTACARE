// src/lib/weatherContext.js
import TIDES_2026 from '../data/tides2026';

const CACHE_KEY = 'guiaia.weather.context.v2';
const CACHE_TTL_MS = 30 * 60 * 1000;

const TIRIRICA = { lat: '-14.2860', lng: '-38.9841' };
const TIDECHECK_API_KEY = import.meta.env.VITE_TIDECHECK_API_KEY || '';
const TIDECHECK_STATION_ID = import.meta.env.VITE_TIDECHECK_STATION_ID || 'fes2022-itacare';
const TIDECHECK_BASE = 'https://tidecheck.com/api';

const LUNAR_MONTH_MS = 29.530588 * 24 * 60 * 60 * 1000;
const M2_PERIOD_MS = 12.4206012 * 60 * 60 * 1000;
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
const PHASE_OFFSET_MS = 1.95 * 60 * 60 * 1000;

const MARE_POR_DATA_KEY = 'guiaia.weather.tides.bydate.v1';
const MARE_POR_DATA_TTL = 6 * 60 * 60 * 1000;

const getCardinalDirection = (deg) => {
  if (deg == null) return 'N/A';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
};

const getWeatherConditionText = (code) => {
  if (code === 0) return 'Ensolarado';
  if ([1, 2, 3].includes(code)) return 'Parc. Nublado';
  if ([45, 48].includes(code)) return 'Nevoeiro';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'Chuvoso';
  if ([95, 96, 99].includes(code)) return 'Trovoadas';
  return 'Ensolarado';
};

const getMoonPhase = (date) => {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  const phase = (days % 29.53058770576) / 29.53058770576;
  if (phase < 0.03 || phase > 0.97) return 'Nova';
  if (phase < 0.28) return 'Crescente';
  if (phase < 0.53) return 'Cheia';
  if (phase < 0.78) return 'Minguante';
  return 'Minguante';
};

const getTidalLevelFallback = (ms) => {
  const phaseProgress = ((ms - KNOWN_NEW_MOON) % LUNAR_MONTH_MS) / LUNAR_MONTH_MS;
  const springNeapFactor = Math.cos(phaseProgress * 2 * Math.PI);
  const amplitude = 0.75 + 0.40 * springNeapFactor;
  const m2Progress = ((ms - PHASE_OFFSET_MS) % M2_PERIOD_MS) / M2_PERIOD_MS;
  return 1.15 + amplitude * Math.cos(m2Progress * 2 * Math.PI);
};

// ============================================================
// Maré — eventos por data
// ============================================================
function mareDateKey(d) {
  return (
    d.getFullYear() +
    '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0')
  );
}

function getMareCache() {
  try { return JSON.parse(localStorage.getItem(MARE_POR_DATA_KEY) || '{}'); }
  catch { return {}; }
}

function setMareCache(cache) {
  try { localStorage.setItem(MARE_POR_DATA_KEY, JSON.stringify(cache)); } catch {}
}

function getEventosEstaticos(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  const keys = [mm + '-' + dd, yyyy + '-' + mm + '-' + dd, date.getDate() + '/' + (date.getMonth() + 1)];
  for (const k of keys) {
    const raw = TIDES_2026 && TIDES_2026[k];
    if (raw && raw.length) {
      return raw.map((t) => {
        const parts = t.time.split(':');
        const h = Number(parts[0]);
        const m = Number(parts[1]);
        return {
          time: t.time,
          level: Number(t.level),
          type: t.type,
          date: new Date(yyyy, date.getMonth(), date.getDate(), h, m, 0),
        };
      });
    }
  }
  return null;
}

export function gerarEventosMareHarmonicos(date) {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const events = [];
  let isRising = getTidalLevelFallback(startOfDay) > getTidalLevelFallback(startOfDay - 60000);
  for (let min = 0; min <= 24 * 60; min += 5) {
    const ms = startOfDay + min * 60000;
    const level = getTidalLevelFallback(ms);
    const next = getTidalLevelFallback(ms + 60000);
    const rising = next > level;
    if (isRising !== rising) {
      const d = new Date(ms);
      events.push({
        time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
        level: Number(level.toFixed(1)),
        type: isRising ? 'Alta' : 'Baixa',
        date: new Date(ms),
      });
      isRising = rising;
    }
  }
  return events;
}

export async function buscarEventosMare(date) {
  const key = mareDateKey(date);
  const cache = getMareCache();
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < MARE_POR_DATA_TTL && entry.events && entry.events.length) {
    return entry.events.map((e) => Object.assign({}, e, { date: new Date(e.date) }));
  }

  // Tier 1: TideCheck
  try {
    if (TIDECHECK_API_KEY && TIDECHECK_STATION_ID) {
      const res = await fetch(
        TIDECHECK_BASE + '/station/' + TIDECHECK_STATION_ID + '/tides?days=3&datum=LAT',
        { headers: { 'X-API-Key': TIDECHECK_API_KEY } }
      );
      if (res.ok) {
        const payload = await res.json();
        const extremes = payload.extremes || [];
        const porDia = {};
        extremes.forEach((e) => {
          const isoStr = e.localTime || e.time;
          const dt = new Date(isoStr);
          if (isNaN(dt.getTime())) return;
          const k = mareDateKey(dt);
          if (!porDia[k]) porDia[k] = [];
          const m = String(isoStr).match(/T(\d{2}):(\d{2})/);
          porDia[k].push({
            time: m ? m[1] + ':' + m[2] : '--:--',
            level: Number(e.height || 0),
            type: e.type === 'high' ? 'Alta' : 'Baixa',
            date: dt,
          });
        });

        const novoCache = getMareCache();
        Object.entries(porDia).forEach(([k, evs]) => {
          novoCache[k] = { events: evs.sort((a, b) => a.date - b.date), ts: Date.now() };
        });
        setMareCache(novoCache);

        if (porDia[key] && porDia[key].length) {
          return porDia[key].map((e) => Object.assign({}, e, { date: new Date(e.date) }));
        }
      }
    }
  } catch (err) {
    console.warn('[weatherContext] TideCheck falhou para', key, err);
  }

  // Tier 2: estático
  const estatico = getEventosEstaticos(date);
  if (estatico && estatico.length) return estatico;

  // Tier 3: harmônico
  return gerarEventosMareHarmonicos(date);
}

async function buscarMare() {
  const now = new Date();
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1);

  const results = await Promise.all([
    buscarEventosMare(ontem).catch(() => []),
    buscarEventosMare(hoje).catch(() => []),
    buscarEventosMare(amanha).catch(() => []),
  ]);

  const all = [...results[0], ...results[1], ...results[2]].sort((a, b) => a.date - b.date);
  return buildMare(all, now);
}

function buildMare(events, now) {
  if (!events.length) {
    return { status: 'Sem dados', proximaHora: '--:--', proximaAltura: 0, percentual: 50 };
  }
  const nextIdx = events.findIndex((e) => e.date > now);
  if (nextIdx <= 0) {
    const last = events[events.length - 1];
    return {
      status: last.type === 'Alta' ? 'Enchendo' : 'Secando',
      proximaHora: last.time,
      proximaAltura: Number(last.level.toFixed(1)),
      percentual: 50,
    };
  }
  const prev = events[nextIdx - 1];
  const next = events[nextIdx];
  const isRising = next.type === 'Alta';
  const progress = (now - prev.date) / (next.date - prev.date);
  const smooth = (1 - Math.cos(Math.PI * progress)) / 2;
  const currentLevel = prev.level + (next.level - prev.level) * smooth;
  const percentual = Math.min(Math.max(((currentLevel - 0.1) / 2.2) * 100, 0), 100);
  return {
    status: isRising ? 'Enchendo' : 'Secando',
    proximaHora: next.time,
    proximaAltura: Number(next.level.toFixed(1)),
    percentual: Math.round(percentual),
  };
}

// ============================================================
// Clima atual
// ============================================================
export async function buscarClima() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.data && Date.now() - cached.ts < CACHE_TTL_MS) {
      return Object.assign({}, cached.data, { _fonte: 'cache' });
    }
  } catch (err) {}

  try {
    const now = new Date();
    const marineReq = fetch(
      'https://marine-api.open-meteo.com/v1/marine?latitude=' + TIRIRICA.lat +
      '&longitude=' + TIRIRICA.lng +
      '&hourly=wave_height,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period&timezone=auto'
    ).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const weatherReq = fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=' + TIRIRICA.lat +
      '&longitude=' + TIRIRICA.lng +
      '&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&windspeed_unit=kn&timezone=auto'
    ).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

    const results = await Promise.all([marineReq, weatherReq, buscarMare()]);
    const marine = results[0];
    const weather = results[1];
    const mare = results[2];

    const nowIso = now.toISOString().slice(0, 13);
    let idx = (marine && marine.hourly && marine.hourly.time)
      ? marine.hourly.time.findIndex((t) => t.startsWith(nowIso))
      : -1;
    if (idx === -1 || idx === undefined) idx = 0;

    const pick = (obj, key) => (obj && obj.hourly && obj.hourly[key] && obj.hourly[key][idx] != null)
      ? obj.hourly[key][idx] : null;

    const altura = Number(pick(marine, 'wave_height') || 1.2);
    const periodo = Math.round(pick(marine, 'swell_wave_period') || pick(marine, 'wave_period') || 10);
    const swellGraus = pick(marine, 'swell_wave_direction') || 135;
    const tempAr = Math.round(pick(weather, 'temperature_2m') || 27);
    const condCode = pick(weather, 'weather_code') || 0;
    const ventoKt = Math.round(pick(weather, 'wind_speed_10m') || 8);
    const ventoGraus = pick(weather, 'wind_direction_10m') || 45;

    const data = {
      ondas: {
        altura: Number(altura.toFixed(1)),
        periodo: periodo,
        direcao: getCardinalDirection(swellGraus),
        direcaoGraus: swellGraus,
        energiaKJ: Math.round(Math.pow(altura, 2) * periodo * 35),
      },
      vento: {
        velocidadeKt: ventoKt,
        direcao: getCardinalDirection(ventoGraus),
        direcaoGraus: ventoGraus,
      },
      temperatura: { ar: tempAr, condicao: getWeatherConditionText(condCode) },
      mare: mare,
      lua: { fase: getMoonPhase(now) },
      atualizadoEm: now.toISOString(),
      _fonte: 'live',
    };

    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, ts: Date.now() })); } catch (err) {}
    return data;
  } catch (err) {
    console.error('[weatherContext] Falha total:', err);
    return null;
  }
}

export function formatarClimaParaPrompt(clima) {
  if (!clima) return '';
  const ondas = clima.ondas;
  const vento = clima.vento;
  const temperatura = clima.temperatura;
  const mare = clima.mare;
  const lua = clima.lua;

  const mareValida = mare && mare.status && mare.status !== 'Sem dados'
    && mare.status !== 'Estavel' && mare.proximaHora && mare.proximaHora !== '--:--';

  const linhaMare = mareValida
    ? '- Mare: ' + mare.status + ' ate ' + mare.proximaHora + ' (~' + mare.proximaAltura + 'm)'
    : '- Mare: PRECISAO INDISPONIVEL agora. Se o usuario perguntar, diga apenas: "A previsao de mare nao esta disponivel neste momento." NAO invente horarios nem alturas.';

  return [
    '## CONDICOES ATUAIS DO MAR - Tiririca, Itacare (' + clima.atualizadoEm + ')',
    '- Ondas: ' + ondas.altura + 'm, periodo ' + ondas.periodo + 's, swell ' + ondas.direcao,
    '- Vento: ' + vento.velocidadeKt + 'kt ' + vento.direcao,
    '- Tempo: ' + temperatura.ar + 'C, ' + temperatura.condicao,
    linhaMare,
    '- Fase da lua: ' + lua.fase,
    '',
    'REGRA: ondas, vento, clima e mare usam os dados acima com precisao numerica. Nao invente valores fora desses dados.',
    'Se as condicoes estiverem boas para surf (altura 0.8-2m, periodo >=8s, vento <=10kt), diga. Se nao, sugira outra praia ou horario.',
  ].join('\n');
}

// ============================================================
// Previsão de surf — 7 dias
// ============================================================
const FORECAST_CACHE_KEY = 'guiaia.weather.forecast7d.v1';
const FORECAST_CACHE_TTL = 2 * 60 * 60 * 1000;

function getWeekdayName(date) {
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  return dias[date.getDay()];
}

export async function buscarPrevisaoSurf(dias) {
  if (dias == null) dias = 7;
  try {
    const cached = JSON.parse(localStorage.getItem(FORECAST_CACHE_KEY) || 'null');
    if (cached && cached.data && Date.now() - cached.ts < FORECAST_CACHE_TTL) {
      return Object.assign({}, cached.data, { _fonte: 'cache' });
    }
  } catch (err) {}

  try {
    const now = new Date();
    const marineReq = fetch(
      'https://marine-api.open-meteo.com/v1/marine?latitude=' + TIRIRICA.lat +
      '&longitude=' + TIRIRICA.lng +
      '&hourly=wave_height,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period' +
      '&forecast_days=' + dias + '&timezone=auto'
    ).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

    const weatherReq = fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=' + TIRIRICA.lat +
      '&longitude=' + TIRIRICA.lng +
      '&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&windspeed_unit=kn&forecast_days=' + dias + '&timezone=auto'
    ).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

    const results = await Promise.all([marineReq, weatherReq]);
    const marine = results[0];
    const weather = results[1];

    if (!marine || !marine.hourly || !marine.hourly.time) return null;
    if (!weather || !weather.hourly || !weather.hourly.time) return null;

    const diaMap = new Map();
    for (let i = 0; i < marine.hourly.time.length; i++) {
      const isoStr = marine.hourly.time[i];
      const diaKey = isoStr.slice(0, 10);
      if (!diaMap.has(diaKey)) {
        diaMap.set(diaKey, {
          waveHeights: [], periods: [], swellDegs: [],
          windSpeeds: [], windDegs: [], gustSpeeds: [],
          temps: [], codes: [],
        });
      }
      const entry = diaMap.get(diaKey);
      const wh = marine.hourly.wave_height && marine.hourly.wave_height[i];
      const wp = (marine.hourly.swell_wave_period && marine.hourly.swell_wave_period[i])
        || (marine.hourly.wave_period && marine.hourly.wave_period[i]);
      const sd = marine.hourly.swell_wave_direction && marine.hourly.swell_wave_direction[i];
      const ws = weather.hourly.wind_speed_10m && weather.hourly.wind_speed_10m[i];
      const wd = weather.hourly.wind_direction_10m && weather.hourly.wind_direction_10m[i];
      const gs = weather.hourly.wind_gusts_10m && weather.hourly.wind_gusts_10m[i];
      const tp = weather.hourly.temperature_2m && weather.hourly.temperature_2m[i];
      const cd = weather.hourly.weather_code && weather.hourly.weather_code[i];
      if (wh != null) entry.waveHeights.push(wh);
      if (wp != null) entry.periods.push(wp);
      if (sd != null) entry.swellDegs.push(sd);
      if (ws != null) entry.windSpeeds.push(ws);
      if (wd != null) entry.windDegs.push(wd);
      if (gs != null) entry.gustSpeeds.push(gs);
      if (tp != null) entry.temps.push(tp);
      if (cd != null) entry.codes.push(cd);
    }

    const media = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const maximo = (arr) => arr.length ? Math.max.apply(null, arr) : null;
    const moda = (arr) => {
      if (!arr.length) return null;
      const freq = {};
      arr.forEach((v) => { const k = String(v); freq[k] = (freq[k] || 0) + 1; });
      const ordenado = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      return Number(ordenado[0][0]);
    };

    const previsao = [];
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const item of diaMap.entries()) {
      const diaKey = item[0];
      const entry = item[1];
      const data = new Date(diaKey + 'T12:00:00');
      const alturaMedia = media(entry.waveHeights);
      const alturaMax = maximo(entry.waveHeights);
      const periodoMedio = media(entry.periods);
      const swellGraus = moda(entry.swellDegs.map((d) => Math.round(d / 45) * 45));
      const ventoMedio = media(entry.windSpeeds);
      const ventoMax = maximo(entry.windSpeeds);
      const ventoGraus = moda(entry.windDegs.map((d) => Math.round(d / 45) * 45));
      const tempMedia = media(entry.temps);
      const condCode = moda(entry.codes);

      let mareEventos = [];
      try { mareEventos = await buscarEventosMare(data); } catch {}

      previsao.push({
        data: diaKey,
        diaSemana: getWeekdayName(data),
        offset: Math.round((data - nowMidnight) / 86400000),
        ondas: {
          alturaMedia: alturaMedia != null ? Number(alturaMedia.toFixed(1)) : null,
          alturaMaxima: alturaMax != null ? Number(alturaMax.toFixed(1)) : null,
          periodoMedio: periodoMedio != null ? Math.round(periodoMedio) : null,
          swellDirecao: swellGraus != null ? getCardinalDirection(swellGraus) : null,
          swellGraus: swellGraus,
        },
        vento: {
          velocidadeMedia: ventoMedio != null ? Math.round(ventoMedio) : null,
          velocidadeMaxima: ventoMax != null ? Math.round(ventoMax) : null,
          direcao: ventoGraus != null ? getCardinalDirection(ventoGraus) : null,
          direcaoGraus: ventoGraus,
        },
        temperatura: {
          ar: tempMedia != null ? Math.round(tempMedia) : null,
          condicao: condCode != null ? getWeatherConditionText(condCode) : null,
        },
        mare: mareEventos.map((e) => ({ time: e.time, level: Number(e.level), type: e.type })),
      });
    }

    previsao.sort((a, b) => a.data.localeCompare(b.data));

    const data = { previsao: previsao, geradoEm: now.toISOString(), _fonte: 'live' };
    try { localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
    return data;
  } catch (err) {
    console.error('[weatherContext] Falha ao buscar previsao:', err);
    return null;
  }
}

export function formatarPrevisaoSurfParaPrompt(previsao) {
  if (!previsao || !previsao.previsao || !previsao.previsao.length) return '';

  const linhas = previsao.previsao.map((p) => {
    const altura = p.ondas.alturaMedia != null
      ? p.ondas.alturaMedia + 'm (max ' + p.ondas.alturaMaxima + 'm)' : '?';
    const periodo = p.ondas.periodoMedio != null ? p.ondas.periodoMedio + 's' : '?';
    const swell = p.ondas.swellDirecao || '?';
    const vento = p.vento.velocidadeMedia != null
      ? p.vento.velocidadeMedia + 'kt ' + (p.vento.direcao || '?') : '?';
    const cond = p.temperatura.condicao || '?';

    const mares = p.mare.length
      ? p.mare.slice(0, 4).map((m) => m.time + ' ' + m.type + ' ' + m.level.toFixed(1) + 'm').join(', ')
      : 'sem dados';

    const rotulo = p.offset === 0 ? 'HOJE' : p.offset === 1 ? 'AMANHA' : p.diaSemana.toUpperCase();

    return '- ' + rotulo + ' (' + p.data + '): ondas ' + altura + ', periodo ' + periodo +
      ', swell ' + swell + ' | vento ' + vento + ' | ' + cond + ' | mare: ' + mares;
  });

  return [
    '## PREVISAO DE SURF - PROXIMOS 7 DIAS (Tiririca, Itacare)',
    ...linhas,
    '',
    'REGRA DE PREVISAO: quando o usuario perguntar sobre "amanha", "fim de semana",',
    '"qual o melhor dia", "como vai estar sabado" etc., use a tabela acima.',
    'Para recomendar o "melhor dia pra surfar", priorize: altura entre 1.0-2.0m,',
    'periodo >= 10s, vento <= 10kt.',
    'Evite dias com vento > 15kt ou altura < 0.5m.',
    'Se o dia pedido nao estiver na tabela, diga que so tem previsao ate 7 dias.',
  ].join('\n');
}
