import type { ReactNode } from "react";
import styles from "./steps.module.css";

export function Steps({ children }: { children: ReactNode }) {
  return <div className={styles.steps}>{children}</div>;
}
