import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AssistantProvider } from "@/components/AssistantProvider";
import { SiteHeader } from "@/components/SiteHeader";
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
  title: "Ask City Hall",
  description:
    "Plain-language news from city council meetings, in your language, with links to the exact moment in the video.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AssistantProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
            Ask City Hall is a hackathon project (JEWEL CITY HACKS 6.0), not an official city service.
            Summaries are AI-generated from public meeting recordings; every answer links to the video so you can
            check it.
          </footer>
          <AssistantPanel />
        </AssistantProvider>
      </body>
    </html>
  );
}
