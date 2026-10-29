# Mock UHMEP FHIR API (bucket/Pediatric Prescriber/mock-api-server.zip)

Separate track from the ICF work. Zip contains only `server.py` (1724 lines) and `README.md` (321 lines). Extracted copy: /private/tmp/claude-501/-Users-joell-dev-hackingforgood/ec10d97d-aa6f-41f2-a6de-48b008132cd5/scratchpad/zip (scratchpad, may vanish; re-extract from bucket). Server was NOT run; everything below is from reading the code.

## What it is
Single-file FastAPI + Uvicorn + SQLite mock of Belgian eHealth UHMEP v1.4 / Recip-e (FHIR R4) e-prescription hub. Run: `uv run server.py [--port 8000 --host 0.0.0.0 --db uhmep_mock.db --reset-db --reload]` (PEP 723 deps: fastapi, uvicorn, pydantic, python-multipart; Python 3.12+). Swagger at /docs, /redoc, /openapi.json. CORS wide open (`*`). DB file path also via env `UHMEP_DB_PATH`.

## Endpoints (from server.py)
- System: `GET /metadata` (CapabilityStatement, hand-written), `GET /healthz`, `GET /fixtures/summary`, `POST /fixtures/reset`.
- Definitions: `GET /GraphDefinition/{id}`, `GET /OperationDefinition/{id}`.
- Practitioner: `GET /Practitioner/{id}`, `POST /Practitioner` (create only; no search).
- `GET /PractitionerRole/{id}`, `GET /Organization/{id}` (read only).
- ServiceRequest (the prescription): `POST /ServiceRequest` (create; 201 + Location), `GET /ServiceRequest/{id}`, `PATCH /ServiceRequest/{id}`, `POST /ServiceRequest/_search` (params patient, requester, status, _count, _offset), `GET|POST /ServiceRequest/{id}/$graph`, `POST /ServiceRequest/{id}/$approve`, `POST /ServiceRequest/{id}/$reject`.
- Task (dispense/fulfilment): `GET /Task?focus=...`, `POST /Task/_search`, `POST /Task`, `GET /Task/{id}`, `PATCH /Task/{id}`, `DELETE /Task/{id}` (logical delete).
- MedicationRequest aliases (map to ServiceRequest storage): `_search`, create, GET, PATCH, `$graph`.
- Search body accepted as form-urlencoded, JSON, or query params. Errors are FHIR OperationOutcome with codes in system `urn:be:uhmep:mp:errors` (e.g. PRESCRIPTION_NOT_FOUND, TASK_NOT_FOUND). Response headers `Correlation-Id`, `Content-Be-Pseudo` (pseudo v1/v2 negotiation via `Accept-Be-Pseudo`).

## Roles
README: `X-Role` or `Authorization: Bearer <role>`; roles prescriber (default), caregiver/pharmacist, patient, organization. QUIRK: in server.py there is NO code reading X-Role or Authorization (grep finds the words only in docstrings/README). Roles are documentation only; nothing is enforced. Any caller can approve, reject, dispense, create.

## Data model
One SQLite table `resources` (resource_type, id, status, subject, requester, data JSON, is_deleted, created_at, updated_at). `subject` is extracted from `subject.reference` or `subject.identifier.value`. Resources stored as raw JSON; no schema validation (payload is `Dict[str, Any]`).
Create ServiceRequest defaults: status active, intent order, priority routine, authoredOn now, and auto-creates a Task (status requested, focus -> ServiceRequest/{id}, `for` = subject).
Lifecycle: Task PATCH status=completed -> linked ServiceRequest status=completed. `$approve` sets active + adds be-ext-approval extension; `$reject` sets status `revoked`. `$graph` = Bundle(collection) of SR + requester PractitionerRole + Practitioner + Organization + Tasks (+ Task owner resource).

