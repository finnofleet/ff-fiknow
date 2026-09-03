# Stellungnahme zu den Auflagen des Betriebsrats (FINKNOW)

- **Stand:** 2026-09-03
- **Bezug:** Zustimmung des Betriebsrats zur Nutzung von FINKNOW unter drei
  zusätzlichen Bedingungen
- **Status:** Entwurf zur internen Abstimmung — enthält zwei Punkte, um die
  wir den Betriebsrat um eine Entscheidung bitten

---

## Kurzfassung

Zwei der drei Bedingungen waren technisch bereits erfüllt bzw. sind eine reine
Konfigurationsänderung. Die dritte — die Trennung von Inhaltspflege und
Nachweis-Einsicht — war **nicht** erfüllt und ist mit dem kommenden Release
umgesetzt. Zu zwei Punkten bitten wir den Betriebsrat um eine Entscheidung.

---

## Zu Bedingung 1 — `Audit_Compliance_Access` aktiv

**Erfüllt, sobald der Schalter gesetzt wird.** Die Protokollierung der
Nachweis-Zugriffe war bereits gebaut, aber absichtlich deaktiviert: zu
protokollieren, *wer* Schulungsnachweise einsieht, ist selbst eine Form der
Beschäftigten­überwachung (§ 87 Abs. 1 Nr. 6 BetrVG) und sollte deshalb nicht
ohne Zustimmung des Betriebsrats laufen. Mit der Freigabe wird der Schalter
umgelegt; ab dann wird jeder Aufruf des Nachweis-Dashboards und jeder
CSV-Export protokolliert.

Protokolliert wird dabei bewusst **wenig**: handelnde Person, Aktion,
Zeitpunkt. Keine Inhalte, keine Namen der betroffenen Mitarbeitenden, keine
Prüfungsergebnisse.

## Zu Bedingung 2 — Trennung von Content-Pflege und Compliance-Nachweisen

**War nicht erfüllt; ist mit diesem Release umgesetzt.**

Bisher war die Nachweis-Einsicht fest an die Rolle „Kurator:in" gekoppelt: wer
Kurse hochladen durfte, konnte damit automatisch auch die namentlichen
Schulungsnachweise sämtlicher Mitarbeitender einsehen und exportieren. Das war
genau der vom Betriebsrat beanstandete Zustand.

Ab diesem Release gilt:

- **Kurator:in** darf Kurse pflegen — und **keine** Nachweise mehr einsehen.
- **Admin** darf Nutzer verwalten — und **keine** Nachweise mehr einsehen.
- Nachweis-Einsicht hängt allein an einer **eigenen Rolle**, die über eine
  eigene Gruppe im zentralen Identitätsmanagement (Keycloak) vergeben wird.

Die Rollen sind additiv: Wer beides braucht, bekommt beide Gruppen — es gibt
keine Rolle, die Nachweis-Einsicht „nebenbei" mitbringt. Die Trennung ist
zusätzlich durch einen automatisierten Test abgesichert, der bei jedem Build
prüft, dass Kurator- und Admin-Rolle keine Nachweis-Berechtigung tragen. Ein
versehentliches Rückgängigmachen fällt damit sofort auf.

## Zu Bedingung 3 — Protokollierung

**Erfüllt.** Ein Audit-Log existiert (seit Version 0.2.0) und protokolliert
fortlaufend: Änderungen an Kursen und Lernpfaden, administrative Aktionen,
sowie — nach Umlegen des Schalters aus Bedingung 1 — die Zugriffe auf
Nachweise. Es ist ein reines Ereignis-Protokoll ohne Inhaltsdaten; das Log
kann bei Bedarf vom Plattform-Team abgefragt werden.

**Eine Abgrenzung, die uns wichtig ist:** Die Frage „*wer* hat einer Person
diese Berechtigung erteilt?" beantwortet nicht FINKNOW, sondern das
Identitätsmanagement (Keycloak). Rollen werden dort vergeben; FINKNOW sieht
beim Login nur noch das Ergebnis. Die Plattform hält deshalb fest, **seit
wann** ein Konto eine Rolle trägt — die Rechenschaft über die Vergabe liegt
bei der IT im führenden System. Wir schlagen vor, dass die IT bestätigt, dass
die dortige Admin-Protokollierung aktiviert ist, welche Aufbewahrungsfrist
dort gilt und wer sie einsehen darf.

---

## Bitte um Entscheidung 1 — Aufbewahrungsfristen für das Audit-Log

Das Audit-Log hat derzeit **keine Löschfrist** und wächst unbegrenzt. Das
halten wir für nicht haltbar: ein Überwachungsprotokoll, das nie endet, ist
für die protokollierten Personen genauso ein Problem wie ein fehlendes
Protokoll für die Nachvollziehbarkeit.

Wir schlagen **unterschiedliche Fristen je Art des Eintrags** vor, weil die
Einträge sehr unterschiedliche Zwecke haben:

| Art des Eintrags | Vorschlag | Begründung |
|---|---|---|
| **Zugriffe auf Nachweise** (wer hat eingesehen/exportiert) | **6–12 Monate** | Zweck ist das Erkennen von Missbrauch — das ist ein kurzfristiges Interesse. Eine längere Aufbewahrung macht aus der Schutzmaßnahme selbst ein Überwachungsarchiv. |
| **Rechte- und Lebenszyklus-Ereignisse** (seit wann trägt jemand eine Rolle, wurde ein Konto gelöscht) | **3 Jahre**, analog zur Nachweis-Aufbewahrung | Diese Einträge belegen genau das, was sie festhalten — sie sollten so lange existieren wie die Sache, die sie beweisen. |
| **Inhaltliche Vorgänge** (Kurs veröffentlicht, Lernpfad geändert) | **1–2 Jahre** | Betriebliche Historie, keine Beschäftigten-Daten. |

Ergänzend schlagen wir ein **zweistufiges Verfahren** vor: Wo ein Eintrag
länger aufbewahrt werden muss, wird nach Ablauf der kürzeren Frist zunächst
nur die **Personenkennung entfernt** und der Vorgang selbst behalten. Damit
bleibt nachweisbar, *dass* etwas geschehen ist, ohne dass die Person dauerhaft
identifizierbar bleibt.

> **Hinweis:** Die Fristen oben sind ein Vorschlag aus Datenschutz- und
> Rechenschaftssicht. Die abschließende rechtliche Bewertung liegt beim
> Datenschutzbeauftragten.

## Bitte um Entscheidung 2 — Wo der Schalter aus Bedingung 1 liegen soll

Derzeit ist die Protokollierung der Nachweis-Zugriffe eine
Deployment-Einstellung: sie zu ändern erfordert eine Auslieferung durch die
IT. Das hat einen Vorteil für den Betriebsrat — **niemand kann sie im
laufenden Betrieb unbemerkt abschalten**.

Die Alternative wäre, sie (zusammen mit den Fristen oben) in eine
Administrationsoberfläche zu legen. Das wäre sichtbarer und leichter
anzupassen; jede Änderung würde selbst protokolliert. Es wäre aber eben auch
leichter zu ändern.

Wir haben dazu keine Präferenz und bitten den Betriebsrat um eine Festlegung.
