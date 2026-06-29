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

const _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Estados típicos de backend "frío"/despertando (HF Space, Render free).
const _COLD = new Set([502, 503, 504, 522, 524]);

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
  // Reintenta ante cold-start del backend (servidor despertando) con backoff,
  // para que la 1ª acción tras inactividad NO falle con error feo.
  const delays = [2000, 4000, 6000, 8000];
  let lastErr: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      const res = await fetch(url, { ...options, headers, cache: options.cache || "no-store" });
      if (_COLD.has(res.status) && i < delays.length) { await _sleep(delays[i]); continue; }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < delays.length) { await _sleep(delays[i]); continue; }
      throw e;
    }
  }
  throw lastErr;
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

// Inicia/continúa el CICLO DE VIDA gateado (corre fase por fase y se detiene en
// el próximo gate del PO). Reemplaza al one-shot.
export async function apiStartLifecycle(projectKey: string): Promise<unknown> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/pipeline/autorun`,
    { method: "POST", body: JSON.stringify({ triggered_by: "po" }) }
  );
  // NUNCA tragar el error: un 404/500 aquí significa que el ciclo NO arrancó.
  if (!res.ok) throw new Error(`No se pudo iniciar el ciclo (HTTP ${res.status})`);
  return res.json();
}

export type TechTask = {
  id?: string; module: string; type: string; title: string;
  detail?: string; depends_on?: string[];
};
// Resumen ejecutivo para el cliente (IA barata, OpenAI): qué se construyó.
export async function apiExecutiveSummary(
  projectKey: string
): Promise<{ ok?: boolean; summary?: string; url?: string }> {
  try {
    const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/summary`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

// Explicación SIMPLE del gate (IA barata, OpenAI): qué apruebas, en cristiano.
export async function apiExplainGateSimple(
  projectKey: string
): Promise<{ ok?: boolean; explanation?: string }> {
  try {
    const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/gate/explain`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

// Auto-reparación de deploy: la IA corrige el código de la app y redespliega.
export async function apiRepairDeploy(
  projectKey: string
): Promise<{ repairing?: boolean; message?: string }> {
  try {
    const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/deploy/repair`, {
      method: "POST",
      body: JSON.stringify({ triggered_by: "po" }),
    });
    if (!res.ok) return { repairing: false, message: `HTTP ${res.status}` };
    return await res.json();
  } catch {
    return { repairing: false, message: "sin conexión" };
  }
}

// Asistente de visión (IA menor, OpenAI): pule la idea + sugiere usuarios/entidades.
export async function apiVisionAssist(
  text: string
): Promise<{ ok: boolean; vision?: string; target_users?: string; entities?: string[]; reason?: string }> {
  try {
    const res = await authFetch(`${API}/intake/vision/assist`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return await res.json();
  } catch {
    return { ok: false, reason: "sin conexión" };
  }
}

export type RefinementStory = {
  story_key: string; title: string; priority?: string; story_points?: number;
  dor: { ready: boolean; checks: { name: string; ok: boolean }[] };
  tech_tasks: TechTask[]; origin?: string; requirement_excerpt?: string;
  mockup?: string;
};
export type Refinement = {
  stories: RefinementStory[]; dor_ready: number; total: number;
  tech_tasks_total: number; by_module: Record<string, number>;
  requirement?: string;
};

export async function apiGetRefinement(projectKey: string): Promise<Refinement> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/refinement`
  );
  return jsonOrThrow<Refinement>(res);
}

export type CodeSummary = {
  total_files: number; by_module: Record<string, number>; generated: boolean;
};
export async function apiGetCodeSummary(projectKey: string): Promise<CodeSummary> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/code-summary`
  );
  return jsonOrThrow<CodeSummary>(res);
}


// Eliminar proyecto completo (acción del PO desde la card).
export async function apiDeleteProject(projectKey: string): Promise<void> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`No se pudo eliminar (HTTP ${res.status})`);
}

