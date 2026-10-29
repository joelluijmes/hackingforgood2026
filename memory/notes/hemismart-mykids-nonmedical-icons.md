# HEM-iSmart example, MyKids (non-medical) and Icons: analysis notes

Text root: data/text (originals in .../bucket). All EN only.

## 1. Inventory (word counts from converted text)

### HEM-iSmart Example (medical trial, EU 2021-003398-79, sponsor Princess Maxima Center)
- `Sponsor Originals/` is EMPTY in the text mirror (no sponsor original provided; check bucket for the binary). Only approved outputs exist, so this set shows target output but cannot be used for sponsor->approved mapping.
- `Approved ICFs/` (all "v1 0_20250410", sub-protocol D: Trametinib+Dexamethasone+Cyclophosphamide+Cytarabine, relapsed/refractory leukaemia/lymphoma):
  - `L1 SIS and ICF_sub D_18+_ENG...` 13,827 words
  - `L1_SIS and ICF_sub D_parents_ENG...` 14,297 words
  - `L1 SIS and ICF_sub D_12-17_ENG...` 3,920 words
  - `L1 SIS and ICF_sub D_8-11_ENG...` 1,310 words
- "SIS" = Study Information Sheet, bundled with the ICF in one file.

### Additional Materials
- `Icons ICFs.txt` (143 words, nearly empty): see section 5.
- `Non Medical ICF Observational/TMP_ICF_Experiment_Adults_EN_Versie_2.txt` and `Non Medical ICF w Intervention/TMP_ICF_Experiment_Adults_EN_Versie_2.txt`: 3,227 words each, **byte-identical** (cmp). So the "observational" vs "with intervention" templates are the same file; the distinction lives only in the folder name.
- `Non Medical ICF w Intervention/` (MyKids = MYKIDS, EpSSG NRSTS study, sponsor Princess Maxima Center; Belgian national coordinator Cliniques Universitaires Saint-Luc, Dr de Ville; 7 Belgian hospitals, 20 Belgian participants of 250):
  - `Sponsor Originals/`: `E1E2. MyKids_PIF-IC_Parents_v2_dd08Aug2023_MASTER` Clean (5,160 w) and TC (5,160 w); `E1E2. MyKids_PIF-IC_Child 12-16_v2_dd08Aug2023_MASTER` Clean (2,472) and TC (2,483). TC = track-changes variant. Clean/TC are near duplicates (parents identical in text, child differs by about 11 words from change markup). Use Clean only.
  - `Approved ICFs/` (all v2.0, 25 Mar 2025): `18+` 5,208 w; `Parents` 5,407 w; `12-17y` 4,237 w; `8-11y` 935 w.

## 2. Sponsor -> approved mapping (MyKids)
| Approved | Derived from sponsor original |
|---|---|
| Parents v2.0 (5,407w) | Parents v2 08Aug2023 (5,160w); +247 words of Belgian additions |
| 18+ v2.0 (5,208w) | Also the Parents original (adult-addressed version: "Information sheet for the adult participants"; text re-addressed from "your child" to "you") |
| 12-17y v2.0 (4,237w) | Child 12-16 original (2,472w); about 70% longer: Belgian legal/ethics/insurance/GDPR sections added, age range widened 12-16 -> 12-17 |
| 8-11y v2.0 (935w) | No sponsor original at all; created de novo, its footer says "based on Information letter ... for children, 12 to 15 years ... NL version 2.0, dated 08-08-2023" |

Footers state provenance: `MYKIDS-ICF participants 12-17 years - Version 2.0 dd 25 MAR 2025, based on Information letter and informed consent form for children, 12 to 15 years, MyKids, based on NL version 2.0, dated 08-08-2023`. Note inconsistent age ranges in the source chain (12-15 / 12-16 / 12-17) -> pipeline should not trust ranges in filenames or footers.
- Sponsor original is a Dutch (NL) master, so sponsor versions are Dutch-origin English translations ("Dear......", "<add local or national website, if applicable>", "Dr <name local PI>").
- Sponsor placeholders (angle brackets): `<name local PI>`, `<phone number>`, `<number>`, `<country>`, `<name local MREC / IRB>`, `<name independent expert, if applicable>`, `<email>`. Approved versions fill these with Belgian values (Saint-Luc ethics committee, Amlin insurance, Belgian DPA, laws of 7 May 2004, 22 Aug 2002, 30 Jul 2018, GDPR 2016/679). Leftovers in approved: 18+ and Parents end with three lines "To adapt locally / To adapt / To adapt"; 12-17 has one residual Word comment "Commente [SD1]: To adapt" (line 415) on the doctor phone line. Good example of unfilled site-specific fields (site name/phone) that the pipeline must leave as blanks.
- HEM-iSmart approved files in each age group are all derived from the same sponsor text with different reading levels (see section 4).

