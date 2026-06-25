# ADR 0004 — MCP als eigenständiges Authoring-Frontend

- **Status:** Accepted · PoC live-verifiziert (Cowork, 2026-06-17). **Phasen 1+2
  gebaut**: P1 Asset-by-Reference (`upload_asset`/`list_assets`,
  `validate_bundle`, Staging-Store, `importFromTextAndAssetRefs`,
  `request_asset_upload_url` + Out-of-Band-Upload); P2 Wissen in MCP
  (Resources + Prompt + `get_authoring_guide`, brand-aware via
  `lib/authoring/guide.ts`); P2.5 Out-of-Band-Bundle-Upload
  (`request_bundle_upload_url` → ZIP per curl, kein Bundle-Text durch den
  Kontext). Phase 3 offen.
- **Datum:** 2026-06-17
- **Kontext-Phase:** Authoring / Tooling
- **Betroffene Bereiche:** MCP-Endpoint
  (`app/(frontend)/api/mcp/[transport]/route.ts`), Authoring-Pipeline
  (`lib/authoring/*`), MDX-Validierung (`lib/mdx/validate.ts`),
  course-authoring-Plugin (Claude-Code-Skills), Deployment-Config
  (`MCP_ENABLED`)
- **Verwandt:** [[0001-mdx-bundle-als-source-of-truth-db-als-index]],
  [[0003-rag-grounding-fuer-den-ki-tutor]], `SECURITY_AUDIT.md`

---

## Kontext

Das FiKnow-/Gruppen-KI-Team fragte: Ist die Plattform MCP-fähig? Das Ziel
ist Content per MCP zu verwalten (Authoring) — nicht nur über das
course-authoring-Plugin, das an Claude Code gebunden ist.

Als Folge wurde ein PoC gebaut: ein MCP-Server unter
`POST /api/mcp/mcp` (Streamable-HTTP-Transport via `mcp-handler` +
`@modelcontextprotocol/sdk` + `zod`). Auth läuft über
`Authorization: Bearer cat_…`-Token via `authenticateAuthoring`
(curator/admin — Rolle wird frisch aus der DB geprüft, nicht in den Token
eingebacken). Ein Deployment-weiter Env-Gate (`MCP_ENABLED=true`) schaltet
die gesamte Fläche ab, wenn nicht explizit aktiviert.

Der PoC exponiert vier Tools: `list_courses`, `export_course`,
`import_course` (als Draft), `publish_course`. Bundle-Transfer erfolgt als
JSON-File-Map — Text-Dateien (`mdx`, `md`, `json`, `svg` u. a.) als `text`,
Binär-Assets als `base64`. Serverseitig wird die File-Map in eine
`Map<string, Buffer>` überführt und direkt an `importFromExtractedBundle`
weitergegeben — dieselbe Pipeline wie der HTTP-Upload-Endpoint. Live-verifiziert
über Claude Cowork: Kursliste + voller Download→Edit→Upload-Roundtrip.

Aus dem PoC ergaben sich zwei strukturelle Probleme, die diese ADR adressiert:

1. **Größen-Limit (Import-Output-Cap).** Das ganze Bundle läuft durch den
   Modell-Kontext — Text als UTF-8, Assets als base64. Beim Export geht alles
   in den Kontext; beim Import muss das Modell die komplette File-Map
   (inklusive unveränderter base64-Assets) als Tool-Input **selbst erzeugen**
   → gedeckelt durch den max-output-Token-Cap (~64–128k Tokens). Schon **ein
   einzelnes größeres Bild** (1 MB Binär → ~1,33 MB base64 → ~380k Tokens)
   sprengt den Import-Roundtrip, lange bevor das Kontextfenster voll ist. Claude
   Cowork hat das bereits im PoC bemerkt und den Import an einen Subagent
   delegiert — das ist kein Workaround, sondern ein Zeichen, dass das Design
   grundsätzlich nicht skaliert.

2. **Wissens-Lücke.** MCP liefert nur die Operationen ("Hände"), nicht das
   Autoren-Wissen ("Rezept"): Bundle-Format, Frontmatter-/Slug-Konventionen,
   Komponenten-Vokabular, CONTENT_STYLE, Didaktik. Dieses Wissen steckt heute
   in den Plugin-Skills des course-authoring-Plugins. Claude Desktop und Claude
   Cowork laden Claude-Code-Skills **nicht** — ein Kollege, der dort autort,
   hat das Wissen nur, wenn es direkt im MCP (als Resources, Prompts oder
   Tools) verfügbar ist.

