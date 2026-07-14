-- TypeSee v2 — 틀린 단어 저장 테이블
-- Supabase 대시보드 → SQL Editor 에서 1회 실행하세요.

create table if not exists public.missed_words (
  user_id uuid not null references auth.users (id) on delete cascade,
  word_id text not null,
  wrong_count integer not null default 1,
  saved boolean not null default false,
  -- 정답 보기로 철자를 열어본 적 있는 단어 (복습 노트 '정답 봄' 라벨)
  revealed boolean not null default false,
  -- TS-1 ease factor: 낮을수록 약한 단어라 세션에 더 자주 등장 (범위 1.3~3.0)
  ease_factor real not null default 2.5,
  -- TS-1 시간 가중치: 세션에서 마지막으로 실제 학습한 시각 (null = 미상)
  last_seen_at timestamptz,
  -- 마스터 유지 점검: 마스터한 시각 (null = 활성/복습 중)
  mastered_at timestamptz,
  last_missed_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

-- 기존 테이블에 saved / ease_factor 컬럼이 없다면 추가 (기존 배포 마이그레이션용)
alter table public.missed_words
  add column if not exists saved boolean not null default false;
alter table public.missed_words
  add column if not exists ease_factor real not null default 2.5;
-- TS-1 시간 가중치: 세션에서 마지막으로 실제 학습한 시각 (null = 미상)
alter table public.missed_words
  add column if not exists last_seen_at timestamptz;
-- 마스터 유지 점검: 마스터한 시각 (null = 활성/복습 중)
alter table public.missed_words
  add column if not exists mastered_at timestamptz;
-- 정답 보기로 철자를 열어본 적 있는 단어 (복습 노트 '정답 봄' 라벨)
alter table public.missed_words
  add column if not exists revealed boolean not null default false;

alter table public.missed_words enable row level security;

drop policy if exists "select own missed words" on public.missed_words;
create policy "select own missed words" on public.missed_words
  for select using (auth.uid() = user_id);

drop policy if exists "insert own missed words" on public.missed_words;
create policy "insert own missed words" on public.missed_words
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own missed words" on public.missed_words;
create policy "update own missed words" on public.missed_words
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own missed words" on public.missed_words;
create policy "delete own missed words" on public.missed_words
  for delete using (auth.uid() = user_id);

-- 역대 오답 기록 — missed_words 와 달리 마스터/초기화되어도 지워지지 않는
-- 누적 기록. 사용자가 명시적으로 지울 때만 삭제됩니다.
create table if not exists public.word_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  word_id text not null,
  wrong_count integer not null default 1,
  last_missed_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

alter table public.word_history enable row level security;

drop policy if exists "select own word history" on public.word_history;
create policy "select own word history" on public.word_history
  for select using (auth.uid() = user_id);

drop policy if exists "insert own word history" on public.word_history;
create policy "insert own word history" on public.word_history
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own word history" on public.word_history;
create policy "update own word history" on public.word_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own word history" on public.word_history;
create policy "delete own word history" on public.word_history
  for delete using (auth.uid() = user_id);

-- 일별 학습량 — 홈 화면 스트릭(연속 학습) 캘린더용. 하루에 타이핑/퀴즈로
-- 시도한 단어 수를 누적합니다 (정답/오답/포기 모두 포함).
create table if not exists public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  words_typed integer not null default 0,
  primary key (user_id, activity_date)
);

alter table public.daily_activity enable row level security;

drop policy if exists "select own daily activity" on public.daily_activity;
create policy "select own daily activity" on public.daily_activity
  for select using (auth.uid() = user_id);

drop policy if exists "insert own daily activity" on public.daily_activity;
create policy "insert own daily activity" on public.daily_activity
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own daily activity" on public.daily_activity;
create policy "update own daily activity" on public.daily_activity
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own daily activity" on public.daily_activity;
create policy "delete own daily activity" on public.daily_activity
  for delete using (auth.uid() = user_id);
