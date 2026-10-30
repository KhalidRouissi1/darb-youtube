import { useDialogFocus } from './useDialogFocus';
import { useState } from 'react';
import {
  Folder as FolderIcon,
  Inbox,
  Plus,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import type { Folder } from '@/lib/workspace/model';
import { descendants, folderTrail } from '@/lib/workspace/model';
import { useWorkspace } from './WorkspaceContext';
export function FolderEditor({
  folder,
  onClose,
}: {
  folder?: Folder | undefined;
  onClose: () => void;
}) {
  const { workspace, run, error } = useWorkspace();
  const dialog = useDialogFocus(onClose);
  const [name, setName] = useState(folder?.name ?? '');
  const [parentId, setParent] = useState(folder?.parentId ?? '');
  const [busy, setBusy] = useState(false);
  if (!workspace) return null;
  const invalid = folder
    ? descendants(workspace.folders, folder.id)
    : new Set<string>();
  return (
    <div className="ws-dialog-backdrop">
      <form
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={folder ? 'Edit folder' : 'New folder'}
        className="ws-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void run({
            op: 'folder.save',
            ...(folder ? { id: folder.id } : {}),
            name,
            parentId: parentId || null,
          })
            .then((result) => {
              if (result) onClose();
            })
            .finally(() => setBusy(false));
        }}
      >
        <h2>{folder ? 'Edit folder' : 'New folder'}</h2>
        {error && (
          <p role="alert" className="ws-error">
            {error}
          </p>
        )}
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Inside
          <select value={parentId} onChange={(e) => setParent(e.target.value)}>
            <option value="">Workspace</option>
            {workspace.folders
              .filter((f) => !invalid.has(f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {folderTrail(workspace.folders, f.id)
                    .map((p) => p.name)
                    .join(' / ')}
                </option>
              ))}
          </select>
        </label>
        <div className="ws-actions">
          <button className="ws-primary" disabled={busy || !name.trim()}>
            Save folder
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {folder && (
            <button
              type="button"
              className="ws-danger"
              onClick={() => {
                if (
                  window.confirm(
                    'Delete this folder and its subfolders? All their items will move to Inbox.',
                  )
                )
                  void run({ op: 'folder.remove', id: folder.id }).then((r) => {
                    if (r) onClose();
                  });
              }}
            >
              Delete folder
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
export function WorkspaceFolders({ onNavigate }: { onNavigate: () => void }) {
  const { workspace, run } = useWorkspace();
  const [editor, setEditor] = useState<Folder | null | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string | null>(null);
  if (!workspace) return null;
  const open = (id: string) => {
    void run({ op: 'preferences', patch: { folderId: id } });
    onNavigate();
  };
  const move = (folder: Folder, direction: number) => {
    const siblings = workspace.folders
      .filter((f) => f.parentId === folder.parentId)
      .sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((f) => f.id === folder.id);
    const next = index + direction;
    if (next < 0 || next >= siblings.length) return;
    const ordered = [...siblings];
    ordered.splice(next, 0, ordered.splice(index, 1)[0]!);
    void run({
      op: 'folder.reorder',
      parentId: folder.parentId,
      ids: ordered.map((f) => f.id),
    });
  };
  const rows = (parentId: string | null, level = 0): React.ReactNode =>
    workspace.folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map((f) => (
        <div key={f.id}>
          <div
            className={`ws-folder-row ${workspace.preferences.folderId === f.id ? 'is-current' : ''}`}
            style={{ paddingLeft: level * 12 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const item = e.dataTransfer.getData('application/x-darb-item');
              if (item)
                void run({ op: 'items.update', ids: [item], folderId: f.id });
              else if (drag)
                void run({
                  op: 'folder.save',
                  id: drag,
                  name: workspace.folders.find((x) => x.id === drag)!.name,
                  parentId: f.id,
                });
              setDrag(null);
            }}
          >
            <button
              aria-label={`${collapsed.has(f.id) ? 'Expand' : 'Collapse'} ${f.name}`}
              className="ws-collapse"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(f.id)) next.delete(f.id);
                  else next.add(f.id);
                  return next;
                })
              }
            >
              <ChevronRight
                size={12}
                style={{
                  transform: collapsed.has(f.id) ? undefined : 'rotate(90deg)',
                }}
              />
            </button>
            <button
              className="ws-folder-name"
              draggable
              onDragStart={(e) => {
                setDrag(f.id);
                e.dataTransfer.setData('text/plain', f.id);
              }}
              onDragEnd={() => setDrag(null)}
              onClick={() => open(f.id)}
            >
              <FolderIcon size={14} />
              <span>{f.name}</span>
            </button>
            <button aria-label={`Edit ${f.name}`} onClick={() => setEditor(f)}>
              <MoreHorizontal size={13} />
            </button>
          </div>
          {!collapsed.has(f.id) && rows(f.id, level + 1)}
          <div className="ws-folder-order">
            <button
              aria-label={`Move ${f.name} up`}
              onClick={() => move(f, -1)}
            >
              ↑
            </button>
            <button
              aria-label={`Move ${f.name} down`}
              onClick={() => move(f, 1)}
            >
              ↓
            </button>
          </div>
        </div>
      ));
  return (
    <div className="ws-folders">
      <div className="ws-folder-heading">
        <span>My learning</span>
        <button aria-label="Create folder" onClick={() => setEditor(null)}>
          <Plus size={14} />
        </button>
      </div>
      <button
        className="ws-inbox"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData('application/x-darb-item');
          if (id) void run({ op: 'items.update', ids: [id], folderId: null });
        }}
        onClick={() => open('inbox')}
      >
        <Inbox size={14} />
        Inbox
      </button>
      {rows(null)}
      {!workspace.folders.length && (
        <p className="ws-sidebar-hint">
          Group your courses into a learning path.
        </p>
      )}
      {editor !== undefined && (
        <FolderEditor
          folder={editor ?? undefined}
          onClose={() => setEditor(undefined)}
        />
      )}
    </div>
  );
}
