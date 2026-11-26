// mp-orders: gera PIX com split (comissão da plataforma) para o CLIENTE pagar o comerciante.
// Usado por PlaceDetail e MerchantView (action: 'create_pix').
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
// O front lê data.error, então os erros continuam saindo com status 200 (como antes).
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PLATFORM_FEE_PERCENTAGE = 0.08; // comissão 8%
const VALOR_MAXIMO = 50000;

async function tokenDoComerciante(admin: any, merchantId: string) {
  const { data: s } = await admin.from("merchant_secrets").select("mp_access_token").eq("merchant_id", merchantId).maybeSingle();
  if (s?.mp_access_token) return s.mp_access_token as string;
  const { data: m } = await admin.from("merchants").select("mp_access_token").eq("id", merchantId).maybeSingle();
  return (m?.mp_access_token as string) ?? null; // fallback temporário
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, merchant_id, amount, description } = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const totalAmount = Number(amount);
    if (!merchant_id) return json({ error: "Comércio não informado." });
    if (!Number.isFinite(totalAmount) || totalAmount <= 0 || totalAmount > VALOR_MAXIMO) {
      return json({ error: "Valor inválido." });
    }

    const { data: merchant } = await admin.from("merchants").select("id, name").eq("id", merchant_id).maybeSingle();
    const accessToken = merchant ? await tokenDoComerciante(admin, merchant.id) : null;
    if (!merchant || !accessToken) return json({ error: "Lojista não possui conta do Mercado Pago ativa." });

    if (action !== "create_pix") return json({ error: "Ação inválida." });

    const applicationFee = Number((totalAmount * PLATFORM_FEE_PERCENTAGE).toFixed(2));
    const paymentRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: totalAmount,
        description: String(description || `Consumo em ${merchant.name}`).slice(0, 200),
        payment_method_id: "pix",
        application_fee: applicationFee,
        payer: { email: "cliente@maisitacare.app", first_name: "Cliente", last_name: "iTACARÉ+" },
      }),
    });
    const payData = await paymentRes.json();
    if (!paymentRes.ok) return json({ error: payData.message || "Erro ao gerar PIX com Split no Mercado Pago." });

    return json({
      success: true,
      qr_data: payData.point_of_interaction?.transaction_data?.qr_code,
      fee_applied: applicationFee,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? "Erro inesperado." });
  }
});
