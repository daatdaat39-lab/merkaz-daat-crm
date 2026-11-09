'use client';

import { useRef, useState, useTransition } from 'react';
import SignaturePad from '../../dashboard/components/SignaturePad';
import { publicSaveAnswer, publicUploadDocument, publicSubmitSignature } from './publicRegistrationActions';
import {
  PageShell, MessageCard, cardStyle, IconCheckCircle, IconUpload, IconPen, IconClipboard, IconFile,
} from './RegistrationChrome';
import PaymentStepCard, { StepIndicator } from './PaymentStepCard';

// עמוד גלילה רציף אחד: לולאה על formFields (מערכת הטפסים, migration 0182) לפי
// הסדר שהמנהל קבע, כשרצף שדות מאותו סוג נאסף לאזור אחד עם כותרת. שמירה
// אוטומטית בכל שדה (עם חיווי), התקדמות קבועה בראש העמוד, וכפתור סיום בסוף.
// תשלום אינו חלק מהעמוד הפעיל.
const SECTION_META = {
  data: { title: 'הפרטים שלך', hint: 'מה שתמלאו נשמר אוטומטית - אפשר להפסיק ולחזור בכל רגע.', icon: <IconClipboard /> },
  file: { title: 'מסמכים להעלאה', hint: 'PDF או תמונה, עד 5MB לכל קובץ.', icon: <IconFile /> },
  signature: { title: 'אישור וחתימה', hint: 'חותמים באצבע או בעכבר ומקלידים שם מלא.', icon: <IconPen /> },
};

const kindOf = (f) => (f.type === 'file' ? 'file' : f.type === 'signature' ? 'signature' : 'data');

