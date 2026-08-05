// בדיקת התאמה של איש קשר לסינון מתקדם רב-מחלקתי - AND בין כל המחלקות
// שסומן בהן ערך כלשהו (שלב ו/או שדה). מחלקה בלי שום ערך לא מגבילה
// (מתעלמים ממנה). דורש contact.departments = [{ name, stage, extraFields }].
// שדות מסוג number מקבלים סינון טווח דרך מפתחות בצורת `${key}_from`/
// `${key}_to` בתוך filters[wsName].fields - אין type חדש במערכת, רק
// מוסכמה בשם המפתח שה-UI (AdvancedFilterPanel) כבר מייצר.
export function contactMatchesAdvancedFilter(contact, filters, extraFieldsByWorkspace) {
  const activeWsNames = Object.keys(filters || {}).filter((wsName) => {
    const f = filters[wsName];
    return f && (f.stage || Object.values(f.fields || {}).some(Boolean));
  });
  if (activeWsNames.length === 0) return true;

  return activeWsNames.every((wsName) => {
    const dept = (contact.departments || []).find((d) => d.name === wsName);
    if (!dept) return false;
    const f = filters[wsName];
    if (f.stage && dept.stage !== f.stage) return false;

    const fieldDefs = (extraFieldsByWorkspace && extraFieldsByWorkspace[wsName]) || [];
    return Object.entries(f.fields || {}).every(([fk, fv]) => {
      if (!fv) return true;
      if (fk.endsWith('_from') || fk.endsWith('_to')) {
        const actual = Number(dept.extraFields?.[fk.replace(/_(from|to)$/, '')]);
        if (Number.isNaN(actual)) return false;
        return fk.endsWith('_from') ? actual >= Number(fv) : actual <= Number(fv);
      }
      const fieldDef = fieldDefs.find((d) => d.key === fk);
      const actual = dept.extraFields?.[fk];
      if (fieldDef?.type === 'select') return actual === fv;
      return (actual || '').toString().toLowerCase().includes(fv.toLowerCase());
    });
  });
}
