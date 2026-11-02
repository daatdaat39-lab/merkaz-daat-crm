'use client';

// פין-מחלקה בראש כרטיס-איש-הקשר - פין אחד-בלבד-לכל-מחלקה (מדודד לפי
// workspaceId בכרטיס-הקורא, ContactDetailClient.js), גם-כש-יש-כמה-לידי-
// קורס-פתוחים-במקביל באותה-מחלקה - נמנע-מהצגת-אותו-שם-מחלקה-כמה-פעמים.
// כש-יש-יותר-מליד-אחד, מוצג-תג-מספר קטן. רשימת-הקורסים-עצמה מוצגת
// נפרד, מתחת-לשורת-הפינים (ר' CourseLeadsPanel.js).
export default function CoursePinSwitcher({ department, isActive, count = 1, onSelect }) {
  const pinStyle = {
    fontFamily: 'var(--k-font-display)',
    border: '1px solid ' + (isActive ? 'var(--k-text)' : 'var(--k-border)'),
    background: isActive ? 'var(--k-text)' : 'var(--k-surface)',
    color: isActive ? 'var(--k-bg)' : 'var(--k-text)',
    borderRadius: 8, padding: '4px 13px', fontSize: 12.5, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.3,
  };

  return (
    <button type="button" onClick={onSelect} style={pinStyle}>
      {department.workspaceName}
      {count > 1 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 16, height: 16, borderRadius: 100, fontSize: 10, fontWeight: 700,
          background: isActive ? 'var(--k-bg)' : 'var(--k-accent)',
          color: isActive ? 'var(--k-text)' : '#fff',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}