// Pipeline gateado (para el chat conversacional).
export async function apiGetPipeline(projectKey: string): Promise<Record<string, unknown>> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/pipeline`);
  return jsonOrThrow(res);
}
export async function apiApproveGate(projectKey: string, reason = "aprobado"): Promise<unknown> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/pipeline/approve-gate`,
    { method: "POST", body: JSON.stringify({ decided_by: "po", reason }) }
  );
  return res.ok ? res.json() : null;
}

export type Mockup = {
  matched: boolean;
  source: "template" | "generated";
  recommend_scratch?: boolean;
  template: { id: string; name: string; preview_url: string; confidence: number } | null;
  alternatives: { id: string; name: string; preview_url: string; confidence: number }[];
};

// Mockup del backlog: se adapta a la plantilla que matchea, o "a medida" si no.
export async function apiGetMockups(projectKey: string): Promise<Mockup> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/mockups`
  );
  return jsonOrThrow<Mockup>(res);
}

// Feedback loop: error/mejora → nueva historia en el backlog (Adam #15).
export async function apiAddFeedback(
  projectKey: string, title: string, kind: "bug" | "improvement", description = ""
): Promise<unknown> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/feedback`,
    { method: "POST", body: JSON.stringify({ title, kind, description }) }
  );
  return res.ok ? res.json() : null;
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
  // authFetch -> reintenta si el backend está despertando (cold-start)
  const res = await authFetch(`${API}/auth/login`, {
    method: "POST",
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
  github_owner?: string;
  deployed?: boolean;
  deploy_state?: string;
  deploy_error?: string | null;
  gate_ok?: boolean;
  live?: boolean;
  e2e_ok?: boolean;
  e2e_checks?: string[];
  e2e_fails?: string[];
  backend_warming?: boolean;
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
    session_id?: string | null;
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

// ===== Galeria de plantillas 1A =====
export type TemplateCard = {
  id: string;
  name: string;
  sector: string;
  sector_label: string;
  software_type: string;
  stack: string;
  description: string;
  entities: string[];
  brand_color: string;
  accent?: string;
  tags: string[];
  has_files: boolean;
  preview_url: string;
  match_score: number;
};
export type TemplatesResponse = {
  project_key: string;
  templates: TemplateCard[];
  from_scratch: { label: string; description: string; eta_minutes: string };
  template_eta_minutes: string;
};

// Rankea plantillas para una visión SIN proyecto (preview pre-creación en el wizard).
export async function apiMatchTemplates(
  vision: string,
  topK = 50
): Promise<{ templates: TemplateCard[]; recommended: TemplateCard | null; recommend_scratch: boolean; total: number }> {
  const res = await fetch(`${API}/templates/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vision, top_k: topK }),
  });
  return jsonOrThrow(res);
}

export async function apiGetTemplates(
  projectKey: string,
  topK = 6
): Promise<TemplatesResponse> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/templates?top_k=${topK}`
  );
  return jsonOrThrow<TemplatesResponse>(res);
}

export async function apiUseTemplate(
  projectKey: string,
  templateId: string
): Promise<{ ok: boolean; template: string; files: number; stack: string }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/use-template`,
    { method: "POST", body: JSON.stringify({ template_id: templateId }) }
  );
  return jsonOrThrow(res);
}

// ===== Creacion inteligente: industria / intake / doc =====
export type Industry = { id: string; label: string; icon: string };
export type IntakeField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "boolean";
  options?: string[];
  placeholder?: string;
  help?: string;
  required?: boolean;
};
export type IntakeForm = {
  industry: string;
  title: string;
  intro: string;
  fields: IntakeField[];
};

export async function apiGetIndustries(): Promise<Industry[]> {
  const res = await fetch(`${API}/intake/industries`);
  if (!res.ok) return [];
  return (await res.json()).industries || [];
}

export async function apiGenIntakeForm(industry: string, productHint = ""): Promise<IntakeForm> {
  const res = await fetch(`${API}/intake/form`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ industry, product_hint: productHint }),
  });
  if (!res.ok) throw new Error(`intake form ${res.status}`);
  return res.json();
}

export async function apiIntakeVision(
  industry: string,
  answers: Record<string, unknown>,
  projectName = ""
): Promise<string> {
  const res = await fetch(`${API}/intake/vision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ industry, answers, project_name: projectName }),
  });
  if (!res.ok) throw new Error(`intake vision ${res.status}`);
  return (await res.json()).vision || "";
}

