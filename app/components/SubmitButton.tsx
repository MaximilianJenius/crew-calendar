"use client";

import { useFormStatus } from "react-dom";

/** Submit button that disables itself while the form's server action runs, and can ask first. */
export function SubmitButton({
  children,
  pending: pendingText = "Saving…",
  confirm: confirmText,
  className,
  style,
}: {
  children: React.ReactNode;
  pending?: string;
  confirm?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      style={style}
      disabled={pending}
      aria-disabled={pending}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
