# 00 - Overview and pipeline plan (synthesis of the 6 reader notes)

Paths: text mirror = data/text ; binaries = bucket (unzip data/bucket.zip) ; notes = memory/notes (biomede-example, forum-example, hemismart-mykids-nonmedical-icons, national-templates, pediatric-adaptation-analysis, mock-api-pediatric-prescriber).

## 1. What the bucket is
Hacking for Good (Google) bucket of Belgian clinical-trial informed consent material. Four real trials (Forum/FORUM2, Biomede 2.0, HEM-iSmart sub D, MyKids) each show a sponsor ORIGINAL consent form (where available) and the Belgian APPROVED ICFs (L1 SIS and ICF, one per audience: 18+/adult, parents, 12-17, 8-11, in EN/NL/FR where available). Next to them sit the mandatory Belgian CT-College MODEL ICF (adults, IMP trials; EN/FR/NL, two versions each), a non-medical (Ghent) ICF template, an icon pool for child-friendly forms, and an unrelated mock e-prescription API (Pediatric Prescriber track). Goal: sponsor original -> Belgian-compliant approved ICF set; ground truth = the approved files.

## 2. Corpus map
| Folder | Purpose | Languages / audiences |
|---|---|---|
| National Templates (6 docx) | Mandatory CT-College model, adults + IMP only. USE EN 2.2 (20250718), FR 2.3 (20250925), NL 3.2 (20250718); old Jan-2025 files superseded. Source of ~43% of approved sentences (Forum R1 measurement). | EN/FR/NL, adult only |
| Forum Example | FORUM2 platform trial (sponsor Bambino Gesu). 17 sponsor originals (EN only; Main, R1, R2, S1 x 4 audiences + P1 parents only) -> 57 approved (Main/R1/R2/S1 12 each, P1 3, Pregnancy 6 with no sponsor input). Adult/parents v1.0 20260402; minors v1.1 20260724 clean. | sponsor EN; approved EN/NL/FR; 4 audiences |
| Biomede Example | BIOMEDE 2.0 (Gustave Roussy). 9 sponsor originals, FRENCH, 2022, 2 modules (Biopsy 11.1, Treatment 11.2) x 4 audiences + stray 6-yr doc -> 12 approved (v1.1, one merged doc per audience per language). | sponsor FR; approved EN/NL/FR |
| HEM-iSmart Example | Sub-protocol D, Princess Maxima Center. Approved EN only (v1 0_20250410, 4 audiences). Text mirror Sponsor Originals is EMPTY because the sponsor files are RTF in the bucket (HEM-iSMART sub D_EN Master PIF_12 to 16 / 16 years ao / parents-caregivers, v1.0 22JUN2023) and were not converted. | EN |
| Additional Materials | MyKids (non-medical w/ intervention): sponsor Parents + Child 12-16 (Clean + TC duplicates; use Clean) -> approved 18+/Parents/12-17/8-11 v2.0 EN. 8-11 has no sponsor source. Observational and Intervention Ghent templates are byte-identical. Icons ICFs.docx = 17 Flaticon/clipart images (radiotherapy x4, MRI, medication, infusion, child with drip, tumour, computer, checklist, nurse, doctor, discussion, blood test, clipart wmf), no captions. | EN (templates), icons language-free |
| Pediatric Prescriber | mock-api-server.zip: FastAPI+SQLite mock of Belgian UHMEP/Recip-e FHIR API. Separate track; roles not enforced, no paediatric fixtures, free-text dosage. | n/a |

## 3. The transformation to automate
Chain: sponsor original (any structure/language) + national template -> adult ICF (EN master) -> parents (mechanical) -> 12-17 and 8-11 (rewrite/condense) -> NL and FR.

