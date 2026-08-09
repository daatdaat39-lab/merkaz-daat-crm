-- קישור ישיר לקבלה/חשבונית (PdfLink בתשובת GetTrans של קשר) - כדי
-- שאפשר יהיה להציג/להוריד את הקבלה המקורית מתוך כרטיס איש הקשר.
alter table public.donation_transactions
  add column if not exists receipt_url text;
