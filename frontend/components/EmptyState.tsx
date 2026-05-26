import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, icon: Icon = Inbox, action }: Props) {
  return (
    <div className="border border-dashed border-neutral-300 dark:border-neutral-800 rounded-xl p-8 text-center flex flex-col items-center gap-3">
      <div className="grid place-items-center w-12 h-12 rounded-full bg-brand/10 text-brand">
        <Icon size={22} />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-neutral-500 max-w-md mx-auto">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export default EmptyState;
