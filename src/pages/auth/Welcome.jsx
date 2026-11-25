import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Crown, LogIn, Compass } from 'lucide-react';
import { supabase } from '../../lib/supabaseConfig';
import { useAuth } from '../../lib/AuthContext';
import { WELCOME_KEY } from '../../components/auth/ProtectedRoute';

export default function Welcome() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [vagas, setVagas] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('vagas_beta_restantes');
        if (!error && typeof data === 'number') setVagas(data);
      } catch { /* silencioso: o banner simplesmente não aparece */ }
    })();
  }, []);

  const marcarVisto = () => {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
  };

  const irPara = (rota) => { marcarVisto(); navigate(rota); };

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-b from-[#0A1428] via-[#0d1f4a] to-[#0A1428] text-center">
      <h1 className="text-4xl font-black text-white tracking-tight">+iTACARÉ</h1>
      <p className="text-cyan-200 mt-2 text-sm">Seu guia inteligente de Itacaré</p>

      <div className="mt-8 w-full max-w-sm bg-amber-400/10 border border-amber-400/40 rounded-3xl p-5">
        <div className="flex items-center justify-center gap-2 text-amber-300 font-black">
          <Crown className="w-5 h-5" /> FASE BETA
        </div>
        <p className="text-white text-sm mt-2">
          Os <b>primeiros 200 cadastros</b> ganham o plano <b>Premium</b>.
        </p>
        {vagas !== null && (
          <p className="text-amber-300 text-xs font-bold mt-2">
            {vagas > 0 ? `Restam ${vagas} vagas` : 'Vagas beta esgotadas'}
          </p>
        )}
      </div>

      <div className="w-full max-w-sm mt-6 space-y-3">
        <button
          onClick={() => irPara('/register')}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-[#0A1428] font-black"
        >
          <Crown className="w-5 h-5" /> Quero ser Premium (Beta)
        </button>
        <button
          onClick={() => irPara('/login')}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-900/60 border border-blue-700/50 text-white font-bold"
        >
          <LogIn className="w-5 h-5" /> Já tenho conta
        </button>
        <button
          onClick={() => irPara('/')}
          className="w-full flex items-center justify-center gap-2 py-3 text-cyan-300 font-semibold text-sm"
        >
          <Compass className="w-4 h-4" /> Continuar como visitante
        </button>
      </div>
    </div>
  );
}
