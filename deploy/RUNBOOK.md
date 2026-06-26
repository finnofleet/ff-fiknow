# FIKNOW — Deployment-Runbook (Kubernetes / IBM)

Schritt-für-Schritt-Anleitung, um FIKNOW (`ff-fiknow`) auf einem Kubernetes-
Cluster in Betrieb zu nehmen. FIKNOW ist **OIDC-only** (Keycloak) und braucht
ein **externes Postgres** — beide werden vom Cluster-/Firmen-Umfeld
bereitgestellt, nicht vom Chart.

> Reihenfolge nicht überspringen: Die häufigsten Fehler entstehen, wenn
> Keycloak nicht exakt passt (redirect_uri, Rollen-Claims) oder die DB-Rechte
> fehlen. Siehe **Troubleshooting** am Ende — dort stehen genau die Stolper-
> steine, die im Test auftraten.

---

## 0. Voraussetzungen (Checkliste)

| # | Voraussetzung | Prüfen mit |
|---|---|---|
| 1 | Kubernetes-Cluster + `kubectl`-Kontext | `kubectl cluster-info` |
| 2 | `helm` ≥ 3.12 | `helm version` |
| 3 | **Postgres** (managed), erreichbar vom Cluster, leere DB + User mit Schema-/Tabellen-/Funktions-Rechten | `psql "$DATABASE_URL" -c '\conninfo'` |
| 4 | **Keycloak**: Realm + confidential Client + Rollen + Claim-Mapper (Abschnitt 2) | Keycloak-Admin-Konsole |
| 5 | **Ingress-Controller** + DNS-Eintrag auf den öffentlichen Host | `kubectl get ingressclass` |
| 6 | **TLS-Zertifikat** (cert-manager o. ä.) für den Host | — |
| 7 | **GHCR-Pull-Zugriff** auf `ghcr.io/finnofleet/ff-fiknow` (public ODER Pull-Secret) | Abschnitt 4 |

Postgres-Versionsnote: **PG 14+** empfohlen (`gen_random_uuid()` ist Core,
keine Extension nötig). Der DB-User muss Schemata, Tabellen, Funktionen und
RLS-Policies anlegen dürfen (typischerweise der **Owner** der Datenbank) — die
App migriert das Schema beim ersten Start selbst.

---

## 1. Postgres bereitstellen

1. Datenbank + User anlegen (Beispiel):
   ```sql
   CREATE DATABASE fiknow;
   CREATE USER fiknow WITH PASSWORD '…';
   GRANT ALL PRIVILEGES ON DATABASE fiknow TO fiknow;
   ALTER DATABASE fiknow OWNER TO fiknow;   -- damit Schema/Funktionen anlegbar
   ```
2. Connection-String notieren (für das Secret in Abschnitt 3):
   ```
   postgres://fiknow:<pw>@<host>:5432/fiknow?sslmode=require
   ```

> **Kein** `db:push` / kein manuelles Schema-Setup. Das Schema (inkl. der
> `auth.uid()`/`auth.role()`-RLS-Helfer) legt der **Auto-Migrate beim Pod-Start**
> an — bei mehreren Replicas migriert dank Advisory-Lock nur einer.

---

## 2. Keycloak einrichten (die heikelste Stelle)

Die App ist OIDC-Relying-Party gegen Keycloak. Entra ID wird **upstream in
Keycloak** föderiert — die App sieht nur Keycloak.

### 2.1 Client anlegen

