# fiknow — Helm-Chart

Deployt das FIKNOW-OCI-Image (`ghcr.io/finnofleet/ff-fiknow`) auf Kubernetes.
Erfüllt die Deployment-Anforderungen: **OCI-Image**, **OIDC** (Keycloak),
**non-root**, **externes Postgres**.

> Postgres und Keycloak liefert das Chart **nicht** mit — sie kommen extern
> (z. B. managed Postgres + zentrales Keycloak im IBM-Umfeld).

## Installation

```bash
# OIDC (FIKNOW @ IBM) — Beispielwerte anpassen:
helm upgrade --install fiknow ./deploy/helm/fiknow \
  -f ./deploy/helm/fiknow/values-fiknow-oidc.yaml \
  --namespace fiknow --create-namespace
```

Das Chart liegt im Repo; alternativ als OCI-Chart paketieren/pushen:

```bash
helm package ./deploy/helm/fiknow
helm push fiknow-0.3.1.tgz oci://ghcr.io/finnofleet/charts
```

## Wichtige Werte

| Wert | Zweck |
|---|---|
| `image.repository` / `image.tag` | Image + Tag (`ghcr.io/finnofleet/ff-fiknow` / `latest` — besser ein `main-<sha>`/`v`-Tag pinnen) |
| `config.OIDC_ISSUER` | Keycloak-Realm-URL (Pflicht) |
| `config.OIDC_CLIENT_ID` / `OIDC_ROLE_MAP` | Client + Rollen-Mapping |
| `config.OIDC_REDIRECT_BASE` | öffentliche Basis-URL; leer → aus `ingress.hosts[0]` |
| `secret.existingSecret` | extern verwaltetes Secret (Prod, empfohlen) |
| `secret.create` + `secret.data` | Chart erzeugt Secret (Dev/Test) |
| `ingress.*` | Host/TLS/Class |

**Secret-Keys**: `DATABASE_URL`, `PAYLOAD_SECRET` (immer);
`OIDC_CLIENT_SECRET` (Pflicht), `OIDC_SESSION_SECRET` (optional → Fallback
`PAYLOAD_SECRET`).

## Eigenschaften

- **non-root**: `runAsNonRoot`, uid 1001 (passt zum Image), `drop: [ALL]`,
  `allowPrivilegeEscalation: false`. *OpenShift:* bei restricted-SCC
  `podSecurityContext.runAsUser` auf `null` setzen (zufällige UID).
- **Migrationen**: laufen beim Pod-Start (Auto-Migrate, Advisory-Lock → bei
  mehreren Replicas migriert nur einer). Kein separater Job nötig.
- **Health-Probes**: liveness/readiness auf `/`.
- **Fail-fast**: `helm template/install` bricht ab, wenn bei `oidc` der Issuer
  oder die Redirect-Base fehlt oder kein Secret konfiguriert ist.
- **Rollout bei Config-Änderung**: Checksum-Annotationen auf ConfigMap/Secret.

## Keycloak-Voraussetzung (OIDC)

Im Realm muss als gültige redirect_uri eingetragen sein:

```
<OIDC_REDIRECT_BASE>/auth/oidc/callback
```

und die Rollen/Gruppen aus `OIDC_ROLE_MAP` müssen in die Token-Claims gemappt
sein (Realm-Roles/Groups in ID-Token). Vgl. das lokale Test-Realm
`tooling/keycloak/fiknow-realm.json`.
