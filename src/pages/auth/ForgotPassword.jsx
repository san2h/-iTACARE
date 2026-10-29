import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseConfig';
import { ArrowLeft, Mail, Loader2, KeyRound } from 'lucide-react';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessage('Link de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (err) {
      setError(err.message || 'Erro ao enviar e-mail de recuperação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center p-6">
      <div className="max-w-sm w-full mx-auto space-y-6">
        <button type="button" onClick={() => navigate('/login')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o Login
        </button>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100 shadow-sm">
            <KeyRound className="w-5 h-5 text-emerald-500" />
          </div>
          <h1 className="text-xl font-black text-gray-800">Recuperar Senha</h1>
          <p className="text-xs text-gray-400 max-w-[240px] mx-auto">Insira seu e-mail para receber o link de redefinição.</p>
        </div>

        <form onSubmit={handleReset} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-[11px] font-bold border border-red-100">{error}</div>}
          {message && <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-bold border border-emerald-100">{message}</div>}

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-1">E-mail</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full bg-gray-50 border border-gray-200/60 rounded-xl pl-10 pr-4 py-3 text-xs font-medium focus:outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gray-900 hover:bg-black text-white text-xs font-black py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
