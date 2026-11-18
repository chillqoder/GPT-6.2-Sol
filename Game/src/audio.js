const MOTIFS = [
  { gap: .74, notes: [42, 0, 54, 0, 49, 0, 57, 0, 45, 0, 52, 0, 49, 57, 0, 0], bass: [30, 33], shape: 'sine' },
  { gap: .59, notes: [62, 0, 69, 64, 0, 74, 0, 69, 57, 62, 0, 67, 74, 0, 76, 0], bass: [38, 33], shape: 'sine' },
  { gap: .64, notes: [45, 0, 0, 52, 0, 55, 0, 0, 43, 0, 47, 0, 55, 0, 59, 0], bass: [29, 31], shape: 'triangle' },
  { gap: .49, notes: [57, 60, 0, 64, 0, 67, 64, 0, 55, 59, 0, 62, 0, 69, 67, 0], bass: [33, 36], shape: 'sine' },
];
const pitch = midi => 440 * 2 ** ((midi - 69) / 12);

const EFFECTS = {
  jump: [210, 360, .12, 'triangle', .09], wallJump: [190, 435, .14, 'triangle', .10],
  slide: [325, 180, .095, 'sawtooth', .034], dash: [144, 480, .19, 'triangle', .14],
  pulse: [160, 74, .34, 'sine', .18], empty: [175, 126, .095, 'sine', .07],
  shield: [580, 245, .32, 'triangle', .13], damage: [99, 49, .23, 'sawtooth', .12],
  cell: [260, 166, .11, 'triangle', .095], socket: [133, 340, .36, 'sine', .13],
  station: [220, 440, .39, 'sine', .13], relay: [196, 294, .64, 'sine', .22],
  archive: [440, 880, .41, 'sine', .10], cache: [344, 540, .23, 'triangle', .098],
  skitterWarn: [295, 355, .23, 'triangle', .085], lunge: [200, 101, .17, 'sawtooth', .081],
  droneWarn: [392, 440, .64, 'sine', .10], bolt: [565, 289, .15, 'triangle', .10],
  beamWarn: [147, 174, .71, 'triangle', .09], beam: [118, 94, .88, 'sawtooth', .10],
  ventWarn: [188, 263, .31, 'triangle', .065], vent: [78, 122, .50, 'sawtooth', .055],
  stun: [473, 312, .19, 'triangle', .11], disable: [227, 74, .34, 'triangle', .12],
  deflect: [696, 530, .18, 'triangle', .09], seam: [555, 206, .21, 'triangle', .13],
  shutdown: [149, 41, .44, 'triangle', .14], reboot: [125, 283, .39, 'sine', .11],
  lift: [74, 93, 1.35, 'triangle', .095], arrival: [330, 392, 1.00, 'sine', .12],
};
const chords = {
  pulse: [338, 584], shield: [719, 975], relay: [294, 392, 490], archive: [554, 659],
  station: [330, 494], reboot: [331], arrival: [440, 523, 659], lift: [146.8, 220],
};

export class ExpeditionAudio {
  constructor(muted) {
    this.muted = muted;
    this.voices = new Set();
    this.track = -1;
    this.index = 0;
    this.next = 0;
    this.musicEnabled = false;
  }

  unlock() {
    if (!this.context && !this.failed) {
      try {
        const Audio = window.AudioContext ?? window.webkitAudioContext;
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : .24;
        this.master.connect(this.context.destination);
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        this.music.gain.value = .57;
        this.effects.gain.value = .79;
        this.music.connect(this.master);
        this.effects.connect(this.master);
      } catch { this.failed = true; }
    }
    if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
  }

  mute(value) {
    this.muted = value;
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : .24, this.context.currentTime, .013);
    if (value) this.cancel();
  }

  cancel() {
    for (const voice of this.voices) {
      try { voice.source.stop(); } catch { /* The scheduled node already ended. */ }
    }
    this.next = 0;
    this.musicEnabled = false;
  }

  note(bus, frequency, end, duration, shape, volume, when, attack = .012, filter = 1250) {
    if (!this.context || this.voices.size >= 46 || !frequency || this.muted) return;
    const context = this.context;
    const start = Math.max(context.currentTime, when);
    const source = context.createOscillator();
    const envelope = context.createGain();
    const lowpass = context.createBiquadFilter();
    const voice = { source };
    this.voices.add(voice);
    source.type = shape;
    source.frequency.value = frequency;
    source.frequency.exponentialRampToValueAtTime(Math.max(15, end), start + duration * .89);
    lowpass.type = 'lowpass';
    lowpass.frequency.value = filter;
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), start + Math.min(attack, duration * .38));
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(lowpass);
    lowpass.connect(envelope);
    envelope.connect(bus);
    source.onended = () => {
      source.disconnect();
      lowpass.disconnect();
      envelope.disconnect();
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(start + duration + .01);
  }

  tick(state, region, events, hidden) {
    if (!this.context || this.context.state !== 'running') return;
    const blocked = hidden || this.muted || state === 'paused' || state === 'title';
    if (blocked) {
      if (this.musicEnabled || this.voices.size) this.cancel();
      return;
    }
    const now = this.context.currentTime;
    for (const event of events) {
      if (event.name === 'step' || event.name === 'land') {
        const metal = event.surface === 'metal';
        const landing = event.name === 'land';
        this.note(this.effects, metal ? 204 : 100, metal ? 82 : 47, landing ? .15 : .075, 'triangle', landing ? .1 : .048, now, .008);
        continue;
      }
      const sound = EFFECTS[event.name];
      if (!sound) continue;
      this.note(this.effects, ...sound, now);
      chords[event.name]?.forEach((frequency, index) => {
        const duration = .29 + index * .19 + (event.name === 'arrival' ? .31 : 0);
        this.note(this.effects, frequency, frequency * .999, duration, 'sine', .07, now + .045 + index * .11, .039);
      });
    }
    const musicEnabled = ['play', 'relayActivation', 'liftSequence'].includes(state);
    if (!musicEnabled) {
      this.musicEnabled = false;
      return;
    }
    const track = state === 'liftSequence' ? 3 : region;
    if (track !== this.track || !this.musicEnabled || this.next < now - .1) {
      this.track = track;
      this.index = 0;
      this.next = now + .06;
    }
    this.musicEnabled = true;
    const motif = MOTIFS[track];
    while (this.next < now + .12) {
      const i = this.index++ % motif.notes.length;
      const midi = motif.notes[i];
      if (i % 8 === 0) {
        const low = pitch(motif.bass[i === 0 ? 0 : 1]);
        this.note(this.music, low, low * .998, Math.min(3.5, motif.gap * 6), 'triangle', .14, this.next, .41, 312);
      }
      if (midi) {
        const tone = pitch(midi);
        this.note(this.music, tone, tone * 1.003, motif.gap * 1.6, motif.shape, .085, this.next, .08, 850 + track * 110);
        if (i % 4 === 0) this.note(this.music, tone * 1.5, tone * 1.5, motif.gap * 2.1, 'sine', .035, this.next + .075, .11);
      }
      if (track !== 1 && i % 4 === 0) this.note(this.music, 82, 41, .22, 'sine', .13, this.next, .019);
      this.next += motif.gap;
    }
  }

  inspect() {
    return { context: this.context?.state ?? 'idle', muted: this.muted, voices: this.voices.size, track: this.track };
  }
}
