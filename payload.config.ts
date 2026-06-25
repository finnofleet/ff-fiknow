import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";

import { sslConfigFromUrl, stripSslModeFromUrl } from "./lib/db/ssl-config";
import { Courses } from "./payload/collections/courses";
import { LearningPaths } from "./payload/collections/learning-paths";
import { Lessons } from "./payload/collections/lessons";
import { Media } from "./payload/collections/media";
import { Sections } from "./payload/collections/sections";
import { Users } from "./payload/collections/users";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Payload-Setup für edu-platform.
 *
 * Architektur (Phase 2):
 *
 * - Embedded-Plugin in Next.js (siehe withPayload in next.config.ts)
 * - Postgres-Tabellen im separaten Schema `payload`, isoliert von Drizzle
 * - Single-Tenant pro Deploy: Brand kommt aus brand.yaml, NICHT aus Daten —
 *   jeder Deploy-Container hat seine eigene DB mit Inhalten exklusiv für
 *   eine Brand. Heißt: keine Brand-Felder auf Inhalten, keine
 *   Multi-Tenant-Filter im Read.
 * - Hierarchie: Course → Section → Lesson (strikt 3 Ebenen)
 * - Quiz wird als <Question>-Komponente im Lesson-Body gehalten
 * - Versioning + Drafts auf allen Content-Collections
 *
 * Auth (Phase 1): Standard-Email+Passwort über Users-Collection.
 * Phase 1.5 ergänzt eine Custom-Strategy gegen GoTrue-JWT (SSO).
 */
export default buildConfig({
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },

  admin: {
    user: "users",
  },

  collections: [Users, Media, Courses, Sections, Lessons, LearningPaths],

  editor: lexicalEditor(),

  db: postgresAdapter({
    pool: {
      // pg/node-postgres parst sslmode=* aus dem connectionString und
      // überschreibt damit die explizite ssl-Option. Deshalb sslmode
      // hier aus der URL strippen und ssl nur programmatisch setzen —
      // sonst landen wir wieder bei "self-signed certificate"-Fehlern.
      connectionString: process.env.DATABASE_URL
        ? stripSslModeFromUrl(process.env.DATABASE_URL)
        : process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL
        ? sslConfigFromUrl(process.env.DATABASE_URL)
        : false,
      // Pool-Limits: pg default ist 10 max + 10s idle. Wir senken auf 5
      // und kombiniert mit dem Drizzle-Pool (auch 5) bleibt das Total
      // unter dem typischen Postgres-Limit von ~100, auch wenn
      // Supabase-Services parallel ihre eigenen Connections halten.
      max: 5,
      idleTimeoutMillis: 20000,
    },
    schemaName: "payload",
  }),

  // Leerer Fallback nur fürs Build (Config wird beim `next build` evaluiert,
  // wo das Runtime-Secret legitim fehlt). Der echte Fail-fast-Guard gegen ein
  // fehlendes Secret beim Server-Boot sitzt in instrumentation.ts (Finding 8).
  secret: process.env.PAYLOAD_SECRET || "",

  upload: {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  },
});
