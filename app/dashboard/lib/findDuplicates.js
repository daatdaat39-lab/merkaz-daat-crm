// לוגיקה טהורה למציאת זוגות אנשי-קשר חשודים ככפולים - בלי קריאות DB,
// כדי שיהיה קל לבדוק/לשנות בנפרד מהעמוד שקורא לה
// (app/dashboard/settings/duplicates/page.js). קריטריון: כל התאמה
// חלקית - ת"ז/טלפון/מייל זהים (קיבוץ, מהיר גם בכמויות גדולות), או שם
// דומה מספיק (השוואת זוגות, לכן מוגבלת בכמות למניעת תקיעה).

const MAX_CONTACTS_FOR_NAME_MATCH = 2000;
const NAME_SIMILARITY_THRESHOLD = 0.8;

function normalize(str) {
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

function nameSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
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
// "לא כפילות" ולכן מודחקים מהתוצאה
export function findDuplicateCandidates(contacts, dismissedPairs = []) {
  const dismissedSet = new Set(dismissedPairs.map((p) => pairKey(p.contact_id_a, p.contact_id_b)));
  const pairs = new Map(); // pairKey -> { contactA, contactB, matchedOn: Set }

  function addCandidate(c1, c2, reason) {
    if (c1.id === c2.id) return;
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
    addToGroup(byPhone, normalize(c.phone), c);
    addToGroup(byPhone, normalize(c.phone2), c);
    addToGroup(byEmail, normalize(c.email), c);
    addToGroup(byEmail, normalize(c.email2), c);
  }
  flagGroups(byIdnum, 'ת"ז זהה');
  flagGroups(byPhone, 'טלפון זהה');
  flagGroups(byEmail, 'מייל זהה');

  // שם דומה - דורש השוואת זוגות, לכן מוגבל בכמות ומקוצר בבדיקת אורך
  // מקדימה (מרחק Levenshtein תמיד >= |הפרש האורכים|, אז אם ההפרש כבר
  // חוסם את הסף - מדלגים בלי לחשב בכלל)
  let nameMatchSkipped = false;
  if (contacts.length <= MAX_CONTACTS_FOR_NAME_MATCH) {
    const named = contacts
      .map((c) => ({ c, name: normalize(`${c.first || ''} ${c.last || ''}`) }))
      .filter((x) => x.name);
    const maxLenDiffRatio = 1 - NAME_SIMILARITY_THRESHOLD;
    for (let i = 0; i < named.length; i++) {
      for (let j = i + 1; j < named.length; j++) {
        const { name: nameA } = named[i];
        const { name: nameB } = named[j];
        const maxLen = Math.max(nameA.length, nameB.length, 1);
        if (Math.abs(nameA.length - nameB.length) / maxLen > maxLenDiffRatio) continue;
        const sim = nameSimilarity(nameA, nameB);
        if (sim >= NAME_SIMILARITY_THRESHOLD) {
          addCandidate(named[i].c, named[j].c, `שם דומה (${Math.round(sim * 100)}%)`);
        }
      }
    }
  } else {
    nameMatchSkipped = true;
  }

  const candidates = Array.from(pairs.values())
    .map((p) => ({ contactA: p.contactA, contactB: p.contactB, matchedOn: Array.from(p.matchedOn) }))
    .sort((a, b) => b.matchedOn.length - a.matchedOn.length); // כמה סיבות התאמה = חשוד יותר, קודם בתור

  return { candidates, nameMatchSkipped };
}
