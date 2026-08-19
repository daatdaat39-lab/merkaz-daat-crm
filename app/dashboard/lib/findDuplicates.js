// לוגיקה טהורה למציאת זוגות אנשי-קשר חשודים ככפולים - בלי קריאות DB,
// כדי שיהיה קל לבדוק/לשנות בנפרד מהעמוד שקורא לה
// (app/dashboard/settings/duplicates/page.js). קריטריון: כל התאמה
// חלקית - ת"ז/טלפון/מייל זהים (קיבוץ, מהיר גם בכמויות גדולות), או שם
// דומה (namePairs - מגיע מוכן מ-find_similar_contact_name_pairs, פונקציית
// DB עם אינדקס טריגרם - לא מחושב כאן, כדי שזה יישאר סקיילבילי בכל כמות).
import { normalizePhoneDigits } from '../contacts/phoneRouting';

const NAME_SIMILARITY_THRESHOLD = 0.8;

export function normalize(str) {
  return (str || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function nameSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// מוצא לאיזה איש קשר קיים מתאימה שורה נכנסת (למשל שורה מקובץ היסטוריית
// שיחות שיש בה רק שם, ולפעמים טלפון) - נשארת O(שורות בקובץ × אנשי קשר),
// לא O(אנשי קשר²), אז דמיון-שמות בהשוואת-זוגות עדיין סביר כאן (בשונה
// ממסך "בדיקת כפליות" שמשווה את כל אנשי הקשר מול עצמם). מחזיר:
//   { certain: contact }        - התאמה ודאית (טלפון/מייל זהים, או שם יחיד ומדויק)
//   { candidates: [{contact, score}] } - מועמדים שדורשים אישור ידני
//   {}                          - לא נמצאה שום התאמה סבירה
// ההפרדה הזו היא מה שמאפשר למסך הייבוא להכניס אוטומטית רק את מה שברור,
// ולהעלות לאישור המנהל כל מקרה של ספק.
export function findMatchesForName(row, contacts) {
  const phoneDigits = normalizePhoneDigits(row.phone);
  const email = normalize(row.email);

  if (phoneDigits) {
    const byPhone = contacts.filter((c) => normalizePhoneDigits(c.phone) === phoneDigits || normalizePhoneDigits(c.phone2) === phoneDigits);
    if (byPhone.length === 1) return { certain: byPhone[0] };
    if (byPhone.length > 1) return { candidates: byPhone.map((c) => ({ contact: c, score: 1 })) };
  }
  if (email) {
    const byEmail = contacts.filter((c) => normalize(c.email) === email || normalize(c.email2) === email);
    if (byEmail.length === 1) return { certain: byEmail[0] };
    if (byEmail.length > 1) return { candidates: byEmail.map((c) => ({ contact: c, score: 1 })) };
  }

  const name = normalize(row.name);
  if (!name) return {};

  const scored = contacts
    .map((c) => ({ contact: c, score: nameSimilarity(name, normalize(`${c.first || ''} ${c.last || ''}`)) }))
    .filter((s) => s.score >= NAME_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return {};
  // שם זהה לחלוטין ורק אצל איש קשר אחד - אין ספק אמיתי
  if (scored.length === 1 && scored[0].score === 1) return { certain: scored[0].contact };
  return { candidates: scored.slice(0, 5) };
}

export function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

export function normalizePairIds(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

function addToGroup(map, key, contact) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(contact);
}

// dismissedPairs: מערך {contact_id_a, contact_id_b} - זוגות שכבר סומנו
// "לא כפילות" ולכן מודחקים מהתוצאה. namePairs: מערך {id_a, id_b, sim}
// שכבר חושב ב-DB (find_similar_contact_name_pairs, מיגרציה 0066) - לא
// מחושב כאן, כדי שהבדיקה תישאר סקיילבילית בכל כמות אנשי קשר.
export function findDuplicateCandidates(contacts, dismissedPairs = [], namePairs = []) {
  const dismissedSet = new Set(dismissedPairs.map((p) => pairKey(p.contact_id_a, p.contact_id_b)));
  const pairs = new Map(); // pairKey -> { contactA, contactB, matchedOn: Set }

  function addCandidate(c1, c2, reason) {
    if (!c1 || !c2 || c1.id === c2.id) return;
    const key = pairKey(c1.id, c2.id);
    if (dismissedSet.has(key)) return;
    if (!pairs.has(key)) pairs.set(key, { contactA: c1, contactB: c2, matchedOn: new Set() });
    pairs.get(key).matchedOn.add(reason);
  }

  function flagGroups(map, reason) {
    for (const group of map.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) addCandidate(group[i], group[j], reason);
      }
    }
  }

  // התאמות מדויקות - קיבוץ ב-Map, מהיר גם על כמויות גדולות (לא O(n²))
  const byIdnum = new Map();
  const byPhone = new Map();
  const byEmail = new Map();
  for (const c of contacts) {
    addToGroup(byIdnum, normalize(c.idnum), c);
    addToGroup(byPhone, normalizePhoneDigits(c.phone), c);
    addToGroup(byPhone, normalizePhoneDigits(c.phone2), c);
    addToGroup(byEmail, normalize(c.email), c);
    addToGroup(byEmail, normalize(c.email2), c);
  }
  flagGroups(byIdnum, 'ת"ז זהה');
  flagGroups(byPhone, 'טלפון זהה');
  flagGroups(byEmail, 'מייל זהה');

  // שם דומה - מגיע מוכן מ-DB (RPC עם אינדקס טריגרם), לא מחושב כאן
  const byId = new Map(contacts.map((c) => [c.id, c]));
  for (const { id_a, id_b, sim } of namePairs) {
    addCandidate(byId.get(id_a), byId.get(id_b), `שם דומה (${Math.round(sim * 100)}%)`);
  }

  const candidates = Array.from(pairs.values())
    .map((p) => ({ contactA: p.contactA, contactB: p.contactB, matchedOn: Array.from(p.matchedOn) }))
    .sort((a, b) => b.matchedOn.length - a.matchedOn.length); // כמה סיבות התאמה = חשוד יותר, קודם בתור

  return { candidates };
}
