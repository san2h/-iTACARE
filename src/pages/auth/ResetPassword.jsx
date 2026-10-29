import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseConfig';
import { Lock, Loader2, ShieldCheck } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'Erro ao redefinir senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center p-6">
      <div className="max-w-sm w-full mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100 shadow-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
          </div>
          <h1 className="text-xl font-black text-gray-800">Nova Senha</h1>
          <p className="text-xs text-gray-400">Escolha uma nova senha de acesso forte.</p>
        </div>

        <form onSubmit={handleUpdate} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-[11px] font-bold border border-red-100">{error}</div>}
          {success && <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-[11px] font-bold border border-emerald-100">Senha alterada! Redirecionando...</div>}

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-1">Nova Senha</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input 
                type="password" 
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-gray-50 border border-gray-200/60 rounded-xl pl-10 pr-4 py-3 text-xs font-medium focus:outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || success}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Atualizar Senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
