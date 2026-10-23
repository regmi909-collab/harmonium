import { useCallback, useEffect, useRef, useState } from 'react';

import { NoteKey } from './constants';

type Voice = {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
};

type PlaybackMode = 'samples' | 'oscillator';
export type ReedMode = 'single' | 'double';

const REFERENCE_SAMPLE_URL = '/harmonium-kannan-orig.wav';
const REFERENCE_REVERB_URL = '/reverb.wav';
const REFERENCE_ROOT_MIDI = 62;
// Start 65ms into the WAV where the reed is already at full resonance (0-50ms is quiet wind-up)
const REFERENCE_START_OFFSET = 0.065;
const REFERENCE_LOOP_START = 0.5;

// Minimum durations so quick taps and double-taps always speak clearly and animate smoothly
const MIN_AUDIO_TAP_MS = 165;
const MIN_VISUAL_TAP_MS = 80;

// Pre-fetch raw WAV bytes immediately on module load so decoding is instant
let preloadedSampleBytesPromise: Promise<ArrayBuffer | null> | null = null;
let preloadedReverbBytesPromise: Promise<ArrayBuffer | null> | null = null;

function getSampleBytes(): Promise<ArrayBuffer | null> {
  if (!preloadedSampleBytesPromise && typeof window !== 'undefined') {
    preloadedSampleBytesPromise = fetch(REFERENCE_SAMPLE_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }
  return preloadedSampleBytesPromise ?? Promise.resolve(null);
}

function getReverbBytes(): Promise<ArrayBuffer | null> {
  if (!preloadedReverbBytesPromise && typeof window !== 'undefined') {
    preloadedReverbBytesPromise = fetch(REFERENCE_REVERB_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }
  return preloadedReverbBytesPromise ?? Promise.resolve(null);
}

if (typeof window !== 'undefined') {
  void getSampleBytes();
  void getReverbBytes();
}

async function fetchAudioBuffer(context: AudioContext, url: string) {
  const rawBytes =
    url === REFERENCE_SAMPLE_URL
      ? await getSampleBytes()
      : url === REFERENCE_REVERB_URL
      ? await getReverbBytes()
      : null;

  if (rawBytes) {
    return context.decodeAudioData(rawBytes.slice(0));
  }

  const response = await fetch(url, { cache: 'force-cache' }).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  return context.decodeAudioData(buffer.slice(0));
}

function createReferenceSource({
  buffer,
  context,
  destination,
  midi,
}: {
  buffer: AudioBuffer;
  context: AudioContext;
  destination: AudioNode;
  midi: number;
}) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = REFERENCE_LOOP_START;
  source.detune.value = (midi - REFERENCE_ROOT_MIDI) * 100;
  source.connect(destination);
  const offset = Math.min(REFERENCE_START_OFFSET, Math.max(0, buffer.duration - 0.1));
  source.start(0, offset);

  return source;
}

function createFallbackSource({
  context,
  destination,
  frequency,
  type,
}: {
  context: AudioContext;
  destination: AudioNode;
  frequency: number;
  type: OscillatorType;
}) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(destination);
  oscillator.start(0);

  return oscillator;
}

function fadeOutAndStopVoice(
  voice: Voice,
  context: AudioContext | null,
  fadeSeconds: number
) {
  if (context) {
    const now = context.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(
        Math.max(voice.gain.gain.value, 0.0001),
        now
      );
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
    } catch {
      // Ignore envelope scheduling errors
    }
  }

  for (const source of voice.sources) {
    try {
      source.stop(context ? context.currentTime + fadeSeconds + 0.01 : 0);
    } catch {
      // Ignore already-stopped source
    }
  }

  window.setTimeout(() => {
    try {
      voice.gain.disconnect();
    } catch {
      // Ignore disconnect races during teardown
    }
  }, Math.ceil((fadeSeconds + 0.05) * 1000));
}

