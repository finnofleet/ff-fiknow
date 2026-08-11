import type { CollectionConfig } from "payload";

import { MAX_MDX_SOURCE_CHARS } from "../../lib/mdx/limits";
import { editorsOnly, readPublishedOrEditor } from "../access/by-role";

/**
 * Lesson = unterste Ebene. Atomarer Lerninhalt.
 *
 * Body ist plain MDX (textarea) — wird im Frontend mit next-mdx-remote
 * gerendert und unterstützt unsere Custom-Components:
 * <Callout>, <KeyTakeaways>, <Steps>, <DefinitionList> mit <Definition>,
 * <Pullquote>, <Figure>, <Question> mit <Option> (nur in Quiz-Lessons).
 *
 * Lesson-Typen:
 *   - reading: Standard-Lesson, body = MDX-Text
 *   - video:   videoUrl + transcript, body = ergänzender Text (optional)
 *   - quiz:    body enthält <Question>-Komponenten + ggf. Einleitung
 */
export const Lessons: CollectionConfig = {
  slug: "lessons",
  admin: {
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "type",
      "section",
      "orderIndex",
      "_status",
    ],
    description:
      "Lesson gehört zu einer Section. Body ist MDX — siehe AUTHORING.md " +
      "und FINKNOW-AUTOR-GUIDE.md für unterstützte Components.",
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
          "URL-Fragment innerhalb der Section (z. B. '01-was-ist-a2'). " +
          "Innerhalb derselben Section unique.",
      },
    },
    {
      name: "section",
      type: "relationship",
      relationTo: "sections",
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
        description:
          "Position innerhalb der Section (1, 2, 3 …). Bestimmt Reihenfolge.",
      },
    },
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "reading",
      options: [
        { label: "Reading (Text)", value: "reading" },
        { label: "Video", value: "video" },
        { label: "Quiz", value: "quiz" },
      ],
    },
    {
      name: "estimatedMinutes",
      type: "number",
      label: "Geschätzte Lernzeit (Minuten)",
      min: 0,
    },
    {
      name: "summary",
      type: "textarea",
      admin: {
        description:
          "1–2 Sätze Kurzbeschreibung — wird in Übersichten und Karten angezeigt.",
      },
    },
    {
      name: "body",
      type: "textarea",
      // Size-Cap gegen Compile-Bomben (SECURITY_AUDIT 10); identisch zum
      // Import-Reject in lib/mdx/validate.ts.
      maxLength: MAX_MDX_SOURCE_CHARS,
      admin: {
        description:
          "Lesson-Inhalt als MDX. Direkt aus AI-Tool (Cowork) paste-bar — " +
          "Custom-Components sind erlaubt: <Callout>, <KeyTakeaways>, <Steps>, " +
          "<DefinitionList>, <Pullquote>, <Figure>, <Question> (nur in Quiz).",
        rows: 25,
      },
    },
    // Video-spezifisch
    {
      name: "videoUrl",
      type: "text",
      label: "Video-URL (nur bei type=video)",
      admin: {
        condition: (data) => data?.type === "video",
        description: "z. B. YouTube-Embed-URL oder direkte MP4-URL.",
      },
    },
    {
      name: "transcript",
      type: "textarea",
      label: "Transkript (nur bei type=video)",
      admin: {
        condition: (data) => data?.type === "video",
        description: "Eine Aussage pro Zeile, optional mit [Timestamp].",
        rows: 12,
      },
    },
    // Quiz-spezifisch
    {
      name: "passingScore",
      type: "number",
      label: "Bestehensgrenze (0–1, nur bei type=quiz)",
      min: 0,
      max: 1,
      defaultValue: 0.7,
      admin: {
        condition: (data) => data?.type === "quiz",
        description:
          "Mindestanteil korrekter Antworten (z. B. 0.7 = 70 %).",
      },
    },
    {
      name: "finalExam",
      type: "checkbox",
      label:
        "Abschlusstest (summativ — Bestehen ist fuer den Nachweis verbindlich)",
      defaultValue: false,
      admin: {
        condition: (data) => data?.type === "quiz",
        description:
          "Wenn aktiv, wird die Bewertung server-seitig aus dem Lesson-Body " +
          "neu berechnet (Client-Werte sind fuer einen verbindlichen Test " +
          "nicht vertrauenswuerdig) — ein Nichtbestehen markiert die Lektion " +
          "NICHT als erledigt.",
      },
    },
    // Fragen-Pool (ADR 0009, D2-ii-a): Alternative zu einem fest im Body
    // verdrahteten Abschlusstest — die Fragen liegen strukturiert im
    // `questions`-Index (D1), pro Versuch werden `questionsPerAttempt` davon
    // deterministisch gezogen. Nur sinnvoll fuer Abschlusstest-Quizze, daher
    // an `finalExam` gekoppelt (admin.condition).
    {
      name: "questionPool",
      type: "text",
      hasMany: true,
      label: "Fragen-Pool (Slugs, nur bei Abschlusstest)",
      admin: {
        condition: (data) => data?.type === "quiz" && Boolean(data?.finalExam),
        description:
          "Autor-Slugs von Fragen aus dem questions-Index (questions/<slug>.mdx " +
          "im Bundle). Pro Versuch werden davon `questionsPerAttempt` Fragen " +
          "deterministisch gezogen, statt eines fest im Body verdrahteten Tests.",
      },
    },
    {
      name: "questionsPerAttempt",
      type: "number",
      label: "Fragen pro Versuch (nur bei Fragen-Pool)",
      min: 1,
      admin: {
        condition: (data) => data?.type === "quiz" && Boolean(data?.finalExam),
        description:
          "Anzahl Fragen, die pro Versuch aus questionPool gezogen werden. " +
          "Leer = alle Pool-Fragen.",
      },
    },
  ],
};
