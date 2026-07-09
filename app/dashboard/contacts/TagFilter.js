'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function TagFilter({ tags }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('tag') || '';

  function handleChange(e) {
    const value = e.target.value;
    if (value) router.push(`/dashboard/contacts?tag=${encodeURIComponent(value)}`);
    else router.push('/dashboard/contacts');
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}
    >
      <option value="">כל התגיות</option>
      {tags.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}
