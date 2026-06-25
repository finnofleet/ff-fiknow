# ADR 0001 — MDX-Bundle als Source of Truth, Datenbank als generierter Index

- **Status:** Accepted
- **Datum:** 2026-05-28
- **Kontext-Phase:** Phase 2 (Authoring + Content-Pipeline)
- **Betroffene Bereiche:** Authoring-Plugin (Claude Cowork), Upload-Endpoint, Payload-Collections, lokale Preview

---

## Kontext

Aufgekommene Frage: *Braucht es für die Kurse überhaupt ein CMS? Könnten die
MDX-Files nicht einfach im Storage liegen und von dort geladen werden?*

Heutiger Stand:

- Inhalte werden als **Authoring-Bundle** (Ordner mit `course.mdx`,
  `<NN>-<section>/`, `<MM>-<lesson>.mdx`, `assets/`) verfasst — siehe
  [`docs/AUTHORING_BUNDLE.md`](../AUTHORING_BUNDLE.md).
- Es existiert **Payload CMS** auf Postgres (Schema `payload`), mit den
  Collections Course → Section → Lesson, Versioning + Drafts und einer
  Admin-UI.
- Es existiert ein **Authoring-Skill/-Plugin**, das beim Erstellen der MDX
  hilft (KI-gestützt).

Damit stehen zwei mögliche Selbstbilder im Raum:

1. **Payload als klassisches CMS** — Inhalte werden primär im Admin-Editor
   (Lexical) erstellt und gepflegt; die DB ist die Wahrheit.
2. **MDX als Source of Truth** — Inhalte werden als Files (KI-gestützt)
   verfasst, die DB ist ein aus den Files abgeleiteter Index.

Diese beiden Modelle vertragen sich nicht beliebig: zwei gleichberechtigte
Edit-Pfade (Admin-Editor *und* Bundle-Upload) erzeugen Drift und
Sync-Probleme. Wir müssen festlegen, welcher Pfad führt.

### Treibende Annahme

Authoring wird **KI-nativ**. Der erwartete Loop ist nicht „im Editor tippen",
sondern: bestehenden Kurs **herunterladen → mit KI erweitern/aktualisieren →
wieder hochladen** (Overwrite). Eine **lokale Preview** (perspektivisch als
Sidebar-Artefakt in Claude Cowork) ersetzt das WYSIWYG des klassischen CMS.

## Entscheidung

**Das MDX-Bundle ist die Source of Truth. Postgres/Payload ist ein
generierter Index, kein primäres Authoring-Werkzeug.**

Konkret:

1. **Einziger Schreibpfad für Inhalt ist der Bundle-Upload.** Inhaltliche
   Änderungen laufen über Download → Edit (KI oder Hand) → Upload. Es gibt
   keinen zweiten, gleichberechtigten Content-Edit-Pfad.

2. **Die Payload-Admin-UI dient der Metadaten-Kuration, nicht dem
   Content-Editing.** Erlaubt: Publish/Unpublish, Lernpfad-Zusammenstellung,
   Sichtbarkeit/Reihenfolge auf Katalog-Ebene. Nicht vorgesehen als regulärer
   Weg: das Editieren von Lesson-Bodies im Lexical-Editor. (Der Editor bleibt
   technisch vorhanden, ist aber nicht der Authoring-Kanal.)

3. **Die DB hält nur, was Query/Join/Aggregation braucht** — Hierarchie
   (Course/Section/Lesson mit FKs), User-Progress-Anknüpfung,
   Lernpfad-Relationen, Katalog-Felder, Suche. Der MDX-Body bleibt die
   maßgebliche Inhaltsquelle.

