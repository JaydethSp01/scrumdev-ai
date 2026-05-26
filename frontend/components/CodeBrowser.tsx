"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Code2,
  Folder,
  FolderOpen,
  FileCode2,
  Search,
  Download,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { apiGetCode, type CodeFile } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import Spinner from "@/components/Spinner";
import PrettyMarkdown from "@/components/PrettyMarkdown";
import { ToastStack, useToasts } from "@/components/Toast";

type Props = {
  projectKey: string;
};

type TreeNode = {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: CodeFile;
};

function isMarkdownFile(f: CodeFile): boolean {
  const lang = (f.language || "").toLowerCase();
  if (lang === "markdown" || lang === "md") return true;
  const p = (f.file_path || "").toLowerCase();
  return p.endsWith(".md") || p.endsWith(".markdown");
}

function buildTree(files: CodeFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const f of files) {
    const parts = (f.file_path || "").split("/").filter(Boolean);
    let cur = root;
    let path = "";
    parts.forEach((part, idx) => {
      path = path ? `${path}/${part}` : part;
      let child = cur.children.get(part);
      if (!child) {
        child = { name: part, path, children: new Map() };
        cur.children.set(part, child);
      }
      if (idx === parts.length - 1) {
        child.file = f;
      }
      cur = child;
    });
  }
  return root;
}

function sortedEntries(node: TreeNode): TreeNode[] {
  return Array.from(node.children.values()).sort((a, b) => {
    const aIsFile = !!a.file && a.children.size === 0;
    const bIsFile = !!b.file && b.children.size === 0;
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export function CodeBrowser({ projectKey }: Props) {
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const toasts = useToasts();

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetCode(projectKey);
      setFiles(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
      // auto-expand top folders
      const top = new Set<string>();
      for (const f of data) {
        const first = (f.file_path || "").split("/")[0];
        if (first) top.add(first);
      }
      setExpanded(top);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter(
      (f) =>
        (f.file_path || "").toLowerCase().includes(q) ||
        (f.content || "").toLowerCase().includes(q)
    );
  }, [files, query]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const selected = useMemo(
    () => files.find((f) => f.id === selectedId) || null,
    [files, selectedId]
  );

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function downloadAll() {
    if (files.length === 0) return;
    // Simple fallback bundle: concatenated markdown-like text
    const lines: string[] = [
      `# ${projectKey} - codigo generado`,
      `Total archivos: ${files.length}`,
      "",
    ];
    for (const f of files) {
      lines.push(`\n\n=== ${f.file_path} (${f.language || "text"}) ===\n`);
      lines.push(f.content || "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectKey}-code.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toasts.success(`Bundle de ${files.length} archivos descargado.`);
  }

  function downloadSingle(f: CodeFile) {
    const blob = new Blob([f.content || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.file_path.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyContent() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toasts.error("No se pudo copiar al portapapeles.");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-brand" />
            <h2 className="text-lg font-semibold tracking-tight">Codigo generado</h2>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Explora los archivos producidos por el crew de delivery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="pl-7 pr-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/40 w-44"
            />
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <RefreshCw size={14} /> Refrescar
          </button>
          <button
            onClick={downloadAll}
            disabled={files.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark transition disabled:opacity-50"
          >
            <Download size={14} /> Descargar
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <div className="min-h-[40vh] grid place-items-center">
          <Spinner />
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          title="Aun no hay codigo generado"
          description="Lanza el pipeline desde el boton Generar sistema completo para ver archivos aqui."
          icon={FileCode2}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden bg-white dark:bg-neutral-950 min-h-[60vh]">
          <aside className="border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 max-h-[60vh] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-neutral-500 p-3">
                No hay archivos que coincidan.
              </p>
            ) : (
              <TreeView
                node={tree}
                expanded={expanded}
                onToggle={toggle}
                selectedId={selectedId}
                onSelect={setSelectedId}
                depth={0}
              />
            )}
          </aside>
          <div className="min-w-0 flex flex-col">
            {selected ? (
              <>
                <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-2.5 flex items-center gap-2 flex-wrap">
                  <FileCode2 size={14} className="text-brand shrink-0" />
                  <p className="text-sm font-mono truncate">{selected.file_path}</p>
                  {selected.language && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/10 text-brand">
                      {selected.language}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={copyContent}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                    <button
                      onClick={() => downloadSingle(selected)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    >
                      <Download size={12} /> Bajar
                    </button>
                  </div>
                </div>
                {isMarkdownFile(selected) ? (
                  <div className="flex-1 overflow-auto p-4 bg-neutral-50 dark:bg-neutral-900/50 max-h-[60vh]">
                    <PrettyMarkdown>{selected.content || ""}</PrettyMarkdown>
                  </div>
                ) : (
                  <pre className="flex-1 overflow-auto text-xs bg-neutral-50 dark:bg-neutral-900/50 p-4 m-0 leading-relaxed font-mono max-h-[60vh]">
                    <code>{selected.content || ""}</code>
                  </pre>
                )}
              </>
            ) : (
              <div className="grid place-items-center text-sm text-neutral-500 min-h-[40vh]">
                Selecciona un archivo
              </div>
            )}
          </div>
        </div>
      )}

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function TreeView({
  node,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  depth,
}: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const entries = sortedEntries(node);
  return (
    <ul className="space-y-0.5">
      {entries.map((child) => {
        const isFile = !!child.file && child.children.size === 0;
        const isOpen = expanded.has(child.path);
        const isSelected = isFile && child.file?.id === selectedId;
        return (
          <li key={child.path}>
            {isFile ? (
              <button
                onClick={() => onSelect(child.file!.id)}
                style={{ paddingLeft: 8 + depth * 12 }}
                className={`w-full text-left flex items-center gap-1.5 py-1 px-2 rounded text-xs font-mono transition ${
                  isSelected
                    ? "bg-brand/10 text-brand"
                    : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                }`}
              >
                <FileCode2 size={12} className="shrink-0 opacity-70" />
                <span className="truncate">{child.name}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => onToggle(child.path)}
                  style={{ paddingLeft: 8 + depth * 12 }}
                  className="w-full text-left flex items-center gap-1.5 py-1 px-2 rounded text-xs font-mono text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
                >
                  {isOpen ? (
                    <FolderOpen size={12} className="shrink-0 text-brand" />
                  ) : (
                    <Folder size={12} className="shrink-0 text-neutral-500" />
                  )}
                  <span className="truncate font-medium">{child.name}</span>
                </button>
                {isOpen && (
                  <TreeView
                    node={child}
                    expanded={expanded}
                    onToggle={onToggle}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    depth={depth + 1}
                  />
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default CodeBrowser;
