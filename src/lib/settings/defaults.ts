import type { DarbSettings } from '@/types/settings';

export const DEFAULT_SETTINGS: DarbSettings = {
  defaultSessionLengthMinutes: 30,
  autoPauseAtSessionEnd: true,
  autoMarkSessionsComplete: true,
  showCompletionOverlay: true,
  notificationsEnabled: false,
  darkMode: false,
};
