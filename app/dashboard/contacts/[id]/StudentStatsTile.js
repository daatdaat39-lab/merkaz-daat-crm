'use client';

// קוביית מצב תלמיד, מוצגת רק כשהמחלקה הפעילה היא "דעת ותבונה" -
// מקבילה ל-DonorStatsTile של התרומות. **תצוגה בלבד (read-only)**:
// "תלמיד פעיל"/"בוגר" מחושבים מהשלב בתהליך, ושאר הפרטים מגיעים משדות
// המחלקה (extra_fields) שנערכים בטבלת הלידים או בייבוא.
import ExtraFieldVisibilityToggle from './ExtraFieldVisibilityToggle';

export default function StudentStatsTile({ department, stageOrder = [] }) {
  const extra = department.extraFields || {};
  const order = stageOrder;
  const stageIndex = order.indexOf(department.stage);

  const isActiveStudent = department.stage === 'active_student' || department.stage === 'started';
  const isGraduate = department.stage === 'graduate';
  const isRegistered = stageIndex >= order.indexOf('registered');

  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap',
      background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ position: 'absolute', top: 8, insetInlineEnd: 10, color: '#1d4ed8' }}>
        <ExtraFieldVisibilityToggle workspaceId={department.workspaceId} fields={department.fieldDefs} hiddenKeys={department.hiddenExtraFieldKeys} />
      </div>
      <Block label="מצב לימודים">
        {isGraduate ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>🎓 בוגר</span>
        ) : isActiveStudent ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>✓ תלמיד פעיל</span>
        ) : isRegistered ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>נרשם</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>טרם נרשם</span>
        )}
      </Block>

      {extra.current_course && (
        <Block label="קורס נוכחי">
          <span style={value()}>{extra.current_course}</span>
        </Block>
      )}

      {extra.study_track && !extra.current_course && (
        <Block label="מסלול מבוקש">
          <span style={value()}>{extra.study_track}</span>
        </Block>
      )}

      {extra.graduate_of && (
        <Block label="בוגר הקורסים">
          <span style={value()}>{extra.graduate_of}</span>
          {extra.graduation_year && <div style={sub()}>שנת סיום: {extra.graduation_year}</div>}
        </Block>
      )}

      {extra.short_course_purchased === 'כן' && (
        <Block label="קורס קצר">
          <span style={value()}>✓ רכש לצפייה עצמית</span>
        </Block>
      )}

      {extra.initial_payment_stage && (
        <Block label="תשלום ראשוני">
          <span style={value()}>{extra.initial_payment_stage}</span>
        </Block>
      )}
    </div>
  );
}

function Block({ label, children }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1d4ed8', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function value() {
  return { fontSize: 13, fontWeight: 700, color: '#1d4ed8' };
}

function sub() {
  return { fontSize: 11, color: '#1e40af', marginTop: 2 };
}
