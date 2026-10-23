import React, { useRef, useState } from 'react';
import {
  NoteDefinition,
  RagaSuggestion,
  evaluateKeyInRaga,
  getSwaraForMidi,
  midiToFrequency,
} from '../utils/musicTheory';

interface HarmoniumKeyboardProps {
  keys: NoteDefinition[];
  activeNotes: Set<number>;
  sustainedNotes: Set<number>;
  rootPitchClass: number;
  a4ReferenceHz: number;
  useJustIntonation: boolean;
  activeRaga: RagaSuggestion;
  showRagaGuide: boolean;
  ragaScaleLock: boolean;
  showDevanagari: boolean;
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
  a4ReferenceHz,
  useJustIntonation,
  activeRaga,
  showRagaGuide,
  ragaScaleLock,
  showDevanagari,
  sustainMode,
  onNoteStart,
  onNoteStop,
  onToggleSustainNote,
}) => {
  const isPointerDraggingRef = useRef(false);
  const lastPointerMidiRef = useRef<number | null>(null);
  const [lockedKeyNotice, setLockedKeyNotice] = useState<string | null>(null);

  const naturalKeys = keys.filter((k) => !k.isSharp);

  // Map each sharp key to its left-hand natural key index so it positions accurately in % across any screen width
  const sharpKeyPositions = keys
    .filter((k) => k.isSharp)
    .map((sharpKey) => {
      const precedingNaturals = naturalKeys.filter((nk) => nk.midi < sharpKey.midi).length;
      return {
        key: sharpKey,
        leftPercent: (precedingNaturals / naturalKeys.length) * 100,
        widthPercent: (1 / naturalKeys.length) * 66,
      };
    });

  const handleKeyTriggerDown = (midi: number, inRaga: boolean, swaraLabel: string) => {
    if (ragaScaleLock && !inRaga) {
      setLockedKeyNotice(`${swaraLabel} is outside ${activeRaga.name} (Raga Lock active)`);
      setTimeout(() => setLockedKeyNotice(null), 1600);
      return;
    }

    if (sustainMode) {
      onToggleSustainNote(midi);
      return;
    }

    isPointerDraggingRef.current = true;
    lastPointerMidiRef.current = midi;
    onNoteStart(midi);
  };

  const handleKeyPointerEnter = (midi: number, inRaga: boolean) => {
    if (!isPointerDraggingRef.current || sustainMode) return;
    if (ragaScaleLock && !inRaga) return;

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
      className="relative flex-1 flex flex-col w-full h-full select-none overflow-hidden bg-[#17110b] border-t border-amber-900/40"
      onPointerUp={handleGlobalPointerUp}
      onPointerLeave={handleGlobalPointerUp}
      data-testid="harmonium-keyboard-stage"
    >
      {/* Top Teakwood & Felt Keybed Strip */}
      <div className="h-3.5 w-full bg-gradient-to-b from-[#3d1e10] via-[#2b140a] to-[#5c1616] border-b border-amber-500/20 flex items-center justify-between px-4">
        <div className="flex items-center gap-4 text-[10px] tracking-wider text-amber-200/60 font-mono-tabular">
          <span>MANDRA SAPTAK (LOW)</span>
          <span>·</span>
          <span>MADHYA SAPTAK (MIDDLE)</span>
          <span>·</span>
          <span>TAAR SAPTAK (HIGH)</span>
        </div>
        {lockedKeyNotice && (
          <div
            role="status"
            className="text-[11px] font-medium text-amber-300 bg-amber-950/90 px-2.5 py-0.5 rounded border border-amber-500/30"
          >
            {lockedKeyNotice}
          </div>
        )}
      </div>

      {/* Main Keyboard Bed */}
      <div className="relative flex-1 w-full flex px-2 pb-3 pt-0.5 bg-gradient-to-b from-[#241811] to-[#120c08]">
        {/* Natural Keys Layer */}
        <div className="relative flex w-full h-full gap-[3px]">
          {naturalKeys.map((note) => {
            const isPressed = activeNotes.has(note.midi) || sustainedNotes.has(note.midi);
            const isSustained = sustainedNotes.has(note.midi);
            const swara = getSwaraForMidi(note.midi, rootPitchClass);
            const ragaEval = evaluateKeyInRaga(note.midi, rootPitchClass, activeRaga);
            const freq = midiToFrequency(note.midi, a4ReferenceHz, rootPitchClass, useJustIntonation);
            const isDimmed = showRagaGuide && !ragaEval.inRaga;

            const saptakFormatted =
              swara.saptakDot === 'low'
                ? `.${swara.short}`
                : swara.saptakDot === 'high'
                  ? `${swara.short}'`
                  : swara.short;

            return (
              <button
                key={note.midi}
                type="button"
                aria-label={`Play ${swara.short} (${note.westernName}, ${Math.round(freq)} Hz)${ragaEval.isSa ? ' Tonic Sa' : ''}`}
                aria-pressed={isPressed}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKeyTriggerDown(note.midi, ragaEval.inRaga, swara.short);
                }}
                onPointerEnter={() => handleKeyPointerEnter(note.midi, ragaEval.inRaga)}
                onPointerUp={() => handleKeyTriggerUp(note.midi)}
                onClick={() => {
                  if (!sustainMode && !isPointerDraggingRef.current) {
                    onNoteStart(note.midi);
                    setTimeout(() => onNoteStop(note.midi), 380);
                  }
                }}
                className={`group relative flex-1 h-full rounded-b-xl flex flex-col justify-between items-center pt-4 pb-3 px-1 transition-transform duration-75 touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  isPressed
                    ? 'translate-y-[5px] bg-gradient-to-b from-[#f3d088] via-[#eab354] to-[#d48b28] text-[#1c1208] shadow-inner border-t-2 border-amber-700'
                    : isDimmed
                      ? 'bg-gradient-to-b from-[#b8afa2] via-[#a3998b] to-[#8a8072] text-[#3a3228]/70 opacity-65 hover:opacity-85 border-b-[6px] border-[#6b6154]'
                      : 'bg-gradient-to-b from-[#fcf8f0] via-[#f4ecdc] to-[#e4d6be] text-[#23180d] hover:from-[#fffdf9] hover:to-[#ebdec7] border-b-[7px] border-[#b8a382] shadow-[0_6px_12px_rgba(0,0,0,0.45)]'
                }`}
              >
                {/* Upper Wood/Brass Harmonium Key Guide Pin */}
                <div
                  className={`w-2 h-2 rounded-full border mt-2 ${
                    isPressed
                      ? 'bg-amber-900/40 border-amber-950/50'
                      : 'bg-amber-700/25 border-amber-900/30'
                  }`}
                />

                {/* Lower Front Apron (Below the 54% black sharp key zone — zero overlap) */}
                <div className="flex flex-col items-center justify-end gap-1 w-full pt-2">
                  {isSustained && (
                    <span className="text-[9px] font-bold text-amber-950 bg-amber-400/95 px-1.5 py-0.5 rounded leading-none">
                      HOLD
                    </span>
                  )}

                  {showRagaGuide && ragaEval.inRaga && (
                    <span
                      className={`text-[9px] font-bold tracking-tight px-1.5 py-0.5 rounded leading-none whitespace-nowrap ${
                        ragaEval.isSa
                          ? 'bg-amber-600 text-white'
                          : ragaEval.isVadi
                            ? 'bg-rose-700 text-white'
                            : ragaEval.isSamvadi
                              ? 'bg-teal-700 text-white'
                              : 'bg-amber-900/15 text-amber-950'
                      }`}
                    >
                      {ragaEval.isSa
                        ? 'SA'
                        : ragaEval.isVadi
                          ? 'VADI'
                          : ragaEval.isSamvadi
                            ? 'SAMVADI'
                            : 'RAGA'}
                    </span>
                  )}

                  {note.keyboardShortcut && (
                    <span
                      className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded leading-none ${
                        isPressed
                          ? 'bg-[#1c1208]/15 text-[#1c1208] font-semibold'
                          : 'bg-amber-950/10 text-stone-500'
                      }`}
                    >
                      {note.keyboardShortcut}
                    </span>
                  )}

                  {showDevanagari && (
                    <span className="text-xs font-mono-tabular font-bold text-amber-900/75 leading-none mt-0.5">
                      [{swara.devanagari}]
                    </span>
                  )}

                  <span
                    className={`text-sm sm:text-base font-bold leading-tight ${
                      ragaEval.isSa && !isPressed ? 'text-amber-800' : ''
                    }`}
                  >
                    {saptakFormatted}
                  </span>

                  <span
                    className={`text-[11px] font-mono-tabular font-medium ${
                      isPressed ? 'text-[#1c1208]/80' : 'text-stone-500'
                    }`}
                  >
                    {note.westernName}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Sharp / Komal / Teevra Keys Layer (Ebony & Rosewood Raised Keys - 54% height) */}
        <div className="pointer-events-none absolute inset-x-2 top-0.5 h-[54%]">
          {sharpKeyPositions.map(({ key: note, leftPercent, widthPercent }) => {
            const isPressed = activeNotes.has(note.midi) || sustainedNotes.has(note.midi);
            const isSustained = sustainedNotes.has(note.midi);
            const swara = getSwaraForMidi(note.midi, rootPitchClass);
            const ragaEval = evaluateKeyInRaga(note.midi, rootPitchClass, activeRaga);
            const freq = midiToFrequency(note.midi, a4ReferenceHz, rootPitchClass, useJustIntonation);
            const isDimmed = showRagaGuide && !ragaEval.inRaga;

            const saptakFormatted =
              swara.saptakDot === 'low'
                ? `.${swara.short}`
                : swara.saptakDot === 'high'
                  ? `${swara.short}'`
                  : swara.short;

            return (
              <button
                key={note.midi}
                type="button"
                aria-label={`Play ${swara.short} (${note.westernName}, ${Math.round(freq)} Hz)${ragaEval.isSa ? ' Tonic Sa' : ''}`}
                aria-pressed={isPressed}
                style={{
                  left: `calc(${leftPercent}% - ${widthPercent / 2}%)`,
                  width: `${widthPercent}%`,
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleKeyTriggerDown(note.midi, ragaEval.inRaga, swara.short);
                }}
                onPointerEnter={(e) => {
                  e.stopPropagation();
                  handleKeyPointerEnter(note.midi, ragaEval.inRaga);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  handleKeyTriggerUp(note.midi);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!sustainMode && !isPointerDraggingRef.current) {
                    onNoteStart(note.midi);
                    setTimeout(() => onNoteStop(note.midi), 380);
                  }
                }}
                className={`pointer-events-auto absolute top-0 h-full z-20 rounded-b-lg flex flex-col justify-between items-center py-2.5 px-0.5 transition-transform duration-75 touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  isPressed
                    ? 'translate-y-[4px] bg-gradient-to-b from-[#d97706] via-[#b45309] to-[#78350f] text-amber-50 border-b-2 border-amber-950 shadow-inner'
                    : isDimmed
                      ? 'bg-gradient-to-b from-[#26211d] to-[#171311] text-stone-500 opacity-65 border-b-[5px] border-[#0c0a08]'
                      : 'bg-gradient-to-b from-[#33241b] via-[#211610] to-[#140d09] text-amber-100 hover:from-[#3e2c21] border-x border-amber-500/15 border-b-[7px] border-[#090604] shadow-[0_8px_14px_rgba(0,0,0,0.75)]'
                }`}
              >
                {/* Top Shortcut & Raga Badge */}
                <div className="flex flex-col items-center gap-1">
                  {note.keyboardShortcut && (
                    <span className="text-[9px] font-mono-tabular text-amber-200/60">
                      {note.keyboardShortcut}
                    </span>
                  )}

                  {showRagaGuide && ragaEval.inRaga && (
                    <span
                      className={`text-[9px] font-semibold px-1 py-0.2 rounded ${
                        ragaEval.isSa
                          ? 'bg-amber-500 text-stone-950'
                          : ragaEval.isVadi
                            ? 'bg-rose-600 text-white'
                            : ragaEval.isSamvadi
                              ? 'bg-teal-600 text-white'
                              : 'bg-amber-500/20 text-amber-200'
                      }`}
                    >
                      {ragaEval.isSa ? 'SA' : ragaEval.isVadi ? 'V' : ragaEval.isSamvadi ? 'S' : '•'}
                    </span>
                  )}
                  {isSustained && (
                    <span className="text-[8px] font-bold bg-amber-400 text-stone-950 px-1 rounded">
                      H
                    </span>
                  )}
                </div>

                {/* Bottom Swara Label */}
                <div className="flex flex-col items-center gap-0.5">
                  {showDevanagari && (
                    <span className="text-[10px] font-mono-tabular font-semibold leading-none text-amber-300/80">
                      [{swara.devanagari}]
                    </span>
                  )}
                  <span className="text-xs font-semibold leading-tight">{saptakFormatted}</span>
                  <span className="text-[9px] font-mono-tabular text-amber-200/50">
                    {note.westernName}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Hand-Carved Burmese Teak Front Rail */}
      <div className="h-5 w-full bg-gradient-to-r from-[#2b150b] via-[#432212] to-[#2b150b] border-t border-amber-500/25 flex items-center justify-between px-4 text-[11px] text-amber-200/75">
        <div className="flex items-center gap-3 truncate">
          <span className="font-medium text-amber-300">Scale Guide: {activeRaga.name}</span>
          <span>·</span>
          <span className="font-mono-tabular">Aroha: {activeRaga.aroha}</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-amber-200/60 shrink-0">
          <span>Amber = Sa (Tonic)</span>
          <span>·</span>
          <span>Crimson = Vadi</span>
          <span>·</span>
          <span>Teal = Samvadi</span>
        </div>
      </div>
    </div>
  );
};
