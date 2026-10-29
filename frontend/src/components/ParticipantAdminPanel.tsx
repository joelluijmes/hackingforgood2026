import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type Language,
  type ParticipantInvitation,
  type ParticipantPersona,
  type ParticipantPortalSettings,
  type ProjectDoc,
} from '../api';
import { isLang } from '../i18n';
import '../participant.css';

const PERSONAS: ParticipantPersona[] = [
  'adult',
  'parent_guardian',
  'adolescent',
  'child',
];
const LANGS: Language[] = ['en', 'nl', 'fr'];
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Props = { projectId: number; docs: ProjectDoc[]; approved: boolean };

export default function ParticipantAdminPanel({
  projectId,
  docs,
  approved,
}: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<ParticipantPortalSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [contact, setContact] = useState('');
  const [urgent, setUrgent] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const x = await api.participantPortal(projectId);
    setData(x);
    return x;
  }, [projectId]);

  useEffect(() => {
    api
      .participantPortal(projectId)
      .then((x) => {
        setData(x);
        setEnabled(x.enabled);
        setContact(x.contact);
        setUrgent(x.urgent_guidance);
      })
      .catch((e) => setError(errText(e)));
  }, [projectId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await api.saveParticipantPortal(projectId, {
        enabled,
        contact,
        urgent_guidance: urgent,
      });
      setSaved(true);
      await reload();
    } catch (err) {
      setError(errText(err));
    }
  }

  return (
    <section className="panel pp-admin">
      <header>
        <h2>{t('pp.admin.title')}</h2>
        <p className="muted">{t('pp.admin.intro')}</p>
      </header>

      <PreviewButtons projectId={projectId} />

      <form className="pp-section" onSubmit={save}>
        <h3>{t('pp.admin.settings')}</h3>
        <label className="pp-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <strong>{t('pp.admin.enable')}</strong>
            <small>{t('pp.admin.enableHint')}</small>
          </span>
        </label>
        <div className="pp-fields">
          <label>
            {t('pp.admin.contact')}
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={t('pp.admin.contactPh')}
            />
          </label>
          <label>
            {t('pp.admin.urgent')}
            <textarea
              rows={3}
              value={urgent}
              onChange={(e) => setUrgent(e.target.value)}
              placeholder={t('pp.admin.urgentPh')}
            />
          </label>
        </div>
        <div className="pp-row">
          <button type="submit" className="btn primary">
            {t('pp.admin.save')}
          </button>
          {saved && <span className="muted">{t('pp.admin.saved')}</span>}
        </div>
      </form>

      <PublishTable
        docs={docs}
        data={data}
        canPublish={enabled && approved}
        approved={approved}
        onChange={async (d, versionId) => {
          setError('');
          try {
            if (versionId === null) await api.unpublishParticipantVersion(d.id);
            else await api.publishParticipantVersion(d.id, versionId);
            await reload();
          } catch (e) {
            setError(errText(e));
          }
        }}
      />

      <Invitations projectId={projectId} onError={setError} />
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** "Preview the portal as ..." button group: opens the staff preview in a new tab. */
function PreviewButtons({ projectId }: { projectId: number }) {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<Language>(
    isLang(i18n.language) ? i18n.language : 'en',
  );
  return (
    <div className="pp-preview">
      <div>
        <h3>{t('pp.preview.title')}</h3>
        <p className="muted">{t('pp.preview.hint')}</p>
      </div>
      <div className="pp-preview-actions">
        <div className="pp-btn-group">
          {PERSONAS.map((p) => (
            <a
              key={p}
              className="btn primary"
              href={`/participant/preview/${projectId}?persona=${p}&lang=${lang}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(`pp.preview.${p}`)}
            </a>
          ))}
        </div>
        <label className="pp-inline">
          {t('pp.preview.language')}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

type PublishTableProps = {
  docs: ProjectDoc[];
  data: ParticipantPortalSettings | null;
  canPublish: boolean;
  approved: boolean;
  onChange: (doc: ProjectDoc, versionId: number | null) => void;
};

function PublishTable({
  docs,
  data,
  canPublish,
  approved,
  onChange,
}: PublishTableProps) {
  const { t } = useTranslation();
  const rows = docs.filter((d) => d.role !== 'sponsor');
  return (
    <div className="pp-section">
      <h3>{t('pp.admin.docsTitle')}</h3>
      <p className="muted">{t('pp.admin.docsHint')}</p>
      {!approved && <p className="error">{t('pp.admin.needApproval')}</p>}
      {rows.length === 0 ? (
        <p className="muted">{t('pp.admin.noDocs')}</p>
      ) : (
        <div className="pp-table" role="table">
          <div className="pp-tr pp-th" role="row">
            <span role="columnheader">{t('pp.admin.colDoc')}</span>
            <span role="columnheader">{t('pp.admin.colVersion')}</span>
            <span role="columnheader">{t('pp.admin.colAction')}</span>
          </div>
          {rows.map((d) => {
            const options = d.versions.filter(
              (v) => v.preview === 'docx' || v.preview === 'pdf',
            );
            const current =
              data?.publications.find((x) => x.doc_id === d.id)?.version_id ??
              null;
            const latest = options[options.length - 1];
            return (
              <div className="pp-tr" role="row" key={d.id}>
                <div className="pp-doc" role="cell">
                  <strong>{d.title}</strong>
                  <span className="chips">
                    {d.language && (
                      <span className="chip lang">
                        {d.language.toUpperCase()}
                      </span>
                    )}
                    {d.icf_type && (
                      <span className="chip">{t(`icfTypes.${d.icf_type}`)}</span>
                    )}
                    {current !== null && (
                      <span className="chip ok">
                        {t('pp.admin.publishedBadge')}
                      </span>
                    )}
                  </span>
                </div>
                <div role="cell">
                  <select
                    aria-label={`${t('pp.admin.colVersion')}: ${d.title}`}
                    disabled={!canPublish}
                    value={current ?? ''}
                    onChange={(e) =>
                      onChange(d, e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">{t('pp.admin.notPublished')}</option>
                    {options.map((v) => (
                      <option value={v.id} key={v.id}>
                        {t('pp.admin.version', { n: v.number })}
                      </option>
                    ))}
                  </select>
                </div>
                <div role="cell">
                  {current !== null ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onChange(d, null)}
                    >
                      {t('pp.admin.unpublish')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!canPublish || !latest}
                      onClick={() => latest && onChange(d, latest.id)}
                    >
                      {t('pp.admin.publish')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Invitations({
  projectId,
  onError,
}: {
  projectId: number;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState<ParticipantInvitation[]>([]);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api
      .participantInvitations(projectId)
      .then(setInvites)
      .catch((e) => onError(errText(e)));
  }, [projectId, onError]);
  useEffect(load, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    onError('');
    setCopied(false);
    try {
      const r = await api.inviteParticipant(projectId, email);
      setLink({
        email: r.email,
        url: `${location.origin}/participant/invite/${r.token}`,
      });
      setEmail('');
      load();
    } catch (err) {
      onError(errText(err));
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard unavailable: the link is visible and selectable */
    }
  }

  return (
    <div className="pp-section">
      <h3>{t('pp.admin.invitesTitle')}</h3>
      <p className="muted">{t('pp.admin.invitesHint')}</p>
      <form className="pp-invite-form" onSubmit={send}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('pp.admin.email')}
          aria-label={t('pp.admin.email')}
        />
        <button type="submit" className="btn primary">
          {t('pp.admin.send')}
        </button>
      </form>
      {link && (
        <div className="pp-newlink">
          <span>{t('pp.admin.newLink', { email: link.email })}</span>
          <div className="pp-row">
            <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn" onClick={() => copy(link.url)}>
              {copied ? t('pp.admin.copied') : t('pp.admin.copy')}
            </button>
          </div>
        </div>
      )}
      {invites.length === 0 ? (
        <p className="muted">{t('pp.admin.noInvites')}</p>
      ) : (
        <ul className="pp-invites">
          {invites.map((i, n) => (
            <li key={`${i.email}-${i.expires_at}-${n}`}>
              <span className="pp-invite-mail">{i.email}</span>
              <span className="muted">
                {t('pp.admin.expires', {
                  date: new Date(i.expires_at).toLocaleDateString(),
                })}
              </span>
              <span
                className={`chip ${i.status === 'accepted' ? 'ok' : i.status === 'expired' ? 'bad' : 'warn'}`}
              >
                {t(`pp.admin.status_${i.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
