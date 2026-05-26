"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Palette,
  Image as ImageIcon,
  Save,
  Loader2,
  Upload,
  X,
  CheckCircle2,
  Trash2,
  Type,
  Building2,
  Sparkles,
  Eye,
  UploadCloud,
  AlertTriangle,
} from "lucide-react";
import {
  apiGetBrandKit,
  apiSaveBrandKit,
  apiListAssets,
  apiUploadAsset,
  apiDeleteAsset,
  type BrandKitInput,
  type ProjectAsset,
  type ProjectAssetType,
} from "@/lib/api";
import type { AuthUser } from "@/app/auth/_lib";
import Spinner from "@/components/Spinner";
import EmptyState from "@/components/EmptyState";
import { ToastStack, useToasts } from "@/components/Toast";

type Props = {
  projectKey: string;
  user?: AuthUser | null;
};

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Poppins", label: "Poppins" },
  { value: "Roboto", label: "Roboto" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Space Grotesk", label: "Space Grotesk" },
];

const TONE_OPTIONS = [
  { value: "moderno", label: "Moderno" },
  { value: "deportivo", label: "Deportivo" },
  { value: "elegante", label: "Elegante" },
  { value: "juvenil", label: "Juvenil" },
  { value: "corporativo", label: "Corporativo" },
  { value: "minimalista", label: "Minimalista" },
  { value: "divertido", label: "Divertido" },
];

const ASSET_TYPE_OPTIONS: { value: ProjectAssetType; label: string }[] = [
  { value: "logo", label: "Logo" },
  { value: "hero", label: "Hero" },
  { value: "feature", label: "Feature" },
  { value: "avatar", label: "Avatar" },
  { value: "gallery", label: "Gallery" },
  { value: "background", label: "Background" },
  { value: "other", label: "Otro" },
];

const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: "Logo",
  hero: "Hero",
  feature: "Feature",
  avatar: "Avatar",
  gallery: "Gallery",
  background: "Background",
  other: "Otro",
};

const DEFAULT_KIT: BrandKitInput = {
  primary_color: "#4f46e5",
  secondary_color: "#0ea5e9",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  text_color: "#111827",
  font_family: "Inter",
  logo_url: null,
  tone: "moderno",
  industry: "",
  extra: null,
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
  assetType: ProjectAssetType;
  altText: string;
};

