import { createAdminClient } from '../../../lib/supabase/admin';
import { getBrand } from '../../../lib/brand';
import { isPaymentRef } from '../../../lib/kesher/paymentLink';
import { PageShell, MessageCard, IconCheckCircle, IconWarn } from '../../register/[token]/RegistrationChrome';
import PayAutoRefresh from './PayAutoRefresh';

export const dynamic = 'force-dynamic';

// עמוד חזרה מדף התשלום של קשר (successurl / failedurl בקישור התשלום האישי).
// ציבורי, בלי session. לא סומכים על שום פרמטר שקשר מוסיפה לכתובת בחזרה (מגיעים
// דרך הדפדפן של המשלם ואפשר לזייף) - המצב נקבע רק מנתוני השרת: האם עסקה עם
// המזהה הזה כבר נקלטה מקשר. לא נחשף שום סכום, שם משפחה או פרט אישי.
export const metadata = {
  title: 'חזרה מהתשלום',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function PayReturnPage({ params, searchParams }) {
  const ref = String(params.ref || '').toLowerCase();
  if (!isPaymentRef(ref)) return <InvalidCard />;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('lead_conversion_checklist')
    .select('contact_departments:contact_department_id (workspaces:workspace_id (name), contacts:contact_id (first))')
    .eq('payment_ref', ref)
    .maybeSingle();
  if (!row) return <InvalidCard />;

  const brand = getBrand(row.contact_departments?.workspaces?.name);
  const firstName = (row.contact_departments?.contacts?.first || '').trim();

  const { data: paid } = await admin.from('donation_transactions').select('id').eq('external_ref', ref).limit(1);
  const isPaid = (paid?.length || 0) > 0;
  const reportedFailure = searchParams?.r === 'failed';

  if (isPaid) {
    return (
      <PageShell brand={brand}>
        <MessageCard tone="ok" icon={<IconCheckCircle />} title="התשלום התקבל">
          תודה{firstName ? ` ${firstName}` : ''}! הצוות יחזור אליך בקרוב עם המשך הרישום.
        </MessageCard>
      </PageShell>
    );
  }

  if (reportedFailure) {
    return (
      <PageShell brand={brand}>
        <MessageCard tone="warn" icon={<IconWarn />} title="התשלום לא הושלם">
          לא חויבת. אפשר לחזור לקישור שקיבלת ולנסות שוב, או לפנות אלינו ונעזור.
        </MessageCard>
      </PageShell>
    );
  }

  return (
    <PageShell brand={brand}>
      <MessageCard tone="neutral" icon={<IconCheckCircle />} title="מאשרים את התשלום">
        אם השלמת את התשלום, הוא יופיע אצלנו תוך כמה דקות ואין צורך לשלם שוב. הדף מתעדכן לבד.
      </MessageCard>
      <PayAutoRefresh />
    </PageShell>
  );
}

function InvalidCard() {
  return (
    <PageShell>
      <MessageCard tone="warn" icon={<IconWarn />} title="הקישור אינו תקין">
        הקישור שגוי או שפג תוקפו. אפשר לפנות אלינו ונשמח לעזור.
      </MessageCard>
    </PageShell>
  );
}
