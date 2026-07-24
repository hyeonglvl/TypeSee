import { ImageResponse } from "next/og";
import { TMark } from "./_brand/tmark";

export const runtime = "edge";
export const alt = "TypeSee — 타이핑하며 눈에 새기는 영단어";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TAGLINE = "타이핑하며 눈에 새기는 영단어";

// NanumPenScript-subset.ttf 는 위 TAGLINE 문자만 담은 서브셋이다 — 태그라인을
// 바꾸면 이 폰트도 같은 방식(text= 서브셋)으로 다시 받아와야 한다.
// PlayfairDisplay-*-600-static.ttf 는 variable font를 fonttools varLib.instancer
// wght=600 으로 고정 인스턴싱한 결과다 — satori(next/og)가 원본 variable font의
// fvar 테이블을 파싱하다 죽어서(fvar axis 파싱 에러) 정적 인스턴스가 필요했다.
export default async function Image() {
  const [displayNormal, displayItalic, hand] = await Promise.all([
    fetch(
      new URL("./_brand/fonts/PlayfairDisplay-600-static.ttf", import.meta.url),
    ).then((res) => res.arrayBuffer()),
    fetch(
      new URL(
        "./_brand/fonts/PlayfairDisplay-Italic-600-static.ttf",
        import.meta.url,
      ),
    ).then((res) => res.arrayBuffer()),
    fetch(
      new URL("./_brand/fonts/NanumPenScript-subset.ttf", import.meta.url),
    ).then((res) => res.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 30,
          padding: "0 96px",
          background: "#f6efdf",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 24,
              background: "#fdfaf2",
              border: "1px solid rgba(58,47,32,0.13)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TMark size={62} />
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Playfair Display",
              fontWeight: 600,
              fontSize: 100,
              lineHeight: 1,
              color: "#2a241a",
            }}
          >
            <span>Type</span>
            <span style={{ color: "#2b4fd8", fontStyle: "italic" }}>See</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Nanum Pen Script",
            fontSize: 42,
            color: "#6c6250",
          }}
        >
          {TAGLINE}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Playfair Display", data: displayNormal, weight: 600, style: "normal" },
        { name: "Playfair Display", data: displayItalic, weight: 600, style: "italic" },
        { name: "Nanum Pen Script", data: hand, weight: 400, style: "normal" },
      ],
    },
  );
}
