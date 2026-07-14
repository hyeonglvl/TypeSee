import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EASE_INIT,
  EASE_MASTER,
  EASE_MIN,
  TIME_WEIGHT_MAX,
  TIME_WEIGHT_SATURATION_DAYS,
  appearanceWeight,
  clearAll,
  clearHistoryAll,
  easeProgress,
  getReviewPool,
  recordSession,
  saveWord,
  sessionWeight,
  timeWeight,
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

  it("EASE_MASTER 에 도달하면 활성 풀에서 빠지고 유지 점검 대상이 된다", () => {
    recordSession([{ id: "w", count: 1 }], []); // 2.3
    recordSession([], ["w"]); // 2.55
    recordSession([], ["w"]); // 2.8
    expect(getReviewPool().ids.has("w")).toBe(true);
    recordSession([], ["w"]); // 3.05 ≥ 3.0 → 마스터
    const pool = getReviewPool();
    expect(pool.ids.has("w")).toBe(false);
    expect(pool.retainedIds.has("w")).toBe(true);
    expect(pool.masteredAtOf("w")).not.toBeNull();
    expect(pool.wrongCountOf("w")).toBe(0); // 배지 없는 블라인드 점검용
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

describe("TS-1 — 마스터 유지 점검", () => {
  const DAY = 86_400_000;
  const t0 = Date.parse("2026-07-14T00:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    // w 를 마스터 상태로 만든다
    recordSession([{ id: "w", count: 1 }], []); // 2.3
    recordSession([], ["w"]); // 2.55
    recordSession([], ["w"]); // 2.8
    recordSession([], ["w"]); // 마스터
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("유지 점검 통과: 마스터 유지, masteredAt·lastSeenAt 갱신", () => {
    vi.setSystemTime(t0 + 5 * DAY);
    recordSession([], ["w"]);
    const pool = getReviewPool();
    expect(pool.retainedIds.has("w")).toBe(true);
    expect(pool.masteredAtOf("w")).toBe(t0 + 5 * DAY);
    expect(pool.lastSeenAtOf("w")).toBe(t0 + 5 * DAY);
  });

  it("유지 점검 실패: EASE_INIT 기준으로 강등되어 활성 풀에 복귀", () => {
    vi.setSystemTime(t0 + 5 * DAY);
    recordSession([{ id: "w", count: 1 }], []);
    const pool = getReviewPool();
    expect(pool.masteredAtOf("w")).toBeNull();
    expect(pool.ids.has("w")).toBe(true);
    expect(pool.retainedIds.has("w")).toBe(false);
    expect(pool.easeOf("w")).toBeCloseTo(EASE_INIT - 0.2); // 3.0 기준이 아니다
    expect(pool.wrongCountOf("w")).toBe(1);
  });

  it("유지 점검 통과 직후에는 쿨다운에 들어간다", () => {
    vi.setSystemTime(t0 + 5 * DAY);
    recordSession([], ["w"]);
    expect(getReviewPool().inCooldown("w")).toBe(true);
  });

  it("유지 단어를 저장하면 활성 북마크로 복귀하고 ease 가 리셋된다", () => {
    saveWord("w");
    const pool = getReviewPool();
    expect(pool.masteredAtOf("w")).toBeNull();
    expect(pool.ids.has("w")).toBe(true);
    expect(pool.isSaved("w")).toBe(true);
    expect(pool.easeOf("w")).toBe(EASE_INIT);
  });
});

describe("TS-1 — 쿨다운", () => {
  it("정타 통과 후 풀에 남은 단어는 쿨다운에 들어간다", () => {
    recordSession([{ id: "w", count: 1 }], []);
    recordSession([], ["w"]);
    expect(getReviewPool().inCooldown("w")).toBe(true);
  });

  it("마스터 직후에도 쿨다운에 들어간다 (유지 점검으로 곧바로 재출현하지 않게)", () => {
    saveWord("keep"); // 쿨다운 비교용
    recordSession([{ id: "w", count: 1 }], []); // 2.3
    recordSession([], ["w"]); // 2.55
    recordSession([], ["w"]); // 2.8
    recordSession([], ["w", "keep"]); // w 마스터(유지 상태로 잔류), keep 은 잔류
    const pool = getReviewPool();
    expect(pool.inCooldown("w")).toBe(true);
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

describe("easeProgress — 익힘 단계", () => {
  it("경계값: 최저 1, 초기 3, 마스터 5", () => {
    expect(easeProgress(EASE_MIN)).toBe(1);
    expect(easeProgress(EASE_INIT)).toBe(3);
    expect(easeProgress(EASE_MASTER)).toBe(5);
  });

  it("ease 를 따라 단조 증가한다", () => {
    let prev = 0;
    for (let ease = EASE_MIN; ease <= EASE_MASTER; ease += 0.05) {
      const step = easeProgress(ease);
      expect(step).toBeGreaterThanOrEqual(prev);
      prev = step;
    }
  });

  it("범위 밖 값도 1~5 로 클램프된다", () => {
    expect(easeProgress(0)).toBe(1);
    expect(easeProgress(4)).toBe(5);
  });
});

describe("TS-1 — 시간 가중치", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-07-14T00:00:00Z");

  it("방금 본 단어와 미상(null)은 중립(1)이다", () => {
    expect(timeWeight(now, now)).toBe(1);
    expect(timeWeight(null, now)).toBe(1);
  });

  it("오래 안 볼수록 단조 증가한다", () => {
    const d1 = timeWeight(now - 1 * DAY, now);
    const d3 = timeWeight(now - 3 * DAY, now);
    const d7 = timeWeight(now - 7 * DAY, now);
    expect(d1).toBeGreaterThan(1);
    expect(d3).toBeGreaterThan(d1);
    expect(d7).toBeGreaterThan(d3);
  });

  it("포화 일수 이후에는 TIME_WEIGHT_MAX 로 고정된다", () => {
    const sat = timeWeight(now - TIME_WEIGHT_SATURATION_DAYS * DAY, now);
    expect(sat).toBe(TIME_WEIGHT_MAX);
    expect(timeWeight(now - 30 * DAY, now)).toBe(TIME_WEIGHT_MAX);
  });

  it("미래 시각(시계 역행)에도 1 밑으로 내려가지 않는다", () => {
    expect(timeWeight(now + DAY, now)).toBe(1);
  });

  it("일주일 묵은 마스터 직전 단어가 방금 틀린 약한 단어를 넘어설 수 없다", () => {
    const staleStrong = sessionWeight(EASE_MASTER, now - 30 * DAY, now);
    const freshWeak = sessionWeight(EASE_MIN, now, now);
    expect(freshWeak).toBeGreaterThan(staleStrong);
  });

  describe("lastSeenAt 스탬프", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("오답·정타 통과·저장 모두 lastSeenAt 을 찍는다", () => {
      recordSession([{ id: "w", count: 1 }], []);
      expect(getReviewPool().lastSeenAtOf("w")).toBe(now);

      vi.setSystemTime(now + DAY);
      recordSession([], ["w"]);
      expect(getReviewPool().lastSeenAtOf("w")).toBe(now + DAY);

      saveWord("s");
      expect(getReviewPool().lastSeenAtOf("s")).toBe(now + DAY);
    });

    it("풀에 없는 단어는 null 이다", () => {
      expect(getReviewPool().lastSeenAtOf("ghost")).toBeNull();
    });
  });
});
