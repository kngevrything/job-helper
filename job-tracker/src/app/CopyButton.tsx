"use client";

import { useState } from "react";

type CopyButtonProps = {
  value: string;
  label: string;
  copiedLabel?: string;
  className?: string;
};

export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;

    await navigator.clipboard.writeText(value);

    setCopied(true);

    window.setTimeout(() => {
      setCopied(false);
    }, 3000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}