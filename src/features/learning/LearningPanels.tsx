import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  type LearningState,
  type VideoReference,
  type Playlist,
  type Proposal,
  courseForVideo,
  playlistSummary,
  playlistVideoCompleted,
} from '@/lib/learning/model';
import { assistantPermissions } from '@/lib/learning/permissions';
import type { Course } from '@/types/course';

const button =
  'rounded-xl border border-current/15 px-3 py-2 text-sm hover:bg-brand-500/10 disabled:opacity-40';
const panel =
  'mt-6 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-[#202028]';
async function action<T = LearningState>(
  input: Record<string, unknown>,
): Promise<T> {
  const response = await browser.runtime.sendMessage({
    type: 'DARB_LEARNING',
    action: input,
  });
  if (!response?.ok)
    throw new Error(response?.error ?? 'Unable to update Darb.');
  return response.data as T;
}
function useLearning() {
  const [state, setState] = useState<LearningState | null>(null);
  const [error, setError] = useState('');
  const reload = async () => {
    try {
      setState(await action({ op: 'read' }));
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void reload();
    const changed = (changes: Record<string, unknown>) => {
      if ('darb:learning' in changes) void reload();
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, []);
  const run = async <T = LearningState,>(input: Record<string, unknown>) => {
    setError('');
    try {
      const value = await action<T>(input);
      await reload();
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  };
  return { state, error, run, setError };
}
function OrderedVideos({
  items,
  onChange,
}: {
  items: VideoReference[];
  onChange: (items: VideoReference[]) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    onChange(next);
  };
  return (
    <ol className="mt-4 divide-y divide-black/10 dark:divide-white/10">
      {items.map((video, index) => (
        <li
          key={video.videoId}
          draggable
          onDragStart={() => setDrag(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (drag !== null) move(drag, index);
            setDrag(null);
          }}
          className="flex flex-wrap items-center gap-3 py-3"
        >
          <span className="text-brand-600">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="min-w-40 flex-1 text-sm">{video.title}</span>
          <button
            className={button}
            disabled={index === 0}
            aria-label={`Move ${video.title} up`}
            onClick={() => move(index, index - 1)}
          >
            ↑
          </button>
          <button
            className={button}
            disabled={index === items.length - 1}
            aria-label={`Move ${video.title} down`}
            onClick={() => move(index, index + 1)}
          >
            ↓
          </button>
          <button
            className={button}
            aria-label={`Remove ${video.title}`}
            onClick={() =>
              onChange(items.filter((v) => v.videoId !== video.videoId))
            }
          >
            Remove
          </button>
        </li>
      ))}
    </ol>
  );
}
function Editor({
  title: initialTitle,
  items: initialItems,
  onSave,
  onCancel,
}: {
  title: string;
  items: VideoReference[];
  onSave: (title: string, items: VideoReference[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  return (
    <div className={panel}>
      <label className="block text-sm font-semibold">
        Playlist name
        <input
          maxLength={200}
          className="mt-2 block w-full rounded-xl border border-current/20 bg-transparent p-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <p className="mt-3 text-sm text-muted">
        Drag videos or use the arrow buttons to change their order.
      </p>
      <OrderedVideos items={items} onChange={setItems} />
      <div className="mt-4 flex gap-2">
        <button
          className={button}
          disabled={busy || !title.trim() || !items.length}
          onClick={() => {
            setBusy(true);
            void onSave(title, items).finally(() => setBusy(false));
          }}
        >
          Save playlist
        </button>
        <button className={button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
export function PlaylistPanel({
  courses,
  focusId,
}: {
  courses: Course[];
  focusId?: string | null | undefined;
}) {
  const { state, error, run, setError } = useLearning();
  const [editing, setEditing] = useState<Playlist | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (focusId && state)
      document
        .getElementById(`playlist-${focusId}`)
        ?.scrollIntoView({ block: 'start' });
  }, [focusId, state?.playlists.length]);
  const open = async (p: Playlist, videoId: string) => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'DARB_OPEN_PLAYLIST',
        playlistId: p.id,
        videoId,
      });
      if (!response?.ok)
        throw new Error(response?.error ?? 'Unable to open video.');
      if (response.needsCourse)
        setNotice(
          'Video opened. Click Darb on that video to choose your daily session length and create its course.',
        );
    } catch (e) {
      setError(String(e));
    }
  };
  if (!state)
    return (
      <p role={error ? 'alert' : 'status'}>{error || 'Loading playlists…'}</p>
    );
  return (
    <section>
      <p className="text-sm text-brand-600">Your learning path</p>
      <h1 className="mt-2 text-3xl font-bold">Playlists</h1>
      <p className="mt-3 text-sm text-muted">
        Select videos on YouTube or HackerTube, then arrange them here. Your place in each
        course is saved separately.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={panel}>
          {notice}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button
          className={button}
          onClick={() =>
            void browser.tabs.create({
              url: 'https://www.youtube.com/results?search_query=programming+course',
            })
          }
        >
          Open YouTube
        </button>
        <span className="self-center text-sm text-muted">
          Click Darb → Select videos.
        </span>
      </div>
      {state.selection.items.length > 0 && (
        <Editor
          key={state.selection.id + ':' + state.selection.revision}
          title="My learning playlist"
          items={state.selection.items}
          onCancel={async () => {
            await run({ op: 'selection.cancel' });
          }}
          onSave={async (title, items) => {
            await run({
              op: 'selection.save',
              title,
              items,
              id: state.selection.id,
              revision: state.selection.revision,
            });
          }}
        />
      )}
      {!state.playlists.length && !state.selection.items.length && (
        <div className={panel}>
          <h2 className="text-xl font-semibold">
            Build a path worth finishing.
          </h2>
          <p className="mt-3 text-sm text-muted">
            Choose videos from YouTube search, channel pages, or HackerTube listings. Saved
            drafts stay here until you review them.
          </p>
        </div>
      )}
      {state.playlists.map((p) => {
        const index = p.items.findIndex((v) => v.videoId === p.cursorId);
        const summary = playlistSummary(p, courses);
        return (
          <article
            key={p.id}
            id={`playlist-${p.id}`}
            className={
              panel +
              (focusId === p.id ? ' ring-2 ring-brand-500 scroll-mt-28' : '')
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{p.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  {summary.completedVideos === p.items.length
                    ? '✓ Playlist completed · '
                    : ''}
                  Video {index + 1} of {p.items.length} ·{' '}
                  {summary.completedVideos} completed
                  {summary.knownSeconds > 0
                    ? ` · ${Math.round(summary.knownSeconds / 60)} min verified`
                    : ''}
                  {summary.unknownVideos > 0
                    ? ` · ${summary.unknownVideos} durations unknown`
                    : ''}
                </p>
              </div>
              <button className={button} onClick={() => setEditing(p)}>
                Rename / edit playlist
              </button>
            </div>
            {editing?.id === p.id && (
              <Editor
                key={editing.id + ':' + editing.revision}
                title={editing.title}
                items={editing.items}
                onCancel={() => setEditing(null)}
                onSave={async (title, items) => {
                  if (
                    await run({
                      op: 'playlist.edit',
                      id: editing.id,
                      title,
                      items,
                      revision: editing.revision,
                    })
                  )
                    setEditing(null);
                }}
              />
            )}

            <ol className="mt-5 divide-y divide-black/10 dark:divide-white/10">
              {p.items.map((v, i) => {
                const course = courseForVideo(courses, v.videoId);
                return (
                  <li key={v.videoId} className="flex items-center gap-3 py-4">
                    <span className="text-brand-600">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {v.title}
                        {v.videoId === p.cursorId ? ' · Current' : ''}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {course
                          ? `${Math.round(course.durationSeconds / 60)} min · ${playlistVideoCompleted(p, courses, v.videoId) ? 'Completed' : 'Progress saved'}`
                          : playlistVideoCompleted(p, courses, v.videoId)
                            ? 'Completed · Duration unknown'
                            : 'Duration unknown · Prepare course when opened'}
                      </p>
                    </div>
                    <button
                      className={button}
                      onClick={() => void open(p, v.videoId)}
                    >
                      {course ? 'Resume' : 'Prepare'}
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={button}
                onClick={() => void open(p, p.cursorId)}
              >
                {summary.completedVideos === p.items.length
                  ? 'Watch again'
                  : 'Continue current video'}
              </button>
              <button
                className={button}
                disabled={index === p.items.length - 1}
                onClick={() => void open(p, p.items[index + 1]!.videoId)}
              >
                Next video
              </button>
              <button
                className={button}
                onClick={() => {
                  if (
                    window.confirm(
                      'Delete this playlist? Course progress will be kept.',
                    )
                  )
                    void run({ op: 'playlist.remove', id: p.id });
                }}
              >
                Delete playlist
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AssistantPanel({ courses }: { courses: Course[] }) {
  const { state, error, run, setError } = useLearning();
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [playlistIds, setPlaylistIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState(false);
  const [playback, setPlayback] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Proposal | null>(null);
  useEffect(() => {
    if (state && !loaded) {
      setCourseIds(state.connection.courseIds);
      setPlaylistIds(state.connection.playlistIds);
      setDrafts(state.connection.allowDrafts);
      setPlayback(state.connection.allowPlayback);
      setLoaded(true);
    }
  }, [state, loaded]);
  if (!state)
    return (
      <p role={error ? 'alert' : 'status'}>
        {error || 'Loading assistant settings…'}
      </p>
    );
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
  const connect = () => {
    void browser.permissions
      .request(assistantPermissions())
      .then(async (allowed) => {
        if (!allowed) {
          setError('Native messaging permission was not granted.');
          return;
        }
        await run({
          op: 'connection.update',
          courseIds,
          playlistIds,
          allowDrafts: drafts,
          allowPlayback: playback,
        });
      })
      .catch((e) => setError(String(e)));
  };
  return (
    <section>
      <p className="text-sm text-brand-600">Optional assistant access</p>
      <h1 className="mt-2 text-3xl font-bold">Assistant</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Share a read-only export or connect a local MCP companion. Your
        assistant provider may receive the information you share. Never upload
        the private connection file.
      </p>
      <div className={panel}>
        <h2 className="text-lg font-semibold">
          Start here: connect your own AI app
        </h2>
        <p className="mt-2 text-sm text-muted">
          MCP lets an AI app read the Darb courses you choose. Darb does not
          include an AI chat. Your notes are excluded.
        </p>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm">
          <li>
            For a simple first test, choose a course below and export selected
            data.
          </li>
          <li>
            Run the Darb companion in snapshot mode from your desktop MCP
            client. This reads only that export.
          </li>
          <li>Ask your assistant: “Use Darb to show my next session.”</li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          Live access is a separate Linux desktop setup. It needs the native
          host installer and a saved private connection file; enabling access
          here alone does not connect the AI app.
        </p>
        <button
          className={button + ' mt-4'}
          onClick={() =>
            void browser.tabs.create({
              url: browser.runtime.getURL('/mcp-help.html'),
            })
          }
        >
          Open step-by-step MCP setup
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
      <div className={panel}>
        <h2 className="text-lg font-semibold">Choose what to share</h2>
        <p className="mt-2 text-sm text-muted">
          Nothing is shared by default. These choices apply to your next export
          or saved live access settings.
        </p>
        <div className="mt-4 space-y-3">
          {courses.map((c) => (
            <label className="flex gap-3 text-sm" key={c.id}>
              <input
                type="checkbox"
                checked={courseIds.includes(c.id)}
                onChange={() => setCourseIds(toggle(courseIds, c.id))}
              />
              {c.title}
            </label>
          ))}
          {state.playlists.map((p) => (
            <label className="flex gap-3 text-sm" key={p.id}>
              <input
                type="checkbox"
                checked={playlistIds.includes(p.id)}
                onChange={() => setPlaylistIds(toggle(playlistIds, p.id))}
              />
              Playlist: {p.title}
            </label>
          ))}
        </div>
        <button
          className={button + ' mt-5'}
          onClick={async () => {
            const value = await run({ op: 'snapshot', courseIds, playlistIds });
            if (value) download(value, 'darb-snapshot.json');
          }}
        >
          Export selected data
        </button>
      </div>
      <div className={panel}>
        <h2 className="text-lg font-semibold">
          Live connection · Linux companion
        </h2>
        <p className="mt-2 text-sm text-muted">
          Access is {state.connection.enabled ? 'enabled' : 'disconnected'}. An
          installed, running companion is also required; this setting alone does
          not confirm a connection.
        </p>
        <p className="mt-2 break-all text-xs text-muted">
          Browser profile: {state.connection.profileId}
        </p>
        <label className="mt-4 flex gap-3 text-sm">
          <input
            type="checkbox"
            checked={drafts}
            onChange={(e) => setDrafts(e.target.checked)}
          />
          Allow reading my current video selection and proposing playlists
        </label>
        <label className="mt-4 flex gap-3 text-sm">
          <input
            type="checkbox"
            checked={playback}
            onChange={(e) => setPlayback(e.target.checked)}
          />
          Allow playback requests, with approval here each time
        </label>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className={button} onClick={connect}>
            Save live access settings
          </button>
          <button
            className={button}
            disabled={!state.connection.enabled}
            onClick={() =>
              download(
                {
                  profileId: state.connection.profileId,
                  token: state.connection.token,
                  extensionId: browser.runtime.id,
                },
                'darb-connection.json',
              )
            }
          >
            Download private connection file
          </button>
          <button
            className={button}
            onClick={() => void run({ op: 'connection.disconnect' })}
          >
            Disconnect and revoke
          </button>
        </div>
        <p className="mt-4 text-sm text-muted">
          Follow docs/mcp-setup.md in the repository to install the companion
          and configure your MCP client. Disconnecting rotates the key and
          invalidates pending requests.
        </p>
      </div>
      {editing && (
        <Editor
          key={editing.id + ':' + editing.revision}
          title={editing.title}
          items={editing.items}
          onCancel={() => setEditing(null)}
          onSave={async (title, items) => {
            if (
              await run({
                op: 'proposal.edit',
                id: editing.id,
                revision: editing.revision,
                title,
                items,
              })
            )
              setEditing(null);
          }}
        />
      )}
      <div className={panel}>
        <h2 className="text-lg font-semibold">
          Requests awaiting your approval
        </h2>
        {!state.proposals.some((p) => p.status === 'pending') && (
          <p className="mt-3 text-sm text-muted">No pending requests.</p>
        )}
        {state.proposals
          .filter((p) => p.status === 'pending')
          .map((p) => (
            <div key={p.id} className="mt-5 border-t border-current/10 pt-4">
              <p className="font-semibold">
                {p.kind === 'playback' ? 'Open course: ' : 'Save playlist: '}
                {p.title}
              </p>
              <p className="mt-1 text-xs text-muted">
                Expires {new Date(p.expiresAt).toLocaleTimeString()}
              </p>
              {p.kind === 'playlist' && (
                <ol className="mt-3 list-inside list-decimal text-sm">
                  {p.items.map((v) => (
                    <li key={v.videoId}>{v.title}</li>
                  ))}
                </ol>
              )}
              <div className="mt-4 flex gap-2">
                {p.kind === 'playlist' && (
                  <button className={button} onClick={() => setEditing(p)}>
                    Edit proposal
                  </button>
                )}
                <button
                  className={button}
                  disabled={p.expiresAt < Date.now()}
                  onClick={async () => {
                    const result = await run<{ playbackCourseId?: string }>({
                      op: 'proposal.approve',
                      id: p.id,
                      revision: p.revision,
                    });
                    if (result?.playbackCourseId) {
                      try {
                        const response = await browser.runtime.sendMessage({
                          type: 'OPEN_SESSION',
                          courseId: result.playbackCourseId,
                        });
                        if (!response?.ok)
                          throw new Error(
                            response?.error ?? 'Unable to open course.',
                          );
                      } catch (e) {
                        setError(String(e));
                      }
                    }
                  }}
                >
                  Approve {p.kind === 'playback' ? 'playback' : 'save'}
                </button>
                <button
                  className={button}
                  onClick={() => void run({ op: 'proposal.reject', id: p.id })}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
      </div>
      <div className={panel}>
        <div className="flex justify-between gap-2">
          <h2 className="font-semibold">Recent local actions</h2>
          <button
            className={button}
            onClick={() => void run({ op: 'history.clear' })}
          >
            Clear history
          </button>
        </div>
        <ul className="mt-4 space-y-2 text-xs text-muted">
          {state.history.map((h, i) => (
            <li key={i}>
              {new Date(h.at).toLocaleString()} · {h.action}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
