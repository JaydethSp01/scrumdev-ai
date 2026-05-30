export const API = process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://localhost:8080";

export type ServiceStatus = Record<
  string,
  { status?: string; service?: string; error?: string }
>;

export type ChatResponse = {
  reply?: string;
  message?: string;
  correlation_id?: string;
  error?: string;
  [k: string]: unknown;
};

export type WorkflowResult = {
  workflow_id?: string;
  correlation_id?: string;
  status?: string;
  result?: { output?: string };
  error?: string;
  [k: string]: unknown;
};

export type CrewName = "refinement" | "architecture" | "delivery";

export type AgentInfo = {
  name: string;
  role?: string;
  description?: string;
  provider?: string;
  [k: string]: unknown;
};

export type AuditEvent = {
  id?: string;
  type?: string;
  source_service?: string;
  correlation_id?: string;
  created_at?: string;
  timestamp?: string;
  payload?: unknown;
  [k: string]: unknown;
};

export type AuthSession = {
  access_token: string;
  user: { id: string; email: string; name: string };
};

export type BackendProject = {
  id: string;
  key: string;
  name: string;
  description?: string;
  owner_id?: string;
  created_at?: string;
};

export type NFRRecord = {
  nfr_id?: string;
  id?: string;
  project_key?: string;
  user_id?: string;
  issue_key?: string | null;
  nfr_data?: Record<string, unknown>;
  created_at?: string;
  [k: string]: unknown;
};

export type WorkflowRun = {
  id?: string;
  workflow_id?: string;
  correlation_id?: string;
  project_key?: string;
  crew_name?: string;
  target_state?: string;
  status?: string;
  via?: string;
  output?: string;
  result?: { output?: string };
  context?: Record<string, unknown>;
  created_at?: string;
  [k: string]: unknown;
};

export type PendingDecision = {
  id: string;
  project_key: string;
  decision_type: string;
  title?: string;
  description?: string;
  context?: Record<string, unknown>;
  status?: string;
  created_at?: string;
  [k: string]: unknown;
};

export type AdrResponse = {
  adr_number?: number;
  topic?: string;
  markdown?: string;
  content?: string;
  [k: string]: unknown;
};

export type PolicyViolation = {
  policy: string;
  rule?: string;
  severity?: "low" | "medium" | "high" | "critical" | string;
  message?: string;
  details?: string;
  [k: string]: unknown;
};

export type PolicyEvaluation = {
  violations?: PolicyViolation[];
  passed?: boolean;
  [k: string]: unknown;
};

// Product vision
export type ProductVision = {
  project_key?: string;
  vision?: string;
  target_users?: string;
  stack_preference?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

// Backlog
export type BacklogItem = {
  id: string;
  story_key?: string;
  title: string;
  description?: string;
  acceptance_criteria?: string[];
  story_points?: number;
  priority?: string;
  status?: string;
  order_index?: number;
  [k: string]: unknown;
};

// Code
export type CodeFile = {
  id: string;
  story_id?: string;
  story_key?: string;
  file_path: string;
  language?: string;
  content: string;
  created_at?: string;
  [k: string]: unknown;
};

// Build
export type BuildSummary = {
  backlog_count?: number;
  code_files_generated?: number;
  stories_coded?: Array<{
    story_key?: string;
    title?: string;
    files?: string[];
  }>;
  architecture_preview?: string;
  [k: string]: unknown;
};

export type BuildRecord = {
  build_id?: string;
  id?: string;
  project_key?: string;
  stack?: string;
  triggered_by?: string;
  stage?: "queued" | "running" | "completed" | "failed" | string;
  progress_percent?: number;
  summary?: BuildSummary;
  error?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  [k: string]: unknown;
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new HttpError(res.status, `${res.status} ${res.statusText} ${txt}`.trim());
  }
  return res.json() as Promise<T>;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("scrumdev.token");
  } catch {
    return null;
  }
}

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers, cache: options.cache || "no-store" });
}