## Seeded fixtures (all in seed_fixtures)
- Organizations: org-hopital-saint-luc (hospital, NIHII 71000123), org-apotheek-janssen (pharmacy 56009876), org-apotheek-centrum-antwerpen (56001234).
- Practitioners: practitioner-dr-dupont (physician 19766016004), -dr-claes (GP 19876543001), -dr-peeters (dentist 18543219002), -pharm-janssen (pharmacist 20017534001). Roles: role-physician-dupont, role-physician-claes, role-pharmacy-janssen.
- ServiceRequests: sr-amoxicilline-001 (active, Jane Doe, Amoxicilline 1000mg x24, note "1 tablet 3 times per day for 8 days"), sr-paracetamol-002 (completed, Dafalgan Forte 1g), sr-ibuprofen-003 (cancelled, Brufen 600mg, Marc Willems), sr-atorvastatine-004 (stopped, Lipitor 20mg), sr-omeprazole-005 (active, Elena Vandenberg).
- Tasks: task-dispense-001 (requested), task-dispense-002 (completed).
- GraphDefinition service-request-graph; OperationDefinitions servicerequest-graph/-approve/-reject.
- Patients exist ONLY as pseudonym strings `urn:be:fgov:ehealth:pseudo:v1:pat-100X-name`; there are no Patient resources.

## Quirks / limitations
- Medication/dosage is free text: `code` (AMPP/CNK coding + text), `quantityQuantity` in packages, dosage only in `note[].text`. No structured dosageInstruction, no strength/ingredient fields.
- Seeded patients are all adult-looking (adult doses); no birthDate, weight, age, or any paediatric fixture. A paediatric app must supply its own patient data/context.
- Search uses SQL LIKE on raw JSON (`data LIKE %patient%`), so matching is substring and imprecise; no total count; pagination in memory.
- PATCH merges top-level keys blindly (can overwrite status, subject); Parameters-style patch is a naive hack. Task can be set to any status.
- Same `data LIKE` trick in `$graph` task lookup (`%{sr_id}%`) can pull unrelated tasks if ids are substrings.
- `$reject` uses status `revoked`, README lifecycle mentions cancelled/stopped; `Task.delete` sets status cancelled and is_deleted=1 (then not found).
- Delete of ServiceRequest / PractitionerRole / Organization not implemented; GET list endpoints absent by design (README explains FHIR/GDPR rationale).
- Fixture dates are 2026-08/11; `occurrencePeriod` expiry never auto-evaluated (the "stopped (expired)" status is static).
- Mock only: no PKI, no OAuth, no pseudonymization logic beyond accepting strings.

## README claims vs missing from zip
- `test_server.py` (README: "Automated test suite") is absent.
- `assets/UHMEP_v1_4-openapi.json` (official OpenAPI spec) absent; README links to a local path `/usr/local/google/home/kciredor/src/solve/assets/...`.
- `assets/UHMEP-MedicationPrescription-Cookbook.pdf` absent.
- `uhmep_mock.db` is generated on first run (not expected in zip).
- README says Swagger/ReDoc and a `Patient` target in graph, but no Patient endpoints exist. README role matrix claims patients can only view own prescriptions: not enforced.

## Ideas: a "Pediatric Prescriber" app on this API
1. Prescriber UI creates ServiceRequest for a child (pseudonym subject) with the app adding structured dose (mg/kg from weight/age) serialised into `note` and extensions, since the API has no structured dosage. Store weight/age in an extension or in an app-side DB keyed by pseudonym.
2. Dose-check layer in front of the API: LLM/rule engine validates the drug (AMPP/CNK) + dose vs paediatric ranges (e.g. BCFI/CBIP Belgian formulary) and blocks or flags before POST; then use `$approve`/`$reject` as the second-signature step (pharmacist/paediatrician review) since they map naturally to a verification workflow.
3. Add paediatric seed fixtures (child patients, paediatric formulations: suspensions, mg/kg amoxicillin, paracetamol drops) via `POST /ServiceRequest` or by editing seed_fixtures.
4. Trial link to the ICF track: for children in a clinical trial, flag prescriptions against trial protocol (prohibited concomitant meds, age bands 8-11 / 12-17) and tie to the age-appropriate consent (assent) status.
5. Pharmacist view: poll `Task?focus=` / `$graph`, show child-friendly dispensing instructions generated in NL/FR/EN; patient/parent view with plain-language explanation of the prescription (same language-level adaptation as ICF).
6. Use `/fixtures/reset` for demo repeatability. Since roles are unenforced, implement role gating in the app itself.
