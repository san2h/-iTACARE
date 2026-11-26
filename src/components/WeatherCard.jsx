import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Wind, Timer, Navigation, ChevronRight, ChevronUp, ChevronDown, Loader2, Zap } from 'lucide-react';
import { buscarClima } from '../lib/weatherContext';

const SwellIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor" className={className}>
    <path d="M24 2h6v2h-6zm0 6h4v2h-4zm0 6h6v2h-6zm0 6h4v2h-4z"/>
    <path d="M30 28h-6a10.035 10.035 0 0 1-6.927-17.262a11.963 11.963 0 0 0-4.08-.738a6.903 6.903 0 0 0-6.03 3.42C4.997 16.435 4 21.34 4 28H2c0-7.054 1.106-12.327 3.287-15.673A8.906 8.906 0 0 1 12.994 8H13a14.762 14.762 0 0 1 6.461 1.592a1 1 0 0 1 .087 1.722A8.025 8.025 0 0 0 24 26h6Z"/>
  </svg>
);

const getCardinalDirection = (deg) => {
  if (deg === undefined || deg === null) return 'N/A';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
};

const MoonPhaseIcon = ({ phase }) => {
  const bg = '#475569', fg = '#fcd34d';
  if (phase === 'Nova') return <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg}/></svg>;
  if (phase === 'Crescente') return <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg}/><path d="M 12 2 A 10 10 0 0 1 12 22 A 6 10 0 0 0 12 2 Z" fill={fg}/></svg>;
  if (phase === 'Minguante') return <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={bg}/><path d="M 12 2 A 10 10 0 0 0 12 22 Z" fill={fg}/></svg>;
  return <svg width="10" height="10" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={fg}/></svg>;
};

