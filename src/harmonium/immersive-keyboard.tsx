import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useMidiKeyboard } from './use-midi-keyboard';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

import {
  getNoteKeyByInput,
  getOctaveOption,
  KEYBOARD_BASE_WIDTH,
  NOTE_KEYS,
  OCTAVE_OPTIONS,
  STORAGE_KEY,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  WESTERN_NAMES,
  SWARAM_NAMES,
} from './constants';
import { useHarmoniumPlayer } from './use-harmonium-player';

// ── Per-reed visual data ─────────────────────────────────────────────────
const REED_GOLD = ['#c8a840', '#b89438', '#d4b050', '#c09040', '#caa844', '#b89036',
  '#d0ae4e', '#c4a040', '#bea03c', '#c8aa46', '#b58e38', '#d0b04e'];

// ── Tabla Engine ────────────────────────────────────────────────────────
export const TAALS = {
  tintal: { name: 'Tintal (16)', beats: 16, pattern: ['dha', 'dhin', 'dhin', 'dha', 'dha', 'dhin', 'dhin', 'dha', 'dha', 'tin', 'tin', 'ta', 'ta', 'dhin', 'dhin', 'dha'] },
  rupak: { name: 'Rupak (7)', beats: 7, pattern: ['tin', 'tin', 'na', 'dhin', 'na', 'dhin', 'na'] },
  jhaptal: { name: 'Jhaptal (10)', beats: 10, pattern: ['dhi', 'na', 'dhi', 'dhi', 'na', 'ti', 'na', 'dhi', 'dhi', 'na'] },
  ektal: { name: 'Ektal (12)', beats: 12, pattern: ['dhin', 'dhin', 'dha', 'ge', 'tu', 'na', 'kat', 'ta', 'dha', 'ge', 'dhin', 'na'] },
  kaharwa: { name: 'Kaharwa (8)', beats: 8, pattern: ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'] },
  dadra: { name: 'Dadra (6)', beats: 6, pattern: ['dha', 'dhin', 'na', 'dha', 'tin', 'na'] }
} as const;

export const RAGAS = [
  { name: 'Bilaval', intervals: [0, 2, 4, 5, 7, 9, 11] }, // All natural
  { name: 'Yaman',   intervals: [0, 2, 4, 6, 7, 9, 11] }, // Sharp Ma (#4)
  { name: 'Bhairav', intervals: [0, 1, 4, 5, 7, 8, 11] }, // Flat Re, Dha (b2, b6)
  { name: 'Kafi',    intervals: [0, 2, 3, 5, 7, 9, 10] }, // Flat Ga, Ni (b3, b7)
  { name: 'Bhupali', intervals: [0, 2, 4, 7, 9] },       // Pentatonic: Sa Re Ga Pa Dha
];

function playTablaStroke(context: AudioContext, dest: AudioNode, stroke: string, rootFreq: number) {
  const t = context.currentTime;
  
  // Bayan (Bass)
  if (['dha', 'dhin', 'ge', 'dhi', 'ga'].includes(stroke)) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(dest);
    
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.15);
    
    gain.gain.setValueAtTime(1.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    
    osc.start(t);
    osc.stop(t + 0.5);
  }

  // Dayan (Treble)
  if (['dha', 'dhin', 'na', 'ta', 'tin', 'ti', 'tu', 'te'].includes(stroke)) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'triangle';
    osc.connect(gain);
    gain.connect(dest);
    
    const isRing = ['na', 'ta', 'tin', 'ti'].includes(stroke);
    osc.frequency.setValueAtTime(rootFreq * 1.5, t); // High pitch tuning
    
    gain.gain.setValueAtTime(isRing ? 0.7 : 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isRing ? 0.4 : 0.12));
    
    osc.start(t);
    osc.stop(t + (isRing ? 0.4 : 0.12));
  }
  
  // Slap (Kat/Ka)
  if (['kat', 'ka', 'ke'].includes(stroke)) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'square';
    osc.connect(gain);
    gain.connect(dest);
    
    osc.frequency.setValueAtTime(90, t);
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    
    osc.start(t);
    osc.stop(t + 0.08);
  }
}

