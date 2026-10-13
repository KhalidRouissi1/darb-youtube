import { useEffect, useState } from 'react';
export function VideoThumbnail({
  src,
  className,
}: {
  src?: string | undefined;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed)
    return (
      <div
        aria-label="Video thumbnail unavailable"
        className={`${className ?? ''} flex items-center justify-center bg-brand-50 text-brand-600`}
      >
        <span aria-hidden="true">▶</span>
      </div>
    );
  return (
    <img
      alt=""
      className={className}
      src={src}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
