import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  api,
  type Language,
  type ParticipantAskBody,
  type ParticipantDocument,
  type ParticipantDocumentContent,
  type ParticipantPersona,
  type ParticipantReply,
} from '../api';
import { useAuth } from '../components/AuthContext';
import { isLang } from '../i18n';
import '../participant.css';

type Trial = { id: number; name: string; study: string };
type Turn = { role: 'user' | 'assistant'; text: string };
const PERSONAS: ParticipantPersona[] = [
  'adult',
  'parent_guardian',
  'adolescent',
  'child',
];
const LANGS: Language[] = ['en', 'nl', 'fr'];
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Where the portal gets its data: real participant endpoints or the staff preview. */
type Source = {
  documents: (
    persona: ParticipantPersona,
    lang: Language,
  ) => Promise<{ documents: ParticipantDocument[]; demo: boolean }>;
  document: (
    id: number,
    persona: ParticipantPersona,
    lang: Language,
  ) => Promise<ParticipantDocumentContent>;
  ask: (b: ParticipantAskBody) => Promise<ParticipantReply>;
};

const participantSource = (trial: number): Source => ({
  documents: async () => ({
    documents: await api.participantDocuments(trial),
    demo: false,
  }),
  document: (id) => api.participantDocument(trial, id),
  ask: (b) => api.participantAsk(trial, b),
});

const previewSource = (project: number): Source => ({
  documents: async (persona, lang) => {
    const r = await api.portalPreviewDocuments(project, persona, lang);
    return { documents: r.documents, demo: r.demo };
  },
  document: (id, persona, lang) =>
    api.portalPreviewDocument(project, id, persona, lang),
  ask: (b) => api.portalPreviewAsk(project, b),
});

export default function ParticipantPortal() {
  const { token: inviteToken, projectId } = useParams();
  const { user } = useAuth();
  if (projectId) return <PreviewEntry projectId={Number(projectId)} />;
  if (inviteToken && !user) return <AcceptInvite token={inviteToken} />;
  if (!user) return <SignIn />;
  return <RealPortal />;
}

function PreviewEntry({ projectId }: { projectId: number }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const p = params.get('persona');
  const l = params.get('lang');
  const persona = PERSONAS.find((x) => x === p) ?? 'adult';
  const lang = isLang(l) ? l : 'en';
  if (loading) return <div className="page muted">{t('common.loading')}</div>;
  if (user?.role !== 'staff')
    return (
      <main className="page">
        <p>{t('pp.preview.staffOnly')}</p>
        <Link className="btn primary" to="/login">
          {t('pp.portal.signIn')}
        </Link>
      </main>
    );
  return (
    <PortalView
      source={previewSource(projectId)}
      preview={{ projectId }}
      trialName=""
      initialPersona={persona}
      initialLang={lang}
    />
  );
}

function AcceptInvite({ token }: { token: string }) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.acceptParticipantInvite(token, {
        name,
        password,
        language,
      });
      signIn(r.token, r.user);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="panel login-card" onSubmit={accept}>
        <span className="brand">{t('pp.portal.brand')}</span>
        <h1>{t('pp.portal.setupTitle')}</h1>
        <label>
          {t('pp.portal.name')}
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t('pp.portal.password')}
          <input
            type="password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          {t('pp.portal.language')}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`languagesNative.${l}`)}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {t('pp.portal.createAccount')}
        </button>
      </form>
    </main>
  );
}

function SignIn() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await api.login(email, password);
      if (r.user.role !== 'participant') {
        setError(t('pp.portal.staffOnlyLogin'));
        return;
      }
      signIn(r.token, r.user);
    } catch (err) {
      setError(errText(err));
    }
  }

  return (
    <main className="login">
      <form className="panel login-card" onSubmit={login}>
        <span className="brand">{t('pp.portal.brand')}</span>
        <h1>{t('pp.portal.signInTitle')}</h1>
        <p className="muted">{t('pp.portal.signInHint')}</p>
        <label>
          {t('pp.portal.email')}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {t('pp.portal.password')}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary">
          {t('pp.portal.signIn')}
        </button>
      </form>
    </main>
  );
}