- Realm wählen/erstellen (z. B. `fiknow`).
- **Client** anlegen:
  - Client-ID: **`edu-platform`** (muss mit `OIDC_CLIENT_ID` übereinstimmen)
  - Client authentication: **On** (confidential)
  - Standard flow: **On**; Direct access grants: Off
  - **Valid redirect URI** (EXAKT, sonst „invalid redirect"):
    ```
    https://app.fiknow.example.com/auth/oidc/callback
    ```
  - **Valid post logout redirect URI**: `https://app.fiknow.example.com/*`
  - Web origins: `https://app.fiknow.example.com`
- Unter **Credentials** das **Client-Secret** kopieren → `OIDC_CLIENT_SECRET`.

### 2.2 Rollen anlegen

Realm-Rollen (oder Client-Rollen) erstellen, die auf App-Rollen gemappt werden:
- `fiknow-curator` → App-Rolle `curator`
- `fiknow-admin` → App-Rolle `admin`
- (alles ohne Treffer = `learner`)

Das Mapping steuert `OIDC_ROLE_MAP` (Abschnitt 5).

### 2.3 Rollen/Gruppen ins **ID-Token** mappen (kritisch!)

Die App liest die Rolle aus den **ID-Token-Claims**. Standardmäßig stehen
Realm-Rollen NICHT im ID-Token → ohne Mapper kommt jede:r nur als `learner` an.

Im Client → **Client scopes** → dem dedizierten Scope einen Mapper hinzufügen
(oder „Add predefined mapper" → „realm roles"), und sicherstellen:
- Mapper-Typ **User Realm Role**, Token Claim Name `realm_access.roles`,
  **Add to ID token: On**, Multivalued: On.
- Optional analog ein **Group Membership**-Mapper (Claim `groups`,
  Add to ID token: On), falls über Gruppen statt Rollen gesteuert wird.

> Eine fertige Referenz-Realm-Konfig liegt im Repo:
> `tooling/keycloak/fiknow-realm.json` (für den lokalen Test, aber die Mapper-/
> Client-Struktur ist 1:1 übertragbar).

### 2.4 Nutzer:innen

Reale Nutzer kommen via Entra-Föderation in Keycloak. Rollen/Gruppen werden in
Keycloak (bzw. über die Entra-Gruppen-Mappings) zugewiesen. **Es gibt keine
User-Verwaltung in der App** — `/manage/users` verweist bewusst auf Keycloak.

---

## 3. Secret im Cluster anlegen

Benötigte Keys:

| Key | Pflicht | Inhalt |
|---|---|---|
| `DATABASE_URL` | ja | Postgres-Connection (Abschnitt 1) |
| `PAYLOAD_SECRET` | ja | 32+ Zufalls-Hex (Payload-Sessions) — über alle Replicas identisch |
| `OIDC_CLIENT_SECRET` | ja | aus Keycloak (2.1) |
| `OIDC_SESSION_SECRET` | optional | 32+ Zufalls-Hex; fehlt er, wird `PAYLOAD_SECRET` genutzt |
| `LLM_API_KEY` | optional | KI-Tutor-LLM (Abschnitt 5a); fehlt → Tutor AUS |
| `VOYAGE_API_KEY` | optional | RAG-Embeddings (Abschnitt 5a); fehlt → RAG-Index AUS |

Secrets generieren:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Secret anlegen (Variante A — direkt):
```bash
kubectl create namespace fiknow
kubectl -n fiknow create secret generic fiknow-env \
  --from-literal=DATABASE_URL='postgres://fiknow:<pw>@<host>:5432/fiknow?sslmode=require' \
  --from-literal=PAYLOAD_SECRET='<32hex>' \
  --from-literal=OIDC_CLIENT_SECRET='<keycloak-secret>' \
  --from-literal=OIDC_SESSION_SECRET='<32hex>'
```

> In Prod besser über **Sealed-Secrets / IBM Secrets Manager / External-Secrets**
> verwalten und im Chart per `secret.existingSecret: fiknow-env` referenzieren.

---

## 4. Image-Pull (GHCR)

Das Image liegt auf `ghcr.io/finnofleet/ff-fiknow`. Ein neues GHCR-Package ist
**privat by default** (auch bei public Repo). Eine von zwei Optionen:

**A) Package public stellen** (einfachster Pull): GitHub → Org `finnofleet` →
Packages → `ff-fiknow` → Package settings → *Change visibility → Public*.

