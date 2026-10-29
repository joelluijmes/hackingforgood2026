# National Templates (CT-College model ICF, adults, IMP trials)

Source text: `data/text/National Templates/` (6 txt, ~1320-1345 lines each).
Originals: `bucket (unzip data/bucket.zip)/National Templates/*.docx`.
Title (EN): "Model ICF for interventional clinical trialS with IMP on adult patients". Adult patients ONLY (no minors, no pediatric text). Incapacitated adults are covered only via the optional LEGAL REPRESENTATIVE signature block.

## Files and versions
| Lang | Old (Jan 2025) | New | Version line |
|---|---|---|---|
| EN | `EN_Model-ICF_Interv-trial_Adult_Patients_version2_20250130.txt` | `EN_Model ICF_Interv trial_Adult_Patients_version2_2_20250718.txt` | 2.0 -> 2.1 (16/05/2025) -> 2.2 (17/07/2025) |
| FR | `FR_..._version2_20250130` | `FR_Model ICF_..._version2_3_20250925` | 2.0 -> 2.1 -> 2.2 -> 2.3 (approved 17/07/2025 per table; file dated 25/09/2025) |
| NL | `NL_..._version3_20250130` | `NL_Model ICF_..._version3_2_20250718` | NL numbering is 3.0 -> 3.1 (16/05/2025) -> 3.2 (17/07/2025) |

USE THE NEW VERSIONS (EN 2.2, FR 2.3, NL 3.2). Old ones have no "Version history" table. The ICF template version 2.0 was approved by the College Board 24/01/2025; v1.0 adopted 27/06/2019 (BAREC, pharma.be, patient orgs, coordinated by CT-College at FPS Health). The sponsor must state in the submission which template version was used.

### Changes old -> new (EN diff, same in FR/NL unless noted)
- 2.1: Section 9 EN translation error fixed (last sentence added). FR/NL: typo/grammar fixes throughout.
- 2.2, Section 10 (post-trial access): added reasoning instruction ("selection ... must be based on a reasoned assessment by the sponsor, in consultation with the investigator ... nature of the IMP, mode of action, phase, purpose"). Text changed from "The sponsor CAN decide to give you post-trial access" to "The sponsor WILL give you FREE access to the IMP after this trial if" + 4th condition "the nature and the mode of action of the IMP allow for it (e.g. not possible in case of short-term administration)". Also 10 intro: "After you stopped the treatment with the IMP" -> "If you stop the study".
- 2.2, Section 12.1: word "race"/"ras" removed. Now "(for example your age and sex)"; optional ethnicity sentence only "when this is absolutely necessary for the study"; data-minimisation guidance rewritten.
- Other EN edits: "The trial at a glance" box gets red instruction "max 2-3 pages ... very simple terms"; 9 intro cross-ref fixed to chapter I §12.4 (was 12.3); consent bullet cross-ref §12.6 -> §12.5; sponsor role in 12.3 bullet changed "processor" -> "controller" (substantive GDPR fix); EUDRACT -> CTIS database for lay title; 12.3 "At the end of this form you agree/disagree ..." now conditional on 'consent' as legal base; 9.x follow-up side-effect sentence rewritten ("If you experience a new side effect after stopping ... you may contact the investigator"); footnote [5] legal representation updated (article 31 of the law of 7 May 2017 on clinical trials for medicinal products + other articles; was art. 11 "experiments on the human person").
- FR 2.3 only: Section 9 wording "effets secondaires" -> "effets indésirables" (also in revision-table example I.4.1). Small typo fixes (CT College / CT-College).
- NL: "§ 0" broken cross-ref fixed to "§ 12.5"; heading numbering 12.3 fixed.

## Colour code (Guidance, "The following color codes are used")
- PURPLE: mandatory; only adaptable with justified reason; sponsor must document deviations in a "sponsor statement" (template on CT-College website `documents/sponsor-statement-template`).
- BLACK: proposal; may be adapted to the trial.
- BLUE: must be replaced by trial-specific info.
- RED: guidance for sponsor; must be DELETED from final ICF (together with the Guidance part of the doc).
- Footer may be adapted freely. Document contains Word fields/cross-references (REF, PAGEREF, TOC) updated with F9.

