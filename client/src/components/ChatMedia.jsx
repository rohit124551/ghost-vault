import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import api from '../lib/api';
import { guestApi } from './useChatActivity';

export function LinkCard({ url, token, myRole }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    const client = myRole === 'guest' ? guestApi : api;
    client.get('/api/link-preview', {params: { url }, headers: {'x-room-token': token}, signal: controller.signal})
      .then(r => setData(r.data)).catch(() => {});
    return () => controller.abort();
  }, [token, url, myRole]);
  if (!data?.title) return null;
  return <a className="link-card" href={url} target="_blank" rel="noreferrer">
    {data.image && <img src={data.image} loading="lazy" referrerPolicy="no-referrer" alt="" />}
    <strong>{data.title}</strong><small>{data.description}</small>
  </a>;
}

function waveform(buffer, count = 56) {
  const energy = new Float64Array(count);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let bar = 0; bar < count; bar++) {
      const start = Math.floor(bar * samples.length / count);
      const end = Math.floor((bar + 1) * samples.length / count);
      let sum = 0;
      for (let i = start; i < end; i++) sum += samples[i] * samples[i];
      energy[bar] += sum / Math.max(1, end - start);
    }
  }
  const maximum = Math.max(...energy) || 1;
  return Array.from(energy, value => Math.sqrt(value / maximum));
}

export function audioTime(seconds) {
  const whole = Math.floor(seconds);
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

export function VoicePlayer({ url }) {
  const audio = useRef(null);
  const [bars, setBars] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let context;
    async function decode() {
      const response = await fetch(url, {signal: controller.signal});
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      const Audio = window.AudioContext || window.webkitAudioContext;
      context = new Audio();
      const buffer = await context.decodeAudioData(bytes);
      if (!controller.signal.aborted) {
        setDuration(buffer.duration);
        setBars(waveform(buffer));
      }
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      // Playback can still work when the media host disallows decoding via fetch.
      decode().catch(() => {}).finally(() => context?.close().catch(() => {}));
    });
    observer.observe(audio.current.parentElement);
    return () => {observer.disconnect(); controller.abort();};
  }, [url]);

  const progress = duration ? Math.min(1, elapsed / duration) : 0;
  const synchronize = event => setElapsed(event.currentTarget.currentTime);
  return <div className="voice-player">
    <audio ref={audio} src={url} preload="metadata" onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => setFailed(true)} onSeeked={synchronize} onTimeUpdate={synchronize}
      onLoadedMetadata={e => {if (Number.isFinite(e.target.duration)) setDuration(e.target.duration);}}/>
    <button type="button" title={playing ? 'Pause audio' : 'Play audio'} onClick={() => {
      if (playing) audio.current.pause();
      else {setFailed(false); audio.current.play().catch(() => setFailed(true));}
    }}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
    <div className="voice-track">
      <label className="wave-bars" style={{'--played': (progress * 100) + '%'}}>
        {bars.length > 0 && <span className="wave-shape" aria-hidden="true">
          {bars.map((level, i) => <i key={i} style={{height: Math.max(2, level * 28) + 'px'}}/>)}
        </span>}
        <input aria-label="Seek voice note" type="range" min="0" max={duration || 1} step=".01"
          disabled={!duration} value={Math.min(elapsed, duration)} aria-valuetext={audioTime(elapsed)}
          onChange={e => {audio.current.currentTime = Number(e.target.value);setElapsed(audio.current.currentTime);}}/>
      </label>
      <small>{failed ? 'Audio unavailable' : audioTime(elapsed) + ' / ' + (duration ? audioTime(duration) : '–:––')}</small>
    </div>
  </div>;
}
