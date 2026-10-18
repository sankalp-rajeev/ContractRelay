'use client';
import { useState } from 'react';
export function CopyButton({ value }: { value: string }) {
  const [message, setMessage] = useState('Copy hash');
  return (
    <button
      className="textButton"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setMessage('Copied');
        } catch {
          setMessage('Select hash to copy');
        }
      }}
    >
      <span aria-live="polite">{message}</span>
    </button>
  );
}
