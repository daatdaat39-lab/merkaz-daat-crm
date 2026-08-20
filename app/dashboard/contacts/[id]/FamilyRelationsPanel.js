'use client';

// תצוגה קריאה-בלבד של קשרים בין אנשי-קשר (contact_relations, one-to-many
// אמיתי - למשל תלמיד↔הורה) - יצירת הקשר קורית רק בזמן ייבוא (ר.
// resolveContactRelation ב-leadIntakeCore.js), כאן רק תצוגה, אותו סגנון
// קומפקטי כמו בלוק relatedContact הקיים ב-PersonalInfoCard.js (לא כרטיס
// רחב כמו KesherProjectPanel - זה יושב בעמודה הצרה של 260px).
// forward = "אני מקושר אליו" (למשל תלמיד→אב/אם), reverse = "הוא מקושר
// אליי" (למשל הורה←ילד/ה) - שתי כיוונים כי contact_relations שומרת
// שורה אחת בלבד לכל קשר, לא כפולה בכיוון ההפוך.
export default function FamilyRelationsPanel({ relatedContacts = { forward: [], reverse: [] } }) {
  const { forward = [], reverse = [] } = relatedContacts;
  if (forward.length === 0 && reverse.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: '#9b9b9b' }}>קשרי משפחה</div>
      {forward.map((r) => r.contact && (
        <a key={r.id} href={`/dashboard/contacts/${r.contact.id}`} style={{ display: 'block', fontSize: 13, color: '#1f4d3d', textDecoration: 'none' }}>
          {r.label}: {r.contact.first} {r.contact.last} →
        </a>
      ))}
      {reverse.map((r) => r.contact && (
        <a key={r.id} href={`/dashboard/contacts/${r.contact.id}`} style={{ display: 'block', fontSize: 13, color: '#1f4d3d', textDecoration: 'none' }}>
          {r.label}: {r.contact.first} {r.contact.last} →
        </a>
      ))}
    </div>
  );
}
