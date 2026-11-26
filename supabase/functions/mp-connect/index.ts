// mp-connect: troca o "code" do OAuth do Mercado Pago pelos tokens do comerciante.
// Segurança: só o DONO do comércio (ou admin) logado pode conectar.
// Os tokens vão para a tabela privada merchant_secrets (nunca para merchants).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // 1. Quem está chamando?
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "Faça login para conectar o Mercado Pago." }, 401);

    const { code, state, redirect_uri } = await req.json();
    const merchantId = String(state ?? "").split("_")[1];
    if (!code || !merchantId) return json({ error: "Código ou ID do comércio ausente." }, 400);

    // 2. É dono do comércio ou admin?
    const { data: merchant } = await admin.from("merchants").select("id, owner_id").eq("id", merchantId).maybeSingle();
    if (!merchant) return json({ error: "Comércio não encontrado." }, 404);
    const { data: perfil } = await admin.from("profiles").select("user_type, role").eq("id", user.id).maybeSingle();
    const ehAdmin = perfil?.user_type === "admin" || perfil?.role === "admin";
    if (!ehAdmin && String(merchant.owner_id) !== user.id) {
      return json({ error: "Você não é o dono deste comércio." }, 403);
    }

    // 3. Troca o code pelos tokens. O redirect_uri PRECISA ser o mesmo usado no botão do app.
    const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("MP_CLIENT_ID") ?? "",
        client_secret: Deno.env.get("MP_CLIENT_SECRET") ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect_uri || "http://localhost:5173/admin",
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error) {
      return json({ error: `Mercado Pago: ${tokenData.message || tokenData.error || tokenResponse.status}` }, 400);
    }

    // 4. Tokens na tabela privada; em merchants só o que é público
    const { error: e1 } = await admin.from("merchant_secrets").upsert({
      merchant_id: merchantId,
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token,
      updated_at: new Date().toISOString(),
    });
    if (e1) throw e1;

    const { error: e2 } = await admin.from("merchants").update({
      mp_connected: true,
      mp_public_key: tokenData.public_key,
      mp_user_id: String(tokenData.user_id),
      mp_access_token: null,
      mp_refresh_token: null,
    }).eq("id", merchantId);
    if (e2) throw e2;

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err?.message ?? "Erro inesperado." }, 400);
  }
});