// paymentStep: בקישור "הכול" עם קישור תשלום - שלב 1 מתוך 2, והכפתור בסוף הוא
// "המשך לתשלום" שמוביל לסיכום ולעמוד התשלום של קשר (PaymentStepCard).
export default function PublicRegistrationScreen({
  brand, token, firstName, courseName, formFields = [], initialAnswers = {}, initialUploadedDocuments = [], initialSignaturesDone = false,
  paymentStep = false, paymentSummary = {},
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [uploadedDocs, setUploadedDocs] = useState(initialUploadedDocuments);
  const [signaturesDone, setSignaturesDone] = useState(initialSignaturesDone);
  const [submitted, setSubmitted] = useState(false);

  const uploadedReqIds = new Set(uploadedDocs.map((d) => d.requirement_id));

  function isFieldDone(field) {
    if (field.type === 'file') return uploadedReqIds.has(field.id);
    if (field.type === 'signature') return signaturesDone;
    const v = answers[field.field_key];
    return v !== undefined && v !== null && v !== '';
  }

  // מחזיר את ההבטחה כדי שהשדה יוכל להציג "נשמר" / שגיאה
  function saveAnswer(fieldKey, value) {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
    return publicSaveAnswer(token, fieldKey, value);
  }

  const requiredFields = formFields.filter((f) => f.required);
  const missingRequired = requiredFields.filter((f) => !isFieldDone(f));
  const progressTotal = requiredFields.length || formFields.length;
  const progressDone = requiredFields.length ? requiredFields.length - missingRequired.length : formFields.filter(isFieldDone).length;
  const pct = progressTotal ? Math.round((progressDone / progressTotal) * 100) : 100;

  const sections = [];
  for (const f of formFields) {
    const kind = kindOf(f);
    const last = sections[sections.length - 1];
    if (last && last.kind === kind) last.fields.push(f);
    else sections.push({ kind, fields: [f] });
  }

  if (submitted && paymentStep) {
    return <PaymentStepCard brand={brand} firstName={firstName} token={token} summary={paymentSummary} />;
  }

  if (submitted) {
    return (
      <PageShell brand={brand}>
        <MessageCard tone="ok" icon={<IconCheckCircle size={34} />} title={`תודה${firstName ? `, ${firstName}` : ''}!`}>
          כל הפרטים נקלטו.
          <br />
          הנציג שלכם ייצור איתכם קשר להמשך התהליך.
        </MessageCard>
      </PageShell>
    );
  }

  return (
    <PageShell wide brand={brand}>
      {paymentStep && <StepIndicator current={1} />}
      <div style={{ ...cardStyle, padding: '26px 24px', marginBottom: 14, textAlign: 'center' }}>
        {courseName && (
          <div style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 600, color: 'var(--k-accent)', background: 'var(--k-pill-bg)', borderRadius: 999, padding: '4px 14px', marginBottom: 12 }}>
            {courseName}
          </div>
        )}
        <h1 style={{ fontFamily: 'var(--k-font-display)', fontSize: 26, margin: '0 0 8px', color: 'var(--k-text)' }}>
          {firstName ? `שלום ${firstName}, ` : ''}נשאר רק להשלים את הרישום
        </h1>
        <p style={{ margin: 0, fontSize: 14.5, color: 'var(--k-text-muted)', lineHeight: 1.7 }}>
          כמה פרטים קצרים ואנחנו מסיימים. שדות המסומנים ב-<span style={{ color: 'var(--k-danger-text)' }}>*</span> הם חובה.
        </p>
      </div>

      {formFields.length > 0 && (
        <div
          style={{
            ...cardStyle, position: 'sticky', top: 8, zIndex: 5, padding: '12px 16px', marginBottom: 14,
            boxShadow: '0 6px 20px rgba(10, 26, 47, 0.08)',
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: 'var(--k-text)', fontWeight: 600 }}>
              {pct === 100 ? (paymentStep ? 'הכול מוכן - אפשר להמשיך לתשלום' : 'הכול מוכן - אפשר לסיים') : `הושלמו ${progressDone} מתוך ${progressTotal}`}
            </span>
            <span style={{ color: 'var(--k-text-muted)' }}>{pct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--k-pill-bg)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--k-ok-text)' : 'var(--k-accent)', borderRadius: 999, transition: 'width .35s ease' }} />
          </div>
        </div>
      )}

      {sections.map((section, idx) => {
        const meta = SECTION_META[section.kind];
        return (
          <section key={`${section.kind}-${idx}`} style={{ ...cardStyle, padding: '22px 22px 24px', marginBottom: 14 }} aria-labelledby={`sec-${idx}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--k-pill-bg)', color: 'var(--k-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {meta.icon}
              </div>
              <div>
                <h2 id={`sec-${idx}`} style={{ fontFamily: 'var(--k-font-display)', fontSize: 18, margin: 0, color: 'var(--k-text)' }}>{meta.title}</h2>
                <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{meta.hint}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {section.fields.map((field) => (
                <FieldBlock
                  key={field.id} field={field} token={token} answers={answers} onSaveAnswer={saveAnswer}
                  uploaded={uploadedDocs.filter((d) => d.requirement_id === field.id)}
                  onUploaded={(doc) => setUploadedDocs((prev) => [...prev, doc])}
                  signaturesDone={signaturesDone}
                  onSignatureDone={() => setSignaturesDone(true)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <div style={{ ...cardStyle, padding: '20px 22px', textAlign: 'center' }}>
        {missingRequired.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--k-text-muted)', marginBottom: 8 }}>עדיין חסר:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {missingRequired.map((f) => (
                <span key={f.id} style={{ fontSize: 12, background: 'var(--k-caution-bg)', color: 'var(--k-caution-text)', borderRadius: 999, padding: '3px 12px' }}>{f.label}</span>
              ))}
            </div>
          </div>
        )}
        <button
          type="button" onClick={() => setSubmitted(true)} disabled={missingRequired.length > 0}
          style={{
            width: '100%', minHeight: 52, fontFamily: 'var(--k-font-display)', fontSize: 16, fontWeight: 700, border: 'none', borderRadius: 14,
            cursor: missingRequired.length > 0 ? 'default' : 'pointer', background: 'var(--k-accent)', color: '#fff',
            opacity: missingRequired.length > 0 ? 0.4 : 1, transition: 'opacity .2s',
          }}
        >
          {paymentStep ? 'המשך לתשלום' : 'סיום הרישום'}
        </button>
      </div>
    </PageShell>
  );
}

function SavedHint({ status }) {
  if (status === 'saving') return <span style={{ fontSize: 11.5, color: 'var(--k-text-muted)' }}>שומר...</span>;
  if (status === 'saved') return <span style={{ fontSize: 11.5, color: 'var(--k-ok-text)' }}>✓ נשמר</span>;
  if (status === 'error') return <span role="alert" style={{ fontSize: 11.5, color: 'var(--k-danger-text)' }}>לא נשמר - נסו שוב</span>;
  return null;
}

function FieldLabel({ htmlFor, field, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--k-text)', lineHeight: 1.5 }}>
        {field.label}
        {field.required
          ? <span style={{ color: 'var(--k-danger-text)' }} aria-label="שדה חובה"> *</span>
          : <span style={{ color: 'var(--k-text-muted)', fontWeight: 400, fontSize: 12 }}> (לא חובה)</span>}
      </label>
      {right}
    </div>
  );
}

const inputStyle = {
  border: '1.5px solid var(--k-border)', borderRadius: 12, padding: '12px 14px', fontSize: 16, width: '100%',
  minHeight: 50, boxSizing: 'border-box', background: 'var(--k-surface)', color: 'var(--k-text)', fontFamily: 'inherit',
};

function FieldBlock({ field, token, answers, onSaveAnswer, uploaded, onUploaded, signaturesDone, onSignatureDone }) {
  if (field.type === 'file') {
    return <FileField field={field} token={token} uploaded={uploaded} onUploaded={onUploaded} />;
  }
  if (field.type === 'signature') {
    return <SignatureField field={field} token={token} done={signaturesDone} onDone={onSignatureDone} />;
  }
  return <DataField field={field} answers={answers} onSaveAnswer={onSaveAnswer} />;
}

function DataField({ field, answers, onSaveAnswer }) {
  const fieldId = `pub-field-${field.field_key}`;
  const [status, setStatus] = useState('idle');
  const lastSaved = useRef(answers[field.field_key] ?? '');

  function save(value) {
    if (value === lastSaved.current) return;
    lastSaved.current = value;
    setStatus('saving');
    Promise.resolve(onSaveAnswer(field.field_key, value))
      .then((res) => setStatus(res?.error ? 'error' : 'saved'))
      .catch(() => setStatus('error'));
  }

  return (
    <div>
      <FieldLabel htmlFor={fieldId} field={field} right={<SavedHint status={status} />} />
      {field.type === 'select' ? (
        <select id={fieldId} className="reg-input" defaultValue={answers[field.field_key] ?? ''} onChange={(e) => save(e.target.value)} style={inputStyle}>
          <option value="">— בחירה —</option>
          {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input
          id={fieldId} className="reg-input" type={field.type || 'text'} defaultValue={answers[field.field_key] ?? ''}
          onBlur={(e) => save(e.target.value)} style={inputStyle}
        />
      )}
    </div>
  );
}

function FileField({ field, token, uploaded, onUploaded }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputId = `pub-doc-${field.id}`;

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const formData = new FormData();
    formData.set('file', file);
    startTransition(async () => {
      const res = await publicUploadDocument(token, field.id, formData);
      if (res?.error) { setError(res.error); return; }
      setFileName(file.name);
      onUploaded({ requirement_id: field.id, original_filename: file.name });
    });
    e.target.value = '';
  }

  const isDone = uploaded.length > 0 || !!fileName;
  return (
    <div>
      <FieldLabel htmlFor={inputId} field={field} />
      <label
        htmlFor={inputId}
        className="reg-drop"
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '16px 16px', cursor: isPending ? 'default' : 'pointer',
          border: `1.5px dashed ${isDone ? 'var(--k-ok-text)' : 'var(--k-border)'}`, borderRadius: 14,
          background: isDone ? 'var(--k-ok-bg)' : 'var(--k-bg)', minHeight: 72,
        }}
      >
        <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--k-surface)', color: isDone ? 'var(--k-ok-text)' : 'var(--k-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isDone ? <IconCheckCircle size={22} /> : <IconUpload />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: isDone ? 'var(--k-ok-text)' : 'var(--k-text)' }}>
            {isPending ? 'מעלה...' : isDone ? 'הקובץ הועלה' : 'לחצו כאן להעלאת קובץ'}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--k-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName || (isDone ? 'אפשר להחליף בקובץ אחר' : 'PDF או תמונה, עד 5MB')}
          </span>
        </span>
        {isDone && !isPending && <span style={{ fontSize: 12.5, color: 'var(--k-accent)', fontWeight: 600 }}>החלפה</span>}
      </label>
      <input id={inputId} type="file" accept="application/pdf,image/*" onChange={handleChange} disabled={isPending} style={{ display: 'none' }} />
      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--k-danger-text)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function SignatureField({ field, token, done, onDone }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit({ typedName, agreed, imageDataUrl }) {
    setError('');
    setSubmitting(true);
    publicSubmitSignature(token, { typedName, agreed, imageDataUrl }).then((res) => {
      setSubmitting(false);
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div>
      <FieldLabel field={field} htmlFor={undefined} />
      {done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: 'var(--k-ok-text)', background: 'var(--k-ok-bg)', borderRadius: 14, padding: '16px' }}>
          <IconCheckCircle size={22} /> החתימה נקלטה
        </div>
      ) : (
        <>
          <SignaturePad onSubmit={handleSubmit} submitting={submitting} />
          {error && <div role="alert" style={{ fontSize: 13, color: 'var(--k-danger-text)', marginTop: 8 }}>{error}</div>}
        </>
      )}
    </div>
  );
}
