'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const AUDIO_SRC = '/audio/space-ambience.mp3';

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const audio = new Audio(AUDIO_SRC);
    audio.loop = true;
    audio.volume = 0.4;
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleCanPlay = () => setIsReady(true);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('canplaythrough', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.pause();
      audio.removeEventListener('canplaythrough', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audioRef.current = null;
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play().catch(() => {
        // Autoplay was blocked or network issue — ignore silently
      });
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!isReady}
      aria-label={isPlaying ? '关闭背景音乐' : '开启背景音乐'}
      title={isReady ? (isPlaying ? '关闭背景音乐' : '开启背景音乐') : '音频加载中...'}
      className={`fixed bottom-20 right-4 z-30 w-11 h-11 rounded-full border backdrop-blur-sm transition-all duration-300 flex items-center justify-center ${
        isPlaying
          ? 'bg-cosmic-blue/30 border-cosmic-blue/60 text-cosmic-blue shadow-[0_0_16px_rgba(0,212,255,0.4)]'
          : 'bg-space-900/70 border-space-700 text-space-400 hover:text-cosmic-blue hover:border-cosmic-blue/50'
      } ${!isReady ? 'opacity-40 cursor-wait' : 'cursor-pointer'}`}
    >
      {isPlaying ? (
        <Volume2 className="w-5 h-5" />
      ) : (
        <VolumeX className="w-5 h-5" />
      )}
      {isPlaying && (
        <span className="absolute inset-0 rounded-full border border-cosmic-blue/40 animate-ping" />
      )}
    </button>
  );
}
