import { cn } from "@/lib/cn";

export type Column<T> = {
  key: keyof T | string;
  header: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
};

/** Tabla estilizada: thead bg-slate-50, filas con hover, render custom por celda
 *  (para badges de color, formato de moneda, etc.). Estado vacío amable. */
export function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  empty = "Sin registros.",
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={cn(
                    "px-4 py-3 font-semibold text-slate-500",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-slate-100 transition hover:bg-slate-50"
                >
                  {columns.map((c) => (
                    <td
                      key={String(c.key)}
                      className={cn(
                        "px-4 py-3",
                        c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                      )}
                    >
                      {c.render ? c.render(row) : String(row[c.key as keyof T] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
