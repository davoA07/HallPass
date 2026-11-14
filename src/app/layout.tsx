import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AssistantProvider } from "@/components/AssistantProvider";
import { SiteFooter } from "@/components/SiteFooter";
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
  title: "HallPass",
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
          <SiteFooter />
          <AssistantPanel />
        </AssistantProvider>
      </body>
    </html>
  );
}