Key insights (evidence in notes):
1. The approved adult ICF IS the national template skeleton (Forum R1: 43% of sentences verbatim from template, only 10% verbatim from sponsor, 47% new/paraphrased). Sponsor text is a content source for template slots, never pasted in order. Sponsor structures differ (Italian A-D + 15 Q; French NIP/CF "///" caps headings; Dutch UMC informal), so mapping is semantic.
2. Slot mapping from the template colour code (purple = mandatory verbatim, black = proposal, blue = fill, red = guidance to delete; counts in national-templates.md). Sponsor feeds: front pages, "trial at a glance" (written last, max 2-3 pages), 1 purpose, 2 why me, 4 what happens, 6.1-6.5 risks/contraception, 10 post-trial choice, 11.2 compensation, 12.3-12.4 legal basis choices, 13 samples, Chapter II optional consents. Purple sections 3,5,7,8,9,14,15, glossary, declarations, BDPA/insurer wording come from the template for that language. Conditional blocks ([If applicable]/[optional]/[Choose]) are decided from the protocol and unused ones deleted. Cross-references (Chapter I section 11.2, 12.2, 12.4, 12.5, 12.8, 13.2-13.4, 14) require numbering to stay intact.
3. Belgian injections absent in sponsors: contact table, ombudsperson, no-fault insurer (Amlin policy 299.053.700 in Forum/Biomede), DPA (+32 2 274 48 00), GDPR chapter, 25-year retention, FAMHP/ethics review, Chapter II prerequisites, witness/interpreter, investigator declaration. Removed from sponsor text: US/FDA phrases, "race", sponsor DPO, Italian/French legal refs, fax numbers, placeholder notes, unused sub-study parts (e.g. MyKids Part C).
4. Site-specific fields (site name, PI, phones, DPO) stay as placeholders in approved docs ("Surname, First name", "Phone N", "To adapt"). Do not invent.
5. Parents = near-mechanical voice change of adult (104-107% length, "your child" 130-340x, two parent signature blocks, "approval not an incentive" sentence). Regenerate rather than diff.
6. 12-17 = true condensation (30-38% of adult words, 1.9-3.8k), still near-adult register (FK ~10), Q headings, medical terms with brackets, "doctor" instead of "investigator", keeps voluntariness, expectations, side effects (no frequencies), contraception for teens, ethics, one-line insurance, coded data, contacts, ASSENT form (YES/NO, 2 copies). Drops contact table, GDPR detail, costs, glossary, references.
7. 8-11 = 9-17% (900-1,250 words), ~6-8 first-person question headings (what is the study / what happens / which tests / who knows / has anyone checked / what if I don't want / who to ask) + assent, FK ~8, no legal text, no insurance, no drug names, analogies, reassurance, image placeholders. 8-11 and 12-17 are separate rewrites from the adult doc; parents receive the parents ICF, not the child text.
8. Languages: do not translate EN output blindly. FR/NL must use the FR 2.3 / NL 3.2 template text for boilerplate (FR "étude", "promoteur", "effets indésirables"; NL "studie", "opdrachtgever", "bijwerkingen", formal u/vous for adults; informal je/tu for children). FR ~5-9% longer than EN, NL ~equal.
9. Sub-studies/modules: Forum main ICF + R1/R2/S1/P1 as separate docs that reference the main ICF; Biomede merges Biopsy+Treatment into one ICF (biopsy described as standard of care, optional liquid biopsy). Pregnancy docs have no sponsor input (partner template).
10. Age bands move: sponsor 6-11/6-12/12-16/13-17 -> Belgian 8-11 / 12-17. Do not trust ages in filenames/footers.

## 4. Proposed pipeline and evaluation
Stages:
0. Ingest: parse docx directly (python-docx/lxml), tag each template run by colour (MANDATORY/PROPOSAL/FILL/GUIDANCE), keep tables as structured cells, footnotes, content controls; RTF via conversion (HEM). Drop TC/duplicate files, headers/footers/"page x of y".
1. Sponsor extraction (LLM): normalise to a trial fact sheet JSON keyed by template slots (identifiers, IMPs, objectives, design/randomisation, N participants world/Belgium, visits table, exams, risks per IMP, contraception periods, samples, optional consents, retention, post-trial access, compensation), each with a source span; flag unmapped content and Belgian-prohibited content.
2. Slot filler: start from the language-specific template; copy purple verbatim; generate blue/black slots from the fact sheet in template editorial style (sentences <12 words, paragraphs <7 lines, fixed terminology); evaluate conditional blocks; leave site placeholders; strip red guidance and version history; build "trial at a glance" last; auto-fill cross-references. Also emit a sponsor-statement/deviation report.
3. Adult EN -> parents (rule-based pronoun + LLM pass, signature blocks) .
4. Adult -> 12-17 and 8-11 via prompt rule-set in pediatric-adaptation-analysis.md section 9 (retained sections list, length targets, traceability: every claim maps to an adult sentence), assent form generator, icon selection by topic keyword from the 17-icon pool with Flaticon attribution, other illustration as "[IMAGE: ...]" placeholders.
5. NL/FR: fill from the NL/FR templates, translate trial-specific slots with fixed glossary; run again for children with informal register.
6. Render to docx preserving template styles (headings Titre1/Titre2, tables), fields refreshed; checklist validator.

Eval with approved ICFs as ground truth: (a) structural: heading sequence/numbering match to approved (edit distance), presence of mandatory blocks; (b) mandatory text: purple sentences verbatim recall; (c) slot content: fact-level recall/precision against approved (LLM-judge with rubric + embedding similarity per section), numbers/doses exact match; (d) length and readability per audience vs targets (words % of adult, ASL, FK/long-word share; NL/FR readability tools in template guidance); (e) hallucination check: each generated statement traceable to sponsor/template; (f) cross-language parity; (g) placeholder policy (none invented). Use cases: Forum R1/S1/R2 (EN sponsor, cleanest), Biomede (FR sponsor, merge case), MyKids (non-medical, different template), HEM (approved only, adult-voice/children evidence). Hold out one sub-study (e.g. S1) for validation. Caveat: approved is one valid output, not the only one; use rubric scoring rather than BLEU.

## 5. Open questions and risks
Questions for organizers:
- Is the target template always the CT-College IMP model, even for non-IMP trials (Forum R1 radiation dose, MyKids non-medical) where "IMP" wording is adapted? Which template applies when? Is the Ghent non-medical template in scope?
- Is a pediatric/parent national template planned or expected? (none exists; ICF 12-year-old readability target applies to adults.)
- Are the L1 files the final deliverable format (single docx, SIS+ICF)? What does "L1" mean (layer 1 / site level)? Expected output formats (docx with styles vs text)?
- Sponsor originals missing for HEM (RTF in bucket, not converted), Pregnancy (Forum), MyKids 8-11, and the Biomede 6-yr doc: ground truth only, or should the system produce them from nothing?
- Biomede sponsor docs are 2022 (EudraCT/CSET) while approved are 2026 CTIS: should the protocol be provided too? Is sponsor text out of date vs protocol?
- Is the Biomede biopsy module intentionally dropped in Belgium?
- Expected handling of sponsor statements (deviations from purple text) and the Sponsor DPO prohibition.
- Evaluation: will grading be human/rubric or automatic? Is the Pediatric Prescriber track separate scoring?
- Retention numbers (10 vs 25 years), insurer, CT-College e-mail (ct-college@ vs ct.college@health.fgov.be both appear across template files) - which is canonical?
Risks:
- Colours (the type signal) are lost in text conversion; must parse docx XML. Colours may also come from styles, 7 yellow + 1 cyan highlights, 32 content controls, Word comments ("[SD1] To adapt").
- Tables flattened into ASCII grids (contact table, visit schedule, compensation table); numbering flattened (Word auto-numbering) hurting cross-references; images/checkbox glyphs lost; text artifacts (random case "WhAT", missing word "A is like a big library", Dutch/Italian alt-text leaking).
- Translation: template wording differs by language and version numbers (EN/FR 2.x vs NL 3.x); medical terms; register tu/je vs u/vous; sponsor FR drifts (tu/vous inconsistent).
- Sub-study/platform handling (main + R1/R2/S1/P1 cross-refs, merged modules, parts not run in Belgium).
- Approved files contain human edits and typos, so exact-match scoring penalises valid outputs; pediatric precedent is only mildly simplified, so "better" and "like approved" can diverge.
- Legal/safety: hallucinated risks or doses; Belgian-prohibited sponsor phrases; must not decide legal basis without sponsor input.

## 6. Contradictions found between notes and how they are resolved
- Word counts differ between notes (Forum R1 adult 6700 vs 6473; Biomede +18 10146 vs 9712; HEM 18+ 13,827 vs 12,467): different counting (raw text vs table/boilerplate-stripped). Use ratios (percent of adult), not absolutes; counts here are approximate.
- Biomede note says adult approved is ~1.6x sponsor then says ~equal to the Biopsy+Treatment total (10146 vs 10092): resolved as equal to the sum of both modules (approx. 1.6x the Treatment module alone, 6218). Its line that 8-11 is "~3x longer" is unsupported; 8-11 approved (~920) < sponsor 6-12 Treatment+Biopsy (1452).
- Biomede note says 8-11 has no checkbox; assent notes show HEM/Biomede-style assent blocks exist. Treat 8-11 Biomede as name/date lines only, HEM as full YES/NO assent; both are assent, not consent.
- Biomede says sponsor "Majeur" uses vous but treatment adult uses tu (self-noted inconsistency); unverified, keep as noted.
- Forum note says sponsor minor band is 6-11, Biomede 6-12, MyKids 12-16 with footers saying 12-15: all map to Belgian 8-11 / 12-17.
- 12-17 witness line: Forum 12-17 omits it, Biomede/HEM keep it (not a contradiction; study-dependent).
- Insurer: same Amlin policy 299.053.700 in Forum and Biomede (NCC); MyKids/HEM use other sponsors' insurers: insurer is trial-specific input.
- Forum note on 'L1' (Belgian site-level) vs Biomede note ('layer/level 1'): both unverified.
- HEM note says Sponsor Originals empty: true in text mirror only; bucket has 3 RTF files (not yet converted/analysed). TODO: convert and compare with approved HEM docs.
- Open TODOs: inspect approved child docx for embedded icons (unzip -l word/media); diff sponsor FR vs approved FR (Biomede); verify colours in FR/NL template docx; run the converted RTFs.

## 7. Update (after workflow)
- HEM-iSmart sponsor `.RTF` files are now converted into `memory/text/HEM-iSmart Example/Sponsor Originals/` (convert.sh extension match fixed to include `RTF`). Not yet analysed against the approved HEM docs.

## 8. Briefing deck update (docs/ pptx) - READ `briefing-bspho-use-case.md`
The organizers' briefing (BSPHO, 29 Oct 2026) is the authoritative assignment. It changes/clarifies:
- Deliverable is a deployable **web app with three modes: creation, translation, update** (see briefing note), outputs .docx, must flag edits to mandatory text and information gaps for human review.
- **Correction to section 3 points 6-7:** Adolescent (12-17) and Children (8-11) ICFs are adapted from the *sponsor's own* adolescent/child ICFs using **HIRUZ (UZ Gent) templates**, not from the adult ICF. Only the Parental ICF is derived from the Adult ICF. The measured length/voice rules in pediatric-adaptation-analysis.md remain valid as descriptions of the target output.
- HIRUZ adolescent/children templates (EN/FR/NL) were announced as provided but were not found in the bucket; non-medical HIRUZ templates exist only as one EN adult file.
- Update mode (old-template ICFs -> latest template) and the template-modularisation step are explicit requirements; template ingestion must be reusable for future template versions.
- Nice-to-haves: interactive human-in-the-loop creation, image generation for children, text simplification tool, translation tool, non-medical ICFs.
