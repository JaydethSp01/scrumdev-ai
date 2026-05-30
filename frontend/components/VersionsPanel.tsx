"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, Plus, CheckCircle2, Package } from "lucide-react";
import {
  listVersions,
  createVersion,
  setVersionStatus,
  type VersionInfo,
} from "@/lib/api";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-300",
  draft: "bg-amber-100 text-amber-700 border-amber-300",
  released: "bg-blue-100 text-blue-700 border-blue-300",
  archived: "bg-gray-100 text-gray-500 border-gray-300",
};

export default function VersionsPanel({ projectKey }: { projectKey: string }) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { versions } = await listVersions(projectKey);
      setVersions(versions);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createVersion(projectKey, { name, description, copy_code: true });
      setName("");
      setDescription("");
      setShowForm(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function activate(v: VersionInfo) {
    await setVersionStatus(projectKey, v.id, "active");
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch size={18} className="text-brand" /> Versiones
          </h3>
          <p className="text-sm text-gray-500">
            Cada versión agrupa sprints y tareas. Una versión nueva parte del
            código de la anterior (no pierdes lo construido).
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Nueva versión
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Nombre (ej. v2 - Reportes avanzados)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Qué agrega esta versión (cambios grandes)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creando…" : "Crear (copia el código actual)"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {versions.map((v) => (
          <div
            key={v.id}
            className="rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-brand/10 p-2">
                <Package size={18} className="text-brand" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">v{v.number}</span>
                  <span className="text-sm text-gray-700">{v.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      STATUS_STYLE[v.status] || STATUS_STYLE.draft
                    }`}
                  >
                    {v.status}
                  </span>
                </div>
                {v.description && (
                  <p className="text-sm text-gray-500 mt-1">{v.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {v.sprint_count} sprint(s) · {v.file_count} archivo(s)
                  {v.based_on_version_id ? " · parte de la versión anterior" : ""}
                </p>
              </div>
            </div>
            {v.status === "active" ? (
              <span className="text-emerald-600 flex items-center gap-1 text-sm">
                <CheckCircle2 size={16} /> Activa
              </span>
            ) : (
              <Button variant="ghost" onClick={() => activate(v)}>
                Activar
              </Button>
            )}
          </div>
        ))}
        {versions.length === 0 && (
          <p className="text-sm text-gray-400">Sin versiones todavía.</p>
        )}
      </div>
    </div>
  );
}
