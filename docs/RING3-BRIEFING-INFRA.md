# Briefing — Ring 3 (Infra-Slug `fiknow` → `finknow`)

**Anlass:** Abstimmung mit dem Team Interne Infrastruktur zur Umbenennung
FIKNOW → FINKNOW auf Infrastruktur-Ebene.
**Stand:** 2026-08-12. Vorlage: [`RENAME-FINKNOW-PLAN.md`](./RENAME-FINKNOW-PLAN.md).

---

## 1. Worum es geht (30 Sekunden)

- **Anzeigename + Repo/Doku sind bereits umgestellt** (Ring 1 + 2, auf `main`
  gemergt, CI grün, lokal verifiziert). Die App zeigt überall **FINKNOW**.
- **Bewusst *nicht* angefasst:** der technische Slug `fiknow` in der
  Infrastruktur. Die App läuft mit Anzeigename FINKNOW **und** Infra-Slug
  `fiknow` völlig korrekt — der Slug ist ein internes Identifikationsmerkmal,
  kein User-sichtbarer Name.
- **Diese Runde entscheidet:** *Ob* und *wie weit* wir den Infra-Slug
  nachziehen — mit welchem Migrationsaufwand und -fenster.

## 2. Kernfrage an die Runde (die eine Entscheidung)

> **Wollen wir den technischen Slug `fiknow` in der Infrastruktur überhaupt
> umbenennen — oder behalten wir ihn als internen Identifier und ändern nur
> dort, wo es billig/beiläufig ist (z. B. beim nächsten sauberen Redeploy)?**

**Empfehlung (zur Diskussion):** Slug-Rename ist **kosmetisch-intern mit
realem Betriebsrisiko** (Daten-Migration, Auth-Cutover, DNS). Vorschlag:
- **Behalten** für die datentragenden/auth-kritischen Teile (PVC, DB, Realm)
  → kein Nutzen, hohes Risiko.
- **Nachziehen** nur für risikoarme, ohnehin neu ausgerollte Teile
  (Helm-Chart-/Release-Name, Image-Paket) **beim nächsten Deploy-Fenster**,
  wenn überhaupt.

Kurz: **maximaler Nutzen bei Ring 1/2 (erledigt), minimaler zusätzlicher
Nutzen bei Ring 3 — Aufwand nur eingehen, wenn Infra ihn will.**

## 3. Blast-Radius pro Komponente

| Komponente | Aktueller Identifier | Wenn umbenannt … | Risiko | Koordination |
|---|---|---|---|---|
| **Helm-Chart + Release** | Chart `fiknow` (v0.3.2), Release `fiknow`, alle `fiknow.*`-Template-Helper | `fullname = {release}-{chart}` → **alle** K8s-Objektnamen (Deployment/Service/SA/Secret `-env`/CronJob) ändern sich → **Ersatz statt In-Place** | Mittel | Helm `uninstall`+`install` ODER Ressourcen-Adoption; kurzer Neustart |
| **PVC (Medien/Bundles)** | `fiknow-data` (+ StorageClass `ibmc-vpc-file-fiknow-1001`), standalone Manifest, **nicht** an Release gekoppelt | PVC-Namen sind **immutable** → neuer PVC = **Daten-Migration** (Payload-Medien + Authoring-Bundles kopieren) | **Hoch** | Migrationsfenster, `rsync`/Snapshot, Verifikation |
| **Externe Postgres-DB** | DB-Name (extern, nicht im Chart) | optional; App braucht keinen DB-Rename | Hoch (falls doch) | DBA; nur wenn explizit gewünscht |
| **Keycloak** | **Realm `fiknow`**, Rollen `fiknow-curator/-admin`, Gruppen `/FIKNOW/*`, `OIDC_ROLE_MAP` | Realm/Rollen/Gruppen umbenennen → **Auth bricht bis IdP *und* App-Config synchron** | **Hoch** | IdP-Team; Cutover-Fenster; `OIDC_ISSUER` + `OIDC_ROLE_MAP` gleichzeitig |
| **OIDC-Client** | `edu-platform` (**enthält kein `fiknow`**) | — | keins | — (bleibt) |
| **OIDC-Issuer-URL** | `…/realms/fiknow` | folgt Realm-Rename | Hoch | mit Keycloak-Cutover |
| **Env-Var Retention** | `FIKNOW_RETENTION_YEARS` (Default 3 J) | Code + Helm-Values gemeinsam; sonst greift still der Default | Niedrig-Mittel | **DSG/DSGVO-relevant** (ADR 0006, DSB); Wert muss erhalten bleiben |
| **DNS / Domain** | `fiknow-test.jcloud.ik-server.com` | neue Domain → DNS + Ingress + **OIDC-Redirect-URIs** + `brand.yaml domain` | Hoch | DNS-Team + Keycloak (Redirect-URIs) |
| **Image / Registry** | `ghcr.io/finnofleet/ff-fiknow`; Chart `oci://ghcr.io/finnofleet/charts/fiknow`; CI `IMAGE_NAME = github.repository` | **Repo-Rename (Ring 2) flippt Image-Pfad automatisch** → CI pusht neues Paket `ff-finknow`; Deploy `image.repository` muss folgen | Mittel | Ring 2 + Deploy **im selben Fenster** koppeln |

