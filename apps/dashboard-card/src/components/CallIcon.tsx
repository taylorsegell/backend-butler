/** Small, self-contained call controls; independent of HA's asynchronous icon loader. */
const paths: Record<string, string[]> = {
  microphone: ['M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V6Z', 'M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6'],
  send: ['M12 19V5m-6 6 6-6 6 6'], pause: ['M9 5v14m6-14v14'], close: ['m6 6 12 12M18 6 6 18'],
  interrupt: ['M6 6h12v12H6Z'],
  sound: ['m11 5-5 4H3v6h3l5 4V5Z', 'M15 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12'],
  muted: ['m11 5-5 4H3v6h3l5 4V5Z', 'm16 9 5 6m0-6-5 6'],
  transcript: ['M5 5h14v11H9l-4 4V5Z', 'M9 9h6m-6 3h4'], live: ['M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4'],
  end: ['M4 13c4-5 12-5 16 0v4h-5v-4a10 10 0 0 0-6 0v4H4v-4Z'],
  history: ['M4 8V4m0 4h4M4.5 7a8 8 0 1 1-.3 9M12 7v5l3 2'],
  settings: ['M4 7h9m4 0h3M4 17h3m4 0h9', 'M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  upcoming: ['M4 5h16v15H4V5Zm0 5h16M8 3v4m8-4v4M8 14h3m-3 3h6'],
};
export function CallIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {(paths[name] ?? paths.microphone).map((d, i) => <path key={i} d={d} />)}
  </svg>;
}
