// @vitest-environment jsdom
/**
 * Regressionstests für das Quiz. Der Bug „korrekte Antworten werden als
 * falsch angezeigt" entstand dadurch, dass die Options-Liste NICHT beim
 * Server-Rendering existierte, sondern erst clientseitig per Effekt aufgebaut
 * wurde — und dabei gegen die `correct`-Flags verrutschte.
 *
 * Diese Suite deckt genau die Bruchstellen ab:
 *   1. SSR: Optionen müssen serverseitig in korrekter Reihenfolge rendern.
 *   2. Volle MDX-Pipeline (remark-Plugins wie in Produktion).
 *   3. Interaktion inkl. StrictMode (Doppel-Effekte in `next dev`).
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as runtime from "react/jsx-runtime";
import { evaluate } from "@mdx-js/mdx";
import { afterEach, describe, expect, test } from "vitest";

import { hardenedRemarkPlugins } from "@/lib/mdx/options";
import { mdxComponents } from "@/components/mdx";
import { Option, Question } from "./question";

afterEach(cleanup);

describe("SSR (der eigentliche Regressions-Guard)", () => {
  test("Optionen rendern serverseitig in Reihenfolge – nicht erst nach Hydration", () => {
    const html = renderToString(
      <Question prompt="Was ist ein Repository?" type="single">
        <Option correct>Zentrale Projekt-Ablage</Option>
        <Option>Eine einzelne Datei</Option>
        <Option>Ein Backup</Option>
        <Option>Ordner mit alten Versionen</Option>
      </Question>,
    );
    // Genau vier Buttons, serverseitig gerendert (früher: 0).
    expect((html.match(/<button/g) ?? []).length).toBe(4);
    // Reihenfolge stimmt.
    expect(html.indexOf("Zentrale Projekt-Ablage")).toBeLessThan(
      html.indexOf("Eine einzelne Datei"),
    );
  });
});

describe("Interaktion (single choice)", () => {
  test("korrekte ERSTE Option -> Richtig (der gemeldete Fall)", async () => {
    const user = userEvent.setup();
    render(
      <Question prompt="F?" type="single">
        <Option correct>Korrekt zuerst</Option>
        <Option>Falsch</Option>
        <Option>Auch falsch</Option>
      </Question>,
    );
    await user.click(await screen.findByRole("button", { name: "Korrekt zuerst" }));
    await waitFor(() => expect(screen.getByText("Richtig")).toBeTruthy());
  });

  test("korrekte LETZTE Option -> Richtig", async () => {
    const user = userEvent.setup();
    render(
      <Question prompt="F?" type="single">
        <Option>A</Option>
        <Option>B</Option>
        <Option correct>C korrekt</Option>
      </Question>,
    );
    await user.click(await screen.findByRole("button", { name: "C korrekt" }));
    await waitFor(() => expect(screen.getByText("Richtig")).toBeTruthy());
  });

  test("falsche Option -> Nicht ganz", async () => {
    const user = userEvent.setup();
    render(
      <Question prompt="F?" type="single">
        <Option correct>Korrekt</Option>
        <Option>Falsch</Option>
      </Question>,
    );
    await user.click(await screen.findByRole("button", { name: "Falsch" }));
    await waitFor(() => expect(screen.getByText("Nicht ganz")).toBeTruthy());
  });

  test("StrictMode: keine doppelten Optionen, korrekte Wertung", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Question prompt="F?" type="single">
          <Option correct>Korrekt</Option>
          <Option>Falsch</Option>
          <Option>Auch falsch</Option>
        </Question>
      </StrictMode>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Korrekt" }));
    await waitFor(() => expect(screen.getByText("Richtig")).toBeTruthy());
  });
});

describe("Interaktion (multiple choice)", () => {
  test("genau alle korrekten -> Richtig", async () => {
    const user = userEvent.setup();
    render(
      <Question prompt="F?" type="multi">
        <Option correct>A</Option>
        <Option correct>B</Option>
        <Option>C</Option>
      </Question>,
    );
    await user.click(screen.getByRole("button", { name: "A" }));
    await user.click(screen.getByRole("button", { name: "B" }));
    await user.click(screen.getByRole("button", { name: "Antwort prüfen" }));
    await waitFor(() => expect(screen.getByText("Richtig")).toBeTruthy());
  });

  test("eine korrekte fehlt -> Nicht ganz", async () => {
    const user = userEvent.setup();
    render(
      <Question prompt="F?" type="multi">
        <Option correct>A</Option>
        <Option correct>B</Option>
        <Option>C</Option>
      </Question>,
    );
    await user.click(screen.getByRole("button", { name: "A" }));
    await user.click(screen.getByRole("button", { name: "Antwort prüfen" }));
    await waitFor(() => expect(screen.getByText("Nicht ganz")).toBeTruthy());
  });
});

describe("volle MDX-Pipeline (wie in Produktion)", () => {
  async function renderMdx(source: string) {
    const mod = await evaluate(source, {
      ...(runtime as unknown as Record<string, unknown>),
      remarkPlugins: hardenedRemarkPlugins as never,
    } as never);
    const MdxContent = mod.default as (props: {
      components: unknown;
    }) => JSX.Element;
    render(<MdxContent components={mdxComponents as unknown} />);
  }

  test("correct={true} überlebt die Pipeline; erste Option grading Richtig", async () => {
    const user = userEvent.setup();
    await renderMdx(
      [
        '<Question prompt="Was ist ein Repository?" type="single">',
        "  <Option correct={true}>Die zentrale Projekt-Ablage mit allen Dateien und der ganzen Historie</Option>",
        "  <Option>Eine einzelne, aktuelle Datei</Option>",
        "  <Option>Ein Backup, das einmal pro Woche erstellt wird</Option>",
        '  <Option>Der Ordner mit allen alten „final“-Versionen</Option>',
        "</Question>",
      ].join("\n"),
    );
    await user.click(
      await screen.findByRole("button", { name: /zentrale Projekt-Ablage/ }),
    );
    await waitFor(() => expect(screen.getByText("Richtig")).toBeTruthy());
  });
});
