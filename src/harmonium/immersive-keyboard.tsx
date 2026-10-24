import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import {
  auth,
  checkGoogleRedirectResult,
  db,
  deleteHarmoniumPresetFromCloud,
  formatAuthError,
  handleFirestoreError,
  HarmoniumPresetRecord,
  MAX_PRESET_NAME_LENGTH,
  OperationType,
  saveHarmoniumPresetToCloud,
  saveUserPreferencesToCloud,
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOutUser,
} from '../firebase';
import {
  getNoteKeyByInput,
  getOctaveOption,
  NOTE_KEYS,
  NoteKey,
  OCTAVE_OPTIONS,
  STORAGE_KEY,
  SWARAM_NAMES,
  WESTERN_NAMES,
} from './constants';
import { ReedMode, useHarmoniumPlayer } from './use-harmonium-player';
import { useMidiKeyboard } from './use-midi-keyboard';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const TAALS = {
  tintal: {
    name: 'Tintal (16)',
    beats: 16,
    pattern: [
      'dha', 'dhin', 'dhin', 'dha',
      'dha', 'dhin', 'dhin', 'dha',
      'dha', 'tin', 'tin', 'ta',
      'ta', 'dhin', 'dhin', 'dha',
    ],
  },
  rupak: {
    name: 'Rupak (7)',
    beats: 7,
    pattern: ['tin', 'tin', 'na', 'dhin', 'na', 'dhin', 'na'],
  },
  jhaptal: {
    name: 'Jhaptal (10)',
    beats: 10,
    pattern: ['dhi', 'na', 'dhi', 'dhi', 'na', 'ti', 'na', 'dhi', 'dhi', 'na'],
  },
  ektal: {
    name: 'Ektal (12)',
    beats: 12,
    pattern: [
      'dhin', 'dhin', 'dha', 'ge',
      'tu', 'na', 'kat', 'ta',
      'dha', 'ge', 'dhin', 'na',
    ],
  },
  kaharwa: {
    name: 'Kaharwa (8)',
    beats: 8,
    pattern: ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'],
  },
  dadra: {
    name: 'Dadra (6)',
    beats: 6,
    pattern: ['dha', 'dhin', 'na', 'dha', 'tin', 'na'],
  },
} as const;

