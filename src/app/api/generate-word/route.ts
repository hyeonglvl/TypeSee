import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseAnonForServer } from "@/lib/supabaseAdmin";
import type { Pos } from "@/lib/types";

export const runtime = "nodejs";

const RATE_LIMIT_MS = 60_000; // 유저(또는 게스트)당 분당 1회
const WORD_RE = /^[a-zA-Z][a-zA-Z' -]{0,39}$/;
const MAX_WORDS_PER_CALL = 20;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const VALID_POS: ReadonlySet<Pos> = new Set(["n", "v", "adj", "adv", "phrase"]);

interface GeneratedWord {
  word: string;
  meaning: string;
  pos?: Pos;
  example: string;
  exampleMeaning: string;
}

interface GenerateResult {
  results: GeneratedWord[];
  invalidWords: string[];
}

// 내 단어장은 로그인 전용 기능이라 게스트 식별(anon id) 경로는 두지 않는다 —
// 로그인 유저만 통과시킨다.
async function resolveIdentity(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const sb = getSupabaseAnonForServer();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  return `user:${data.user.id}`;
}

/** 분당 1회 제한 — 서비스 롤로 word_gen_limits 테이블을 직접 확인·갱신한다.
 *  단어 몇 개를 한 번에 보내든 호출 1회로 세므로, 여러 단어는 항상 한
 *  요청에 모아 보내는 편이 이 제한 하에서 유리하다.
 *  DB 가 아직 설정되지 않았다면(getSupabaseAdmin() === null) 제한 없이 통과시킨다. */
async function checkRateLimit(
  identity: string,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: true };

  const now = Date.now();
  const { data } = await admin
    .from("word_gen_limits")
    .select("last_generated_at")
    .eq("identity_id", identity)
    .maybeSingle();

  const lastAt = data?.last_generated_at
    ? Date.parse(data.last_generated_at)
    : null;
  if (lastAt !== null && now - lastAt < RATE_LIMIT_MS) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((RATE_LIMIT_MS - (now - lastAt)) / 1000),
    };
  }

  await admin
    .from("word_gen_limits")
    .upsert(
      [{ identity_id: identity, last_generated_at: new Date(now).toISOString() }],
      { onConflict: "identity_id" },
    );
  return { ok: true };
}

async function callGemini(words: string[]): Promise<GenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 가 설정되지 않았습니다");

  const list = words.map((w) => `- ${w}`).join("\n");
  const prompt =
    `You are a Korean-English dictionary assistant. For each of the following ` +
    `English words/phrases, return one JSON object. Keep the same order as the ` +
    `input list and echo the original word back exactly in "word".\n${list}\n\n` +
    `If an entry is clearly not a real English word or phrase — gibberish, random ` +
    `keystrokes, or an obvious typo with no real word it could mean — set "valid" ` +
    `to false and set "meaning"/"example"/"exampleMeaning" to empty strings ("") ` +
    `and omit "pos". Do NOT invent a meaning or example for it. Only mark "valid": ` +
    `false when you are confident a native speaker would not recognize it as a ` +
    `word; when in doubt (rare words, slang, names, minor variant spellings), ` +
    `treat it as valid.\n` +
    `Otherwise set "valid" to true and fill in the rest — "meaning", "example", ` +
    `and "exampleMeaning" are REQUIRED and must never be empty when "valid" is ` +
    `true:\n` +
    `{"word": "<입력받은 단어 그대로>", "valid": true, "meaning": "<가장 흔한 뜻, 한국어>", ` +
    `"pos": "<n|v|adj|adv|phrase 중 하나>", ` +
    `"example": "<쉬운 영어 예문 한 문장, 반드시 이 단어를 포함>", ` +
    `"exampleMeaning": "<예문의 한국어 해석>"}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                word: { type: "STRING" },
                valid: { type: "BOOLEAN" },
                meaning: { type: "STRING" },
                pos: { type: "STRING", enum: ["n", "v", "adj", "adv", "phrase"] },
                example: { type: "STRING" },
                exampleMeaning: { type: "STRING" },
              },
              required: ["word", "valid", "meaning", "example", "exampleMeaning"],
            },
          },
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini API 오류 (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini 응답 형식이 올바르지 않습니다");

  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Gemini 응답이 배열이 아닙니다");
  if (parsed.length === 0) throw new Error("Gemini 응답에서 유효한 단어를 찾지 못했습니다");

  const results: GeneratedWord[] = [];
  const invalidWords: string[] = [];
  for (const item of parsed as Array<Partial<GeneratedWord> & { valid?: boolean }>) {
    if (typeof item.word !== "string") continue;
    if (
      item.valid === false ||
      typeof item.meaning !== "string" ||
      typeof item.example !== "string" ||
      typeof item.exampleMeaning !== "string"
    ) {
      invalidWords.push(item.word);
      continue;
    }
    results.push({
      word: item.word,
      meaning: item.meaning,
      pos: item.pos && VALID_POS.has(item.pos) ? item.pos : undefined,
      example: item.example,
      exampleMeaning: item.exampleMeaning,
    });
  }
  return { results, invalidWords };
}

export async function POST(req: Request) {
  let words: unknown;
  try {
    ({ words } = await req.json());
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  if (!Array.isArray(words) || words.length === 0) {
    return NextResponse.json({ error: "단어를 하나 이상 입력해주세요" }, { status: 400 });
  }
  if (words.length > MAX_WORDS_PER_CALL) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_WORDS_PER_CALL}개까지 가능해요` },
      { status: 400 },
    );
  }
  const cleaned = words.map((w) => (typeof w === "string" ? w.trim() : ""));
  const validFormat = cleaned.filter((w) => WORD_RE.test(w));
  const malformed = cleaned.filter((w) => !WORD_RE.test(w));
  if (validFormat.length === 0) {
    return NextResponse.json(
      { error: "영단어만 입력해주세요 (영문자, 공백/하이픈/어퍼스트로피 허용)" },
      { status: 400 },
    );
  }

  const identity = await resolveIdentity(req);
  if (!identity) {
    return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const rate = await checkRateLimit(identity);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "자동 생성은 분당 1회만 가능해요", retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429 },
    );
  }

  try {
    const { results, invalidWords } = await callGemini(validFormat);
    return NextResponse.json({
      results,
      invalidWords: [...malformed, ...invalidWords],
    });
  } catch (err) {
    console.error("[TypeSee] generate-word 실패:", err);
    return NextResponse.json(
      { error: "자동 생성에 실패했어요. 직접 입력해주세요." },
      { status: 502 },
    );
  }
}
