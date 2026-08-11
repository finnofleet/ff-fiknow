# FINKNOW — Deployment auf IBM Cloud (IKS)

Konkreter, durchgeführter Walkthrough für den Betrieb von FINKNOW auf einem
**IBM Cloud Kubernetes Service (IKS)**-Cluster. Ergänzt das generische
[`RUNBOOK.md`](RUNBOOK.md) um die **IBM-spezifischen CLI-Schritte** und die
**real aufgetretenen Stolpersteine** (allen voran die VPC-File-Netzwerkfreigabe).

> Aufgabenteilung: **[`RUNBOOK.md`](RUNBOOK.md)** = generische Voraussetzungen,
> Keycloak-Details, Config-Referenz, Troubleshooting. **Dieses Dokument** =
> der konkrete IBM-Cloud-Pfad inkl. der Dinge, die nur hier auffallen.

Referenz-Werte aus dem Erst-Deployment (anpassen):

| | |
|---|---|
| Cluster | `bm-production-cluster` (IKS, Region `eu-de`, vanilla Kubernetes) |
| Namespace | `fiknow` |
| App-Host | `fiknow.<ingress-subdomain>` (IKS-Wildcard-Subdomain) |
| Werte-Datei | [`helm/fiknow/values-ibm-production.yaml`](helm/fiknow/values-ibm-production.yaml) |

---

## 0. Tooling

```bash
ibmcloud login --sso
ibmcloud plugin install kubernetes-service cloud-databases
# kubectl + helm lokal vorausgesetzt
```

## 1. Cluster-Zugriff + Namespace

```bash
ibmcloud ks cluster config -c bm-production-cluster
kubectl get ingressclass            # erwartet: public-iks-k8s-nginx
kubectl create namespace fiknow
```

Ingress-Subdomain + mitgeliefertes Wildcard-TLS-Secret ablesen:
```bash
ibmcloud ks cluster get -c bm-production-cluster
#   "Ingress Subdomain" → App-Host = fiknow.<subdomain>
#   "Ingress Secret"    → liegt im Namespace 'default' (s. Abschnitt 4)
```

## 2. Datenbank — Databases for PostgreSQL

Instanz anlegen und Admin-Credentials ziehen:
```bash
ibmcloud resource service-instance-create fiknow-pg databases-for-postgresql standard eu-de
ibmcloud resource service-key-create fiknow-pg-key Administrator --instance-name fiknow-pg
ibmcloud resource service-key fiknow-pg-key --output json
#   → .credentials.connection.postgres : hostname, port, composed-URI (admin)
```

**Wir nutzen die Default-DB `ibmclouddb`** (keine separate DB nötig) und legen
nur einen dedizierten App-User an:
```bash
ibmcloud cdb deployment-user-create fiknow-pg fiknow <fiknow-pw>
```

Dann **einmal als admin** auf `ibmclouddb` die Rechte setzen, damit der
Auto-Migrate Schema/Funktionen/RLS anlegen darf:
```sql
GRANT CREATE ON DATABASE ibmclouddb TO fiknow;   -- darf das auth-Schema anlegen
GRANT ALL ON SCHEMA public TO fiknow;            -- PG15+: public ist nicht mehr offen für alle
```
> ⚠️ Der zweite Grant ist Pflicht: Ab PostgreSQL 15 scheitert der Migrate sonst
> mit `permission denied for schema public` beim Anlegen der `public.*`-Tabellen.

Daraus ergibt sich der `DATABASE_URL` (kommt ins Secret, Abschnitt 5):
```
postgres://fiknow:<fiknow-pw>@<host>:<port>/ibmclouddb?sslmode=require
```
`sslmode=require` ist verschlüsselt und braucht keine CA-Datei. `verify-full`
mit der ICD-CA wäre die Härtungs-Option (Backlog).

## 3. Persistenter Speicher (RWX File Storage)

FINKNOW braucht geteilten, persistenten Speicher für `/data` (Payload-Medien +
Authoring-Bundles), sobald Kurse authored oder Medien hochgeladen werden — bei
≥2 Replicas zwingend **ReadWriteMany (RWX)**. In der IBM Cloud = **VPC File
Storage** (nicht Block = nur RWO, nicht COS/s3fs = kein echtes POSIX-FS).

Der VPC-File-CSI-Treiber ist ggf. nicht vorinstalliert — als Add-on aktivieren:
```bash
ibmcloud ks cluster addon enable vpc-file-csi-driver -c bm-production-cluster
ibmcloud ks cluster addons --cluster bm-production-cluster   # auf "Normal/Ready" warten
kubectl get storageclass | grep file                          # ibmc-vpc-file-* erscheinen
```

