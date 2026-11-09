"use client";

/**
 * High-performance Web Audio API sound synthesizer for the Quiz Big Screen.
 * Generates crisp, realistic game-show sound effects directly in the browser
 * with 0 external network requests or asset loading delays.
 */

class QuizSoundEffects {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("unibyte_quiz_sound_muted");
      this.muted = saved === "true";
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("unibyte_quiz_sound_muted", String(muted));
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public ensureUnlocked() {
    this.getContext();
  }

  /**
   * Play an urgent countdown tick when timer is running out (e.g. 5, 4, 3, 2, 1).
   * Frequency increases as remaining seconds tick down.
   */
  public playCountdownTick(secondsLeft: number) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch escalates from 650Hz up to 1100Hz as time runs down
      const clamped = Math.max(1, Math.min(5, secondsLeft));
      const freq = 650 + (5 - clamped) * 110;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      // Sharp percussive woodblock/tick envelope
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // AudioContext policy catch
    }
  }

  /**
   * Play a bright, triumphant reveal chime when results/answer appear on screen.
   * Synthesizes a clean game-show harmonic major triad (C5 - E5 - G5 - C6).
   */
  public playRevealChime() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.4, now);
      master.connect(ctx.destination);

      const notes = [
        { f: 523.25, delay: 0, decay: 0.9 }, // C5
        { f: 659.25, delay: 0.03, decay: 1.0 }, // E5
        { f: 783.99, delay: 0.06, decay: 1.1 }, // G5
        { f: 1046.5, delay: 0.09, decay: 1.3 }, // C6
      ];

      for (const note of notes) {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(note.f, now + note.delay);

        noteGain.gain.setValueAtTime(0.0001, now + note.delay);
        noteGain.gain.linearRampToValueAtTime(0.25, now + note.delay + 0.015);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.decay);

        osc.connect(noteGain);
        noteGain.connect(master);

        osc.start(now + note.delay);
        osc.stop(now + note.delay + note.decay + 0.05);
      }
    } catch {
      // AudioContext policy catch
    }
  }

  /**
   * Play celebration fanfare at the end of a round.
   */
  public playRoundEndFanfare() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const chords = [
        { f1: 440, f2: 554.37, f3: 659.25, time: 0, dur: 0.25 }, // A maj
        { f1: 523.25, f2: 659.25, f3: 783.99, time: 0.28, dur: 0.7 }, // C maj
      ];

      for (const chord of chords) {
        const chordGain = ctx.createGain();
        chordGain.gain.setValueAtTime(0.001, now + chord.time);
        chordGain.gain.linearRampToValueAtTime(0.3, now + chord.time + 0.02);
        chordGain.gain.exponentialRampToValueAtTime(0.001, now + chord.time + chord.dur);
        chordGain.connect(ctx.destination);

        [chord.f1, chord.f2, chord.f3].forEach((freq) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + chord.time);
          osc.connect(chordGain);
          osc.start(now + chord.time);
          osc.stop(now + chord.time + chord.dur + 0.05);
        });
      }
    } catch {
      // AudioContext policy catch
    }
  }
}

export const soundEffects = new QuizSoundEffects();
