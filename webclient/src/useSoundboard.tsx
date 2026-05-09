import { useRef, useCallback } from "react";

/**
 * useSoundboard — synthesizes button SFX via Web Audio API.
 * No extra audio files needed; sounds are generated on the fly.
 *
 * Exported helpers:
 *   playClick()   — soft UI click (most buttons)
 *   playConfirm() — heavier confirm / start / open action
 *   playBack()    — lighter "cancel / close" click
 *   playError()   — short low-frequency bump for disabled/errors
 */

export function useSoundboard(sfxVolume: number) {
  // sfxVolume: 0–100

  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const gain = sfxVolume / 100;

  /** Internal: play a synthesised tone */
  const playTone = useCallback(
    (opts: {
      freq: number;
      endFreq?: number;
      duration: number;
      type?: OscillatorType;
      gainPeak?: number;
    }) => {
      if (gain <= 0) return;
      try {
        const ctx = getCtx();
        const { freq, endFreq = freq, duration, type = "sine", gainPeak = 0.25 } = opts;

        const osc = ctx.createOscillator();
        const vol = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);

        // Quick attack → fast decay (percussive click feel)
        vol.gain.setValueAtTime(0, ctx.currentTime);
        vol.gain.linearRampToValueAtTime(gainPeak * gain, ctx.currentTime + 0.005);
        vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

        osc.connect(vol);
        vol.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.01);
      } catch {
        // AudioContext unavailable — silent fail
      }
    },
    [gain, getCtx]
  );

  /** Soft UI click — use on most buttons */
  const playClick = useCallback(() => {
    playTone({ freq: 800, endFreq: 600, duration: 0.08, type: "sine", gainPeak: 0.2 });
  }, [playTone]);

  /** Heavier confirm — use on Start / Open / Send important actions */
  const playConfirm = useCallback(() => {
    playTone({ freq: 520, endFreq: 780, duration: 0.12, type: "triangle", gainPeak: 0.3 });
    // Add a harmonic layer slightly delayed for richness
    setTimeout(() => {
      playTone({ freq: 780, endFreq: 1040, duration: 0.1, type: "sine", gainPeak: 0.15 });
    }, 30);
  }, [playTone]);

  /** Back / close / cancel — lighter descending click */
  const playBack = useCallback(() => {
    playTone({ freq: 600, endFreq: 400, duration: 0.07, type: "sine", gainPeak: 0.18 });
  }, [playTone]);

  /** Error / disabled bump */
  const playError = useCallback(() => {
    playTone({ freq: 180, endFreq: 140, duration: 0.15, type: "sawtooth", gainPeak: 0.12 });
  }, [playTone]);

  return { playClick, playConfirm, playBack, playError };
}
