"use client";

import { Loader2 } from "lucide-react";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-brand to-fuchsia-500 text-white shadow-lg shadow-brand/30 hover:shadow-xl hover:shadow-brand/40 hover:scale-[1.01] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand/60",
  secondary:
    "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-500",
  ghost:
    "bg-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-500",
  danger:
    "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40 focus-visible:ring-2 focus-visible:ring-red-500",
  outline:
    "border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-brand/40",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
};

const BASE =
  "inline-flex items-center justify-center font-semibold transition-all duration-150 ease-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", loading, leftIcon, rightIcon, children, className, disabled, ...rest },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={loading || disabled}
        className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className || ""}`}
        {...rest}
      >
        {loading ? <Loader2 className="animate-spin" size={size === "sm" ? 12 : size === "lg" ? 18 : 14} /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";

export default Button;
