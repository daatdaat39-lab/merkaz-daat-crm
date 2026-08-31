import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import {
  getAccessToken, updateSheetHeaderRow, batchUpdateCellRanges, getSheetValues, columnLetter, CAMPAIGN_SHEET_HEADER_ROW,
} from './lib/sheets/client.js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
// getAccessToken קורא process.env ישירות - ממלאים אותו כאן כי זה סקריפט
// עצמאי, לא Next.js.
process.env.GMAIL_CLIENT_ID = env.GMAIL_CLIENT_ID;
process.env.GMAIL_CLIENT_SECRET = env.GMAIL_CLIENT_SECRET;

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const campaignId = '4d985b67-8f2b-4c6b-b1f9-23850dc233c5'; // קמפיין למען דעת - אלול תשפ"ו

const { data: conn } = await supabase.from('campaign_sheet_connections').select('*').eq('campaign_id', campaignId).maybeSingle();
if (!conn) { console.log('אין גיליון מחובר'); process.exit(1); }

const accessToken = await getAccessToken(conn.refresh_token);
console.log('טוקן התקבל.');

await updateSheetHeaderRow(accessToken, conn.spreadsheet_id, conn.sheet_title, CAMPAIGN_SHEET_HEADER_ROW);
console.log('שורת הכותרות עודכנה.');

const values = await getSheetValues(accessToken, conn.spreadsheet_id, conn.sheet_title);
console.log('שורות בגיליון (כולל כותרת):', values.length);

const SHEET_BACKFILL_COLUMNS = ['בתור-שיחות', 'קורסים תשפ"ו', 'מחזור (ישיבת דעת)', 'שנות לימוד בישיבה', 'אחראי'];
const colIndex = Object.fromEntries(SHEET_BACKFILL_COLUMNS.map((h) => [h, CAMPAIGN_SHEET_HEADER_ROW.indexOf(h)]));
console.log('אינדקסי עמודות:', colIndex);

const sheetRows = values.slice(1);
const rowIds = Array.from(new Set(sheetRows.map((cells) => (cells[0] || '').trim()).filter(Boolean)));
console.log('מזהי-שורה ייחודיים בגיליון:', rowIds.length);

// שולפים campaign_contacts בכמות (chunked)
let ccRows = [];
const CHUNK = 150;
for (let i = 0; i < rowIds.length; i += CHUNK) {
  const chunk = rowIds.slice(i, i + CHUNK);
  const { data } = await supabase.from('campaign_contacts')
    .select('id, contact_id, in_call_queue, responsible_person').eq('campaign_id', campaignId).in('id', chunk);
  ccRows = ccRows.concat(data || []);
}
console.log('שורות campaign_contacts שנמצאו:', ccRows.length);
const ccById = Object.fromEntries(ccRows.map((r) => [r.id, r]));

// insights (קורסים תשפ"ו + מחזור/שנות-לימוד ישיבה) - שליפה בכמות, ישירות
const contactIds = ccRows.map((r) => r.contact_id);
const insightsByContact = {};
for (let i = 0; i < contactIds.length; i += CHUNK) {
  const chunk = contactIds.slice(i, i + CHUNK);
  const [{ data: courseRows }, { data: deptRows }] = await Promise.all([
    supabase.from('contact_course_enrollments').select('contact_id, year_label').in('contact_id', chunk),
    supabase.from('contact_departments').select('contact_id, extra_fields, workspaces:workspace_id (name)').in('contact_id', chunk),
  ]);
  for (const c of courseRows || []) {
    if (!insightsByContact[c.contact_id]) insightsByContact[c.contact_id] = {};
    if (c.year_label === 'תשפ"ו') insightsByContact[c.contact_id].has5786Course = true;
  }
  for (const d of deptRows || []) {
    if (d.workspaces?.name !== 'ישיבת דעת') continue;
    if (!insightsByContact[d.contact_id]) insightsByContact[d.contact_id] = {};
    insightsByContact[d.contact_id].yeshivaCohort = d.extra_fields?.cohort || '';
    insightsByContact[d.contact_id].yeshivaStudyYears = d.extra_fields?.study_years || '';
  }
}
console.log('אנשי-קשר עם insights:', Object.keys(insightsByContact).length);

const cellData = [];
sheetRows.forEach((cells, i) => {
  const rowId = (cells[0] || '').trim();
  const cc = rowId && ccById[rowId];
  if (!cc) return;
  const insights = insightsByContact[cc.contact_id] || {};
  const sheetRowNum = i + 2;
  const write = (header, value) => {
    const idx = colIndex[header];
    if (idx === -1 || idx === undefined) return;
    cellData.push({ range: `'${conn.sheet_title}'!${columnLetter(idx)}${sheetRowNum}`, values: [[value]] });
  };
  write('בתור-שיחות', cc.in_call_queue !== false ? 'כן' : 'לא');
  write('קורסים תשפ"ו', insights.has5786Course ? 'כן' : 'לא');
  write('מחזור (ישיבת דעת)', insights.yeshivaCohort || '');
  write('שנות לימוד בישיבה', insights.yeshivaStudyYears || '');
  write('אחראי', cc.responsible_person || '');
});
console.log('תאים לכתיבה:', cellData.length);

const BATCH = 3000;
for (let i = 0; i < cellData.length; i += BATCH) {
  await batchUpdateCellRanges(accessToken, conn.spreadsheet_id, cellData.slice(i, i + BATCH));
  console.log(`נכתבו ${Math.min(i + BATCH, cellData.length)}/${cellData.length}`);
}
console.log('הושלם.');
