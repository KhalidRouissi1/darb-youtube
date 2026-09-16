export function observeYouTubeNavigation(
  onNavigate: () => void | Promise<void>,
): () => void {
  let lastUrl = window.location.href;

  const detectChange = () => {
    if (window.location.href === lastUrl) {
      return;
    }

    lastUrl = window.location.href;
    void onNavigate();
  };

  const handleYouTubeNavigate = () => {
    lastUrl = window.location.href;
    void onNavigate();
  };

  const observer = new MutationObserver(detectChange);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const interval = window.setInterval(detectChange, 1000);
  window.addEventListener('popstate', detectChange);
  document.addEventListener('yt-navigate-finish', handleYouTubeNavigate);

  return () => {
    observer.disconnect();
    window.clearInterval(interval);
    window.removeEventListener('popstate', detectChange);
    document.removeEventListener('yt-navigate-finish', handleYouTubeNavigate);
  };
}