## Entscheidung

**MCP wird zum eigenständigen, plugin-unabhängigen Authoring-Frontend
ausgebaut** — über die reine Transport-/Operations-Schicht des PoC hinaus.
Konkret werden fünf Erweiterungen beschlossen:

1. **Asset-by-Reference statt base64-im-Kontext.** `export_course` liefert
   Text-Dateien weiterhin als `text`, gibt Binary-Assets aber nur noch als
   Manifest (`[{path, sha256, bytes}]`) zurück — **kein base64**. `import_course`
   nimmt `files[]` (Texte) + `assets[]` (`{path, sha256}`-Referenzen); der
   Server löst Assets per Hash gegen das aktuell gespeicherte Bundle
   (`getBundle`) und gegen einen Staging-Store auf. Unveränderte Assets werden
   **nie neu übertragen** — der Kontext enthält dann nur noch MDX-Text, dessen
   Größe gut vorhersagbar und klein ist.

2. **Asset-Update-Tools.** Ein neues Tool `upload_asset(courseSlug, path,
   base64, contentType?)` stagt ein einzelnes Asset serverseitig
   (hash-adressiert, mit Byte-Limit) für den seltenen Bild-Wechsel.
   Ergänzend `list_assets` für das Asset-Manifest. Als Skalierungs-Option
   (später): `request_asset_upload_url` für vollständig out-of-band-Transfer
   ohne jeglichen Kontext-Durchlauf.

3. **Wissen in MCP.** MCP-Resources (Bundle-Format-Spec, Komponenten-Vokabular,
   `docs/CONTENT_STYLE.md`, Beispiel-Bundle), MCP-Prompt(s) sowie ein
   `get_authoring_guide`-Tool als Fallback für Clients, die Resources schwach
   anzeigen. Die Inhalte kommen aus bereits vorhandenen Docs — es wird kein
   neues Wissen erfunden, sondern bestehendes kanalisiert.

4. **`validate_bundle`-Tool.** Prüft die Format-Spec **ohne zu schreiben**
   und gibt strukturierte Fehler `[{file, line?, message}]` zurück. Das gibt
   Fremd-Agents (und Menschen) eine Selbstkorrektur-Schleife vor dem eigentlichen
   Import. Implementierung über Reuse von `lib/mdx/validate` + Bundle-Parser;
   der Parser wirft heute beim ersten Fehler — für `validate_bundle` wird er zu
   einem Collect-all-Modus gewrappt.

5. **Sicherheits-Härtung.** `verifyToken` in der MCP-Route wird auf reine
   Token-Prüfung beschränkt (Session-Fallback entfernen — MCP-Clients schicken
   keine Cookies, der Fallback greift nie, ist aber irreführend). Der
   Code-Kommentar `// Session-Fallback greift für MCP-Clients nicht (keine
   Cookies) → kein Treffer = 401` ist heute korrekt, der Code darunter aber
   nicht: `authenticateAuthoring` hat den Fallback eingebaut und würde ihn bei
   einem Request ohne Authorization-Header tatsächlich versuchen. `upload_asset`
   Bytes durchlaufen dieselbe Härtung wie ZIP-Upload (`assertSafeEntryName`,
   Containment, MIME-Validierung).

## Begründung

- **Asset-by-Reference behebt den eigentlichen Engpass.** Das Limit liegt beim
  Import-Output, nicht beim Export-Kontext — der Agent muss die unveränderter
  Assets als Token erzeugen. Hash-Referenzen lösen das fundamental, nicht nur
  symptomatisch.
- **Wissen-in-MCP ist Voraussetzung** dafür, dass MCP-Authoring für andere als
  Claude-Code-Power-User taugt. Ein Desktop-Kollege, der das Plugin gar nicht
  laden kann, braucht das Rezept direkt im MCP — sonst ist das Frontend zwar
  bedienbar, aber nicht korrekt benutzbar.
- **Reuse statt Neubau.** Die gesamte Import-Pipeline (`importBundle`,
  `getBundle`/`putBundle`, `assertSafeMdx`, `parseBundleFromFiles`) bleibt
  unverändert. Neu sind nur ein Asset-Staging-Store + ein Import-Einstiegspunkt
  `importFromTextAndAssetRefs(...)`, der Hashes auflöst und dann `importBundle`
  wie bisher ruft. Kein neues Kernsystem — eine neue Zusammensetzung bekannter
  Teile.
