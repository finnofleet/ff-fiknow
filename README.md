# FIKNOW (ff-fiknow)

> mit Wissen auf Kurs

Die Lernplattform von FINNOFLEET für geführte Wissensvermittlung (Onboarding,
Tool-Schulungen, interne Zertifizierungen).

Eigenständiger, firmen-eigener Stand: Plattform-Code und FIKNOW-Brand sind hier
zu **einem** Repository verschmolzen (hervorgegangen aus der edu-platform). Kein
Basis-Image-+-Overlay mehr — dieses Repo baut und deployt FIKNOW direkt.

- **Auth umschaltbar** via `AUTH_PROVIDER`: `oidc` (Keycloak, für den
  Firmen-/K8s-Betrieb) oder `gotrue` (Supabase).
- **Deployment:** OCI-Image (`ghcr.io/finnofleet/ff-fiknow`) + Helm-Chart unter
  [`deploy/helm/fiknow`](deploy/helm/fiknow) (non-root, externes Postgres,
  Ingress). Siehe das Chart-README für Voraussetzungen und Schritte.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Supabase** (Postgres, Auth, Storage, RLS) — lokal via CLI, prod via Cloud
- **Drizzle ORM** für typsichere DB-Queries und Migrationen
- **next-mdx-remote** für MDX-basierte Lerninhalte
- **lucide-react** für Icons
- **Plain CSS Modules** + OKLCH-Tokens, kein Tailwind

## Voraussetzungen

- Node ≥ 20
- Docker Desktop / OrbStack (für lokales Supabase)
- Supabase CLI: `brew install supabase/tap/supabase`

## Setup

```bash
# 1. Dependencies
npm install

# 2. Lokales Supabase starten (Postgres, Auth, Storage in Docker)
supabase start

# 3. .env.local anlegen — Werte aus `supabase status` übernehmen
cp .env.example .env.local
# DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY eintragen

# 4. Schema in DB pushen
npm run db:push

# 5. RLS-Policies + Auth-Trigger anwenden
npm run auth:setup

# 6. Dev-Server
npm run dev
```

