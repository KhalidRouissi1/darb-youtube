import { browser } from 'wxt/browser';
import { OPTIONAL_ORIGINS } from './platforms';
import type { VideoPlatform } from '@/types/video';
export async function hasPlatformAccess(
  platform: VideoPlatform,
): Promise<boolean> {
  return (
    platform === 'youtube' ||
    browser.permissions.contains({ origins: OPTIONAL_ORIGINS[platform] })
  );
}
export async function requestPlatformAccess(
  platform: 'x' | 'facebook',
): Promise<boolean> {
  // Must be called directly by a button handler to retain the user gesture.
  return browser.permissions.request({ origins: OPTIONAL_ORIGINS[platform] });
}
export async function removePlatformAccess(
  platform: 'x' | 'facebook',
): Promise<boolean> {
  return browser.permissions.remove({ origins: OPTIONAL_ORIGINS[platform] });
}
