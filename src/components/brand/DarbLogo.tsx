import { DarbMark } from './DarbMark';

interface DarbLogoProps {
  compact?: boolean;
  inverse?: boolean;
}

export function DarbLogo({
  compact = false,
  inverse = false,
}: DarbLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <DarbMark className="size-9 shrink-0" />
      {!compact && (
        <>
          <span
            className={`text-[18px] font-bold tracking-[-0.03em] ${
              inverse ? 'text-white' : 'text-ink'
            }`}
          >
            Darb
          </span>
          <span
            className={`font-arabic text-[15px] font-bold ${
              inverse ? 'text-white/65' : 'text-brand-600'
            }`}
            lang="ar"
          >
            درب
          </span>
        </>
      )}
    </div>
  );
}
