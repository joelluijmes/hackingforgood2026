// Typed client for docs/api-contract.md. Single source of API types: keep in sync with the backend.

export type Kind = 'sponsor' | 'template';
export type Language = 'en' | 'nl' | 'fr';
export type Lang = Language;
export type Audience = 'adult' | 'parent' | 'adolescent' | 'child';
export type Stage =
  | 'intake'
  | 'drafting'
  | 'pi_review'
  | 'ethics_review'
  | 'approved'
  | 'participants';
export type Role = 'sponsor' | 'icf' | 'other';
export type IcfType = Audience;
export type VersionSource =
  | 'upload'
  | 'generated'
  | 'reviewed'
  | 'edited'
  | 'propagated';
export type CommentStatus = 'open' | 'approved' | 'declined';

export interface User {
  id: number;
  email: string;
  name: string;
  language: Language;
  role: 'staff' | 'participant';
}

// --- Study profile (docs/api-contract.md "Study profile") ---
export interface FactDef {
  key: string;
  label: string;
  group: 'study' | 'site' | 'contacts' | 'privacy' | 'ethics' | 'insurance';
  kind: 'text' | 'phone' | 'email' | 'multiline';
  scope: 'global' | 'project' | 'both';
  hint: string;
}
export type FactSource = 'manual' | 'inferred' | 'global' | '';
export interface ProjectFacts {
  schema: FactDef[];
  facts: Record<string, { value: string; source: FactSource }>;
  globals: Record<string, string>;
  key_facts: string[];
  filled: number;
  total: number;
}
export interface GlobalFacts {
  schema: FactDef[];
  values: Record<string, string>;
}
export interface FactSuggestion {
  key: string;
  value: string;
  current: string;
  current_source: FactSource;
}

export interface ParticipantPortalSettings {
  enabled: boolean;
  contact: string;
  urgent_guidance: string;
  publications: { doc_id: number; version_id: number; number: number }[];
}
export type ParticipantPersona =
  | 'adult'
  | 'parent_guardian'
  | 'adolescent'
  | 'child';
