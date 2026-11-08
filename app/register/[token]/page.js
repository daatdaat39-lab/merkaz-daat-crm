import { headers } from 'next/headers';
import { createAdminClient } from '../../../lib/supabase/admin';
import { isPublicLinkExpired, isBotUserAgent } from '../../dashboard/lib/publicLink';
import PublicRegistrationScreen from './PublicRegistrationScreen';

export const dynamic = 'force-dynamic';

// עמוד פרטי עם טוקן בכתובת: לא לאנדקס, ולא לשלוח את הכתובת (כולל הטוקן)
// כ-Referer לאתרים אחרים (למשל דף התשלום החיצוני שאליו מקשרים בסוף).
export const metadata = {
  title: 'השלמת רישום',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// עמוד-הקישור-האישי-הציבורי (migration 0181) - בלי-session, בלי-RLS,
// admin-client-בלבד. **לא-גדור** ע"י middleware.js (matcher שלו הוא
// '/dashboard/:path*' בלבד) - route חדש-לגמרי, מחוץ-ל-app/dashboard.
// שליפה ברשימת-עמודות-מפורשת (לא select('*')) - אסור-לחשוף-לכאן שום-
// דבר-פיננסי/AI/מחלקות-אחרות, גם-לא-בטעות. תשלום לא-חלק-מהטופס-הפעיל
// בכלל. **חריג-יחיד-מכוון**: שני-שדות-קישור-תשלום (payment_link/
// payment_page_url) נשלפים-אך-ורק-כדי-להציג-כפתור-"מעבר-לתשלום" במסך-
// ה"תודה" (DoneCard, אחרי-שהכל-כבר-הושלם) - לא-נחשף-שום-סכום/סטטוס-
// תשלום, רק-קישור-חיצוני.
export default async function PublicRegistrationPage({ params }) {
  const { token } = params;
  const admin = createAdminClient();

  const { data: row } = await admin
    .from('lead_conversion_checklist')
    .select(`
      id, contact_department_id, signatures_done, signature_image_path, registration_answers, payment_link, public_token_created_at,
      contact_departments:contact_department_id (
        course_id, contact_id,
        contacts:contact_id (first, frozen)
      )
    `)
    .eq('public_token', token)
    .maybeSingle();

  if (!row || row.contact_departments?.contacts?.frozen) {
    return <InvalidLinkCard />;
  }
  if (isPublicLinkExpired(row.public_token_created_at)) {
    return <ExpiredLinkCard />;
  }

  // הרשמה שכבר הושלמה בפועל (נוצרה רכישה שלא בוטלה): הקישור הופך לקריאה-
  // בלבד - אסור שמי שמחזיק בקישור ימשיך לשנות תשובות/להחליף מסמכים וחתימה
  // אחרי שהנציג סגר את הרישום.
  const { data: completedPurchase } = await admin
    .from('course_purchases')
    .select('id')
    .eq('contact_department_id', row.contact_department_id)
    .neq('status', 'cancelled')
    .limit(1);
  if (completedPurchase?.length) {
    return <CompletedCard firstName={row.contact_departments?.contacts?.first} />;
  }

  // מתעדכן-בכל-טעינה (לא-רק-בשינוי) - כדי-שהנציג-יראה-הבדל בין "עוד-
  // לא-נפתח" ל"נפתח-אבל-לא-התקדם" (כרטיס "קישור אישי" במסך-הרישום).
  // לא מעדכנים כשהבקשה מגיעה מתצוגה מקדימה/בוט (ר' publicLink.js).
  if (!isBotUserAgent(headers().get('user-agent'))) {
    await admin.from('lead_conversion_checklist').update({ public_link_last_opened_at: new Date().toISOString() }).eq('id', row.id);
  }

  const courseId = row.contact_departments?.course_id;
  const [{ data: course }, { data: formFields }, { data: uploadedDocs }] = await Promise.all([
    courseId
      ? admin.from('courses').select('name, payment_page_url').eq('id', courseId).maybeSingle()
      : Promise.resolve({ data: null }),
    // מערכת-טפסים-בסיסית (migration 0182) - רשימה-אחת-מסודרת-עם-type
    // (טקסט/מספר/תאריך/בחירה/קובץ/חתימה) - אותו-מקור-בדיוק כמו-צד-הנציג.
    courseId
      ? admin.from('course_form_fields').select('id, field_key, label, type, options, required').eq('course_id', courseId).eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
    admin.from('contact_documents').select('id, requirement_id, original_filename, uploaded_at').eq('contact_department_id', row.contact_department_id),
  ]);

  const answers = row.registration_answers || {};
  const uploadedReqIds = new Set((uploadedDocs || []).map((d) => d.requirement_id));
  const missingRequired = (formFields || []).some((f) => {
    if (f.required === false) return false;
    if (!f.required) return false;
    if (f.type === 'file') return !uploadedReqIds.has(f.id);
    if (f.type === 'signature') return !row.signatures_done;
    return !answers[f.field_key];
  });

  // "אין-מה-לעשות" - כל-מה-שבאמת-נדרש (required) כבר-הושלם - מוצג
  // "תודה, הכל הושלם" במקום-הטופס-הפעיל, בלי-צורך-להרכיב-את-כל-הפרופס.
  if (!missingRequired) {
    return <DoneCard firstName={row.contact_departments?.contacts?.first} paymentLink={row.payment_link || course?.payment_page_url || null} />;
  }

  return (
    <PublicRegistrationScreen
      token={token}
      firstName={row.contact_departments?.contacts?.first || ''}
      courseName={course?.name || ''}
      formFields={formFields || []}
      initialAnswers={answers}
      initialUploadedDocuments={uploadedDocs || []}
      initialSignaturesDone={!!row.signatures_done}
    />
  );
}

function PageShell({ children }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, var(--k-bg) 0%, var(--k-pill-bg) 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{
        maxWidth: 440, width: '100%', textAlign: 'center', background: 'var(--k-surface)',
        border: '1px solid var(--k-border)', borderRadius: 16, padding: '40px 32px', boxShadow: '0 4px 24px rgba(0,0,0,.06)',
      }}>
        {children}
      </div>
    </div>
  );
}

