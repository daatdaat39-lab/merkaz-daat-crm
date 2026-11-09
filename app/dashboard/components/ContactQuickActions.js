'use client';

import { useState } from 'react';
import EmailComposeModal from '../contacts/[id]/EmailComposeModal';
import WhatsAppSendModal from '../contacts/[id]/WhatsAppSendModal';
import NotConnectedButton from './NotConnectedButton';
import { PhoneIcon, WhatsAppIcon, MailIcon } from './icons';

const iconBtnStyle = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--k-border)', borderRadius: 100, background: 'var(--k-surface)', color: 'var(--k-text)', cursor: 'pointer',
};

// כפתורי פעולה מהירה (חיוג/וואטסאפ/מייל) לשימוש בכל טבלת אנשי קשר/לידים
// במערכת - לא רק בכרטיס עצמו. משתמש באותם חלונות שליחה בדיוק.
// departments: [{ workspaceId, workspaceName }] של המחלקות ששייך אליהן האיש קשר
// sendConnections: [{ workspace_id, email_address }] - כל תיבות השליחה המחוברות במערכת
// departmentId (אופציונלי) - "חוקת-הליד": כש-הרכיב-הזה מרונדר מתוך מסך-
// טיפול-בליד-ספציפי (LeadWorkScreen), מעביר-הלאה לשני-החלונות כדי
// שהשליחה-תתועד-כשייכת-לליד-הזה-בדיוק (ר' sendContactEmail/WhatsApp).
// stageKey/courseId (אופציונליים) - השלב והקורס של הליד, לבחירת תבניות מומלצות בחלונות השליחה.
// onActionDone (אופציונלי): נקרא אחרי שליחה בפועל של מייל/וואטסאפ - מסך הליד
// משתמש בו להצעת "לקחת אחריות" (useClaimPrompt). מסכים אחרים לא מעבירים אותו.
export default function ContactQuickActions({ contact, departments = [], sendConnections = [], whatsappTemplates = [], emailTemplates = [], departmentId = null, stageKey = null, courseId = null, onActionDone }) {
  const [modal, setModal] = useState(null);

  const emailConnection = departments
    .map((d) => sendConnections.find((c) => c.workspace_id === d.workspaceId))
    .find(Boolean);
  const emailDept = emailConnection ? departments.find((d) => d.workspaceId === emailConnection.workspace_id) : null;
  const whatsappDept = departments[0] || null;

  const canEmail = !!emailDept && !!contact.email && !contact.frozen;
  const canWhatsapp = !!whatsappDept && !!contact.phone && !contact.frozen;
  const telDigits = (contact.phone || '').replace(/[^\d+]/g, '');
  const canCall = !!telDigits && !contact.frozen;

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {canCall ? (
        <a href={`tel:${telDigits}`} title="חיוג" style={{ ...iconBtnStyle, textDecoration: 'none' }}><PhoneIcon size={14} /></a>
      ) : (
        <NotConnectedButton icon={<PhoneIcon size={14} />} label="חיוג" variant="icon" message={!contact.phone ? 'לאיש הקשר אין טלפון שמור' : 'איש הקשר מוקפא'} />
      )}

      {canWhatsapp ? (
        <button onClick={() => setModal('whatsapp')} title="וואטסאפ" style={iconBtnStyle}><WhatsAppIcon size={14} /></button>
      ) : (
        <NotConnectedButton
          icon={<WhatsAppIcon size={14} />} label="וואטסאפ" variant="icon"
          message={!contact.phone ? 'לאיש הקשר אין טלפון שמור' : !whatsappDept ? 'איש הקשר לא משויך למחלקה' : 'איש הקשר מוקפא'}
        />
      )}

      {canEmail ? (
        <button onClick={() => setModal('email')} title="מייל" style={iconBtnStyle}><MailIcon size={14} /></button>
      ) : (
        <NotConnectedButton
          icon={<MailIcon size={14} />} label="מייל" variant="icon"
          message={!contact.email ? 'לאיש הקשר אין מייל שמור' : !emailDept ? 'אין תיבת שליחה מחוברת למחלקות של איש הקשר' : 'איש הקשר מוקפא'}
        />
      )}

      {modal === 'email' && emailDept && (
        <EmailComposeModal
          contactId={contact.id} workspaceId={emailDept.workspaceId} departmentId={departmentId}
          fromAddress={emailConnection.email_address} toAddress={contact.email}
          firstName={contact.first} templates={emailTemplates} stageKey={stageKey} courseId={courseId}
          onClose={() => setModal(null)}
          onSent={onActionDone}
        />
      )}
      {modal === 'whatsapp' && whatsappDept && (
        <WhatsAppSendModal
          contactId={contact.id} workspaceId={whatsappDept.workspaceId} departmentId={departmentId}
          phone={contact.phone} reason={contact.latestReason} thread={[]} templates={whatsappTemplates} stageKey={stageKey} courseId={courseId}
          onClose={() => setModal(null)}
          onActionDone={onActionDone}
        />
      )}
    </div>
  );
}
