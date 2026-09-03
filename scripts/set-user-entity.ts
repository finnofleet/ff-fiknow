/**
 * Admin/Ops-CLI, um die Land-/BU-Zugehörigkeit (`profiles.land`/`profiles.bu`)
 * eines Users zu setzen (ADR 0007 §3/§7, Phase P2a — „app-befüllbar
 * (Admin/Import)"). Rein additiv: berührt keine anderen Felder, keine RLS.
 *
 * Idempotent: ein erneuter Aufruf mit denselben Werten überschreibt einfach
 * wieder dieselben Werte — kein Sonderfall nötig.
 *
 * ACHTUNG Source-of-Truth-Vorrang bei aktivem OIDC-Claim-Gate
 * (lib/auth/provider/oidc/claim-gate.ts): ein hier gesetzter `land`-Wert ist
 * bereits heute nur ein Zwischenstand — beim nächsten Login überschreibt der
 * `country`-Claim ihn, sobald der Claim einen auflösbaren Wert liefert. Für
 * `bu` gilt dasselbe, sobald `OIDC_ENTITY_CLAIM` konfiguriert ist: dann wird
 * der IdP zur Source of Truth für `bu`, und ein hier gesetzter Wert
 * überlebt nur so lange, wie der konfigurierte Claim fehlt oder unauflösbar
 * (`unmapped`) bleibt. Dieses Skript bleibt trotzdem nützlich — für Personen
 * ohne (auswertbaren) Claim, für Tests und als Übergangs-Fix, bis ein
 * IdP-seitiges Mapping nachgezogen ist.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/set-user-entity.ts <userId> --land <LAND> --bu <BU>
 *   DATABASE_URL='postgres://…' npx tsx scripts/set-user-entity.ts <userId> --land <LAND>
 *   DATABASE_URL='postgres://…' npx tsx scripts/set-user-entity.ts <userId> --bu <BU>
 *
 * Mindestens eine der beiden Optionen ist erforderlich.
 */
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db/client";
import { redactError } from "@/lib/log-redact";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  console.error(
    "\nUsage: DATABASE_URL='…' npx tsx scripts/set-user-entity.ts <userId> [--land <LAND>] [--bu <BU>]",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): {
  userId: string;
  land: string | undefined;
  bu: string | undefined;
} {
  const args = [...argv];
  const userId = args.find((a) => !a.startsWith("--"));
  if (!userId) fail("Kein userId angegeben.");
  if (!UUID_RE.test(userId)) fail(`userId ist keine gültige UUID: ${userId}`);

  let land: string | undefined;
  let bu: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--land") {
      land = args[i + 1];
      if (!land || land.startsWith("--")) fail("--land benötigt einen Wert.");
    }
    if (args[i] === "--bu") {
      bu = args[i + 1];
      if (!bu || bu.startsWith("--")) fail("--bu benötigt einen Wert.");
    }
  }

  if (!land && !bu) {
    fail("Mindestens eine Option ist erforderlich: --land <LAND> oder --bu <BU>.");
  }

  return { userId, land, bu };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
  }

  const { userId, land, bu } = parseArgs(process.argv.slice(2));

  const [before] = await db
    .select({ land: schema.profiles.land, bu: schema.profiles.bu })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);

  if (!before) fail(`Kein Profil für userId ${userId} gefunden.`);

  console.log(`\n=== Land/BU setzen für User ${userId} ===`);
  console.log("Vorher:");
  console.log(`  land: ${before.land ?? "null"}`);
  console.log(`  bu:   ${before.bu ?? "null"}`);

  const patch: { land?: string; bu?: string } = {};
  if (land !== undefined) patch.land = land;
  if (bu !== undefined) patch.bu = bu;

  const [after] = await db
    .update(schema.profiles)
    .set(patch)
    .where(eq(schema.profiles.userId, userId))
    .returning({ land: schema.profiles.land, bu: schema.profiles.bu });

  console.log("Nachher:");
  console.log(`  land: ${after?.land ?? "null"}`);
  console.log(`  bu:   ${after?.bu ?? "null"}`);
  console.log("✓ Aktualisiert.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Setzen fehlgeschlagen:", redactError(err));
  process.exit(1);
});
