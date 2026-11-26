import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseConfig';
import { PREMIUM_TYPES } from '../../lib/usePlan';
import { WELCOME_KEY } from '../../components/auth/ProtectedRoute';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, ArrowRight, ArrowLeft, Check, Truck, Tag, Coins, Heart,
  GraduationCap, Trophy, RefreshCw, LogIn, Compass, Loader2
} from 'lucide-react';

const PREMIUM_BENEFITS = [
  { icon: Crown, title: 'Menu +iTA Liberado', desc: 'Acesso total a todas as funções' },
  { icon: Tag, title: 'Descontos Premium', desc: 'Ofertas exclusivas na cidade' },
  { icon: Truck, title: 'Delivery & Serviços', desc: 'Acesso prioritário' },
  { icon: Coins, title: 'iTaCoins Extra', desc: 'Bônus e multiplicador de XP' }
];

const COMMUNITY_IMPACT = [
  { icon: Heart, title: 'Comércio local', desc: 'Apoie os pequenos negócios' },
  { icon: GraduationCap, title: 'Cultura', desc: 'Fortaleça projetos educacionais' },
  { icon: Trophy, title: 'Esporte', desc: 'Incentive ligas locais' },
  { icon: RefreshCw, title: 'Economia circular', desc: 'Movimente nossa cidade' }
];

