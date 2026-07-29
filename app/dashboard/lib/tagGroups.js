// מקבץ תגיות לפי המחלקה שבה הן הכי בשימוש - לא הגדרה ידנית, אלא ניחוש
// אוטומטי מתוך הנתונים עצמם: לכל תגית סופרים באילו מחלקות מופיעים אנשי
// הקשר שנושאים אותה, ובוחרים את המחלקה הדומיננטית. תגית שמפוזרת בין
// כמה מחלקות בלי דומיננטיות ברורה (או שמופיעה על אנשי קשר ללא מחלקה)
// נופלת ל"כלליות". קלט: מערך אנשי קשר עם { tags: string[], departments: { name }[] }.
const DOMINANCE_THRESHOLD = 0.6;

export function groupTagsByDepartment(contacts) {
  const countsByTag = new Map();

  for (const c of contacts) {
    const tags = c.tags || [];
    const depts = (c.departments || []).map((d) => d.name).filter(Boolean);
    for (const tag of tags) {
      if (!countsByTag.has(tag)) countsByTag.set(tag, new Map());
      const deptCounts = countsByTag.get(tag);
      if (depts.length === 0) {
        deptCounts.set('__none__', (deptCounts.get('__none__') || 0) + 1);
      } else {
        for (const dept of depts) {
          deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
        }
      }
    }
  }

  const byDepartment = new Map();
  const general = [];

  for (const [tag, deptCounts] of countsByTag) {
    const total = Array.from(deptCounts.values()).reduce((a, b) => a + b, 0);
    const [topDept, topCount] = Array.from(deptCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topDept !== '__none__' && topCount / total >= DOMINANCE_THRESHOLD) {
      if (!byDepartment.has(topDept)) byDepartment.set(topDept, []);
      byDepartment.get(topDept).push(tag);
    } else {
      general.push(tag);
    }
  }

  const groups = Array.from(byDepartment.entries())
    .map(([department, tags]) => ({ department, tags: tags.sort((a, b) => a.localeCompare(b, 'he')) }))
    .sort((a, b) => a.department.localeCompare(b.department, 'he'));

  if (general.length > 0) {
    groups.push({ department: null, tags: general.sort((a, b) => a.localeCompare(b, 'he')) });
  }

  return groups;
}
