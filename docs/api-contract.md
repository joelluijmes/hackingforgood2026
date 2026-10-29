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
- `POST /api/admin/reset?import_samples=false|true&generated_only=false|true` (auth required). With `generated_only=true` only app-generated versions (source generated/edited/propagated) with their comments and changes are removed, ICF docs left without versions are deleted, projects without ICF docs fall back to the drafting (or intake) stage; projects, sponsor docs, uploads, reviewed copies and the template library stay. Otherwise: -> `{reset:true, local_files_removed:number, seed:SeedResult|null}`. Deletes all rows of projects, project_docs, versions, comments, comment_translations, changes, documents (template library) and resets their id counters; clears in-memory tasks; with `STORAGE_BACKEND=local` empties `backend/storage/` (never deletes from GCS, blobs there become orphaned); keeps demo user `demo@bspho.be`, the caller and the caller's session (other sessions/users deleted); re-runs `db.init()`. With `import_samples=true` then runs the bucket sample import (= the state right after the first `POST /api/seed/bucket`). 409 if a generate/translate task is running or another reset is in progress.
- `GET /api/admin/status` -> `{ai: AiStatus, storage:{backend:"local"|"gcs", bucket:string|null}, converters:{pandoc:boolean, libreoffice:boolean}, counts:{projects, project_docs, templates, users}}` (auth required).
- Uploads (`POST /api/documents`, `POST /api/projects/{id}/documents`, `POST /api/project-documents/{id}/versions`) accept `.docx .doc .rtf .pdf`. `.rtf` (pandoc, LibreOffice fallback) and `.doc` (LibreOffice) are converted to `.docx` and stored as `<stem>.docx`; the version note defaults to "Converted from RTF"/"Converted from DOC". Conversion failure -> 422. `POST /api/documents` also takes optional form field `released` (YYYY-MM-DD).

## Projects
- `Stage = "intake"|"drafting"|"pi_review"|"ethics_review"|"approved"|"participants"`
- `Project = {id, name, study, description, stage, created_at, created_by_name, doc_count, open_comments}`
- `GET /api/projects` (newest first) · `POST /api/projects` `{name, study?, description?}` -> Project (201)
- `GET /api/projects/{id}` · `PATCH /api/projects/{id}` `{name?, study?, description?, stage?}` · `DELETE /api/projects/{id}` -> 204 (removes docs, versions, comments, files)

