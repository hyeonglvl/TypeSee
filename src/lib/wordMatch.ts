/** 예문 속에서 표제어가 등장하는 위치를 찾는다. 3단계로 시도한다:
 *
 * 1. 완전 일치 (\bword\b) — 지금 대다수 단어가 이걸로 맞는다.
 * 2. -ie로 끝나는 동사의 -ying 불규칙 활용 (lie→lying, die→dying,
 *    tie→tying, vie→vying) — 접두 매칭으론 못 잡는 영어의 몇 안 되는
 *    닫힌 불규칙 집합이라 이것만 규칙으로 따로 둔다.
 * 3. 왼쪽 경계만 지키는 접두 매칭 (\bword\w*) — accuse→accused, art→
 *    artistic 처럼 표제어가 더 긴 파생어의 접두부로 쓰인 경우를 잡는다.
 *    뒤에 남은 글자(\w*)까지 매치에 포함시켜야 findWordSpan이 파생어
 *    전체를 슬롯 자리로 소비한다 — 안 그러면 "art"만 빈칸 처리되고
 *    "istic"이 그 뒤에 딱 붙어 문장이 어색하게 끊긴다.
 *    오른쪽 경계까지 풀면(접미부도 허용) "clients" 속 "lie"처럼 무관한
 *    단어 안에서 우연히 겹치는 사고가 나므로 왼쪽만 연다 — "art"가
 *    "start" 뒤쪽에서 우연히 걸리는 것도 이 방식으론 안 걸린다(그 앞에
 *    경계가 없으므로).
 *
 * 1번이 실패한 단어에서만 2·3번이 개입하므로, 이미 잘 맞던 단어의
 * 매칭 결과는 전혀 바뀌지 않는다. */
export function wordBoundaryMatch(word: string, text: string) {
  const exact = new RegExp(`\\b${word}\\b`, "i").exec(text);
  if (exact) return exact;

  if (/ie$/i.test(word)) {
    const ying = word.slice(0, -2) + "ying"; // lie→"l"+ying, die→"d"+ying …
    const irregular = new RegExp(`\\b${ying}\\b`, "i").exec(text);
    if (irregular) return irregular;
  }

  return new RegExp(`\\b${word}\\w*`, "i").exec(text);
}
