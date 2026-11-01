import { useEffect } from 'react';

// Sets the browser tab title, e.g. useTitle('Events') -> "Events · MySeat"
export default function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · MySeat` : 'MySeat';
  }, [title]);
}
