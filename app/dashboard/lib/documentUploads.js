// בדיקת קבצים שמועלים למסמכי איש-קשר (bucket contact-documents) - קובץ רגיל
// (לא 'use server') כדי שיהיה משותף גם לפעולות הנציג וגם לעמוד הרישום
// הציבורי, שאין בו session ולכן אין לו שום הגנה חוץ מהבדיקה הזו.
//
// הסוג נקבע לפי ה"חתימה" (magic bytes) של הקובץ עצמו, לא לפי הסיומת או
// ה-contentType שהלקוח שולח - אחרת אפשר היה להעלות HTML/SVG עם סיומת .pdf
// ולהגיש אותו לנציג בקישור חתום.

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const TYPES = {
  pdf: { ext: 'pdf', contentType: 'application/pdf' },
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  heic: { ext: 'heic', contentType: 'image/heic' },
};

function sniff(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return TYPES.pdf; // %PDF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return TYPES.jpeg;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return TYPES.png;
  // HEIC/HEIF: ארבעה בתים של גודל ואז "ftyp" ואז מותג (heic/heix/mif1...)
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return TYPES.heic;
  }
  return null;
}

// מחזיר { error } בעברית, או { ext, contentType } של הסוג שזוהה בפועל.
export async function validateDocumentFile(file) {
  if (!file || typeof file === 'string' || !file.size) return { error: 'יש לבחור קובץ' };
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: `הקובץ גדול מדי (עד ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB)` };
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniff(head);
  if (!type) return { error: 'סוג הקובץ לא נתמך - אפשר להעלות PDF או תמונה (JPG, PNG, HEIC)' };
  return { ext: type.ext, contentType: type.contentType };
}

// פענוח multipart בצד השרת קורא שמות קבצים כ-Latin-1 במקום UTF-8, כך ששם
// עברי ("תעודת זהות.jpg") נשמר כג'יבריש ("×ª×¢×•×“×ª..."). אם כל התווים בטווח
// 0-255 ופענוח UTF-8 מחזיר טקסט תקין - זה היה UTF-8 שנקרא לא נכון, ומחזירים אותו.
function repairLatin1Utf8(name) {
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  return fixed.includes('�') ? name : fixed;
}

// שם הקובץ המקורי נשמר רק להצגה - מתקנים קידוד, מסירים תווי בקרה ומגבילים אורך.
export function cleanFilename(name) {
  if (!name) return null;
  // eslint-disable-next-line no-control-regex
  return repairLatin1Utf8(String(name)).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || null;
}

// הנתיב ב-storage שייך תמיד לאיש-הקשר: <contactId>/<timestamp>-<rand>.<ext>.
// בדיקה זו משמשת לפני חתימת URL - רק נתיב שמתחיל במזהה איש-הקשר ואינו
// מכיל קטעי-ניווט נחשב לגיטימי.
export function isPathOfContact(contactId, filePath) {
  return (
    typeof filePath === 'string' &&
    !!contactId &&
    filePath.startsWith(`${contactId}/`) &&
    !filePath.includes('..') &&
    !filePath.includes('//')
  );
}
