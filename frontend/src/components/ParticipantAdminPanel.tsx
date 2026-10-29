import { useEffect, useState } from 'react';
import { api, type ParticipantPortalSettings, type ProjectDoc } from '../api';

export default function ParticipantAdminPanel({
  projectId,
  docs,
  approved,
}: {
  projectId: number;
  docs: ProjectDoc[];
  approved: boolean;
}) {
  const [data, setData] = useState<ParticipantPortalSettings | null>(null);
  const [contact, setContact] = useState('');
  const [urgent, setUrgent] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api
      .participantPortal(projectId)
      .then((x) => {
        setData(x);
        setEnabled(x.enabled);
        setContact(x.contact);
        setUrgent(x.urgent_guidance);
      })
      .catch((e) => setError(String(e)));
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
      setData(await api.participantPortal(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function publish(d: ProjectDoc, versionId: number | null) {
    setError('');
    try {
      if (versionId === null) await api.unpublishParticipantVersion(d.id);
      else await api.publishParticipantVersion(d.id, versionId);
      setData(await api.participantPortal(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInvite('');
    try {
      const r = await api.inviteParticipant(projectId, email);
      setInvite(`${location.origin}/participant/invite/${r.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <section className="panel participant-admin">
      <h2>Participant portal</h2>
      <p className="muted">
        Only explicitly published versions of participant documents are visible
        after an invited participant signs in.
      </p>
      {!approved && (
        <p className="error">
          Approve the trial before publishing participant documents.
        </p>
      )}
      <form onSubmit={save}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{' '}
          Enable participant sign-in for this trial
        </label>
        <label>
          Trial team contact
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email or phone number"
          />
        </label>
        <label>
          Urgent-help instructions
          <textarea
            rows={3}
            value={urgent}
            onChange={(e) => setUrgent(e.target.value)}
            placeholder="Tell participants what to do in an emergency"
          />
        </label>
        <button type="submit" className="btn primary">
          Save portal settings
        </button>
        {saved && <span className="muted">Saved</span>}
      </form>
      <h3>Published document versions</h3>
      {docs
        .filter((d) => d.role !== 'sponsor')
        .map((d) => {
          const current =
            data?.publications.find((x) => x.doc_id === d.id)?.version_id ??
            null;
          return (
            <div className="publish-row" key={d.id}>
              <strong>{d.title}</strong>
              <select
                aria-label={`Published version for ${d.title}`}
                disabled={!enabled || !approved}
                value={current ?? ''}
                onChange={(e) =>
                  publish(d, e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Not published</option>
                {d.versions
                  .filter((v) => v.preview === 'docx' || v.preview === 'pdf')
                  .map((v) => (
                    <option value={v.id} key={v.id}>
                      Version {v.number}
                    </option>
                  ))}
              </select>
            </div>
          );
        })}
      <form className="invite-form" onSubmit={sendInvite}>
        <h3>Invite a participant</h3>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="btn">
          Create invitation link
        </button>
      </form>
      {invite && (
        <p className="invite-link">
          Share this private link with the participant:{' '}
          <a href={invite}>{invite}</a>
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