## Project documents and versions
- `Role = "sponsor"|"icf"|"other"`; `IcfType = "adult"|"parent"|"adolescent"|"child"`
- `Version = {id, doc_id, number, filename, size, note, source:"upload"|"generated"|"reviewed", uploaded_by, uploaded_at, preview:"docx"|"pdf"|"none", comments_total, comments_open, comments_approved, comments_declined}` (number = 1,2,3… per doc)
- `ProjectDoc = {id, project_id, title, role, icf_type, language, created_at, source_doc_id, approved: boolean, approved_by: string|null, approved_at: string|null, versions: Version[]}` (versions newest first; `approved` = approved "as is" and the approved version is still the latest, so uploading a new version resets it)
- `GET /api/projects/{id}/documents` -> ProjectDoc[] (oldest doc first)
- `POST /api/projects/{id}/documents` multipart `file, title?, role, icf_type?, language?, note?` -> ProjectDoc (creates doc + version 1, source `upload`)
- `DELETE /api/project-documents/{doc_id}` -> 204
- `POST /api/project-documents/{doc_id}/versions` multipart `file, note?, source?` (`upload` default or `reviewed`) -> Version. For .docx the backend extracts Word comments immediately (stores them, detects each comment's language).
- `GET /api/versions/{vid}` -> `VersionDetail = {version: Version, doc: ProjectDoc (without versions), project: Project}`
- `GET /api/versions/{vid}/file` -> original bytes (attachment; doubles as the export/download)
- `GET /api/versions/{vid}/html` -> `VersionHtml = DocHtml & {comment_ids: string[]}` (docx only, else 422). Rendered HTML contains:
  - commented ranges wrapped as `<span class="cmt" data-cid="<ext_id>">…</span>` (nested/multiple ids: space-separated in `data-cid`)
  - tracked changes as `<ins class="tc-ins" data-author=… data-date=…>` and `<del class="tc-del" …>`
  - passages the generator filled from sponsor documents (bookmark `icf_fill_N`, no Word comment) as `<mark class="fill">…</mark>`; `fill_count` = number of them. Generated drafts only carry Word comments (author "ICF Studio") for real gaps (`Missing: … - please add this information`); routine fills are never commented, so `comments_open` counts only real comments.
  - same colour classes and headings/anchors as templates
  All text HTML-escaped.

## Comments (Word comments from reviewed documents)
- `Comment = {id, version_id, ext_id, author, initials, date, text, anchor_text, language: Lang|null, translated_text: string|null, translated_to: Lang|null, parent_id: number|null, status: "open"|"approved"|"declined", decided_by: string|null, decided_at: string|null, decision_note: string|null}`; `Lang = "en"|"nl"|"fr"`
- `GET /api/versions/{vid}/comments?lang=<Lang>` -> Comment[] in document order (replies follow parents; `parent_id` links replies). `lang` defaults to the caller's language. If a comment's language differs from `lang` and AI is available, `translated_text` holds the translation (cached in SQLite table `comment_translations`) and `translated_to` = lang; otherwise both null.
- `POST /api/versions/{vid}/comments` `{text, anchor_text}` -> Comment (user comment, author = caller, status open). The backend finds `anchor_text` in one paragraph of the stored .docx, wraps it in a Word comment range authored by the user (so it survives export), rewrites the stored file in place and stores the comment row. 422 when the text cannot be located / not a docx.
- `POST /api/comments/{id}/decision` `{status:"open"|"approved"|"declined", note?}` -> Comment (records user + timestamp)
- `POST /api/versions/{vid}/comments/batch` `{decisions: [{comment_id, status, note?}], replacements: [{comment_id, text}], note?}` -> `{version: Version|null, decided: number, skipped: [{comment_id, why}]}`. Staged review changes in ONE request: decisions are written in place; each replacement swaps the comment's anchored (placeholder) text for `text` as a tracked change and all replacements produce ONE new version (source `edited`, `version` = it, else null); replaced comments are marked approved ("Text provided") and carry over. Optional `note` (review summary) is appended to the new version's note. Frontend stages decisions/texts locally and sends them from the "Finish review" popover (Save changes / Approve document = then `POST /project-documents/{id}/approve` / Request changes).

## ICF Interpreter (read-only)
- Authenticated routes live under `/api/interpreter`; they interpret an existing project document with `role="icf"` and never mutate documents, comments, templates, or project state.
- Personas: `pi|ethical_reviewer|parent_guardian|adult|adolescent|child`; age groups: `8-11|12-17|adult`; response languages: `en|nl|fr`.
- `GET /api/interpreter/context/{icf_id}?version_id=<id>` returns document metadata, the complete version history, readable DOCX sections, review comments and decisions, tracked-edit history, adjacent-version diffs, and the default latest version. A selected version ID must belong to this ICF.
- `POST /api/interpreter/{explain|simplify|translate|ask|compare|clarify}` accepts `{icf_id, section_id?, version_id?, compare_version_id?, persona, age_group?, language, question?, text?, term?, source_language?, history?:[{role,text}]}`. Latest is used if `version_id` is omitted. For `compare`, `version_id` is the newer/to version and `compare_version_id` is the older/from version; when the latter is omitted the immediately previous version is used. History is limited to 12 chat messages and provides dialogue continuity, not evidence.
- Responses are `{explanation, source_references:[{version_id, version_number, section_id, heading, anchor}], unanswered_questions:string[], requires_human_followup:boolean}`. References identify the supporting version and section; citations in the UI navigate to the matching document heading when one exists. Historical questions can use the full history even when latest is the default; returned references identify the actual cited versions.
- The Interpreter uses Vertex AI and returns 503 when it is unavailable. It returns 502 if it cannot produce a structured grounded response. It treats document content as data, preserves risks and rights, and flags answers without source references or with unanswered questions for human follow-up.

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

## Edit with AI, propagation, EC response (review/edit for the PI)
- Paragraph index `idx` = position of the `w:p` in `body.iter(w:p)` of that version's docx (tables included); stable for one file.
- `GET /api/versions/{vid}/paragraphs` -> `[{idx, text, section, heading}]` (non-empty paragraphs)
- `POST /api/versions/{vid}/chat` `{message, history: [{role:"user"|"assistant", text}], comment_id?}` -> `{reply, edits: EditProposal[]}`; 503 when Vertex is unavailable, 502 on an unusable answer.
  `EditProposal = {idx, old, new, reason, section, mandatory: {score, template_text} | null}`. `mandatory` is set (adult/parent forms only) when `old` matches a mostly-purple paragraph of the newest national template in the library for the doc's language (ratio >= 0.75): the PI must justify that deviation.
- `POST /api/versions/{vid}/apply` `{edits: [{idx, old, new, reason?}], instruction, comment_id?}` -> `{version: Version, change_id, skipped: [{idx, why}]}`. Writes a new version (source `edited`) whose edits are Word tracked changes (`w:ins`/`w:del`, author = user name, run formatting kept). Comment decisions + translations carry over to the new version; `comment_id` marks that comment approved ("Addressed in vN") in both versions. Records a `change`.
- `GET /api/changes/{id}` -> change `{id, project_id, doc_id, source_version_id, result_version_id, instruction, icf_type, language, edits, created_by, created_at}`
- `POST /api/changes/{id}/propagate/preview` -> `[{doc, version_id, version_number, status: "proposed"|"not_applicable"|"error", reason, edits: EditProposal[]}]` for every other `icf` doc in the project (latest .docx version). Gemini adapts the change per audience/language (parents: "your child"; 12-17 / 8-11 simpler or not applicable; NL/FR keep official template wording). Parallel, ~30 s for 11 forms.
- `POST /api/changes/{id}/propagate/apply` `{targets: [{version_id, edits}]}` -> `[{version_id, version?: Version, error?}]` (new versions, source `propagated`).
- Batch propagation (one preview + one apply for several applied edits of the same form): `POST /api/changes/propagate/preview` `{change_ids: number[]}` -> same shape as the single preview, one AI call per target form with all edits combined. `POST /api/changes/propagate/apply` `{change_ids, targets: [{version_id, edits}]}` -> same as single apply (one new `propagated` version per target). Applying (single or batch) sets `changes.propagated_at`.
- `GET /api/versions/{vid}/changes` -> not-yet-propagated changes of that form (any version), oldest first: `[{id, instruction, edit_count, result_version_id, created_by, created_at}]`. `POST /api/changes/{id}/dismiss` marks one as propagated/skipped -> `{ok: true}`.
- `GET /api/versions/{vid}/ec-response/file?lang=` -> .docx table: EC comment (original), translation, decision, response note. Accepts `?token=` like other `/file` routes.
- `Version.source` adds `"edited" | "propagated"`.
- Seed: `POST /api/seed/bucket` also creates project "Forum R1 – EC review (demo)" (stage ethics_review) with the 12 approved Forum R1 ICFs; the EN adult form gets a v2 (source `reviewed`) with four mock EC comments in Dutch and French.
- Vertex on Windows: `ai._gcloud` resolves `gcloud.cmd` and sets `CLOUDSDK_PYTHON` to the backend interpreter when unset (gcloud needs Python >= 3.10).

## Placeholders from v1 (keep working)
`POST /api/jobs/{creation|translation|update}` still return 501 (frontend no longer links to them).

## Storage
- `backend/app/storage.py`: `put(key, data, content_type)`, `put_file(key, path)`, `get(key)`, `delete(key)`, `local_path(key)` (context manager yielding a real file path; GCS objects are cached in a temp dir keyed by object generation+md5).
- Env: `STORAGE_BACKEND=local` (default, `backend/storage/`) or `gcs` (`GCS_BUCKET` required, ADC auth); `ICF_DB_PATH` selects the SQLite file.
- Keys (stored in `documents.stored_name` / `versions.stored_name`): `templates/<uuid>.<ext>`, `projects/<project_id>/<doc_id>/v<number>-<uuid>.<ext>`. `checksum_sha256` column holds the SHA-256 of the bytes. A key without `/` is a legacy local filename and is always read from `backend/storage/`.
- API behaviour is unchanged; file routes return the bytes with `Content-Disposition: attachment`, a missing object gives 404 `File missing from storage`.

## Frontend routes
`/login` · `/` projects · `/projects/:id` (with ICF set matrix: 4 audiences × EN/NL/FR) · `/templates` · `/templates/:id` (template colour viewer) · `/versions/:vid` (document + comments review + "Edit with AI" tab, propagation dialog after apply) · `/diff?from=<vid>&to=<vid>`

---

# v3 additions: project progress gates, language matrix, background tasks, translation

## ProjectDoc
- `ProjectDoc` gains `source_doc_id: number | null` (a translation points at the English ICF doc it was made from).

## Background tasks (generate and translate are slow: they return immediately)
- `POST /api/projects/{id}/generate` JSON `{icf_type, language, sponsor_version_ids, notes, title?, template_id?}` -> **202** `{task_id}`.
  - `template_id` is optional. Default = the latest template (by released date, then version) whose language == `language` (audience adult). If `template_id` is given and its language != `language` -> 422 `{detail:"template_language_mismatch"}`. No template for that language -> 422 `{detail:"no_template_for_language"}`.
  - The AI must write the filled placeholder text in `language` (sponsor documents may be in another language).
- `POST /api/project-documents/{doc_id}/translate` JSON `{target_languages: ("nl"|"fr")[], version_id?: number}` -> **202** `{task_id}`. Source = given version (default: latest version of the doc). For each target language: pick the latest template of that language, call generate with `sponsor_text` = text of the source version and notes instructing to fill the placeholders by translating the source content into the target language (mandatory template text stays as the template has it = "mixed translation"). Result per language: if a doc with `source_doc_id == doc_id` and that language exists, add a NEW VERSION to it (source `generated`, note `Translated from EN v<n>`), else create a new ProjectDoc (role icf, same icf_type, language = target, title = source title with the language suffix replaced, e.g. `ICF adult (NL)`, `source_doc_id` = doc_id).
- `GET /api/tasks/{task_id}` -> `Task`
  - `Task = {id: string, kind: "generate"|"translate", status: "running"|"done"|"failed", step: "queued"|"reading"|"filling"|"comments"|"saving"|"done", done: number, total: number, progress: number /*0..1 overall*/, language: Lang|null /*language currently being produced, for translate*/, elapsed_s: number, result: {docs: ProjectDoc[], reports: GenerateReport[]} | null, error: string | null}`
  - `step`/`done`/`total` describe the current step (e.g. step `filling`, done 12, total 40). `progress` weights: reading 0-0.05, filling 0.05-0.90, comments 0.90-0.97, saving 0.97-1; for translate with several languages the range is split evenly per language.
  - Tasks live in memory (dict + lock); unknown id -> 404. The work runs in a background thread; failures set `status:"failed"` and `error`.
- `engine.generate.generate_icf(...)` gets an optional `progress: Callable[[str, int, int], None] | None = None` called as `progress(step, done, total)`.

## Project progress, stage gates and the language matrix
- `GET /api/projects/{id}/progress` -> `ProjectProgress`
  `{stage: Stage, next_stage: Stage|null, stages: StageProgress[], matrix: MatrixRow[]}`
  - `StageProgress = {key: Stage, state: "done"|"current"|"todo", can_leave: boolean, requirements: Requirement[]}` (requirements = what must be true to LEAVE this stage to the next one; `can_leave` = all blocking requirements met; for `approved` and `participants` requirements = [] and can_leave true)
  - `Requirement = {key: string, met: boolean, blocking: boolean, detail: string|null}`; keys (frontend translates them): `has_sponsor_docs` (intake, blocking), `has_en_draft` (drafting, blocking), `draft_types_missing` (drafting, non-blocking, detail = comma separated icf types that have a sponsor document but no EN draft), `has_reviewed_version` (pi_review, blocking: EVERY EN ICF doc has a version with source `reviewed` OR is approved as is), `comments_decided` (pi_review, blocking: no open comments on the latest version of any non-approved EN ICF doc; detail = number of open), `translations_complete` (pi_review, blocking, skippable: every EN ICF doc has an NL and an FR translation doc; detail = missing like `adult:fr`), `ethics_reviewed` (ethics_review, blocking: there are translated docs, EVERY one has a reviewed version or is approved as is, and no open comments on their latest versions; detail = number of open comments).
  - `state`: stages before the current stage = `done`, the current = `current`, others `todo`.
  - `MatrixRow = {icf_type: IcfType, languages: {en: MatrixCell|null, nl: MatrixCell|null, fr: MatrixCell|null}}`; `MatrixCell = {doc_id, version_id, version_number, source: VersionSource, comments_open: number, approved: boolean}` (latest version of the doc of that type+language; NL/FR cells come from docs with `source_doc_id` or matching icf_type+language). Rows = icf types present among the project's sponsor docs and ICF docs; if none, a single `adult` row.
- `GET /api/projects/{id}/export[?lang=en|nl|fr]` -> `application/zip` (optionally only one language) with the latest version of every ICF doc, named `<icf_type>_<lang>_v<n>.docx`. Per-document download: `GET /api/versions/{id}/file`.
- Stages are `intake, drafting, pi_review, ethics_review, approved, participants` (`participants` = optional step 6 "Participant portal"; no requirements) (no `translation` stage; existing `translation` projects are migrated to `pi_review`). `translations_complete` (blocking, skippable) is a requirement of `pi_review`.
- `PATCH /api/projects/{id}` `{..., stage?, force?: boolean}`: moving FORWARD (to a later stage than the current one) when the current stage's blocking requirements are unmet -> **409** `{detail:"requirements_not_met", missing:[requirement keys]}` unless `force` is true; moving backward is always allowed.


## Creation = English only, translation gate, update mode
- `POST /api/projects/{id}/generate` with `language != "en"` -> 422 `creation_english_only`.
- `POST /api/project-documents/{doc_id}/translate` body gains `force?: boolean`. For an EN source doc without a version of source `reviewed`, returns 422 `translate_requires_review` unless `force: true`.
- `POST /api/projects/{id}/documents` with role `icf`: `icf_type` defaults to `adult`; if `language` is empty and the file is .docx the language is auto-detected (`engine.ai.detect_language`).
- `POST /api/project-documents/{doc_id}/update-template` JSON `{version_id?}` -> 202 `{task_id}` (Task kind `translate`). Update mode: rebuilds the ICF (any language) on the latest template of the same language with the source ICF as content; adds a NEW VERSION (source `generated`, note `Updated to template v<x> from v<n>`) to the same doc.

## Approve as is (v3.1)
- `POST /api/project-documents/{id}/approve` -> `ProjectDoc` : records that the latest version needs no changes (stores approved_version_id/by/at on the doc; additive migration). Counts as "reviewed" for the `pi_review` gate. A new version upload makes `approved` false again.
- `DELETE /api/project-documents/{id}/approve` -> `ProjectDoc` : withdraw the approval.

## Participant portal (staff preview and invitations)

Staff-only (`role=staff`), mirror of the participant endpoints without membership:

- `GET /api/projects/{pid}/portal-preview/documents?persona=adult|parent_guardian|adolescent|child&lang=en|nl|fr` -> `{trial:{id,name,study}, demo:boolean, documents:ParticipantDocument[]}`. Published versions; if none are published, `demo=true` and the latest version of each ICF of the persona's type (adult/parent/adolescent/child), preferring `lang`.
- `GET /api/projects/{pid}/portal-preview/documents/{doc_id}?persona=&lang=` -> `ParticipantDocumentContent`.
- `POST /api/projects/{pid}/portal-preview/ask` body = participant ask body -> same reply as `/api/participant/trials/{pid}/ask`.
- `GET /api/projects/{pid}/participant-invitations` -> `[{email, expires_at, status: pending|accepted|expired}]` (newest first; tokens are never returned after creation).
