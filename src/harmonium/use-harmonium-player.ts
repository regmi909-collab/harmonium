import { useCallback, useEffect, useRef, useState } from 'react';

import { NoteKey } from './constants';

type Voice = {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
};

type PlaybackMode = 'samples' | 'oscillator';
type ReedMode = 'single' | 'double';

const REFERENCE_SAMPLE_URL = '/harmonium-kannan-orig.wav';
const REFERENCE_REVERB_URL = '/reverb.wav';
const REFERENCE_ROOT_MIDI = 62;
const REFERENCE_LOOP_START = 0.5;

let rawSampleBytesPromise: Promise<ArrayBuffer | null> | null = null;

function preloadRawSampleBytes(): Promise<ArrayBuffer | null> {
  if (!rawSampleBytesPromise && typeof window !== 'undefined') {
    rawSampleBytesPromise = fetch(REFERENCE_SAMPLE_URL, { cache: 'force-cache' })
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
  }
  return rawSampleBytesPromise ?? Promise.resolve(null);
}

// Start preloading sample bytes immediately in browser
if (typeof window !== 'undefined') {
  void preloadRawSampleBytes();
}

async function fetchAudioBuffer(context: AudioContext, url: string) {
  if (url === REFERENCE_SAMPLE_URL) {
    const raw = await preloadRawSampleBytes();
    if (raw) {
      return context.decodeAudioData(raw.slice(0));
    }
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
  source.start(0);

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
      } catch {
        // Ignore disconnect errors
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

  const ensureAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      const context = new AudioContextClass({ latencyHint: 'interactive' });
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;

      const gainNode = context.createGain();
      const reverbNode = context.createConvolver();

      gainNode.gain.value = settingsRef.current.volume;
      gainNode.connect(compressor);
      reverbNode.connect(compressor);
      compressor.connect(context.destination);

      audioContextRef.current = context;
      gainNodeRef.current = gainNode;
      reverbNodeRef.current = reverbNode;
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

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
        .catch(() => null);
    }

    return sampleBufferPromiseRef.current;
  }, []);

  const loadReferenceReverb = useCallback(
    async (context: AudioContext) => {
      if (!reverbBufferPromiseRef.current) {
        reverbBufferPromiseRef.current = fetchAudioBuffer(
          context,
          REFERENCE_REVERB_URL
        ).catch(() => null);
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

  const stopNote = useCallback((noteId: string) => {
    const context = audioContextRef.current;
    const voice = voicesRef.current.get(noteId);
    requestedVoiceIdsRef.current.delete(noteId);
    setActiveNoteIds((current) =>
      current.includes(noteId) ? current.filter((id) => id !== noteId) : current
    );

    if (!voice) {
      return;
    }

    if (context) {
      voice.gain.gain.cancelScheduledValues(context.currentTime);
      voice.gain.gain.setValueAtTime(
        Math.max(voice.gain.gain.value, 0.0001),
        context.currentTime
      );
      voice.gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.035
      );
    }

    for (const source of voice.sources) {
      try {
        source.stop(context ? context.currentTime + 0.045 : 0);
      } catch {
        // Ignore stop errors
      }
    }

    voicesRef.current.delete(noteId);
    sustainedVoiceIdsRef.current.delete(noteId);

    window.setTimeout(() => {
      try {
        voice.gain.disconnect();
      } catch {
        // Ignore disconnect races during teardown.
      }
    }, 100);
  }, []);

  const stopAllNotes = useCallback(() => {
    requestedVoiceIdsRef.current.clear();
    for (const noteId of [...voicesRef.current.keys()]) {
      stopNote(noteId);
    }
    sustainedVoiceIdsRef.current.clear();
    setActiveNoteIds([]);
  }, [stopNote]);

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
      requestedVoiceIdsRef.current.add(voiceId);
      sustainedVoiceIdsRef.current.delete(voiceId);

      if (voicesRef.current.has(voiceId)) {
        return;
      }

      const context = await ensureAudio();
      const gainNode = gainNodeRef.current;
      if (!context || !gainNode) {
        return;
      }

      void loadReferenceReverb(context);

      const voiceGain = context.createGain();
      voiceGain.gain.value = velocity;
      voiceGain.connect(gainNode);

      const sampleBuffer =
        sampleBufferRef.current ?? (await loadReferenceSample(context));

      if (
        voicesRef.current.has(voiceId) ||
        !requestedVoiceIdsRef.current.has(voiceId)
      ) {
        voiceGain.disconnect();
        return;
      }

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
          const octaveGain = context.createGain();
          octaveGain.gain.value = 0.45;
          octaveGain.connect(voiceGain);
          sources.push(
            createReferenceSource({
              buffer: sampleBuffer,
              context,
              destination: octaveGain,
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
    [ensureAudio, loadReferenceReverb, loadReferenceSample]
  );

  const startNote = useCallback(
    async (note: NoteKey) => {
      setActiveNoteIds((current) =>
        current.includes(note.id) ? current : [...current, note.id]
      );
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
