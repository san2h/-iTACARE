import { supabase } from './supabaseConfig';

/**
 * Debita iTAcoins no servidor (atomico, nunca deixa o saldo negativo).
 * Ganhos nao passam por aqui: vem junto com awardXP() (campo `coins`).
 * Nunca lanca erro.
 * @param {number} amount  valor inteiro > 0
 * @param {'spend'|'burn'} type
 * @param {string} description texto do historico
 * @returns {Promise<{ok: boolean, balance?: number, reason?: string}>}
 */
export async function spendItacoins(amount, type = 'spend', description = null) {
  try {
    const { data, error } = await supabase.rpc('spend_itacoins', {
      p_amount: Math.round(Number(amount)),
      p_type: type,
      p_description: description,
    });
    if (error) return { ok: false, reason: error.message };
    return data || { ok: false, reason: 'empty_response' };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}
