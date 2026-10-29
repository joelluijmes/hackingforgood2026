## Slide 1

![](ppt/media/image5.png "Google Shape;89;p13")

![BSPHO](ppt/media/image6.png "Google Shape;91;p13")

BSPHO  & Solve with Google

Use Case: ICF Preparation

29  October 2026

## What is an ICF and why is it used? {#slide-2}

 Informed Consent Form (ICF)

- D escribes all aspects of the the clinical study to the potential participant, including treatments and procedures (e.g. blood draw, biopsy) 
- M andatory part of Good Clinical Practices, to preserve the safety and integrity of study participants
- D ocuments that the participant has properly understood the study and what is required of them

![BSPHO](ppt/media/image6.png "Google Shape;100;p14")

## The different types of ICF {#slide-3}

- A dults : some  paediatric  studies may recruit adult or young adult patients or an active participant becomes an adult
- P arents : for minors, the legal signature must be provided by the parents of the participant
- A dolescents (12-17 years) : describes the study in simpler language and is more limited when it comes to administrative information like insurance
- C hildren (8-11 years) : shortened version (2 pages), very basic and high level information, with illustrations

![BSPHO](ppt/media/image6.png "Google Shape;108;p15")

## The Main Stakeholders {#slide-4}

- Sponsor : the organisation that is conducting and coordinating the research study on an international level
- Ethics Committee:  a   group of independent, impartial, and multi-disciplinary individuals tasked with reviewing, advising, and guiding an organization on ethical issues. They promote ethical decision-making, maintain integrity, and protect the interests of stakeholders. They review the submission documents for a study, and pay extra attention to the ICFs.

![BSPHO](ppt/media/image6.png "Google Shape;116;p16")

## The Main Stakeholders {#slide-5}

- National Coordinating Center  (NCC): the hospital who takes responsibility of the study within a country. The physician responsible at the national level, the Principal Investigator, is part of the NCC.
- Belgian Society for Paediatric Haemato-Oncology  (BSPHO): a non profit organisation collaborating with the 7 paediatric haemato-oncology centers in Belgium. They prepare the documents for submission to the ethics committee and competent authorities.
- Participating sites : hospital departments that participate in the study

![BSPHO](ppt/media/image6.png "Google Shape;124;p17")

## Adult ICF Creation {#slide-6}

- Uses a mandatory template specific to Belgium

<!-- -->

- Consists of mandatory, modifiable, and optional parts

<!-- -->

- Must be drafted in English, Dutch and French

<!-- -->

- The English version is sent to the Principal Investigator, manually amended if necessary, and then translated into Dutch and French for submission to the ethics committee

<!-- -->

- Based on documents provided by the study sponsor

<!-- -->

- Can be  one or several documents

<!-- -->

- Amended with additional free-form administrative information

<!-- -->

- E.g. insurance provider, responsible principal investigator

![BSPHO](ppt/media/image6.png "Google Shape;132;p18")

## The Belgian ICF Template {#slide-7}

- The mandatory Belgian template assumes commercial studies performed on adults and does not fully fit the context of paediatric academic studies

<!-- -->

- Some adaptation of the mandatory text might be required
- E.g. ICFs assume the study of a new molecule, whereas paediatric studies use existing molecules on a new target audience, namely minors

<!-- -->

- The template is very specific and must be adhered to in the three required languages, making direct translation infeasible
- 40+ pages of template text and instructions, interleaved between each other, resulting in a complex document
- Changes over time, sometimes existing ICFs need to be updated

![BSPHO](ppt/media/image6.png "Google Shape;140;p19")

## Parental ICF Creation {#slide-8}

- Adapted from the Adult ICF

- Your disease, treatment, doctor 

🡪 Your child's disease, treatment, doctor, ...

- I will adhere to a proper form of contraception 

🡪 I understand the importance of contraception and will inform my child adequately so he / she adheres to the recommendations

![BSPHO](ppt/media/image6.png "Google Shape;148;p20")

## Adolescent ICF Creation {#slide-9}

