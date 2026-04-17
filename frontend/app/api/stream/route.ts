import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const artifactBranch = process.env.NEXT_PUBLIC_GITHUB_ARTIFACTS_BRANCH || process.env.GITHUB_ARTIFACTS_BRANCH || 'artifacts';
          const r = await fetch(`https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/${artifactBranch}/frontend/cycle_state.json`, {
            cache: 'no-store',
          });
          if (r.ok) {
            const data = await r.json();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'cycle_state', payload: data })}\n\n`));
          }
        } catch {
          // ignore transient fetch failures
        }
      };

      await send();
      const iv = setInterval(send, 8000);
      const hb = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 25000);

      req.signal.addEventListener('abort', () => {
        clearInterval(iv);
        clearInterval(hb);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
