import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatScrollController } from '../src/utils/chatScroll.js';

function setup(t, height = 1600) {
  let observer;
  const originalObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = []; observer = this; }
    observe(target) { this.targets.push(target); }
    disconnect() { this.targets = []; }
  };
  t.after(() => { globalThis.ResizeObserver = originalObserver; });
  const handlers = new Map();
  let top = 0;
  const viewport = {
    scrollHeight: height, clientHeight: 400,
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    addEventListener(type, handler) { handlers.set(type, handler); },
    removeEventListener(type) { handlers.delete(type); },
  };
  const content = {};
  let showButton;
  const controller = createChatScrollController(viewport, content, show => { showButton = show; });
  t.after(() => controller.destroy());
  return {
    viewport, controller, observer, handlers, content,
    get showButton() { return showButton; },
    emit(type, event = {}) { handlers.get(type)?.(event); },
    resize() { observer.callback(); },
  };
}

test('opens a preloaded conversation at its latest message', t => {
  const chat = setup(t);
  assert.equal(chat.viewport.scrollTop, 1200);
  assert.equal(chat.showButton, false);
  assert.deepEqual(chat.observer.targets, [chat.content, chat.viewport]);
});

test('follows initial asynchronous history and late image/video expansion', t => {
  const chat = setup(t, 400);
  chat.viewport.scrollHeight = 1600;
  chat.controller.sync();
  assert.equal(chat.viewport.scrollTop, 1200);
  chat.viewport.scrollHeight = 2400;
  chat.resize();
  assert.equal(chat.viewport.scrollTop, 2000);
  chat.viewport.clientHeight = 250;
  chat.resize();
  assert.equal(chat.viewport.scrollTop, 2150);
});

test('preserves reading position when older messages are being read', t => {
  const chat = setup(t);
  chat.emit('wheel', { deltaY: -100 });
  chat.viewport.scrollTop = 600;
  chat.emit('scroll');
  chat.viewport.scrollHeight = 2000;
  chat.resize();
  chat.controller.sync();
  assert.equal(chat.viewport.scrollTop, 600);
  assert.equal(chat.showButton, true);
});

test('the latest-message button jumps fully down and resumes following', t => {
  const chat = setup(t);
  chat.viewport.scrollTop = 200;
  chat.emit('scroll');
  chat.controller.jumpToLatest();
  assert.equal(chat.viewport.scrollTop, 1200);
  assert.equal(chat.showButton, false);
  chat.viewport.scrollHeight = 2100;
  chat.resize();
  assert.equal(chat.viewport.scrollTop, 1700);
});

test('touch browsing pauses following; manually reaching the bottom resumes it', t => {
  const chat = setup(t);
  chat.emit('touchstart', { touches: [{ clientY: 100 }] });
  chat.emit('touchmove', { touches: [{ clientY: 200 }] });
  chat.viewport.scrollTop = 800;
  chat.emit('scroll');
  chat.viewport.scrollHeight = 2000;
  chat.resize();
  assert.equal(chat.viewport.scrollTop, 800);
  chat.viewport.scrollTop = 1600;
  chat.emit('scroll');
  chat.viewport.scrollHeight = 2200;
  chat.resize();
  assert.equal(chat.viewport.scrollTop, 1800);
});

test('disconnects observers and listeners when leaving the conversation', t => {
  const chat = setup(t);
  chat.controller.destroy();
  assert.equal(chat.handlers.size, 0);
  assert.equal(chat.observer.targets.length, 0);
});
