import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Keep the application viewport fixed against accidental browser zoom gestures.
// Native one-finger scrolling and ordinary form interactions remain available.
const rootElement = document.documentElement;
rootElement.style.touchAction = 'pan-x pan-y';
document.body.style.touchAction = 'pan-x pan-y';

const preventGestureZoom = (event: Event) => {
  event.preventDefault();
};

document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
document.addEventListener('gestureend', preventGestureZoom, { passive: false });

document.addEventListener(
  'touchmove',
  (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault();
  },
  { passive: false },
);

document.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  },
  { passive: false },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
