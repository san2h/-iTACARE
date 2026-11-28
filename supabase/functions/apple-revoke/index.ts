// +iTACARÉ — revoga o acesso do app à conta Apple quando o usuário exclui a conta (App Store 5.1.1(v)).
// O app iOS manda o `authorizationCode` obtido ao reconfirmar com a Apple; aqui ele vira refresh_token e é revogado.
//
// Secrets (supabase secrets set ...):
//   APPLE_TEAM_ID      Team ID da conta Apple Developer
//   APPLE_KEY_ID       Key ID da chave com "Sign in with Apple" habilitado
//   APPLE_CLIENT_ID    Bundle ID do app iOS (com.itacare.app)
//   APPLE_PRIVATE_KEY  Conteúdo do arquivo .p8 (com as linhas BEGIN/END)
// verify_jwt = true: só usuário logado chama.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function clientSecret(teamId: string, keyId: string, clientId: string, pem: string): Promise<string> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: teamId, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: clientId,
  }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const teamId = Deno.env.get("APPLE_TEAM_ID");
    const keyId = Deno.env.get("APPLE_KEY_ID");
    const clientId = Deno.env.get("APPLE_CLIENT_ID");
    const pem = Deno.env.get("APPLE_PRIVATE_KEY");
    if (!teamId || !keyId || !clientId || !pem) return json({ error: "apple_not_configured" }, 501);

    const { authorizationCode } = await req.json();
    if (typeof authorizationCode !== "string" || authorizationCode.length < 10 || authorizationCode.length > 2000) {
      return json({ error: "invalid_code" }, 400);
    }

    const secret = await clientSecret(teamId, keyId, clientId, pem);

    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: secret, code: authorizationCode, grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return json({ error: "token_exchange_failed", status: tokenRes.status }, 502);
    const tokens = await tokenRes.json();
    const token = tokens.refresh_token ?? tokens.access_token;
    const hint = tokens.refresh_token ? "refresh_token" : "access_token";
    if (!token) return json({ error: "no_token" }, 502);

    const revokeRes = await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, token, token_type_hint: hint }),
    });
    if (!revokeRes.ok) return json({ error: "revoke_failed", status: revokeRes.status }, 502);
    return json({ ok: true });
  } catch (_e) {
    return json({ error: "internal" }, 500);
  }
});
