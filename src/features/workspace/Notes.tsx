import { captureNoteTime } from '@/lib/video/capture-note';
import { useDialogFocus } from './useDialogFocus';
import { useState } from 'react';
import { browser } from 'wxt/browser';
import type { Course } from '@/types/course';
import { type LibraryItem, type Note } from '@/lib/workspace/model';
import { formatTimestamp } from '@/lib/utils/time';
import { useWorkspace } from './WorkspaceContext';
export function NoteBody({
  note,
  onOpen,
}: {
  note: Note;
  onOpen: (id: string) => void;
}) {
  const [error, setError] = useState('');
  const timestamp = async (seconds: number) => {
    setError('');
    const r = await browser.runtime.sendMessage({
      type: 'DARB_OPEN_TIMESTAMP',
      courseId: note.courseId,
      seconds,
    });
    if (!r?.ok) setError(r?.error ?? 'Unable to open timestamp.');
  };
  // Render Markdown as text and React nodes. Raw HTML and executable URLs are never interpreted.
  const inline = (text: string) =>
    text
      .split(
        /(\*\*[^*]+\*\*|`[^`]+`|\[\[(?:course|playlist|note):[^\]]+\]\]|\b(?:\d{1,3}:)?\d{1,2}:\d{2}\b)/g,
      )
      .map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`'))
          return <code key={i}>{part.slice(1, -1)}</code>;
        if (part.startsWith('[['))
          return (
            <button
              className="ws-text-link"
              key={i}
              onClick={() => onOpen(part.slice(2, -2))}
            >
              {part.slice(2, -2)}
            </button>
          );
        if (note.courseId && /^\d+(?::\d{2}){1,2}$/.test(part)) {
          const seconds = part
            .split(':')
            .reduce((sum, n) => sum * 60 + Number(n), 0);
          return (
            <button
              key={i}
              className="ws-text-link"
              onClick={() =>
                void timestamp(seconds).catch((e) => setError(String(e)))
              }
            >
              {part}
            </button>
          );
        }
        return part;
      });
  return (
    <div
      className="ws-note-body"
      onClick={(event) => {
        if (
          note.seconds !== undefined &&
          !(event.target as HTMLElement).closest('button,a,input,textarea')
        )
          void timestamp(note.seconds).catch((e) => setError(String(e)));
      }}
      style={note.seconds !== undefined ? { cursor: 'pointer' } : undefined}
    >
      {note.seconds !== undefined && (
        <button
          type="button"
          className="ws-note-timestamp"
          onClick={() =>
            void timestamp(note.seconds!).catch((e) => setError(String(e)))
          }
        >
          Jump to {formatTimestamp(note.seconds)}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {note.body
        .split('\n')
        .map((line, i) =>
          line.startsWith('### ') ? (
            <h4 key={i}>{inline(line.slice(4))}</h4>
          ) : line.startsWith('## ') ? (
            <h3 key={i}>{inline(line.slice(3))}</h3>
          ) : line.startsWith('# ') ? (
            <h2 key={i}>{inline(line.slice(2))}</h2>
          ) : line.startsWith('- ') ? (
            <p key={i}>• {inline(line.slice(2))}</p>
          ) : (
            <p key={i}>{inline(line) || '\u00a0'}</p>
          ),
        )}
    </div>
  );
}
export function NoteEditor({
  note,
  courseId,
  initialLinkedIds,
  items,
  courses,
  onClose,
}: {
  note?: Note | undefined;
  courseId?: string | undefined;
  initialLinkedIds?: string[] | undefined;
  items: LibraryItem[];
  courses: Course[];
  onClose: () => void;
}) {
  const { run, error } = useWorkspace();
  const dialog = useDialogFocus(onClose);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [course, setCourse] = useState(
    courses.some((c) => c.id === (note?.courseId ?? courseId))
      ? (note?.courseId ?? courseId ?? '')
      : '',
  );
  const [links, setLinks] = useState(
    (note?.linkedIds ?? initialLinkedIds ?? []).filter((id) =>
      items.some((i) => i.id === id),
    ),
  );
  const [busy, setBusy] = useState(false);
  return (
    <div className="ws-dialog-backdrop">
      <form
        ref={dialog}
        className="ws-dialog ws-note-editor"
        role="dialog"
        aria-modal="true"
        aria-label={note ? 'Edit note' : 'New note'}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void run({
            op: 'note.save',
            ...(note ? { id: note.id } : {}),
            title,
            body,
            courseId: course || null,
            linkedIds: links,
          })
            .then((r) => {
              if (r) onClose();
            })
            .finally(() => setBusy(false));
        }}
      >
        <h2>{note ? 'Edit note' : 'New note'}</h2>
        {error && (
          <p role="alert" className="ws-error">
            {error}
          </p>
        )}
        <label>
          Title
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Timestamp course
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea
            rows={12}
            maxLength={100000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              '# What I learned\n\n02:30 A useful idea\n- A question to revisit\n\nUse **bold**, `code`, and headings.'
            }
          />
        </label>
        <p className="ws-muted">
          Timestamps such as {formatTimestamp(150)} open the selected course at
          that point. Notes stay private and are excluded from assistant
          exports.
        </p>
        <fieldset>
          <legend>Linked material</legend>
          <div className="ws-link-picker">
            {items
              .filter((i) => i.id !== `note:${note?.id}`)
              .map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    checked={links.includes(i.id)}
                    onChange={() =>
                      setLinks((previous) =>
                        previous.includes(i.id)
                          ? previous.filter((id) => id !== i.id)
                          : [...previous, i.id],
                      )
                    }
                  />
                  {i.title}
                </label>
              ))}
          </div>
        </fieldset>
        <div className="ws-actions">
          <button className="ws-primary" disabled={busy || !title.trim()}>
            Save note
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
function VideoNoteForm({
  course,
  note,
  onSaved,
  onCancel,
}: {
  course: Course;
  note?: Note | undefined;
  onSaved: (seconds?: number) => void;
  onCancel?: (() => void) | undefined;
}) {
  const { run } = useWorkspace();
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(note?.seconds);
  const [clockMessage, setClockMessage] = useState('');
  return (
    <form
      className="ws-video-note-form"
      aria-label={note ? 'Edit video note' : 'Add video note'}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !body.trim()) return;
        setBusy(true);
        const captured =
          seconds ??
          (!note
            ? await captureNoteTime(course).catch(() => undefined)
            : undefined);
        void run({
          op: 'note.save',
          ...(note ? { id: note.id } : {}),
          title:
            title.trim() ||
            body
              .trim()
              .split('\n')[0]!
              .replace(/^#+\s*/, '')
              .slice(0, 200) ||
            'Video note',
          body,
          ...(captured !== undefined ? { seconds: captured } : {}),
          courseId: note ? note.courseId : course.id,
          linkedIds: note ? note.linkedIds : [`course:${course.id}`],
        })
          .then((saved) => {
            if (saved) {
              setTitle('');
              setBody('');
              setSeconds(undefined);
              onSaved(captured);
            }
          })
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Title <span className="ws-muted">(optional)</span>
        <input
          maxLength={200}
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A key idea or question"
        />
      </label>
      <label>
        Your note
        <textarea
          required
          rows={note ? 5 : 4}
          maxLength={100000}
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you learn? Add a timestamp like 02:30 to revisit a moment."
        />
      </label>
      <p className="ws-muted">
        {seconds !== undefined
          ? `Timestamp: ${formatTimestamp(seconds)}`
          : 'The current video time is captured when you save.'}
      </p>
      {clockMessage && <p role="status">{clockMessage}</p>}
      <div className="ws-actions">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const time = await captureNoteTime(course).catch(() => undefined);
            if (time !== undefined) {
              setSeconds(time);
              setClockMessage('');
            } else
              setClockMessage(
                'Open this video and let it load to capture the time.',
              );
            setBusy(false);
          }}
        >
          Capture current time
        </button>
        <button className="ws-primary" disabled={busy || !body.trim()}>
          {busy ? 'Saving…' : note ? 'Save changes' : 'Add note'}
        </button>
        {onCancel && (
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
export function CourseNotes({
  course,
  onOpen,
  compact = false,
}: {
  course: Course;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const { workspace, error, run } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const noteSaved = (seconds?: number) =>
    setSaved(
      seconds === undefined
        ? 'Note saved without a timestamp. Open the video to capture its time.'
        : `Note saved at ${formatTimestamp(seconds)}.`,
    );
  const [deleting, setDeleting] = useState<string | null>(null);
  if (!workspace)
    return (
      <section className="ws-course-notes" aria-label="Video notes">
        <p role={error ? 'alert' : 'status'}>
          {error || 'Loading video notes…'}
        </p>
      </section>
    );
  const notes = workspace.notes.filter(
    (n) =>
      n.courseId === course.id || n.linkedIds.includes(`course:${course.id}`),
  );
  return (
    <section
      id="video-notes"
      tabIndex={-1}
      className={`ws-course-notes${compact ? ' ws-course-notes-compact' : ''}`}
      aria-label="Video notes"
    >
      <div className="ws-heading-row">
        <h2>
          Video notes <span className="ws-muted">({notes.length})</span>
        </h2>
      </div>
      <p className="ws-muted">
        Notes for this video stay in your browser. Timestamps like 02:30 link
        back to the video.
      </p>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      <VideoNoteForm key={course.id} course={course} onSaved={noteSaved} />
      {saved && (
        <p className="ws-note-saved" role="status">
          {saved}
        </p>
      )}
      {!notes.length && (
        <p className="ws-muted">No notes yet. Capture your first idea above.</p>
      )}
      {notes.map((note) => (
        <article key={note.id}>
          {editing === note.id ? (
            <VideoNoteForm
              course={course}
              note={note}
              onSaved={(seconds) => {
                setEditing(null);
                noteSaved(seconds);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <>
              <div className="ws-heading-row">
                <h3>{note.title}</h3>
                <div className="ws-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSaved('');
                      setEditing(note.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="ws-danger"
                    type="button"
                    disabled={deleting === note.id}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Delete this note? Your course and progress will be kept.',
                        )
                      )
                        return;
                      setDeleting(note.id);
                      setSaved('');
                      void run({ op: 'note.remove', id: note.id }).finally(() =>
                        setDeleting(null),
                      );
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <NoteBody note={note} onOpen={onOpen} />
            </>
          )}
        </article>
      ))}
    </section>
  );
}