## 4. Die drei harten Kopplungen (Aufmerksamkeit im Meeting)

1. **PVC / Daten-Migration** — teuerster Punkt. PVC-Namen sind unveränderlich;
   ein Rename bedeutet neuen PVC + Kopieren der Medien/Bundles. **Empfehlung:
   `fiknow-data` behalten** — Name ist intern, kein Nutzen im Rename.
2. **Keycloak-Cutover** — Realm/Rollen/Gruppen + `OIDC_ISSUER` + `OIDC_ROLE_MAP`
   müssen **atomar** umgestellt werden; sonst Login-Ausfall. **Empfehlung:
   Realm `fiknow` behalten**, außer die IdP-Seite hat eigene Gründe.
3. **Repo-Rename ↔ Deploy** — GitHub-Repo-Rename ändert den Image-Pfad. Nicht
   isoliert machen: Repo-Rename, CI-Push ins neue Paket und
   `image.repository`-Update im Deploy **zusammen** planen.

## 5. Wenn „ja, umbenennen": empfohlene Cutover-Reihenfolge

Ein **atomares Wartungsfenster**, nicht stückweise:

1. **Vorbereitung:** neue DNS-Records anlegen (noch nicht schwenken); neue
   Keycloak-Realm/-Rollen/-Gruppen anlegen (parallel zum alten); Helm-Chart
   `finknow` + Werte vorbereiten.
2. **Daten:** PVC-Medien/Bundles auf neuen PVC migrieren (falls PVC-Rename
   überhaupt gewollt) + verifizieren.
3. **App:** neuer Helm-Release `finknow` mit neuem Image-Paket, `OIDC_ISSUER`
   (neuer Realm), `OIDC_ROLE_MAP`, `FIKNOW_RETENTION_YEARS`-Wert erhalten.
4. **Auth:** Keycloak auf neuen Realm schwenken; Redirect-URIs auf neue Domain.
5. **DNS:** Domain schwenken; alte Redirect-URIs übergangsweise behalten.
6. **Nachlauf:** alten Release/PVC/Realm/Image erst nach Bewährung abbauen.

## 6. Offene Fragen an Infra/IT (fürs Protokoll)

- [ ] Ist ein Slug-Rename überhaupt gewünscht, oder reicht der Anzeigename?
- [ ] Falls ja: **welche** Komponenten (nur Chart/Image, oder auch PVC/Realm/DNS)?
- [ ] Gibt es ein reguläres Wartungsfenster, das wir nutzen können?
- [ ] Wer besitzt Keycloak-Realm-Änderungen (IdP-Team, Rechte, Vorlaufzeit)?
- [ ] Zielt der Rebrand auf eine **Produktiv-Domain** (statt `…-test.jcloud…`)?
      → dann DNS + Redirect-URIs unabhängig vom Slug klären.
- [ ] `FIKNOW_RETENTION_YEARS`-Rename: mit DSB abstimmen (ADR 0006), Wert = 3 J
      muss erhalten bleiben.
- [ ] Soll das **angekündigte Installations-Feedback** in dasselbe Fenster?

## 7. Anhang — verifizierte Identifier (Stand main, 2026-08-12)

> Aus dem Repo verifiziert. Werte in `values-*-example` / lokalem Realm sind
> **Platzhalter** (`*.example.com`); die echten Produktivwerte kennt Infra/IdP.

| Bereich | Wert |
|---|---|
| Helm-Chart | `deploy/helm/fiknow/` — Chart `name: fiknow`, `version: 0.3.2` |
| Release-/Ressourcen-Default | `.Chart.Name` = `fiknow` (via `_helpers.tpl`) |
| Secret | `{release}-{chart}-env` |
| PVC | `fiknow-data`; StorageClass `ibmc-vpc-file-fiknow-1001` (`deploy/ibmcloud/`) |
| Postgres | **extern** (nicht im Chart) |
| Keycloak-Realm | `fiknow` |
| Realm-Rollen | `fiknow-curator`, `fiknow-admin` |
| Gruppen | `/FIKNOW/Curators`, `/FIKNOW/Admins` |
| OIDC-Client | `edu-platform` (unverändert, kein Slug) |
| OIDC-Issuer (Beispiel) | `…/realms/fiknow` |
| `OIDC_ROLE_MAP` | `fiknow-curator:curator,fiknow-admin:admin` |
| Retention-Env | `FIKNOW_RETENTION_YEARS` (Default 3 J) — Code + `values.yaml` |
| Domain | `fiknow-test.jcloud.ik-server.com` (`brand.yaml`) |
| Image | `ghcr.io/finnofleet/ff-fiknow` (CI `IMAGE_NAME = github.repository`) |
| Helm-Chart-OCI | `oci://ghcr.io/finnofleet/charts/fiknow` |
| Test-User (lokal) | `*@fiknow.test` (nur Dev-Realm) |
