// Scroll only the message viewport. Keep following late media/layout changes
// until the reader deliberately moves away from the latest message.
export function createChatScrollController(viewport, content, onShowButton) {
  let following = true;
  let lastTop = viewport.scrollTop;
  let lastHeight = viewport.scrollHeight;
  let lastViewportHeight = viewport.clientHeight;
  const distance = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop);
  const remember = () => {
    lastTop = viewport.scrollTop;
    lastHeight = viewport.scrollHeight;
    lastViewportHeight = viewport.clientHeight;
  };
  const sync = () => {
    if (following) viewport.scrollTop = viewport.scrollHeight;
    remember();
    onShowButton(distance() > 80);
  };
  const onScroll = () => {
    const resized = lastHeight !== viewport.scrollHeight || lastViewportHeight !== viewport.clientHeight;
    if (!resized && viewport.scrollTop < lastTop - 1) following = false;
    if (distance() <= 2) following = true;
    remember();
    onShowButton(distance() > 80);
  };
  const onWheel = event => { if (event.deltaY < 0) following = false; };
  let touchY = null;
  const onTouchStart = event => { touchY = event.touches[0]?.clientY ?? null; };
  const onTouchMove = event => {
    const nextY = event.touches[0]?.clientY;
    if (touchY !== null && nextY > touchY) following = false;
    touchY = nextY ?? null;
  };
  const onKeyDown = event => {
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) following = false;
  };
  const listeners = { scroll: onScroll, wheel: onWheel, touchstart: onTouchStart, touchmove: onTouchMove, keydown: onKeyDown };
  Object.entries(listeners).forEach(([type, handler]) => viewport.addEventListener(type, handler, { passive: true }));
  const observer = new ResizeObserver(sync);
  observer.observe(content);
  observer.observe(viewport);
  sync();
  return {
    sync,
    jumpToLatest() { following = true; sync(); },
    destroy() {
      observer.disconnect();
      Object.entries(listeners).forEach(([type, handler]) => viewport.removeEventListener(type, handler));
    },
  };
}
