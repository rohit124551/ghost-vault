import React, { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Download, X, RefreshCw } from 'lucide-react';
import './FullScreenImageViewer.css';

export default function FullScreenImageViewer({ imageUrl, imageName, onClose }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const containerRef = useRef(null);
  const imgRef = useRef(null);

  // Interaction tracking refs
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastTouchTimeRef = useRef(0);

  // Multi-touch zoom refs
  const touchStartDistRef = useRef(null);
  const touchStartScaleRef = useRef(1);

  // Swipe-to-dismiss refs
  const swipeStartYRef = useRef(null);

  // Reset all states
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setSwipeOffset(0);
  };

  // Zoom adjustments
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.5, 5));
  const handleZoomOut = () => {
    setScale(prev => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  // Force download helper
  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = imageName || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      window.open(imageUrl, '_blank', 'noreferrer');
    }
  };

  // Helper: calculate distance between two touches
  const getTouchesDistance = (t1, t2) => {
    return Math.sqrt(
      Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2)
    );
  };

  /* ── Desktop mouse wheel zoom ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomFactor = 0.1;
      const delta = -e.deltaY * zoomFactor;
      setScale(prev => {
        const next = Math.min(Math.max(prev + delta, 1), 5);
        if (next === 1) {
          setPosition({ x: 0, y: 0 });
        }
        return next;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  /* ── Interaction Handlers ── */
  const handleStart = (clientX, clientY, isTouchEvent, touchesCount = 1, rawTouches = []) => {
    if (touchesCount === 2 && isTouchEvent) {
      // Pinch to zoom init
      isDraggingRef.current = false;
      const dist = getTouchesDistance(rawTouches[0], rawTouches[1]);
      touchStartDistRef.current = dist;
      touchStartScaleRef.current = scale;
    } else {
      if (scale > 1) {
        // Pan init
        isDraggingRef.current = true;
        dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
      } else {
        // Swipe to dismiss init
        swipeStartYRef.current = clientY;
      }
    }
  };

  const handleMove = (clientX, clientY, isTouchEvent, touchesCount = 1, rawTouches = []) => {
    if (touchesCount === 2 && isTouchEvent && touchStartDistRef.current !== null) {
      // Multi-touch scale
      const dist = getTouchesDistance(rawTouches[0], rawTouches[1]);
      const nextScale = touchStartScaleRef.current * (dist / touchStartDistRef.current);
      setScale(Math.min(Math.max(nextScale, 1), 5));
    } else if (isDraggingRef.current && scale > 1) {
      // Panning active
      const newX = clientX - dragStartRef.current.x;
      const newY = clientY - dragStartRef.current.y;
      
      // Calculate bounds based on scale
      const maxOffset = (scale - 1) * 200; // soft clamping bounds
      setPosition({
        x: Math.min(Math.max(newX, -maxOffset * 1.5), maxOffset * 1.5),
        y: Math.min(Math.max(newY, -maxOffset * 1.5), maxOffset * 1.5)
      });
    } else if (swipeStartYRef.current !== null && scale === 1) {
      // Swipe to dismiss active
      const dy = clientY - swipeStartYRef.current;
      setSwipeOffset(dy);
    }
  };

  const handleEnd = () => {
    isDraggingRef.current = false;
    touchStartDistRef.current = null;

    if (scale === 1 && swipeStartYRef.current !== null) {
      if (Math.abs(swipeOffset) > 120) {
        onClose();
      } else {
        // Snap back
        setSwipeOffset(0);
      }
    }
    swipeStartYRef.current = null;
  };

  // Double tap / double click toggle helper
  const handleDoubleTapToggle = () => {
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  /* ── Event Bindings (Mouse & Touch) ── */
  const onMouseDown = (e) => {
    if (e.button !== 0) return; // Left click only
    handleStart(e.clientX, e.clientY, false);
  };

  const onMouseMove = (e) => {
    handleMove(e.clientX, e.clientY, false);
  };

  const onMouseUp = () => {
    handleEnd();
  };

  const onTouchStart = (e) => {
    const touches = e.touches;
    if (touches.length === 1) {
      // Check for double tap
      const now = Date.now();
      if (now - lastTouchTimeRef.current < 250) {
        handleDoubleTapToggle();
        lastTouchTimeRef.current = 0;
        return;
      }
      lastTouchTimeRef.current = now;
      handleStart(touches[0].clientX, touches[0].clientY, true, 1);
    } else if (touches.length === 2) {
      handleStart(0, 0, true, 2, touches);
    }
  };

  const onTouchMove = (e) => {
    const touches = e.touches;
    if (touches.length === 1) {
      handleMove(touches[0].clientX, touches[0].clientY, true, 1);
    } else if (touches.length === 2) {
      handleMove(0, 0, true, 2, touches);
    }
  };

  const onTouchEnd = () => {
    handleEnd();
  };

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Dynamic overlay opacity for swipe-to-dismiss experience
  const backdropOpacity = Math.max(0.4, 0.95 - Math.min(Math.abs(swipeOffset) / 400, 0.55));
  const swipeTransform = `translate3d(${position.x}px, ${position.y + swipeOffset}px, 0) scale(${scale}) rotate(${rotation}deg)`;

  return (
    <div
      ref={containerRef}
      className="fs-viewer-overlay"
      style={{
        backgroundColor: `rgba(4, 4, 6, ${backdropOpacity})`,
        backdropFilter: `blur(${Math.max(2, 16 - Math.abs(swipeOffset) / 20)}px)`
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Immersive Glassmorphic Top Controls Bar */}
      <div className="fs-viewer-header" onClick={e => e.stopPropagation()}>
        <div className="fs-viewer-title-section">
          <span className="fs-viewer-filename">{imageName || 'Shared Image'}</span>
          {scale > 1 && <span className="fs-viewer-badge">{scale.toFixed(1)}x</span>}
        </div>
        
        <div className="fs-viewer-toolbar">
          <button className="fs-btn" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button className="fs-btn" onClick={handleZoomOut} title="Zoom Out" disabled={scale === 1}>
            <ZoomOut size={18} />
          </button>
          <button className="fs-btn" onClick={handleRotate} title="Rotate 90°">
            <RotateCw size={18} />
          </button>
          <button className="fs-btn" onClick={handleReset} title="Reset Settings" disabled={scale === 1 && rotation === 0 && position.x === 0 && position.y === 0}>
            <RefreshCw size={18} />
          </button>
          <div className="fs-divider" />
          <button className="fs-btn fs-btn-download" onClick={handleDownload} title="Download Source File">
            <Download size={18} />
          </button>
          <button className="fs-btn fs-btn-close" onClick={onClose} title="Close Viewer (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Interactive Image Frame */}
      <div 
        className={`fs-viewer-frame ${scale > 1 ? 'fs-viewer-frame--zoomed' : ''}`}
        onDoubleClick={handleDoubleTapToggle}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={imageName}
          className="fs-viewer-image"
          style={{
            transform: swipeTransform,
            transition: isDraggingRef.current || swipeStartYRef.current !== null ? 'none' : 'transform 250ms cubic-bezier(0.19, 1, 0.22, 1)'
          }}
          draggable="false"
        />
      </div>

      {/* Gesture Help Hint for mobile users */}
      <div className="fs-viewer-footer">
        <p className="fs-hint">Pinch or scroll to zoom • Drag to pan • Swipe down to close</p>
      </div>
    </div>
  );
}
