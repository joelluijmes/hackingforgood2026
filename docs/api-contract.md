# ICF Studio – API contract (v2: projects, versions, comments, diff, generate, auth)

All routes are prefixed `/api`, JSON unless noted. Backend FastAPI + SQLite (stdlib sqlite3), files in object storage (see Storage).
Frontend client mirroring this file: `frontend/src/api.ts` (single source of types; keep in sync).

## Auth (minimal)
- `POST /api/auth/register` `{email, name, password, language: "en"|"nl"|"fr"}` -> `{token, user}`
- `POST /api/auth/login` `{email, password}` -> `{token, user}`; 401 on bad credentials
- `GET /api/auth/me` -> `User`; `PATCH /api/auth/me` `{name?, language?}` -> `User`
- `User = {id, email, name, language}`
- Opaque random session token stored in SQLite `sessions` table; passwords hashed with `hashlib.scrypt` (stdlib). Sent as `Authorization: Bearer <token>`.
- Every `/api` route requires auth (401 `{detail}`) EXCEPT `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`.
- File download routes (`.../file`) also accept `?token=<token>` (browser links/iframes cannot set headers).
- On startup seed demo user `demo@bspho.be` / `demo1234` ("Demo Researcher", language "en") if no users exist.

## Template library (existing, now authed)
- `Document = {id, kind:"template"|"sponsor", name, filename, language, audience, version, released, study, size, uploaded_at, preview:"docx"|"pdf"|"none"}`
- `GET /api/documents?kind=template` · `POST /api/documents` (multipart: file, kind, name?, language?, audience?, version?, study?) · `GET/DELETE /api/documents/{id}` · `GET /api/documents/{id}/file` · `GET /api/documents/{id}/html` -> `DocHtml`
- `DocHtml = {html, headings:[{level,text,anchor}], stats:{paragraphs,words,tables,colors:{purple,red,blue,black}}}` (colour classes `c-purple|c-red|c-blue` as before)
- `POST /api/seed/bucket` -> `SeedResult = {imported, skipped, converted, failed:[{name, reason}], items:[{name, kind:"template"|"project_doc"}]}`: reads `data/bucket.zip` in memory. Templates (`National Templates/*.docx`) go to the library with `name` = `"Belgian model ICF - adult patients, interventional trial"` for every language/version; `version` is a short label parsed from the filename (`version2_2_20250718` -> `"2.2"`, `version3_20250130` -> `"3.0"`) and `released` the ISO date (`"2025-07-18"`). Sponsor originals (`*/Sponsor Originals/**`, .docx/.doc/.rtf) become real study **projects**, one per consent package (stage `intake`): `FORUM2 - Main protocol`, `FORUM2 - R1 (8 vs 12 Gy)`, `FORUM2 - R2`, `FORUM2 - S1`, `FORUM2 - P1`, `BIOMEDE 2.0`, `HEM-iSMART - sub-study D`, `MyKids` (`study` = FORUM2 / BIOMEDE 2.0 / HEM-iSMART / MyKids; description names the sponsor and the audiences found). Each file is a ProjectDoc (role `sponsor`, guessed icf_type/language, human title such as "Adult consent form", "Adolescent consent form (12-17)", Biomede prefixed "Biopsy - " / "Treatment - ") with version 1. Tracked-changes `TC` files are skipped when a `Clean` sibling exists. .rtf/.doc originals are converted to .docx (`converted` counts them; a failure goes to `failed` and never aborts the import). Idempotent (existing project by name, existing doc by filename).
- `GET /api/admin/status` -> `{ai: AiStatus, storage:{backend:"local"|"gcs", bucket:string|null}, converters:{pandoc:boolean, libreoffice:boolean}, counts:{projects, project_docs, templates, users}}` (auth required).
- Uploads (`POST /api/documents`, `POST /api/projects/{id}/documents`, `POST /api/project-documents/{id}/versions`) accept `.docx .doc .rtf .pdf`. `.rtf` (pandoc, LibreOffice fallback) and `.doc` (LibreOffice) are converted to `.docx` and stored as `<stem>.docx`; the version note defaults to "Converted from RTF"/"Converted from DOC". Conversion failure -> 422. `POST /api/documents` also takes optional form field `released` (YYYY-MM-DD).

## Projects
- `Stage = "intake"|"drafting"|"pi_review"|"translation"|"ethics_review"|"approved"`
- `Project = {id, name, study, description, stage, created_at, created_by_name, doc_count, open_comments}`
- `GET /api/projects` (newest first) · `POST /api/projects` `{name, study?, description?}` -> Project (201)
- `GET /api/projects/{id}` · `PATCH /api/projects/{id}` `{name?, study?, description?, stage?}` · `DELETE /api/projects/{id}` -> 204 (removes docs, versions, comments, files)

