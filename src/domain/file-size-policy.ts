// File sizes use 1 MB = 1024 * 1024 bytes.
const BYTES_PER_MB = 1024 * 1024;
export const WARN_BYTES = 50 * BYTES_PER_MB;
export const REFUSE_BYTES = 500 * BYTES_PER_MB;

export function classifyFileSize(bytes: number): 'ok' | 'warn' | 'refuse' {
  if (bytes > REFUSE_BYTES) return 'refuse';
  if (bytes > WARN_BYTES) return 'warn';
  return 'ok';
}

export function formatFileSize(bytes: number): string {
  const mb = bytes / BYTES_PER_MB;
  // Round up to a tenth so a file just over a limit displays as over it.
  return `${Math.ceil(mb * 10) / 10} MB`;
}
