import { useEffect, useState } from 'react';

// Current time (ms) that updates every `intervalMs`, so countdowns re-render.
// Pass enabled = false to stop the timer when nothing on screen needs it.
export default function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // catch up straight away after being re-enabled
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs, enabled]);

  return now;
}
