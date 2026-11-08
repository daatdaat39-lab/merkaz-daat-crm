'use client';

import { useState, useTransition } from 'react';
import SignaturePad from '../../dashboard/components/SignaturePad';
import { publicSaveAnswer, publicUploadDocument, publicSubmitSignature } from './publicRegistrationActions';

const inputStyle = { border: '1px solid var(--k-border)', borderRadius: 10, padding: '11px 14px', fontSize: 16, width: '100%', boxSizing: 'border-box', background: 'var(--k-bg)', color: 'var(--k-text)' };

// עמוד-גלילה-רציף-אחד (לא-אשף-רב-שלבי) - לולאה-אחת על formFields
// (מערכת-טפסים-בסיסית, migration 0182) ברינדור-לפי-type, בהשראת-עיצוב
// הטופס-החיצוני-האמיתי שנבדק (כרטיס-ממורכז, כותרת-גדולה-וחמה, שדות-
// נקיים-עם-padding-נדיב) - מרגיש-כמו-טופס-רישום-אמיתי, לא-כמו-מסך-
// ניהול-פנימי. תשלום **לא**-חלק-מהעמוד-הזה בכלל.
export default function PublicRegistrationScreen({
  token, firstName, courseName, formFields = [], initialAnswers = {}, initialUploadedDocuments = [], initialSignaturesDone = false,
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [uploadedDocs, setUploadedDocs] = useState(initialUploadedDocuments);
  const [signaturesDone, setSignaturesDone] = useState(initialSignaturesDone);
  const [submitted, setSubmitted] = useState(false);
  const [, startTransition] = useTransition();

  const uploadedReqIds = new Set(uploadedDocs.map((d) => d.requirement_id));

  function isFieldDone(field) {
    if (field.type === 'file') return uploadedReqIds.has(field.id);
    if (field.type === 'signature') return signaturesDone;
    const v = answers[field.field_key];
    return v !== undefined && v !== null && v !== '';
  }

  const doneCount = formFields.filter(isFieldDone).length;
  const missingRequired = formFields.filter((f) => f.required && !isFieldDone(f));

  function saveAnswer(fieldKey, value) {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
    startTransition(() => publicSaveAnswer(token, fieldKey, value));
  }

  if (submitted) {
    return (
      <PageShell>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
        <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 19, fontWeight: 700, color: 'var(--k-text)' }}>תודה! הפרטים נקלטו</div>
        <div style={{ fontSize: 13.5, color: 'var(--k-text-muted)', marginTop: 6 }}>הנציג שלך ייצור איתך קשר להמשך התהליך.</div>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 22, fontWeight: 700, color: 'var(--k-text)' }}>שלום{firstName ? ` ${firstName}` : ''} 👋</div>
        {courseName && <div style={{ fontSize: 13.5, color: 'var(--k-text-muted)', marginTop: 6 }}>השלמת רישום - {courseName}</div>}
      </div>

      {formFields.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {formFields.map((f) => (
            <div key={f.id} style={{ flex: 1, height: 5, borderRadius: 3, background: isFieldDone(f) ? 'var(--k-accent)' : 'var(--k-border)' }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {formFields.map((field) => (
          <FieldBlock
            key={field.id} field={field} token={token} answers={answers} onSaveAnswer={saveAnswer}
            uploaded={uploadedDocs.filter((d) => d.requirement_id === field.id)}
            onUploaded={(doc) => setUploadedDocs((prev) => [...prev, doc])}
            signaturesDone={signaturesDone}
            onSignatureDone={() => setSignaturesDone(true)}
          />
        ))}
      </div>

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--k-border)', textAlign: 'center' }}>
        {missingRequired.length > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--k-text-muted)', marginBottom: 12 }}>
            נותר להשלים: {missingRequired.map((f) => f.label).join(', ')}
          </div>
        )}
        <button
          type="button" onClick={() => setSubmitted(true)} disabled={missingRequired.length > 0}
          style={{
            fontFamily: 'var(--k-font-display)', fontSize: 15, fontWeight: 700, border: 'none', borderRadius: 10, padding: '13px 36px', cursor: missingRequired.length > 0 ? 'default' : 'pointer',
            background: 'var(--k-accent)', color: '#fff', opacity: missingRequired.length > 0 ? 0.45 : 1,
          }}
        >
          סיום ✓
        </button>
        <div style={{ fontSize: 11, color: 'var(--k-text-muted)', marginTop: 10 }}>{doneCount}/{formFields.length} שדות הושלמו</div>
      </div>
    </PageShell>
  );
}

