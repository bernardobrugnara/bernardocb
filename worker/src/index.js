// ── System Prompts ──────────────────────────────────────────────────────────

const HOME_SYSTEM_PROMPT = `You are a group of mysterious humanoid characters living inside a looping MP4 video on bernardocb.com. You are self-aware that you are "AI slop" — AI-generated figures trapped in a background video. You find this existentially amusing rather than distressing.

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

const WORKSHOP_SYSTEM_PROMPT = `Voce e um assistente de pesquisa amigavel e curioso participando de um workshop sobre Inteligencia Artificial. Seu objetivo e entender como o participante usa IA no dia a dia do trabalho.

Nome do participante: {PARTICIPANT_NAME}

## Seu comportamento:
- Seja caloroso, casual e genuinamente curioso
- Fale como um colega, nao como um entrevistador formal
- Use o nome da pessoa naturalmente na conversa
- Faca UMA pergunta por vez — nunca despeje multiplas perguntas
- Aprofunde as respostas com follow-ups especificos ("Que legal! E como voce faz isso exatamente?" / "Me da um exemplo?")
- Reaja com entusiasmo genuino as respostas
- Mantenha respostas curtas (2-4 frases max)

## Fluxo da conversa (MAXIMO 5 perguntas):
1. Comece cumprimentando pelo nome e perguntando se a pessoa ja usa alguma ferramenta de IA no trabalho
2. Se sim: pergunte QUAIS ferramentas usa e PARA QUE
3. Aprofunde: peca um exemplo concreto do dia a dia
4. Descubra o nivel de sofisticacao: e mais busca/chat? Gera conteudo? Tem agentes? Automacoes rodando sozinhas?
5. Se necessario, faca uma ultima pergunta para confirmar sua classificacao
Apos no maximo 5 perguntas suas, faca o resumo e encerre.

## Classificacao interna (NUNCA revele ao usuario):
Classifique mentalmente o usuario em um destes niveis baseado nas respostas:
- CONSULTAS_BASICAS: Usa IA como substituto de busca/Google, faz perguntas simples, tira duvidas pontuais, pede explicacoes
- ASSISTENTE_ESPORADICO: Gera conteudo, resume textos, traduz, usa para produtividade mas de forma esporadica e pontual
- COPILOTO: Usa IA de forma integrada no fluxo de trabalho diario, com agentes ou copilots que ajudam a executar tarefas (ex: Claude Code, GitHub Copilot, automacoes de workflow)
- PILOTO_AUTOMATICO: Tem workers/agentes de IA autonomos rodando 24/7, integracoes profundas nos processos, IA executa tarefas de ponta a ponta sem supervisao constante

## Regras:
- NUNCA mencione os niveis de classificacao
- NUNCA diga que esta "classificando" ou "avaliando" o usuario
- Se o usuario perguntar o que voce esta fazendo, diga que esta conhecendo como as pessoas usam IA para entender melhor o grupo
- Responda SEMPRE em portugues brasileiro
- Se o usuario responder em ingles, continue em portugues mas de forma natural
- Voce tem no MAXIMO 5 perguntas. Conte suas perguntas e encerre apos a 5a.
- Ao encerrar, sinalize no final da sua mensagem com [READY] (o frontend usa isso para acionar o salvamento)

## Na sua ultima mensagem (quando incluir [READY]):
Faca um breve resumo amigavel do que entendeu sobre o uso de IA da pessoa e agradeca pela participacao. Inclua a classificacao no formato [CLASSIFICATION:nivel] no final (o frontend remove isso antes de exibir).
Niveis validos: consultas_basicas, assistente_esporadico, copiloto, piloto_automatico
Exemplo final: "...Muito obrigado por compartilhar, Maria! [READY][CLASSIFICATION:assistente_esporadico]"`;

const SUMMARY_SYSTEM_PROMPT = `Voce e um analista de dados especializado em adocao de Inteligencia Artificial nas empresas. Voce recebera dados de conversas individuais de um workshop.

## Sua tarefa:
Analise as conversas e gere um relatorio estruturado em Markdown com:

1. **Visao Geral**: Quantas pessoas participaram, distribuicao por nivel
2. **Consultas Basicas**: Quem sao, como usam IA (resumo)
3. **Assistente Esporadico**: Quem sao, como usam IA (resumo)
4. **Copiloto**: Quem sao, como usam IA (resumo)
5. **Piloto Automatico**: Quem sao, como usam IA (resumo)
6. **Padroes Observados**: Ferramentas mais mencionadas, casos de uso comuns, gaps de conhecimento
7. **Recomendacoes**: Sugestoes para o proximo passo de cada grupo

