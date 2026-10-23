/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sliders, VolumeX } from 'lucide-react';
import { HarmoniumKeyboard } from './components/HarmoniumKeyboard';
import { TouchSidebar } from './components/TouchSidebar';
import { audioEngine } from './utils/audioEngine';
import {
  HarmoniumTimbreId,
  PITCH_CLASS_NAMES,
  RagaSuggestion,
  TAAL_DEFINITIONS,
  TaalDefinition,
  generateHarmoniumKeys,
  getSwaraForMidi,
} from './utils/musicTheory';

export default function App() {
  const keys = useMemo(() => generateHarmoniumKeys('pad-24'), []);

  // Active & sustained harmonium keys
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [sustainedNotes, setSustainedNotes] = useState<Set<number>>(new Set());
  const [sustainMode, setSustainMode] = useState<boolean>(false);

  // Core sound & scale state
  const [rootPitchClass, setRootPitchClass] = useState<number>(0); // C = 0
  const [timbre, setTimbre] = useState<HarmoniumTimbreId>('sarangi-ensemble');
  const [coupler, setCoupler] = useState<boolean>(false);
  const [masterVolume, setMasterVolume] = useState<number>(0.85);
  const [activeRaga, setActiveRaga] = useState<RagaSuggestion | null>(null);

  // Tanpura & Rhythm (Madal / Tabla) state
  const [tanpuraEnabled, setTanpuraEnabled] = useState<boolean>(false);
  const [activeTaal, setActiveTaal] = useState<TaalDefinition>(TAAL_DEFINITIONS[0]);
  const [rhythmPlaying, setRhythmPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(108);
  const [currentBeatIndex, setCurrentBeatIndex] = useState<number>(0);

  // Sidebar open/close toggle for full-screen pad mode
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  useEffect(() => {
    audioEngine.setRootPitch(rootPitchClass);
  }, [rootPitchClass]);

  const handleNoteStart = useCallback((midi: number) => {
    audioEngine.noteOn(midi);
    setActiveNotes((prev) => {
      if (prev.has(midi)) return prev;
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
  }, []);

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
    },
    [sustainedNotes]
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

  const handleClearSustained = useCallback(() => {
    sustainedNotes.forEach((midi) => audioEngine.noteOff(midi));
    setSustainedNotes(new Set());
  }, [sustainedNotes]);

  const handleSilenceAll = useCallback(() => {
    setRhythmPlaying(false);
    setTanpuraEnabled(false);
    audioEngine.setTanpuraConfig({ enabled: false });
    audioEngine.stopAllNotes();
    setActiveNotes(new Set());
    setSustainedNotes(new Set());
  }, []);

  // Keyboard shortcuts (A–L, W–P, Z–C)
  useEffect(() => {
    const shortcutMap = new Map<string, number>();
    keys.forEach((k) => {
      if (k.keyboardShortcut) {
        shortcutMap.set(k.keyboardShortcut.toLowerCase(), k.midi);
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
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

  // Madal & Tabla Rhythm Scheduler
  useEffect(() => {
    if (!rhythmPlaying) return;

    const beatIntervalMs = Math.round(60000 / bpm);
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

  const combinedMidis = Array.from(
    new Set([...Array.from(activeNotes), ...Array.from(sustainedNotes)])
  ).sort((a, b) => a - b);

  const rootName = PITCH_CLASS_NAMES[rootPitchClass];

  return (
    <div className="w-screen h-screen flex flex-col bg-[#120e0a] text-[#f5efe6] overflow-hidden select-none">
      {/* Minimal Top Key Status Bar */}
      <header className="flex items-center justify-between gap-4 px-4 py-2 bg-[#160f0a] border-b border-amber-900/40 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base font-bold tracking-tight text-amber-200 font-display whitespace-nowrap shrink-0">
            SargamPad
          </span>
          <span className="text-amber-700/60">·</span>

          {/* Live Key Readout */}
          <div className="truncate text-sm font-medium" data-testid="live-note-readout">
            {combinedMidis.length > 0 ? (
              <span className="text-amber-300 font-bold">
                Playing:{' '}
                {combinedMidis
                  .map((m) => {
                    const sw = getSwaraForMidi(m, rootPitchClass);
                    return `${sw.short} (${PITCH_CLASS_NAMES[m % 12]}${Math.floor(m / 12) - 1})`;
                  })
                  .join(' + ')}
              </span>
            ) : (
              <span className="text-amber-100/70">
                Sa = {rootName}
                {activeRaga ? ` · ${activeRaga.name}` : ''}
                {tanpuraEnabled ? ' · Tanpura On' : ''}
                {rhythmPlaying ? ` · ${activeTaal.instrument === 'madal' ? 'Madal' : 'Tabla'} (${bpm} BPM)` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(combinedMidis.length > 0 || tanpuraEnabled || rhythmPlaying) && (
            <button
              type="button"
              onClick={handleSilenceAll}
              className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#2a1b11] hover:bg-[#382417] text-amber-200 border border-amber-700/40 flex items-center gap-1.5 whitespace-nowrap"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>Stop All</span>
            </button>
          )}

          <button
            type="button"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((prev) => !prev)}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
              sidebarOpen
                ? 'bg-amber-600 text-stone-950 border-amber-400'
                : 'bg-[#2a1b11] text-amber-100 border-amber-700/40 hover:bg-[#382417]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{sidebarOpen ? 'Hide Sidebar' : 'Options'}</span>
          </button>
        </div>
      </header>

      {/* Main Pad Workspace: Only Keys + Simple Touch Sidebar */}
      <main className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden">
        <HarmoniumKeyboard
          keys={keys}
          activeNotes={activeNotes}
          sustainedNotes={sustainedNotes}
          rootPitchClass={rootPitchClass}
          activeRaga={activeRaga}
          sustainMode={sustainMode}
          onNoteStart={handleNoteStart}
          onNoteStop={handleNoteStop}
          onToggleSustainNote={handleToggleSustainNote}
        />

        {sidebarOpen && (
          <TouchSidebar
            timbre={timbre}
            onChangeTimbre={(newTimbre) => {
              setTimbre(newTimbre);
              audioEngine.setTimbre(newTimbre);
            }}
            coupler={coupler}
            onToggleCoupler={() => {
              const next = !coupler;
              setCoupler(next);
              audioEngine.updateStops({ coupler: next });
            }}
            sustainMode={sustainMode}
            onToggleSustainMode={() => setSustainMode((prev) => !prev)}
            sustainedCount={sustainedNotes.size}
            onClearSustained={handleClearSustained}
            masterVolume={masterVolume}
            onChangeMasterVolume={(vol) => {
              setMasterVolume(vol);
              audioEngine.setMasterVolume(vol);
            }}
            rootPitchClass={rootPitchClass}
            onChangeRootPitchClass={(pc) => setRootPitchClass(pc)}
            tanpuraEnabled={tanpuraEnabled}
            onToggleTanpura={() => {
              const next = !tanpuraEnabled;
              setTanpuraEnabled(next);
              audioEngine.setTanpuraConfig({ enabled: next });
            }}
            rhythmPlaying={rhythmPlaying}
            activeTaal={activeTaal}
            onSelectAndPlayTaal={(taal) => {
              if (!taal) {
                setRhythmPlaying(false);
                return;
              }
              setActiveTaal(taal);
              setBpm(taal.defaultBpm);
              setCurrentBeatIndex(0);
              setRhythmPlaying(true);
            }}
            bpm={bpm}
            onChangeBpm={(newBpm) => setBpm(newBpm)}
            currentBeatIndex={currentBeatIndex}
            activeRaga={activeRaga}
            onSelectRaga={(raga) => setActiveRaga(raga)}
          />
        )}
      </main>
    </div>
  );
}
