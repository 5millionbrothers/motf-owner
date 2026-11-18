(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotfOwnerReliability = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const roomKey = room => String(room.name || '').normalize('NFKC').trim().toLowerCase();
  function visibleOfferings(rows, type) {
    const current = rows.filter(row => !row.retired_at);
    if (type !== 'stay') return current;
    const active = new Map();
    current.filter(row => row.is_active !== false).forEach(row => {
      const key = roomKey(row); active.set(key, (active.get(key) || 0) + 1);
    });
    const seen = new Set();
    return current.filter(row => {
      if (row.id && seen.has(row.id)) return false;
      if (row.id) seen.add(row.id);
      // Keep all active rooms and hidden-only rooms. Ignore obsolete inactive copies.
      return row.is_active !== false || active.get(roomKey(row)) !== 1;
    });
  }
  return { visibleOfferings };
});
