# Umbenennung FIKNOW → FINKNOW — Gesamtplan

> Status: Ring 1 + Ring 2 werden umgesetzt. Ring 3 (Infrastruktur) ist
> dokumentiert und wird **zuerst mit dem Infra-/IT-Team geprüft** und
> voraussichtlich mit dem angekündigten Installations-Feedback gebündelt.

Der Rename zerfällt in drei **konzentrische Ringe** mit stark
unterschiedlichem Risiko. Der sichtbare Name kommt zentral aus
`brand/brand.yaml` (`identity.name`) über `lib/brand.ts` — der *gerenderte*
Name ändert sich an einer Stelle. Der Grossteil der ~470 Treffer ist
entweder Doku-Prosa oder der **technische Slug** `fiknow`, der an
Live-Infrastruktur hängt.

## Casing-Konvention

| Alt | Neu | Wo |
|-----|-----|----|
| `FIKNOW` | `FINKNOW` | Anzeige/Prosa (Grossschreibung) |
| `FiKnow` | `FinKnow` | Fliesstext-CamelCase |
| `fiknow` | `finknow` | technischer Slug — **nur in Ring 2/3**, nicht blind |

---

## ⚠️ Funktionale Landminen — NICHT als „Anzeigename" ersetzen

Diese Uppercase/Slug-Vorkommen sind **funktional**, kein Produktname. Ring 1
lässt sie unberührt; sie gehören konzeptionell zu Ring 3 (Infra/IdP) bzw.
sind interne Enums.

| Token | Datei(en) | Warum tabu für Ring 1 |
|-------|-----------|------------------------|
| `"FIKNOW" \| "VERSTANDE"` (`brandKey()`) | `lib/authoring/guide.ts:51-53` | Interner Enum-Diskriminator aus `fontSet`, nicht der Anzeigename. Umbenennung nur konsistent oder gar nicht. |
| `FIKNOW_RETENTION_YEARS` | `lib/privacy/retention.ts`, `scripts/retention-purge.ts`, `lib/db/schema.ts`, `lib/privacy/retention.test.ts` | Env-Var-Name, via Helm gesetzt → Ring 3. |
| `/FIKNOW/Curators`, `fiknow-curator`, `fiknow-admin`, `fiknow-banned` | `lib/auth/provider/oidc/*`, `role-map.test.ts`, `app/(frontend)/manage/users/page.tsx` | IdP-Claim-/Gruppenwerte aus Keycloak → Ring 3. |
| Realm `fiknow`, Client, Test-User `*@fiknow.test` | `tooling/keycloak/fiknow-realm.json`, `docker-compose.oidc.yml`, README | Keycloak-Realm/Issuer → Ring 3. |
| DB-Name/Container `fiknow`, `fiknow-e2e-pg` | `e2e/*` | Lokale Test-Infra (Slug). |

---

## Ring 1 — Anzeigename (kein Ops-Impact, sofort shippable)

**Ziel:** Überall wo das *Wort* FIKNOW als Produktname erscheint → FINKNOW.

1. `brand/brand.yaml`: `identity.name: FIKNOW` → `FINKNOW`; Kopf-Kommentar,
   `description`, Inline-Kommentare. `markLetter: F` bleibt (FINKNOW beginnt
   mit F). `tagline`, `accent`, `domain` unverändert (Domain = Ring 3).
2. Produktname-Wort in Prosa/Kommentaren ersetzen — case-sensitiv
   `FIKNOW→FINKNOW`, `FiKnow→FinKnow` — in: `README.md`, `CHANGELOG.md`,
   `Dockerfile`-Kommentaren, `docs/**/*.md` (inkl. ADRs), `brand/authoring/`,
   `deploy/**/*.md`/`NOTES.txt` (nur Prosa), `tooling/course-plugin/**`,
   Code-**Kommentare** in `lib/**`, `app/**`, `components/**`, `payload/**`,
   `scripts/**`, `e2e/**`.
   **Ausschluss:** die Landminen-Tabelle oben + jeder lowercase `fiknow`.

**Definition of Done Ring 1:** `grep -rn "FIKNOW\|FiKnow"` liefert nur noch
die dokumentierten Landminen; `brand.name` rendert „FINKNOW"; Typecheck +
Tests grün.

**Status Ring 1:** ✅ umgesetzt (44 Dateien), 292 Unit-Tests grün,
`brand.name = FINKNOW`. Zwei bewusst offene Punkte:

- ⛔ **`brand/assets/logo.svg` — Wortmarke muss neu gezeichnet werden.**
  Die Buchstaben sind Vektorpfade und buchstabieren sichtbar **FIKNOW**
  (F·I·K·N·[Glühbirne=O]·W). FINKNOW braucht ein zusätzliches **N**-Glyph
  zwischen I und K plus Neu-Kerning von K/N/Birne/W und `viewBox`-Breite →
  **Design-Redraw**, kein Text-Edit. Datei bleibt bis dahin unangetastet.
