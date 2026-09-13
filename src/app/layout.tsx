import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "IBRAHIM VIP ZONE — আজকের ফুটবল মাল্টি",
  description:
    "প্রিমিয়াম ডেইলি ফুটবল মাল্টি সার্ভিস — সিকিউর পেমেন্ট ভেরিফিকেশন, প্রোটেক্টেড মাল্টি ভল্ট ও ২৪/৭ AI সাপোর্ট।",
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body className="antialiased min-h-screen">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
