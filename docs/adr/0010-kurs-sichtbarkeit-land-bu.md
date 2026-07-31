# ADR 0010 — Kurs-Sichtbarkeit nach Land/BU: Relevanz-Attribut am Kurs (Katalog & Zugriff)

- **Status:** Proposed
- **Datum:** 2026-07-31
- **Kontext-Phase:** Content-Modell / Sichtbarkeit / Zielgruppe
- **Betroffene Bereiche:** `payload/collections/courses.ts` (neues Land/BU-Feld,
  analog `complianceDrivers`), Bundle-Frontmatter +
  `lib/authoring/bundle-parser.ts`/`import.ts` (ADR 0001, Frontmatter→DB-Index),
  Katalog-Filter (`app/(frontend)/courses/catalog-client.tsx`),
  Course/Section/Lesson-Read-Pfad (`lib/content.ts`,
  `payload/access/by-role.ts`), Media-Auslieferung (`public/media`,
  `MEDIA_STORAGE_DIR`), Login-Gate der Kurs-Seiten (`lib/auth/session.ts`,
  `app/(frontend)/courses/[slug]/page.tsx`) + `/api/*`-Session-Gate
  (`proxy.ts`), `payload/collections/training-requirements.ts` (Konsistenz zum
  bestehenden Pflicht-Targeting).
