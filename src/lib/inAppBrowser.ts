// Google 은 임베디드 웹뷰(카카오톡/인스타그램 등 인앱 브라우저)에서의 OAuth 요청을
// "disallowed_useragent" 로 차단한다. 로그인 버튼을 누르기 전에 감지해서
// 외부 브라우저로 유도하는 안내를 보여주기 위한 유틸.
export type InAppBrowser = "kakaotalk" | "instagram" | "facebook" | "line" | "naver" | "generic";

export function detectInAppBrowser(): InAppBrowser | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/\bLine\//i.test(ua)) return "line";
  if (/NAVER\(inapp/i.test(ua)) return "naver";
  // 안드로이드 웹뷰 일반 신호: "; wv)" 토큰이 UA 에 붙는다
  if (/; ?wv\)/i.test(ua)) return "generic";
  return null;
}

const LABELS: Record<InAppBrowser, string> = {
  kakaotalk: "카카오톡",
  instagram: "인스타그램",
  facebook: "페이스북",
  line: "라인",
  naver: "네이버",
  generic: "인앱 브라우저",
};

export function inAppBrowserLabel(kind: InAppBrowser): string {
  return LABELS[kind];
}

// 카카오톡은 딥링크로 외부 브라우저 오픈을 지원한다. 다른 인앱 브라우저는
// 프로그래밍적으로 탈출할 방법이 없어 사용자가 직접 메뉴에서 열어야 한다.
export function openInExternalBrowser(kind: InAppBrowser) {
  if (kind === "kakaotalk") {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
  }
}
