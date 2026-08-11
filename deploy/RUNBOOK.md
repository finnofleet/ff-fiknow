# FINKNOW — Deployment-Runbook (Kubernetes / IBM)

Schritt-für-Schritt-Anleitung, um FINKNOW (`ff-fiknow`) auf einem Kubernetes-
Cluster in Betrieb zu nehmen. FINKNOW ist **OIDC-only** (Keycloak) und braucht
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
| 8 | **Persistenter Speicher** für `/data`, **falls** Medien-Uploads oder MCP-/Authoring genutzt werden — bei ≥2 Replicas ein **ReadWriteMany-PVC** (RWX). Sonst optional. | Abschnitt 7a |

> **Datentöpfe nicht vergessen:** Kurs-Bundles (MCP/Authoring) und Payload-Medien
> liegen im Dateisystem unter `/data`. Ohne gemountetes, persistentes Volume
> gehen sie bei jedem Pod-Neustart verloren und sind über mehrere Replicas
> inkonsistent. Reine Code-/MDX-Kurse (im Image) brauchen das nicht.

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
| `WATSONX_API_KEY` | optional | RAG-Embeddings, **Default-Provider watsonx** (Abschnitt 5a); fehlt → RAG-Index AUS |
| `VOYAGE_API_KEY` | optional | RAG-Embeddings, Legacy-Provider Voyage — nur bei `EMBEDDING_PROVIDER=voyage` (Abschnitt 5a) |

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

Installieren (aus dem Repo-Verzeichnis):
```bash
helm upgrade --install fiknow ./deploy/helm/fiknow \
  -f my-values.yaml \
  --namespace fiknow --create-namespace
```

Alternativ aus der **OCI-Registry** (die CI veröffentlicht das Chart nach jedem
main-Build nach `oci://ghcr.io/finnofleet/charts/fiknow`):
```bash
helm upgrade --install fiknow oci://ghcr.io/finnofleet/charts/fiknow \
  --version 0.3.2 -f my-values.yaml \
  --namespace fiknow --create-namespace
```

Das Chart **bricht vor dem Apply ab** (fail-fast), wenn `OIDC_ISSUER`, die
Redirect-Base oder ein Secret fehlt — die Meldung sagt, was.

---

## 5a. KI-Tutor & RAG (optional, eigene Keys)

Der KI-Tutor ist **deploymentweit optional** — ohne Keys läuft FINKNOW normal
(Kurse, Quiz, Progress, Annotationen), nur die Tutor-/RAG-Funktionen sind aus.
Beim Handover an FINKNOW unbedingt **eigene Provider-Konten** anlegen (die Keys
aus edu-platform gehören nicht der Firma) — es ist ein reiner Env-Var-Tausch,
kein Code-Change.

Zwei unabhängige Provider:

| Funktion | Key (Secret) | Config (ConfigMap) | Default |
|---|---|---|---|
| **Tutor-Antworten (LLM)** | `LLM_API_KEY` | `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_MAX_TOKENS` | Anthropic, `claude-haiku-4-5`, `https://api.anthropic.com` |
| **RAG-Embeddings** | `WATSONX_API_KEY` (Default; oder `VOYAGE_API_KEY` bei Legacy) | `EMBEDDING_PROVIDER`, `WATSONX_PROJECT_ID`, `WATSONX_URL`, `EMBEDDING_MODEL`, `RAG_RELEVANCE_THRESHOLD` | watsonx, `granite-embedding-278m-multilingual` |

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
- **Reihenfolge bei VOYAGE/watsonx:** Fehlt der Key beim Upload, bleibt der
  Kurs als „needs-reindex" markiert. Sobald der Key gesetzt ist, einmal
  nachindexieren: `POST /api/authoring/reindex` (ohne slug = Backfill aller
  Kurse).

**Standard-Embedding-Provider: IBM watsonx.ai** (Default seit 2026-07-26 —
bewusste Ablösung von Voyage, weil mit IBM ein Vertrag/AVV besteht und die
Verarbeitung in `eu-de` bleibt). Voyage ist nur noch Legacy-Fallback per
`EMBEDDING_PROVIDER=voyage`. Für den Default-Weg benötigte Env-Vars:

