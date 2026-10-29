// Original, lightweight arcade music. No audio downloads or third-party tracks.
export class GameAudio {
  enabled = true;
  musicPlaying = false;
  context = null;
  timer = null;
  notes = new Set();
  step = 0;
  nextBeat = 0;

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio();
        this.music = this.context.createGain();
        this.music.gain.value = .18;
        this.music.connect(this.context.destination);
        this.effects = this.context.createGain();
        this.effects.gain.value = .4;
        this.effects.connect(this.context.destination);
      }
      this.context.resume().then(() => this.syncMusic()).catch(() => {});
    } catch { /* Audio support is optional; gameplay stays available. */ }
  }

  tone(frequency, duration, when, volume, type, bus, music = false) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.enabled) return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    oscillator.connect(gain).connect(bus);
    const note = {oscillator, gain, music};
    this.notes.add(note);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.notes.delete(note); };
    oscillator.start(when);
    oscillator.stop(when + duration + .01);
  }

  effect(frequency = 440, duration = .06) {
    if (this.context) this.tone(frequency, duration, this.context.currentTime, .12, 'sine', this.effects);
  }

  setPlaying(value) {
    this.musicPlaying = value;
    this.syncMusic();
  }

  setEnabled(value) {
    this.enabled = value;
    if (value) this.unlock();
    this.syncMusic();
    if (!value) this.stopNotes(false);
  }

  stopNotes(musicOnly) {
    for (const note of this.notes) {
      if (musicOnly && !note.music) continue;
      note.gain.gain.cancelScheduledValues(this.context.currentTime);
      note.gain.gain.setValueAtTime(0, this.context.currentTime);
      try { note.oscillator.stop(); } catch {}
      this.notes.delete(note);
    }
  }

  syncMusic() {
    const active = this.enabled && this.musicPlaying && this.context?.state === 'running';
    if (!active) {
      clearInterval(this.timer);
      this.timer = null;
      if (this.context) this.stopNotes(true);
      return;
    }
    if (this.timer) return;
    this.nextBeat = this.context.currentTime + .04;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 60);
  }

  schedule() {
    if (!this.context || this.context.state !== 'running') return;
    // A four-bar pentatonic melody over C / Am / F / G, at 112 BPM.
    const melody = [72,76,79,76,74,72,67,0,69,72,76,79,76,72,69,0,
                    77,79,81,79,77,76,72,0,74,79,76,74,72,67,72,0];
    const bass = [48,45,41,43];
    if (this.nextBeat < this.context.currentTime) this.nextBeat = this.context.currentTime + .02;
    while (this.nextBeat < this.context.currentTime + .12) {
      const pitch = melody[this.step % melody.length];
      const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
      if (pitch) this.tone(frequency(pitch), .21, this.nextBeat, .12, 'triangle', this.music, true);
      if (this.step % 2 === 0) this.tone(frequency(bass[Math.floor(this.step / 8) % 4]), .32, this.nextBeat, .16, 'sine', this.music, true);
      this.step++;
      this.nextBeat += 60 / 112 / 2;
    }
  }
}
