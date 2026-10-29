/**
 * Formata uma string de data do Supabase em tempo relativo amigável (Ex: "Há 5 min", "Ontem")
 * Substitui a necessidade da biblioteca externa date-fns
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Agora mesmo';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `Há ${diffInMinutes} min`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `Há ${diffInHours}h`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Ontem';
  if (diffInDays < 7) return `Há ${diffInDays} dias`;
  
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

/**
 * Formata números grandes de moedas ou pontos (Ex: 1500 vira "1.500")
 */
export function formatCoins(value) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}