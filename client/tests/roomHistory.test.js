import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyHistory, roomHistory } from '../src/utils/roomHistory.js';

test('rapid switches discard stale snapshots and send acknowledgements', () => {
  const personal = {type:'open', token:'notes', request:1};
  const shared = {type:'open', token:'shared', request:2};
  let state = roomHistory(roomHistory(emptyHistory, personal), shared);
  state = roomHistory(state, {...personal, type:'loaded', rows:[{id:'private'}]});
  state = roomHistory(state, {type:'update', token:'notes', update:rows => [...rows,{id:'private'}]});
  assert.deepEqual(state.rows, []);
  state = roomHistory(state, {...shared, type:'loaded', rows:[{id:'public'}]});
  assert.deepEqual(state.rows, [{id:'public'}]);
});

test('reopening the same room ignores an earlier request and replays live changes', () => {
  const open = {type:'open', token:'a', request:3};
  let state = roomHistory(emptyHistory, open);
  state = roomHistory(state, {type:'update', token:'a', update:rows => rows.filter(m => m.id !== 'deleted')});
  state = roomHistory(state, {...open, type:'loaded', request:1, rows:[{id:'stale'}]});
  state = roomHistory(state, {...open, type:'loaded', rows:[{id:'deleted'}, {id:'keep'}]});
  assert.deepEqual(state.rows, [{id:'keep'}]);
});
