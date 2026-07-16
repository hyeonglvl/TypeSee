import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/global.css";

/* v5 "Manuscript" 타이포 2종 — global.css 의 --font-* 토큰이 읽는다.
   Inter 는 라틴 UI 전반(한글은 시스템 산세리프로 폴백), JetBrains Mono 는
   타이핑 글리프·숫자 데이터 전용. 세리프/손글씨 없음 — 절제된 도구 감각. */
const uiFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--next-font-ui",
});
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--next-font-mono",
});

export const metadata: Metadata = {
  title: "TypeSee",
  description: "타이핑하며 눈에 새기는 영단어",
};

export const viewport: Viewport = {
  themeColor: "#f7f4ed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // 크롬 원격 데스크톱 등 확장이 React 로드 전에 <html>에 속성을 주입해
    // 하이드레이션 경고를 낸다 — 이 요소의 속성 미스매치만 무시한다.
    <html
      lang="ko"
      className={`${uiFont.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
