import { useState, useEffect } from 'react';

export function useStream(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const es = new EventSource(`/api${path}`);
    es.onmessage = e => {
      try { setData(JSON.parse(e.data)); } catch { /* ignore malformed frames */ }
    };
    es.onerror = () => setError('SSE connection lost — reconnecting…');
    return () => es.close();
  }, [path]);

  return { data, error };
}
