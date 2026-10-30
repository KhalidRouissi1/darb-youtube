import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { BookOpen, FileText, ListVideo, Plus, Search } from 'lucide-react';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';
import {
  buildGraph,
  filterLibrary,
  folderTrail,
  libraryItems,
  type LibraryItem,
  type Note,
} from '@/lib/workspace/model';
import { formatDuration } from '@/lib/utils/time';
import type { Course } from '@/types/course';
import { useWorkspace } from './WorkspaceContext';
import { FolderEditor } from './WorkspaceFolders';
import { GraphView } from './GraphView';
import { NoteBody, NoteEditor } from './Notes';
const icons = { course: BookOpen, playlist: ListVideo, note: FileText };
export function WorkspacePanel({
  courses,
  mode = 'library',
  focusId,
  onOpenCourse,
  onOpenPlaylist,
}: {
  courses: Course[];
  mode?: 'library' | 'graph';
  focusId?: string | null | undefined;
  onOpenCourse: (id: string) => void;
  onOpenPlaylist: (id: string) => void;
}) {
  const { workspace, playlists, error, run, clearError } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(focusId ?? null);
  const [checked, setChecked] = useState<string[]>([]);
  const [editNote, setEditNote] = useState<Note | null | undefined>();
  const [newFolder, setNewFolder] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [batchTags, setBatchTags] = useState('');
  const [batchFolder, setBatchFolder] = useState('');
  const [moving, setMoving] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (focusId) setSelected(focusId);
  }, [focusId]);
  useEffect(() => {
    if (
      workspace &&
      search !== null &&
      search !== workspace.preferences.search
    ) {
      const timeout = setTimeout(() => {
        void run({ op: 'preferences', patch: { search } });
      }, 250);
      return () => clearTimeout(timeout);
    }
  }, [search, workspace?.preferences.search]);
  const items = useMemo(
    () => (workspace ? libraryItems(courses, playlists, workspace) : []),
    [courses, playlists, workspace],
  );
  const filtered = useMemo(
    () => (workspace ? filterLibrary(items, workspace) : []),
    [items, workspace],
  );
  const visibleKey = filtered.map((i) => i.id).join('|');
  useEffect(
    () =>
      setChecked((prev) =>
        prev.filter((id) => filtered.some((i) => i.id === id)),
      ),
    [visibleKey],
  );
  const item = items.find((i) => i.id === selected);
  const note =
    item?.kind === 'note'
      ? workspace?.notes.find((n) => n.id === item.entityId)
      : undefined;
  const open = (id: string) => {
    if (id.startsWith('topic:')) {
      void run({ op: 'preferences', patch: { tag: id.slice(6) } });
      setNotice(`Topic filter: ${id.slice(6)}`);
      return;
    }
    if (id.startsWith('folder:')) {
      void run({ op: 'preferences', patch: { folderId: id.slice(7) } });
      return;
    }
    if (!items.some((i) => i.id === id)) {
      setNotice('That linked item is no longer available.');
      return;
    }
    setSelected(id);
  };
  const playback = async (i: LibraryItem) => {
    setNotice('');
    try {
      const r = await browser.runtime.sendMessage(
        i.kind === 'course'
          ? { type: 'OPEN_SESSION', courseId: i.entityId }
          : { type: 'DARB_OPEN_PLAYLIST', playlistId: i.entityId },
      );
      if (!r?.ok) throw new Error(r?.error ?? 'Unable to open session.');
      if (r.needsCourse)
        setNotice(
          'Video opened. Click Darb on its page to prepare the course.',
        );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };
  if (!workspace)
    return (
      <div className="ws-empty">
        <h1>
          {error ? 'Unable to load workspace' : 'Loading your workspace…'}
        </h1>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const p = workspace.preferences;
  const allTags = [
    ...new Set(Object.values(workspace.metadata).flatMap((m) => m.tags)),
  ].sort();
  const trail = folderTrail(workspace.folders, p.folderId);
  const title =
    p.folderId === 'inbox' ? 'Inbox' : (trail.at(-1)?.name ?? 'Library');
  const graph =
    mode === 'graph'
      ? buildGraph(filtered, workspace, courses, playlists)
      : null;
  return (
    <section className="ws-root">
      <div className="ws-breadcrumb">
        <button
          onClick={() =>
            void run({ op: 'preferences', patch: { folderId: 'all' } })
          }
        >
          My learning
        </button>
        <span>/</span>
        {trail.length ? (
          trail.map((f) => (
            <button
              key={f.id}
              onClick={() =>
                void run({ op: 'preferences', patch: { folderId: f.id } })
              }
            >
              {f.name} /
            </button>
          ))
        ) : (
          <span>{mode === 'graph' ? 'Graph' : title}</span>
        )}
      </div>
      <div className="ws-title-row">
        <div>
          <p className="ws-eyebrow">Your learning workspace</p>
          <h1>{mode === 'graph' ? 'Connect what you learn' : title}</h1>
          <p className="ws-muted">
            {mode === 'graph'
              ? 'Follow the links between your courses, notes, and topics.'
              : p.folderId === 'inbox'
                ? 'A place for everything you save, until you give it a home.'
                : 'Keep your material together. Pick up where you stopped.'}
          </p>
        </div>
        <div className="ws-actions">
          <button onClick={() => setNewFolder(true)}>New folder</button>
          <button className="ws-primary" onClick={() => setEditNote(null)}>
            <Plus size={15} />
            New note
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="ws-notice ws-error">
          {error}
          <button aria-label="Dismiss error" onClick={clearError}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="ws-notice">
          {notice}
        </p>
      )}
      <div className="ws-toolbar">
        <label className="ws-search">
          <Search size={15} />
          <input
            aria-label="Search library"
            placeholder="Search courses, notes, and topics"
            value={search ?? workspace.preferences.search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="ws-sr-only" htmlFor="ws-folder-filter">
          Folder
        </label>
        <select
          id="ws-folder-filter"
          value={p.folderId}
          onChange={(e) =>
            void run({ op: 'preferences', patch: { folderId: e.target.value } })
          }
        >
          <option value="all">All folders</option>
          <option value="inbox">Inbox</option>
          {workspace.folders.map((f) => (
            <option key={f.id} value={f.id}>
              {folderTrail(workspace.folders, f.id)
                .map((x) => x.name)
                .join(' / ')}
            </option>
          ))}
        </select>
        <select
          aria-label="Item type"
          value={p.kind}
          onChange={(e) =>
            void run({ op: 'preferences', patch: { kind: e.target.value } })
          }
        >
          <option value="all">All material</option>
          <option value="course">Courses</option>
          <option value="playlist">Playlists</option>
          <option value="note">Notes</option>
        </select>
        <select
          aria-label="Progress filter"
          value={p.status}
          onChange={(e) =>
            void run({ op: 'preferences', patch: { status: e.target.value } })
          }
        >
          <option value="all">Any progress</option>
          <option value="not-started">Not started</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
        <select
          aria-label="Platform filter"
          value={p.platform}
          onChange={(e) =>
            void run({ op: 'preferences', patch: { platform: e.target.value } })
          }
        >
          <option value="all">All platforms</option>
          <option value="youtube">YouTube</option>
          <option value="x">X</option>
          <option value="facebook">Facebook</option>
        </select>
        <select
          aria-label="Topic filter"
          value={p.tag}
          onChange={(e) =>
            void run({ op: 'preferences', patch: { tag: e.target.value } })
          }
        >
          <option value="">All topics</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="ws-library-bar">
        <span>
          {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
        </span>
        <div className="ws-actions">
          {mode === 'library' && (
            <>
              <div className="ws-segment">
                {(['list', 'table', 'cards'] as const).map((view) => (
                  <button
                    key={view}
                    aria-pressed={p.view === view}
                    onClick={() =>
                      void run({ op: 'preferences', patch: { view } })
                    }
                  >
                    {view.charAt(0).toUpperCase() + view.slice(1)}
                  </button>
                ))}
              </div>
              <select
                aria-label="Sort library"
                value={p.sort}
                onChange={(e) =>
                  void run({
                    op: 'preferences',
                    patch: { sort: e.target.value },
                  })
                }
              >
                <option value="studied">Recently studied / edited</option>
                <option value="added">Recently added</option>
                <option value="title">Title A–Z</option>
              </select>
            </>
          )}
        </div>
      </div>
      {checked.length > 0 && mode === 'library' && (
        <div className="ws-batch">
          <strong>{checked.length} selected</strong>
          <select
            aria-label="Move selected items"
            value={batchFolder}
            disabled={moving}
            onChange={(e) => setBatchFolder(e.target.value)}
          >
            <option value="">Move to…</option>
            <option value="inbox">Inbox</option>
            {workspace.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {folderTrail(workspace.folders, f.id)
                  .map((x) => x.name)
                  .join(' / ')}
              </option>
            ))}
          </select>
          <button
            disabled={!batchFolder || moving}
            onClick={async () => {
              setMoving(true);
              const result = await run({
                op: 'items.update',
                ids: checked,
                folderId: batchFolder === 'inbox' ? null : batchFolder,
              });
              if (result) {
                setNotice(
                  `Moved ${checked.length} item(s) to ${batchFolder === 'inbox' ? 'Inbox' : (workspace.folders.find((f) => f.id === batchFolder)?.name ?? 'folder')}.`,
                );
                setChecked([]);
                setBatchFolder('');
              }
              setMoving(false);
            }}
          >
            {moving ? 'Moving…' : 'Move'}
          </button>
          <input
            aria-label="Tags for selected items"
            placeholder="python, beginner"
            value={batchTags}
            onChange={(e) => setBatchTags(e.target.value)}
          />
          <button
            onClick={() =>
              void run({
                op: 'items.update',
                ids: checked,
                tags: batchTags
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          >
            Replace tags
          </button>
          <button onClick={() => setChecked([])}>Clear selection</button>
        </div>
      )}
      <div className={`ws-content ${item ? 'has-inspector' : ''}`}>
        <div className="ws-main">
          {graph ? (
            <GraphView
              nodes={graph.nodes}
              edges={graph.edges}
              onSelect={open}
              selected={selected}
            />
          ) : !filtered.length ? (
            <div className="ws-empty">
              <BookOpen size={32} />
              <h2>
                {items.length
                  ? 'No material matches these filters'
                  : 'Start with something you want to learn'}
              </h2>
              <p>
                {items.length
                  ? 'Clear a filter or try a different search.'
                  : 'Open a recorded video and click Darb to create your first course. You can add notes here at any time.'}
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  void run({
                    op: 'preferences',
                    patch: {
                      folderId: 'all',
                      kind: 'all',
                      platform: 'all',
                      status: 'all',
                      tag: '',
                      search: '',
                    },
                  });
                }}
              >
                Reset filters
              </button>
            </div>
          ) : p.view === 'table' ? (
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all visible items"
                        checked={
                          checked.length === filtered.length &&
                          !!filtered.length
                        }
                        onChange={(e) =>
                          setChecked(
                            e.target.checked ? filtered.map((i) => i.id) : [],
                          )
                        }
                      />
                    </th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Progress</th>
                    <th>Duration</th>
                    <th>Topics</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr
                      key={i.id}
                      className={selected === i.id ? 'is-selected' : ''}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData('application/x-darb-item', i.id)
                      }
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${i.title}`}
                          checked={checked.includes(i.id)}
                          onChange={() =>
                            setChecked((previous) =>
                              previous.includes(i.id)
                                ? previous.filter((id) => id !== i.id)
                                : [...previous, i.id],
                            )
                          }
                        />
                      </td>
                      <td>
                        <button onClick={() => open(i.id)}>{i.title}</button>
                      </td>
                      <td>{i.kind}</td>
                      <td>{i.progress === null ? '—' : `${i.progress}%`}</td>
                      <td>
                        {i.kind === 'note'
                          ? '—'
                          : i.duration === null
                            ? 'Unknown'
                            : formatDuration(i.duration)}
                      </td>
                      <td>
                        {workspace.metadata[i.id]?.tags.join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={p.view === 'cards' ? 'ws-cards' : 'ws-list'}>
              {filtered.map((i) => {
                const Icon = icons[i.kind];
                return (
                  <article
                    key={i.id}
                    className={`ws-item ${selected === i.id ? 'is-selected' : ''}`}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData('application/x-darb-item', i.id)
                    }
                  >
                    <input
                      className="ws-item-check"
                      type="checkbox"
                      aria-label={`Select ${i.title}`}
                      checked={checked.includes(i.id)}
                      onChange={() =>
                        setChecked((previous) =>
                          previous.includes(i.id)
                            ? previous.filter((id) => id !== i.id)
                            : [...previous, i.id],
                        )
                      }
                    />
                    {p.view === 'cards' && (
                      <button
                        className="ws-card-image"
                        aria-label={`Open ${i.title}`}
                        onClick={() => open(i.id)}
                      >
                        {i.thumbnailUrl ? (
                          <VideoThumbnail
                            src={i.thumbnailUrl}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Icon size={30} />
                        )}
                      </button>
                    )}
                    <button
                      className="ws-item-title"
                      onClick={() => open(i.id)}
                    >
                      <Icon size={17} />
                      <span>{i.title}</span>
                    </button>
                    <div className="ws-item-info">
                      <span>{i.kind}</span>
                      <span>
                        {i.progress === null
                          ? new Date(i.updatedAt).toLocaleDateString()
                          : `${i.progress}% complete`}
                      </span>
                      {p.view === 'list' && i.kind !== 'note' && (
                        <span>
                          {i.duration === null
                            ? 'Duration unknown'
                            : formatDuration(i.duration)}
                        </span>
                      )}
                    </div>
                    {workspace.metadata[i.id]?.tags.length ? (
                      <div className="ws-tags">
                        {workspace.metadata[i.id]!.tags.map((t) => (
                          <button
                            key={t}
                            onClick={() =>
                              void run({ op: 'preferences', patch: { tag: t } })
                            }
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
        {item && (
          <ItemInspector
            key={`${item.id}:${workspace.metadata[item.id]?.updatedAt ?? ''}`}
            item={item}
            items={items}
            courses={courses}
            note={note}
            onClose={() => setSelected(null)}
            onOpenCourse={onOpenCourse}
            onOpenPlaylist={onOpenPlaylist}
            onPlay={() => void playback(item)}
            onEditNote={() => setEditNote(note ?? null)}
            onLinkOpen={open}
          />
        )}
      </div>
      {newFolder && <FolderEditor onClose={() => setNewFolder(false)} />}{' '}
      {editNote !== undefined && (
        <NoteEditor
          note={editNote ?? undefined}
          items={items}
          courses={courses}
          onClose={() => setEditNote(undefined)}
        />
      )}
    </section>
  );
}
function ItemInspector({
  item,
  items,
  courses,
  note,
  onClose,
  onOpenCourse,
  onOpenPlaylist,
  onPlay,
  onEditNote,
  onLinkOpen,
}: {
  item: LibraryItem;
  items: LibraryItem[];
  courses: Course[];
  note: Note | undefined;
  onClose: () => void;
  onOpenCourse: (id: string) => void;
  onOpenPlaylist: (id: string) => void;
  onPlay: () => void;
  onEditNote: () => void;
  onLinkOpen: (id: string) => void;
}) {
  const { workspace, run, playlists } = useWorkspace();
  const meta = workspace?.metadata[item.id];
  const [folder, setFolder] = useState(meta?.folderId ?? '');
  const [tags, setTags] = useState(meta?.tags.join(', ') ?? '');
  const [target, setTarget] = useState('');
  const [newNote, setNewNote] = useState(false);
  const [playlistName, setPlaylistName] = useState(item.title);
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  if (!workspace) return null;
  const links = workspace.links.filter(
    (l) => l.source === item.id || l.target === item.id,
  );
  const backlinks = workspace.notes.filter(
    (n) =>
      n.linkedIds.includes(item.id) ||
      (item.kind === 'course' && n.courseId === item.entityId),
  );
  return (
    <aside className="ws-inspector">
      <div className="ws-heading-row">
        <span className="ws-eyebrow">{item.kind}</span>
        <button aria-label="Close item details" onClick={onClose}>
          ×
        </button>
      </div>
      <h2>{item.title}</h2>
      {item.kind === 'playlist' && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const playlist = playlists.find((p) => p.id === item.entityId);
            if (!playlist || renaming) return;
            setRenaming(true);
            setRenameError('');
            try {
              const response = await browser.runtime.sendMessage({
                type: 'DARB_LEARNING',
                action: {
                  op: 'playlist.edit',
                  id: playlist.id,
                  title: playlistName,
                  items: playlist.items,
                  revision: playlist.revision,
                },
              });
              if (!response?.ok)
                throw new Error(
                  response?.error ?? 'Unable to rename playlist.',
                );
            } catch (error) {
              setRenameError(
                error instanceof Error
                  ? error.message
                  : 'Unable to rename playlist.',
              );
            } finally {
              setRenaming(false);
            }
          }}
        >
          <label>
            Playlist name
            <input
              aria-label="Playlist name"
              className="ws-playlist-name"
              maxLength={200}
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
            />
          </label>
          <button disabled={renaming || !playlistName.trim()}>
            {renaming ? 'Renaming…' : 'Rename playlist'}
          </button>
          {renameError && <p role="alert">{renameError}</p>}
        </form>
      )}
      {item.progress !== null && (
        <>
          <div className="ws-progress">
            <span style={{ width: `${item.progress}%` }} />
          </div>
          <p className="ws-muted">
            {item.progress}% complete ·{' '}
            {item.duration === null
              ? 'Duration unknown'
              : formatDuration(item.duration)}
          </p>
        </>
      )}
      <div className="ws-actions">
        {item.kind !== 'note' && (
          <button className="ws-primary" onClick={onPlay}>
            {item.kind === 'course' ? 'Continue learning' : 'Continue playlist'}
          </button>
        )}
        <button
          onClick={() =>
            item.kind === 'course'
              ? onOpenCourse(item.entityId)
              : item.kind === 'playlist'
                ? onOpenPlaylist(item.entityId)
                : onEditNote()
          }
        >
          {item.kind === 'course'
            ? 'Open lessons'
            : item.kind === 'playlist'
              ? 'Open playlist'
              : 'Edit note'}
        </button>
      </div>
      <label>
        Folder
        <select value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">Inbox</option>
          {workspace.folders.map((f) => (
            <option key={f.id} value={f.id}>
              {folderTrail(workspace.folders, f.id)
                .map((p) => p.name)
                .join(' / ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Topics
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="python, beginner"
        />
      </label>
      <button
        onClick={() =>
          void run({
            op: 'items.update',
            ids: [item.id],
            folderId: folder || null,
            tags: tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          })
        }
      >
        Save organization
      </button>
      {note && <NoteBody note={note} onOpen={onLinkOpen} />}
      <h3>Related material</h3>
      <div className="ws-link-picker">
        {links.map((l, i) => {
          const other = l.source === item.id ? l.target : l.source;
          return (
            <div className="ws-heading-row" key={i}>
              <button
                className="ws-text-link"
                onClick={() => onLinkOpen(other)}
              >
                {items.find((i) => i.id === other)?.title ?? 'Unavailable item'}
              </button>
              <button
                aria-label="Remove relationship"
                onClick={() =>
                  void run({
                    op: 'link.remove',
                    source: l.source,
                    target: l.target,
                  })
                }
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <label>
        Connect an item
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose material…</option>
          {items
            .filter((i) => i.id !== item.id)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
        </select>
      </label>
      <button
        disabled={!target}
        onClick={() => void run({ op: 'link.add', source: item.id, target })}
      >
        Add connection
      </button>
      <h3>Linked notes</h3>
      {backlinks.map((n) => (
        <button
          key={n.id}
          className="ws-text-link"
          onClick={() => onLinkOpen(`note:${n.id}`)}
        >
          {n.title}
        </button>
      ))}
      <button onClick={() => setNewNote(true)}>New linked note</button>
      {item.kind === 'note' && (
        <button
          className="ws-danger"
          onClick={() => {
            if (
              window.confirm(
                'Delete this note? This does not delete its linked courses.',
              )
            )
              void run({ op: 'note.remove', id: item.entityId }).then(
                (result) => {
                  if (result) onClose();
                },
              );
          }}
        >
          Delete note
        </button>
      )}
      {newNote && (
        <NoteEditor
          courseId={item.kind === 'course' ? item.entityId : undefined}
          initialLinkedIds={[item.id]}
          items={items}
          courses={courses}
          onClose={() => setNewNote(false)}
        />
      )}
    </aside>
  );
}
