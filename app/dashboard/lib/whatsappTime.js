// חישובי זמן לשיחות WhatsApp - קובץ טהור, משותף למסך השיחות ולחלון השליחה.

// חלון השירות של WhatsApp: טקסט חופשי מותר רק 24 שעות מההודעה האחרונה של הלקוח.
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
// ספי המתנה למענה (דקות): מעל הראשון - כתום, מעל השני - אדום וחריגה למנהל.
export const WAIT_WARN_MINUTES = 15;
export const WAIT_ALERT_MINUTES = 60;

export function serviceWindow(lastInboundAt, now = Date.now()) {
  if (!lastInboundAt) return { open: false, never: true, label: 'הלקוח עוד לא כתב - אפשר לשלוח רק תבנית מאושרת' };
  const left = new Date(lastInboundAt).getTime() + SERVICE_WINDOW_MS - now;
  if (left <= 0) return { open: false, never: false, label: 'חלון 24 השעות נסגר - אפשר לשלוח רק תבנית מאושרת' };
  const hours = Math.floor(left / 3600000);
  const minutes = Math.floor((left % 3600000) / 60000);
  return { open: true, never: false, label: `אפשר לכתוב חופשי עוד ${hours > 0 ? `${hours} שע' ` : ''}${minutes} דק'` };
}

export function lastInboundOf(thread = []) {
  let last = null;
  for (const m of thread) {
    if (m.direction === 'in' && (!last || new Date(m.sent_at) > new Date(last))) last = m.sent_at;
  }
  return last;
}

export function waitingInfo(waitingSince, now = Date.now()) {
  if (!waitingSince) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(waitingSince).getTime()) / 60000));
  const level = minutes >= WAIT_ALERT_MINUTES ? 'alert' : minutes >= WAIT_WARN_MINUTES ? 'warn' : 'ok';
  let label;
  if (minutes < 1) label = 'ממתין עכשיו';
  else if (minutes < 60) label = `ממתין ${minutes} דק'`;
  else if (minutes < 1440) label = `ממתין ${Math.floor(minutes / 60)} שע'`;
  else label = `ממתין ${Math.floor(minutes / 1440)} ימים`;
  return { minutes, level, label };
}