export function ImmersiveHarmonium() {
  const [labelMode, setLabelMode] = useState<'western' | 'sargam' | 'none'>('sargam');
  const [sargamOffset, setSargamOffset] = useState<number>(0); // 0 = C is Sa
  const [octave, setOctave] = useState(4);
  const [transpose, setTranspose] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reedMode, setReedMode] = useState<'single' | 'double'>('single');
  const [showControls, setShowControls] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [chordMode, setChordMode] = useState<'off' | 'major' | 'minor'>('off');
  const [camPos, setCamPos] = useState({ x: 32, y: 64 });
  const [isDraggingCam, setIsDraggingCam] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const [tanpuraEnabled, setTanpuraEnabled] = useState(false);
  const [tanpuraStyle, setTanpuraStyle] = useState<'pa' | 'ma' | 'ni'>('pa');
  const [tanpuraRoot, setTanpuraRoot] = useState(0); // 0 = C
  const [tanpuraVolume, setTanpuraVolume] = useState(0.5);
  const [tanpuraSpeed, setTanpuraSpeed] = useState(120);
  const [tanpuraExpanded, setTanpuraExpanded] = useState(false);

  const [tablaEnabled, setTablaEnabled] = useState(false);
  const [tablaTaal, setTablaTaal] = useState<keyof typeof TAALS>('tintal');
  const [tablaVolume, setTablaVolume] = useState(0.6);
  const [tablaSpeed, setTablaSpeed] = useState(160);
  const [tablaPitch, setTablaPitch] = useState(0);
  const [tablaExpanded, setTablaExpanded] = useState(false);

  // ── Raga Suggestions ─────────────────────────────────────────
  const [selectedRaga, setSelectedRaga] = useState<string | null>(null);
  const [ragaExpanded, setRagaExpanded] = useState(false);

  // ── Voice Monitor ────────────────────────────────────────────
  const [micEnabled, setMicEnabled] = useState(false);
  const [micVolume, setMicVolume] = useState(0.8);
  const [micReverb, setMicReverb] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodesRef = useRef<{ source: MediaStreamAudioSourceNode; gain: GainNode; convolver?: ConvolverNode } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      // 1. Capture the screen (video only — no system audio needed)
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false // we will add Web Audio manually
      });

      // 2. Tap into the Web Audio engine output via MediaStreamDestination
      const audioCtx = getAudioContext();
      const gainNode = getGainNode();
      
      let audioTracks: MediaStreamTrack[] = [];
      if (audioCtx && gainNode) {
        const dest = audioCtx.createMediaStreamDestination();
        gainNode.connect(dest);
        audioTracks = dest.stream.getAudioTracks();
      }

      // 3. Combine video track + Web Audio track into one stream
      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioTracks,
      ]);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `harmonium-practice-${new Date().getTime()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        recordedChunksRef.current = [];
        setIsRecording(false);
      };

      // Stop recording when user stops screen share
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });

      recorder.start(200); // collect data every 200ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Recording failed:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const onCamPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingCam(true);
    dragStart.current = { x: e.clientX, y: e.clientY, camX: camPos.x, camY: camPos.y };
  };

  const onCamPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingCam) return;
    setCamPos({
      x: dragStart.current.camX + (e.clientX - dragStart.current.x),
      y: dragStart.current.camY + (e.clientY - dragStart.current.y),
    });
  };

  const onCamPointerUp = () => setIsDraggingCam(false);

  const [zoom, setZoom] = useState(ZOOM_DEFAULT);

  // ── Coupler stops (like real harmonium tabs) ─────────────────────────
  const [couplerBass, setCouplerBass] = useState(false);
  const [couplerMale, setCouplerMale] = useState(false);
  const [couplerFemale, setCouplerFemale] = useState(false);
  const [couplerDrone, setCouplerDrone] = useState(false);

  // hideTimer removed — HUD now shows/hides on direct hover only
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Webcam Feature ───────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (showWebcam) {
      setCamError(null);
      navigator.mediaDevices.getUserMedia({ video: true })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch((err) => {
          console.error("Webcam error:", err);
          if (err.name === 'NotReadableError') {
            setCamError("Camera is currently in use by another app.");
          } else {
            setCamError("Could not access camera.");
          }
        });
    } else {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    }
    return () => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [showWebcam]);

  // ── Voice Monitor Effect ───────────────────────────────────────────
  useEffect(() => {
    if (!micEnabled) {
      // Stop mic stream and disconnect all nodes
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (micNodesRef.current) {
        try { micNodesRef.current.source.disconnect(); } catch {}
        try { micNodesRef.current.gain.disconnect(); } catch {}
        try { micNodesRef.current.convolver?.disconnect(); } catch {}
        micNodesRef.current = null;
      }
      setMicError(null);
      return;
    }

    let cancelled = false;

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        micStreamRef.current = stream;

        // Bootstrap audio context if needed (first key press may not have done it yet)
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        // Reuse or create a dedicated mic context
        const ctx = new AudioContextClass() as AudioContext;
        if (ctx.state === 'suspended') await ctx.resume();

        const source = ctx.createMediaStreamSource(stream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = micVolume;

        if (micReverb) {
          // Simple convolver reverb via noise buffer impulse
          const convolver = ctx.createConvolver();
          const rate = ctx.sampleRate;
          const length = rate * 2;
          const impulse = ctx.createBuffer(2, length, rate);
          for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
          }
          convolver.buffer = impulse;
          source.connect(convolver);
          convolver.connect(gainNode);
          micNodesRef.current = { source, gain: gainNode, convolver };
        } else {
          source.connect(gainNode);
          micNodesRef.current = { source, gain: gainNode };
        }

        gainNode.connect(ctx.destination);
        setMicError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Mic error:', err);
        if (err.name === 'NotAllowedError') setMicError('Microphone permission denied.');
        else if (err.name === 'NotFoundError') setMicError('No microphone found.');
        else setMicError('Could not access microphone.');
        setMicEnabled(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micEnabled, micReverb]);

  // Sync mic gain live without restarting stream
  useEffect(() => {
    if (micNodesRef.current) micNodesRef.current.gain.gain.value = micVolume;
  }, [micVolume]);

  const { activeNoteIds, playbackMode, setMidiSustain, startNote: baseStartNote, stopNote: baseStopNote, stopAllNotes, startMidiNote, stopMidiNote, getAudioContext, getGainNode } =
    useHarmoniumPlayer({ octave, transpose, volume, reverbEnabled, reedMode });

  useMidiKeyboard({
    onNoteOn: (voiceId, midi) => void startMidiNote(voiceId, midi),
    onNoteOff: (voiceId) => stopMidiNote(voiceId),
    onSustainChange: setMidiSustain,
    onVolumeChange: setVolume,
  });

  // ── Coupler Logic ────────────────────────────────────────────────────────
  const noteById = useMemo(() => new Map(NOTE_KEYS.map((n) => [n.id, n])), []);
  
  const startNote = useCallback((note: typeof NOTE_KEYS[0]) => {
    const hasAnyCoupler = couplerBass || couplerMale || couplerFemale;
    if (!hasAnyCoupler) {
      void baseStartNote(note);
      return;
    }

    if (couplerBass) {
      const bassNote = Array.from(noteById.values()).find(n => n.midi === note.midi - 12);
      if (bassNote) void baseStartNote(bassNote);
      else void baseStartNote(note);
    }
    if (couplerMale) {
      void baseStartNote(note);
    }
    if (couplerFemale) {
      const femaleNote = Array.from(noteById.values()).find(n => n.midi === note.midi + 12);
      if (femaleNote) void baseStartNote(femaleNote);
      else void baseStartNote(note);
    }
  }, [baseStartNote, couplerBass, couplerMale, couplerFemale, noteById]);

  const stopNote = useCallback((id: string) => {
    const note = noteById.get(id);
    if (!note) {
      baseStopNote(id);
      return;
    }

    const hasAnyCoupler = couplerBass || couplerMale || couplerFemale;
    if (!hasAnyCoupler) {
      baseStopNote(note.id);
      return;
    }

    if (couplerBass) {
      const bassNote = Array.from(noteById.values()).find(n => n.midi === note.midi - 12);
      if (bassNote) baseStopNote(bassNote.id);
      else baseStopNote(note.id);
    }
    if (couplerMale) {
      baseStopNote(note.id);
    }
    if (couplerFemale) {
      const femaleNote = Array.from(noteById.values()).find(n => n.midi === note.midi + 12);
      if (femaleNote) baseStopNote(femaleNote.id);
      else baseStopNote(note.id);
    }
  }, [baseStopNote, couplerBass, couplerMale, couplerFemale, noteById]);

  useEffect(() => {
    stopAllNotes();
  }, [couplerBass, couplerMale, couplerFemale, stopAllNotes]);

  // ── Shruti Drone Feature ───────────────────────────────────────────────
  useEffect(() => {
    if (!couplerDrone) return;
    const saNote = NOTE_KEYS.find(n => n.midi % 12 === sargamOffset && n.midi >= 55 && n.midi < 67);
    const paNote = NOTE_KEYS.find(n => n.midi % 12 === (sargamOffset + 7) % 12 && n.midi >= 55 && n.midi < 67);

    if (saNote) void startNote(saNote);
    if (paNote) void startNote(paNote);
    
    return () => {
      if (saNote) stopNote(saNote.id);
      if (paNote) stopNote(paNote.id);
    };
  }, [couplerDrone, sargamOffset, startNote, stopNote]);

  // ── Tanpura Player ─────────────────────────────────────────────────────
  const tanpuraStateRef = useRef({ step: 0 });

  useEffect(() => {
    if (!tanpuraEnabled) return;

    // e.g. tanpuraRoot 0 = C3 (midi 48)
    const rootMidi = 48 + tanpuraRoot;

    const notes = {
      'pa': rootMidi - 5, // G2
      'ma': rootMidi - 7, // F2
      'ni': rootMidi - 1, // B2
    };

    const strings = [
      notes[tanpuraStyle],
      rootMidi + 12, // C4
      rootMidi + 12, // C4
      rootMidi       // C3
    ];

    const cycleTimeMs = (60000 / tanpuraSpeed);

    const interval = setInterval(() => {
      const step = tanpuraStateRef.current.step;
      const midi = strings[step];
      const voiceId = `tanpura-${step}`;
      
      stopMidiNote(voiceId);
      setTimeout(() => {
        void startMidiNote(voiceId, midi, tanpuraVolume);
      }, 5);
      
      tanpuraStateRef.current.step = (step + 1) % 4;
    }, cycleTimeMs);

    return () => {
      clearInterval(interval);
      [0, 1, 2, 3].forEach(i => stopMidiNote(`tanpura-${i}`));
    };
  }, [tanpuraEnabled, tanpuraRoot, tanpuraStyle, tanpuraSpeed, tanpuraVolume, startMidiNote, stopMidiNote]);

  // ── Tabla Player ───────────────────────────────────────────────────────
  const tablaStateRef = useRef({ beat: 0, audioCtx: null as AudioContext | null, gainNode: null as GainNode | null });

  useEffect(() => {
    if (!tablaEnabled) {
      if (tablaStateRef.current.audioCtx && tablaStateRef.current.audioCtx.state === 'running') {
         // Suspend to save resources
         void tablaStateRef.current.audioCtx.suspend();
      }
      return;
    }
    
    if (!tablaStateRef.current.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        tablaStateRef.current.audioCtx = ctx;
        tablaStateRef.current.gainNode = gain;
      }
    } else {
      if (tablaStateRef.current.audioCtx.state === 'suspended') {
         void tablaStateRef.current.audioCtx.resume();
      }
    }

    const taal = TAALS[tablaTaal];
    const cycleTimeMs = (60000 / tablaSpeed);

    const interval = setInterval(() => {
      const state = tablaStateRef.current;
      if (!state.audioCtx || !state.gainNode) return;
      
      const step = state.beat;
      const stroke = taal.pattern[step];
      
      state.gainNode.gain.value = tablaVolume;
      const rootFreq = 440 * Math.pow(2, ((48 + tablaPitch) - 69) / 12);
      
      playTablaStroke(state.audioCtx, state.gainNode, stroke, rootFreq);

      state.beat = (step + 1) % taal.beats;
    }, cycleTimeMs);

    return () => clearInterval(interval);
  }, [tablaEnabled, tablaTaal, tablaSpeed, tablaVolume, tablaPitch]);

  const suggestedKeys = useMemo(() => {
    const suggestions = new Set<string>();
    
    // 1. Chord suggestions
    if (chordMode !== 'off' && activeNoteIds.length > 0) {
      const validPitchClasses = new Set<number>();
      activeNoteIds.forEach(id => {
        const noteDef = NOTE_KEYS.find(n => n.id === id);
        if (noteDef) {
          const rootPc = noteDef.midi % 12;
          if (chordMode === 'major') {
            validPitchClasses.add((rootPc + 4) % 12);
            validPitchClasses.add((rootPc + 7) % 12);
          } else if (chordMode === 'minor') {
            validPitchClasses.add((rootPc + 3) % 12);
            validPitchClasses.add((rootPc + 7) % 12);
          }
        }
      });
      NOTE_KEYS.forEach(n => {
        if (validPitchClasses.has(n.midi % 12)) suggestions.add(n.id);
      });
    }

    // 2. Raga suggestions
    if (selectedRaga) {
      const raga = RAGAS.find(r => r.name === selectedRaga);
      if (raga) {
        const ragaPitchClasses = new Set(raga.intervals.map(i => (i + sargamOffset) % 12));
        NOTE_KEYS.forEach(n => {
          if (ragaPitchClasses.has(n.midi % 12)) suggestions.add(n.id);
        });
      }
    }

    return suggestions;
  }, [activeNoteIds, chordMode, selectedRaga, sargamOffset]);

  const whiteKeys = NOTE_KEYS.filter((n) => n.kind === 'white');
  const blackKeys = NOTE_KEYS.filter((n) => n.kind === 'black');

  // ── Restore / persist settings ───────────────────────────────────────
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const p = JSON.parse(saved) as Record<string, unknown>;
      if (p.labelMode === 'western' || p.labelMode === 'sargam') setLabelMode(p.labelMode);
      if (typeof p.octave === 'number') setOctave(getOctaveOption(p.octave).value);
      if (typeof p.transpose === 'number') setTranspose(p.transpose);
      if (typeof p.volume === 'number') setVolume(p.volume);
      if (typeof p.reverbEnabled === 'boolean') setReverbEnabled(p.reverbEnabled);
      if (p.reedMode === 'single' || p.reedMode === 'double') setReedMode(p.reedMode);
      if (typeof p.zoom === 'number') setZoom(p.zoom);
    } catch { }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(
      { labelMode, octave, transpose, volume, reverbEnabled, reedMode, zoom }
    ));
  }, [labelMode, octave, transpose, volume, reverbEnabled, reedMode, zoom]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.repeat) return;
    // Zoom shortcuts: Ctrl+= / Ctrl+-
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
      return;
    }
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
      return;
    }
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      setZoom(ZOOM_DEFAULT);
      return;
    }
    const note = getNoteKeyByInput(e.key);
    if (!note) return;
    e.preventDefault();
    void startNote(note);
  }, [startNote]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const note = getNoteKeyByInput(e.key);
    if (!note) return;
    stopNote(note.id);
  }, [stopNote]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopAllNotes);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopAllNotes);
      stopAllNotes();
    };
  }, [handleKeyDown, handleKeyUp, stopAllNotes]);

  // ── Mouse-wheel zoom ─────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // HUD visibility is now controlled purely by hover on the panel itself

  const octaveOption = getOctaveOption(octave);

  // Rendered keyboard width at current zoom
  const kbWidth = Math.round(KEYBOARD_BASE_WIDTH * zoom);

  return (
    <>
      {/* ── Global animations ─────────────────────────────────────────── */}
      <style>{`
        @keyframes reedVibrate {
          0%   { transform:translateY(0)    scaleX(1);    }
          12%  { transform:translateY(-3px) scaleX(.98);  }
          25%  { transform:translateY(2px)  scaleX(1.01); }
          38%  { transform:translateY(-2px) scaleX(.99);  }
          50%  { transform:translateY(1px)  scaleX(1.005);}
          65%  { transform:translateY(-.7px)scaleX(.999); }
          80%  { transform:translateY(.4px) scaleX(1.002);}
          100% { transform:translateY(0)    scaleX(1);    }
        }
        @keyframes reedGlow {
          0%,100%{ filter:brightness(1)   drop-shadow(0 0 0 transparent); }
          50%    { filter:brightness(1.7) drop-shadow(0 0 5px rgba(255,200,60,.85)); }
        }
        @keyframes valveFlap {
          0%   { transform:perspective(40px) rotateX(0deg);   opacity:.88; }
          100% { transform:perspective(40px) rotateX(-42deg); opacity:.55; }
        }
        @keyframes valveClose {
          0%   { transform:perspective(40px) rotateX(-42deg); opacity:.55; }
          100% { transform:perspective(40px) rotateX(0deg);   opacity:.88; }
        }
        @keyframes airPuff {
          0%   { opacity:0;   transform:scaleY(0)   translateY(-2px); }
          35%  { opacity:.4;  transform:scaleY(1)   translateY(0);    }
          70%  { opacity:.25; transform:scaleY(1.1) translateY(2px);  }
          100% { opacity:0;   transform:scaleY(0)   translateY(6px);  }
        }
        .reed-active  { animation:reedVibrate .07s ease-in-out infinite, reedGlow .11s ease-in-out infinite; transform-origin:top center; }
        .valve-active { animation:valveFlap   .06s ease-out forwards; transform-origin:top center; }
        .valve-idle   { animation:valveClose  .14s ease-in  forwards; transform-origin:top center; }
        .air-active   { animation:airPuff     .22s ease-out infinite; transform-origin:top center; }
        /* Scrollbar */
        @keyframes couplerBlink {
          0%,100%{ opacity:1;    filter:brightness(1); }
          50%    { opacity:0.55; filter:brightness(1.8) drop-shadow(0 0 6px rgba(255,200,60,.9)); }
        }
        .coupler-on { animation: couplerBlink .55s ease-in-out infinite; }
        .kb-scroll::-webkit-scrollbar-track { background:rgba(0,0,0,.3); }
        .kb-scroll::-webkit-scrollbar-thumb { background:rgba(180,100,30,.5); border-radius:3px; }
      `}</style>

      <div
        ref={scrollRef}
        className="relative flex h-screen w-screen flex-col overflow-hidden select-none"
        style={{ background: 'radial-gradient(ellipse 120% 80% at 50% 110%,#3c2008 0%,#2a1505 40%,#180c02 100%)' }}
      >
        {/* ══ Draggable Webcam (Horizontal Rectangle) ═══════════════════ */}
        {showWebcam && (
          <div 
            className="absolute z-50 overflow-hidden rounded-xl shadow-2xl flex items-center justify-center bg-[#111] cursor-grab active:cursor-grabbing group"
            style={{ 
              width: 280, height: 160, 
              left: camPos.x, top: camPos.y,
              border: '2px solid rgba(255,160,50,.4)', 
              boxShadow: '0 8px 32px rgba(0,0,0,0.9), inset 0 2px 10px rgba(0,0,0,0.5)' 
            }}
            onPointerDown={onCamPointerDown}
            onPointerMove={onCamPointerMove}
            onPointerUp={onCamPointerUp}
            onPointerCancel={onCamPointerUp}
          >
            {/* Hover instruction */}
            <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <span className="bg-black/70 backdrop-blur-sm text-yellow-200/90 text-[10px] tracking-wide px-3 py-1 rounded shadow-lg border border-yellow-500/30">Drag to move</span>
            </div>

            {camError ? (
              <div className="text-amber-500 text-xs px-4 text-center" style={{ fontFamily: 'monospace' }}>
                <span className="block text-[12px] font-bold mb-1">[Camera Notice]</span>
                {camError}
              </div>
            ) : (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover scale-x-[-1] pointer-events-none z-10" 
              />
            )}
          </div>
        )}

        {/* ══ TOP WOOD + COUPLER BUTTONS ════════════════════════════════ */}
        <div className="relative z-10 flex-shrink-0" style={{ height: 62, background: 'linear-gradient(180deg,#7c4520 0%,#5c2e0e 50%,#3d1c06 100%)', boxShadow: '0 6px 24px rgba(0,0,0,.8)' }}>
           <WoodGrain />

          {/* Ventilation slats left */}
          <div className="absolute left-10 top-1/2 -translate-y-1/2 flex gap-4 z-10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-0.5">
                {[0, 1, 2].map((j) => (
                  <div key={j} style={{ width: 3, height: 11, borderRadius: 2, background: 'rgba(0,0,0,.55)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.8)' }} />
                ))}
              </div>
            ))}
          </div> 


          {/* Coupler stop buttons — centre */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 z-20">
            {([
              { label: 'Bass', sub: 'Mandra', active: couplerBass, toggle: () => setCouplerBass(v => !v) },
              { label: 'Male', sub: 'Madhya', active: couplerMale, toggle: () => setCouplerMale(v => !v) },
              { label: 'Female', sub: 'Taar', active: couplerFemale, toggle: () => setCouplerFemale(v => !v) },
              { label: 'Drone', sub: 'Shruti', active: couplerDrone, toggle: () => setCouplerDrone(v => !v) },
            ] as const).map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.toggle}
                title={`${c.label} Coupler`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '6px 14px', borderRadius: 6,
                  background: c.active
                    ? 'linear-gradient(180deg,#d4a030 0%,#a07020 100%)'
                    : 'linear-gradient(180deg,#5a3a18 0%,#3a2008 100%)',
                  border: c.active ? '1px solid rgba(255,200,60,.6)' : '1px solid rgba(0,0,0,.5)',
                  boxShadow: c.active
                    ? '0 0 12px rgba(255,180,30,.55), inset 0 1px 0 rgba(255,255,255,.15)'
                    : 'inset 0 2px 4px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.06)',
                  cursor: 'pointer',
                  transition: 'all .1s ease',
                  transform: c.active ? 'translateY(1px)' : 'translateY(0)',
                  minWidth: 58,
                }}
              >
                {/* Reed-style glow indicator */}
                <div
                  className={c.active ? 'coupler-on' : ''}
                  style={{
                    width: 28, height: 8, borderRadius: 3,
                    background: c.active
                      ? 'linear-gradient(90deg,#f0c030 0%,#fde68a 50%,#f0c030 100%)'
                      : 'linear-gradient(90deg,#3a2810 0%,#4a3018 100%)',
                    boxShadow: c.active ? '0 0 8px rgba(255,200,50,.8)' : 'none',
                    border: c.active ? '1px solid rgba(255,210,80,.5)' : '1px solid rgba(0,0,0,.4)',
                  }}
                />
                {/* Label */}
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', color: c.active ? '#fde68a' : 'rgba(255,200,120,.45)', textTransform: 'uppercase', lineHeight: 1 }}>{c.label}</span>
                <span style={{ fontSize: 8, color: c.active ? 'rgba(255,220,120,.6)' : 'rgba(255,180,80,.2)', lineHeight: 1 }}>{c.sub}</span>
              </button>
            ))}
          </div>

          {/* Ventilation slats right */}
          <div className="absolute right-10 top-1/2 -translate-y-1/2 flex gap-4 z-10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-0.5">
                {[0, 1, 2].map((j) => (
                  <div key={j} style={{ width: 3, height: 11, borderRadius: 2, background: 'rgba(0,0,0,.55)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.8)' }} />
                ))}
              </div>
            ))}
          </div>

          <p className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-light tracking-[.7em] text-amber-200/18 uppercase pointer-events-none">Harmonium</p>
        </div>

        {/* ══ REED CHAMBER (40% space) ══════════════════════════════════ */}
        <div className="relative overflow-hidden" style={{ flex: 4, minHeight: 180, background: 'linear-gradient(180deg,#190902 0%,#291205 55%,#3a1a08 100%)', borderTop: '2px solid rgba(255,140,40,.14)', borderBottom: '3px solid rgba(0,0,0,.8)' }}>
          <WoodGrain opacity={0.05} />
          {/* Reed board plate */}
          <div className="absolute" style={{ top: 12, bottom: 6, left: 32, right: 32, background: 'linear-gradient(180deg,#8a7a5c 0%,#7a6a4c 50%,#6a5a3c 100%)', borderRadius: 4, boxShadow: 'inset 0 2px 8px rgba(0,0,0,.6),0 2px 8px rgba(0,0,0,.4)' }}>
            {/* Board screws */}
            {[4, 20, 36, 52, 68, 84, 96].map((pct) => (
              <div key={pct} style={{ position: 'absolute', top: 4, left: `${pct}%`, width: 7, height: 7, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%,#c8b888,#7a6a50)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.5)' }} />
            ))}

            {/* Scrollable reed strip (synced width with keyboard) */}
            <div className="absolute inset-0 overflow-hidden" style={{ paddingBottom: 6, paddingTop: 22 }}>
              <div className="relative h-full" style={{ width: kbWidth, minWidth: '100%' }}>
                {NOTE_KEYS.map((note, idx) => {
                  const isActive = activeNoteIds.includes(note.id);
                  const reedColor = REED_GOLD[idx % REED_GOLD.length];

                  // Reeds restored to full height
                  const reedLen = 100 + (idx % 7) * 7;

                  const totalKeys = NOTE_KEYS.length;
                  const slotWidthPct = 96 / totalKeys;
                  const leftPct = 2 + idx * slotWidthPct;

                  return (
                    <div key={note.id} style={{ position: 'absolute', bottom: 2, left: `${leftPct}%`, width: `${slotWidthPct * 0.7}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                      {/* Valve flap (झड़पें) */}
                      <div style={{ width: '100%', height: 20, position: 'relative', marginBottom: 2 }}>
                        <div className={isActive ? 'valve-active' : 'valve-idle'} style={{ width: '100%', height: '100%', background: isActive ? 'linear-gradient(180deg,#3a7a68,#1a524a)' : 'linear-gradient(180deg,#383828,#282818)', borderRadius: '2px 2px 0 0', border: '1px solid rgba(0,0,0,.45)', boxShadow: isActive ? '0 2px 6px rgba(52,211,153,.4)' : 'inset 0 1px 2px rgba(0,0,0,.4)' }} />
                        {isActive && <div className="air-active" style={{ position: 'absolute', bottom: -6, left: '15%', width: '70%', height: 10, background: 'linear-gradient(180deg,rgba(180,220,255,.45) 0%,transparent 100%)', borderRadius: '0 0 4px 4px' }} />}
                      </div>
                      {/* Spring */}
                      <div style={{ width: '28%', height: 6, background: isActive ? 'linear-gradient(90deg,#ccc 0%,#eee 50%,#ccc 100%)' : 'linear-gradient(90deg,#888,#aaa,#888)', borderRadius: 1, boxShadow: '0 1px 2px rgba(0,0,0,.5)' }} />
                      {/* Reed tongue (रीड) — wider + taller */}
                      <div className={isActive ? 'reed-active' : ''} style={{ width: '46%', height: reedLen, background: isActive ? `linear-gradient(180deg,${reedColor} 0%,#f0d060 45%,${reedColor} 100%)` : `linear-gradient(180deg,${reedColor}bb 0%,${reedColor}66 100%)`, borderRadius: '2px 2px 6px 6px', boxShadow: isActive ? `0 0 12px rgba(255,200,60,.85),0 3px 8px rgba(0,0,0,.5)` : '0 2px 5px rgba(0,0,0,.4)', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 0, left: '12%', width: '28%', height: '55%', background: 'linear-gradient(180deg,rgba(255,255,255,.38) 0%,transparent 100%)', borderRadius: 1 }} />
                      </div>
                      {/* Reed slot */}
                      <div style={{ width: '52%', height: 4, background: 'rgba(0,0,0,.75)', borderRadius: 1, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.8)' }} />
                    </div>
                  );
                })}
              </div>
            </div>

            <span style={{ position: 'absolute', right: 6, top: 5, fontSize: 7, color: 'rgba(255,200,100,.18)', letterSpacing: '.18em', textTransform: 'uppercase', fontFamily: 'monospace' }}>Reed Board · 23 keys</span>
          </div>
          <SideWood side="left" />
          <SideWood side="right" />
        </div>

        {/* ══ KEY BED (60% space) ═══════════════════════════════════════ */}
        <div className="relative flex flex-col overflow-hidden" style={{ flex: 6, background: 'linear-gradient(180deg,#2e1404 0%,#3a1a08 100%)' }}>
          <SideWood side="left" />
          <SideWood side="right" />
          {/* Key-frame top rail */}
          <div style={{ height: 9, marginLeft: 32, marginRight: 32, background: 'linear-gradient(180deg,#5a3010 0%,#3a1a08 100%)', borderBottom: '2px solid rgba(0,0,0,.6)', boxShadow: '0 4px 12px rgba(0,0,0,.5)' }} />

          {/* Scrollable key bed */}
          <div className="kb-scroll flex flex-1 overflow-x-auto" style={{ paddingLeft: 32, paddingRight: 32, paddingBottom: 6 }}>
            <div className="relative flex-1" style={{ width: kbWidth, minWidth: kbWidth }}>

              {/* ── White keys ──────────────────────────────────────── */}
              {whiteKeys.map((note) => {
                const w = 100 / whiteKeys.length;
                const isActive = activeNoteIds.includes(note.id);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); void startNote(note); }}
                    onPointerUp={() => stopNote(note.id)}
                    onPointerLeave={() => stopNote(note.id)}
                    onPointerCancel={() => stopNote(note.id)}
                    className="flex flex-col justify-between rounded-b-[1.2rem] border border-black/8 px-2 pt-4 pb-3 text-left transition-all duration-75"
                    style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `calc(${note.whiteIndex * w}% + 1px)`,
                      width: `calc(${w}% - 2px)`,
                      background: isActive
                        ? '#f6d2aa'
                        : 'linear-gradient(180deg,#fffdfa 0%,#efe3d5 100%)',
                      boxShadow: isActive
                        ? 'inset 0 -6px 18px rgba(183,124,74,0.22), 0 0 12px rgba(251,191,36,0.25)'
                        : 'inset 0 -10px 24px rgba(183,124,74,0.10)',
                      transform: isActive ? 'translateY(5px)' : 'translateY(0)',
                      transition: 'transform .06s ease-out, background .05s, box-shadow .05s',
                    }}
                  >
                    {/* Glow suggestions */}
                    {suggestedKeys.has(note.id) && !isActive && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[24px] h-[24px] rounded-full bg-amber-400/60 blur-[6px] shadow-[0_0_20px_rgba(251,191,36,0.9)]" />
                    )}
                    {/* Note name at top */}
                    {labelMode !== 'none' && (
                      <div className="pointer-events-none mt-auto flex flex-col items-center">
                        <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#7c3a10' : '#1e293b' }}>
                          {labelMode === 'western' 
                            ? note.western 
                            : SWARAM_NAMES[(note.midi - sargamOffset + 120) % 12]}
                        </span>
                      </div>
                    )}
                    {/* Keyboard keycap badge at bottom */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 999, padding: '3px 7px',
                      background: isActive ? 'rgba(124,58,16,0.18)' : 'rgba(15,23,42,0.07)',
                      fontSize: 'clamp(8px,0.9vw,12px)', fontWeight: 600,
                      color: isActive ? '#7c3a10' : '#475569',
                      letterSpacing: '0.04em', alignSelf: 'flex-start',
                      border: isActive ? '1px solid rgba(124,58,16,0.2)' : '1px solid rgba(0,0,0,0.06)',
                    }}>
                      {note.keycap}
                    </span>
                  </button>
                );
              })}

              {/* ── Black keys ──────────────────────────────────────── */}
              {blackKeys.map((note) => {
                const ww = 100 / whiteKeys.length;
                const bw = ww * 0.58;
                const left = (note.whiteIndex + 1) * ww - bw / 2;
                const isActive = activeNoteIds.includes(note.id);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); void startNote(note); }}
                    onPointerUp={() => stopNote(note.id)}
                    onPointerLeave={() => stopNote(note.id)}
                    onPointerCancel={() => stopNote(note.id)}
                    className="absolute top-0 z-10 flex h-[58%] flex-col justify-between rounded-b-[1rem] border border-black/10 px-1.5 pt-3 pb-2 text-left"
                    style={{
                      left: `${left}%`, width: `${bw}%`,
                      background: isActive
                        ? 'linear-gradient(180deg,#16655e 0%,#0e3f3b 100%)'
                        : 'linear-gradient(180deg,#334155 0%,#111827 100%)',
                      boxShadow: isActive
                        ? '0 0 18px rgba(52,211,153,.4), 0 14px 30px rgba(15,23,42,0.28)'
                        : '0 14px 30px rgba(15,23,42,0.28)',
                      transform: isActive ? 'translateY(4px)' : 'translateY(0)',
                      transition: 'transform .06s ease-out, background .05s, box-shadow .05s',
                    }}
                  >
                    {/* Glow suggestions */}
                    {suggestedKeys.has(note.id) && !isActive && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[20px] h-[20px] rounded-full bg-amber-400/60 blur-[6px] shadow-[0_0_16px_rgba(251,191,36,0.9)]" />
                    )}
                    {/* Note name at top */}
                    {labelMode !== 'none' && (
                      <div className="pointer-events-none mt-auto flex flex-col items-center">
                        <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#6ee7b7' : 'rgba(255,255,255,0.9)' }}>
                          {labelMode === 'western' 
                            ? note.western 
                            : SWARAM_NAMES[(note.midi - sargamOffset + 120) % 12]}
                        </span>
                      </div>
                    )}
                    {/* Keyboard keycap badge at bottom */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 999, padding: '2px 6px',
                      background: isActive ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.1)',
                      fontSize: 'clamp(7px,0.8vw,10px)', fontWeight: 600,
                      color: isActive ? '#6ee7b7' : 'rgba(255,255,255,0.65)',
                      letterSpacing: '0.04em', alignSelf: 'flex-start',
                      border: isActive ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      {note.keycap}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══ BOTTOM WOOD ═══════════════════════════════════════════════ */}
        <div className="relative z-10 flex-shrink-0" style={{ height: 34, background: 'linear-gradient(180deg,#3a1a08 0%,#5c2e0e 60%,#7c4520 100%)', boxShadow: '0 -6px 24px rgba(0,0,0,.7)' }}>
          <WoodGrain />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#8a6030,#c8a040,#8a6030)', opacity: .55 }} />
        </div>

        {/* ══ ZOOM CONTROLS ════════════════════════════════════════════ */}
        <div
          className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 group"
          onMouseEnter={() => setShowZoom(true)}
          onMouseLeave={() => setShowZoom(false)}
        >
          {/* Invisible hover zone so it catches the mouse earlier */}
          <div style={{ position: 'absolute', inset: '-24px -60px' }} />

          {/* Faint hint line when hidden */}
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-2"
            style={{
              width: 120, height: 34,
              borderBottom: '1px dashed rgba(255,160,50,.15)',
              opacity: showZoom ? 0 : 1,
              transition: 'opacity .3s ease'
            }}
          />

          <div
            className="relative flex flex-col items-center gap-1 transition-all duration-300"
            style={{
              opacity: showZoom ? 1 : 0,
              transform: showZoom ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
              pointerEvents: showZoom ? 'auto' : 'none',
            }}
          >
            <div className="flex items-center gap-1" style={{ background: 'rgba(10,5,1,.82)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,150,40,.18)', borderRadius: 999, padding: '4px 10px', boxShadow: '0 6px 24px rgba(0,0,0,.5)' }}>
              {/* Zoom out */}
              <ZoomBtn
                label="−"
                title="Zoom out (Ctrl −)"
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
                disabled={zoom <= ZOOM_MIN}
              />
              {/* Zoom slider */}
              <input
                type="range"
                min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="accent-amber-400"
                style={{ width: 90, cursor: 'pointer' }}
                title="Zoom keyboard"
              />
              {/* Zoom level badge */}
              <button
                type="button"
                title="Reset zoom (Ctrl 0)"
                onClick={() => setZoom(ZOOM_DEFAULT)}
                style={{ fontSize: 10, color: 'rgba(255,200,100,.55)', fontFamily: 'monospace', minWidth: 38, textAlign: 'center', cursor: 'pointer', userSelect: 'none', padding: '2px 4px', borderRadius: 4 }}
                className="hover:text-amber-300 transition-colors"
              >
                {Math.round(zoom * 100)}%
              </button>
              {/* Zoom in */}
              <ZoomBtn
                label="+"
                title="Zoom in (Ctrl +)"
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
                disabled={zoom >= ZOOM_MAX}
              />
            </div>
            {/* Keyboard shortcut hint */}
            <span style={{ fontSize: 9, color: 'rgba(255,200,100,.3)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 2 }}>Ctrl+Scroll to zoom</span>
          </div>
        </div>

        {/* ══ FLOATING HUD — visible on hover or tap ═════════ */}
        <div
          className="absolute top-3 right-3 z-40 group"
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(false)}
        >
          {/* Invisible hover-zone padding so the panel is easy to reach */}
          <div style={{ position: 'absolute', inset: '-12px', pointerEvents: showControls ? 'auto' : 'none' }} />
          <div
            className="flex flex-col gap-2.5 rounded-2xl p-4 transition-all duration-200"
            style={{
              background: 'rgba(12,6,1,.92)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,155,45,.22)', boxShadow: '0 12px 40px rgba(0,0,0,.65)',
              minWidth: 224,
              maxHeight: 'calc(100vh - 76px)',
              overflowY: 'auto',
              opacity: showControls ? 1 : 0,
              transform: showControls ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)',
              pointerEvents: showControls ? 'auto' : 'none',
            }}>
            {/* ── Header + Webcam ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,160,50,.12)', marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,200,100,.5)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Webcam Mirror</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowWebcam(!showWebcam)}
                  style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    background: showWebcam ? 'rgba(251,191,36,.85)' : 'rgba(255,255,255,.08)',
                    color: showWebcam ? '#1a0a00' : 'rgba(255,200,100,.7)',
                    border: showWebcam ? 'none' : '1px solid rgba(255,160,50,.2)',
                    cursor: 'pointer', transition: 'all .15s'
                  }}
                >
                  {showWebcam ? 'Cam On' : 'Cam Off'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowControls(false)}
                  title="Close controls"
                  style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 20,
                    background: 'rgba(255,255,255,.08)', color: 'rgba(255,200,100,.7)',
                    border: '1px solid rgba(255,160,50,.2)', cursor: 'pointer'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* ── Voice Monitor ── */}
            <div style={{
              background: micEnabled ? 'rgba(34,197,94,.07)' : 'transparent',
              borderRadius: 10, padding: '4px 6px',
              border: micEnabled ? '1px solid rgba(34,197,94,.2)' : '1px solid transparent',
              transition: 'all .2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,200,100,.5)', textTransform: 'uppercase', letterSpacing: '.1em', flex: 1 }}>Voice Monitor</span>
                <button onClick={() => setMicEnabled(!micEnabled)} style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: micEnabled ? 'rgba(34,197,94,.85)' : 'rgba(34,197,94,.15)',
                  color: micEnabled ? '#001a08' : 'rgba(34,197,94,.8)',
                  border: 'none', cursor: 'pointer', transition: 'all .15s'
                }}>
                  {micEnabled ? '● Live' : '○ Off'}
                </button>
              </div>
              {micError && <p style={{ fontSize: 8, color: '#f87171', marginTop: 3 }}>{micError}</p>}
              {micEnabled && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <HUDRow label={`Mic Volume ${Math.round(micVolume * 100)}%`}>
                    <input type="range" min="0" max="2" step="0.05" value={micVolume}
                      onChange={(e) => setMicVolume(Number(e.target.value))} className="flex-1 accent-green-500" />
                  </HUDRow>
                  <HUDRow label="Mic Reverb">
                    <HUDChip active={!micReverb} color="amber" onClick={() => setMicReverb(false)}>Dry</HUDChip>
                    <HUDChip active={micReverb} color="teal" onClick={() => setMicReverb(true)}>Hall Echo</HUDChip>
                  </HUDRow>
                </div>
              )}
            </div>

            {/* ── Raga Suggestions ── */}
            <div style={{
              background: selectedRaga ? 'rgba(245,158,11,.07)' : 'transparent',
              borderRadius: 10, padding: '4px 6px',
              border: selectedRaga ? '1px solid rgba(245,158,11,.2)' : '1px solid rgba(255,160,50,.08)',
              transition: 'all .2s'
            }}>
              <div 
                onClick={() => setRagaExpanded(!ragaExpanded)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <span style={{ fontSize: 9, color: 'rgba(255,200,100,.5)', textTransform: 'uppercase', letterSpacing: '.1em', flex: 1 }}>Raga Suggestions ▾</span>
                {selectedRaga && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>{selectedRaga}</span>
                )}
              </div>
              {ragaExpanded && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  <HUDChip active={selectedRaga === null} color="amber" onClick={() => setSelectedRaga(null)}>Off</HUDChip>
                  {RAGAS.map(r => (
                    <HUDChip 
                      key={r.name} 
                      active={selectedRaga === r.name} 
                      color="teal" 
                      onClick={() => setSelectedRaga(r.name)}
                    >
                      {r.name}
                    </HUDChip>
                  ))}
                </div>
              )}
            </div>

            {/* ── Keyboard Labels ── */}
            <HUDRow label="Keyboard Labels">
              {([{ label: 'None', v: 'none' as const }, { label: 'Sargam', v: 'sargam' as const }, { label: 'Western', v: 'western' as const }]).map((o) => (
                <HUDChip key={o.label} active={labelMode === o.v} color="amber" onClick={() => setLabelMode(o.v)}>
                  {o.label}
                </HUDChip>
              ))}
            </HUDRow>
            {labelMode === 'sargam' && (
              <HUDRow label="Sargam Root (Sa)">
                <div className="flex bg-[#111] p-1 border border-white/10 rounded-full w-full overflow-x-auto whitespace-nowrap hide-scrollbars">
                  {WESTERN_NAMES.map((w, idx) => (
                    <button 
                      key={w} 
                      onClick={() => setSargamOffset(idx)}
                      className={cn(
                        "px-2 py-0.5 text-[10px] rounded-full transition-colors flex-shrink-0",
                        sargamOffset === idx ? "bg-amber-500/80 text-amber-950 font-bold" : "text-white/50 hover:bg-white/10"
                      )}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </HUDRow>
            )}
            <HUDRow label="Chord Guide">
              {([{ label: 'Off', v: 'off' as const }, { label: 'Major', v: 'major' as const }, { label: 'Minor', v: 'minor' as const }]).map((o) => (
                <HUDChip key={o.label} active={chordMode === o.v} color="teal" onClick={() => setChordMode(o.v)}>
                  {o.label}
                </HUDChip>
              ))}
            </HUDRow>

            {/* ── Tanpura — collapsible ── */}
            <div
              style={{ background: tanpuraEnabled ? 'rgba(251,191,36,.06)' : 'transparent', borderRadius: 10, padding: '4px 6px', border: tanpuraEnabled ? '1px solid rgba(251,191,36,.15)' : '1px solid transparent', transition: 'all .2s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setTanpuraExpanded(e => !e)}>
                <span style={{ fontSize: 9, color: 'rgba(255,200,100,.5)', textTransform: 'uppercase', letterSpacing: '.1em', flex: 1 }}>Tanpura</span>
                <button
                  onClick={(ev) => { ev.stopPropagation(); setTanpuraEnabled(!tanpuraEnabled); }}
                  style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: tanpuraEnabled ? 'rgba(251,191,36,.85)' : 'rgba(255,255,255,.08)',
                    color: tanpuraEnabled ? '#1a0a00' : 'rgba(255,200,100,.7)',
                    border: 'none', cursor: 'pointer', transition: 'all .15s'
                  }}
                >
                  {tanpuraEnabled ? '● Playing' : '○ Off'}
                </button>
                <span style={{ fontSize: 10, color: 'rgba(255,200,100,.4)', transition: 'transform .2s', display: 'inline-block', transform: tanpuraExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
              </div>
              {tanpuraExpanded && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <HUDRow label="String">
                    {(['pa', 'ma', 'ni'] as const).map(s => (
                      <HUDChip key={s} active={tanpuraStyle === s} color="teal" onClick={() => setTanpuraStyle(s)}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </HUDChip>
                    ))}
                  </HUDRow>
                  <HUDRow label="Root">
                    <div className="flex bg-[#111] p-1 border border-white/10 rounded-full w-full overflow-x-auto whitespace-nowrap hide-scrollbars">
                      {WESTERN_NAMES.map((w, idx) => (
                        <button key={'tan-'+w} onClick={() => setTanpuraRoot(idx)}
                          className={cn("px-2 py-0.5 text-[10px] rounded-full transition-colors flex-shrink-0",
                            tanpuraRoot === idx ? "bg-amber-500/80 text-amber-950 font-bold" : "text-white/50 hover:bg-white/10")}
                        >{w}</button>
                      ))}
                    </div>
                  </HUDRow>
                  <HUDRow label={`Vol ${Math.round(tanpuraVolume * 100)}%`}>
                    <input type="range" min="0.05" max="1.5" step="0.05" value={tanpuraVolume}
                      onChange={(e) => setTanpuraVolume(Number(e.target.value))} className="flex-1 accent-amber-500" />
                  </HUDRow>
                  <HUDRow label={`Speed ${tanpuraSpeed}`}>
                    <input type="range" min="60" max="240" step="5" value={tanpuraSpeed}
                      onChange={(e) => setTanpuraSpeed(Number(e.target.value))} className="flex-1 accent-teal-500" />
                  </HUDRow>
                </div>
              )}
            </div>

            {/* ── Tabla — collapsible ── */}
            <div
              style={{ background: tablaEnabled ? 'rgba(20,184,166,.06)' : 'transparent', borderRadius: 10, padding: '4px 6px', border: tablaEnabled ? '1px solid rgba(20,184,166,.18)' : '1px solid transparent', transition: 'all .2s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setTablaExpanded(e => !e)}>
                <span style={{ fontSize: 9, color: 'rgba(255,200,100,.5)', textTransform: 'uppercase', letterSpacing: '.1em', flex: 1 }}>Tabla</span>
                <button
                  onClick={(ev) => { ev.stopPropagation(); setTablaEnabled(!tablaEnabled); tablaStateRef.current.beat = 0; }}
                  style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: tablaEnabled ? 'rgba(20,184,166,.85)' : 'rgba(255,255,255,.08)',
                    color: tablaEnabled ? '#001a16' : 'rgba(255,200,100,.7)',
                    border: 'none', cursor: 'pointer', transition: 'all .15s'
                  }}
                >
                  {tablaEnabled ? '● Playing' : '○ Off'}
                </button>
                <span style={{ fontSize: 10, color: 'rgba(255,200,100,.4)', transition: 'transform .2s', display: 'inline-block', transform: tablaExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
              </div>
              {tablaExpanded && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <HUDRow label="Taal">
                    <div className="flex bg-[#111] p-1 border border-white/10 rounded-full w-full overflow-x-auto whitespace-nowrap hide-scrollbars">
                      {(Object.entries(TAALS) as Array<[keyof typeof TAALS, typeof TAALS[keyof typeof TAALS]]>).map(([key, taal]) => (
                        <button key={key} onClick={() => { setTablaTaal(key); tablaStateRef.current.beat = 0; }}
                          className={cn("px-2 py-0.5 text-[10px] rounded-full transition-colors flex-shrink-0",
                            tablaTaal === key ? "bg-amber-500/80 text-amber-950 font-bold" : "text-white/50 hover:bg-white/10")}
                        >{taal.name}</button>
                      ))}
                    </div>
                  </HUDRow>
                  <HUDRow label="Root">
                    <div className="flex bg-[#111] p-1 border border-white/10 rounded-full w-full overflow-x-auto whitespace-nowrap hide-scrollbars">
                      {WESTERN_NAMES.map((w, idx) => (
                        <button key={'tbl-'+w} onClick={() => setTablaPitch(idx)}
                          className={cn("px-2 py-0.5 text-[10px] rounded-full transition-colors flex-shrink-0",
                            tablaPitch === idx ? "bg-amber-500/80 text-amber-950 font-bold" : "text-white/50 hover:bg-white/10")}
                        >{w}</button>
                      ))}
                    </div>
                  </HUDRow>
                  <HUDRow label={`Vol ${Math.round(tablaVolume * 100)}%`}>
                    <input type="range" min="0" max="1.5" step="0.05" value={tablaVolume}
                      onChange={(e) => setTablaVolume(Number(e.target.value))} className="flex-1 accent-teal-500" />
                  </HUDRow>
                  <HUDRow label={`Speed ${tablaSpeed}`}>
                    <input type="range" min="60" max="280" step="5" value={tablaSpeed}
                      onChange={(e) => setTablaSpeed(Number(e.target.value))} className="flex-1 accent-amber-500" />
                  </HUDRow>
                </div>
              )}
            </div>

            {/* ── Harmonium Controls ── */}
            <HUDRow label={`Octave Base · ${octaveOption.description}`}>
              {OCTAVE_OPTIONS.map((o) => (
                <HUDChip key={o.value} active={octave === o.value} color="teal" onClick={() => setOctave(o.value)}>
                  {o.shortLabel}
                </HUDChip>
              ))}
            </HUDRow>
            <HUDRow label="Transpose">
              <button className="rounded-full w-7 h-7 flex items-center justify-center text-amber-300/80 hover:bg-white/10 transition" onClick={() => setTranspose((c) => Math.max(-6, c - 1))}>−</button>
              <span className="w-8 text-center text-sm font-mono text-amber-200">{transpose > 0 ? `+${transpose}` : transpose}</span>
              <button className="rounded-full w-7 h-7 flex items-center justify-center text-amber-300/80 hover:bg-white/10 transition" onClick={() => setTranspose((c) => Math.min(6, c + 1))}>+</button>
            </HUDRow>
            <HUDRow label={`Volume · ${Math.round(volume * 100)}%`}>
              <input type="range" min="0.05" max="1.5" step="0.01" value={volume}
                onChange={(e) => setVolume(Number(e.target.value))} className="flex-1 accent-amber-400" />
            </HUDRow>
            <HUDRow label="Reverb">
              {([{ label: 'Dry', v: false }, { label: 'Room', v: true }]).map((o) => (
                <HUDChip key={o.label} active={reverbEnabled === o.v} color="amber" onClick={() => setReverbEnabled(o.v)}>
                  {o.label}
                </HUDChip>
              ))}
            </HUDRow>
            <HUDRow label="Reeds">
              {([{ label: 'Single', v: 'single' as const }, { label: 'Double', v: 'double' as const }]).map((o) => (
                <HUDChip key={o.label} active={reedMode === o.v} color="teal" onClick={() => setReedMode(o.v)}>
                  {o.label}
                </HUDChip>
              ))}
            </HUDRow>
            <div className="text-[9px] text-amber-200/22 text-right mt-0.5">
              {playbackMode === 'samples' ? 'Sample' : 'Synth'} · 23 keys
            </div>
          </div>
        </div>

        {/* Dashed outline button — tappable on touch pads & fades once HUD is open */}
        <button
          type="button"
          onClick={() => setShowControls(true)}
          className="absolute top-3 right-3 z-30"
          style={{
            opacity: showControls ? 0 : 1,
            pointerEvents: showControls ? 'none' : 'auto',
            transition: 'opacity .2s',
            background: 'rgba(12,6,1,.45)',
            borderRadius: 14,
          }}
        >
          <div style={{ width: 176, height: 38, border: '1px dashed rgba(255,160,50,.32)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 9, color: 'rgba(255,200,100,.65)', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600 }}>Controls / Options</p>
          </div>
        </button>

        {/* REC BUTTON */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={cn(
            "absolute bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xl transition-all",
            isRecording 
              ? "bg-red-900/80 border-red-500 text-red-100 animate-pulse" 
              : "bg-black/60 border-white/10 text-white/70 hover:bg-black/80 hover:text-white"
          )}
        >
          <div className={cn("w-2.5 h-2.5 rounded-full", isRecording ? "bg-red-500" : "bg-red-500/50")} />
          <span className="text-xs font-semibold tracking-wider uppercase">
            {isRecording ? "Recording..." : "Record Session"}
          </span>
        </button>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function WoodGrain({ opacity = 0.11 }: { opacity?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ opacity, backgroundImage: `repeating-linear-gradient(87deg,transparent,transparent 13px,rgba(255,175,75,.28) 13px,rgba(255,175,75,.28) 14px),repeating-linear-gradient(89deg,transparent,transparent 27px,rgba(200,125,35,.14) 27px,rgba(200,125,35,.14) 29px)` }} />
  );
}

function SideWood({ side }: { side: 'left' | 'right' }) {
  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, [side]: 0, width: 32, zIndex: 20, background: side === 'left' ? 'linear-gradient(90deg,#6b3518 0%,#4a2208 60%,#2e1404 100%)' : 'linear-gradient(270deg,#6b3518 0%,#4a2208 60%,#2e1404 100%)', borderRight: side === 'left' ? '1px solid rgba(255,135,35,.1)' : 'none', borderLeft: side === 'right' ? '1px solid rgba(255,135,35,.1)' : 'none' }} />
  );
}

function ZoomBtn({ label, title, onClick, disabled }: { label: string; title: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center text-base font-bold transition-all',
        disabled
          ? 'text-white/15 cursor-not-allowed'
          : 'text-amber-300/80 hover:bg-amber-500/20 hover:text-amber-200 active:scale-90'
      )}
    >
      {label}
    </button>
  );
}

function HUDRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-medium uppercase tracking-widest text-amber-200/32">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function HUDChip({ active, color, onClick, children }: { active: boolean; color: 'amber' | 'teal'; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium border transition-all duration-150',
        active
          ? (color === 'amber' ? 'bg-amber-500/80 text-amber-950 border-amber-400/50' : 'bg-teal-600/80 text-white border-teal-500/50')
          : 'bg-white/8 text-white/52 border-white/10 hover:bg-white/15'
      )}
    >{children}</button>
  );
}
