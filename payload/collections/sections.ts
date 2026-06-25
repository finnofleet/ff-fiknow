import type { CollectionConfig } from "payload";

import { editorsOnly, readPublishedOrEditor } from "../access/by-role";

/**
 * Section = mittlere Ebene. Bündelt Lessons innerhalb eines Kurses.
 *
 * Reihenfolge wird über orderIndex gesteuert (numerisch, manuell zu pflegen).
 * Slug ist innerhalb eines Kurses unique (nicht global), damit verschiedene
 * Kurse z. B. beide '01-grundlagen' haben können.
 */
export const Sections: CollectionConfig = {
  slug: "sections",
  admin: {
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "slug",
      "course",
      "orderIndex",
      "_status",
    ],
    description:
      "Section gehört zu genau einem Kurs. Reihenfolge im Kurs via orderIndex (1, 2, 3 …).",
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
      admin: {
        description:
          "URL-Fragment innerhalb des Kurses (z. B. '01-grundlagen'). " +
          "Innerhalb desselben Kurses unique.",
      },
    },
    {
      name: "course",
      type: "relationship",
      relationTo: "courses",
      required: true,
      hasMany: false,
      index: true,
    },
    {
      name: "orderIndex",
      type: "number",
      required: true,
      min: 0,
      defaultValue: 1,
      admin: {
        description: "Position im Kurs (1, 2, 3 …). Bestimmt Reihenfolge.",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description:
          "Kurzer Intro-Text für die Section (wird auf der Kurs-Detailseite angezeigt).",
      },
    },
  ],
};
