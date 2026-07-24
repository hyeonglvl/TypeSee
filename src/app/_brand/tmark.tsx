/** 파비콘·앱 아이콘·OG 이미지가 공유하는 브랜드 심볼. 파란 T(=Type, 토큰 의미상
 *  "내가 쓴 것")와 잉크 밑줄(=방금 입력을 마친 단어)만으로 구성 — 글자 렌더링에
 *  기대지 않아 16px 파비콘에서도 형태가 또렷하다. */
export function TMark({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="44" y="14" width="12" height="54" rx="2" fill="#2b4fd8" />
      <rect x="25" y="14" width="50" height="10" rx="3" fill="#2b4fd8" />
      <rect x="20" y="82" width="60" height="7" rx="3.5" fill="#2a241a" />
    </svg>
  );
}
