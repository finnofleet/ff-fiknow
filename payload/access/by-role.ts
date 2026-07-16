/**
 * Wiederverwendbare Access-Funktionen für Content-Collections.
 *
 * Phase-1-Modell:
 *   - Anonyme Besucher und Lerner sehen nur published Inhalte
 *     (Lerner = später User aus GoTrue-SSO; aktuell nur Editors da)
 *   - Editoren (Records in `users`-Collection) sehen alles inkl. Drafts
 *   - Mutationen (create/update/delete) nur für Editoren
 *
 * Phase 1.5 (SSO-Bridge):
 *   - GoTrue-User landen mit anderer collection als 'users' im req.user
 *   - Damit greift dieselbe Logik weiter: nur 'users' (=Editoren)
 *     sehen Drafts und dürfen schreiben, Lerner sehen Published
 */
import type { Access } from "payload";

/** Read-Access: Editors sehen alles, alle anderen nur published. */
export const readPublishedOrEditor: Access = ({ req: { user } }) => {
  if (user?.collection === "users") return true;
  return {
    _status: { equals: "published" },
  };
};

/**
 * Öffentlicher Read — für Collections OHNE Draft-/Publish-Status (Media).
 *
 * `readPublishedOrEditor` ist hier FALSCH: es filtert Anon auf
 * `_status: published`, aber Media hat keine `versions` → das Feld existiert
 * nicht → anonyme Requests bekämen NICHTS, und published Kurse hätten für
 * Lerner kaputte Bilder. Media-Dateien liegen ohnehin in `public/media` und
 * sind via `/media/<name>` statisch öffentlich erreichbar; der access-gated
 * `/api/media/file/<name>`-Endpoint (den die Lesson-Bodies referenzieren) muss
 * dazu konsistent auch für Anon lesbar sein. Mutationen bleiben `editorsOnly`.
 *
 * (Echte vertrauliche Assets bräuchten ein anderes Modell — privates
 * Verzeichnis + signierte URLs; heute nicht vorgesehen.)
 */
export const anyoneCanRead: Access = () => true;

/** Mutation-Access: nur Editoren. */
export const editorsOnly: Access = ({ req: { user } }) => {
  return user?.collection === "users";
};
