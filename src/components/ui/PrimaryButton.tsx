import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
}

export function PrimaryButton({
  children,
  className = '',
  icon,
  type = 'button',
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(241,90,36,0.2)] transition hover:bg-brand-600 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      type={type}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
