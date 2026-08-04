-- העדפה אישית נוספת באותו דפוס בדיוק כמו hidden_extra_fields (0038) -
-- הפעם לא אילו שדות בתוך קובייה, אלא אילו קוביות שלמות מוצגות בכלל
-- בכרטיס איש הקשר (donor_stats/student_stats/tasks_meetings_card/
-- activity_tab), לכל מחלקה בנפרד. ר' app/dashboard/lib/fieldPreferences.js.
alter table public.profiles
  add column if not exists hidden_widgets jsonb not null default '{}'::jsonb;
