import React from 'react';
import { Volume2, Disc, Music, Lock, Unlock } from 'lucide-react';
import {
  HarmoniumTimbreId,
  PITCH_CLASS_NAMES,
  RAGA_SUGGESTIONS,
  RagaSuggestion,
  TAAL_DEFINITIONS,
  TaalDefinition,
} from '../utils/musicTheory';

interface TouchSidebarProps {
  // Tone & Stops
  timbre: HarmoniumTimbreId;
  onChangeTimbre: (t: HarmoniumTimbreId) => void;
  coupler: boolean;
  onToggleCoupler: () => void;
  sustainMode: boolean;
  onToggleSustainMode: () => void;
  sustainedCount: number;
  onClearSustained: () => void;
  masterVolume: number;
  onChangeMasterVolume: (v: number) => void;
  // Scale (Sa)
  rootPitchClass: number;
  onChangeRootPitchClass: (pc: number) => void;
  // Tanpura & Rhythm
  tanpuraEnabled: boolean;
  onToggleTanpura: () => void;
  rhythmPlaying: boolean;
  activeTaal: TaalDefinition;
  onSelectAndPlayTaal: (taal: TaalDefinition | null) => void;
  bpm: number;
  onChangeBpm: (bpm: number) => void;
  currentBeatIndex: number;
  // Raga Guide
  activeRaga: RagaSuggestion | null;
  onSelectRaga: (raga: RagaSuggestion | null) => void;
}

const COMMON_SA_PITCHES = [
  { index: 0, label: 'C' },
  { index: 1, label: 'C#' },
  { index: 2, label: 'D' },
  { index: 4, label: 'E' },
  { index: 5, label: 'F' },
  { index: 7, label: 'G' },
  { index: 9, label: 'A' },
];