export async function apiVisionFromDocument(
  file: File,
  projectName = ""
): Promise<{ vision: string; target_users: string; summary: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("project_name", projectName);
  const res = await fetch(`${API}/intake/document`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`doc extract ${res.status}`);
  return res.json();
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

export async function apiGetSprints(projectKey: string, versionId?: string): Promise<SprintBoard> {
  const q = versionId ? `?version_id=${encodeURIComponent(versionId)}` : "";
  // authFetch -> reintenta si el backend está despertando (evita board colgado en cold-start)
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/sprints${q}`);
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

// ===== Ciclo de vida: versiones, multi-chat, fix de bugs =====

export type VersionInfo = {
  id: string;
  number: number;
  name: string;
  description: string;
  status: string;
  based_on_version_id: string | null;
  sprint_count: number;
  file_count: number;
  created_at?: string | null;
  released_at?: string | null;
};

export async function listVersions(
  projectKey: string
): Promise<{ versions: VersionInfo[]; total: number }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/versions`
  );
  return jsonOrThrow(res);
}

export async function createVersion(
  projectKey: string,
  body: { name: string; description: string; copy_code?: boolean }
): Promise<VersionInfo> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/versions`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  return jsonOrThrow(res);
}

export async function setVersionStatus(
  projectKey: string,
  versionId: string,
  status: string
): Promise<{ ok: boolean; status: string }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/versions/${encodeURIComponent(versionId)}/status`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }
  );
  return jsonOrThrow(res);
}

export type ChatSessionInfo = {
  id: string;
  title: string;
  kind: string;
  version_id: string | null;
  created_at?: string | null;
  last_message_at?: string | null;
};

export async function listChats(
  projectKey: string,
  userId = "po"
): Promise<{ chats: ChatSessionInfo[] }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/chats?user_id=${encodeURIComponent(userId)}`
  );
  return jsonOrThrow(res);
}

export async function createChat(
  projectKey: string,
  body: { user_id?: string; title: string; kind?: string; version_id?: string | null }
): Promise<ChatSessionInfo> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/chats`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  return jsonOrThrow(res);
}

export async function getChatMessages(
  projectKey: string,
  sessionId: string
): Promise<{ messages: { role: string; content: string; image_urls?: string[] | null; action?: unknown; created_at?: string | null }[] }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/chats/${encodeURIComponent(sessionId)}/messages`
  );
  return jsonOrThrow(res);
}

export async function fixBug(
  projectKey: string,
  body: { bug_description: string; image_paths?: string[]; version_id?: string | null }
): Promise<{ fixed: boolean; summary?: string; files_changed?: string[]; message?: string }> {
  const res = await authFetch(
    `${API}/projects/${encodeURIComponent(projectKey)}/fix-bug`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  return jsonOrThrow(res);
}

// ===== Gestión de tareas por el PO (board estilo Azure DevOps) =====

export async function createTask(
  projectKey: string,
  body: { title: string; description?: string; priority?: string; story_points?: number; status?: string; sprint_id?: string | null; version_id?: string | null; acceptance_criteria?: string[] }
): Promise<BacklogItem> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/tasks`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function updateTask(
  projectKey: string, taskId: string,
  body: Partial<{ title: string; description: string; priority: string; story_points: number; status: string; sprint_id: string | null; acceptance_criteria: string[] }>
): Promise<BacklogItem> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function deleteTask(projectKey: string, taskId: string): Promise<{ deleted: boolean }> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
  return jsonOrThrow(res);
}

// ===== Config Jira por proyecto (onboarding) =====

export type JiraConfigStatus = {
  configured: boolean;
  source: "project" | "global" | "none";
  base_url?: string; email?: string; project_key_jira?: string; board_id?: string;
  has_token?: boolean;
  help?: { title: string; steps: string[]; token_url: string };
};

