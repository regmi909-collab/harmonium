import React, { useState } from 'react';
import {
  Compass,
  Disc,
  Sliders,
  Radio,
  Play,
  Square,
  Check,
  Volume2,
  CircleDot,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { ReedStopsConfig } from '../utils/audioEngine';
import {
  BolStep,
  HarmoniumTimbreId,
  MELODY_DEMOS,
  MelodyDemo,
  PITCH_CLASS_NAMES,
  RAGA_SUGGESTIONS,
  RagaSuggestion,
  SWARA_MAP,
  TAAL_DEFINITIONS,
  TaalDefinition,
} from '../utils/musicTheory';

export type SidebarTabId = 'raga' | 'rhythm' | 'sound' | 'practice';

export interface RecordedEvent {
  midi: number;
  startTimeMs: number;
  durationMs: number;
}

interface TouchSidebarProps {
  activeTab: SidebarTabId;
  onSelectTab: (tab: SidebarTabId) => void;
  // Raga state
  activeRaga: RagaSuggestion;
  onSelectRaga: (raga: RagaSuggestion) => void;
  showRagaGuide: boolean;
  onToggleShowRagaGuide: () => void;
  ragaScaleLock: boolean;
  onToggleRagaScaleLock: () => void;
  isPlayingDemo: boolean;
  onTogglePlayRagaPhrase: () => void;
  onApplyRagaRecommendedSetup: (raga: RagaSuggestion) => void;
  // Pitch & Tanpura state
  rootPitchClass: number;
  onChangeRootPitchClass: (pc: number) => void;
  tanpuraEnabled: boolean;
  onToggleTanpura: () => void;
  tanpuraFirstString: 'Pa' | 'Ma' | 'Ni';
  onChangeTanpuraFirstString: (s: 'Pa' | 'Ma' | 'Ni') => void;
  tanpuraVolume: number;
  onChangeTanpuraVolume: (v: number) => void;
  // Tabla & Madal Rhythm state
  activeTaal: TaalDefinition;
  onSelectTaal: (taal: TaalDefinition) => void;
  rhythmPlaying: boolean;
  onToggleRhythm: () => void;
  bpm: number;
  onChangeBpm: (bpm: number) => void;
  rhythmVolume: number;
  onChangeRhythmVolume: (v: number) => void;
  currentBeatIndex: number;
  onAuditionBolStep: (step: BolStep, instrument: 'madal' | 'tabla') => void;
  // Sound & Voicing state
  timbre: HarmoniumTimbreId;
  onChangeTimbre: (t: HarmoniumTimbreId) => void;
  stops: ReedStopsConfig;
  onUpdateStops: (partial: Partial<ReedStopsConfig>) => void;
  masterVolume: number;
  onChangeMasterVolume: (v: number) => void;
  keyboardLayout: 'pad-24' | 'concert-32';
  onChangeKeyboardLayout: (mode: 'pad-24' | 'concert-32') => void;
  a4ReferenceHz: number;
  onChangeReferenceHz: (hz: number) => void;
  useJustIntonation: boolean;
  onToggleJustIntonation: () => void;
  showDevanagari: boolean;
  onToggleShowDevanagari: () => void;
  // Demos & Recording state
  activeDemoId: string | null;
  onPlayMelodyDemo: (demo: MelodyDemo) => void;
  onStopMelodyDemo: () => void;
  isRecording: boolean;
  recordedEvents: RecordedEvent[];
  isPlayingRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPlayRecording: () => void;
  onClearRecording: () => void;
}

export const TouchSidebar: React.FC<TouchSidebarProps> = ({
  activeTab,
  onSelectTab,
  activeRaga,
  onSelectRaga,
  showRagaGuide,
  onToggleShowRagaGuide,
  ragaScaleLock,
  onToggleRagaScaleLock,
  isPlayingDemo,
  onTogglePlayRagaPhrase,
  onApplyRagaRecommendedSetup,
  rootPitchClass,
  onChangeRootPitchClass,
  tanpuraEnabled,
  onToggleTanpura,
  tanpuraFirstString,
  onChangeTanpuraFirstString,
  tanpuraVolume,
  onChangeTanpuraVolume,
  activeTaal,
  onSelectTaal,
  rhythmPlaying,
  onToggleRhythm,
  bpm,
  onChangeBpm,
  rhythmVolume,
  onChangeRhythmVolume,
  currentBeatIndex,
  onAuditionBolStep,
  timbre,
  onChangeTimbre,
  stops,
  onUpdateStops,
  masterVolume,
  onChangeMasterVolume,
  keyboardLayout,
  onChangeKeyboardLayout,
  a4ReferenceHz,
  onChangeReferenceHz,
  useJustIntonation,
  onToggleJustIntonation,
  showDevanagari,
  onToggleShowDevanagari,
  activeDemoId,
  onPlayMelodyDemo,
  onStopMelodyDemo,
  isRecording,
  recordedEvents,
  isPlayingRecording,
  onStartRecording,
  onStopRecording,
  onPlayRecording,
  onClearRecording,
}) => {
  const [ragaCategoryFilter, setRagaCategoryFilter] = useState<string>('All');
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  const filteredRagas =
    ragaCategoryFilter === 'All'
      ? RAGA_SUGGESTIONS
      : RAGA_SUGGESTIONS.filter((r) => r.category === ragaCategoryFilter);

  const handleTapTempo = () => {
    const now = performance.now();
    const recent = [...tapTimestamps.filter((t) => now - t < 3500), now];
    setTapTimestamps(recent);
    if (recent.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i] - recent[i - 1]);
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgMs);
      if (calculatedBpm >= 45 && calculatedBpm <= 220) {
        onChangeBpm(calculatedBpm);
      }
    }
  };

  return (
    <aside
      aria-label="Harmonium Touch Options Sidebar"
      className="w-full md:w-[340px] lg:w-[360px] h-full bg-[#1a120c] border-l border-amber-800/40 flex flex-col shrink-0 select-none overflow-hidden"
    >
      {/* Top Touch Navigation Tabs (44px+ hit targets) */}
      <div
        role="tablist"
        aria-label="Studio Option Panels"
        className="grid grid-cols-4 gap-1 p-2 bg-[#120c08] border-b border-amber-900/40 shrink-0"
      >
        {(
          [
            { id: 'raga', label: 'Raga & Folk', icon: Compass },
            { id: 'rhythm', label: 'Tanpura & Taal', icon: Disc },
            { id: 'sound', label: 'Reed & Sound', icon: Sliders },
            { id: 'practice', label: 'Demos & Rec', icon: Radio },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[48px] px-2 py-1.5 rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-amber-600 text-stone-950 shadow-sm'
                  : 'text-amber-100/70 hover:text-amber-100 hover:bg-[#241810]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[11px] leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Panel Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* =================================================================== */}
        {/* TAB 1: RAGA & NEPALI FOLK SUGGESTIONS                               */}
        {/* =================================================================== */}
        {activeTab === 'raga' && (
          <div className="space-y-4">
            {/* Active Raga Spotlight */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-amber-300/75 font-medium">
                    {activeRaga.category} · {activeRaga.thaat}
                  </div>
                  <h2 className="text-lg font-bold text-amber-100 mt-0.5">{activeRaga.name}</h2>
                  <div className="text-xs text-amber-300/90 font-medium">{activeRaga.nepaliTitle}</div>
                </div>
                <button
                  type="button"
                  onClick={onTogglePlayRagaPhrase}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    isPlayingDemo
                      ? 'bg-amber-400 text-stone-950'
                      : 'bg-amber-600 text-stone-950 hover:bg-amber-500'
                  }`}
                >
                  {isPlayingDemo ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isPlayingDemo ? 'Stop Pakad' : 'Hear Pakad'}</span>
                </button>
              </div>

              <p className="text-xs text-amber-100/80 leading-relaxed">{activeRaga.folkContext}</p>

              {/* Aroha / Avroha / Pakad Readout */}
              <div className="bg-[#140d08] rounded-xl p-3 space-y-1.5 border border-amber-900/40 text-xs font-mono-tabular">
                <div className="flex justify-between gap-2">
                  <span className="text-amber-300/60">Aroha:</span>
                  <span className="text-amber-100 font-medium text-right">{activeRaga.aroha}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-amber-300/60">Avroha:</span>
                  <span className="text-amber-100 font-medium text-right">{activeRaga.avroha}</span>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-amber-900/30">
                  <span className="text-amber-300/60">Pakad:</span>
                  <span className="text-amber-300 font-medium text-right">{activeRaga.pakad}</span>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-amber-900/30 text-[11px] text-amber-200/70">
                  <span>Vadi: {SWARA_MAP[activeRaga.vadiSemitone]?.short}</span>
                  <span>·</span>
                  <span>Samvadi: {SWARA_MAP[activeRaga.samvadiSemitone]?.short}</span>
                  <span>·</span>
                  <span>{activeRaga.timeOfDay}</span>
                </div>
              </div>

              {/* Scale Guide & Raga Key Lock Controls */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  aria-pressed={showRagaGuide}
                  onClick={onToggleShowRagaGuide}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap ${
                    showRagaGuide
                      ? 'bg-amber-500/20 text-amber-200 border-amber-500/50'
                      : 'bg-[#140d08] text-stone-400 border-stone-800'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Highlight Keys: {showRagaGuide ? 'On' : 'Off'}</span>
                </button>

                <button
                  type="button"
                  aria-pressed={ragaScaleLock}
                  onClick={onToggleRagaScaleLock}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap ${
                    ragaScaleLock
                      ? 'bg-teal-700 text-white border-teal-500'
                      : 'bg-[#140d08] text-amber-100/75 border-amber-800/40 hover:bg-[#1e140c]'
                  }`}
                >
                  <span>Raga Key Lock: {ragaScaleLock ? 'On' : 'Off'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => onApplyRagaRecommendedSetup(activeRaga)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold bg-[#2e1e13] hover:bg-[#3a2618] text-amber-200 border border-amber-600/35 flex items-center justify-center gap-2 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Sync Recommended Taal & Folk Timbre</span>
              </button>
            </div>

            {/* Category Filter Bar */}
            <div className="flex items-center gap-1 p-1 bg-[#120c08] rounded-xl border border-amber-900/40 overflow-x-auto">
              {['All', 'Nepali Folk', 'Hindustani Classical', 'Himalayan Devotional'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setRagaCategoryFilter(cat)}
                  className={`min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    ragaCategoryFilter === cat
                      ? 'bg-amber-600 text-stone-950 font-semibold'
                      : 'text-amber-100/70 hover:text-amber-100'
                  }`}
                >
                  {cat === 'Hindustani Classical' ? 'Classical' : cat === 'Himalayan Devotional' ? 'Devotional' : cat}
                </button>
              ))}
            </div>

            {/* Raga Suggestion List */}
            <div className="space-y-2">
              {filteredRagas.map((raga) => {
                const isSelected = raga.id === activeRaga.id;
                return (
                  <button
                    key={raga.id}
                    type="button"
                    onClick={() => onSelectRaga(raga)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-colors flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-[#2c1d12] border-amber-500/60 shadow-sm'
                        : 'bg-[#150e09] border-amber-900/30 hover:bg-[#21160e]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-amber-100">{raga.name}</span>
                      <span className="text-xs text-amber-300/80 font-medium">{raga.nepaliTitle}</span>
                    </div>
                    <div className="text-xs text-amber-200/60">
                      {raga.category} · {raga.mood}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-amber-400/90 mt-1">
                      Aroha: {raga.aroha}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: TANPURA DRONE & TABLA / MADAL ACCOMPANIMENT                  */}
        {/* =================================================================== */}
        {activeTab === 'rhythm' && (
          <div className="space-y-5">
            {/* Root Pitch (Scale Changer Sa) Selector */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-amber-100">Scale Changer · Root Pitch (Sa)</h3>
                  <p className="text-xs text-amber-200/65">
                    Transposes Sargam keys, Tanpura drone, and Madal/Tabla tonic
                  </p>
                </div>
                <span className="text-sm font-mono-tabular font-bold text-amber-300 whitespace-nowrap shrink-0">
                  Sa = {PITCH_CLASS_NAMES[rootPitchClass]}
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1.5">
                {PITCH_CLASS_NAMES.map((pitchName, idx) => {
                  const active = rootPitchClass === idx;
                  return (
                    <button
                      key={pitchName}
                      type="button"
                      onClick={() => onChangeRootPitchClass(idx)}
                      className={`min-h-[44px] rounded-xl text-xs font-mono-tabular font-semibold border transition-colors ${
                        active
                          ? 'bg-amber-500 text-stone-950 border-amber-300 shadow-sm'
                          : 'bg-[#140d08] text-amber-100/80 border-amber-900/40 hover:bg-[#2a1c12]'
                      }`}
                    >
                      {pitchName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tanpura Drone Settings */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-amber-100">Acoustic Tanpura Drone</h3>
                  <p className="text-xs text-amber-200/65">
                    Continuous 4-string Jivari resonance tuned to {PITCH_CLASS_NAMES[rootPitchClass]}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={tanpuraEnabled}
                  onClick={onToggleTanpura}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    tanpuraEnabled
                      ? 'bg-teal-600 text-white'
                      : 'bg-[#140d08] text-amber-100 border border-amber-700/40 hover:bg-[#2c1d12]'
                  }`}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{tanpuraEnabled ? 'Drone Active' : 'Start Tanpura'}</span>
                </button>
              </div>

              {/* First String Tuning: Pa / Ma / Ni */}
              <div className="space-y-1.5">
                <span className="text-xs text-amber-200/75 font-medium">First String Tuning</span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'Pa', label: 'Pa · Pancham (5th)' },
                      { id: 'Ma', label: 'Ma · Madhyam (4th)' },
                      { id: 'Ni', label: 'Ni · Nishad (7th)' },
                    ] as const
                  ).map((str) => (
                    <button
                      key={str.id}
                      type="button"
                      onClick={() => onChangeTanpuraFirstString(str.id)}
                      className={`min-h-[44px] px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        tanpuraFirstString === str.id
                          ? 'bg-teal-700/60 text-teal-100 border-teal-400'
                          : 'bg-[#140d08] text-amber-100/75 border-amber-900/40'
                      }`}
                    >
                      {str.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-amber-200/75 font-mono-tabular">
                  <label htmlFor="tanpura-vol-slider">Tanpura Drone Level</label>
                  <span>{Math.round(tanpuraVolume * 100)}%</span>
                </div>
                <input
                  id="tanpura-vol-slider"
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round(tanpuraVolume * 100)}
                  onChange={(e) => onChangeTanpuraVolume(Number(e.target.value) / 100)}
                  className="w-full accent-teal-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Nepali Madal & Classical Tabla Accompaniment */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-amber-100">Madal & Tabla Accompaniment</h3>
                  <p className="text-xs text-amber-200/65">
                    {activeTaal.nepaliName} · {activeTaal.beats} Matras ({activeTaal.vibhagDivision})
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={rhythmPlaying}
                  onClick={onToggleRhythm}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    rhythmPlaying
                      ? 'bg-rose-600 text-white'
                      : 'bg-amber-600 text-stone-950 hover:bg-amber-500'
                  }`}
                >
                  {rhythmPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{rhythmPlaying ? 'Stop Taal' : 'Start Taal'}</span>
                </button>
              </div>

              {/* Taal Selector */}
              <div className="space-y-1.5">
                <span className="text-xs text-amber-200/75 font-medium">Select Nepali Madal or Tabla Taal</span>
                <div className="space-y-1.5">
                  {TAAL_DEFINITIONS.map((taal) => {
                    const selected = taal.id === activeTaal.id;
                    return (
                      <button
                        key={taal.id}
                        type="button"
                        onClick={() => onSelectTaal(taal)}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors ${
                          selected
                            ? 'bg-[#342114] border-amber-500/60 text-amber-100'
                            : 'bg-[#140d08] border-amber-900/35 text-amber-100/75 hover:bg-[#1e140c]'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold">{taal.name}</div>
                          <div className="text-[11px] text-amber-200/60">{taal.description}</div>
                        </div>
                        <span className="text-xs font-mono-tabular font-semibold text-amber-300 shrink-0">
                          {taal.beats} Beats
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* BPM Tempo Controls */}
              <div className="bg-[#140d08] rounded-xl p-3 border border-amber-900/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="taal-bpm-slider" className="text-xs font-medium text-amber-200/80">
                    Tempo (Laya)
                  </label>
                  <span className="text-sm font-mono-tabular font-bold text-amber-300">{bpm} BPM</span>
                </div>
                <input
                  id="taal-bpm-slider"
                  type="range"
                  min={45}
                  max={220}
                  value={bpm}
                  onChange={(e) => onChangeBpm(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeBpm(Math.max(45, bpm - 5))}
                    className="min-h-[40px] rounded-lg bg-[#23170f] hover:bg-[#2f1f14] text-xs font-mono-tabular font-semibold text-amber-200"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeBpm(Math.max(45, bpm - 1))}
                    className="min-h-[40px] rounded-lg bg-[#23170f] hover:bg-[#2f1f14] text-xs font-mono-tabular font-semibold text-amber-200"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={handleTapTempo}
                    className="min-h-[40px] rounded-lg bg-amber-700/30 hover:bg-amber-700/50 border border-amber-500/30 text-xs font-semibold text-amber-200"
                  >
                    Tap
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeBpm(Math.min(220, bpm + 1))}
                    className="min-h-[40px] rounded-lg bg-[#23170f] hover:bg-[#2f1f14] text-xs font-mono-tabular font-semibold text-amber-200"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeBpm(Math.min(220, bpm + 5))}
                    className="min-h-[40px] rounded-lg bg-[#23170f] hover:bg-[#2f1f14] text-xs font-mono-tabular font-semibold text-amber-200"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* Interactive Matra & Bol Cycle Grid (Tap any step to audition drum stroke) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-amber-200/75">
                  <span>Live Matra & Bol Cycle (Tap to audition stroke)</span>
                  <span className="font-mono-tabular">
                    Matra {currentBeatIndex + 1} / {activeTaal.beats}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {activeTaal.steps.map((step, idx) => {
                    const isCurrent = rhythmPlaying && currentBeatIndex === idx;
                    return (
                      <button
                        key={step.beatNumber}
                        type="button"
                        onClick={() => onAuditionBolStep(step, activeTaal.instrument)}
                        className={`min-h-[48px] p-1.5 rounded-xl border flex flex-col items-center justify-center transition-all ${
                          isCurrent
                            ? 'bg-amber-500 text-stone-950 border-amber-200 scale-[1.03] font-bold shadow'
                            : step.accent === 'sam'
                              ? 'bg-rose-950/50 text-rose-200 border-rose-700/40 hover:bg-rose-900/50'
                              : step.accent === 'khali'
                                ? 'bg-stone-900/80 text-stone-300 border-stone-700/40 hover:bg-stone-800'
                                : 'bg-[#140d08] text-amber-100 border-amber-900/40 hover:bg-[#22160e]'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between text-[9px] font-mono-tabular opacity-75 px-1">
                          <span>{step.beatNumber}</span>
                          {step.vibhagMarker && <span className="font-bold">{step.vibhagMarker}</span>}
                        </div>
                        <span className="text-xs font-bold leading-tight">{step.bol}</span>
                        <span className="text-[10px] opacity-80 leading-none">{step.devanagariBol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Percussion Volume */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-amber-200/75 font-mono-tabular">
                  <label htmlFor="rhythm-vol-slider">
                    {activeTaal.instrument === 'madal' ? 'Madal' : 'Tabla'} Volume
                  </label>
                  <span>{Math.round(rhythmVolume * 100)}%</span>
                </div>
                <input
                  id="rhythm-vol-slider"
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round(rhythmVolume * 100)}
                  onChange={(e) => onChangeRhythmVolume(Number(e.target.value) / 100)}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: SOUND, NEPALI SARANGI RESONANCE & REED STOPS                 */}
        {/* =================================================================== */}
        {activeTab === 'sound' && (
          <div className="space-y-4">
            {/* Nepali Folk & Harmonium Timbre Profiles */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-amber-100">Harmonium & Nepali Folk Voicing</h3>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'sarangi-ensemble',
                      title: 'Harmonium + Sarangi Resonance',
                      desc: 'Blends warm teakwood reeds with bowed Nepali Sarangi sympathetic string overtones',
                    },
                    {
                      id: 'classic-reed',
                      title: 'Classic Concert Scale-Changer',
                      desc: 'Pure acoustic 3-reed Burmese teak harmonium for classical Raga & Ghazal',
                    },
                    {
                      id: 'pahadi-folk',
                      title: 'Pahadi Double-Reed Chorus',
                      desc: 'Wider celeste detuning suited for outdoor hill folk songs & Madal ensembles',
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeTimbre(item.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      timbre === item.id
                        ? 'bg-[#342114] border-amber-500 text-amber-100'
                        : 'bg-[#140d08] border-amber-900/35 text-amber-100/75 hover:bg-[#1e140c]'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.title}</div>
                    <div className="text-[11px] text-amber-200/65 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Acoustic Mix & Sarangi Sympathetic Sliders */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3.5">
              <h3 className="text-sm font-bold text-amber-100">Acoustic Chamber & Expression</h3>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-amber-200/80 font-mono-tabular">
                  <label htmlFor="master-vol-slider">Master Output Gain</label>
                  <span>{Math.round(masterVolume * 100)}%</span>
                </div>
                <input
                  id="master-vol-slider"
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(masterVolume * 100)}
                  onChange={(e) => onChangeMasterVolume(Number(e.target.value) / 100)}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-amber-200/80 font-mono-tabular">
                  <label htmlFor="sarangi-blend-slider">Sarangi Bowed String Resonance</label>
                  <span>{Math.round(stops.sarangiResonance * 100)}%</span>
                </div>
                <input
                  id="sarangi-blend-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(stops.sarangiResonance * 100)}
                  onChange={(e) => onUpdateStops({ sarangiResonance: Number(e.target.value) / 100 })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-amber-200/80 font-mono-tabular">
                  <label htmlFor="reverb-mix-slider">Wooden Baithak Hall Ambience</label>
                  <span>{Math.round(stops.reverbMix * 100)}%</span>
                </div>
                <input
                  id="reverb-mix-slider"
                  type="range"
                  min={0}
                  max={85}
                  value={Math.round(stops.reverbMix * 100)}
                  onChange={(e) => onUpdateStops({ reverbMix: Number(e.target.value) / 100 })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Lenovo Pad Screen Ergonomics & Tuning */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-amber-100">Lenovo Pad Key Display & Tuning</h3>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeKeyboardLayout('pad-24')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    keyboardLayout === 'pad-24'
                      ? 'bg-amber-600 text-stone-950 border-amber-400'
                      : 'bg-[#140d08] text-amber-100/75 border-amber-900/40'
                  }`}
                >
                  Pad View (24 Wide Keys)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeKeyboardLayout('concert-32')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    keyboardLayout === 'concert-32'
                      ? 'bg-amber-600 text-stone-950 border-amber-400'
                      : 'bg-[#140d08] text-amber-100/75 border-amber-900/40'
                  }`}
                >
                  Concert (32 Keys)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeReferenceHz(440)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-mono-tabular font-semibold border transition-colors ${
                    a4ReferenceHz === 440
                      ? 'bg-amber-500/25 text-amber-200 border-amber-500/50'
                      : 'bg-[#140d08] text-stone-400 border-stone-800'
                  }`}
                >
                  A4 = 440 Hz (Standard)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeReferenceHz(432)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-mono-tabular font-semibold border transition-colors ${
                    a4ReferenceHz === 432
                      ? 'bg-amber-500/25 text-amber-200 border-amber-500/50'
                      : 'bg-[#140d08] text-stone-400 border-stone-800'
                  }`}
                >
                  A4 = 432 Hz (Warm)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={useJustIntonation}
                  onClick={onToggleJustIntonation}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    useJustIntonation
                      ? 'bg-teal-900/50 text-teal-200 border-teal-500/40'
                      : 'bg-[#140d08] text-stone-400 border-stone-800'
                  }`}
                >
                  Just Intonation: {useJustIntonation ? 'On' : 'Equal'}
                </button>

                <button
                  type="button"
                  aria-pressed={showDevanagari}
                  onClick={onToggleShowDevanagari}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    showDevanagari
                      ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                      : 'bg-[#140d08] text-stone-400 border-stone-800'
                  }`}
                >
                  Sargam Symbols (S R G): {showDevanagari ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: NEPALI FOLK DEMOS & LIVE RECORDER                            */}
        {/* =================================================================== */}
        {activeTab === 'practice' && (
          <div className="space-y-4">
            {/* Built-in Nepali Folk & Raga Interactive Songs */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-amber-100">Interactive Folk & Raga Performances</h3>
                <p className="text-xs text-amber-200/65">
                  Watch the harmonium keys illuminate in real time with authentic phrasing
                </p>
              </div>

              <div className="space-y-2">
                {MELODY_DEMOS.map((demo) => {
                  const playingThis = activeDemoId === demo.id;
                  return (
                    <div
                      key={demo.id}
                      className="p-3 rounded-xl bg-[#140d08] border border-amber-900/40 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-bold text-amber-100">{demo.title}</div>
                        <div className="text-[11px] text-amber-200/65">{demo.subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => (playingThis ? onStopMelodyDemo() : onPlayMelodyDemo(demo))}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                          playingThis
                            ? 'bg-amber-400 text-stone-950'
                            : 'bg-amber-600 text-stone-950 hover:bg-amber-500'
                        }`}
                      >
                        {playingThis ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        <span>{playingThis ? 'Stop' : 'Play Demo'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Performance Recorder */}
            <div className="bg-[#23170f] border border-amber-700/35 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-amber-100">Phrase Recorder</h3>
                  <p className="text-xs text-amber-200/65">
                    Capture your harmonium phrases and replay them over Tanpura & Madal
                  </p>
                </div>
                <span className="text-xs font-mono-tabular text-amber-300">
                  {recordedEvents.length} notes
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={isRecording ? onStopRecording : onStartRecording}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    isRecording
                      ? 'bg-rose-600 text-white'
                      : 'bg-[#140d08] text-rose-300 border border-rose-700/40 hover:bg-rose-950/40'
                  }`}
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  <span>{isRecording ? 'Stop Rec' : 'Record'}</span>
                </button>

                <button
                  type="button"
                  disabled={recordedEvents.length === 0 || isRecording}
                  onClick={onPlayRecording}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 bg-amber-600 text-stone-950 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isPlayingRecording ? 'Playing...' : 'Replay'}</span>
                </button>

                <button
                  type="button"
                  disabled={recordedEvents.length === 0 || isRecording}
                  onClick={onClearRecording}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 bg-[#140d08] text-stone-300 border border-stone-800 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