| Variable | Ort | Pflicht | Bedeutung |
|---|---|---|---|
| `EMBEDDING_PROVIDER` | ConfigMap | nein | Default `watsonx`; nur für Legacy auf `voyage` setzen |
| `WATSONX_API_KEY` | Secret | ja | IBM-Cloud-API-Key |
| `WATSONX_PROJECT_ID` | ConfigMap | ja | watsonx.ai-Projekt-UUID |
| `WATSONX_URL` | ConfigMap | ja | Region-Endpoint, z. B. `https://eu-de.ml.cloud.ibm.com` |
| `WATSONX_API_VERSION` | ConfigMap | nein | Default `2024-05-02` |
| `EMBEDDING_MODEL` | ConfigMap | nein | Default `ibm/granite-embedding-278m-multilingual` |

```yaml
config:
  extra:
    EMBEDDING_PROVIDER: watsonx
    WATSONX_PROJECT_ID: <projekt-uuid>
    WATSONX_URL: https://eu-de.ml.cloud.ibm.com
    EMBEDDING_MODEL: ibm/granite-embedding-278m-multilingual
```
`WATSONX_API_KEY` kommt wie die anderen Secrets ins Secret (Abschnitt 3):
`--from-literal=WATSONX_API_KEY=…`.

> ⚠️ **Dimensionswechsel = Pflicht-Reindex.** Voyage liefert 1024-dim-, watsonx/
> Granite 768-dim-Vektoren. Ein Provider-Wechsel ändert die Vektor-Dimension —
> bestehende Embeddings im Index sind danach inkompatibel (Cosine-Vergleich
> zwischen unterschiedlichen Dimensionen ist nicht sinnvoll). Nach dem Umstellen
> auf watsonx **immer** einen vollständigen Backfill fahren:
> `POST /api/authoring/reindex` (ohne slug = alle Kurse neu embedden).

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
| `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `WATSONX_PROJECT_ID` / `WATSONX_URL` / `RAG_RELEVANCE_THRESHOLD` | nein | RAG-Embeddings (Default watsonx/granite-embedding-278m; Voyage nur per `EMBEDDING_PROVIDER=voyage`); siehe 5a |
| `WATSONX_PROJECT_ID` / `WATSONX_URL` / `WATSONX_API_VERSION` | nein | nur bei `EMBEDDING_PROVIDER=watsonx`; siehe 5a |

**Aus Secret (geheim):** `DATABASE_URL`, `PAYLOAD_SECRET`, `OIDC_CLIENT_SECRET`,
optional `OIDC_SESSION_SECRET`; für den Tutor optional `LLM_API_KEY` und
`VOYAGE_API_KEY` bzw. `WATSONX_API_KEY` (s. Abschnitt 3 + 5a).

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
# Ephemer (Default) — ok OHNE Medien/Authoring, sonst Datenverlust:
dataVolume:
  type: emptyDir

# Persistent & geteilt — PFLICHT bei Medien-Uploads oder MCP/Authoring:
dataVolume:
  type: pvc
  existingClaim: fiknow-data    # bei ≥2 Replicas: ReadWriteMany (RWX)
```

