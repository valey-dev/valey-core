// Whose agent this is, for the places that count what is waiting for YOU.
//
// An agent another participant's office brings to the floor carries `visitor`
// (server/index.js). Its state is true and worth drawing — it works, it waits,
// it stopped — but «waiting» about it is not a call to you: only the office it
// came from can answer it, and this one cannot even send a task. Seen on the
// floor on 27 September 2026, the first time the feature was looked at rather
// than tested: two teammate's agents were waiting on their own side and the
// office counted them into «! 4» in the header, which is a number the owner
// walks the floor by.
export const isVisitor = (a) => !!(a && a.visitor);
export const waitsOnYou = (a) => !!a && a.status === 'awaiting' && !a.visitor;
