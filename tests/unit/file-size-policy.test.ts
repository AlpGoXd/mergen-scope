import { expect, it } from 'vitest';
import { warnLargeFileText } from '../../src/domain/confirm-text';
import { classifyFileSize, formatFileSize, refuseLargeFileMessage, REFUSE_BYTES, WARN_BYTES } from '../../src/domain/file-size-policy';

it('uses binary megabytes for the warning and refusal thresholds', () => {
  expect(WARN_BYTES).toBe(52_428_800);
  expect(REFUSE_BYTES).toBe(524_288_000);
});

it.each([
  [0, 'ok'],
  [WARN_BYTES - 1, 'ok'],
  [WARN_BYTES, 'ok'],
  [WARN_BYTES + 1, 'warn'],
  [REFUSE_BYTES - 1, 'warn'],
  [REFUSE_BYTES, 'warn'],
  [REFUSE_BYTES + 1, 'refuse'],
] as const)('classifies %i bytes as %s', (bytes, expected) => {
  expect(classifyFileSize(bytes)).toBe(expected);
});

it('formats sizes and shows over-limit files as over the limit', () => {
  expect(formatFileSize(WARN_BYTES)).toBe('50 MB');
  expect(formatFileSize(WARN_BYTES + 1)).toBe('50.1 MB');
  expect(formatFileSize(REFUSE_BYTES)).toBe('500 MB');
  expect(formatFileSize(REFUSE_BYTES + 1)).toBe('500.1 MB');
});

it('keeps the large-file refusal message verbatim', () => {
  expect(refuseLargeFileMessage(REFUSE_BYTES + 1)).toBe("File size is 500.1 MB. Files over 500 MB can't be opened in the browser.");
});

it('keeps the large-file warning dialog text verbatim', () => {
  expect(warnLargeFileText('capture.csv', WARN_BYTES + 1)).toEqual({
    title: 'Open large file?',
    message: 'capture.csv is 50.1 MB. Large files can make the app slow. Open it anyway?',
    confirmLabel: 'Open anyway',
  });
});