const marcarWelcomeVisto = () => {
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
};

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Visitante: welcome → benefits → impact → /register
  // Logado (recém-cadastrado): tela final com o resultado do beta
  const [step, setStep] = useState(user ? 'done' : 'welcome');
  const [vagas, setVagas] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusPlano, setStatusPlano] = useState('carregando'); // carregando | premium | free

  // Vagas restantes do beta (só visitante)
  useEffect(() => {
    if (user) return;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('vagas_beta_restantes');
        if (!error && typeof data === 'number') setVagas(data);
      } catch { /* banner simplesmente não mostra o contador */ }
    })();
  }, [user]);

  // Recém-cadastrado: descobre se ganhou a vaga Premium (o gatilho roda na confirmação do e-mail)
  useEffect(() => {
    if (!user?.id) return;
    let ativo = true;
    (async () => {
      for (let i = 0; i < 4; i++) {
        const { data } = await supabase.from('profiles').select('user_type').eq('id', user.id).maybeSingle();
        if (!ativo) return;
        if (PREMIUM_TYPES.includes(data?.user_type)) { setStatusPlano('premium'); return; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (ativo) setStatusPlano('free');
    })();
    return () => { ativo = false; };
  }, [user?.id]);

  const irPara = (rota) => { marcarWelcomeVisto(); navigate(rota); };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { onboarded: true } });
      if (error) throw error;
      window.location.href = '/';
    } catch (err) {
      console.error(err);
      alert('Houve um problema ao finalizar o cadastro.');
      setSaving(false);
    }
  };

  const esgotado = vagas !== null && vagas <= 0;

  return (
    <div
      className="fixed inset-0 bg-[#050B14] text-white overflow-y-auto z-50 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('/backgroundOnboarding.png')` }}
    >
      <div className="min-h-full flex flex-col items-center justify-center px-5 py-8 relative z-10">
        <div className="w-full max-w-md bg-gray-900/40 p-8 rounded-3xl border border-white/10 backdrop-blur-[2px] shadow-2xl">
          <AnimatePresence mode="wait">

            {/* VISITANTE – BEM-VINDO + BETA */}
            {step === 'welcome' && (
              <motion.div key="welcome" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -50 }} className="text-center">
                <div className="w-24 h-24 mx-auto mb-6 flex items-center justify-center object-contain">
                  <img src="/buttonmainita.svg" alt="iTa Icon" className="w-full h-full" />
                </div>
                <h1 className="text-3xl font-black text-white mb-2 flex items-center justify-center gap-3">
                  Venha pra
                  <img src="/logo.png" alt="Logo +iTacaré" className="h-20 w-auto object-contain bg-transparent mix-blend-lighten" />
                </h1>
                <p className="text-sm text-blue-200 mb-5 px-4 leading-relaxed">
                  A plataforma que conecta comércio, comunidade e cultura da nossa cidade.
                </p>

                <div className="bg-amber-400/10 border border-amber-400/40 rounded-2xl p-4 mb-6">
                  <div className="flex items-center justify-center gap-2 text-amber-300 font-black text-sm">
                    <Crown className="w-4 h-4" /> FASE BETA
                  </div>
                  <p className="text-white text-xs mt-1.5">
                    Os <b>primeiros 200 cadastros</b> ganham o plano <b>Premium</b>.
                  </p>
                  {vagas !== null && (
                    <p className="text-amber-300 text-[11px] font-bold mt-1.5">
                      {esgotado ? 'Vagas beta esgotadas' : `Restam ${vagas} vagas`}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  {!esgotado && (
                    <button
                      onClick={() => setStep('benefits')}
                      className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 text-yellow-950 font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2"
                    >
                      <Crown className="w-4 h-4" /> Quero ser Premium (Beta)
                    </button>
                  )}
                  <button
                    onClick={() => irPara('/login')}
                    className="w-full bg-[#0A1428] border border-blue-900/50 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4" /> Já tenho conta
                  </button>
                  <button
                    onClick={() => irPara('/')}
                    className="w-full text-cyan-300 font-semibold text-sm py-2 flex items-center justify-center gap-2"
                  >
                    <Compass className="w-4 h-4" /> Continuar como visitante
                  </button>
                </div>
              </motion.div>
            )}

            {/* VISITANTE – BENEFÍCIOS */}
            {step === 'benefits' && (
              <motion.div key="benefits" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}>
                <h2 className="text-xl font-black text-white text-center mb-6">Seus Benefícios Premium</h2>
                <div className="space-y-3 mb-6">
                  {PREMIUM_BENEFITS.map((b, i) => (
                    <motion.div key={b.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="flex items-center gap-4 bg-[#0A1428] border border-blue-900/50 p-3 rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-blue-950 flex items-center justify-center shrink-0"><b.icon className="w-5 h-5 text-cyan-400" /></div>
                      <div className="flex-1">
                        <p className="text-xs font-black text-white">{b.title}</p>
                        <p className="text-[10px] text-blue-300">{b.desc}</p>
                      </div>
                      <Check className="w-4 h-4 text-emerald-400" />
                    </motion.div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-3 bg-[#0A1428] border border-blue-900/50 rounded-xl text-blue-300" onClick={() => setStep('welcome')}><ArrowLeft className="w-5 h-5" /></button>
                  <button className="flex-1 bg-cyan-500 text-[#050B14] font-black py-3.5 rounded-xl flex items-center justify-center gap-2" onClick={() => setStep('impact')}>
                    Continuar <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* VISITANTE – IMPACTO + CRIAR CONTA */}
            {step === 'impact' && (
              <motion.div key="impact" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="text-center">
                <Heart className="w-12 h-12 text-pink-500 mx-auto mb-4" />
                <h2 className="text-xl font-black text-white mb-6">Impacto Social Real</h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {COMMUNITY_IMPACT.map((item) => (
                    <div key={item.title} className="rounded-xl bg-[#0A1428] border border-blue-900/50 p-3">
                      <item.icon className="w-5 h-5 mx-auto mb-2 text-cyan-400" />
                      <p className="text-xs font-black text-white">{item.title}</p>
                      <p className="text-[9px] text-blue-300 mt-1">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-3 bg-[#0A1428] border border-blue-900/50 rounded-xl text-blue-300" onClick={() => setStep('benefits')}><ArrowLeft className="w-5 h-5" /></button>
                  <button className="flex-1 bg-gradient-to-r from-amber-400 to-yellow-500 text-yellow-950 font-black py-3.5 rounded-xl flex items-center justify-center gap-2" onClick={() => irPara('/register')}>
                    Criar minha conta Premium <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* RECÉM-CADASTRADO – RESULTADO DO BETA */}
            {step === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                {statusPlano === 'carregando' && (
                  <>
                    <Loader2 className="w-12 h-12 text-cyan-400 mx-auto mb-4 animate-spin" />
                    <h1 className="text-xl font-black text-white mb-2">Ativando seu acesso...</h1>
                  </>
                )}
                {statusPlano === 'premium' && (
                  <>
                    <Crown className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-black text-white mb-2">Você é Premium Beta!</h1>
                    <p className="text-sm text-blue-300 mb-8">Todas as funções do +iTACARÉ estão liberadas para você.</p>
                  </>
                )}
                {statusPlano === 'free' && (
                  <>
                    <Check className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-black text-white mb-2">Conta criada!</h1>
                    <p className="text-sm text-blue-300 mb-8">As vagas Premium do beta já foram preenchidas. Você pode explorar o app e assinar o Premium quando quiser.</p>
                  </>
                )}
                {statusPlano !== 'carregando' && (
                  <button
                    disabled={saving}
                    onClick={handleFinish}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-[#050B14] font-black py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {saving ? 'Preparando app...' : 'Entrar no App'} {!saving && <ArrowRight className="w-4 h-4" />}
                  </button>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
