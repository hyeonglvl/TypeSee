import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/global.css";

export const metadata: Metadata = {
  title: "TypeSee",
  description: "타이핑하며 눈에 새기는 영단어",
};

export const viewport: Viewport = {
  themeColor: "#0a0b10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
