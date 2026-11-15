import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AssistantProvider } from "@/components/AssistantProvider";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { VoiceProvider } from "@/components/VoiceProvider";
import { THEME_SCRIPT } from "@/lib/theme";
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
  title: "HallPass",
  description:
    "Ask about Glendale City Council meetings in your language. Get a short answer and the exact moment in the meeting video.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before React hydrates, so <html> differs from the server markup.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AssistantProvider>
          {/* Voice lives above the pages so a call keeps going while the page changes. */}
          <VoiceProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </VoiceProvider>
        </AssistantProvider>
      </body>
    </html>
  );
}
