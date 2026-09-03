'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  addContactsToCampaign, updateCampaignContact, removeContactFromCampaign, bulkUpdateCampaignContactsFromImport, getBulkContactInsightsForExport,
  getCampaignSheetConnection, pushCampaignRowsToSheet, pullCampaignUpdatesFromSheet, disconnectCampaignSheet, regenerateCategoryTabs, regenerateResponsiblePersonTabs,
  bulkUpdateCampaignContactsField, getDistinctNotesAndResponsible, backfillSheetNewColumns, getCampaignHelpContacts, setCampaignHelpContacts,
} from '../actions';
import { searchContacts } from '../../../contacts/actions';
import AdvancedFilterPanel from '../../../components/AdvancedFilterPanel';
import { contactMatchesAdvancedFilter } from '../../../components/advancedFilter';
import MappingQueue from './MappingQueue';
import SegmentFinder from './SegmentFinder';

// קטגוריות ברירת מחדל - משמשות רק אם רשימת הבחירה הדינמית (הגדרות ← רשימות
// בחירה) ריקה, כדי שהמסך לעולם לא יישאר בלי אף קטגוריה לבחור
const DEFAULT_CATEGORIES = ['חם', 'קר', 'תורם בסכום גדול', 'תורם חוזר', 'לא רלוונטי'];
const ROW_ID_HEADER = 'מזהה שורה (לא לשנות)';
// חייב להישאר מסונכרן עם p_no_answer_streak_threshold (ברירת המחדל ב-
// log_campaign_call_attempt, migration 0121) - זה הסף שבו שורה יוצאת
// אוטומטית מהתור ועוברת ל"קבוצת לא-ענו" הנפרדת למטה.
const NO_ANSWER_STREAK_THRESHOLD = 1;

