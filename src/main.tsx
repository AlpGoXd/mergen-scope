import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreRoot } from './stores/StoreRoot';
import './index.css';
import './text-roles.css';
import './components/panes/pane-types.css';
import { applyAppSize } from './components/settings/app-size';
import { readExportDocumentPreferences } from './components/chart/export/export-theme-storage';
import { applyAppAppearance, readAppPreferences } from './components/settings/app-preferences';

readExportDocumentPreferences(); // Migrate the old theme before any App settings writes.
const preferences = readAppPreferences();
applyAppSize(preferences.size);
applyAppAppearance(preferences);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreRoot>
      <App />
    </StoreRoot>
  </StrictMode>
);
