import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://rebisalatiga.github.io",
]);

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://rebisalatiga.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const json = (body: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });

function parseKeys(name: string): Record<string, string> {
  const raw = Deno.env.get(name);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origin tidak diizinkan." }, 403, origin);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json({ error: "Metode tidak diizinkan." }, 405, origin);
  }

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json({ error: "Sesi admin tidak ditemukan. Silakan masuk kembali." }, 401, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = parseKeys("SUPABASE_PUBLISHABLE_KEYS").default ||
    Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = parseKeys("SUPABASE_SECRET_KEYS").default ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !publishableKey || !secretKey) {
    console.error("Konfigurasi Supabase Edge Function belum lengkap.");
    return json({ error: "Layanan reset password belum dikonfigurasi." }, 500, origin);
  }

  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const caller = authData?.user;
  if (authError || !caller) {
    return json({ error: "Sesi tidak valid atau sudah kedaluwarsa. Silakan masuk kembali." }, 401, origin);
  }

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("account_status")
    .eq("id", caller.id)
    .maybeSingle();

  if (callerProfileError) {
    console.error("Gagal memeriksa profil pemanggil:", callerProfileError.message);
    return json({ error: "Tidak dapat memverifikasi hak akses admin." }, 500, origin);
  }

  if (callerProfile?.account_status !== "active") {
    return json({ error: "Akun admin tidak aktif." }, 403, origin);
  }

  const { data: adminMembership, error: membershipError } = await adminClient
    .from("memberships")
    .select("id")
    .eq("user_id", caller.id)
    .eq("role", "admin")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Gagal memeriksa role admin:", membershipError.message);
    return json({ error: "Tidak dapat memverifikasi hak akses admin." }, 500, origin);
  }

  if (!adminMembership) {
    return json({ error: "Hanya Admin Sistem yang dapat mereset password anggota." }, 403, origin);
  }

  let payload: { target_user_id?: string; new_password?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Format permintaan tidak valid." }, 400, origin);
  }

  const targetUserId = String(payload.target_user_id || "").trim();
  const newPassword = typeof payload.new_password === "string" ? payload.new_password : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return json({ error: "Pilih akun anggota yang valid." }, 400, origin);
  }

  if (targetUserId === caller.id) {
    return json({ error: "Fitur ini hanya untuk mereset password anggota lain, bukan akun admin sendiri." }, 400, origin);
  }

  if (newPassword.length < 8 || newPassword.length > 72) {
    return json({ error: "Password baru harus terdiri dari 8 sampai 72 karakter." }, 400, origin);
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, account_status")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError) {
    console.error("Gagal memeriksa akun tujuan:", targetError.message);
    return json({ error: "Tidak dapat memeriksa akun anggota." }, 500, origin);
  }

  if (!targetProfile || targetProfile.account_status !== "active") {
    return json({ error: "Akun tujuan tidak ditemukan atau belum aktif." }, 404, origin);
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { password: newPassword },
  );

  if (updateError) {
    console.error("Admin Auth gagal memperbarui password:", updateError.message);
    return json({ error: "Password anggota gagal diperbarui. Periksa ketentuan password lalu coba lagi." }, 400, origin);
  }

  return json({ ok: true, user_id: targetUserId }, 200, origin);
});
