'use client';

// פין-מחלקה בראש כרטיס-איש-הקשר - שם-המחלקה בלבד, לכל המחלקות אחיד
// (כולל-sells_courses=true) - לא-משתנה-ולא-תלוי-בקורס-כלשהו. בחירת/
// החלפת-הקורס מוצגת נפרד לגמרי, בקוביית-הסיכום (GenericStatsTile) -
// ר' LeadCourseSwitcher.js.
export default function CoursePinSwitcher({ department, isActive, onSelect }) {
  const pinStyle = {
    fontFamily: 'var(--k-font-display)',
    border: '1px solid ' + (isActive ? 'var(--k-text)' : 'var(--k-border)'),
    background: isActive ? 'var(--k-text)' : 'var(--k-surface)',
    color: isActive ? 'var(--k-bg)' : 'var(--k-text)',
    borderRadius: 8, padding: '4px 13px', fontSize: 12.5, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 0, lineHeight: 1.3,
  };

  return (
    <button type="button" onClick={onSelect} style={pinStyle}>
      {department.workspaceName}
    </button>
  );
}
