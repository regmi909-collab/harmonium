import React from 'react';
import {
  Volume2,
  Wind,
  Sliders,
  Play,
  Square,
  Lock,
  Unlock,
  Music,
  Disc,
} from 'lucide-react';
import { ReedStopsConfig } from '../utils/audioEngine';
import {
  HarmoniumTimbreId,
  PITCH_CLASS_NAMES,
  RagaSuggestion,
  TaalDefinition,
  getSwaraForMidi,
  midiToFrequency,
} from '../utils/musicTheory';

interface BellowsAndStopsBarProps {
  activeNotes: Set<number>;
  sustainedNotes: Set<number>;
  rootPitchClass: number;
  a4ReferenceHz: number;
  useJustIntonation: boolean;
  bellowsPressure: number;
  autoBellows: boolean;
  onChangeBellowsPressure: (val: number) => void;
  onToggleAutoBellows: () => void;
  onPumpBellows: () => void;
  stops: ReedStopsConfig;
  onToggleStop: (stopKey: keyof Pick<ReedStopsConfig, 'bassReed' | 'maleReed' | 'femaleReed' | 'coupler'>) => void;
  timbre: HarmoniumTimbreId;
  onChangeTimbre: (t: HarmoniumTimbreId) => void;
  sustainMode: boolean;
  onToggleSustainMode: () => void;
  onClearSustainedNotes: () => void;
  tanpuraEnabled: boolean;
  onToggleTanpura: () => void;
  rhythmPlaying: boolean;
  onToggleRhythm: () => void;
  activeTaal: TaalDefinition;
  currentBeatIndex: number;
  bpm: number;
  activeRaga: RagaSuggestion;
  isPlayingDemo: boolean;
  onTogglePlayRagaPhrase: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const BellowsAndStopsBar: React.FC<BellowsAndStopsBarProps> = ({
  activeNotes,
  sustainedNotes,
  rootPitchClass,
  a4ReferenceHz,
  useJustIntonation,
  bellowsPressure,
  autoBellows,
  onChangeBellowsPressure,
  onToggleAutoBellows,
  onPumpBellows,
  stops,
  onToggleStop,
  timbre,
  onChangeTimbre,
  sustainMode,
  onToggleSustainMode,
  onClearSustainedNotes,
  tanpuraEnabled,
  onToggleTanpura,
  rhythmPlaying,
  onToggleRhythm,
  activeTaal,
  currentBeatIndex,
  bpm,
  activeRaga,
  isPlayingDemo,
  onTogglePlayRagaPhrase,
  sidebarOpen,
  onToggleSidebar,
}) => {
  const combinedMidis = Array.from(new Set([...Array.from(activeNotes), ...Array.from(sustainedNotes)])).sort(
    (a, b) => a - b
  );

  const currentStep = activeTaal.steps[currentBeatIndex] || activeTaal.steps[0];
  const rootName = PITCH_CLASS_NAMES[rootPitchClass];

  return (
    <div className="w-full bg-gradient-to-b from-[#26180f] via-[#1e130c] to-[#170f09] border-b border-amber-800/40 px-3 py-2 flex flex-col gap-2 shrink-0">
      {/* Row 1: Key Function Display Readout + Accompaniment Status + Sidebar Drawer Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Live Swara / Note Function Display */}
        <div
          className="flex items-center gap-3 bg-[#110b07] border border-amber-700/35 rounded-xl px-3.5 py-1.5 min-w-[240px] flex-1"
          data-testid="live-note-readout"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-amber-300/60 font-medium truncate">
              Active Swara · Sa = {rootName} ({a4ReferenceHz} Hz) · {activeRaga.name}
            </span>
            {combinedMidis.length > 0 ? (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-bold text-amber-300 tracking-tight">
                  {combinedMidis
                    .map((m) => {
                      const sw = getSwaraForMidi(m, rootPitchClass);
                      return `${sw.short} [${sw.devanagari}]`;
                    })
                    .join(' + ')}
                </span>
                <span className="text-xs font-mono-tabular text-amber-100/75 truncate">
                  {combinedMidis
                    .map(
                      (m) =>
                        `${PITCH_CLASS_NAMES[m % 12]}${Math.floor(m / 12) - 1} (${midiToFrequency(
                          m,
                          a4ReferenceHz,
                          rootPitchClass,
                          useJustIntonation
                        )} Hz)`
                    )
                    .join(', ')}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-100/65 truncate">
                <span>Touch keys or press A–L to perform</span>
                <span>·</span>
                <span className="text-amber-300/90 font-mono-tabular">Aroha: {activeRaga.aroha}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Accompaniment & Phrase Triggers */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Play Raga Phrase Button */}
          <button
            type="button"
            onClick={onTogglePlayRagaPhrase}
            className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
              isPlayingDemo
                ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-sm'
                : 'bg-[#2a1b11] text-amber-100 border-amber-700/40 hover:bg-[#362316]'
            }`}
          >
            {isPlayingDemo ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlayingDemo ? 'Stop Phrase' : 'Play Raga Phrase'}</span>
          </button>

          {/* Tanpura Quick Toggle */}
          <button
            type="button"
            onClick={onToggleTanpura}
            aria-pressed={tanpuraEnabled}
            className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
              tanpuraEnabled
                ? 'bg-teal-700 text-white border-teal-500'
                : 'bg-[#2a1b11] text-amber-100/80 border-amber-700/40 hover:bg-[#362316]'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Tanpura ({rootName}): {tanpuraEnabled ? 'On' : 'Off'}</span>
          </button>

          {/* Tabla / Madal Quick Toggle */}
          <button
            type="button"
            onClick={onToggleRhythm}
            aria-pressed={rhythmPlaying}
            className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
              rhythmPlaying
                ? 'bg-rose-700 text-white border-rose-500'
                : 'bg-[#2a1b11] text-amber-100/80 border-amber-700/40 hover:bg-[#362316]'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            <span>
              {activeTaal.instrument === 'madal' ? 'Madal' : 'Tabla'}:{' '}
              {rhythmPlaying ? `${currentStep.bol} (${currentBeatIndex + 1}/${activeTaal.beats})` : `${bpm} BPM`}
            </span>
          </button>

          {/* Toggle Options Sidebar Drawer */}
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-expanded={sidebarOpen}
            className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
              sidebarOpen
                ? 'bg-amber-600 text-stone-950 border-amber-400'
                : 'bg-[#2a1b11] text-amber-100 border-amber-600/50 hover:bg-[#362316]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{sidebarOpen ? 'Hide Options' : 'Studio Options'}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Bellows Touch Strip, Brass Reed Stops & Folk Timbre Selector (Single-Line Compact) */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-amber-900/35">
        {/* Bellows Expression & Touch Pump */}
        <div className="flex items-center gap-1.5 bg-[#140d08] border border-amber-800/30 rounded-xl px-2 py-0.5">
          <button
            type="button"
            onClick={onPumpBellows}
            className="min-h-[36px] px-2 py-1 rounded-lg bg-amber-700/30 hover:bg-amber-700/50 border border-amber-500/30 text-amber-200 text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition-transform whitespace-nowrap shrink-0"
          >
            <Wind className="w-3 h-3" />
            <span>Pump</span>
          </button>

          <div className="flex flex-col w-[82px]">
            <div className="flex items-center justify-between text-[10px] text-amber-200/75 font-mono-tabular">
              <label htmlFor="bellows-pressure-slider">Air</label>
              <span>{Math.round(bellowsPressure * 100)}%</span>
            </div>
            <input
              id="bellows-pressure-slider"
              type="range"
              min={15}
              max={100}
              value={Math.round(bellowsPressure * 100)}
              onChange={(e) => onChangeBellowsPressure(Number(e.target.value) / 100)}
              className="w-full accent-amber-500 cursor-pointer h-1.5"
            />
          </div>

          <button
            type="button"
            onClick={onToggleAutoBellows}
            aria-pressed={autoBellows}
            className={`min-h-[36px] px-2 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              autoBellows
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-800 text-stone-400'
            }`}
          >
            Auto: {autoBellows ? 'On' : 'Off'}
          </button>
        </div>

        {/* Brass Reed Draw-Stops */}
        <div className="flex items-center gap-1">
          {(
            [
              { key: 'bassReed', label: "Bass 16'" },
              { key: 'maleReed', label: "Male 8'" },
              { key: 'femaleReed', label: "Female 8'" },
              { key: 'coupler', label: 'Coupler' },
            ] as const
          ).map((stop) => {
            const active = stops[stop.key];
            return (
              <button
                key={stop.key}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleStop(stop.key)}
                className={`min-h-[36px] px-2 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 border ${
                  active
                    ? 'bg-gradient-to-b from-amber-500/25 to-amber-700/25 text-amber-200 border-amber-500/50'
                    : 'bg-[#140d08] text-stone-400 border-stone-800 hover:text-stone-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full border ${
                    active ? 'bg-amber-400 border-amber-200' : 'bg-stone-700 border-stone-600'
                  }`}
                />
                <span>{stop.label}</span>
              </button>
            );
          })}
        </div>

        {/* Nepali Folk Timbre & Chord Sustain Hold */}
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-[#140d08] p-0.5 rounded-xl border border-amber-900/40">
            {(
              [
                { id: 'sarangi-ensemble', label: 'Sarangi Folk' },
                { id: 'classic-reed', label: 'Classic' },
                { id: 'pahadi-folk', label: 'Pahadi' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChangeTimbre(t.id)}
                className={`min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  timbre === t.id
                    ? 'bg-amber-600 text-stone-950 font-semibold'
                    : 'text-amber-100/70 hover:text-amber-100'
                }`}
              >
                <Music className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleSustainMode}
            aria-pressed={sustainMode}
            className={`min-h-[36px] px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 border ${
              sustainMode
                ? 'bg-amber-500 text-stone-950 border-amber-300'
                : 'bg-[#140d08] text-amber-200/80 border-amber-800/40 hover:bg-[#23170f]'
            }`}
          >
            {sustainMode ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>Hold: {sustainMode ? 'Latch' : 'Touch'}</span>
          </button>

          {sustainedNotes.size > 0 && (
            <button
              type="button"
              onClick={onClearSustainedNotes}
              className="min-h-[36px] px-2 py-1 rounded-xl text-[11px] font-semibold bg-rose-900/60 text-rose-200 border border-rose-600/40 hover:bg-rose-800/70 whitespace-nowrap shrink-0"
            >
              Release ({sustainedNotes.size})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
