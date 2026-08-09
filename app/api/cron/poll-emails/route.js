import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { getAccessToken, listNewMessageIds, getMessage } from '../../../../lib/gmail/client';
import { extractLeadFromEmail } from '../../../../lib/gmail/extractLead';
import { findExistingMatch, upsertDepartmentMembership } from '../../../dashboard/contacts/leadIntakeCore';
import { resolveSourceFromLink } from '../../../dashboard/components/sourceLinks';

// "השעון" שבודק כל תיבות המייל המחוברות ומזין לידים חדשים אוטומטית -
// מחליף את ה-Zap. מופעל על ידי Vercel Cron (ראו vercel.json), שמוסיף
// אוטומטית Authorization: Bearer <CRON_SECRET>.
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
    .select('id, workspace_id, campaign_id, email_address, refresh_token, last_checked_at, created_at, workspaces:workspace_id (id, name)')
    .eq('purpose', 'intake');

  // קמפיינים שמשתמשים בתיבת ברירת המחדל המשותפת של המחלקה (לא בתיבה
  // ייעודית משלהם) עם כלל ניתוב - ר' migration 0057. ממופה לפי מזהה
  // התיבה כדי לבדוק בזמן קריאת כל מייל אם הוא תואם לאחד מהם.
  const { data: routedCampaigns } = await supabase
    .from('campaigns')
    .select('id, email_connection_id, route_match_text')
    .not('email_connection_id', 'is', null)
    .not('route_match_text', 'is', null);
  const campaignsByConnection = new Map();
  for (const c of routedCampaigns || []) {
    if (!campaignsByConnection.has(c.email_connection_id)) campaignsByConnection.set(c.email_connection_id, []);
    campaignsByConnection.get(c.email_connection_id).push(c);
  }

  const results = [];

  for (const conn of connections || []) {
    let stage = 'getAccessToken';
    try {
      const accessToken = await getAccessToken(conn.refresh_token);

      stage = 'listNewMessageIds';
      const afterUnixSeconds = Math.floor(new Date(conn.last_checked_at || conn.created_at).getTime() / 1000);
      const messageIds = await listNewMessageIds(accessToken, afterUnixSeconds);

      let created = 0;
      for (const messageId of messageIds) {
        stage = `getMessage:${messageId}`;
        const { subject, body } = await getMessage(accessToken, messageId);
        if (!body) continue;

        stage = `extractLeadFromEmail:${messageId}`;
        const extracted = await extractLeadFromEmail(subject, body);
        const first = (extracted.first || '').trim();
        if (!first) continue; // בלי שם פרטי אין מספיק מידע ליצור ליד

        const last = (extracted.last || '').trim();
        const phone = (extracted.phone || '').trim() || null;
        const email = (extracted.email || '').trim() || null;
        const reason = (extracted.reason || '').trim() || 'פנייה במייל';
        const rawSourceLink = (extracted.source_link || '').trim();
        const source = rawSourceLink ? await resolveSourceFromLink(supabase, conn.workspace_id, rawSourceLink) : 'מייל';

        stage = `findExistingMatch:${messageId}`;
        const existing = await findExistingMatch(supabase, { idnum: null, phone, email });
        let contactId;
        if (existing) {
          contactId = existing.id;
        } else {
          stage = `insertContact:${messageId}`;
          const { data: inserted, error } = await supabase
            .from('contacts')
            .insert({ first, last, phone, email, source, tags: [] })
            .select('id')
            .single();
          if (error) continue;
          contactId = inserted.id;
          created++;
        }
        stage = `upsertDepartmentMembership:${messageId}`;
        await upsertDepartmentMembership(supabase, contactId, conn.workspaces, reason, null);

        // שיוך לקמפיין - ר' migration 0057. אם לתיבה הזו יש קמפיין
        // ייעודי משלה, כל מייל שמגיע אליה שייך לו. אחרת (תיבת ברירת
        // המחדל המשותפת של המחלקה), בודקים אם מייל זה תואם לכלל ניתוב
        // של אחד הקמפיינים ששוריינו לתיבה הזו.
        stage = `campaignRouting:${messageId}`;
        if (conn.campaign_id) {
          await supabase.from('campaign_contacts').upsert(
            { campaign_id: conn.campaign_id, contact_id: contactId },
            { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true }
          );
        } else {
          const candidates = campaignsByConnection.get(conn.id) || [];
          const haystack = `${subject || ''} ${body || ''} ${rawSourceLink || ''}`;
          for (const campaign of candidates) {
            if (haystack.includes(campaign.route_match_text)) {
              await supabase.from('campaign_contacts').upsert(
                { campaign_id: campaign.id, contact_id: contactId },
                { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true }
              );
            }
          }
        }
      }

      stage = 'updateLastChecked';
      await supabase.from('email_connections').update({ last_checked_at: new Date().toISOString() }).eq('id', conn.id);
      results.push({ email: conn.email_address, checked: messageIds.length, created });
    } catch (err) {
      results.push({ email: conn.email_address, failedAt: stage, error: err.message, stack: err.stack });
    }
  }

  return NextResponse.json({ success: true, results });
}
