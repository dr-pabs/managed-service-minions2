import { useState, useEffect } from 'react';

export function usePoll(path, intervalMs = 10000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    function fetchNow() {
      fetch(`/api${path}`)
        .then(r => r.ok ? r.json() : Promise.reject(`${r.status} ${r.statusText}`))
        .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    }

    fetchNow();
    const timer = setInterval(fetchNow, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [path, intervalMs]);

  return { data, loading, error };
}
