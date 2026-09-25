import { useEffect, useState } from 'react';

export type Route = { name: 'library' } | { name: 'reader'; bookId: string };

export function parseHash(hash: string): Route {
  const m = /^#\/book\/([^/]+)$/.exec(hash);
  return m ? { name: 'reader', bookId: decodeURIComponent(m[1]) } : { name: 'library' };
}
export function toHash(route: Route): string {
  return route.name === 'reader' ? `#/book/${encodeURIComponent(route.bookId)}` : '#/';
}
export function navigate(route: Route) {
  location.hash = toHash(route);
}
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
