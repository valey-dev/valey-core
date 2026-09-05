// Who this page is, in the only form the server reads: request headers.
//
// The office answers three kinds of caller — the owner, an invited guest, and
// nobody — and it tells them apart by `x-valey-owner` / `x-valey-guest`. main.js
// holds the tokens, but it is not the only file that fetches: the transcript,
// a file from the board and the module list are asked for from ui.js and
// modules.js. Until 5 September 2026 those three went out bare, which worked
// only because a private office admits everything from this machine. Switch the
// office to shared and its own owner was refused his own transcript with
// «нужно приглашение» — found on the two-machine test, on a live build.
//
// So the tokens live here, one step below everyone who needs them, rather than
// being threaded through callbacks: a new fetch in a new file gets the headers
// by importing one function, and forgetting to is a visible omission instead of
// a silent one.
let owner = '';
let guest = '';

export function setTokens(next = {}) {
  if ('owner' in next) owner = next.owner || '';
  if ('guest' in next) guest = next.guest || '';
}

export function owned(extra = {}) {
  const h = { ...extra };
  if (owner) h['x-valey-owner'] = owner;
  if (guest) h['x-valey-guest'] = guest;
  return h;
}
