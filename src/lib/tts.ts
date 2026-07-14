import { useSyncExternalStore } from "react";

/** Word pronunciation via the Web Speech API + a session-wide on/off pref. */

let soundOn = true;
const listeners = new Set<() => void>();

export function useSoundPref(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => soundOn,
    () => true, // SSR 기본값
  );
}

export function toggleSound() {
  soundOn = !soundOn;
  if (!soundOn) window.speechSynthesis?.cancel();
  listeners.forEach((fn) => fn());
}

/** 리스닝 세션은 소리가 꺼져 있으면 성립하지 않는다 — 시작 시 강제로 켠다.
 *  이후 토글로 끄는 것은 유저의 명시적 선택으로 존중한다. */
export function ensureSoundOn() {
  if (soundOn) return;
  soundOn = true;
  listeners.forEach((fn) => fn());
}

let speakTimer: ReturnType<typeof setTimeout> | undefined;
// Chrome이 발화 도중 utterance 를 GC 하면 소리가 중간에 끊기는 오래된
// 버그가 있다 — 모듈 참조로 붙들어 둔다.
let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(word: string) {
  if (!soundOn || typeof window === "undefined" || !window.speechSynthesis)
    return;
  // cancel() 직후 같은 태스크에서 speak() 하면 (StrictMode 이중 이펙트처럼
  // 연달아 두 번 불리면) macOS Chrome 이 speaking=true 인 채 소리 없이
  // 멎는다. cancel 과 speak 사이를 한 박자 띄우고, 연속 호출은 마지막
  // 것만 살린다.
  window.speechSynthesis.cancel();
  // paused 로 굳어 있으면 (Chrome wedge 잔재) 이후 발화가 전부 큐에서
  // 잠든다 — 발화 전에 항상 깨운다. paused 가 아니면 no-op.
  window.speechSynthesis.resume();
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => {
    if (!soundOn) return; // 대기 중 토글로 꺼졌으면 발화하지 않는다
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    currentUtterance = utterance;
    utterance.onend = utterance.onerror = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };
    window.speechSynthesis.speak(utterance);
  }, 60);
}
