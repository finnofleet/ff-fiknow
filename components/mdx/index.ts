import type { MDXRemoteProps } from "next-mdx-remote/rsc";

import { Callout } from "./callout";
import { Definition, DefinitionList } from "./definition-list";
import { Figure } from "./figure";
import { KeyTakeaways } from "./key-takeaways";
import { Pullquote } from "./pullquote";
import { Option, Question } from "./question";
import { Steps } from "./steps";

export {
  Callout,
  Definition,
  DefinitionList,
  Figure,
  KeyTakeaways,
  Option,
  Pullquote,
  Question,
  Steps,
};

export const mdxComponents: NonNullable<MDXRemoteProps["components"]> = {
  Callout,
  Definition,
  DefinitionList,
  Figure,
  KeyTakeaways,
  Option,
  Pullquote,
  Question,
  Steps,
};
