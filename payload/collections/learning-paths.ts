import type { CollectionConfig } from "payload";

import { editorsOnly, readPublishedOrEditor } from "../access/by-role";

/**
 * LearningPath = Bündel aus mehreren Kursen zu einer Reihe (Lernpfad).
 *
 * Separate Collection NEBEN Course (siehe courses.ts) — sie referenziert Kurse
 * nur lesend, besitzt sie nicht. Ein Kurs kann in 0..n Pfaden sein; Pfade lassen
 * sich vor oder nach den Kursen anlegen (designed wie emergent).
 *
 * Referenz per `courseSlug` (Text), NICHT per Payload-Relationship: die ganze
 * App referenziert Kurse durchgängig per Slug (lesson_progress, enrollments,
 * lesson_chunks — alle slug-basiert, keine FKs). Slug ist hier der konsistente
 * Schlüssel; aufgelöst wird in lib/paths.ts gegen lib/content.ts.
 *
 * Führungsgrad (Roadmap-Achse) ist in Slice 1 NUR Präsentation: steuert
 * Reihenfolge + Empfehlung, sperrt nichts (kein Gating). Die Rolle pro Kurs
 * (required/recommended/optional) drückt das pro Element aus.
 *
 * Mit Drafts (`versions.drafts`) → `_status` (draft/published). Pfade werden per
 * Authoring (MCP) als Draft angelegt, von Autoren/Admins im Learner-Shell
 * getestet und dann explizit publiziert. Read = readPublishedOrEditor:
 * Anon/Lerner sehen nur published, Editoren auch Drafts.
 */
export const LearningPaths: CollectionConfig = {
  slug: "learning-paths",
  labels: {
    singular: "Lernpfad",
    plural: "Lernpfade",
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "fuehrungsgrad", "_status"],
    description:
      "Ein Lernpfad bündelt bestehende Kurse zu einer Reihe. " +
      "Kurse werden per Slug referenziert, Reihenfolge über die Array-Position.",
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
          "URL-Slug, kebab-case, ASCII (z. B. 'drohnen-einstieg'). Landet in /paths/<slug>.",
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
          "Kurzer Pitch für die Pfad-Detailseite (1–2 Absätze, plain text).",
      },
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Titelbild für Pfad-Kachel und Detailseite.",
      },
    },
    {
      name: "fuehrungsgrad",
      type: "select",
      label: "Führungsgrad",
      required: true,
      defaultValue: "linear",
      options: [
        { label: "Linear (geführt)", value: "linear" },
        { label: "Lose (empfohlen)", value: "lose" },
      ],
      admin: {
        description:
          "Linear = geführte Reihenfolge (Onboarding, Zertifizierung). " +
          "Lose = empfohlene Sammlung, nach Bedarf navigierbar. " +
          "Steuert nur die Darstellung — sperrt nichts.",
      },
    },
    {
      name: "courses",
      type: "array",
      label: "Kurse im Pfad",
      minRows: 1,
      labels: {
        singular: "Kurs",
        plural: "Kurse",
      },
      admin: {
        description:
          "Kurse in gewünschter Reihenfolge. Position bestimmt die Reihenfolge im Pfad.",
      },
      fields: [
        {
          name: "courseSlug",
          type: "text",
          required: true,
          admin: {
            description: "Slug eines bestehenden Kurses (z. B. 'a2-drohne').",
          },
        },
        {
          name: "role",
          type: "select",
          required: true,
          defaultValue: "required",
          options: [
            { label: "Kern", value: "required" },
            { label: "Empfohlen", value: "recommended" },
            { label: "Optional", value: "optional" },
          ],
          admin: {
            description:
              "Kern = gehört fest zum Pfad; Empfohlen = sinnvoll; Optional = Vertiefung.",
          },
        },
      ],
    },
  ],
};
