import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import {
  JetBrains_Mono,
  Nanum_Pen_Script,
  Playfair_Display,
} from "next/font/google";
import "@/styles/global.css";

/* 종이·잉크 v4 타이포 3종 — global.css 의 --font-* 토큰이 이 변수들을
   읽는다. Playfair 는 라틴 전용(워드마크·모드명·숫자), Nanum Pen 은
   한글 손글씨 액센트(배지·태그라인), JetBrains Mono 는 타이핑 글리프. */
const displayFont = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["500", "600", "700"],
  variable: "--next-font-display",
});
const handFont = Nanum_Pen_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--next-font-hand",
});
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--next-font-mono",
});

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
    <html
      lang="ko"
      className={`${displayFont.variable} ${handFont.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