const inputStyle = { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 10px', fontSize: 12.5 };

// מקבץ שורות לפי קטגוריה - סדר: קודם הקטגוריות מרשימת-הבחירה (רק אלה
// שיש להן בפועל שורות), אחר-כך ערכי-קטגוריה חופשיים שהגיעו מייבוא-מיפוי
// חיצוני ואינם ברשימה, ולבסוף "ללא קטגוריה" - תמיד אחרון.
// כל קבוצה גם מחשבת פילוח-מיפוי (ממתין/רלוונטי/לא רלוונטי/מישהו אחר) לפי
// mapping_decision הקיים כבר על כל שורה - בלי לגעת ב-status/campaign_stages
// (שדה נפרד לגמרי, מייצג התקדמות-תהליך ולא תוצאת-מיפוי). mappingFilter
// קובע מה בפועל מוצג ב-group.rows: 'all' (ברירת מחדל - הכל חוץ מ"לא
// רלוונטי", כדי שלא "יישארו בקבוצה") או סינון-לפי-החלטה ספציפית (כדי
// לראות בדיוק מי סומן "רלוונטי" אחרי מיפוי, למשל) - allCount/counts
// תמיד מחושבים על הכל, ללא תלות בסינון, כדי שהמספרים בכותרת לא "יקפצו".
function buildCategoryGroups(rows, CATEGORIES, mappingFilter) {
  const map = new Map();
  for (const r of rows) {
    const key = r.category || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const orderedKeys = [
    ...CATEGORIES.filter((c) => map.has(c)),
    ...Array.from(map.keys()).filter((k) => k && !CATEGORIES.includes(k)),
  ];
  if (map.has('')) orderedKeys.push('');
  return orderedKeys.map((key) => {
    const allRows = (map.get(key) || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
    const counts = {
      pending: allRows.filter((r) => !r.mappingDecision).length,
      relevant: allRows.filter((r) => r.mappingDecision === 'רלוונטי').length,
      notRelevant: allRows.filter((r) => r.mappingDecision === 'לא רלוונטי').length,
      other: allRows.filter((r) => r.mappingDecision && r.mappingDecision !== 'רלוונטי' && r.mappingDecision !== 'לא רלוונטי').length,
    };
    let visibleRows = allRows;
    if (mappingFilter === 'pending') visibleRows = allRows.filter((r) => !r.mappingDecision);
    else if (mappingFilter === 'relevant') visibleRows = allRows.filter((r) => r.mappingDecision === 'רלוונטי');
    else if (mappingFilter === 'notRelevant') visibleRows = allRows.filter((r) => r.mappingDecision === 'לא רלוונטי');
    else if (mappingFilter === 'other') visibleRows = allRows.filter((r) => r.mappingDecision && r.mappingDecision !== 'רלוונטי' && r.mappingDecision !== 'לא רלוונטי');
    else visibleRows = allRows.filter((r) => r.mappingDecision !== 'לא רלוונטי'); // 'all' - חוץ מלא-רלוונטי
    return { key, label: key || 'ללא קטגוריה', allCount: allRows.length, counts, rows: visibleRows };
  });
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// ממיר אובייקט-תובנות (אותה צורה בדיוק כמו ContactInsightsPanel) לתאי-CSV -
// כדי שהאקסל של המיפוי הידני יראה בדיוק את מה שרואים במסך המיפוי במערכת,
// לא רק שם/טלפון/קטגוריה כמו קודם.
function insightsToCsvCells(insights) {
  if (!insights) return ['', '', '', '', '', '', '', '', '', '', '', ''];
  const {
    departments, peakDonation, lastDonationDate, totalDonations, hasActiveCommitment, coursesCount, seminarsCount, lastInteraction,
    has5786Course, yeshivaCohort, yeshivaStudyYears,
  } = insights;
  return [
    departments.join(', '),
    peakDonation ? peakDonation.year : '',
    peakDonation ? Math.round(peakDonation.amount) : '',
    totalDonations.count || 0,
    totalDonations.total ? Math.round(totalDonations.total) : 0,
    lastDonationDate ? new Date(lastDonationDate).toLocaleDateString('he-IL') : '',
    lastInteraction ? `${lastInteraction.label}${lastInteraction.exact ? '' : ' (משוער)'} · ${new Date(lastInteraction.date).toLocaleDateString('he-IL')}` : '',
    hasActiveCommitment ? 'כן' : 'לא',
    `${coursesCount || 0} קורסים, ${seminarsCount || 0} סמינרים`,
    has5786Course ? 'כן' : 'לא',
    yeshivaCohort || '',
    yeshivaStudyYears || '',
  ];
}

export default function CampaignDetailClient({ campaignId, workspaceId, isDonationsWorkspace, initialRows, availableContacts = [], agents = [], categories = [], campaignStages = { order: [], labels: {}, colors: {} }, extraFields = [], extraFieldsByWorkspace = {}, pipelinesByWorkspace = {}, pendingCallbacks = [] }) {
  const CATEGORIES = categories.length ? categories : DEFAULT_CATEGORIES;
  const [viewMode, setViewMode] = useState('table');
  const [rows, setRows] = useState(initialRows);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  // חיפוש חופשי-לגמרי (שם/טלפון/מייל) בתוך כל הקבוצות בטבלה הראשית -
  // נפרד מ-search (חיפוש בבורר "הוספת אנשי קשר"). מטרה: למצוא איש-קשר
  // ספציפי ולעדכן אותו ישירות, בלי לגלול/לפתוח קבוצה-קבוצה על קמפיין עם
  // אלפי שורות.
  const [contactSearch, setContactSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [fieldFilters, setFieldFilters] = useState({});
  const [advancedFilters, setAdvancedFilters] = useState({});

  function setFieldFilter(key, value) {
    setFieldFilters((prev) => ({ ...prev, [key]: value }));
  }
  const [pickIds, setPickIds] = useState(new Set());
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [mappingFilter, setMappingFilter] = useState('all');
  const [noteFilter, setNoteFilter] = useState(''); // מסנן על note - עמודת "יומן שיחות"
  const [noteFilterValues, setNoteFilterValues] = useState(new Set()); // בחירה מרובה מתוך הרשימה הקיימת
  const [noteEmptyOnly, setNoteEmptyOnly] = useState(false);
  const [managerNoteFilter, setManagerNoteFilter] = useState(''); // מסנן נפרד על manager_note - "הערת מנהל"
  const [managerNoteFilterValues, setManagerNoteFilterValues] = useState(new Set());
  const [managerNoteEmptyOnly, setManagerNoteEmptyOnly] = useState(false);
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [responsibleFilterValues, setResponsibleFilterValues] = useState(new Set());
  const [responsibleEmptyOnly, setResponsibleEmptyOnly] = useState(false);
  const [distinctNotes, setDistinctNotes] = useState([]);
  const [distinctManagerNotes, setDistinctManagerNotes] = useState([]);
  const [distinctResponsiblePeople, setDistinctResponsiblePeople] = useState([]);
  // תורמים-פעילים-אחרונים (הוראת-קבע פעילה + תרם ב-40 הימים האחרונים,
  // ר' migration 0113) - חסומים אוטומטית מהתור, ומוסתרים מהטבלה כברירת
  // מחדל. showRecentActiveDonors=false הוא ברירת המחדל בכוונה - "פתיחה"
  // היא פעולה מודעת, לא הגדרה נשמרת.
  const [showRecentActiveDonors, setShowRecentActiveDonors] = useState(false);
  // "לא ענו X+ פעמים" - שורות שעברו את סף-הרצף (0121) יוצאות אוטומטית
  // מהתור ולא מוצגות בטבלה הרגילה בכלל (בניגוד לתורמים-פעילים-אחרונים,
  // שם showRecentActiveDonors מחזיר אותם לאותה טבלה) - יש להן קבוצה
  // נפרדת משלהן, עם סינון-לפי-מינימום-רצף וכפתור "החזר לתור".
  const [showNoAnswerBucket, setShowNoAnswerBucket] = useState(false);
  const [minNoAnswerStreak, setMinNoAnswerStreak] = useState(NO_ANSWER_STREAK_THRESHOLD);
  const [noAnswerSelected, setNoAnswerSelected] = useState(new Set());
  // "ביקשו לחזור אליהם" - אותה תבנית בדיוק כמו "לא ענו" (0135): יוצא
  // מהתור מיד, מוסתר מהטבלה הרגילה, קבוצה נפרדת עם "החזר לתור" ידני.
  const [showCallbackBucket, setShowCallbackBucket] = useState(false);
  // "בן/בת הזוג נענה/תה" - אותה תבנית בדיוק (0143): יוצא מהתור אוטומטית
  // כשבן/בת-הזוג ענה/תה בפועל, מוסתר מהטבלה הרגילה, קבוצה נפרדת עם
  // "החזר לתור" ידני.
  const [showSpouseBucket, setShowSpouseBucket] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [sheetConfigured, setSheetConfigured] = useState(false);
  const [sheetConnection, setSheetConnection] = useState(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetMessage, setSheetMessage] = useState(null);
  // "כפתור עזרה" (migration 0145) - אנשי-קשר-אחראים שמקבלים וואטסאפ כשטלפן/ית
  // מבקש/ת עזרה. חיפוש-והוספה, אותו דפוס בדיוק כמו contactSearch למטה.
  const [helpContacts, setHelpContacts] = useState([]);
  const [helpSearch, setHelpSearch] = useState('');
  const [helpSearchResults, setHelpSearchResults] = useState([]);
  const [helpSaving, setHelpSaving] = useState(false);

  useEffect(() => {
    getCampaignHelpContacts(campaignId).then((res) => {
      if (res?.success) setHelpContacts(res.contacts || []);
    });
  }, [campaignId]);

  useEffect(() => {
    const q = helpSearch.trim();
    if (q.length < 2) { setHelpSearchResults([]); return; }
    const timer = setTimeout(() => {
      searchContacts(q, '00000000-0000-0000-0000-000000000000').then((results) => setHelpSearchResults(results || []));
    }, 300);
    return () => clearTimeout(timer);
  }, [helpSearch]);

  function addHelpContact(contact) {
    if (helpContacts.some((c) => c.id === contact.id)) { setHelpSearch(''); setHelpSearchResults([]); return; }
    const next = [...helpContacts, contact];
    setHelpContacts(next);
    setHelpSearch(''); setHelpSearchResults([]);
    setHelpSaving(true);
    setCampaignHelpContacts(campaignId, next.map((c) => c.id)).finally(() => setHelpSaving(false));
  }

  function removeHelpContact(contactId) {
    const next = helpContacts.filter((c) => c.id !== contactId);
    setHelpContacts(next);
    setHelpSaving(true);
    setCampaignHelpContacts(campaignId, next.map((c) => c.id)).finally(() => setHelpSaving(false));
  }

  useEffect(() => {
    getCampaignSheetConnection(campaignId).then((res) => {
      setSheetConfigured(res.configured);
      setSheetConnection(res.connection);
    });
  }, [campaignId]);

  useEffect(() => {
    getDistinctNotesAndResponsible(campaignId).then((res) => {
      if (res?.error) return;
      setDistinctNotes(res.notes || []);
      setDistinctManagerNotes(res.managerNotes || []);
      setDistinctResponsiblePeople(res.responsiblePeople || []);
    });
  }, [campaignId]);

  function handlePushToSheet() {
    setSheetBusy(true);
    setSheetMessage(null);
    pushCampaignRowsToSheet(campaignId).then((res) => {
      setSheetBusy(false);
      if (res?.error) { setSheetMessage({ error: res.error }); return; }
      setSheetMessage({ success: `נדחפו ${res.pushed} שורות חדשות לגיליון` });
      getCampaignSheetConnection(campaignId).then((r) => setSheetConnection(r.connection));
    });
  }

  function handlePullFromSheet() {
    setSheetBusy(true);
    setSheetMessage(null);
    pullCampaignUpdatesFromSheet(campaignId).then((res) => {
      setSheetBusy(false);
      if (res?.error) { setSheetMessage({ error: res.error }); return; }
      setSheetMessage({ success: `עודכנו ${res.updated} אנשי קשר מהגיליון${res.skipped ? `, דולגו ${res.skipped}` : ''}` });
      getCampaignSheetConnection(campaignId).then((r) => setSheetConnection(r.connection));
      router.refresh();
    });
  }

  function handleRegenerateCategoryTabs() {
    setSheetBusy(true);
    setSheetMessage(null);
    regenerateCategoryTabs(campaignId).then((res) => {
      setSheetBusy(false);
      if (res?.error) { setSheetMessage({ error: res.error }); return; }
      setSheetMessage({ success: res.created > 0 ? `נוצרו ${res.created} לשוניות קטגוריה חדשות` : 'כל הלשוניות כבר קיימות' });
    });
  }

  function handleRegenerateResponsiblePersonTabs() {
    setSheetBusy(true);
    setSheetMessage(null);
    regenerateResponsiblePersonTabs(campaignId).then((res) => {
      setSheetBusy(false);
      if (res?.error) { setSheetMessage({ error: res.error }); return; }
      setSheetMessage({ success: res.created > 0 ? `נוצרו ${res.created} לשוניות אחראי חדשות` : 'כל הלשוניות כבר קיימות' });
    });
  }

  // מילוי-לאחור חד-פעמי: מתקן קודם את שורת-הכותרות (נכתבת רק פעם אחת
  // ביצירת הגיליון, לא מתעדכנת אוטומטית כשמוסיפים עמודה חדשה בקוד), ואז
  // כותב ערכים לעמודות החדשות (בתור-שיחות/קורסים תשפ"ו/מחזור/שנות לימוד/
  // אחראי) בכל השורות שכבר קיימות בגיליון - בלי לגעת בשום עמודה אחרת.
  function handleBackfillSheetColumns() {
    if (!window.confirm('פעולה זו תכתוב מחדש את שורת הכותרות ותמלא ערכים בעמודות החדשות בכל השורות הקיימות בגיליון המחובר. להמשיך?')) return;
    setSheetBusy(true);
    setSheetMessage(null);
    backfillSheetNewColumns(campaignId).then((res) => {
      setSheetBusy(false);
      if (res?.error) { setSheetMessage({ error: res.error }); return; }
      setSheetMessage({ success: `עודכנו כותרות + ${res.cellsWritten} תאים ב-${res.updatedRows} שורות` });
    });
  }

  function handleDisconnectSheet() {
    setSheetBusy(true);
    disconnectCampaignSheet(campaignId).then((res) => {
      setSheetBusy(false);
      if (res?.error) { setSheetMessage({ error: res.error }); return; }
      setSheetConnection(null);
      setSheetMessage(null);
    });
  }
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const importInputRef = useRef(null);

  const deptOptions = useMemo(
    () => Array.from(new Set(availableContacts.flatMap((c) => c.departments || []))).sort((a, b) => a.localeCompare(b, 'he')),
    [availableContacts]
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(availableContacts.flatMap((c) => c.tags || []))).sort((a, b) => a.localeCompare(b, 'he')),
    [availableContacts]
  );

  const hasAdvancedFilter = Object.keys(advancedFilters).length > 0;
  const showPickerList = search.trim().length >= 2 || !!deptFilter || !!tagFilter || Object.values(fieldFilters).some(Boolean) || hasAdvancedFilter;
  const filtered = useMemo(() => {
    if (!showPickerList) return [];
    let result = availableContacts;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) => `${c.name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(q));
    }
    if (deptFilter) result = result.filter((c) => (c.departments || []).includes(deptFilter));
    if (tagFilter) result = result.filter((c) => (c.tags || []).includes(tagFilter));
    const activeFieldFilterEntries = Object.entries(fieldFilters).filter(([, v]) => v);
    if (activeFieldFilterEntries.length > 0) {
      result = result.filter((c) => activeFieldFilterEntries.every(([key, value]) => {
        const fieldDef = extraFields.find((f) => f.key === key);
        const actual = c.extraFields?.[key];
        if (fieldDef?.type === 'select') return actual === value;
        return (actual || '').toString().toLowerCase().includes(value.toLowerCase());
      }));
    }
    if (hasAdvancedFilter) {
      result = result.filter((c) => contactMatchesAdvancedFilter({ departments: c.departmentDetails }, advancedFilters, extraFieldsByWorkspace));
    }
    return result.slice(0, 100);
  }, [availableContacts, search, deptFilter, tagFilter, fieldFilters, extraFields, showPickerList, hasAdvancedFilter, advancedFilters, extraFieldsByWorkspace]);

  const noteFilterActive = !!noteFilter.trim() || noteFilterValues.size > 0 || noteEmptyOnly;
  const managerNoteFilterActive = !!managerNoteFilter.trim() || managerNoteFilterValues.size > 0 || managerNoteEmptyOnly;
  const responsibleFilterActive = !!responsibleFilter.trim() || responsibleFilterValues.size > 0 || responsibleEmptyOnly;

  const blockedRecentDonorCount = useMemo(
    () => rows.filter((r) => r.isRecentActiveDonor && !r.allowRecentDonorCall).length,
    [rows]
  );
  const blockedNoAnswerCount = useMemo(
    () => rows.filter((r) => r.noAnswerStreak >= NO_ANSWER_STREAK_THRESHOLD).length,
    [rows]
  );
  const noAnswerBucketRows = useMemo(
    () => rows.filter((r) => r.noAnswerStreak >= minNoAnswerStreak).sort((a, b) => b.noAnswerStreak - a.noAnswerStreak),
    [rows, minNoAnswerStreak]
  );
  const spouseBucketRows = useMemo(() => rows.filter((r) => r.spouseReachedExit), [rows]);
  // בניגוד לתורמים-פעילים-אחרונים (showRecentActiveDonors מחזיר אותם
  // לאותה טבלה) - שורות "לא ענו X+ פעמים", "ביקשו לחזור אליהם" ו"בן/בת
  // הזוג נענה/תה" תמיד מוסתרות מהטבלה הרגילה, ומוצגות רק בקבוצות
  // הנפרדות למטה.
  const visibleRows = useMemo(
    () => rows.filter((r) => (showRecentActiveDonors || !r.isRecentActiveDonor || r.allowRecentDonorCall) && r.noAnswerStreak < NO_ANSWER_STREAK_THRESHOLD && !r.isPendingCallback && !r.spouseReachedExit),
    [rows, showRecentActiveDonors]
  );

  const noteFilteredRows = useMemo(() => {
    let result = visibleRows;
    if (noteEmptyOnly) {
      result = result.filter((r) => !(r.note || '').trim());
    } else {
      if (noteFilter.trim()) {
        const q = noteFilter.trim().toLowerCase();
        result = result.filter((r) => (r.note || '').toLowerCase().includes(q));
      }
      if (noteFilterValues.size > 0) {
        result = result.filter((r) => noteFilterValues.has(r.note || ''));
      }
    }
    if (managerNoteEmptyOnly) {
      result = result.filter((r) => !(r.managerNote || '').trim());
    } else {
      if (managerNoteFilter.trim()) {
        const q = managerNoteFilter.trim().toLowerCase();
        result = result.filter((r) => (r.managerNote || '').toLowerCase().includes(q));
      }
      if (managerNoteFilterValues.size > 0) {
        result = result.filter((r) => managerNoteFilterValues.has(r.managerNote || ''));
      }
    }
    if (responsibleEmptyOnly) {
      result = result.filter((r) => !(r.responsiblePerson || '').trim());
    } else {
      if (responsibleFilter.trim()) {
        const q = responsibleFilter.trim().toLowerCase();
        result = result.filter((r) => (r.responsiblePerson || '').toLowerCase().includes(q));
      }
      if (responsibleFilterValues.size > 0) {
        result = result.filter((r) => responsibleFilterValues.has(r.responsiblePerson || ''));
      }
    }
    return result;
  }, [visibleRows, noteFilter, noteFilterValues, noteEmptyOnly, managerNoteFilter, managerNoteFilterValues, managerNoteEmptyOnly, responsibleFilter, responsibleFilterValues, responsibleEmptyOnly]);
  const contactSearchFilteredRows = useMemo(() => {
    if (!contactSearch.trim()) return noteFilteredRows;
    const q = contactSearch.trim().toLowerCase();
    return noteFilteredRows.filter((r) => `${r.name || ''} ${r.phone || ''} ${r.email || ''}`.toLowerCase().includes(q));
  }, [noteFilteredRows, contactSearch]);
  const groups = useMemo(() => buildCategoryGroups(contactSearchFilteredRows, CATEGORIES, mappingFilter), [contactSearchFilteredRows, CATEGORIES, mappingFilter]);

  function togglePick(id) {
    setPickIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleRowSelect(id) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGroupCollapsed(key) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleSelectGroup(groupRows) {
    const allSelected = groupRows.length > 0 && groupRows.every((r) => selectedRows.has(r.rowId));
    setSelectedRows((prev) => {
      const next = new Set(prev);
      groupRows.forEach((r) => (allSelected ? next.delete(r.rowId) : next.add(r.rowId)));
      return next;
    });
  }

  function selectAllRows() {
    setSelectedRows(new Set(visibleRows.map((r) => r.rowId)));
  }

  function handleAdd() {
    if (pickIds.size === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await addContactsToCampaign(campaignId, Array.from(pickIds));
      if (res?.error) { setError(res.error); return; }
      setPickIds(new Set()); setSearch(''); setDeptFilter(''); setTagFilter(''); setAdding(false);
      router.refresh();
    });
  }

  function handleChange(rowId, changes) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...changes } : r)));
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await updateCampaignContact(rowId, changes);
        if (res?.error) { setError(res.error); router.refresh(); }
        else if (changes.managerNote !== undefined || changes.responsiblePerson !== undefined) {
          getDistinctNotesAndResponsible(campaignId).then((r) => {
            if (!r?.error) { setDistinctNotes(r.notes || []); setDistinctManagerNotes(r.managerNotes || []); setDistinctResponsiblePeople(r.responsiblePeople || []); }
          });
        }
        resolve(res);
      });
    });
  }

  // עדכון-בכמות אמיתי - שאילתה יחידה (bulkUpdateCampaignContactsField) על
  // כל rowIds יחד, במקום N קריאות updateCampaignContact מקבילות (הבאג
  // שהתגלה בפועל: "הוצא מהתור" על 6,174 שורות עדכן בפועל רק 160).
  function handleBulkChange(rowIds, changes) {
    setRows((prev) => prev.map((r) => (rowIds.includes(r.rowId) ? { ...r, ...changes } : r)));
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await bulkUpdateCampaignContactsField(campaignId, rowIds, changes);
        if (res?.error) { setError(res.error); router.refresh(); }
        else if (changes.responsiblePerson !== undefined) {
          getDistinctNotesAndResponsible(campaignId).then((r) => {
            if (!r?.error) { setDistinctNotes(r.notes || []); setDistinctManagerNotes(r.managerNotes || []); setDistinctResponsiblePeople(r.responsiblePeople || []); }
          });
        }
        resolve(res);
      });
    });
  }

  // "החזר לתור" - מחזיר שורה שיצאה מהתור אחרי כמה "לא ענה" רצופים
  // (0121) בחזרה לתור פעיל, ומאפס את הרצף כדי שלא תצא שוב מיד בניסיון-
  // הבא. בודד ובכמות, אותו דפוס בדיוק כמו handleChange/handleBulkChange.
  function handleReturnToQueue(rowId) {
    handleChange(rowId, { inCallQueue: true, resetNoAnswerStreak: true });
    setNoAnswerSelected((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
  }

  function handleReturnToQueueBulk() {
    if (noAnswerSelected.size === 0) return;
    const ids = Array.from(noAnswerSelected);
    handleBulkChange(ids, { inCallQueue: true, resetNoAnswerStreak: true });
    setNoAnswerSelected(new Set());
  }

  function handleRemove(rowId) {
    startTransition(async () => {
      const res = await removeContactFromCampaign(rowId);
      if (res?.error) { setError(res.error); return; }
      setRows((prev) => prev.filter((r) => r.rowId !== rowId));
      setSelectedRows((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
      router.refresh();
    });
  }

  function handleExport() {
    setExporting(true);
    getBulkContactInsightsForExport(rows.map((r) => r.contactId)).then((insightsByContact) => {
      const agentNameById = Object.fromEntries(agents.map((a) => [a.id, a.name]));
      const headerRow = [
        ROW_ID_HEADER, 'שם', 'טלפון', 'מייל', 'קטגוריה', 'נציג מטפל', 'סטטוס', 'בתור-שיחות',
        'מחלקות', 'שנת-שיא (שנה)', 'שנת-שיא (סכום)', 'סה"כ תרומות (מספר)', 'סה"כ תרומות (סכום)',
        'תרומה אחרונה', 'אינטראקציה אחרונה', 'הוראת קבע פעילה', 'קורסים/סמינרים',
        'קורסים תשפ"ו', 'מחזור (ישיבת דעת)', 'שנות לימוד בישיבה', 'הערה (יומן שיחות)', 'הערת מנהל', 'אחראי',
      ];
      const dataRows = rows.map((r) => [
        r.rowId, r.name || '', r.phone || '', r.email || '', r.category || '',
        r.assignedTo ? (agentNameById[r.assignedTo] || '') : '', campaignStages.labels[r.status] || r.status || '',
        r.inCallQueue ? 'כן' : 'לא',
        ...insightsToCsvCells(insightsByContact[r.contactId]),
        r.note || '', r.managerNote || '', r.responsiblePerson || '',
      ].map(csvCell).join(','));
      const csv = '﻿' + [headerRow.join(','), ...dataRows].join('\n');
      downloadBlob(csv, `קבוצות-קמפיין-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
      setExporting(false);
    });
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setPendingImport(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let sheetRows;
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      } catch {
        setImportResult({ error: 'לא הצלחתי לקרוא את הקובץ - ודאו שזהו קובץ Excel/CSV תקין' });
        return;
      }
      const nonEmpty = sheetRows.filter((r) => Array.isArray(r) && r.some((c) => String(c || '').trim()));
      if (nonEmpty.length < 2) { setImportResult({ error: 'לא נמצאו שורות נתונים בקובץ' }); return; }

      const headerCells = nonEmpty[0].map((h) => String(h || '').trim());
      const idx = {
        rowId: headerCells.indexOf(ROW_ID_HEADER),
        category: headerCells.indexOf('קטגוריה'),
        assignedTo: headerCells.indexOf('נציג מטפל'),
        status: headerCells.indexOf('סטטוס'),
      };
      if (idx.rowId === -1) {
        setImportResult({ error: 'לא נמצאה עמודת "מזהה שורה" בקובץ - יש להשתמש בקובץ שיוצא מכפתור "ייצוא למיפוי ידני" באותו קמפיין' });
        return;
      }

      const rowById = Object.fromEntries(rows.map((r) => [r.rowId, r]));
      const agentIdByName = Object.fromEntries(agents.map((a) => [a.name, a.id]));
      const stageKeyByLabel = Object.fromEntries(campaignStages.order.map((s) => [campaignStages.labels[s] || s, s]));

      const updates = [];
      let unmatched = 0;
      for (const cells of nonEmpty.slice(1)) {
        const rowId = String(cells[idx.rowId] || '').trim();
        const existing = rowById[rowId];
        if (!existing) { unmatched++; continue; }
        const patch = { rowId };
        let changed = false;
        if (idx.category !== -1) {
          const val = String(cells[idx.category] || '').trim();
          if (val !== (existing.category || '')) { patch.category = val; changed = true; }
        }
        if (idx.assignedTo !== -1) {
          const nameVal = String(cells[idx.assignedTo] || '').trim();
          const currentName = existing.assignedTo ? (agents.find((a) => a.id === existing.assignedTo)?.name || '') : '';
          if (nameVal !== currentName) { patch.assignedTo = nameVal ? (agentIdByName[nameVal] || null) : null; changed = true; }
        }
        if (idx.status !== -1) {
          const labelVal = String(cells[idx.status] || '').trim();
          const stageKey = stageKeyByLabel[labelVal];
          const currentLabel = campaignStages.labels[existing.status] || existing.status || '';
          if (stageKey && labelVal !== currentLabel) { patch.status = stageKey; changed = true; }
        }
        if (changed) updates.push(patch);
      }
      if (updates.length === 0) {
        setImportResult({ error: unmatched > 0 ? `לא נמצאו שינויים לעדכון (${unmatched} שורות לא זוהו - ודאו שהקובץ מהקמפיין הנכון)` : 'לא נמצאו שינויים לעדכון בקובץ' });
        return;
      }
      setPendingImport({ updates, unmatched });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function confirmImport() {
    if (!pendingImport) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkUpdateCampaignContactsFromImport(campaignId, pendingImport.updates);
      if (res?.error) { setImportResult({ error: res.error }); setPendingImport(null); return; }
      setRows((prev) => prev.map((r) => {
        const u = pendingImport.updates.find((x) => x.rowId === r.rowId);
        if (!u) return r;
        return {
          ...r,
          ...(u.category !== undefined ? { category: u.category } : {}),
          ...(u.assignedTo !== undefined ? { assignedTo: u.assignedTo || '' } : {}),
          ...(u.status !== undefined ? { status: u.status } : {}),
        };
      }));
      setImportResult({ success: true, updated: res.updated, skipped: res.skipped });
      setPendingImport(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button type="button" onClick={() => setViewMode('table')} style={{
          padding: '7px 16px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
          border: viewMode === 'table' ? '1px solid #0a0a0a' : '1px solid var(--border, #e5e5e5)',
          background: viewMode === 'table' ? '#0a0a0a' : 'var(--bg)', color: viewMode === 'table' ? '#fff' : 'inherit',
        }}>
          טבלה
        </button>
        <button type="button" onClick={() => setViewMode('mapping')} style={{
          padding: '7px 16px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
          border: viewMode === 'mapping' ? '1px solid #0a0a0a' : '1px solid var(--border, #e5e5e5)',
          background: viewMode === 'mapping' ? '#0a0a0a' : 'var(--bg)', color: viewMode === 'mapping' ? '#fff' : 'inherit',
        }}>
          🗺 מיפוי
        </button>
        <button type="button" onClick={() => setViewMode('segment')} style={{
          padding: '7px 16px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
          border: viewMode === 'segment' ? '1px solid #0a0a0a' : '1px solid var(--border, #e5e5e5)',
          background: viewMode === 'segment' ? '#0a0a0a' : 'var(--bg)', color: viewMode === 'segment' ? '#fff' : 'inherit',
        }}>
          🔍 בניית קבוצה
        </button>
      </div>

      {viewMode === 'mapping' ? (
        <MappingQueue campaignId={campaignId} categories={CATEGORIES} />
      ) : viewMode === 'segment' ? (
        <SegmentFinder campaignId={campaignId} pipelinesByWorkspace={pipelinesByWorkspace} />
      ) : (
        <>
      {rows.length > 0 && (
        <CampaignOverviewDashboard rows={rows} agents={agents} campaignStages={campaignStages} groups={groups} />
      )}

      <div style={{ marginBottom: 14 }}>
        {adding ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש איש קשר להוספה (שם / טלפון / מייל)..."
                autoFocus
                style={{ ...inputStyle, flex: '1 1 220px' }}
              />
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={inputStyle}>
                <option value="">כל המחלקות</option>
                {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={inputStyle}>
                <option value="">כל התגיות</option>
                {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {(deptFilter || tagFilter || search) && (
                <button type="button" onClick={() => { setSearch(''); setDeptFilter(''); setTagFilter(''); setFieldFilters({}); }} style={ghostBtn()}>
                  ניקוי סינון
                </button>
              )}
            </div>
            {extraFields.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {extraFields.map((f) => (
                  f.type === 'select' ? (
                    <select key={f.key} value={fieldFilters[f.key] || ''} onChange={(e) => setFieldFilter(f.key, e.target.value)} style={inputStyle}>
                      <option value="">{f.label}</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      key={f.key}
                      value={fieldFilters[f.key] || ''}
                      onChange={(e) => setFieldFilter(f.key, e.target.value)}
                      placeholder={f.label}
                      style={inputStyle}
                    />
                  )
                ))}
              </div>
            )}
            <AdvancedFilterPanel
              pipelinesByWorkspace={pipelinesByWorkspace}
              extraFieldsByWorkspace={extraFieldsByWorkspace}
              value={advancedFilters}
              onChange={setAdvancedFilters}
            />
            {!showPickerList && (
              <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>הקלידו לפחות 2 תווים לחיפוש, או בחרו מחלקה/תגית לסינון</div>
            )}
            {showPickerList && filtered.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#9b9b9b' }}>אין תוצאות (או שכולם כבר בקמפיין)</div>
            )}
            {filtered.length > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <button type="button" onClick={() => setPickIds((prev) => new Set([...prev, ...filtered.map((c) => c.id)]))} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 12 }}>
                  בחר את כל התוצאות המסוננות ({filtered.length})
                </button>
                {pickIds.size > 0 && (
                  <button type="button" onClick={() => setPickIds(new Set())} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 12 }}>
                    נקה בחירה
                  </button>
                )}
              </div>
            )}
            {filtered.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                {filtered.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>
                    <input type="checkbox" checked={pickIds.has(c.id)} onChange={() => togglePick(c.id)} />
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: '#9b9b9b' }}>{c.phone || c.email || ''}</span>
                    {(c.departments || []).length > 0 && <span style={{ color: '#9b9b9b', fontSize: 11 }}>· {c.departments.join(', ')}</span>}
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={handleAdd} disabled={isPending || pickIds.size === 0} style={primaryBtn()}>
                הוספה ({pickIds.size})
              </button>
              <button type="button" onClick={() => { setAdding(false); setPickIds(new Set()); setSearch(''); setDeptFilter(''); setTagFilter(''); }} style={ghostBtn()}>
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setAdding(true)} style={primaryBtn()}>+ הוספת אנשי קשר לקמפיין</button>
            {rows.length > 0 && (
              <>
                <button type="button" onClick={handleExport} disabled={exporting} style={ghostBtn()}>{exporting ? 'מכין קובץ...' : '⬇ ייצוא למיפוי ידני'}</button>
                <button type="button" onClick={() => importInputRef.current?.click()} style={ghostBtn()}>⬆ ייבוא עדכוני מיפוי</button>
                <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} style={{ display: 'none' }} />
                {selectedRows.size === 0 && (
                  <button type="button" onClick={selectAllRows} style={{ ...ghostBtn(), fontSize: 12 }}>בחר את כל השורות ({rows.length})</button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {rows.length > 0 && sheetConfigured && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: 'var(--bg-secondary, #fafafa)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>📊 Google Sheets:</span>
          {sheetConnection ? (
            <>
              <a href={sheetConnection.spreadsheet_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--accent, #1f4d3d)' }}>פתיחת הגיליון ↗</a>
              <button type="button" onClick={handlePushToSheet} disabled={sheetBusy} style={ghostBtn()}>⬆ דחוף לגיליון</button>
              <button type="button" onClick={handlePullFromSheet} disabled={sheetBusy} style={ghostBtn()}>⬇ משוך עדכונים מהגיליון</button>
              <button type="button" onClick={handleRegenerateCategoryTabs} disabled={sheetBusy} style={ghostBtn()} title="יוצר לשונית נפרדת לכל קטגוריה שעדיין אין לה אחת">🗂 עדכון לשוניות קטגוריה</button>
              <button type="button" onClick={handleRegenerateResponsiblePersonTabs} disabled={sheetBusy} style={ghostBtn()} title="יוצר לשונית נפרדת לכל אחראי שעדיין אין לו אחת">🗂 עדכון לשוניות אחראי</button>
              <button type="button" onClick={handleBackfillSheetColumns} disabled={sheetBusy} style={ghostBtn()} title="מתקן את שורת הכותרות וממלא עמודות חדשות (בתור-שיחות/קורסים תשפ&quot;ו/מחזור/שנות לימוד/אחראי) בשורות שכבר קיימות בגיליון">🔄 מילוי-לאחור עמודות חדשות</button>
              <button type="button" onClick={handleDisconnectSheet} disabled={sheetBusy} style={{ ...ghostBtn(), color: '#b23b2f' }}>נתק</button>
              {sheetConnection.last_pushed_at && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>נדחף לאחרונה: {new Date(sheetConnection.last_pushed_at).toLocaleString('he-IL')}</span>
              )}
              {sheetConnection.last_pulled_at && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>נמשך לאחרונה: {new Date(sheetConnection.last_pulled_at).toLocaleString('he-IL')}</span>
              )}
            </>
          ) : (
            <a href={`/api/auth/google-sheets/start?campaign_id=${campaignId}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn(), textDecoration: 'none', display: 'inline-block' }}>
              🔗 חבר גיליון Google
            </a>
          )}
          {sheetMessage?.error && <span style={{ fontSize: 12, color: '#b23b2f' }}>{sheetMessage.error}</span>}
          {sheetMessage?.success && <span style={{ fontSize: 12, color: '#1f7a3d' }}>✓ {sheetMessage.success}</span>}
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: 'var(--bg-secondary, #fafafa)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>🆘 אחראים לעזרה:</span>
        {helpContacts.map((c) => (
          <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#fff3d6', border: '1px solid #f0d78c', borderRadius: 20, padding: '3px 10px' }}>
            {c.first} {c.last}{c.phone ? ` · ${c.phone}` : ''}
            <button type="button" onClick={() => removeHelpContact(c.id)} disabled={helpSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, color: '#8a5a00' }}>✕</button>
          </span>
        ))}
        <input
          type="text" value={helpSearch} onChange={(e) => setHelpSearch(e.target.value)}
          placeholder="חיפוש איש-קשר להוספה..." style={{ ...inputStyle, fontSize: 12, width: 180 }}
        />
        {helpSearchResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', right: 14, zIndex: 20, marginTop: 4, width: 240, background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
            {helpSearchResults.map((c) => (
              <button
                key={c.id} type="button" onClick={() => addHelpContact(c)}
                style={{ display: 'block', width: '100%', textAlign: 'right', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border, #f0f0f0)', background: 'var(--bg)', cursor: 'pointer', fontSize: 12.5 }}
              >
                {c.first} {c.last}{c.phone ? ` · ${c.phone}` : ''}
              </button>
            ))}
          </div>
        )}
        {helpContacts.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--text-muted, #9b9b9b)' }}>לא הוגדרו - כפתור-העזרה של הטלפנים לא יעבוד</span>}
      </div>

      {importResult?.error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>{importResult.error}</div>}
      {importResult?.success && (
        <div style={{ color: '#1f7a3d', fontSize: 12.5, marginBottom: 10 }}>
          ✓ עודכנו {importResult.updated} שורות{importResult.skipped > 0 ? `, דולגו ${importResult.skipped}` : ''}
        </div>
      )}
      {pendingImport && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', background: '#eef2f7', border: '1px solid #c9d6e3', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: '#3b5878' }}>
            נמצאו {pendingImport.updates.length} שינויים לעדכון מהקובץ
            {pendingImport.unmatched > 0 ? ` (${pendingImport.unmatched} שורות בקובץ לא זוהו ודולגו)` : ''} - לאשר?
          </span>
          <button type="button" onClick={confirmImport} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
            אישור עדכון
          </button>
          <button type="button" onClick={() => setPendingImport(null)} style={{ background: 'none', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: '#3b5878' }}>
            ביטול
          </button>
        </div>
      )}

      {error && <div style={{ color: '#b23b2f', fontSize: 12.5, marginBottom: 10 }}>שגיאה: {error}</div>}

      <BulkAssignBar selected={selectedRows} setSelected={setSelectedRows} agents={agents} categories={CATEGORIES} onBulkApply={handleBulkChange} rows={rows} workspaceId={workspaceId} isDonationsWorkspace={isDonationsWorkspace} />

      {rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <input
            type="text" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)}
            placeholder="🔍 חיפוש איש קשר לעדכון (שם/טלפון/מייל)..."
            style={{ ...inputStyle, minWidth: 240 }}
          />
          {contactSearch.trim() && (
            <>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{contactSearchFilteredRows.length} תוצאות</span>
              <button type="button" onClick={() => setContactSearch('')} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 12 }}>נקה חיפוש</button>
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>הצג בקבוצות:</span>
          <select value={mappingFilter} onChange={(e) => setMappingFilter(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
            <option value="all">הכל (חוץ מ"לא רלוונטי")</option>
            <option value="pending">ממתינים למיפוי בלבד</option>
            <option value="relevant">רלוונטי בלבד</option>
            <option value="other">מישהו אחר צריך לגשת בלבד</option>
            <option value="notRelevant">לא רלוונטי בלבד</option>
          </select>
          <MultiValueFilter
            label="יומן שיחות" values={distinctNotes}
            selected={noteFilterValues} onSelectedChange={setNoteFilterValues}
            text={noteFilter} onTextChange={setNoteFilter}
            emptyOnly={noteEmptyOnly} onEmptyOnlyChange={setNoteEmptyOnly}
          />
          <MultiValueFilter
            label="הערת מנהל" values={distinctManagerNotes}
            selected={managerNoteFilterValues} onSelectedChange={setManagerNoteFilterValues}
            text={managerNoteFilter} onTextChange={setManagerNoteFilter}
            emptyOnly={managerNoteEmptyOnly} onEmptyOnlyChange={setManagerNoteEmptyOnly}
          />
          <MultiValueFilter
            label="אחראי" values={distinctResponsiblePeople}
            selected={responsibleFilterValues} onSelectedChange={setResponsibleFilterValues}
            text={responsibleFilter} onTextChange={setResponsibleFilter}
            emptyOnly={responsibleEmptyOnly} onEmptyOnlyChange={setResponsibleEmptyOnly}
          />
          {(noteFilterActive || managerNoteFilterActive || responsibleFilterActive) && (
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{noteFilteredRows.length} תוצאות</span>
          )}
          {blockedRecentDonorCount > 0 && (
            <button
              type="button" onClick={() => setShowRecentActiveDonors((v) => !v)}
              style={{
                ...ghostBtn(), padding: '5px 10px', fontSize: 12,
                background: showRecentActiveDonors ? '#fff7ed' : 'var(--bg)',
                borderColor: showRecentActiveDonors ? '#fed7aa' : 'var(--border, #e5e5e5)',
                color: showRecentActiveDonors ? '#9a5b0c' : 'inherit',
              }}
              title="תורם עם הוראת-קבע פעילה שתרם ב-40 הימים האחרונים - חסום אוטומטית מהתור"
            >
              {showRecentActiveDonors ? `🔓 מוצגים ${blockedRecentDonorCount} תורמים פעילים אחרונים` : `🔒 ${blockedRecentDonorCount} תורמים פעילים אחרונים מוסתרים`}
            </button>
          )}
          {blockedNoAnswerCount > 0 && (
            <button
              type="button" onClick={() => setShowNoAnswerBucket((v) => !v)}
              style={{
                ...ghostBtn(), padding: '5px 10px', fontSize: 12,
                background: showNoAnswerBucket ? '#fff7ed' : 'var(--bg)',
                borderColor: showNoAnswerBucket ? '#fed7aa' : 'var(--border, #e5e5e5)',
                color: showNoAnswerBucket ? '#9a5b0c' : 'inherit',
              }}
              title='יצאו אוטומטית מהתור מיד אחרי "לא ענה" - חוזרים לתור רק ידנית ע"י מנהל'
            >
              {showNoAnswerBucket ? `▴ ${blockedNoAnswerCount} לא ענו` : `🔁 ${blockedNoAnswerCount} לא ענו`}
            </button>
          )}
          {pendingCallbacks.length > 0 && (
            <button
              type="button" onClick={() => setShowCallbackBucket((v) => !v)}
              style={{
                ...ghostBtn(), padding: '5px 10px', fontSize: 12,
                background: showCallbackBucket ? '#eef2f7' : 'var(--bg)',
                borderColor: showCallbackBucket ? '#c9d6e3' : 'var(--border, #e5e5e5)',
                color: showCallbackBucket ? '#3b5878' : 'inherit',
              }}
              title='יצאו מהתור מיד כשביקשו שיחת-חזרה - חוזרים לתור רק ידנית ע"י מנהל'
            >
              {showCallbackBucket ? `▴ ${pendingCallbacks.length} ביקשו לחזור אליהם` : `📅 ${pendingCallbacks.length} ביקשו לחזור אליהם`}
            </button>
          )}
          {spouseBucketRows.length > 0 && (
            <button
              type="button" onClick={() => setShowSpouseBucket((v) => !v)}
              style={{
                ...ghostBtn(), padding: '5px 10px', fontSize: 12,
                background: showSpouseBucket ? '#eef2f7' : 'var(--bg)',
                borderColor: showSpouseBucket ? '#c9d6e3' : 'var(--border, #e5e5e5)',
                color: showSpouseBucket ? '#3b5878' : 'inherit',
              }}
              title='יצאו אוטומטית מהתור כי בן/בת-הזוג נענה/תה - חוזרים לתור רק ידנית ע"י מנהל'
            >
              {showSpouseBucket ? `▴ ${spouseBucketRows.length} בן/בת הזוג נענה/תה` : `💑 ${spouseBucketRows.length} בן/בת הזוג נענה/תה`}
            </button>
          )}
        </div>
      )}

      {showNoAnswerBucket && (
        <NoAnswerBucket
          rows={noAnswerBucketRows}
          minStreak={minNoAnswerStreak}
          onMinStreakChange={setMinNoAnswerStreak}
          selected={noAnswerSelected}
          onSelectedChange={setNoAnswerSelected}
          isPending={isPending}
          onReturnOne={handleReturnToQueue}
          onReturnSelected={handleReturnToQueueBulk}
        />
      )}

      {showCallbackBucket && (
        <CallbackBucket
          rows={pendingCallbacks}
          isPending={isPending}
          onReturnOne={(rowId) => handleChange(rowId, { inCallQueue: true }).then((res) => { if (!res?.error) router.refresh(); })}
        />
      )}

      {showSpouseBucket && (
        <SpouseReachedBucket
          rows={spouseBucketRows}
          isPending={isPending}
          onReturnOne={(rowId) => handleChange(rowId, { inCallQueue: true, resetSpouseReachedExit: true }).then((res) => { if (!res?.error) router.refresh(); })}
        />
      )}

      {rows.length === 0 && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px', fontSize: 13, color: '#9b9b9b' }}>
          עדיין לא נוספו אנשי קשר לקמפיין
        </div>
      )}

      {groups.map((group) => {
        // בזמן חיפוש-איש-קשר פעיל, קבוצות שהמשתמש כיווץ ידנית נפתחות
        // מחדש בכוח - אחרת תוצאה שנמצאת בקבוצה מכווצת פשוט לא הייתה
        // נראית בכלל.
        const collapsed = !contactSearch.trim() && collapsedGroups.has(group.key);
        const groupSelected = group.rows.length > 0 && group.rows.every((r) => selectedRows.has(r.rowId));
        return (
          <div key={group.key || '__none__'} style={{ marginBottom: 12 }}>
            <div
              onClick={() => toggleGroupCollapsed(group.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none',
                background: 'var(--bg-secondary, #fafafa)', border: '1px solid var(--border, #e5e5e5)',
                borderRadius: collapsed ? 8 : '8px 8px 0 0', padding: '9px 14px',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted, #9b9b9b)' }}>{collapsed ? '▸' : '▾'}</span>
              <strong style={{ fontSize: 13 }}>{group.label}</strong>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted, #9b9b9b)', background: 'var(--bg)', borderRadius: 999, padding: '1px 9px' }}>
                {group.allCount}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)' }}>
                {group.counts.pending} ממתינים למיפוי · {group.counts.relevant} רלוונטי
                {group.counts.other > 0 ? ` · ${group.counts.other} מישהו אחר` : ''}
                {group.counts.notRelevant > 0 ? ` · ${group.counts.notRelevant} לא רלוונטי${mappingFilter === 'notRelevant' ? '' : ' (לא מוצג בסינון הנוכחי)'}` : ''}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#3b5878', marginInlineStart: 'auto', cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={groupSelected} onChange={() => toggleSelectGroup(group.rows)} />
                בחר קבוצה
              </label>
            </div>
            {!collapsed && (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
                      <th style={{ padding: '8px 8px', position: 'sticky', insetInlineStart: 0, zIndex: 2, background: 'var(--bg-secondary, #fafafa)' }}></th>
                      {['שם', 'טלפון', 'בן/בת זוג', 'קטגוריה', 'נציג מטפל', 'אחראי', 'סטטוס', 'יומן שיחות', 'הערת מנהל', 'בתור', ''].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            textAlign: 'right', fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)', padding: '8px 14px', textTransform: 'uppercase',
                            ...(i === 0 ? { position: 'sticky', insetInlineStart: 32, zIndex: 2, background: 'var(--bg-secondary, #fafafa)', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.12)' } : {}),
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((r) => (
                      <CampaignRow
                        key={r.rowId}
                        r={r}
                        CATEGORIES={CATEGORIES}
                        agents={agents}
                        campaignStages={campaignStages}
                        isPending={isPending}
                        isSelected={selectedRows.has(r.rowId)}
                        onToggleSelect={() => toggleRowSelect(r.rowId)}
                        onChange={handleChange}
                        onRemove={() => handleRemove(r.rowId)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
        </>
      )}
    </div>
  );
}

// סינון-לפי-רשימה עם בחירה מרובה + "רק ריקים" + חיפוש-טקסט-חופשי כגיבוי -
// פותח פאנל קטן עם checkbox לכל ערך קיים בקמפיין (מ-getDistinctNotesAndResponsible),
// כדי שאפשר יהיה לבחור כמה הערות/אחראים ביחד ולא רק חיפוש-מחרוזת בודד.
function MultiValueFilter({ label, values, selected, onSelectedChange, text, onTextChange, emptyOnly, onEmptyOnlyChange }) {
  const [open, setOpen] = useState(false);
  const activeCount = selected.size + (emptyOnly ? 1 : 0) + (text.trim() ? 1 : 0);

  function toggleValue(v) {
    onSelectedChange((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  function clearAll() {
    onSelectedChange(new Set());
    onTextChange('');
    onEmptyOnlyChange(false);
  }

  function selectAll() {
    onEmptyOnlyChange(false);
    onSelectedChange(new Set(values));
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...ghostBtn(), padding: '5px 10px', fontSize: 12 }}>
        {label}{activeCount > 0 ? ` (${activeCount})` : ''} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 20, marginTop: 4, width: 240,
          background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 10,
        }}>
          <input
            type="text" value={text} onChange={(e) => onTextChange(e.target.value)}
            placeholder="חיפוש חופשי..." style={{ ...inputStyle, fontSize: 12, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={emptyOnly} onChange={(e) => onEmptyOnlyChange(e.target.checked)} />
            רק ריקים (בלי {label})
          </label>
          <div style={{ maxHeight: 180, overflowY: 'auto', borderTop: '1px solid var(--border, #f0f0f0)', paddingTop: 6 }}>
            {values.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--text-muted, #9b9b9b)' }}>אין ערכים קיימים</div>}
            {values.map((v) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(v)} onChange={() => toggleValue(v)} disabled={emptyOnly} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border, #f0f0f0)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={selectAll} disabled={values.length === 0} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 11 }}>בחר הכל</button>
              <button type="button" onClick={clearAll} style={{ ...ghostBtn(), padding: '4px 10px', fontSize: 11 }}>נקה הכל</button>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ ...primaryBtn(), padding: '4px 10px', fontSize: 11 }}>סגירה</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignRow({ r, CATEGORIES, agents, campaignStages, isPending, isSelected, onToggleSelect, onChange, onRemove }) {
  return (
    <tr style={{ borderBottom: '1px solid #f2f2f2' }}>
      <td style={{ padding: '10px 8px', textAlign: 'center', position: 'sticky', insetInlineStart: 0, zIndex: 1, background: 'var(--bg)' }}>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} />
      </td>
      <td style={{ padding: '10px 14px', position: 'sticky', insetInlineStart: 32, zIndex: 1, background: 'var(--bg)', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.12)' }}>
        <Link href={`/dashboard/contacts/${r.contactId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
          {r.name || '—'}
        </Link>
        {r.isRecentActiveDonor && (
          <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: '#fff7ed', color: '#9a5b0c', border: '1px solid #fed7aa' }}>
              🔒 תורם פעיל אחרון
            </span>
            {!r.allowRecentDonorCall && (
              <button
                type="button" onClick={() => onChange(r.rowId, { allowRecentDonorCall: true })} disabled={isPending}
                style={{ background: 'none', border: 'none', color: 'var(--accent, #1f4d3d)', fontSize: 10.5, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                אפשר להתקשר בכל זאת
              </button>
            )}
          </div>
        )}
      </td>
      <td style={{ padding: '10px 14px' }}>{r.phone || '—'}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: r.spouseName ? 'inherit' : '#c8c8c8' }}>
        {r.spouseName ? `${r.spouseName}${r.relationLabel ? ` (${r.relationLabel})` : ''}` : '—'}
      </td>
      <td style={{ padding: '10px 14px' }}>
        <select value={r.category} onChange={(e) => onChange(r.rowId, { category: e.target.value })} disabled={isPending} style={cellSelect()}>
          <option value="">—</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td style={{ padding: '10px 14px' }}>
        <select value={r.assignedTo} onChange={(e) => onChange(r.rowId, { assignedTo: e.target.value })} disabled={isPending} style={cellSelect()}>
          <option value="">— ללא —</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </td>
      <td style={{ padding: '10px 14px' }}>
        <input
          type="text"
          defaultValue={r.responsiblePerson || ''}
          key={r.rowId + ':resp:' + (r.responsiblePerson || '')}
          onBlur={(e) => {
            if (e.target.value !== (r.responsiblePerson || '')) onChange(r.rowId, { responsiblePerson: e.target.value });
          }}
          disabled={isPending}
          placeholder="מי אחראי..."
          style={{ ...cellSelect(), width: '100%', minWidth: 100 }}
        />
      </td>
      <td style={{ padding: '10px 14px' }}>
        <select
          value={r.status}
          onChange={(e) => onChange(r.rowId, { status: e.target.value })}
          disabled={isPending}
          style={{
            ...cellSelect(),
            background: (campaignStages.colors[r.status] || {}).bg || '#f4f4f5',
            color: (campaignStages.colors[r.status] || {}).color || '#52525b',
            border: 'none', fontWeight: 500,
          }}
        >
          {campaignStages.order.map((s) => <option key={s} value={s}>{campaignStages.labels[s] || s}</option>)}
        </select>
      </td>
      {/* יומן-שיחות הטלפנים (note) - תצוגה בלבד, לא ניתן לעריכה כאן בכוונה.
          עריכה ישירה בטבלה הזו על אותה עמודה היא בדיוק מה שגרם לדריסת יומן-
          שיחות שלם בתקרית ה-31/08 (ר' migration 0117/0120). */}
      <td style={{ padding: '10px 14px', fontSize: 12, color: r.note ? 'inherit' : '#c8c8c8', maxWidth: 180 }}>
        <span title={r.note || ''} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.note ? r.note.split('\n')[0] : '—'}
        </span>
      </td>
      <td style={{ padding: '10px 14px' }}>
        <input
          type="text"
          defaultValue={r.managerNote || ''}
          key={r.rowId + ':mgr:' + (r.managerNote || '')}
          onBlur={(e) => {
            if (e.target.value !== (r.managerNote || '')) onChange(r.rowId, { managerNote: e.target.value });
          }}
          disabled={isPending}
          placeholder="הערת מנהל..."
          style={{ ...cellSelect(), width: '100%', minWidth: 120 }}
        />
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
        <input
          type="checkbox" checked={r.inCallQueue}
          onChange={(e) => onChange(r.rowId, { inCallQueue: e.target.checked })}
          disabled={isPending}
          title="נכלל בתור-השיחות לטלמרקטינג"
        />
      </td>
      <td style={{ padding: '10px 14px' }}>
        <button type="button" onClick={onRemove} disabled={isPending} title="הסרה מהקמפיין"
          style={{ background: 'none', border: 'none', color: '#b23b2f', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </td>
    </tr>
  );
}

// קבוצת "לא ענו X+ פעמים" - שורות שיצאו אוטומטית מהתור (0121). חוצה
// קטגוריות בכוונה (לא מוצגת בתוך groups הרגילים) - סינון-לפי-מינימום-
// רצף + "החזר לתור" בודד/בכמות, גלוי למנהל בלבד (הקטע הזה נטען רק
// מתוך CampaignDetailClient שכבר manager-only).
function NoAnswerBucket({ rows, minStreak, onMinStreakChange, selected, onSelectedChange, isPending, onReturnOne, onReturnSelected }) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.rowId));
  function toggleAll() {
    onSelectedChange(allSelected ? new Set() : new Set(rows.map((r) => r.rowId)));
  }
  function toggleOne(rowId) {
    onSelectedChange((prev) => { const next = new Set(prev); if (next.has(rowId)) next.delete(rowId); else next.add(rowId); return next; });
  }
  return (
    <div style={{ marginBottom: 14, border: '1px solid #fed7aa', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff7ed', padding: '9px 14px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, color: '#9a5b0c' }}>🔁 לא ענו - יצאו מהתור</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9a5b0c' }}>
          מינימום רצף:
          <select value={minStreak} onChange={(e) => onMinStreakChange(Number(e.target.value))} style={{ ...cellSelect(), padding: '4px 8px' }}>
            {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
        {selected.size > 0 && (
          <button type="button" onClick={onReturnSelected} disabled={isPending} style={{ ...ghostBtn(), fontSize: 12, marginInlineStart: 'auto' }}>
            ↩ החזר לתור ({selected.size})
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b', background: 'var(--bg)' }}>אין שורות בסף הזה</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'var(--bg)' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              <th style={{ padding: '6px 8px' }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              {['שם', 'טלפון', 'קטגוריה', 'פעמים "לא ענה" רצוף', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)', padding: '6px 14px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '8px', textAlign: 'center' }}><input type="checkbox" checked={selected.has(r.rowId)} onChange={() => toggleOne(r.rowId)} /></td>
                <td style={{ padding: '8px 14px' }}>
                  <Link href={`/dashboard/contacts/${r.contactId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{r.name || '—'}</Link>
                </td>
                <td style={{ padding: '8px 14px' }}>{r.phone || '—'}</td>
                <td style={{ padding: '8px 14px' }}>{r.category || '—'}</td>
                <td style={{ padding: '8px 14px', fontWeight: 600 }}>{r.noAnswerStreak}</td>
                <td style={{ padding: '8px 14px' }}>
                  <button type="button" onClick={() => onReturnOne(r.rowId)} disabled={isPending} style={{ ...ghostBtn(), fontSize: 11.5, padding: '4px 10px' }}>
                    ↩ החזר לתור
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// קבוצת "ביקשו לחזור אליהם" - אותו רעיון בדיוק כמו NoAnswerBucket (0135):
// שורות שיצאו אוטומטית מהתור ברגע שנקבעה שיחת-חזרה, גלוי למנהל בלבד,
// מציג מי ביקש (agentName) מתי ביקשו (requestedAt) ולאיזה זמן הובטחה
// החזרה (callbackAt) - כדי שהמנהל יחליט מתי באמת להחזיר לתור.
function CallbackBucket({ rows, isPending, onReturnOne }) {
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div style={{ marginBottom: 14, border: '1px solid #c9d6e3', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: '#eef2f7', padding: '9px 14px' }}>
        <strong style={{ fontSize: 13, color: '#3b5878' }}>📅 ביקשו לחזור אליהם - יצאו מהתור</strong>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b', background: 'var(--bg)' }}>אין כרגע</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'var(--bg)' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              {['שם', 'טלפון', 'מי ביקש', 'מתי ביקשו', 'לחזור מתי', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)', padding: '6px 14px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '8px 14px' }}>
                  <Link href={`/dashboard/contacts/${r.contactId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{r.name || '—'}</Link>
                </td>
                <td style={{ padding: '8px 14px' }}>{r.phone || '—'}</td>
                <td style={{ padding: '8px 14px' }}>{r.agentName}</td>
                <td style={{ padding: '8px 14px', fontSize: 12 }}>{fmt(r.requestedAt)}</td>
                <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600 }}>{fmt(r.callbackAt)}</td>
                <td style={{ padding: '8px 14px' }}>
                  <button type="button" onClick={() => onReturnOne(r.rowId)} disabled={isPending} style={{ ...ghostBtn(), fontSize: 11.5, padding: '4px 10px' }}>
                    ↩ החזר לתור
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// "בן/בת הזוג נענה/תה" - יצאו אוטומטית מהתור (log_campaign_call_attempt,
// migration 0143) - אותו מבנה בדיוק כמו CallbackBucket, בלי checkboxes/
// בחירה-מרובה (כמו שם, לא כמו NoAnswerBucket).
function SpouseReachedBucket({ rows, isPending, onReturnOne }) {
  return (
    <div style={{ marginBottom: 14, border: '1px solid #c9d6e3', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: '#eef2f7', padding: '9px 14px' }}>
        <strong style={{ fontSize: 13, color: '#3b5878' }}>💑 בן/בת הזוג נענה/תה - יצאו מהתור</strong>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#9b9b9b', background: 'var(--bg)' }}>אין כרגע</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'var(--bg)' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              {['שם', 'טלפון', 'בן/בת הזוג', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--text-muted, #9b9b9b)', padding: '6px 14px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rowId} style={{ borderBottom: '1px solid #f2f2f2' }}>
                <td style={{ padding: '8px 14px' }}>
                  <Link href={`/dashboard/contacts/${r.contactId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{r.name || '—'}</Link>
                </td>
                <td style={{ padding: '8px 14px' }}>{r.phone || '—'}</td>
                <td style={{ padding: '8px 14px' }}>{r.spouseName || '—'}</td>
                <td style={{ padding: '8px 14px' }}>
                  <button type="button" onClick={() => onReturnOne(r.rowId)} disabled={isPending} style={{ ...ghostBtn(), fontSize: 11.5, padding: '4px 10px' }}>
                    ↩ החזר לתור
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// דאשבורד ניהולי לקמפיין - מחושב כליינט-קומפוננטה טהורה מתוך rows/agents/
// groups שכבר נטענו/חושבו בעמוד, בלי שאילתת DB נוספת. העמוד עצמו כבר
// manager-only בגישה (isManagerOfWorkspace guard ב-page.js) אז אין צורך
// בבדיקת הרשאה נוספת כאן.
function CampaignOverviewDashboard({ rows, agents, campaignStages, groups }) {
  const total = rows.length;
  const wonCount = campaignStages.wonStage ? rows.filter((r) => r.status === campaignStages.wonStage).length : 0;
  const byStatus = campaignStages.order.map((s) => ({
    key: s, label: campaignStages.labels[s] || s, count: rows.filter((r) => r.status === s).length,
  }));
  const byAgent = agents
    .map((a) => ({ id: a.id, name: a.name, count: rows.filter((r) => r.assignedTo === a.id).length }))
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count);
  const unassignedCount = rows.filter((r) => !r.assignedTo).length;

  const namedGroups = groups.filter((g) => g.key);
  const uncategorizedGroup = groups.find((g) => !g.key);

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: '1 1 120px', background: 'var(--bg-secondary, #fafafa)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{total}</div>
          <div style={{ fontSize: 11, color: '#9b9b9b' }}>סה"כ אנשי קשר</div>
        </div>
        <div style={{ flex: '1 1 120px', background: 'var(--bg-secondary, #fafafa)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{namedGroups.length}</div>
          <div style={{ fontSize: 11, color: '#9b9b9b' }}>קבוצות מסווגות</div>
        </div>
        {byStatus.map((s) => (
          <div key={s.key} style={{ flex: '1 1 120px', background: 'var(--bg-secondary, #fafafa)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{s.count}</div>
            <div style={{ fontSize: 11, color: '#9b9b9b' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: '1 1 120px', background: '#f0fdf4', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{total ? Math.round((wonCount / total) * 100) : 0}%</div>
          <div style={{ fontSize: 11, color: '#16a34a' }}>אחוז הצלחה</div>
        </div>
      </div>

      {namedGroups.length > 0 && (
        <div style={{ marginBottom: byAgent.length > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 6 }}>פילוח לפי קבוצה</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {namedGroups.map((g) => (
              <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ width: 140, flexShrink: 0 }}>{g.label}</span>
                <div style={{ flex: 1, height: 8, background: '#f2f2f2', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(g.rows.length / total) * 100}%`, background: '#1f4d3d', borderRadius: 999 }} />
                </div>
                <span style={{ width: 60, textAlign: 'left', color: '#6b6b6b' }}>{g.rows.length} ({Math.round((g.rows.length / total) * 100)}%)</span>
              </div>
            ))}
            {uncategorizedGroup && (
              <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 2 }}>{uncategorizedGroup.rows.length} ללא קטגוריה</div>
            )}
          </div>
        </div>
      )}

      {byAgent.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', marginBottom: 6 }}>פילוח לפי נציג</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {byAgent.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ width: 120, flexShrink: 0 }}>{a.name}</span>
                <div style={{ flex: 1, height: 8, background: '#f2f2f2', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(a.count / total) * 100}%`, background: '#0a0a0a', borderRadius: 999 }} />
                </div>
                <span style={{ width: 60, textAlign: 'left', color: '#6b6b6b' }}>{a.count} ({Math.round((a.count / total) * 100)}%)</span>
              </div>
            ))}
            {unassignedCount > 0 && (
              <div style={{ fontSize: 11.5, color: '#9b9b9b', marginTop: 4 }}>{unassignedCount} ללא נציג משויך</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// סרגל פעולה-בכמות - מופיע רק כשנבחרו שורות (איש קשר אחד, כמה, או קבוצה
// שלמה דרך "בחר קבוצה" בכותרת כל קבוצה), ומאפשר להעביר את כולם לנציג/
// קטגוריה/אחראי או להכניס-להוציא מהתור בבת אחת - onBulkApply מבצע
// שאילתת update.in(...) יחידה (bulkUpdateCampaignContactsField) ולא
// N קריאות מקבילות: הבאג המקורי כאן היה שהכפתורים קראו ל-Promise.all
// על updateCampaignContact פר-שורה, ובקנה-מידה גדול (אלפי שורות) רוב
// הבקשות נכשלו בשקט - אומת בפועל: "הוצא מהתור" על 6,174 שורות עדכן
// בפועל רק 160.
function BulkAssignBar({ selected, setSelected, agents, categories, onBulkApply, rows, workspaceId, isDonationsWorkspace }) {
  const [isPending, startTransition] = useTransition();
  const [agentId, setAgentId] = useState('');
  const [categoryValue, setCategoryValue] = useState('');
  const [responsibleValue, setResponsibleValue] = useState('');

  if (selected.size === 0) return null;

  function applyAgent() {
    const ids = Array.from(selected);
    startTransition(async () => {
      // "שלח לנציג" מכניס גם לתור באותה פעולה - צעד אחד, לא שניים. בטוח
      // לעשות את זה תמיד (גם אם השורה לא הייתה בתור קודם) כי מ-migration
      // 0140 שיוך-לנציג הוא בלעדי: השורה תיכנס רק לתור של הנציג הזה, אף
      // נציג אחר לא יכול לתפוס אותה - אין סיכון ש"תור של כולם" יתמלא.
      await onBulkApply(ids, { assignedTo: agentId, inCallQueue: true, resetNoAnswerStreak: true });
      setAgentId('');
      setSelected(new Set());
    });
  }

  function applyCategory() {
    const ids = Array.from(selected);
    startTransition(async () => {
      await onBulkApply(ids, { category: categoryValue });
      setCategoryValue('');
      setSelected(new Set());
    });
  }

  function applyResponsible() {
    const ids = Array.from(selected);
    startTransition(async () => {
      await onBulkApply(ids, { responsiblePerson: responsibleValue });
      setResponsibleValue('');
      setSelected(new Set());
    });
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14,
      background: '#eef2f7', border: '1px solid #c9d6e3', borderRadius: 8, padding: '10px 14px',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3b5878' }}>נבחרו {selected.size} אנשי קשר</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={categoryValue} onChange={(e) => setCategoryValue(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
          <option value="">— בחרו קבוצה —</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" onClick={applyCategory} disabled={isPending || !categoryValue} style={{ background: '#1f4d3d', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          העברה לקבוצה
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
          <option value="">— ללא —</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="button" onClick={applyAgent} disabled={isPending} style={{ background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          שליחה לנציג
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text" value={responsibleValue} onChange={(e) => setResponsibleValue(e.target.value)}
          placeholder="מי אחראי..." style={{ ...inputStyle, fontSize: 12, width: 120 }}
        />
        <button type="button" onClick={applyResponsible} disabled={isPending} style={{ background: '#1f4d3d', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          סימון אחראי
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => { const ids = Array.from(selected); startTransition(async () => { await onBulkApply(ids, { inCallQueue: true }); setSelected(new Set()); }); }}
          disabled={isPending}
          style={{ background: '#fff', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#3b5878' }}
        >
          הכנס לתור
        </button>
        <button
          type="button"
          onClick={() => { const ids = Array.from(selected); startTransition(async () => { await onBulkApply(ids, { inCallQueue: false }); setSelected(new Set()); }); }}
          disabled={isPending}
          style={{ background: '#fff', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#3b5878' }}
        >
          הוצא מהתור
        </button>
        {isPending && <span style={{ fontSize: 11.5, color: '#3b5878' }}>מעדכן...</span>}
      </div>

      <button
        type="button"
        onClick={() => setSelected(new Set())}
        style={{ background: 'none', border: '1px solid #c9d6e3', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#3b5878', marginInlineStart: 'auto' }}
      >
        ביטול בחירה
      </button>
    </div>
  );
}

function primaryBtn() {
  return { background: '#0a0a0a', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
}
function ghostBtn() {
  return { background: 'var(--bg)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer' };
}
function cellSelect() {
  return { border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5 };
}
