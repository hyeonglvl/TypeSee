import { beforeEach, describe, expect, it } from "vitest";
import {
  EASE_INIT,
  EASE_MASTER,
  EASE_MIN,
  appearanceWeight,
  clearAll,
  clearHistoryAll,
  getReviewPool,
  recordSession,
  saveWord,
} from "./reviewStore";

/* getSupabase 는 env 가 없으면 null 을 반환하고 activeUserId 도 없으므로
   모든 원격 동기화는 no-op — 테스트는 순수 메모리 로직만 검증한다. */

beforeEach(() => {
  clearAll();
  clearHistoryAll();
});

describe("TS-1 — 오답 시 ease 감소", () => {
  it("첫 오답: EASE_INIT 에서 오타 수 × 0.2 만큼 내려간다", () => {
    recordSession([{ id: "w", count: 2 }], []);
    const pool = getReviewPool();
    expect(pool.wrongCountOf("w")).toBe(2);
    expect(pool.easeOf("w")).toBeCloseTo(EASE_INIT - 0.4);
  });

  it("오타가 아무리 많아도 EASE_MIN 밑으로 내려가지 않는다", () => {
    recordSession([{ id: "w", count: 50 }], []);
    expect(getReviewPool().easeOf("w")).toBe(EASE_MIN);
  });

  it("세션을 거듭 틀리면 누적으로 내려간다", () => {
    recordSession([{ id: "w", count: 1 }], []);
    recordSession([{ id: "w", count: 1 }], []);
    expect(getReviewPool().easeOf("w")).toBeCloseTo(EASE_INIT - 0.4);
    expect(getReviewPool().wrongCountOf("w")).toBe(2);
  });
});

describe("TS-1 — 정타 통과 시 ease 회복과 마스터", () => {
  it("정타 통과는 +0.25, 임계값 전까지는 풀에 남는다", () => {
    recordSession([{ id: "w", count: 1 }], []); // ease 2.3
    recordSession([], ["w"]);
    const pool = getReviewPool();
    expect(pool.ids.has("w")).toBe(true);
    expect(pool.easeOf("w")).toBeCloseTo(2.55);
  });

  it("EASE_MASTER 에 도달하면 풀에서 제거된다", () => {
    recordSession([{ id: "w", count: 1 }], []); // 2.3
    recordSession([], ["w"]); // 2.55
    recordSession([], ["w"]); // 2.8
    expect(getReviewPool().ids.has("w")).toBe(true);
    recordSession([], ["w"]); // 3.05 ≥ 3.0 → 마스터
    expect(getReviewPool().ids.has("w")).toBe(false);
  });

  it("풀에 없는 단어의 통과는 무시된다", () => {
    recordSession([], ["ghost"]);
    expect(getReviewPool().ids.has("ghost")).toBe(false);
  });

  it("저장한 단어는 마스터돼도 풀에 남고 ease 가 리셋된다", () => {
    saveWord("s"); // ease 2.5, wrongCount 0
    recordSession([], ["s"]); // 2.75
    recordSession([], ["s"]); // 3.0 → 마스터이지만 saved
    const pool = getReviewPool();
    expect(pool.ids.has("s")).toBe(true);
    expect(pool.isSaved("s")).toBe(true);
    expect(pool.wrongCountOf("s")).toBe(0);
    expect(pool.easeOf("s")).toBe(EASE_INIT);
  });
});

describe("TS-1 — 쿨다운", () => {
  it("정타 통과 후 풀에 남은 단어는 쿨다운에 들어간다", () => {
    recordSession([{ id: "w", count: 1 }], []);
    recordSession([], ["w"]);
    expect(getReviewPool().inCooldown("w")).toBe(true);
  });

  it("마스터로 풀에서 빠진 단어는 쿨다운에 없다", () => {
    saveWord("keep"); // 쿨다운 비교용
    recordSession([{ id: "w", count: 1 }], []); // 2.3
    recordSession([], ["w"]); // 2.55
    recordSession([], ["w"]); // 2.8
    recordSession([], ["w", "keep"]); // w 마스터 탈출, keep 은 잔류
    const pool = getReviewPool();
    expect(pool.inCooldown("w")).toBe(false);
    expect(pool.inCooldown("keep")).toBe(true);
  });

  it("다음 세션 기록에서 쿨다운은 새로 계산된다", () => {
    recordSession([{ id: "w", count: 1 }], []);
    recordSession([], ["w"]);
    expect(getReviewPool().inCooldown("w")).toBe(true);
    recordSession([{ id: "other", count: 1 }], []); // 통과자 없음
    expect(getReviewPool().inCooldown("w")).toBe(false);
  });
});

describe("appearanceWeight", () => {
  it("ease 가 낮을수록 가중치가 크다 (단조 감소)", () => {
    expect(appearanceWeight(EASE_MIN)).toBeGreaterThan(appearanceWeight(2.0));
    expect(appearanceWeight(2.0)).toBeGreaterThan(appearanceWeight(EASE_INIT));
    expect(appearanceWeight(EASE_INIT)).toBeGreaterThan(
      appearanceWeight(EASE_MASTER),
    );
  });

  it("(3.2 − ease)² 값과 일치한다", () => {
    expect(appearanceWeight(EASE_MIN)).toBeCloseTo(3.61);
    expect(appearanceWeight(EASE_INIT)).toBeCloseTo(0.49);
    expect(appearanceWeight(EASE_MASTER)).toBeCloseTo(0.04);
  });

  it("졸업 직전 단어도 0 이 아닌 가중치를 가진다", () => {
    expect(appearanceWeight(EASE_MASTER)).toBeGreaterThan(0);
  });
});
