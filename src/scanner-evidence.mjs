// Mapping follows the existing transformations without altering their output text.
export function mapText(text, inputMap, transform) {
  const ranges = [];
  const emit = (start, end) => {
    const last = ranges.at(-1);
    if (last && last[1] === start) last[1] = end;
    else ranges.push([start, end]);
  };
  const output = transform(text, emit);
  const map = new Uint32Array(output.length);
  let cursor = 0;
  for (const [start, end] of ranges)
    for (let i = start; i < end; i++) map[cursor++] = inputMap ? inputMap[i] : i;
  if (cursor !== output.length) throw new Error("Evidence source mapping length mismatch");
  return { text: output, map };
}

export function removeMapped(text, map, pattern) {
  return mapText(text, map, (source, emit) => {
    let end = 0;
    const chunks = [];
    for (const match of source.matchAll(pattern)) {
      chunks.push(source.slice(end, match.index));
      emit(end, match.index);
      end = match.index + match[0].length;
    }
    chunks.push(source.slice(end));
    emit(end, source.length);
    return chunks.join("");
  });
}

export function createEvidenceCollector() {
  const locations = new Map();
  let truncated = false;
  return {
    forFile(file, text) {
      const starts = [0];
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "\r") {
          if (text[i + 1] === "\n") i++;
          starts.push(i + 1);
        } else if (text[i] === "\n" || text[i] === "\u2028" || text[i] === "\u2029") starts.push(i + 1);
      }
      return (kind, signal, map, index) => {
        let line = null, column = null;
        if (map && index >= 0 && index < map.length) {
          const offset = map[index];
          let low = 0, high = starts.length;
          while (low + 1 < high) {
            const mid = (low + high) >>> 1;
            if (starts[mid] <= offset) low = mid;
            else high = mid;
          }
          line = low + 1;
          column = offset - starts[low] + 1;
        }
        const location = { file, line, column, kind, signal };
        const key = JSON.stringify(location);
        if (locations.has(key)) return;
        if (locations.size === 20000) { truncated = true; return; }
        locations.set(key, location);
      };
    },
    result() {
      const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
      return { locations: [...locations.values()].sort((a, b) =>
        compare(a.file, b.file) || compare(a.line, b.line) || compare(a.column, b.column) ||
        compare(a.kind, b.kind) || compare(a.signal, b.signal)), truncated };
    },
  };
}
