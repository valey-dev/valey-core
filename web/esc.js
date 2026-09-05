// One escaping for everything that goes into innerHTML.
//
// Until 3 September 2026 there were three copies — ui.js, title.js, the radio —
// and all three replaced only `<` and `&`. For text between tags that is
// enough, for an attribute it is not: a file name with a quote in it closed
// `title="…"` and appended an `onerror` of its own. And file names come from an
// agent's tool call, project names from its cwd, place labels from the geocoder:
// all of it is somebody else's text, and the panels put it into the markup as it
// was. Five characters close both text and an attribute in quotes of any kind;
// choosing where a string will end up is no longer needed.
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