export async function getServicesStatus(): Promise<ServiceStatus> {
  const res = await fetch(`${API}/services/status`, { cache: "no-store" });
  return jsonOrThrow<ServiceStatus>(res);
}

export async function postChat(body: {
  user_id: string;
  project_key: string;
  issue_key?: string | null;
  content: string;
}): Promise<ChatResponse> {
  const res = await authFetch(`${API}/chat`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow<ChatResponse>(res);
}

export async function startWorkflow(body: {
  user_id: string;
  project_key: string;
  issue_key?: string | null;
  message: string;
  crew_name: CrewName;
}): Promise<WorkflowResult> {
  const res = await authFetch(`${API}/workflows/start`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow<WorkflowResult>(res);
}

export async function getWorkflow(workflowId: string): Promise<WorkflowResult> {
  const res = await authFetch(`${API}/workflows/${encodeURIComponent(workflowId)}`);
  return jsonOrThrow<WorkflowResult>(res);
}

export async function listWorkflowRuns(projectKey: string): Promise<WorkflowRun[]> {
  const res = await authFetch(
    `${API}/workflows?project_key=${encodeURIComponent(projectKey)}`
  );
  const data = await jsonOrThrow<{ workflows?: WorkflowRun[] } | WorkflowRun[]>(res);
  if (Array.isArray(data)) return data;
  return data.workflows || [];
}

export async function advanceWorkflow(body: {
  user_id: string;
  project_key: string;
  target_state: string;
  context: Record<string, unknown>;
}): Promise<WorkflowResult> {
  const res = await authFetch(`${API}/workflows/advance`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow<WorkflowResult>(res);
}

const AGENT_ROLE_MAP: Record<string, { role: string; description: string }> = {
  po_agent: {
    role: "Product Owner",
    description: "Refina historias INVEST con criterios Given/When/Then y estimacion.",
  },
  architect_agent: {
    role: "Software Architect",
    description: "Propone arquitectura desacoplada con contratos y mitigaciones.",
  },
  developer_agent: {
    role: "Developer",
    description: "Genera codigo real ejecutable archivo por archivo.",
  },
  qa_agent: {
    role: "QA Engineer",
    description: "Define plan de pruebas con casos felices, edge cases y errores.",
  },
  security_agent: {
    role: "Security Engineer",
    description: "Senala riesgos OWASP y controles minimos.",
  },
};

export async function getAgents(): Promise<AgentInfo[]> {
  const res = await authFetch(`${API}/agents`);
  // Backend devuelve {provider, agents: ["po_agent", ...]} (strings) o array de objects.
  const data = await jsonOrThrow<{
    provider?: string;
    agents?: AgentInfo[] | string[];
  } | AgentInfo[]>(res);
  const provider = (data as { provider?: string }).provider;
  const raw = Array.isArray(data) ? data : data.agents || [];
  return raw.map((a) => {
    if (typeof a === "string") {
      const meta = AGENT_ROLE_MAP[a] || { role: "Agent", description: "" };
      return { name: a, role: meta.role, description: meta.description, provider };
    }
    return { ...a, provider: a.provider || provider };
  });
}

export async function getAuditEvents(limit = 50): Promise<AuditEvent[]> {
  const res = await authFetch(`${API}/events?limit=${limit}`);
  const data = await jsonOrThrow<{ events?: AuditEvent[] } | AuditEvent[]>(res);
  if (Array.isArray(data)) return data;
  return data.events || [];
}

// Auth
export async function apiLogin(body: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<AuthSession>(res);
}

export async function apiRegister(body: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthSession> {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<AuthSession>(res);
}

// Projects
export async function apiListProjects(ownerId: string): Promise<BackendProject[]> {
  const res = await authFetch(
    `${API}/projects?owner_id=${encodeURIComponent(ownerId)}`
  );
  const data = await jsonOrThrow<{ projects?: BackendProject[] } | BackendProject[]>(res);
  if (Array.isArray(data)) return data;
  return data.projects || [];
}

export async function apiCreateProject(body: {
  key: string;
  name: string;
  description?: string;
  owner_id: string;
}): Promise<BackendProject> {
  const res = await authFetch(`${API}/projects`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow<BackendProject>(res);
}

export async function apiGetProject(key: string): Promise<BackendProject> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(key)}`);
  return jsonOrThrow<BackendProject>(res);
}

// Vision
export async function apiSaveVision(body: {
  project_key: string;
  vision: string;
  target_users?: string;
  stack_preference?: string;
}): Promise<ProductVision> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(body.project_key)}/vision`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return jsonOrThrow<ProductVision>(res);
}

export async function apiGetVision(projectKey: string): Promise<ProductVision | null> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/vision`
  );
  if (res.status === 404) return null;
  return jsonOrThrow<ProductVision>(res);
}

// Build
export async function apiStartBuild(body: {
  project_key: string;
  triggered_by: string;
  stack?: string;
  max_stories_to_code?: number;
}): Promise<BuildRecord> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(body.project_key)}/build`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return jsonOrThrow<BuildRecord>(res);
}

export async function apiListBuilds(
  projectKey: string,
  limit = 10
): Promise<BuildRecord[]> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/builds?limit=${limit}`
  );
  const data = await jsonOrThrow<{ builds?: BuildRecord[] } | BuildRecord[]>(res);
  if (Array.isArray(data)) return data;
  return data.builds || [];
}

// Smart build state
export type ProjectStatePending = {
  story_key?: string;
  title?: string;
  priority?: string;
  [k: string]: unknown;
};

export type NextAction =
  | "set_vision"
  | "generate_backlog"
  | "generate_pending_code"
  | "ready_to_deploy"
  | "regenerate"
  | string;

export type ProjectState = {
  vision_set?: boolean;
  backlog_count?: number;
  stories_with_code?: number;
  stories_pending_count?: number;
  stories_pending?: ProjectStatePending[];
  code_files_total?: number;
  last_build_stage?: string;
  next_action?: NextAction;
  next_action_label?: string;
  [k: string]: unknown;
};

export type SmartBuildResponse = {
  build_id?: string;
  action_executed?: NextAction;
  label?: string;
  stories_pending_count?: number;
  async?: boolean;
  [k: string]: unknown;
};

export async function apiGetProjectState(projectKey: string): Promise<ProjectState> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/state`
  );
  return jsonOrThrow<ProjectState>(res);
}

