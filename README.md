# TypeSee
Type and Learn
이름 유래: 영어권에서 modern slang 중 하나인 'TypeSh*t' 을 한국에 일본컨셉으로 한 바의 일하는 일본인 직원들한테 말해주니 발음을 'TypeC' 라고하는것에서 유래

타이핑하며 눈에 새기는 영단어 앱. Next.js + React + Supabase.

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # 프로덕션 빌드
```

## 환경 변수 (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

없으면 로그인 버튼이 숨겨지고 게스트 모드로만 동작합니다.

## 기능

- **Typing / Quiz 모드**: 단어를 보고 치거나, 뜻만 보고 철자를 떠올리며 입력 (오타 2회 → 힌트)
- **틀린 단어 복습**: 세션에서 틀린 단어가 자동으로 모이고, 복습 노트(단축키 `3`)에서
  틀린 횟수 확인·Typing/Quiz로 재도전. 정타로 통과하면 목록에서 제거(마스터)
  - 게스트: 탭 메모리에만 유지 (새로고침 시 초기화)
  - 로그인: `missed_words` 테이블에 저장되어 어디서든 복원
- **라이브 스탯**(WPM·정확도), **단어 발음**(Web Speech, 토글), 키보드 온리 조작

## Supabase 설정

1. **틀린 단어 저장**: SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql) 1회 실행
2. **GitHub/Google 로그인**: 현재 "추후 서비스 예정" 안내만 표시됨.
   활성화하려면 Authentication → Providers에서 제공자 설정 후
   `src/screens/AuthSheet.tsx`의 핸들러를 `signInWithProvider`(`src/lib/auth.ts`)로 교체

## 구조

```
src/
  app/                # Next.js 엔트리 (layout, page)
  App.tsx             # 화면 전환 (홈 → 세션 → 결과 → 복습)
  lib/engine.ts       # 세션 리듀서·통계 (순수 함수)
  lib/types.ts        # 공용 타입 (WordEntry, SessionState 등)
  lib/reviewStore.ts  # 틀린 단어 풀 (메모리 + DB 동기화)
  lib/auth.ts         # Supabase 인증
  lib/supabase.ts     # Supabase 클라이언트
  lib/tts.ts          # 단어 발음
  screens/            # Home · Session · Result · Review · HistorySheet · AuthSheet
  data/words.ts       # 단어 데이터
  styles/global.css   # 전역 스타일
```

브랜치: `hyeong-dev-v1` = 구버전(v1) 백업.
