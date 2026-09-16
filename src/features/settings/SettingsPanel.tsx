import { useEffect, useState } from 'react';
import { Bell, Moon, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { browser } from 'wxt/browser';
import {
  getSettings,
} from '@/lib/storage/repository';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';
import type { DarbSettings } from '@/types/settings';

interface SettingsPanelProps {
  onReset: () => Promise<void>;
}

export function SettingsPanel({ onReset }: SettingsPanelProps) {
  const [settings, setSettings] =
    useState<DarbSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void getSettings()
      .then((stored) => {
        setSettings(stored);
        document.documentElement.classList.toggle('dark', stored.darkMode);
      })
      .catch(() => setMessage('Unable to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = async <Key extends keyof DarbSettings>(
    key: Key,
    value: DarbSettings[Key],
  ) => {
    setMessage(null);

    if (key === 'notificationsEnabled' && value === true) {
      const granted = await browser.permissions.request({
        permissions: ['notifications'],
      });

      if (!granted) {
        setMessage('Notification permission was not granted.');
        return;
      }
    }

    const updated = {
      ...settings,
      [key]: value,
    };

    try {
      const response = await browser.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: updated });
      if (!response?.ok) throw new Error(response?.error ?? 'Unable to save settings.');
      setSettings(updated);

      if (key === 'darkMode') {
        document.documentElement.classList.toggle('dark', value === true);
      }

      setMessage('Settings saved.');
    } catch {
      setMessage('Unable to save settings.');
    }
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    try {
      const response = await browser.runtime.sendMessage({ type: 'RESET_DATA' });
      if (!response?.ok) throw new Error(response?.error ?? 'Unable to reset local data.');
      setSettings(DEFAULT_SETTINGS);
      document.documentElement.classList.remove('dark');
      setConfirmReset(false);
      setMessage('All local Darb data was reset.');
      await onReset();
    } catch {
      setMessage('Unable to reset local data.');
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#e5e5eb] bg-white p-6 text-sm text-muted dark:border-white/10 dark:bg-[#202028]">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-[820px]">
      <div>
        <p className="text-xs font-semibold text-brand-600">Preferences</p>
        <h1 className="mt-2 text-[32px] font-bold tracking-[-0.045em] text-ink dark:text-white">
          Settings
        </h1>
        <p className="mt-2 text-sm text-muted dark:text-white/45">
          Choose how Darb structures and tracks your learning sessions.
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-[20px] border border-[#e5e5eb] bg-white dark:border-white/10 dark:bg-[#202028]">
        <SettingRow
          description="Used when you create a new course."
          icon={<Save size={16} />}
          title="Default session length"
        >
          <select
            className="h-10 rounded-xl border border-[#e4e4ea] bg-white px-3 text-xs font-semibold text-ink dark:border-white/10 dark:bg-[#292932] dark:text-white"
            onChange={(event) =>
              void updateSetting(
                'defaultSessionLengthMinutes',
                Number(event.target.value),
              )
            }
            value={settings.defaultSessionLengthMinutes}
          >
            {[15, 20, 30, 45, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          description="Stop YouTube when the current learning block ends."
          icon={<ShieldCheck size={16} />}
          title="Pause at session end"
        >
          <Toggle
            checked={settings.autoPauseAtSessionEnd}
            label="Pause at session end"
            onChange={(checked) =>
              void updateSetting('autoPauseAtSessionEnd', checked)
            }
          />
        </SettingRow>

        <SettingRow
          description="Advance progress automatically when playback reaches the end."
          icon={<ShieldCheck size={16} />}
          title="Mark sessions complete"
        >
          <Toggle
            checked={settings.autoMarkSessionsComplete}
            label="Mark sessions complete automatically"
            onChange={(checked) =>
              void updateSetting('autoMarkSessionsComplete', checked)
            }
          />
        </SettingRow>

        <SettingRow
          description="Show course progress over the YouTube page after a session."
          icon={<ShieldCheck size={16} />}
          title="Completion overlay"
        >
          <Toggle
            checked={settings.showCompletionOverlay}
            label="Show completion overlay"
            onChange={(checked) =>
              void updateSetting('showCompletionOverlay', checked)
            }
          />
        </SettingRow>

        <SettingRow
          description="Receive a browser notification after completing a session."
          icon={<Bell size={16} />}
          title="Notifications"
        >
          <Toggle
            checked={settings.notificationsEnabled}
            label="Enable notifications"
            onChange={(checked) =>
              void updateSetting('notificationsEnabled', checked)
            }
          />
        </SettingRow>

        <SettingRow
          description="Use Darb's darker interface."
          icon={<Moon size={16} />}
          title="Dark mode"
        >
          <Toggle
            checked={settings.darkMode}
            label="Enable dark mode"
            onChange={(checked) => void updateSetting('darkMode', checked)}
          />
        </SettingRow>
      </section>

      <section className="mt-6 rounded-[20px] border border-red-200 bg-white p-5 dark:border-red-900/50 dark:bg-[#202028]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-ink dark:text-white">
              Reset all local data
            </h2>
            <p className="mt-1 text-[11px] text-muted dark:text-white/45">
              Permanently removes every course, session, and setting.
            </p>
          </div>
          <button
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold ${
              confirmReset
                ? 'bg-red-600 text-white'
                : 'border border-red-200 text-red-600 hover:bg-red-50'
            }`}
            onClick={() => void handleReset()}
            type="button"
          >
            <RotateCcw size={14} />
            {confirmReset ? 'Confirm reset' : 'Reset data'}
          </button>
        </div>
        {confirmReset && (
          <button
            className="mt-3 text-[11px] font-semibold text-muted"
            onClick={() => setConfirmReset(false)}
            type="button"
          >
            Cancel
          </button>
        )}
      </section>

      {message && (
        <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-100">
          {message}
        </p>
      )}
    </div>
  );
}

function SettingRow({
  children,
  description,
  icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-[#ececf1] px-5 py-5 last:border-0 sm:flex-row sm:items-center dark:border-white/8">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-100">
          {icon}
        </div>
        <div>
          <h2 className="text-xs font-semibold text-ink dark:text-white">
            {title}
          </h2>
          <p className="mt-1 text-[11px] leading-4 text-muted dark:text-white/45">
            {description}
          </p>
        </div>
      </div>
      <div className="pl-12 sm:pl-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative h-6 w-11 rounded-full transition ${
        checked ? 'bg-brand-500' : 'bg-[#d7d7df] dark:bg-white/15'
      }`}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
