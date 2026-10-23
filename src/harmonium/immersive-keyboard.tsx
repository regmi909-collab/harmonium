import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getNoteKeyByInput,
  NOTE_KEYS,
  NoteKey,
} from './constants';
import { useHarmoniumPlayer } from './use-harmonium-player';
import { useMidiKeyboard } from './use-midi-keyboard';

export function ImmersiveHarmonium() {
  const {
    activeNoteIds,
    setMidiSustain,
    startNote,
    stopNote,
    stopAllNotes,
    startMidiNote,
    stopMidiNote,
  } = useHarmoniumPlayer({
    octave: 4,
    transpose: 0,
    volume: 0.9,
    reverbEnabled: true,
    reedMode: 'double',
  });

  useMidiKeyboard({
    onNoteOn: (voiceId, midi) => void startMidiNote(voiceId, midi),
    onNoteOff: (voiceId) => stopMidiNote(voiceId),
  });

  const noteById = useMemo(
    () => new Map<string, NoteKey>(NOTE_KEYS.map((n) => [n.id, n])),
    []
  );

  const whiteKeys = useMemo(
    () => NOTE_KEYS.filter((n) => n.kind === 'white'),
    []
  );
  const blackKeys = useMemo(
    () => NOTE_KEYS.filter((n) => n.kind === 'black'),
    []
  );

  // Track active touch notes and mouse pointer notes independently so multi-touch chords & slides never conflict
  const touchedNoteIdsRef = useRef<Set<string>>(new Set());
  const pointerNotesRef = useRef<Map<number, string>>(new Map());

  const resolveNoteIdAtPoint = useCallback((clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const keyEl = el.closest('[data-note-id]') as HTMLElement | null;
    return keyEl?.getAttribute('data-note-id') ?? null;
  }, []);

  const syncActiveTouches = useCallback(
    (touches: React.TouchList) => {
      const nextTouchedIds = new Set<string>();
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        const noteId = resolveNoteIdAtPoint(t.clientX, t.clientY);
        if (noteId) {
          nextTouchedIds.add(noteId);
        }
      }

      // Start any newly touched notes
      for (const noteId of nextTouchedIds) {
        if (!touchedNoteIdsRef.current.has(noteId)) {
          const note = noteById.get(noteId);
          if (note) {
            void startNote(note);
          }
        }
      }

      // Stop any notes that are no longer under any finger (unless held by a mouse pointer)
      const activePointerNoteIds = new Set(pointerNotesRef.current.values());
      for (const prevNoteId of touchedNoteIdsRef.current) {
        if (!nextTouchedIds.has(prevNoteId) && !activePointerNoteIds.has(prevNoteId)) {
          stopNote(prevNoteId);
        }
      }

      touchedNoteIdsRef.current = nextTouchedIds;
    },
    [noteById, resolveNoteIdAtPoint, startNote, stopNote]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      syncActiveTouches(e.touches);
    },
    [syncActiveTouches]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      syncActiveTouches(e.touches);
    },
    [syncActiveTouches]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      syncActiveTouches(e.touches);
    },
    [syncActiveTouches]
  );

  // Pointer handlers for non-touch devices (mouse / pen / Playwright click)
  const updatePointerNote = useCallback(
    (pointerId: number, nextNoteId: string | null) => {
      const prevNoteId = pointerNotesRef.current.get(pointerId) ?? null;
      if (prevNoteId === nextNoteId) return;

      if (nextNoteId) {
        pointerNotesRef.current.set(pointerId, nextNoteId);
        const note = noteById.get(nextNoteId);
        if (note) {
          void startNote(note);
        }
      } else {
        pointerNotesRef.current.delete(pointerId);
      }

      if (prevNoteId) {
        // Only stop if no other pointer or touch is still holding prevNoteId
        const stillHeldByPointer = Array.from(pointerNotesRef.current.values()).includes(prevNoteId);
        const stillHeldByTouch = touchedNoteIdsRef.current.has(prevNoteId);
        if (!stillHeldByPointer && !stillHeldByTouch) {
          stopNote(prevNoteId);
        }
      }
    },
    [noteById, startNote, stopNote]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return; // Handled by multi-touch TouchEvents
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore pointer capture errors
      }
      const noteId =
        resolveNoteIdAtPoint(e.clientX, e.clientY) ??
        (e.target as HTMLElement | null)?.closest('[data-note-id]')?.getAttribute('data-note-id') ??
        null;
      updatePointerNote(e.pointerId, noteId);
    },
    [resolveNoteIdAtPoint, updatePointerNote]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      if (!pointerNotesRef.current.has(e.pointerId)) return;
      const noteId = resolveNoteIdAtPoint(e.clientX, e.clientY);
      updatePointerNote(e.pointerId, noteId);
    },
    [resolveNoteIdAtPoint, updatePointerNote]
  );

  const handlePointerUpOrCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      updatePointerNote(e.pointerId, null);
    },
    [updatePointerNote]
  );

  // Physical computer keyboard support
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const note = getNoteKeyByInput(e.key);
      if (!note) return;
      e.preventDefault();
      void startNote(note);
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
      touchedNoteIdsRef.current.clear();
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

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(ellipse 120% 80% at 50% 110%,#3c2008 0%,#2a1505 40%,#180c02 100%)',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ══ TOP WOOD RAIL ═══════════════════════════════════════════════ */}
      <div
        className="relative z-10 flex-shrink-0 pointer-events-none"
        style={{
          height: 28,
          background: 'linear-gradient(180deg,#7c4520 0%,#5c2e0e 50%,#3d1c06 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,.8)',
        }}
      >
        <WoodGrain />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: 'linear-gradient(90deg,#8a6030,#c8a040,#8a6030)',
            opacity: 0.45,
          }}
        />
      </div>

      {/* ══ FULL-SCREEN MULTI-TOUCH KEY BED ═════════════════════════════ */}
      <div
        className="relative flex flex-1 flex-col overflow-hidden"
        style={{
          background: 'linear-gradient(180deg,#2e1404 0%,#3a1a08 100%)',
          touchAction: 'none',
        }}
      >
        <SideWood side="left" />
        <SideWood side="right" />

        {/* Key-frame top rail */}
        <div
          className="pointer-events-none"
          style={{
            height: 8,
            marginLeft: 20,
            marginRight: 20,
            background: 'linear-gradient(180deg,#5a3010 0%,#3a1a08 100%)',
            borderBottom: '2px solid rgba(0,0,0,.6)',
            boxShadow: '0 4px 12px rgba(0,0,0,.5)',
          }}
        />

        {/* Multi-touch key surface */}
        <div
          className="relative flex flex-1 overflow-hidden"
          style={{
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: 6,
            touchAction: 'none',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
        >
          <div className="relative flex-1 h-full w-full" style={{ touchAction: 'none' }}>
            {/* ── White keys ──────────────────────────────────────── */}
            {whiteKeys.map((note) => {
              const w = 100 / whiteKeys.length;
              const isActive = activeNoteIds.includes(note.id);
              return (
                <button
                  key={note.id}
                  type="button"
                  data-note-id={note.id}
                  aria-label={`${note.sargam} (${note.western})`}
                  onClick={() => {
                    // Fallback for synthetic automated clicks that don't fire pointerdown/up pairs
                    if (
                      pointerNotesRef.current.size === 0 &&
                      touchedNoteIdsRef.current.size === 0
                    ) {
                      void startNote(note);
                      window.setTimeout(() => stopNote(note.id), 250);
                    }
                  }}
                  className="flex flex-col justify-end items-center rounded-b-[1.2rem] border border-black/10 px-2 pb-5 pt-4 select-none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `calc(${note.whiteIndex * w}% + 1px)`,
                    width: `calc(${w}% - 2px)`,
                    background: isActive
                      ? 'linear-gradient(180deg,#f8d8b0 0%,#ebb678 100%)'
                      : 'linear-gradient(180deg,#fffdfa 0%,#efe3d5 100%)',
                    boxShadow: isActive
                      ? 'inset 0 -6px 18px rgba(183,124,74,0.32), 0 0 14px rgba(251,191,36,0.35)'
                      : 'inset 0 -10px 24px rgba(183,124,74,0.12), 0 4px 8px rgba(0,0,0,0.35)',
                    transform: isActive ? 'translateY(6px)' : 'translateY(0)',
                    transition: 'transform .04s ease-out, background .04s, box-shadow .04s',
                    touchAction: 'none',
                  }}
                >
                  <div className="pointer-events-none flex flex-col items-center gap-1">
                    <span
                      style={{
                        fontSize: 'clamp(14px, 1.4vw, 20px)',
                        fontWeight: 700,
                        color: isActive ? '#7c3a10' : '#1e293b',
                      }}
                    >
                      {note.sargam}
                    </span>
                    <span
                      style={{
                        fontSize: 'clamp(10px, 0.9vw, 13px)',
                        fontWeight: 600,
                        color: isActive ? 'rgba(124,58,16,0.75)' : 'rgba(71,85,105,0.65)',
                      }}
                    >
                      {note.western}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* ── Black keys ──────────────────────────────────────── */}
            {blackKeys.map((note) => {
              const ww = 100 / whiteKeys.length;
              const bw = ww * 0.6;
              const left = (note.whiteIndex + 1) * ww - bw / 2;
              const isActive = activeNoteIds.includes(note.id);
              return (
                <button
                  key={note.id}
                  type="button"
                  data-note-id={note.id}
                  aria-label={`${note.sargam} (${note.western})`}
                  onClick={() => {
                    if (
                      pointerNotesRef.current.size === 0 &&
                      touchedNoteIdsRef.current.size === 0
                    ) {
                      void startNote(note);
                      window.setTimeout(() => stopNote(note.id), 250);
                    }
                  }}
                  className="absolute top-0 z-10 flex h-[58%] flex-col justify-end items-center rounded-b-[1rem] border border-black/20 px-1.5 pb-4 pt-3 select-none"
                  style={{
                    left: `${left}%`,
                    width: `${bw}%`,
                    background: isActive
                      ? 'linear-gradient(180deg,#16655e 0%,#0e3f3b 100%)'
                      : 'linear-gradient(180deg,#334155 0%,#111827 100%)',
                    boxShadow: isActive
                      ? '0 0 18px rgba(52,211,153,.45), 0 8px 18px rgba(15,23,42,0.4)'
                      : '0 14px 28px rgba(15,23,42,0.45), inset 0 1px 1px rgba(255,255,255,0.12)',
                    transform: isActive ? 'translateY(5px)' : 'translateY(0)',
                    transition: 'transform .04s ease-out, background .04s, box-shadow .04s',
                    touchAction: 'none',
                  }}
                >
                  <div className="pointer-events-none flex flex-col items-center gap-0.5">
                    <span
                      style={{
                        fontSize: 'clamp(11px, 1.1vw, 15px)',
                        fontWeight: 700,
                        color: isActive ? '#6ee7b7' : 'rgba(255,255,255,0.92)',
                      }}
                    >
                      {note.sargam}
                    </span>
                    <span
                      style={{
                        fontSize: 'clamp(9px, 0.8vw, 11px)',
                        fontWeight: 600,
                        color: isActive ? 'rgba(110,231,183,0.8)' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {note.western}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ BOTTOM WOOD RAIL ════════════════════════════════════════════ */}
      <div
        className="relative z-10 flex-shrink-0 pointer-events-none"
        style={{
          height: 24,
          background: 'linear-gradient(180deg,#3a1a08 0%,#5c2e0e 60%,#7c4520 100%)',
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
        width: 20,
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
