import './globals.css';

export const metadata = {
  title: 'Startup B2B Landing',
  description: 'Landing page for a B2B software startup',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}