export default function WeatherCard() {
  const [loading, setLoading] = useState(true);
  const [surfData, setSurfData] = useState({
    temp: 28, condition: 'Carregando', rawWaveHeight: 1.2, wave_height: '--m',
    period: '--s', swell_dir: '--', swell_deg: 0, energy: '-- kJ',
    wind_speed: '-- kt', wind_dir: '--', wind_deg: 0,
    tide: 'Calculando...', tidePercent: 50, moonPhaseName: 'Nova',
  });

  useEffect(() => {
    let mounted = true;
    const carregar = async () => {
      try {
        const clima = await buscarClima();
        if (!mounted || !clima) return;
        const mare = clima.mare || {};
        const mareValida = mare.status && mare.status !== 'Sem dados'
          && mare.proximaHora && mare.proximaHora !== '--:--';
        const tideTxt = mareValida
          ? mare.status + ' ate as ' + mare.proximaHora + ' (~' + Number(mare.proximaAltura).toFixed(1) + 'm)'
          : 'Mare indisponivel';
        setSurfData({
          temp: clima.temperatura?.ar ?? 27,
          condition: clima.temperatura?.condicao ?? 'Ensolarado',
          rawWaveHeight: clima.ondas?.altura ?? 1.2,
          wave_height: Number(clima.ondas?.altura ?? 1.2).toFixed(1) + 'm',
          period: (clima.ondas?.periodo ?? 10) + 's',
          swell_dir: clima.ondas?.direcao ?? 'N/A',
          swell_deg: clima.ondas?.direcaoGraus ?? 135,
          energy: (clima.ondas?.energiaKJ ?? 0) + ' kJ',
          wind_speed: (clima.vento?.velocidadeKt ?? 8) + ' kt',
          wind_dir: clima.vento?.direcao ?? 'N/A',
          wind_deg: clima.vento?.direcaoGraus ?? 45,
          tide: tideTxt,
          tidePercent: mare?.percentual ?? 50,
          moonPhaseName: clima.lua?.fase ?? 'Nova',
        });
      } catch (err) {
        console.error('[WeatherCard] Falha ao carregar:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    carregar();
    return () => { mounted = false; };
  }, []);

  const waveColor = surfData.rawWaveHeight > 1.5
    ? 'text-rose-400' : surfData.rawWaveHeight > 0.7 ? 'text-amber-400' : 'text-emerald-400';

  const isRising = surfData.tide.includes('Enchendo');
  let dynamicBgImage = '';
  if (surfData.tidePercent > 65) {
    dynamicBgImage = "'/animate_this_image_making_the enchendo (2).jpg'";
  } else if (surfData.tidePercent < 35) {
    dynamicBgImage = "'/secando.jpg'";
  } else {
    dynamicBgImage = isRising
      ? "'/animate_this_image_making_the (2)meiamare.jpg'"
      : "'/animate_this_image_making_the2meiamaresecando.jpg.jpg'";
  }

  return (
    <Link to="/map" className="block text-left font-sans group select-none active:scale-[0.99] transition-all">
      <div className="relative overflow-hidden border border-sky-900/10 rounded-xl p-2.5 shadow-sm hover:shadow-md transition-shadow">
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              backgroundImage: 'url(' + dynamicBgImage + ')',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'bottom center',
            }}
          />
          <div className="absolute inset-0 bg-slate-900/15" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2 bg-white/85 backdrop-blur-md rounded-lg p-1.5 shadow-sm border border-white/50">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Surf - Itacare</p>
              {loading && <Loader2 className="w-3 h-3 animate-spin text-sky-500 ml-1" />}
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
              <div className="flex items-center gap-1 border-r border-slate-300 pr-2">
                <MoonPhaseIcon phase={surfData.moonPhaseName} />
                <span className="uppercase tracking-wider">{surfData.moonPhaseName}</span>
              </div>
              <span>{surfData.condition}</span>
              <span className="flex items-center gap-0.5 text-slate-900">
                <Sun className="w-3.5 h-3.5 text-amber-500" /> {surfData.temp}C
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-1.5 flex flex-col items-center justify-center text-center text-white shadow-sm border border-white/10">
              <SwellIcon className="w-4 h-4 text-sky-400 mb-0.5" />
              <span className={'text-xs font-black ' + waveColor}>{surfData.wave_height}</span>
              <p className="text-[8px] font-bold text-gray-300 flex items-center gap-0.5 mt-0.5">
                {surfData.swell_dir}
                <Navigation className="w-2 h-2 fill-sky-400 text-sky-400" style={{ transform: 'rotate(' + ((surfData.swell_deg - 45 + 180) % 360) + 'deg)' }} />
              </p>
            </div>
            <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-1.5 flex flex-col items-center justify-center text-center text-white shadow-sm border border-white/10">
              <Timer className="w-3.5 h-3.5 text-indigo-400 mb-1" />
              <p className="text-xs font-black">{surfData.period}</p>
              <p className="text-[8px] font-bold text-gray-300 mt-0.5">PERIODO</p>
            </div>
            <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-1.5 flex flex-col items-center justify-center text-center text-white shadow-sm border border-white/10">
              <Zap className="w-3.5 h-3.5 text-amber-400 mb-1" />
              <p className="text-xs font-black">{surfData.energy}</p>
              <p className="text-[8px] font-bold text-gray-300 mt-0.5">ENERGIA</p>
            </div>
            <div className="bg-slate-900/80 backdrop-blur-md rounded-xl p-1.5 flex flex-col items-center justify-center text-center text-white shadow-sm border border-white/10">
              <Wind className="w-3.5 h-3.5 text-emerald-400 mb-1" />
              <p className="text-xs font-black">{surfData.wind_speed}</p>
              <p className="text-[8px] font-bold text-emerald-400 flex items-center gap-0.5 mt-0.5">
                <Navigation className="w-2 h-2 fill-emerald-400" style={{ transform: 'rotate(' + ((surfData.wind_deg - 45 + 180) % 360) + 'deg)' }} />
                {surfData.wind_dir}
              </p>
            </div>
          </div>
          <div className="mt-1.5 bg-white/85 backdrop-blur-md border border-white/50 rounded-lg px-2 py-1.5 flex items-center justify-between text-[10px] font-bold text-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5">
              {surfData.tide.includes('Enchendo') ? (
                <ChevronUp className="w-4 h-4 text-sky-500 stroke-[3]" />
              ) : surfData.tide.includes('Secando') ? (
                <ChevronDown className="w-4 h-4 text-amber-600 stroke-[3]" />
              ) : (
                <span className="text-sky-500 text-sm">~</span>
              )}
              <span className="tracking-tight">{surfData.tide}</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-sky-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        </div>
      </div>
    </Link>
  );
}
