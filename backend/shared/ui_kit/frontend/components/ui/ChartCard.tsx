"use client";
import { useId } from "react";
import { cn } from "@/lib/cn";

type Point = { label: string; value: number };

/** Card con gráfico SVG sin dependencias (barras, línea o área). Gridlines,
 *  valores y hover -> sensación de "dashboard con datos" premium. Compatible:
 *  por defecto `variant="bar"` con la misma API anterior. */
export function ChartCard({
  title,
  subtitle,
  data,
  variant = "bar",
  className,
}: {
  title: string;
  subtitle?: string;
  data: Point[];
  variant?: "bar" | "line" | "area";
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 520, H = 180, PAD = 8;
  const innerH = H - PAD * 2;
  const n = Math.max(1, data.length);
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - PAD * 2) + PAD);
  const y = (v: number) => PAD + innerH - (v / max) * innerH;
  const grid = [0.25, 0.5, 0.75, 1];

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-6 shadow-sm", className)}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>

      {variant === "bar" ? (
        <div className="flex items-end gap-3">
          {data.map((d, i) => (
            <div key={i} className="group flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 opacity-0 transition group-hover:opacity-100">{d.value}</span>
              <div className="flex h-36 w-full items-end">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-brand/60 to-brand transition-all hover:opacity-90"
                  style={{ height: `${Math.max(4, Math.round((d.value / max) * 100))}%` }}
                  title={`${d.label}: ${d.value}`}
                />
              </div>
              <span className="text-xs font-medium text-slate-500">{d.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" className="text-brand" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-brand" />
              </linearGradient>
            </defs>
            {grid.map((g, i) => (
              <line key={i} x1="0" x2={W} y1={PAD + innerH - g * innerH} y2={PAD + innerH - g * innerH}
                stroke="#e2e8f0" strokeWidth="1" />
            ))}
            {variant === "area" ? (
              <path
                d={`M ${x(0)} ${y(data[0]?.value ?? 0)} ` +
                   data.map((d, i) => `L ${x(i)} ${y(d.value)}`).join(" ") +
                   ` L ${x(n - 1)} ${PAD + innerH} L ${x(0)} ${PAD + innerH} Z`}
                fill={`url(#g${uid})`} className="text-brand"
              />
            ) : null}
            <polyline
              points={data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ")}
              fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand"
              strokeLinejoin="round" strokeLinecap="round"
            />
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(d.value)} r="3.5" fill="white"
                stroke="currentColor" strokeWidth="2" className="text-brand">
                <title>{`${d.label}: ${d.value}`}</title>
              </circle>
            ))}
          </svg>
          <div className="mt-2 flex justify-between">
            {data.map((d, i) => (
              <span key={i} className="text-xs font-medium text-slate-500">{d.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ChartCard;
