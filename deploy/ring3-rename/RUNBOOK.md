# Runbook — Ring 3 Infra-Slug-Rename (`fiknow` → `finknow`)

> Bezug: [`docs/RING3-BRIEFING-INFRA.md`](../../docs/RING3-BRIEFING-INFRA.md)
> (Blast-Radius-Tabelle, Cutover-Reihenfolge auf Entscheidungsebene) und
> [`docs/RENAME-FINKNOW-PLAN.md`](../../docs/RENAME-FINKNOW-PLAN.md) (Ring 1/2,
> bereits erledigt). Dieses Runbook ist die **ausführende** Ebene für Ring 3,
> nachdem Infra/IT entschieden hat, den Slug tatsächlich umzuziehen.
>
> Alle hier beschriebenen In-Place-Schritte wurden auf einem
> **Wegwerf-Docker-Stack** nachgestellt und verifiziert (Postgres
> `postgres:16-alpine`, Keycloak `quay.io/keycloak/keycloak:26.0`). Die
> exakten Befehle stehen in [`migrate-finknow.sh`](./migrate-finknow.sh).

---

## 1. Was in-place geht vs. was Recreate braucht

| Komponente | Verfahren | Downtime |
|---|---|---|
| Postgres-DB (`fiknow`→`finknow`) | **In-Place** (`ALTER DATABASE ... RENAME TO ...`) | Kurz (aktive Verbindungen werden getrennt) |
| Keycloak-Realm (`fiknow`→`finknow`) | **In-Place** (`kcadm.sh update realms/fiknow -s realm=finknow`) | **Atomar** — alter Issuer-Pfad ist sofort weg (404) |
| Keycloak-Realm-Rollen (`fiknow-curator`/`-admin`) | **In-Place** (`kcadm.sh update roles/...`), Zuordnungen bleiben erhalten | Keine (rein administrativ) |
| Keycloak-Gruppen (`/FIKNOW/*`) | **In-Place** (`kcadm.sh update groups/<id>`), Subgruppen-Pfade folgen automatisch | Keine |
| PVC Medien/Bundles (`fiknow-data`) | **Recreate + Copy** — PVC-Namen sind **immutable** in K8s | Ja, für die Dauer des Copy-Jobs (Quelle sollte read-only sein) |
| Helm-Release / Chart-Name | **Recreate** (`helm uninstall` + `helm install`, oder Ressourcen-Adoption) | Kurzer Neustart aller Pods |
| Image-Repository (`ghcr.io/finnofleet/ff-fiknow`→`ff-finknow`) | Folgt automatisch aus Ring-2-Repo-Rename; `image.repository` im Deploy nachziehen | Keine, wenn im selben Fenster gemacht |
| DNS/Domain | Nur falls Domain mitgewechselt wird — unabhängig vom Slug | DNS-TTL-abhängig |

**Kernaussage:** Postgres-DB, Keycloak-Realm/Rollen/Gruppen sind **in-place**
umbenennbar und wurden hier lokal end-to-end getestet. Der PVC ist der
**einzige zwingende Recreate-Fall** — nicht weil es "einfacher" wäre, sondern
weil Kubernetes PVC-Namen strukturell immutable sind.

---

## 2. Voraussetzungen

- Wartungsfenster mit Infra/IdP-Team abgestimmt (siehe Briefing §5/§6).
- Zugriff: `kubectl`-Kontext auf den Ziel-Cluster/Namespace, DB-Admin-Zugang
  zur externen Postgres-Instanz, Keycloak-Admin-Credentials (`kcadm.sh`
  oder Admin-REST-Zugriff auf den Realm).
- `docker`, `jq`, `curl` lokal (für `migrate-finknow.sh`, falls von einem
  Bastion/CI-Runner mit Zugriff auf die Ziel-Instanzen ausgeführt).
