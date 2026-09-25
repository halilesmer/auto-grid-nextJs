import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNav from "@/components/layout/AppNav";
import ThemeSync from "@/components/layout/ThemeSync";
import { Toaster } from "@/components/ui/animated-toast";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0e" },
  ],
};

export const metadata: Metadata = {
  title: "Auto Grid Terminal",
  description: "Next.js + FastAPI Algorithmic Trading Bot",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Grid Robot",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="tr"
      // Varsayılan koyu; inline script ilk paint'ten önce kullanıcının tercihine göre düzeltir
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Tarayıcı eklentileri <head>'e script enjekte edebiliyor; pozisyon kayınca hydration uyarısı çıkmasın */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          suppressHydrationWarning
        />
      </head>
      <body
        className="min-h-full flex flex-col text-foreground"
        suppressHydrationWarning
      >
        <ThemeSync />
        <AppNav />
        <main className="flex-1">{children}</main>
        <Toaster />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/service-worker.js')
                    .then(function(reg) { console.log('PWA SW registered:', reg.scope); })
                    .catch(function(err) { console.log('PWA SW error:', err); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