4. **Die Preview rendert server-seitig, das Plugin zeigt nur an.** Das Plugin
   rendert MDX nicht selbst und bündelt keine Render-Logik. Es schickt die MDX
   an einen authentifizierten Preview-Endpoint, der mit der *exakten*
   Production-Pipeline rendert und HTML zurückgibt; das Plugin zeigt das
   sandboxed an. Brand-spezifisches CSS wird vom Server gezogen, nicht
   verteilt. (Siehe Konsequenz „Preview-Fidelity".)

   > **Nachtrag (2026-06-14): Decision 4 zurückgenommen — Preview entfernt.**
   > Der Single-MDX-Preview rendert eine Lektion *isoliert* — ohne Navigation,
   > Kurs-Kontext oder Fortschritt — und ist für echtes Review zu schwach.
   > Ersetzt durch **Upload-als-Draft + Begehen im echten Learner-Shell**
   > (`viewerCanSeeDrafts()`, lib/auth/session.ts): volle Navigation + Kontext,
   > und die Safety-Validierung (`assertSafeMdx`) läuft beim Upload ohnehin.
   > Bonus: die öffentliche, user-MDX-rendernde Seite `/preview/[id]` als
   > Angriffsfläche fällt weg. Entfernt: Endpoint, `preview-store`,
   > `/preview/[id]`, `mdx_previews`-Tabelle (Drizzle 0005), `course-preview`-
   > Skill + `client.mjs preview`. Der Loop ist damit zwei-stufig (siehe 6).

5. **Cowork-Sidebar ist eine optionale Oberfläche, nicht die einzige.**
   CLI + lokale Preview sind die robuste Basis; die Sidebar ist bequemes
   Frontend obendrauf.

6. **Der Authoring-Loop ist *ein* authentifizierter Client mit drei Stufen.**
   Preview und Upload sind dieselbe Client-Fähigkeit, unterschieden nur durch
   Endpoint und Effekt. Das Plugin spricht mit den Rechten des Users (scoped
   Token, siehe Sicherheits-Anforderungen) direkt mit dem Server:

   ```
   download → KI-Edit → preview  (Dry-Run: render + Diff, keine Persistenz)
                      → upload   (Commit: Draft, mit Conflict-Check + Summary)
                      → publish  (separat, explizit: Draft → live)
   ```

   > **Nachtrag (2026-06-14):** preview-Stufe entfernt (siehe Decision-4-Nachtrag);
   > aktueller Loop: `checkout → KI-Edit → upload (Draft) → Review im Learner-Shell → publish`.
   > Download = `course-checkout` / `GET /api/authoring/export/<slug>`.

   - **Same Token, same Bundle-Payload, unterschiedlicher Effekt.** Wer
     Preview ansteuern darf, darf mit denselben Rechten auch uploaden — ein
     separater manueller Browser-Schritt ist nicht nötig. Das ersetzt den
     bisherigen „ZIP bauen → manuell im Browser auf `/manage/import`
     hochladen"-Schritt des `course-publish`-Skills.
   - **Upload ≠ Publish.** Jeder Upload landet als **Draft** (Blast-Radius
     klein); `publish` bleibt eine getrennte, explizite Aktion, damit
     „live gehen" eine bewusste Handlung bleibt.
   - **Der manuelle Browser-Schritt war nie die Sicherheitsgrenze** — die liegt
     server-seitig (siehe Sicherheits-Anforderungen). Er war Intent-/
     UX-Bestätigung. Diese Bestätigung bleibt erhalten, nur verlagert: das
     Plugin zeigt die Import-Summary/den Diff und lässt den User bestätigen;
     ein Agent pusht nie still.

## Begründung

- **Kein Drift durch zwei Wahrheiten.** Solange Inhalt nur über den
  Bundle-Upload reinkommt, gibt es kein Sync-Back-Problem zwischen
  Frontmatter und DB-Feldern.
- **Passt zur KI-nativen Realität.** KI editiert Text/MDX exzellent; ein
  WYSIWYG-DB-Editor wäre ein Fremdkörper im erwarteten Loop.
- **Versionierbarkeit & Review.** Files lassen sich diffen, reviewen,
  versionieren — Git (bzw. das Bundle) ist das natürliche Audit-Log.
- **Weniger Code.** Wir bauen *kein* vollwertiges Authoring-Backend. Die
  Plattform-Admin-Fläche schrumpft auf Metadaten-Kuration.

## Konsequenzen & Design-Constraints

Diese Punkte sind beim Bau des Upload-/Preview-Loops verbindlich zu beachten:

1. **Konflikt-Erkennung beim Overwrite (kein Blind-Last-Write-Wins) —
   Pflicht, nicht Kür.** Beim Download wird eine `version` bzw. `content_hash`
   ins Frontmatter geschrieben. Der Upload prüft sie; bei Mismatch → **409 mit
   Diff-Vorschlag** statt stilles Überschreiben. Schützt vor Datenverlust, wenn
   zwei Sessions parallel denselben Kurs bearbeiten. **Verbindlich, weil der
   Direkt-Upload (Decision 6) den menschlichen Browser-Diff entfernt** — ohne
   diesen Check würde das Plugin sonst blind überschreiben.

2. **Preview-Fidelity über server-seitiges Rendering, nicht über einen
   verteilten Renderer.** Eine Preview, die anders aussieht als Production, ist
   schlimmer als keine. Statt die Render-Pipeline ins Plugin zu extrahieren/
   verteilen (zwei Render-Wahrheiten, Drift, Versionierung), bleibt der Server
   die einzige Render-Wahrheit:
   - **Render-Logik** (Komponenten-Mapping + MDX→HTML) ist brand-agnostisch
     und ändert sich selten → der Server rendert. Konkret: die bestehende
     Render-Page wird so refactored, dass sie auch aus *gepostetem* MDX
     rendert (nicht nur aus der DB) — derselbe Code, zweiter Aufrufpfad. Ein
     **Preview-Endpoint** nimmt MDX entgegen und gibt HTML zurück.
   - **Styling/Tokens** sind brand-spezifisch (aus `brand.yaml`, pro Deploy
     anders) und ändern sich oft → das kompilierte CSS wird vom Server
     **gezogen**, nie ins Plugin gebündelt (sonst zeigt das Plugin die falsche
     Brand).
   - Der Preview-Endpoint ist die Substanz; ein dünnes **MCP-Tool** davor ist
     optional, falls der Cowork-Agent die Preview als Tool orchestrieren soll.
     Asset-/CSS-Fetch dagegen ist simples authentifiziertes HTTPS und braucht
     kein MCP.
   - **Sicherheit (zwingend):** (a) Endpoint nur authentifiziert (er führt MDX
     effektiv aus → ohne Auth ein Code-Execution-/SSRF-Tor; Upload-Token/
     Session reusen); (b) dieselbe **Komponenten-Whitelist** wie Import/
     `course-validate` server-seitig erzwingen — kein beliebiges JSX/`import`;
     (c) zurückgeliefertes HTML im Plugin **sandboxed** anzeigen (iframe +
     strenge CSP).

   Trade-off: Preview braucht eine Verbindung (kein echtes Offline) — für den
   Authoring-Loop akzeptabel.

3. **Asset-Lifecycle.** Ein Kurs ist ein Ordner (`index`/`course.mdx` +
   `assets/`). Der Upload paketiert den Ordner; der Server **dedupliziert per
   Hash** und schreibt MDX-Pfade auf Plattform-Pfade um (siehe
   AUTHORING_BUNDLE → „Asset-Handling"). Umgang mit verwaisten Assets bei
   Overwrite ist explizit zu definieren (Phase-1: konservativ, kein
   Auto-Delete).

4. **Idempotenz + ID-Write-back.** Upload ist Upsert über stabile Slugs
   (Course-Slug plattformweit, Section/Lesson-Slug im Scope eindeutig). Beim
   ersten Upload generierte IDs werden ins Frontmatter zurückgeschrieben, so
   dass das Bundle selbst-identifizierend wird. Re-Upload aktualisiert,
   legt nicht doppelt an.

5. **Postgres-spezifisch (empfohlen, nicht zwingend in Phase 1):**
   - **JSONB für „weiche" Metadaten** (tags, Autoren, Voraussetzungen,
     Lernziele …) als `metadata jsonb`; Pflichtfelder (id, slug,
     lernpfad-/section-Relation, version) als echte Spalten mit FKs. Spart
     frühen Schema-Churn; einzelne Felder später nach Bedarf zu Spalten
     promoten.
   - **Volltextsuche nativ** via `tsvector` + GIN: beim Upload den
     extrahierten Plaintext der MDX in eine `search_doc`-Spalte schreiben →
     kein zusätzlicher Suchdienst (Elastic/Meili) nötig.

## Sicherheits-Anforderungen (nicht verhandelbar)

Leitsatz: **Keine Injection und keine Malware auf den Server — egal ob über
Upload oder Preview.** Beide Pfade teilen sich denselben MDX-Compile, daher
wird an genau dieser Grenze gehärtet, einmal. Die folgenden Constraints sind
verbindlich; der konkrete Gap-Status mit Datei:Zeile steht in
[`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md) → „Authoring-Pipeline".

1. **MDX ist Daten, nicht Code.** Der größte Vektor: MDX wird server-seitig zu
   JS kompiliert und ausgeführt. Daher am Compile **verbieten** (rejecten, nicht
   ignorieren):
   - **ESM** `import`/`export` (`mdxjsEsm`),
   - **JSX-Expressions** `{...}` (`mdxFlowExpression`/`mdxTextExpression`) —
     der konkrete RCE/Exfil-Vektor (`{process.env.X}`, `{(()=>{…})()}`),
   - **rohes HTML** via strenges `rehype-sanitize` (kein `<script>`/`<iframe>`/
     `on*`-Handler).

   „MDX" = Markdown + ein **geschlossenes Set typisierter, deklarativer
   Komponenten**. Die Komponenten-Whitelist muss auch HTML-Elemente abdecken,
   nicht nur Custom-Tags.

2. **Reject-at-the-boundary.** Bösartige/ungültige Bundles werden **beim Import
   abgelehnt, bevor sie persistieren**. Render-Härtung ist Defense-in-Depth
   obendrauf, nicht der einzige Schutz.

3. **Das Plugin ist untrusted.** Der `course-validate`-Skill läuft auf der
   Autoren-Maschine und ist **keine** Sicherheitsgrenze. Der Server
   re-validiert alles unabhängig und vertraut keinem Client-seitigen Check.

4. **Der Server ist die einzige Render-Wahrheit** (Preview rendert
   server-seitig, kein verteilter Renderer) — so gibt es nur **eine** zu
   härtende Pipeline. Zurückgeliefertes HTML wird im Plugin **sandboxed**
   angezeigt (iframe + strenge CSP).

5. **Token-Auth, minimal gescoped.** Der Plugin-Client authentifiziert über
   einen **Course-Authoring-Token** (nicht das Browser-Session-Cookie, nicht
   den Service-Key). Eigenschaften: nur auf Authoring gescoped (kein Admin),
   **widerrufbar**, kurze TTL. Dasselbe Token bedient Preview *und* Upload.

6. **Eingangs-Härtung an beiden Pfaden** (Details + Status in SECURITY_AUDIT):
   ZIP gegen Zip-Slip & Zip-Bomb (Entry-Anzahl, unkomprimierte Einzel-/
   Gesamtgröße, Ratio) und Symlink-Entries absichern; Assets per **Magic-Bytes**
   prüfen (nicht Extension), SVG droppen oder sanitisieren, Raster re-encodieren;
   Media mit CSP + `Content-Disposition: attachment` (oder separater Origin)
   ausliefern; Input-Size-Caps, Render-Timeout, Rate-Limiting auf Import/Preview.

## Abgrenzung / Was diese Entscheidung NICHT sagt

- Sie verbietet Payload nicht — Payload bleibt der Index, die Auth- und die
  Media-Schicht. Sie legt nur fest, dass Payload nicht der **Content-Authoring**-Kanal ist.
- Sie ist auf den aktuellen Autoren-Kreis zugeschnitten (technisch /
  KI-gestützt). **Trigger zum Re-Evaluieren:** sobald nicht-technische
  Autor:innen ohne Tooling-Kompetenz Kurse pflegen sollen, kann die Rechnung
  Richtung „headless CMS / vollwertige Authoring-UI" kippen. Dann neue ADR.

## Alternativen

- **A) MDX nur im Storage, kein Index.** Verworfen: User-Progress,
  Lernpfad-Relationen und Katalog-Filter/-Suche brauchen Queries/Joins, die
  reine Files nicht leisten.
- **B) Payload als klassisches CMS (DB ist Wahrheit, Lexical-Editor führt).**
  Verworfen: kollidiert mit KI-nativem Files-Authoring, erzeugt zwei
  Edit-Pfade und Drift, und ist mehr Backend-Code als nötig.
- **C) Gewählt: MDX = Source of Truth, DB = generierter Index.**

## Löst ab / ändert

- **`course-publish`-Skill + AUTHORING_BUNDLE-Annahme „kein Direkt-HTTP-Upload
  durch Plugin"** — Decision 6 ersetzt den manuellen Browser-Upload durch
  Direkt-Upload des authentifizierten Clients. Beim Umsetzen sind
  `tooling/course-plugin/skills/course-publish.md` und der Upload-Abschnitt in
  `docs/AUTHORING_BUNDLE.md` entsprechend nachzuziehen.

## Referenzen

- [`docs/AUTHORING_BUNDLE.md`](../AUTHORING_BUNDLE.md) — Bundle-Format,
  Idempotenz, Asset-Handling, Status-Verhalten
- [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md) → Abschnitt
  „Authoring-Pipeline" — Threat-Model + priorisierte Gap-Checkliste mit
  Datei:Zeile
- [`payload.config.ts`](../../payload.config.ts) — Collections, Schema,
  Single-Tenant-Architektur