### Detecting colours in the docx (verified on EN 2.2)
Unzip -> `word/document.xml`; runs `<w:r>` carry `<w:color w:val="..."/>`. Counts in EN 2.2: `7030A0` purple (871 runs), `FF0000` red (1078), `0000FF` blue (363), `000000` black (416), no colour/`auto` = default text (treated as black/normal), `222222` glossary. Also 7 `yellow` + 1 `cyan` highlights (leftover marks, check manually). Headings use styles `Titre1`/`Titre2` (TOC `TM1-3`), subtitle `Sous-titre`, lists `Paragraphedeliste`; 32 `<w:sdt>` content controls; 31 `Commentaire` styled paras; no tracked changes. Footnote-like refs [1]-[6] in `endnotes.xml`/`footnotes.xml`. Helper script (scratchpad): `/private/tmp/claude-501/-Users-joell-dev-hackingforgood/ec10d97d-aa6f-41f2-a6de-48b008132cd5/scratchpad/col.py <docx>` prints char counts per colour per section (regex only; `python3 -I`). Caveat: some runs may be coloured via paragraph/character style rather than direct `w:color`; also check `styles.xml`.
Pipeline tip: parse docx directly (python-docx / lxml) rather than pandoc text, tag each run by colour, and keep colour as the authoritative "type" (MANDATORY / PROPOSAL / FILL / GUIDANCE).

### Approx colour mix by section (EN 2.2, characters; R=red guidance, P=purple, K=black, B=blue)
- 1 Why study: R286 K129 B41 (almost all fill-in). 2 Why me: R418 B106 K83 P34.
- 3 Voluntary: P519 (mandatory). 5 Benefit: P512. 7 Something wrong: P1415. 8 New info: P632.
- 4 What will happen: R2153 P756 K416 B133 (sponsor writes design/visits).
- 6 Risks: R5083 K1646 B638 P728 (largest sponsor-authored part).
- 9 Premature end: P3365. 10 After trial: P1064 + R667 (choose option). 11 Costs: P1326 R1331 B706.
- 12 Data: P4511 R6409 K1586 B1448. 13 Samples: P5706 R1913 (mostly boilerplate). 14 Meaningful info: P803. 15 Reviewed/approved: P561.
- Chapter II consent: P2859 K2133 R862 B308. Investigator block, witness, legal rep: mostly default/boilerplate.
- "Trial at a glance": almost entirely red guidance (sponsor writes whole text).

## Document structure (new EN 2.2; FR/NL identical numbering)
Pre-template (REMOVE from output): Version history, Guidance (intention, colour codes, Editorial recommendations, Front Pages guidance, history of template).
Template:
- FRONT PAGES: lay title (as in CTIS database), Official title, EU CT number, Trial number (sponsor), Sponsor(s) name+address, [European representative], [CRO], Site name (as on FPS Health website), Main address of site, [Site number], [optional Document Revision History table with Version No / Version Date / Revision description].
- "Who can I contact in case of questions?" table (can also be at document end). Columns Name / Function / In case of / Contact details. Rows: Principal Investigator; trial staff; Contact for urgent study-related questions (24h/7, hospital number, NOT ER); Ombudsperson for patient rights (fallback: CT-College ct.college@health.fgov.be); Sponsor's insurance company (policy N°, address, phone, e-mail); Data protection officer of the site (fallback contact person for data protection); Belgian Data Protection Authority (fixed: +32(0)2274 48 00, contact@apd-gba.be). Site-specific data completed after EC approval. Sponsor's own DPO contact is NOT allowed.
- "The trial at a glance" (boxed, max 2-3 pages, very simple words; BAREC refuses ICFs without it). 16 guiding questions (purpose, benefit, IMP, painful exams, duration, side effects, insurance, pregnancy, costs, data, voluntary, who approved, post-trial IMP, commitments (inform treating doctors; not join other interventional trial/device study unaware; report health/medication/symptoms; carry "emergency card"), contacts). Only Chapters I and II are legally binding.
- CHAPTER I - DESCRIPTION OF THE TRIAL AND YOUR RIGHTS WHEN PARTICIPATING
  1. Why is this study being conducted?
  2. Why am I being asked to take part?
  3. Do I have to take part in a trial?
  4. What will happen during the trial?
  5. Will I benefit from the trial?
  6. What are the possible risks and discomforts of taking part? 6.1 side effects of [IMP] [and comparator]; 6.2 risks/discomforts of examinations; 6.3 Can I take other medicines; 6.4 impact on daily activities; 6.5 [optional] pregnancy/conception/breastfeeding (female + male participant texts)
  7. What if something goes wrong within the trial? (no-fault insurance)
  8. What if other treatment options or new information ... become available?
  9. Can my participation end prematurely? 9.1 you withdraw consent; 9.2 you stop the study drug; 9.3 investigator ends; 9.4 other entities (sponsor/authorities)
  10. Which treatment will I get after my participation? (choose: free post-trial access conditions OR extension trial)
  11. Will my participation involve extra costs? 11.1 exams/treatments paid by sponsor; 11.2 other expenses (compensation table: contraception, travel, meals, hotel, time)
  12. Which data are collected about me ... ? 12.1 collected; 12.2 investigator and coding ("encoding" = pseudonymisation, ref [3]); 12.3 handling + legal basis (a consent, b legal obligation, c public interest, d legitimate interest; ONE per processing activity) + controller/processor roles; 12.4 access/rectification and rights (limited rights texts per legal base); 12.5 who else has access; 12.6 [optional, autologous ATMP only]; 12.7 results of trial; 12.8 other purposes; 12.9 retention
  13. Which biological samples ... ? 13.1 collected; 13.2 what happens; 13.3 research outside trial; 13.4 [if applicable] break link to identity
  14. What if the trial reveals meaningful information about your health?
  15. Who has reviewed and approved the trial documents?
