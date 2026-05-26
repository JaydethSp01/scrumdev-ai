import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "default" | "brand" | "green" | "amber" | "red";
};

const TONES: Record<NonNullable<Props["tone"]>, string> = {
  default:
    "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300",
  brand:
    "bg-brand/10 border-brand/30 text-brand",
  green:
    "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300",
  amber:
    "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
};

export function StatsBadge({ icon: Icon, label, value, tone = "default" }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${TONES[tone]}`}
    >
      <Icon size={14} className="opacity-80" />
      <span className="text-xs uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default StatsBadge;
