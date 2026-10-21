import type { Metadata, Viewport } from "next";
import { appName } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: appName(),
  description: "One shared calendar for the group, synced to everyone's own calendar app.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
