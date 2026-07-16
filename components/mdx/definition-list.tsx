import { Children, isValidElement, type ReactNode } from "react";
import styles from "./definition-list.module.css";

type DefinitionProps = {
  term: string;
  children: ReactNode;
};

export function Definition(_: DefinitionProps) {
  return null;
}
Definition.displayName = "Definition";

function isDefinition(node: unknown): node is React.ReactElement<DefinitionProps> {
  return (
    isValidElement(node) &&
    typeof node.type !== "string" &&
    "displayName" in (node.type as object) &&
    (node.type as { displayName?: string }).displayName === "Definition"
  );
}

export function DefinitionList({ children }: { children: ReactNode }) {
  const entries = Children.toArray(children).filter(isDefinition);
  return (
    <dl className={styles.list}>
      {entries.map((el, i) => (
        <div key={`${el.props.term}-${i}`} className={styles.row}>
          <dt className={styles.term}>{el.props.term}</dt>
          <dd className={styles.def}>{el.props.children}</dd>
        </div>
      ))}
    </dl>
  );
}
