/**
 * Legacy app/ directory layout
 * 
 * This layout exists to support legacy pages in /app directory.
 * The main application uses /src/app.
 * 
 * NOTE: This is a compatibility shim. New pages should go in /src/app.
 */

import { Inter } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Avalo',
  description: 'Avalo Web Application',
};

export default function LegacyRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
