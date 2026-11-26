import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, X } from 'lucide-react';

// Aviso de build nova do APK. Só roda no app Android (no site o PWA já se atualiza sozinho).
const VERSION_URL = 'https://jjdrudvqkfqbvayhyfrh.supabase.co/storage/v1/object/public/builds/version.json';
const DISPENSADO_KEY = 'itacare_update_dispensado';
const BUILD_ATUAL = typeof __APP_BUILD_ID__ !== 'undefined' ? Number(__APP_BUILD_ID__) : 0;

export default function UpdateNotice() {
  const [nova, setNova] = useState(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !BUILD_ATUAL) return;

    const verificar = async () => {
      try {
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const info = await res.json();
        if (!(Number(info?.buildId) > BUILD_ATUAL) || !info?.apkUrl) return;
        let dispensado = null;
        try { dispensado = localStorage.getItem(DISPENSADO_KEY); } catch { /* ignore */ }
        if (dispensado === String(info.buildId)) return;
        setNova(info);
      } catch { /* sem internet: tenta na próxima abertura */ }
    };

    verificar();
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  if (!nova) return null;

  const dispensar = () => {
    try { localStorage.setItem(DISPENSADO_KEY, String(nova.buildId)); } catch { /* ignore */ }
    setNova(null);
  };

  return (
    <div className="fixed left-3 right-3 bottom-24 z-[60] max-w-md mx-auto bg-[#0A1428] border border-cyan-400/40 rounded-2xl shadow-2xl p-4">
      <button onClick={dispensar} aria-label="Fechar" className="absolute top-2 right-2 p-1 text-blue-300">
        <X className="w-4 h-4" />
      </button>
      <p className="text-sm font-black text-white pr-6">Nova versão do +iTACARÉ disponível</p>
      {nova.notes && <p className="text-[11px] text-blue-200 mt-1">{nova.notes}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => { window.location.href = nova.apkUrl; }}
          className="flex-1 flex items-center justify-center gap-2 bg-cyan-500 text-[#050B14] font-black text-sm py-2.5 rounded-xl"
        >
          <Download className="w-4 h-4" /> Atualizar
        </button>
        <button onClick={dispensar} className="px-4 text-xs font-bold text-blue-300">Depois</button>
      </div>
    </div>
  );
}
