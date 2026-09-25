import './theme.css';
import { useRoute } from './router';
import { LibraryView } from '../views/library/LibraryView';
import { ReaderView } from '../views/reader/ReaderView';
import { TtsLabView } from '../views/lab/TtsLabView';

export default function App() {
  const route = useRoute();
  if (route.name === 'ttsLab') return <TtsLabView />;
  if (route.name === 'reader') return <ReaderView key={route.bookId} bookId={route.bookId} />;
  return <LibraryView />;
}
