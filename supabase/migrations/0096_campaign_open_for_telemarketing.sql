-- שער-קמפיין לטלמרקטינג: ברירת מחדל false בכוונה - כל קמפיין קיים
-- (כולל זה שנבדק כרגע) יוצא מיידית מרשימת "תור שיחות" עד שמנהל
-- פותח אותו במפורש. עקבי עם claim_scope (0093) - עוד עמודת-בקרה על
-- campaigns, לא טבלה נפרדת.
alter table public.campaigns
  add column if not exists open_for_telemarketing boolean not null default false;

comment on column public.campaigns.open_for_telemarketing is
  'האם הקמפיין גלוי בתור-השיחות של טלמרקטינג - false כברירת מחדל, מנהל פותח במפורש';
