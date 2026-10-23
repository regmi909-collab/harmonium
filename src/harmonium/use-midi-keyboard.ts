'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type MidiSupportState = 'checking' | 'supported' | 'unsupported' | 'error';

type MidiInputSummary = {
  id: string;
  name: string;
  manufacturer: string;
};

type MidiMessageTarget = EventTarget & {
  id?: string;
};

export function useMidiKeyboard({
  onNoteOn,
  onNoteOff,
  onSustainChange,
  onVolumeChange,
}: {
  onNoteOn: (voiceId: string, midi: number) => void;
  onNoteOff: (voiceId: string) => void;
  onSustainChange?: (enabled: boolean) => void;
  onVolumeChange?: (volume: number) => void;
}) {
  const [supportState, setSupportState] = useState<MidiSupportState>('checking');
  const [midiInputs, setMidiInputs] = useState<MidiInputSummary[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');

  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const selectedInputIdRef = useRef(selectedInputId);

  useEffect(() => {
    selectedInputIdRef.current = selectedInputId;
  }, [selectedInputId]);

  const syncInputs = useCallback(() => {
    const access = midiAccessRef.current;
    if (!access) {
      setMidiInputs([]);
      return;
    }

    const nextInputs = Array.from(access.inputs.values()).map((input) => ({
      id: input.id,
      name: input.name || 'Unnamed MIDI input',
      manufacturer: input.manufacturer || 'Unknown maker',
    }));

    setMidiInputs(nextInputs);
    setSelectedInputId((current) => {
      if (!nextInputs.length) {
        return '';
      }

      if (current && nextInputs.some((input) => input.id === current)) {
        return current;
      }

      return nextInputs[0].id;
    });
  }, []);

  const handleMidiMessage = useCallback(
    (event: MIDIMessageEvent) => {
      const target = event.target as MidiMessageTarget | null;
      const inputId = target?.id;

      if (!inputId || !event.data) {
        return;
      }

      if (
        selectedInputIdRef.current &&
        inputId !== selectedInputIdRef.current
      ) {
        return;
      }

      const [status, note, velocity = 0] = event.data;
      const command = status & 0xf0;
      const voiceId = `midi:${inputId}:${note}`;

      if (command === 0x90) {
        if (velocity > 0) {
          onNoteOn(voiceId, note);
        } else {
          onNoteOff(voiceId);
        }
      }

      if (command === 0x80) {
        onNoteOff(voiceId);
      }

      if (command === 0xb0 && note === 64) {
        onSustainChange?.(velocity >= 64);
      }

      if (command === 0xb0 && note === 7) {
        onVolumeChange?.(Math.min(1, Math.max(0, velocity / 127)));
      }
    },
    [onNoteOff, onNoteOn, onSustainChange, onVolumeChange]
  );

  useEffect(() => {
    const access = midiAccessRef.current;
    if (!access) {
      return;
    }

    for (const input of access.inputs.values()) {
      input.onmidimessage = handleMidiMessage;
    }

    return () => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }
    };
  }, [handleMidiMessage, midiInputs]);

  const refreshMidi = useCallback(async () => {
    const requestMidi =
      typeof navigator !== 'undefined' ? navigator.requestMIDIAccess : undefined;

    if (!requestMidi) {
      setSupportState('unsupported');
      setMidiInputs([]);
      setSelectedInputId('');
      return;
    }

    try {
      const access = await requestMidi.call(navigator);
      midiAccessRef.current = access;
      access.onstatechange = () => {
        syncInputs();
      };
      setSupportState('supported');
      syncInputs();
    } catch {
      setSupportState('error');
      setMidiInputs([]);
      setSelectedInputId('');
    }
  }, [syncInputs]);

  useEffect(() => {
    void refreshMidi();
  }, [refreshMidi]);

  useEffect(() => {
    return () => {
      onSustainChange?.(false);
    };
  }, [onSustainChange]);

  return {
    midiInputs,
    refreshMidi,
    selectedInputId,
    setSelectedInputId,
    supportState,
  };
}
