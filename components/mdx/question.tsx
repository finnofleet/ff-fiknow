"use client";

import { Check, X, Lightbulb } from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuizContext } from "@/components/quiz/quiz-context";
import {
  correctIndices,
  isAnswerCorrect,
  optionVisualState,
} from "@/lib/quiz/grade";
import styles from "./question.module.css";

type Mode = "single" | "multi";

type OptionProps = {
  correct?: boolean;
  children: ReactNode;
};

/**
 * Option ist ein reiner DATEN-Marker. Sie rendert selbst nichts — <Question>
 * liest `correct` und die Kinder (das Label) synchron aus den Props der
 * Option-Elemente.
 *
 * Warum kein Effekt-/Context-Registry mehr? Die frühere Variante registrierte
 * jede Option clientseitig per useEffect beim umgebenden <Question>. Das war
 * die Ursache dafür, dass korrekte Antworten wiederholt als falsch angezeigt
 * wurden: Beim Server-Rendering (RSC) liefen die Effekte nicht, die
 * Options-Liste entstand erst nach der Hydration, und dabei verrutschte die
 * Reihenfolge gegenüber den `correct`-Flags. Das synchrone Auslesen der
 * Children ist SSR-fest, reihenfolgetreu und hängt weder an Effekt-Timing
 * noch an Component-Identity (wir prüfen NICHT `child.type === Option`,
 * sondern lesen nur die Props — überlebt Minifier/RSC-Grenzen).
 */
export function Option(props: OptionProps): null {
  void props; // reiner Daten-Marker: <Question> liest die Props direkt
  return null;
}
Option.displayName = "Option";

type ExtractedOption = {
  label: ReactNode;
  correct: boolean;
};

/**
 * Zieht die Optionen aus den <Question>-Children. Whitespace-Textknoten
 * (Zeilenumbrüche zwischen den <Option>-Tags) sind keine Elemente und fallen
 * durch `isValidElement` heraus.
 */
function extractOptions(children: ReactNode): ExtractedOption[] {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((el) => {
      const props = (el as { props?: OptionProps }).props ?? {
        children: null,
      };
      return {
        label: props.children,
        correct: Boolean(props.correct),
      };
    });
}

type QuestionProps = {
  prompt: string;
  type?: Mode;
  explanation?: string;
  children: ReactNode;
};

export function Question({
  prompt,
  type = "single",
  explanation,
  children,
}: QuestionProps) {
  // Optionen synchron beim Rendern ableiten — verfügbar auf Server UND Client.
  const options = useMemo(() => extractOptions(children), [children]);
  const correctFlags = useMemo(
    () => options.map((o) => o.correct),
    [options],
  );

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = isAnswerCorrect(correctFlags, selected);

  const quiz = useQuizContext();

  useEffect(() => {
    if (!submitted || !quiz) return;
    quiz.reportResult(prompt, {
      prompt,
      selected: [...selected].sort((a, b) => a - b),
      correct: correctIndices(correctFlags),
      isCorrect,
    });
  }, [submitted, isCorrect, prompt, selected, correctFlags, quiz]);

  function toggle(i: number) {
    if (submitted) return;
    if (type === "single") {
      setSelected(new Set([i]));
      setSubmitted(true);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className={styles.card}>
      <p className={styles.prompt}>{prompt}</p>

      <div
        className={styles.options}
        role={type === "single" ? "radiogroup" : "group"}
      >
        {options.map((option, i) => {
          const state = optionVisualState(i, {
            submitted,
            selected,
            correctFlags,
          });
          return (
            <button
              key={i}
              type="button"
              className={`${styles.option} ${styles[state]}`}
              onClick={() => toggle(i)}
              disabled={submitted}
              aria-pressed={selected.has(i)}
            >
              <span className={styles.bullet}>
                {state === "correct" && <Check size={14} strokeWidth={2} />}
                {state === "wrong" && <X size={14} strokeWidth={2} />}
                {state === "missed" && <Check size={14} strokeWidth={2} />}
                {(state === "default" || state === "selected") && (
                  <span className={styles.dot} />
                )}
              </span>
              <span className={styles.text}>{option.label}</span>
            </button>
          );
        })}
      </div>

      {type === "multi" && !submitted && (
        <button
          type="button"
          className={`btn btn-primary ${styles.submit}`}
          onClick={() => setSubmitted(true)}
          disabled={selected.size === 0}
        >
          Antwort prüfen
        </button>
      )}

      {submitted && (
        <div
          className={`${styles.feedback} ${
            isCorrect ? styles.right : styles.fail
          }`}
        >
          <div className={styles.verdict}>
            {isCorrect ? "Richtig" : "Nicht ganz"}
          </div>
          {explanation && (
            <div className={styles.explanation}>
              <Lightbulb
                size={16}
                strokeWidth={1.5}
                className={styles.lampIcon}
              />
              <span>{explanation}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
