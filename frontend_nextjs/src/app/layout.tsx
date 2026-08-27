import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auto Grid Terminal",
  description: "Next.js + FastAPI Algorithmic Trading Bot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-900 text-white" suppressHydrationWarning>
        <nav className="sticky top-0 z-50 flex gap-1 px-6 py-3 bg-gray-900/80 backdrop-blur border-b border-white/10">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-all"
          >
            ⚡ Auto Grid
          </Link>
          <Link
            href="/formasyon"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-all"
          >
            📈 Formasyon
          </Link>
        </nav>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
