export const emptyHistory = {token: null, request: null, rows: [], pending: null};

export function roomHistory(state, action) {
  if (action.type === 'open') {
    return {token: action.token, request: action.request, rows: [], pending: []};
  }
  if (action.token !== state.token) return state;
  if (action.type === 'update') {
    return {...state, rows: action.update(state.rows),
      pending: state.pending && [...state.pending, action.update]};
  }
  if (action.request !== state.request || !state.pending) return state;
  // Apply socket events and completed sends received while the snapshot was loading.
  const rows = state.pending.reduce((snapshot, apply) => apply(snapshot), action.rows);
  return {...state, rows, pending: null};
}