> ⚠️ **IBM VPC-File-Share + non-root: PVC über eine `uid`/`gid`-StorageClass
> provisionieren.** Der VPC-File-Share wird per NFS-`root_squash` als
> `root:root` gemountet (Client-Anzeige `65534:65534`, Mode `0775`; NFSv4.1,
> `sec=sys`). Ein non-root-Pod (`uid 1001`) kann **nicht** hineinschreiben →
> `mkdir /data/bundles` scheitert mit **EACCES**.
>
> **Kein SecurityContext-Trick hilft** (alle empirisch verifiziert): `fsGroup`
> wird bei RWX übersprungen (CSI `fsGroupPolicy=ReadWriteOnceWithFSType` → nur
> RWO); `supplementalGroups` honoriert der NFS-Server (AUTH_SYS/`manage-gids`)
> nicht; die **primäre** GID greift wegen `root_squash` ebenfalls nicht (der
> reale Owner ist root, nur als 65534 *angezeigt*); ein `chown`-**initContainer
> als root** ist durch `runAsNonRoot`/Pod-Security „restricted" blockiert.
>
> **Lösung (IBM-dokumentiert):** Der VPC-File-CSI-Treiber setzt über die
> StorageClass-Parameter `uid`/`gid` den `initial_owner` des Shares beim
> Anlegen — server-seitig, am `root_squash` vorbei. Manifest:
> [`deploy/ibmcloud/storageclass-fiknow.yaml`](ibmcloud/storageclass-fiknow.yaml)
> (`uid: "1001"`, `gid: "1001"`; übrige Parameter aus der bestehenden SC
> übernehmen). Danach `fiknow-data` über diese Klasse (neu) provisionieren →
> Share gehört real `1001:1001`, die Chart-Default-Identität passt, **kein**
> `podSecurityContext`-Override nötig. Reprovisionierung (bei leerem `/data`
> risikolos):
>
> 1. `kubectl apply -f deploy/ibmcloud/storageclass-fiknow.yaml`
> 2. `kubectl -n fiknow scale deploy/fiknow --replicas=0`
> 3. `kubectl -n fiknow delete pvc fiknow-data` (Retain → alter Share bleibt,
>    später manuell aufräumen)
> 4. neuen PVC `fiknow-data` mit `storageClassName: ibmc-vpc-file-fiknow-1001`
>    (RWX, 20Gi) anlegen und Bindung abwarten
> 5. `helm upgrade …` + `kubectl -n fiknow scale deploy/fiknow --replicas=2`
> 6. Verify: `kubectl -n fiknow exec deploy/fiknow -- sh -c 'id; mkdir -p
>    /data/bundles /data/media && echo OK && ls -ld /data'` → `/data` gehört
>    `1001 1001`, `OK`.

> ⚠️ **Binär-Assets liegen im Dateisystem, NICHT in der DB — persistenter
> Speicher nötig.** In Postgres stehen nur die strukturierten Kursdaten; die
> eigentlichen Dateien liegen unter `/data`:
> - **Payload-Medien** (`/data/media`) — Bilder/Uploads aus der Admin-/Kurator-UI,
>   **unabhängig von MCP**.
> - **Kurs-Bundles** (`/data/bundles`) — die re-editierbare Quelle, geschrieben
>   vom Authoring (Web-UI **oder** MCP).
>
> Mit dem `emptyDir`-Default sind diese Dateien **pro Pod isoliert**, gehen bei
> jedem Neustart verloren, und bei ≥2 Replicas sieht jeder Pod andere Dateien.
> **Sobald irgendetwas zur Laufzeit hochgeladen oder authored wird** (Medien
> ODER Kurse), MUSS daher `dataVolume.type: pvc` mit einem **ReadWriteMany-PVC**
> (RWX) gesetzt sein — oder, wenn kein RWX verfügbar ist, `replicaCount: 1` mit
> einem RWO-PVC (konsistent, aber ohne HA). Nur ein rein statisches Deployment
> (Kurse als MDX im Image, keine Uploads) kommt beim `emptyDir`-Default aus.
>
> Das Chart erzwingt wenigstens den klarsten Fall: Mit `MCP_ENABLED=true` **und**
> `dataVolume.type` ≠ `pvc` bricht `helm install` ab (fail-fast). Den Medien-Fall
> kann das Chart nicht erkennen — daher hier explizit dokumentiert.
>
> **Spec-Hinweis:** Die SaaS-Vorgabe bevorzugt für persistente Nutzdaten
> **DB und/oder S3-kompatiblen Objektspeicher** statt lokalem FS/NFS. Ein
> RWX-PVC erfüllt die Funktion, ist aber die vom Betrieb weniger gewünschte
> Variante — ein S3-Storage-Adapter für Medien/Bundles wäre die saubere
> Langfrist-Lösung (offener Punkt, siehe Bericht/COMPLIANCE).

**DB-Connection-Pool.** Pro Pod öffnen Drizzle- **und** Payload-Pool je
`DB_POOL_MAX` (Default 5) Verbindungen → **2 × `DB_POOL_MAX` pro Pod**. Über
alle Replicas muss gelten:

```
2 × DB_POOL_MAX × replicaCount  ≤  max_connections der Managed-DB (mit Reserve)
```

Default (5, 2 Replicas) = 20 Connections. Bei mehr Replicas oder kleiner DB
`DB_POOL_MAX` senken.

**Hochverfügbarkeit.** Das Chart liefert ein **PodDisruptionBudget**
(`minAvailable: 1`, ab ≥2 Replicas sinnvoll) und **topologySpreadConstraints**
(verteilt Pods über Nodes, `ScheduleAnyway` → blockiert Single-Node nicht).
Beides über `podDisruptionBudget` / `topologySpreadConstraints` in `values.yaml`
steuerbar.

