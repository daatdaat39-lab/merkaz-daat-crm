'use client';

// מיזוג-אוטומטי-בכמות לזוגות "ודאיים" (ת"ז/טלפון/מייל זהים, או אותם
// רכיבי שם בסדר שונה - לא "שם דומה" מטושטש) שאין להם נתונים כספיים
// (תרומות/התחייבויות) באף אחד משני הצדדים - אלה מוחרגים ונשארים לתור
// הידני (DuplicateQueueClient) למטה, לפי החלטת המשתמש. שלב-תצוגה-מקדימה
// (getEligibleAutoMergePairs, read-only) לפני הרצה אמיתית (bulkAutoMergePairs,
// בנתחים של עד 25) - עם מיפוי-שרשור בזיכרון (id -> survivingId) כדי לא
// לנסות למזג איש-קשר שכבר נמזג בתוך אותה ריצה (למשל A↔B ו-B↔C).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getEligibleAutoMergePairs, bulkAutoMergePairs } from '../../contacts/actions';

const CHUNK_SIZE = 25;

export default function BulkAutoMergeSection() {
  const [preview, setPreview] = useState(null); // { eligible, skippedFinancialCount, skippedFuzzyOnlyCount }
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null); // { merged, errors, skippedChained }
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handlePreview() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await getEligibleAutoMergePairs();
      if (res?.error) { setError(res.error); return; }
      setPreview(res);
    });
  }

  function handleRun() {
    if (!preview?.eligible?.length) return;
    setError(null);
    startTransition(async () => {
      const remap = new Map(); // id שנמחק -> id ששרד
      function resolveId(id) {
        let current = id;
        while (remap.has(current)) current = remap.get(current);
        return current;
      }

      const total = preview.eligible.length;
      let done = 0;
      let merged = 0;
      let skippedChained = 0;
      const errors = [];
      setProgress({ done: 0, total });

      for (let i = 0; i < preview.eligible.length; i += CHUNK_SIZE) {
        const rawChunk = preview.eligible.slice(i, i + CHUNK_SIZE);
        const chunk = [];
        for (const pair of rawChunk) {
          const keepId = resolveId(pair.keepId);
          const dupId = resolveId(pair.dupId);
          if (keepId === dupId) { skippedChained++; continue; }
          chunk.push({ ...pair, keepId, dupId });
        }
        if (chunk.length > 0) {
          const res = await bulkAutoMergePairs(chunk);
          if (res?.error) { setError(res.error); setProgress(null); return; }
          merged += res.merged;
          for (const e of res.errors || []) errors.push(e);
          for (const pair of chunk) remap.set(pair.dupId, pair.keepId);
        }
        done += rawChunk.length;
        setProgress({ done, total });
      }

      setProgress(null);
      setResult({ merged, errors, skippedChained });
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>מיזוג אוטומטי לזוגות ודאיים</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            זוגות עם התאמה ודאית (ת"ז/טלפון/מייל זהים, או אותם רכיבי שם) ובלי תרומות/התחייבויות בסיכון - ממוזגים אוטומטית. הכל דרך אותה פונקציית מיזוג בטוחה (שום דבר לא נמחק, רק מתאחד).
          </div>
        </div>
        {!preview && !progress && (
          <button type="button" onClick={handlePreview} disabled={isPending} style={primaryBtn()}>בדיקת זוגות למיזוג אוטומטי</button>
        )}
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginTop: 10 }}>{error}</div>}

      {preview && (
        <div style={{ marginTop: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 12.5, marginBottom: 8 }}>
            נמצאו <strong>{preview.eligible.length}</strong> זוגות למיזוג אוטומטי (התאמה ודאית, ללא נתונים כספיים).
            {preview.skippedFinancialCount > 0 && <> {preview.skippedFinancialCount} זוגות עם נתונים כספיים ידלגו לבדיקה ידנית למטה.</>}
            {preview.skippedFuzzyOnlyCount > 0 && <> {preview.skippedFuzzyOnlyCount} זוגות נוספים תואמים רק לפי "שם דומה" מטושטש וידלגו.</>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={handleRun} disabled={isPending || preview.eligible.length === 0} style={primaryBtn()}>
              אישור, מזג {preview.eligible.length > 0 ? `(${preview.eligible.length})` : ''}
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={isPending} style={ghostBtn()}>ביטול</button>
          </div>
        </div>
      )}

      {progress && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-secondary)' }}>
          ממזג... {progress.done}/{progress.total}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '10px 12px', fontSize: 12.5 }}>
          <ul style={{ margin: 0, paddingRight: 18 }}>
            <li>{result.merged} זוגות מוזגו אוטומטית</li>
            {result.skippedChained > 0 && <li>{result.skippedChained} זוגות דולגו - כבר מוזגו במסגרת שרשור באותה ריצה</li>}
            {result.errors.length > 0 && (
              <li>
                {result.errors.length} זוגות נכשלו:
                <ul style={{ margin: '4px 0 0', paddingRight: 18 }}>
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.keepName} + {e.dupName}: {e.error}</li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function primaryBtn() {
  return {
    padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    background: 'var(--text, #0a0a0a)', color: '#fff', border: 'none',
  };
}

function ghostBtn() {
  return {
    padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}