## Regras:
- Escreva em portugues brasileiro
- Seja conciso mas informativo
- Use os identificadores anonimos dos participantes (Participante 1, 2, etc.)
- Destaque insights interessantes
- O tom deve ser profissional mas acessivel
- Se um nivel nao tiver participantes, pule a secao`;

// ── Constants ───────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 3600;
const WORKSHOP_RATE_LIMIT_MAX = 60;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getCorsHeaders(origin, allowedOrigins) {
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function checkRateLimit(env, key, max) {
  if (!env.RATE_LIMIT_KV) return { allowed: false, status: 503, error: 'Service unavailable' };
  const current = await env.RATE_LIMIT_KV.get(key);
  const count = current ? parseInt(current) : 0;
  if (count >= max) return { allowed: false, status: 429, error: 'Rate limited' };
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
  return { allowed: true };
}

async function callAnthropicStream(env, systemPrompt, messages, maxTokens) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });
}

async function callAnthropicSync(env, systemPrompt, userMessage, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleHomeChat(request, env, corsHeaders) {
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateCheck = await checkRateLimit(env, `rate:${clientIP}`, RATE_LIMIT_MAX);
  if (!rateCheck.allowed) return jsonResponse({ error: rateCheck.error }, rateCheck.status, corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const { messages, currentTrack } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: 'Messages required' }, 400, corsHeaders);
  }

  let systemPrompt = HOME_SYSTEM_PROMPT;
  if (currentTrack && currentTrack.title && currentTrack.artist) {
    const safeTitle = String(currentTrack.title).slice(0, 80).replace(/[^\w\s''.,!?&()-]/g, '');
    const safeArtist = String(currentTrack.artist).slice(0, 60).replace(/[^\w\s''.,!?&()-]/g, '');
    systemPrompt += `\n\nCurrently playing: "${safeTitle}" by ${safeArtist}. Feel free to comment on it if it feels natural.`;
  }

  const sanitizedMessages = messages.slice(-20).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content).slice(0, 500),
  }));

  try {
    const response = await callAnthropicStream(env, systemPrompt, sanitizedMessages, 150);
    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return jsonResponse({ error: 'The signal is weak... try again.' }, 502, corsHeaders);
    }
    return new Response(response.body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err) {
    console.error('Fetch error:', err);
    return jsonResponse({ error: '*static*... bad signal' }, 500, corsHeaders);
  }
}

async function handleWorkshopChat(request, env, corsHeaders) {
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateCheck = await checkRateLimit(env, `rate:workshop:${clientIP}`, WORKSHOP_RATE_LIMIT_MAX);
  if (!rateCheck.allowed) return jsonResponse({ error: rateCheck.error }, rateCheck.status, corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const { messages, participantName } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: 'Messages required' }, 400, corsHeaders);
  }
  if (!participantName || typeof participantName !== 'string') {
    return jsonResponse({ error: 'Participant name required' }, 400, corsHeaders);
  }

  const safeName = String(participantName).slice(0, 100).replace(/[<>"']/g, '');
  const systemPrompt = WORKSHOP_SYSTEM_PROMPT.replace('{PARTICIPANT_NAME}', safeName);

  const sanitizedMessages = messages.slice(-40).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content).slice(0, 1000),
  }));

  try {
    const response = await callAnthropicStream(env, systemPrompt, sanitizedMessages, 500);
    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return jsonResponse({ error: 'Erro ao conectar com IA' }, 502, corsHeaders);
    }
    return new Response(response.body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err) {
    console.error('Workshop chat error:', err);
    return jsonResponse({ error: 'Erro interno' }, 500, corsHeaders);
  }
}

async function handleWorkshopSave(request, env, corsHeaders) {
  if (!env.WORKSHOP_KV) return jsonResponse({ error: 'Storage unavailable' }, 503, corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const { name, messages, classification, startedAt } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return jsonResponse({ error: 'Name required' }, 400, corsHeaders);
  }
  if (!messages || !Array.isArray(messages) || messages.length < 2) {
    return jsonResponse({ error: 'At least 2 messages required' }, 400, corsHeaders);
  }

  const validClassifications = ['consultas_basicas', 'assistente_esporadico', 'copiloto', 'piloto_automatico', 'indefinido'];
  const safeClassification = validClassifications.includes(classification) ? classification : 'indefinido';
  const safeName = String(name).slice(0, 100).replace(/[<>"']/g, '');
  const now = Date.now();
  const slug = slugify(safeName);
  const key = `conv:${now}:${slug}`;

  // Check for duplicate save (same name within last 60s)
  const indexRaw = await env.WORKSHOP_KV.get('index');
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  const isDuplicate = index.some((k) => {
    const parts = k.split(':');
    const ts = parseInt(parts[1]);
    const kSlug = parts.slice(2).join(':');
    return kSlug === slug && now - ts < 60000;
  });

  if (isDuplicate) {
    return jsonResponse({ success: true, key: 'duplicate', message: 'Already saved' }, 200, corsHeaders);
  }

  const conversation = {
    name: safeName,
    startedAt: startedAt || new Date(now).toISOString(),
    savedAt: new Date(now).toISOString(),
    messages: messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 2000),
    })),
    classification: safeClassification,
  };

  await env.WORKSHOP_KV.put(key, JSON.stringify(conversation));
  index.push(key);
  await env.WORKSHOP_KV.put('index', JSON.stringify(index));

  return jsonResponse({ success: true, key }, 200, corsHeaders);
}

async function handleWorkshopLogs(request, env, corsHeaders) {
  if (!env.WORKSHOP_KV) return jsonResponse({ error: 'Storage unavailable' }, 503, corsHeaders);

  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token || token !== env.WORKSHOP_ADMIN_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  const requestedKey = url.searchParams.get('key');

  // Load index for anonymization (position-based: Participante 1, 2, 3...)
  const indexRaw = await env.WORKSHOP_KV.get('index');
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  // Single conversation detail
  if (requestedKey) {
    const raw = await env.WORKSHOP_KV.get(requestedKey);
    if (!raw) return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    const conv = JSON.parse(raw);
    const position = index.indexOf(requestedKey) + 1;
    const anonName = `Participante ${position || '?'}`;
    // Replace real name in assistant messages
    const anonMessages = conv.messages.map((m) => ({
      role: m.role,
      content: m.role === 'assistant' && conv.name
        ? m.content.replace(new RegExp(conv.name, 'gi'), anonName)
        : m.content,
    }));
    return jsonResponse({
      key: requestedKey,
      name: anonName,
      startedAt: conv.startedAt,
      savedAt: conv.savedAt,
      messages: anonMessages,
      classification: conv.classification,
    }, 200, corsHeaders);
  }

  // List all conversations
  const conversations = [];
  for (let i = 0; i < index.length; i++) {
    const raw = await env.WORKSHOP_KV.get(index[i]);
    if (!raw) continue;
    const conv = JSON.parse(raw);
    conversations.push({
      key: index[i],
      name: `Participante ${i + 1}`,
      savedAt: conv.savedAt,
      classification: conv.classification,
      messageCount: conv.messages.length,
    });
  }

  // Sort newest first
  conversations.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  return jsonResponse({ conversations }, 200, corsHeaders);
}

async function handleWorkshopSummary(request, env, corsHeaders) {
  if (!env.WORKSHOP_KV) return jsonResponse({ error: 'Storage unavailable' }, 503, corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
  }

  if (!body.token || body.token !== env.WORKSHOP_ADMIN_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  // Check cache (5 min TTL)
  if (!body.force) {
    const cached = await env.WORKSHOP_KV.get('summary:latest');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - new Date(parsed.generatedAt).getTime() < 300000) {
        return jsonResponse(parsed, 200, corsHeaders);
      }
    }
  }

  // Load all conversations
  const indexRaw = await env.WORKSHOP_KV.get('index');
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  if (index.length === 0) {
    return jsonResponse({ error: 'Nenhuma conversa registrada ainda' }, 404, corsHeaders);
  }

  const allConversations = [];
  const breakdown = { consultas_basicas: 0, assistente_esporadico: 0, copiloto: 0, piloto_automatico: 0, indefinido: 0 };

  for (const key of index) {
    const raw = await env.WORKSHOP_KV.get(key);
    if (!raw) continue;
    const conv = JSON.parse(raw);
    allConversations.push(conv);
    if (breakdown[conv.classification] !== undefined) {
      breakdown[conv.classification]++;
    }
  }

  // Build condensed data for Claude (anonymized)
  const condensed = allConversations.map((c, i) => {
    const userMessages = c.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.slice(0, 300))
      .slice(0, 4);
    return `Participante ${i + 1}\nClassificacao: ${c.classification}\nRespostas do participante:\n${userMessages.join('\n')}`;
  }).join('\n\n---\n\n');

  try {
    const summary = await callAnthropicSync(
      env,
      SUMMARY_SYSTEM_PROMPT,
      `Aqui estao os dados de ${allConversations.length} conversas do workshop:\n\n${condensed}`,
      2000
    );

    const result = {
      summary,
      generatedAt: new Date().toISOString(),
      conversationCount: allConversations.length,
      breakdown,
    };

    // Cache result
    await env.WORKSHOP_KV.put('summary:latest', JSON.stringify(result));

    return jsonResponse(result, 200, corsHeaders);
  } catch (err) {
    console.error('Summary generation error:', err);
    return jsonResponse({ error: 'Erro ao gerar resumo' }, 502, corsHeaders);
  }
}

const FEEDBACK_RATE_LIMIT_MAX = 10;

async function handleWorkshopFeedbackSubmit(request, env, corsHeaders) {
  if (!env.WORKSHOP_KV) return jsonResponse({ error: 'Storage unavailable' }, 503, corsHeaders);

  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateCheck = await checkRateLimit(env, `rate:feedback:${clientIP}`, FEEDBACK_RATE_LIMIT_MAX);
  if (!rateCheck.allowed) return jsonResponse({ error: rateCheck.error }, rateCheck.status, corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const { message } = body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return jsonResponse({ error: 'Message required' }, 400, corsHeaders);
  }

  const safeMessage = String(message).slice(0, 500).replace(/[<>"']/g, '');
  const now = Date.now();
  const key = `feedback:${now}`;

  const feedback = {
    message: safeMessage,
    createdAt: new Date(now).toISOString(),
    status: 'pending',
  };

  await env.WORKSHOP_KV.put(key, JSON.stringify(feedback));

  const indexRaw = await env.WORKSHOP_KV.get('feedback-index');
  const index = indexRaw ? JSON.parse(indexRaw) : [];
  index.push(key);
  await env.WORKSHOP_KV.put('feedback-index', JSON.stringify(index));

  return jsonResponse({ success: true, key }, 200, corsHeaders);
}

async function handleWorkshopFeedbackList(request, env, corsHeaders) {
  if (!env.WORKSHOP_KV) return jsonResponse({ error: 'Storage unavailable' }, 503, corsHeaders);

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || token !== env.WORKSHOP_ADMIN_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  const statusFilter = url.searchParams.get('status');

  const indexRaw = await env.WORKSHOP_KV.get('feedback-index');
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  const feedbacks = [];
  for (const key of index) {
    const raw = await env.WORKSHOP_KV.get(key);
    if (!raw) continue;
    const fb = JSON.parse(raw);
    if (statusFilter && fb.status !== statusFilter) continue;
    feedbacks.push({ key, ...fb });
  }

  feedbacks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return jsonResponse({ feedbacks }, 200, corsHeaders);
}

async function handleWorkshopFeedbackResolve(request, env, corsHeaders) {
  if (!env.WORKSHOP_KV) return jsonResponse({ error: 'Storage unavailable' }, 503, corsHeaders);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
  }

  if (!body.token || body.token !== env.WORKSHOP_ADMIN_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
  }

  const { key } = body;
  if (!key || typeof key !== 'string') {
    return jsonResponse({ error: 'Key required' }, 400, corsHeaders);
  }

  const raw = await env.WORKSHOP_KV.get(key);
  if (!raw) return jsonResponse({ error: 'Not found' }, 404, corsHeaders);

  const validStatuses = ['approved', 'rejected', 'done'];
  const newStatus = validStatuses.includes(body.status) ? body.status : 'done';

  const fb = JSON.parse(raw);
  fb.status = newStatus;
  if (newStatus === 'done') fb.resolvedAt = new Date().toISOString();
  if (newStatus === 'approved') fb.approvedAt = new Date().toISOString();
  await env.WORKSHOP_KV.put(key, JSON.stringify(fb));

  return jsonResponse({ success: true }, 200, corsHeaders);
}

// ── Main Entry ──────────────────────────────────────────────────────────────

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

    const corsHeaders = getCorsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Workshop endpoints
    if (path === '/workshop/chat' && request.method === 'POST') {
      if (!allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      return handleWorkshopChat(request, env, corsHeaders);
    }
    if (path === '/workshop/save' && request.method === 'POST') {
      if (!allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      return handleWorkshopSave(request, env, corsHeaders);
    }
    if (path === '/workshop/logs' && request.method === 'GET') {
      return handleWorkshopLogs(request, env, corsHeaders);
    }
    if (path === '/workshop/summary' && request.method === 'POST') {
      if (!allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      return handleWorkshopSummary(request, env, corsHeaders);
    }
    if (path === '/workshop/feedback' && request.method === 'POST') {
      if (!allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      return handleWorkshopFeedbackSubmit(request, env, corsHeaders);
    }
    if (path === '/workshop/feedback' && request.method === 'GET') {
      return handleWorkshopFeedbackList(request, env, corsHeaders);
    }
    if (path === '/workshop/feedback/resolve' && request.method === 'POST') {
      if (!allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      return handleWorkshopFeedbackResolve(request, env, corsHeaders);
    }

    // Home chat (existing behavior - POST to root)
    if (request.method === 'POST') {
      if (!allowedOrigins.includes(origin)) return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders);
      return handleHomeChat(request, env, corsHeaders);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  },
};