export const TouchSidebar: React.FC<TouchSidebarProps> = ({
  timbre,
  onChangeTimbre,
  coupler,
  onToggleCoupler,
  sustainMode,
  onToggleSustainMode,
  sustainedCount,
  onClearSustained,
  masterVolume,
  onChangeMasterVolume,
  rootPitchClass,
  onChangeRootPitchClass,
  tanpuraEnabled,
  onToggleTanpura,
  rhythmPlaying,
  activeTaal,
  onSelectAndPlayTaal,
  bpm,
  onChangeBpm,
  currentBeatIndex,
  activeRaga,
  onSelectRaga,
}) => {
  const currentStep = activeTaal.steps[currentBeatIndex] || activeTaal.steps[0];

  return (
    <aside
      aria-label="Harmonium Touch Options Sidebar"
      className="w-full md:w-[300px] lg:w-[320px] h-full bg-[#18110b] border-l border-amber-800/35 flex flex-col shrink-0 select-none overflow-y-auto p-3.5 space-y-4"
    >
      {/* 1. Sound Tone & Key Hold */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-amber-200/80">1. Harmonium Tone</h2>
          <span className="text-xs font-mono-tabular text-amber-300">
            Vol {Math.round(masterVolume * 100)}%
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: 'sarangi-ensemble', label: 'Sarangi Folk' },
              { id: 'classic-reed', label: 'Classic Reed' },
              { id: 'pahadi-folk', label: 'Warm Folk' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTimbre(item.id)}
              className={`min-h-[44px] px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                timbre === item.id
                  ? 'bg-amber-600 text-stone-950 border-amber-400'
                  : 'bg-[#120c08] text-amber-100/80 border-amber-900/40 hover:bg-[#241810]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={coupler}
            onClick={onToggleCoupler}
            className={`min-h-[44px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              coupler
                ? 'bg-amber-500/25 text-amber-200 border-amber-500/50'
                : 'bg-[#120c08] text-stone-400 border-stone-800'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Coupler: {coupler ? 'On' : 'Off'}</span>
          </button>

          <button
            type="button"
            aria-pressed={sustainMode}
            onClick={sustainMode && sustainedCount > 0 ? onClearSustained : onToggleSustainMode}
            className={`min-h-[44px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              sustainMode
                ? 'bg-amber-500 text-stone-950 border-amber-300'
                : 'bg-[#120c08] text-amber-100/80 border-amber-900/40'
            }`}
          >
            {sustainMode ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>
              {sustainMode
                ? sustainedCount > 0
                  ? `Release (${sustainedCount})`
                  : 'Hold: On'
                : 'Key Hold'}
            </span>
          </button>
        </div>

        <input
          aria-label="Master Volume"
          type="range"
          min={15}
          max={100}
          value={Math.round(masterVolume * 100)}
          onChange={(e) => onChangeMasterVolume(Number(e.target.value) / 100)}
          className="w-full accent-amber-500 cursor-pointer h-1.5"
        />
      </section>

      {/* 2. Scale / Pitch (Sa) */}
      <section className="space-y-2 pt-2 border-t border-amber-900/35">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-amber-200/80">2. Scale Pitch (Sa)</h2>
          <span className="text-xs font-mono-tabular font-bold text-amber-300">
            Sa = {PITCH_CLASS_NAMES[rootPitchClass]}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {COMMON_SA_PITCHES.map((p) => (
            <button
              key={p.index}
              type="button"
              onClick={() => onChangeRootPitchClass(p.index)}
              className={`min-h-[44px] rounded-xl text-xs font-mono-tabular font-bold border transition-colors ${
                rootPitchClass === p.index
                  ? 'bg-amber-500 text-stone-950 border-amber-300'
                  : 'bg-[#120c08] text-amber-100/80 border-amber-900/40 hover:bg-[#241810]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Tanpura Drone & Madal / Tabla Rhythm */}
      <section className="space-y-2.5 pt-2 border-t border-amber-900/35">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-amber-200/80">3. Tanpura & Rhythm</h2>
          {rhythmPlaying && (
            <span className="text-xs font-mono-tabular font-semibold text-rose-300">
              {currentStep.bol} ({currentBeatIndex + 1}/{activeTaal.beats})
            </span>
          )}
        </div>

        {/* Tanpura Drone Toggle */}
        <button
          type="button"
          aria-pressed={tanpuraEnabled}
          onClick={onToggleTanpura}
          className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-between transition-colors ${
            tanpuraEnabled
              ? 'bg-teal-700 text-white border-teal-500'
              : 'bg-[#120c08] text-amber-100/85 border-amber-900/40 hover:bg-[#241810]'
          }`}
        >
          <span className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            <span>Tanpura Drone ({PITCH_CLASS_NAMES[rootPitchClass]} - Pa)</span>
          </span>
          <span>{tanpuraEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* Simple Madal & Tabla Rhythm Buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          {TAAL_DEFINITIONS.slice(0, 4).map((taal) => {
            const isSelected = rhythmPlaying && activeTaal.id === taal.id;
            const shortLabel =
              taal.id === 'khyali-madal'
                ? 'Madal (8 Beat)'
                : taal.id === 'jhyaure-madal'
                  ? 'Madal (6 Beat)'
                  : taal.id === 'keherwa-tabla'
                    ? 'Tabla (8 Beat)'
                    : 'Tabla (6 Beat)';

            return (
              <button
                key={taal.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectAndPlayTaal(isSelected ? null : taal)}
                className={`min-h-[44px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-rose-700 text-white border-rose-400'
                    : 'bg-[#120c08] text-amber-100/80 border-amber-900/40 hover:bg-[#241810]'
                }`}
              >
                <Disc className="w-3.5 h-3.5 shrink-0" />
                <span>{shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Simple Tempo (- / BPM / +) */}
        <div className="flex items-center justify-between gap-2 bg-[#120c08] p-1.5 rounded-xl border border-amber-900/35">
          <button
            type="button"
            onClick={() => onChangeBpm(Math.max(50, bpm - 8))}
            className="min-h-[38px] px-3 rounded-lg bg-[#23170f] hover:bg-[#2f1f14] text-xs font-mono-tabular font-bold text-amber-200"
          >
            - Slow
          </button>
          <span className="text-xs font-mono-tabular font-semibold text-amber-200">
            {bpm} BPM
          </span>
          <button
            type="button"
            onClick={() => onChangeBpm(Math.min(200, bpm + 8))}
            className="min-h-[38px] px-3 rounded-lg bg-[#23170f] hover:bg-[#2f1f14] text-xs font-mono-tabular font-bold text-amber-200"
          >
            + Fast
          </button>
        </div>
      </section>

      {/* 4. Raga Scale Guide */}
      <section className="space-y-2 pt-2 border-t border-amber-900/35">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-amber-200/80">4. Raga Key Guide</h2>
          {activeRaga && (
            <button
              type="button"
              onClick={() => onSelectRaga(null)}
              className="text-[11px] text-amber-400 hover:underline"
            >
              Show All Keys
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSelectRaga(null)}
            className={`min-h-[44px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
              activeRaga === null
                ? 'bg-amber-600 text-stone-950 border-amber-400'
                : 'bg-[#120c08] text-amber-100/80 border-amber-900/40 hover:bg-[#241810]'
            }`}
          >
            Free Play (All)
          </button>

          {RAGA_SUGGESTIONS.slice(0, 5).map((raga) => {
            const selected = activeRaga?.id === raga.id;
            const shortName =
              raga.id === 'jhyaure-pahadi'
                ? 'Pahadi Folk'
                : raga.id === 'maruni-sorathi'
                  ? 'Maruni Folk'
                  : raga.name;
            return (
              <button
                key={raga.id}
                type="button"
                onClick={() => onSelectRaga(raga)}
                className={`min-h-[44px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap truncate ${
                  selected
                    ? 'bg-amber-600 text-stone-950 border-amber-400'
                    : 'bg-[#120c08] text-amber-100/80 border-amber-900/40 hover:bg-[#241810]'
                }`}
              >
                {shortName}
              </button>
            );
          })}
        </div>

        {activeRaga && (
          <div className="p-2.5 rounded-xl bg-[#120c08] border border-amber-900/35 text-xs space-y-1">
            <div className="font-semibold text-amber-200">{activeRaga.name}</div>
            <div className="font-mono-tabular text-[11px] text-amber-300/90">
              Notes: {activeRaga.aroha}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
};
