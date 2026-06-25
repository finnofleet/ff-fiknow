/**
 * Seedet EINEN echten Lernpfad über bestehende Kurs-Slugs — der Hand-Seed aus
 * Slice 1 (Lernpfade), um Datenmodell + Learner-Seite an echtem Content zu
 * beweisen, bevor die MCP-/Bundle-Authoring-Schiene gebaut wird.
 *
 * Idempotent: existiert der Pfad-Slug schon, wird er aktualisiert statt doppelt
 * angelegt. Referenzierte Kurs-Slugs müssen NICHT existieren — fehlt ein Kurs
 * (oder ist er nicht published), zeigt die Pfad-Seite ihn als „nicht verfügbar".
 *
 * Usage (Migrationen müssen vorher gelaufen sein, z. B. via Dev-Server-Boot):
 *   dotenv -e .env.local -- tsx scripts/seed-learning-path.ts
 *
 * Kurs-Slugs unten bei Bedarf an den echten Bestand anpassen.
 */
import { getPayload } from "payload";
import config from "@payload-config";

const PATH = {
  slug: "drohnen-einstieg",
  title: "Drohnen-Einstieg",
  subtitle: "Von der Theorie zur ersten Flugberechtigung.",
  description:
    "Ein geführter Einstieg rund um Drohnen — Grundlagen, Regeln und Vertiefung, " +
    "in sinnvoller Reihenfolge gebündelt.",
  fuehrungsgrad: "linear" as const,
  courses: [
    { courseSlug: "a2-drohne", role: "required" as const },
    { courseSlug: "testkurs", role: "recommended" as const },
  ],
};

const payload = await getPayload({ config });

const existing = await payload.find({
  collection: "learning-paths",
  where: { slug: { equals: PATH.slug } },
  limit: 1,
  overrideAccess: true,
});

if (existing.docs[0]) {
  await payload.update({
    collection: "learning-paths",
    id: existing.docs[0].id,
    data: PATH,
    overrideAccess: true,
  });
  console.log(`✓ Lernpfad "${PATH.slug}" aktualisiert.`);
} else {
  await payload.create({
    collection: "learning-paths",
    data: PATH,
    overrideAccess: true,
  });
  console.log(`✓ Lernpfad "${PATH.slug}" angelegt.`);
}

process.exit(0);
