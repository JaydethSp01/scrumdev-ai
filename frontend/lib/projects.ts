"use client";

import {
  apiCreateProject,
  apiDeleteProject,
  apiGetProject,
  apiListProjects,
  HttpError,
  type BackendProject,
} from "@/lib/api";

export async function deleteProject(key: string): Promise<void> {
  await apiDeleteProject(key);
  cache.byKey.delete(key);
  if (cache.list) cache.list = cache.list.filter((p) => p.key !== key);
}

export type Project = {
  id?: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
  ownerId?: string;
};

type Cache = {
  list?: Project[];
  byKey: Map<string, Project>;
  listOwnerId?: string;
};

const cache: Cache = { byKey: new Map() };

function fromBackend(p: BackendProject): Project {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description || "",
    createdAt: p.created_at || new Date().toISOString(),
    ownerId: p.owner_id,
  };
}

/**
 * Lista proyectos del owner. Si no se pasa ownerId, devuelve []
 * (NO usamos localStorage fallback porque mostraba proyectos ajenos).
 */
export async function listProjects(
  ownerId: string | null | undefined,
  force = false
): Promise<Project[]> {
  if (!ownerId) {
    cache.list = [];
    cache.byKey.clear();
    cache.listOwnerId = undefined;
    return [];
  }
  if (!force && cache.list && cache.listOwnerId === ownerId) {
    return cache.list;
  }
  const remote = await apiListProjects(ownerId);
  const mapped = remote.map(fromBackend);
  cache.list = mapped;
  cache.listOwnerId = ownerId;
  cache.byKey.clear();
  for (const p of mapped) cache.byKey.set(p.key, p);
  return mapped;
}

export async function getProject(key: string): Promise<Project | null> {
  const cached = cache.byKey.get(key);
  if (cached) return cached;
  try {
    const remote = await apiGetProject(key);
    const mapped = fromBackend(remote);
    cache.byKey.set(key, mapped);
    return mapped;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function createProject(input: {
  key: string;
  name: string;
  description?: string;
  ownerId: string;
}): Promise<Project> {
  try {
    const remote = await apiCreateProject({
      key: input.key,
      name: input.name,
      description: input.description || "",
      owner_id: input.ownerId,
    });
    const mapped = fromBackend(remote);
    if (cache.list && cache.listOwnerId === input.ownerId) {
      cache.list = [...cache.list, mapped];
    }
    cache.byKey.set(mapped.key, mapped);
    return mapped;
  } catch (e) {
    if (e instanceof HttpError && (e.status === 409 || e.status === 400)) {
      throw new Error("Ya existe un proyecto con esa clave.");
    }
    throw e;
  }
}

export function clearProjectsCache(): void {
  cache.list = undefined;
  cache.listOwnerId = undefined;
  cache.byKey.clear();
}

export function normalizeKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
}
