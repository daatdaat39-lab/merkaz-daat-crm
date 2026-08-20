'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getInquiryReasons } from '../../components/pipelines';
import { shouldOpenPipeline, isProcessConcluded } from '../../lib/pipelineVisibility';
import { updateDepartmentStage, addDepartmentMembership } from '../actions';
import { updateCampaignContact } from '../../sales/campaigns/actions';
import { calculateAge, calculateHebrewDate } from '../../lib/hebrewDate';
import StageStepper from './StageStepper';
import QuickActivityLogForm from './QuickActivityLogForm';
import NewInquiryForm from './NewInquiryForm';
import ReferrerPicker from './ReferrerPicker';
import GenericStatsTile from './GenericStatsTile';
import WidgetVisibilityToggle from './WidgetVisibilityToggle';
import ExtraFieldVisibilityToggle from './ExtraFieldVisibilityToggle';
import CalendarDedicationsCard from './CalendarDedicationsCard';
import PersonalInfoCard from './PersonalInfoCard';
import ContactSettingsMenu from './ContactSettingsMenu';
import ShareContactButton from './ShareContactButton';
import AvatarUpload from './AvatarUpload';
import ContactTabs from './ContactTabs';
import EmailComposeModal from './EmailComposeModal';
import WhatsAppSendModal from './WhatsAppSendModal';
import NotConnectedButton from '../../components/NotConnectedButton';
import AiSummaryButton from './AiSummaryButton';
import { celebrate } from '../../components/celebrate';
import { useFloatingWindows } from '../../components/FloatingWindows';

