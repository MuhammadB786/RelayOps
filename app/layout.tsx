import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelayOps — Maintenance & Reliability",
  description:
    "From equipment signal to verified repair. A shared maintenance operations workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