**Lieferkette.** Die CI hängt dem Image eine **SBOM (SPDX)** als Artefakt an und
führt einen informativen **Grype-Scan** aus (das verbindliche Gate bleibt eure
Plattform). Das Helm-Chart wird als **OCI-Artefakt** publiziert (s. Abschnitt 5).

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

## 7b. Retention-Purge (DSGVO/DSG, ADR 0006)

Ein **CronJob** (`templates/cronjob.yaml`, Default: **aus** —
`cronjob.retentionPurge.enabled: false`) löscht nachts abgelaufene
**`training_assignments`-Nachweise** nach Ablauf der Frist
(`FIKNOW_RETENTION_YEARS`, Default 3 Jahre). Betroffen ist **ausschliesslich**
diese Nachweis-Tabelle — Klasse-B-Daten und Keycloak-Nutzerkonten sind **nicht**
betroffen (Keycloak verwaltet Nutzer:innen selbst, s. Abschnitt 2.4).

Der Job ist ein **ephemerer Batch-Pod**: dasselbe Image wie das Deployment,
nur anderes `command` (`node_modules/.bin/tsx scripts/retention-purge.ts
--confirm`). Ein Sicherheits-Override (`RETENTION_PURGE_DRY_RUN`, gesteuert
über `cronjob.retentionPurge.dryRun` in den Values) erzwingt serverseitig
einen dry-run, selbst wenn `--confirm` gesetzt ist.

> **Erwartung: 0 gelöschte Zeilen, auf absehbare Zeit.** FINKNOW läuft erst seit
> 2026 produktiv — bei einer 3-Jahres-Frist wird der Job also noch länger
> nichts zu löschen finden. Das ist **kein Fehler**: Der nächtliche Lauf
> validiert, dass der Mechanismus funktioniert (Job startet, verbindet sich
> zur DB, terminiert erfolgreich), nicht dass er bereits etwas tut.

**Aktivieren** (z. B. in einer Werte-Datei):
```yaml
cronjob:
  retentionPurge:
    enabled: true
    dryRun: false          # true = zählt nur, löscht nichts
    timeZone: "Europe/Zurich"
```

**Manuell auslösen** (Ad-hoc-Job aus dem CronJob, z. B. zum Testen):
```bash
kubectl create job --from=cronjob/<release>-retention-purge \
  retention-manual-$(date +%s) -n <namespace>
```

**Logs ansehen:**
```bash
kubectl logs job/<jobname> -n <namespace>
```

**Audit-Trail prüfen** (PII-frei — nur Zählwerte/Zeitstempel, keine Personendaten):
```sql
select ran_at, dry_run, retention_years, deleted_count, cutoff_date
from retention_purge_runs
order by ran_at desc
limit 10;
```

**Dry-run erzwingen ohne Redeploy:** `cronjob.retentionPurge.dryRun: true`
setzen und `helm upgrade` ausführen — das setzt `RETENTION_PURGE_DRY_RUN=1`
im Container-Env, unabhängig vom `--confirm`-Flag im `command`.

---

## 7c. Update auf dieses Release (Betreiber-Prozedur)

Dieses Release bringt zwei **opt-in** Änderungen: Retention-Purge (Abschnitt 7b)
und den Embedding-Provider watsonx/granite (Abschnitt 5a). Das Deployen des
neuen Images allein ist unkritisch — es legt beim Boot nur die neue, leere und
PII-freie Tabelle `retention_purge_runs` an; beide Features aktiviert man
bewusst über Helm-Values bzw. Env. Die folgenden Schritte sind unabhängig
voneinander; Schritt 3 ist optional.

**Schritt 1 — Image deployen (Pflicht).**
Neues Image ausrollen wie gewohnt via `helm upgrade --install …` (Befehl siehe
Abschnitt 5). Beim Pod-Start läuft das Auto-Migrate und legt
`retention_purge_runs` an (Drizzle-Migration 0008). Erwartet im Log:
`[auto-migrate] … fertig in <n> ms` (Abschnitt 6). Klemmt die Boot-Migration,
ist `SKIP_MIGRATIONS` der dokumentierte Notausstieg (Abschnitt 7 / 7a).