- Aktuelles Backup/Snapshot der Postgres-DB **und** ein Keycloak-Realm-Export
  (`kcadm.sh get realms/fiknow` / Admin-Konsole „Export") **vor** Beginn.
- Alle drei Cutover-Teile (DB, Keycloak, App-Config) müssen **im selben
  Fenster** passieren — kein Teil-Cutover über Nacht stehen lassen (siehe
  §5 unten, "Nichts halb machen").

---

## 3. Reihenfolge / Wartungsfenster

Ein **atomares Fenster**, keine schrittweise Umstellung über mehrere Tage:

```
0. Vorbereitung (VOR dem Fenster, ohne Nutzer-Impact):
   - Neuer PVC anlegen + Medien/Bundles per Copy-Job vorab kopieren
     (Quelle bleibt bis zum Cutover die produktive, read-write).
   - Neues Helm-Chart/Values vorbereiten (noch nicht ausgerollt).
   - Neue DNS-Records anlegen, falls Domain wechselt (noch nicht geschwenkt).

1. App stoppen (Deployment auf 0 Replicas skalieren, oder Wartungsseite).

2. Postgres-DB umbenennen (migrate-finknow.sh --skip-keycloak --skip-media).
   -> aktive App-Verbindungen sind ohnehin durch Schritt 1 weg.

3. Keycloak: Realm + Rollen + Gruppen umbenennen
   (migrate-finknow.sh --skip-postgres --skip-media).
   -> AB HIER ist der alte Issuer-Pfad tot (404). Login über die alte
      Konfiguration ist ab diesem Moment nicht mehr möglich.

4. Medien-Volume/PVC: finalen Delta-Copy nachziehen, falls seit Schritt 0
   noch etwas geschrieben wurde (Quelle war ja bis Schritt 1 live).

5. App-Config aktualisieren + Helm-Release umbenennen
   (siehe §4.4-4.6) und mit neuem Image-Tag/Repository ausrollen.

6. App wieder hochskalieren, Smoke-Test (siehe §5 Verifikation).

7. DNS schwenken (falls betroffen), alte Redirect-URIs vorübergehend
   im Keycloak-Client behalten (Fallback-Fenster).

8. Nachlauf: alten Helm-Release/PVC/Image erst nach Bewährungsphase abbauen.
```

Reine Rename-Schritte (2+3) dauern in der Praxis Sekunden; die tatsächliche
Downtime wird von Schritt 1 (App-Stop) und 5-6 (Neu-Rollout) dominiert.

---

## 4. Schritt-für-Schritt

### 4.1 Postgres-DB (`fiknow` → `finknow`) — in-place, per Script

```bash
PGHOST=<host> PGPORT=<port> PGUSER=<admin-user> PGPASSWORD=<...> PGADMINDB=postgres \
  ./migrate-finknow.sh --skip-keycloak --skip-media --dry-run   # erst prüfen
  ./migrate-finknow.sh --skip-keycloak --skip-media             # dann ausführen (fragt nach)
```

**Getestete Kernbefehle** (siehe `rename_postgres_db()` in `migrate-finknow.sh`):

```sql
-- Verbindung IMMER zu PGADMINDB (z. B. "postgres"), NIE zur Alt-/Ziel-DB selbst!
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'fiknow' AND pid <> pg_backend_pid();

ALTER DATABASE fiknow RENAME TO finknow;
```

**Gotchas (verifiziert):**
- Ohne das Trennen aktiver Verbindungen schlägt der Rename fehl:
  `ERROR: database "fiknow" is being accessed by other users`.
- Der ausführende Client darf **nicht** mit der umzubenennenden DB selbst
  verbunden sein — auch nicht mit der Zieldatenbank:
  `ERROR: current database cannot be renamed`. Deshalb verbindet sich das
  Script immer über `PGADMINDB` (Default `postgres`).
- Tabellen/Zeilen/Sequences/Constraints bleiben unverändert erhalten — das
  ist ein reiner Katalog-Rename, keine Datenkopie.

### 4.2 Keycloak: Realm, Rollen, Gruppen (`fiknow` → `finknow`) — in-place, per Script

```bash
KC_URL=https://<keycloak-host> KC_ADMIN_REALM=master \
KC_ADMIN_USER=<admin> KC_ADMIN_PASSWORD=<...> \
  ./migrate-finknow.sh --skip-postgres --skip-media --dry-run
  ./migrate-finknow.sh --skip-postgres --skip-media
```

**Getestete Kernbefehle** (siehe `rename_keycloak()`):

```bash
kcadm.sh config credentials --server "$KC_URL" --realm master --user admin --password ...

kcadm.sh update realms/fiknow -s realm=finknow

kcadm.sh update roles/fiknow-curator -r finknow -s name=finknow-curator
kcadm.sh update roles/fiknow-admin   -r finknow -s name=finknow-admin

# Gotcha, siehe unten:
kcadm.sh update roles/default-roles-fiknow -r finknow -s name=default-roles-finknow

# Gruppen werden per interner UUID adressiert, nicht per Name:
kcadm.sh update groups/<uuid-der-FIKNOW-gruppe> -r finknow -s name=FINKNOW
```

**Gotchas (verifiziert gegen Keycloak 26.0):**
- Realm-Rename ist **sofort und atomar** wirksam: der alte Pfad
  `/realms/fiknow/...` liefert direkt danach `404`. Es gibt **keine**
  Übergangsphase, in der beide Pfade parallel funktionieren — App-Config
  (`OIDC_ISSUER`) muss also **im selben Moment** umgestellt sein, sonst
  bricht Login sofort.
- Rollen-Rename behält alle bestehenden Zuweisungen (User→Rolle,
  Gruppe→Rolle) bei — Keycloak referenziert intern per ID, nicht per Name.
  Verifiziert: eine Gruppe mit `realmRoles: ["fiknow-admin"]` zeigt nach dem
  Rollen-Rename automatisch `realmRoles: ["finknow-admin"]`, ohne dass die
  Gruppenzuordnung angefasst wurde.
- **Gotcha `default-roles-<realm>`:** Die beim Anlegen eines Realms
  automatisch erzeugte Composite-Rolle `default-roles-fiknow` wird vom
  Realm-Rename **nicht automatisch mitbenannt** — sie heisst nach dem Rename
  weiterhin `default-roles-fiknow`, obwohl der Realm jetzt `finknow` heisst.
  Funktional ist das unkritisch (Keycloak referenziert `realm.defaultRole`
  per interner ID, nicht per Name — neue User bekommen die Default-Rolle
  trotzdem korrekt zugewiesen), aber für Konsistenz/Admin-Hygiene sollte sie
  manuell nachgezogen werden (im Script bereits enthalten).
- Gruppen-Rename läuft über die interne Gruppen-UUID
  (`kcadm.sh update groups/<uuid>`), **nicht** über den Namen. Nach dem
  Rename der Top-Level-Gruppe `FIKNOW`→`FINKNOW` aktualisieren sich die
  Pfade der Subgruppen automatisch (`/FIKNOW/Admins` → `/FINKNOW/Admins`),
  ohne dass die Subgruppen selbst angefasst werden müssen.
- Alles ging **in-place** — nichts musste hier per Export/Import gelöst
  werden.

**Verifikation:**

```bash
curl -s https://<keycloak-host>/realms/finknow/.well-known/openid-configuration \
  | jq -r '.issuer'
# erwartet: https://<keycloak-host>/realms/finknow

# Token eines Testusers ziehen und Claims prüfen (realm_access.roles, groups):
curl -s -X POST https://<keycloak-host>/realms/finknow/protocol/openid-connect/token \
  -d "client_id=edu-platform" -d "client_secret=<secret>" \
  -d "grant_type=password" -d "username=<test-user>" -d "password=<...>" \
  -d "scope=openid" | jq -r '.id_token' \
  | cut -d. -f2 | base64 -d 2>/dev/null | jq '.realm_access, .groups'
# erwartet: realm_access.roles enthält "finknow-admin"/"finknow-curator",
#           groups enthält "/FINKNOW/Admins" bzw. "/FINKNOW/Curators"
```
> Hinweis: `directAccessGrantsEnabled` ist im produktiven Client i. d. R.
> `false` (Standard-Flow über Browser). Für einen reinen Claims-Test kann es
> temporär am Test-Client aktiviert werden, oder der Test läuft über den
> normalen Browser-Login-Flow.

### 4.3 Medien/Bundle-Storage — PVC-Recreate + Copy-Job (kein In-Place möglich)

Lokal getestet als Docker-Volume-Äquivalent (siehe
`migrate_media_volume()` in `migrate-finknow.sh`):

```bash
docker volume create ring3-finknow-data
docker run --rm -v ring3-fiknow-data:/from -v ring3-finknow-data:/to \
  alpine sh -c 'cp -a /from/. /to/'

# Verifikation per Checksumme:
docker run --rm -v ring3-fiknow-data:/data  alpine sh -c "cd /data && find . -type f | sort | xargs sha256sum"
docker run --rm -v ring3-finknow-data:/data alpine sh -c "cd /data && find . -type f | sort | xargs sha256sum"
# -> beide Listen müssen identisch sein (verifiziert: byte-identisch, inkl. Datei-Reihenfolge/Hashes)
```

**K8s-Äquivalent** (produktiv auszuführen, PVC-Name `fiknow-data` ist
**immutable**, deshalb zwingend Recreate statt Rename):

```yaml
# 1. Neuen PVC anlegen (gleiche StorageClass, ausreichend Größe)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: finknow-data
spec:
  accessModes: ["ReadWriteMany"]
  storageClassName: ibmc-vpc-file-fiknow-1001
  resources:
    requests:
      storage: <gleiche Größe wie fiknow-data>
---
# 2. Copy-Job (App gestoppt oder Quelle read-only während der Kopie)
apiVersion: batch/v1
kind: Job
metadata:
  name: finknow-data-copy
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: copy
          image: alpine:3
          command: ["sh", "-c", "cp -a /from/. /to/ && echo done"]
          volumeMounts:
            - {name: from, mountPath: /from}
            - {name: to, mountPath: /to}
      volumes:
        - name: from
          persistentVolumeClaim: {claimName: fiknow-data}
        - name: to
          persistentVolumeClaim: {claimName: finknow-data}
```

Verifikation: Job-Logs prüfen (`kubectl logs job/finknow-data-copy`) + über
einen Debug-Pod mit beiden PVCs gemountet `find . -type f | sort | xargs
sha256sum` auf beiden Seiten vergleichen — exakt das oben lokal getestete
Vorgehen, nur PVC statt Docker-Volume.

Anschliessend `persistence.existingClaim` (bzw. das äquivalente Helm-Value)
auf `finknow-data` umstellen und das Deployment neu ausrollen.

### 4.4 Helm-Release / Chart-Name

- Chart liegt unter `deploy/helm/fiknow/` (`Chart.yaml`: `name: fiknow`).
  Für den neuen Slug: Chart-Verzeichnis/`name` auf `finknow` ändern (bzw.
  neuen Chart-Pfad `deploy/helm/finknow/` pflegen).
- `fullname` in `_helpers.tpl` leitet sich aus `{release}-{chart}` ab →
  **alle** K8s-Objektnamen (Deployment, Service, ServiceAccount, Secret
  `-env`, CronJob) ändern sich mit. Das ist **kein In-Place-Rename**
  möglich — Vorgehen: `helm uninstall fiknow` + `helm install finknow ...`
  (oder Ressourcen-Adoption über `helm.sh/resource-policy` Annotationen,
  falls Downtime minimiert werden soll).
- Reihenfolge: PVC/Copy-Job (4.3) **vor** dem neuen Release ausführen, damit
  der neue Release den bereits befüllten `finknow-data`-PVC direkt referenzieren kann.

### 4.5 Image-Repository / OCI-Chart

- Ring-2-Repo-Rename (`ff-fiknow`→`ff-finknow` auf GitHub) lässt CI
  automatisch in das neue Paket `ghcr.io/finnofleet/ff-finknow` pushen
  (`IMAGE_NAME = github.repository`).
- `image.repository` in den Helm-Values auf `ghcr.io/finnofleet/ff-finknow`
  umstellen; `oci://ghcr.io/finnofleet/charts/finknow` als neuen Chart-OCI-Pfad
  verwenden.
- **Muss im selben Fenster wie 4.4 passieren** — ein alter Release-Name mit
  neuem Image-Pfad (oder umgekehrt) ist ein inkonsistenter Zwischenzustand.

### 4.6 App-Config (Helm-Values / Secret)

Diese Werte **gemeinsam** mit dem Keycloak-Cutover (4.2) umstellen, sonst
divergieren App und IdP:

| Env / Value | Alt | Neu |
|---|---|---|
| `OIDC_ISSUER` | `.../realms/fiknow` | `.../realms/finknow` |
| `OIDC_ROLE_MAP` | `fiknow-curator:curator,fiknow-admin:admin` | `finknow-curator:curator,finknow-admin:admin` |
| `FIKNOW_RETENTION_YEARS` | (Env-Var-**Name** ändert sich) | `FINKNOW_RETENTION_YEARS` — **Wert unverändert** (ADR 0006, DSB-Rücksprache vorher, siehe Briefing §6) |
| `image.repository` | `ghcr.io/finnofleet/ff-fiknow` | `ghcr.io/finnofleet/ff-finknow` |
| Helm-Chart-Name | `fiknow` | `finknow` |
| PVC-Claim | `fiknow-data` | `finknow-data` (siehe 4.3) |

`OIDC_CLIENT_ID` (`edu-platform`) bleibt **unverändert** — enthält keinen Slug.

### 4.7 DNS / Redirect-URIs

- Nur relevant, falls die Domain (`fiknow-test.jcloud.ik-server.com`) im
  selben Zug wechselt (unabhängig vom Slug-Rename, siehe Briefing §6).
- Falls Domain wechselt: neue Redirect-URIs **vor** dem Cutover am
  Keycloak-Client `edu-platform` ergänzen (nicht ersetzen — alte URI
  übergangsweise als Fallback behalten, bis DNS vollständig propagiert ist).

---

## 5. Verifikation (nach dem Fenster)

1. **Postgres:** `\c finknow` (nie mehr `\c fiknow` — DB existiert nicht
   mehr) → Tabellen/Zeilen zählen, mit Vorher-Snapshot vergleichen.
2. **Keycloak Discovery:**
   `curl .../realms/finknow/.well-known/openid-configuration | jq .issuer`
   → muss `.../realms/finknow` sein.
3. **Login-Flow Ende-zu-Ende:** Test-User (curator/admin/learner) loggt sich
   über die App ein, App-Rolle (`curator`/`admin`) wird korrekt aus dem
   Token gemappt (Beweis: `OIDC_ROLE_MAP` + Realm-Rollen sind synchron).
4. **Medien:** stichprobenartig ein Kursbild/Bundle aus dem neuen PVC laden,
   Dateizahl/Checksummen-Vergleich (siehe §4.3) nochmal gegenprüfen.
5. **Helm/K8s:** `kubectl get pods,svc,cronjob -l app.kubernetes.io/instance=finknow`
   zeigt alle erwarteten Objekte in `Running`/`Ready`.
6. **Retention-Cron:** `FINKNOW_RETENTION_YEARS` im laufenden CronJob-Pod
   prüfen (`kubectl exec ... -- env | grep RETENTION`), Wert muss dem alten
   `FIKNOW_RETENTION_YEARS`-Wert entsprechen (Default 3 Jahre).

---

## 6. Rollback

Da Realm- und DB-Rename **atomar und sofort** wirken, ist ein Rollback
symmetrisch — mit der Namen einfach vertauscht:

```bash
# Postgres zurück:
OLD_SLUG=finknow NEW_SLUG=fiknow ./migrate-finknow.sh --skip-keycloak --skip-media

# Keycloak zurück:
OLD_SLUG=finknow NEW_SLUG=fiknow ./migrate-finknow.sh --skip-postgres --skip-media
```

- Solange der alte PVC (`fiknow-data`) noch nicht gelöscht wurde, ist auch
  der Medien-Rollback simpel: Helm-Value zurück auf `fiknow-data` (kein
  erneuter Copy nötig — Original-Volume ist unverändert liegen geblieben,
  sofern es nicht parallel beschrieben wurde).
- Helm-Release-Rollback: `helm uninstall finknow` + `helm install fiknow ...`
  mit den alten Values.
- **Wichtig:** Rollback ist nur sauber, solange die Bewährungsphase (§3,
  Schritt 8) noch läuft und alte Ressourcen (PVC, Release, Realm-Backup)
  noch nicht abgebaut sind. Deshalb: alten Kram **erst nach** einer
  definierten Bewährungsfrist entsorgen.
- Keycloak-Realm-Export vor dem Cutover (§2, Voraussetzungen) ist der
  Fallback, falls der In-Place-Rückweg aus irgendeinem Grund nicht mehr
  greift (z. B. weil in der Zwischenzeit neue User/Rollen im neuen Realm
  angelegt wurden, die beim Rückwärts-Rename kollidieren könnten).

---

## 7. Was NICHT in-place ging

Nur **ein** Fall musste zwingend neu angelegt statt umbenannt werden:

- **PVC `fiknow-data`** — PVC-Namen sind in Kubernetes strukturell
  immutable. Es gibt keine `kubectl patch`-Operation, die das ändert.
  Lösung: neuer PVC + Copy-Job (§4.3), keine Alternative.

Alles andere (Postgres-DB, Keycloak-Realm, Keycloak-Rollen, Keycloak-Gruppen)
ist nachweislich in-place umbenennbar — verifiziert auf dem Wegwerf-Stack,
Befehle siehe `migrate-finknow.sh` und §4 oben.

Helm-Release und Image-Repository sind kein "Rename" im technischen Sinne,
sondern folgen strukturell aus der Chart-Helper-Logik
(`fullname = {release}-{chart}`) bzw. aus dem Ring-2-Repo-Rename — auch dort
ist "neu ausrollen" der richtige Weg, nicht ein Inline-Patch bestehender
K8s-Objekte.
