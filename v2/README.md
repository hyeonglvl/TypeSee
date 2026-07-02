# TypeSee v2

Vite + React 19 + TypeScript로 재설계한 TypeSee. 기존 앱(`../src`)과 완전히 독립적으로 동작합니다.

## 실행

```bash
cd v2
npm install
npm run dev     # http://localhost:5199
npm run build   # 타입체크 + 프로덕션 빌드 (dist/)
```

## 환경 변수 (`.env.local`)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

없으면 로그인 버튼이 숨겨지고 게스트 모드로만 동작합니다.

## 틀린 단어 저장 (로그인)

로그인 시 틀린 단어를 DB에 저장하려면 Supabase 대시보드 → SQL Editor에서
[`supabase/schema.sql`](supabase/schema.sql)을 **1회 실행**해야 합니다.
테이블이 없으면 콘솔 경고 후 로컬 메모리 모드로 자동 강등됩니다.

- **게스트**: 틀린 단어는 탭 메모리에만 유지 — 새로고침/종료 시 사라짐 (의도된 동작)
- **로그인**: `missed_words` 테이블에 단어별 틀린 횟수 저장(RLS), 로그인 시 로컬 풀과 병합
- 계정 체계는 v1과 동일 (사용자명 → 해시 이메일 매핑) — 기존 계정 그대로 사용 가능
- **복습 노트**: 홈의 복습 카드(단축키 `3`) → 틀린 단어 목록과 횟수 확인, Typing/Quiz로 전체 복습, 기록 비우기

## GitHub / Google 로그인

로그인 시트에 소셜 로그인 버튼이 있습니다. 동작하려면 Supabase 대시보드 →
Authentication → Providers 에서 GitHub·Google을 활성화하고 각 제공자의
Client ID/Secret을 등록해야 합니다 (Redirect URL은 Supabase가 안내하는
`https://<project>.supabase.co/auth/v1/callback` 사용). 미설정 상태에서 누르면
"provider is not enabled" 에러 페이지로 이동합니다.

## 구조

```
src/
  lib/engine.ts       # 세션 리듀서·통계 (순수 함수)
  lib/reviewStore.ts  # 틀린 단어 풀 (메모리 + DB 동기화)
  lib/auth.ts         # Supabase 인증 (v1 호환)
  lib/tts.ts          # 단어 발음 (Web Speech API)
  screens/            # Home · Session · Result · AuthSheet
  data/words.ts       # 단어 데이터
```
