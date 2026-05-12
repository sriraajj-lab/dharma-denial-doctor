import { DenialNote } from './types';

// In-memory notes store
let notes: DenialNote[] = [];

export function createNote(note: Omit<DenialNote, 'id' | 'createdAt' | 'updatedAt'>): DenialNote {
  const newNote: DenialNote = {
    ...note,
    id: `NOTE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  notes.push(newNote);
  return newNote;
}

export function getNotesForDenial(denialId: string): DenialNote[] {
  return notes
    .filter((n) => n.denialId === denialId)
    .sort((a, b) => {
      // Pinned first, then newest
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function updateNote(id: string, updates: Partial<DenialNote>): DenialNote | null {
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) return null;
  notes[index] = { ...notes[index], ...updates, updatedAt: new Date().toISOString() };
  return notes[index];
}

export function deleteNote(id: string): boolean {
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) return false;
  notes.splice(index, 1);
  return true;
}

export function togglePinNote(id: string): DenialNote | null {
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) return null;
  notes[index].isPinned = !notes[index].isPinned;
  notes[index].updatedAt = new Date().toISOString();
  return notes[index];
}
