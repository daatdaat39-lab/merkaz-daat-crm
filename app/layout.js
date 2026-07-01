export const metadata = {
  title: 'מרכז דעת — CRM',
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{
        margin: 0,
        fontFamily: '"Heebo","Segoe UI",Arial,sans-serif',
        background: '#F3ECDA',
        color: '#241F18',
        minHeight: '100vh',
      }}>
        {children}
      </body>
    </html>
  );
}
