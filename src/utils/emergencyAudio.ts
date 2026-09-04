/**
 * Web Audio API synthesizer for spacecraft telemetry emergency alert sound effects.
 * Requires zero external audio file dependencies.
 */

class EmergencyAudioManager {
  private ctx: AudioContext | null = null;
  private intervalId: number | null = null;
  private isMuted: boolean = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Safe catch if browser requires user gesture
      });
    }

    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Play a single tone beep with smooth exponential decay.
   */
  public playTone(freq = 950, duration = 0.08, gainLevel = 0.18, type: OscillatorType = 'sine') {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(gainLevel, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('[EmergencyAudio] Tone playback error:', e);
    }
  }

  /**
   * Play a high-contrast double beep (standard spacecraft telemetry / avionics breach alarm).
   */
  public playDoubleBeep() {
    if (this.isMuted) return;
    this.playTone(920, 0.07, 0.2, 'square');
    setTimeout(() => {
      if (!this.isMuted) {
        this.playTone(1180, 0.09, 0.22, 'square');
      }
    }, 110);
  }

  /**
   * Play activation sound when fault intersection simulation starts.
   */
  public playStartAlarm() {
    if (this.isMuted) return;
    this.playTone(650, 0.08, 0.18, 'sine');
    setTimeout(() => {
      this.playTone(850, 0.08, 0.2, 'sine');
      setTimeout(() => {
        this.playTone(1100, 0.14, 0.25, 'triangle');
      }, 90);
    }, 90);
  }

  /**
   * Start a continuous alarm loop (plays double beep every 1000ms).
   */
  public startAlarmLoop() {
    this.stopAlarmLoop();
    this.playStartAlarm();

    // Start repeating double beep every second
    this.intervalId = window.setInterval(() => {
      this.playDoubleBeep();
    }, 1000);
  }

  /**
   * Stop the continuous alarm loop.
   */
  public stopAlarmLoop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Play completion alert chime when countdown timer reaches zero.
   */
  public playExpiredChime() {
    if (this.isMuted) return;
    this.stopAlarmLoop();
    this.playTone(1200, 0.15, 0.25, 'square');
    setTimeout(() => this.playTone(900, 0.15, 0.25, 'square'), 180);
    setTimeout(() => this.playTone(600, 0.3, 0.25, 'sine'), 360);
  }
}

export const emergencyAudio = new EmergencyAudioManager();
