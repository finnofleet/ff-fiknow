"use client";

import { createContext, useContext } from "react";

export type QuestionResult = {
  prompt: string;
  selected: number[];
  correct: number[];
  isCorrect: boolean;
};

export type QuizContextValue = {
  /** Wird von jeder Question beim Abschicken aufgerufen */
  reportResult: (id: string, result: QuestionResult) => void;
};

export const QuizContext = createContext<QuizContextValue | null>(null);

export function useQuizContext() {
  return useContext(QuizContext);
}