export function useHarmoniumPlayer({
  octave,
  transpose,
  volume,
  reverbEnabled,
  reedMode,
}: {
  octave: number;
  transpose: number;
  volume: number;
  reverbEnabled: boolean;
  reedMode: ReedMode;
}) {
  const [activeNoteIds, setActiveNoteIds] = useState<string[]>([]);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('samples');

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const reverbConnectedRef = useRef(false);
  const voicesRef = useRef<Map<string, Voice>>(new Map());
  const requestedVoiceIdsRef = useRef<Set<string>>(new Set());
  const physicallyHeldVoiceIdsRef = useRef<Set<string>>(new Set());
  const voiceStartTimeRef = useRef<Map<string, number>>(new Map());
  const pendingStopTimersRef = useRef<Map<string, number>>(new Map());
  const pendingVisualTimersRef = useRef<Map<string, number>>(new Map());
  const sustainEnabledRef = useRef(false);
  const sustainedVoiceIdsRef = useRef<Set<string>>(new Set());
  const sampleBufferRef = useRef<AudioBuffer | null>(null);
  const sampleBufferPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const reverbBufferPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const settingsRef = useRef({
    octave,
    transpose,
    volume,
    reverbEnabled,
    reedMode,
  });

  const syncReverbRoute = useCallback((enabled: boolean) => {
    const gainNode = gainNodeRef.current;
    const reverbNode = reverbNodeRef.current;

    if (!gainNode || !reverbNode?.buffer) {
      return;
    }

    if (enabled && !reverbConnectedRef.current) {
      gainNode.connect(reverbNode);
      reverbConnectedRef.current = true;
      return;
    }

    if (!enabled && reverbConnectedRef.current) {
      try {
        gainNode.disconnect(reverbNode);
      } catch (error) {
        console.error('Failed to disconnect harmonium reverb', error);
      }
      reverbConnectedRef.current = false;
    }
  }, []);

  useEffect(() => {
    settingsRef.current = {
      octave,
      transpose,
      volume,
      reverbEnabled,
      reedMode,
    };

    const context = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    if (!context || !gainNode) {
      return;
    }

    gainNode.gain.setTargetAtTime(volume, context.currentTime, 0.03);
    syncReverbRoute(reverbEnabled);
  }, [octave, transpose, volume, reverbEnabled, reedMode, syncReverbRoute]);

  const loadReferenceSample = useCallback(async (context: AudioContext) => {
    if (sampleBufferRef.current) {
      return sampleBufferRef.current;
    }
    if (!sampleBufferPromiseRef.current) {
      sampleBufferPromiseRef.current = fetchAudioBuffer(
        context,
        REFERENCE_SAMPLE_URL
      )
        .then((buf) => {
          sampleBufferRef.current = buf;
          return buf;
        })
        .catch((error) => {
          console.error('Failed to load harmonium reference sample', error);
          sampleBufferPromiseRef.current = null;
          return null;
        });
    }

    return sampleBufferPromiseRef.current;
  }, []);

  const loadReferenceReverb = useCallback(
    async (context: AudioContext) => {
      if (!reverbBufferPromiseRef.current) {
        reverbBufferPromiseRef.current = fetchAudioBuffer(
          context,
          REFERENCE_REVERB_URL
        ).catch((error) => {
          console.error('Failed to load harmonium reverb response', error);
          reverbBufferPromiseRef.current = null;
          return null;
        });
      }

      const buffer = await reverbBufferPromiseRef.current;
      const reverbNode = reverbNodeRef.current;
      if (!buffer || !reverbNode) {
        return null;
      }

      reverbNode.buffer = buffer;
      syncReverbRoute(settingsRef.current.reverbEnabled);
      return buffer;
    },
    [syncReverbRoute]
  );

  // Create AudioContext and pre-decode buffers; call resume() synchronously on user gesture
  const ensureAudioSync = useCallback(
    (resumeNow: boolean = true): AudioContext | null => {
      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

        if (!AudioContextClass) {
          return null;
        }

        const context = new AudioContextClass();
        const gainNode = context.createGain();
        const reverbNode = context.createConvolver();

        gainNode.gain.value = settingsRef.current.volume;
        gainNode.connect(context.destination);
        reverbNode.connect(context.destination);

        audioContextRef.current = context;
        gainNodeRef.current = gainNode;
        reverbNodeRef.current = reverbNode;

        void loadReferenceSample(context);
        void loadReferenceReverb(context);
      }

      if (resumeNow && audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume();
      }

      return audioContextRef.current;
    },
    [loadReferenceReverb, loadReferenceSample]
  );

  // Pre-decode WAV sample buffer immediately on mount so the very first tap is 100% synchronous
  useEffect(() => {
    ensureAudioSync(false);

    const unlock = () => {
      ensureAudioSync(true);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensureAudioSync]);

  const releaseVoiceImmediate = useCallback((noteId: string) => {
    const stopTimer = pendingStopTimersRef.current.get(noteId);
    if (stopTimer !== undefined) {
      window.clearTimeout(stopTimer);
      pendingStopTimersRef.current.delete(noteId);
    }

    requestedVoiceIdsRef.current.delete(noteId);
    sustainedVoiceIdsRef.current.delete(noteId);

    const voice = voicesRef.current.get(noteId);
    if (!voice) {
      return;
    }

    voicesRef.current.delete(noteId);
    fadeOutAndStopVoice(voice, audioContextRef.current, 0.065);
  }, []);

  const stopNote = useCallback(
    (noteId: string) => {
      physicallyHeldVoiceIdsRef.current.delete(noteId);

      const startTime = voiceStartTimeRef.current.get(noteId) ?? 0;
      const elapsed = performance.now() - startTime;

      // Keep visual key-down animation visible for at least MIN_VISUAL_TAP_MS on quick taps
      const existingVisualTimer = pendingVisualTimersRef.current.get(noteId);
      if (existingVisualTimer !== undefined) {
        window.clearTimeout(existingVisualTimer);
        pendingVisualTimersRef.current.delete(noteId);
      }
      if (elapsed < MIN_VISUAL_TAP_MS) {
        const vTimer = window.setTimeout(() => {
          pendingVisualTimersRef.current.delete(noteId);
          if (!physicallyHeldVoiceIdsRef.current.has(noteId)) {
            setActiveNoteIds((current) => current.filter((id) => id !== noteId));
          }
        }, MIN_VISUAL_TAP_MS - elapsed);
        pendingVisualTimersRef.current.set(noteId, vTimer);
      } else {
        setActiveNoteIds((current) => current.filter((id) => id !== noteId));
      }

      // Keep audio reed speaking for at least MIN_AUDIO_TAP_MS on quick taps
      const existingStopTimer = pendingStopTimersRef.current.get(noteId);
      if (existingStopTimer !== undefined) {
        window.clearTimeout(existingStopTimer);
        pendingStopTimersRef.current.delete(noteId);
      }
      if (elapsed < MIN_AUDIO_TAP_MS) {
        const aTimer = window.setTimeout(() => {
          pendingStopTimersRef.current.delete(noteId);
          if (!physicallyHeldVoiceIdsRef.current.has(noteId)) {
            releaseVoiceImmediate(noteId);
          }
        }, MIN_AUDIO_TAP_MS - elapsed);
        pendingStopTimersRef.current.set(noteId, aTimer);
        return;
      }

      releaseVoiceImmediate(noteId);
    },
    [releaseVoiceImmediate]
  );

  const stopAllNotes = useCallback(() => {
    for (const timer of pendingStopTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    pendingStopTimersRef.current.clear();

    for (const timer of pendingVisualTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    pendingVisualTimersRef.current.clear();

    physicallyHeldVoiceIdsRef.current.clear();
    requestedVoiceIdsRef.current.clear();
    for (const noteId of [...voicesRef.current.keys()]) {
      releaseVoiceImmediate(noteId);
    }
    sustainedVoiceIdsRef.current.clear();
    setActiveNoteIds([]);
  }, [releaseVoiceImmediate]);

  const setMidiSustain = useCallback(
    (enabled: boolean) => {
      sustainEnabledRef.current = enabled;

      if (enabled) {
        return;
      }

      for (const voiceId of [...sustainedVoiceIdsRef.current]) {
        stopNote(voiceId);
      }
      sustainedVoiceIdsRef.current.clear();
    },
    [stopNote]
  );

  const attachAndStartSources = useCallback(
    ({
      voiceId,
      desiredMidi,
      velocity,
      context,
      gainNode,
      sampleBuffer,
    }: {
      voiceId: string;
      desiredMidi: number;
      velocity: number;
      context: AudioContext;
      gainNode: GainNode;
      sampleBuffer: AudioBuffer | null;
    }) => {
      // If another voice is still playing for this voiceId (e.g. rapid double-tap),
      // smoothly cross-fade it out so the new tap articulates cleanly
      const existingVoice = voicesRef.current.get(voiceId);
      if (existingVoice) {
        fadeOutAndStopVoice(existingVoice, context, 0.014);
        voicesRef.current.delete(voiceId);
      }

      const voiceGain = context.createGain();
      const now = context.currentTime;
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(velocity, now + 0.008);
      voiceGain.connect(gainNode);

      const sources: AudioScheduledSourceNode[] = [];

      if (sampleBuffer) {
        sources.push(
          createReferenceSource({
            buffer: sampleBuffer,
            context,
            destination: voiceGain,
            midi: desiredMidi,
          })
        );

        if (settingsRef.current.reedMode === 'double') {
          sources.push(
            createReferenceSource({
              buffer: sampleBuffer,
              context,
              destination: voiceGain,
              midi: desiredMidi + 12,
            })
          );
        }

        setPlaybackMode('samples');
      } else {
        const frequency = 440 * 2 ** ((desiredMidi - 69) / 12);

        sources.push(
          createFallbackSource({
            context,
            destination: voiceGain,
            frequency,
            type: 'sawtooth',
          })
        );
        sources.push(
          createFallbackSource({
            context,
            destination: voiceGain,
            frequency: frequency * 0.5,
            type: 'triangle',
          })
        );

        if (settingsRef.current.reedMode === 'double') {
          sources.push(
            createFallbackSource({
              context,
              destination: voiceGain,
              frequency: frequency * 2,
              type: 'sawtooth',
            })
          );
        }

        setPlaybackMode('oscillator');
      }

      voicesRef.current.set(voiceId, {
        gain: voiceGain,
        sources,
      });
    },
    []
  );

  const startVoice = useCallback(
    async ({
      voiceId,
      desiredMidi,
      velocity = 1,
    }: {
      voiceId: string;
      desiredMidi: number;
      velocity?: number;
    }) => {
      // Cancel any pending stop/visual timer from a previous tap on this note
      const pendingStop = pendingStopTimersRef.current.get(voiceId);
      if (pendingStop !== undefined) {
        window.clearTimeout(pendingStop);
        pendingStopTimersRef.current.delete(voiceId);
      }
      const pendingVisual = pendingVisualTimersRef.current.get(voiceId);
      if (pendingVisual !== undefined) {
        window.clearTimeout(pendingVisual);
        pendingVisualTimersRef.current.delete(voiceId);
      }

      physicallyHeldVoiceIdsRef.current.add(voiceId);
      requestedVoiceIdsRef.current.add(voiceId);
      sustainedVoiceIdsRef.current.delete(voiceId);
      voiceStartTimeRef.current.set(voiceId, performance.now());

      // Synchronously create and resume AudioContext inside user gesture
      const context = ensureAudioSync(true);
      const gainNode = gainNodeRef.current;
      if (!context || !gainNode) {
        return;
      }

      void loadReferenceReverb(context);

      // Fast path: if sampleBufferRef.current is already decoded, start synchronously with zero await!
      if (sampleBufferRef.current) {
        attachAndStartSources({
          voiceId,
          desiredMidi,
          velocity,
          context,
          gainNode,
          sampleBuffer: sampleBufferRef.current,
        });
        return;
      }

      const sampleBuffer = await loadReferenceSample(context);
      if (!requestedVoiceIdsRef.current.has(voiceId)) {
        return;
      }

      attachAndStartSources({
        voiceId,
        desiredMidi,
        velocity,
        context,
        gainNode,
        sampleBuffer,
      });
    },
    [attachAndStartSources, ensureAudioSync, loadReferenceReverb, loadReferenceSample]
  );

  const startNote = useCallback(
    async (note: NoteKey) => {
      setActiveNoteIds((current) => {
        if (current.includes(note.id)) {
          // Briefly release for 1 frame so rapid double-taps visibly slide down again
          window.requestAnimationFrame(() => {
            setActiveNoteIds((next) =>
              next.includes(note.id) ? next : [...next, note.id]
            );
          });
          return current.filter((id) => id !== note.id);
        }
        return [...current, note.id];
      });
      await startVoice({
        voiceId: note.id,
        desiredMidi:
          note.midi +
          (settingsRef.current.octave - 4) * 12 +
          settingsRef.current.transpose,
      });
    },
    [startVoice]
  );

  const startMidiNote = useCallback(
    async (voiceId: string, midi: number, velocity: number = 1) => {
      await startVoice({
        voiceId,
        desiredMidi: midi + settingsRef.current.transpose,
        velocity,
      });
    },
    [startVoice]
  );

  const stopMidiNote = useCallback(
    (voiceId: string) => {
      if (sustainEnabledRef.current) {
        sustainedVoiceIdsRef.current.add(voiceId);
        return;
      }

      stopNote(voiceId);
    },
    [stopNote]
  );

  useEffect(() => {
    return () => {
      stopAllNotes();
      void audioContextRef.current?.close();
    };
  }, [stopAllNotes]);

  return {
    activeNoteIds,
    playbackMode,
    setMidiSustain,
    startMidiNote,
    stopMidiNote,
    startNote,
    stopNote,
    stopAllNotes,
    getAudioContext: () => audioContextRef.current,
    getGainNode: () => gainNodeRef.current,
  };
}
