'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMappingCards, saveMappingDecision, linkContactsAsCouple, setJointHandling,
} from '../actions';

const EXPECTATION_BUCKETS = ['מתחת ל-₪2,000', '₪2,000–7,000', 'מעל ₪7,000'];
const PAGE_SIZE = 30;

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '6px 8px', fontSize: 12, width: '100%' };
const labelStyle = { fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 3, display: 'block' };

function emptyExtra() {
  return { category: '', parentGroup: '', noteOwner: '', noteRep: '', expectationBucket: '', expectationNote: '', jointWithSpouse: false, jointNote: '' };
}

// טבלת-מיפוי - עד 30 אנשי-קשר בעמוד, בדיוק כמו טבלת בדיקת הכפליות: כל
// שורה עם כפתורי החלטה ישירים (רלוונטי/לא רלוונטי/מישהו אחר) שנשמרים
// מייד בלחיצה, "פרטים נוספים" מתקפל לשדות האופציונליים (קטגוריה/קבוצת-אב/
// הערות/הצפי), ובחירה מרובה + "סמן הכל כ-X" לפעולה מהירה על כמה שורות
// יחד. הוחלף מ"כרטיס אחד בכל פעם" לפי בקשת המשתמש.
export default function MappingQueue({ campaignId, categories = [] }) {
  const [cards, setCards] = useState([]);
  const [decisionOptions, setDecisionOptions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mappedCount, setMappedCount] = useState(0);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [extras, setExtras] = useState({}); // { [rowId]: extraFields }
  const [errors, setErrors] = useState({});
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function load(pageNum) {
    setLoading(true);
    const res = await getMappingCards(campaignId, { limit: PAGE_SIZE, offset: pageNum * PAGE_SIZE });
    setCards(res.cards);
    setDecisionOptions(res.decisionOptions);
    setTotal(res.total);
    setLoading(false);
  }

  useEffect(() => { load(0); setPage(0); }, [campaignId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getExtra(rowId) {
    return extras[rowId] || emptyExtra();
  }

  function setExtra(rowId, patch) {
    setExtras((prev) => ({ ...prev, [rowId]: { ...getExtra(rowId), ...patch } }));
  }

  function setPending(rowId, on) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(rowId); else next.delete(rowId);
      return next;
    });
  }

  function toggleSelect(rowId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  }

  function togglePageSelectAll() {
    const ids = cards.map((c) => c.rowId);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function decideOne(card, decisionValue) {
    const rowId = card.rowId;
    const extra = getExtra(rowId);
    setPending(rowId, true);
    const res = await saveMappingDecision(rowId, {
      decision: decisionValue,
      category: extra.category || undefined,
      parentGroup: extra.parentGroup || null,
      noteOwner: extra.noteOwner || null,
      noteRep: extra.noteRep || null,
      expectationBucket: extra.expectationBucket || null,
      expectationNote: extra.expectationNote || null,
    });
    if (res?.error) { setPending(rowId, false); setErrors((prev) => ({ ...prev, [rowId]: res.error })); return false; }
    if (extra.jointWithSpouse && card.linkedSpouse && card.spouseAlsoInCampaign) {
      await setJointHandling(rowId, card.spouseRowId, extra.jointNote || null);
    }
    setPending(rowId, false);
    return true;
  }

  function handleDecide(card, decisionValue) {
    startTransition(async () => {
      const ok = await decideOne(card, decisionValue);
      if (!ok) return;
      setMappedCount((n) => n + 1);
      setCards((prev) => prev.filter((c) => c.rowId !== card.rowId));
      setTotal((n) => Math.max(0, n - 1));
      router.refresh();
    });
  }

  function handleBulkDecide(decisionValue) {
    const targets = cards.filter((c) => selectedIds.has(c.rowId));
    if (targets.length === 0) return;
    startTransition(async () => {
      let succeeded = 0;
      const failedIds = new Set();
      for (const card of targets) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await decideOne(card, decisionValue);
        if (ok) succeeded++; else failedIds.add(card.rowId);
      }
      setMappedCount((n) => n + succeeded);
      setCards((prev) => prev.filter((c) => !selectedIds.has(c.rowId) || failedIds.has(c.rowId)));
      setSelectedIds(failedIds);
      setTotal((n) => Math.max(0, n - succeeded));
      router.refresh();
    });
  }

  function handleLinkSpouse(card, otherContactId) {
    startTransition(async () => {
      const res = await linkContactsAsCouple(card.contact.id, otherContactId);
      if (res?.error) { setErrors((prev) => ({ ...prev, [card.rowId]: res.error })); return; }
      load(page);
    });
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>טוען...</div>;
  }

  if (cards.length === 0 && page === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>✓ אין יותר אנשי קשר למיפוי</div>
        {mappedCount > 0 && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>מופו {mappedCount} אנשי קשר בסבב הזה.</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {total} ממתינים למיפוי — עמוד {page + 1} מתוך {totalPages} (עד {PAGE_SIZE} בעמוד){mappedCount > 0 ? ` · מופו ${mappedCount} בסבב הזה` : ''}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => { const p = Math.max(0, page - 1); setPage(p); load(p); }} disabled={page === 0} style={navBtn()}>← הקודם</button>
          <button type="button" onClick={() => { const p = Math.min(totalPages - 1, page + 1); setPage(p); load(p); }} disabled={page >= totalPages - 1} style={navBtn()}>הבא →</button>
        </div>
      </div>

      {selectedIds.size > 0 && decisionOptions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, background: 'var(--bg-secondary, #f7f7f7)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{selectedIds.size} נבחרו — סמן הכל כ:</span>
          {decisionOptions.map((opt) => (
            <button key={opt.id} type="button" onClick={() => handleBulkDecide(opt.value)} style={ghostBtn()}>{opt.value}</button>
          ))}
          <button type="button" onClick={() => setSelectedIds(new Set())} style={ghostBtn()}>בטל בחירה</button>
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #f7f7f7)' }}>
              <th style={{ ...th(), width: 30 }}>
                <input type="checkbox" checked={cards.length > 0 && cards.every((c) => selectedIds.has(c.rowId))} onChange={togglePageSelectAll} />
              </th>
              <th style={th()}>איש קשר</th>
              <th style={th()}>תובנות</th>
              <th style={th()}>החלטה + פרטים נוספים</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              const c = card.contact;
              const isPending = pendingIds.has(card.rowId);
              const extra = getExtra(card.rowId);
              return (
                <tr key={card.rowId} style={{ borderTop: '1px solid var(--border)', opacity: isPending ? 0.5 : 1, verticalAlign: 'top' }}>
                  <td style={td()}>
                    <input type="checkbox" checked={selectedIds.has(card.rowId)} onChange={() => toggleSelect(card.rowId)} disabled={isPending} />
                  </td>
                  <td style={{ ...td(), minWidth: 170 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.first} {c.last}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{c.phone || '—'}</div>
                    {c.email && <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{c.email}</div>}
                    {card.category && (
                      <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--bg-secondary, #f4f4f5)', color: 'var(--text-secondary)' }}>
                        נכנס דרך: {card.category}
                      </span>
                    )}
                    <a href={`/dashboard/contacts/${c.id}`} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, fontSize: 10.5, color: 'var(--accent, #1f4d3d)' }}>
                      פתיחת הכרטיס המלא ↗
                    </a>
                  </td>
                  <td style={{ ...td(), minWidth: 220 }}>
                    <ContactInsights insights={card.insights} />
                    {card.linkedSpouse && card.spouseAlsoInCampaign && (
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '6px 8px', marginTop: 6, fontSize: 10.5, color: '#9a5b0c' }}>
                        🔗 בן/בת זוג: <b>{card.linkedSpouse.first} {card.linkedSpouse.last}</b> — גם ברשימה.
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                          <input type="checkbox" checked={extra.jointWithSpouse} onChange={(e) => setExtra(card.rowId, { jointWithSpouse: e.target.checked })} />
                          טיפול משותף
                        </label>
                        {extra.jointWithSpouse && (
                          <input value={extra.jointNote} onChange={(e) => setExtra(card.rowId, { jointNote: e.target.value })} placeholder="עדיפות התקשרות" style={{ ...inputStyle, marginTop: 4 }} />
                        )}
                      </div>
                    )}
                    {card.possibleSpouses.length > 0 && (
                      <div style={{ background: 'var(--bg-secondary, #fafafa)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', marginTop: 6, fontSize: 10.5 }}>
                        <div style={{ color: 'var(--text-muted, #9b9b9b)', marginBottom: 3 }}>ℹ️ אולי אותה משפחה?</div>
                        {card.possibleSpouses.map((p) => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                            <span>{p.first} {p.last}</span>
                            <button type="button" disabled={isPending} onClick={() => handleLinkSpouse(card, p.id)} style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px', background: 'none', cursor: 'pointer' }}>
                              קשר?
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td(), minWidth: 260 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {decisionOptions.map((opt) => (
                        <button key={opt.id} type="button" disabled={isPending} onClick={() => handleDecide(card, opt.value)} style={decisionBtn()}>
                          {opt.value}
                        </button>
                      ))}
                    </div>
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>פרטים נוספים (אופציונלי)</summary>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        <div>
                          <label style={labelStyle}>קטגוריה</label>
                          <select value={extra.category} onChange={(e) => setExtra(card.rowId, { category: e.target.value })} style={inputStyle}>
                            <option value="">— ללא —</option>
                            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>קבוצת-אב (מי אחראי)</label>
                          <input value={extra.parentGroup} onChange={(e) => setExtra(card.rowId, { parentGroup: e.target.value })} placeholder="שם האחראי/הקבוצה" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>הערה לאחראי הקבוצה</label>
                          <textarea value={extra.noteOwner} onChange={(e) => setExtra(card.rowId, { noteOwner: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>
                        <div>
                          <label style={labelStyle}>הערה לנציג</label>
                          <textarea value={extra.noteRep} onChange={(e) => setExtra(card.rowId, { noteRep: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>
                        <div>
                          <label style={labelStyle}>הצפי לקמפיין</label>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                            {EXPECTATION_BUCKETS.map((b) => (
                              <button
                                key={b} type="button" onClick={() => setExtra(card.rowId, { expectationBucket: extra.expectationBucket === b ? '' : b })}
                                style={{
                                  fontSize: 10.5, padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
                                  border: extra.expectationBucket === b ? '1px solid var(--accent, #1f4d3d)' : '1px solid var(--border)',
                                  background: extra.expectationBucket === b ? 'var(--accent-soft, #e4ede8)' : 'var(--bg)',
                                }}
                              >{b}</button>
                            ))}
                          </div>
                          <input value={extra.expectationNote} onChange={(e) => setExtra(card.rowId, { expectationNote: e.target.value })} placeholder="הערה חופשית" style={inputStyle} />
                        </div>
                      </div>
                    </details>
                    {errors[card.rowId] && <div style={{ color: '#b23b2f', fontSize: 10.5, marginTop: 6 }}>{errors[card.rowId]}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// תמונה מלאה חוצת-מחלקות של איש הקשר - במקום משפט-סיכום מכווץ, שורות
// נפרדות: מאיזה מחלקות הוא מוכר לנו, שנת-השיא של התרומות שלו (השנה עם
// הסכום הגבוה ביותר, לא ממוצע), תאריך תרומה אחרונה, וה"אינטראקציה
// האחרונה" מכל סוג - תרומה/פגישה בתאריך מדויק, או קורס/סמינר בתאריך
// משוער משנה עברית (מסומן "משוער" - אין תאריך מדויק במקור לשני אלה).
function ContactInsights({ insights }) {
  if (!insights) return null;
  const { departments, peakDonation, lastDonationDate, totalDonations, hasActiveCommitment, coursesCount, seminarsCount, lastInteraction } = insights;

  const row = (label, value) => (
    <div style={{ display: 'flex', gap: 5, fontSize: 11 }}>
      <span style={{ color: 'var(--text-muted, #9b9b9b)', flexShrink: 0 }}>{label}:</span>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--bg-secondary, #fafafa)', borderRadius: 6, padding: '8px 10px' }}>
      {row('מחלקות', departments.length ? departments.join(', ') : 'אף מחלקה')}
      {row('שנת-שיא', peakDonation ? `${peakDonation.year} · ₪${Math.round(peakDonation.amount).toLocaleString('he-IL')}` : '—')}
      {row('סה"כ תרומות', totalDonations.count > 0 ? `${totalDonations.count} · ₪${Math.round(totalDonations.total).toLocaleString('he-IL')}` : 'אין')}
      {row('תרומה אחרונה', lastDonationDate ? new Date(lastDonationDate).toLocaleDateString('he-IL') : '—')}
      {row('אינטראקציה אחרונה', lastInteraction
        ? `${lastInteraction.label}${lastInteraction.exact ? '' : ' (משוער)'} · ${new Date(lastInteraction.date).toLocaleDateString('he-IL')}`
        : 'לא ידוע')}
      {(hasActiveCommitment || coursesCount > 0 || seminarsCount > 0) && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
          {hasActiveCommitment && <span style={pillStyle()}>הוראת קבע</span>}
          {coursesCount > 0 && <span style={pillStyle()}>{coursesCount} קורסים</span>}
          {seminarsCount > 0 && <span style={pillStyle()}>{seminarsCount} סמינרים</span>}
        </div>
      )}
    </div>
  );
}

function pillStyle() {
  return { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'var(--accent-soft, #e4ede8)', color: 'var(--accent, #1f4d3d)' };
}

function th() {
  return { textAlign: 'right', padding: '8px 10px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 };
}

function td() {
  return { padding: '8px 10px', verticalAlign: 'top' };
}

function navBtn() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
    borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  };
}

function ghostBtn() {
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
    background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', whiteSpace: 'nowrap',
  };
}

function decisionBtn() {
  return {
    padding: '6px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer',
    border: '1px solid var(--border, #e5e5e5)', background: 'var(--bg)', whiteSpace: 'nowrap',
  };
}
