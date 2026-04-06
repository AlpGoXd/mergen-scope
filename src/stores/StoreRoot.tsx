import React from 'react';
import { UiStoreProvider } from './ui-store';
import { AnalysisStoreProvider } from './analysis-store';
import { MarkerStoreProvider } from './marker-store';
import { RefLineStoreProvider } from './ref-line-store';
import { FileStoreProvider } from './file-store';
import { TraceStoreProvider } from './trace-store';
import { PaneStoreProvider } from './pane-store';

export function StoreRoot({ children }: { children: React.ReactNode }) {
  return (
    <UiStoreProvider>
      <AnalysisStoreProvider>
        <MarkerStoreProvider>
          <RefLineStoreProvider>
            {/* FileStore is the source of truth for parsed models */}
            <FileStoreProvider>
              {/* TraceStore depends on FileStore to derive allTraces */}
              <TraceStoreProvider>
                {/* PaneStore depends on TraceStore to normalize assignments */}
                <PaneStoreProvider>
                  {children}
                </PaneStoreProvider>
              </TraceStoreProvider>
            </FileStoreProvider>
          </RefLineStoreProvider>
        </MarkerStoreProvider>
      </AnalysisStoreProvider>
    </UiStoreProvider>
  );
}
