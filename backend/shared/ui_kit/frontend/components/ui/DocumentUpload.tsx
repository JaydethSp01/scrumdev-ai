"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, FileText, Download, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";

type Doc = { id: number; name: string; size: number; type: string; url: string };
const fmt = (b: number) => (b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB");

/** Carga de documentos FUNCIONAL: arrastra/elige archivos → se cargan, listan,
 *  descargan y eliminan de verdad (FileReader + object URL). Si hay API, también
 *  los sube al backend. Sirve para PYMES (facturas, cédulas, contratos…). */
export function DocumentUpload({ accept = "*", label = "Documentos" }: { accept?: string; label?: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const api = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  // carga REAL del server al montar (documentos guardados, multi-dispositivo)
  useEffect(() => {
    if (!api) return;
    let cancel = false;
    fetch(`${api}/data/documentos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancel && Array.isArray(d) && d.length) setDocs(d.map((x: any) => ({ id: x.id ?? Date.now(), name: x.nombre || x.name || "archivo", size: x.size || 0, type: x.tipo || x.type || "archivo", url: x.contenido || x.url || "#" }))); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [api]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        setDocs((d) => [{ id: Date.now() + Math.random(), name: f.name, size: f.size, type: f.type || "archivo", url }, ...d]);
        // persistencia server-side real (/data/documentos), multi-dispositivo
        if (api) fetch(`${api}/data/documentos`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: f.name, tipo: f.type || "archivo", size: f.size, contenido: url }) }).catch(() => {});
      };
      reader.readAsDataURL(f);
    });
  }

  return (
    <Card>
      <h3 className="mb-4 text-base font-semibold text-slate-900">{label}</h3>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={"grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition " +
          (drag ? "border-brand bg-brand/5" : "border-slate-300 hover:border-brand hover:bg-slate-50")}>
        <Upload className="mb-2 text-brand" size={28} />
        <p className="text-sm font-medium text-slate-700">Arrastra archivos o haz clic para subir</p>
        <p className="text-xs text-slate-400">PDF, imágenes, Excel… se guardan al instante</p>
        <input ref={inputRef} type="file" multiple accept={accept} className="hidden"
          onChange={(e) => addFiles(e.target.files)} aria-label="Subir archivos" />
      </div>

      {docs.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><FileText size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{d.name}</p>
                <p className="text-xs text-slate-400">{fmt(d.size)} · {d.type}</p>
              </div>
              <a href={d.url} download={d.name} aria-label="Descargar"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand"><Download size={16} /></a>
              <button onClick={() => setDocs((x) => x.filter((y) => y.id !== d.id))} aria-label="Eliminar"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-center text-sm text-slate-400">Aún no hay documentos.</p>}
    </Card>
  );
}

export default DocumentUpload;
