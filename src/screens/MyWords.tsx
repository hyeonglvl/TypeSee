import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  addCustomWord,
  removeCustomWord,
  useCustomWords,
} from "@/lib/customWordsStore";
import { getSupabase } from "@/lib/supabase";
import type { Pos, SessionMode, WordEntry } from "@/lib/types";
import styles from "./MyWords.module.css";

interface Props {
  onStart: (mode: SessionMode, words: WordEntry[]) => void;
  onBack: () => void;
}

const COOLDOWN_KEY = "typesee:word-gen-cooldown-until";
const COOLDOWN_MS = 60_000;
const MAX_WORDS_PER_CALL = 20;

const POS_OPTIONS: Array<{ value: Pos | ""; label: string }> = [
  { value: "", label: "품사" },
  { value: "n", label: "명사" },
  { value: "v", label: "동사" },
  { value: "adj", label: "형용사" },
  { value: "adv", label: "부사" },
  { value: "phrase", label: "구/숙어" },
];

interface Draft {
  key: string;
  word: string;
  meaning: string;
  pos: Pos | "";
  example: string;
  exampleMeaning: string;
}

function parseWords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[,\n]+/)) {
    const w = token.trim();
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export default function MyWordsScreen({ onStart, onBack }: Props) {
  const words = useCustomWords();

  const [bulkInput, setBulkInput] = useState("");
  const parsedWords = useMemo(() => parseWords(bulkInput), [bulkInput]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(COOLDOWN_KEY)) || 0;
  });
  const [now, setNow] = useState(() => Date.now());

  const [manualOpen, setManualOpen] = useState(false);
  const [mWord, setMWord] = useState("");
  const [mMeaning, setMMeaning] = useState("");
  const [mPos, setMPos] = useState<Pos | "">("");
  const [mExample, setMExample] = useState("");
  const [mExampleMeaning, setMExampleMeaning] = useState("");

  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldownRemaining]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  const startCooldown = (ms: number) => {
    const until = Date.now() + ms;
    setCooldownUntil(until);
    setNow(Date.now());
    localStorage.setItem(COOLDOWN_KEY, String(until));
  };

  const handleGenerate = async () => {
    if (parsedWords.length === 0 || generating || cooldownRemaining > 0) return;
    if (parsedWords.length > MAX_WORDS_PER_CALL) {
      setGenError(`한 번에 최대 ${MAX_WORDS_PER_CALL}개까지 가능해요`);
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const sb = getSupabase();
      const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
      if (!token) {
        setGenError("로그인이 필요해요");
        return;
      }
      const headers: Record<string, string> = {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch("/api/generate-word", {
        method: "POST",
        headers,
        body: JSON.stringify({ words: parsedWords }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 429)
          startCooldown((body.retryAfterSeconds ?? 60) * 1000);
        setGenError(body.error ?? "자동 생성에 실패했어요");
        return;
      }
      const results = (body.results ?? []) as Array<{
        word: string;
        meaning: string;
        pos?: Pos;
        example: string;
        exampleMeaning: string;
      }>;
      setDrafts((cur) => [
        ...cur,
        ...results.map(
          (r, i): Draft => ({
            key: `${Date.now()}-${i}`,
            word: r.word,
            meaning: r.meaning,
            pos: r.pos ?? "",
            example: r.example,
            exampleMeaning: r.exampleMeaning,
          }),
        ),
      ]);
      setBulkInput("");
      startCooldown(COOLDOWN_MS);
    } catch {
      setGenError("네트워크 오류가 발생했어요");
    } finally {
      setGenerating(false);
    }
  };

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeDraft = (key: string) => {
    setDrafts((cur) => cur.filter((d) => d.key !== key));
  };

  const saveDrafts = () => {
    for (const d of drafts) {
      if (!d.word.trim() || !d.meaning.trim()) continue;
      addCustomWord({
        word: d.word.trim(),
        senses: [{ meaning: d.meaning.trim(), pos: d.pos || undefined }],
        example: d.example.trim() || undefined,
        exampleMeaning: d.exampleMeaning.trim() || undefined,
      });
    }
    setDrafts([]);
  };

  const canSaveManual = useMemo(
    () => mWord.trim() && mMeaning.trim() && mExample.trim() && mExampleMeaning.trim(),
    [mWord, mMeaning, mExample, mExampleMeaning],
  );

  const handleManualSave = (e: FormEvent) => {
    e.preventDefault();
    if (!canSaveManual) return;
    addCustomWord({
      word: mWord.trim(),
      senses: [{ meaning: mMeaning.trim(), pos: mPos || undefined }],
      example: mExample.trim(),
      exampleMeaning: mExampleMeaning.trim(),
    });
    setMWord("");
    setMMeaning("");
    setMPos("");
    setMExample("");
    setMExampleMeaning("");
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>내 단어장</p>
        <h1 className={styles.title}>
          직접 추가한 단어 <span className={styles.titleCount}>{words.length}</span>개
        </h1>
        <p className={styles.subtitle}>
          단어를 쉼표나 줄바꿈으로 구분해서 여러 개 넣으면 한 번에 뜻과 예문을 채워줘요 · 기존 625개 단어와는 별도로 관리돼요
        </p>
      </header>

      <div className={styles.form}>
        <textarea
          className={styles.bulkInput}
          placeholder={"영단어를 쉼표나 줄바꿈으로 구분해서 입력\n예: resilient, ambiguous, thrive"}
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          rows={3}
        />
        <div className={styles.formFooter}>
          <span className={styles.parsedCount}>
            {parsedWords.length > 0 ? `${parsedWords.length}개 인식됨` : ""}
          </span>
          <button
            type="button"
            className={styles.genButton}
            disabled={parsedWords.length === 0 || generating || cooldownRemaining > 0}
            onClick={handleGenerate}
          >
            {generating
              ? "생성 중…"
              : cooldownRemaining > 0
                ? `${cooldownRemaining}초 후 가능`
                : "자동 생성"}
          </button>
        </div>
        {genError && <p className={styles.genError}>{genError}</p>}
      </div>

      {drafts.length > 0 && (
        <div className={styles.drafts}>
          <AnimatePresence initial={false}>
            {drafts.map((d) => (
              <motion.div
                key={d.key}
                className={styles.draftRow}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 12 }}
              >
                <input
                  className={styles.draftWord}
                  value={d.word}
                  onChange={(e) => updateDraft(d.key, { word: e.target.value })}
                />
                <input
                  className={styles.draftField}
                  placeholder="뜻"
                  value={d.meaning}
                  onChange={(e) => updateDraft(d.key, { meaning: e.target.value })}
                />
                <select
                  className={styles.draftPos}
                  value={d.pos}
                  onChange={(e) =>
                    updateDraft(d.key, { pos: e.target.value as Pos | "" })
                  }
                >
                  {POS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.draftField}
                  placeholder="예문"
                  value={d.example}
                  onChange={(e) => updateDraft(d.key, { example: e.target.value })}
                />
                <input
                  className={styles.draftField}
                  placeholder="예문 해석"
                  value={d.exampleMeaning}
                  onChange={(e) =>
                    updateDraft(d.key, { exampleMeaning: e.target.value })
                  }
                />
                <button
                  type="button"
                  className={styles.draftDelete}
                  aria-label="이 단어 제외"
                  onClick={() => removeDraft(d.key)}
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <button className={styles.saveButton} onClick={saveDrafts}>
            {drafts.length}개 단어장에 추가
          </button>
        </div>
      )}

      <button
        type="button"
        className={styles.manualToggle}
        onClick={() => setManualOpen((v) => !v)}
      >
        {manualOpen ? "직접 입력 닫기" : "직접 입력할래요"}
      </button>

      {manualOpen && (
        <form className={styles.manualForm} onSubmit={handleManualSave}>
          <input
            className={styles.field}
            placeholder="영단어"
            value={mWord}
            onChange={(e) => setMWord(e.target.value)}
            maxLength={40}
          />
          <div className={styles.fieldsRow}>
            <input
              className={styles.field}
              placeholder="뜻"
              value={mMeaning}
              onChange={(e) => setMMeaning(e.target.value)}
            />
            <select
              className={styles.posSelect}
              value={mPos}
              onChange={(e) => setMPos(e.target.value as Pos | "")}
            >
              {POS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <input
            className={styles.field}
            placeholder="예문"
            value={mExample}
            onChange={(e) => setMExample(e.target.value)}
          />
          <input
            className={styles.field}
            placeholder="예문 해석"
            value={mExampleMeaning}
            onChange={(e) => setMExampleMeaning(e.target.value)}
          />
          <button type="submit" className={styles.saveButton} disabled={!canSaveManual}>
            단어장에 추가
          </button>
        </form>
      )}

      {words.length > 0 && (
        <div className={styles.grid}>
          <AnimatePresence initial={false}>
            {words.map((w) => (
              <motion.div
                key={w.id}
                className={styles.card}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <button
                  type="button"
                  className={styles.cardDelete}
                  aria-label={`${w.word} 삭제`}
                  onClick={() => removeCustomWord(w.id)}
                >
                  ✕
                </button>
                <span className={styles.cardWord}>{w.word}</span>
                <span className={styles.cardMeaning}>
                  {w.senses.map((s) => s.meaning).join(" · ")}
                </span>
                {w.example && (
                  <div className={styles.cardExample}>
                    <p>{w.example}</p>
                    {w.exampleMeaning && <p className={styles.cardExampleKo}>{w.exampleMeaning}</p>}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={words.length === 0}
          onClick={() => onStart("typing", words)}
        >
          Typing 시작
        </button>
        <button
          className={styles.ghostButton}
          disabled={words.length === 0}
          onClick={() => onStart("quiz", words)}
        >
          Quiz 시작
        </button>
        <button
          className={styles.ghostButton}
          disabled={words.length === 0}
          onClick={() => onStart("listening", words)}
        >
          Listening 시작
        </button>
        <button className={styles.ghostButton} onClick={onBack}>
          뒤로 <kbd>esc</kbd>
        </button>
      </div>
    </div>
  );
}
