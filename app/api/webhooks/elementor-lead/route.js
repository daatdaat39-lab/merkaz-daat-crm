import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { findExistingMatch, upsertDepartmentMembership } from '../../../dashboard/contacts/leadIntakeCore';
import { resolveSourceAndCourse } from '../../../dashboard/components/sourceLinks';
import { STAGE_NEW_LEAD, STAGE_OPEN } from '../../../dashboard/lib/leadStageKeys';
import { safeEqual } from '../../../../lib/security/safeEqual';

// קליטת לידים מטפסי האתר (Elementor Pro, פעולת Webhook בטופס).
// כתובת: POST /api/webhooks/elementor-lead?token=...&workspace_id=...&course_id=...
// הטוקן בכתובת כי אלמנטור לא יודע לשלוח כותרת מותאמת (כמו inforu-whatsapp);
// הכתובת נשמרת בהגדרות הטופס ב-WordPress ולא בדף הציבורי. המחלקה והקורס
// נקבעים לפי הכתובת של כל טופס - ר' המחולל במסך "מקורות לידים".
const REASON = 'פנייה מטופס האתר';

const EMAIL_LABEL = /מייל|אימייל|דוא"?ל|e-?mail/i;
const PHONE_LABEL = /טלפון|נייד|פלאפון|סלולר|phone|tel|mobile/i;
const FIRST_LABEL = /שם פרטי|first/i;
const LAST_LABEL = /משפחה|last|surname/i;
// "שם" כמילה שלמה בלבד - כדי שתווית כמו "נרשם בעבר" לא תיחשב כשדה שם
const NAME_LABEL = /(^|[\s_])שם([\s:*]|$)|name/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_VALUE = /^\+?[\d\s()-]{9,17}$/;

const SUSPICIOUS_NAME = /https?:|www\.|\.(com|net|org|ru|info|xyz)\b|[<>{}\[\]]/i;
const NOT_FOUND_TITLE = /הדף לא נמצא|page not found|404/i;

// נייד (05X, 10 ספרות), קווי (02/03/04/08/09, 9 ספרות) או 07X (10 ספרות),
// גם בקידומת 972. זה המסנן העיקרי נגד ספאם: בלי מספר תקין אין למי להתקשר.
function isValidIsraeliPhone(phone) {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  return /^05\d{8}$/.test(digits) || /^0[23489]\d{7}$/.test(digits) || /^07\d{8}$/.test(digits);
}

// סיבות לחשד - פנייה חשודה לא נזרקת אלא ממתינה לאישור מנהל (sales/pending),
// כדי שליד אמיתי שטעה במספר לא יאבד והנציגים לא יראו ספאם.
function suspicionReasons(lead) {
  const reasons = [];
  if (!isValidIsraeliPhone(lead.phone)) reasons.push('אין טלפון תקין');
  if (SUSPICIOUS_NAME.test(`${lead.first} ${lead.last}`)) reasons.push('שם חשוד');
  if (NOT_FOUND_TITLE.test(lead.pageTitle)) reasons.push('נשלח מדף שלא קיים באתר');
  return reasons;
}

function clip(value, max) {
  return (value ?? '').toString().trim().slice(0, max);
}

