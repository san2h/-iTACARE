import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { awardScore } from '../lib/supabaseApi';
import { supabase } from '../lib/supabaseConfig';
import { ArrowLeft, Clock, Coins, Trophy, CheckCircle, XCircle, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LEVELS = {
  turista: { name: 'Turista', time: 10, count: 10, color: 'from-blue-500 to-indigo-600', icon: '�️' },
  morador: { name: 'Morador', time: 5, count: 15, color: 'from-emerald-500 to-teal-600', icon: '�' },
  local: { name: 'Local', time: 3, count: 20, color: 'from-amber-500 to-orange-600', icon: '�' },
};

const QUESTIONS = {
  turista: [
    { q: 'Qual é a praia mais famosa de Itacaré?', opts: ['Praia da Tiririca', 'Praia de Copacabana', 'Praia do Forte', 'Praia de Ipanema', 'Praia de Porto Seguro'], a: 0 },
    { q: 'Em qual estado brasileiro fica Itacaré?', opts: ['São Paulo', 'Rio de Janeiro', 'Bahia', 'Ceará', 'Pernambuco'], a: 2 },
    { q: 'Itacaré é conhecida por qual esporte aquático?', opts: ['Vela', 'Surf', 'Polo Aquático', 'Nado Sincronizado', 'Jet Ski'], a: 1 },
    { q: 'Qual bioma predomina na região de Itacaré?', opts: ['Cerrado', 'Caatinga', 'Mata Atlântica', 'Amazônia', 'Pantanal'], a: 2 },
    { q: 'Itacaré fica no litoral...', opts: ['Norte da Bahia', 'Sul da Bahia', 'Centro da Bahia', 'Oeste da Bahia', 'Recôncavo Baiano'], a: 1 },
    { q: 'Qual é uma trilha famosa em Itacaré?', opts: ['Trilha Inca', 'Trilha das Quatro Praias', 'Trilha de Machu Picchu', 'Trilha Bonita', 'Trilha do Sol'], a: 1 },
    { q: 'Que tipo de cacau é cultivado na região?', opts: ['Cacau Fino', 'Cacau Amazônico', 'Cacau Cabruca', 'Cacau do Cerrado', 'Cacau Imperial'], a: 2 },
    { q: 'Qual rio passa por Itacaré?', opts: ['Rio São Francisco', 'Rio de Contas', 'Rio Jequitinhonha', 'Rio Doce', 'Rio Paraguaçu'], a: 1 },
    { q: 'Itacaré pertence a qual microrregião?', opts: ['Costa do Cacau', 'Costa do Sauípe', 'Costa do Dendê', 'Costa dos Coqueiros', 'Costa Dourada'], a: 0 },
    { q: 'Qual comida típica é famosa na região?', opts: ['Acarajé', 'Pão de queijo', 'Churrasco', 'Açaí', 'Cuscuz paulista'], a: 0 },
  ],
  morador: [
    { q: 'Qual cachoeira fica próxima a Itacaré?', opts: ['Cachoeira do Tijuípe', 'Cachoeira do Iguaçu', 'Cachoeira da Fumaça', 'Cachoeira do Tabuleiro', 'Cachoeira Paulo Afonso'], a: 0 },
    { q: 'Ponta do Xaréu fica em qual praia?', opts: ['Tiririca', 'Concha', 'Engenhoca', 'Resende', 'Jeribucaçu'], a: 1 },
    { q: 'Qual é a praia mais tranquila de Itacaré?', opts: ['Tiririca', 'Prainha', 'Praia da Concha', 'Engenhoca', 'São José'], a: 2 },
    { q: 'O que significa "Itacaré" em Tupi?', opts: ['Pedra do Mar', 'Pedra Bonita', 'Rio Grande', 'Terra Sagrada', 'Monte Verde'], a: 0 },
    { q: 'Qual é a população aproximada de Itacaré?', opts: ['10 mil', '15 mil', '28 mil', '50 mil', '100 mil'], a: 2 },
    { q: 'Em que ano Itacaré foi fundada?', opts: ['1532', '1718', '1931', '1856', '1610'], a: 1 },
    { q: 'Qual animal marinho é comum na costa?', opts: ['Baleia Jubarte', 'Orca', 'Golfinho Rosa', 'Tubarão Branco', 'Morsa'], a: 0 },
    { q: 'Qual praia é melhor para surf avançado?', opts: ['Concha', 'Tiririca', 'Resende', 'Itacarezinho', 'São José'], a: 1 },
    { q: 'Qual produto é o principal cultivo da região?', opts: ['Café', 'Soja', 'Cacau', 'Cana', 'Algodão'], a: 2 },
    { q: 'O mangue de Itacaré é importante por quê?', opts: ['Turismo', 'Biodiversidade', 'Pesca industrial', 'Energia solar', 'Mineração'], a: 1 },
    { q: 'Qual tipo de embarcação é tradicional?', opts: ['Canoa', 'Iate', 'Jet ski', 'Lancha', 'Navio'], a: 0 },
    { q: 'Qual é a principal festa popular?', opts: ['Carnaval', 'São João', 'Réveillon', 'Festa do Cacau', 'Festa Junina'], a: 1 },
    { q: 'Itacaré está a quantos km de Ilhéus?', opts: ['30km', '65km', '120km', '200km', '15km'], a: 1 },
    { q: 'Qual estrada conecta Itacaré a Ilhéus?', opts: ['BR-101', 'BA-001', 'BR-116', 'BA-262', 'BR-324'], a: 1 },
    { q: 'O que é a "Estrada Parque"?', opts: ['Rodovia ecológica BA-001', 'Parque municipal', 'Trilha urbana', 'Ciclovia', 'Estrada de ferro'], a: 0 },
  ],
  local: [
    { q: 'Qual praia exige travessia de rio?', opts: ['Jeribucaçu', 'Tiririca', 'Concha', 'Resende', 'Costa'], a: 0 },
    { q: 'Quantas praias tem a Trilha das 4 Praias?', opts: ['3', '4', '5', '6', '2'], a: 1 },
    { q: 'Qual restaurante é famoso pelo prato de moqueca?', opts: ['Restaurante do Porto', 'Dedo de Moça', 'Mar e Mel', 'Boca de Forno', 'Casa Sapucaia'], a: 2 },
    { q: 'A Prainha é acessível por...', opts: ['Barco apenas', 'Trilha curta', 'Carro 4x4', 'Helicóptero', 'Teleférico'], a: 1 },
    { q: 'Qual ONG atua na preservação em Itacaré?', opts: ['Instituto Floresta Viva', 'WWF', 'Greenpeace', 'SOS Mata', 'Instituto Terra'], a: 0 },
    { q: 'O cacau cabruca é cultivado sob...', opts: ['Sol pleno', 'Sombra da mata', 'Estufas', 'Irrigação', 'Hidroponia'], a: 1 },
    { q: 'Qual é a maré ideal para surf na Tiririca?', opts: ['Maré baixa enchendo', 'Maré alta', 'Maré seca', 'Qualquer maré', 'Maré de sizígia'], a: 0 },
    { q: 'A Praia do Resende é conhecida por...', opts: ['Ondas tubulares', 'Águas calmas', 'Piscinas naturais', 'Corais', 'Falésias'], a: 2 },
    { q: 'Qual é o prato típico "dendê"?', opts: ['Moqueca de peixe', 'Feijoada', 'Acarajé', 'Vatapá', 'Todas acima'], a: 0 },
    { q: 'Quantas cachoeiras existem na região?', opts: ['Mais de 20', '5', '10', '3', '50'], a: 0 },
  ],
};

export default function QuizItacare() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [level, setLevel] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const timerRef = useRef(null);

  const questions = level ? QUESTIONS[level] : [];
  const config = level ? LEVELS[level] : null;
  const currentQ = questions[qIndex];

  useEffect(() => {
    if (!level || gameOver || showResult) return;
    setTimeLeft(config.time);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAnswer(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [qIndex, level, gameOver, showResult]);

  const handleAnswer = (idx) => {
    if (showResult) return;
    clearInterval(timerRef.current);
    setSelected(idx);
    setShowResult(true);

    const isCorrect = idx === currentQ.a;
    if (isCorrect) {
      const bonus = streak > 0 ? 5 : 0;
      const timeBonus = timeLeft * 2;
      setScore(prev => prev + 10 + bonus + timeBonus);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }

    setTimeout(() => {
      if (qIndex + 1 >= questions.length) {
        setGameOver(true);
        saveScore();
      } else {
        setQIndex(prev => prev + 1);
        setSelected(null);
        setShowResult(false);
      }
    }, 1500);
  };

  const saveScore = async () => {
    if (!user?.id) return;
    const coins = Math.floor(score / 100);
    if (coins > 0) {
      await awardScore(user.id, coins);
      await supabase.from('transactions').insert({
        user_id: user.id,
        amount: coins,
        type: 'earned',
        source: 'game',
        description: `Quiz Itacaré - Nível \${level}`
      });
    }
  };

  const resetGame = () => {
    setLevel(null);
    setQIndex(0);
    setScore(0);
    setStreak(0);
    setSelected(null);
    setShowResult(false);
    setGameOver(false);
  };

  if (!level) {
    return (
      <div className="p-5 pb-24 space-y-6">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/games')} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-xl font-black text-gray-800">Quiz Cidadão</h1>
        </div>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider px-1">Selecione o seu nível de conhecimento:</p>
        <div className="space-y-3">
          {Object.entries(LEVELS).map(([key, val]) => (
            <div key={key} className="p-5 bg-white border border-gray-100 rounded-3xl shadow-sm cursor-pointer hover:shadow-md active:scale-[0.99] transition-all flex items-center justify-between" onClick={() => setLevel(key)}>
              <div>
                <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br \${val.color} flex items-center justify-center mb-3 text-lg text-white shadow-sm`}>
                  {val.icon}
                </div>
                <h3 className="text-sm font-black text-gray-800">{val.name}</h3>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">{val.count} perguntas · {val.time}s por resposta</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (gameOver) {
    const coins = Math.floor(score / 100);
    return (
      <div className="p-5 pb-24 flex flex-col items-center justify-center min-h-[70vh]">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-5 max-w-xs w-full">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100 shadow-sm">
            <Trophy className="w-8 h-8 text-amber-500 fill-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-800">Partida Concluída!</h2>
            <p className="text-3xl font-black text-gray-900 mt-2">{score} <span className="text-xs text-gray-400 font-bold uppercase">pts</span></p>
          </div>
          {coins > 0 && (
            <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 py-2.5 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-black">
              <Coins className="w-4 h-4 fill-emerald-500" /> +{coins} iTaCoins Conquistados!
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={resetGame} className="flex-1 bg-gray-900 hover:bg-black text-white text-xs font-black py-3.5 rounded-xl shadow-md transition-all active:scale-95">
              Jogar Novamente
            </button>
            <button onClick={() => navigate('/games')} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-black py-3.5 rounded-xl transition-all active:scale-95">
              Sair
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-5 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={resetGame} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <div className="flex items-center gap-2">
          {streak > 1 && (
            <span className="flex items-center gap-0.5 bg-orange-50 text-orange-600 text-[10px] font-black px-2.5 py-1 rounded-lg border border-orange-100 animate-pulse">
              <Flame className="w-3 h-3 fill-orange-500" /> {streak}x Combo
            </span>
          )}
          <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2.5 py-1 rounded-lg">
            {qIndex + 1}/{questions.length}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-bold text-gray-500 px-1">
        <div className="flex items-center gap-1">
          <Clock className={`w-3.5 h-3.5 \${timeLeft <= 3 ? 'text-red-500 animate-bounce' : 'text-gray-400'}`} />
          <span className={timeLeft <= 3 ? 'text-red-500' : ''}>{timeLeft}s restantes</span>
        </div>
        <span>{score} pts</span>
      </div>
      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 \${timeLeft <= 3 ? 'bg-red-500' : 'bg-emerald-500'}`} 
          style={{ width: `\${(timeLeft / config.time) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={qIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
          <div className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm">
            <h2 className="text-sm font-black text-gray-800 leading-relaxed">{currentQ.q}</h2>
          </div>

          <div className="space-y-2">
            {currentQ.opts.map((opt, i) => {
              let buttonStyle = 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50';
              if (showResult) {
                if (i === currentQ.a) buttonStyle = 'bg-emerald-50 border-emerald-500 text-emerald-700 font-extrabold';
                else if (i === selected && i !== currentQ.a) buttonStyle = 'bg-red-50 border-red-500 text-red-700';
              } else if (selected === i) {
                buttonStyle = 'bg-gray-50 border-gray-400';
              }

              return (
                <button
                  key={i}
                  disabled={showResult}
                  onClick={() => handleAnswer(i)}
                  className={`w-full p-4 border rounded-2xl text-left text-xs font-bold transition-all flex items-center justify-between active:scale-[0.99] \${buttonStyle}`}
                >
                  <span>{opt}</span>
                  {showResult && i === currentQ.a && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                  {showResult && i === selected && i !== currentQ.a && <XCircle className="w-4 h-4 text-red-500" />}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
