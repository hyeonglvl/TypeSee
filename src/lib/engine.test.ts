import { describe, expect, it } from "vitest";
import {
  createSession,
  sessionReducer,
  shuffle,
  summarize,
  weightedSample,
} from "./engine";
import type { SessionState, WordEntry } from "./types";

const entry = (id: string, word: string): WordEntry => ({
  id,
  word,
  senses: [{ meaning: "뜻" }],
});

/** 문자열을 한 글자씩 TYPE_CHAR 로 입력한다. */
function type(state: SessionState, chars: string): SessionState {
  let s = state;
  for (const char of chars) s = sessionReducer(s, { type: "TYPE_CHAR", char });
  return s;
}

describe("createSession", () => {
  it("reviewIds 에 있는 단어만 fromReview 로 표시한다", () => {
    const s = createSession(
      [entry("a", "cat"), entry("b", "dog")],
      "typing",
      new Set(["b"]),
    );
    expect(s.words[0].fromReview).toBe(false);
    expect(s.words[1].fromReview).toBe(true);
  });

  it("retentionIds 에 있는 단어만 isRetention 으로 표시한다", () => {
    const s = createSession(
      [entry("a", "cat"), entry("b", "dog")],
      "typing",
      new Set(["a", "b"]),
      new Set(["b"]),
    );
    expect(s.words[0].isRetention).toBe(false);
    expect(s.words[1].isRetention).toBe(true);
  });
});

describe("sessionReducer — typing 모드", () => {
  it("정타는 커서를 전진시키고 오타는 제자리에서 mistakes 만 올린다", () => {
    let s = createSession([entry("a", "cat")], "typing");
    s = type(s, "c");
    expect(s.words[0].typed).toBe("c");
    expect(s.correctKeystrokes).toBe(1);

    s = type(s, "x"); // 오타 — typing 모드는 커서가 막힌다
    expect(s.words[0].typed).toBe("c");
    expect(s.words[0].mistakes).toBe(1);
    expect(s.mistakes).toBe(1);
  });

  it("마지막 글자를 치면 status 가 done 이 된다", () => {
    let s = createSession([entry("a", "cat")], "typing");
    s = type(s, "cat");
    expect(s.words[0].status).toBe("done");
    expect(s.lastCompletedId).toBe("a");
  });
});

describe("sessionReducer — quiz 모드", () => {
  it("오타도 그대로 입력되며 mistakes 를 올린다", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = type(s, "cxt");
    expect(s.words[0].typed).toBe("cxt");
    expect(s.words[0].status).toBe("done");
    expect(s.words[0].mistakes).toBe(1);
  });

  it("REVEAL(정답 보기)은 오답 1회 + gaveUp 으로 완료 처리한다", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = sessionReducer(s, { type: "REVEAL" });
    expect(s.words[0].status).toBe("done");
    expect(s.words[0].gaveUp).toBe(true);
    expect(s.words[0].mistakes).toBe(1);
    // 정답 전체가 고스트로 보이도록 공개 경계가 끝까지 열린다
    expect(s.words[0].hintedUpTo).toBe(3);
  });

  it("정답 보기로 완료한 단어는 troubleWords 에 gaveUp 으로 표시된다", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = sessionReducer(s, { type: "REVEAL" });
    const [trouble] = summarize(s).troubleWords;
    expect(trouble.entry.id).toBe("a");
    expect(trouble.gaveUp).toBe(true);
  });
});

describe("sessionReducer — listening 모드", () => {
  it("퀴즈처럼 오타도 그대로 입력되며 커서가 전진한다", () => {
    let s = createSession([entry("a", "cat")], "listening");
    s = type(s, "cxt");
    expect(s.words[0].typed).toBe("cxt");
    expect(s.words[0].status).toBe("done");
    expect(s.words[0].mistakes).toBe(1);
  });

  it("REVEAL(정답 보기)이 퀴즈와 동일하게 동작한다", () => {
    let s = createSession([entry("a", "cat")], "listening");
    s = sessionReducer(s, { type: "REVEAL" });
    expect(s.words[0].status).toBe("done");
    expect(s.words[0].gaveUp).toBe(true);
    expect(s.words[0].mistakes).toBe(1);
    expect(s.words[0].hintedUpTo).toBe(3);
  });
});

describe("summarize — 정타 통과(mastered) 판정", () => {
  it("복습 출신 + 완주 + 오타 0 만 mastered 에 들어간다", () => {
    let s = createSession(
      [entry("a", "cat"), entry("b", "dog")],
      "typing",
      new Set(["a", "b"]),
    );
    s = type(s, "cat"); // a: 깨끗한 통과
    s = sessionReducer(s, { type: "ADVANCE" });
    s = type(s, "xdog"); // b: 오타 1개 내고 통과
    const summary = summarize(s);
    expect(summary.mastered.map((w) => w.id)).toEqual(["a"]);
    expect(summary.troubleWords.map((t) => t.entry.id)).toEqual(["b"]);
  });

  it("복습 출신이 아니면 깨끗이 통과해도 mastered 가 아니다", () => {
    let s = createSession([entry("a", "cat")], "typing");
    s = type(s, "cat");
    expect(summarize(s).mastered).toEqual([]);
  });
});

describe("summarize — 마스터 유지 점검(retentionMisses) 판정", () => {
  it("유지 점검 단어를 틀리면 retentionMisses 에 들어간다", () => {
    let s = createSession(
      [entry("a", "cat")],
      "typing",
      new Set(["a"]),
      new Set(["a"]),
    );
    s = type(s, "xcat"); // 오타 1개 내고 통과
    const summary = summarize(s);
    expect(summary.retentionMisses.map((r) => r.entry.id)).toEqual(["a"]);
    expect(summary.mastered).toEqual([]);
  });

  it("유지 점검 단어를 깨끗이 통과하면 mastered 에만 들어간다", () => {
    let s = createSession(
      [entry("a", "cat")],
      "typing",
      new Set(["a"]),
      new Set(["a"]),
    );
    s = type(s, "cat");
    const summary = summarize(s);
    expect(summary.retentionMisses).toEqual([]);
    expect(summary.mastered.map((w) => w.id)).toEqual(["a"]);
  });
});

describe("weightedSample", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("n 개를 중복 없이 뽑는다", () => {
    const picked = weightedSample(items, () => 1, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("n 이 전체보다 크면 전부 반환한다", () => {
    expect(weightedSample(items, () => 1, 99).sort()).toEqual(items.slice().sort());
  });

  it("가중치가 압도적인 항목이 사실상 항상 먼저 뽑힌다", () => {
    for (let trial = 0; trial < 20; trial++) {
      const [first] = weightedSample(
        items,
        (it) => (it === "c" ? 1e9 : 1e-9),
        1,
      );
      expect(first).toBe("c");
    }
  });

  it("가중치 0 인 항목도 최소 가중치로 뽑힐 수 있다 (0 나눗셈 방지)", () => {
    expect(weightedSample(["a"], () => 0, 1)).toEqual(["a"]);
  });
});

describe("shuffle", () => {
  it("원소 구성은 그대로 유지한다", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(arr).slice().sort((a, b) => a - b)).toEqual(arr);
  });
});