// JSON מקונן -> מפתחות בסגנון PHP ("fields[name][value]"), כדי ששני
// הפורמטים (JSON ו-form-encoded) יעברו באותו מסלול פענוח.
function flatten(value, prefix, out) {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}[${key}]` : key, out);
    }
  } else if (prefix) {
    out.push([prefix, value == null ? '' : String(value)]);
  }
  return out;
}

async function readEntries(request) {
  if ((request.headers.get('content-type') || '').includes('application/json')) {
    const json = await request.json().catch(() => null);
    return json && typeof json === 'object' ? flatten(json, '', []) : [];
  }
  const form = await request.formData().catch(() => null);
  return form ? [...form.entries()].filter(([, v]) => typeof v === 'string') : [];
}

// אלמנטור שולח באחד משני מבנים: "Advanced Data" (fields[<id>][type|title|value],
// meta[page_url][value], form[name]) או מבנה פשוט שבו המפתח הוא תווית השדה.
function parseSubmission(entries) {
  const advanced = new Map();
  const items = [];
  let pageUrl = '';
  let pageTitle = '';
  let formName = '';

  for (const [key, raw] of entries) {
    const value = (raw || '').trim();
    const field = key.match(/^fields\[([^\]]+)\]\[(\w+)\]$/);
    if (field) {
      const item = advanced.get(field[1]) || { id: field[1] };
      item[field[2]] = value;
      advanced.set(field[1], item);
    } else if (key === 'meta[page_url][value]' || (!pageUrl && /page_url|referr?er/i.test(key) && value.startsWith('http'))) {
      pageUrl = value;
    } else if (/^meta\[page_title\]/.test(key) || key === 'page_title') {
      pageTitle = value;
    } else if (key === 'form[name]' || key === 'form_name') {
      formName = value;
    } else if (!/^(meta|form|fields)\[/.test(key) && key !== 'form_id') {
      items.push({ id: key, type: '', title: key, value });
    }
  }
  for (const item of advanced.values()) {
    items.push({ id: item.id, type: item.type || '', title: item.title || item.id, value: item.value || '' });
  }

  const found = { email: '', phone: '', first: '', last: '', fullName: '' };
  const extras = [];
  for (const item of items) {
    if (!item.value) continue;
    const label = `${item.id} ${item.title}`;
    let slot = null;
    if (item.type === 'email' || EMAIL_LABEL.test(label)) slot = 'email';
    else if (item.type === 'tel' || PHONE_LABEL.test(label)) slot = 'phone';
    else if (FIRST_LABEL.test(label)) slot = 'first';
    else if (LAST_LABEL.test(label)) slot = 'last';
    else if (NAME_LABEL.test(label)) slot = 'fullName';
    if (slot && !found[slot]) found[slot] = item.value;
    else extras.push(item);
  }
  // גיבוי לפי צורת הערך - טופס עם תוויות לא צפויות עדיין לא מאבד טלפון/מייל
  for (const [slot, pattern] of [['email', EMAIL_VALUE], ['phone', PHONE_VALUE]]) {
    if (found[slot]) continue;
    const index = extras.findIndex((e) => pattern.test(e.value));
    if (index !== -1) found[slot] = extras.splice(index, 1)[0].value;
  }

  let first = found.first;
  let last = found.last;
  if (!first && found.fullName) {
    const parts = found.fullName.split(/\s+/);
    first = parts[0];
    if (!last) last = parts.slice(1).join(' ');
  }

  const noteLines = extras.map((e) => `${e.title}: ${e.value}`);
  if (formName) noteLines.unshift(`טופס: ${formName}`);

  return {
    first: clip(first, 80) || 'ליד מהאתר',
    last: clip(last, 80), // contacts.last היא NOT NULL
    phone: clip(found.phone, 40) || null,
    email: clip(found.email, 200).toLowerCase() || null,
    note: clip(noteLines.join('\n'), 2000) || null,
    pageUrl,
    pageTitle,
  };
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  if (!safeEqual(searchParams.get('token'), process.env.ELEMENTOR_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const workspaceId = (searchParams.get('workspace_id') || '').trim();
  if (!workspaceId) {
    return NextResponse.json({ error: 'חסר workspace_id בכתובת ה-Webhook' }, { status: 400 });
  }

  const entries = await readEntries(request);
  const lead = parseSubmission(entries);
  if (!lead.phone && !lead.email) {
    // שמות המפתחות בלבד (בלי ערכים) - מספיק כדי לתקן את המיפוי לפי הטופס
    const keys = entries.map(([key]) => key);
    console.warn('elementor-lead: no phone/email found, keys:', keys);
    return NextResponse.json({ error: 'לא נמצא טלפון או מייל בטופס', received_keys: keys }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: workspace } = await supabase.from('workspaces').select('id, name, sells_courses').eq('id', workspaceId).maybeSingle();
  if (!workspace) {
    return NextResponse.json({ error: `מחלקה לא נמצאה: ${workspaceId}` }, { status: 404 });
  }

  // קורס לא תקין/לא פעיל לא מפיל את הליד - הוא נכנס כ"קורס לא ידוע" כמו
  // כל קליטה אוטומטית אחרת, והנציג ממיין אותו.
  let courseId = null;
  const courseParam = (searchParams.get('course_id') || '').trim();
  if (courseParam && workspace.sells_courses) {
    const { data: course } = await supabase.from('courses').select('id').eq('id', courseParam).eq('is_active', true).maybeSingle();
    if (course) courseId = course.id;
    else console.warn('elementor-lead: unknown or inactive course_id, falling back to placeholder course');
  }

  // המקור (מפרסם) והקורס לפי הדף שממנו נשלח הטופס - טופס אחד באתר משרת
  // הרבה דפי נחיתה, אז ההתאמה היא מול "מקורות לידים" של המחלקה
  // (lead_sources.link_pattern + course_id). course_id מפורש בכתובת גובר.
  const sourceLink = lead.pageUrl || (searchParams.get('source') || '').trim();
  let source = sourceLink || 'אתר';
  if (sourceLink.startsWith('http')) {
    const resolved = await resolveSourceAndCourse(supabase, workspace.id, sourceLink);
    source = resolved.name || 'אתר';
    if (!courseId && resolved.courseId && workspace.sells_courses) {
      const { data: course } = await supabase.from('courses').select('id').eq('id', resolved.courseId).eq('is_active', true).maybeSingle();
      if (course) courseId = course.id;
    }
  }

  const existing = await findExistingMatch(supabase, { phone: lead.phone, email: lead.email });

  // פנייה חשודה מאדם שלא מוכר למערכת ממתינה לאישור מנהל; מי שכבר קיים
  // במערכת נכנס תמיד כרגיל.
  const reasons = existing ? [] : suspicionReasons(lead);
  const note = reasons.length ? clip(`לבדיקה: ${reasons.join(', ')}\n${lead.note || ''}`, 2000) : lead.note;
  let contactId = existing?.id;
  const created = !existing;

  if (!existing) {
    const { data: inserted, error } = await supabase
      .from('contacts')
      .insert({ first: lead.first, last: lead.last, phone: lead.phone, email: lead.email, source, tags: [] })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contactId = inserted.id;
  } else if (courseId) {
    // מי שכבר ממתין במחלקה על "קורס לא ידוע" ועכשיו מילא טופס של קורס
    // מסוים - מעדכנים את אותו ליד לקורס, במקום לפתוח לו ליד שני.
    const { data: rows } = await supabase.from('contact_departments').select('id, course_id, stage').eq('contact_id', contactId).eq('workspace_id', workspace.id);
    if (rows?.length && !rows.some((r) => r.course_id === courseId)) {
      const { data: placeholder } = await supabase.from('courses').select('id').eq('code', 'UNKNOWN').maybeSingle();
      const waiting = placeholder && rows.find((r) => r.course_id === placeholder.id && [STAGE_NEW_LEAD, STAGE_OPEN].includes(r.stage));
      if (waiting) await supabase.from('contact_departments').update({ course_id: courseId }).eq('id', waiting.id);
    }
  }

  // courseId מועבר רק כשיש קורס תקף - undefined משאיר את ברירת המחדל של
  // upsertDepartmentMembership (שורה קיימת במחלקה / קורס "לא ידוע").
  const options = { requiresApproval: reasons.length > 0 };
  if (courseId) options.courseId = courseId;
  await upsertDepartmentMembership(supabase, contactId, workspace, REASON, note, source, undefined, options);

  return NextResponse.json({ success: true, contact_id: contactId, created, pending_approval: reasons.length > 0 });
}