> Drizzle-Migrationen sind **vorwärts-only** (kein Auto-Down). Bei einem
> Image-Rollback bleibt die neue Tabelle einfach stehen — das ist harmlos.

Verifikation:
```bash
kubectl -n fiknow get pods -l app.kubernetes.io/instance=fiknow   # alle Ready
curl -fsS https://app.fiknow.example.com/api/health
psql "$DATABASE_URL" -c 'select count(*) from retention_purge_runs;'   # → 0
```

**Schritt 2 — Retention-Purge aktivieren (DSGVO, empfohlen).**
In der eigenen Prod-Werte-Datei den `cronjob:`-Block setzen:
```yaml
cronjob:
  retentionPurge:
    enabled: true
    dryRun: false
    timeZone: "Europe/Zurich"
```
> ⚠️ `values-ibm-production.yaml` ist gitignored und existiert nur lokal beim
> Betreiber — der Block muss in **eurer eigenen** Werte-Datei ergänzt werden.
> Vorlage: `values-ibm-production.example.yaml`, Details siehe Abschnitt 7b.

Danach erneut `helm upgrade` (Befehl siehe Abschnitt 5).

Verifikation:
```bash
kubectl -n <ns> get cronjob   # zeigt <release>-retention-purge
kubectl create job --from=cronjob/<release>-retention-purge \
  retention-manual-$(date +%s) -n <namespace>   # Befehl aus 7b
```
Log prüfen (Befehl aus 7b) — erwartet `deleted_count=0`; das ist korrekt
(Begründung siehe 7b, „Erwartung: 0 gelöschte Zeilen"). Zusätzlich die
Audit-Zeile prüfen (SQL aus 7b).

**Schritt 3 — Embedding-Provider auf watsonx/granite umstellen (optional, nur
mit vorhandenem watsonx-Projekt/Key).**

> ⚠️ **Reihenfolge unbedingt einhalten** — sonst laufen Tutor-Antworten
> kurzzeitig auf gemischten Vektor-Dimensionen (Voyage 1024 vs. watsonx/Granite
> 768, s. Abschnitt 5a).

3a. Smoke-Test **vor** der Umstellung, ohne DB-Zugriff:
```bash
EMBEDDING_PROVIDER=watsonx WATSONX_API_KEY=… WATSONX_PROJECT_ID=… \
WATSONX_URL=https://eu-de.ml.cloud.ibm.com \
npx tsx scripts/embed-smoketest.ts
```
Muss „Provider erreichbar, 768 Dimensionen" melden.

3b. Env setzen — `EMBEDDING_PROVIDER`, `WATSONX_PROJECT_ID`, `WATSONX_URL`,
`EMBEDDING_MODEL` in die ConfigMap (`config.extra`), `WATSONX_API_KEY` ins
Secret (Tabellen/Snippets siehe Abschnitt 5a). Danach `helm upgrade`.

3c. **Pflicht-Backfill**, weil die Vektor-Dimension von 1024 auf 768 wechselt:
```
POST /api/authoring/reindex
```
ohne `slug` → alle Kurse werden neu embedded (Abschnitt 5a).

Verifikation: `course_index_state` aller Kurse steht auf `indexed`; der Tutor
liefert wieder gegroundete Antworten.

**Rollback.**
- Retention pausieren, ohne den Job auszubauen: `cronjob.retentionPurge.dryRun:
  true` setzen + `helm upgrade` — löscht ab sofort nichts mehr (Abschnitt 7b).
  Ganz deaktivieren: `enabled: false`. Die Tabelle `retention_purge_runs`
  bleibt in beiden Fällen bestehen (harmlos).
- watsonx zurück auf Voyage: `EMBEDDING_PROVIDER` entfernen (oder `=voyage`
  setzen), `helm upgrade`, danach erneut Backfill fahren (Schritt 3c) — die
  Dimension wechselt zurück auf 1024.
- Image-Rollback: `helm rollback <release> <rev>`; die neu angelegte Tabelle
  bleibt bestehen (unschädlich, s. Schritt 1).

---

## 7d. Update auf v0.3.0 (Land-Enum-Migration + Rollen-Mapping)

Dieses Release speist `profiles.land` beim Login aus dem OIDC-`country`-Claim
(Keycloak = Source of Truth) und erzwingt ein festes Land-Vokabular
DE/CH/LUX. Zwei Betreiber-Aktionen: eine **Pflicht-Vorabprüfung vor dem
Deploy** (die Boot-Migration macht einen nicht rückwärts-fähigen Enum-Cast)
und die Anpassung von `OIDC_ROLE_MAP` auf die echten Realm-Namen.

**Schritt 0 — Pflicht-Vorabprüfung VOR dem Deploy (kritisch).**
Das Auto-Migrate legt den Enum-Cast beim Pod-Boot an (Abschnitt 6). Enthält
die Authoring-Tabelle einen Land-Wert außerhalb von {DE, CH, LUX}, schlägt
der `USING land::enum`-Cast fehl → der neue Pod läuft in einen
**Crash-Loop**. Deshalb ZUERST prüfen:
```bash
psql "$DATABASE_URL" -c \
  "select distinct land from payload.training_requirements_target_land_scope;"
```
Erwartet: nur `DE`, `CH`, `LUX` — oder leer. Jeder abweichende Wert (z. B.
`LU`, `de`, `Deutschland`, Leerzeichen) MUSS vor dem Deploy korrigiert
werden, z. B.:
```sql
-- an die real gefundenen Werte anpassen:
update payload.training_requirements_target_land_scope set land = 'LUX' where land = 'LU';
```
Erst weiter zu Schritt 1, wenn die DISTINCT-Abfrage ausschließlich erlaubte
Werte liefert.

> Betrifft NUR das Authoring-Feld `landScope`. `profiles.land` (Freitext,
> claim-gespeist) und `role_assignments.scope_land` (per CLI validiert)
> werden NICHT ge-enum-castet und brauchen keine Vorabprüfung.

**Schritt 1 — Image deployen (Pflicht).**
Neues Image via `helm upgrade --install …` ausrollen (Befehl siehe
Abschnitt 5). Beim Boot appliziert das Auto-Migrate die
Payload-Migration `20260804_095928_add_land_scope_enum` (Enum-Typ anlegen
+ Spalte casten). Erwartet im Log: `[auto-migrate] … fertig in <n> ms`
(Abschnitt 6). Klemmt die Boot-Migration, ist `SKIP_MIGRATIONS` der
dokumentierte Notausstieg (Abschnitt 7 / 7a).

Verifikation:
```bash
kubectl -n fiknow get pods -l app.kubernetes.io/instance=fiknow   # alle Ready
curl -fsS https://app.fiknow.example.com/api/health
psql "$DATABASE_URL" -c "\dT+ payload.enum_training_requirements_target_land_scope_land"   # Enum existiert mit DE/CH/LUX
```

**Schritt 2 — OIDC_ROLE_MAP auf die echten Realm-Namen setzen (Pflicht für
Rollen).**
Der reale Token nutzt die Gruppen `/Administration`, `/Kuratoren`,
`/Lernende` (NICHT die Beispiel-Namen `fiknow-curator`/`fiknow-admin`). In
der eigenen Prod-Werte-Datei:
```yaml
config:
  OIDC_ROLE_MAP: "Administration:admin,Kuratoren:curator"
```
`Lernende` braucht keinen Eintrag (Default learner); die OpCo-Gruppe
`FINNOFLEET BMI GmbH` wird bewusst nicht gemappt. Keys sind
case-insensitiv und matchen den vollen Gruppenpfad ODER das letzte
Segment. Danach `helm upgrade`.
> ⚠️ `values-ibm-production.yaml` ist gitignored — der Wert muss in EURER
> eigenen Werte-Datei gesetzt werden (Vorlage:
> `values-ibm-production.example.yaml`).

Verifikation: als Kurator/Admin einloggen und Rolle prüfen; optional die
claim-gespeiste Land-Zuordnung kontrollieren:
```sql
select land, count(*) from public.profiles group by land;
```

**Rollback.**
- Die Payload-Migration ist vorwärts-only (Auto-Migrate fährt kein Down).
  Bei einem Image-Rollback (`helm rollback <release> <rev>`) bleiben
  Enum-Typ und Spaltentyp bestehen; das ältere Image liest die Land-Werte
  weiterhin korrekt (Enum serialisiert zu seinem Label-String) — kein
  Datenverlust. Ein echtes Zurück auf `varchar` erfordert das manuelle
  Ausführen des `down`-SQL aus der Migration.
- `OIDC_ROLE_MAP`: alten Wert wiederherstellen + `helm upgrade`.

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
