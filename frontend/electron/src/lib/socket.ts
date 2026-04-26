import { io, Socket } from 'socket.io-client';
import type { ServerEvents } from './events';

const URL = import.meta.env.VITE_BRIDGE_URL ?? 'http://localhost:3001';

export const socket: Socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 600,
  reconnectionDelayMax: 2400,
  transports: ['websocket', 'polling'],
});

/** Strongly-typed `on` helper. */
export function on<K extends keyof ServerEvents>(
  event: K,
  handler: (payload: ServerEvents[K]) => void,
): () => void {
  socket.on(event as string, handler as (...args: unknown[]) => void);
  return () => socket.off(event as string, handler as (...args: unknown[]) => void);
}

/** Subscribe to ANY event. Used by the debug panel only. */
export function onAny(handler: (event: string, payload: unknown) => void): () => void {
  const wrapped = (ev: string, ...args: unknown[]) => handler(ev, args[0]);
  socket.onAny(wrapped);
  return () => socket.offAny(wrapped);
}
