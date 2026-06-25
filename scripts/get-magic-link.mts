/**
 * Holt einen Magic-Link via GoTrue Admin-API ohne Mail-Versand.
 *
 * Nutzt den SUPABASE_SERVICE_ROLE_KEY — nur lokal gedacht für Test/
 * Debug, wenn die GoTrue-Instanz noch keinen SMTP-Adapter konfiguriert
 * hat oder man den Mail-Inbox-Umweg sparen will.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/get-magic-link.mts <email> [type]
 *
 *   type: 'recovery' (default) | 'magiclink' | 'invite' | 'signup'
 *
 * Beispiel:
 *   dotenv -e .env.local -- tsx scripts/get-magic-link.mts \
 *     yblaettler@gmx.ch recovery
 */

const email = process.argv[2];
const type = process.argv[3] ?? "recovery";

if (!email) {
  console.error(
    "Usage: tsx scripts/get-magic-link.mts <email> [recovery|magiclink|invite|signup]",
  );
  process.exit(1);
}

const baseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) {
  console.error(
    "Brauche NEXT_PUBLIC_SUPABASE_URL (oder SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

// GoTrue's verify-Endpoint liefert die Session als Hash-Fragment
// (Implicit-Flow). Wir leiten auf eine Client-Page (/auth/recover),
// die den Hash auswertet und dann je nach Type auf /reset-password
// (recovery) oder /dashboard (magiclink) weiterredirected.
const localOrigin = "http://localhost:3000";
const redirectTo = `${localOrigin}/auth/recover`;

const res = await fetch(
  `${baseUrl.replace(/\/$/, "")}/auth/v1/admin/generate_link`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      type,
      email,
      options: { redirect_to: redirectTo },
    }),
  },
);

if (!res.ok) {
  console.error("Generate-Link failed:", res.status, await res.text());
  process.exit(1);
}

const data = (await res.json()) as {
  action_link?: string;
  hashed_token?: string;
  email_otp?: string;
};

// GoTrue's action_link verwendet die im Container konfigurierten
// API_EXTERNAL_URL + SITE_URL — beim aktuellen fiknow-test-Setup
// fälschlicherweise 127.0.0.1:54321 / 127.0.0.1:3000. Wir bauen den
// Link mit hashed_token selbst zusammen, gegen die echte externe URL
// und mit korrektem Frontend-redirect_to.
//
// Wenn die GoTrue-Konfig irgendwann gefixt ist (API_EXTERNAL_URL +
// GOTRUE_SITE_URL korrekt), kann man einfach data.action_link nutzen.
const correctedLink = data.hashed_token
  ? `${baseUrl.replace(/\/$/, "")}/auth/v1/verify?token=${
      data.hashed_token
    }&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`
  : data.action_link;

console.log("\n=== Magic-Link (lokal-tauglich) ===\n");
console.log(correctedLink);
console.log("\n--- Original-Link (falls Container-URLs korrekt wären) ---");
console.log(data.action_link);
console.log("\nFür lokalen Test den ersten Link im Browser öffnen.");