**B) Pull-Secret** (Package bleibt privat):
```bash
kubectl -n fiknow create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<github-user> \
  --docker-password=<PAT mit read:packages>
```
und im Chart: `imagePullSecrets: [{ name: ghcr-pull }]`.

---

## 5. Helm-Werte + Install

Werte-Datei (an die Umgebung anpassen) — siehe auch das Beispiel
`deploy/helm/fiknow/values-fiknow-oidc.yaml`:

```yaml
image:
  repository: ghcr.io/finnofleet/ff-fiknow
  tag: latest                      # oder ein main-<sha> / v-Tag für reproduzierbar

config:
  OIDC_ISSUER: https://keycloak.intern.example.com/realms/fiknow
  OIDC_CLIENT_ID: edu-platform     # == Keycloak Client-ID
  OIDC_ROLE_MAP: "fiknow-curator:curator,fiknow-admin:admin"
  # OIDC_REDIRECT_BASE leer lassen → wird aus ingress.hosts[0] (https) abgeleitet

ingress:
  enabled: true
  className: public-iks-k8s-nginx  # IBM IKS: anpassen (oder OpenShift-Route separat)
  hosts:
    - host: app.fiknow.example.com
      paths: [{ path: /, pathType: Prefix }]
  tls:
    - secretName: fiknow-tls
      hosts: [app.fiknow.example.com]

secret:
  existingSecret: fiknow-env       # aus Abschnitt 3

# imagePullSecrets: [{ name: ghcr-pull }]   # nur bei privatem Package
```

Installieren:
```bash
helm upgrade --install fiknow ./deploy/helm/fiknow \
  -f my-values.yaml \
  --namespace fiknow --create-namespace
```

Das Chart **bricht vor dem Apply ab** (fail-fast), wenn `OIDC_ISSUER`, die
Redirect-Base oder ein Secret fehlt — die Meldung sagt, was.

---

## 5a. KI-Tutor & RAG (optional, eigene Keys)

Der KI-Tutor ist **deploymentweit optional** — ohne Keys läuft FIKNOW normal
(Kurse, Quiz, Progress, Annotationen), nur die Tutor-/RAG-Funktionen sind aus.
Beim Handover an FIKNOW unbedingt **eigene Provider-Konten** anlegen (die Keys
aus edu-platform gehören nicht der Firma) — es ist ein reiner Env-Var-Tausch,
kein Code-Change.

Zwei unabhängige Provider:

| Funktion | Key (Secret) | Config (ConfigMap) | Default |
|---|---|---|---|
| **Tutor-Antworten (LLM)** | `LLM_API_KEY` | `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_MAX_TOKENS` | Anthropic, `claude-haiku-4-5`, `https://api.anthropic.com` |
| **RAG-Embeddings** | `VOYAGE_API_KEY` | `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`, `RAG_RELEVANCE_THRESHOLD` | Voyage, `voyage-3.5-lite` |

- **Key anlegen:** LLM bei console.anthropic.com (oder ein Anthropic-kompatibles
  Gateway via `LLM_BASE_URL` — z. B. für EU/CH-Region + Zero-Data-Retention,
  da Nutzerfragen personenbezogen sind); Embeddings bei dashboard.voyageai.com.
- **Keys** kommen ins Secret (Abschnitt 3, einfach mit `--from-literal=LLM_API_KEY=…`
  ergänzen). **Modell/URL** kommen in die ConfigMap via `config.extra` im Chart:
  ```yaml
  config:
    extra:
      LLM_MODEL: claude-haiku-4-5
      LLM_BASE_URL: https://api.anthropic.com
      EMBEDDING_MODEL: voyage-3.5-lite
  ```
- **Reihenfolge bei VOYAGE:** Fehlt der Key beim Upload, bleibt der Kurs als
  „needs-reindex" markiert. Sobald der Key gesetzt ist, einmal nachindexieren:
  `POST /api/authoring/reindex` (ohne slug = Backfill aller Kurse).

## 6. Verifikation

