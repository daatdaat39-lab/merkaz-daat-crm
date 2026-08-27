import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createSpreadsheet, formatCampaignSheet, addCategoryViewTabs, CAMPAIGN_SHEET_HEADER_ROW } from '../../../../../lib/sheets/client';
import { getPicklistValues } from '../../../../dashboard/lib/picklists';

const DEFAULT_CATEGORIES = ['חם', 'קר', 'תורם בסכום גדול', 'תורם חוזר', 'לא רלוונטי'];

// מקבל את התשובה מ-Google, מחליף קוד ב-refresh_token, יוצר גיליון חדש
// עם כותרות מוכנות, ושומר את החיבור בקמפיין (state=campaignId, ר' /start).
// בודקים שוב session+תפקיד - אותו עיקרון כמו callback הג'ימייל.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const campaignId = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Google דחה את הבקשה: ${error}` }, { status: 400 });
  }
  if (!code || !campaignId) {
    return NextResponse.json({ error: 'חסר code או state' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: campaign } = await supabase.from('campaigns').select('name, workspace_id').eq('id', campaignId).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('workspace_id', campaign.workspace_id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'רק בעלים/מנהל של המחלקה יכול לחבר גיליון' }, { status: 403 });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_SHEETS_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.refresh_token) {
    return NextResponse.json({ error: 'לא התקבל refresh_token מ-Google', details: tokenData }, { status: 500 });
  }

  let spreadsheetId, spreadsheetUrl;
  try {
    const created = await createSpreadsheet(tokenData.access_token, `מיפוי קמפיין - ${campaign.name}`, 'מיפוי', CAMPAIGN_SHEET_HEADER_ROW);
    spreadsheetId = created.spreadsheetId;
    spreadsheetUrl = created.spreadsheetUrl;

    // עיצוב + רשימות נפתחות (קטגוריה/סטטוס/החלטת מיפוי) - לפי הערכים
    // האמיתיים של המחלקה והקמפיין. לא קריטי להצלחת החיבור עצמו - כישלון
    // כאן לא מבטל את החיבור, רק משאיר את הגיליון בלי עיצוב.
    try {
      const [categoryRows, decisionRows, { data: stageRows }] = await Promise.all([
        getPicklistValues(supabase, 'campaign_category', campaign.workspace_id),
        getPicklistValues(supabase, 'mapping_decision', campaign.workspace_id),
        supabase.from('campaign_stages').select('label').eq('campaign_id', campaignId).order('sort_order'),
      ]);
      const categoryOptions = categoryRows.length ? categoryRows.map((r) => r.value) : DEFAULT_CATEGORIES;
      await formatCampaignSheet(tokenData.access_token, spreadsheetId, created.sheetId, {
        categoryOptions,
        statusOptions: (stageRows || []).map((s) => s.label),
        decisionOptions: decisionRows.map((r) => r.value),
      });
      await addCategoryViewTabs(tokenData.access_token, spreadsheetId, 'מיפוי', categoryOptions);
    } catch (e) {
      console.error('formatCampaignSheet failed:', e.message);
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const row = {
    campaign_id: campaignId, spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl,
    refresh_token: tokenData.refresh_token, connected_by: user.id,
  };
  const { data: existing } = await admin.from('campaign_sheet_connections').select('id').eq('campaign_id', campaignId).maybeSingle();
  const { error: dbError } = existing
    ? await admin.from('campaign_sheet_connections').update(row).eq('id', existing.id)
    : await admin.from('campaign_sheet_connections').insert(row);
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return new NextResponse(
    `<html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>✅ גיליון חובר בהצלחה!</h2>
      <p><a href="${spreadsheetUrl}" target="_blank">פתיחת הגיליון</a></p>
      <p>אפשר לסגור את החלון הזה ולחזור למערכת.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
