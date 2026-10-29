import React, { useState, useEffect, useRef } from 'react';
import {
  Waves, Wind, Sun, Droplets, Camera, Video,
  Compass, ThermometerSun, Shirt, MapPin, Loader2, ShieldCheck,
  Calendar, Video as VideoIcon, Navigation
} from 'lucide-react';
import { buscarEventosMare, gerarEventosMareHarmonicos } from '../../lib/weatherContext';

const SPOT_COORDINATES = {
  "Boca da Barra": { lat: "-14.2750", lng: "-38.9880", zoom: 15 },
  "Pontal": { lat: "-14.2690", lng: "-38.9925", zoom: 15 },
  "Corais": { lat: "-14.2777", lng: "-38.9826", zoom: 15 },
  "Resende": { lat: "-14.2838", lng: "-38.9841", zoom: 17 },
  "Tiririca": { lat: "-14.2860", lng: "-38.9841", zoom: 17 },
  "Prainha": { lat: "-14.3084", lng: "-38.9865", zoom: 17 },
  "Engenhoca": { lat: "-14.3539", lng: "-38.9999", zoom: 15 },
  "Jeribucacu": { lat: "-14.3446", lng: "-39.0002", zoom: 15 }
};

const SPOTS = Object.keys(SPOT_COORDINATES);

const LUNAR_MONTH_MS = 29.530588 * 24 * 60 * 60 * 1000;
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

const timeToDecimalHours = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return Number(parts[0]) + (Number(parts[1]) / 60);
};

const getCardinalDirection = (deg) => {
  if (deg === undefined || deg === null) return 'N/A';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(deg / 22.5) % 16];
};

const getNext7Days = () => {
  const days = [];
  const weekNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    const dayName = i === 0 ? 'Hoje' : i === 1 ? 'Amanha' : weekNames[d.getDay()];
    const dateFormatted = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    days.push({ offset: i, label: dayName, dateStr: dateFormatted, dateObj: d });
  }
  return days;
};

const getMoonPhase = (date) => {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  const phase = (days % 29.53058770576) / 29.53058770576;
  if (phase < 0.03 || phase > 0.97) return 'Nova';
  if (phase < 0.22) return 'Crescente';
  if (phase < 0.28) return 'Quarto Crescente';
  if (phase < 0.47) return 'Crescente Gibosa';
  if (phase < 0.53) return 'Cheia';
  if (phase < 0.72) return 'Minguante Gibosa';
  if (phase < 0.78) return 'Quarto Minguante';
  return 'Minguante';
};

const MoonPhaseIcon = ({ phase }) => {
  const bg = '#475569';
  const fg = '#fcd34d';
  if (phase === 'Nova') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg} /></svg>;
  if (phase === 'Crescente') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg}/><path d="M 12 2 A 10 10 0 0 1 12 22 A 6 10 0 0 0 12 2 Z" fill={fg}/></svg>;
  if (phase === 'Quarto Crescente') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg}/><path d="M 12 2 A 10 10 0 0 1 12 22 Z" fill={fg}/></svg>;
  if (phase === 'Crescente Gibosa') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={fg}/><path d="M 12 2 A 10 10 0 0 0 12 22 A 6 10 0 0 1 12 2 Z" fill={bg}/></svg>;
  if (phase === 'Cheia') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={fg} /></svg>;
  if (phase === 'Minguante Gibosa') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={fg}/><path d="M 12 2 A 10 10 0 0 1 12 22 A 6 10 0 0 0 12 2 Z" fill={bg}/></svg>;
  if (phase === 'Quarto Minguante') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg}/><path d="M 12 2 A 10 10 0 0 0 12 22 Z" fill={fg}/></svg>;
  if (phase === 'Minguante') return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg}/><path d="M 12 2 A 10 10 0 0 0 12 22 A 6 10 0 0 1 12 2 Z" fill={fg}/></svg>;
  return <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={fg} /></svg>;
};

