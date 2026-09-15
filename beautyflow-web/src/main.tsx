import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design-tokens/tokens.css';
import './store/theme'; // aplica el tema guardado (dark por defecto) apenas carga
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