export async function apiSmartBuild(
  projectKey: string,
  body: { triggered_by: string; force_regenerate?: boolean }
): Promise<SmartBuildResponse> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/smart-build`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return jsonOrThrow<SmartBuildResponse>(res);
}

// Deploy
export type DeployStatus = {
  github?: { configured?: boolean; repo?: string; [k: string]: unknown };
  vercel?: { configured?: boolean; [k: string]: unknown };
  [k: string]: unknown;
};

export type DeployResponse = {
  git_url?: string;
  vercel_url?: string;
  vercel_state?: string;
  files_count?: number;
  git?: Record<string, unknown>;
  vercel?: Record<string, unknown>;
  [k: string]: unknown;
};

export type DeployPreview = {
  vercel_url?: string;
  state?: string;
  github_url?: string;
  [k: string]: unknown;
};

export async function apiGetDeployStatus(): Promise<DeployStatus> {
  const res = await authFetch(`${API}/deploy/status`);
  return jsonOrThrow<DeployStatus>(res);
}

export async function apiDeployProject(
  projectKey: string,
  body: {
    triggered_by: string;
    create_vercel_project?: boolean;
    framework?: string;
  }
): Promise<DeployResponse> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/deploy`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return jsonOrThrow<DeployResponse>(res);
}

export async function apiGetDeployPreview(
  projectKey: string
): Promise<DeployPreview | null> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/deploy/preview`
  );
  if (res.status === 404) return null;
  return jsonOrThrow<DeployPreview>(res);
}

// Assistant (chat libre)
export type AssistantAction = {
  type: "generate_code" | "none" | string;
  story_key?: string;
  [k: string]: unknown;
};

export type AssistantResponse = {
  reply: string;
  action?: AssistantAction;
  [k: string]: unknown;
};

export async function apiAssistant(
  projectKey: string,
  body: {
    user_id: string;
    message: string;
    image_paths?: string[];
    image_urls?: string[];
  }
): Promise<AssistantResponse> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/assistant`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return jsonOrThrow<AssistantResponse>(res);
}

