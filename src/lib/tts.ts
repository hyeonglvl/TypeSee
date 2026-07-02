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

export function speak(word: string) {
  if (!soundOn || typeof window === "undefined" || !window.speechSynthesis)
    return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}
