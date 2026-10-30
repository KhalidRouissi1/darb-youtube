import { useEffect, useRef } from 'react';
export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLFormElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const form = ref.current;
    const controls = () =>
      Array.from(
        form?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) ?? [],
      );
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key === 'Tab') {
        const list = controls();
        if (!list.length) return;
        const first = list[0]!;
        const last = list.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    form?.addEventListener('keydown', key);
    return () => {
      form?.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return ref;
}
