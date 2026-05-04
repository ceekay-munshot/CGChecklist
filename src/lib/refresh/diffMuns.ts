import { parseMunsResponse } from "@/lib/munsParse";

export interface MunsDiff {
  sectionsAdded: string[];
  sectionsRemoved: string[];
  sectionsUpdated: string[];
  sectionsUnchanged: string[];
  rowsChanged: number;
  isFirstLoad: boolean;
}

export function diffMuns(prev: string, next: string): MunsDiff {
  if (!next) {
    return {
      sectionsAdded: [],
      sectionsRemoved: [],
      sectionsUpdated: [],
      sectionsUnchanged: [],
      rowsChanged: 0,
      isFirstLoad: !prev,
    };
  }

  const newTables = parseMunsResponse(next).tables;

  if (!prev) {
    return {
      sectionsAdded: newTables.map((t) => t.title),
      sectionsRemoved: [],
      sectionsUpdated: [],
      sectionsUnchanged: [],
      rowsChanged: newTables.reduce((acc, t) => acc + t.rows.length, 0),
      isFirstLoad: true,
    };
  }

  const oldTables = parseMunsResponse(prev).tables;
  const oldByTitle = new Map(oldTables.map((t) => [t.title, t]));
  const newByTitle = new Map(newTables.map((t) => [t.title, t]));

  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  let rowsChanged = 0;

  for (const [title, t] of newByTitle) {
    const old = oldByTitle.get(title);
    if (!old) {
      added.push(title);
      rowsChanged += t.rows.length;
      continue;
    }
    const oldRowsStr = JSON.stringify(old.rows);
    const newRowsStr = JSON.stringify(t.rows);
    if (oldRowsStr === newRowsStr) {
      unchanged.push(title);
    } else {
      updated.push(title);
      const maxLen = Math.max(old.rows.length, t.rows.length);
      for (let i = 0; i < maxLen; i++) {
        const a = JSON.stringify(old.rows[i] ?? {});
        const b = JSON.stringify(t.rows[i] ?? {});
        if (a !== b) rowsChanged += 1;
      }
    }
  }

  const removed: string[] = [];
  for (const title of oldByTitle.keys()) {
    if (!newByTitle.has(title)) removed.push(title);
  }

  return {
    sectionsAdded: added,
    sectionsRemoved: removed,
    sectionsUpdated: updated,
    sectionsUnchanged: unchanged,
    rowsChanged,
    isFirstLoad: false,
  };
}
