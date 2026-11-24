// Which objects a visitor has found. Persists in localStorage when it can,
// and quietly falls back to memory (private windows, blocked storage).
import { OBJECTS } from './objects.js';

const KEY = 'tim-room-found';
export const OBJECT_IDS = OBJECTS.map((o) => o.id);

export function createFoundState(storage) {
  let found = new Set();
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || '[]');
    if (Array.isArray(saved)) found = new Set(saved.filter((id) => OBJECT_IDS.includes(id)));
  } catch { /* storage unavailable or corrupt: start fresh */ }

  const save = () => { try { storage?.setItem(KEY, JSON.stringify([...found])); } catch { /* ignore */ } };

  return {
    markFound(id) {
      if (!OBJECT_IDS.includes(id) || found.has(id)) return false;
      found.add(id);
      save();
      return true;
    },
    isFound: (id) => found.has(id),
    count: () => found.size,
    allFound: () => OBJECT_IDS.every((id) => found.has(id)),
  };
}