export async function getJiraConfig(projectKey: string): Promise<JiraConfigStatus> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/integrations/jira`);
  return jsonOrThrow(res);
}

export async function setJiraConfig(
  projectKey: string,
  body: { base_url: string; email: string; api_token: string; project_key_jira?: string; board_id?: string }
): Promise<{ saved: boolean; connection_ok: boolean; message: string }> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/integrations/jira`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function createSprint(
  projectKey: string, body: { name: string; goal?: string; version_id?: string | null }
): Promise<{ id: string; number: number; name: string }> {
  const res = await authFetch(`${API}/projects/${encodeURIComponent(projectKey)}/sprints`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

// ===== Auditoría de acciones de agentes (panel profundo por agente) =====
export type AgentRunArtifact = {
  type?: string;
  count?: number;
  build_id?: string;
  sprint?: number | null;
  target?: string;
  // tolera campos extra del backend
  [k: string]: unknown;
};
export type AgentRun = {
  id: string;
  agent: string;
  role: string;
  phase: string;
  action: string;
  summary: string;
  input_summary?: string;
  output_summary?: string;
  artifacts?: AgentRunArtifact[];
  status: "running" | "done" | "failed";
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
};

// Devuelve las ejecuciones de los agentes para auditoría. Degrada elegante:
// si el endpoint aún no existe (404) o el backend falla, devuelve [] en vez de romper.
export async function apiGetAgentRuns(projectKey: string): Promise<AgentRun[]> {
  try {
    const res = await authFetch(
      `${API}/projects/${encodeURIComponent(projectKey)}/agent-runs`
    );
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const data = await res.json() as { runs?: AgentRun[] } | AgentRun[];
    if (Array.isArray(data)) return data;
    return data.runs || [];
  } catch {
    return [];
  }
}

// ── Orquestación en vivo (OrchestrationStudio) ───────────────────────────────
export type OrchestrationStep = {
  id: string;
  agent: string;
  role: string;
  phase: string;
  action: string;
  input_summary?: string | null;
  output_summary?: string | null;
  input_full?: string | null;
  output_full?: string | null;
  artifacts?: AgentRunArtifact[];
  status: "running" | "done" | "failed" | "error" | "skipped";
  handoff_from?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
};
export type OrchestrationDeploy = {
  state?: string | null;
  phase_label?: string | null;
  phase_pct?: number | null;
  url?: string | null;
  vercel_url?: string | null;
  api_url?: string | null;
  git_url?: string | null;
  gate_detail?: string | null;
  error?: string | null;
  e2e_fails?: string[];
  repair_summary?: string | null;
};
export type Orchestration = {
  current_state: string;
  current_actor?: string | null;
  current_label?: string | null;
  is_gate?: boolean;
  active_agent?: string | null;
  steps: OrchestrationStep[];
  deploy?: OrchestrationDeploy | null;
};
export async function apiGetOrchestration(projectKey: string): Promise<Orchestration | null> {
  try {
    const res = await authFetch(
      `${API}/projects/${encodeURIComponent(projectKey)}/orchestration`
    );
    if (!res.ok) return null;
    return (await res.json()) as Orchestration;
  } catch {
    return null;
  }
}

// ── ADRs de arquitectura (drill-in del Architect Agent) ──────────────────────
export type AdrItem = {
  adr_number?: number;
  title?: string;
  status?: string;
  context?: string;
  decision?: string;
  consequences?: string;
  markdown?: string;
  [k: string]: unknown;
};
export async function apiGetAdrs(projectKey: string): Promise<AdrItem[]> {
  try {
    const res = await authFetch(
      `${API}/projects/${encodeURIComponent(projectKey)}/adrs`
    );
    if (!res.ok) return [];
    const d = (await res.json()) as { adrs?: AdrItem[] } | AdrItem[];
    return Array.isArray(d) ? d : d.adrs || [];
  } catch {
    return [];
  }
}