```bash
kubectl -n fiknow get pods -l app.kubernetes.io/instance=fiknow
kubectl -n fiknow logs -l app.kubernetes.io/instance=fiknow -f
```
Im Log beim ersten Start erwartet: `[auto-migrate] … fertig in <n> ms`, dann der
Next-Start. Danach:

1. `https://app.fiknow.example.com/dashboard` aufrufen → Redirect auf
   `/auth/oidc/login` → Keycloak-Login.
2. Mit einem User mit Rolle `fiknow-curator` einloggen → zurück in der App,
   Zugriff auf `/manage` (Kurator-Recht).
3. Logout (Abmelden) → Session weg + Keycloak-Logout.

---

## 7. Konfigurations-Referenz (alle Variablen)

**Aus ConfigMap (nicht geheim):**

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `OIDC_ISSUER` | ja | Keycloak-Realm-URL (Prod: https) |
| `OIDC_CLIENT_ID` | ja | Keycloak-Client-ID |
| `OIDC_ROLE_MAP` | ja* | `keycloakRolle:appRolle,…` (sonst alle = learner) |
| `OIDC_REDIRECT_BASE` | ja in Prod | öffentliche Basis-URL; leer → aus Ingress-Host |
| `OIDC_SCOPES` | nein | Default `openid profile email` |
| `OIDC_SESSION_MAX_AGE_SEC` | nein | Default `28800` (8 h) |
| `OIDC_ALLOW_INSECURE` | nein | **nur lokal** http-Issuer erlauben; in Prod NIE |
| `DB_POOL_MAX` | nein | Max. Connections je Pool/Pod (Default `5`); s. 7a |
| `DB_POOL_IDLE_TIMEOUT_SEC` | nein | Idle-Timeout der Pool-Connections (Default `20`) |
| `MEDIA_STORAGE_DIR` | nein | Payload-Medien-Pfad (Chart-Default `/data/media`); s. 7a |
| `BUNDLE_STORAGE_DIR` | nein | Authoring-Bundle-Pfad (Chart-Default `/data/bundles`); s. 7a |
| `SKIP_MIGRATIONS` | nein | `true` = Auto-Migrate beim Boot überspringen |
| `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_MAX_TOKENS` | nein | KI-Tutor-LLM (Default Anthropic/claude-haiku-4-5); siehe 5a |
| `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_BASE_URL` / `RAG_RELEVANCE_THRESHOLD` | nein | RAG-Embeddings (Default Voyage/voyage-3.5-lite); siehe 5a |

**Aus Secret (geheim):** `DATABASE_URL`, `PAYLOAD_SECRET`, `OIDC_CLIENT_SECRET`,
optional `OIDC_SESSION_SECRET`; für den Tutor optional `LLM_API_KEY` und
`VOYAGE_API_KEY` (s. Abschnitt 3 + 5a).

---

## 7a. Betrieb: Health-Probes, Storage, Pool & Shutdown

**Health-Probes** (im Chart vorkonfiguriert, `values.yaml`):

| Probe | Pfad | Prüft | DB? |
|---|---|---|---|
| Startup | `/api/health/ready` | deckt das Auto-Migrate beim ersten Boot ab (bis 5 min) | ja |
| Liveness | `/api/health` | „Prozess lebt" | nein |
| Readiness | `/api/health/ready` | `SELECT 1` gegen Postgres → **503** wenn DB weg | ja |

Liveness greift bewusst **nicht** auf die DB zu (ein DB-Ausfall soll Pods aus
dem Service nehmen, nicht im Loop neustarten). Beide Endpoints sind öffentlich
und geben keine Geheimnisse preis.

**Writable Storage / read-only Root-FS.** Der Container läuft mit
`readOnlyRootFilesystem: true`. Alle Schreibpfade kommen als Volume:
`/app/.next/cache` und `/tmp` als ephemere `emptyDir` (korrekt — Wegwerf-State),
sowie `/data` für Payload-Medien (`MEDIA_STORAGE_DIR`) und Authoring-Bundles
(`BUNDLE_STORAGE_DIR`). Steuerung über `dataVolume` im Chart:

