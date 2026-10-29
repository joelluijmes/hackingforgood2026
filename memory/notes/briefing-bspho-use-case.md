# Briefing: "Solve with Google - BSPHO ICFs - Briefing" (29 Oct 2026)

Source: `docs/briefing-bspho-icfs.pptx` (17 slides). Text version: `docs/briefing-bspho-icfs.md`.
Slides 11 (overview) and 12 (flow) are drawn as shapes; their text was extracted from the slide XML and is reflected below. Speaker notes are empty. The big image on slide 1 is only a screenshot of the BSPHO website. THIS BRIEFING IS THE AUTHORITATIVE DESCRIPTION OF THE ASSIGNMENT.

## Who is who
- **BSPHO** (Belgian Society for Paediatric Haemato-Oncology): non-profit across the 7 Belgian paediatric haemato-oncology centres. They prepare submission documents for ethics committees / competent authorities. They are the customer.
- **Sponsor**: runs the study internationally; supplies the source documents.
- **NCC** (National Coordinating Center): hospital responsible nationally; the Principal Investigator (PI) sits there.
- **Ethics Committee**: reviews submissions, pays extra attention to ICFs.
- **Participating sites**: hospital departments in the study.

## ICF types and how each is made (slides 3, 6-11)
| ICF | Source / method |
|---|---|
| **Adult** | Mandatory Belgian template + sponsor documents (one or several) + extra free-form admin info (insurer, responsible PI, ...). Must exist in EN, NL, FR. |
| **Parental** | Adapted from the Adult ICF ("your disease" -> "your child's disease"; contraception sentence becomes "I understand the importance of contraception and will inform my child adequately so he/she adheres to the recommendations"). |
| **Adolescent (12-17)** | Adapted from the **sponsor's adolescent ICF**, using the **HIRUZ** (Health, Innovation & Research Institute, UZ Gent) adolescent template. Simpler, informal, no administrative info (e.g. insurance). |
| **Children (8-11)** | Adapted from the **sponsor's children's ICF**, using the **HIRUZ** children's template. About 2 pages, very basic, informal, with age-appropriate illustrations. |

IMPORTANT: this corrects an assumption in our earlier notes/plan that 12-17 and 8-11 are derived from the adult ICF. Per the briefing, only Parental derives from Adult; Adolescent and Children derive from the sponsor's own adolescent/child documents plus HIRUZ templates (Adult ICF + sponsor material may still be useful context). See "Gaps" below.

## The Belgian adult template problems (slide 7)
- Mandatory template assumes commercial studies on adults with new molecules; paediatric academic studies use existing molecules in minors, so some mandatory text needs adaptation (must be clearly flagged).
- Must be followed in all three languages, so direct translation is infeasible (use the NL/FR template wording).
- 40+ pages with template text and instructions interleaved; changes over time, so existing ICFs sometimes need updating.

## Desired flow (slide 12)
Receive sponsor docs (BSPHO, manual) -> **Create EN ICFs (application)** -> Review by PI (manual) -> Adjustments (manual) -> **Translate EN -> FR & NL (application)** -> **Upload new template version / Update earlier ICFs (application)** -> Ethics Committee review (external) -> adjustments -> approval.

## Requirements
### Must have (slides 13-14): a deployable WEB APPLICATION with
- ICF templates inside, with the option to upload new template versions.
- **Three modes: creation, translation, update.**
- **Creation**: input = sponsor documents + additional information (doc(x), pdf, free text). Output = the 4 ICF types in English, as .doc(x). Fills the template from the inputs. **Must clearly mark edits to mandatory text and gaps due to missing information, for human review.** Uses freely usable illustrations or placeholders for children's ICFs.
- **Translation**: input = the 4 ICFs in English (may differ from creation output because of manual review edits). Output = the 4 ICFs in Dutch and French. **Mixed translation**: use the mandatory language of the NL/FR templates and add translated text from the English input to complete the template.
- **Update**: input = the 4 ICFs in EN/FR/NL made with an older template version. Output = updated ICFs in EN/FR/NL on the latest template version.

### Nice to have (slide 15)
- Interactive creation with live human-in-the-loop questions instead of manual post-processing.
- Image generation for children's ICFs.
- Text simplification tool (jargon -> plain text).
- Text translation tool between EN/NL/FR.
- ICF generation for non-medical studies (observational / with interventions) using a different template set.

## Provided sources (slide 16) vs what is in the bucket
| Briefing says provided | In bucket? |
|---|---|
| Belgian adult ICF template EN/FR/NL | Yes: `National Templates/` (use newest: EN 2.2, FR 2.3, NL 3.2) |
| HIRUZ templates for adolescents and children, EN/FR/NL | **NOT FOUND** as such. Check/ask. (Approved child ICFs in the bucket show their eventual structure.) |
| HIRUZ templates for non-medication studies EN/FR/NL | Partially: only `TMP_ICF_Experiment_Adults_EN_Versie_2` (EN, adults; observational and intervention copies are byte-identical). No FR/NL. |
| Previously created ICFs incl. sponsor documents | Yes: Forum, Biomede, HEM-iSmart, MyKids examples |
| Sample illustrations for children's ICFs | Yes: `Additional Materials/Icons ICFs.docx` (17 images) |

## Advice from the organizers (slide 17)
The template is one docx that mixes guidance, instructions, mandatory text, proposed text and placeholder text, distinguished by colour. Study its structure and break it into modular pieces for the app. **Put that transformation in the application logic so it can be rerun for future template versions** (this is also what makes Update mode possible).

## Implications for our plan
1. Deliverable = web app + 3 modes, not just a one-off pipeline. Build the template-ingestion step (colour-tagged docx -> modular template) as a reusable component; the update mode re-runs it on a new template version.
2. Review-friendliness is a core requirement: flag edits to mandatory text and gaps (e.g. highlighted/commented in the output docx).
3. Input includes free text and pdf, not just docx.
4. Translation mode is template-driven (mixed translation), consistent with our earlier finding that FR/NL boilerplate comes from the FR 2.3 / NL 3.2 templates.
5. Update mode needs diffing an old-template-based ICF against a new template (we have old/new template pairs: Jan 2025 vs Jul/Sep 2025 in `National Templates/`, plus FR/NL/EN approved ICFs to test on).
6. For adolescent/children: sponsor-provided child documents are the primary source; adapt using HIRUZ style. Our measured rules (length 30-38% / 9-17% of adult, voice, Q headings, assent form) from `pediatric-adaptation-analysis.md` still describe the target output.

## Open questions to ask organizers (added)
- Where are the HIRUZ adolescent/children templates (EN/FR/NL) and the HIRUZ non-medication templates in FR/NL?
- What do we do when no sponsor child ICF exists (e.g. Forum has them; HEM sponsor originals include 12-16 but no 8-11; MyKids has no 8-11 source)?
- Which fields count as "additional information" input (insurer, PI, sites) and in what form?