## Project documents and versions
- `Role = "sponsor"|"icf"|"other"`; `IcfType = "adult"|"parent"|"adolescent"|"child"`
- `Version = {id, doc_id, number, filename, size, note, source:"upload"|"generated"|"reviewed", uploaded_by, uploaded_at, preview:"docx"|"pdf"|"none", comments_total, comments_open, comments_approved, comments_declined}` (number = 1,2,3… per doc)
- `ProjectDoc = {id, project_id, title, role, icf_type, language, created_at, versions: Version[]}` (versions newest first)
- `GET /api/projects/{id}/documents` -> ProjectDoc[] (oldest doc first)
- `POST /api/projects/{id}/documents` multipart `file, title?, role, icf_type?, language?, note?` -> ProjectDoc (creates doc + version 1, source `upload`)
- `DELETE /api/project-documents/{doc_id}` -> 204
- `POST /api/project-documents/{doc_id}/versions` multipart `file, note?, source?` (`upload` default or `reviewed`) -> Version. For .docx the backend extracts Word comments immediately (stores them, detects each comment's language).
- `GET /api/versions/{vid}` -> `VersionDetail = {version: Version, doc: ProjectDoc (without versions), project: Project}`
- `GET /api/versions/{vid}/file` -> original bytes (attachment; doubles as the export/download)
- `GET /api/versions/{vid}/html` -> `VersionHtml = DocHtml & {comment_ids: string[]}` (docx only, else 422). Rendered HTML contains:
  - commented ranges wrapped as `<span class="cmt" data-cid="<ext_id>">…</span>` (nested/multiple ids: space-separated in `data-cid`)
  - tracked changes as `<ins class="tc-ins" data-author=… data-date=…>` and `<del class="tc-del" …>`
  - same colour classes and headings/anchors as templates
  All text HTML-escaped.

## Comments (Word comments from reviewed documents)
- `Comment = {id, version_id, ext_id, author, initials, date, text, anchor_text, language: Lang|null, translated_text: string|null, translated_to: Lang|null, parent_id: number|null, status: "open"|"approved"|"declined", decided_by: string|null, decided_at: string|null, decision_note: string|null}`; `Lang = "en"|"nl"|"fr"`
- `GET /api/versions/{vid}/comments?lang=<Lang>` -> Comment[] in document order (replies follow parents; `parent_id` links replies). `lang` defaults to the caller's language. If a comment's language differs from `lang` and AI is available, `translated_text` holds the translation (cached in SQLite table `comment_translations`) and `translated_to` = lang; otherwise both null.
- `POST /api/comments/{id}/decision` `{status:"open"|"approved"|"declined", note?}` -> Comment (records user + timestamp)

## Diff (new reviewed version vs previous)
- `GET /api/diff?from=<vid>&to=<vid>` ->
  `{from: Version, to: Version, stats:{inserted,deleted,changed,unchanged,tracked_changes}, blocks: DiffBlock[], comments:{added: Comment[], removed: Comment[]}}`
- `DiffBlock = {kind:"equal"|"insert"|"delete"|"replace", old: string|null, new: string|null, words: {op:"eq"|"ins"|"del", text}[] | null}` (paragraph-level; `words` only for `replace`; Word tracked changes count as accepted for `new`). Long runs of `equal` blocks are still returned (frontend collapses them).
- comments.added = comments present in `to` but not `from` (match on author + normalized text); removed = the reverse. Translated into the caller's language like above.

## Generate (create ICF draft in template format)
- `POST /api/projects/{id}/generate` JSON `{template_id, icf_type, language, sponsor_version_ids: number[], notes: string, title?}` ->
  `{doc: ProjectDoc, report: GenerateReport}`; new ProjectDoc role `icf` with version 1 source `generated`.
- `GenerateReport = {placeholders_total, filled, flagged, removed_guidance_paragraphs, ai_used: boolean}`
- Behaviour: copy the template docx; remove red guidance paragraphs (colour FF0000); keep purple mandatory text; for blue placeholders (0000FF) try to fill from sponsor text + notes with Vertex AI (when enabled) and otherwise highlight yellow; every placeholder that could not be filled and every edit to mandatory text gets a Word comment by "ICF Studio" explaining the gap, so a reviewer sees what is missing.

## AI
- `GET /api/ai/status` -> `{enabled: boolean, provider: "vertex"|"none", model: string|null, project: string|null}`
- Vertex AI Gemini via `google-genai` (`genai.Client(vertexai=True, project=…, location=…)`), project from env `GOOGLE_CLOUD_PROJECT` or `gcloud config get-value project`, location env `GOOGLE_CLOUD_LOCATION` default `europe-west4`, model env `VERTEX_MODEL` default `gemini-2.5-flash`. If unavailable the app must still work (heuristic language detection by stopwords en/nl/fr, no translation, placeholders just highlighted).

## Placeholders from v1 (keep working)
`POST /api/jobs/{creation|translation|update}` still return 501 (frontend no longer links to them).

## Storage
- `backend/app/storage.py`: `put(key, data, content_type)`, `put_file(key, path)`, `get(key)`, `delete(key)`, `local_path(key)` (context manager yielding a real file path; GCS objects are cached in a temp dir keyed by object generation+md5).
- Env: `STORAGE_BACKEND=local` (default, `backend/storage/`) or `gcs` (`GCS_BUCKET` required, ADC auth); `ICF_DB_PATH` selects the SQLite file.
- Keys (stored in `documents.stored_name` / `versions.stored_name`): `templates/<uuid>.<ext>`, `projects/<project_id>/<doc_id>/v<number>-<uuid>.<ext>`. `checksum_sha256` column holds the SHA-256 of the bytes. A key without `/` is a legacy local filename and is always read from `backend/storage/`.
- API behaviour is unchanged; file routes return the bytes with `Content-Disposition: attachment`, a missing object gives 404 `File missing from storage`.

## Frontend routes
`/login` · `/` projects · `/projects/:id` · `/templates` · `/templates/:id` (template colour viewer) · `/versions/:vid` (document + comments review) · `/diff?from=<vid>&to=<vid>`
