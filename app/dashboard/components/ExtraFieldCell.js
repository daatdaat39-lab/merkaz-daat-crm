'use client';

// רכיב תצוגה טהור - מחליט איזה input לצייר לפי סוג שדה (text/number/
// date/select) ומדווח החוצה דרך onCommit יחיד, בלי שום state/שמירה
// פנימיים. משמש גם ב-LeadRow.js וגם ב-DataGridRow.js - כל אחד שומר
// אצלו את לוגיקת ה-state/ההרשאות/השמירה שלו (שונה בין המסכים), רק
// ה"מה מציירים" משותף. select/date שולחים onCommit מיד ב-onChange;
// text/number הם uncontrolled (defaultValue) ושולחים onCommit רק
// ב-onBlur אם הערך השתנה בפועל - כדי לא לשמור על כל הקשה.
export default function ExtraFieldCell({ field, value, onCommit, disabled, style }) {
  const commonStyle = { border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', fontSize: 12, ...style };

  if (field.type === 'select') {
    return (
      <select value={value || ''} onChange={(e) => onCommit(e.target.value)} disabled={disabled} style={commonStyle}>
        <option value="">—</option>
        {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (field.type === 'date') {
    return (
      <input type="date" value={value || ''} onChange={(e) => onCommit(e.target.value)} disabled={disabled} style={commonStyle} />
    );
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      defaultValue={value || ''}
      onBlur={(e) => { if (e.target.value !== (value || '')) onCommit(e.target.value); }}
      disabled={disabled}
      style={{ width: 100, ...commonStyle }}
    />
  );
}