export type ChatImageUpload = {
  project_key: string;
  url: string;
  fs_path: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_at: string;
};

export type DeployFallback = {
  fallback_provider?: "render" | null;
  render_url?: string | null;
  render_state?: string | null;
};

export async function apiUploadChatImage(
  projectKey: string,
  file: File
): Promise<ChatImageUpload> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/chat/upload-image`,
    { method: "POST", body: fd }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`upload ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// Backlog
export async function apiGetBacklog(projectKey: string): Promise<BacklogItem[]> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/backlog`
  );
  const data = await jsonOrThrow<{ items?: BacklogItem[] } | BacklogItem[]>(res);
  if (Array.isArray(data)) return data;
  return data.items || [];
}

// ===== Sprints (FASE B) =====
export type SprintStory = {
  story_key: string;
  title: string;
  story_points: number;
  status: string;
};
export type SprintData = {
  id: string;
  number: number;
  name: string;
  goal: string;
  order_index: number;
  status: "planned" | "active" | "completed" | "cancelled";
  total_points: number;
  stories: SprintStory[];
};
export type SprintBoard = {
  sprints: SprintData[];
  unassigned: SprintStory[];
};

export async function apiPlanSprints(projectKey: string): Promise<SprintBoard> {
  const res = await fetch(`${API}/projects/${encodeURIComponent(projectKey)}/sprints/plan`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`plan sprints ${res.status}`);
  return apiGetSprints(projectKey);
}

export async function apiGetSprints(projectKey: string): Promise<SprintBoard> {
  const res = await fetch(`${API}/projects/${encodeURIComponent(projectKey)}/sprints`);
  if (!res.ok) return { sprints: [], unassigned: [] };
  return res.json();
}

export async function apiReorderSprints(projectKey: string, sprintIds: string[]): Promise<void> {
  await fetch(`${API}/projects/${encodeURIComponent(projectKey)}/sprints/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sprint_ids: sprintIds }),
  });
}

export async function apiMoveStory(projectKey: string, storyKey: string, sprintId: string | null): Promise<void> {
  await fetch(`${API}/projects/${encodeURIComponent(projectKey)}/sprints/move-story`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ story_key: storyKey, sprint_id: sprintId }),
  });
}

export async function apiSetSprintStatus(projectKey: string, sprintId: string, status: string): Promise<void> {
  await fetch(`${API}/projects/${encodeURIComponent(projectKey)}/sprints/${sprintId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

// Code
export async function apiGetCode(projectKey: string): Promise<CodeFile[]> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/code`
  );
  const data = await jsonOrThrow<{ files?: CodeFile[] } | CodeFile[]>(res);
  if (Array.isArray(data)) return data;
  return data.files || [];
}