> ⚠️ **NICHT die eingebauten `ibmc-vpc-file-*`-Klassen direkt verwenden.** Die
> legen den Share mit `uid=0/gid=0` an → er gehört `root:root` und wird per
> NFS-`root_squash` als `65534:65534` gemountet. Der non-root-Container
> (`uid 1001`) kann dann **nicht** hineinschreiben, und **kein**
> SecurityContext-Hebel behebt das: `fsGroup` wird bei RWX übersprungen (CSI
> `fsGroupPolicy=ReadWriteOnceWithFSType`), `supplementalGroups`/primäre GID
> greifen wegen `root_squash` nicht, ein root-`initContainer` ist durch die
> Härtung blockiert. (Ausführliche Herleitung: [`RUNBOOK.md`](RUNBOOK.md),
> Abschnitt „Writable Storage".)

Der non-root-konforme Weg: eine **eigene StorageClass** anlegen, die den
`initial_owner` des Shares beim Provisionieren auf `1001:1001` setzt (Parameter
`uid`/`gid` — server-seitig, am `root_squash` vorbei). Fertiges Manifest im Repo
(1:1-Kopie der `ibmc-vpc-file-retain-500-iops`, nur `uid`/`gid` = 1001):

```bash
# 1) StorageClass mit uid/gid=1001
kubectl apply -f deploy/ibmcloud/storageclass-fiknow.yaml
# Falls die Basis-Parameter (profile/iops/…) im Cluster abweichen, vorher
# `kubectl get sc ibmc-vpc-file-retain-500-iops -o yaml` gegenchecken.

# 2) PVC über diese Klasse (Retain schützt die Daten vor versehentlichem Löschen)
kubectl apply -f deploy/ibmcloud/pvc-fiknow-data.yaml
kubectl -n fiknow get pvc fiknow-data      # erwartet: Bound (Provisionierung ~30s)
```
> Nach dem ersten Pod-Start muss `/data` real `1001:1001` gehören —
> verifizieren mit
> `kubectl -n fiknow exec deploy/fiknow -- sh -c 'ls -ldn /data'`
> (zeigt es `65534`, wurde die falsche StorageClass genommen). Ein manuelles
> `chown` ist weder nötig noch möglich (root-squash).

## 4. ⚠️ VPC-Netzwerk: NFS für das File-Mount-Target freigeben

**Der wichtigste Stolperstein.** `Bound` heißt nur „Share provisioniert" — der
eigentliche Mount läuft auf dem Worker-Node über NFS (TCP **2049**). Bei einem
Cluster, der **vor** der File-CSI-Aktivierung erstellt wurde, erlaubt die
Security Group des Mount-Targets das NFS der Worker **nicht** → der Pod hängt:

```
MountVolume.SetUp failed ... rpc error: code = DeadlineExceeded
desc = context deadline exceeded
```

**Diagnose:**
```bash
# Mount-Target-IP + dessen Security Group aus dem PV lesen
kubectl -n fiknow describe pv <pv-name> | grep -iE 'nfsServerPath|ENISecurityGroupIds'
#   nfsServerPath=<mount-target-ip>:/...    → Mount-Target-IP
#   ENISecurityGroupIds=r010-xxxx           → SG des Mount-Targets

# Erreichbarkeit vom betroffenen Node testen
kubectl debug node/<node-ip> -it --image=busybox -- sh
#   nc -w3 <mount-target-ip> 2049 </dev/null; echo "exit=$?"   # exit=1 → geblockt
```

**Fix** — Inbound 2049 auf der Mount-Target-SG für die Worker-Range erlauben:
```bash
ibmcloud is security-group-rule-add <mount-target-sg-id> \
  inbound tcp --port-min 2049 --port-max 2049 --remote <worker-subnet-cidr>
```
Danach `nc`-Test wiederholen → `exit=0`. kubelet retryt den Mount automatisch;
sonst `kubectl -n fiknow rollout restart deploy/fiknow`.

> Bleibt es trotz SG-Regel geblockt, hängt zusätzlich eine **Network ACL**
> (stateless!) am Worker-Subnetz — dort `TCP 2049` **+ Rückkanal `TCP
> 1024–65535`** in beide Richtungen erlauben (`ibmcloud is network-acl <id>`).

## 5. TLS-Secret in den Namespace bringen

Das IKS-Wildcard-Zert liegt im Namespace `default`; eine Ingress-Ressource kann
ein TLS-Secret aber nur aus dem **eigenen** Namespace referenzieren. IKS-managed
(auto-renew) in den `fiknow`-Namespace deployen:
```bash
ibmcloud ks ingress secret ls -c bm-production-cluster      # CRN des Default-Zerts
ibmcloud ks ingress secret create -c bm-production-cluster \
  --name fiknow-tls --namespace fiknow --cert-crn <crn>
kubectl -n fiknow get secret fiknow-tls                     # type: kubernetes.io/tls
```

## 6. Keycloak-Client

Im zentralen Keycloak einen confidential Client `edu-platform` einrichten —
Details (Redirect-URI, Rollen, **Rollen-Claim ins ID-Token mappen**) siehe
[`RUNBOOK.md` §2](RUNBOOK.md). Kurzform für diesen Host:

- Client authentication: **On**, Standard flow: **On**
- Valid redirect URI: `https://fiknow.<subdomain>/auth/oidc/callback` (exakt)
- Realm-Rollen `fiknow-curator`, `fiknow-admin`
- **User-Realm-Role-Mapper** mit **Add to ID token: On** (sonst ist jeder nur `learner`)
- Client-Secret aus dem Tab **Credentials** → `OIDC_CLIENT_SECRET`

## 7. Secrets im Cluster

**Image-Pull-Secret** (GHCR-Package ist privat):
```bash
kubectl -n fiknow create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github-user> \
  --docker-password="$GHCR_TOKEN"
```
> Für den Pull braucht der Token den `read:packages`-Scope. **Hinweis:**
> fine-grained PATs bieten für org-eigene, nicht repo-verknüpfte Packages keine
> zuverlässige Packages-Berechtigung — ein **Classic-PAT mit `read:packages`**
> ist hier der verlässliche Weg.

**App-Secret** (`existingSecret` aus der Werte-Datei):
```bash
export DATABASE_URL='postgres://fiknow:<pw>@<host>:<port>/ibmclouddb?sslmode=require'
export OIDC_CLIENT_SECRET='<aus-keycloak>'
PAYLOAD_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
OIDC_SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

kubectl -n fiknow create secret generic fiknow-env \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=PAYLOAD_SECRET="$PAYLOAD_SECRET" \
  --from-literal=OIDC_CLIENT_SECRET="$OIDC_CLIENT_SECRET" \
  --from-literal=OIDC_SESSION_SECRET="$OIDC_SESSION_SECRET"
```
> Produktionssauber wäre die Verwaltung über **IBM Secrets Manager + External
> Secrets Operator** (synct in dasselbe `fiknow-env`-Secret, Chart unverändert)
> — siehe Backlog.

## 8. Installieren

Die Werte-Datei [`helm/fiknow/values-ibm-production.yaml`](helm/fiknow/values-ibm-production.yaml)
referenziert `existingSecret: fiknow-env`, `imagePullSecrets: ghcr-pull`,
`dataVolume.existingClaim: fiknow-data`, den Ingress-Host + `fiknow-tls` und
einen gepinnten Image-Tag.

```bash
helm upgrade --install fiknow oci://ghcr.io/finnofleet/charts/fiknow \
  --version 0.3.2 -f deploy/helm/fiknow/values-ibm-production.yaml \
  --namespace fiknow
```

## 9. Verifikation

```bash
kubectl -n fiknow rollout status deploy/fiknow
kubectl -n fiknow get pods                                   # 2x 1/1 Running
kubectl -n fiknow logs -l app.kubernetes.io/instance=fiknow | grep -i migrate
#   erwartet: [auto-migrate] fertig in <n> ms
kubectl -n fiknow get ingress                                # Host + ADDRESS

# Smoke-Test (Redirect auf OIDC-Login)
curl -sI https://fiknow.<subdomain>/dashboard                # 307/302 → /auth/oidc/login
```
**End-to-End:** `https://fiknow.<subdomain>/dashboard` im Browser → Keycloak-Login
→ mit `fiknow-curator`-User zurück → `/manage` erreichbar (bestätigt den
Rollen-Claim im ID-Token).

## 10. Offene Feinschliff-Punkte (Backlog)

- **topologySpread-Fix im Chart:** Warnung beim Apply
  (`labelSelector results in matching no pod`) — der `topologySpreadConstraints`
  injiziert die `selectorLabels` nicht; HA-Pod-Verteilung greift dadurch nicht
  wie gewollt. Nicht blockierend, im Chart nachzuziehen.
- **Secrets über IBM Secrets Manager + External Secrets Operator** statt
  manuellem `kubectl create secret`.
- **DB-Verbindung auf `sslmode=verify-full`** mit der ICD-CA härten.
