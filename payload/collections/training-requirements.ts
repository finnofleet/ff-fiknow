import type { CollectionConfig } from "payload";

import { LAND_OPTIONS } from "@/lib/land-tokens";

import { editorsOnly } from "../access/by-role";

/**
 * TrainingRequirement = feingranulare Pflicht-Zuweisung für einen Kurs
 * (ADR 0005 §1) — bestimmte Rollen oder einzelne User, abweichende Fristen,
 * Rezertifizierungs-Intervall.
 *
 * Ergänzt (dupliziert NICHT) den `mandatory`-Toggle auf `courses`: der
 * Toggle deckt den Standardfall „Pflicht für alle Lerner" ab, diese
 * Collection den Rest. „Ist Pflicht" = `courses.mandatory` ODER es existiert
 * eine aktive Requirement für den Kurs — beide Quellen laufen im
 * Phase-2-Reconciler durch denselben Pfad zu `training_assignments`
 * (Drizzle).
 *
 * Referenz auf den Kurs per `courseSlug` (Text), NICHT per Payload-
 * Relationship — konsistent mit `learning-paths.ts` und dem gesamten
 * Tracking (enrollments/lesson_progress sind alle slug-basiert, kein FK).
 *
 * Phase 1 = NUR Schema. Kein Reconcile, kein Hook-Verhalten — das kommt in
 * Phase 2 (`reconcileAssignments()`).
 */