// NFR
export async function apiSubmitNFR(body: {
  user_id: string;
  project_key: string;
  issue_key?: string | null;
  nfr_data: Record<string, unknown>;
}): Promise<{ nfr_id?: string; next_state?: string; [k: string]: unknown }> {
  const res = await authFetch(`${API}/nfr`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function apiListNFR(projectKey: string): Promise<NFRRecord[]> {
  const res = await authFetch(`${API}/nfr?project_key=${encodeURIComponent(projectKey)}`);
  const data = await jsonOrThrow<{ nfrs?: NFRRecord[] } | NFRRecord[]>(res);
  if (Array.isArray(data)) return data;
  return data.nfrs || [];
}

// Decisions (HITL)
export async function apiListPendingDecisions(projectKey: string): Promise<PendingDecision[]> {
  const res = await authFetch(
    `${API}/decisions/pending?project_key=${encodeURIComponent(projectKey)}`
  );
  const data = await jsonOrThrow<{ decisions?: PendingDecision[] } | PendingDecision[]>(res);
  if (Array.isArray(data)) return data;
  return data.decisions || [];
}

export async function apiApproveDecision(
  id: string,
  body: { decided_by: string; decision_reason?: string }
): Promise<unknown> {
  const res = await authFetch(`${API}/decisions/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function apiRejectDecision(
  id: string,
  body: { decided_by: string; decision_reason?: string }
): Promise<unknown> {
  const res = await authFetch(`${API}/decisions/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

// ADR
export async function apiGenerateAdr(body: {
  project_key: string;
  adr_number: number;
  topic: string;
  context: string;
  nfr_data?: Record<string, unknown>;
}): Promise<AdrResponse> {
  const res = await authFetch(`${API}/adr/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow<AdrResponse>(res);
}

// Policy
export async function apiEvaluatePolicy(body: {
  project_key: string;
  artifact_type: string;
  content: string;
  policies: string[];
}): Promise<PolicyEvaluation> {
  const res = await authFetch(`${API}/policy/evaluate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return jsonOrThrow<PolicyEvaluation>(res);
}

export async function apiGetPolicy(name: string): Promise<string> {
  const res = await authFetch(`${API}/policies/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new HttpError(res.status, `${res.status} ${res.statusText}`);
  }
  return res.text();
}

// Personalizacion: Brand Kit
export type BrandKit = {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  logo_url?: string | null;
  tone: string;
  industry?: string | null;
  extra?: Record<string, unknown> | null;
  exists: boolean;
  [k: string]: unknown;
};

export type BrandKitInput = {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  logo_url?: string | null;
  tone: string;
  industry?: string | null;
  extra?: Record<string, unknown> | null;
};

export type ProjectAssetType =
  | "logo"
  | "hero"
  | "feature"
  | "avatar"
  | "gallery"
  | "background"
  | "other";

export type ProjectAsset = {
  id: string;
  asset_type: ProjectAssetType | string;
  name: string;
  url: string;
  alt_text?: string | null;
  order_index: number;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
  [k: string]: unknown;
};

export async function apiGetBrandKit(projectKey: string): Promise<BrandKit> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/brand-kit`
  );
  return jsonOrThrow<BrandKit>(res);
}

export async function apiSaveBrandKit(
  projectKey: string,
  body: BrandKitInput
): Promise<{ updated: boolean; id?: string; [k: string]: unknown }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/brand-kit`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
  return jsonOrThrow(res);
}

export async function apiListAssets(projectKey: string): Promise<ProjectAsset[]> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/assets`
  );
  const data = await jsonOrThrow<{ assets?: ProjectAsset[] } | ProjectAsset[]>(res);
  if (Array.isArray(data)) return data;
  return data.assets || [];
}

export async function apiUploadAsset(
  projectKey: string,
  file: File,
  assetType: ProjectAssetType | string,
  altText?: string,
  orderIndex?: number
): Promise<{ id: string; url: string; asset_type: string; size_bytes?: number; [k: string]: unknown }> {
  const form = new FormData();
  form.append("file", file);
  form.append("asset_type", assetType);
  if (altText) form.append("alt_text", altText);
  if (typeof orderIndex === "number") form.append("order_index", String(orderIndex));

  const token = getStoredToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/assets`,
    {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
    }
  );
  return jsonOrThrow(res);
}

export async function apiDeleteAsset(
  projectKey: string,
  assetId: string
): Promise<{ deleted: boolean; [k: string]: unknown }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/assets/${encodeURIComponent(assetId)}`,
    { method: "DELETE" }
  );
  return jsonOrThrow(res);
}
