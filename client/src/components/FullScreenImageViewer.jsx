import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, RotateCw, Download, X, RefreshCw,
  Copy, Check, Volume2, VolumeX, Maximize2, ChevronLeft,
  ChevronRight, FileText, Film, Music, Image as ImageIcon,
  Pause, Play, ExternalLink
} from 'lucide-react';
import './FullScreenImageViewer.css';

/* ─── helpers ─── */
function FileTypeBadge({ fileType }) {
  const map = {
    image: { icon: <ImageIcon size={11} />, label: 'IMAGE', color: '#06b6d4' },
    video: { icon: <Film size={11} />, label: 'VIDEO', color: '#8b5cf6' },
    audio: { icon: <Music size={11} />, label: 'AUDIO', color: '#f59e0b' },
    pdf: { icon: <FileText size={11} />, label: 'PDF', color: '#ef4444' },
  };
  const t = map[fileType] || map.image;
  return (
    <span className="fs-type-badge" style={{ borderColor: t.color, color: t.color }}>
      {t.icon} {t.label}
    </span>
  );
}

export default function FullScreenImageViewer({ imageUrl, imageName, fileType = 'image', onClose }) {
  /* ─── image state ─── */
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ─── video state ─── */
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const videoRef = useRef(null);

  /* ─── audio state ─── */
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef(null);

  const containerRef = useRef(null);
  const imgRef = useRef(null);

  /* ─── drag/swipe refs ─── */
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastTouchTimeRef = useRef(0);
  const touchStartDistRef = useRef(null);
  const touchStartScaleRef = useRef(1);
  const swipeStartYRef = useRef(null);

  /* ─── image controls ─── */
  const handleZoomIn = () => setScale(p => Math.min(p + 0.5, 5));
  const handleZoomOut = () => setScale(p => { const n = Math.max(p - 0.5, 1); if (n === 1) setPosition({ x: 0, y: 0 }); return n; });
  const handleRotate = () => setRotation(p => (p + 90) % 360);
  const handleReset = () => { setScale(1); setPosition({ x: 0, y: 0 }); setRotation(0); setSwipeOffset(0); };

  const handleCopyImage = async () => {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy URL
      navigator.clipboard.writeText(imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /* ─── download ─── */
  const handleDownload = async (e) => {
    e?.preventDefault();
    e?.stopPropagation();
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

  /* ─── video controls ─── */
  const toggleVideoPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setVideoPlaying(true); }
    else { v.pause(); setVideoPlaying(false); }
  }, []);

  const toggleVideoMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setVideoMuted(m => !m);
  };

  const seekVideo = (delta) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration, videoRef.current.currentTime + delta));
  };

  /* ─── audio controls ─── */
  const toggleAudioPlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setAudioPlaying(true); }
    else { a.pause(); setAudioPlaying(false); }
  };

  const toggleAudioMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !audioRef.current.muted;
    setAudioMuted(m => !m);
  };

  const formatTime = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  /* ─── wheel zoom ─── */
  useEffect(() => {
    if (fileType !== 'image') return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.08;
      setScale(p => { const n = Math.min(Math.max(p + delta, 1), 5); if (n === 1) setPosition({ x: 0, y: 0 }); return n; });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fileType]);

  /* ─── keyboard shortcuts ─── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (fileType === 'image') {
        if (e.key === '+' || e.key === '=') handleZoomIn();
        if (e.key === '-') handleZoomOut();
        if (e.key === 'r' || e.key === 'R') handleRotate();
        if (e.key === '0') handleReset();
      }
      if (fileType === 'video') {
        if (e.key === ' ') { e.preventDefault(); toggleVideoPlay(); }
        if (e.key === 'ArrowLeft') seekVideo(-10);
        if (e.key === 'ArrowRight') seekVideo(10);
        if (e.key === 'm' || e.key === 'M') toggleVideoMute();
      }
      if (fileType === 'audio') {
        if (e.key === ' ') { e.preventDefault(); toggleAudioPlay(); }
        if (e.key === 'm' || e.key === 'M') toggleAudioMute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, fileType, toggleVideoPlay]);

  /* ─── touch/drag helpers (image only) ─── */
  const getTouchDist = (t1, t2) => Math.sqrt((t2.clientX - t1.clientX) ** 2 + (t2.clientY - t1.clientY) ** 2);

  const handleStart = (clientX, clientY, isTouchEvent, touchesCount = 1, rawTouches = []) => {
    if (touchesCount === 2 && isTouchEvent) {
      isDraggingRef.current = false;
      touchStartDistRef.current = getTouchDist(rawTouches[0], rawTouches[1]);
      touchStartScaleRef.current = scale;
    } else {
      if (scale > 1) {
        isDraggingRef.current = true;
        dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
      } else {
        swipeStartYRef.current = clientY;
      }
    }
  };

  const handleMove = (clientX, clientY, isTouchEvent, touchesCount = 1, rawTouches = []) => {
    if (touchesCount === 2 && isTouchEvent && touchStartDistRef.current !== null) {
      const dist = getTouchDist(rawTouches[0], rawTouches[1]);
      setScale(Math.min(Math.max(touchStartScaleRef.current * (dist / touchStartDistRef.current), 1), 5));
    } else if (isDraggingRef.current && scale > 1) {
      const maxOff = (scale - 1) * 200;
      setPosition({
        x: Math.min(Math.max(clientX - dragStartRef.current.x, -maxOff * 1.5), maxOff * 1.5),
        y: Math.min(Math.max(clientY - dragStartRef.current.y, -maxOff * 1.5), maxOff * 1.5),
      });
    } else if (swipeStartYRef.current !== null && scale === 1) {
      setSwipeOffset(clientY - swipeStartYRef.current);
    }
  };

  const handleEnd = () => {
    isDraggingRef.current = false;
    touchStartDistRef.current = null;
    if (scale === 1 && swipeStartYRef.current !== null) {
      if (Math.abs(swipeOffset) > 120) onClose();
      else setSwipeOffset(0);
    }
    swipeStartYRef.current = null;
  };

  const handleDoubleTap = () => {
    if (scale > 1) { setScale(1); setPosition({ x: 0, y: 0 }); }
    else setScale(2.5);
  };

  const onMouseDown = (e) => { if (e.button !== 0) return; handleStart(e.clientX, e.clientY, false); };
  const onMouseMove = (e) => handleMove(e.clientX, e.clientY, false);
  const onMouseUp = () => handleEnd();

  const onTouchStart = (e) => {
    const t = e.touches;
    if (t.length === 1) {
      const now = Date.now();
      if (now - lastTouchTimeRef.current < 250) { handleDoubleTap(); lastTouchTimeRef.current = 0; return; }
      lastTouchTimeRef.current = now;
      handleStart(t[0].clientX, t[0].clientY, true, 1);
    } else if (t.length === 2) {
      handleStart(0, 0, true, 2, t);
    }
  };
  const onTouchMove = (e) => {
    const t = e.touches;
    if (t.length === 1) handleMove(t[0].clientX, t[0].clientY, true, 1);
    else if (t.length === 2) handleMove(0, 0, true, 2, t);
  };
  const onTouchEnd = () => handleEnd();

  const backdropOpacity = Math.max(0.4, 0.95 - Math.min(Math.abs(swipeOffset) / 400, 0.55));
  const swipeTransform = `translate3d(${position.x}px, ${position.y + swipeOffset}px, 0) scale(${scale}) rotate(${rotation}deg)`;

  return (
    <div
      ref={containerRef}
      className="fs-viewer-overlay"
      style={{
        backgroundColor: `rgba(4, 4, 6, ${backdropOpacity})`,
        backdropFilter: `blur(${Math.max(2, 16 - Math.abs(swipeOffset) / 20)}px)`,
      }}
      onMouseDown={fileType === 'image' ? onMouseDown : undefined}
      onMouseMove={fileType === 'image' ? onMouseMove : undefined}
      onMouseUp={fileType === 'image' ? onMouseUp : undefined}
      onMouseLeave={fileType === 'image' ? onMouseUp : undefined}
      onTouchStart={fileType === 'image' ? onTouchStart : undefined}
      onTouchMove={fileType === 'image' ? onTouchMove : undefined}
      onTouchEnd={fileType === 'image' ? onTouchEnd : undefined}
    >
      {/* ─── Header Toolbar ─── */}
      <div className="fs-viewer-header" onClick={e => e.stopPropagation()}>
        <div className="fs-viewer-title-section">
          <FileTypeBadge fileType={fileType} />
          <span className="fs-viewer-filename">{imageName || 'Shared File'}</span>
          {scale > 1 && fileType === 'image' && (
            <span className="fs-viewer-badge">{scale.toFixed(1)}x</span>
          )}
        </div>

        <div className="fs-viewer-toolbar">
          {/* Image-specific controls */}
          {fileType === 'image' && (
            <>
              <button className="fs-btn" onClick={handleZoomIn} title="Zoom In (+)">
                <ZoomIn size={16} />
              </button>
              <button className="fs-btn" onClick={handleZoomOut} title="Zoom Out (-)" disabled={scale === 1}>
                <ZoomOut size={16} />
              </button>
              <button className="fs-btn" onClick={handleRotate} title="Rotate 90° (R)">
                <RotateCw size={16} />
              </button>
              <button className="fs-btn" onClick={handleReset} title="Reset (0)" disabled={scale === 1 && rotation === 0 && position.x === 0 && position.y === 0}>
                <RefreshCw size={16} />
              </button>
              <button className="fs-btn fs-btn-copy" onClick={handleCopyImage} title="Copy Image">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <div className="fs-divider" />
            </>
          )}

          {/* Video-specific controls */}
          {fileType === 'video' && (
            <>
              <button className="fs-btn" onClick={toggleVideoPlay} title="Play/Pause (Space)">
                {videoPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button className="fs-btn" onClick={toggleVideoMute} title="Mute/Unmute (M)">
                {videoMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <div className="fs-divider" />
            </>
          )}

          {/* Audio-specific controls */}
          {fileType === 'audio' && (
            <>
              <button className="fs-btn" onClick={toggleAudioPlay} title="Play/Pause (Space)">
                {audioPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button className="fs-btn" onClick={toggleAudioMute} title="Mute/Unmute (M)">
                {audioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <div className="fs-divider" />
            </>
          )}

          {/* PDF — open in new tab */}
          {fileType === 'pdf' && (
            <>
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="fs-btn"
                title="Open in New Tab"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink size={16} />
              </a>
              <div className="fs-divider" />
            </>
          )}

          <button className="fs-btn fs-btn-download" onClick={handleDownload} title="Download">
            <Download size={16} />
          </button>
          <button className="fs-btn fs-btn-close" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ─── Main Content Frame ─── */}
      <div
        className={`fs-viewer-frame ${fileType !== 'image' ? 'fs-viewer-frame--media' : ''} ${scale > 1 ? 'fs-viewer-frame--zoomed' : ''}`}
        onDoubleClick={fileType === 'image' ? handleDoubleTap : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* IMAGE */}
        {fileType === 'image' && (
          <>
            {!imgLoaded && <div className="fs-loader"><div className="fs-spinner" /></div>}
            <img
              ref={imgRef}
              src={imageUrl}
              alt={imageName}
              className="fs-viewer-media"
              onLoad={() => setImgLoaded(true)}
              style={{
                transform: swipeTransform,
                transition: isDraggingRef.current || swipeStartYRef.current !== null ? 'none' : 'transform 250ms cubic-bezier(0.19, 1, 0.22, 1)',
                opacity: imgLoaded ? 1 : 0,
              }}
              draggable="false"
            />
          </>
        )}

        {/* VIDEO */}
        {fileType === 'video' && (
          <div className="fs-video-wrapper" onClick={e => e.stopPropagation()}>
            <video
              ref={videoRef}
              src={imageUrl}
              className="fs-viewer-media fs-video"
              preload="metadata"
              playsInline
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onEnded={() => setVideoPlaying(false)}
              onLoadedMetadata={() => setVideoDuration(videoRef.current?.duration || 0)}
              onTimeUpdate={() => setVideoProgress(videoRef.current?.currentTime || 0)}
              onClick={toggleVideoPlay}
            />
            {/* Custom scrubber */}
            <div className="fs-media-controls" onClick={e => e.stopPropagation()}>
              <span className="fs-time">{formatTime(videoProgress)}</span>
              <input
                type="range"
                className="fs-scrubber"
                min={0}
                max={videoDuration || 100}
                value={videoProgress}
                step={0.1}
                onChange={e => { if (videoRef.current) videoRef.current.currentTime = +e.target.value; }}
              />
              <span className="fs-time">{formatTime(videoDuration)}</span>
            </div>
            {/* Big play overlay when paused */}
            {!videoPlaying && (
              <button className="fs-play-overlay" onClick={toggleVideoPlay}>
                <Play size={36} />
              </button>
            )}
          </div>
        )}

        {/* AUDIO */}
        {fileType === 'audio' && (
          <div className="fs-audio-player" onClick={e => e.stopPropagation()}>
            <audio
              ref={audioRef}
              src={imageUrl}
              preload="metadata"
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => setAudioPlaying(false)}
              onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
              onTimeUpdate={() => setAudioProgress(audioRef.current?.currentTime || 0)}
            />
            {/* Waveform visual bars */}
            <div className="fs-audio-visual">
              {[...Array(28)].map((_, i) => (
                <div
                  key={i}
                  className={`fs-audio-bar ${audioPlaying ? 'fs-audio-bar--playing' : ''}`}
                  style={{ animationDelay: `${(i * 0.07).toFixed(2)}s`, height: `${20 + Math.sin(i * 0.8) * 18 + Math.cos(i * 1.3) * 10}px` }}
                />
              ))}
            </div>

            <div className="fs-audio-meta">
              <span className="fs-audio-title">{imageName || 'Audio File'}</span>
            </div>

            {/* Controls */}
            <div className="fs-audio-controls">
              <button className="fs-audio-play-btn" onClick={toggleAudioPlay}>
                {audioPlaying ? <Pause size={28} /> : <Play size={28} />}
              </button>
            </div>

            {/* Scrubber */}
            <div className="fs-media-controls fs-media-controls--audio">
              <span className="fs-time">{formatTime(audioProgress)}</span>
              <input
                type="range"
                className="fs-scrubber"
                min={0}
                max={audioDuration || 100}
                value={audioProgress}
                step={0.1}
                onChange={e => { if (audioRef.current) audioRef.current.currentTime = +e.target.value; }}
              />
              <span className="fs-time">{formatTime(audioDuration)}</span>
            </div>
          </div>
        )}

        {/* PDF */}
        {fileType === 'pdf' && (
          <div className="fs-pdf-wrapper" onClick={e => e.stopPropagation()}>
            <iframe
              src={`${imageUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
              title={imageName}
              className="fs-viewer-pdf"
            />
          </div>
        )}
      </div>

      {/* ─── Footer hint ─── */}
      <div className="fs-viewer-footer">
        <p className="fs-hint">
          {fileType === 'image' && 'Scroll/pinch to zoom · Drag to pan · Double-click to toggle · Swipe ↓ to close'}
          {fileType === 'video' && 'Space = play/pause · ← → = seek 10s · M = mute · Esc = close'}
          {fileType === 'audio' && 'Space = play/pause · M = mute · Esc = close'}
          {fileType === 'pdf' && 'Scroll inside to read · Tab out to close'}
        </p>
      </div>
    </div>
  );
}