## 3. Structure

### MyKids approved 18+ / Parents / 12-17 (numbered/uppercase headings, adult follows Belgian structure)
WHAT IS THE PURPOSE OF THIS STUDY? / WHO ORGANIZES THE STUDY / WHAT DOES PARTICIPATION IN THE STUDY INCLUDE FOR YOU? / HOW MANY PARTICIPANTS... / WHAT IS THE DURATION... / WHICH PROCEDURES WILL BE PERFORMED... (Parts A, B, C; "Part C ... Belgium does not participate"; B mandatory, others optional) / WHAT IS EXPECTED FROM YOU? / WHAT ARE YOUR RIGHTS... (voluntariness, ethics committee, privacy, DPO, DPA contact) / INSURANCE / RISKS AND EXPECTED BENEFITS / COSTS / REIMBURSEMENT / TO WHOM TO TURN. Then the consent form (participation form). 12-17 sheet is numbered ("1 WHAT IS THE PURPOSE", ... "page 1 of 11") and second-person; includes "What will happen after the study?". Parents version addresses the parent for the child ("your child").

### Sponsor original child 12-16 (Dutch UMC-style, informal)
Headings in plain language: "Questions and contact", "About the study", "Why this study?", "Background", "How does participation work?"... Includes glossary bullets ("Bodily material ... = which comes from your body", "Personal data = information about who you are"), a "Space to write down your questions" box ("Tip: take a photograph of your questions"), a literal `[image]` placeholder under "Questions and contact", and consent form. It has NO Belgian legal content.

### Approved 8-11y (935 words, ~2 pages)
Very short: Hello, "WHY AM I INVITED...?", "WHAT IS THE GOAL OF THIS STUDY?", "WHICH TESTS WILL BE DONE...?", "WHAT HAPPENS IF YOU DO NOT WANT TO PARTICIPATE...?", "TO WHOM CAN YOU ASK QUESTIONS?" (blank lines for doctor name/phone), then "ASSENT FORM FOR CHILDREN (8-11 YEARS)": 5 "I understand..." statements, YES/NO tick table, participant + doctor name/signature/date, "2 copies must be completed. The original is kept by the investigator... at least 25 years", doctor declaration. Question-style headings, "you", biobank explained as "a big library". Tiny glitch in 8-11 text: "A is like a big library" (term "biobank" lost, likely a lost bold/field in conversion), and "THIS THIS STUDY" typo.

### HEM-iSmart 8-11 (1,310 w) mirrors the same 8-11 skeleton (identical assent text block, same YES/NO table wording, same footer sentence "25 years") -> the 8-11 form is a reusable template skeleton: Hello / invited / goal-or-treatment / tests / "what if you do not want to" / questions / ASSENT FORM. HEM version adds treatment cycles (28 days), study drugs, tests list (blood, urine, bone marrow, CSF), questionnaire (10 minutes), pregnancy test. Assent YES/NO items are study-specific numbered list (symptoms, take medication, samples kept).
HEM 12-17 (3,920 w) is a full information sheet; 18+ and Parents are about 14k words (long because of full medical content: drug risks, side effects, contraception).

## 4. Language-level adaptation (evidence for the pediatric step)
- Adult 18+ MyKids: formal ("informed consent", "pseudonymised", "controller", "supervisory Data Protection Authority", GDPR article references, footnotes).
- 12-17: second person, shorter sentences, 5 to 6 sections, privacy explained simply; retains Belgian ethics/insurance but compressed. "Your parents/guardians have received a similar information letter and we will also ask their permission".
- 8-11: about 18% of the length of 12-17; no legal text, no DPO, no insurance, no footnotes; analogies ("big library"), explains anaesthesia in brackets "(medical treatment that will put you in a very deep sleep)"; the child's own rights reduced to "you can ask questions", "you can say no, doctor and nurses will not mind", "stop at any time without giving a reason". Consent replaced by an ASSENT form with short statements and simple YES/NO ticks; keep-time note (25 years).
- Retention numbers differ: non-medical template says investigator keeps original at least 10 years; MyKids/HEM child assent says 25 years (study-specific, from sponsor). Do not hardcode.
- Pipeline implication: age groups need independent text length targets (8-11: ~900-1,300 words; 12-17: ~4,000; adult: whole thing), no legal blocks for 8-11, and a separate assent form (not a signed ICF) with a "tick yes/no" table.