export const TrainingRequirements: CollectionConfig = {
  slug: "training-requirements",
  labels: {
    singular: "Pflicht-Anforderung",
    plural: "Pflicht-Anforderungen",
  },
  admin: {
    useAsTitle: "courseSlug",
    defaultColumns: ["courseSlug", "target", "recurrenceMonths", "active"],
    description:
      "Feingranulare Pflicht-Zuweisung für einen Kurs: bestimmte Rollen " +
      "oder einzelne User, abweichende Fristen, Rezertifizierung. Ergänzt " +
      "den 'Pflichtkurs'-Toggle auf Kursen (der Pflicht für ALLE Lerner " +
      "setzt). Schema-only in Phase 1 — der Reconciler, der daraus " +
      "Zuweisungen erzeugt, folgt in Phase 2 (ADR 0005).",
  },
  access: {
    read: editorsOnly,
    create: editorsOnly,
    update: editorsOnly,
    delete: editorsOnly,
  },
  // Kein afterChange-Reconcile-Trigger: Assignments werden NICHT eager beim
  // Save materialisiert. Grund (ADR 0005, via Live-Test belegt): ein
  // afterChange-Hook läuft INNERHALB der Payload-Create-Transaktion; der
  // Reconciler liest per frischer payload.find außerhalb dieser Transaktion
  // und sähe die eben angelegte Requirement noch nicht (Transaction-Visibility)
  // — zudem würde ein separater Drizzle-Insert bei Transaktions-Rollback eine
  // verwaiste Assignment hinterlassen (Audit-Integritätsrisiko). Stattdessen
  // LAZY: reconcileForUser beim Öffnen von "Meine Pflichtschulungen" +
  // reconcileAssignments vor dem Compliance-Dashboard (Phase 4). Termingenaue
  // eager Materialisierung via Cron ist v1.1.
  fields: [
    {
      name: "courseSlug",
      type: "text",
      required: true,
      admin: {
        description:
          "Slug des Kurses, für den diese Pflicht gilt (z. B. 'a2-drohne'). " +
          "Text-Referenz wie in learning-paths.ts, kein DB-FK.",
      },
    },
    {
      name: "target",
      type: "group",
      label: "Zielgruppe",
      fields: [
        {
          name: "type",
          type: "select",
          required: true,
          defaultValue: "role",
          options: [
            { label: "Rolle", value: "role" },
            { label: "Einzelne User", value: "user" },
          ],
          admin: {
            description:
              "Rolle = alle User mit dieser Rolle; Einzelne User = explizite Liste.",
          },
        },
        {
          name: "role",
          type: "select",
          options: [
            { label: "Lerner", value: "learner" },
            { label: "Kurator:in", value: "curator" },
            { label: "Admin", value: "admin" },
          ],
          admin: {
            description: "Nur relevant, wenn Zielgruppe-Typ = Rolle.",
            condition: (_, siblingData) => siblingData?.type === "role",
          },
        },
        {
          name: "userIds",
          type: "array",
          label: "User-IDs",
          admin: {
            description:
              "Einzelne User, für die diese Pflicht zusätzlich gilt. Nur " +
              "relevant, wenn Zielgruppe-Typ = Einzelne User.",
            condition: (_, siblingData) => siblingData?.type === "user",
          },
          fields: [
            {
              name: "userId",
              type: "text",
              required: true,
              label: "User-ID",
              admin: {
                description: "OIDC-sub (Keycloak-UUID) des Users.",
              },
            },
          ],
        },
        {
          name: "landScope",
          type: "array",
          label: "Land-Filter",
          admin: {
            description:
              "Optional. Leer = alle Länder. Grenzt die Zielgruppe " +
              "zusätzlich (UND) auf diese Land-Werte ein; wirkt zusammen " +
              "mit dem Rolle/User-Targeting. Strikt: Personen ohne " +
              "gesetztes Land werden bei gesetztem Filter NICHT erfasst. " +
              "Die Werte sind fest vorgegeben (DE/CH/LUX).",
          },
          fields: [
            {
              name: "land",
              type: "select",
              required: true,
              options: LAND_OPTIONS,
            },
          ],
        },
        {
          name: "buScope",
          type: "array",
          label: "BU-Filter",
          admin: {
            description:
              "Optional. Leer = alle BUs. Grenzt die Zielgruppe " +
              "zusätzlich (UND) auf diese BU-Werte ein; wirkt zusammen " +
              "mit dem Rolle/User-Targeting. Strikt: Personen ohne " +
              "gesetzte BU werden bei gesetztem Filter NICHT erfasst.",
          },
          fields: [
            {
              name: "bu",
              type: "text",
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: "dueRule",
      type: "group",
      label: "Fristregel",
      fields: [
        {
          name: "type",
          type: "select",
          required: true,
          defaultValue: "ab_zuweisung",
          options: [
            { label: "Ab Kurs-Start", value: "ab_start" },
            { label: "Ab Zuweisung", value: "ab_zuweisung" },
            { label: "Festes Datum", value: "fixes_datum" },
          ],
          admin: {
            description:
              "Wonach sich die Frist berechnet: ab Enrollment-Start, ab " +
              "Erzeugung der Zuweisung, oder ein fixes Kalenderdatum.",
          },
        },
        {
          name: "offsetDays",
          type: "number",
          label: "Frist (Tage)",
          min: 0,
          admin: {
            description:
              "Tage bis zur Fälligkeit, relativ zu 'Ab Kurs-Start'/'Ab Zuweisung'.",
            condition: (_, siblingData) =>
              siblingData?.type === "ab_start" ||
              siblingData?.type === "ab_zuweisung",
          },
        },
        {
          name: "fixedDate",
          type: "date",
          label: "Festes Fälligkeitsdatum",
          admin: {
            condition: (_, siblingData) => siblingData?.type === "fixes_datum",
          },
        },
      ],
    },
    {
      name: "recurrenceMonths",
      type: "number",
      label: "Rezertifizierung (Monate)",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "0 = einmalig, sonst Monate bis zur Rezertifizierung.",
      },
    },
    {
      name: "active",
      type: "checkbox",
      label: "Aktiv",
      defaultValue: true,
      admin: {
        description:
          "Inaktive Requirements werden vom Reconciler ignoriert (Phase 2), " +
          "ohne den Doc-Verlauf zu löschen.",
      },
    },
  ],
};