- **Verwandt:** [[0001-mdx-bundle-als-source-of-truth-db-als-index]] (Bundle =
  Source of Truth, Frontmatter→DB-Index, ID-Write-back),
  [[0007-mandanten-scoping-und-auswerte-ebenen]] (Land/BU-Dimension,
  `profiles.land/bu`, App-seitige Scope-Durchsetzung),
  [[0008-rls-haertung]] (RLS zurückgestellt → Durchsetzung bleibt App-Code),
  [[0005-pflichtkurse-und-compliance-nachweis]] (Pflichtkurse,
  `complianceDrivers`-Taxonomie), `docs/ROADMAP.md` (Abschnitte
  „Zielgruppen-/BU-Sichtbarkeit", „Mandantierung", „Ausbau-Idee: vertrauliche /
  zielgruppen-beschränkte Kurse").

---

## Kontext

Product-Owner-Anstoß, mit konkreten Use Cases:

- Der **EU AI Act** gilt für DE, nicht für CH — ein entsprechender Kurs ist
  für DE relevant/pflichtig, für CH schlicht irrelevant.
- Ein **Produkt-Onboarding-Kurs**, der nur in einer Business Unit Sinn ergibt.
- Allgemein: **länder-/BU-spezifische Inhalte**, weil sich Stack/Tools je BU
  unterscheiden.

**Zwei unterschiedliche Fragen, leicht zu verwechseln — heute existiert nur
die eine, verifiziert am Code:**

1. **Pflicht-Targeting** (gebaut, ADR 0005/0007 §4): `training-requirements`
   trägt ein optionales `landScope`/`buScope`-Array-Feld
   (`payload/collections/training-requirements.ts:121-158`), das eingrenzt,
   **für wen ein Kurs verpflichtend** ist — zusätzlich (UND) zu Rolle/User,
   leer = alle. Das beantwortet „muss ich das machen", nicht „sehe ich das
   überhaupt".
2. **Kurs-Sichtbarkeit im Katalog** (nicht gebaut — dieses Konzept): **ob ein
   Land/eine BU den Kurs überhaupt sieht/erreicht.** Heute ist Sichtbarkeit
   binär: `draft` = nur Editoren, `published` = **alle**, inklusive anonymer
   Besucher, **Text UND Assets** (`payload/access/by-role.ts` —
   `readPublishedOrEditor` für Course/Section/Lesson, `anyoneCanRead` für
   Media; Media liegt zusätzlich statisch öffentlich unter `public/media`
   bzw. `MEDIA_STORAGE_DIR`). Ein Kurs, der per `training-requirements` nur
   für DE pflichtig ist, bleibt für CH im Katalog **sichtbar** — nur eben
   nicht als Pflicht. Nicht-Pflichtkurse (der Onboarding-/Stack-Use-Case oben)
   haben **gar kein** Land/BU-Feld, an dem sich irgendetwas eingrenzen ließe.

**Verifiziert (2026-07-31):** Die kurs-bezogenen Seiten sind bereits
**login-gegatet** (`b1fc2df`, „Login-Gate für kurs-bezogene Routen"):
`app/(frontend)/courses/[slug]/page.tsx:82` — wie auch `/courses`, `/learn/…`,
`/paths`, `/dashboard`, `/meine-pflichtschulungen` — ruft `getCurrentUser()`
(`lib/auth/session.ts`) und leitet anonyme Besucher per `redirect("/")` auf die
Welcome-Startseite. Zusätzlich riegelt `proxy.ts`s `gateApi` die `/api/*`-Fläche
inkl. `/api/media/*` per Session ab. **Aber:** auf der Payload-Access-Ebene
bleibt `published` grundsätzlich für jeden (auth.) Nutzer lesbar
(`readPublishedOrEditor`/`anyoneCanRead`, `payload/access/by-role.ts`), ohne
Land/BU-Filter, und Assets liegen statisch öffentlich unter
`public/media`/`MEDIA_STORAGE_DIR`. **Login ist also bereits Voraussetzung** —
ein hartes Land/BU-Gate müsste daher kein neues Login einführen, sondern das
(bereits authentifizierte) `profiles.land/bu` gegen das Kurs-Attribut prüfen
**und** den Filter auf die Daten-/Media-Ebene ziehen (siehe unten), nicht nur
auf die Seite.

Der Katalog hat bereits eine Filterung (Freitext, Kategorie, Schwierigkeit,
client-seitig über bereits geladene Kurse, `catalog-client.tsx`) — ein
Land/BU-Filter würde diese um eine weitere Dimension erweitern, nicht neu
erfinden.

`courses.complianceDrivers` (ADR 0005 Phase 6a) ist eine **Treiber-Taxonomie**
(EU AI Act, ISO 27001, …) — sie sagt, **warum** ein Kurs regulatorisch
getrieben ist, ist aber **kein geografisches Gate**. Ein DE/CH-Unterschied
lässt sich daraus nicht ableiten.

## Entscheidungs-Richtung (Proposed — Aufriss, keine Festlegung)

### 1. Attribut lebt im Bundle-Frontmatter, gespiegelt in den DB-Index

Konsistent mit ADR 0001: das Kurs-Bundle (`course.mdx`) bleibt Source of
Truth. Ein neues, optionales Frontmatter-Feld — Arbeitstitel `visible_land` /
`visible_bu` (mehrwertig, analog `landScope`/`buScope` auf
`training-requirements`) — landet beim Bundle-Import in den Payload-Kurs-
Datensatz (`courses`-Collection, analog zu `complianceDrivers`). Konvention
**„leer = für alle sichtbar"** (identisch zur `landScope`/`buScope`-
Konvention) — bestehende Kurse defaulten ohne Migration auf „alle", kein
Backfill nötig.

### 2. Verhältnis zum Pflicht-Targeting (`training-requirements`): Konsistenz erzwingen

**Entschieden (Steuerung Product Owner, 2026-07-31):** Sichtbarkeit und
Pflicht-Targeting dürfen sich nicht widersprechen — ein Kurs, der nur für CH
sichtbar ist, darf nicht für DE pflichtig sein (man kann niemanden zu etwas
verpflichten, das er nicht sieht). Es gilt daher **Pflicht-Scope ⊆
Sichtbarkeits-Scope**: der `landScope`/`buScope` einer `training-requirement`
muss innerhalb der Land/BU-Sichtbarkeit des referenzierten Kurses liegen.

**Feinheit — `leer = alle` auf beiden Feldern zusammenlesen:** Ist die
Sichtbarkeit eines Kurses eingeschränkt (z. B. nur CH), dann ist ein **leerer**
Pflicht-Scope (= alle) bereits inkonsistent, weil „alle" auch DE einschließt,
das den Kurs nicht sieht. Bei eingeschränkter Sichtbarkeit muss der
Pflicht-Scope also aktiv gesetzt und ⊆ der Sichtbarkeit sein; nur wenn die
Sichtbarkeit selbst „leer = alle" ist, ist jeder Pflicht-Scope zulässig.

Als Wahrheitstabelle (S = Kurs-Sichtbarkeit, P = Pflicht-Scope):

| Sichtbarkeit S | Pflicht-Scope P | gültig? | warum |
|---|---|---|---|
| leer (= alle) | leer (= alle) | ✓ | alle ⊆ alle |
| leer (= alle) | DE | ✓ | DE ⊆ alle |
| CH | CH | ✓ | CH ⊆ CH |
| CH | DE | ✗ | DE ⊄ CH |
| CH | leer (= alle) | ✗ | alle ⊄ CH — „alle" schließt DE ein, das S nicht sieht |

Nur die letzte Zeile ist nicht offensichtlich: eingeschränkte Sichtbarkeit
verträgt keinen leeren (= alle) Pflicht-Scope.

**Entschieden (2026-07-31): warnen, nicht hart blocken.** Verlässt der
Pflicht-Scope die Kurs-Sichtbarkeit, gibt das Speichern einer
`training-requirement` eine **Warnung** aus (Payload-`validate`/Lifecycle-Hook,
der den referenzierten Kurs mitprüft), lehnt aber nicht ab — der/die Autor:in
entscheidet bewusst. Gleiche Logik für **nachträglich verengte
Kurs-Sichtbarkeit**, die bestehende Requirements inkonsistent macht: als
Warnung/Report sichtbar machen, nicht erzwungen auflösen. Begründung: die
Inkonsistenz ist selten und oft transitorisch (die Sichtbarkeit wird evtl. noch
angepasst); ein hartes Gate stünde dem Authoring-Fluss im Weg, ohne
verhältnismäßigen Gewinn.

### 3. Durchsetzungsgrad: weich (Katalog-Filter) vs. hart (Zugriffs-Gate)

- **Weich (v1-Kandidat):** nur **Katalog-/Präsentationsfilter** — ein
  Land/BU außerhalb des Attributs sieht den Kurs in `/courses` nicht
  (Erweiterung der bestehenden Freitext-/Kategorie-/Schwierigkeits-
  Filterung, `catalog-client.tsx`). Ein direkter Link zur Kurs-Seite bliebe
  technisch erreichbar — Relevanz-Steuerung, kein Sicherheits-Gate.
- **Hart:** echtes Zugriffs-Gate auf Course/Section/Lesson-Read. Zwei
  zusammenhängende Punkte:
  - **Login ist bereits Voraussetzung** (Seiten-Gate `redirect("/")`, siehe
    Kontext) — ein hartes Land/BU-Gate fügt keine neue Login-Pflicht hinzu,
    sondern prüft das *bekannte* `profiles.land/bu` (ADR 0007) des
    eingeloggten Nutzers gegen das Kurs-Attribut. Zu schließen bleibt die
    **Daten-/Local-API-Ebene**: `readPublishedOrEditor` gibt `published` heute
    an jeden authentifizierten Nutzer heraus, ohne Land/BU-Filter — das Gate
    muss dort (Access/Loader) ansetzen, nicht nur auf der gerenderten Seite.
  - **Media müsste aus `public/media` raus** (privater Store oder signierte
    URLs — `MEDIA_STORAGE_DIR` ist bereits env-konfigurierbar, Vorarbeit laut
    ROADMAP „Ausbau-Idee: vertrauliche / zielgruppen-beschränkte Kurse"),
    sonst blieben Assets eines eigentlich eingeschränkten Kurses statisch
    öffentlich erreichbar.

### 4. Durchsetzung bleibt App-seitig

Wie beim Scoping in ADR 0007 ist RLS für diese Ebene kein Thema — ADR 0008
hat die RLS-Härtung bewusst zurückgestellt. Ein Land/BU-Filter (weich oder
hart) läuft über App-Code (Loader/Query bzw. Page-Gate), nicht über
DB-Policies.

## Begründung

- Nutzt dieselbe, bereits etablierte `null = alle`-Konvention wie
  `landScope`/`buScope` (ADR 0005/0007) — kein neues Denkmodell.
- Bundle-Frontmatter statt DB-Admin-Feld hält ADR 0001 konsequent ein
  (Kurs-Autoren pflegen Sichtbarkeit im selben Fluss wie andere Metadaten,
  kein zweiter Schreibpfad).
- Trennt bewusst „darf ich" (Pflicht-Targeting) von „sehe ich"
  (Sichtbarkeit) — dieselbe Achsen-Trennungslogik wie ADR 0007
  (Rechte vs. Scope), hier auf Content statt Personen angewendet.

## Konsequenzen / Constraints

- **Backfill/Default:** leer = alle, keine Migration bestehender Kurse
  nötig.
- **Auth-Kopplung bei hartem Gate:** Login ist für Kurs-Seiten bereits
  erzwungen (`b1fc2df`), ein bekanntes `profiles.land/bu` liegt also vor — kein
  neues Seiten-Login-Gate nötig. Zu bauen ist der Land/BU-Abgleich auf der
  Daten-/Access-Ebene (`payload/access/by-role.ts` bzw. Loader), wo `published`
  heute ungefiltert an jeden authentifizierten Nutzer herausgeht.
- **Media-Migration bei hartem Gate:** eingeschränkte Kurse bräuchten
  Assets außerhalb `public/media` (privater Store oder signierte URLs) —
  sonst bleibt das Sicherheitsversprechen löchrig.
- **Konsistenz zum Pflicht-Targeting:** Pflicht-Scope soll ⊆
  Sichtbarkeits-Scope liegen (Punkt 2); Verletzungen werden beim
  Requirement-Speichern **gewarnt, nicht geblockt**. Die `leer = alle`-Semantik
  ist auf **beiden** Feldern zu berücksichtigen (eingeschränkte Sichtbarkeit +
  leerer = „alle"-Pflicht-Scope ist bereits inkonsistent → Warnung).
- **Abgrenzung zur Mandantierung:** dies ist eine **leichte
  Relevanz-/Präsentationsschicht** am Content, **keine Multi-Tenancy** —
  keine getrennten Deployments/Schemata, keine eigene Rechteverwaltung. Die
  größere ROADMAP-„Mandantierung" bleibt unberührt und wird nicht
  präjudiziert.

## Alternativen

- **(a) Status quo — Zielgruppe nur im `summary`-Text nennen.** Heutige
  Content-Style-Konvention. Keine Durchsetzung, kein Filter, rein
  informativ — deckt keinen der drei Use Cases wirklich ab (ein
  CH-Lerner sieht weiterhin den für ihn irrelevanten DE-AI-Act-Kurs im
  Katalog).
- **(b) Nur über `training-requirements`-Scope lösen.** Verworfen: deckt
  weder Katalog-Sichtbarkeit noch Nicht-Pflichtkurse ab (der
  Onboarding-/Stack-Use-Case hat gar keine Requirement, an der sich etwas
  eingrenzen ließe).
- **(c) Kategorie/Tag zweckentfremden.** Verworfen: semantisch falsch —
  Kategorie/Schwierigkeit sind inhaltliche Filter, keine
  Organisations-Zugehörigkeit; würde beide Konzepte vermischen.
- **(d) Volle Mandantierung jetzt bauen.** Verworfen: zu groß, YAGNI —
  bewusst zurückgestellt, wie die ROADMAP unter „Mandantierung" bereits
  festhält.

## Offene Fragen

1. Reicht Weich (Katalog-Filter) als v1, oder ist ein hartes Gate von Anfang
   an Anforderung (Trigger: vertrauliche/interne Kurse, siehe ROADMAP)?
2. Feldname/-Ort im Frontmatter, Konsistenz mit der
   `landScope`/`buScope`-Notation?
3. Wer pflegt das Attribut — nur Autoren im Bundle, oder braucht es
   nachträglich eine Admin-UI (`/manage`)?
4. Falls hartes Gate: greift der Land/BU-Filter auch auf der Daten-/Local-API-
   Ebene und im RAG-/Tutor-Retrieval (`lib/rag/*`, ADR 0002/0003)? Sonst
   erreicht ein Nutzer außerhalb des Scopes die Inhalte weiterhin über
   Tutor-Antworten oder direkte API-/Media-Zugriffe, obwohl Katalog und Seite
   gefiltert sind.

*(Die frühere Frage „Pflicht ⊆ Sichtbarkeit — hart ablehnen oder warnen?" ist
entschieden: Konsistenz gefordert, Verstoß → Warnung, siehe Entscheidungspunkt 2.)*

## Referenzen

- `payload/collections/training-requirements.ts` (`landScope`/`buScope`,
  Zeilen 121–158)
- `payload/collections/courses.ts` (`complianceDrivers`, `mandatory`)
- `payload/access/by-role.ts` (`readPublishedOrEditor`, `anyoneCanRead`)
- `proxy.ts` (`gateApi`, Session-Gate auf `/api/*`)
- `app/(frontend)/courses/[slug]/page.tsx` (Login-Gate `redirect("/")`, `b1fc2df`)
  + `lib/auth/session.ts` (`getCurrentUser`, `viewerCanSeeDrafts`)
- `app/(frontend)/courses/catalog-client.tsx` (bestehende Katalog-Filterung)
- `docs/ROADMAP.md` — „Zielgruppen-/BU-Sichtbarkeit", „Mandantierung",
  „Ausbau-Idee: vertrauliche / zielgruppen-beschränkte Kurse"
- [[0001-mdx-bundle-als-source-of-truth-db-als-index]]
- [[0005-pflichtkurse-und-compliance-nachweis]]
- [[0007-mandanten-scoping-und-auswerte-ebenen]]
- [[0008-rls-haertung]]