export default function PersonalizationPanel({ projectKey }: Props) {
  // Brand kit state
  const [loadingKit, setLoadingKit] = useState(true);
  const [savingKit, setSavingKit] = useState(false);
  const [kit, setKit] = useState<BrandKitInput>(DEFAULT_KIT);
  const [kitExists, setKitExists] = useState(false);

  // Assets state
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toasts = useToasts();

  const loadKit = useCallback(async () => {
    setLoadingKit(true);
    try {
      const k = await apiGetBrandKit(projectKey);
      setKit({
        primary_color: k.primary_color || DEFAULT_KIT.primary_color,
        secondary_color: k.secondary_color || DEFAULT_KIT.secondary_color,
        accent_color: k.accent_color || DEFAULT_KIT.accent_color,
        background_color: k.background_color || DEFAULT_KIT.background_color,
        text_color: k.text_color || DEFAULT_KIT.text_color,
        font_family: k.font_family || DEFAULT_KIT.font_family,
        logo_url: k.logo_url || null,
        tone: k.tone || DEFAULT_KIT.tone,
        industry: k.industry || "",
        extra: k.extra || null,
      });
      setKitExists(!!k.exists);
    } catch (e) {
      toasts.error(
        `No se pudo cargar la identidad visual: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    } finally {
      setLoadingKit(false);
    }
  }, [projectKey, toasts]);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const list = await apiListAssets(projectKey);
      setAssets(list);
    } catch (e) {
      toasts.error(
        `No se pudieron cargar las imagenes: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    } finally {
      setLoadingAssets(false);
    }
  }, [projectKey, toasts]);

  useEffect(() => {
    loadKit();
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  // cleanup pending preview URLs
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveKit() {
    // validate hex
    const fields: (keyof BrandKitInput)[] = [
      "primary_color",
      "secondary_color",
      "accent_color",
      "background_color",
      "text_color",
    ];
    for (const f of fields) {
      const v = String(kit[f] || "");
      if (!HEX_RE.test(v)) {
        toasts.error(`Color invalido en ${f}: ${v || "(vacio)"}`);
        return;
      }
    }
    setSavingKit(true);
    try {
      await apiSaveBrandKit(projectKey, {
        ...kit,
        industry: (kit.industry || "").trim() || null,
        logo_url: kit.logo_url || null,
      });
      setKitExists(true);
      toasts.success("Identidad visual guardada.");
    } catch (e) {
      toasts.error(
        `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setSavingKit(false);
    }
  }

  function addPendingFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const valid: PendingUpload[] = [];
    for (const f of arr) {
      if (!f.type.startsWith("image/")) {
        toasts.error(`"${f.name}" no es una imagen.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toasts.error(`"${f.name}" supera 10MB.`);
        continue;
      }
      const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      valid.push({
        id,
        file: f,
        previewUrl: URL.createObjectURL(f),
        assetType: guessTypeFromName(f.name),
        altText: "",
      });
    }
    if (valid.length === 0) return;
    setPending((prev) => [...prev, ...valid]);
  }

  function updatePending(id: string, patch: Partial<PendingUpload>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePending(id: string) {
    setPending((prev) => {
      const next = prev.filter((p) => p.id !== id);
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  function clearPending() {
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending([]);
  }

  async function uploadAll() {
    if (pending.length === 0) return;
    setUploading(true);
    setUploadedCount(0);
    let okCount = 0;
    for (const p of pending) {
      try {
        await apiUploadAsset(
          projectKey,
          p.file,
          p.assetType,
          p.altText.trim() || undefined,
          undefined
        );
        okCount += 1;
        setUploadedCount(okCount);
      } catch (e) {
        toasts.error(
          `Fallo "${p.file.name}": ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
    setUploading(false);
    if (okCount > 0) {
      toasts.success(`${okCount} imagen(es) subida(s).`);
    }
    clearPending();
    await loadAssets();
  }

  async function deleteAsset(asset: ProjectAsset) {
    if (!confirm(`Eliminar "${asset.name}"?`)) return;
    try {
      await apiDeleteAsset(projectKey, asset.id);
      toasts.success("Imagen eliminada.");
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (e) {
      toasts.error(
        `No se pudo eliminar: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addPendingFiles(e.dataTransfer.files);
    }
  }

  function onPickClick() {
    fileInputRef.current?.click();
  }

  const groupedAssets = useMemo(() => {
    const map = new Map<string, ProjectAsset[]>();
    for (const a of assets) {
      const key = a.asset_type || "other";
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    // ordered like ASSET_TYPE_OPTIONS
    const order = ASSET_TYPE_OPTIONS.map((o) => o.value);
    const ordered: { type: string; items: ProjectAsset[] }[] = [];
    for (const t of order) {
      const items = map.get(t);
      if (items && items.length > 0) ordered.push({ type: t, items });
    }
    // any extras
    for (const [k, v] of map.entries()) {
      if (!order.includes(k as ProjectAssetType)) {
        ordered.push({ type: k, items: v });
      }
    }
    return ordered;
  }, [assets]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2">
          <Palette size={18} className="text-brand" />
          <h2 className="text-lg font-semibold tracking-tight">
            Personalizacion visual
          </h2>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Configura colores, tipografia e imagenes. Los agentes usaran esto al
          generar tu sistema para que se vea unico y a tu gusto.
        </p>
      </header>

      {/* A. Brand kit */}
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand/10 text-brand shrink-0">
            <Sparkles size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">Identidad visual</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Define la paleta, la tipografia y el tono de tu marca.
            </p>
          </div>
          {kitExists && (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 shrink-0">
              <CheckCircle2 size={12} /> Guardado
            </span>
          )}
        </div>

        {loadingKit ? (
          <div className="min-h-[20vh] grid place-items-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Colors */}
            <div>
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2">
                Paleta de colores
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <ColorField
                  label="Primario"
                  value={kit.primary_color}
                  onChange={(v) => setKit({ ...kit, primary_color: v })}
                />
                <ColorField
                  label="Secundario"
                  value={kit.secondary_color}
                  onChange={(v) => setKit({ ...kit, secondary_color: v })}
                />
                <ColorField
                  label="Acento"
                  value={kit.accent_color}
                  onChange={(v) => setKit({ ...kit, accent_color: v })}
                />
                <ColorField
                  label="Fondo"
                  value={kit.background_color}
                  onChange={(v) => setKit({ ...kit, background_color: v })}
                />
                <ColorField
                  label="Texto"
                  value={kit.text_color}
                  onChange={(v) => setKit({ ...kit, text_color: v })}
                />
              </div>
            </div>

            {/* Typography + tone + industry */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1.5">
                  <Type size={12} className="inline mr-1" />
                  Tipografia
                </label>
                <select
                  value={kit.font_family}
                  onChange={(e) => setKit({ ...kit, font_family: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1.5">
                  <Sparkles size={12} className="inline mr-1" />
                  Tono
                </label>
                <select
                  value={kit.tone}
                  onChange={(e) => setKit({ ...kit, tone: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                >
                  {TONE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1.5">
                  <Building2 size={12} className="inline mr-1" />
                  Industria
                </label>
                <input
                  value={kit.industry || ""}
                  onChange={(e) => setKit({ ...kit, industry: e.target.value })}
                  placeholder="Ej: deportes, salud, ecommerce"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                />
              </div>
            </div>

            {/* Live preview */}
            <div>
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2 inline-flex items-center gap-1">
                <Eye size={12} /> Preview en vivo
              </p>
              <LivePreview kit={kit} />
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveKit}
                disabled={savingKit}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition disabled:opacity-60 font-medium"
              >
                {savingKit ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Guardar identidad
              </button>
            </div>
          </div>
        )}
      </section>

      {/* B. Assets */}
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand/10 text-brand shrink-0">
            <ImageIcon size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">Imagenes del cliente</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Sube tu logo, fotos del producto, ilustraciones, etc. Maximo 10MB
              por archivo.
            </p>
          </div>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={onPickClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onPickClick();
          }}
          className={`cursor-pointer rounded-2xl border-2 border-dashed transition p-8 text-center ${
            dragOver
              ? "border-brand bg-brand/5"
              : "border-neutral-300 dark:border-neutral-700 hover:border-brand/60 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
          }`}
        >
          <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow">
            <UploadCloud size={22} />
          </div>
          <p className="text-sm font-medium mt-3">
            Arrastra imagenes aqui o haz click para seleccionar
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            PNG, JPG, SVG, WebP. Hasta 10MB cada una.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addPendingFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Pending uploads */}
        {pending.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Por subir ({pending.length})
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearPending}
                  disabled={uploading}
                  className="text-xs text-neutral-500 hover:text-red-600 disabled:opacity-50"
                >
                  Limpiar
                </button>
                <button
                  onClick={uploadAll}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand-dark transition disabled:opacity-60 font-medium"
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {uploading
                    ? `Subiendo ${uploadedCount}/${pending.length}...`
                    : "Subir todo"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-neutral-900/50"
                >
                  <div className="aspect-video bg-neutral-100 dark:bg-neutral-900 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.previewUrl}
                      alt={p.file.name}
                      className="w-full h-full object-contain"
                    />
                    <button
                      onClick={() => removePending(p.id)}
                      disabled={uploading}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-md disabled:opacity-50"
                      title="Quitar"
                      aria-label="Quitar"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-mono truncate text-neutral-600 dark:text-neutral-400">
                      {p.file.name}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {humanSize(p.file.size)}
                    </p>
                    <select
                      value={p.assetType}
                      onChange={(e) =>
                        updatePending(p.id, {
                          assetType: e.target.value as ProjectAssetType,
                        })
                      }
                      disabled={uploading}
                      className="w-full px-2 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs"
                    >
                      {ASSET_TYPE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={p.altText}
                      onChange={(e) =>
                        updatePending(p.id, { altText: e.target.value })
                      }
                      disabled={uploading}
                      placeholder="Texto alternativo (opcional)"
                      className="w-full px-2 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gallery */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Galeria
          </h4>
          {loadingAssets ? (
            <div className="min-h-[15vh] grid place-items-center">
              <Spinner />
            </div>
          ) : assets.length === 0 ? (
            <EmptyState
              title="Aun no hay imagenes"
              description="Sube tu logo y otras imagenes para que el sistema generado las use."
              icon={ImageIcon}
            />
          ) : (
            <div className="space-y-5">
              {groupedAssets.map(({ type, items }) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-brand/10 text-brand font-medium">
                      {ASSET_TYPE_LABELS[type] || type}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {items.length}{" "}
                      {items.length === 1 ? "imagen" : "imagenes"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map((a) => (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        onDelete={() => deleteAsset(a)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX_RE.test(value);
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
      <label className="text-[11px] uppercase tracking-wider text-neutral-500 block mb-2">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent cursor-pointer shrink-0"
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className={`flex-1 min-w-0 px-2 py-2 rounded-md border bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/40 ${
            valid
              ? "border-neutral-300 dark:border-neutral-700"
              : "border-red-400 dark:border-red-500"
          }`}
        />
      </div>
      {!valid && (
        <p className="text-[11px] text-red-600 mt-1 inline-flex items-center gap-1">
          <AlertTriangle size={10} /> Hex invalido
        </p>
      )}
    </div>
  );
}

function LivePreview({ kit }: { kit: BrandKitInput }) {
  const fontStack = `${kit.font_family}, system-ui, -apple-system, sans-serif`;
  return (
    <div
      className="rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-sm"
      style={{
        background: `linear-gradient(135deg, ${kit.primary_color} 0%, ${kit.secondary_color} 100%)`,
        color: kit.text_color,
        fontFamily: fontStack,
      }}
    >
      <div
        className="p-6 sm:p-8"
        style={{
          backgroundColor: `${kit.background_color}cc`,
        }}
      >
        <span
          className="inline-block text-[11px] uppercase tracking-wider px-2 py-0.5 rounded"
          style={{
            backgroundColor: kit.accent_color,
            color: "#fff",
          }}
        >
          {kit.tone || "tu marca"}
        </span>
        <h3
          className="text-2xl sm:text-3xl font-semibold tracking-tight mt-3"
          style={{ fontFamily: fontStack, color: kit.text_color }}
        >
          Hola, asi se veria tu producto
        </h3>
        <p className="text-sm mt-2" style={{ color: kit.text_color, opacity: 0.8 }}>
          Esta es una vista previa del estilo que usaran los agentes al generar
          tu interfaz: paleta, tipografia y tono.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white shadow"
            style={{ backgroundColor: kit.primary_color }}
          >
            Boton primario
          </span>
          <span
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white shadow"
            style={{ backgroundColor: kit.secondary_color }}
          >
            Secundario
          </span>
          <span
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white shadow"
            style={{ backgroundColor: kit.accent_color }}
          >
            Acento
          </span>
        </div>
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  onDelete,
}: {
  asset: ProjectAsset;
  onDelete: () => void;
}) {
  return (
    <div className="group rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-neutral-900/50">
      <div className="aspect-square bg-neutral-100 dark:bg-neutral-900 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.alt_text || asset.name}
          className="w-full h-full object-contain"
        />
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition"
          title="Eliminar"
          aria-label="Eliminar"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="p-2.5">
        <p
          className="text-xs font-medium truncate"
          title={asset.name}
        >
          {asset.name}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            {ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}
          </span>
          <span className="text-[10px] text-neutral-500">
            {humanSize(asset.size_bytes ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function guessTypeFromName(name: string): ProjectAssetType {
  const n = name.toLowerCase();
  if (n.includes("logo")) return "logo";
  if (n.includes("hero") || n.includes("banner")) return "hero";
  if (n.includes("avatar") || n.includes("profile")) return "avatar";
  if (n.includes("bg") || n.includes("background")) return "background";
  if (n.includes("feature")) return "feature";
  if (n.includes("gallery")) return "gallery";
  return "other";
}
