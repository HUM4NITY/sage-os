import { useSage } from './store';

/**
 * Plays a fake conversation through the store as if it came over the socket.
 * Used by the dev panel to preview the full patient UI without booting the
 * backend bridge. Pacing matches realistic STT → routing → TTS timing.
 */
export async function playDemoSequence() {
  const s = useSage.getState();
  s.clearTranscript();
  s.setOrb('idle');

  await wait(300);

  // ── Turn 1 — pill organizer (browser flow) ──
  s.setOrb('listening');
  await typePartial('user', 'I need one of', 700);
  await typePartial('user', 'I need one of those weekly', 600);
  await typePartial('user', 'I need one of those weekly pill organizers,', 600);
  await typePartial('user', 'I need one of those weekly pill organizers, and I keep forgetting which one I got last time.', 1000);
  s.appendUser('I need one of those weekly pill organizers, and I keep forgetting which one I got last time.');

  s.setOrb('thinking');
  await wait(700);
  s.appendTrace('supervisor', 'route → memory_lookup');
  await wait(500);
  s.appendTrace('memory_lookup', 'last order: AUVON 7-day organizer');
  await wait(500);
  s.appendTrace('browser_agent', 'opening amazon.com');
  await wait(900);
  s.appendTrace('browser_agent', 'searching: "weekly pill organizer 7 day AUVON"');
  await wait(1100);
  s.appendTrace('browser_agent', 'selected: AUVON Pill Organizer · $13.99');

  s.setOrb('speaking');
  await typePartial('sage', 'I found', 500);
  await typePartial('sage', 'I found the weekly pill organizer', 500);
  await typePartial('sage', 'I found the weekly pill organizer you usually get.', 600);
  await typePartial('sage', "I found the weekly pill organizer you usually get. I'll place it now.", 700);
  s.appendSage("I found the weekly pill organizer you usually get. I'll place it now.");

  s.setOrb('complete');
  await wait(1400);

  // ── Turn 2 — Dr. Mehta (memory only, no browser) ──
  s.setOrb('listening');
  await typePartial('user', 'And I need to', 600);
  await typePartial('user', 'And I need to get to Dr. Mehta', 700);
  await typePartial('user', 'And I need to get to Dr. Mehta on Thursday morning.', 700);
  s.appendUser('And I need to get to Dr. Mehta on Thursday morning.');

  s.setOrb('thinking');
  await wait(600);
  s.appendTrace('supervisor', 'route → memory_lookup');
  await wait(450);
  s.appendTrace('memory_lookup', 'Dr. Mehta · Thursday 9:00 a.m. · 450 Maple Ave');

  s.setOrb('speaking');
  await typePartial('sage', "Yes,", 400);
  await typePartial('sage', "Yes, that's at nine on Thursday", 600);
  await typePartial('sage', "Yes, that's at nine on Thursday morning, on Maple Avenue.", 700);
  await typePartial('sage', "Yes, that's at nine on Thursday morning, on Maple Avenue. I'll set a gentle reminder.", 600);
  s.appendSage("Yes, that's at nine on Thursday morning, on Maple Avenue. I'll set a gentle reminder.");

  s.setOrb('complete');
  await wait(1400);
  s.setOrb('idle');
}

async function typePartial(speaker: 'user' | 'sage', text: string, dwell: number) {
  useSage.getState().setPartial({ speaker, text });
  await wait(dwell);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
