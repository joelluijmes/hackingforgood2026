import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  api,
  type InterpreterContext,
  type InterpreterOperation,
  type InterpreterPersona,
  type InterpreterReply,
  type Lang,
  type Language,
} from '../api';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  operation?: InterpreterOperation;
  reply?: InterpreterReply;
  versionLabel?: string;
};

const OPERATIONS: InterpreterOperation[] = [
  'ask',
  'explain',
  'simplify',
  'translate',
  'compare',
  'clarify',
];
const PERSONAS: InterpreterPersona[] = [
  'pi',
  'ethical_reviewer',
  'parent_guardian',
  'adult',
  'adolescent',
  'child',
];

export default function InterpreterPanel({
  icfId,
  uiLanguage,
}: {
  icfId: number;
  uiLanguage: Lang;
}) {
  const { t } = useTranslation();
  const [context, setContext] = useState<InterpreterContext | null>(null);
  const [operation, setOperation] = useState<InterpreterOperation>('ask');
  const [persona, setPersona] = useState<InterpreterPersona>('adult');
  const [language, setLanguage] = useState<Language>(uiLanguage);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [input, setInput] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<Language>('en');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setContext(null);
    setMessages([]);
    setError('');
    api.interpreterContext(icfId).then(
      (value) => {
        if (!live) return;
        setContext(value);
        setPersona(
          value.icf.icf_type === 'child'
            ? 'child'
            : value.icf.icf_type === 'adolescent'
              ? 'adolescent'
              : value.icf.icf_type === 'parent'
                ? 'parent_guardian'
                : 'adult',
        );
        setVersionId(value.latest_version_id);
        const previous = [...value.versions]
          .reverse()
          .find((version) => version.version_id !== value.latest_version_id);
        setCompareVersionId(previous?.version_id ?? null);
      },
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [icfId]);

  useEffect(() => {
    setLanguage(uiLanguage);
  }, [uiLanguage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger scrolling when turns arrive or generation starts
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);

  const selectedVersion =
    context?.versions.find((version) => version.version_id === versionId) ??
    null;
  const compareVersion =
    context?.versions.find(
      (version) => version.version_id === compareVersionId,
    ) ?? null;
  const selectedVersionLabel = selectedVersion
    ? t('interpreter.versionChoice', { number: selectedVersion.version_number })
    : '';
  const compareVersionLabel = compareVersion
    ? t('interpreter.versionChoice', { number: compareVersion.version_number })
    : '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!context || !versionId || busy) return;
    if (
      !text &&
      (operation === 'ask' || (!sectionId && operation !== 'compare'))
    )
      return;
    setBusy(true);
    setError('');
    try {
      const body = {
        icf_id: icfId,
        version_id: versionId,
        ...(sectionId ? { section_id: sectionId } : {}),
        ...(operation === 'compare' && compareVersionId
          ? { compare_version_id: compareVersionId }
          : {}),
        persona,
        ...(persona === 'child' ? { age_group: '8-11' as const } : {}),
        ...(persona === 'adolescent' ? { age_group: '12-17' as const } : {}),
        language,
        history: messages
          .slice(-12)
          .map(({ role, text: messageText, versionLabel, reply }) => ({
            role,
            text: [
              versionLabel,
              messageText,
              ...(reply?.source_references.map(
                (ref) =>
                  `${t('interpreter.sourceRefPrefix')} ${ref.heading} (v${ref.version_number})`,
              ) ?? []),
            ]
              .filter(Boolean)
              .join('\n'),
          })),
        ...(operation === 'ask' ||
        operation === 'explain' ||
        operation === 'compare'
          ? { question: text }
          : {}),
        ...(operation === 'simplify' || operation === 'translate'
          ? { text }
          : {}),
        ...(operation === 'clarify' ? { term: text, question: text } : {}),
        ...(operation === 'translate'
          ? { source_language: sourceLanguage }
          : {}),
      };
      const result = await api.interpret(operation, body);
      const versionLabel =
        operation === 'compare'
          ? t('interpreter.compareVersionLabels', {
              from: compareVersionLabel,
              to: selectedVersionLabel,
            })
          : selectedVersionLabel;
      const userMessage = {
        id: `${Date.now()}-${messages.length}-user`,
        role: 'user' as const,
        text: text || t('interpreter.compareDefaultQuestion'),
        operation,
        versionLabel,
      };
      const assistantMessage: Message = {
        id: `${Date.now()}-${messages.length}-assistant`,
        role: 'assistant',
        text: result.explanation,
        operation,
        reply: result,
        versionLabel,
      };
      setMessages((previous) => [...previous, userMessage, assistantMessage]);
      setInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(
    context &&
      versionId &&
      selectedVersion?.content_available &&
      !busy &&
      (operation === 'compare' ||
        (operation === 'ask' ? input.trim() : input.trim() || sectionId)) &&
      (operation !== 'compare' ||
        (compareVersionId && compareVersion?.content_available)),
  );

  return (
    <section className="interpreter-shell" aria-label={t('interpreter.title')}>
      <header className="interpreter-head">
        <div className="interpreter-mark" aria-hidden="true">
          i
        </div>
        <div>
          <h2>{t('interpreter.title')}</h2>
          <p>{t('interpreter.intro')}</p>
        </div>
        {messages.length > 0 && (
          <button
            className="interpreter-clear"
            type="button"
            onClick={() => setMessages([])}
          >
            {t('interpreter.clear')}
          </button>
        )}
      </header>

      {error && <p className="error interpreter-error">{error}</p>}
      {!context ? (
        <div className="interpreter-loading muted">{t('common.loading')}</div>
      ) : (
        <>
          <div className="interpreter-context">
            <div className="interpreter-context-title">
              <span className="interpreter-context-dot" />
              <span>{t('interpreter.readOnly')}</span>
              <span className="interpreter-context-sep">·</span>
              <span>{context.icf.title}</span>
            </div>
            <div className="interpreter-controls">
              <label>
                <span>{t('interpreter.persona')}</span>
                <select
                  value={persona}
                  onChange={(e) =>
                    setPersona(e.target.value as InterpreterPersona)
                  }
                >
                  {PERSONAS.map((value) => (
                    <option key={value} value={value}>
                      {t(`interpreter.personas.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('interpreter.responseLanguage')}</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                >
                  {(['en', 'nl', 'fr'] as Language[]).map((value) => (
                    <option key={value} value={value}>
                      {t(`languages.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="interpreter-age-note">
              {(persona === 'child' || persona === 'adolescent') &&
                `${persona === 'child' ? t('interpreter.childAge') : t('interpreter.adolescentAge')} `}
              {t(`interpreter.personaHints.${persona}`)}
            </p>
          </div>

          <div className="interpreter-history-controls">
            <label>
              <span>
                {t(
                  operation === 'compare'
                    ? 'interpreter.toVersion'
                    : 'interpreter.sourceVersion',
                )}
              </span>
              <select
                value={versionId ?? ''}
                onChange={(e) => {
                  setVersionId(Number(e.target.value));
                  setSectionId('');
                }}
              >
                {[...context.versions].reverse().map((version) => (
                  <option
                    key={version.version_id}
                    value={version.version_id}
                    disabled={!version.content_available}
                  >
                    {t('interpreter.versionChoice', {
                      number: version.version_number,
                    })}
                    {version.version_id === context.latest_version_id
                      ? ` · ${t('interpreter.latest')}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            {operation === 'compare' ? (
              <label>
                <span>{t('interpreter.fromVersion')}</span>
                <select
                  value={compareVersionId ?? ''}
                  onChange={(e) => setCompareVersionId(Number(e.target.value))}
                >
                  {context.versions
                    .filter((v) => v.version_id !== versionId)
                    .map((version) => (
                      <option
                        key={version.version_id}
                        value={version.version_id}
                        disabled={!version.content_available}
                      >
                        {t('interpreter.versionChoice', {
                          number: version.version_number,
                        })}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label>
                <span>{t('interpreter.section')}</span>
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  <option value="">{t('interpreter.allSections')}</option>
                  {selectedVersion?.sections.map((section) => (
                    <option key={section.section_id} value={section.section_id}>
                      {section.heading}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {operation === 'translate' && (
              <label>
                <span>{t('interpreter.sourceLanguage')}</span>
                <select
                  value={sourceLanguage}
                  onChange={(e) =>
                    setSourceLanguage(e.target.value as Language)
                  }
                >
                  {(['en', 'nl', 'fr'] as Language[]).map((value) => (
                    <option key={value} value={value}>
                      {t(`languages.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="interpreter-thread" aria-live="polite">
            {messages.length === 0 ? (
              <div className="interpreter-welcome">
                <div className="interpreter-welcome-icon" aria-hidden="true">
                  ✳
                </div>
                <h3>{t('interpreter.welcomeTitle')}</h3>
                <p>{t('interpreter.welcomeBody')}</p>
                <div className="interpreter-suggestions">
                  {[
                    'interpreter.suggestions.sick',
                    'interpreter.suggestions.rights',
                    'interpreter.suggestions.risks',
                  ].map((key) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => {
                        setOperation('ask');
                        setInput(t(key));
                      }}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  className={`interpreter-message ${message.role}`}
                  key={message.id}
                >
                  <div className="interpreter-message-meta">
                    <span>
                      {message.role === 'user'
                        ? t('interpreter.you')
                        : t('interpreter.title')}
                    </span>
                    {message.operation && (
                      <span>
                        {t(`interpreter.operations.${message.operation}`)}
                      </span>
                    )}
                    {message.versionLabel && (
                      <span>{message.versionLabel}</span>
                    )}
                  </div>
                  <p>{message.text}</p>
                  {message.reply && (
                    <div className="interpreter-evidence">
                      {message.reply.source_references.length > 0 && (
                        <div>
                          <strong>{t('interpreter.sources')}</strong>
                          <div className="interpreter-citations">
                            {message.reply.source_references.map((ref) => (
                              <Link
                                key={`${ref.version_id}-${ref.section_id}`}
                                to={`/versions/${ref.version_id}${ref.anchor ? `#${encodeURIComponent(ref.anchor)}` : ''}`}
                                title={ref.heading}
                              >
                                v{ref.version_number} · {ref.heading}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      {message.reply.unanswered_questions.length > 0 && (
                        <div className="interpreter-unanswered">
                          <strong>{t('interpreter.unanswered')}</strong>
                          <ul>
                            {message.reply.unanswered_questions.map(
                              (question) => (
                                <li key={question}>{question}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                      {message.reply.requires_human_followup && (
                        <div className="interpreter-followup">
                          <span aria-hidden="true">!</span>
                          {t('interpreter.followup')}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))
            )}
            {busy && (
              <div className="interpreter-thinking">
                <span className="interpreter-thinking-dot" />
                <span>{t('interpreter.thinking')}</span>
              </div>
            )}
            <div ref={threadEnd} />
          </div>

          {!selectedVersion?.content_available && (
            <p className="muted interpreter-no-content">
              {t('interpreter.noContent')}
            </p>
          )}
          <form className="interpreter-composer" onSubmit={submit}>
            <div className="interpreter-composer-tools">
              <label className="sr-only" htmlFor="interpreter-operation">
                {t('interpreter.operation')}
              </label>
              <select
                id="interpreter-operation"
                value={operation}
                onChange={(e) =>
                  setOperation(e.target.value as InterpreterOperation)
                }
              >
                {OPERATIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`interpreter.operations.${value}`)}
                  </option>
                ))}
              </select>
              <span>
                {persona === 'child'
                  ? t('interpreter.childAge')
                  : persona === 'adolescent'
                    ? t('interpreter.adolescentAge')
                    : t(`interpreter.personas.${persona}`)}
              </span>
            </div>
            <label className="sr-only" htmlFor="interpreter-message">
              {t(`interpreter.inputLabels.${operation}`)}
            </label>
            <textarea
              id="interpreter-message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('interpreter.composerPlaceholder')}
              rows={3}
            />
            <div className="interpreter-composer-footer">
              <span>{t('interpreter.readOnlyNote')}</span>
              <button
                className="btn primary"
                type="submit"
                disabled={!canSubmit}
              >
                {busy ? t('interpreter.thinking') : t('interpreter.send')}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
