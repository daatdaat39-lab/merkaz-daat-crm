import './globals.css';

export const metadata = {
  title: 'מרכז דעת — CRM',
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {children}
      </body>
    </html>
  );
}
