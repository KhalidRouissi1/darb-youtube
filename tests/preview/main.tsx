import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import {
  PlaylistPanel,
  AssistantPanel,
} from '../../src/features/learning/LearningPanels';
import { WorkspaceProvider } from '../../src/features/workspace/WorkspaceContext';
import { WorkspacePanel } from '../../src/features/workspace/WorkspacePanel';
import { PopupApp } from '../../src/entrypoints/popup/PopupApp';
import { DarbLogo } from '../../src/components/brand/DarbLogo';
import { sampleCourses } from './browser';
import '../../src/styles/app.css';
import '../../src/features/workspace/workspace.css';
function Preview() {
  const [view, setView] = useState('popup');
  const [dark, setDark] = useState(false);
  return (
    <div className={dark && view !== 'popup' ? 'dark' : ''}>
      <div
        style={{
          background: dark && view !== 'popup' ? '#17171c' : '#f7f6f2',
          color: dark && view !== 'popup' ? '#fff' : '#1b1816',
        }}
        className="min-h-screen bg-canvas p-6 text-ink dark:bg-[#17171c] dark:text-white sm:p-10"
      >
        <div className="mx-auto max-w-6xl">
          <nav className="mb-8 flex flex-wrap items-center gap-5">
            <DarbLogo />
            {['popup', 'library', 'playlists', 'assistant'].map((item) => (
              <button key={item} onClick={() => setView(item)}>
                {item}
              </button>
            ))}
            <button onClick={() => setDark(!dark)}>Toggle dark mode</button>
            <span className="ml-auto text-xs">
              Sample data · not the installed extension
            </span>
          </nav>
          {view === 'popup' ? (
            <div className="w-[390px] max-w-full bg-white text-ink">
              <PopupApp />
            </div>
          ) : view === 'library' ? (
            <WorkspaceProvider>
              <WorkspacePanel
                courses={sampleCourses}
                onOpenCourse={() => undefined}
                onOpenPlaylist={() => setView('playlists')}
              />
            </WorkspaceProvider>
          ) : view === 'playlists' ? (
            <PlaylistPanel courses={sampleCourses} />
          ) : (
            <AssistantPanel courses={sampleCourses} />
          )}
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