export interface ParticipantAskBody {
  question: string;
  persona: ParticipantPersona;
  language: Language;
  history: { role: 'user' | 'assistant'; text: string }[];
}
export interface ParticipantReply {
  explanation: string;
  source_references: {
    doc_id: number;
    title: string;
    version_id: number;
    section_id: string;
    heading: string;
  }[];
  unanswered_questions: string[];
  requires_human_followup: boolean;
}
export interface ParticipantInvitation {
  email: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'expired';
}
/** Staff preview: `demo` is true when nothing is published and the latest ICF versions are shown. */
export interface PortalPreview {
  trial: { id: number; name: string; study: string };
  demo: boolean;
  documents: ParticipantDocument[];
}
export interface ParticipantDocument {
  id: number;
  title: string;
  icf_type: IcfType | null;
  language: Language | null;
  role: Role;
  version_id: number;
  version_number: number;
}
export interface ParticipantDocumentContent extends ParticipantDocument {
  sections: {
    section_id: string;
    heading: string;
    text: string;
    anchor: string | null;
  }[];
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
  /** passages filled quietly from sponsor documents (highlight only, no comment) */
  fill_count: number;
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

export interface VersionSourceItem {
  kind: 'sponsor' | 'template' | 'icf';
  name: string;
  /** false = not recorded when this version was made, only inferred from the project */
  recorded: boolean;
  /** how an ICF/inherited source relates, e.g. "previous version", "translated from" */
  relation?: string;
  doc_id?: number;
  template_id?: number;
  version_id?: number;
  version_number?: number;
  version?: string;
  language?: string;
  filename?: string;
}

/** Sponsor passage that supports a piece of ICF text. */
export interface TracePassage {
  source: Pick<
    VersionSourceItem,
    | 'kind'
    | 'name'
    | 'filename'
    | 'doc_id'
    | 'version_id'
    | 'version_number'
    | 'language'
    | 'recorded'
  >;
  section: string;
  sentence: string;
  context: string;
}

export interface TraceEvidence {
  /** supported >= 60 % of the words in one passage, partial >= 30 % */
  level: 'supported' | 'partial' | 'none' | 'cross_language' | 'no_sponsor';
  score: number;
  /** numbers in the text that occur in none of the sponsor documents */
  missing_numbers: string[];
  passage?: TracePassage;
}

export type TraceKind =
  | 'template'
  | 'template_changed'
  | 'ai_fill'
  | 'gap'
  | 'other';

export interface TraceParagraph {
  idx: number;
  section: string;
  text: string;
  kind: TraceKind;
  template?: {
    score: number;
    mandatory: boolean;
    section: string;
    text?: string;
  };
  fills?: string[];
  evidence?: TraceEvidence;
  gaps?: string[];
}

export interface TraceAttention {
  type: 'mandatory_changed' | 'ai_unsupported' | 'gap';
  idx: number;
}

export interface VersionTrace {
  version_id: number;
  version_number: number;
  doc_title: string;
  language: Language | null;
  icf_type: IcfType | null;
  sources: VersionSourceItem[];
  template: {
    name: string | null;
    version: string | null;
    applicable: boolean;
  };
  stats: Partial<Record<TraceKind | `ai_${TraceEvidence['level']}`, number>>;
  attention: TraceAttention[];
  paragraphs: TraceParagraph[];
  sections: {
    title: string;
    first_idx: number;
    counts: Partial<Record<TraceKind, number>>;
  }[];
  elapsed_ms: number;
}

/** "Where does this selected text come from?" */
export interface Citation {
  selection: string;
  sources: VersionSourceItem[];
  ai_fill: boolean;
  template?: {
    source: VersionSourceItem;
    section: string;
    mandatory: boolean;
    score: number;
    text: string;
  };
  /** omitted for verbatim template wording that the AI did not write */
  sponsor?: TraceEvidence;
  previous?: {
    source: VersionSourceItem;
    found: boolean;
    score: number;
    text: string;
  };
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
  sources?: VersionSourceItem[];
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
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  versions: Version[];
}

export interface VersionDetail {
  version: Version;
  doc: Omit<ProjectDoc, 'versions'>;
  project: Project;
}

export type InterpreterPersona =
  | 'pi'
  | 'ethical_reviewer'
  | 'parent_guardian'
  | 'adult'
  | 'adolescent'
  | 'child';
export type InterpreterOperation =
  | 'explain'
  | 'simplify'
  | 'translate'
  | 'ask'
  | 'compare'
  | 'clarify';
export interface InterpreterReference {
  version_id: number;
  version_number: number;
  section_id: string;
  heading: string;
  anchor: string | null;
}
export interface InterpreterReply {
  explanation: string;
  source_references: InterpreterReference[];
  unanswered_questions: string[];
  requires_human_followup: boolean;
}
export interface InterpreterVersionContext {
  version_id: number;
  version_number: number;
  uploaded_at: string;
  source: VersionSource;
  note: string;
  sections: {
    section_id: string;
    heading: string;
    text: string;
    anchor: string | null;
  }[];
  comments: {
    author: string;
    text: string;
    anchor_text: string;
    status: CommentStatus;
    decision_note: string | null;
    parent_id: number | null;
  }[];
  content_available: boolean;
}
export interface InterpreterContext {
  icf: {
    id: number;
    project_id: number;
    title: string;
    icf_type: string | null;
    language: Language | null;
  };
  latest_version_id: number;
  selected_version_ids: number[];
  versions: InterpreterVersionContext[];
  version_diffs: {
    from_version_id: number;
    to_version_id: number;
    stats: Record<string, number>;
    blocks: DiffBlock[];
  }[];
  change_history: {
    source_version_id: number;
    result_version_id: number;
    instruction: string;
    created_by: string;
    created_at: string;
    edits: unknown[];
  }[];
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
  /** child / adolescent: add stock illustrations from the library */
  illustrations?: boolean;
}

/** Stock picture for children's / adolescent forms (built-in icon pool or uploaded). */
export interface Illustration {
  id: number;
  name: string;
  tags: string[];
  credit: string;
  builtin: boolean;
}

export interface IllustrateResult {
  version: Version | null;
  report: {
    placed: { section: string; id: number; name: string; score: number }[];
    sections: number;
    without_image: string[];
  };
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
  | 'illustrations'
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
  approved: boolean;
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

/** One proposed paragraph rewrite (chat or propagation). */
export interface EditProposal {
  idx: number;
  old: string;
  new: string;
  reason: string;
  section: string;
  /** Set when the old text matches mandatory (purple) national-template wording. */
  mandatory: { score: number; template_text: string } | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatReply {
  reply: string;
  edits: EditProposal[];
}

export interface ApplyResult {
  version: Version;
  change_id: number;
  skipped: { idx: number; why: string }[];
}

export interface PropagationTarget {
  doc: Omit<ProjectDoc, 'versions'>;
  version_id: number;
  version_number: number;
  status: 'proposed' | 'not_applicable' | 'error';
  reason: string;
  edits: EditProposal[];
}

export interface PendingChange {
  id: number;
  instruction: string;
  edit_count: number;
  result_version_id: number;
  created_by: string;
  created_at: string;
}

export interface PropagationResult {
  version_id: number;
  version?: Version;
  error?: string;
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
  participantPortal: (projectId: number) =>
    req<ParticipantPortalSettings>(`/projects/${projectId}/participant-portal`),
  saveParticipantPortal: (
    projectId: number,
    body: Omit<ParticipantPortalSettings, 'publications'>,
  ) =>
    req<{ ok: boolean }>(
      `/projects/${projectId}/participant-portal`,
      json('PUT', body),
    ),
  inviteParticipant: (projectId: number, email: string) =>
    req<{ email: string; token: string; expires_at: string }>(
      `/projects/${projectId}/participant-invitations`,
      json('POST', { email }),
    ),
  publishParticipantVersion: (docId: number, versionId: number) =>
    req<{ published: boolean; version_id: number }>(
      `/project-documents/${docId}/participant-publication`,
      json('PUT', { version_id: versionId }),
    ),
  unpublishParticipantVersion: (docId: number) =>
    req<{ published: boolean }>(
      `/project-documents/${docId}/participant-publication`,
      { method: 'DELETE' },
    ),
  acceptParticipantInvite: (
    token: string,
    b: { name: string; password: string; language: Language },
  ) =>
    req<{ token: string; user: User }>(
      `/participant/invitations/${encodeURIComponent(token)}/accept`,
      json('POST', b),
    ),
  participantTrials: () =>
    req<{ id: number; name: string; study: string }[]>('/participant/trials'),
  participantDocuments: (projectId: number) =>
    req<ParticipantDocument[]>(`/participant/trials/${projectId}/documents`),
  participantDocument: (projectId: number, docId: number) =>
    req<ParticipantDocumentContent>(
      `/participant/trials/${projectId}/documents/${docId}`,
    ),
  participantAsk: (projectId: number, b: ParticipantAskBody) =>
    req<ParticipantReply>(
      `/participant/trials/${projectId}/ask`,
      json('POST', b),
    ),
  participantInvitations: (projectId: number) =>
    req<ParticipantInvitation[]>(
      `/projects/${projectId}/participant-invitations`,
    ),
  portalPreviewDocuments: (
    projectId: number,
    persona: ParticipantPersona,
    lang: Language,
  ) =>
    req<PortalPreview>(
      `/projects/${projectId}/portal-preview/documents?persona=${persona}&lang=${lang}`,
    ),
  portalPreviewDocument: (
    projectId: number,
    docId: number,
    persona: ParticipantPersona,
    lang: Language,
  ) =>
    req<ParticipantDocumentContent>(
      `/projects/${projectId}/portal-preview/documents/${docId}?persona=${persona}&lang=${lang}`,
    ),
  portalPreviewAsk: (projectId: number, b: ParticipantAskBody) =>
    req<ParticipantReply>(
      `/projects/${projectId}/portal-preview/ask`,
      json('POST', b),
    ),

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

