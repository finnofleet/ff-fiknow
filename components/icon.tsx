import type { LucideIcon, LucideProps } from "lucide-react";

type IconProps = LucideProps & {
  icon: LucideIcon;
};

export function Icon({ icon: LucideComponent, size = 16, strokeWidth = 1.5, ...rest }: IconProps) {
  return <LucideComponent size={size} strokeWidth={strokeWidth} {...rest} />;
}
