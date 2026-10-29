// src/lib/guiaIARoutes.js

export const ROTAS_PERMITIDAS = {
  '/events':      'Ver agenda de eventos',
  '/rentals':     'Ver imóveis para alugar',
  '/promotions':  'Ver promoções ativas',
  '/rides':       'Ver caronas disponíveis',
  '/delivery':    'Pedir delivery',
  '/explore':     'Abrir mapa de Itacaré',
  '/profile':     'Ir para o perfil',
  '/premium':     'Ver sessão Premium',
  '/clubs':       'Ver clubes de vantagem',
  '/tickets':     'Comprar ingressos',
  '/ranking':     'Ver ranking de pontos',
  '/marketplace': 'Ver marketplace',
  '/jobs':        'Ver vagas de emprego',
  '/lora-chat':   'Abrir o Lora Chat',
};

export function getRotasParaPrompt() {
  let txt = '\n\n# FERRAMENTAS DE NAVEGAÇÃO DO APP\n';
  txt += 'Você pode sugerir telas e funcionalidades usando estes formatos:\n\n';

  txt += '1. Abrir uma tela do app (formato [PREVIEW:/rota|Texto]):\n';
  Object.entries(ROTAS_PERMITIDAS).forEach(([rota, descricao]) => {
    txt += `   - ${rota} — ${descricao}\n`;
  });

  txt += '\n2. Abrir o MAPA com GPS e distância (formato [MAP:categoria|Texto]):\n';
  txt += '   Use quando o usuário perguntar por um TIPO de lugar específico,\n';
  txt += '   especialmente se disser "perto de mim", "próximo", "aqui perto".\n';
  txt += '   Categorias disponíveis:\n';
  txt += '   - Restaurantes\n';
  txt += '   - Pizzarias\n';
  txt += '   - Açaí\n';
  txt += '   - Praias\n';
  txt += '   - Café\n';
  txt += '   - Hospedagem\n';
  txt += '   - Cultura\n';
  txt += '   - Mercados\n';
  txt += '   - Postos\n';
  txt += '   - Polícia\n';
  txt += '   - Academia\n';
  txt += '   Exemplos:\n';
  txt += '   - "Onde comer perto de mim: [MAP:Restaurantes|Ver no mapa]"\n';
  txt += '   - "Tem pizzaria perto? [MAP:Pizzarias|Ver pizzarias]"\n\n';

  txt += 'REGRAS:\n';
  txt += '- Use no máximo 1 ou 2 desses marcadores por resposta.\n';
  txt += '- Nunca invente rotas ou categorias. Use apenas as listadas.\n';
  txt += '- Prefira [MAP:categoria] quando a pergunta envolver "perto de mim".\n';

  return txt;
}