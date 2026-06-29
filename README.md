# FIKNOW (ff-fiknow)

> mit Wissen auf Kurs

Die Lernplattform von FINNOFLEET für geführte Wissensvermittlung (Onboarding,
Tool-Schulungen, interne Zertifizierungen).

Eigenständiger, firmen-eigener Stand: Plattform-Code und FIKNOW-Brand sind hier
zu **einem** Repository verschmolzen (hervorgegangen aus der edu-platform). Kein
Basis-Image-+-Overlay mehr — dieses Repo baut und deployt FIKNOW direkt.

- **Auth:** OIDC-only via **Keycloak** (Entra ID wird upstream in Keycloak
  föderiert). Rolle = Keycloak als Source of Truth, gemappt aus Token-Claims.
- **Deployment:** OCI-Image (`ghcr.io/finnofleet/ff-fiknow`) + Helm-Chart unter
  [`deploy/helm/fiknow`](deploy/helm/fiknow) (non-root, externes Postgres,
  Ingress). Alternativ als OCI-Chart
  `oci://ghcr.io/finnofleet/charts/fiknow`. Siehe
  [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md) für alle Schritte.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Drizzle ORM** — typsichere DB-Queries, Migrationen, RLS-Helfer
  (`auth.uid()` / `auth.role()`); externes/managed Postgres (kein Supabase)
- **Payload CMS 3** — Admin-/Content-Backend (`/admin` → `/manage`), Medien
- **OIDC via Keycloak** (`oauth4webapi`) — kein GoTrue/Supabase-Auth mehr
- **next-mdx-remote** für MDX-basierte Lerninhalte
- **lucide-react** für Icons
- **Plain CSS Modules** + OKLCH-Tokens, kein Tailwind
- **MCP-Authoring** (`@modelcontextprotocol/sdk`, optional, `MCP_ENABLED`)
- **KI-Tutor + RAG** (optional, eigene Provider-Keys; `LLM_API_KEY` /
  `VOYAGE_API_KEY`)

## Voraussetzungen

- Node ≥ 20 (Image nutzt Node 22)
- Docker Desktop / OrbStack (für lokale Infra: Keycloak + Postgres)

## Setup (lokal)

```bash
# 1. Dependencies
npm install

# 2. Lokale Infra starten — Keycloak + plain Postgres (KEIN Supabase)
docker compose -f docker-compose.oidc.yml up

# 3. .env.local anlegen und OIDC-Werte + DATABASE_URL eintragen
cp .env.example .env.local
# Minimale Werte für den lokalen OIDC-Flow:
#   OIDC_ISSUER=http://localhost:8080/realms/fiknow
#   OIDC_CLIENT_ID=edu-platform
#   OIDC_CLIENT_SECRET=local-dev-secret
#   OIDC_ROLE_MAP=fiknow-curator:curator,fiknow-admin:admin
#   OIDC_SESSION_SECRET=local-dev-session-secret-min-16
#   OIDC_ALLOW_INSECURE=true
#   DATABASE_URL=postgres://postgres:postgres@localhost:5544/edu
#   PAYLOAD_SECRET=<32-Zeichen-Hex>

# 4. Dev-Server auf dem Host starten (App läuft NICHT im Container)
npm run dev
```

> **WICHTIG — KEIN `npm run db:push`:** Das Schema (inkl. RLS-Helfer) legt der
> **Auto-Migrate beim App-Start** automatisch an. Ein manuelles `db:push` würde
> die Tabellen ohne Migrations-Journal anlegen und den nächsten Migrate-Lauf
> mit „relation already exists" brechen. Bei verkorkstem DB-Zustand:
> `docker compose -f docker-compose.oidc.yml down -v`.

