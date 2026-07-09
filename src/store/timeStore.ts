import { create } from 'zustand';
import type { SatelliteStoreActions } from './satelliteStore';
interface TimeStoreState {
 currentTime: Date;
 isPlaying: boolean;
 rate: number;
 playbackRates: number[];
 startTime: Date;
 endTime: Date;
 lastFrameTime: number | null;
 animationFrameId: number | null;
}
interface TimeStoreActions {
 setCurrentTime: (time: Date) => void;
 setIsPlaying: (playing: boolean) => void;
 togglePlay: () => void;
 setRate: (rate: number) => void;
 setStartTime: (time: Date) => void;
 setEndTime: (time: Date) => void;
 resetToStart: () => void;
 resetToNow: () => void;
 skipForward: (seconds: number) => void;
 skipBackward: (seconds: number) => void;
 startPlayback: () => void;
 stopPlayback: () => void;
}
const PLAYBACK_RATES = [0, 1, 10, 100, 1000];
export const useTimeStore = create<TimeStoreState & TimeStoreActions>((set, get) => {
 const now = new Date();
 const oneDay = 24 * 60 * 60 * 1000;
 return {
 currentTime: now,
 isPlaying: false,
 rate: 10,
 playbackRates: PLAYBACK_RATES,
 startTime: new Date(now.getTime() - oneDay),
 endTime: new Date(now.getTime() + oneDay),
 lastFrameTime: null,
 animationFrameId: null,
 setCurrentTime: (time) => {
 const { startTime, endTime } = get();
 const clampedTime = new Date(Math.max(startTime.getTime(), Math.min(endTime.getTime(), time.getTime())));
 set({ currentTime: clampedTime });
 },
 setIsPlaying: (playing) => {
 if (playing) {
 get().startPlayback();
 }
 else {
 get().stopPlayback();
 }
 },
 togglePlay: () => {
 const { isPlaying } = get();
 if (isPlaying) {
 get().stopPlayback();
 }
 else {
 get().startPlayback();
 }
 },
 setRate: (rate) => {
 if (PLAYBACK_RATES.includes(rate)) {
 set({ rate });
 if (rate === 0) {
 get().stopPlayback();
 }
 }
 },
 setStartTime: (time) => {
 set({ startTime: time });
 },
 setEndTime: (time) => {
 set({ endTime: time });
 },
 resetToStart: () => {
 const { startTime } = get();
 set({ currentTime: new Date(startTime.getTime()) });
 },
 resetToNow: () => {
 const now = new Date();
 set({
 currentTime: now,
 startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
 endTime: new Date(now.getTime() + 24 * 60 * 60 * 1000)
 });
 },
 skipForward: (seconds) => {
 const { currentTime, endTime } = get();
 const newTime = new Date(currentTime.getTime() + seconds * 1000);
 const clampedTime = new Date(Math.min(endTime.getTime(), newTime.getTime()));
 set({ currentTime: clampedTime });
 },
 skipBackward: (seconds) => {
 const { currentTime, startTime } = get();
 const newTime = new Date(currentTime.getTime() - seconds * 1000);
 const clampedTime = new Date(Math.max(startTime.getTime(), newTime.getTime()));
 set({ currentTime: clampedTime });
 },
 startPlayback: () => {
 const { animationFrameId, rate, endTime, currentTime } = get();
 if (animationFrameId !== null)
 return;
 if (rate === 0)
 return;
 if (currentTime >= endTime) {
 set({ currentTime: new Date(get().startTime.getTime()), isPlaying: true });
 }
 else {
 set({ isPlaying: true });
 }
 let lastTimestamp = performance.now();
 const animate = (timestamp: number) => {
 const { rate, isPlaying, endTime, currentTime } = get();
 if (!isPlaying || rate === 0) {
 set({ animationFrameId: null });
 return;
 }
 const deltaTime = timestamp - lastTimestamp;
 lastTimestamp = timestamp;
 const scaledDelta = deltaTime * rate;
 const newTime = new Date(currentTime.getTime() + scaledDelta);
 if (newTime >= endTime) {
 set({ currentTime: new Date(endTime.getTime()), isPlaying: false, animationFrameId: null });
 return;
 }
 set({ currentTime: newTime });
 const nextFrameId = requestAnimationFrame(animate);
 set({ animationFrameId: nextFrameId });
 };
 const frameId = requestAnimationFrame(animate);
 set({ animationFrameId: frameId });
 },
 stopPlayback: () => {
 const { animationFrameId } = get();
 if (animationFrameId !== null) {
 cancelAnimationFrame(animationFrameId);
 }
 set({ isPlaying: false, animationFrameId: null });
 }
 };
});
export const useCurrentTime = () => useTimeStore(state => state.currentTime);
export const useIsPlaying = () => useTimeStore(state => state.isPlaying);
export const usePlaybackRate = () => useTimeStore(state => state.rate);
export const usePlaybackRates = () => useTimeStore(state => state.playbackRates);
export const useTimeRange = () => useTimeStore(state => ({
 start: state.startTime,
 end: state.endTime
}));