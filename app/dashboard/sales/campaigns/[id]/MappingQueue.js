'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getNextMappingCard, saveMappingDecision, linkContactsAsCouple, setJointHandling,
} from '../actions';

const EXPECTATION_BUCKETS = ['מתחת ל-₪2,000', '₪2,000–7,000', 'מעל ₪7,000'];

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, width: '100%' };
const labelStyle = { fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4, display: 'block' };

// מסך המיפוי - כרטיסון אחד בכל פעם, לצוות/מתנדבים שעוברים על מי שכבר
// בקמפיין ומסמנים ידע-יחסים (מכיר/לא רלוונטי, קבוצת-אב, הערות, הצפי).
// שום שדה לא חובה - גם "רלוונטי/לא רלוונטי" ניתן לדילוג מוחלט (כפתור
// "דלג", לא רושם כלום, האדם חוזר לתור לסבב הבא). זו גם מנגנון מניעת-
// כפילות בין ממפים: התור הוא כל mapping_decision ריק - ברגע שמישהו
// שומר החלטה (אפילו רק "דלג" בלי לשמור), השורה יוצאת מהתור של האחרים.
export default function MappingQueue({ campaignId, categories = [] }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mappedCount, setMappedCount] = useState(0);
  const [skippedIds, setSkippedIds] = useState([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  const [decision, setDecision] = useState('');
  const [category, setCategory] = useState('');
  const [parentGroup, setParentGroup] = useState('');
  const [noteOwner, setNoteOwner] = useState('');
  const [noteRep, setNoteRep] = useState('');
  const [expectationBucket, setExpectationBucket] = useState('');
  const [expectationNote, setExpectationNote] = useState('');
  const [jointWithSpouse, setJointWithSpouse] = useState(false);
  const [jointNote, setJointNote] = useState('');

  const router = useRouter();

  function resetForm() {
    setDecision(''); setCategory(''); setParentGroup(''); setNoteOwner(''); setNoteRep('');
    setExpectationBucket(''); setExpectationNote(''); setJointWithSpouse(false); setJointNote('');
  }

  async function loadNext(skipIds) {
    setLoading(true);
    setError(null);
    const next = await getNextMappingCard(campaignId, skipIds ?? skippedIds);
    setCard(next);
    resetForm();
    setLoading(false);
  }

  useEffect(() => { loadNext([]); }, [campaignId]);

  function handleSkip() {
    if (!card) return;
    // מסירים הופעה קודמת (אם דילגו על אותו אדם כבר בסבב הזה) ומוסיפים
    // בסוף - כדי שדילוג חוזר יזיז אותו שוב לסוף התור, לא ישאיר אותו
    // "תקוע" במקום שכבר עבר.
    const next = [...skippedIds.filter((id) => id !== card.rowId), card.rowId];
    setSkippedIds(next);
    loadNext(next);
  }

  function handleSave() {
    if (!card) return;
    startTransition(async () => {
      const res = await saveMappingDecision(card.rowId, {
        decision: decision || null,
        category: category || undefined,
        parentGroup: parentGroup || null,
        noteOwner: noteOwner || null,
        noteRep: noteRep || null,
        expectationBucket: expectationBucket || null,
        expectationNote: expectationNote || null,
      });
      if (res?.error) { setError(res.error); return; }

      if (jointWithSpouse && card.linkedSpouse && card.spouseAlsoInCampaign) {
        // מוצא את שורת ה-campaign_contacts של בן/בת הזוג באותו קמפיין -
        // דרך שאילתת השרת עצמה (getNextMappingCard לא חושף rowId של הזוג,
        // רק את זה שלו) - נשלח כאן דרך action ייעודי שכבר מטפל בזה.
        await setJointHandling(card.rowId, card.spouseRowId, jointNote || null);
      }
      setMappedCount((n) => n + 1);
      router.refresh();
      loadNext();
    });
  }

  function handleLinkSpouse(otherContactId) {
    startTransition(async () => {
      const res = await linkContactsAsCouple(card.contact.id, otherContactId);
      if (res?.error) { setError(res.error); return; }
      loadNext();
    });
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>טוען...</div>;
  }

  if (!card) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>✓ אין יותר אנשי קשר למיפוי</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>מופו {mappedCount} אנשי קשר בסבב הזה. כל השאר כבר סומנו, או שדילגת עליהם — הם יחזרו בסבב הבא.</div>
      </div>
    );
  }

  const c = card.contact;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted, #9b9b9b)', marginBottom: 10, textAlign: 'center' }}>
        מופו {mappedCount} בסבב הזה
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{c.first} {c.last}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{c.phone || '—'} {c.email ? `· ${c.email}` : ''}</div>
        {card.category && (
          <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--bg-secondary, #f4f4f5)', color: 'var(--text-secondary)' }}>
            נכנס דרך: {card.category}
          </span>
        )}
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-secondary)' }}>{card.summary}</div>
        <a href={`/dashboard/contacts/${c.id}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 11.5, color: 'var(--accent, #1f4d3d)' }}>
          פתיחת הכרטיס המלא ↗
        </a>
      </div>

      {card.linkedSpouse && card.spouseAlsoInCampaign && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#9a5b0c' }}>
          🔗 בן/בת זוג: <b>{card.linkedSpouse.first} {card.linkedSpouse.last}</b> — גם הוא/היא ברשימה הזו.
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <input type="checkbox" checked={jointWithSpouse} onChange={(e) => setJointWithSpouse(e.target.checked)} />
            טיפול משותף (רק בקמפיין הזה)
          </label>
          {jointWithSpouse && (
            <input value={jointNote} onChange={(e) => setJointNote(e.target.value)} placeholder="עדיפות התקשרות (למשל: להתקשר קודם לבעל)" style={{ ...inputStyle, marginTop: 6 }} />
          )}
        </div>
      )}

      {card.possibleSpouses.length > 0 && (
        <div style={{ background: 'var(--bg-secondary, #fafafa)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
          <div style={{ color: 'var(--text-muted, #9b9b9b)', marginBottom: 6 }}>ℹ️ שמות דומים — אולי אותה משפחה?</div>
          {card.possibleSpouses.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span>{p.first} {p.last} · {p.phone || '—'}</span>
              <button type="button" disabled={isPending} onClick={() => handleLinkSpouse(p.id)} style={{ fontSize: 11, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '3px 8px', background: 'none', cursor: 'pointer' }}>
                קשר כבני-זוג?
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {card.decisionOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setDecision(opt.value)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              border: decision === opt.value ? '2px solid var(--accent, #1f4d3d)' : '1px solid var(--border, #e5e5e5)',
              background: decision === opt.value ? 'var(--accent-soft, #e4ede8)' : 'var(--bg)',
              fontWeight: decision === opt.value ? 600 : 400,
            }}
          >
            {opt.value}
          </button>
        ))}
      </div>

      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-secondary)' }}>פרטים נוספים (הכל אופציונלי)</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <div>
            <label style={labelStyle}>קטגוריה</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="">— ללא —</option>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>קבוצת-אב (מי אחראי)</label>
            <input value={parentGroup} onChange={(e) => setParentGroup(e.target.value)} placeholder="שם האחראי/הקבוצה" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>הערה לאחראי הקבוצה</label>
            <textarea value={noteOwner} onChange={(e) => setNoteOwner(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>הערה לנציג</label>
            <textarea value={noteRep} onChange={(e) => setNoteRep(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>הצפי לקמפיין</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {EXPECTATION_BUCKETS.map((b) => (
                <button
                  key={b} type="button" onClick={() => setExpectationBucket(expectationBucket === b ? '' : b)}
                  style={{
                    fontSize: 11.5, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                    border: expectationBucket === b ? '1px solid var(--accent, #1f4d3d)' : '1px solid var(--border, #e5e5e5)',
                    background: expectationBucket === b ? 'var(--accent-soft, #e4ede8)' : 'var(--bg)',
                  }}
                >{b}</button>
              ))}
            </div>
            <input value={expectationNote} onChange={(e) => setExpectationNote(e.target.value)} placeholder="הערה חופשית (למשל: ידוע כבעל-יכולת גבוהה יותר)" style={inputStyle} />
          </div>
        </div>
      </details>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={handleSave} disabled={isPending} style={{
          flex: 1, background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        }}>
          שמירה והבא
        </button>
        <button type="button" onClick={handleSkip} disabled={isPending} style={{
          border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '11px 20px', fontSize: 13.5, background: 'var(--bg)', cursor: 'pointer',
        }}>
          דלג
        </button>
      </div>
    </div>
  );
}
