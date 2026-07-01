'use client';

export default function RoleSelector({ userId, currentRole, action }) {
  return (
    <form action={action} style={{ display: 'flex' }}>
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="role"
        defaultValue={currentRole}
        onChange={(e) => e.target.form.requestSubmit()}
        style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}
      >
        <option value="member">חבר</option>
        <option value="admin">מנהל</option>
        <option value="owner">בעלים</option>
      </select>
    </form>
  );
}
