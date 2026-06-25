import { Info, AlertTriangle, Lightbulb, StickyNote } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./callout.module.css";

type Variant = "info" | "warning" | "tip" | "note";

const ICONS: Record<Variant, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  tip: Lightbulb,
  note: StickyNote,
};

export function Callout({
  type = "info",
  title,
  children,
}: {
  type?: Variant;
  title?: string;
  children: ReactNode;
}) {
  // `type` ist getypt als Variant, kommt aber aus untrusted MDX — ein unbekannter
  // Wert (z. B. type="note") ließ `ICONS[type]` undefined werden → Render-Crash
  // ("Element type is invalid"). Auf "info" zurückfallen statt abstürzen.
  const variant: Variant = type in ICONS ? type : "info";
  const LucideComp = ICONS[variant];
  return (
    <aside className={`${styles.callout} ${styles[variant]}`}>
      <LucideComp className={styles.icon} size={20} strokeWidth={1.5} aria-hidden />
      <div className={styles.body}>
        {title && <div className={styles.title}>{title}</div>}
        <div className={styles.content}>{children}</div>
      </div>
    </aside>
  );
}
