import type { ReactNode } from "react";
import styles from "./key-takeaways.module.css";

export function KeyTakeaways({ children }: { children: ReactNode }) {
  return (
    <section className={styles.box}>
      <div className={styles.kicker}>Zum Mitnehmen</div>
      <h4 className={styles.heading}>Das musst du dir merken</h4>
      <div className={styles.list}>{children}</div>
    </section>
  );
}
