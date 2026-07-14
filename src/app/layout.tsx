import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/global.css";

export const metadata: Metadata = {
  title: "TypeSee",
  description: "타이핑하며 눈에 새기는 영단어",
};

export const viewport: Viewport = {
  themeColor: "#f5f0e4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // 크롬 원격 데스크톱 등 확장이 React 로드 전에 <html>에 속성을 주입해
    // 하이드레이션 경고를 낸다 — 이 요소의 속성 미스매치만 무시한다.
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
