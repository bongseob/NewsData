import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NewsData Admin",
  description: "Collection and d-maker.kr publishing operations"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