## 5. Icons ICFs.docx (bucket (unzip data/bucket.zip)/Additional Materials/Icons ICFs.docx)
Extracted at /private/tmp/claude-501/-Users-joell-dev-hackingforgood/ec10d97d-aa6f-41f2-a6de-48b008132cd5/scratchpad/icons (word/media). Text is only the header line "Flaticon - https://www.flaticon.com/" (hyperlink) plus auto alt-text (Dutch Word auto-captions: "Afbeelding met ... Automatisch gegenereerde beschrijving"). 17 images, one per paragraph, in order (rId5..rId21 = image1..image17). It is an icon library for child-friendly ICFs, attribution to Flaticon (licence requires crediting).

Ordering and discernible content (my viewing):
1. image1.png (427x427) radiotherapy/linear accelerator with patient, line-art coloured
2. image2.png (512) same concept, flat style (accelerator + lying patient, green dots)
3. image3.png (512) radiotherapy machine, beam on patient, outline style
4. image4.png (512) radiotherapy machine, beam, flat style (same as 3 without outline)
5. image5.png (512) radiation/CT-like scanner with patient, purple/teal line style
6. image6.png (512) medication: pill bottle, capsule, tablet
7. image7.png (512) MRI/CT scanner tube with patient lying on table
8. image8.png (381x406) patient in armchair with IV drip stand and pump (chemotherapy/infusion)
9. image9.png (509x589) smiling child with red beanie, IV bag with green cross, heart on shirt (child with cancer on drip)
10. image10.png (530x581) man with tumour cells magnified in circle (tumour/biopsy, cell)
11. image11.png (374) hand-drawn computer with video and web pages, keyboard, mouse (online info/questionnaire/website)
12. image12.png (345x352) document checklist with magnifier and green check (screening/checking eligibility/review)
13. image13.jpeg (434x562) black-and-white drawing of nurse bringing cups to a child in a hospital bed with IV (hospital stay/taking medication); a colouring-page style, not Flaticon-style
14. image14.png (499x464) doctor with stethoscope and clipboard examining patient lying on bed (medical check-up/consultation)
15. image15.png (510x525) four people around table with speech bubbles, one with a "x" bubble (discussing, deciding together/saying no)
16. image16.png (375x382) test tube with magnifier and blood drop (blood test/sample analysis)
17. image17.wmf (Windows metafile; alt-text "MC900134551[1]" = Microsoft Office clipart ID) not viewable here; generic clipart, probably an extra decoration.
Observations: icons 1-4 are redundant radiotherapy variants (choose a style); 5-8 themes: radiotherapy, scan (MRI), medication, infusion; 9-10 patient/disease; 11-16 procedure/communication/tests; no captions or labels; no mapping to specific ICF sections in the file itself (a pool to choose from). Mixed styles (flat, outline, hand-drawn, b/w) and sizes; images are 512x512 PNGs for Flaticon items, ready to embed.

