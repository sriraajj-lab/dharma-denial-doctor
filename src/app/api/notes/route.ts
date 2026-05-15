import { NextRequest, NextResponse } from 'next/server';
import { createNote, getNotesForDenial, updateNote, deleteNote, togglePinNote } from '@/lib/notes';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { denialId, content, noteType } = body;

    if (!denialId || !content) {
      return NextResponse.json({ error: 'denialId and content are required' }, { status: 400 });
    }

    const currentUser = getCurrentUser();

    const note = createNote({
      denialId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      content,
      noteType: noteType || 'general',
      isPinned: false,
    });

    createAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      denialId,
      action: 'note_add',
      entityType: 'note',
      entityId: note.id,
      metadata: { noteType: note.noteType },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const denialId = searchParams.get('denialId');

    if (!denialId) {
      return NextResponse.json({ error: 'denialId query parameter required' }, { status: 400 });
    }

    const notes = getNotesForDenial(denialId);
    return NextResponse.json({ notes });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteId, action: noteAction, ...updates } = body;

    if (!noteId) {
      return NextResponse.json({ error: 'noteId is required' }, { status: 400 });
    }

    let note;
    if (noteAction === 'toggle_pin') {
      note = togglePinNote(noteId);
    } else {
      note = updateNote(noteId, updates);
    }

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json({ note });
  } catch (error) {
    console.error('Error updating note:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('id');

    if (!noteId) {
      return NextResponse.json({ error: 'Note ID required' }, { status: 400 });
    }

    const deleted = deleteNote(noteId);
    if (!deleted) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting note:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
