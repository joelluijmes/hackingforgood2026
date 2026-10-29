export type Kind = 'sponsor' | 'template';
export type Language = 'en' | 'nl' | 'fr';
export type Audience = 'adult' | 'parent' | 'adolescent' | 'child';

export interface Document {
  id: number;
  kind: Kind;
  name: string;
  filename: string;
  language: Language | null;
  audience: Audience | null;
  version: string | null;
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

export interface SeedResult {
  imported: number;
  skipped: number;
  items: { name: string; kind: Kind }[];
}

export interface UploadMeta {
  kind: Kind;
  name?: string;
  language?: Language | '';
  audience?: Audience | '';
  version?: string;
  study?: string;
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw new Error(await errorMessage(res));
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
  const res = await fetch(`/api${path}`, json('POST', body));
  if (res.ok || res.status === 501) return (await res.json()) as JobResponse;
  throw new Error(await errorMessage(res));
}

export const api = {
  health: () => req<{ status: string }>('/health'),
  listDocuments: (kind?: Kind) =>
    req<Document[]>(`/documents${kind ? `?kind=${kind}` : ''}`),
  getDocument: (id: number) => req<Document>(`/documents/${id}`),
  deleteDocument: (id: number) =>
    req<void>(`/documents/${id}`, { method: 'DELETE' }),
  fileUrl: (id: number) => `/api/documents/${id}/file`,
  getHtml: (id: number) => req<DocHtml>(`/documents/${id}/html`),
  upload: (file: File, meta: UploadMeta) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', meta.kind);
    for (const k of [
      'name',
      'language',
      'audience',
      'version',
      'study',
    ] as const) {
      const v = meta[k];
      if (v) fd.append(k, v);
    }
    return req<Document>('/documents', { method: 'POST', body: fd });
  },
  seed: () => req<SeedResult>('/seed/bucket', { method: 'POST' }),
  jobCreation: (b: CreationJob) => job('/jobs/creation', b),
  jobTranslation: (b: TranslationJob) => job('/jobs/translation', b),
  jobUpdate: (b: UpdateJob) => job('/jobs/update', b),
};

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
