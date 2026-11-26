import React, { useEffect, useRef, useState } from 'react';

// O Google só mostra o cartão do local (nome, endereço, estrelas) quando o
// iframe tem ~500px ou mais de largura (480 falhou nos testes; 560 dá margem). A sheet no celular tem ~340px, então
// renderizamos o iframe nesta largura fixa e reduzimos com transform: scale.
const LARGURA_VIRTUAL = 560;

// Aceita tanto o src quanto o <iframe ...> inteiro copiado de
// Google Maps > Compartilhar > Incorporar um mapa.
export function extrairEmbedOficial(valor) {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  const src = texto.includes('<iframe') ? (texto.match(/src="([^"]+)"/) || [])[1] : texto;
  if (src && src.startsWith('https://www.google.com/maps/embed?')) return src.replace(/&amp;/g, '&');
  return null;
}

// Sem chave de API.
// 1) Link oficial de "Incorporar um mapa" (google_embed_url): mostra o cartão com as estrelas.
// 2) Fallback: embed clássico por busca (output=embed). Mostra só o mapa e o pino,
//    sem estrelas, e não é documentado oficialmente pelo Google.
export function urlEmbedGoogle(place, { zoom = 17 } = {}) {
  const oficial = extrairEmbedOficial(place.google_embed_url);
  if (oficial) return oficial;
  const q = `${place.name}, Itacaré - BA`;
  const ll = place.latitude && place.longitude ? `&ll=${place.latitude},${place.longitude}` : '';
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}${ll}&z=${zoom}&hl=pt-BR&output=embed`;
}

export default function GoogleMiniMap({ place, height = 220 }) {
  const containerRef = useRef(null);
  const [escala, setEscala] = useState(0.7);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([entry]) => {
      const largura = entry.contentRect.width;
      if (largura > 0) setEscala(Math.min(1, largura / LARGURA_VIRTUAL));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl overflow-hidden border border-blue-900/50 bg-blue-950"
      style={{ height }}
    >
      <iframe
        key={place.id}
        title={`Google Maps - ${place.name}`}
        src={urlEmbedGoogle(place)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute top-0 left-0 border-0 pointer-events-none"
        style={{
          width: LARGURA_VIRTUAL,
          height: height / escala,
          transform: `scale(${escala})`,
          transformOrigin: '0 0',
        }}
      />
    </div>
  );
}
