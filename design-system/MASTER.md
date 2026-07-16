# TypeSee Design System — MASTER (v4 "크래프트 저널")

> ui-ux-pro-max 스킬의 DB 검색(E-Ink/Paper 스타일 + Diary/Journal 팔레트 +
> Minimal Single Column 패턴, dials: variance 4 · motion 3 · density 4)을
> 기존 v3 "종이와 잉크" 은유와 합성한 결과. 페이지별 예외는
> `design-system/pages/<page>.md` 가 이 문서를 오버라이드한다.

## 은유 (변하지 않는 규칙)

- **파란 잉크 = 내가 쓴 것.** 타이핑된 글자·진행바·인터랙티브 강조는 항상 잉크 블루.
- **빨간 펜 = 실수.** 오답, 채점 X, 공책 마진 라인.
- **형광펜 노랑 = 저장.** 북마크한 단어.
- **크래프트 브라운 = 장식.** 브레이스, 테이프 등 비인터랙티브 장식 전용 — 클릭되는 것에 쓰지 않는다.
- 제목/본문 텍스트는 액센트 색을 입지 않는다 (잉크 계열만).

## Tokens (`src/styles/global.css`)

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#F6EFDF` | 책상 위 크래프트지 캔버스 (그레인 + 옅은 도트) |
| `--surface` / `--surface-raised` | `#FDFAF2` / `#FFFEFA` | 종이 카드 / 활성 종이 |
| `--ink` / `--ink-2` / `--ink-3` | `#2A241A` / `#6C6250` / `#A5987F` | 본문 잉크 3단계 |
| `--accent` / `--accent-deep` | `#2B4FD8` / `#1D3AA8` | 파란 잉크 |
| `--danger` | `#C8382E` | 빨간 펜 |
| `--highlight` | `#FFD43B` | 형광펜 |
| `--kraft` | `#A9744B` | 크래프트 장식 |
| `--shadow-card` / `--shadow-pop` | soft drop + 3–4px 하드 오프셋 | "스케치" 종이 그림자 |

## Typography (next/font, `src/app/layout.tsx`)

| Token | Font | Scope |
|---|---|---|
| `--font-sans` | 시스템 산세리프 (Apple SD Gothic/Pretendard) | 한글 본문·UI 전반 |
| `--font-display` | Playfair Display (500–700, italic) | 라틴 전용: 워드마크, 모드명, 큰 숫자 |
| `--font-hand` | Nanum Pen Script | 손글씨 액센트: 배지·태그라인·스트릭·익힘 단계 (한글 지원 필수라 Kalam 대신 채택) |
| `--font-mono` | JetBrains Mono (400/500) | 타이핑 글리프·슬롯 |

- Nanum Pen Script 는 같은 px 에서 작게 보인다 — 최소 16px 로 쓴다.
- 손글씨 요소는 `rotate(±0.6–1.6deg)` 로 살짝 기울여 붙인 느낌을 준다.

## Signature 요소

- **공책 페이지 (Session 활성 카드):** 옅은 파란 괘선(36px 간격) + 왼쪽 42px 빨간 마진 라인. 장식이므로 베이스라인 정렬은 하지 않는다.
- **마스킹 테이프 배지:** `border-radius: 3px` + 손글씨 + 미세 회전. 색 의미는 은유 표를 따른다.
- **그레인 캔버스:** `body::before` 에 feTurbulence 노이즈 SVG + 24px 도트, opacity 0.55. 레이어 하나로 고정(리페인트 없음).

## Motion (dial 3/10 — Subtle)

- 마이크로 인터랙션 150–300ms, spring 기반 (기존 motion/react 설정 유지).
- transform/opacity 만 애니메이트. `prefers-reduced-motion` 전역 respect (global.css).

## 금지 (skill anti-patterns)

- 이모지 아이콘 금지 — 인라인 SVG 유지.
- 다크 모드 없음 (light-only, `color-scheme: light`).
- 텍스트 대비 4.5:1 미만 금지 — `--ink-2` 이상을 본문에, `--ink-3` 는 보조 텍스트 전용.
- 손글씨 서체를 본문/버튼 라벨에 쓰지 않는다 — 액센트 전용.