## 6. How icons are used in approved children's ICFs
- Searches of all approved MyKids 8-11 / 12-17 and HEM 8-11 / 12-17 text files for `icon|image|picture|pictogram|[image]` found NO icon placeholders. The converted text does not retain images at all (no image markers), so icon placement cannot be verified from text. Only hits: sponsor original 12-16 has a literal `[image]` (under "Questions and contact", the sponsor's own decorative pictogram); HEM 12-17 line 166 uses "moving picture" in ECG text (irrelevant).
- Checked the approved DOCX binaries (word/media): Forum R1 8-11 EN has 8 pictures (mostly from the Italian sponsor original: Italian/Dutch auto alt-texts, one Vecteezy hand drawing, one WMF clipart), placed as floating images near question headings such as "TO WHOM CAN YOU ASK QUESTIONS?"; Biomede 8-11 EN has 4; HEM-iSmart sub D 8-11 has none. So 4-8 small pictures next to section questions is the norm, and some forms have none.
- Implemented in ICF Studio: illustration library (13 tagged icons from this pool + uploads), auto-placement by section topic (docs/api-contract.md, "Illustrations"). On HEM-iSmart 8-11 it places 5 sensible icons (checklist / medicines / blood test / deciding / questions); on R1 8-11 only sections without a picture get one.
- (Older TODO, now done) inspect the approved DOCX binaries (bucket/.../Approved ICFs/*.docx) via unzip -l word/media to see whether the approved 8-11/12-17 files embed icons, and which of the Flaticon images are used and where (e.g. next to "WHICH TESTS WILL BE DONE", treatment, samples). TODO next session; Icons ICFs.docx is likely the shared pool from which icons are picked for the child versions.
- Recommended pipeline behaviour: icon selection by section topic keyword (radiotherapy, medication, MRI/scan, infusion, blood test, questionnaire/computer, doctor visit, discussion with parents), 8-11 primarily, optional for 12-17; keep Flaticon attribution line in the output.

## 7. What makes the non-medical template different from the medical national template
Based on `TMP_ICF_Experiment_Adults_EN_Versie_2.txt` (Ghent University Hospital / Ghent University template, "Experiment" = non-drug research on humans):
- Header block: simple title, official title, Sponsor "Ghent University Hospital OR Ghent University", investigators, DPO (U(Z) Ghent, two named DPO alternatives), "No fault insurance: Allianz Global Corporate & Specialty".
- 3 parts: 1) basic information, 2) additional information, 3) participation form. The CT-College medical model is much longer and organised around IMP, trial phases, randomisation, medicinal-product risks, SUSAR, pharmacovigilance, 2014/536 CTR; the non-medical one is organised around "interventions" ("What does participation include and what interventions take place?", "standard care vs interventions specifically for the study", questionnaires emailed).
- Legal basis differs: law of 7 May 2004 on experiments on the human person, data processing as public interest task/scientific research (GDPR 6.1(e) via footnote [4]) with consent as ethical safeguard (footnote [8] cites 6(1)(a) for processing based on consent); data kept 10 years (not 25).
- Participation form: tick-box statements; mandatory vs optional items (data transfer outside EEA mandatory; biobank continuation and commercial use of pseudonymised data optional; opt-out of incidental findings notification). Medical model typically includes IMP-specific consents.
- Placeholder style: `xxx`, `Enter ... here`, `X OR Y` alternatives, to be filled by the researcher; the pipeline must fill/choose these (about 10+ placeholders detected via grep).
- Uses footnotes [1]..[10] (ethics committee, DPA address Drukpersstraat 35, law references). Converted text contains footnotes at the end.
- MyKids "Non Medical ICF w Intervention" approved ICFs do not follow this template literally (headings follow the CT-College-like list "WHAT ARE YOUR RIGHTS...", Saint-Luc, not Ghent), so templates are a guide, and the approved set shows the real target structure including Belgian standard paragraphs.

## 8. Notable observations for the pipeline
1. Sponsor original may be missing (HEM) or be Dutch-origin and informal (MyKids); approved Belgian output = original text + injected Belgian legal blocks (ethics committee, law refs, insurance, DPO/DPA, number of Belgian sites/participants, national coordinator) + removal of non-participating parts (Part C).
2. Clean vs TC duplicates: skip TC files; Intervention/Observational template duplicates: use one.
3. Four deliverables per study (18+, parents, 12-17, 8-11) in EN (and presumably NL/FR); 8-11 has no sponsor source in MyKids so must be generated from the 12-17 content with a shorter structure and assent form.
4. Approved docs contain leftovers ("To adapt", Word comments, blank phone lines) -> site-specific fields remain placeholders, not errors.
5. Conversion artefacts: lost words ("A is like a big library"), tables flattened/ASCII grids, page headers "page 1 of 11", footers with version/date: strip when comparing.
6. Version/footers use date formats "25 MAR 2025" / "Version 2.0 Dated 25 March 2025" and file naming `STUDY_ICF_LANG_AGE_vX.Y_Clean`; HEM naming `L1 SIS and ICF_sub D_AGE_ENG_v1 0_YYYYMMDD`.
