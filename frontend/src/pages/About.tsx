import { Link } from 'react-router-dom';
import '../about.css';

type Status = 'done' | 'partial' | 'todo';

const FLOW: {
  title: string;
  text: string;
  who: 'app' | 'manual' | 'external';
}[] = [
  {
    title: 'Receive sponsor documents',
    text: 'Upload docx, doc, rtf or pdf per study.',
    who: 'manual',
  },
  {
    title: 'Create English ICFs',
    text: 'AI fills the Belgian template for all four ICF types.',
    who: 'app',
  },
  {
    title: 'PI review',
    text: 'Export, review in Word, upload back, or approve as is.',
    who: 'external',
  },
  {
    title: 'Translate to NL and FR',
    text: 'Mixed translation into the Belgian NL/FR templates.',
    who: 'app',
  },
  {
    title: 'Ethics committee',
    text: 'Bulk download, upload reviewed copies, repeat.',
    who: 'external',
  },
  {
    title: 'Approval',
    text: 'Final versions for all types and languages.',
    who: 'manual',
  },
];

const MODES = [
  {
    name: 'Creation',
    text: 'Sponsor documents + the Belgian national template become English ICFs (adult, parent, adolescent, child) as Word files. Gaps and edits to mandatory text are flagged as comments.',
    where: 'Project, Drafting stage',
  },
  {
    name: 'Translation',
    text: 'The reviewed English ICF fills the NL or FR national template, so mandatory wording stays in the official language of the template.',
    where: 'Project, after PI review',
  },
  {
    name: 'Update',
    text: 'Upload an existing ICF in any language and rebuild it on the latest template version.',
    where: 'Project, Languages, uploaded ICF',
  },
];

const INVENTORY: { group: string; items: [string, Status, string?][] }[] = [
  {
    group: 'Core pipeline',
    items: [
      [
        'Upload sponsor documents (docx, doc, rtf, pdf)',
        'done',
        'rtf/doc converted on upload',
      ],
      [
        'AI generation on the Belgian template (Vertex AI Gemini)',
        'done',
        'blue placeholders filled, red guidance removed, purple text kept',
      ],
      ['Creation always in English; NL/FR only after PI review', 'done'],
      [
        'Mixed translation into NL/FR templates',
        'done',
        'template language kept, content translated',
      ],
      ['Update mode: rebuild an uploaded ICF on the latest template', 'done'],
      ['Generate all ICFs / Translate all in one click', 'done'],
      ['Parallel generation (about 6-14 s per document)', 'done'],
      [
        'Adult, parent, adolescent and child ICF types',
        'partial',
        'adolescent and child still use the adult template; no tone adaptation yet',
      ],
      [
        'HIRUZ templates for adolescent and child',
        'todo',
        'templates not found in the bucket',
      ],
      ['Illustrations / image placeholders for child ICFs', 'todo'],
    ],
  },
  {
    group: 'Review',
    items: [
      ['Word comments and tracked changes rendered in the browser', 'done'],
      ['Comments extracted in EN/NL/FR, translated to your language', 'done'],
      [
        'Gap comments only for real missing information; fills shown as highlights',
        'done',
      ],
      [
        'Select text and add a manual comment (written back as a Word comment)',
        'done',
      ],
      [
        'Staged review: provide text, resolve, dismiss, then apply as one batch',
        'done',
      ],
      ['Version diff', 'done'],
      [
        'Read-only ICF interpreter: ask questions about a document, answers cite the sections',
        'done',
        'in the document view, Interpreter tab',
      ],
      [
        'PI Edit with AI chat (tracked changes) and batch propagation to other languages',
        'done',
      ],
      ['Approve a document as is, without a commented copy', 'done'],
    ],
  },
  {
    group: 'Workflow',
    items: [
      [
        'Stage tracker: Intake, Drafting, PI review, Ethics review, Approved',
        'done',
      ],
      ['Requirement gates with Skip anyway', 'done'],
      ['Stage-aware step card and checklist', 'done'],
      ['Document status chips follow the stage', 'done'],
      ['Language table appears only after PI review', 'done'],
      [
        'Bulk zip download for ethics, reviewed copies uploaded back per document',
        'done',
      ],
      [
        'One progress banner for background tasks, auto-dismiss when done',
        'done',
      ],
    ],
  },
  {
    group: 'Platform',
    items: [
      ['Template library with language families and versions', 'done'],
      ['UI in EN, NL and FR', 'done', 'this page is English only'],
      ['Login (demo user) and per-user language', 'done'],
      ['Admin: system status, sample import, reset', 'done'],
      ['Files in GCS bucket or local disk; SQLite for metadata', 'done'],
      ['Backend Dockerfile with LibreOffice', 'done'],
      ['Frontend deployment', 'todo'],
      ['Google Drive converter fallback', 'todo'],
      ['Quality review of AI-filled text against approved ICFs', 'todo'],
      ['Multi-user roles and permissions, audit trail', 'todo'],
    ],
  },
];