function InvalidLinkCard() {
  return (
    <PageShell>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--k-text)' }}>הקישור שגוי או שפג תוקפו</div>
      <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>
        ייתכן שהקישור הוחלף בקישור חדש. אנא פנה/י לנציג שלך לקבלת קישור מעודכן.
      </div>
    </PageShell>
  );
}

function ExpiredLinkCard() {
  return (
    <PageShell>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--k-text)' }}>הקישור פג תוקף</div>
      <div style={{ fontSize: 13, color: 'var(--k-text-muted)' }}>
        מטעמי אבטחה הקישור תקף לזמן מוגבל. אנא פנה/י לנציג שלך לקבלת קישור חדש.
      </div>
    </PageShell>
  );
}

function CompletedCard({ firstName }) {
  return (
    <PageShell>
      <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 19, fontWeight: 700, marginBottom: 8, color: 'var(--k-text)' }}>
        ההרשמה הושלמה{firstName ? `, ${firstName}` : ''}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--k-text-muted)' }}>
        תודה! אין צורך במילוי נוסף. לכל שאלה אפשר לפנות לנציג שלך.
      </div>
    </PageShell>
  );
}

function DoneCard({ firstName, paymentLink }) {
  return (
    <PageShell>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
      <div style={{ fontFamily: 'var(--k-font-display)', fontSize: 19, fontWeight: 700, marginBottom: 8, color: 'var(--k-text)' }}>תודה{firstName ? `, ${firstName}` : ''}!</div>
      <div style={{ fontSize: 13.5, color: 'var(--k-text-muted)' }}>הכל הושלם. הנציג שלך ייצור איתך קשר להמשך התהליך.</div>
      {paymentLink && (
        <a
          href={paymentLink} target="_blank" rel="noreferrer"
          style={{
            display: 'inline-block', marginTop: 20, fontFamily: 'var(--k-font-display)', fontSize: 14, fontWeight: 700,
            color: '#fff', background: 'var(--k-accent)', borderRadius: 10, padding: '11px 28px', textDecoration: 'none',
          }}
        >
          מעבר לתשלום ←
        </a>
      )}
    </PageShell>
  );
}
