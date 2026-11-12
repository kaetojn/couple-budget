import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { pull, sessionAtom, store } from './lib/store';

if (store.get(sessionAtom).passcode) void pull();
createRoot(document.getElementById('root')!).render(<App />);
