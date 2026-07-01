import { createClient } from '../../lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, level, dept')
    .eq('id', user.id)
    .single();

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first, last, phone, email, dept, tags, created_at')
    .order('created_at', { ascending: false });

  async function handleLogout() {
    'use server';
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: '"Frank Ruhl Libre",serif', margin: 0, fontSize: 22 }}>מרכז דעת — אנשי קשר</h1>
          <p style={{ margin: '4px 0 0', color: '#6B6151', fontSize: 12.5 }}>
            מחובר/ת: <b>{profile?.name || user.email}</b> · תפקיד: {profile?.role || '—'}
          </p>
        </div>
        <form action={handleLogout}>
          <button type="submit" style={{
            background: 'transparent', border: '1px solid #1F4A41', color: '#1F4A41',
            borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5,
          }}>התנתקות</button>
        </form>
      </div>

      <div style={{
        background: '#FBF3E7', border: '1px solid #EAD8B4', borderRadius: 10,
        padding: '12px 16px', fontSize: 12.5, marginBottom: 18, color: '#7A5A21',
      }}>
        גרסת בדיקה מאובטחת — ההרשאות נאכפות במסד הנתונים עצמו, לא רק בדפדפן.
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFDF6',
        border: '1px solid #DFD2AC', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#EFE6CC' }}>
            {['שם','טלפון','מייל','תחום','תגיות'].map(h => (
              <th key={h} style={{ textAlign: 'right',
