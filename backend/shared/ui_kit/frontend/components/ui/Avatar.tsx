import { cn } from "@/lib/cn";

/** Avatar con iniciales en tinte de marca. Para tablas/listas premium. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand",
        className
      )}
    >
      {initials}
    </span>
  );
}

export default Avatar;
