import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// One-time message passed from the previous page, e.g.
//   navigate('/organiser', { state: { flash: 'Event created.' } })
// The message is read once, then removed from browser history so a reload doesn't show it again.
export default function useFlash() {
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState(() => location.state?.flash ?? null);

  useEffect(() => {
    if (location.state?.flash) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location, navigate]);

  return [flash, setFlash];
}
