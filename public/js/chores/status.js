// What status text and colour an assignment shows (spec §6). The text is
// always there; the colour (kind → CSS class tag--<kind>) is extra.
export function displayStatus(assignment, meId) {
  if (assignment.status === 'completed') return { label: 'Done', kind: 'done' };
  if (assignment.userId === null) return { label: 'Nobody', kind: 'none' };
  if (assignment.pendingSwap) {
    const waiting = assignment.pendingSwap.targetUserId === meId
      ? 'Waiting on you'
      : `Waiting on ${assignment.pendingSwap.targetName}`;
    return { label: assignment.overdue ? `Overdue · ${waiting}` : waiting, kind: 'pend' };
  }
  if (assignment.overdue) return { label: 'Overdue', kind: 'over' };
  return { label: 'To do', kind: 'todo' };
}

// The small text under a chore's name in the week chart, so the status is
// always in words, not only in the chip's colour.
export function chipNote(assignment, meId) {
  if (assignment.status !== 'completed') {
    const { label } = displayStatus(assignment, meId);
    return assignment.viaName ? `${label} · via ${assignment.viaName}` : label;
  }
  const notes = ['Done'];
  if (assignment.wasLate) notes.push('was overdue');
  if (assignment.viaName) notes.push(`via ${assignment.viaName}`);
  return notes.join(' · ');
}
