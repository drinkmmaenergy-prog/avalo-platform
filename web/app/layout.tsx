/**
 * Root Layout
 * PHASE 30B-3: Legal Acceptance System with enforcement
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import LegalGuard from "./components/LegalGuard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avalo - Token Wallet & Dashboard",
  description: "Manage your tokens, earnings, and profile",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <LegalGuard>
            {children}
          </LegalGuard>
        </div>
      </body>
    </html>
  );
}