- **`validate_bundle` ist Defense-in-Depth.** Fehler werden früh und vollständig
  gemeldet, bevor der teure Import-Roundtrip startet. Für Fremd-Agents (die das
  Bundle-Format nicht aus dem Plugin kennen) ist das die zentrale
  Selbstkorrektur-Schleife.

## Konsequenzen

- **Plugin wird optional, nicht obsolet.** MCP wird das universelle
  Authoring-Frontend für alle Clients (Desktop, Cowork, API-Agents); das
  course-authoring-Plugin bleibt Komfort-Layer für Claude-Code-Power-User mit
  lokalem Dateisystem-Zugriff. Die Skills `course-diagram` und `course-image`
  erzeugen Assets lokal — sie haben kein MCP-Pendant und bleiben vorerst
  Plugin-exklusiv. Bei konkretem Bedarf könnten sie über `upload_asset`
  portiert werden.
- **Dokument-Level-Tools (`get_lesson`/`upsert_lesson`) bewusst aufgeschoben.**
  Asset-by-Reference + Text-Export hält den Kontext bereits klein und konstant.
  Dokument-Level-Granularität lohnt erst bei sehr großen Kursen oder
  chirurgischen Einzel-Edits, bringt aber Merge-/Konsistenz-Komplexität mit
  (was passiert, wenn ein Lesson-Update mit einem parallelen Bundle-Import
  kollidiert?). Bei konkretem Bedarf nachziehen — nicht auf Halde bauen.
- **`upload_asset` erweitert die Angriffsfläche.** Base64-Bytes kommen über
  ein Tool-Argument herein, nicht über den gehärteten ZIP-Pfad. Die in Punkt 5
  der Entscheidung beschriebene Härtung ist deshalb keine Kür, sondern Pflicht.

## Umsetzung in Phasen

- **Phase 1 (GEBAUT, 2026-06-17):** Asset-by-Reference — `export_course` und
  `import_course` umgestellt, `upload_asset` + `list_assets` hinzugefügt,
  Asset-Staging-Store (`lib/authoring/asset-staging.ts`),
  `importFromTextAndAssetRefs` als neuer Einstiegspunkt + `validate_bundle`-Tool
  (`lib/authoring/validate-bundle.ts`). Behebt das Größen-Limit und legt die
  Basis für Fremd-Authoring. Umsetzungs-Notizen:
  - `validate_bundle` sammelt MDX-Verstöße über alle Bodies (Collect-all);
    Struktur-Fehler bleiben fail-fast (höchstens ein Befund) — der Parser bleibt
    unverändert, weil ohne valide Struktur keine zuverlässige Body-Prüfung geht.
  - Staging-Store ist content-adressiert (`.staging/<slug>/<sha256>`), per Slug
    gescoped und wird nach erfolgreichem Import best-effort geleert.
  - `upload_asset` ist auf Bild-Typen (png/jpg/jpeg/webp/gif, 10 MB) begrenzt;
    SVG bleibt Text und geht über `import_course` `files[]`.
  - Token-only-Härtung in `verifyToken` (Entscheidung Punkt 5) ist NICHT Teil
    von Phase 1 — bleibt Phase-3-Quick-Fix (kann jederzeit vorgezogen werden).
  - **Nachtrag (Trigger belegt):** `upload_asset` nimmt das Bild als base64-im-
    Tool-Argument — beim Live-Test eines 83-KB-JPEG-Covers (local-agent-mode)
    hat das Modell den ~111k-Zeichen-String NICHT zeichengenau reproduziert: ein
    **abgeschnittenes, korruptes Asset** (50'632 statt 83'497 Bytes, falscher
    Hash) wurde gestaged, der Agent brach korrekt ab. base64-durch-den-Kontext
    ist für Binärdaten also nicht nur langsam, sondern **unzuverlässig falsch**.
    Daraufhin den Out-of-Band-Pfad aus Punkt 2 / Phase 3 vorgezogen:
    `POST /api/authoring/asset` (rohe Bytes per `curl --data-binary`) stagt
    direkt in denselben Staging-Store und gibt den `sha256` zurück — Bytes
    berühren den Modell-Kontext nie. `upload_asset` (base64) bleibt als Fallback
    für reine Remote-Clients ohne Shell; Validierung/Staging teilen sich beide
    über `lib/authoring/asset-upload.ts`.
  - **Auth-Gap geschlossen (`request_asset_upload_url` nachgezogen):** Beim
    Out-of-Band-Upload fehlte dem Shell-Client das Credential — die MCP-Verbindung
    trägt das `cat_`-Token, die Shell nicht (und der Agent soll es nicht aus dem
    Transport fummeln). Lösung: das (cat_-authentifizierte) MCP-Tool
    `request_asset_upload_url(courseSlug, path)` prägt eine **presigned URL** mit
    kurzlebigem Token und gibt eine fertige `curl`-Zeile zurück. Das Token ist
    stateless (HMAC-SHA256 über `{slug,path,exp}` mit `PAYLOAD_SECRET`,
    `lib/authoring/asset-upload-token.ts`), ~5 Min gültig und auf exakt diesen
    courseSlug+path gescoped. `POST /api/authoring/asset` akzeptiert das Token
    *oder* den `cat_`-Bearer. Die öffentliche URL wird aus den Proxy-Headern
    abgeleitet (wie mcp-handler), Override via `AUTHORING_PUBLIC_URL`. Single-use
    (Nonce-Store) bewusst nicht gebaut — 5-Min-Fenster + Pfad-Scope + Hash-Check
    beim Import genügen.
