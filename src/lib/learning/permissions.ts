/** Live assistant access sends selected data outside the browser sandbox. */
export function assistantPermissions() {
  return {
    permissions: ['nativeMessaging' as const],
    ...(import.meta.env.FIREFOX
      ? {
          data_collection: [
            'browsingActivity' as const,
            'websiteActivity' as const,
            'websiteContent' as const,
          ],
        }
      : {}),
  };
}
