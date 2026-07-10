/**
 * Real-time driver alert system using browser Web Audio API and device haptic vibration.
 */
export class AlarmSystem {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private isRunning = false;
  private vibrationInterval: any = null;

  init() {
    if (!this.ctx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
      } catch (err) {
        console.error("Web Audio API not supported:", err);
      }
    }
  }

  start(volume: number = 0.6) {
    this.init();
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }

        const ctx = this.ctx;
        this.gainNode = ctx.createGain();
        this.gainNode.gain.setValueAtTime(volume, ctx.currentTime);

        // Siren Pitch Oscillators
        this.osc1 = ctx.createOscillator();
        this.osc1.type = 'sawtooth';
        this.osc1.frequency.setValueAtTime(800, ctx.currentTime);

        this.osc2 = ctx.createOscillator();
        this.osc2.type = 'sine';
        this.osc2.frequency.setValueAtTime(810, ctx.currentTime);

        // Siren pitch modulation (LFO)
        this.lfo = ctx.createOscillator();
        this.lfo.frequency.setValueAtTime(5, ctx.currentTime); // 5 Hz wobble

        this.lfoGain = ctx.createGain();
        this.lfoGain.gain.setValueAtTime(120, ctx.currentTime); // wobbles 120Hz up and down

        // Connections
        this.lfo.connect(this.lfoGain);
        this.lfoGain.connect(this.osc1.frequency);
        this.lfoGain.connect(this.osc2.frequency);

        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);
        this.gainNode.connect(ctx.destination);

        // Start oscillators
        this.lfo.start();
        this.osc1.start();
        this.osc2.start();
      }
    } catch (err) {
      console.error("Could not start audio alarm:", err);
    }

    // Run haptic vibration if supported
    if (navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 200]);
      this.vibrationInterval = setInterval(() => {
        if (navigator.vibrate) {
          navigator.vibrate([400, 200, 400, 200]);
        }
      }, 1000);
    }
  }

  setVolume(volume: number) {
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
    }
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    // Stop sound
    try {
      if (this.osc1) {
        this.osc1.stop();
        this.osc1.disconnect();
        this.osc1 = null;
      }
      if (this.osc2) {
        this.osc2.stop();
        this.osc2.disconnect();
        this.osc2 = null;
      }
      if (this.lfo) {
        this.lfo.stop();
        this.lfo.disconnect();
        this.lfo = null;
      }
      if (this.lfoGain) {
        this.lfoGain.disconnect();
        this.lfoGain = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
    } catch (err) {
      console.error("Error stopping audio alarm:", err);
    }

    // Stop vibration
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0); // clear vibration
    }
  }
}
