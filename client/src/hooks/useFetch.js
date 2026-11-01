import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Loads JSON from the API for a page and re-loads whenever `path` changes.
// Returns { data, error, loading, setData, reload }.
//
// Each response is stored together with the request it answered (`key`). That way "loading" is
// simply "the stored response isn't for the current request yet", with no state to reset by hand,
// and a slow old response can never overwrite a newer one.
//
// keepPrevious: show the old data (e.g. the previous page of results) while the next one loads.
export default function useFetch(path, { keepPrevious = false } = {}) {
  const [reloadCount, setReloadCount] = useState(0);
  const key = `${path}#${reloadCount}`;
  const [state, setState] = useState({ key: null, path: null, data: undefined, error: null });

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false; // the page changed or unmounted before the answer came back

    api(path)
      .then((data) => {
        if (!cancelled) setState({ key, path, data, error: null });
      })
      .catch((error) => {
        if (!cancelled)
          setState((s) => ({ key, path, data: s.path === path ? s.data : undefined, error }));
      });

    return () => {
      cancelled = true;
    };
  }, [path, key]);

  // Change the data locally after an action (e.g. mark a booking cancelled) without re-fetching
  const setData = useCallback(
    (update) =>
      setState((s) => ({ ...s, data: typeof update === 'function' ? update(s.data) : update })),
    [],
  );

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  const isCurrent = state.key === key;
  const samePath = state.path === path;
  return {
    data: samePath || keepPrevious ? state.data : undefined,
    error: isCurrent ? state.error : null,
    loading: !isCurrent,
    setData,
    reload,
  };
}