- **Phase 2 (GEBAUT):** Wissen in MCP — `lib/authoring/guide.ts` kanalisiert die
  vorhandenen Docs (AUTHORING_BUNDLE, CONTENT_STYLE, BRAND-IMAGE-STYLE-*,
  diagram-style) + die Komponenten-Whitelist zu Topics; 7 `authoring://`-
  Resources, Prompt `start_authoring`, Tool `get_authoring_guide`. Files landen
  via `outputFileTracingIncludes` (next.config) im Standalone-Build, zur Laufzeit
  per `fs` gelesen + gecached. **Brand-aware:** markenspezifische Topics
  (image/diagram/content-style) lesen ZUERST aus dem Brand-Overlay
  (`<BRAND_CONFIG_PATH-dir>/authoring/<topic>.md`, wie `loadBrandLogo()`), sonst
  Default per `brand.fontSet` (FiKnow-Bildstil bereits getrennt im Repo). Macht
  MCP plugin-unabhängig für Desktop-/Cowork-Kollegen.
  - **Offen (Follow-up, braucht Yves):** FiKnows Marken-Stimme als
    `brand/authoring/content-style.md` im **fiknow-brand**-Repo (+ `COPY`-Zeile
    in dessen Dockerfile). Bis dahin fällt FiKnow auf den neutralen/verstande-
    Default zurück — kein Bruch, nur nicht final gebrandet.
- **Phase 2.5 (GEBAUT):** Out-of-Band-Bundle-Upload — das Pendant zum Asset-
  Out-of-Band, eine Ebene höher. `import_course(files[])` zwingt das Modell, den
  GANZEN Bundle-Text als Tool-Argument auszugeben (output-token-gebunden,
  skaliert mit Kursgröße statt Änderungsgröße — ~7 Min für einen mittleren
  Kurs). Lösung: Tool `request_bundle_upload_url(courseSlug)` mintet (wie
  `request_asset_upload_url`) eine presigned URL auf den bestehenden ZIP-Endpoint
  `POST /api/authoring/import`; der Shell-Client zippt das Bundle lokal und
  `curl`t es hoch — MDX **und** Assets gehen per HTTP, nie durch den Kontext.
  Token = `mintBundleUploadToken` (Scope `#bundle`, reuse `asset-upload-token.ts`);
  der Import-Endpoint akzeptiert es alternativ zum `cat_`-Bearer. `import_course`
  (JSON) bleibt Fallback für shell-lose Clients. **Bewusst NICHT** für
  `validate_bundle` gemacht: das prüft Inhalt, muss ihn also lesen — nur der
  reine Transfer war die Verschwendung. (Macht Asset-by-Reference für den
  Shell-Pfad weitgehend obsolet, da Assets im ZIP mitreisen.)
- **Phase 3 (optional/bei Bedarf):** Dokument-Level-Tools (`get_lesson` /
  `upsert_lesson`), inkrementelles/async RAG-Reindexing (heute awaited + alle
  Chunks), token-only-Härtung in `verifyToken` (jederzeit vorziehbar).

---

**Status der Umsetzung:** Phasen 1+2(+2.5) gebaut (10 Tools + 7 Resources + 1
Prompt; Asset-by-Reference + Out-of-Band-Upload für Assets UND Bundles +
Wissen-in-MCP, brand-aware). Offen: FiKnow-Marken-Stimme im Overlay (Follow-up)
und Phase 3 (Dokument-Level-Tools, async/inkrementelles RAG, token-only-Auth).
