-- שדות נוספים שנחשפו מריצה חיה של סנכרון קשר (GetObligations) - ר' תוכנית
-- "מיצוי שדות נוספים ממערכת קשר". ObligationFor/ChargeOptionType/
-- StatusLastTran/OpenBy כבר מוצגים במסך ההתחייבויות של קשר עצמה, אבל
-- עד עכשיו נזרקו בשקט בזמן הסנכרון.
alter table public.commitments
  add column if not exists designation text,
  add column if not exists payment_method text,
  add column if not exists last_payment_status text,
  add column if not exists source_channel text;
