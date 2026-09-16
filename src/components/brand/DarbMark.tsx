interface DarbMarkProps {
  className?: string;
}

export function DarbMark({ className = 'size-9' }: DarbMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 40 40"
    >
      <rect fill="#F15A24" height="40" rx="9" width="40" />
      <path
        d="M10 8h9.2C26.3 8 32 13.7 32 20.8S26.3 33.6 19.2 33.6H10V8Zm8 7.1v11.4h1.2a5.7 5.7 0 1 0 0-11.4H18Z"
        fill="white"
        fillRule="evenodd"
      />
      <path
        d="M8.5 28.5h8.2"
        stroke="#F15A24"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}
