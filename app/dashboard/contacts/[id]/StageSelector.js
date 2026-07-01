'use client';

import { STAGE_ORDER, STAGE_LABELS } from '../../components/ui';

export default function StageSelector({ currentStage, action }) {
  return (
    <form action={action}>
      <select
        name="stage"
        defaultValue={currentStage}
        onChange={(e) => e.target.form.requestSubmit()}
        style={{
          border: '1px solid #e5e5e5', borderRadius: 6, padding: '7px 10px', fontSize: 12.5,
          background: '#fff', cursor: 'pointer',
        }}
      >
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
        ))}
      </select>
    </form>
  );
}