  // study profile (project facts + global defaults)
  getGlobalFacts: () => req<GlobalFacts>('/global-facts'),
  putGlobalFacts: (values: Record<string, string | null>) =>
    req<GlobalFacts>('/global-facts', json('PUT', { values })),
  stubGlobalFacts: () =>
    req<GlobalFacts>('/global-facts/stub', { method: 'POST' }),
  getProjectFacts: (pid: number) => req<ProjectFacts>(`/projects/${pid}/facts`),
  putProjectFacts: (
    pid: number,
    values: Record<string, string | null>,
    source: 'manual' | 'inferred' = 'manual',
  ) =>
    req<ProjectFacts>(
      `/projects/${pid}/facts`,
      json('PUT', { values, source }),
    ),
  inferProjectFacts: (pid: number) =>
    req<{ suggestions: FactSuggestion[] }>(`/projects/${pid}/facts/infer`, {
      method: 'POST',
    }),

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
  projectExportUrl: (pid: number, lang?: Language) =>
    withToken(`/api/projects/${pid}/export${lang ? `?lang=${lang}` : ''}`),
  versionFileUrl: (vid: number) => withToken(`/api/versions/${vid}/file`),
  getVersionHtml: (vid: number) => req<VersionHtml>(`/versions/${vid}/html`),
  getVersionTrace: (vid: number) => req<VersionTrace>(`/versions/${vid}/trace`),

