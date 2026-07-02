-- TypeSee v2 — 틀린 단어 저장 테이블
-- Supabase 대시보드 → SQL Editor 에서 1회 실행하세요.

create table if not exists public.missed_words (
  user_id uuid not null references auth.users (id) on delete cascade,
  word_id text not null,
  wrong_count integer not null default 1,
  last_missed_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

alter table public.missed_words enable row level security;

create policy "select own missed words" on public.missed_words
  for select using (auth.uid() = user_id);

create policy "insert own missed words" on public.missed_words
  for insert with check (auth.uid() = user_id);

create policy "update own missed words" on public.missed_words
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own missed words" on public.missed_words
  for delete using (auth.uid() = user_id);
