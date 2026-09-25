import './theme.css';
import { useRoute } from './router';
import { LibraryView } from '../views/library/LibraryView';

export default function App() {
  const route = useRoute();
  if (route.name === 'reader') return <div className="screen"><p>reader: {route.bookId}</p></div>;
  return <LibraryView />;
}