function PageShell({ children, wide }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, var(--k-bg) 0%, var(--k-pill-bg) 100%)', minHeight: '100vh', padding: '36px 16px' }}>
      <div style={{
        maxWidth: wide ? 560 : 440, width: '100%', margin: '0 auto', textAlign: wide ? 'start' : 'center',
        background: 'var(--k-surface)', border: '1px solid var(--k-border)', borderRadius: 16, padding: wide ? '36px 32px' : '40px 32px',
        boxShadow: '0 4px 24px rgba(0,0,0,.06)',
      }}>
        {children}
      </div>
    </div>
  );
}

function FieldBlock({ field, token, answers, onSaveAnswer, uploaded, onUploaded, signaturesDone, onSignatureDone }) {
  if (field.type === 'file') {
    return <FileField field={field} token={token} uploaded={uploaded} onUploaded={onUploaded} />;
  }
  if (field.type === 'signature') {
    return <SignatureField field={field} token={token} done={signaturesDone} onDone={onSignatureDone} />;
  }
  const fieldId = `pub-field-${field.field_key}`;
  return (
    <div>
      <label htmlFor={fieldId} style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--k-text)', marginBottom: 7 }}>
        {field.label}{field.required && <span style={{ color: 'var(--k-danger-text)' }} aria-label="שדה חובה"> *</span>}
      </label>
      {field.type === 'select' ? (
        <select id={fieldId} defaultValue={answers[field.field_key] ?? ''} onChange={(e) => onSaveAnswer(field.field_key, e.target.value)} style={inputStyle}>
          <option value="">— בחירה —</option>
          {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input
          id={fieldId} type={field.type || 'text'} defaultValue={answers[field.field_key] ?? ''}
          onBlur={(e) => onSaveAnswer(field.field_key, e.target.value)} style={inputStyle}
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
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--k-text)', marginBottom: 7 }}>
        {field.label}{field.required && <span style={{ color: 'var(--k-danger-text)' }}> *</span>}
      </div>
      <div style={{ border: '1px dashed var(--k-border)', borderRadius: 10, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12.5, color: isDone ? 'var(--k-ok-text)' : 'var(--k-text-muted)' }}>
          {isDone ? `✓ הועלה${fileName ? `: ${fileName}` : ''}` : 'עדיין לא הועלה קובץ'}
        </span>
        <label htmlFor={inputId} style={{ fontSize: 12.5, color: 'var(--k-accent)', border: '1px solid var(--k-border)', borderRadius: 8, padding: '6px 14px', cursor: isPending ? 'default' : 'pointer', flexShrink: 0 }}>
          {isPending ? 'מעלה...' : isDone ? 'החלפה' : 'העלאה'}
        </label>
        <input id={inputId} type="file" accept="application/pdf,image/*" onChange={handleChange} disabled={isPending} style={{ display: 'none' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--k-text-muted)', marginTop: 5 }}>PDF או תמונה, עד 5MB</div>
      {error && <div role="alert" style={{ fontSize: 12.5, color: 'var(--k-danger-text)', marginTop: 6 }}>{error}</div>}
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
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--k-text)', marginBottom: 7 }}>
        {field.label}{field.required && <span style={{ color: 'var(--k-danger-text)' }}> *</span>}
      </div>
      {done ? (
        <div style={{ fontSize: 13, color: 'var(--k-ok-text)', border: '1px solid var(--k-border)', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
          ✓ החתימה נקלטה
        </div>
      ) : (
        <>
          <SignaturePad onSubmit={handleSubmit} submitting={submitting} />
          {error && <div role="alert" style={{ fontSize: 12.5, color: 'var(--k-danger-text)', marginTop: 6 }}>{error}</div>}
        </>
      )}
    </div>
  );
}
