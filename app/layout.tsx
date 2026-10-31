import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MobileNav } from "@/components/shell/MobileNav";
import { Sidebar } from "@/components/shell/Sidebar";
import { SkipLink } from "@/components/shell/SkipLink";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChargeGuard",
  description:
    "ChargeGuard is an AI teammate that helps merchants respond to payment disputes before the deadline. Demo with synthetic data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SkipLink />
        <div className="flex min-h-dvh flex-col md:flex-row">
          <Sidebar />
          <MobileNav />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}
