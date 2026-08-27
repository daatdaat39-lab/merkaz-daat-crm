'use client';

// תמונה מלאה חוצת-מחלקות של איש הקשר - שורות נפרדות: מאיזה מחלקות הוא
// מוכר לנו, שנת-השיא של התרומות שלו (השנה עם הסכום הגבוה ביותר, לא
// ממוצע), תאריך תרומה אחרונה, וה"אינטראקציה האחרונה" מכל סוג - תרומה/
// פגישה בתאריך מדויק, או קורס/סמינר בתאריך משוער משנה עברית. משותף בין
// מסך המיפוי (MappingQueue) לבין מסך בניית-הקבוצה (SegmentFinder) - אותה
// תמונה בדיוק, כדי שההחלטה איפה לשייך מישהו תתבסס על אותו מידע.
export default function ContactInsightsPanel({ insights, compact = false }) {
  if (!insights) return null;
  const { departments, peakDonation, lastDonationDate, totalDonations, hasActiveCommitment, coursesCount, seminarsCount, lastInteraction } = insights;

  const row = (label, value) => (
    <div style={{ display: 'flex', gap: 5, fontSize: compact ? 11 : 12.5 }}>
      <span style={{ color: 'var(--text-muted, #9b9b9b)', flexShrink: 0 }}>{label}:</span>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 3 : 4, background: 'var(--bg-secondary, #fafafa)', borderRadius: compact ? 6 : 8, padding: compact ? '8px 10px' : '10px 12px' }}>
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
