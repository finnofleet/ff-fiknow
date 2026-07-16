# Authoring-API-Referenz

Diese Endpoints bilden den Authoring-Loop aus ADR 0001
(`checkout → upload → publish`). Alle sind **nur für Curator/Admin**
zugänglich, alle haben **In-Memory-Rate-Limiting pro User**
(Fixed-Window, pro App-Prozess) und antworten mit JSON
`{ ok: boolean, ... }` — außer `export`, das eine ZIP-Datei zurückliefert.

Das Bundle-Format (Ordnerstruktur, Frontmatter, MDX-Komponenten,
Idempotenz, Konflikt-Erkennung) ist in
[`AUTHORING_BUNDLE.md`](./AUTHORING_BUNDLE.md) spezifiziert.

---

## Authentifizierung

Jeder Authoring-Endpoint (export, import, publish) akzeptiert **zwei**
Auth-Wege — der erste gefundene gewinnt:

### 1. Bearer-Token (empfohlen für Plugin/CLI)

```
Authorization: Bearer cat_…
```

Scoped Authoring-Token, erzeugt über die
[Token-Verwaltungs-Endpoints](#token-verwaltung). Eigenschaften:

- **Ein Token gilt für alle Endpoints** (export, import, publish)
  — ADR 0001, Sicherheits-Anforderung 5.
- Widerrufbar, kurze TTL (Default 12 h, max. 7 Tage).
- Ist ein `Authorization: Bearer …`-Header vorhanden, aber der Token
  ungültig, abgelaufen oder widerrufen, **fällt der Request NICHT auf
  die Session zurück** — Antwort: `401 invalid_token`. Nur vollständiges
  Fehlen des Headers löst den Session-Fallback aus.

### 2. Session-Cookie (Browser-Fallback)

GoTrue-Session wie bisher — wird verwendet, wenn kein
`Authorization`-Header vorhanden ist.

### Gemeinsam für beide Wege

Die Rolle (`curator`/`admin`) wird bei **jeder Anfrage frisch** aus der
Datenbank gelesen. Ein Token trägt keine eingebackene Berechtigung;
Rollenentzug wirkt sofort ohne Token-Widerruf.

Tokens können nur über Session-Auth erzeugt werden — siehe
[Token-Verwaltung](#token-verwaltung).

---

## 1. `GET /api/authoring/export/<slug>` — Bundle herunterladen

Lädt den aktuellen Stand eines Kurses als ZIP-Bundle herunter — die Lese-Seite
der Source-of-Truth. Der Endpoint liest die aktuelle `version` aus dem
DB-Index (`courses.version`), holt genau diese Version aus dem Bundle-Storage
und packt sie frisch zu ZIP.

Damit schließt sich der Conflict-Round-Trip aus ADR 0001: Der Autor zieht den
aktuellen Stand inkl. Version-Token, editiert lokal und lädt mit der korrekten
Version wieder hoch. Stimmt die Version beim nächsten Import nicht überein,
antwortet der Server mit `409 version_conflict` (Optimistic Locking).

### Auth

Bearer-Token **oder** GoTrue-Session-Cookie (siehe
[Authentifizierung](#authentifizierung)). Rolle: `curator` oder `admin`.
Rolle wird bei jeder Anfrage frisch geprüft.

### Pfad-Parameter

| Parameter | Typ    | Beschreibung                                          |
|-----------|--------|-------------------------------------------------------|
| `slug`    | string | Course-Slug, Muster `^[a-z0-9-]+$`                   |

### Rate-Limit

**30 Requests/Minute** pro User (Namespace `export:<userId>`).

### Erfolgsantwort — 200

Kein JSON — der Response-Body ist direkt die ZIP-Datei.

| Header                | Wert                                              |
|-----------------------|---------------------------------------------------|
| `Content-Type`        | `application/zip`                                 |
| `Content-Disposition` | `attachment; filename="<slug>.zip"`               |
| `Cache-Control`       | `no-store`                                        |

Der ZIP-Inhalt hat einen Top-Level-`<slug>/`-Ordner, sodass Entpacken +
Re-Upload ohne Pfad-Anpassungen funktioniert. Im `course.mdx` ist die
aktuelle `version` ins Frontmatter injiziert (Self-Identifying Bundle).

### Beispiel

```bash
curl -H "Authorization: Bearer cat_…" \
  https://verstande.ch/api/authoring/export/a2-drohne \
  -o a2-drohne.zip
```

### Fehlerantworten

| Status | `error`                  | Zusatzfelder                                    | Bedeutung                                                                                    |
|--------|--------------------------|-------------------------------------------------|----------------------------------------------------------------------------------------------|
| 401    | `not_logged_in`          | —                                               | Kein aktiver Session-Cookie                                                                  |
| 401    | `invalid_token`          | —                                               | Bearer-Token ungültig, abgelaufen oder widerrufen                                            |
| 403    | `insufficient_role`      | `required`, `got`                               | Eingeloggt, aber weder Curator noch Admin                                                    |
| 400    | `invalid_course_slug`    | `slug`                                          | Slug entspricht nicht `^[a-z0-9-]+$`                                                        |
| 404    | `course_not_found`       | `slug`                                          | Kein Kurs mit diesem Slug im Index                                                           |
| 409    | `course_has_no_version`  | `slug`, `detail`                                | Kurs existiert im Index, hat aber kein Version-Token (vor Storage-Einführung importiert — einmal neu hochladen) |
| 409    | `bundle_not_in_storage`  | `slug`, `version`, `detail`                     | Index kennt die Version, aber kein passender Stand im Storage — neu hochladen                |
| 429    | `rate_limited`           | `limit`, `retry_after_sec` + Header `Retry-After` | Limit überschritten                                                                        |

---

## 2. `POST /api/authoring/import` — Commit als Draft

Importiert ein Bundle-ZIP als Draft. Idempotenz-Regeln und
Konflikt-Erkennung laufen serverseitig.

### Auth

Bearer-Token **oder** GoTrue-Session-Cookie (siehe
[Authentifizierung](#authentifizierung)). Rolle: `curator` oder `admin`.

### Request

```
Content-Type: multipart/form-data
```

| Feld         | Typ    | Pflicht | Beschreibung                                         |
|--------------|--------|---------|------------------------------------------------------|
| `bundle`     | File   | ✓       | ZIP-Datei, max. 100 MB komprimiert                   |
| `courseSlug` | string | ✓       | Kurs-Slug, Muster `^[a-z0-9-]+$`                     |

### Rate-Limit

**10 Requests/Minute** pro User (Namespace `import:<userId>`).

### Verarbeitung

1. ZIP wird in-memory entpackt und gehärtet (Zip-Slip, Zip-Bomb-Caps,
   Symlink-Reject).
2. Jeder MDX-Body läuft durch `assertSafeMdx`.
3. Assets werden sanitisiert.
4. **Konflikt-Erkennung:** Stimmt `version` im Frontmatter nicht mit der
   gespeicherten Version überein → 409 (kein Last-Write-Wins). Details:
   [`AUTHORING_BUNDLE.md` → Konflikt-Erkennung](./AUTHORING_BUNDLE.md#konflikt-erkennung).
5. Upload landet immer als **Draft**, unabhängig vom `status`-Feld.

### Erfolgsantwort — 200

```json
{
  "ok": true,
  "summary": { /* ImportSummary */ }
}
```

`summary` enthält Zähler für erstellte/aktualisierte Courses, Sections,
Lessons und hochgeladene Assets.

### Fehlerantworten

| Status | `error`                   | Zusatzfelder                                    | Bedeutung                                                        |
|--------|---------------------------|-------------------------------------------------|------------------------------------------------------------------|
| 401    | `not_logged_in`           | —                                               | Kein aktiver Session-Cookie                                      |
| 401    | `invalid_token`           | —                                               | Bearer-Token ungültig, abgelaufen oder widerrufen                |
| 403    | `insufficient_role`       | `required`, `got`                               | Eingeloggt, aber weder Curator noch Admin                        |
| 429    | `rate_limited`            | `limit`, `retry_after_sec` + Header `Retry-After` | Limit überschritten                                            |
| 400    | `invalid_multipart_form`  | —                                               | Body kein valides `multipart/form-data`                          |
| 400    | `missing_course_slug`     | —                                               | Feld `courseSlug` fehlt oder leer                                |
| 400    | `invalid_course_slug`     | `courseSlug`                                    | Slug entspricht nicht `^[a-z0-9-]+$`                            |
| 400    | `missing_bundle_field`    | —                                               | Feld `bundle` fehlt oder kein Blob                               |
| 400    | `empty_bundle`            | —                                               | ZIP-Datei hat 0 Bytes                                            |
| 413    | `bundle_too_large`        | `max_bytes`, `got_bytes`                        | ZIP überschreitet 100 MB                                         |
| 400    | `zip_extraction_failed`   | `detail`                                        | ZIP lässt sich nicht entpacken (Zip-Slip, Zip-Bomb, Symlink, …) |
| 400    | `zip_empty_or_no_files`   | —                                               | ZIP enthält nach Extraktion keine Dateien                        |
| 400    | `bundle_validation_failed`| `detail`                                        | MDX-/Asset-/Bundle-Parser-Fehler (User-Error)                    |
| 409    | `version_conflict`        | `courseSlug`, `expected`, `current`, `detail`   | Frontmatter-`version` stimmt nicht mit Server-Version überein    |
| 500    | `import_failed`           | `detail`                                        | Unerwarteter Server-Fehler                                       |

---

## 3. `POST /api/authoring/publish` — Draft → live

Schaltet einen Course (und optional alle seine Sections + Lessons) von
`draft` auf `published`.

### Auth

Bearer-Token **oder** GoTrue-Session-Cookie (siehe
[Authentifizierung](#authentifizierung)). Rolle: `curator` oder `admin`.

### Request

```
Content-Type: application/json
```

| Feld              | Typ     | Pflicht | Beschreibung                                                                  |
|-------------------|---------|---------|-------------------------------------------------------------------------------|
| `courseId`        | number  | ✓       | Numerische Payload-ID des zu publishenden Course                              |
| `includeChildren` | boolean | –       | Default `true` — publiziert auch alle Sections + Lessons des Course           |

### Rate-Limit

**20 Requests/Minute** pro User (Namespace `publish:<userId>`).

### Wirkung

- `includeChildren: true` (Default): Course + alle zugehörigen Sections +
  Lessons werden auf `published` gesetzt.
- `includeChildren: false`: nur der Course-Record wird umgeschaltet; Sections
  und Lessons bleiben im jeweiligen Status (und sind am Frontend nicht
  sichtbar).

### Erfolgsantwort — 200

```json
{
  "ok": true,
  "course": {
    "id": 42,
    "slug": "drohnen-fuehrerschein-a2",
    "status": "published"
  },
  "children": {
    "sections": 5,
    "lessons": 23
  }
}
```

`children` ist nur vorhanden, wenn `includeChildren: true`.

### Fehlerantworten

| Status | `error`             | Zusatzfelder                                    | Bedeutung                                         |
|--------|---------------------|-------------------------------------------------|---------------------------------------------------|
| 401    | `not_logged_in`     | —                                               | Kein aktiver Session-Cookie                       |
| 401    | `invalid_token`     | —                                               | Bearer-Token ungültig, abgelaufen oder widerrufen |
| 403    | `insufficient_role` | `required`, `got`                               | Eingeloggt, aber weder Curator noch Admin         |
| 429    | `rate_limited`      | `limit`, `retry_after_sec` + Header `Retry-After` | Limit überschritten                             |
| 400    | `invalid_json`      | —                                               | Request-Body kein valides JSON                    |
| 400    | `invalid_course_id` | `got`                                           | `courseId` kein positiver Integer                 |
| 404    | `course_not_found`  | `courseId`                                      | Kein Course mit dieser ID gefunden (auch als Draft)|
| 500    | *(implizit)*        | —                                               | Payload-DB-Fehler beim Update                     |

---

## Token-Verwaltung

Diese Endpoints erzeugen, listen und widerrufen Scoped Authoring-Tokens.

**Auth: ausschließlich Session-Cookie** (curator/admin) — bewusst nicht
per Bearer-Token. Ein Token darf sich nicht selbst nachgenerieren können;
das würde die kurze TTL aushebeln (Privilege-Chaining).

Der Token-Klartext (`cat_…`) wird **nur einmal** zurückgegeben — direkt
in der Mint-Antwort. Danach ist lediglich ein SHA-256-Hash gespeichert.
Den Klartext sicher aufbewahren; er ist nicht erneut abrufbar.

---

### `POST /api/authoring/tokens` — Token erzeugen

#### Auth

Nur Session-Cookie (curator/admin).

#### Rate-Limit

**10 Requests/Minute** pro User (Namespace `mint-token:<userId>`).

#### Request

```
Content-Type: application/json
```

Body ist optional. Ohne Body werden die Standardwerte verwendet.

| Feld        | Typ    | Pflicht | Beschreibung                                              |
|-------------|--------|---------|-----------------------------------------------------------|
| `label`     | string | –       | Menschlicher Name für den Token, max. 200 Zeichen         |
| `ttlHours`  | number | –       | Gültigkeitsdauer in Stunden (> 0). Default: **12 h**, Max: **168 h (7 Tage)**; größere Werte werden auf 168 gekappt |

#### Erfolgsantwort — 200

```json
{
  "ok": true,
  "id": "<uuid>",
  "token": "cat_…",
  "expiresAt": "2026-06-11T10:00:00.000Z",
  "ttlHours": 12
}
```

| Feld        | Typ    | Beschreibung                                                    |
|-------------|--------|-----------------------------------------------------------------|
| `id`        | string | UUID des Token-Datensatzes                                      |
| `token`     | string | Klartext (`cat_…`) — **einmalig**, danach nicht mehr abrufbar   |
| `expiresAt` | string | Ablaufzeitpunkt, ISO-8601                                       |
| `ttlHours`  | number | Tatsächlich verwendete TTL in Stunden (nach Clamping)           |

#### Fehlerantworten

| Status | `error`             | Zusatzfelder                                    | Bedeutung                                         |
|--------|---------------------|-------------------------------------------------|---------------------------------------------------|
| 401    | `not_logged_in`     | —                                               | Kein aktiver Session-Cookie                       |
| 403    | `insufficient_role` | `required`, `got`                               | Eingeloggt, aber weder Curator noch Admin         |
| 429    | `rate_limited`      | `limit`, `retry_after_sec` + Header `Retry-After` | Mint-Limit überschritten                        |
| 400    | `invalid_json`      | —                                               | Request-Body kein valides JSON                    |
| 400    | `invalid_label`     | `max_length`                                    | `label` ist kein String oder überschreitet 200 Zeichen |
| 400    | `invalid_ttl`       | `max_hours`                                     | `ttlHours` ist keine positive Zahl               |

---

### `GET /api/authoring/tokens` — eigene Tokens listen

#### Auth

Nur Session-Cookie (curator/admin).

#### Erfolgsantwort — 200

```json
{
  "ok": true,
  "tokens": [
    {
      "id": "<uuid>",
      "label": "VS-Code-Plugin",
      "createdAt": "2026-06-09T08:00:00.000Z",
      "expiresAt": "2026-06-10T08:00:00.000Z",
      "lastUsedAt": "2026-06-09T09:30:00.000Z",
      "revoked": false,
      "expired": false
    }
  ]
}
```

| Feld          | Typ            | Beschreibung                                    |
|---------------|----------------|-------------------------------------------------|
| `id`          | string         | UUID des Token-Datensatzes                      |
| `label`       | string\|null   | Menschlicher Name, oder `null`                  |
| `createdAt`   | string         | Erstellungszeitpunkt, ISO-8601                  |
| `expiresAt`   | string         | Ablaufzeitpunkt, ISO-8601                       |
| `lastUsedAt`  | string\|null   | Letzter Zugriff, ISO-8601, oder `null`          |
| `revoked`     | boolean        | `true` wenn widerrufen                          |
| `expired`     | boolean        | `true` wenn abgelaufen                          |

Kein Klartext oder Hash wird zurückgegeben.

#### Fehlerantworten

| Status | `error`             | Zusatzfelder | Bedeutung                                         |
|--------|---------------------|--------------|---------------------------------------------------|
| 401    | `not_logged_in`     | —            | Kein aktiver Session-Cookie                       |
| 403    | `insufficient_role` | `required`, `got` | Eingeloggt, aber weder Curator noch Admin    |

---

### `DELETE /api/authoring/tokens/<id>` — Token widerrufen

#### Auth

Nur Session-Cookie (curator/admin). Nur **eigene** Tokens können
widerrufen werden.

#### Erfolgsantwort — 200

```json
{ "ok": true, "revoked": true, "id": "<uuid>" }
```

#### Fehlerantworten

| Status | `error`             | Zusatzfelder | Bedeutung                                                              |
|--------|---------------------|--------------|------------------------------------------------------------------------|
| 401    | `not_logged_in`     | —            | Kein aktiver Session-Cookie                                            |
| 403    | `insufficient_role` | `required`, `got` | Eingeloggt, aber weder Curator noch Admin                         |
| 404    | `token_not_found`   | `id`         | Token unbekannt, gehört einem anderen User oder ist bereits widerrufen |

---

## Gemeinsames Fehler-Schema

Alle Fehlerantworten haben die Form:

```json
{ "ok": false, "error": "<code>", ...extra }
```

Der HTTP-Status entspricht der obigen Tabelle (401, 403, 400, 404, 409, 413,
429, 500).

Bei `rate_limited` ist zusätzlich der `Retry-After`-Header gesetzt (Wert in
Sekunden, identisch zu `retry_after_sec` im Body). Das Rate-Limiting ist
Fixed-Window pro App-Prozess; bei mehreren Replikas gilt das Limit
effektiv pro Instanz.