- CHAPTER II - Informed consent: PARTICIPANT (list of ~18 declaration bullets, e.g. read and understood, time to think, voluntary, data processed Ch.I §12.2, access by sponsor/EC/authorities §12.5, insurance, no extra costs, contraception, treating physicians informed, no parallel interventional trial, cooperation, early end; [if mandatory genetic analyses]); then "Optional consents which are no prerequisite" with tick boxes "I agree / I do not agree": 1 compensation via external vendor; 2 data for other purposes (only if consent = legal base); 3 optional genetic analyses; 4 retain remainders in-trial; 5 additional samples in-trial; 6 retain remainders outside trial; 7 additional samples outside trial; 8 genetic analyses outside trial; 9 produce/culture material (cell lines) non-genetic; 10 break link to identity; 11 MEANINGFUL INFORMATION ("No, I do not wish to be informed" / "Yes, I wish to be informed"). Signature lines: participant name, Date (DD/MMM/YYYY), [time if screening+randomisation same day], signature.
  - [If incapacitated persons] LEGAL REPRESENTATIVE (ref [5]); [If witness/interpreter] IMPARTIAL WITNESS / INTERPRETER (ref [6]); INVESTIGATOR (MD or dentist; optional delegate; investigator signs last).
- GLOSSARY (FAMHP, DPA, No Fault insurance, MONITOR and AUDITOR + sponsor-added terms) and REFERENCES [1]-[6] ([1] interventional trial definition, [2] EU rep Art. 74 Reg 536/2014, [3] encoding=pseudonymisation, [4] FDA sentence 21 CFR 50.25(c) if FDA use, [5] legal representation order, [6] witness vs interpreter).
Cross-references in boilerplate depend on section numbers (Ch.I §11.2, §12.4, §12.5, §12.8, §13.2-13.4, §14): numbering must not be changed.

## Mandatory boilerplate vs fill-in
- Mostly purple (copy verbatim, minimal change): 3, 5, 7, 8, 9 (whole), 14, 15, most of 12 and 13, consent declarations in Ch. II, investigator confirmation, glossary core terms, BDPA contact data, insurance wording.
- Sponsor-authored (blue/red + black proposal): front pages, "Trial at a glance", 1, 2, 4, 6.x, 10 (choose), 11.2, legal basis choices in 12.3-12.4, 13.x trial-specific sample info, optional consents in Ch. II.
- Conditional blocks marked "[If applicable]" / "[optional]" / "[Choose:]" (about 16x "[If applicable]" and 25x "[number]" in EN): decide per sponsor protocol; delete unused ones.

## Fill-in placeholders / fields (EN names; FR "[nom du ...]", "[s'il y a lieu]", "[facultatif]"; NL "[naam van ...]", "[Indien van toepassing]", "[aantal]")
- Identity: official lay title (CTIS), official title, EU CT number, sponsor trial number, sponsor name+address, European representative, CRO, site name/address/number, version no. + date (same on all pages, "page X/Y").
- Contacts: PI name, trial staff, 24/7 urgent contact phone, ombudsperson phone, insurer name/policy N°/address/phone/e-mail, site DPO phone/email.
- Trial: [name of IMP(s)], [name of comparator(s)], [name of disease/condition], objectives + mode of action + number of patients who already received IMP, inclusion/exclusion summary, alternative treatments, number of participants worldwide/in Belgium, design (randomised/blind/placebo/cross-over, probability), dose/route/frequency, visits, screening/treatment/follow-up phases, scheduled exams (trial-specific in bold), tables/flow chart, duration (weeks/months, number of visits, study end date), self-medication note.
- Risks: side-effect list per IMP in frequency order (very common >1/10 ... very rare 1/100000-1/10000; irreversible in bold), comparator side effects (reference to SmPC), exam risks (blood volume ml/tubes, biopsies, X-ray/MRI/radiation dose), other-medicine restrictions, daily-life restrictions, contraception methods + durations (days/months after last dose), pregnancy test regime, sperm/egg donation ban, partner pregnancy follow-up.
- 9.2 follow-up frequency "[number of] months"; 10 choose option; 11.2 compensation table (type/amount EUR, payment form, timing, receipts, external vendor name + form e.g. payment card, alternative via site); 12.3 legal basis a-d + defined legal obligation/public interest/legitimate interest + controller names; 12.4 "[add why the rights are limited]"; 12.x data retention, transfers outside EU, [website] (e.g. results publication), estimated study end date; 13 samples types, volumes, retention [number] years, genetic analyses purpose "[explain the purpose]", research outside trial.