const inputStyle = { border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 8px', fontSize: 12.5 };

// מרכיב את כל הכרטיס בצד הלקוח, כי "איזו מחלקה פעילה כרגע" צריך
// להישלט משותף בין הלשוניות שמתחת לשם, שורת השלבים, וטאב "פעילות"
// (היסטוריית הפניות שם תלויה במחלקה הפעילה) - state אחד משותף למעלה.
export default function ContactDetailClient({
  contact, departments, allWorkspaces, viewerWorkspaceIds, meetings, tasks, existingTags, tagGroups,
  isModal, isFloating, toggleTaskAction, updateNotesAction, sentEmails, emailConnections, sentWhatsapp, whatsappTemplates, emailTemplates,
  nextMeeting, openTasksCount, relatedContact, agentsByWorkspace, allInquiries, workspaceNameById, donationTransactions,
  dedications, dedicationCampaignId, callHistory, externalIds, closeReasons, isManager, phoneCalls, pipelinesByWorkspace,
  commitments, additionalPhones, courseEnrollments, relatedContacts,
}) {
  const FALLBACK_PIPELINE = { order: [], leadStages: [], wonStage: null, sideStages: [], labels: {}, colors: {} };
  const byWorkspace = pipelinesByWorkspace || {};
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { openWindow } = useFloatingWindows();
  const age = calculateAge(contact.birth_date);
  const hebrewDate = calculateHebrewDate(contact.birth_date);

  function handlePopOut() {
    openWindow({
      id: `contact-${contact.id}`,
      kind: 'contact',
      title: `${contact.first} ${contact.last}`,
      props: { contactId: contact.id },
    });
    if (isModal) router.back();
  }
  const [adding, setAdding] = useState(false);
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappInitialMessage, setWhatsappInitialMessage] = useState('');

  const visibleDepartments = departments.filter((d) => viewerWorkspaceIds.includes(d.workspaceId));
  const [activeId, setActiveId] = useState(visibleDepartments[0]?.id || null);
  const active = visibleDepartments.find((d) => d.id === activeId) || visibleDepartments[0] || null;

  const activeConnection = active ? (emailConnections || []).find((c) => c.workspace_id === active.workspaceId) : null;

  // קוביית השלבים מקופלת כברירת מחדל ונפתחת אוטומטית רק ברגעי החלטה -
  // ר' pipelineVisibility.js. מתחשב מחדש בכל החלפת מחלקה בכרטיס.
  const [pipelineOpen, setPipelineOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    setPipelineOpen(shouldOpenPipeline(active, byWorkspace[active.workspaceName] || FALLBACK_PIPELINE));
  }, [activeId, active]);

  const availableToAdd = allWorkspaces.filter((w) => !departments.some((d) => d.workspaceId === w.id));
  const newWorkspace = availableToAdd.find((w) => w.id === newWorkspaceId);
  const newReasonOptions = getInquiryReasons(newWorkspace?.name);

  function handleAdd() {
    if (!newWorkspaceId || !newReason) return;
    startTransition(async () => {
      await addDepartmentMembership(contact.id, newWorkspaceId, newReason);
      setAdding(false);
      setNewWorkspaceId('');
      setNewReason('');
      router.refresh();
    });
  }

  function handleStageChange(formData) {
    if (!active) return;
    const stages = (byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).order;
    const movingForward = stages.indexOf(formData.get('stage')) > stages.indexOf(active.stage);
    startTransition(async () => {
      await updateDepartmentStage(active.id, formData.get('stage'), formData.get('closed_reason'));
      if (movingForward) celebrate();
      router.refresh();
    });
  }

  function handleCampaignStageChange(rowId, formData) {
    startTransition(async () => {
      await updateCampaignContact(rowId, { status: formData.get('stage') });
      router.refresh();
    });
  }

  // "פתיחה מחדש" של תהליך שהסתיים (מטאב "תהליכים") - מחזיר לשלב הראשון
  // בסדר ה-pipeline, בדיוק כמו תהליך חדש שנפתח עכשיו.
  function reopenDepartment() {
    if (!active) return;
    const stages = (byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).order;
    if (!stages.length) return;
    startTransition(async () => {
      await updateDepartmentStage(active.id, stages[0], null);
      router.refresh();
    });
  }

  function reopenCampaignProcess(rowId, stages) {
    if (!stages?.order?.length) return;
    startTransition(async () => {
      await updateCampaignContact(rowId, { status: stages.order[0] });
      router.refresh();
    });
  }

  const activePipeline = byWorkspace[active?.workspaceName] || FALLBACK_PIPELINE;
  const mainProcessConcluded = active ? isProcessConcluded(active.stage, activePipeline) : false;

  const outerStyle = isModal
    ? { padding: '24px' }
    : { maxWidth: 1000, margin: '0 auto', padding: '28px 24px' };

  return (
    <div style={outerStyle}>
      {!isModal && (
        <a href="/dashboard/contacts" style={{ fontSize: 12.5, color: '#6b6b6b', textDecoration: 'none' }}>
          ← חזרה לרשימת אנשי הקשר
        </a>
      )}

      {contact.frozen && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, margin: isModal ? '0 0 16px' : '16px 0 0' }}>
          ❄ איש הקשר מוקפא — לא ניתן לערוך, לשנות שלב, או להוסיף משימות עד הפשרה.
        </div>
      )}

      {/* כותרת: אווטאר + שם + לשוניות מחלקה (לחיצה מחליפה מחלקה פעילה) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, margin: '16px 0 10px' }}>
        <AvatarUpload contact={contact} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{contact.first} {contact.last}</div>
            {active && <ReferrerPicker contactId={contact.id} department={active} frozen={contact.frozen} />}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {visibleDepartments.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                style={{
                  border: '1px solid ' + (active?.id === d.id ? '#0a0a0a' : '#e5e5e5'),
                  background: active?.id === d.id ? '#0a0a0a' : '#fff',
                  color: active?.id === d.id ? '#fff' : '#333',
                  borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                }}
              >
                {d.workspaceName}
              </button>
            ))}
            {visibleDepartments.length === 0 && <span style={{ fontSize: 12.5, color: '#9b9b9b' }}>לא משויך למחלקה שלך</span>}
            {availableToAdd.length > 0 && (
              <button
                onClick={() => setAdding((v) => !v)}
                disabled={contact.frozen}
                style={{
                  border: '1px dashed #c0c0c0', background: 'none', borderRadius: 999, padding: '4px 12px',
                  fontSize: 12, cursor: contact.frozen ? 'default' : 'pointer', color: '#6b6b6b', opacity: contact.frozen ? 0.5 : 1,
                }}
              >
                + מחלקה
              </button>
            )}
          </div>
        </div>
        {!isFloating && (
          <button
            type="button"
            onClick={handlePopOut}
            title="פתיחה כחלון צף (אפשר להמשיך לעבוד במקום אחר ולפתוח אנשי קשר נוספים)"
            style={{
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, cursor: 'pointer', fontSize: 14, flexShrink: 0,
            }}
          >
            🗗
          </button>
        )}
        <ShareContactButton contactId={contact.id} departments={departments} agentsByWorkspace={agentsByWorkspace} />
        <ContactSettingsMenu contact={contact} activeDepartment={active} />
      </div>

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 10 }}>
          <select value={newWorkspaceId} onChange={(e) => { setNewWorkspaceId(e.target.value); setNewReason(''); }} style={inputStyle}>
            <option value="">בחר מחלקה...</option>
            {availableToAdd.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {newWorkspaceId && (
            <select value={newReason} onChange={(e) => setNewReason(e.target.value)} style={inputStyle}>
              <option value="" disabled>מהות הפנייה...</option>
              {newReasonOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <button onClick={handleAdd} disabled={isPending || !newWorkspaceId || !newReason} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
            הוספה
          </button>
          <button onClick={() => { setAdding(false); setNewWorkspaceId(''); setNewReason(''); }} style={{ background: 'var(--bg)', border: '1px solid #e5e5e5', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
            ביטול
          </button>
        </div>
      )}

      {active && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {!active.hiddenWidgetKeys?.includes('stats_tile') && (
            <ExtraFieldVisibilityToggle workspaceId={active.workspaceId} fields={active.fieldDefs} hiddenKeys={active.hiddenExtraFieldKeys} />
          )}
          <WidgetVisibilityToggle workspaceId={active.workspaceId} hiddenKeys={active.hiddenWidgetKeys} />
        </div>
      )}

      {active && !active.hiddenWidgetKeys?.includes('stats_tile') && (
        <GenericStatsTile
          department={active}
          transactions={donationTransactions || []}
          commitments={commitments || []}
          stageOrder={(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).order}
          labels={(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).labels}
          isManager={isManager}
        />
      )}

      {active && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <QuickActivityLogForm
            contactId={contact.id}
            department={active}
            stages={[...(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).order, ...(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).sideStages]}
            labels={(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).labels}
            frozen={contact.frozen}
          />
          <NewInquiryForm
            contactId={contact.id}
            workspaceId={active.workspaceId}
            workspaceName={active.workspaceName}
            frozen={contact.frozen}
          />
        </div>
      )}

      {/* שורת שלבי המחלקה הפעילה - מקופלת כברירת מחדל, נפתחת אוטומטית
          ברגעי החלטה (פנייה חדשה / ליד יזום / הגיע ליעד / נסגר). מוסתרת
          לגמרי (לא רק מקופלת) אם התהליך כבר הסתיים - ר' טאב "תהליכים"
          לפתיחה מחדש, וטאב "פעילות" להיסטוריה המלאה שנשארת שם. */}
      {active && !mainProcessConcluded && active.openedProcess !== false && (
        <div style={{ marginBottom: 16, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: '12px 14px' }}>
          {pipelineOpen ? (
            <>
              <button
                type="button"
                onClick={() => setPipelineOpen(false)}
                style={{ background: 'none', border: 'none', padding: 0, marginBottom: 10, fontSize: 12, color: '#6b6b6b', cursor: 'pointer' }}
              >
                ▾ שלבי התהליך — הסתרה
              </button>
              <StageStepper
                currentStage={active.stage}
                currentClosedReason={active.closedReason}
                stages={(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).order}
                sideStages={(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).sideStages}
                labels={(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).labels}
                colors={(byWorkspace[active.workspaceName] || FALLBACK_PIPELINE).colors}
                disabled={contact.frozen}
                action={handleStageChange}
                closeReasons={closeReasons}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPipelineOpen(true)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: '#6b6b6b', cursor: 'pointer' }}
            >
              ▸ שלבי התהליך — שלב נוכחי: <b style={{ color: '#0a0a0a' }}>{(byWorkspace[active?.workspaceName] || FALLBACK_PIPELINE).labels[active.stage] || active.stage}</b>
            </button>
          )}
        </div>
      )}

      {/* תהליכים נוספים מקמפיינים פעילים (לא הקדשה) שאיש הקשר חבר בהם
          באותה מחלקה - ריבוי תהליכים במקביל, כל אחד עם השלבים שלו.
          תהליך קמפיין שהסתיים (שלב-ניצחון/שלב צדדי) מוסתר מכאן גם כן,
          באותו עיקרון בדיוק כמו התהליך הראשי - ר' טאב "תהליכים". */}
      {active?.campaignProcesses?.filter((cp) => !isProcessConcluded(cp.status, cp.stages)).map((cp) => (
        <div key={cp.rowId} style={{ marginBottom: 16, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 10 }}>🎯 קמפיין: <b style={{ color: '#0a0a0a' }}>{cp.campaignName}</b></div>
          <StageStepper
            currentStage={cp.status}
            stages={cp.stages.order}
            labels={cp.stages.labels}
            colors={cp.stages.colors}
            disabled={contact.frozen}
            action={(fd) => handleCampaignStageChange(cp.rowId, fd)}
          />
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <NotConnectedButton label="חיוג" icon="📞" message="חיוג מתוך המערכת (ימות המשיח) — עדיין לא מחובר" />
        {contact.phone && active && !contact.frozen ? (
          <button
            onClick={() => { setWhatsappInitialMessage(''); setWhatsappOpen(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'var(--bg)', color: '#333', border: '1px solid #e5e5e5' }}
          >
            <span>💬</span><span>וואטסאפ</span>
          </button>
        ) : (
          <NotConnectedButton label="וואטסאפ" icon="💬" message={!contact.phone ? 'לאיש הקשר אין מספר טלפון שמור' : !active ? 'יש לבחור מחלקה קודם' : 'איש הקשר מוקפא'} />
        )}
        {activeConnection && contact.email && !contact.frozen ? (
          <button
            onClick={() => setComposeOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'var(--bg)', color: '#333', border: '1px solid #e5e5e5' }}
          >
            <span>✉️</span><span>מייל</span>
          </button>
        ) : (
          <NotConnectedButton
            label="מייל"
            icon="✉️"
            message={!active ? 'יש לבחור מחלקה קודם' : !activeConnection ? `תיבת המייל של מחלקת "${active.workspaceName}" עדיין לא מחוברת` : !contact.email ? 'לאיש הקשר אין כתובת מייל שמורה' : 'איש הקשר מוקפא'}
          />
        )}
        <button
          onClick={() => openWindow({ id: 'calendar', kind: 'calendar', title: 'יומן', props: { initialContactId: contact.id, autoOpenToday: true } })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'var(--bg)', color: '#333', border: '1px solid #e5e5e5' }}
        >
          <span>📅</span><span>קביעת משימה/פגישה חדשה</span>
        </button>
        <AiSummaryButton contactId={contact.id} />
        {active?.stage === 'credit_issue' && contact.phone && !contact.frozen && (
          <button
            onClick={() => {
              setWhatsappInitialMessage(`שלום ${contact.first}, זיהינו שהחיוב האחרון בהוראת הקבע שלך לא עבר בהצלחה. נשמח אם תוכל/י לעדכן את פרטי אמצעי התשלום כדי שנוכל להמשיך בלי הפרעה. תודה!`);
              setWhatsappOpen(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#fef2f2', color: '#a3392f', border: '1px solid #f0c0ba' }}
          >
            <span>⚠</span><span>עדכון אמצעי תשלום</span>
          </button>
        )}
      </div>

      {(openTasksCount > 0 || nextMeeting) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {openTasksCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 10, padding: '10px 16px', flex: '1 1 200px',
            }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>{openTasksCount}</span>
              <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 500 }}>משימות פתוחות</span>
            </div>
          )}
          {nextMeeting && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, background: '#fff7ed', border: '1px solid #fde3b8',
              borderRadius: 10, padding: '10px 16px', flex: '1 1 200px',
            }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#c2760f', textTransform: 'uppercase' }}>פגישה קרובה</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#8a5a1a' }}>
                  {new Date(nextMeeting.meeting_date).toLocaleDateString('he-IL')} · {nextMeeting.meeting_time?.slice(0, 5)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: isModal ? 'wrap' : 'nowrap' }}>
        {/* עמודה שמאלית - פרטים אישיים */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <PersonalInfoCard
            contact={contact}
            existingTags={existingTags}
            tagGroups={tagGroups}
            age={age}
            hebrewDate={hebrewDate}
            nextMeeting={nextMeeting}
            openTasksCount={openTasksCount}
            agentId={active?.agentId}
            agentName={active?.agentName}
            agents={active ? (agentsByWorkspace?.[active.workspaceId] || []) : []}
            activeWorkspaceId={active?.workspaceId}
            lastActivityAt={active?.lastActivityAt}
            relatedContact={relatedContact}
            relatedContacts={relatedContacts}
            externalIds={externalIds}
          />
          <CalendarDedicationsCard
            dedications={dedications || []}
            dedicationCampaignId={dedicationCampaignId}
          />
        </div>

        {/* עמודה ראשית - טאבים */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ContactTabs
            meetings={meetings || []}
            tasks={tasks || []}
            notes={contact.notes}
            contactId={contact.id}
            toggleTaskAction={toggleTaskAction}
            updateNotesAction={updateNotesAction}
            frozen={contact.frozen}
            inquiries={allInquiries || []}
            sentEmails={sentEmails || []}
            sentWhatsapp={sentWhatsapp || []}
            donationTransactions={donationTransactions || []}
            commitments={commitments || []}
            additionalPhones={additionalPhones || []}
            courseEnrollments={courseEnrollments || []}
            callHistory={callHistory || []}
            phoneCalls={phoneCalls || []}
            workspaceNameById={workspaceNameById || {}}
            agents={active ? (agentsByWorkspace?.[active.workspaceId] || []) : []}
            activeDepartment={active}
            pipeline={activePipeline}
            mainProcessConcluded={mainProcessConcluded}
            onReopenMain={reopenDepartment}
            onReopenCampaign={reopenCampaignProcess}
            isManager={isManager}
          />
        </div>
      </div>

      {composeOpen && activeConnection && (
        <EmailComposeModal
          contactId={contact.id}
          workspaceId={active.workspaceId}
          fromAddress={activeConnection.email_address}
          toAddress={contact.email}
          firstName={contact.first}
          templates={emailTemplates || []}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {whatsappOpen && (
        <WhatsAppSendModal
          contactId={contact.id}
          workspaceId={active?.workspaceId || null}
          phone={contact.phone}
          reason={active?.inquiries?.[0]?.reason}
          thread={active ? (sentWhatsapp || []).filter((w) => w.workspace_id === active.workspaceId) : (sentWhatsapp || [])}
          templates={whatsappTemplates || []}
          onClose={() => setWhatsappOpen(false)}
          initialMessage={whatsappInitialMessage}
        />
      )}
    </div>
  );
}