App läuft auf [http://localhost:3000](http://localhost:3000).
Keycloak-Admin auf [http://localhost:8080](http://localhost:8080).

**Test-User** (Passwort = Username):

| User | App-Rolle |
|---|---|
| `curator@fiknow.test` | `curator` |
| `admin@fiknow.test` | `admin` |
| `learner@fiknow.test` | `learner` |

## Verzeichnisstruktur

```text
app/
  (frontend)/           Next.js-Routen (Learner-/Kurator-Seiten)
    api/                API-Routen (health, authoring, tutor, mcp, annotations)
    auth/oidc/          OIDC-Flow (login, callback, logout)
    authoring/          Authoring-Shell (CLI-Auth-Approve)
    courses/            Kurs-Katalog + Kursdetail
    dashboard/          Eingeloggter Lerner-Bereich
    learn/              Lesson-Player (Reading/Quiz/Video)
    manage/             Kurator-/Admin-Verwaltung (Kurse, Import, User)
    paths/              Lehrpfade
    profile/            Profil + Access-Tokens
  (payload)/            Payload CMS-Routen
    admin/              Payload-Admin-UI
    api/                Payload REST/GraphQL-API
components/
  mdx/                  MDX-Bausteine (Callout, KeyTakeaways, Question, …)
  top-nav.tsx           Geteilte Top-Navigation
  course-card.tsx       Kurs-Karten-Komponente
  theme-toggle.tsx      Light/Dark-Toggle
deploy/
  RUNBOOK.md            Schritt-für-Schritt Kubernetes/IBM-Deploy-Guide
  helm/fiknow/          Helm-Chart (values.yaml, templates, Chart.yaml)
docs/
  AUTHORING_BUNDLE.md   Bundle-Format + Upload-Flow
  CONTENT_STYLE.md      Tonfall, Schreib-Konventionen, Qualitäts-Checkliste
  BRAND-CONFIG.md       Brand-Schema (brand.yaml)
  AUTHORING_PATH.md     Lehrpfad-Authoring
  ROADMAP.md            Roadmap
  adr/                  Architecture Decision Records (0001–0004)
drizzle/                Drizzle-Migrationen (public.*-Tabellen + RLS)
lib/
  auth/                 OIDC-Provider, Session, Middleware, Rollen
  authoring/            Bundle-Parser, Import/Publish, Staging, Storage
  db/                   Drizzle-Schema, Client, Auto-Migrate
  embeddings/           Voyage-Embedding-Client
  llm/                  Anthropic-LLM-Client
  rag/                  Chunking, Indexing, Retrieval
  tutor/                KI-Tutor-Prompt
  paths.ts              Lehrpfad-Abfragen
  paths-progress.ts     Lehrpfad-Fortschritt
  progress.ts           Lesson-Progress
  annotations.ts        Notizen + Markierungen
  content.ts            Content-Layer (Payload Local API)
  brand.ts              Brand-Konfig laden
  mdx/                  MDX-Optionen, Validierung
  rate-limit.ts         App-seitiger Rate-Limiter
  shutdown.ts           Graceful Shutdown + DB-Pool-Drain
  seo/                  SEO-Helfer
  svg/                  SVG-Inline-Helfer
migrations/             Payload-Migrationen (payload.*-Tabellen)
payload/
  collections/          Payload-Collections (courses, sections, lessons,
                        learning-paths, media, users)
  access/               Rollen-basierte Zugriffskontrolle
scripts/                Ops-Skripte (promote-admin.mjs, bootstrap-db.mjs)
tooling/
  course-plugin/        KI-Kurs-Plugin (client.mjs, Beispiel-Kurs, Skills)
  keycloak/             Referenz-Realm (fiknow-realm.json) für lokalen Test
proxy.ts                Auth-Middleware (Session-Check + Protected Routes)
```

## NPM Scripts

| Befehl | Was er tut |
|---|---|
| `npm run dev` | Next.js Dev-Server (Turbopack) |
| `npm run build` | Produktions-Build |
| `npm run start` | Produktions-Server starten |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (einmalig) |
| `npm run test:watch` | Vitest (Watch-Modus) |
| `npm run db:generate` | Drizzle-Migrationsdateien erzeugen |
| `npm run db:migrate` | Drizzle-Migrationen anwenden |
| `npm run db:push` | Schema direkt pushen (Dev-Notfall; s. Warnung oben) |
| `npm run db:studio` | Drizzle Studio öffnen |
| `npm run admin:bootstrap` | Ersten Admin in frischer DB anlegen |
| `npm run db:bootstrap` | DB-Bootstrap-Skript |

## Inhalte schreiben

Kurse leben **nicht** als Dateien im Repo, sondern werden als **Bundle**
(course.mdx + Sections + Lessons + `assets/`) lokal editiert und über den
Authoring-Client hochgeladen. Loop: `checkout → edit → upload (Draft) → Review
im Learner-Shell → publish`. Der Content-Layer (`lib/content.ts`) liest danach
aus der Payload Local API.

- **Format-Referenz** (Ordnerstruktur, Frontmatter, MDX-Komponenten,
  Upload-Flow): [`docs/AUTHORING_BUNDLE.md`](docs/AUTHORING_BUNDLE.md)
- **Stimme & Didaktik** (Tonfall, Schreib-Konventionen, Cowork-Prompts,
  Qualitäts-Checkliste): [`docs/CONTENT_STYLE.md`](docs/CONTENT_STYLE.md)

## Datenmodell

```
courses (slug PK)
 └── sections (course_slug, slug PK)
      └── lessons (course_slug, section_slug, slug PK)

learning_paths (slug PK)
profiles (user_id PK, role: learner | curator | admin)
enrollments (user_id, course_slug PK)
lesson_progress (user_id, course_slug, section_slug, lesson_slug PK)
quiz_attempts (id PK, user_id, lesson, answers JSONB, score, passed)
lesson_chunks (id PK — Embeddings für RAG)
```

Alle user-bezogenen Tabellen haben RLS-Policies (`auth.uid() = user_id`).
Die `auth.uid()`/`auth.role()`-Helfer legt der Auto-Migrate beim Start an.
Profile werden per DB-Trigger bei der ersten Session automatisch erstellt.

## Phase-1-Scope

- Course/Section/Lesson + Reading/Quiz Lesson-Typen
- Auth via OIDC/Keycloak, Enrollment, Lesson-Progress
- Multi-Course
- Light/Dark-Theme
- Lehrpfade (`paths/`)
- KI-Tutor + RAG (optional, mit eigenen Provider-Keys)
- MCP-Authoring (optional, `MCP_ENABLED`)

Vertagt: Zertifikate, Audio/SCORM, Monetarisierung.

## Deployment (Kubernetes / IBM Cloud)

Ziel-Plattform: **Kubernetes (IBM Cloud)**. Deploy via Helm-Chart aus dem Repo
oder direkt aus der OCI-Registry:

```bash
# Aus dem Repo
helm upgrade --install fiknow ./deploy/helm/fiknow \
  -f my-values.yaml --namespace fiknow --create-namespace

# Aus der OCI-Registry (CI publiziert nach jedem main-Build)
helm upgrade --install fiknow oci://ghcr.io/finnofleet/charts/fiknow \
  --version <tag> -f my-values.yaml \
  --namespace fiknow --create-namespace
```

**Extern bereitstellen (Voraussetzungen):**

- Managed Postgres (PG 14+, DB-User als Owner)
- Keycloak (Realm + confidential Client + Rollen-Claim-Mapper)
- Ingress-Controller + DNS + TLS
- Persistenter RWX-Speicher für `/data` (Medien + Kurs-Bundles), sobald
  Uploads oder Authoring/MCP genutzt werden

**Image:** `ghcr.io/finnofleet/ff-fiknow` — GitHub Actions baut und pusht auf
jedem `main`-Push. Tags: `latest` (neuester main-Build), `main-<sha>`
(auditfähig), `v1.2.3` (bei Git-Tag). CI hängt eine SBOM (SPDX) an und führt
einen informativen Grype-Scan durch.

> **Alle Details** (Postgres, Keycloak-Setup, Secrets, Helm-Werte, KI-Keys,
> Troubleshooting) stehen im **[`deploy/RUNBOOK.md`](deploy/RUNBOOK.md)** und
> im **[Chart-README](deploy/helm/fiknow/README.md)** — hier nicht dupliziert.

## Multi-Instanz-Betrieb / eigenes Branding

Isolation erfolgt pro **Kubernetes-Deployment**: eigener Namespace/Host, eigenes
Postgres, eigener Keycloak-Realm, eigenes Secret. Optional kann ein eigenes
Brand-Image gebaut werden.

| Achse | Wie getrennt |
| --- | --- |
| **Code** | Ein Repo, ein Base-Image (`ghcr.io/finnofleet/ff-fiknow`) |
| **Brand** | `brand/brand.yaml` im Image (Default); Forks bauen ein eigenes Image, das dieses als Base nutzt und `brand/brand.yaml` überschreibt |
| **Daten** | Eigenes Postgres pro Deployment (User, Progress, Attempts isoliert) |
| **Identität** | Eigener Keycloak-Realm pro Deployment |
| **Speicher** | Eigenes `/data`-Volume für Medien + Bundles |

**Neue Brand:**

1. Brand-Repo anlegen (privat), `brand.yaml` nach Schema in
   [`docs/BRAND-CONFIG.md`](docs/BRAND-CONFIG.md) erstellen.
2. Eigenes Dockerfile: `FROM ghcr.io/finnofleet/ff-fiknow:latest` →
   `COPY brand.yaml /app/brand/brand.yaml`.
3. Eigenes Postgres + Keycloak-Realm + Kubernetes-Deployment.
4. OIDC-, DB- und Payload-Vars als Secret setzen; KI-Tutor-Keys optional
   (`LLM_API_KEY`, `VOYAGE_API_KEY`).

**Schriften ändern:** In `app/layout.tsx` einbinden (`next/font` verlangt
statische Imports), dann via `design.fontSet` in `brand.yaml` aktivieren.

## Image Build & Push (GitHub Actions)

`.github/workflows/build-image.yml` triggert auf jedem Push aufs `main`-Branch
oder manuell via UI. Tags:

- `latest` — jüngster main-Build
- `main-<short-sha>` — auditfähig
- `v1.2.3` — bei Git-Tag

Das Image ist standardmäßig privat im GHCR. Optionen: Package public stellen
(einfachster Pull) oder Pull-Secret im Cluster anlegen — Details in
[`deploy/RUNBOOK.md`](deploy/RUNBOOK.md) Abschnitt 4.

## Lizenz

Privat, keine öffentliche Lizenz.
