import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { buildPersonalPaymentUrl, isPaymentRef } from '../../../lib/kesher/paymentLink';
import { isPublicLinkExpired, isBotUserAgent } from './publicLink';

// לוגיקה משותפת לנתיבי הקישור הקצר (/r, /d, /p) ולנתיב התשלום של הקישור הארוך
// (/register/[token]/pay): שליפת הליד מהקוד או מהטוקן, והפניה ללקוח. הכול
// בצד שרת עם admin client (משטח ציבורי, בלי session). הכתובת הארוכה של קשר
// (שם, טלפון, מייל, סכום, מזהה) נבנית רק כאן, אחרי הלחיצה ומהנתונים העדכניים
// במסד, ולכן לא מופיעה בהודעה שנשלחת ללקוח.

const SELECT = `
  id, contact_department_id, public_token, public_token_created_at,
  payment_ref, payment_link, payment_total_amount, payment_installments_count, payment_link_sent_at,
  contact_departments:contact_department_id (
    course_id, contact_id,
    contacts:contact_id (first, last, phone, email, frozen)
  )
`;

export async function loadChecklistByShortCode(admin, code) {
  const { data } = await admin.from('lead_conversion_checklist').select(SELECT).eq('short_code', code).maybeSingle();
  return data || null;
}

export async function loadChecklistByToken(admin, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const { data } = await admin.from('lead_conversion_checklist').select(SELECT).eq('public_token', token).maybeSingle();
  return data || null;
}

async function hasActivePurchase(admin, departmentId) {
  const { data } = await admin
    .from('course_purchases').select('id')
    .eq('contact_department_id', departmentId).neq('status', 'cancelled').limit(1);
  return !!data?.length;
}

// כתובת התשלום האישית בקשר, או null אם אין קישור דף תשלום תקין. יוצרת מזהה
// תשלום אישי אם עוד אין, ומסמנת שהלקוח התחיל בתשלום (payment_link_sent_at),
// כדי שמסך הרישום של הנציג יציג "ממתין לתשלום" וירענן.
async function buildPaymentUrl(admin, row, origin) {
  const dept = row.contact_departments;
  const contact = dept?.contacts;
  if (!dept || !contact || contact.frozen) return null;

  const { data: course } = dept.course_id
    ? await admin.from('courses').select('price, payment_page_url').eq('id', dept.course_id).maybeSingle()
    : { data: null };
  const baseUrl = row.payment_link || course?.payment_page_url;
  if (!baseUrl) return null;

  let ref = row.payment_ref;
  if (!isPaymentRef(ref)) {
    ref = `mdc-${crypto.randomBytes(8).toString('hex')}`;
    const { error } = await admin.from('lead_conversion_checklist').update({ payment_ref: ref }).eq('id', row.id);
    if (error) return null;
  }

  const url = buildPersonalPaymentUrl(baseUrl, {
    ref, origin,
    firstName: contact.first, lastName: contact.last, phone: contact.phone, email: contact.email,
    amount: row.payment_total_amount ?? course?.price, installments: row.payment_installments_count,
  });
  if (!url) return null;

  if (!row.payment_link_sent_at) {
    await admin.from('lead_conversion_checklist').update({ payment_link_sent_at: new Date().toISOString() }).eq('id', row.id);
  }
  return url;
}

// תצוגה מקדימה לבוטים של וואטסאפ וכדומה: בלי לבצע שום פעולה (לא יוצרת מזהה
// תשלום ולא מסמנת "נפתח"), רק כותרת יפה לכרטיס הקישור.
function previewResponse(title) {
  const safe = String(title).replace(/[<>&"]/g, '');
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${safe}</title>` +
    `<meta property="og:title" content="${safe}"><meta property="og:description" content="קישור אישי ומאובטח">` +
    `<meta name="robots" content="noindex,nofollow"></head><body>${safe}</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
}

function redirectTo(request, path) {
  return NextResponse.redirect(new URL(path, request.url));
}

// /r/<קוד> (הכול) ו-/d/<קוד> (פרטים בלבד): מפנה לעמוד הרישום הציבורי עם מצב.
export async function registerRedirectResponse(request, row, mode) {
  if (!row?.public_token || row.contact_departments?.contacts?.frozen) return redirectTo(request, '/register/invalid');
  if (isBotUserAgent(request.headers.get('user-agent'))) return previewResponse('השלמת הרשמה');
  return redirectTo(request, `/register/${row.public_token}?m=${mode}`);
}

// /p/<קוד> ו-/register/<טוקן>/pay: מפנה לעמוד התשלום האישי של קשר.
export async function paymentRedirectResponse(request, admin, row) {
  if (!row?.public_token || row.contact_departments?.contacts?.frozen) return redirectTo(request, '/register/invalid');
  if (isBotUserAgent(request.headers.get('user-agent'))) return previewResponse('תשלום להרשמה');

  const registerUrl = `/register/${row.public_token}`;
  // קישור שפג תוקפו או הרשמה שהושלמה: עמוד הרישום מציג את ההודעה המתאימה.
  if (isPublicLinkExpired(row.public_token_created_at)) return redirectTo(request, registerUrl);
  if (await hasActivePurchase(admin, row.contact_department_id)) return redirectTo(request, registerUrl);

  const url = await buildPaymentUrl(admin, row, new URL(request.url).origin);
  if (!url) return redirectTo(request, `${registerUrl}?m=all`);
  return NextResponse.redirect(url, { headers: { 'Referrer-Policy': 'no-referrer' } });
}
