# edu-platform — Helm-Chart

Deployt das `edu-platform`-OCI-Image (verstande / FIKNOW) auf Kubernetes.
Erfüllt die Deployment-Anforderungen: **OCI-Image**, **OIDC** (oder GoTrue,
umschaltbar), **non-root**, **externes Postgres**.

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
helm push edu-platform-0.1.0.tgz oci://ghcr.io/yves-blaettler/charts
```

## Wichtige Werte

| Wert | Zweck |
|---|---|
| `image.repository` / `image.tag` | Image + Brand (`fiknow` / `latest`) |
| `config.AUTH_PROVIDER` | `oidc` oder `gotrue` |
| `config.OIDC_ISSUER` | Keycloak-Realm-URL (Pflicht bei oidc) |
| `config.OIDC_CLIENT_ID` / `OIDC_ROLE_MAP` | Client + Rollen-Mapping |
| `config.OIDC_REDIRECT_BASE` | öffentliche Basis-URL; leer → aus `ingress.hosts[0]` |
| `secret.existingSecret` | extern verwaltetes Secret (Prod, empfohlen) |
| `secret.create` + `secret.data` | Chart erzeugt Secret (Dev/Test) |
| `ingress.*` | Host/TLS/Class |

**Secret-Keys** (je nach Provider): `DATABASE_URL`, `PAYLOAD_SECRET` (immer);
`OIDC_CLIENT_SECRET`, `OIDC_SESSION_SECRET` (oidc; SESSION optional → Fallback
`PAYLOAD_SECRET`); `SUPABASE_SERVICE_ROLE_KEY` (gotrue).

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
