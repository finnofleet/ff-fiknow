import type { ReactNode } from "react";
import styles from "./pullquote.module.css";

export function Pullquote({ children }: { children: ReactNode }) {
  return <blockquote className={styles.quote}>{children}</blockquote>;
}
