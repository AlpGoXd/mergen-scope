import { createContext } from 'react';

/** `listCrossings` adds the "V1 crossings" card for a line (App provides it; used by the sidebar row and the chart's context menu). */
export const LineCrossingsContext = createContext<{ listCrossings?: (lineId: number) => void }>({});