const STEPS: { title: string; text: string; to?: string; cta?: string }[] = [
  {
    title: 'Sign in',
    text: 'Demo account demo@bspho.be / demo1234. The interface language follows your account setting (EN, NL, FR).',
  },
  {
    title: 'Check the templates',
    text: 'The Belgian EN/NL/FR national templates live in the library. Admin can import the bucket samples or reset everything.',
    to: '/templates',
    cta: 'Open templates',
  },
  {
    title: 'Create a project',
    text: 'One project per study, for example FORUM2 or BIOMEDE 2.0. Upload the sponsor documents.',
    to: '/projects',
    cta: 'Open projects',
  },
  {
    title: 'Generate the English ICFs',
    text: 'Move to Drafting and use Generate all ICFs. It takes seconds per document and you can keep working.',
  },
  {
    title: 'Review',
    text: 'Open a draft, work through the gap comments (provide text, or leave as placeholder), stage your changes and apply them in one go. Or export to Word and upload the reviewed copy.',
  },
  {
    title: 'Translate and send to ethics',
    text: 'After PI review the NL/FR columns unlock: Translate all, then download everything as a zip for the committee and upload reviewed copies back.',
  },
];

const LABEL: Record<Status, string> = {
  done: 'Done',
  partial: 'Partial',
  todo: 'Not yet',
};

export default function About() {
  const all = INVENTORY.flatMap((g) => g.items);
  const count = (s: Status) => all.filter((i) => i[1] === s).length;

  return (
    <div className="page home about">
      <section className="hero">
        <p className="eyebrow">Guide and inventory</p>
        <h1>What is inside BLOOM Studio</h1>
        <p className="lead">
          Turns sponsor documents into Belgian-compliant informed consent forms
          for paediatric haemato-oncology trials. Four ICF types, three
          languages, Word in and Word out, with every gap and every edit to
          mandatory text flagged for human review.
        </p>
        <div className="row">
          <Link to="/projects" className="btn primary">
            Open projects
          </Link>
          <Link to="/templates" className="btn">
            Browse templates
          </Link>
        </div>
        <div className="hero-stats">
          <div>
            <b>4</b>
            <span>ICF types</span>
          </div>
          <div>
            <b>3</b>
            <span>languages</span>
          </div>
          <div>
            <b>3</b>
            <span>modes</span>
          </div>
          <div>
            <b>{count('done')}</b>
            <span>features done</span>
          </div>
        </div>
      </section>

      <section>
        <h2>How a study moves through the app</h2>
        <ol className="flow">
          {FLOW.map((s, i) => (
            <li key={s.title} className={`who-${s.who}`}>
              <span className="n">{i + 1}</span>
              <b>{s.title}</b>
              <small>{s.text}</small>
            </li>
          ))}
        </ol>
        <p className="muted small legend">
          <span className="dot who-app" /> done by the app
          <span className="dot who-manual" /> manual BSPHO step
          <span className="dot who-external" /> external party (PI, ethics
          committee)
        </p>
      </section>

      <section>
        <h2>Three modes</h2>
        <div className="grid3">
          {MODES.map((m) => (
            <div key={m.name} className="card tile">
              <h3>{m.name}</h3>
              <p>{m.text}</p>
              <span className="chip">{m.where}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Getting started</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <div>
                <b>{s.title}</b>
                <p>{s.text}</p>
              </div>
              {s.to && (
                <Link to={s.to} className="btn ghost">
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="inv-head">
          <h2>What we have</h2>
          <div className="chips">
            <span className="chip st-ok">{count('done')} done</span>
            <span className="chip st-warn">{count('partial')} partial</span>
            <span className="chip st-neutral">{count('todo')} not yet</span>
          </div>
        </div>
        <div className="grid2">
          {INVENTORY.map((g) => (
            <div key={g.group} className="card tile">
              <h3>{g.group}</h3>
              <ul className="inv">
                {g.items.map(([name, status, note]) => (
                  <li key={name}>
                    <span
                      className={`chip st-${status === 'done' ? 'ok' : status === 'partial' ? 'warn' : 'neutral'}`}
                    >
                      {LABEL[status]}
                    </span>
                    <span>
                      {name}
                      {note && <small className="muted"> · {note}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Good to know</h2>
        <ul className="know">
          <li>
            AI output is a draft. Every filled passage is highlighted and every
            gap is a comment, but a person decides what goes to the ethics
            committee.
          </li>
          <li>
            Site-specific fields (contacts, site name, insurer details) stay as
            placeholders; the app never invents them.
          </li>
          <li>
            Files live in the GCS bucket (or on local disk); the SQLite database
            holds metadata only, and Admin can reset it.
          </li>
        </ul>
      </section>
    </div>
  );
}
