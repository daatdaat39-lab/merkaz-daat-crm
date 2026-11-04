'use client';

// תצוגה קריאה-בלבד של תשובות לשאלות-רישום (course_registration_questions +
// lead_conversion_checklist.registration_answers, migration 0177) - אותו
// דפוס בדיוק כמו CoursePurchasesPanel (ליד-ו). עריכה תמיד דרך מסך-הרישום
// הייעודי (LeadRegistrationScreen.js) - כאן רק-תצוגה, בלי-כפתורי-פעולה.
// מציג רק-שאלות-עם-תשובה-לא-ריקה (עקרון "לא צריך לראות הכל תמיד").
export default function RegistrationAnswersPanel({ questions = [], answers = {} }) {
  const answered = questions.filter((q) => {
    const v = answers[q.field_key];
    return v !== undefined && v !== null && v !== '';
  });
  if (answered.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--k-text-muted, #9b9b9b)', textTransform: 'uppercase', marginBottom: 10 }}>
        פרטי רישום ({answered.length})
      </div>
      <div style={{
        background: 'var(--k-surface, var(--bg))', border: '1px solid var(--k-border, #e5e5e5)',
        borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {answered.map((q) => (
          <div key={q.id} style={{ fontSize: 12.5 }}>
            <span style={{ color: 'var(--k-text-muted, #9b9b9b)' }}>{q.label}: </span>
            <span>{String(answers[q.field_key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
