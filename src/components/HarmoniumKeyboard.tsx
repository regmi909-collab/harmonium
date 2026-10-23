import React, { useRef } from 'react';
import {
  NoteDefinition,
  RagaSuggestion,
  evaluateKeyInRaga,
  getSwaraForMidi,
} from '../utils/musicTheory';

interface HarmoniumKeyboardProps {
  keys: NoteDefinition[];
  activeNotes: Set<number>;
  sustainedNotes: Set<number>;
  rootPitchClass: number;
  activeRaga: RagaSuggestion | null;
  sustainMode: boolean;
  onNoteStart: (midi: number) => void;
  onNoteStop: (midi: number) => void;
  onToggleSustainNote: (midi: number) => void;
}

export const HarmoniumKeyboard: React.FC<HarmoniumKeyboardProps> = ({
  keys,
  activeNotes,
  sustainedNotes,
  rootPitchClass,
  activeRaga,
  sustainMode,
  onNoteStart,
  onNoteStop,
  onToggleSustainNote,
}) => {
  const isPointerDraggingRef = useRef(false);
  const lastPointerMidiRef = useRef<number | null>(null);

  const naturalKeys = keys.filter((k) => !k.isSharp);

  const sharpKeyPositions = keys
    .filter((k) => k.isSharp)
    .map((sharpKey) => {
      const precedingNaturals = naturalKeys.filter((nk) => nk.midi < sharpKey.midi).length;
      return {
        key: sharpKey,
        leftPercent: (precedingNaturals / naturalKeys.length) * 100,
        widthPercent: (1 / naturalKeys.length) * 64,
      };
    });

  const handleKeyTriggerDown = (midi: number) => {
    if (sustainMode) {
      onToggleSustainNote(midi);
      return;
    }
    isPointerDraggingRef.current = true;
    lastPointerMidiRef.current = midi;
    onNoteStart(midi);
  };

  const handleKeyPointerEnter = (midi: number) => {
    if (!isPointerDraggingRef.current || sustainMode) return;
    if (lastPointerMidiRef.current !== null && lastPointerMidiRef.current !== midi) {
      onNoteStop(lastPointerMidiRef.current);
    }
    lastPointerMidiRef.current = midi;
    onNoteStart(midi);
  };

  const handleKeyTriggerUp = (midi: number) => {
    if (sustainMode) return;
    isPointerDraggingRef.current = false;
    if (lastPointerMidiRef.current === midi) {
      lastPointerMidiRef.current = null;
    }
    onNoteStop(midi);
  };

  const handleGlobalPointerUp = () => {
    if (sustainMode) return;
    isPointerDraggingRef.current = false;
    if (lastPointerMidiRef.current !== null) {
      onNoteStop(lastPointerMidiRef.current);
      lastPointerMidiRef.current = null;
    }
  };

  return (
    <div
      className="relative flex-1 flex flex-col w-full h-full select-none overflow-hidden bg-[#18110b]"
      onPointerUp={handleGlobalPointerUp}
      onPointerLeave={handleGlobalPointerUp}
      data-testid="harmonium-keyboard-stage"
    >
      {/* Top Teakwood & Red Felt Strip */}
      <div className="h-2.5 w-full bg-gradient-to-b from-[#3d1e10] to-[#631717] border-b border-amber-500/20 shrink-0" />

      {/* Main Harmonium Keybed */}
      <div className="relative flex-1 w-full flex px-2.5 pb-3 pt-0.5 bg-gradient-to-b from-[#241811] to-[#120c08]">
        {/* Natural Keys (White / Ivory) */}
        <div className="relative flex w-full h-full gap-[3px]">
          {naturalKeys.map((note) => {
            const isPressed = activeNotes.has(note.midi) || sustainedNotes.has(note.midi);
            const swara = getSwaraForMidi(note.midi, rootPitchClass);
            const ragaEval = activeRaga
              ? evaluateKeyInRaga(note.midi, rootPitchClass, activeRaga)
              : null;
            const isDimmed = ragaEval ? !ragaEval.inRaga : false;

            const saptakLabel =
              swara.saptakDot === 'low'
                ? `.${swara.short}`
                : swara.saptakDot === 'high'
                  ? `${swara.short}'`
                  : swara.short;

            return (
              <button
                key={note.midi}
                type="button"
                aria-label={`Play ${swara.short} (${note.westernName})`}
                aria-pressed={isPressed}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKeyTriggerDown(note.midi);
                }}
                onPointerEnter={() => handleKeyPointerEnter(note.midi)}
                onPointerUp={() => handleKeyTriggerUp(note.midi)}
                onClick={() => {
                  if (!sustainMode && !isPointerDraggingRef.current) {
                    onNoteStart(note.midi);
                    setTimeout(() => onNoteStop(note.midi), 360);
                  }
                }}
                className={`relative flex-1 h-full rounded-b-2xl flex flex-col justify-between items-center pt-5 pb-4 px-1 transition-transform duration-75 touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  isPressed
                    ? 'translate-y-[5px] bg-gradient-to-b from-[#f3d088] via-[#eab354] to-[#d48b28] text-[#1c1208] shadow-inner border-t-2 border-amber-700'
                    : isDimmed
                      ? 'bg-gradient-to-b from-[#b8afa2] to-[#8a8072] text-[#3a3228]/60 opacity-60 border-b-[7px] border-[#6b6154]'
                      : 'bg-gradient-to-b from-[#fcf8f0] via-[#f4ecdc] to-[#e4d6be] text-[#23180d] hover:from-[#fffdf9] hover:to-[#ebdec7] border-b-[8px] border-[#b8a382] shadow-[0_6px_14px_rgba(0,0,0,0.5)]'
                }`}
              >
                {/* Guide Pin */}
                <div
                  className={`w-2 h-2 rounded-full border ${
                    isPressed
                      ? 'bg-amber-900/40 border-amber-950/50'
                      : 'bg-amber-700/20 border-amber-900/25'
                  }`}
                />

                {/* Lower Key Label Zone (Below Black Keys) */}
                <div className="flex flex-col items-center justify-end gap-1 w-full">
                  {ragaEval && ragaEval.inRaga && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        ragaEval.isSa
                          ? 'bg-amber-600'
                          : ragaEval.isVadi
                            ? 'bg-rose-600'
                            : 'bg-teal-600/75'
                      }`}
                    />
                  )}

                  <span
                    className={`text-base sm:text-lg font-bold leading-tight ${
                      swara.short === 'Sa' && !isPressed ? 'text-amber-800' : ''
                    }`}
                  >
                    {saptakLabel}
                  </span>

                  <span
                    className={`text-xs font-mono-tabular ${
                      isPressed ? 'text-[#1c1208]/80 font-semibold' : 'text-stone-500'
                    }`}
                  >
                    {note.westernName}
                  </span>

                  {note.keyboardShortcut && (
                    <span className="text-[10px] font-mono-tabular text-stone-400 mt-0.5">
                      {note.keyboardShortcut}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Sharp Keys (Black / Ebony - 54% height) */}
        <div className="pointer-events-none absolute inset-x-2.5 top-0.5 h-[54%]">
          {sharpKeyPositions.map(({ key: note, leftPercent, widthPercent }) => {
            const isPressed = activeNotes.has(note.midi) || sustainedNotes.has(note.midi);
            const swara = getSwaraForMidi(note.midi, rootPitchClass);
            const ragaEval = activeRaga
              ? evaluateKeyInRaga(note.midi, rootPitchClass, activeRaga)
              : null;
            const isDimmed = ragaEval ? !ragaEval.inRaga : false;

            const saptakLabel =
              swara.saptakDot === 'low'
                ? `.${swara.short}`
                : swara.saptakDot === 'high'
                  ? `${swara.short}'`
                  : swara.short;

            return (
              <button
                key={note.midi}
                type="button"
                aria-label={`Play ${swara.short} (${note.westernName})`}
                aria-pressed={isPressed}
                style={{
                  left: `calc(${leftPercent}% - ${widthPercent / 2}%)`,
                  width: `${widthPercent}%`,
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleKeyTriggerDown(note.midi);
                }}
                onPointerEnter={(e) => {
                  e.stopPropagation();
                  handleKeyPointerEnter(note.midi);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  handleKeyTriggerUp(note.midi);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!sustainMode && !isPointerDraggingRef.current) {
                    onNoteStart(note.midi);
                    setTimeout(() => onNoteStop(note.midi), 360);
                  }
                }}
                className={`pointer-events-auto absolute top-0 h-full z-20 rounded-b-xl flex flex-col justify-between items-center py-3 px-0.5 transition-transform duration-75 touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  isPressed
                    ? 'translate-y-[4px] bg-gradient-to-b from-[#d97706] via-[#b45309] to-[#78350f] text-amber-50 border-b-2 border-amber-950 shadow-inner'
                    : isDimmed
                      ? 'bg-gradient-to-b from-[#26211d] to-[#171311] text-stone-500 opacity-55 border-b-[6px] border-[#0c0a08]'
                      : 'bg-gradient-to-b from-[#33241b] via-[#211610] to-[#140d09] text-amber-100 hover:from-[#3e2c21] border-x border-amber-500/15 border-b-[8px] border-[#090604] shadow-[0_8px_14px_rgba(0,0,0,0.75)]'
                }`}
              >
                <span className="text-[10px] font-mono-tabular text-amber-200/50">
                  {note.keyboardShortcut || ''}
                </span>

                <div className="flex flex-col items-center gap-0.5">
                  {ragaEval && ragaEval.inRaga && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mb-0.5" />
                  )}
                  <span className="text-xs sm:text-sm font-bold leading-tight">{saptakLabel}</span>
                  <span className="text-[10px] font-mono-tabular text-amber-200/60">
                    {note.westernName}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Teakwood Base Rail */}
      <div className="h-3 w-full bg-gradient-to-r from-[#2b150b] via-[#432212] to-[#2b150b] border-t border-amber-500/20 shrink-0" />
    </div>
  );
};
