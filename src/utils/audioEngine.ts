import {
  BolStep,
  HarmoniumTimbreId,
  midiToFrequency,
} from './musicTheory';

export interface ReedStopsConfig {
  bassReed: boolean; // 16' sub-octave reed
  maleReed: boolean; // 8' fundamental reed
  femaleReed: boolean; // 8' detuned celeste/shimmer reed
  coupler: boolean; // +12 semitone upper octave coupler
  sarangiResonance: number; // 0..1 sympathetic Sarangi overtone blend
  reverbMix: number; // 0..1 room ambience
}

interface ActiveVoice {
  midi: number;
  oscillators: OscillatorNode[];
  voiceGain: GainNode;
  filterNode: BiquadFilterNode;
  lfo?: OscillatorNode;
}

class HarmoniumAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bellowsGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private reverbGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;

  private activeVoices: Map<number, ActiveVoice> = new Map();

  // Current synthesis parameters
  private masterVolume = 0.82;
  private bellowsPressure = 0.88; // 0.0 to 1.0
  private rootPitchClass = 0; // C = 0
  private a4ReferenceHz = 440;
  private useJustIntonation = true;
  private timbre: HarmoniumTimbreId = 'sarangi-ensemble';
  private stops: ReedStopsConfig = {
    bassReed: true,
    maleReed: true,
    femaleReed: true,
    coupler: false,
    sarangiResonance: 0.45,
    reverbMix: 0.25,
  };

  // Tanpura Drone state
  private tanpuraEnabled = false;
  private tanpuraFirstString: 'Pa' | 'Ma' | 'Ni' = 'Pa';
  private tanpuraVolume = 0.35;
  private tanpuraTimer: number | null = null;
  private tanpuraStepIndex = 0;

  // Rhythm (Madal / Tabla) state
  private rhythmVolume = 0.65;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;

      this.bellowsGain = this.ctx.createGain();
      this.bellowsGain.gain.value = this.bellowsPressure;

      this.dryGain = this.ctx.createGain();
      this.reverbGain = this.ctx.createGain();
      this.convolver = this. createWoodHallImpulse(this.ctx);

      this.dryGain.gain.value = 1 - this.stops.reverbMix * 0.4;
      this.reverbGain.gain.value = this.stops.reverbMix;

      // Routing: voices -> bellowsGain -> [dryGain, convolver -> reverbGain] -> masterGain -> destination
      this.bellowsGain.connect(this.dryGain);
      this.bellowsGain.connect(this.convolver);
      this.convolver.connect(this.reverbGain);

      this.dryGain.connect(this.masterGain);
      this.reverbGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private createWoodHallImpulse(ctx: AudioContext): ConvolverNode {
    const convolver = ctx.createConvolver();
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * 1.4); // 1.4s warm wooden hall decay
    const impulse = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const channelData = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (sampleRate * 0.35));
        channelData[i] = (Math.random() * 2 - 1) * decay * 0.5;
      }
    }
    convolver.buffer = impulse;
    return convolver;
  }

  public setMasterVolume(val: number) {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.015);
    }
  }

  public setBellowsPressure(pressure: number) {
    this.bellowsPressure = Math.max(0.05, Math.min(1, pressure));
    if (this.ctx && this.bellowsGain) {
      this.bellowsGain.gain.setTargetAtTime(this.bellowsPressure, this.ctx.currentTime, 0.025);
    }
    // Also modulate filter cutoff slightly with bellows pressure for realistic reed expression
    if (this.ctx) {
      const now = this.ctx.currentTime;
      const cutoff = 1100 + this.bellowsPressure * 2400;
      this.activeVoices.forEach((voice) => {
        voice.filterNode.frequency.setTargetAtTime(cutoff, now, 0.03);
      });
    }
  }

  public setRootPitch(pitchClass: number) {
    this.rootPitchClass = ((pitchClass % 12) + 12) % 12;
  }

  public setReferenceHz(hz: number) {
    this.a4ReferenceHz = hz;
  }

  public setJustIntonation(enabled: boolean) {
    this.useJustIntonation = enabled;
  }

  public setTimbre(timbre: HarmoniumTimbreId) {
    this.timbre = timbre;
    if (timbre === 'sarangi-ensemble') {
      this.stops.sarangiResonance = 0.55;
    } else if (timbre === 'pahadi-folk') {
      this.stops.sarangiResonance = 0.25;
    } else {
      this.stops.sarangiResonance = 0.08;
    }
  }

  public updateStops(partial: Partial<ReedStopsConfig>) {
    this.stops = { ...this.stops, ...partial };
    if (this.ctx && this.dryGain && this.reverbGain) {
      this.dryGain.gain.setTargetAtTime(1 - this.stops.reverbMix * 0.4, this.ctx.currentTime, 0.02);
      this.reverbGain.gain.setTargetAtTime(this.stops.reverbMix, this.ctx.currentTime, 0.02);
    }
  }

  public getStops(): ReedStopsConfig {
    return { ...this.stops };
  }

  /**
   * Starts playing a harmonium note with ultra-low latency.
   */
  public noteOn(midi: number): void {
    const ctx = this.ensureContext();
    if (this.activeVoices.has(midi)) {
      return;
    }

    const now = ctx.currentTime;
    const baseFreq = midiToFrequency(midi, this.a4ReferenceHz, this.rootPitchClass, this.useJustIntonation);

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    // Fast reed response (~12ms attack)
    voiceGain.gain.exponentialRampToValueAtTime(0.26, now + 0.014);

    // Warm wooden acoustic chamber lowpass filter
    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    const baseCutoff =
      this.timbre === 'classic-reed'
        ? 2400
        : this.timbre === 'sarangi-ensemble'
          ? 3100
          : 2800;
    filterNode.frequency.setValueAtTime(baseCutoff * (0.65 + 0.35 * this.bellowsPressure), now);
    filterNode.Q.setValueAtTime(this.timbre === 'sarangi-ensemble' ? 2.1 : 1.2, now);

    // Subtle wooden box body formant peak around 620Hz (suits Nepali Sarangi & Madal warmth)
    const bodyFormant = ctx.createBiquadFilter();
    bodyFormant.type = 'peaking';
    bodyFormant.frequency.setValueAtTime(640, now);
    bodyFormant.Q.setValueAtTime(1.5, now);
    bodyFormant.gain.setValueAtTime(4.5 + this.stops.sarangiResonance * 4, now);

    filterNode.connect(bodyFormant);
    bodyFormant.connect(voiceGain);
    voiceGain.connect(this.bellowsGain!);

    const oscillators: OscillatorNode[] = [];

    // 1. Male Reed (8' fundamental)
    if (this.stops.maleReed || (!this.stops.bassReed && !this.stops.femaleReed)) {
      const oscMale = ctx.createOscillator();
      oscMale.type = 'sawtooth';
      oscMale.frequency.setValueAtTime(baseFreq, now);
      const maleGain = ctx.createGain();
      maleGain.gain.setValueAtTime(0.55, now);
      oscMale.connect(maleGain);
      maleGain.connect(filterNode);
      oscMale.start(now);
      oscillators.push(oscMale);
    }

    // 2. Female Reed (8' detuned shimmer reed)
    if (this.stops.femaleReed) {
      const oscFemale = ctx.createOscillator();
      oscFemale.type = 'sawtooth';
      oscFemale.frequency.setValueAtTime(baseFreq, now);
      const detuneCents = this.timbre === 'pahadi-folk' ? 7.5 : 4.5;
      oscFemale.detune.setValueAtTime(detuneCents, now);
      const femaleGain = ctx.createGain();
      femaleGain.gain.setValueAtTime(0.42, now);
      oscFemale.connect(femaleGain);
      femaleGain.connect(filterNode);
      oscFemale.start(now);
      oscillators.push(oscFemale);
    }

    // 3. Bass Reed (16' sub-octave warm reed)
    if (this.stops.bassReed) {
      const oscBass = ctx.createOscillator();
      oscBass.type = 'triangle';
      oscBass.frequency.setValueAtTime(baseFreq * 0.5, now);
      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0.48, now);
      oscBass.connect(bassGain);
      bassGain.connect(filterNode);
      oscBass.start(now);
      oscillators.push(oscBass);
    }

    // 4. Octave Coupler (+12 semitones)
    if (this.stops.coupler) {
      const oscCoupler = ctx.createOscillator();
      oscCoupler.type = 'sawtooth';
      oscCoupler.frequency.setValueAtTime(baseFreq * 2, now);
      oscCoupler.detune.setValueAtTime(-2.5, now);
      const couplerGain = ctx.createGain();
      couplerGain.gain.setValueAtTime(0.25, now);
      oscCoupler.connect(couplerGain);
      couplerGain.connect(filterNode);
      oscCoupler.start(now);
      oscillators.push(oscCoupler);
    }

    // 5. Nepali Sarangi Sympathetic String Overtone
    let lfo: OscillatorNode | undefined;
    if (this.stops.sarangiResonance > 0.15) {
      const oscSarangi = ctx.createOscillator();
      oscSarangi.type = 'sawtooth';
      oscSarangi.frequency.setValueAtTime(baseFreq, now);
      oscSarangi.detune.setValueAtTime(-3.5, now);

      // Gentle bowed vibrato LFO (5.2 Hz)
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(5.2, now);
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.setValueAtTime(4.5 * this.stops.sarangiResonance, now);
      lfo.connect(lfoDepth);
      lfoDepth.connect(oscSarangi.detune);
      lfo.start(now);

      const sarangiBandpass = ctx.createBiquadFilter();
      sarangiBandpass.type = 'bandpass';
      sarangiBandpass.frequency.setValueAtTime(baseFreq * 2, now);
      sarangiBandpass.Q.setValueAtTime(3.2, now);

      const sarangiGain = ctx.createGain();
      sarangiGain.gain.setValueAtTime(0.32 * this.stops.sarangiResonance, now);

      oscSarangi.connect(sarangiBandpass);
      sarangiBandpass.connect(sarangiGain);
      sarangiGain.connect(voiceGain);
      oscSarangi.start(now);
      oscillators.push(oscSarangi);
    }

    this.activeVoices.set(midi, {
      midi,
      oscillators,
      voiceGain,
      filterNode,
      lfo,
    });
  }

  /**
   * Releases a playing harmonium note with natural reed damping.
   */
  public noteOff(midi: number): void {
    const voice = this.activeVoices.get(midi);
    if (!voice || !this.ctx) return;

    this.activeVoices.delete(midi);
    const now = this.ctx.currentTime;
    try {
      voice.voiceGain.gain.cancelScheduledValues(now);
      voice.voiceGain.gain.setValueAtTime(Math.max(0.0001, voice.voiceGain.gain.value), now);
      voice.voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

      setTimeout(() => {
        voice.oscillators.forEach((osc) => {
          try {
            osc.stop();
            osc.disconnect();
          } catch {
            // ignore already stopped
          }
        });
        if (voice.lfo) {
          try {
            voice.lfo.stop();
            voice.lfo.disconnect();
          } catch {
            // ignore
          }
        }
        try {
          voice.voiceGain.disconnect();
        } catch {
          // ignore
        }
      }, 100);
    } catch {
      // ignore cleanup errors
    }
  }

  public stopAllNotes(): void {
    Array.from(this.activeVoices.keys()).forEach((midi) => this.noteOff(midi));
  }

  // ============================================================================
  // TANPURA DRONE SYNTHESIZER
  // ============================================================================

  public setTanpuraConfig(config: {
    enabled?: boolean;
    firstString?: 'Pa' | 'Ma' | 'Ni';
    volume?: number;
  }) {
    if (config.firstString !== undefined) {
      this.tanpuraFirstString = config.firstString;
    }
    if (config.volume !== undefined) {
      this.tanpuraVolume = Math.max(0, Math.min(1, config.volume));
    }
    if (config.enabled !== undefined && config.enabled !== this.tanpuraEnabled) {
      this.tanpuraEnabled = config.enabled;
      if (this.tanpuraEnabled) {
        this.startTanpuraLoop();
      } else {
        this.stopTanpuraLoop();
      }
    }
  }

  private startTanpuraLoop() {
    this.ensureContext();
    this.stopTanpuraLoop();
    this.tanpuraStepIndex = 0;
    this.triggerNextTanpuraString();
    this.tanpuraTimer = window.setInterval(() => {
      if (!this.tanpuraEnabled) return;
      this.triggerNextTanpuraString();
    }, 1350);
  }

  private stopTanpuraLoop() {
    if (this.tanpuraTimer !== null) {
      clearInterval(this.tanpuraTimer);
      this.tanpuraTimer = null;
    }
  }

  private triggerNextTanpuraString() {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // 4-string cycle: [Pa/Ma/Ni (low), Sa (mid), Sa (mid), Sa (low)]
    const firstSemitone =
      this.tanpuraFirstString === 'Pa' ? 7 : this.tanpuraFirstString === 'Ma' ? 5 : 11;
    const stringMidis = [
      48 + this.rootPitchClass + firstSemitone, // String 1: Pa3 / Ma3 / Ni3
      60 + this.rootPitchClass, // String 2: Sa4
      60 + this.rootPitchClass, // String 3: Sa4
      48 + this.rootPitchClass, // String 4: Sa3 (Kharaj)
    ];

    const midi = stringMidis[this.tanpuraStepIndex % 4];
    this.tanpuraStepIndex = (this.tanpuraStepIndex + 1) % 4;

    const freq = midiToFrequency(midi, this.a4ReferenceHz, this.rootPitchClass, true);

    const pluckGain = ctx.createGain();
    const peakGain = 0.14 * this.tanpuraVolume;
    pluckGain.gain.setValueAtTime(0.0001, now);
    pluckGain.gain.linearRampToValueAtTime(peakGain, now + 0.08);
    pluckGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

    // Jivari bridge shimmer filter (sweeps upward then settles)
    const jivariFilter = ctx.createBiquadFilter();
    jivariFilter.type = 'lowpass';
    jivariFilter.frequency.setValueAtTime(freq * 2.5, now);
    jivariFilter.frequency.exponentialRampToValueAtTime(freq * 7.5, now + 0.9);
    jivariFilter.frequency.exponentialRampToValueAtTime(freq * 3.0, now + 3.2);
    jivariFilter.Q.setValueAtTime(2.4, now);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, now);
    osc2.detune.setValueAtTime(3, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.35, now);

    osc1.connect(jivariFilter);
    osc2.connect(subGain);
    subGain.connect(jivariFilter);

    jivariFilter.connect(pluckGain);
    pluckGain.connect(this.masterGain!);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 3.5);
    osc2.stop(now + 3.5);
  }

  // ============================================================================
  // NEPALI MADAL & TABLA PERCUSSION SYNTHESIZER
  // ============================================================================

  public setRhythmVolume(vol: number) {
    this.rhythmVolume = Math.max(0, Math.min(1, vol));
  }

  /**
   * Triggers a single synthesized Madal or Tabla bol stroke.
   */
  public triggerPercussionBol(step: BolStep, instrument: 'madal' | 'tabla') {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const accentMultiplier =
      step.accent === 'sam' ? 1.25 : step.accent === 'tali' ? 1.08 : step.accent === 'khali' ? 0.85 : 0.95;
    const gainLevel = this.rhythmVolume * accentMultiplier * 0.45;
    if (gainLevel <= 0.001) return;

    // Tune treble head to user's current Sa (MIDI 60 + rootPitchClass)
    const tonicHz = midiToFrequency(60 + this.rootPitchClass, this.a4ReferenceHz, this.rootPitchClass, false);

    if (instrument === 'madal') {
      this.playMadalStroke(ctx, now, step.strokeType, tonicHz, gainLevel);
    } else {
      this.playTablaStroke(ctx, now, step.strokeType, tonicHz, gainLevel);
    }
  }

  private playMadalStroke(
    ctx: AudioContext,
    now: number,
    strokeType: BolStep['strokeType'],
    tonicHz: number,
    level: number
  ) {
    // Nepali Madal has a deep wooden cylindrical body and two khari-paste heads
    if (strokeType === 'both-resonant' || strokeType === 'bass-open') {
      // Left bass head ("Ghin" / "Dhin")
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(128, now);
      bassOsc.frequency.exponentialRampToValueAtTime(76, now + 0.09);
      bassOsc.frequency.exponentialRampToValueAtTime(64, now + 0.28);

      bassGain.gain.setValueAtTime(0.001, now);
      bassGain.gain.linearRampToValueAtTime(level * 1.15, now + 0.006);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

      bassOsc.connect(bassGain);
      bassGain.connect(this.masterGain!);
      bassOsc.start(now);
      bassOsc.stop(now + 0.34);
    }

    if (strokeType === 'both-resonant' || strokeType === 'treble-ring') {
      // Right khari head ("Tang" / "Na") — bright harmonic ring tuned to Sa
      const ringOsc = ctx.createOscillator();
      const overtoneOsc = ctx.createOscillator();
      const ringGain = ctx.createGain();

      ringOsc.type = 'triangle';
      ringOsc.frequency.setValueAtTime(tonicHz * 1.5, now); // Fifth / Pa resonance
      overtoneOsc.type = 'sine';
      overtoneOsc.frequency.setValueAtTime(tonicHz * 2.0, now); // Octave Sa ring

      ringGain.gain.setValueAtTime(0.001, now);
      ringGain.gain.linearRampToValueAtTime(level * 0.85, now + 0.004);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      ringOsc.connect(ringGain);
      overtoneOsc.connect(ringGain);
      ringGain.connect(this.masterGain!);

      ringOsc.start(now);
      overtoneOsc.start(now);
      ringOsc.stop(now + 0.24);
      overtoneOsc.stop(now + 0.24);
    }

    if (strokeType === 'closed-crisp' || strokeType === 'muted-ka') {
      // Crisp hand slap / dampened wood stroke ("Ti" / "NaTi")
      const osc = ctx.createOscillator();
      const slapGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(strokeType === 'closed-crisp' ? 310 : 190, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.055);

      slapGain.gain.setValueAtTime(0.001, now);
      slapGain.gain.linearRampToValueAtTime(level * 0.7, now + 0.003);
      slapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

      osc.connect(slapGain);
      slapGain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  }

  private playTablaStroke(
    ctx: AudioContext,
    now: number,
    strokeType: BolStep['strokeType'],
    tonicHz: number,
    level: number
  ) {
    // Classical Tabla (Bayan + Dayan tuned to tonic Sa)
    if (strokeType === 'both-resonant' || strokeType === 'bass-open') {
      // Bayan (Duggi) with characteristic pitch modulation ("Ghe" / "Dha" / "Dhin")
      const bayanOsc = ctx.createOscillator();
      const bayanGain = ctx.createGain();
      bayanOsc.type = 'sine';
      bayanOsc.frequency.setValueAtTime(98, now);
      bayanOsc.frequency.linearRampToValueAtTime(118, now + 0.07);
      bayanOsc.frequency.exponentialRampToValueAtTime(74, now + 0.34);

      bayanGain.gain.setValueAtTime(0.001, now);
      bayanGain.gain.linearRampToValueAtTime(level * 1.1, now + 0.008);
      bayanGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

      bayanOsc.connect(bayanGain);
      bayanGain.connect(this.masterGain!);
      bayanOsc.start(now);
      bayanOsc.stop(now + 0.38);
    }

    if (strokeType === 'both-resonant' || strokeType === 'treble-ring' || strokeType === 'closed-crisp') {
      // Dayan tuned to tonicHz ("Na", "Ta", "Tin", "Tun")
      const dayanOsc = ctx.createOscillator();
      const syahiOvertone = ctx.createOscillator();
      const dayanGain = ctx.createGain();

      dayanOsc.type = 'triangle';
      dayanOsc.frequency.setValueAtTime(tonicHz, now);
      syahiOvertone.type = 'sine';
      syahiOvertone.frequency.setValueAtTime(tonicHz * (strokeType === 'closed-crisp' ? 2.5 : 2.0), now);

      const decayTime = strokeType === 'closed-crisp' ? 0.14 : 0.28;
      dayanGain.gain.setValueAtTime(0.001, now);
      dayanGain.gain.linearRampToValueAtTime(level * 0.9, now + 0.004);
      dayanGain.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

      dayanOsc.connect(dayanGain);
      syahiOvertone.connect(dayanGain);
      dayanGain.connect(this.masterGain!);

      dayanOsc.start(now);
      syahiOvertone.start(now);
      dayanOsc.stop(now + decayTime + 0.02);
      syahiOvertone.stop(now + decayTime + 0.02);
    }

    if (strokeType === 'muted-ka') {
      // Dry Bayan "Ka" / "Ke" slap
      const kaOsc = ctx.createOscillator();
      const kaGain = ctx.createGain();
      kaOsc.type = 'square';
      kaOsc.frequency.setValueAtTime(160, now);
      kaOsc.frequency.exponentialRampToValueAtTime(65, now + 0.045);

      kaGain.gain.setValueAtTime(0.001, now);
      kaGain.gain.linearRampToValueAtTime(level * 0.55, now + 0.002);
      kaGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

      kaOsc.connect(kaGain);
      kaGain.connect(this.masterGain!);
      kaOsc.start(now);
      kaOsc.stop(now + 0.06);
    }
  }
}

export const audioEngine = new HarmoniumAudioEngine();
