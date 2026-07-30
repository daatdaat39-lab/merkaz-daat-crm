// אינטגרציית Zoom (Server-to-Server OAuth) - יוצר אוטומטית קישור Zoom
// אמיתי לפגישות מסוג "זום". לא פעיל עד שמוגדרים 3 משתני הסביבה למטה
// (חשבון Zoom עסקי -> Zoom App Marketplace -> Server-to-Server OAuth app).
export function isZoomConfigured() {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function getZoomAccessToken() {
  const auth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`קבלת טוקן Zoom נכשלה: ${data.reason || data.message || res.status}`);
  return data.access_token;
}

// יוצר פגישת Zoom ומחזיר את קישור ההצטרפות - נקרא כשקובעים/מעדכנים
// פגישה מסוג "זום" ביומן (ר' app/dashboard/calendar/actions.js)
export async function createZoomMeeting({ topic, startDate, startTime }) {
  if (!isZoomConfigured()) return null;

  const token = await getZoomAccessToken();
  const startIso = startDate && startTime ? `${startDate}T${startTime}:00` : undefined;

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      topic: topic || 'פגישה',
      type: startIso ? 2 : 1, // 2 = scheduled, 1 = instant
      start_time: startIso,
      timezone: 'Asia/Jerusalem',
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`יצירת פגישת Zoom נכשלה: ${data.message || res.status}`);
  return data.join_url || null;
}
