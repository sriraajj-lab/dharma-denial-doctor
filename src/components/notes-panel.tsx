'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Pin, Send, Trash2, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Note {
  id: string;
  denialId: string;
  authorId: string;
  authorName?: string;
  content: string;
  noteType: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const NOTE_TYPE_COLORS: Record<string, string> = {
  general: 'bg-gray-500/20 text-gray-400',
  internal: 'bg-blue-500/20 text-blue-400',
  escalation: 'bg-red-500/20 text-red-400',
  payer_contact: 'bg-purple-500/20 text-purple-400',
  resolution: 'bg-emerald-500/20 text-emerald-400',
};

export function NotesPanel({ denialId }: { denialId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [denialId]);

  async function fetchNotes() {
    try {
      const res = await fetch(`/api/notes?denialId=${denialId}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ denialId, content, noteType }),
      });
      if (res.ok) {
        setContent('');
        fetchNotes();
        toast.success('Note added');
      }
    } catch {
      toast.error('Failed to add note');
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePin(noteId: string) {
    try {
      await fetch('/api/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, action: 'toggle_pin' }),
      });
      fetchNotes();
    } catch {
      toast.error('Failed to pin note');
    }
  }

  async function deleteNote(noteId: string) {
    try {
      await fetch(`/api/notes?id=${noteId}`, { method: 'DELETE' });
      fetchNotes();
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
  }

  return (
    <div className="space-y-4">
      {/* Add Note */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" /> Add Note
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a note about this denial... (payer call notes, escalation reason, resolution details)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
          <div className="flex items-center justify-between">
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            >
              <option value="general">General</option>
              <option value="internal">Internal</option>
              <option value="escalation">Escalation</option>
              <option value="payer_contact">Payer Contact</option>
              <option value="resolution">Resolution</option>
            </select>
            <Button onClick={addNote} disabled={!content.trim() || submitting} size="sm" className="bg-primary hover:bg-primary/90">
              <Send className="h-3 w-3 mr-1" /> {submitting ? 'Saving...' : 'Add Note'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading notes...</div>
      ) : notes.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notes yet. Add the first note above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <Card key={note.id} className={`border-border bg-card ${note.isPinned ? 'border-l-2 border-l-yellow-400' : ''}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">{note.authorName || 'System'}</span>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${NOTE_TYPE_COLORS[note.noteType] || ''}`}>
                        {note.noteType.replace('_', ' ')}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(note.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{note.content}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => togglePin(note.id)} className={`p-1 rounded hover:bg-muted ${note.isPinned ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                      <Pin className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteNote(note.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