App läuft auf [http://localhost:3000](http://localhost:3000), Supabase Studio auf [http://localhost:54323](http://localhost:54323).

## Verzeichnisstruktur

```
app/                    Next.js App Router
  (auth)/               Login/Register-Seiten + Auth-Actions
  auth/callback/        OAuth/Email-Confirmation Callback
  courses/              Katalog + Kursdetail
  dashboard/            Eingeloggter Lerner-Bereich
  learn/                Lesson-Player (Reading/Quiz/Video)
components/
  mdx/                  MDX-Bausteine (Callout, KeyTakeaways, Question, …)
  top-nav.tsx           Geteilte Top-Navigation
  course-card.tsx       Kurs-Karten-Komponente
  theme-toggle.tsx      Light/Dark-Toggle
design/                 Design-Templates und -Entscheidungen
  templates/            HTML-Mockups je Seite (Variante A/B)
  decisions.md          Welche Variante gewählt wurde, Begründungen
lib/
  content.ts            Content-Layer (liest aus Payload Local API)
  authoring/            Bundle-Parser + Import/Publish (headless Authoring)
  db/                   Drizzle-Schema und Client
  supabase/             Server- und Browser-Clients (@supabase/ssr)
public/assets/          Statische Bilder (Legacy-Kurse; neue Assets → Payload-Media)
scripts/                Setup-Skripte
supabase/               Lokale Supabase-Konfiguration (config.toml)
proxy.ts                Auth-Middleware (refresh + protected routes)
```

## NPM Scripts

| Befehl | Was er tut |
|---|---|
| `npm run dev` | Next.js Dev-Server (Turbopack) |
| `npm run build` | Produktions-Build |
| `npm run db:push` | Drizzle-Schema direkt in DB pushen (kein Migrations-Step) |
| `npm run db:generate` | Drizzle-Migrationsdateien erzeugen |
| `npm run db:migrate` | Migrationen anwenden |
| `npm run db:studio` | Drizzle Studio öffnen |
| `npm run auth:setup` | RLS-Policies und Profile-Trigger anwenden |

## Inhalte schreiben

Kurse leben **nicht** mehr als Dateien im Repo, sondern werden als **Bundle**
(course.mdx + Sections + Lessons + `assets/`) lokal editiert und über den
Authoring-Client hochgeladen. Loop: `checkout → edit → upload (Draft) → Review
im Learner-Shell → publish`. Der Content-Layer (`lib/content.ts`) liest danach
aus der Payload Local API.

- **Format-Referenz** (Ordnerstruktur, Frontmatter, MDX-Komponenten, Upload-Flow):
  [`docs/AUTHORING_BUNDLE.md`](docs/AUTHORING_BUNDLE.md)
- **Stimme & Didaktik** (Tonfall, Schreib-Konventionen, Cowork-Prompts,
  Qualitäts-Checkliste): [`docs/CONTENT_STYLE.md`](docs/CONTENT_STYLE.md)

## Datenmodell

```
courses (slug PK)
 └── sections (course_slug, slug PK)
      └── lessons (course_slug, section_slug, slug PK)

profiles (user_id PK, role: learner | admin)
enrollments (user_id, course_slug PK)
lesson_progress (user_id, course_slug, section_slug, lesson_slug PK)
quiz_attempts (id PK, user_id, lesson, answers JSONB, score, passed)
```

Alle user-bezogenen Tabellen haben RLS-Policies (`auth.uid() = user_id`).
Profile werden per Trigger bei Signup automatisch erstellt.

## Phase-1-Scope

- Course/Section/Lesson + Reading/Quiz Lesson-Typen
- Auth (E-Mail/Passwort), Enrollment, Lesson-Progress
- Multi-Course (A2 jetzt, weitere später)
- Light/Dark-Theme

Vertagt: Zertifikate, Lehrpfade, Audio/SCORM, Admin-UI, Monetarisierung.

## Deployment

- **Frontend**: Vercel (`vercel deploy`)
- **DB & Auth**: Supabase Cloud (Projekt anlegen, `DATABASE_URL` und Keys in Vercel-Env eintragen, `db:push` und `auth:setup` einmalig gegen Cloud-DB ausführen)
- **Content-Sync**: aktuell manuell vor jedem Deploy (`content:sync`); später Vercel-Build-Step

## Multi-App-Architektur

Die Codebasis bedient mehrere Apps gleichzeitig (z. B. verstande.ch und ein
White-Label-Klon). Das funktioniert über drei Achsen:

| Achse | Wie getrennt |
|---|---|
| **Code** | Eine Codebasis, ein Docker-Image (`ghcr.io/<owner>/edu-platform`) |
| **Brand** | Per-App env-Variablen (`BRAND_*`) → Logo, Slogan, Akzentfarbe |
| **Daten** | Eigene Postgres-Instanz pro App (User, Progress, Quiz-Attempts isoliert) |
| **Inhalte** | Content-Repo pro App (z. B. `edu-content-verstande`, `edu-content-fiknow`) als Volume gemountet — Image enthält **keinen** Content |
| **Identität** | Eigene GoTrue-Instanz pro App (separate Login-Pools) |

So kann ein einzelner Build-Pipeline-Lauf alle Apps gleichzeitig versorgen,
ohne dass sich Daten oder Inhalte vermischen.

```
GitHub: edu-platform (Code)        ─┐
                                     ├─ GitHub Actions: docker build + push
                                     ▼
                          ghcr.io/<owner>/edu-platform:latest
                            │                │
                            ▼                ▼
              Jelastic "verstande"     Jelastic "fiknow"
              ├─ App-Container         ├─ App-Container (gleiches Image)
              ├─ Postgres              ├─ Postgres (eigene)
              ├─ GoTrue                ├─ GoTrue (eigene)
              └─ Content-Volume        └─ Content-Volume
                 (edu-content-           (edu-content-fiknow)
                  verstande)
```

## Image Build & Push (GitHub Actions)

`.github/workflows/build-image.yml` triggert auf jedem Push aufs `main`-Branch
oder manuell via UI. Tags:

- `latest` — jüngster main-Build
- `main-<short-sha>` — auditfähig
- `v1.2.3` — bei Git-Tag

Sichtbarkeit des Images: standardmäßig privat im GHCR. Jelastic logged sich
beim Pull mit einem GitHub-PAT (Personal Access Token) ein, das im Jelastic-
Container-Setup hinterlegt wird.

## Lokaler Production-Test mit Docker

Tägliche Entwicklung läuft mit `npm run dev` (siehe oben — schnell, mit
Hot-Reload). Wenn du das Production-Image lokal prüfen willst:

```bash
# Supabase-Stack muss laufen (Ports 54321/54322)
supabase start

# Image bauen und starten
docker compose up --build
```

App läuft auf `http://localhost:3000`, verbindet sich gegen das Supabase
auf dem Host (via `host.docker.internal`).

Brand-Variablen kannst du im `docker-compose.yml` oder via `.env`
überschreiben — nützlich, um eine Fork-Identität schon vor dem Deploy
zu testen.

## Deployment auf Jelastic (Infomaniak)

1. **Environment** anlegen: NGINX Load Balancer + Custom Docker Container
   (oder Native Node 22) + PostgreSQL + optional Docker Engine für
   Self-hosted Supabase Auth/Storage.
2. **Docker-Image** pushen — entweder zu Docker Hub, GHCR oder direkt
   in die Jelastic Registry: `docker build -t … . && docker push …`
3. **Postgres-Schema** initialisieren: einmalig vom lokalen Rechner
   `DATABASE_URL=postgres://… npm run db:push && npm run auth:setup`
4. **Env-Variablen** im Jelastic-Dashboard setzen (alle aus `.env.example`).
   Pflichtfelder: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `PAYLOAD_SECRET`.
   Optional (KI-Tutor): `LLM_API_KEY` (Anthropic-Key — fehlt er, ist
   der Tutor deploymentweit deaktiviert, der Rest der App läuft normal).
   Weitere Tutor-Vars mit Defaults: `LLM_PROVIDER`, `LLM_BASE_URL`,
   `LLM_MODEL`, `LLM_MAX_TOKENS` (siehe `.env.example`).
5. **Custom Domain** anhängen + Let's Encrypt SSL aktivieren.
6. **Content-Sync** als Build-Step oder manuell:
   `npm run content:sync` gegen die Cloud-DB.
7. **Auth-Rate-Limits** im **GoTrue-Container** setzen (Defense-in-Depth
   zum App-seitigen Limiter in `(auth)/actions.ts`, SECURITY_AUDIT #5) —
   global-konsistent, auch bei mehreren App-Replikas:
   - `GOTRUE_RATE_LIMIT_EMAIL_SENT=10` (Mails/Stunde)
   - `GOTRUE_RATE_LIMIT_VERIFY=30`

Mehrere Dienste auf eigenen Domains: pro Dienst ein eigenes Jelastic-
Environment mit eigenem Image (sauberste Trennung) — alternativ
geteilten Postgres-Cluster und mehrere App-Environments.

### Bundle-Storage (Authoring) — persistenter NFS-Mount

Hochgeladene Kurs-Bundles sind **Source of Truth** für den Content (die DB ist
nur Index/Master für Struktur + Version, siehe ADR 0001). Der Storage muss
darum **Redeploys überstehen** (das Image deklariert kein `VOLUME` → App-lokale
Pfade werden beim Image-Update gewiped) **und** bei horizontaler Skalierung
**von allen App-Instanzen geteilt** werden. Beides liefert ein dedizierter
Jelastic-**Speicher-Knoten** (Shared Storage / NFS):

1. Topologie → **„Speicher"** hinzufügen (eigener NFS-Knoten, eigener
   Lebenszyklus). Ressourcen klein halten: ~1 Cloudlet reserviert, Disk-Limit
   z. B. 10 GB (Bundles sind klein; Versionen akkumulieren pro Upload, kein
   Auto-GC — Limit lässt sich live hochziehen).
2. Am App-Knoten → **„Laufwerke" → Daten-Container** → den Speicher-Knoten
   wählen, Mount **`/app/bundle-storage`** anlegen, **nicht** „Nur lesen"
   (Upload muss schreiben können, sonst `EROFS`/`EACCES`).
3. Am App-Knoten → **„Variablen"** → `BUNDLE_STORAGE_DIR=/app/bundle-storage`
   (exakt der Mount-Pfad). Ohne die Var fällt der Code auf
   `<cwd>/.bundle-storage` zurück — nicht persistent.
4. **Schreibrecht für UID 1001**: Der Container läuft non-root als
   `nextjs` (UID 1001), NFS-Mounts kommen oft root-owned. Bei `EACCES` beim
   ersten Upload auf dem Speicher-Knoten: `chown -R 1001:1001 /app/bundle-storage`.

**Bestandskurse backfillen**: Kurse, die vor der Storage-Umstellung importiert
wurden, haben **kein Bundle im Storage** — ein Export bricht dann mit
`409 bundle_not_in_storage`. Jeden Bestandskurs **einmal** über den normalen
Upload-Pfad neu hochladen (Plugin `client.mjs upload <folder>`); das schreibt
das Bundle erstmalig in den Storage und füllt `courses.version`.

> Derselbe Speicher-Knoten eignet sich auch für `public/media` (Payload-
> Uploads), falls die Redeploys nicht überstehen — separater Mount-Punkt,
> ein Knoten. Bei geteilter Nutzung Disk-Limit eher 15–20 GB.

## Eine zweite Instanz mit eigenem Branding (Fork)

Die Codebase verwendet ein **Brand-Repo-Pattern** (vergleichbar mit
WordPress-Themes). Pro Marke ein kleiner Repo mit `brand.yaml`, der bei
Production-Deployments als `/app/brand` gemountet wird. Code-Diff = null.

**Vorgehen für eine neue Brand**:

1. **Brand-Repo anlegen** (z. B. `<owner>/fiknow-brand`, privat).
2. Eine `brand.yaml` mit den Marken-Werten erstellen — vollständiges Schema in
   [docs/BRAND-CONFIG.md](docs/BRAND-CONFIG.md).
3. **Eigenes Supabase + Postgres** für Daten-Isolation.
4. **Eigene Jelastic-Env / Vercel-App** mit:
   - Mount des Brand-Repos auf `/app/brand`
   - Mount des Content-Repos auf `/app/content`
   - DB- und Auth-Env-Vars setzen (`DATABASE_URL`, `SUPABASE_*`, `PAYLOAD_SECRET`)
   - **KI-Tutor**: eigenes Anthropic-Konto anlegen → Key als `LLM_API_KEY`
     in der neuen Env eintragen. Unser Key kommt nicht mit — ein Env-Var-
     Tausch, kein Code-Change (identisches Prinzip wie Supabase/DB/Storage).
     Fehlt der Key, ist der Tutor in der neuen Env stillgelegt; die übrigen
     Lerner-Features (Notizen, Markierungen) laufen ohne ihn weiter.
5. `npm run db:push` und `npm run auth:setup` einmalig gegen die neue DB.

**Schriften ändern**: nicht Brand-spezifisch — wenn du eine zusätzliche
Hausschrift willst, in `app/layout.tsx` einbinden (`next/font` verlangt
statische Imports). Dann via `design.fontSet` in `brand.yaml` aktivieren.

Die Default-Werte in `brand/brand.yaml` definieren verstande.ch — Forks
brauchen keine Code-Änderungen, nur ihren eigenen Brand-Repo.

## Lizenz

Privat, keine öffentliche Lizenz.