## Editorial / readability rules (Guidance "Editorial recommendations")
- Readable by non-professionals without oral explanation; "educational level of a 12-year-old" (adults!).
- Sentences < 12 words, paragraphs < 7 lines; bullets where possible; avoid jargon; consistent terminology.
- Fixed terms: "clinical trial"/"trial" (EN); FR/NL use "étude clinique/étude" and "klinische studie/studie" (NOT the legal "essai"/"proef"); "trial staff"; "investigator" (the responsible HCP); "treating physicians"; "Hospital" (= trial site); "comparator" (= standard treatment in combination); "encoding" instead of "pseudonymizing"; "emergency card"; FR "devenir enceinte" not "tomber enceinte"; NL "opdrachtgever" = sponsor, "onderzoeker", "studiegeneesmiddel", "referentiegeneesmiddel"; FR "promoteur", "médicament à l'étude", "DIC" (Document d'information et consentement).
- Abbreviations: spell out on first use, abbreviation in brackets; capitalise glossary terms in text (e.g. MONITOR, AUDITOR, DPA); limit abbreviations.
- Font >= Arial 12 on A4; >= Arial 16 in booklet format. Good layout with sub-titles and white space. Involve patient/patient association if possible. Same version no. and date on all pages; pagination "page X/Y".
- Language refs: NL - "Schrijfadviezen voor de geneesmiddelenbijsluiter" (UU) and CBG "Patiëntvriendelijke termen"; EN - EC "summaries of clinical trial results for laypersons"; FR - FALC (falc.be). Readability checkers: translatedlabs.com (FR/EN), lt3.ugent.be/readability-demo (NL/EN).
- Forbidden: text that intimidates/influences the participant not to stop (e.g. "we can track you down"); sponsor DPO contact details.
- Submit ICF in all official languages of recruitment regions (EN/FR/NL).

## FR / NL differences
- Same structure and numbering; NL heading numbering sometimes pasted as "12.3" text in the Jan version (fixed in new). FR chapter titles: "CHAPITRE I - DESCRIPTION DE L'ETUDE ET de VOS DROITS EN tant que PARTICIPANT", "CHAPITRE II - Consentement éclairé"; NL "HOOFDSTUK I - BESCHRIJVING VAN DE STUDIE EN UW RECHTEN BIJ DEELNAME", "HOOFDSTUK II - GEÏNFORMEERDE TOESTEMMING". NL uses "u" (formal), FR "vous".
- Length: EN ~14.9k words, NL ~15.3k, FR ~16.3k (FR is ~9% longer; the FR file is the only one with 4 versions in its history).
- FR 2.3 uses "effets indésirables" (not "effets secondaires"); EN/NL keep "side effects"/"bijwerkingen".
- Headings in FR/NL (sections 1-15) are direct translations of the EN questions; the optional-consent order and the cross-refs are identical. Version numbers differ (NL 3.x vs EN/FR 2.x) so do not rely on version number across languages.
- Template is the legal reference for consistent wording: if the sponsor ICF uses different Dutch/French medical terms, normalise to the template's terms.

## Which sections the sponsor content must feed
Sponsor original ICF/protocol content -> template sections:
- Front pages / contacts / insurance <- sponsor identity, EU CT no., CRO, site info, insurer.
- Trial at a glance (new, written from the rest, simplest language).
- 1 purpose & IMP & objectives; 2 disease, inclusion/exclusion, alternatives, life expectancy; 4 design, number of participants, procedures, schedule/flow chart, duration; 6.1-6.5 safety info (IB/SmPC), exam risks, restrictions, contraception/pregnancy; 8 (generic); 9.2 follow-up frequency; 10 post-trial access policy; 11.2 compensation; 12 legal basis, data categories, transfers, retention, publication website; 13 samples, genetic, storage, future research; Chapter II optional consents mirror the optional features found in sponsor ICF (genetic, future research, extra samples, vendor).
- Purple sections (3, 5, 7, 8, 9, 14, 15, glossary, declarations) are NOT fed from sponsor text: take national text verbatim; report any sponsor-specific deviation in the sponsor statement.
- Sponsor/global ICF often contains items that Belgian rules prohibit or replace (US/FDA phrases, race data, "sponsor can contact you" language, sponsor DPO). Flag these; FDA sentence only if FDA use (ref [4]).

## Notes for the pediatric step (later)
Template has no pediatric adaptation; reading level target (12-year-old) and the <12 words/sentence rule apply to adults, so child (8-11) / adolescent (12-17) / parent versions need separate language-level rules. Legal representative block [5] covers only incapacitated adults, not minors.
