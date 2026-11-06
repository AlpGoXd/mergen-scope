import { useCallback } from 'react';
import { useFileDispatch } from '../stores/file-store';

/** File-picker filter for data imports (Touchstone .s1p–.s16p, tables, R&S .dat). */
export const DATA_FILE_ACCEPT = ['.csv', '.tsv', '.txt', '.dat', ...Array.from({ length: 16 }, (_, i) => `.s${i + 1}p`)].join(',');

function makeImportId(fileName: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
}

/** The one path from browser File objects into the file store (parse or wizard queue). */
export function useFileImport() {
  const fileDispatch = useFileDispatch();

  return useCallback(async (files: FileList | readonly File[], targetPaneId?: string): Promise<void> => {
    for (const file of Array.from(files)) {
      let rawText: string;
      try {
        rawText = await file.text();
      } catch {
        // e.g. a dropped folder: report it and keep importing the rest of the batch
        fileDispatch({ type: 'REPORT_IMPORT_ERROR', payload: { fileName: file.name, message: 'Could not read this file.' } });
        continue;
      }
      fileDispatch({ type: 'QUEUE_WIZARD', payload: { id: makeImportId(file.name), fileName: file.name, rawText, targetPaneId } });
    }
  }, [fileDispatch]);
}
