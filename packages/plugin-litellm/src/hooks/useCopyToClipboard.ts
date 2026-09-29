import { useState, useEffect, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { alertApiRef } from '@backstage/core-plugin-api';

/**
 * Pure helper: determine if the Clipboard API is available.
 */
export function isClipboardApiAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
}

/**
 * Pure helper: fallback copy via textarea and document.execCommand.
 * Returns true if successful, false otherwise.
 */
export function fallbackCopyToClipboard(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    document.body.removeChild(textarea);
    return false;
  }
}

/**
 * Pure helper: create a timer for the copied state.
 * Returns the timer ID so the caller can manage cleanup.
 */
export function startCopiedTimer(
  onCopiedChange: (copied: boolean) => void,
  durationMs: number = 2000,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    onCopiedChange(false);
  }, durationMs);
}

/**
 * Hook: copy text to clipboard with visual feedback.
 *
 * @returns {copy, copied, error} - async copy function, copied state, and error if any
 *
 * - `copy(text)`: async function that copies text and returns true if successful
 * - `copied`: true for 2s after successful copy, then resets
 * - `error`: error object if copy failed; shows via alertApi
 *
 * Uses navigator.clipboard.writeText with fallback to textarea + execCommand.
 */
export function useCopyToClipboard(): {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  error: Error | null;
} {
  const alertApi = useApi(alertApiRef);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copy = async (text: string): Promise<boolean> => {
    // Clear any existing timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setError(null);

    try {
      if (isClipboardApiAvailable()) {
        await navigator.clipboard.writeText(text);
      } else {
        const success = fallbackCopyToClipboard(text);
        if (!success) {
          throw new Error('Clipboard copy failed');
        }
      }
      setCopied(true);
      timerRef.current = startCopiedTimer(setCopied, 2000);
      return true;
    } catch (err) {
      const copyError = err instanceof Error ? err : new Error('Copy to clipboard failed');
      setError(copyError);
      alertApi.post({
        message: 'Could not copy to clipboard',
        severity: 'error',
      });
      return false;
    }
  };

  return { copy, copied, error };
}