```yaml
dataVolume:
  type: emptyDir        # Default: ephemer & PRO POD
  # type: pvc           # persistent:
  # existingClaim: fiknow-data
```

> ⚠️ **Wichtig bei ≥2 Replicas mit Medien/Authoring:** `emptyDir` ist pro Pod
> isoliert und geht bei Neustart verloren. Wer Payload-Medien oder hochgeladene
> Kurs-Bundles nutzt, braucht einen **ReadWriteMany-PVC** (`type: pvc`,
> `existingClaim`) — sonst sehen die Replicas unterschiedliche Dateien.
> Wer Medien/Authoring nicht nutzt (reine Code-/MDX-Kurse im Image), kann beim
> `emptyDir`-Default bleiben.

**DB-Connection-Pool.** Pro Pod öffnen Drizzle- **und** Payload-Pool je
`DB_POOL_MAX` (Default 5) Verbindungen → **2 × `DB_POOL_MAX` pro Pod**. Über
alle Replicas muss gelten:

```
2 × DB_POOL_MAX × replicaCount  ≤  max_connections der Managed-DB (mit Reserve)
```

Default (5, 2 Replicas) = 20 Connections. Bei mehr Replicas oder kleiner DB
`DB_POOL_MAX` senken.

**Graceful Shutdown.** Auf `SIGTERM` schließt der Next-Standalone-Server keine
neuen Verbindungen mehr an, beendet laufende Requests und fährt dann herunter;
zusätzlich drainen wir den DB-Pool (`lib/shutdown.ts`), damit Connection-Slots
sofort frei werden. Default-`terminationGracePeriodSeconds` (30 s) reicht.

**Betrieb unter Subpfad / Context-Path.** Das Image hat keinen `basePath` —
jede Instanz läuft auf einem **eigenen Host** (ein Namespace/Host pro
Kunde/Stage). Hinter dem Reverse-Proxy respektiert die App `X-Forwarded-*`; die
öffentliche Basis-URL kommt aus `ingress.hosts[0]` bzw. `OIDC_REDIRECT_BASE`.
Ein gemeinsamer Subpfad-Betrieb mehrerer Instanzen unter einem Host ist nicht
vorgesehen.

---

## 8. OpenShift / ROKS-Hinweis

Bei der `restricted`-SCC vergibt OpenShift eine zufällige UID und ignoriert
`runAsUser`. Dann im Chart:
```yaml
podSecurityContext:
  runAsUser: null          # OpenShift wählt die UID
  runAsNonRoot: true
```
Ingress ggf. als OpenShift-`Route` statt `Ingress` (separat anlegen oder
Ingress-Kompatibilität nutzen).

---

## 9. Troubleshooting (real aufgetretene Fälle)

| Symptom | Ursache | Lösung |
|---|---|---|
| Keycloak: „Invalid redirect URI" | redirect_uri ≠ registriert | In Keycloak exakt `<REDIRECT_BASE>/auth/oidc/callback` eintragen |
| Login klappt, aber jede:r ist nur `learner` | Rollen nicht im ID-Token | Realm-Roles-/Groups-Mapper mit **Add to ID token: On** (2.3) |
| App startet nicht, `OIDC_REDIRECT_BASE … fehlt` | Prod-Fail-closed, keine Base | `OIDC_REDIRECT_BASE` setzen oder `ingress.hosts[0].host` füllen |
| `ImagePullBackOff` | Package privat, kein Pull-Recht | Package public ODER `imagePullSecret` (Abschnitt 4) |
| Boot-Crash bei Migration / `permission denied` / `schema … does not exist` | DB-User darf keine Schemata/Funktionen anlegen | DB-User zum Owner machen / CREATE-Rechte geben (Abschnitt 1) |
| `helm install` bricht sofort ab | Pflicht-Config/Secret fehlt | Meldung lesen — Issuer/Redirect-Base/Secret ergänzen |