- Kommentar-Prosa „FIKNOW" in `deploy/helm/**` und `deploy/ibmcloud/**`
  (`.yaml`/`.tpl`) wurde bewusst **nicht** angefasst — diese Infra-Dateien
  gehören zu Ring 3 und werden dort als ein kohärenter Change umgestellt.
  (Nur Kommentare, kein gerendertes Manifest betroffen.)

---

## Ring 2 — Repo- & Doku-Identität (kosmetisch, kein Runtime-Impact)

3. `package.json` + `package-lock.json`: `"name": "ff-fiknow"` → `"ff-finknow"`.
4. Doku-Dateien umbenennen und **interne Links nachziehen**:
   - `docs/BRAND-FIKNOW.md` → `docs/BRAND-FINKNOW.md`
   - `docs/BRAND-IMAGE-STYLE-FIKNOW.md` → `…-FINKNOW.md`
   - `docs/FIKNOW-AUTOR-GUIDE.md` → `docs/FINKNOW-AUTOR-GUIDE.md`
     (Referenz in `payload/collections/lessons.ts:32` mitziehen)
   - `docs/ROPA-fiknow.md` → `docs/ROPA-finknow.md`
   - `docs/diagram-style/examples/luv-lee-clean-fiknow.svg` → `…-finknow.svg`
   - `docs/diagram-style/examples/ablauf-clean-fiknow.svg` → `…-finknow.svg`
     (Referenzen in `docs/diagram-style/preview.html` / `SVG-DIAGRAM-STYLE.md`)

**Extern / disruptiv — NICHT im Session-Autopilot, bewusst durch Yves:**
5. GitHub-Repo `finnofleet/ff-fiknow` → `finnofleet/ff-finknow` umbenennen
   (GitHub richtet Redirects ein). Danach `git remote set-url origin …`.
6. Lokalen Ordner `~/DEV/ff-fiknow` → `~/DEV/ff-finknow` umbenennen
   (bricht laufende Sessions/Terminals — bewusst separat).
7. Image-Referenzen `ghcr.io/finnofleet/ff-fiknow` in `README.md`,
   `Dockerfile`, `.github/workflows/build-image.yml` — **hängt am
   Registry/CI-Namen** → mit Ring 3 (Image/Registry) koordinieren.

---

## Ring 3 — Infrastruktur-Slug (echter Ops-Impact, IT-Koordination)

> Reihenfolge und Migrations-Fenster mit Infra/IT abstimmen. Nichts davon
> ist „Suchen & Ersetzen".

- **Helm-Chart** `deploy/helm/fiknow/` → `deploy/helm/finknow/`: Ordner,
  `Chart.yaml` `name`, `_helpers.tpl`-Label-/Namens-Präfixe, alle Templates,
  `values*.yaml`, `README.md`, Release-Name in Deploy-Doku. **Release-Rename
  orphant bestehende Ressourcen** → `helm uninstall`+reinstall oder
  Ressourcen-Adoption planen.
- **K8s-Ressourcen**: PVC `fiknow-data`, StorageClass, `deploy/ibmcloud/*`.
  **PVC-Namen sind immutable** → neues Volume = **Postgres/Media-Migration**.
- **Keycloak**: Realm `fiknow` → `finknow`, `fiknow-realm.json`, Client-ID,
  Gruppen `/FIKNOW/*`, Rollen `fiknow-curator|admin`, OIDC-Issuer
  `realms/fiknow`, `OIDC_ROLE_MAP`. → **IdP-Rekonfiguration mit IT**;
  Auth bricht bis IdP + App-Config synchron sind.
- **Env-Vars**: `FIKNOW_RETENTION_YEARS` → `FINKNOW_RETENTION_YEARS`
  (Code + Helm-Values gemeinsam; sonst greift der Default 3 J still).
- **Domain/DNS**: `fiknow-test.jcloud.ik-server.com` → neue Domain
  (DNS + Ingress + `brand.yaml` `domain` + OIDC-Redirect-URIs).
- **Image/Registry**: `ghcr.io/finnofleet/ff-fiknow`, Chart
  `oci://ghcr.io/finnofleet/charts/fiknow`, CI in `build-image.yml`.
- **Test-Infra** (optional, unkritisch): DB-Name `fiknow`, `fiknow-e2e-pg`,
  `plugin.json` `fiknow.ch`-URLs, Test-Mails `*@fiknow.test`.
- **Interner Enum** (optional): `brandKey()`-Diskriminator konsistent auf
  `"FINKNOW"` — nur zusammen mit allen Konsumenten, kein Nutzen für User.

**Empfehlung:** Ring 3 als eigenen, atomaren Cutover mit IT planen
(Migrations-Fenster: DB/PVC-Migration → IdP-Umstellung → DNS →
Image/Chart-Neuveröffentlichung), idealerweise gebündelt mit dem
angekündigten Installations-Feedback.
