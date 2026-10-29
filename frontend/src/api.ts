// Typed client for docs/api-contract.md. Single source of API types: keep in sync with the backend.

export type Kind = 'sponsor' | 'template';
export type Language = 'en' | 'nl' | 'fr';
export type Lang = Language;
export type Audience = 'adult' | 'parent' | 'adolescent' | 'child';
export type Stage =
  | 'intake'
  | 'drafting'
  | 'pi_review'
  | 'translation'
  | 'ethics_review'
  | 'approved';
export type Role = 'sponsor' | 'icf' | 'other';
export type IcfType = Audience;
export type VersionSource = 'upload' | 'generated' | 'reviewed';
export type CommentStatus = 'open' | 'approved' | 'declined';

export interface User {
  id: number;
  email: string;
  name: string;
  language: Language;
}

export interface Document {
  id: number;
  kind: Kind;
  name: string;
  filename: string;
  language: Language | null;
  audience: Audience | null;
  version: string | null;
  released: string | null;
  study: string | null;
  size: number;
  uploaded_at: string;
  preview: 'docx' | 'pdf' | 'none';
}

export interface Heading {
  level: number;
  text: string;
  anchor: string;
}

export interface ColorCounts {
  purple: number;
  red: number;
  blue: number;
  black: number;
}

export interface DocHtml {
  html: string;
  headings: Heading[];
  stats: {
    paragraphs: number;
    words: number;
    tables: number;
    colors: ColorCounts;
  };
}

export interface VersionHtml extends DocHtml {
  comment_ids: string[];
}

export interface SeedResult {
  imported: number;
  skipped: number;
  converted: number;
  failed: { name: string; reason: string }[];
  items: { name: string; kind: 'template' | 'project_doc' }[];
}

export interface UploadMeta {
  kind: Kind;
  name?: string;
  language?: Language | '';
  audience?: Audience | '';
  version?: string;
  released?: string;
  study?: string;
}

export interface Project {
  id: number;
  name: string;
  study: string | null;
  description: string | null;
  stage: Stage;
  created_at: string;
  created_by_name: string;
  doc_count: number;
  open_comments: number;
}

export interface Version {
  id: number;
  doc_id: number;
  number: number;
  filename: string;
  size: number;
  note: string | null;
  source: VersionSource;
  uploaded_by: string;
  uploaded_at: string;
  preview: 'docx' | 'pdf' | 'none';
  comments_total: number;
  comments_open: number;
  comments_approved: number;
  comments_declined: number;
}

export interface ProjectDoc {
  id: number;
  project_id: number;
  title: string;
  role: Role;
  icf_type: IcfType | null;
  language: Language | null;
  created_at: string;
  source_doc_id: number | null;
  versions: Version[];
}

export interface VersionDetail {
  version: Version;
  doc: Omit<ProjectDoc, 'versions'>;
  project: Project;
}