function RealPortal() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [trial, setTrial] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'participant') return;
    api
      .participantTrials()
      .then((x) => {
        setTrials(x);
        setTrial(x[0]?.id ?? null);
      })
      .catch((e) => setError(errText(e)));
  }, [user]);

  if (user?.role !== 'participant') return <StaffAccountNotice />;
  const current = trials.find((x) => x.id === trial);
  return (
    <>
      {error && <p className="error">{error}</p>}
      {trial === null ? (
        <main className="page participant-portal">
          <p className="empty">{t('pp.portal.noTrials')}</p>
        </main>
      ) : (
        <PortalView
          key={trial}
          source={participantSource(trial)}
          trialName={current?.name ?? ''}
          trials={trials}
          trialId={trial}
          onTrial={setTrial}
          initialPersona="adult"
          initialLang={isLang(i18n.language) ? i18n.language : 'en'}
        />
      )}
    </>
  );
}

function StaffAccountNotice() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  return (
    <main className="page">
      <p>{t('pp.portal.staffAccount')}</p>
      <button type="button" className="btn" onClick={signOut}>
        {t('pp.portal.signOut')}
      </button>
    </main>
  );
}

type PortalViewProps = {
  source: Source;
  trialName: string;
  initialPersona: ParticipantPersona;
  initialLang: Language;
  preview?: { projectId: number };
  trials?: Trial[];
  trialId?: number;
  onTrial?: (id: number) => void;
};

