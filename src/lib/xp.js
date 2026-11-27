// src/lib/xp.js
// Única forma de dar XP no app. O valor e as regras vêm do servidor (tabela xp_rules).
import { supabase } from './supabaseConfig';

/**
 * Pede ao servidor para creditar XP.
 * @param {string} action       ex.: 'CREATE_FEED_POST'
 * @param {string|number|null} referenceId  id do registro que comprova a ação
 * @returns {Promise<{awarded: boolean, amount?: number, total_xp?: number, reason?: string}>}
 */
export async function awardXP(action, referenceId = null) {
  try {
    const { data, error } = await supabase.rpc('award_xp', {
      p_action: action,
      p_reference: referenceId != null ? String(referenceId) : null,
    });
    if (error) {
      console.warn(`[xp] ${action}:`, error.message);
      return { awarded: false, reason: 'rpc_error' };
    }
    return data || { awarded: false, reason: 'empty' };
  } catch (err) {
    console.warn(`[xp] ${action}:`, err);
    return { awarded: false, reason: 'exception' };
  }
}
