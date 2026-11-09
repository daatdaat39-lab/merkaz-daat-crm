import { headers } from 'next/headers';
import { createAdminClient } from '../../../lib/supabase/admin';
import { isPublicLinkExpired, isBotUserAgent } from '../../dashboard/lib/publicLink';
import PublicRegistrationScreen from './PublicRegistrationScreen';
import PaymentStepCard from './PaymentStepCard';
import { PageShell, MessageCard, IconCheckCircle, IconWarn } from './RegistrationChrome';
import { getBrand } from '../../../lib/brand';

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
export default async function PublicRegistrationPage({ params, searchParams }) {
  const { token } = params;
  const admin = createAdminClient();
  // m=details: פרטים בלבד, בלי שלב התשלום. כל ערך אחר (וקישורים ישנים בלי
  // פרמטר) = "הכול": פרטים ואחריהם מעבר לתשלום, כשיש קישור תשלום.
  const mode = searchParams?.m === 'details' ? 'details' : 'all';

  const { data: row } = await admin
    .from('lead_conversion_checklist')
    .select(`
      id, contact_department_id, signatures_done, signature_image_path, registration_answers, payment_link, public_token_created_at,
      payment_total_amount, payment_installments_count,
      contact_departments:contact_department_id (
        course_id, contact_id, workspace_id,
        workspaces:workspace_id (name),
        contacts:contact_id (first, frozen)
      )
    `)
    .eq('public_token', token)
    .maybeSingle();

  if (!row || row.contact_departments?.contacts?.frozen) {
    return <InvalidLinkCard />;
  }
  // ערכת מותג לפי שם המחלקה (ר' lib/brand.js) - צבעים/גופן/שם שהלקוח מכיר מהאתר
  const brand = getBrand(row.contact_departments?.workspaces?.name);
  if (isPublicLinkExpired(row.public_token_created_at)) {
    return <ExpiredLinkCard brand={brand} />;
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
    return <CompletedCard brand={brand} firstName={row.contact_departments?.contacts?.first} />;
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
      ? admin.from('courses').select('name, price, payment_page_url, checklist_payment_enabled').eq('id', courseId).maybeSingle()
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

  // שלב התשלום קיים רק בקישור "הכול" ורק כשיש קישור לדף תשלום תקין. הסכום
  // מוצג מהסכום שהנציג קבע, ובהיעדרו ממחיר הקורס (כמו הקישור האישי לקשר).
  const paymentBase = row.payment_link || course?.payment_page_url || '';
  const paymentStep = mode === 'all' && course?.checklist_payment_enabled !== false && /^https?:\/\//i.test(paymentBase);
  const paymentSummary = {
    courseName: course?.name || '',
    amount: Number(row.payment_total_amount) || Number(course?.price) || null,
    installments: Number(row.payment_installments_count) || null,
  };

  // "אין-מה-לעשות" - כל-מה-שבאמת-נדרש (required) כבר-הושלם: עם שלב תשלום
  // מוצג הסיכום וכפתור המעבר לתשלום, בלי - "תודה, הכל הושלם".
  if (!missingRequired) {
    if (paymentStep) {
      return <PaymentStepCard brand={brand} firstName={row.contact_departments?.contacts?.first} token={token} summary={paymentSummary} />;
    }
    return <DoneCard brand={brand} firstName={row.contact_departments?.contacts?.first} />;
  }

  return (
    <PublicRegistrationScreen
      brand={brand}
      token={token}
      firstName={row.contact_departments?.contacts?.first || ''}
      courseName={course?.name || ''}
      formFields={formFields || []}
      initialAnswers={answers}
      initialUploadedDocuments={uploadedDocs || []}
      initialSignaturesDone={!!row.signatures_done}
      paymentStep={paymentStep}
      paymentSummary={paymentSummary}
    />
  );
}

function InvalidLinkCard() {
  return (
    <PageShell>
      <MessageCard tone="warn" icon={<IconWarn />} title="הקישור שגוי">
        ייתכן שהקישור הוחלף בקישור חדש או שהועתק לא במלואו.
        <br />
        אנא פנו לנציג שלכם לקבלת קישור מעודכן.
      </MessageCard>
    </PageShell>
  );
}

function ExpiredLinkCard({ brand }) {
  return (
    <PageShell brand={brand}>
      <MessageCard tone="warn" icon={<IconWarn />} title="הקישור פג תוקף">
        מטעמי אבטחה הקישור תקף לזמן מוגבל.
        <br />
        אנא פנו לנציג שלכם לקבלת קישור חדש.
      </MessageCard>
    </PageShell>
  );
}

function CompletedCard({ firstName, brand }) {
  return (
    <PageShell brand={brand}>
      <MessageCard tone="ok" icon={<IconCheckCircle size={34} />} title={`ההרשמה הושלמה${firstName ? `, ${firstName}` : ''}`}>
        תודה! אין צורך במילוי נוסף.
        <br />
        לכל שאלה אפשר לפנות לנציג שלכם.
      </MessageCard>
    </PageShell>
  );
}

function DoneCard({ firstName, brand }) {
  return (
    <PageShell brand={brand}>
      <MessageCard tone="ok" icon={<IconCheckCircle size={34} />} title={`תודה${firstName ? `, ${firstName}` : ''}!`}>
        כל הפרטים נקלטו.
        <br />
        הנציג שלכם ייצור איתכם קשר להמשך התהליך.
      </MessageCard>
    </PageShell>
  );
}
