import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gold Pattern Lab",
  description: "Live XAU/USD pattern analysis with demo (paper) order placement.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
