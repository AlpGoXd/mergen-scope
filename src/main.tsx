import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreRoot } from './stores/StoreRoot';
import './index.css';
import { applyAppSize, readStoredAppSize } from './components/settings/app-size';

applyAppSize(readStoredAppSize());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreRoot>
      <App />
    </StoreRoot>
  </StrictMode>
);