export default function SurfForecastTab() {
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const [activeSpot, setActiveSpot] = useState('Tiririca');
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [reportState, setReportState] = useState('idle');
  const [loadingApi, setLoadingApi] = useState(true);
  const [nowTimeDecimal, setNowTimeDecimal] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  const [tidesState, setTidesState] = useState({
    yesterday: [], today: [], tomorrow: [], loading: true, source: 'auto',
  });

  const [forecast, setForecast] = useState({
    waveHeightMeters: '0.8', waveHeightFeet: '2.6', waveRangeStr: '0.5 ~ 1.0m',
    swellPeriod: '10', swellDirDeg: 135, swellDirCard: 'SE',
    windSpeedKn: 11, windKmh: 20, windDirDeg: 90, windGustKn: 14, windDirCard: 'E',
    airTemp: '26', waterTemp: '26',
  });

  const [reports, setReports] = useState([
    { id: 1, type: 'photo', url: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?q=80&w=300&auto=format&fit=crop', author: 'Caio S.', time: 'Ha 15 min' },
    { id: 2, type: 'video', url: 'https://images.unsplash.com/photo-1512413916281-bb05763b65cb?q=80&w=300&auto=format&fit=crop', author: 'Marina L.', time: 'Ha 42 min' }
  ]);

  const currentCoords = SPOT_COORDINATES[activeSpot];
  const daysList = getNext7Days();
  const targetDate = daysList[selectedDayOffset].dateObj;

  useEffect(() => {
    const updateDeviceClock = () => {
      const now = new Date();
      const dec = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      setNowTimeDecimal(dec);
      setCurrentTimeStr(String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'));
    };
    updateDeviceClock();
    const interval = setInterval(updateDeviceClock, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;
    const target = daysList[selectedDayOffset].dateObj;
    const prev = new Date(target); prev.setDate(target.getDate() - 1);
    const next = new Date(target); next.setDate(target.getDate() + 1);

    setTidesState((s) => ({ ...s, loading: true }));

    Promise.all([
      buscarEventosMare(prev).catch(() => []),
      buscarEventosMare(target).catch(() => []),
      buscarEventosMare(next).catch(() => []),
    ])
      .then((results) => {
        if (!mounted) return;
        const yesterday = results[0];
        const today = results[1];
        const tomorrow = results[2];
        const fonte = today.length && today[0].date instanceof Date ? 'api' : 'harmonic';
        setTidesState({ yesterday, today, tomorrow, loading: false, source: fonte });
      })
      .catch(() => {
        if (!mounted) return;
        setTidesState({
          yesterday: gerarEventosMareHarmonicos(prev),
          today: gerarEventosMareHarmonicos(target),
          tomorrow: gerarEventosMareHarmonicos(next),
          loading: false, source: 'harmonic',
        });
      });

    return () => { mounted = false; };
  }, [selectedDayOffset]);

  useEffect(() => {
    let isMounted = true;
    const fetchForecastData = async () => {
      setLoadingApi(true);
      try {
        const lat = currentCoords.lat;
        const lng = currentCoords.lng;
        const marineUrl = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + lat + '&longitude=' + lng + '&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period&forecast_days=7&timezone=auto';
        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&windspeed_unit=kn&forecast_days=7&timezone=auto';

        const results = await Promise.all([
          fetch(marineUrl).then(r => r.ok ? r.json() : {}).catch(() => ({})),
          fetch(weatherUrl).then(r => r.ok ? r.json() : {}).catch(() => ({}))
        ]);
        const marineRes = results[0];
        const weatherRes = results[1];

        if (!isMounted) return;
        if (!marineRes?.hourly?.time || !weatherRes?.hourly?.time) return;

        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const hh = String(selectedDayOffset === 0 ? new Date().getHours() : 12).padStart(2, '0');
        const targetSearchStr = yyyy + '-' + mm + '-' + dd + 'T' + hh;

        let targetIndex = marineRes.hourly.time.findIndex(t => t.startsWith(targetSearchStr));
        if (targetIndex === -1) targetIndex = 0;

        const rawWaveHeight = marineRes.hourly.wave_height?.[targetIndex] || 0.8;
        const waveHeightFt = (rawWaveHeight * 3.28084).toFixed(1);
        const swellHeightFt = ((marineRes.hourly.swell_wave_height?.[targetIndex] || rawWaveHeight) * 3.28084).toFixed(1);
        const swellPeriod = Math.round(marineRes.hourly.swell_wave_period?.[targetIndex] || marineRes.hourly.wave_period?.[targetIndex] || 10);
        const swellDirDeg = Math.round(marineRes.hourly.swell_wave_direction?.[targetIndex] || 135);
        const windSpeedKn = Math.round(weatherRes.hourly.wind_speed_10m?.[targetIndex] || 10);
        const windGustKn = Math.round(weatherRes.hourly.wind_gusts_10m?.[targetIndex] || 14);
        const windDirDeg = Math.round(weatherRes.hourly.wind_direction_10m?.[targetIndex] || 90);
        const windKmhValue = windSpeedKn * 1.852;
        const airTemp = Math.round(weatherRes.hourly.temperature_2m?.[targetIndex] || 26);

        let waveRangeStr = '0.3 ~ 0.5m';
        if (rawWaveHeight >= 0.5 && rawWaveHeight < 1.0) waveRangeStr = '0.5 ~ 1.0m';
        else if (rawWaveHeight >= 1.0 && rawWaveHeight < 1.5) waveRangeStr = '1.0 ~ 1.5m';
        else if (rawWaveHeight >= 1.5) waveRangeStr = '> 1.5m';

        setForecast({
          waveHeightMeters: rawWaveHeight.toFixed(1),
          waveHeightFeet: swellHeightFt,
          waveRangeStr,
          swellPeriod, swellDirDeg,
          swellDirCard: getCardinalDirection(swellDirDeg),
          windSpeedKn, windKmh: windKmhValue, windDirDeg, windGustKn,
          windDirCard: getCardinalDirection(windDirDeg),
          airTemp, waterTemp: '26',
        });
      } catch (err) {
        console.error('Erro ao processar dados:', err);
      } finally {
        if (isMounted) setLoadingApi(false);
      }
    };
    fetchForecastData();
    return () => { isMounted = false; };
  }, [activeSpot, selectedDayOffset]);

  const handleMediaCapture = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const tempUrl = URL.createObjectURL(file);
    setReportState('validating');
    setTimeout(() => {
      setReportState('success');
      setReports(prev => [{ id: Date.now(), type, url: tempUrl, author: 'Voce', time: 'Agora mesmo' }, ...prev]);
      setTimeout(() => setReportState('idle'), 3000);
    }, 2500);
  };

  let windColor = '#10b981';
  if (forecast.windKmh >= 20) windColor = '#ef4444';
  else if (forecast.windKmh >= 10) windColor = '#f59e0b';

  const buildTideChartData = () => {
    if (tidesState.loading && !tidesState.today.length) return null;

    const prevEvents = tidesState.yesterday.map(ev => ({ ...ev, t: timeToDecimalHours(ev.time) - 24, levelNum: Number(ev.level) }));
    const todayEvents = tidesState.today.map(ev => ({ ...ev, t: timeToDecimalHours(ev.time), levelNum: Number(ev.level) }));
    const nextEvents = tidesState.tomorrow.map(ev => ({ ...ev, t: timeToDecimalHours(ev.time) + 24, levelNum: Number(ev.level) }));
    const allPoints = [...prevEvents, ...todayEvents, ...nextEvents].sort((a, b) => a.t - b.t);

    if (allPoints.length < 2) return null;

    const width = 360, height = 150;
    const paddingLeft = 32, paddingRight = 15, paddingTop = 20, paddingBottom = 28;
    const plotW = width - paddingLeft - paddingRight;
    const plotH = height - paddingTop - paddingBottom;
    const minY = 0.0, maxY = 2.4;

    const mapX = (hourDec) => paddingLeft + (hourDec / 24) * plotW;
    const mapY = (level) => (height - paddingBottom) - ((level - minY) / (maxY - minY)) * plotH;

    const getLevelAtHour = (h) => {
      let idx = 0;
      while (idx < allPoints.length - 1 && allPoints[idx + 1].t <= h) idx++;
      if (idx >= allPoints.length - 1) return allPoints[allPoints.length - 1].levelNum;
      const p1 = allPoints[idx];
      const p2 = allPoints[idx + 1];
      const ratio = (h - p1.t) / (p2.t - p1.t);
      const cosRatio = (1 - Math.cos(ratio * Math.PI)) / 2;
      return p1.levelNum + (p2.levelNum - p1.levelNum) * cosRatio;
    };

    const samples = [];
    for (let h = 0; h <= 24; h += 0.25) samples.push({ x: mapX(h), y: mapY(getLevelAtHour(h)) });

    let curvePath = 'M ' + samples[0].x.toFixed(1) + ' ' + samples[0].y.toFixed(1);
    for (let i = 1; i < samples.length; i++) curvePath += ' L ' + samples[i].x.toFixed(1) + ' ' + samples[i].y.toFixed(1);
    const fillPath = curvePath + ' L ' + mapX(24).toFixed(1) + ' ' + (height - paddingBottom).toFixed(1) + ' L ' + mapX(0).toFixed(1) + ' ' + (height - paddingBottom).toFixed(1) + ' Z';

    let flowPath = null;
    let flowColor = '#38bdf8';
    let nowX = null, nowY = null, nowLevel = null;
    let chartIsRising = true;

    if (selectedDayOffset === 0) {
      nowX = mapX(nowTimeDecimal);
      nowLevel = getLevelAtHour(nowTimeDecimal);
      nowY = mapY(nowLevel);
      chartIsRising = getLevelAtHour(nowTimeDecimal + 0.05) > nowLevel;
      const steps = 40;
      let pathStr = '';
      for (let i = 0; i <= steps; i++) {
        const h = nowTimeDecimal + (i * 0.1);
        const x = mapX(h).toFixed(1);
        const y = mapY(getLevelAtHour(h)).toFixed(1);
        pathStr += (i === 0 ? 'M ' : ' L ') + x + ' ' + y;
      }
      flowPath = pathStr;
      flowColor = chartIsRising ? '#2563eb' : '#38bdf8';
    }

    const todayMarkers = todayEvents.map(ev => ({ ...ev, x: mapX(ev.t), y: mapY(ev.levelNum) }));

    return { width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, curvePath, fillPath, todayMarkers, mapY, nowX, nowY, nowLevel, flowPath, flowColor, isRising: chartIsRising };
  };

  const chartData = buildTideChartData();
  const moonPhaseName = getMoonPhase(targetDate);
  const todayTides = tidesState.today;

  return (
    <div className="space-y-4 mt-4 text-left font-sans pb-10">
      <style>
        {`
          @keyframes radarCascadeFade {
            0% { opacity: 0; }
            15% { opacity: 1; }
            60% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes gaugePulse {
            0% { opacity: 0.3; }
            50% { opacity: 1; filter: drop-shadow(0 0 2px currentColor); stroke-width: 1.5; }
            100% { opacity: 0.3; }
          }
        `}
      </style>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black flex items-center gap-1.5 text-gray-800 uppercase tracking-wide">
            <Waves className="w-4 h-4 text-blue-500" /> Surf Report
          </h3>
          <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> Previsao 7 Dias
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
          {SPOTS.map(spot => (
            <button
              key={spot}
              onClick={() => setActiveSpot(spot)}
              className={'whitespace-nowrap px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ' + (activeSpot === spot ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20' : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50')}
            >
              {spot}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 mt-2 scrollbar-hide">
          {daysList.map((d) => (
            <button
              key={d.offset}
              onClick={() => setSelectedDayOffset(d.offset)}
              className={'whitespace-nowrap px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ' + (selectedDayOffset === d.offset ? 'bg-gray-900 text-cyan-400 border-gray-900 shadow-sm' : 'bg-gray-50 text-gray-500 border-gray-200/60 hover:bg-gray-100')}
            >
              <Calendar className="w-3 h-3 text-cyan-400" />
              <span>{d.label}</span>
              <span className="text-[8px] opacity-60">({d.dateStr})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-80 bg-gray-900 rounded-3xl overflow-hidden shadow-sm border border-gray-200">
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center bg-gray-900">
          <iframe
            src={'https://maps.google.com/maps?q=' + currentCoords.lat + ',' + currentCoords.lng + '&t=k&z=' + currentCoords.zoom + '&ie=UTF8&iwloc=&output=embed'}
            frameBorder="0" scrolling="no" marginHeight="0" marginWidth="0"
            className="w-full h-full scale-[1.55]" title="Google Maps Satellite"
          ></iframe>
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" className="w-72 h-72 opacity-100 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            <g transform="translate(500,500)">
              <g stroke="#848c7c" strokeWidth="2.5" fill="none" opacity="0.4">
                <circle r="60" strokeDasharray="6,6"/>
                <circle r="120"/>
                <circle r="180" strokeDasharray="6,6"/>
                <circle r="240"/>
                <circle r="300"/>
                <circle r="360"/>
                <circle r="420" strokeWidth="4"/>
              </g>
              <g stroke="#38bdf8" strokeWidth="2" fill="none" opacity="0.35">
                <line x1="0" y1="0" x2="0" y2="-420" strokeDasharray="8,8"/>
                <line x1="0" y1="0" x2="420" y2="0" strokeDasharray="8,8"/>
                <line x1="0" y1="0" x2="0" y2="420" strokeDasharray="8,8"/>
                <line x1="0" y1="0" x2="-420" y2="0" strokeDasharray="8,8"/>
              </g>
              <g fill="#22d3ee" fontFamily="sans-serif" fontSize="32px" fontWeight="900" textAnchor="middle" dominantBaseline="central">
                <text x="0" y="-455">N</text>
                <text x="455" y="0">E</text>
                <text x="0" y="455">S</text>
                <text x="-455" y="0">W</text>
              </g>
              <g transform={'rotate(' + (forecast.swellDirDeg - 180) + ')'}>
                <line x1="0" y1="0" x2="0" y2="-400" stroke="#38bdf8" strokeWidth="4" strokeDasharray="10,15" opacity="0.6" />
                {[
                  { y: -60, scale: 0.6 }, { y: -130, scale: 0.8 },
                  { y: -210, scale: 1.0 }, { y: -300, scale: 1.2 },
                  { y: -400, scale: 1.4 }
                ].map((ch, i) => (
                  <polyline key={'swell-' + i} points="-25,15 0,-15 25,15" fill="none" stroke="#22d3ee" strokeWidth="16" strokeLinecap="butt" strokeLinejoin="miter" style={{ transform: 'translate(0px, ' + ch.y + 'px) scale(' + ch.scale + ')', animation: 'radarCascadeFade 1.5s infinite', animationDelay: (i * 150) + 'ms', opacity: 0 }} />
                ))}
              </g>
              <g transform={'rotate(' + (forecast.windDirDeg - 180) + ')'}>
                <line x1="0" y1="0" x2="0" y2="400" stroke={windColor} strokeWidth="3" strokeDasharray="10,15" opacity="0.6" />
                {[
                  { y: 380, scale: 0.5 }, { y: 300, scale: 0.7 },
                  { y: 220, scale: 0.9 }, { y: 140, scale: 1.1 },
                  { y: 60, scale: 1.3 }
                ].map((ch, i) => (
                  <polyline key={'wind-' + i} points="-25,15 0,-15 25,15" fill="none" stroke={windColor} strokeWidth="16" strokeLinecap="butt" strokeLinejoin="miter" style={{ transform: 'translate(0px, ' + ch.y + 'px) scale(' + ch.scale + ')', animation: 'radarCascadeFade 1.5s infinite', animationDelay: (i * 150) + 'ms', opacity: 0 }} />
                ))}
              </g>
            </g>
          </svg>
        </div>

        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-lg text-[9px] text-white font-bold flex items-center gap-1.5 border border-white/10">
          <MapPin className="w-3 h-3 text-sky-400" /> {activeSpot}
        </div>
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-2.5 py-2 rounded-lg text-[8px] text-white font-bold flex flex-col gap-1 border border-white/10 text-left">
          <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#0ea5e9]"></div> Ondulacao</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-0.5" style={{ backgroundColor: windColor }}></div> Vento ({Math.round(forecast.windKmh)} km/h)</div>
        </div>
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-2.5 py-1.5 rounded-lg text-[10px] text-gray-800 font-black flex items-center gap-1.5 shadow-md">
          <Compass className="w-3.5 h-3.5 text-sky-500" /> Swell: {forecast.swellDirCard} ({forecast.swellDirDeg} graus)
        </div>

        {selectedDayOffset === 0 && chartData?.nowLevel !== null && (
          <div className="absolute top-1/2 -translate-y-1/2 right-3 bg-black/60 backdrop-blur-sm px-1.5 py-2 rounded-xl border border-white/10 flex flex-col items-center gap-1.5 shadow-lg pointer-events-none">
            <span className="text-[7px] font-black text-sky-400 uppercase tracking-widest leading-none mb-0.5 mt-0.5">MARE</span>
            <div className="flex flex-col-reverse items-center" style={{ gap: '1px' }}>
              {Array.from({ length: 40 }).map((_, i) => {
                const minT = chartData.todayMarkers.length > 0 ? Math.min(...chartData.todayMarkers.map(m => m.levelNum)) : 0.0;
                const maxT = chartData.todayMarkers.length > 0 ? Math.max(...chartData.todayMarkers.map(m => m.levelNum)) : 2.4;
                const range = maxT - minT || 1;
                const percent = Math.max(0, Math.min(1, (chartData.nowLevel - minT) / range));
                const activeCount = Math.round(percent * 40);
                const isActive = i < activeCount;
                const activeColor = chartData.isRising ? '#3b82f6' : '#38bdf8';
                const strokeColor = isActive ? activeColor : 'rgba(255,255,255,0.15)';
                const delay = chartData.isRising ? i * 0.04 : (39 - i) * 0.04;
                return (
                  <svg key={'gauge-' + i} width="10" height="2" viewBox="0 0 10 2" fill="none" style={isActive ? { animation: 'gaugePulse 1.5s infinite ease-in-out', animationDelay: delay + 's' } : {}}>
                    {chartData.isRising ? (
                      <polyline points="0,2 5,0 10,2" stroke={strokeColor} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <polyline points="0,0 5,2 10,0" stroke={strokeColor} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                );
              })}
            </div>
            <div className="text-center mt-0.5 mb-0.5">
              <span className="block text-[8px] font-black text-white leading-none">{chartData.nowLevel.toFixed(1)}m</span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm divide-y divide-gray-100">
        <div className="grid grid-cols-2 divide-x divide-gray-100 pb-3">
          <div className="pr-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Waves className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Swell Primario</p>
              <p className="text-xs font-black text-gray-800">
                {forecast.waveRangeStr} <span className="text-gray-400">({forecast.waveHeightFeet}ft)</span> @ {forecast.swellPeriod}s <span className="text-blue-500">{forecast.swellDirCard}</span>
              </p>
            </div>
          </div>
          <div className="pl-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-sky-50 flex items-center justify-center shrink-0">
              <Wind className="w-4 h-4 text-sky-500" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Vento ({forecast.windDirCard})</p>
              <p className="text-xs font-black text-gray-800 flex items-center gap-1">
                {forecast.windSpeedKn}kn <span className="text-gray-400">raj.</span> {forecast.windGustKn}
                <Navigation className="w-2.5 h-2.5 fill-sky-500 text-sky-500 inline-block" style={{ transform: 'rotate(' + ((forecast.windDirDeg - 45 + 180) % 360) + 'deg)' }} />
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-100 pt-3">
          <div className="pr-3 flex items-center justify-between text-center">
            <div>
              <Droplets className="w-3.5 h-3.5 text-blue-500 mx-auto mb-0.5" />
              <p className="text-[9px] font-bold text-gray-400 uppercase">Agua</p>
              <p className="text-xs font-black text-gray-800">{forecast.waterTemp}C</p>
            </div>
            <div>
              <ThermometerSun className="w-3.5 h-3.5 text-amber-500 mx-auto mb-0.5" />
              <p className="text-[9px] font-bold text-gray-400 uppercase">Ar</p>
              <p className="text-xs font-black text-gray-800">{forecast.airTemp}C</p>
            </div>
            <div>
              <div className="flex justify-center mb-0.5"><MoonPhaseIcon phase={moonPhaseName} /></div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Lua</p>
              <p className="text-[10px] font-black text-gray-800 truncate max-w-[60px]">{moonPhaseName}</p>
            </div>
          </div>
          <div className="pl-3 flex items-center justify-center gap-2">
            <span className="flex items-center gap-1 text-[9px] font-black text-gray-600 bg-gray-50 border border-gray-100 px-2 py-1.5 rounded-lg shadow-sm">
              <Shirt className="w-3 h-3 text-blue-500" /> Lycra
            </span>
            <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1.5 rounded-lg shadow-sm">
              <Sun className="w-3 h-3 text-amber-500" /> FPS-30
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5 text-blue-500" /> Tabua de Mares
          </h4>
          <div className="flex items-center gap-1.5">
            <span className={'text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm uppercase tracking-wide border ' + (tidesState.source === 'harmonic' ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100')}>
              <span className={'w-1 h-1 rounded-full ' + (tidesState.source === 'harmonic' ? 'bg-amber-500' : 'bg-emerald-500')}></span>
              {tidesState.source === 'harmonic' ? 'Calculo' : 'Previsao'}
            </span>
            <span className="bg-gray-50 border border-gray-100 text-[8px] font-bold text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm uppercase tracking-wide">
              <MoonPhaseIcon phase={moonPhaseName} />
              <span className="ml-0.5">{moonPhaseName}</span>
            </span>
          </div>
        </div>
        <div className="relative w-full overflow-hidden mt-2">
          {chartData ? (
            <svg viewBox={'0 0 ' + chartData.width + ' ' + chartData.height} className="w-full h-auto overflow-visible">
              <defs>
                <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[2.0, 1.0, 0.0].map((lvl) => {
                const yPos = chartData.mapY(lvl);
                return (
                  <g key={'y-' + lvl}>
                    <line x1={chartData.paddingLeft} y1={yPos} x2={chartData.width - chartData.paddingRight} y2={yPos} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4,4" />
                    <text x={chartData.paddingLeft - 6} y={yPos + 3} fill="#94a3b8" fontSize="8" fontWeight="700" textAnchor="end">{lvl.toFixed(1)}m</text>
                  </g>
                );
              })}
              {[0, 6, 12, 18, 24].map((h) => {
                const xPos = chartData.paddingLeft + (h / 24) * (chartData.width - chartData.paddingLeft - chartData.paddingRight);
                return (
                  <g key={'x-' + h}>
                    <line x1={xPos} y1={chartData.paddingTop} x2={xPos} y2={chartData.height - chartData.paddingBottom} stroke="#f8fafc" strokeWidth="1" />
                    <text x={xPos} y={chartData.height - 10} fill="#64748b" fontSize="8" fontWeight="800" textAnchor="middle">{String(h).padStart(2, '0') + ':00'}</text>
                  </g>
                );
              })}
              <path d={chartData.fillPath} fill="url(#tideGradient)" />
              <path d={chartData.curvePath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" className="drop-shadow-sm" />
              {chartData.todayMarkers.map((m, idx) => (
                <g key={'mk-' + idx}>
                  <circle cx={m.x} cy={m.y} r="4" fill={m.type === 'Alta' ? '#2563eb' : '#0ea5e9'} stroke="#ffffff" strokeWidth="2" />
                  <text x={m.x} y={m.type === 'Alta' ? m.y - 8 : m.y + 14} fill="#1e293b" fontSize="7.5" fontWeight="900" textAnchor="middle">{m.time}</text>
                </g>
              ))}
              {selectedDayOffset === 0 && chartData.nowX !== null && (
                <g>
                  <line x1={chartData.nowX} y1={chartData.paddingTop - 5} x2={chartData.nowX} y2={chartData.height - chartData.paddingBottom} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.8"/>
                  <circle cx={chartData.nowX} cy={chartData.nowY} r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                  <rect x={chartData.nowX + 6} y={chartData.nowY - 6} width="18" height="12" rx="3" fill="#ef4444" opacity="0.9" />
                  <text x={chartData.nowX + 15} y={chartData.nowY + 3} fill="#ffffff" fontSize="6.5" fontWeight="900" textAnchor="middle">{chartData.nowLevel.toFixed(1)}m</text>
                  <rect x={Math.max(chartData.paddingLeft, Math.min(chartData.nowX - 16, chartData.width - chartData.paddingRight - 32))} y={chartData.paddingTop - 18} width="32" height="12" rx="3" fill="#ef4444" />
                  <text x={Math.max(chartData.paddingLeft + 16, Math.min(chartData.nowX, chartData.width - chartData.paddingRight - 16))} y={chartData.paddingTop - 9} fill="#ffffff" fontSize="7.5" fontWeight="900" textAnchor="middle">{currentTimeStr}</text>
                </g>
              )}
            </svg>
          ) : (
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400 mb-2" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Montando Grafico...</span>
            </div>
          )}
        </div>
        <div className="flex justify-between items-end border-t border-gray-100 pt-3 mt-1 h-14">
          {todayTides.length > 0 ? (
            todayTides.map((tide, index) => (
              <div key={index} className="text-center flex-1">
                <p className="text-[9px] font-bold text-gray-400 uppercase">{tide.type}</p>
                <p className="text-xs font-black text-gray-800">{tide.time}</p>
                <p className={'text-[9px] font-bold ' + (tide.type === 'Alta' ? 'text-blue-700' : 'text-sky-500')}>{Number(tide.level).toFixed(1)} m</p>
              </div>
            ))
          ) : (
            <div className="w-full text-center flex justify-center items-center h-full gap-2 text-[10px] font-bold text-gray-400">
              {tidesState.loading ? 'Carregando mares...' : 'Dados nao encontrados'}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#0A1428] border border-blue-900/50 rounded-3xl overflow-hidden shadow-lg mt-2">
        <div className="p-4 border-b border-blue-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <VideoIcon className="w-3.5 h-3.5 text-rose-500" /> Camera Ao Vivo
            </h3>
          </div>
          <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest bg-blue-950 px-2 py-1 rounded-md">Itacare Surf</span>
        </div>
        <div className="relative w-full pt-[56.25%] bg-black">
          <iframe
            className="absolute top-0 left-0 w-full h-full"
            src="https://www.youtube.com/embed/live_stream?channel=UCZGZhZEMt876Awc3RIAEZzQ&autoplay=1&mute=1"
            title="Camera Ao Vivo"
            frameBorder="0" allowFullScreen
          ></iframe>
        </div>
      </div>

      <div className="bg-gray-900 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
        {reportState === 'validating' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
            <p className="text-xs font-bold">Analisando Metadados (EXIF)...</p>
          </div>
        )}
        {reportState === 'success' && (
          <div className="absolute inset-0 bg-emerald-600 z-20 flex flex-col items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-white mb-2" />
            <p className="text-sm font-black">Reporte Verificado!</p>
          </div>
        )}
        <div className="flex items-center justify-between mb-3 relative z-10">
          <h3 className="text-sm font-black flex items-center gap-1.5 uppercase tracking-wide">
            <Camera className="w-4 h-4 text-emerald-400" /> Reportes da Galera
          </h3>
        </div>
        <p className="text-[11px] text-gray-400 font-medium mb-4 leading-relaxed relative z-10">
          Tire uma foto <strong className="text-white">AGORA</strong> na praia para provar como esta o mar.
        </p>
        <input type="file" accept="image/*" capture="environment" className="hidden" ref={photoInputRef} onChange={(e) => handleMediaCapture(e, 'photo')} />
        <input type="file" accept="video/*" capture="environment" className="hidden" ref={videoInputRef} onChange={(e) => handleMediaCapture(e, 'video')} />
        <div className="grid grid-cols-2 gap-2 mb-4 relative z-10">
          <button onClick={() => photoInputRef.current?.click()} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all">
            <Camera className="w-4 h-4" /> Foto ao Vivo
          </button>
          <button onClick={() => videoInputRef.current?.click()} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all">
            <Video className="w-4 h-4" /> Video ao Vivo
          </button>
        </div>
        <div className="space-y-2 relative z-10">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {reports.map((report) => (
              <div key={report.id} className="min-w-[140px] h-24 bg-gray-800 rounded-2xl relative overflow-hidden border border-gray-700">
                <img src={report.url} alt="Reporte" className="w-full h-full object-cover opacity-80" />
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/95 via-black/50 to-transparent p-2 pt-6">
                  <p className="text-[9px] font-bold text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-2.5 h-2.5" /> {report.time}
                  </p>
                  <p className="text-[8px] text-gray-300 font-medium">Por {report.author}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
