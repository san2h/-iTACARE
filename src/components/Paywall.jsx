import React from 'react';
import { Link } from 'react-router-dom';
import { Crown, Lock } from 'lucide-react';
import { usePlan } from '../lib/usePlan';

// Tela exibida no lugar de uma seção Premium.
export default function Paywall({ recurso = 'Esta seção' }) {
  const { isGuest } = usePlan();

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-20 pb-28 bg-[#0A1428]">
      <div className="w-full max-w-sm text-center bg-blue-950/60 border border-amber-400/30 rounded-3xl p-8 shadow-2xl">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-400/15 flex items-center justify-center">
          <Lock className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-xl font-black text-white">{recurso} é Premium</h2>
        <p className="text-sm text-cyan-100/80 mt-2">
          Na fase beta, os primeiros 200 cadastros ganham o plano Premium.
        </p>

        {isGuest ? (
          <>
            <Link
              to="/register"
              className="mt-6 flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-[#0A1428] font-black"
            >
              <Crown className="w-5 h-5" /> Quero ser Premium (Beta)
            </Link>
            <Link to="/login" className="block mt-3 text-sm font-semibold text-cyan-300">
              Já tenho conta
            </Link>
          </>
        ) : (
          <Link
            to="/upgrade"
            className="mt-6 flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-[#0A1428] font-black"
          >
            <Crown className="w-5 h-5" /> Ver planos Premium
          </Link>
        )}
        <Link to="/" className="block mt-4 text-xs text-blue-300/70">Voltar ao início</Link>
      </div>
    </div>
  );
}
