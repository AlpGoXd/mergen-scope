import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreRoot } from './stores/StoreRoot';
import './index.css';
import './text-roles.css';
import './components/panes/pane-types.css';
import { applyAppSize } from './components/settings/app-size';
import { applyAppNeutral, readAppPreferences } from './components/settings/app-preferences';

const preferences = readAppPreferences();
applyAppSize(preferences.size);
applyAppNeutral(preferences.neutral);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreRoot>
      <App />
    </StoreRoot>
  </StrictMode>
);
