import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { flush, pull, refreshAccount, sessionAtom, store } from './lib/store';

if (store.get(sessionAtom).passcode) void pull().then(refreshAccount);

// Changes save on their own a moment after each edit. Send anything waiting the moment the app
// is hidden or closed, and pick up the other person's changes when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
  else void pull(true);
});
addEventListener('pagehide', flush);
addEventListener('online', flush);
createRoot(document.getElementById('root')!).render(<App />);
