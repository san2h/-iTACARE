import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseConfig';

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

function checkConfig() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase não configurado. Verifique src/lib/supabaseConfig.js');
  }
}

async function callRpc(name, params) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`RPC ${name} falhou`);
  return res.json();
}

async function fetchOne(table, userId, select) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${userId}&select=${select}&limit=1`, { headers });
  if (!res.ok) throw new Error(`Erro ao buscar ${table}`);
  const data = await res.json();
  return data[0] || null;
}

// === Wallet & Gamification ===
export async function getWallet(userId) {
  return fetchOne('wallets', userId, 'balance,locked_balance,total_earned,total_spent,total_donated');
}

export async function getUserWallet(userId) {
  return fetchOne('user_wallets', userId, 'balance,locked_balance,xp_score,total_earned,total_spent,total_donated');
}

export async function getSubscription(userId) {
  return fetchOne('user_subscriptions', userId, 'plan_type,expires_at');
}

export async function getGamification(userId) {
  return fetchOne('user_gamification', userId, 'total_score,daily_score_earned,chests_unlocked');
}

export async function awardScore(userId, points = 10) {
  return callRpc('add_community_score', { p_user_id: userId, p_points: points });
}

// === Posts (Feed Social) ===
export async function getPosts(limit = 20, offset = 0) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar posts');
  return res.json();
}

export async function toggleLike(postId, userId) {
  return callRpc('toggle_like', { p_post_id: postId, p_user_id: userId });
}

export async function checkLiked(postId, userId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/post_likes?post_id=eq.${postId}&user_id=eq.${userId}&select=id&limit=1`, { headers });
  if (!res.ok) throw new Error('Erro ao verificar like');
  const data = await res.json();
  return data.length > 0;
}

// === Comments ===
export async function getComments(postId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/post_comments?post_id=eq.${postId}&select=*&order=created_at.asc`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar comentários');
  return res.json();
}

export async function addComment(postId, userId, userName, content) {
  return callRpc('add_comment_and_count', { p_post_id: postId, p_user_id: userId, p_user_name: userName, p_content: content });
}

// === Merchants ===
export async function getMerchants() {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/merchants?select=*&order=created_at.desc`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar lojas');
  return res.json();
}

export async function getMerchant(id) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/merchants?id=eq.${id}&select=*&limit=1`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar loja');
  const data = await res.json();
  return data[0] || null;
}

export async function getMerchantByOwner(ownerId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/merchants?owner_id=eq.${ownerId}&select=*&limit=1`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar loja');
  const data = await res.json();
  return data[0] || null;
}

export async function createMerchant(data) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/merchants`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao criar loja');
  const result = await res.json();
  return result[0];
}

export async function updateMerchant(id, data) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/merchants?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar loja');
  const result = await res.json();
  return result[0];
}

// === Followers ===
export async function getFollowersCount(userId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/followers?following_id=eq.${userId}&select=id`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar seguidores');
  return (await res.json()).length;
}

export async function getFollowingCount(userId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/followers?follower_id=eq.${userId}&select=id`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar seguindo');
  return (await res.json()).length;
}

export async function toggleFollow(followerId, followingId) {
  return callRpc('toggle_follow', { p_follower_id: followerId, p_following_id: followingId });
}

export async function checkFollowing(followerId, followingId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/followers?follower_id=eq.${followerId}&following_id=eq.${followingId}&select=id&limit=1`, { headers });
  if (!res.ok) throw new Error('Erro ao verificar seguindo');
  return (await res.json()).length > 0;
}

// === Game Room Presence ===
export async function joinGameRoom(roomId, userId, userName) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_presence`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ room_id: roomId, user_id: userId, user_name: userName, last_heartbeat: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('Erro ao entrar na sala');
}

export async function leaveGameRoom(roomId, userId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_presence?room_id=eq.${roomId}&user_id=eq.${userId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Erro ao sair da sala');
}

export async function heartbeatRoom(roomId, userId) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_presence?room_id=eq.${roomId}&user_id=eq.${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ last_heartbeat: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('Erro no heartbeat');
}

export async function getRoomUsers(roomId) {
  checkConfig();
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_presence?room_id=eq.${roomId}&last_heartbeat=gte.${thirtySecondsAgo}&select=user_id,user_name&order=user_name.asc`, { headers });
  if (!res.ok) throw new Error('Erro ao buscar usuários na sala');
  return res.json();
}

// === Checkout (Edge Functions) ===
export async function createCheckout(data) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro no checkout');
  return res.json();
}

export async function createCheckoutTest(data) {
  checkConfig();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro no checkout de teste');
  return res.json();
}