"use client";

import { readJSON, STORAGE_KEYS, writeJSON } from "@/lib/storage";
import type { CrewName } from "@/lib/api";

export type StoredWorkflow = {
  id: string;
  workflow_id?: string;
  correlation_id?: string;
  project_key: string;
  issue_key?: string | null;
  crew_name: CrewName;
  input: string;
  output: string;
  status: string;
  createdAt: string;
  durationMs?: number;
};

export function listProjectWorkflows(projectKey: string): StoredWorkflow[] {
  return readJSON<StoredWorkflow[]>(STORAGE_KEYS.workflows(projectKey), []);
}

export function saveProjectWorkflows(projectKey: string, items: StoredWorkflow[]): void {
  writeJSON(STORAGE_KEYS.workflows(projectKey), items);
}

export function addProjectWorkflow(projectKey: string, wf: StoredWorkflow): StoredWorkflow[] {
  const items = listProjectWorkflows(projectKey);
  items.unshift(wf);
  saveProjectWorkflows(projectKey, items.slice(0, 100));
  return items;
}
