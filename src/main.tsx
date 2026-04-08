import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreRoot } from './stores/StoreRoot';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreRoot>
      <App />
    </StoreRoot>
  </StrictMode>
);
