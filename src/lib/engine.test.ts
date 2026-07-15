import { describe, expect, it } from "vitest";
import {
  classify,
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

  it("HINT 는 기본 공개(첫 글자) 뒤로 짧은 단어 1글자씩 연다", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBe(2);
    // 마지막 글자는 힌트로 열리지 않는다
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBe(2);
    expect(s.words[0].mistakes).toBe(0); // 힌트는 오답으로 세지 않는다
  });

  it("HINT 는 긴 단어(6자+)를 2글자씩 연다", () => {
    let s = createSession([entry("a", "planet")], "quiz");
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBe(3); // 기본 1 + 2
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBe(5); // len-1 캡
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBe(5);
  });

  it("힌트 경계보다 앞서 입력해버린 뒤에도 HINT 는 커서 너머 새 글자를 연다", () => {
    // 이전엔 힌트 경계가 이미 입력한 글자 뒤에 남아있어, 눌러도 전부
    // typed 로 가려진 자리만 가리켜서 아무 효과가 없어 보였다.
    let s = createSession([entry("a", "planet")], "quiz");
    s = type(s, "pla"); // 힌트 없이 기본 공개(1글자)보다 훨씬 앞서 입력
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBeGreaterThan(s.words[0].typed.length);
    expect(s.words[0].hintedUpTo).toBe(5); // typed.length(3) + step(2)
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

describe("sessionReducer — HINT (리스닝 모드)", () => {
  it("기본 공개가 없어 첫 클릭이 첫 글자부터 연다", () => {
    let s = createSession([entry("a", "cat")], "listening");
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBe(1);
    s = sessionReducer(s, { type: "HINT" });
    expect(s.words[0].hintedUpTo).toBe(2); // len-1 캡
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

describe("classify — 단어 하나의 3단계 판정", () => {
  it("타이핑: 오타·힌트 없이 정답 → clean", () => {
    let s = createSession([entry("a", "cat")], "typing");
    s = type(s, "cat");
    expect(classify(s.words[0])).toBe("clean");
  });

  it("타이핑: 오타 후 재시도로 결국 정답(커서가 막혀 typed 는 늘 정답) → minor", () => {
    let s = createSession([entry("a", "cat")], "typing");
    s = type(s, "c");
    s = type(s, "x"); // 오타 — 커서가 막혀 typed 에는 안 남는다
    s = type(s, "at");
    expect(s.words[0].typed).toBe("cat");
    expect(s.words[0].mistakes).toBe(1);
    expect(classify(s.words[0])).toBe("minor");
  });

  it("퀴즈: 오타·힌트 없이 정답 → clean", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = type(s, "cat");
    expect(classify(s.words[0])).toBe("clean");
  });

  it("퀴즈: 힌트를 쓰고도 결국 정답 → minor", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = sessionReducer(s, { type: "HINT" });
    s = type(s, "cat");
    expect(classify(s.words[0])).toBe("minor");
  });

  it("퀴즈: 오타를 냈다가 백스페이스로 고쳐 결국 정답 → minor", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = type(s, "cx");
    s = sessionReducer(s, { type: "BACKSPACE" });
    s = type(s, "at");
    expect(s.words[0].typed).toBe("cat");
    expect(s.words[0].mistakes).toBe(1);
    expect(classify(s.words[0])).toBe("minor");
  });

  it("퀴즈: 힌트를 썼어도 끝까지 오답이면 major", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = sessionReducer(s, { type: "HINT" });
    s = type(s, "cxt");
    expect(s.words[0].typed).toBe("cxt");
    expect(classify(s.words[0])).toBe("major");
  });

  it("퀴즈: 정답 보기(gaveUp) → major", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = sessionReducer(s, { type: "REVEAL" });
    expect(classify(s.words[0])).toBe("major");
  });
});

describe("summarize — outcomes(EF/복습 풀 갱신 신호)", () => {
  it("복습 출신 단어의 clean 통과는 outcomes 에 tier:clean 으로 들어간다", () => {
    let s = createSession([entry("a", "cat")], "typing", new Set(["a"]));
    s = type(s, "cat");
    expect(summarize(s).outcomes).toEqual([
      { id: "a", tier: "clean", revealed: false },
    ]);
  });

  it("복습 출신이 아닌 새 단어의 clean 통과는 outcomes 에서 제외된다", () => {
    let s = createSession([entry("a", "cat")], "typing");
    s = type(s, "cat");
    expect(summarize(s).outcomes).toEqual([]);
  });

  it("복습 출신이 아니어도 minor/major 는 outcomes 에 포함된다", () => {
    let s = createSession([entry("a", "cat"), entry("b", "dog")], "quiz");
    s = type(s, "cxt"); // a: 끝까지 완료했지만 오답 → major
    s = sessionReducer(s, { type: "ADVANCE" });
    s = sessionReducer(s, { type: "HINT" });
    s = type(s, "dog"); // b: 힌트 쓰고 정답 → minor
    const outcomes = summarize(s).outcomes;
    expect(outcomes.find((o) => o.id === "a")).toEqual({
      id: "a",
      tier: "major",
      revealed: false,
    });
    expect(outcomes.find((o) => o.id === "b")).toEqual({
      id: "b",
      tier: "minor",
      revealed: false,
    });
  });

  it("gaveUp(정답 보기) 단어는 outcomes 에 revealed:true 로 표시된다", () => {
    let s = createSession([entry("a", "cat")], "quiz");
    s = sessionReducer(s, { type: "REVEAL" });
    expect(summarize(s).outcomes).toEqual([
      { id: "a", tier: "major", revealed: true },
    ]);
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