export interface ReviewComment {
  id: number;
  version_id: number;
  ext_id: string;
  author: string;
  initials: string;
  date: string | null;
  text: string;
  anchor_text: string;
  language: Lang | null;
  translated_text: string | null;
  translated_to: Lang | null;
  parent_id: number | null;
  status: CommentStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface DiffWord {
  op: 'eq' | 'ins' | 'del';
  text: string;
}

export interface DiffBlock {
  kind: 'equal' | 'insert' | 'delete' | 'replace';
  old: string | null;
  new: string | null;
  words: DiffWord[] | null;
}

export interface DiffResult {
  from: Version;
  to: Version;
  stats: {
    inserted: number;
    deleted: number;
    changed: number;
    unchanged: number;
    tracked_changes: number;
  };
  blocks: DiffBlock[];
  comments: { added: ReviewComment[]; removed: ReviewComment[] };
}

export interface GenerateRequest {
  template_id?: number;
  icf_type: IcfType;
  language: Language;
  sponsor_version_ids: number[];
  notes: string;
  title?: string;
}

export interface GenerateReport {
  placeholders_total: number;
  filled: number;
  flagged: number;
  removed_guidance_paragraphs: number;
  ai_used: boolean;
}

export type TaskStep =
  | 'queued'
  | 'reading'
  | 'filling'
  | 'comments'
  | 'saving'
  | 'done';

export interface Task {
  id: string;
  kind: 'generate' | 'translate';
  status: 'running' | 'done' | 'failed';
  step: TaskStep;
  done: number;
  total: number;
  progress: number;
  language: Lang | null;
  elapsed_s: number;
  result: { docs: ProjectDoc[]; reports: GenerateReport[] } | null;
  error: string | null;
}

export interface Requirement {
  key: string;
  met: boolean;
  blocking: boolean;
  detail: string | null;
}

export interface StageProgress {
  key: Stage;
  state: 'done' | 'current' | 'todo';
  can_leave: boolean;
  requirements: Requirement[];
}

export interface MatrixCell {
  doc_id: number;
  version_id: number;
  version_number: number;
  source: VersionSource;
  comments_open: number;
}

export interface MatrixRow {
  icf_type: IcfType;
  languages: Record<Lang, MatrixCell | null>;
}

export interface ProjectProgress {
  stage: Stage;
  next_stage: Stage | null;
  stages: StageProgress[];
  matrix: MatrixRow[];
}

export interface AiStatus {
  enabled: boolean;
  provider: 'vertex' | 'none';
  model: string | null;
  project: string | null;
}

export interface AdminStatus {
  ai: AiStatus;
  storage: { backend: 'local' | 'gcs'; bucket: string | null };
  converters: { pandoc: boolean; libreoffice: boolean };
  counts: {
    projects: number;
    project_docs: number;
    templates: number;
    users: number;
  };
}

export interface JobResponse {
  status: string;
  mode: 'creation' | 'translation' | 'update';
  message: string;
}

export interface CreationJob {
  template_id: number;
  sponsor_ids: number[];
  notes: string;
}
export interface TranslationJob {
  source_ids: number[];
  target_languages: ('nl' | 'fr')[];
}
export interface UpdateJob {
  document_ids: number[];
  new_template_id: number;
}

// ---- session token -------------------------------------------------------

const TOKEN_KEY = 'icf-studio-token';

export const auth = {
  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(v: string | null) {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Fired on any 401 so the app shell can send the user to /login. */
export const LOGOUT_EVENT = 'icf-studio:logout';

function withToken(url: string): string {
  const t = auth.token;
  if (!t) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`;
}

// ---- fetch helpers -------------------------------------------------------

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const d = body?.detail ?? body?.message;
    if (typeof d === 'string') return d;
    if (d) return JSON.stringify(d);
  } catch {
    /* ignore */
  }
  return `${res.status} ${res.statusText}`;
}

function authHeaders(init?: RequestInit): HeadersInit {
  const h = new Headers(init?.headers);
  const t = auth.token;
  if (t) h.set('Authorization', `Bearer ${t}`);
  return h;
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: authHeaders(init),
  });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    auth.token = null;
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }
  return res;
}

/** Error carrying the HTTP status and the parsed JSON body (e.g. 409 requirements_not_met). */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await raw(path, init);
  if (!res.ok) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    throw new ApiError(await errorMessage(res), res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Job endpoints answer 501 by design; return the body instead of throwing. */
async function job(path: string, body: unknown): Promise<JobResponse> {
  const res = await raw(path, json('POST', body));
  if (res.ok || res.status === 501) return (await res.json()) as JobResponse;
  throw new Error(await errorMessage(res));
}

function form(
  file: File,
  fields: Record<string, string | undefined>,
): FormData {
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries(fields)) if (v) fd.append(k, v);
  return fd;
}

export const api = {
  health: () => req<{ status: string }>('/health'),

  // auth
  login: (email: string, password: string) =>
    req<{ token: string; user: User }>(
      '/auth/login',
      json('POST', { email, password }),
    ),
  register: (b: {
    email: string;
    name: string;
    password: string;
    language: Language;
  }) => req<{ token: string; user: User }>('/auth/register', json('POST', b)),
  me: () => req<User>('/auth/me'),
  updateMe: (b: { name?: string; language?: Language }) =>
    req<User>('/auth/me', json('PATCH', b)),

  // template library
  listDocuments: (kind?: Kind) =>
    req<Document[]>(`/documents${kind ? `?kind=${kind}` : ''}`),
  getDocument: (id: number) => req<Document>(`/documents/${id}`),
  deleteDocument: (id: number) =>
    req<void>(`/documents/${id}`, { method: 'DELETE' }),
  fileUrl: (id: number) => withToken(`/api/documents/${id}/file`),
  getHtml: (id: number) => req<DocHtml>(`/documents/${id}/html`),
  upload: (file: File, meta: UploadMeta) =>
    req<Document>('/documents', {
      method: 'POST',
      body: form(file, {
        kind: meta.kind,
        name: meta.name,
        language: meta.language,
        audience: meta.audience,
        version: meta.version,
        released: meta.released,
        study: meta.study,
      }),
    }),
  seed: () => req<SeedResult>('/seed/bucket', { method: 'POST' }),

  // projects
  listProjects: () => req<Project[]>('/projects'),
  getProject: (id: number) => req<Project>(`/projects/${id}`),
  createProject: (b: { name: string; study?: string; description?: string }) =>
    req<Project>('/projects', json('POST', b)),
  updateProject: (
    id: number,
    b: {
      name?: string;
      study?: string;
      description?: string;
      stage?: Stage;
      force?: boolean;
    },
  ) => req<Project>(`/projects/${id}`, json('PATCH', b)),
  deleteProject: (id: number) =>
    req<void>(`/projects/${id}`, { method: 'DELETE' }),

  // project documents + versions
  listProjectDocs: (projectId: number) =>
    req<ProjectDoc[]>(`/projects/${projectId}/documents`),
  createProjectDoc: (
    projectId: number,
    file: File,
    meta: {
      title?: string;
      role: Role;
      icf_type?: IcfType | '';
      language?: Language | '';
      note?: string;
    },
  ) =>
    req<ProjectDoc>(`/projects/${projectId}/documents`, {
      method: 'POST',
      body: form(file, {
        title: meta.title,
        role: meta.role,
        icf_type: meta.icf_type,
        language: meta.language,
        note: meta.note,
      }),
    }),
  deleteProjectDoc: (docId: number) =>
    req<void>(`/project-documents/${docId}`, { method: 'DELETE' }),
  uploadVersion: (
    docId: number,
    file: File,
    meta: { note?: string; source?: 'upload' | 'reviewed' } = {},
  ) =>
    req<Version>(`/project-documents/${docId}/versions`, {
      method: 'POST',
      body: form(file, { note: meta.note, source: meta.source }),
    }),
  getVersion: (vid: number) => req<VersionDetail>(`/versions/${vid}`),
  versionFileUrl: (vid: number) => withToken(`/api/versions/${vid}/file`),
  getVersionHtml: (vid: number) => req<VersionHtml>(`/versions/${vid}/html`),

  // comments
  listComments: (vid: number, lang?: Lang) =>
    req<ReviewComment[]>(
      `/versions/${vid}/comments${lang ? `?lang=${lang}` : ''}`,
    ),
  decideComment: (id: number, status: CommentStatus, note?: string) =>
    req<ReviewComment>(
      `/comments/${id}/decision`,
      json('POST', { status, note }),
    ),

  // diff + generate + ai
  diff: (from: number, to: number, lang?: Lang) =>
    req<DiffResult>(
      `/diff?from=${from}&to=${to}${lang ? `&lang=${lang}` : ''}`,
    ),
  generate: (projectId: number, b: GenerateRequest) =>
    req<{ task_id: string }>(
      `/projects/${projectId}/generate`,
      json('POST', b),
    ),
  translate: (
    docId: number,
    b: { target_languages: ('nl' | 'fr')[]; version_id?: number },
  ) =>
    req<{ task_id: string }>(
      `/project-documents/${docId}/translate`,
      json('POST', b),
    ),
  task: (id: string) => req<Task>(`/tasks/${id}`),
  progress: (projectId: number) =>
    req<ProjectProgress>(`/projects/${projectId}/progress`),
  adminStatus: () => req<AdminStatus>('/admin/status'),
  aiStatus: () => req<AiStatus>('/ai/status'),

  // v1 placeholders (no longer linked from the UI)
  jobCreation: (b: CreationJob) => job('/jobs/creation', b),
  jobTranslation: (b: TranslationJob) => job('/jobs/translation', b),
  jobUpdate: (b: UpdateJob) => job('/jobs/update', b),
};
