// The office's verdict, in the shape Claude Code expects on the hook's stdout.
// Kept apart from tools/permit.mjs because that one reads stdin the moment it
// is imported, and the stand needs to check the shape without a Claude Code.
//
// `null` means "print nothing": an empty answer lets the request continue down
// the normal path, and the person sees the native dialog.

export function hookOutput(payload, answer) {
  if (!answer || !answer.decision) return null;
  const event = String((payload && payload.hook_event_name) || 'PermissionRequest');
  if (event !== 'PermissionRequest') return null;

  // `decision` is an object with `behavior`, not a bare word. Until
  // 11 September 2026 this hook printed `"decision": "allow"`, and the client's
  // own validation message reads «PermissionRequest decision must be
  // {"behavior": "allow"} or {"behavior": "deny", "message": "..."}» — so an
  // allow or deny pressed in the office came back as a malformed answer. Found
  // in the hooks reference and in the strings of the client binary, not by a
  // live measurement.
  //
  // The rules for "always allow" travel as the very objects that arrived in
  // permission_suggestions: the office does not invent them, it returns them —
  // and Claude Code writes them itself, in the same place the "Always allow"
  // button would have.
  const decision = { behavior: answer.decision };
  if (answer.decision === 'allow' && (answer.updatedPermissions || []).length) {
    decision.updatedPermissions = answer.updatedPermissions;
  }
  if (answer.decision === 'deny') decision.message = answer.message || 'denied in the office';
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } };
}