function PortalView({
  source,
  trialName,
  initialPersona,
  initialLang,
  preview,
  trials = [],
  trialId,
  onTrial,
}: PortalViewProps) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [persona, setPersona] = useState(initialPersona);
  const [language, setLanguage] = useState(initialLang);
  const [docs, setDocs] = useState<ParticipantDocument[]>([]);
  const [demo, setDemo] = useState(false);
  const [doc, setDoc] = useState<ParticipantDocumentContent | null>(null);
  const [previewTrial, setPreviewTrial] = useState('');
  const [error, setError] = useState('');

  // In the preview the visible documents depend on persona and language.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when the audience changes
  useEffect(() => {
    source
      .documents(persona, language)
      .then((r) => {
        setDocs(r.documents);
        setDemo(r.demo);
      })
      .catch((e) => setError(errText(e)));
    if (preview)
      api
        .getProject(preview.projectId)
        .then((p) => setPreviewTrial(p.name))
        .catch(() => undefined);
  }, [persona, language, preview?.projectId]);

  async function open(id: number) {
    setError('');
    try {
      setDoc(await source.document(id, persona, language));
    } catch (e) {
      setError(errText(e));
    }
  }

  function changeAudience(p: ParticipantPersona, l: Language) {
    setPersona(p);
    setLanguage(l);
    setDoc(null);
  }

  function exitPreview(id: number) {
    if (window.opener) window.close();
    navigate(`/projects/${id}`);
  }

  const title = trialName || previewTrial || t('pp.portal.yourTrials');
  return (
    <main className="page participant-portal">
      {preview && (
        <div className="pp-banner" role="status">
          <span>
            <strong>
              {t('pp.preview.banner', {
                persona: t(`pp.preview.${persona}`).toLowerCase(),
              })}
            </strong>
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => exitPreview(preview.projectId)}
          >
            {t('pp.preview.exit')}
          </button>
        </div>
      )}
      <header className="page-head">
        <div>
          <span className="eyebrow">{t('pp.portal.eyebrow')}</span>
          <h1>{title}</h1>
          <p className="muted">{t('pp.portal.shared')}</p>
        </div>
        {!preview && (
          <button type="button" className="btn ghost" onClick={signOut}>
            {t('pp.portal.signOut')}
          </button>
        )}
      </header>
      {error && <p className="error">{error}</p>}
      {trials.length > 1 && (
        <label className="pp-inline">
          {t('pp.portal.trial')}
          <select
            value={trialId ?? ''}
            onChange={(e) => onTrial?.(Number(e.target.value))}
          >
            {trials.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {demo && <p className="pp-demo">{t('pp.preview.demo')}</p>}
      <section className="participant-layout">
        <DocumentList
          docs={docs}
          onOpen={open}
          emptyText={preview ? t('pp.preview.noDocs') : t('pp.portal.noDocs')}
        />
        <Interpreter
          source={source}
          persona={persona}
          language={language}
          onAudience={changeAudience}
          onOpen={open}
        />
      </section>
      {doc && <Reader doc={doc} onClose={() => setDoc(null)} />}
    </main>
  );
}

function DocumentList({
  docs,
  onOpen,
  emptyText,
}: {
  docs: ParticipantDocument[];
  onOpen: (id: number) => void;
  emptyText: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="panel">
      <h2>{t('pp.portal.docsTitle')}</h2>
      {docs.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        docs.map((d) => (
          <button
            type="button"
            className="participant-doc"
            key={d.id}
            onClick={() => onOpen(d.id)}
          >
            <strong>{d.title}</strong>
            <span>
              {t('pp.portal.version', { n: d.version_number })}
              {d.icf_type ? ` · ${t(`icfTypes.${d.icf_type}`)}` : ''}
              {d.language ? ` · ${d.language.toUpperCase()}` : ''}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function Interpreter({
  source,
  persona,
  language,
  onAudience,
  onOpen,
}: {
  source: Source;
  persona: ParticipantPersona;
  language: Language;
  onAudience: (p: ParticipantPersona, l: Language) => void;
  onOpen: (docId: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Turn[]>([]);
  const [reply, setReply] = useState<ParticipantReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const q = question.trim();
      const answer = await source.ask({
        question: q,
        persona,
        language,
        history: history.slice(-10),
      });
      setReply(answer);
      setHistory((h) =>
        [
          ...h,
          { role: 'user' as const, text: q },
          { role: 'assistant' as const, text: answer.explanation },
        ].slice(-12),
      );
      setQuestion('');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  const jump = (docId: number, sectionId: string) =>
    onOpen(docId).then(() =>
      setTimeout(
        () =>
          document
            .getElementById(sectionId)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        100,
      ),
    );

  return (
    <div className="panel participant-chat">
      <h2>{t('pp.portal.askTitle')}</h2>
      <fieldset className="pp-choice">
        <legend>{t('pp.portal.askingAs')}</legend>
        <div className="pp-btn-group">
          {PERSONAS.map((p) => (
            <button
              type="button"
              key={p}
              className={`btn pp-pill${p === persona ? ' on' : ''}`}
              aria-pressed={p === persona}
              onClick={() => onAudience(p, language)}
            >
              {t(`pp.portal.${p}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="pp-choice">
        <legend>{t('pp.portal.answerIn')}</legend>
        <div className="pp-btn-group">
          {LANGS.map((l) => (
            <button
              type="button"
              key={l}
              className={`btn pp-pill${l === language ? ' on' : ''}`}
              aria-pressed={l === language}
              onClick={() => onAudience(persona, l)}
            >
              {t(`languagesNative.${l}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {history.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: chat turns are append-only
        <p className={`chat-turn ${m.role}`} key={i}>
          <strong>
            {m.role === 'user' ? t('pp.portal.you') : t('pp.portal.guide')}:
          </strong>{' '}
          {m.text}
        </p>
      ))}
      <form onSubmit={ask}>
        <label>
          {t('pp.portal.question')}
          <textarea
            required
            maxLength={3000}
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('pp.portal.questionPh')}
          />
        </label>
        <button
          type="submit"
          className="btn primary"
          disabled={busy || !question.trim()}
        >
          {busy ? t('pp.portal.thinking') : t('pp.portal.ask')}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {reply && (
        <article className="participant-answer">
          {reply.source_references.length > 0 && (
            <div>
              <strong>{t('pp.portal.sources')}</strong>
              {reply.source_references.map((r, i) => (
                <button
                  type="button"
                  className="citation-link"
                  // biome-ignore lint/suspicious/noArrayIndexKey: references may repeat a section
                  key={`${r.version_id}-${r.section_id}-${i}`}
                  onClick={() => jump(r.doc_id, r.section_id)}
                >
                  {r.title} · {r.heading}
                </button>
              ))}
            </div>
          )}
          {reply.requires_human_followup && (
            <p className="muted">{t('pp.portal.followup')}</p>
          )}
        </article>
      )}
    </div>
  );
}

function Reader({
  doc,
  onClose,
}: {
  doc: ParticipantDocumentContent;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="panel participant-reader">
      <div className="page-head">
        <div>
          <h2>{doc.title}</h2>
          <p className="muted">
            {t('pp.portal.publishedVersion', { n: doc.version_number })}
          </p>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          {t('pp.portal.close')}
        </button>
      </div>
      {doc.sections.map((s) => (
        <article
          id={s.section_id}
          className="participant-section"
          key={s.section_id}
        >
          <h3>{s.heading}</h3>
          <p>{s.text}</p>
        </article>
      ))}
    </section>
  );
}
