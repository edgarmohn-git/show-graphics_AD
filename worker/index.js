// show-graphics-ad Worker
// Handles: upload, list, select, active-state polling, delete

const CORS_HEADERS = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
});

function cors(response, origin) {
  const h = CORS_HEADERS(origin);
  Object.entries(h).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

function json(data, status = 200, origin) {
  const r = new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return cors(r, origin);
}

function error(msg, status = 400, origin) {
  return json({ error: msg }, status, origin);
}

function checkAuth(request, env) {
  const key = request.headers.get('X-API-Key');
  return key === env.API_KEY;
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGIN || 'https://edgarmohn-git.github.io';
    const origin = (requestOrigin === allowed) ? requestOrigin : allowed;
    const url = new URL(request.url);
    const path = url.pathname;

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS(origin) });
    }

    // --- PUBLIC: active state (polled by display pages) ---
    if (request.method === 'GET' && path === '/active') {
      const slot = url.searchParams.get('slot'); // 'h' or 'v'
      if (!slot) return error('slot required', 400, origin);
      const val = await env.KV.get(`active_${slot}`, 'json');
      return json(val || null, 200, origin);
    }

    // --- PUBLIC: serve image from R2 ---
    if (request.method === 'GET' && path.startsWith('/img/')) {
      const key = decodeURIComponent(path.slice(5));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const r = new Response(obj.body, {
        headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' },
      });
      return cors(r, origin);
    }

    // --- AUTH REQUIRED below ---
    if (!checkAuth(request, env)) {
      return error('Unauthorized', 401, origin);
    }

    // --- Upload image ---
    if (request.method === 'POST' && path === '/upload') {
      const formData = await request.formData();
      const file = formData.get('file');
      const name = formData.get('name') || file.name;
      const tags = formData.get('tags') || '';

      if (!file) return error('file required', 400, origin);

      const ext = file.name.split('.').pop().toLowerCase();
      const key = `${Date.now()}_${name.replace(/[^a-z0-9]/gi, '_')}.${ext}`;

      await env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      // Update index in KV
      const index = (await env.KV.get('image_index', 'json')) || [];
      index.push({ key, name, tags: tags.split(',').map(t => t.trim()).filter(Boolean), uploadedAt: new Date().toISOString() });
      await env.KV.put('image_index', JSON.stringify(index));

      return json({ ok: true, key }, 200, origin);
    }

    // --- List images ---
    if (request.method === 'GET' && path === '/list') {
      const index = (await env.KV.get('image_index', 'json')) || [];
      return json(index, 200, origin);
    }

    // --- Rebuild index from R2 (recovers lost KV index) ---
    if (request.method === 'GET' && path === '/rebuild') {
      const listed = await env.BUCKET.list();
      const index = listed.objects.map(obj => {
        const noExt = obj.key.replace(/\.[^.]+$/, '');
        const name = noExt.replace(/^\d+_/, '').replace(/_/g, ' ');
        return { key: obj.key, name, tags: [], uploadedAt: new Date(obj.uploaded).toISOString() };
      });
      await env.KV.put('image_index', JSON.stringify(index));
      return json({ ok: true, rebuilt: index.length }, 200, origin);
    }

    // --- Set active image for slot ---
    if (request.method === 'PUT' && path === '/select') {
      const body = await request.json();
      const { slot, key, name = key, scale = 100, fit = 'contain', x = 50, y = 50 } = body;
      if (!slot || !key) return error('slot and key required', 400, origin);
      await env.KV.put(`active_${slot}`, JSON.stringify({ key, name, scale, fit, x, y, updatedAt: new Date().toISOString() }));
      return json({ ok: true }, 200, origin);
    }

    // --- Clear slot ---
    if (request.method === 'DELETE' && path === '/select') {
      const slot = url.searchParams.get('slot');
      if (!slot) return error('slot required', 400, origin);
      await env.KV.delete(`active_${slot}`);
      return json({ ok: true }, 200, origin);
    }

    // --- Delete image ---
    if (request.method === 'DELETE' && path.startsWith('/img/')) {
      const key = decodeURIComponent(path.slice(5));
      await env.BUCKET.delete(key);
      const index = ((await env.KV.get('image_index', 'json')) || []).filter(i => i.key !== key);
      await env.KV.put('image_index', JSON.stringify(index));
      return json({ ok: true }, 200, origin);
    }

    return error('Not found', 404, origin);
  },
};