- Adapted from the adolescent ICF provided by the sponsor, using a template from the Health, Innovation and Research Institute at UZ Gent (HIRUZ)

- Contains simplified language, adapted to 12-17 year olds
- More informal in nature, omitting administrative information

![BSPHO](ppt/media/image6.png "Google Shape;156;p21")

## Children's ICF Creation {#slide-10}

![BSPHO](ppt/media/image6.png "Google Shape;163;p22")

- Adapted from the children's ICF provided by the sponsor, using a template from HIRUZ
- Contains simplified language, adapted to 8-11 year olds
- More informal in nature, omitting administrative information
- Includes explanatory, age appropriate illustrations 

## ICF Types Overview {#slide-11}

![BSPHO](ppt/media/image6.png "Google Shape;176;p23")

## Desired Flow {#slide-12}

![BSPHO](ppt/media/image6.png "Google Shape;219;p24")

Receive sponsor documents

Create English ICFs

Review by Principal Investigator

Adjustments based on feedback

Translate EN ICFs into FR & NL

Upload new version of templates

Update previously created ICFs

Review by Ethics Committee

Adjustments based on feedback

Approval

## Solution Analysis: Must Have {#slide-13}

- Web application, ready to deploy in various environments
- Contains ICF templates, with the option to upload new versions
- Three modes: creation, translation, update
- ICF Creation Mode:

<!-- -->

- Accepts as input: sponsor documents, additional information	

<!-- -->

- Provided as doc(x), pdf, &  freeform  text

<!-- -->

- Produces as output: the four types of ICF, in English, doc(x) format
- Uses the input documents to fill in and complete the ICF template
- Clearly indicates any edits to mandatory text and/or gaps due to lack of information for human review
- Uses illustrations available for free use or placeholders for children's ICFs

![BSPHO](ppt/media/image6.png "Google Shape;256;p25")

## Solution Analysis: Must Have {#slide-14}

- ICF Translation Mode:

<!-- -->

- Accepts as input: the four types of ICF, in English
- Produces as output: the four types of ICF, in Dutch and French
- ! Translation mode input can be different from creation mode output due to manual changes during the review process
- ! Mixed translation: use the mandatory language in the NL & FR ICF templates and add translated text from the English input to complete the template

<!-- -->

- ICF Update Mode:

<!-- -->

- Accepts as input: the four types of ICF, in EN, FR, and NL, made using a previous version of the templates
- Produces as output:  the updated versions of the four types of ICF, in EN, FR, and NL, made using the latest version of the templates

![BSPHO](ppt/media/image6.png "Google Shape;264;p26")

## Solution Analysis: Nice to Have {#slide-15}

- Interactive creation experience: live human-in-the-loop escalations to provide additional information or guidance during the creation of the ICFs instead of manual post-processing
- Image generation to create illustrations for children's ICFs
- Text simplification feature: a separate tool in the web app to help researchers simplify jargon into easy to understand text
- Text translation feature: a separate tool in the web app for translating plain text between any of the required languages
- ICF generation for studies not involving medicine, which uses a different set of templates (observational or with interventions)

![BSPHO](ppt/media/image6.png "Google Shape;272;p27")

## Provided Sources {#slide-16}

- Belgian ICF template for adults in EN, FR, NL
- HIRUZ templates for adolescents and children in EN, FR, NL
- HIRUZ templates for non-medication studies in EN, FR, NL
- Previously created ICFs, including sponsor documents
- Sample illustrations used for children's ICFs

![BSPHO](ppt/media/image6.png "Google Shape;280;p28")

## Advice {#slide-17}

- The Belgian ICF template is a complex document that combines guidance,  instructions ,  mandatory text ,  proposed text , and  placeholder text  in a single document, indicated with different colors and provided as a docx file
- Review the template so you know how it is structured, which can give you ideas on how it can be broken down into something for modular use within an application
- Include this transformation in your application logic, so it can be reused for future template updates

![BSPHO](ppt/media/image6.png "Google Shape;288;p29")
