/**
 * Ops-CLI, um einem User eine (bereits existierende) Rolle mit optionalem
 * Land-/BU-Scope zuzuweisen (ADR 0007 §3, Phase P3a — Pre-UI-Ops-Tool vor
 * der Matrix-UI). Schreibt/aktualisiert eine Zeile in `role_assignments`.
 *
 * `role_assignments` hat KEINEN Unique-Index auf (user_id, role_id) — daher
 * hier explizit select-then-update-or-insert. Existiert bereits eine (oder
 * mehrere) Zuweisung(en) für (userId, roleId), werden deren Scope-Felder
 * überschrieben statt eine weitere Zeile anzulegen.
 *
 * `--land`/`--bu` sind je eine COMMA-separierte Werteliste -> `text[]`.
 * Wird eine Option weggelassen, wird der jeweilige Scope auf `null` gesetzt
 * (= "alle", ADR 0007 §3). Beide weglassen ist erlaubt (group-level, sieht
 * alles).
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/set-role-assignment.ts <userId> --role <roleKey> [--land CH,DE] [--bu Payments]
 */
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  console.error(
    "\nUsage: DATABASE_URL='…' npx tsx scripts/set-role-assignment.ts <userId> --role <roleKey> [--land CH,DE] [--bu Payments]",
  );
  process.exit(1);
}

function splitList(csv: string): string[] {
  return csv
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]): {
  userId: string;
  role: string;
  land: string | undefined;
  bu: string | undefined;
} {
  const args = [...argv];
  const userId = args.find((a) => !a.startsWith("--"));
  if (!userId) fail("Kein userId angegeben.");
  if (!UUID_RE.test(userId)) fail(`userId ist keine gültige UUID: ${userId}`);

  let role: string | undefined;
  let land: string | undefined;
  let bu: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--role") {
      role = args[i + 1];
      if (!role || role.startsWith("--")) fail("--role benötigt einen Wert.");
    }
    if (args[i] === "--land") {
      land = args[i + 1];
      if (!land || land.startsWith("--")) fail("--land benötigt einen Wert.");
    }
    if (args[i] === "--bu") {
      bu = args[i + 1];
      if (!bu || bu.startsWith("--")) fail("--bu benötigt einen Wert.");
    }
  }

  if (!role) fail("Kein --role <roleKey> angegeben.");

  return { userId, role, land, bu };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL ist nicht gesetzt.");
    process.exit(1);
  }

  const { userId, role, land, bu } = parseArgs(process.argv.slice(2));

  const [profile] = await db
    .select({ userId: schema.profiles.userId })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);

  if (!profile) fail(`Kein Profil für userId ${userId} gefunden.`);

  const [roleRow] = await db
    .select({ id: schema.roles.id, key: schema.roles.key })
    .from(schema.roles)
    .where(eq(schema.roles.key, role))
    .limit(1);

  if (!roleRow) {
    fail(
      `Rolle mit key "${role}" existiert nicht. Erst "npx tsx scripts/seed-system-roles.ts" ` +
        "laufen lassen bzw. die Rolle anlegen.",
    );
  }

  const scopeLand = land === undefined ? null : splitList(land);
  const scopeBu = bu === undefined ? null : splitList(bu);

  const existing = await db
    .select({
      id: schema.roleAssignments.id,
      scopeLand: schema.roleAssignments.scopeLand,
      scopeBu: schema.roleAssignments.scopeBu,
    })
    .from(schema.roleAssignments)
    .where(
      and(
        eq(schema.roleAssignments.userId, userId),
        eq(schema.roleAssignments.roleId, roleRow.id),
      ),
    );

  console.log(`\n=== Rollen-Zuweisung setzen für User ${userId} ===`);
  console.log("Vorher:");
  if (existing.length === 0) {
    console.log("  (keine Zuweisung für diese Rolle)");
  } else {
    for (const row of existing) {
      console.log(
        `  role: ${roleRow.key}  land: ${JSON.stringify(row.scopeLand)}  bu: ${JSON.stringify(row.scopeBu)}`,
      );
    }
  }

  if (existing.length === 0) {
    const [after] = await db
      .insert(schema.roleAssignments)
      .values({
        userId,
        roleId: roleRow.id,
        scopeLand,
        scopeBu,
      })
      .returning({
        scopeLand: schema.roleAssignments.scopeLand,
        scopeBu: schema.roleAssignments.scopeBu,
      });

    console.log("Nachher:");
    console.log(
      `  role: ${roleRow.key}  land: ${JSON.stringify(after?.scopeLand ?? null)}  bu: ${JSON.stringify(after?.scopeBu ?? null)}`,
    );
    console.log("✓ Zuweisung angelegt.\n");
  } else {
    const updated = await db
      .update(schema.roleAssignments)
      .set({ scopeLand, scopeBu })
      .where(
        and(
          eq(schema.roleAssignments.userId, userId),
          eq(schema.roleAssignments.roleId, roleRow.id),
        ),
      )
      .returning({
        scopeLand: schema.roleAssignments.scopeLand,
        scopeBu: schema.roleAssignments.scopeBu,
      });

    console.log("Nachher:");
    console.log(
      `  role: ${roleRow.key}  land: ${JSON.stringify(scopeLand)}  bu: ${JSON.stringify(scopeBu)}`,
    );
    console.log(`✓ ${updated.length} Zuweisung(en) aktualisiert.\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Setzen fehlgeschlagen:", err);
  process.exit(1);
});
