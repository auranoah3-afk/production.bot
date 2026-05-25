export function pruneMapByTimestamp(map, {
  maxEntries,
  pruneCount = Math.max(1, Math.ceil(Number(maxEntries) * 0.1)),
  timestampSelector = (value) => value?.updatedAt ?? 0
} = {}) {
  if (!(map instanceof Map)) throw new TypeError('Expected a Map to prune.');
  const cleanMaxEntries = positiveInteger(maxEntries, 'maxEntries');
  if (map.size <= cleanMaxEntries) return [];

  const cleanPruneCount = Math.min(map.size, positiveInteger(pruneCount, 'pruneCount'));
  const removedKeys = [...map.entries()]
    .sort((left, right) => timestampSelector(left[1], left[0]) - timestampSelector(right[1], right[0]))
    .slice(0, cleanPruneCount)
    .map(([key]) => key);

  for (const key of removedKeys) {
    map.delete(key);
  }

  return removedKeys;
}

export function newestObjectEntriesByTimestamp(object, {
  limit,
  timestampSelector = (value) => value?.updatedAt ?? 0
} = {}) {
  const cleanLimit = positiveInteger(limit, 'limit');
  return Object.entries(object ?? {})
    .sort((left, right) => timestampSelector(right[1], right[0]) - timestampSelector(left[1], left[0]))
    .slice(0, cleanLimit);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
  return number;
}
