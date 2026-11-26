// mp-pay:
//  - create_pix_checkout: PIX para o CLIENTE pagar (qualquer pessoa pode gerar)
//  - setup_pos / create_order_balcao: configuram o caixa do comércio -> só DONO ou ADMIN
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PLATFORM_FEE_PERCENTAGE = 0.03; // comissão 3% (mp-orders usa 8% — decidir qual vale)
const VALOR_MAXIMO = 50000;

async function tokenDoComerciante(admin: any, merchantId: string) {
  const { data: s } = await admin.from("merchant_secrets").select("mp_access_token").eq("merchant_id", merchantId).maybeSingle();
  if (s?.mp_access_token) return s.mp_access_token as string;
  const { data: m } = await admin.from("merchants").select("mp_access_token").eq("id", merchantId).maybeSingle();
  return (m?.mp_access_token as string) ?? null; // fallback temporário
}

async function ehDonoOuAdmin(admin: any, req: Request, ownerId: string | null) {
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return false;
  if (ownerId && String(ownerId) === user.id) return true;
  const { data: p } = await admin.from("profiles").select("user_type, role").eq("id", user.id).maybeSingle();
  return p?.user_type === "admin" || p?.role === "admin";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, merchant_id, amount, description, customer_email, customer_name } = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: merchant } = await admin
      .from("merchants")
      .select("id, name, address, owner_id, mp_external_pos_id")
      .eq("id", merchant_id)
      .maybeSingle();
    const accessToken = merchant ? await tokenDoComerciante(admin, merchant.id) : null;
    if (!merchant || !accessToken) return json({ error: "Lojista sem Mercado Pago conectado." }, 400);

    const valor = Number(amount);
    const valorOk = Number.isFinite(valor) && valor > 0 && valor <= VALOR_MAXIMO;

    // ---------------- BALCÃO FÍSICO (só dono/admin)
    if (action === "setup_pos" || action === "create_order_balcao") {
      if (!(await ehDonoOuAdmin(admin, req, merchant.owner_id))) {
        return json({ error: "Apenas o dono do comércio pode fazer isso." }, 403);
      }
    }

    if (action === "setup_pos") {
      const auth = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
      const userData = await (await fetch("https://api.mercadopago.com/users/me", { headers: auth })).json();

      const storeData = await (await fetch(`https://api.mercadopago.com/users/${userData.id}/stores`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: merchant.name || "Estabelecimento MaisiTA",
          location: { street_name: merchant.address || "Rua Principal", street_number: "1", city_name: "Itacare", state_name: "Bahia", latitude: 0, longitude: 0 },
        }),
      })).json();

      const externalPosId = `POS_${merchant.id.substring(0, 8).toUpperCase()}`;
      const posData = await (await fetch("https://api.mercadopago.com/pos", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ name: `Balcão ${merchant.name}`, fixed_amount: true, store_id: storeData.id, external_id: externalPosId }),
      })).json();

      const qrImageUrl = posData.qr?.image ||
        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(posData.qr?.template_document_path || externalPosId)}`;

      await admin.from("merchants").update({
        mp_user_id: String(userData.id),
        mp_store_id: String(storeData.id),
        mp_pos_id: String(posData.id),
        mp_external_pos_id: externalPosId,
        mp_pos_qr_url: qrImageUrl,
      }).eq("id", merchant.id);

      return json({ success: true, qr_code_image: qrImageUrl, external_pos_id: externalPosId });
    }

    if (action === "create_order_balcao") {
      if (!valorOk) return json({ error: "Valor inválido." }, 400);
      const orderData = await (await fetch("https://api.mercadopago.com/v1/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          type: "qr", external_reference: `PED_${Date.now()}`,
          description: String(description || "Consumo no Balcão").slice(0, 200), total_amount: valor,
          config: { qr: { external_pos_id: merchant.mp_external_pos_id, mode: "static" } },
          transactions: { payments: [{ amount: valor }] },
        }),
      })).json();
      return json({ success: true, order: orderData });
    }

    // ---------------- PIX NO CELULAR DO CLIENTE
    if (action === "create_pix_checkout") {
      if (!valorOk) return json({ error: "Valor inválido." }, 400);
      const fee = Math.round(valor * PLATFORM_FEE_PERCENTAGE * 100) / 100;

      const paymentRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: valor,
          description: String(description || `Pedido em ${merchant.name}`).slice(0, 200),
          payment_method_id: "pix",
          payer: { email: customer_email || "cliente@maisitacare.app", first_name: customer_name || "Cliente", last_name: "iTACARÉ+" },
          application_fee: fee,
        }),
      });
      const payData = await paymentRes.json();
      if (!paymentRes.ok) return json({ error: payData.message || "Erro ao gerar PIX para o cliente." }, 400);

      return json({
        success: true,
        payment_id: payData.id,
        status: payData.status,
        qr_code: payData.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: payData.point_of_interaction?.transaction_data?.qr_code_base64,
      });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (err: any) {
    return json({ error: err?.message ?? "Erro inesperado." }, 400);
  }
});
