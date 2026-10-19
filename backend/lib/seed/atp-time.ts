/** Parse ATP timetable cells like `7-15`, `14-36`, `---`, `6-36 Полимир`. */
export function parseAtpTime(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "---" || trimmed === "-") return null;
  const match = /^(\d{1,2})-(\d{2})\b/.exec(trimmed);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timesFromColumn(rows: readonly (readonly string[])[], column: number): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const value = row[column];
    if (value === undefined) continue;
    const time = parseAtpTime(value);
    if (time) out.push(time);
  }
  return out;
}

export function timesFromColumns(rows: readonly (readonly string[])[], ...columns: number[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const column of columns) {
      const value = row[column];
      if (value === undefined) continue;
      const time = parseAtpTime(value);
      if (time) out.push(time);
    }
  }
  return out;
}
