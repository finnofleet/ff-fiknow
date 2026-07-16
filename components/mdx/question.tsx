"use client";

import { Check, X, Lightbulb } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuizContext } from "@/components/quiz/quiz-context";
import styles from "./question.module.css";

type Mode = "single" | "multi";

type OptionProps = {
  correct?: boolean;
  children: ReactNode;
};

type RegisteredOption = {
  id: string;
  label: ReactNode;
  correct: boolean;
};

type OptionRegistry = {
  register: (opt: RegisteredOption) => void;
  unregister: (id: string) => void;
};

const OptionRegistryContext = createContext<OptionRegistry | null>(null);

/**
 * Option-Marker-Component. Rendert kein UI direkt, sondern registriert
 * sich beim umgebenden <Question> via Context. <Question> liest die
 * registrierten Options aus dem State und rendert sie als Buttons.
 *
 * Warum nicht direkter Children-Filter? In Production-Builds mit RSC +
 * Minifier verlieren wir Component-Identity (verschiedene Function-
 * References zwischen MDX-Pipeline und Question-Component-Code).
 * Context-Pattern umgeht das vollständig.
 */
export function Option({ correct = false, children }: OptionProps) {
  const registry = useContext(OptionRegistryContext);
  const id = useId();

  useEffect(() => {
    if (!registry) return;
    registry.register({ id, label: children, correct });
    return () => registry.unregister(id);
  }, [registry, id, children, correct]);

  return null;
}
Option.displayName = "Option";

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
  const [registry, setRegistry] = useState<RegisteredOption[]>([]);

  // Stable register/unregister-Callbacks, damit useEffect in Option
  // nicht unnötig refeuert.
  const ctxValue = useMemo<OptionRegistry>(
    () => ({
      register: (opt) =>
        setRegistry((prev) =>
          prev.some((p) => p.id === opt.id) ? prev : [...prev, opt],
        ),
      unregister: (id) =>
        setRegistry((prev) => prev.filter((p) => p.id !== id)),
    }),
    [],
  );

  const labels = registry.map((r) => r.label);
  const correctSet = new Set<number>(
    registry.map((r, i) => (r.correct ? i : -1)).filter((i) => i >= 0),
  );
  const correctIndices = [...correctSet].sort((a, b) => a - b);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const isCorrect =
    selected.size === correctSet.size &&
    [...selected].every((i) => correctSet.has(i));

  const quiz = useQuizContext();

  useEffect(() => {
    if (!submitted || !quiz) return;
    quiz.reportResult(prompt, {
      prompt,
      selected: [...selected].sort((a, b) => a - b),
      correct: correctIndices,
      isCorrect,
    });
  }, [submitted, isCorrect, prompt, selected, correctIndices, quiz]);

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

  function getOptionState(
    i: number,
  ): "default" | "selected" | "correct" | "wrong" | "missed" {
    if (!submitted) return selected.has(i) ? "selected" : "default";
    const isSel = selected.has(i);
    const isCor = correctSet.has(i);
    if (isSel && isCor) return "correct";
    if (isSel && !isCor) return "wrong";
    if (!isSel && isCor) return "missed";
    return "default";
  }

  return (
    <OptionRegistryContext.Provider value={ctxValue}>
      <div className={styles.card}>
        <p className={styles.prompt}>{prompt}</p>

        {/* Children rendern, damit <Option>-Effekte feuern und sich
            im Registry eintragen. <Option> selbst rendert null,
            also kein Markup-Beitrag. */}
        {children}

        <div
          className={styles.options}
          role={type === "single" ? "radiogroup" : "group"}
        >
          {labels.map((label, i) => {
            const state = getOptionState(i);
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
                <span className={styles.text}>{label}</span>
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
    </OptionRegistryContext.Provider>
  );
}
