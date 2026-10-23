/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellowsAndStopsBar } from './components/BellowsAndStopsBar';
import { HarmoniumKeyboard } from './components/HarmoniumKeyboard';
import { RecordedEvent, SidebarTabId, TouchSidebar } from './components/TouchSidebar';
import { ReedStopsConfig, audioEngine } from './utils/audioEngine';
import {
  BolStep,
  HarmoniumTimbreId,
  MelodyDemo,
  RAGA_SUGGESTIONS,
  RagaSuggestion,
  TAAL_DEFINITIONS,
  TaalDefinition,
  generateHarmoniumKeys,
} from './utils/musicTheory';

export default function App() {
  // Keyboard layout & key definitions
  const [keyboardLayout, setKeyboardLayout] = useState<'pad-24' | 'concert-32'>('pad-24');
  const keys = useMemo(() => generateHarmoniumKeys(keyboardLayout), [keyboardLayout]);

  // Active & sustained notes
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(new Set());
  const [sustainMode, setSustainMode] = useState<boolean>(false);

  // Scale / Tuning / Timbre
  const [rootPitchClass, setRootPitchClass] = useState<number>(0); // C = 0
  const [a4ReferenceHz, setA4ReferenceHz] = useState<number>(440);
  const [useJustIntonation, setUseJustIntonation] = useState<boolean>(true);
  const [showDevanagari, setShowDevanagari] = useState<boolean>(true);
  const [timbre, setTimbre] = useState<HarmoniumTimbreId>('sarangi-ensemble');
  const [masterVolume, setMasterVolume] = useState<number>(0.82);

  // Bellows & Reed Stops
  const [bellowsPressure, setBellowsPressure] = useState<number>(0.88);
  const [autoBellows, setAutoBellows] = useState<boolean>(true);
  const [stops, setStops] = useState<ReedStopsConfig>(() => audioEngine.getStops());

  // Raga Suggestion state
  const [activeRaga, setActiveRaga] = useState<RagaSuggestion>(RAGA_SUGGESTIONS[0]);
  const [showRagaGuide, setShowRagaGuide] = useState<boolean>(true);
  const [ragaScaleLock, setRagaScaleLock] = useState<boolean>(false);

  // Tanpura Drone state
  const [tanpuraEnabled, setTanpuraEnabled] = useState<boolean>(false);
  const [tanpuraFirstString, setTanpuraFirstString] = useState<'Pa' | 'Ma' | 'Ni'>('Pa');
  const [tanpuraVolume, setTanpuraVolume] = useState<number>(0.38);

  // Tabla & Nepali Madal Rhythm state
  const [activeTaal, setActiveTaal] = useState<TaalDefinition>(TAAL_DEFINITIONS[0]);
  const [rhythmPlaying, setRhythmPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(TAAL_DEFINITIONS[0].defaultBpm);
  const [rhythmVolume, setRhythmVolume] = useState<number>(0.68);
  const [currentBeatIndex, setCurrentBeatIndex] = useState<number>(0);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<SidebarTabId>('raga');

  // Demo & Phrase Playback state
  const [isPlayingPhrase, setIsPlayingPhrase] = useState<boolean>(false);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const demoTimersRef = useRef<number[]>([]);

  // Live Performance Recorder state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedEvents, setRecordedEvents] = useState<RecordedEvent[]>([]);
  const [isPlayingRecording, setIsPlayingRecording] = useState<boolean>(false);
  const recordStartPerfRef = useRef<number>(0);
  const activeRecordNoteStartsRef = useRef<Map<number, number>>(new Map());

  // Sync audioEngine parameters when states change
  useEffect(() => {
    audioEngine.setRootPitch(rootPitchClass);
  }, [rootPitchClass]);

  useEffect(() => {
    audioEngine.setReferenceHz(a4ReferenceHz);
  }, [a4ReferenceHz]);

  useEffect(() => {
    audioEngine.setJustIntonation(useJustIntonation);
  }, [useJustIntonation]);

  const handleNoteStart = useCallback(
    (midi: number) => {
      audioEngine.noteOn(midi);
      setActiveNotes((prev) => {
        if (prev.has(midi)) return prev;
        const next = new Set(prev);
        next.add(midi);
        return next;
      });

      if (isRecording) {
        activeRecordNoteStartsRef.current.set(midi, performance.now() - recordStartPerfRef.current);
      }
    },
    [isRecording]
  );

  const handleNoteStop = useCallback(
    (midi: number) => {
      if (sustainedNotes.has(midi)) return;
      audioEngine.noteOff(midi);
      setActiveNotes((prev) => {
        if (!prev.has(midi)) return prev;
        const next = new Set(prev);
        next.delete(midi);
        return next;
      });

      if (isRecording && activeRecordNoteStartsRef.current.has(midi)) {
        const startTimeMs = activeRecordNoteStartsRef.current.get(midi)!;
        activeRecordNoteStartsRef.current.delete(midi);
        const durationMs = Math.max(80, performance.now() - recordStartPerfRef.current - startTimeMs);
        setRecordedEvents((prev) => [...prev, { midi, startTimeMs, durationMs }]);
      }
    },
    [isRecording, sustainedNotes]
  );

  const handleToggleSustainNote = useCallback((midi: number) => {
    setSustainedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(midi)) {
        next.delete(midi);
        audioEngine.noteOff(midi);
      } else {
        next.add(midi);
        audioEngine.noteOn(midi);
      }
      return next;
    });
  }, []);

  const handleClearSustainedNotes = useCallback(() => {
    sustainedNotes.forEach((midi) => audioEngine.noteOff(midi));
    setSustainedNotes(new Set());
  }, [sustainedNotes]);

  const handleSilenceAll = useCallback(() => {
    demoTimersRef.current.forEach((id) => clearTimeout(id));
    demoTimersRef.current = [];
    setIsPlayingPhrase(false);
    setActiveDemoId(null);
    setIsPlayingRecording(false);
    setRhythmPlaying(false);
    setTanpuraEnabled(false);
    audioEngine.setTanpuraConfig({ enabled: false });
    audioEngine.stopAllNotes();
    setActiveNotes(new Set());
    setSustainedNotes(new Set());
  }, []);

  // Physical Keyboard listeners for Lenovo Pad keyboard dock / desktop
  useEffect(() => {
    const shortcutMap = new Map<string, number>();
    keys.forEach((k) => {
      if (k.keyboardShortcut) {
        shortcutMap.set(k.keyboardShortcut.toLowerCase(), k.midi);
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const midi = shortcutMap.get(e.key.toLowerCase());
      if (midi !== undefined) {
        e.preventDefault();
        handleNoteStart(midi);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const midi = shortcutMap.get(e.key.toLowerCase());
      if (midi !== undefined) {
        e.preventDefault();
        handleNoteStop(midi);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [keys, handleNoteStart, handleNoteStop]);

  // Manual Bellows decay & pump simulation when Auto-Bellows is off
  useEffect(() => {
    if (autoBellows) return;
    const interval = window.setInterval(() => {
      setBellowsPressure((prev) => {
        const decayRate = activeNotes.size > 0 || sustainedNotes.size > 0 ? 0.035 : 0.012;
        const next = Math.max(0.15, prev - decayRate);
        audioEngine.setBellowsPressure(next);
        return next;
      });
    }, 180);
    return () => clearInterval(interval);
  }, [autoBellows, activeNotes.size, sustainedNotes.size]);

  const handlePumpBellows = () => {
    const boosted = Math.min(1, bellowsPressure + 0.25);
    setBellowsPressure(boosted);
    audioEngine.setBellowsPressure(boosted);
  };

  // Tabla & Nepali Madal Rhythm Cycle Engine
  useEffect(() => {
    if (!rhythmPlaying) return;

    const beatIntervalMs = Math.round(60000 / bpm);
    // Play immediate beat on start
    const initialStep = activeTaal.steps[currentBeatIndex % activeTaal.beats];
    if (initialStep) {
      audioEngine.triggerPercussionBol(initialStep, activeTaal.instrument);
    }

    const timer = window.setInterval(() => {
      setCurrentBeatIndex((prev) => {
        const nextIdx = (prev + 1) % activeTaal.beats;
        const step = activeTaal.steps[nextIdx];
        if (step) {
          audioEngine.triggerPercussionBol(step, activeTaal.instrument);
        }
        return nextIdx;
      });
    }, beatIntervalMs);

    return () => clearInterval(timer);
  }, [rhythmPlaying, bpm, activeTaal]);

  // Play Raga Pakad Phrase
  const handleTogglePlayRagaPhrase = () => {
    demoTimersRef.current.forEach((id) => clearTimeout(id));
    demoTimersRef.current = [];

    if (isPlayingPhrase) {
      setIsPlayingPhrase(false);
      audioEngine.stopAllNotes();
      setActiveNotes(new Set());
      return;
    }

    setActiveDemoId(null);
    setIsPlayingPhrase(true);

    let accumulatedMs = 0;
    const baseMiddleSa = 60 + rootPitchClass;

    activeRaga.pakadSemitones.forEach((item) => {
      const midi = baseMiddleSa + item.semitone + (item.octaveOffset ? item.octaveOffset * 12 : 0);
      const startTimer = window.setTimeout(() => {
        handleNoteStart(midi);
      }, accumulatedMs);
      const stopTimer = window.setTimeout(() => {
        handleNoteStop(midi);
      }, accumulatedMs + Math.max(120, item.durationMs - 45));

      demoTimersRef.current.push(startTimer, stopTimer);
      accumulatedMs += item.durationMs;
    });

    const endTimer = window.setTimeout(() => {
      setIsPlayingPhrase(false);
    }, accumulatedMs + 100);
    demoTimersRef.current.push(endTimer);
  };

  // Play Interactive Melody Demo (e.g., Resham Firiri)
  const handlePlayMelodyDemo = (demo: MelodyDemo) => {
    demoTimersRef.current.forEach((id) => clearTimeout(id));
    demoTimersRef.current = [];
    audioEngine.stopAllNotes();
    setActiveNotes(new Set());

    const matchingRaga = RAGA_SUGGESTIONS.find((r) => r.id === demo.ragaId);
    if (matchingRaga) {
      setActiveRaga(matchingRaga);
    }
    const matchingTaal = TAAL_DEFINITIONS.find((t) => t.id === demo.taalId);
    if (matchingTaal) {
      setActiveTaal(matchingTaal);
      setBpm(demo.bpm);
    }

    setIsPlayingPhrase(false);
    setActiveDemoId(demo.id);

    let accumulatedMs = 0;
    const baseMiddleSa = 60 + rootPitchClass;

    demo.notes.forEach((n) => {
      const midi = baseMiddleSa + n.semitone + n.octaveOffset * 12;
      const tOn = window.setTimeout(() => {
        handleNoteStart(midi);
      }, accumulatedMs);
      const tOff = window.setTimeout(() => {
        handleNoteStop(midi);
      }, accumulatedMs + Math.max(110, n.durationMs - 40));

      demoTimersRef.current.push(tOn, tOff);
      accumulatedMs += n.durationMs;
    });

    const tFinish = window.setTimeout(() => {
      setActiveDemoId(null);
    }, accumulatedMs + 120);
    demoTimersRef.current.push(tFinish);
  };

  const handleStopMelodyDemo = () => {
    demoTimersRef.current.forEach((id) => clearTimeout(id));
    demoTimersRef.current = [];
    setActiveDemoId(null);
    audioEngine.stopAllNotes();
    setActiveNotes(new Set());
  };

  // Apply Recommended Taal & Folk Timbre for a Raga
  const handleApplyRagaRecommendedSetup = (raga: RagaSuggestion) => {
    const recTaal = TAAL_DEFINITIONS.find((t) => t.id === raga.recommendedTaalId);
    if (recTaal) {
      setActiveTaal(recTaal);
      setBpm(recTaal.defaultBpm);
      setCurrentBeatIndex(0);
    }
    setTimbre(raga.recommendedTimbre);
    audioEngine.setTimbre(raga.recommendedTimbre);
    setStops(audioEngine.getStops());
  };

  // Recorder handlers
  const handleStartRecording = () => {
    setRecordedEvents([]);
    activeRecordNoteStartsRef.current.clear();
    recordStartPerfRef.current = performance.now();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    activeRecordNoteStartsRef.current.clear();
  };

  const handlePlayRecording = () => {
    if (recordedEvents.length === 0) return;
    demoTimersRef.current.forEach((id) => clearTimeout(id));
    demoTimersRef.current = [];
    setIsPlayingRecording(true);

    const firstOffset = recordedEvents[0].startTimeMs;
    let maxEnd = 0;

    recordedEvents.forEach((ev) => {
      const relStart = Math.max(0, ev.startTimeMs - firstOffset);
      const relEnd = relStart + ev.durationMs;
      if (relEnd > maxEnd) maxEnd = relEnd;

      const t1 = window.setTimeout(() => handleNoteStart(ev.midi), relStart);
      const t2 = window.setTimeout(() => handleNoteStop(ev.midi), relEnd);
      demoTimersRef.current.push(t1, t2);
    });

    const tDone = window.setTimeout(() => {
      setIsPlayingRecording(false);
    }, maxEnd + 100);
    demoTimersRef.current.push(tDone);
  };

  const navigateSidebarTab = (tab: SidebarTabId) => {
    setActiveTab(tab);
    setSidebarOpen(true);
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#120e0a] text-[#f5efe6] overflow-hidden select-none">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-5 py-2.5 bg-[#160f0a] border-b border-amber-900/40 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => e.preventDefault()}
          className="text-lg font-bold tracking-tight text-amber-200 whitespace-nowrap shrink-0 font-display"
        >
          SargamPad
        </a>

        {/* Zone 2: 4 single-line navigation links */}
        <nav aria-label="Primary Studio Navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-amber-100/75">
          <button
            type="button"
            onClick={() => navigateSidebarTab('raga')}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              sidebarOpen && activeTab === 'raga' ? 'text-amber-300 font-semibold underline' : ''
            }`}
          >
            Raga Guide
          </button>
          <button
            type="button"
            onClick={() => navigateSidebarTab('rhythm')}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              sidebarOpen && activeTab === 'rhythm' ? 'text-amber-300 font-semibold underline' : ''
            }`}
          >
            Tanpura & Taal
          </button>
          <button
            type="button"
            onClick={() => navigateSidebarTab('sound')}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              sidebarOpen && activeTab === 'sound' ? 'text-amber-300 font-semibold underline' : ''
            }`}
          >
            Reed Voicing
          </button>
          <button
            type="button"
            onClick={() => navigateSidebarTab('practice')}
            className={`hover:text-amber-200 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              sidebarOpen && activeTab === 'practice' ? 'text-amber-300 font-semibold underline' : ''
            }`}
          >
            Folk Demos
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleSilenceAll}
            className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-amber-100 bg-[#2b1c12] hover:bg-[#3a2619] border border-amber-700/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Silence All
          </button>
        </div>
      </header>

      {/* Main Lenovo Pad Split Stage: Key Function Display + Collapsible Touch Sidebar */}
      <main className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden">
        {/* Primary Key Function Display Stage */}
        <section
          aria-label="Harmonium Key Function Stage"
          className="flex-1 flex flex-col h-full min-w-0 overflow-hidden"
        >
          <BellowsAndStopsBar
            activeNotes={activeNotes}
            sustainedNotes={sustainedNotes}
            rootPitchClass={rootPitchClass}
            a4ReferenceHz={a4ReferenceHz}
            useJustIntonation={useJustIntonation}
            bellowsPressure={bellowsPressure}
            autoBellows={autoBellows}
            onChangeBellowsPressure={(val) => {
              setBellowsPressure(val);
              audioEngine.setBellowsPressure(val);
            }}
            onToggleAutoBellows={() => setAutoBellows((prev) => !prev)}
            onPumpBellows={handlePumpBellows}
            stops={stops}
            onToggleStop={(stopKey) => {
              const updated = { ...stops, [stopKey]: !stops[stopKey] };
              setStops(updated);
              audioEngine.updateStops({ [stopKey]: updated[stopKey] });
            }}
            timbre={timbre}
            onChangeTimbre={(newTimbre) => {
              setTimbre(newTimbre);
              audioEngine.setTimbre(newTimbre);
              setStops(audioEngine.getStops());
            }}
            sustainMode={sustainMode}
            onToggleSustainMode={() => setSustainMode((prev) => !prev)}
            onClearSustainedNotes={handleClearSustainedNotes}
            tanpuraEnabled={tanpuraEnabled}
            onToggleTanpura={() => {
              const next = !tanpuraEnabled;
              setTanpuraEnabled(next);
              audioEngine.setTanpuraConfig({ enabled: next, firstString: tanpuraFirstString, volume: tanpuraVolume });
            }}
            rhythmPlaying={rhythmPlaying}
            onToggleRhythm={() => {
              setCurrentBeatIndex(0);
              setRhythmPlaying((prev) => !prev);
            }}
            activeTaal={activeTaal}
            currentBeatIndex={currentBeatIndex}
            bpm={bpm}
            activeRaga={activeRaga}
            isPlayingDemo={isPlayingPhrase || activeDemoId !== null}
            onTogglePlayRagaPhrase={handleTogglePlayRagaPhrase}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          />

          <HarmoniumKeyboard
            keys={keys}
            activeNotes={activeNotes}
            sustainedNotes={sustainedNotes}
            rootPitchClass={rootPitchClass}
            a4ReferenceHz={a4ReferenceHz}
            useJustIntonation={useJustIntonation}
            activeRaga={activeRaga}
            showRagaGuide={showRagaGuide}
            ragaScaleLock={ragaScaleLock}
            showDevanagari={showDevanagari}
            sustainMode={sustainMode}
            onNoteStart={handleNoteStart}
            onNoteStop={handleNoteStop}
            onToggleSustainNote={handleToggleSustainNote}
          />
        </section>

        {/* Collapsible Touch Options Sidebar */}
        {sidebarOpen && (
          <TouchSidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            activeRaga={activeRaga}
            onSelectRaga={(raga) => setActiveRaga(raga)}
            showRagaGuide={showRagaGuide}
            onToggleShowRagaGuide={() => setShowRagaGuide((prev) => !prev)}
            ragaScaleLock={ragaScaleLock}
            onToggleRagaScaleLock={() => setRagaScaleLock((prev) => !prev)}
            isPlayingDemo={isPlayingPhrase}
            onTogglePlayRagaPhrase={handleTogglePlayRagaPhrase}
            onApplyRagaRecommendedSetup={handleApplyRagaRecommendedSetup}
            rootPitchClass={rootPitchClass}
            onChangeRootPitchClass={(pc) => setRootPitchClass(pc)}
            tanpuraEnabled={tanpuraEnabled}
            onToggleTanpura={() => {
              const next = !tanpuraEnabled;
              setTanpuraEnabled(next);
              audioEngine.setTanpuraConfig({ enabled: next, firstString: tanpuraFirstString, volume: tanpuraVolume });
            }}
            tanpuraFirstString={tanpuraFirstString}
            onChangeTanpuraFirstString={(str) => {
              setTanpuraFirstString(str);
              audioEngine.setTanpuraConfig({ firstString: str });
            }}
            tanpuraVolume={tanpuraVolume}
            onChangeTanpuraVolume={(vol) => {
              setTanpuraVolume(vol);
              audioEngine.setTanpuraConfig({ volume: vol });
            }}
            activeTaal={activeTaal}
            onSelectTaal={(taal) => {
              setActiveTaal(taal);
              setBpm(taal.defaultBpm);
              setCurrentBeatIndex(0);
            }}
            rhythmPlaying={rhythmPlaying}
            onToggleRhythm={() => {
              setCurrentBeatIndex(0);
              setRhythmPlaying((prev) => !prev);
            }}
            bpm={bpm}
            onChangeBpm={(newBpm) => setBpm(newBpm)}
            rhythmVolume={rhythmVolume}
            onChangeRhythmVolume={(vol) => {
              setRhythmVolume(vol);
              audioEngine.setRhythmVolume(vol);
            }}
            currentBeatIndex={currentBeatIndex}
            onAuditionBolStep={(step: BolStep, instrument: 'madal' | 'tabla') => {
              audioEngine.triggerPercussionBol(step, instrument);
            }}
            timbre={timbre}
            onChangeTimbre={(t) => {
              setTimbre(t);
              audioEngine.setTimbre(t);
              setStops(audioEngine.getStops());
            }}
            stops={stops}
            onUpdateStops={(partial) => {
              const next = { ...stops, ...partial };
              setStops(next);
              audioEngine.updateStops(partial);
            }}
            masterVolume={masterVolume}
            onChangeMasterVolume={(vol) => {
              setMasterVolume(vol);
              audioEngine.setMasterVolume(vol);
            }}
            keyboardLayout={keyboardLayout}
            onChangeKeyboardLayout={(mode) => setKeyboardLayout(mode)}
            a4ReferenceHz={a4ReferenceHz}
            onChangeReferenceHz={(hz) => setA4ReferenceHz(hz)}
            useJustIntonation={useJustIntonation}
            onToggleJustIntonation={() => setUseJustIntonation((prev) => !prev)}
            showDevanagari={showDevanagari}
            onToggleShowDevanagari={() => setShowDevanagari((prev) => !prev)}
            activeDemoId={activeDemoId}
            onPlayMelodyDemo={handlePlayMelodyDemo}
            onStopMelodyDemo={handleStopMelodyDemo}
            isRecording={isRecording}
            recordedEvents={recordedEvents}
            isPlayingRecording={isPlayingRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onPlayRecording={handlePlayRecording}
            onClearRecording={() => setRecordedEvents([])}
          />
        )}
      </main>
    </div>
  );
}