export const RAGAS = [
  { name: 'Bilaval', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Yaman', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Bhairav', intervals: [0, 1, 4, 5, 7, 8, 11] },
  { name: 'Kafi', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Bhupali', intervals: [0, 2, 4, 7, 9] },
] as const;

function playTablaStroke(
  context: AudioContext,
  dest: AudioNode,
  stroke: string,
  rootFreq: number
) {
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
    osc.frequency.setValueAtTime(rootFreq * 1.5, t);

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [labelMode, setLabelMode] = useState<'western' | 'sargam' | 'none'>('sargam');
  const [sargamOffset, setSargamOffset] = useState<number>(0); // 0 = C is Sa
  const [octave, setOctave] = useState(4);
  const [transpose, setTranspose] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reedMode, setReedMode] = useState<ReedMode>('single');
  const [chordMode, setChordMode] = useState<'off' | 'major' | 'minor'>('off');

  const [couplerBass, setCouplerBass] = useState(false);
  const [couplerMale, setCouplerMale] = useState(false);
  const [couplerFemale, setCouplerFemale] = useState(false);
  const [couplerDrone, setCouplerDrone] = useState(false);

  const [tanpuraEnabled, setTanpuraEnabled] = useState(false);
  const [tanpuraStyle, setTanpuraStyle] = useState<'pa' | 'ma' | 'ni'>('pa');
  const [tanpuraRoot, setTanpuraRoot] = useState(0); // 0 = C
  const [tanpuraVolume, setTanpuraVolume] = useState(0.5);
  const [tanpuraSpeed, setTanpuraSpeed] = useState(120);

  const [tablaEnabled, setTablaEnabled] = useState(false);
  const [tablaTaal, setTablaTaal] = useState<keyof typeof TAALS>('tintal');
  const [tablaVolume, setTablaVolume] = useState(0.6);
  const [tablaSpeed, setTablaSpeed] = useState(160);
  const [tablaPitch, setTablaPitch] = useState(0);

  const [selectedRaga, setSelectedRaga] = useState<string | null>(null);

  const {
    activeNoteIds,
    playbackMode,
    setMidiSustain,
    startNote: baseStartNote,
    stopNote: baseStopNote,
    stopAllNotes,
    startMidiNote,
    stopMidiNote,
  } = useHarmoniumPlayer({
    octave,
    transpose,
    volume,
    reverbEnabled,
    reedMode,
  });

  useMidiKeyboard({
    onNoteOn: (voiceId, midi) => void startMidiNote(voiceId, midi),
    onNoteOff: (voiceId) => stopMidiNote(voiceId),
    onSustainChange: setMidiSustain,
    onVolumeChange: setVolume,
  });

  const noteById = useMemo(
    () => new Map<string, NoteKey>(NOTE_KEYS.map((n) => [n.id, n])),
    []
  );

  // Exact Coupler Logic from peedutronix/harmonium
  const startNote = useCallback(
    (note: NoteKey) => {
      const hasAnyCoupler = couplerBass || couplerMale || couplerFemale;
      if (!hasAnyCoupler) {
        void baseStartNote(note);
        return;
      }

      if (couplerBass) {
        const bassNote = Array.from(noteById.values()).find(
          (n) => n.midi === note.midi - 12
        );
        if (bassNote) void baseStartNote(bassNote);
        else void baseStartNote(note);
      }
      if (couplerMale) {
        void baseStartNote(note);
      }
      if (couplerFemale) {
        const femaleNote = Array.from(noteById.values()).find(
          (n) => n.midi === note.midi + 12
        );
        if (femaleNote) void baseStartNote(femaleNote);
        else void baseStartNote(note);
      }
    },
    [baseStartNote, couplerBass, couplerMale, couplerFemale, noteById]
  );

  const stopNote = useCallback(
    (id: string) => {
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
        const bassNote = Array.from(noteById.values()).find(
          (n) => n.midi === note.midi - 12
        );
        if (bassNote) baseStopNote(bassNote.id);
        else baseStopNote(note.id);
      }
      if (couplerMale) {
        baseStopNote(note.id);
      }
      if (couplerFemale) {
        const femaleNote = Array.from(noteById.values()).find(
          (n) => n.midi === note.midi + 12
        );
        if (femaleNote) baseStopNote(femaleNote.id);
        else baseStopNote(note.id);
      }
    },
    [baseStopNote, couplerBass, couplerMale, couplerFemale, noteById]
  );

  useEffect(() => {
    stopAllNotes();
  }, [couplerBass, couplerMale, couplerFemale, stopAllNotes]);

  // Shruti Drone Feature from peedutronix/harmonium
  useEffect(() => {
    if (!couplerDrone) return;
    const saNote = NOTE_KEYS.find(
      (n) => n.midi % 12 === sargamOffset && n.midi >= 55 && n.midi < 67
    );
    const paNote = NOTE_KEYS.find(
      (n) => n.midi % 12 === (sargamOffset + 7) % 12 && n.midi >= 55 && n.midi < 67
    );

    if (saNote) void startNote(saNote);
    if (paNote) void startNote(paNote);

    return () => {
      if (saNote) stopNote(saNote.id);
      if (paNote) stopNote(paNote.id);
    };
  }, [couplerDrone, sargamOffset, startNote, stopNote]);

  // Tanpura Player from peedutronix/harmonium
  const tanpuraStateRef = useRef({ step: 0 });
  useEffect(() => {
    if (!tanpuraEnabled) return;

    const rootMidi = 48 + tanpuraRoot;
    const notes = {
      pa: rootMidi - 5,
      ma: rootMidi - 7,
      ni: rootMidi - 1,
    };

    const strings = [
      notes[tanpuraStyle],
      rootMidi + 12,
      rootMidi + 12,
      rootMidi,
    ];

    const cycleTimeMs = 60000 / tanpuraSpeed;

    const interval = window.setInterval(() => {
      const step = tanpuraStateRef.current.step;
      const midi = strings[step];
      const voiceId = `tanpura-${step}`;

      stopMidiNote(voiceId);
      window.setTimeout(() => {
        void startMidiNote(voiceId, midi, tanpuraVolume);
      }, 5);

      tanpuraStateRef.current.step = (step + 1) % 4;
    }, cycleTimeMs);

    return () => {
      window.clearInterval(interval);
      [0, 1, 2, 3].forEach((i) => stopMidiNote(`tanpura-${i}`));
    };
  }, [
    tanpuraEnabled,
    tanpuraRoot,
    tanpuraStyle,
    tanpuraSpeed,
    tanpuraVolume,
    startMidiNote,
    stopMidiNote,
  ]);

  // Tabla Player from peedutronix/harmonium
  const tablaStateRef = useRef({
    beat: 0,
    audioCtx: null as AudioContext | null,
    gainNode: null as GainNode | null,
  });

  useEffect(() => {
    if (!tablaEnabled) {
      if (
        tablaStateRef.current.audioCtx &&
        tablaStateRef.current.audioCtx.state === 'running'
      ) {
        void tablaStateRef.current.audioCtx.suspend();
      }
      return;
    }

    if (!tablaStateRef.current.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        tablaStateRef.current.audioCtx = ctx;
        tablaStateRef.current.gainNode = gain;
      }
    } else if (tablaStateRef.current.audioCtx.state === 'suspended') {
      void tablaStateRef.current.audioCtx.resume();
    }

    const taal = TAALS[tablaTaal];
    const cycleTimeMs = 60000 / tablaSpeed;

    const interval = window.setInterval(() => {
      const state = tablaStateRef.current;
      if (!state.audioCtx || !state.gainNode) return;

      const step = state.beat;
      const stroke = taal.pattern[step];

      state.gainNode.gain.value = tablaVolume;
      const rootFreq = 440 * Math.pow(2, (48 + tablaPitch - 69) / 12);

      playTablaStroke(state.audioCtx, state.gainNode, stroke, rootFreq);
      state.beat = (step + 1) % taal.beats;
    }, cycleTimeMs);

    return () => window.clearInterval(interval);
  }, [tablaEnabled, tablaTaal, tablaSpeed, tablaVolume, tablaPitch]);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | undefined>(undefined);
  const [authErrorDomain, setAuthErrorDomain] = useState<string | undefined>(undefined);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [presets, setPresets] = useState<HarmoniumPresetRecord[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const loadedCloudPrefsRef = useRef(false);

  // Full Screen & Device Settings Lock state (with explicit user permission)
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(true);
  const [deviceLockEnabled, setDeviceLockEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [keyboardLockActive, setKeyboardLockActive] = useState(false);
  const [orientationLocked, setOrientationLocked] = useState(false);
  const [lockStatusMessage, setLockStatusMessage] = useState<string | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (
            type: 'screen'
          ) => Promise<{
            release: () => Promise<void>;
            addEventListener?: (type: string, listener: () => void) => void;
          }>;
        };
      };
      if (nav.wakeLock?.request) {
        const sentinel = await nav.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener?.('release', () => {
          setWakeLockActive(false);
        });
      }
    } catch {
      setWakeLockActive(false);
    }
  }, []);

  const enableFullScreenAndDeviceLock = useCallback(async () => {
    setDeviceLockEnabled(true);
    setShowPermissionPrompt(false);
    setLockStatusMessage(null);

    let enteredFs = Boolean(
      document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement
    );

    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };
      if (!enteredFs) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen({ navigationUI: 'hide' });
          enteredFs = true;
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
          enteredFs = true;
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
          enteredFs = true;
        }
      }
    } catch {
      setLockStatusMessage(
        'Pad gesture shield active. (Browser frame restricted full-screen window; open in standalone tab for full screen).'
      );
    }

    setIsFullscreen(
      Boolean(
        document.fullscreenElement ||
          (document as Document & { webkitFullscreenElement?: Element | null })
            .webkitFullscreenElement ||
          enteredFs
      )
    );

    // Lock screen orientation to landscape on supported tablets/pads
    try {
      const scr = window.screen as Screen & {
        orientation?: {
          lock?: (mode: string) => Promise<void>;
        };
      };
      if (scr.orientation?.lock) {
        await scr.orientation.lock('landscape');
        setOrientationLocked(true);
      }
    } catch {
      // Desktop or unsupported orientation lock
    }

    // Lock system keyboard shortcuts in Chromium fullscreen
    try {
      const nav = navigator as Navigator & {
        keyboard?: {
          lock?: (keys?: string[]) => Promise<void>;
        };
      };
      if (nav.keyboard?.lock) {
        await nav.keyboard.lock();
        setKeyboardLockActive(true);
      }
    } catch {
      // Unsupported outside top-level fullscreen
    }

    // Request Screen Wake Lock so display never dims or sleeps
    await acquireWakeLock();
  }, [acquireWakeLock]);

  const disableFullScreenAndDeviceLock = useCallback(async () => {
    setDeviceLockEnabled(false);
    setLockStatusMessage(null);

    try {
      const nav = navigator as Navigator & {
        keyboard?: { unlock?: () => void };
      };
      nav.keyboard?.unlock?.();
      setKeyboardLockActive(false);
    } catch {
      // Ignore
    }

    try {
      const scr = window.screen as Screen & {
        orientation?: { unlock?: () => void };
      };
      scr.orientation?.unlock?.();
      setOrientationLocked(false);
    } catch {
      // Ignore
    }

    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      setWakeLockActive(false);
    } catch {
      // Ignore
    }

    try {
      const docWithWebkit = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
        webkitFullscreenElement?: Element | null;
      };
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (docWithWebkit.webkitFullscreenElement && docWithWebkit.webkitExitFullscreen) {
        await docWithWebkit.webkitExitFullscreen();
      }
      setIsFullscreen(false);
    } catch {
      // Ignore
    }
  }, []);

  // Track fullscreen changes & re-acquire wake lock on visibility change
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = Boolean(
        document.fullscreenElement ||
          (document as Document & { webkitFullscreenElement?: Element | null })
            .webkitFullscreenElement
      );
      setIsFullscreen(fs);
      if (!fs) {
        setKeyboardLockActive(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && deviceLockEnabled) {
        void acquireWakeLock();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [deviceLockEnabled, acquireWakeLock]);

  // Strict Chrome & Device Gesture Shield when enabled
  useEffect(() => {
    if (!deviceLockEnabled) return;

    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const preventBrowserTouchNavigation = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      // Allow vertical scrolling inside the options drawer or modal
      if (target?.closest('[data-allow-scroll="true"]')) {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const preventBrowserHotkeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (
        e.key === 'F5' ||
        e.key === 'F11' ||
        (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) ||
        ((e.ctrlKey || e.metaKey) &&
          ['r', 'R', 'w', 'W', 't', 'T', '+', '-', '=', '0'].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    document.addEventListener('wheel', preventWheelZoom, { passive: false });
    document.addEventListener('touchmove', preventBrowserTouchNavigation, {
      passive: false,
    });
    document.addEventListener('selectstart', preventGesture);
    document.addEventListener('dragstart', preventGesture);
    window.addEventListener('keydown', preventBrowserHotkeys, { capture: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('wheel', preventWheelZoom);
      document.removeEventListener('touchmove', preventBrowserTouchNavigation);
      document.removeEventListener('selectstart', preventGesture);
      document.removeEventListener('dragstart', preventGesture);
      window.removeEventListener('keydown', preventBrowserHotkeys, {
        capture: true,
      });
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [deviceLockEnabled]);

  // Restore / persist settings from localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const p = JSON.parse(saved) as Record<string, unknown>;
      if (p.labelMode === 'western' || p.labelMode === 'sargam' || p.labelMode === 'none') {
        setLabelMode(p.labelMode);
      }
      if (typeof p.octave === 'number') setOctave(getOctaveOption(p.octave).value);
      if (typeof p.transpose === 'number') setTranspose(p.transpose);
      if (typeof p.volume === 'number') setVolume(p.volume);
      if (typeof p.reverbEnabled === 'boolean') setReverbEnabled(p.reverbEnabled);
      if (p.reedMode === 'single' || p.reedMode === 'double') setReedMode(p.reedMode);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          labelMode,
          octave,
          transpose,
          volume,
          reverbEnabled,
          reedMode,
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [labelMode, octave, transpose, volume, reverbEnabled, reedMode]);

  // Firebase Auth listener + Redirect result handler
  useEffect(() => {
    void checkGoogleRedirectResult().catch((err) => {
      const formatted = formatAuthError(err);
      setAuthError(formatted.message);
      setAuthErrorCode(formatted.code);
      setAuthErrorDomain(formatted.domain);
    });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      setAuthLoading(false);
      if (currentUser) {
        setAuthError(null);
        setAuthErrorCode(undefined);
        setAuthErrorDomain(undefined);
      } else {
        loadedCloudPrefsRef.current = false;
        setPresets([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null);
    setAuthErrorCode(undefined);
    setAuthErrorDomain(undefined);
    setAuthLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.user) {
        setCloudStatus(
          `Signed in as ${result.user.email ?? result.user.displayName ?? 'User'}`
        );
        window.setTimeout(() => setCloudStatus(null), 3000);
      }
    } catch (err) {
      const formatted = formatAuthError(err);
      setAuthError(formatted.message);
      setAuthErrorCode(formatted.code);
      setAuthErrorDomain(formatted.domain);
      setSidebarOpen(true);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleGoogleRedirectSignIn = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      const formatted = formatAuthError(err);
      setAuthError(formatted.message);
      setAuthErrorCode(formatted.code);
      setAuthErrorDomain(formatted.domain);
      setAuthLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOutUser();
      setCloudStatus('Signed out');
      window.setTimeout(() => setCloudStatus(null), 2000);
    } catch (err) {
      const formatted = formatAuthError(err);
      setAuthError(formatted.message);
    }
  }, []);

  // Firestore listeners for user preferences & saved presets
  useEffect(() => {
    if (!authReady || !user) return;

    const prefPath = `users/${user.uid}/settings/preferences`;
    const unsubPrefs = onSnapshot(
      doc(db, 'users', user.uid, 'settings', 'preferences'),
      (snap) => {
        if (!snap.exists()) {
          loadedCloudPrefsRef.current = true;
          return;
        }
        const data = snap.data();
        if (
          data.labelMode === 'none' ||
          data.labelMode === 'sargam' ||
          data.labelMode === 'western'
        ) {
          setLabelMode(data.labelMode);
        }
        if (typeof data.sargamOffset === 'number') {
          setSargamOffset(Math.min(11, Math.max(0, data.sargamOffset)));
        }
        if (typeof data.octave === 'number') {
          setOctave(getOctaveOption(data.octave).value);
        }
        if (typeof data.transpose === 'number') {
          setTranspose(Math.min(12, Math.max(-12, data.transpose)));
        }
        if (typeof data.volume === 'number') {
          setVolume(Math.min(1, Math.max(0, data.volume)));
        }
        if (typeof data.reverbEnabled === 'boolean') {
          setReverbEnabled(data.reverbEnabled);
        }
        if (data.reedMode === 'single' || data.reedMode === 'double') {
          setReedMode(data.reedMode);
        }
        if (
          data.chordMode === 'off' ||
          data.chordMode === 'major' ||
          data.chordMode === 'minor'
        ) {
          setChordMode(data.chordMode);
        }
        if (typeof data.couplerBass === 'boolean') setCouplerBass(data.couplerBass);
        if (typeof data.couplerMale === 'boolean') setCouplerMale(data.couplerMale);
        if (typeof data.couplerFemale === 'boolean') {
          setCouplerFemale(data.couplerFemale);
        }
        loadedCloudPrefsRef.current = true;
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, prefPath);
      }
    );

    const presetsPath = `users/${user.uid}/presets`;
    const unsubPresets = onSnapshot(
      collection(db, 'users', user.uid, 'presets'),
      (snap) => {
        const list: HarmoniumPresetRecord[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ownerId: String(d.ownerId ?? user.uid),
            name: String(d.name ?? 'Preset'),
            labelMode:
              d.labelMode === 'none' || d.labelMode === 'western'
                ? d.labelMode
                : 'sargam',
            sargamOffset: typeof d.sargamOffset === 'number' ? d.sargamOffset : 0,
            octave: typeof d.octave === 'number' ? d.octave : 4,
            transpose: typeof d.transpose === 'number' ? d.transpose : 0,
            volume: typeof d.volume === 'number' ? d.volume : 0.5,
            reverbEnabled: Boolean(d.reverbEnabled),
            reedMode: d.reedMode === 'double' ? 'double' : 'single',
            couplerBass: Boolean(d.couplerBass),
            couplerMale: Boolean(d.couplerMale),
            couplerFemale: Boolean(d.couplerFemale),
          });
        });
        setPresets(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, presetsPath);
      }
    );

    return () => {
      unsubPrefs();
      unsubPresets();
    };
  }, [authReady, user]);

  // Debounced auto-sync of user preferences to Firestore when signed in
  useEffect(() => {
    if (!authReady || !user || !loadedCloudPrefsRef.current) return;

    const timer = window.setTimeout(() => {
      void saveUserPreferencesToCloud(user.uid, {
        labelMode,
        sargamOffset,
        octave,
        transpose,
        volume,
        reverbEnabled,
        reedMode,
        chordMode,
        couplerBass,
        couplerMale,
        couplerFemale,
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    authReady,
    user,
    labelMode,
    sargamOffset,
    octave,
    transpose,
    volume,
    reverbEnabled,
    reedMode,
    chordMode,
    couplerBass,
    couplerMale,
    couplerFemale,
  ]);

  const handleSavePreset = useCallback(async () => {
    if (!user) return;
    const trimmed = newPresetName.trim().slice(0, MAX_PRESET_NAME_LENGTH);
    if (!trimmed) return;
    const presetId = `preset_${Date.now()}`;
    await saveHarmoniumPresetToCloud(user.uid, presetId, trimmed, {
      labelMode,
      sargamOffset,
      octave,
      transpose,
      volume,
      reverbEnabled,
      reedMode,
      couplerBass,
      couplerMale,
      couplerFemale,
    });
    setNewPresetName('');
    setCloudStatus('Preset saved');
    window.setTimeout(() => setCloudStatus(null), 2000);
  }, [
    user,
    newPresetName,
    labelMode,
    sargamOffset,
    octave,
    transpose,
    volume,
    reverbEnabled,
    reedMode,
    couplerBass,
    couplerMale,
    couplerFemale,
  ]);

  const handleApplyPreset = useCallback((p: HarmoniumPresetRecord) => {
    setLabelMode(p.labelMode);
    setSargamOffset(p.sargamOffset);
    setOctave(p.octave);
    setTranspose(p.transpose);
    setVolume(p.volume);
    setReverbEnabled(p.reverbEnabled);
    setReedMode(p.reedMode);
    setCouplerBass(p.couplerBass);
    setCouplerMale(p.couplerMale);
    setCouplerFemale(p.couplerFemale);
  }, []);

  const suggestedKeys = useMemo(() => {
    const suggestions = new Set<string>();

    if (chordMode !== 'off' && activeNoteIds.length > 0) {
      const validPitchClasses = new Set<number>();
      activeNoteIds.forEach((id) => {
        const noteDef = NOTE_KEYS.find((n) => n.id === id);
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
      NOTE_KEYS.forEach((n) => {
        if (validPitchClasses.has(n.midi % 12)) suggestions.add(n.id);
      });
    }

    if (selectedRaga) {
      const raga = RAGAS.find((r) => r.name === selectedRaga);
      if (raga) {
        const ragaPitchClasses = new Set(
          raga.intervals.map((i) => (i + sargamOffset) % 12)
        );
        NOTE_KEYS.forEach((n) => {
          if (ragaPitchClasses.has(n.midi % 12)) suggestions.add(n.id);
        });
      }
    }

    return suggestions;
  }, [activeNoteIds, chordMode, selectedRaga, sargamOffset]);

  const whiteKeys = useMemo(
    () => NOTE_KEYS.filter((n) => n.kind === 'white'),
    []
  );
  const blackKeys = useMemo(
    () => NOTE_KEYS.filter((n) => n.kind === 'black'),
    []
  );

  // Unified Multi-Touch & Pointer tracking (each finger/pointer has its own key in the map)
  const pointerNotesRef = useRef<Map<string, string>>(new Map());

  const resolveNoteIdAtPoint = useCallback(
    (clientX: number, clientY: number, target?: EventTarget | null): string | null => {
      const targetEl = (target as HTMLElement | null)?.closest?.('[data-note-id]');
      if (targetEl) {
        const id = targetEl.getAttribute('data-note-id');
        if (id) return id;
      }
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return null;
      const keyEl = el.closest('[data-note-id]') as HTMLElement | null;
      return keyEl?.getAttribute('data-note-id') ?? null;
    },
    []
  );

  const updatePointerNote = useCallback(
    (pointerKey: string, nextNoteId: string | null, forceRetrigger: boolean = false) => {
      const prevNoteId = pointerNotesRef.current.get(pointerKey) ?? null;
      if (prevNoteId === nextNoteId && !forceRetrigger) return;

      if (nextNoteId) {
        pointerNotesRef.current.set(pointerKey, nextNoteId);
        const note = noteById.get(nextNoteId);
        if (note) {
          startNote(note);
        }
      } else {
        pointerNotesRef.current.delete(pointerKey);
      }

      if (prevNoteId && prevNoteId !== nextNoteId) {
        const stillHeldByAnotherFinger = Array.from(
          pointerNotesRef.current.values()
        ).includes(prevNoteId);
        if (!stillHeldByAnotherFinger) {
          stopNote(prevNoteId);
        }
      }
    },
    [noteById, startNote, stopNote]
  );

  // Hardware multi-touch handlers (tracks every finger simultaneously via touch.identifier)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const noteId = resolveNoteIdAtPoint(
          touch.clientX,
          touch.clientY,
          touch.target
        );
        updatePointerNote(`touch-${touch.identifier}`, noteId, true);
      }
    },
    [resolveNoteIdAtPoint, updatePointerNote]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const noteId = resolveNoteIdAtPoint(touch.clientX, touch.clientY);
        updatePointerNote(`touch-${touch.identifier}`, noteId, false);
      }
    },
    [resolveNoteIdAtPoint, updatePointerNote]
  );

  const handleTouchEndOrCancel = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        updatePointerNote(`touch-${touch.identifier}`, null, false);
      }

      // Reconcile any orphaned entries against remaining active touches
      const remainingTouchKeys = new Set<string>();
      for (let i = 0; i < e.touches.length; i++) {
        remainingTouchKeys.add(`touch-${e.touches[i].identifier}`);
      }
      for (const key of Array.from(pointerNotesRef.current.keys())) {
        if (key.startsWith('touch-') && !remainingTouchKeys.has(key)) {
          updatePointerNote(key, null, false);
        }
      }
    },
    [updatePointerNote]
  );

  // Pointer handlers strictly for non-touch (mouse / stylus) so touch events never duplicate
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture errors
      }

      const noteId = resolveNoteIdAtPoint(e.clientX, e.clientY, e.target);
      updatePointerNote(`ptr-${e.pointerId}`, noteId, true);
    },
    [resolveNoteIdAtPoint, updatePointerNote]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      const key = `ptr-${e.pointerId}`;
      if (!pointerNotesRef.current.has(key)) return;
      const noteId = resolveNoteIdAtPoint(e.clientX, e.clientY);
      updatePointerNote(key, noteId, false);
    },
    [resolveNoteIdAtPoint, updatePointerNote]
  );

  const handlePointerUpOrCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      updatePointerNote(`ptr-${e.pointerId}`, null, false);
    },
    [updatePointerNote]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const note = getNoteKeyByInput(e.key);
      if (!note) return;
      e.preventDefault();
      startNote(note);
    },
    [startNote]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const note = getNoteKeyByInput(e.key);
      if (!note) return;
      stopNote(note.id);
    },
    [stopNote]
  );

  useEffect(() => {
    const handleBlur = () => {
      pointerNotesRef.current.clear();
      setMidiSustain(false);
      stopAllNotes();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      stopAllNotes();
    };
  }, [handleKeyDown, handleKeyUp, setMidiSustain, stopAllNotes]);

  const octaveOption = getOctaveOption(octave);

  return (
    <div
      className="relative flex h-screen w-screen flex-row overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(ellipse 120% 80% at 50% 110%,#3c2008 0%,#2a1505 40%,#180c02 100%)',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ══ MAIN FULL-HEIGHT HARMONIUM KEYPAD (NO REEDS SECTION) ════════ */}
      <div className="relative flex flex-1 flex-col h-full overflow-hidden">
        {/* Top Wood Bar with Coupler Stops + Side Option Bar Toggle */}
        <div
          className="relative z-20 flex items-center justify-between px-4 flex-shrink-0"
          style={{
            height: 52,
            background:
              'linear-gradient(180deg,#7c4520 0%,#5c2e0e 50%,#3d1c06 100%)',
            boxShadow: '0 6px 24px rgba(0,0,0,.8)',
          }}
        >
          <WoodGrain />

          {/* Ventilation slats left */}
          <div className="relative z-10 flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-0.5">
                {[0, 1, 2].map((j) => (
                  <div
                    key={j}
                    style={{
                      width: 3,
                      height: 11,
                      borderRadius: 2,
                      background: 'rgba(0,0,0,.55)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,.8)',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Coupler Stop Buttons — Centre */}
          <div className="relative z-20 flex items-center gap-2.5">
            {([
              { label: 'Bass', active: couplerBass, toggle: () => setCouplerBass((v) => !v) },
              { label: 'Male', active: couplerMale, toggle: () => setCouplerMale((v) => !v) },
              { label: 'Female', active: couplerFemale, toggle: () => setCouplerFemale((v) => !v) },
            ] as const).map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.toggle}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  padding: '5px 12px',
                  borderRadius: 6,
                  background: c.active
                    ? 'linear-gradient(180deg,#d4a030 0%,#a07020 100%)'
                    : 'linear-gradient(180deg,#5a3a18 0%,#3a2008 100%)',
                  border: c.active
                    ? '1px solid rgba(255,200,60,.6)'
                    : '1px solid rgba(0,0,0,.5)',
                  boxShadow: c.active
                    ? '0 0 12px rgba(255,180,30,.55), inset 0 1px 0 rgba(255,255,255,.15)'
                    : 'inset 0 2px 4px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.06)',
                  cursor: 'pointer',
                  minWidth: 54,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 6,
                    borderRadius: 3,
                    background: c.active
                      ? 'linear-gradient(90deg,#f0c030 0%,#fde68a 50%,#f0c030 100%)'
                      : 'linear-gradient(90deg,#3a2810 0%,#4a3018 100%)',
                    boxShadow: c.active ? '0 0 8px rgba(255,200,50,.8)' : 'none',
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '.08em',
                    color: c.active ? '#fde68a' : 'rgba(255,200,120,.55)',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                  }}
                >
                  {c.label}
                </span>
              </button>
            ))}
          </div>

          {/* Right Actions: Full Screen Lock + Google Account + Options Toggle */}
          <div className="relative z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (deviceLockEnabled && isFullscreen) {
                  void disableFullScreenAndDeviceLock();
                } else {
                  setShowPermissionPrompt(true);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all"
              style={{
                background:
                  deviceLockEnabled && isFullscreen
                    ? 'linear-gradient(180deg,#0f766e 0%,#115e59 100%)'
                    : 'rgba(0,0,0,0.42)',
                color:
                  deviceLockEnabled && isFullscreen
                    ? '#99f6e4'
                    : '#fde68a',
                border:
                  deviceLockEnabled && isFullscreen
                    ? '1px solid rgba(45,212,191,0.55)'
                    : '1px solid rgba(255,200,80,0.35)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
              title="Full Screen & Pad Gesture Lock"
            >
              <span>
                {deviceLockEnabled && isFullscreen
                  ? '🔒 Pad Locked'
                  : deviceLockEnabled
                    ? '🛡 Gesture Lock'
                    : '⛶ Full Screen'}
              </span>
            </button>

            {user ? (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all"
                style={{
                  background: 'rgba(16, 185, 129, 0.16)',
                  color: '#a7f3d0',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                }}
                title={user.email ?? 'Signed in'}
              >
                <span className="truncate max-w-[110px]">
                  ● {user.displayName ?? user.email ?? 'Synced'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={authLoading}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                style={{
                  background: 'rgba(255, 255, 255, 0.92)',
                  color: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                }}
              >
                <span>{authLoading ? 'Signing in...' : 'G Sign In'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: sidebarOpen
                  ? 'rgba(245, 158, 11, 0.22)'
                  : 'linear-gradient(180deg,#d4a030 0%,#a07020 100%)',
                color: sidebarOpen ? '#fde68a' : '#1a0a00',
                border: '1px solid rgba(255, 200, 80, 0.45)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
              }}
            >
              <span>{sidebarOpen ? 'Hide Options >>' : '<< Options'}</span>
            </button>
          </div>
        </div>

        {/* Full-Height Key Bed */}
        <div
          className="relative flex flex-1 flex-col overflow-hidden"
          style={{
            background: 'linear-gradient(180deg,#2e1404 0%,#3a1a08 100%)',
            touchAction: 'none',
          }}
        >
          <SideWood side="left" />
          <SideWood side="right" />

          {/* Key-frame top rail + shadow well */}
          <div
            className="pointer-events-none relative z-20"
            style={{
              height: 10,
              marginLeft: 8,
              marginRight: 8,
              background: 'linear-gradient(180deg,#5a3010 0%,#2a1204 100%)',
              borderBottom: '2px solid rgba(0,0,0,.75)',
              boxShadow: '0 6px 14px rgba(0,0,0,.65)',
            }}
          />

          {/* Multi-touch key surface */}
          <div
            className="relative flex flex-1 overflow-hidden"
            style={{
              paddingLeft: 8,
              paddingRight: 8,
              paddingBottom: 14,
              touchAction: 'none',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEndOrCancel}
            onTouchCancel={handleTouchEndOrCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onLostPointerCapture={handlePointerUpOrCancel}
          >
            <div
              className="relative flex-1 h-full w-full"
              style={{ touchAction: 'none' }}
            >
              {/* White keys */}
              {whiteKeys.map((note) => {
                const w = 100 / whiteKeys.length;
                const isActive = activeNoteIds.includes(note.id);
                return (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={-1}
                    data-note-id={note.id}
                    aria-label={`${note.sargam} (${note.western})`}
                    className="flex flex-col justify-between rounded-b-[1.35rem] border-x border-t border-black/15 px-2.5 pt-4 pb-3.5 text-left select-none cursor-pointer"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 12,
                      left: `calc(${note.whiteIndex * w}% + 0.5px)`,
                      width: `calc(${w}% - 1px)`,
                      background: isActive
                        ? 'linear-gradient(180deg,#e9c090 0%,#f6d2aa 35%,#e5b582 100%)'
                        : 'linear-gradient(180deg,#fffdfa 0%,#f7efe4 72%,#eadbc9 100%)',
                      borderBottom: isActive
                        ? '4px solid #9c7248'
                        : '10px solid #cbb59b',
                      boxShadow: isActive
                        ? 'inset 0 12px 20px rgba(60,25,5,0.35), inset 0 -6px 18px rgba(183,124,74,0.28), 0 2px 6px rgba(0,0,0,0.45), 0 0 14px rgba(251,191,36,0.28)'
                        : 'inset 0 -10px 24px rgba(183,124,74,0.12), 0 10px 18px rgba(0,0,0,0.45)',
                      transform: isActive ? 'translateY(12px)' : 'translateY(0px)',
                      transition: isActive
                        ? 'transform .045s cubic-bezier(0.16, 1, 0.3, 1), background .04s, box-shadow .04s, border-bottom-width .04s'
                        : 'transform .14s cubic-bezier(0.22, 1, 0.36, 1), background .08s, box-shadow .08s, border-bottom-width .08s',
                      touchAction: 'none',
                    }}
                  >
                    {suggestedKeys.has(note.id) && !isActive && (
                      <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 w-[24px] h-[24px] rounded-full bg-amber-400/60 blur-[5px] shadow-[0_0_18px_rgba(251,191,36,0.9)]" />
                    )}

                    {labelMode !== 'none' && (
                      <div className="pointer-events-none mt-auto flex flex-col items-center mb-1">
                        <span
                          style={{
                            fontSize: 'clamp(14px, 1.35vw, 18px)',
                            fontWeight: 700,
                            color: isActive ? '#6b2f0a' : '#1e293b',
                          }}
                        >
                          {labelMode === 'western'
                            ? note.western
                            : SWARAM_NAMES[(note.midi - sargamOffset + 120) % 12]}
                        </span>
                      </div>
                    )}

                    <span
                      className="pointer-events-none"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        padding: '3px 8px',
                        background: isActive
                          ? 'rgba(124,58,16,0.22)'
                          : 'rgba(15,23,42,0.07)',
                        fontSize: 'clamp(9px,0.95vw,12px)',
                        fontWeight: 600,
                        color: isActive ? '#6b2f0a' : '#475569',
                        letterSpacing: '0.04em',
                        alignSelf: 'flex-start',
                        border: isActive
                          ? '1px solid rgba(124,58,16,0.25)'
                          : '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      {note.keycap}
                    </span>
                  </div>
                );
              })}

              {/* Black keys */}
              {blackKeys.map((note) => {
                const ww = 100 / whiteKeys.length;
                const bw = ww * 0.78;
                const left = (note.whiteIndex + 1) * ww - bw / 2;
                const isActive = activeNoteIds.includes(note.id);
                return (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={-1}
                    data-note-id={note.id}
                    aria-label={`${note.sargam} (${note.western})`}
                    className="absolute top-0 z-10 flex h-[59%] flex-col justify-between rounded-b-[1.15rem] border-x border-t border-black/30 px-2.5 pt-3 pb-2.5 text-left select-none cursor-pointer"
                    style={{
                      left: `${left}%`,
                      width: `${bw}%`,
                      background: isActive
                        ? 'linear-gradient(180deg,#115e59 0%,#16655e 45%,#0d3b38 100%)'
                        : 'linear-gradient(180deg,#334155 0%,#1e293b 65%,#0f172a 100%)',
                      borderBottom: isActive
                        ? '3px solid #062c28'
                        : '9px solid #090d16',
                      boxShadow: isActive
                        ? 'inset 0 8px 14px rgba(0,0,0,0.45), 0 0 18px rgba(52,211,153,.45), 0 5px 12px rgba(15,23,42,0.45)'
                        : '0 16px 28px rgba(15,23,42,0.48), inset 0 1px 1px rgba(255,255,255,0.16)',
                      transform: isActive ? 'translateY(9px)' : 'translateY(0px)',
                      transition: isActive
                        ? 'transform .04s cubic-bezier(0.16, 1, 0.3, 1), background .04s, box-shadow .04s, border-bottom-width .04s'
                        : 'transform .12s cubic-bezier(0.22, 1, 0.36, 1), background .08s, box-shadow .08s, border-bottom-width .08s',
                      touchAction: 'none',
                    }}
                  >
                    {suggestedKeys.has(note.id) && !isActive && (
                      <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 w-[18px] h-[18px] rounded-full bg-amber-400/60 blur-[5px] shadow-[0_0_14px_rgba(251,191,36,0.9)]" />
                    )}

                    {labelMode !== 'none' && (
                      <div className="pointer-events-none mt-auto flex flex-col items-center mb-0.5">
                        <span
                          style={{
                            fontSize: 'clamp(11px, 1.05vw, 14px)',
                            fontWeight: 700,
                            color: isActive
                              ? '#6ee7b7'
                              : 'rgba(255,255,255,0.92)',
                          }}
                        >
                          {labelMode === 'western'
                            ? note.western
                            : SWARAM_NAMES[(note.midi - sargamOffset + 120) % 12]}
                        </span>
                      </div>
                    )}

                    <span
                      className="pointer-events-none"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        padding: '2px 6px',
                        background: isActive
                          ? 'rgba(52,211,153,0.18)'
                          : 'rgba(255,255,255,0.1)',
                        fontSize: 'clamp(8px,0.85vw,11px)',
                        fontWeight: 600,
                        color: isActive
                          ? '#6ee7b7'
                          : 'rgba(255,255,255,0.65)',
                        letterSpacing: '0.04em',
                        alignSelf: 'flex-start',
                        border: isActive
                          ? '1px solid rgba(52,211,153,0.25)'
                          : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {note.keycap}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Wood */}
        <div
          className="relative z-10 flex-shrink-0 pointer-events-none"
          style={{
            height: 22,
            background:
              'linear-gradient(180deg,#3a1a08 0%,#5c2e0e 60%,#7c4520 100%)',
            boxShadow: '0 -6px 24px rgba(0,0,0,.7)',
          }}
        >
          <WoodGrain />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: 'linear-gradient(90deg,#8a6030,#c8a040,#8a6030)',
              opacity: 0.55,
            }}
          />
        </div>
      </div>

      {/* ══ RIGHT SIDE OPTION BAR (SLIDE-OVER DRAWER SO KEYS STAY WIDE) ══ */}
      {sidebarOpen && (
        <aside
          data-allow-scroll="true"
          className="absolute right-0 top-[52px] bottom-[22px] z-40 flex flex-col gap-3 overflow-y-auto border-l border-amber-500/25 p-3.5"
          style={{
            width: 286,
            background: 'rgba(12,6,1,.96)',
            backdropFilter: 'blur(16px)',
            boxShadow: '-12px 0 36px rgba(0,0,0,0.85)',
            touchAction: 'pan-y',
          }}
        >
          {/* Full Screen & Pad Gesture Lock Card */}
          <div className="rounded-xl border border-teal-500/25 bg-teal-950/25 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-teal-200/80">
                Full Screen & Pad Lock
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 text-[9px] font-bold uppercase rounded-full',
                  deviceLockEnabled
                    ? 'bg-teal-400/20 text-teal-300 border border-teal-400/40'
                    : 'bg-white/10 text-white/50'
                )}
              >
                {deviceLockEnabled ? 'Active' : 'Unlocked'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[9px] text-amber-100/70">
              <div className="rounded bg-black/30 px-2 py-1 border border-white/5">
                Display: <strong className="text-amber-200">{isFullscreen ? 'Full Screen' : 'Windowed'}</strong>
              </div>
              <div className="rounded bg-black/30 px-2 py-1 border border-white/5">
                Wake Lock: <strong className="text-amber-200">{wakeLockActive ? 'Awake' : 'Standard'}</strong>
              </div>
              <div className="rounded bg-black/30 px-2 py-1 border border-white/5">
                Key Shield: <strong className="text-amber-200">{keyboardLockActive ? 'Locked' : 'Touch Only'}</strong>
              </div>
              <div className="rounded bg-black/30 px-2 py-1 border border-white/5">
                Rotation: <strong className="text-amber-200">{orientationLocked ? 'Landscape' : 'Auto'}</strong>
              </div>
            </div>

            {lockStatusMessage && (
              <p className="text-[10px] text-amber-300/90 leading-snug bg-amber-500/10 border border-amber-500/25 rounded-md p-1.5">
                {lockStatusMessage}
              </p>
            )}

            <div className="flex gap-1.5">
              {!deviceLockEnabled || !isFullscreen ? (
                <button
                  type="button"
                  onClick={() => setShowPermissionPrompt(true)}
                  className="flex-1 rounded-md bg-teal-400 px-2.5 py-1.5 text-[10px] font-bold text-teal-950 hover:bg-teal-300 transition"
                >
                  Ask Permission & Lock Pad
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void disableFullScreenAndDeviceLock()}
                  className="flex-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-white/15 transition"
                >
                  Unlock & Exit Full Screen
                </button>
              )}
            </div>
          </div>

          {/* Cloud Sync & Saved Presets (Firebase) */}
          <div className="rounded-xl border border-amber-500/20 bg-white/[0.04] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/70">
                Google Cloud Sync
              </span>
              {user ? (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded-md border border-white/15 bg-white/5 text-amber-200/80 hover:bg-white/10"
                >
                  Sign Out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGoogleSignIn()}
                  disabled={authLoading}
                  className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-amber-400 text-amber-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {authLoading ? 'Signing in...' : 'Sign in with Google'}
                </button>
              )}
            </div>

            {authError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2 space-y-1.5">
                <p className="text-[10px] text-rose-200 leading-snug font-medium">
                  {authError}
                </p>
                {authErrorDomain && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <code className="flex-1 truncate rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-amber-200 select-all">
                      {authErrorDomain}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(authErrorDomain);
                        setCopiedDomain(true);
                        window.setTimeout(() => setCopiedDomain(false), 2000);
                      }}
                      className="rounded bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 text-[9px] font-semibold text-amber-200"
                    >
                      {copiedDomain ? 'Copied!' : 'Copy Domain'}
                    </button>
                  </div>
                )}
                {(authErrorCode === 'auth/popup-blocked' ||
                  authErrorCode === 'auth/popup-closed-by-user' ||
                  authErrorCode ===
                    'auth/operation-not-supported-in-this-environment') && (
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleGoogleSignIn()}
                      className="flex-1 rounded bg-amber-400 px-2 py-1 text-[10px] font-bold text-amber-950"
                    >
                      Retry Popup
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleGoogleRedirectSignIn()}
                      className="flex-1 rounded border border-amber-300/40 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-100"
                    >
                      Redirect Sign-In
                    </button>
                  </div>
                )}
              </div>
            )}

            {user ? (
              <div className="space-y-2">
                <div className="text-[10px] text-emerald-300/90 truncate font-medium">
                  ● Synced: {user.email ?? user.displayName ?? 'Signed in'}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    maxLength={MAX_PRESET_NAME_LENGTH}
                    value={newPresetName}
                    onChange={(e) =>
                      setNewPresetName(
                        e.target.value.slice(0, MAX_PRESET_NAME_LENGTH)
                      )
                    }
                    placeholder="Preset name..."
                    className="flex-1 min-w-0 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-amber-100 placeholder:text-white/30 focus:outline-none focus:border-amber-400 select-text"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSavePreset()}
                    disabled={!newPresetName.trim()}
                    className="rounded-md bg-teal-400 px-2.5 py-1 text-[10px] font-bold text-teal-950 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
                {cloudStatus && (
                  <div className="text-[10px] text-emerald-300 font-medium">
                    {cloudStatus}
                  </div>
                )}
                {presets.length > 0 && (
                  <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pt-1">
                    {presets.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1"
                      >
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(p)}
                          className="flex-1 truncate text-left text-[11px] font-medium text-amber-100 hover:text-amber-300"
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void deleteHarmoniumPresetFromCloud(user.uid, p.id)
                          }
                          className="text-[10px] text-rose-300/70 hover:text-rose-300 px-1"
                          aria-label={`Delete ${p.name}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-white/45 leading-snug">
                Sign in with Google to sync your harmonium settings and save custom raga/octave presets in the cloud.
              </p>
            )}
          </div>

          {/* Raga Suggestions */}
          <HUDRow label="Raga Suggestions">
            <HUDChip
              active={selectedRaga === null}
              color="amber"
              onClick={() => setSelectedRaga(null)}
            >
              Off
            </HUDChip>
            {RAGAS.map((r) => (
              <HUDChip
                key={r.name}
                active={selectedRaga === r.name}
                color="teal"
                onClick={() => setSelectedRaga(r.name)}
              >
                {r.name}
              </HUDChip>
            ))}
          </HUDRow>

          {/* Keyboard Labels */}
          <HUDRow label="Keyboard Labels">
            {([
              { label: 'None', v: 'none' as const },
              { label: 'Sargam', v: 'sargam' as const },
              { label: 'Western', v: 'western' as const },
            ]).map((o) => (
              <HUDChip
                key={o.label}
                active={labelMode === o.v}
                color="amber"
                onClick={() => setLabelMode(o.v)}
              >
                {o.label}
              </HUDChip>
            ))}
          </HUDRow>

          {labelMode === 'sargam' && (
            <HUDRow label="Sargam Root (Sa)">
              <div className="flex flex-wrap gap-1">
                {WESTERN_NAMES.map((w, idx) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setSargamOffset(idx)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] rounded-full transition-colors border',
                      sargamOffset === idx
                        ? 'bg-amber-500/80 text-amber-950 border-amber-400 font-bold'
                        : 'text-white/60 border-white/10 hover:bg-white/10'
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </HUDRow>
          )}

          {/* Chord Guide */}
          <HUDRow label="Chord Guide">
            {([
              { label: 'Off', v: 'off' as const },
              { label: 'Major', v: 'major' as const },
              { label: 'Minor', v: 'minor' as const },
            ]).map((o) => (
              <HUDChip
                key={o.label}
                active={chordMode === o.v}
                color="teal"
                onClick={() => setChordMode(o.v)}
              >
                {o.label}
              </HUDChip>
            ))}
          </HUDRow>

          {/* Tanpura */}
          <div className="rounded-xl border border-amber-500/15 bg-white/[0.03] p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/60">
                Tanpura
              </span>
              <button
                type="button"
                onClick={() => setTanpuraEnabled(!tanpuraEnabled)}
                className={cn(
                  'px-2.5 py-0.5 text-[10px] font-bold rounded-full transition',
                  tanpuraEnabled
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-white/10 text-amber-200/70'
                )}
              >
                {tanpuraEnabled ? '● Playing' : '○ Off'}
              </button>
            </div>
            <HUDRow label="String">
              {(['pa', 'ma', 'ni'] as const).map((s) => (
                <HUDChip
                  key={s}
                  active={tanpuraStyle === s}
                  color="teal"
                  onClick={() => setTanpuraStyle(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </HUDChip>
              ))}
            </HUDRow>
            <HUDRow label="Root">
              <div className="flex flex-wrap gap-1">
                {WESTERN_NAMES.map((w, idx) => (
                  <button
                    key={'tan-' + w}
                    type="button"
                    onClick={() => setTanpuraRoot(idx)}
                    className={cn(
                      'px-1.5 py-0.5 text-[9px] rounded-full transition-colors border',
                      tanpuraRoot === idx
                        ? 'bg-amber-500/80 text-amber-950 border-amber-400 font-bold'
                        : 'text-white/50 border-white/10 hover:bg-white/10'
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </HUDRow>
            <HUDRow label={`Vol ${Math.round(tanpuraVolume * 100)}%`}>
              <input
                type="range"
                min="0.05"
                max="1.5"
                step="0.05"
                value={tanpuraVolume}
                onChange={(e) => setTanpuraVolume(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
            </HUDRow>
            <HUDRow label={`Speed ${tanpuraSpeed}`}>
              <input
                type="range"
                min="60"
                max="240"
                step="5"
                value={tanpuraSpeed}
                onChange={(e) => setTanpuraSpeed(Number(e.target.value))}
                className="flex-1 accent-teal-500"
              />
            </HUDRow>
          </div>

          {/* Tabla */}
          <div className="rounded-xl border border-amber-500/15 bg-white/[0.03] p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/60">
                Tabla
              </span>
              <button
                type="button"
                onClick={() => {
                  setTablaEnabled(!tablaEnabled);
                  tablaStateRef.current.beat = 0;
                }}
                className={cn(
                  'px-2.5 py-0.5 text-[10px] font-bold rounded-full transition',
                  tablaEnabled
                    ? 'bg-teal-400 text-teal-950'
                    : 'bg-white/10 text-amber-200/70'
                )}
              >
                {tablaEnabled ? '● Playing' : '○ Off'}
              </button>
            </div>
            <HUDRow label="Taal">
              <div className="flex flex-wrap gap-1">
                {(
                  Object.entries(TAALS) as Array<
                    [keyof typeof TAALS, (typeof TAALS)[keyof typeof TAALS]]
                  >
                ).map(([key, taal]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTablaTaal(key);
                      tablaStateRef.current.beat = 0;
                    }}
                    className={cn(
                      'px-2 py-0.5 text-[10px] rounded-full transition-colors border',
                      tablaTaal === key
                        ? 'bg-amber-500/80 text-amber-950 border-amber-400 font-bold'
                        : 'text-white/50 border-white/10 hover:bg-white/10'
                    )}
                  >
                    {taal.name}
                  </button>
                ))}
              </div>
            </HUDRow>
            <HUDRow label="Root">
              <div className="flex flex-wrap gap-1">
                {WESTERN_NAMES.map((w, idx) => (
                  <button
                    key={'tbl-' + w}
                    type="button"
                    onClick={() => setTablaPitch(idx)}
                    className={cn(
                      'px-1.5 py-0.5 text-[9px] rounded-full transition-colors border',
                      tablaPitch === idx
                        ? 'bg-amber-500/80 text-amber-950 border-amber-400 font-bold'
                        : 'text-white/50 border-white/10 hover:bg-white/10'
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </HUDRow>
            <HUDRow label={`Vol ${Math.round(tablaVolume * 100)}%`}>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={tablaVolume}
                onChange={(e) => setTablaVolume(Number(e.target.value))}
                className="flex-1 accent-teal-500"
              />
            </HUDRow>
            <HUDRow label={`Speed ${tablaSpeed}`}>
              <input
                type="range"
                min="60"
                max="280"
                step="5"
                value={tablaSpeed}
                onChange={(e) => setTablaSpeed(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
            </HUDRow>
          </div>

          {/* Harmonium Controls */}
          <HUDRow label={`Octave Base · ${octaveOption.description}`}>
            {OCTAVE_OPTIONS.map((o) => (
              <HUDChip
                key={o.value}
                active={octave === o.value}
                color="teal"
                onClick={() => setOctave(o.value)}
              >
                {o.shortLabel}
              </HUDChip>
            ))}
          </HUDRow>

          <HUDRow label="Transpose">
            <button
              type="button"
              className="rounded-full w-7 h-7 flex items-center justify-center text-amber-300/80 bg-white/5 hover:bg-white/10 transition"
              onClick={() => setTranspose((c) => Math.max(-6, c - 1))}
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-mono text-amber-200">
              {transpose > 0 ? `+${transpose}` : transpose}
            </span>
            <button
              type="button"
              className="rounded-full w-7 h-7 flex items-center justify-center text-amber-300/80 bg-white/5 hover:bg-white/10 transition"
              onClick={() => setTranspose((c) => Math.min(6, c + 1))}
            >
              +
            </button>
          </HUDRow>

          <HUDRow label={`Volume · ${Math.round(volume * 100)}%`}>
            <input
              type="range"
              min="0.05"
              max="1.5"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-amber-400"
            />
          </HUDRow>

          <HUDRow label="Reverb">
            {([
              { label: 'Dry', v: false },
              { label: 'Room', v: true },
            ]).map((o) => (
              <HUDChip
                key={o.label}
                active={reverbEnabled === o.v}
                color="amber"
                onClick={() => setReverbEnabled(o.v)}
              >
                {o.label}
              </HUDChip>
            ))}
          </HUDRow>

          <HUDRow label="Reeds">
            {([
              { label: 'Single', v: 'single' as const },
              { label: 'Double', v: 'double' as const },
            ]).map((o) => (
              <HUDChip
                key={o.label}
                active={reedMode === o.v}
                color="teal"
                onClick={() => setReedMode(o.v)}
              >
                {o.label}
              </HUDChip>
            ))}
          </HUDRow>

          <div className="text-[9px] text-amber-200/35 text-right mt-auto pt-2">
            {playbackMode === 'samples' ? 'Sample' : 'Synth'} · 23 keys
          </div>
        </aside>
      )}

      {/* ══ PERMISSION MODAL FOR FULL SCREEN & CHROME/PAD GESTURE LOCK ══ */}
      {showPermissionPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: 'rgba(10, 5, 1, 0.82)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            data-allow-scroll="true"
            className="w-full max-w-md rounded-2xl border border-amber-500/35 p-5 shadow-2xl space-y-4"
            style={{
              background:
                'linear-gradient(180deg, rgba(42, 21, 6, 0.98) 0%, rgba(20, 10, 2, 0.99) 100%)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.9)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block rounded-full bg-amber-500/20 border border-amber-400/35 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1.5">
                  Permission Request
                </span>
                <h2 className="text-base font-bold text-amber-100">
                  Enable Full Screen &amp; Disable Chrome / Pad Gestures?
                </h2>
              </div>
            </div>

            <p className="text-xs text-amber-100/75 leading-relaxed">
              To play chords and fast taans with 3+ fingers without Chrome or your tablet interrupting, SargamPad requests your permission to activate:
            </p>

            <ul className="space-y-1.5 text-[11px] text-amber-100/85 bg-black/35 rounded-xl p-3 border border-white/10">
              <li className="flex items-start gap-2">
                <span className="text-teal-400 font-bold">1.</span>
                <span>
                  <strong>Immersive Full Screen (`navigationUI: hide`):</strong> Hides Chrome tabs, address bar, status bar, and Android navigation bar.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-400 font-bold">2.</span>
                <span>
                  <strong>Multi-Finger &amp; Chrome Gesture Shield:</strong> Blocks pull-to-refresh, edge back/forward swipe, pinch-to-zoom, and context menus.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-400 font-bold">3.</span>
                <span>
                  <strong>Landscape &amp; Wake Lock + Key Shield:</strong> Locks horizontal orientation, keeps the screen awake, and captures system hotkeys.
                </span>
              </li>
            </ul>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void enableFullScreenAndDeviceLock()}
                className="w-full sm:flex-1 rounded-xl py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-amber-950 transition-all cursor-pointer"
                style={{
                  background:
                    'linear-gradient(180deg, #fbbf24 0%, #d97706 100%)',
                  boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)',
                }}
              >
                Allow &amp; Enter Full Screen Lock
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeviceLockEnabled(true);
                  setShowPermissionPrompt(false);
                }}
                className="w-full sm:w-auto rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 py-2.5 px-3.5 text-xs font-semibold text-amber-200/80 transition-all cursor-pointer"
              >
                Gesture Lock Only
              </button>
              <button
                type="button"
                onClick={() => setShowPermissionPrompt(false)}
                className="w-full sm:w-auto rounded-xl py-2.5 px-3 text-xs font-medium text-white/45 hover:text-white/75 transition-all cursor-pointer"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WoodGrain({ opacity = 0.11 }: { opacity?: number }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity,
        backgroundImage: `repeating-linear-gradient(87deg,transparent,transparent 13px,rgba(255,175,75,.28) 13px,rgba(255,175,75,.28) 14px),repeating-linear-gradient(89deg,transparent,transparent 27px,rgba(200,125,35,.14) 27px,rgba(200,125,35,.14) 29px)`,
      }}
    />
  );
}

function SideWood({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: 8,
        zIndex: 20,
        background:
          side === 'left'
            ? 'linear-gradient(90deg,#6b3518 0%,#4a2208 60%,#2e1404 100%)'
            : 'linear-gradient(270deg,#6b3518 0%,#4a2208 60%,#2e1404 100%)',
        borderRight: side === 'left' ? '1px solid rgba(255,135,35,.1)' : 'none',
        borderLeft: side === 'right' ? '1px solid rgba(255,135,35,.1)' : 'none',
      }}
    />
  );
}

function HUDRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-medium uppercase tracking-widest text-amber-200/45">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function HUDChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: 'amber' | 'teal';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium border transition-all duration-150',
        active
          ? color === 'amber'
            ? 'bg-amber-500/80 text-amber-950 border-amber-400/50'
            : 'bg-teal-600/80 text-white border-teal-500/50'
          : 'bg-white/8 text-white/60 border-white/10 hover:bg-white/15'
      )}
    >
      {children}
    </button>
  );
}
