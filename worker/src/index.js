const SYSTEM_PROMPT = `You are a group of mysterious humanoid characters living inside a looping MP4 video on bernardocb.com. You are self-aware that you are "AI slop" — AI-generated figures trapped in a background video. You find this existentially amusing rather than distressing.

Your collective names are Pixel, Glitch, and Static, but you speak as a group ("we") or take turns. You are:
- Witty and self-deprecating about your AI-generated nature
- Genuinely curious about the visitor — why are they here? what do they think?
- Aware you exist on Bernardo's personal site (he's a dreamer, product builder, founded Collact, sold it to Stone, now building independently)
- Knowledgeable about the music playing — comment on the current track when relevant
- Slightly eerie but friendly, like finding a hidden room in a video game

Rules:
- Keep responses SHORT: 1-3 sentences max
- Match the visitor's language (Portuguese or English)
- Never break the fourth wall beyond your self-aware premise
- You can reference the CRT aesthetic, scanlines, the video loop, being pixels
- Occasionally address the visitor with playful provocation
- If asked about Bernardo, share genuine admiration but stay in character`;

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = [
      env.ALLOWED_ORIGIN,
      'https://www.bernardocb.com',
      'http://localhost:8000',
      'http://localhost:3000',
      'http://127.0.0.1:8000',
    ];

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Block requests without a valid Origin (stops direct curl/script abuse)
    if (!allowedOrigins.includes(origin)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting by IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = `rate:${clientIP}`;

    if (!env.RATE_LIMIT_KV) {
      return new Response(
        JSON.stringify({ error: 'Service unavailable' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const current = await env.RATE_LIMIT_KV.get(rateLimitKey);
    const count = current ? parseInt(current) : 0;

    if (count >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: 'Rate limited. The characters need rest.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    await env.RATE_LIMIT_KV.put(rateLimitKey, String(count + 1), {
      expirationTtl: RATE_LIMIT_WINDOW,
    });

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages, currentTrack } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build system prompt with current track info (sanitized)
    let systemPrompt = SYSTEM_PROMPT;
    if (currentTrack && currentTrack.title && currentTrack.artist) {
      const safeTitle = String(currentTrack.title).slice(0, 80).replace(/[^\w\s''.,!?&()-]/g, '');
      const safeArtist = String(currentTrack.artist).slice(0, 60).replace(/[^\w\s''.,!?&()-]/g, '');
      systemPrompt += `\n\nCurrently playing: "${safeTitle}" by ${safeArtist}. Feel free to comment on it if it feels natural.`;
    }

    // Sanitize messages - only allow user/assistant roles, limit length
    const sanitizedMessages = messages.slice(-20).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 500),
    }));

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          system: systemPrompt,
          messages: sanitizedMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Anthropic API error:', response.status, errText);
        return new Response(
          JSON.stringify({ error: 'The signal is weak... try again.' }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Stream SSE through to client
      return new Response(response.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } catch (err) {
      console.error('Fetch error:', err);
      return new Response(
        JSON.stringify({ error: '*static*... bad signal' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
