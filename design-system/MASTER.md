# TypeSee Design System — MASTER (v5 "Manuscript")

> ui-ux-pro-max 스킬 워크플로로 도출: 스타일 DB의 **Minimalism & Swiss Style**
> (모노크롬·헤어라인·그리드·200ms 호버 — Linear 계열의 원형) × **E-Ink/Paper**
> (따뜻한 종이·잉크·그레인)를 합성. dials: variance 3 · motion 3 · density 6.
> 페이지별 예외는 `design-system/pages/<page>.md` 가 이 문서를 오버라이드한다.

## 원칙

- **구조는 그림자가 아니라 헤어라인이 만든다.** 떠 있는 시트(모달·호버 팝오버)에만 `--shadow-sheet` 한 겹.
- **포인트 색은 하나.** 잉크 바이올렛(`--ink`) — 타이핑된 글자, 주요 CTA, 포커스, 진행. 빨강(`--err`)·형광펜(`--mark`)·초록(`--ok`)은 의미가 있을 때만.
- **제목/본문은 액센트를 입지 않는다** — `--fg` 계열만.
- **키보드 우선.** 모든 주요 행동에 `kbd` 힌트(전역 스타일), 포커스 링 항상 보임.
- 레이아웃 언어: 카드 그리드보다 **그룹 리스트(행)** — 아이콘 · 제목/설명 · 단축키.

## Tokens (`src/styles/global.css`)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#F7F4ED` | 원고지 캔버스 (그레인 opacity 0.09) |
| `--panel` / `--panel-hover` | `#FCFBF7` / `#FFFEFB` | 패널·행 / 호버 |
| `--line` / `--line-strong` | rgba(31,27,20,.10 / .22) | 헤어라인 |
| `--fg` / `--fg-mute` / `--fg-faint` | `#201B13` / `#5F594C` / `#98917F` | 전경 3단계 |
| `--ink` / `--ink-deep` / `--ink-soft` | `#4C5AD4` / `#3542B0` / 9% | 단일 포인트 |
| `--err` / `--err-soft` | `#C43D33` / 10% | 오답 |
| `--mark` / `--mark-soft` | `#F5C543` / 22% | 저장 |
| `--ok` | `#3E7A45` | 완성·통과 |
| `--shadow-sheet` | soft 1겹 | 모달·팝오버 전용 |

## Typography (next/font, `src/app/layout.tsx`)

| Token | Font | Scope |
|---|---|---|
| `--font-ui` | Inter (400–700) + 시스템 산세리프(한글) | UI 전반 |
| `--font-mono` | JetBrains Mono (400–600) | 타이핑 글리프, 카운터, 통계 숫자 |

Type scale: `--text-xs 12 / sm 13 / base 14 / md 15 / lg 17 / xl 20 / 2xl 28 / 3xl 40`.
숫자는 항상 `tabular-nums`. 세리프·손글씨 없음.

## Spacing & Shape

- 4px 그리드: `--sp-1 4 / 2 8 / 3 12 / 4 16 / 5 24 / 6 32 / 7 48 / 8 64`
- Radius: `--r-s 6 / --r-m 10 / --r-l 14`, 칩·필만 999
- 상단 바 높이 52px(홈·세션 공통), 본문 칼럼 `min(600px, 100vw - 48px)`

## Motion

- `--dur-1 120ms / --dur-2 200ms`, `--ease` = cubic-bezier(.25,.1,.25,1)
- 색·배경 전환만 CSS, 이동·스케일은 motion/react 스프링 (기존 로직 유지)
- `prefers-reduced-motion` 전역 respect

## 금지 (skill anti-patterns)

- 이모지 아이콘 금지 — 인라인 SVG(스트로크 1.8) 유지.
- 다크 모드 없음 (light-only).
- 본문 대비 4.5:1 미만 금지 — `--fg-faint` 는 보조 라벨 전용.
- 장식 그림자·회전·손글씨 금지 — v4 크래프트 장식은 폐기됨.