  // illustrations for children's forms
  listIllustrations: () => req<Illustration[]>('/illustrations'),
  illustrationTopics: () => req<string[]>('/illustrations/topics'),
  illustrationFileUrl: (id: number) =>
    withToken(`/api/illustrations/${id}/file`),
  uploadIllustration: (
    file: File,
    meta: { name: string; tags: string[]; credit: string },
  ) =>
    req<Illustration>('/illustrations', {
      method: 'POST',
      body: form(file, {
        name: meta.name,
        tags: meta.tags.join(','),
        credit: meta.credit,
      }),
    }),
  deleteIllustration: (id: number) =>
    req<void>(`/illustrations/${id}`, { method: 'DELETE' }),
  illustrateVersion: (vid: number, maxImages = 8) =>
    req<IllustrateResult>(
      `/versions/${vid}/illustrate`,
      json('POST', { max_images: maxImages }),
    ),
  cite: (vid: number, text: string) =>
    req<Citation>(`/versions/${vid}/cite`, json('POST', { text })),

  // read-only ICF Interpreter
  interpreterContext: (icfId: number, versionId?: number) =>
    req<InterpreterContext>(
      `/interpreter/context/${icfId}${versionId ? `?version_id=${versionId}` : ''}`,
    ),
  interpret: (
    operation: InterpreterOperation,
    body: {
      icf_id: number;
      version_id?: number;
      compare_version_id?: number;
      persona: InterpreterPersona;
      age_group?: '8-11' | '12-17' | 'adult';
      language: Language;
      question?: string;
      text?: string;
      term?: string;
      source_language?: Language;
      history?: { role: 'user' | 'assistant'; text: string }[];
    },
  ) => req<InterpreterReply>(`/interpreter/${operation}`, json('POST', body)),

  // comments
  listComments: (vid: number, lang?: Lang) =>
    req<ReviewComment[]>(
      `/versions/${vid}/comments${lang ? `?lang=${lang}` : ''}`,
    ),
  addComment: (vid: number, text: string, anchor_text: string) =>
    req<ReviewComment>(
      `/versions/${vid}/comments`,
      json('POST', { text, anchor_text }),
    ),
  decideComment: (id: number, status: CommentStatus, note?: string) =>
    req<ReviewComment>(
      `/comments/${id}/decision`,
      json('POST', { status, note }),
    ),

