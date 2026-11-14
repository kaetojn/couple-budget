import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { flush, pull, refreshAccount, sessionAtom, store } from './lib/store';
import { checkForUpdate } from './lib/update';

if (store.get(sessionAtom).passcode) void pull().then(refreshAccount);

// Changes save on their own a moment after each edit. Send anything waiting the moment the app
// is hidden or closed, and pick up the other person's changes when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
  else { void pull(true); void checkForUpdate(); }
});

setInterval(() => { if (document.visibilityState === 'visible') void checkForUpdate(); }, 30 * 60 * 1000);
addEventListener('pagehide', flush);
addEventListener('online', flush);
void checkForUpdate();
createRoot(document.getElementById('root')!).render(<App />);
