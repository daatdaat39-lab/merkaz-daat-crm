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
