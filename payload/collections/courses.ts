import type { CollectionConfig } from "payload";

import { editorsOnly, readPublishedOrEditor } from "../access/by-role";

/**
 * Course = oberste Ebene des Content-Modells.
 *
 * Hierarchie: Course → Section → Lesson (strikt 3 Ebenen).
 *
 * Lernpfade (Course-Bündel) sind eine spätere Ergänzung als
 * separate Collection — siehe roadmap. Greift dann lesend auf
 * dieses Modell zu, ohne Migration nötig.
 */
export const Courses: CollectionConfig = {
  slug: "courses",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "category", "difficulty", "_status"],
    description:
      "Ein Kurs bündelt Sections, die wiederum Lessons enthalten. " +
      "Slug landet in der URL — kebab-case, ohne Umlaute.",
  },
  access: {
    read: readPublishedOrEditor,
    create: editorsOnly,
    update: editorsOnly,
    delete: editorsOnly,
  },
  versions: {
    drafts: {
      autosave: { interval: 2000 },
    },
    maxPerDoc: 20,
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          "URL-Slug, kebab-case, ASCII (z. B. 'a2-drohne'). Ändert die Kurs-URL.",
      },
    },
    {
      name: "subtitle",
      type: "text",
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description:
          "Kurzer Pitch für die Kurs-Detailseite (1–2 Absätze, plain text).",
      },
    },
    {
      name: "category",
      type: "text",
      admin: {
        description:
          "Frei wählbar; im Katalog später als Filter nutzbar (z. B. 'Recht', 'Vertrieb').",
      },
    },
    {
      name: "difficulty",
      type: "select",
      options: [
        { label: "Einsteiger", value: "einsteiger" },
        { label: "Mittel", value: "mittel" },
        { label: "Fortgeschritten", value: "fortgeschritten" },
      ],
    },
    {
      name: "estimatedMinutes",
      type: "number",
      label: "Geschätzte Lernzeit (Minuten)",
      min: 0,
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Titelbild für Kurskachel und Detailseite.",
      },
    },
    {
      name: "prerequisites",
      type: "textarea",
      label: "Voraussetzungen",
      admin: {
        description:
          "Was solltest du wissen oder können, bevor du diesen Kurs anfängst? " +
          "1–3 kurze Sätze, wird prominent auf der Kurs-Detailseite angezeigt. " +
          "Leer lassen, wenn keine Voraussetzungen.",
        rows: 3,
      },
    },
    {
      name: "version",
      type: "text",
      admin: {
        readOnly: true,
        position: "sidebar",
        description:
          "Server-verwaltetes Konflikt-Token (Self-Identifying Bundle, ADR 0001). " +
          "Wird bei jedem Bundle-Import neu gesetzt und gegen die vom Client " +
          "mitgeschickte Version geprüft. NICHT manuell editieren.",
      },
    },
    {
      name: "tutorEnabled",
      type: "checkbox",
      label: "KI-Tutor freigeschaltet",
      admin: {
        position: "sidebar",
        description:
          "Schaltet den KI-Tutor (ADR 0002) für diesen Kurs frei. NUR für " +
          "öffentliche/freigegebene Kurse aktivieren — der Tutor schickt " +
          "Lektions-Inhalt + Lerner-Fragen an einen externen LLM-Anbieter. " +
          "Vertrauliche Kurse: aus lassen.",
      },
    },
  ],
};
