// סט-אייקונים משותף לעיצוב-מחדש של לידים/שירות (קו עדין, currentColor) -
// מחליף אימוג'ים (📞💬✉️📱💡👤🔄⚠️) באייקוני-SVG עקביים עם הכיוון
// הקינטי. props.size קובע רוחב/גובה, props.style/className מועברים הלאה.
function Svg({ size = 14, filled = false, children, style, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, verticalAlign: '-2px', ...style }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PhoneIcon(props) {
  return <Svg {...props}><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1v3.3c0 .6-.4 1-1 1C10.6 21 3 13.4 3 3.7c0-.6.4-1 1-1h3.3c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" /></Svg>;
}

export function WhatsAppIcon(props) {
  return <Svg {...props}><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4c-1.1 0-2.1-.2-3.1-.6L4 20l1-5.3a8.4 8.4 0 1 1 16-3.2z" /></Svg>;
}

export function MailIcon(props) {
  return <Svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Svg>;
}

export function SmsIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 4h16v12H9l-5 4V4z" />
      <circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PersonIcon(props) {
  return <Svg {...props}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></Svg>;
}

export function SparkleIcon(props) {
  return (
    <Svg filled {...props}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </Svg>
  );
}

export function RefreshIcon(props) {
  return <Svg {...props}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 6v5h-5" /></Svg>;
}

export function WarningIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 3l9 16H3L12 3z" />
      <path d="M12 10v3" />
      <circle cx="12" cy="16.3" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ChevronIcon(props) {
  return <Svg {...props}><path d="M15 6l-6 6 6 6" /></Svg>;
}

export function CheckIcon(props) {
  return <Svg {...props}><path d="M4 12l5 5 11-11" /></Svg>;
}

export function CloseXIcon(props) {
  return <Svg {...props}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
}

export function TransferIcon(props) {
  return <Svg {...props}><path d="M7 7h11M14 3l4 4-4 4M17 17H6M10 21l-4-4 4-4" /></Svg>;
}

// אייקוני-ניווט (תפריט-צד/סרגל-עליון) - מחליפים את האימוג'ים (🏠👥✅📅
// 🤝📈🔀🎯📱🎫🗨️💬📊⚙️🔍🔔) באותו דפוס-SVG בדיוק כמו למעלה.
export function HomeIcon(props) {
  return <Svg {...props}><path d="M4 11.5L12 4l8 7.5" /><path d="M6 10v10h5v-6h2v6h5V10" /></Svg>;
}

export function UsersIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5c1.4.4 2.5 1.7 2.5 3.2s-1.1 2.8-2.5 3.2" />
      <path d="M21 20c0-2.8-2-5.2-4.5-5.8" />
    </Svg>
  );
}

export function CheckSquareIcon(props) {
  return <Svg {...props}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 12l3.5 3.5L17 8" /></Svg>;
}

export function CalendarIcon(props) {
  return <Svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>;
}

export function ApprovalIcon(props) {
  return (
    <Svg {...props}>
      <path d="M7 11v9H4v-9h3z" />
      <path d="M7 11l3.5-7c.8 0 1.5.7 1.5 1.5V9h5.5c1 0 1.7.9 1.4 1.8l-2 6.2c-.3.9-1 1.5-2 1.5H7" />
    </Svg>
  );
}

export function TrendingUpIcon(props) {
  return <Svg {...props}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Svg>;
}

export function RouteIcon(props) {
  return <Svg {...props}><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h6a4 4 0 0 0 4-4V9" /></Svg>;
}

export function TargetIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function HeadsetIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="3" y="13" width="4" height="6" rx="1.5" />
      <rect x="17" y="13" width="4" height="6" rx="1.5" />
      <path d="M19 19v1a3 3 0 0 1-3 3h-2" />
    </Svg>
  );
}

export function TicketIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2 2 0 0 0 0 3V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.5a2 2 0 0 0 0-3V9z" />
      <line x1="14" y1="7.5" x2="14" y2="16.5" strokeDasharray="2 2" />
    </Svg>
  );
}

export function ChatBubbleIcon(props) {
  return <Svg {...props}><path d="M4 12a8 8 0 1 1 3.1 6.3L4 20l1.2-3.5A7.9 7.9 0 0 1 4 12z" /></Svg>;
}

export function BarChartIcon(props) {
  return <Svg {...props}><path d="M4 20v-6M11 20V9M18 20v-10" /><path d="M2 20h20" /></Svg>;
}

export function SettingsGearIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.97 7.97 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15 3h-6l-.3 2.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.5L4.6 11a7.97 7.97 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 21h6l.3-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5z" />
    </Svg>
  );
}

export function SearchIcon(props) {
  return <Svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>;
}

export function LockIcon(props) {
  return <Svg {...props}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
}

export function LogoutIcon(props) {
  return <Svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>;
}

export function BellIcon(props) {
  return <Svg {...props}><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" /><path d="M10 19a2 2 0 0 0 4 0" /></Svg>;
}
