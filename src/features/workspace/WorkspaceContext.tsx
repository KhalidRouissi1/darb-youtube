import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { browser } from 'wxt/browser';
import { workspaceSchema, type Workspace } from '@/lib/workspace/model';
import { playlistSchema, type Playlist } from '@/lib/learning/model';

type Context = {
  workspace: Workspace | null;
  playlists: Playlist[];
  error: string;
  run: (action: Record<string, unknown>) => Promise<Workspace | undefined>;
  clearError: () => void;
};
const WorkspaceContext = createContext<Context | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState('');
  const latest = useRef<Workspace | null>(null);
  const apply = (data: unknown) => {
    const state = workspaceSchema.parse(data);
    latest.current = state;
    setWorkspace(state);
    return state;
  };
  const read = async () => {
    const r = await browser.runtime.sendMessage({
      type: 'DARB_WORKSPACE',
      action: { op: 'read' },
    });
    if (!r?.ok) throw new Error(r?.error ?? 'Unable to load workspace.');
    apply(r.data);
  };
  const readPlaylists = async () => {
    const r = await browser.runtime.sendMessage({
      type: 'DARB_LEARNING',
      action: { op: 'read' },
    });
    if (!r?.ok) throw new Error(r?.error ?? 'Unable to load playlists.');
    setPlaylists(playlistSchema.array().parse(r.data.playlists));
  };
  useEffect(() => {
    let alive = true;
    void Promise.all([read(), readPlaylists()]).catch((e) => {
      if (alive) setError(String(e));
    });
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return;
      if ('darb:workspace' in changes)
        void read().catch((e) => setError(String(e)));
      if ('darb:learning' in changes)
        void readPlaylists().catch((e) => setError(String(e)));
    };
    browser.storage.onChanged.addListener(changed);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  const run = async (action: Record<string, unknown>) => {
    setError('');
    try {
      const r = await browser.runtime.sendMessage({
        type: 'DARB_WORKSPACE',
        action: { ...action, revision: latest.current?.revision ?? 0 },
      });
      if (!r?.ok) throw new Error(r?.error ?? 'Unable to update workspace.');
      return apply(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      try {
        await read();
      } catch {
        /* Keep the last visible workspace on read failure. */
      }
      return undefined;
    }
  };
  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        playlists,
        error,
        run,
        clearError: () => setError(''),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is missing.');
  return value;
}
