import { useCallback, useRef, useState } from 'react';

// Runs one request at a time and ignores any repeat while it's still going.
//
// Why a ref AND state: disabling the button with state alone leaves a small gap. The button only
// becomes disabled after React re-renders, so a second submit that lands first (Enter followed
// by a click, a fast double-click on a slow phone) would run the handler again and send a
// duplicate request. A ref changes instantly, so the second call is ignored no matter how
// quickly it comes. The state is only there to show the button as disabled.
//
// Usage:
//   const [busy, runOnce] = useInFlight();
//   const handleSubmit = (e) => { e.preventDefault(); runOnce(async () => { ...await api(...) }); };
//   <Button loading={busy} ...>
export default function useInFlight() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const runOnce = useCallback(async (task) => {
    if (inFlight.current) return undefined; // a request is already running: ignore this one
    inFlight.current = true;
    setBusy(true);
    try {
      return await task();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, runOnce];
}
