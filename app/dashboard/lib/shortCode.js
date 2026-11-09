import crypto from 'crypto';

// קוד קצר לקישורי רישום/תשלום ללקוח (migration 0190). 10 תווים מ-31 סמלים, בלי
// תווים שקל לבלבל (0/o, 1/l/i): כ-8*10^14 אפשרויות, מספיק כדי שלא יהיה אפשרי
// לנחש קוד קיים. אותה אות לא נבחרת בהטיה מורגשת (256 mod 31 קטן).
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const SHORT_CODE_LENGTH = 10;
const SHORT_CODE_PATTERN = new RegExp(`^[2-9a-hj-km-np-z]{${SHORT_CODE_LENGTH}}$`);

export function generateShortCode() {
  const bytes = crypto.randomBytes(SHORT_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function isShortCode(value) {
  return typeof value === 'string' && SHORT_CODE_PATTERN.test(value);
}
