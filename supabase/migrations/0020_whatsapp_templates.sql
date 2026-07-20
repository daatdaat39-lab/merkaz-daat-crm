-- ============================================================
-- Migration: רשימת תבניות WhatsApp מאושרות שאפשר לבחור ביניהן
-- בשליחה - במקום תבנית אחת קבועה (INFORU_TEMPLATE_ID).
-- ============================================================

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id text not null,
  preview_text text,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_templates enable row level security;

drop policy if exists "whatsapp_templates_all_authenticated" on public.whatsapp_templates;
create policy "whatsapp_templates_all_authenticated"
  on public.whatsapp_templates for all
  using ( auth.uid() is not null )
  with check ( auth.uid() is not null );

insert into public.whatsapp_templates (name, template_id, preview_text)
select 'הודעה ראשונה - מרכז דעת', '272006', 'שלום {שם פרטי}, פנית אלינו במרכז דעת בנוגע ל{נושא הפנייה}. נשמח לחזור אליך בהקדם. בברכה, צוות מרכז דעת.'
where not exists (select 1 from public.whatsapp_templates where template_id = '272006');
