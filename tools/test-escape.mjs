// node tools/test-escape.mjs — foreign text in the panels stays text.
//
// File names come from an agent's tool calls, project names from its cwd, the
// branch from the transcript, place labels from the geocoder, error text from
// the server. The review on 3 September 2026 found a dozen places where all of
// that went into innerHTML as it was, or through an esc that knew only `<` and
// `&`. The stand feeds the panels one and the same hostile string and looks for
// a tag or a handler left in the markup. The DOM is a stand-in, as in the
// keyboard stands: what is checked is the string the panel would put into the
// document.
import { fileHeaders, fileType } from '../server/files.js';
import { esc } from '../web/esc.js';
import { node, installDom } from './lib/dom.mjs';

let bad = 0;
const ok = (name, cond, got) => {
  if (cond) console.log('ok    |', name);
  else { bad += 1; console.log('FAIL  |', name, '→', typeof got === 'string' ? got.slice(0, 200) : JSON.stringify(got)); }
};

// ------------------------------------------------------------- the function itself
ok('esc closes all five characters', esc(`<>&"'`) === '&lt;&gt;&amp;&quot;&#39;', esc(`<>&"'`));
ok('esc survives undefined and numbers', esc(undefined) === '' && esc(0) === '0', [esc(undefined), esc(0)]);

// -------------------------------------------------------- the file headers
ok('html from /api/file - attachment, not page', fileHeaders('/x/a.html')['content-disposition'] === 'attachment', fileHeaders('/x/a.html'));
ok('svg - too: it executes scripts', fileHeaders('/x/a.SVG')['content-disposition'] === 'attachment', fileHeaders('/x/a.SVG'));
ok('png - no, the picture is shown as is', !fileHeaders('/x/a.png')['content-disposition'], fileHeaders('/x/a.png'));
ok('nosniff on everything', ['/a.png', '/a.html', '/a.weird'].every((p) => fileHeaders(p)['x-content-type-options'] === 'nosniff'), null);
ok('unknown extension - text', fileType('/a.weird').startsWith('text/plain'), fileType('/a.weird'));

// --------------------------------------------------------------- the panels
// A string that closes an attribute in double quotes, opens a tag and hangs a
// handler — everything a panel could execute.
const EVIL = `"><img src=x onerror=alert(1)><script>alert(2)</script>'`;
// We look at real tags rather than substrings: escaped text still contains the
// letters "onerror=", and the first version of this check caught itself. A tag
// is what starts with an unescaped "<"; it must hold neither a script nor an on*=
// handler. Our own picture on the board is a legitimate tag.
// Attribute values in quotes are cut out before the check: escaped text inside
// title="…" also contains "onerror=", but it cannot close the quote — which is
// the whole point of escaping. A handler counts as real only if it stands in a
// tag outside quotes.
const tags = (html) => html.match(/<[a-zA-Z][^>]*>/g) || [];
const bare = (t) => t.replace(/"[^"]*"|'[^']*'/g, '""');
const clean = (html) => !tags(html).some((t) => /^<script\b/i.test(t) || /\son\w+\s*=/i.test(bare(t)))
  && /&lt;script/.test(html);

const panels = {};
for (const id of ['hud', 'dialog', 'viewer', 'roster', 'bag', 'toasts', 'sky', 'skin', 'lift', 'invite', 'notes']) panels[id] = node();
installDom({ byId: panels, location: {} });

const UI = await import('../web/ui.js');

const look = { skin: '#e8ad7e', hair: '#3a2a20', shirt: '#c25a4b', pants: '#3f4a63', boots: '#2a2118',
  style: 0, tall: 0, face: 'none', head: 'none', glasses: false, hands: 'none', name: 'ТЫ' };
const agent = {
  id: 'a1', name: EVIL, project: EVIL, branch: EVIL, title: EVIL, roleKey: EVIL, status: 'awaiting',
  lastSaid: EVIL, idleFor: 60, saidLen: 4, activity: EVIL, act: { key: 'edit', arg: EVIL },
  files: [{ path: '/tmp/' + EVIL, name: EVIL, image: false }],
  outbox: [{ id: 1, agentId: 'a1', at: 0, state: 'failed', text: EVIL, error: EVIL, blocked: true, reply: EVIL }],
};
const S = {
  agents: [agent], looks: new Map([['a1', look]]), settings: { weather: { enabled: false, label: EVIL }, delivery: { mode: 'default' } },
  delivery: { available: false, hint: EVIL }, visited: new Set(), me: look,
  currentRoom: { title: EVIL }, weather: { kind: 'clear', label: EVIL, source: EVIL, temp: 20 },
  zoom: { dev: 1, auto: true }, soundOn: false, access: {}, owner: true,
  focus: agent, page: 'talk', notice: EVIL,
};
UI.initUI(S, { guideTo: () => {}, saveMe: () => {}, geocode: async () => ({ results: [] }), saveSettings: async () => ({}) });

UI.renderHud();
ok('HUD: room and location - text', clean(panels.hud.innerHTML), panels.hud.innerHTML);

UI.renderDialog();
ok('card, “talk”: name, project, branch, role - text', clean(panels.dialog.innerHTML), panels.dialog.innerHTML);
S.page = 'work'; UI.renderDialog();
ok('card, “show work”: file name - text', clean(panels.dialog.innerHTML), panels.dialog.innerHTML);
S.page = 'task'; UI.renderDialog();
ok('card, “give a task”: note, answer, error, hint - text', clean(panels.dialog.innerHTML), panels.dialog.innerHTML);

UI.renderRoster();
ok('planning meeting: team, name and task - text', clean(panels.roster.innerHTML), panels.roster.innerHTML);

UI.renderSky([{ lat: 1, lon: 2, label: EVIL, detail: EVIL }]);
ok('window to the world: location and geocoder results - text', clean(panels.sky.innerHTML), panels.sky.innerHTML);

UI.openGallery([{ path: '/tmp/' + EVIL, name: EVIL, image: true, agent: { name: EVIL, project: EVIL } }], EVIL);
ok('board: signatures - text', clean(panels.viewer.innerHTML), panels.viewer.innerHTML);
ok('board: the image does not have a built-in onerror - the handler is added by code',
  !tags(panels.viewer.innerHTML).some((t) => /onerror/i.test(bare(t))), panels.viewer.innerHTML);

console.log(bad ? `\nFAILED: ${bad}` : '\nall good');
process.exit(bad ? 1 : 0);
