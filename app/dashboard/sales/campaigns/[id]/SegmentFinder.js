'use client';

import { useState, useEffect, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  getWorkspacesForSegmentFilter, searchCampaignSegment, getContactDonationsByYear, addContactsToCampaignWithCategory,
} from '../actions';

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };
const TRI_STATE = [{ v: null, l: 'לא משנה' }, { v: true, l: 'כן' }, { v: false, l: 'לא' }];

function TriState({ value, onChange, label }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {TRI_STATE.map((opt) => (
          <button
            key={String(opt.v)} type="button" onClick={() => onChange(opt.v)}
            style={{
              fontSize: 11.5, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              border: value === opt.v ? '1px solid var(--accent, #1f4d3d)' : '1px solid var(--border, #e5e5e5)',
              background: value === opt.v ? 'var(--accent-soft, #e4ede8)' : 'var(--bg)',
            }}
          >{opt.l}</button>
        ))}
      </div>
    </div>
  );
}

// בניית-קבוצה לקמפיין - מסנן לפי מקור/שלב-מחלקה/שנת-שיא-תרומה/הוראת-
// קבע/קורסים/סמינרים (ר' RPC find_campaign_segment_candidates), עם מיון
// וחיתוך-לפי-כמות לצורך סקירה, ומחריג אוטומטית כל מי שכבר בקמפיין הזה -
// כך שכל קבוצה שמוסיפים לא חופפת לקודמת (מנגנון מניעת-כפילות).
export default function SegmentFinder({ campaignId, pipelinesByWorkspace = {} }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [source, setSource] = useState('');
  const [stageWorkspaceId, setStageWorkspaceId] = useState('');
  const [stage, setStage] = useState('');
  const [minPeak, setMinPeak] = useState('');
  const [maxPeak, setMaxPeak] = useState('');
  const [hasCommitment, setHasCommitment] = useState(null);
  const [hasCourse, setHasCourse] = useState(null);
  const [hasSeminar, setHasSeminar] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('desc');

  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [yearBreakdown, setYearBreakdown] = useState({});
  const [category, setCategory] = useState('');
  const [quickCount, setQuickCount] = useState('50');
  const [error, setError] = useState(null);
  const [addedMsg, setAddedMsg] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => { getWorkspacesForSegmentFilter().then(setWorkspaces); }, []);

  const selectedWorkspaceStages = stageWorkspaceId
    ? (pipelinesByWorkspace[workspaces.find((w) => w.id === stageWorkspaceId)?.name] || { order: [], sideStages: [], labels: {} })
    : null;
  const stageOptions = selectedWorkspaceStages
    ? [...selectedWorkspaceStages.order, ...(selectedWorkspaceStages.sideStages || [])]
    : [];

  function handleSearch() {
    setError(null);
    setAddedMsg(null);
    startTransition(async () => {
      const res = await searchCampaignSegment(campaignId, {
        source: source.trim() || null,
        stageWorkspaceId: stageWorkspaceId || null,
        stage: stage || null,
        minPeakDonation: minPeak !== '' ? Number(minPeak) : null,
        maxPeakDonation: maxPeak !== '' ? Number(maxPeak) : null,
        hasActiveCommitment: hasCommitment,
        hasCourseEnrollment: hasCourse,
        hasSeminarParticipation: hasSeminar,
        sortBy, sortDir, limit: 500, offset: 0,
      });
      if (res?.error) { setError(res.error); return; }
      setRows(res.rows);
      setTotal(res.total);
      setSelected(new Set());
    });
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectFirstN() {
    const n = Number(quickCount) || 0;
    if (!rows) return;
    setSelected(new Set(rows.slice(0, n).map((r) => r.contact_id)));
  }

  function selectAll() {
    if (!rows) return;
    setSelected(new Set(rows.map((r) => r.contact_id)));
  }

  async function toggleExpand(row) {
    if (expandedId === row.contact_id) { setExpandedId(null); return; }
    setExpandedId(row.contact_id);
    if (!yearBreakdown[row.contact_id]) {
      const years = await getContactDonationsByYear(row.contact_id);
      setYearBreakdown((prev) => ({ ...prev, [row.contact_id]: years }));
    }
  }

  function handleAddToCampaign() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await addContactsToCampaignWithCategory(campaignId, Array.from(selected), category.trim() || null);
      if (res?.error) { setError(res.error); return; }
      setAddedMsg(`נוספו ${selected.size} אנשי קשר לקמפיין${category ? ` בקטגוריה "${category}"` : ''}.`);
      setRows((prev) => (prev || []).filter((r) => !selected.has(r.contact_id)));
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4 }}>מקור (source)</div>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="למשל: מאגר בוגרים" style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4 }}>מחלקה (לשלב)</div>
            <select value={stageWorkspaceId} onChange={(e) => { setStageWorkspaceId(e.target.value); setStage(''); }} style={{ ...inputStyle, width: '100%' }}>
              <option value="">— ללא —</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4 }}>שלב</div>
            <select value={stage} onChange={(e) => setStage(e.target.value)} disabled={!stageWorkspaceId} style={{ ...inputStyle, width: '100%' }}>
              <option value="">— כל השלבים —</option>
              {stageOptions.map((s) => <option key={s} value={s}>{selectedWorkspaceStages.labels[s] || s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4 }}>שנת-שיא תרומה — מ-₪</div>
            <input type="number" value={minPeak} onChange={(e) => setMinPeak(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4 }}>שנת-שיא תרומה — עד ₪</div>
            <input type="number" value={maxPeak} onChange={(e) => setMaxPeak(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <TriState value={hasCommitment} onChange={setHasCommitment} label="הוראת קבע פעילה" />
          <TriState value={hasCourse} onChange={setHasCourse} label="השתתף בקורסים" />
          <TriState value={hasSeminar} onChange={setHasSeminar} label="השתתף בסמינרים" />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary, #6b6b6b)', marginBottom: 4 }}>מיון</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle}>
                <option value="name">שם</option>
                <option value="amount">שנת-שיא (סכום)</option>
                <option value="last_donation">תאריך תרומה אחרונה</option>
              </select>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={inputStyle}>
                <option value="desc">יורד</option>
                <option value="asc">עולה</option>
              </select>
            </div>
          </div>
          <button type="button" onClick={handleSearch} disabled={isPending} style={{
            background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 20px', fontSize: 13, cursor: 'pointer',
          }}>
            {isPending ? 'מחפש...' : 'הצג תוצאות'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted, #9b9b9b)', margin: '8px 0 0' }}>
          מי שכבר בקמפיין הזה (מכל קטגוריה) מוחרג אוטומטית מהתוצאות.
        </p>
      </div>

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {addedMsg && <div style={{ color: '#1f7a3d', fontSize: 12.5, marginBottom: 10 }}>✓ {addedMsg}</div>}

      {rows && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{rows.length} תוצאות (מתוך {total})</span>
            <button type="button" onClick={selectAll} style={{ ...inputStyle, cursor: 'pointer', background: 'var(--bg)' }}>בחר הכל</button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              קח את ה-
              <input type="number" value={quickCount} onChange={(e) => setQuickCount(e.target.value)} style={{ ...inputStyle, width: 60 }} />
              הראשונים
              <button type="button" onClick={selectFirstN} style={{ ...inputStyle, cursor: 'pointer', background: 'var(--bg)' }}>בחר</button>
            </span>
          </div>

          <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
                  <th style={{ padding: '8px 8px' }}></th>
                  {['שם', 'טלפון', 'מקור', 'שנת-שיא', 'תרומה אחרונה', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)', padding: '8px 12px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.contact_id}>
                    <tr style={{ borderBottom: '1px solid #f2f2f2' }}>
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        <input type="checkbox" checked={selected.has(r.contact_id)} onChange={() => toggleSelect(r.contact_id)} />
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.first} {r.last}</td>
                      <td style={{ padding: '8px 12px' }}>{r.phone || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{r.source || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{r.peak_donation_amount ? `₪${Number(r.peak_donation_amount).toLocaleString('he-IL')} (${r.peak_donation_year})` : '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{r.last_donation_date ? new Date(r.last_donation_date).toLocaleDateString('he-IL') : '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {r.peak_donation_amount && (
                          <button type="button" onClick={() => toggleExpand(r)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--accent, #1f4d3d)', cursor: 'pointer' }}>
                            {expandedId === r.contact_id ? 'סגור' : 'פירוט שנתי'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === r.contact_id && (
                      <tr>
                        <td colSpan={7} style={{ padding: '6px 20px 10px', background: 'var(--bg-secondary, #fafafa)' }}>
                          {(yearBreakdown[r.contact_id] || []).map((y) => (
                            <span key={y.donation_year} style={{ display: 'inline-block', marginInlineEnd: 14, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                              {y.donation_year}: ₪{Number(y.year_total).toLocaleString('he-IL')}
                            </span>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 14, color: 'var(--text-muted, #9b9b9b)' }}>אין תוצאות לפי הסינון הזה</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#eef2f7', border: '1px solid #c9d6e3', borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3b5878' }}>נבחרו {selected.size}</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="קטגוריה (אופציונלי)" style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={handleAddToCampaign} disabled={isPending} style={{
                background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 12.5, cursor: 'pointer',
              }}>
                הוספה לקמפיין
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