  commentBatch: (
    vid: number,
    b: {
      decisions: { comment_id: number; status: CommentStatus; note?: string }[];
      replacements: { comment_id: number; text: string }[];
      note?: string;
    },
  ) =>
    req<{
      version: Version | null;
      decided: number;
      skipped: { comment_id: number; why: string }[];
    }>(`/versions/${vid}/comments/batch`, json('POST', b)),

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
    b: {
      target_languages: ('nl' | 'fr')[];
      version_id?: number;
      force?: boolean;
    },
  ) =>
    req<{ task_id: string }>(
      `/project-documents/${docId}/translate`,
      json('POST', b),
    ),
  updateToTemplate: (docId: number, b: { version_id?: number } = {}) =>
    req<{ task_id: string }>(
      `/project-documents/${docId}/update-template`,
      json('POST', b),
    ),
  task: (id: string) => req<Task>(`/tasks/${id}`),
  approveDoc: (docId: number) =>
    req<ProjectDoc>(`/project-documents/${docId}/approve`, { method: 'POST' }),
  unapproveDoc: (docId: number) =>
    req<ProjectDoc>(`/project-documents/${docId}/approve`, {
      method: 'DELETE',
    }),
  progress: (projectId: number) =>
    req<ProjectProgress>(`/projects/${projectId}/progress`),
  adminReset: (importSamples: boolean, generatedOnly = false) =>
    req<{
      reset: boolean;
      local_files_removed: number;
      seed: SeedResult | null;
    }>(
      `/admin/reset?import_samples=${importSamples}&generated_only=${generatedOnly}`,
      {
        method: 'POST',
      },
    ),
  adminStatus: () => req<AdminStatus>('/admin/status'),
  aiStatus: () => req<AiStatus>('/ai/status'),

  // chat-with-the-form editing + propagation
  chat: (
    vid: number,
    b: { message: string; history: ChatMessage[]; comment_id?: number },
  ) => req<ChatReply>(`/versions/${vid}/chat`, json('POST', b)),
  applyEdits: (
    vid: number,
    b: {
      edits: Pick<EditProposal, 'idx' | 'old' | 'new' | 'reason'>[];
      instruction: string;
      comment_id?: number;
    },
  ) => req<ApplyResult>(`/versions/${vid}/apply`, json('POST', b)),
  propagatePreview: (changeId: number) =>
    req<PropagationTarget[]>(`/changes/${changeId}/propagate/preview`, {
      method: 'POST',
    }),
  propagateApply: (
    changeId: number,
    targets: { version_id: number; edits: EditProposal[] }[],
  ) =>
    req<PropagationResult[]>(
      `/changes/${changeId}/propagate/apply`,
      json('POST', { targets }),
    ),
  propagatePreviewBatch: (changeIds: number[]) =>
    req<PropagationTarget[]>(
      '/changes/propagate/preview',
      json('POST', { change_ids: changeIds }),
    ),
  propagateApplyBatch: (
    changeIds: number[],
    targets: { version_id: number; edits: EditProposal[] }[],
  ) =>
    req<PropagationResult[]>(
      '/changes/propagate/apply',
      json('POST', { change_ids: changeIds, targets }),
    ),
  pendingChanges: (vid: number) =>
    req<PendingChange[]>(`/versions/${vid}/changes`),
  dismissChange: (changeId: number) =>
    req<{ ok: boolean }>(`/changes/${changeId}/dismiss`, { method: 'POST' }),
  ecResponseUrl: (vid: number, lang?: Lang) =>
    withToken(
      `/api/versions/${vid}/ec-response/file${lang ? `?lang=${lang}` : ''}`,
    ),

  // v1 placeholders (no longer linked from the UI)
  jobCreation: (b: CreationJob) => job('/jobs/creation', b),
  jobTranslation: (b: TranslationJob) => job('/jobs/translation', b),
  jobUpdate: (b: UpdateJob) => job('/jobs/update', b),
};
