import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { getAccessToken, listNewMessageIds, getMessageWithAttachment, getAttachmentBytes } from '../../../../lib/gmail/client';
import { normalizePhone } from '../../../../lib/hallo015/config';

// "השעון" שבודק תיבת מייל ייעודית שמקבלת הודעות "Email recordings to"
// מ-015 (records@015pbx.net, קובץ wav מצורף בפועל - ר' Features ← Call
// recording ← עריכת קבוצת הקלטה בפאנל שלהם) ומעדכן את recording_url
// בשורת phone_calls המתאימה - כי הקישור שה-webhook (hallo015-call)
// מקבל ישירות מפנה ל-015pbx.net שדורש session מחובר בפורטל שלהם
// (אומת: 301 ל-auth.php), ולכן לעולם לא מתנגן בכרטיס איש קשר. נפרד
// לגמרי מ-poll-emails (קליטת לידים) - אין AI כאן, זיהוי דטרמיניסטי
// לגמרי (שולח קבוע + פורמט נושא קבוע).
export async function GET(request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: 'CRON_SECRET לא מוגדר בשרת' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: connections } = await supabase
    .from('email_connections')
    .select('id, email_address, refresh_token, last_checked_at, created_at')
    .eq('purpose', 'call_recordings');

  const results = [];

  for (const conn of connections || []) {
    let stage = 'getAccessToken';
    let updated = 0;
    let unmatched = 0;
    try {
      const accessToken = await getAccessToken(conn.refresh_token);

      stage = 'listNewMessageIds';
      const afterUnixSeconds = Math.floor(new Date(conn.last_checked_at || conn.created_at).getTime() / 1000);
      const messageIds = await listNewMessageIds(accessToken, afterUnixSeconds);

      for (const messageId of messageIds) {
        stage = `getMessageWithAttachment:${messageId}`;
        const { subject, from, attachment } = await getMessageWithAttachment(accessToken, messageId);

        // הגנה בסיסית - רק מיילים שבאמת הגיעו מ-015, לא כל דבר אחר
        // שבטעות נחת באותה תיבה.
        if (!from.includes('015pbx.net')) continue;

        const match = subject.match(/Call recording of (\d+):(\d{2}) from (\S+) to (\S+)/i);
        if (!match || !attachment) { unmatched++; continue; }

        const durationSeconds = Number(match[1]) * 60 + Number(match[2]);
        const numA = normalizePhone(match[3]);
        const numB = normalizePhone(match[4]);

        // אין מפתח מדויק בין מייל ההקלטה לשורת phone_calls (הנושא לא
        // כולל callid/uniqueid) - התאמה היוריסטית: בטווח השעתיים
        // האחרונות, משך זהה (±1 שנייה), ואחד משני המספרים בנושא מופיע
        // באחד מ-snumber/dnumber/extension. הראשונה (הכי קרובה בזמן,
        // בזכות ה-order) מנצחת.
        stage = `matchCall:${messageId}`;
        const { data: candidates } = await supabase
          .from('phone_calls')
          .select('id, snumber, dnumber, extension, duration_seconds, started_at')
          .gte('started_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
          .order('started_at', { ascending: false });

        const matchedCall = (candidates || []).find((c) => {
          if (Math.abs((c.duration_seconds || 0) - durationSeconds) > 1) return false;
          return [c.snumber, c.dnumber, c.extension].some((n) => {
            if (!n) return false;
            const normalized = normalizePhone(n);
            return normalized === numA || normalized === numB;
          });
        });

        if (!matchedCall) { unmatched++; continue; }

        stage = `getAttachmentBytes:${messageId}`;
        const bytes = await getAttachmentBytes(accessToken, messageId, attachment.attachmentId);

        stage = `uploadRecording:${messageId}`;
        const path = `${matchedCall.id}/${attachment.filename || 'recording.wav'}`;
        const { error: uploadError } = await supabase.storage
          .from('call-recordings')
          .upload(path, bytes, { contentType: attachment.mimeType || 'audio/wav', upsert: true });
        if (uploadError) { unmatched++; continue; }

        const { data: pub } = supabase.storage.from('call-recordings').getPublicUrl(path);
        await supabase.from('phone_calls').update({ recording_url: pub.publicUrl }).eq('id', matchedCall.id);
        updated++;
      }

      stage = 'updateLastChecked';
      await supabase.from('email_connections').update({ last_checked_at: new Date().toISOString() }).eq('id', conn.id);
      results.push({ email: conn.email_address, checked: messageIds.length, updated, unmatched });
    } catch (err) {
      results.push({ email: conn.email_address, failedAt: stage, error: err.message });
    }
  }

  return NextResponse.json({ success: true, results });
}
