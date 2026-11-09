-- 0187: קישור תשלום אישי ואימות תשלום מול קשר (מזהה תשלום ייחודי לכל ליד)
--
-- payment_ref: מזהה אקראי ואטום ("mdc-" + 16 תווי hex) שנוצר לכל ליד בלחיצת
--   "יצירת קישור אישי". הוא נשלח לדף התשלום של קשר בפרמטר addactiondata,
--   וכשהעסקה מגיעה בסנכרון (GetTrans / וובהוק) מחפשים אותו בשדות העסקה
--   ומשייכים אותה לליד בוודאות - בלי הערכה לפי סכום ותאריך.
-- donation_transactions.external_ref: המזהה הזה כפי שנמצא בעסקה עצמה.
--
-- אדיטיבי בלבד. הרצה חוזרת בטוחה (if not exists).

alter table public.lead_conversion_checklist
  add column if not exists payment_ref text;

create unique index if not exists lead_conversion_checklist_payment_ref_idx
  on public.lead_conversion_checklist (payment_ref)
  where payment_ref is not null;

alter table public.donation_transactions
  add column if not exists external_ref text;

create index if not exists donation_transactions_external_ref_idx
  on public.donation_transactions (external_ref)
  where external_ref is not null;
