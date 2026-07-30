import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/playfair-display';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/noto-serif-kr';
import '@fontsource-variable/noto-sans-jp';
import '@fontsource/shippori-mincho/400.css';
import '@fontsource/shippori-mincho/700.css';
import './index.css';
import './i18n';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('IFEX root element was not found.');

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
