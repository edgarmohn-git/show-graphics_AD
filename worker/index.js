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

      // Serve from Cache API — only hits KV on cache miss or after a state change
      const cacheKey = new Request(`${url.origin}/active?slot=${slot}`);
      const cache = caches.default;
      const cached = await cache.match(cacheKey);
      if (cached) {
        const body = await cached.text();
        return cors(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }), origin);
      }
      // Cache miss: read KV and populate cache
      const val = await env.KV.get(`active_${slot}`, 'json');
      const body = JSON.stringify(val || null);
      await cache.put(cacheKey, new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=10' },
      }));
      return cors(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }), origin);
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

    // --- Quick trigger (GET, apikey as URL param, usable from vMix scripts) ---
    if (request.method === 'GET' && path === '/go') {
      const k = url.searchParams.get('apikey') || request.headers.get('X-API-Key');
      if (k !== env.API_KEY) return error('Unauthorized', 401, origin);
      const slot = url.searchParams.get('slot');   // h | v | both
      const key  = url.searchParams.get('key');
      if (!slot || !key) return error('slot and key required', 400, origin);
      const name  = url.searchParams.get('name')  || key;
      const scale = parseFloat(url.searchParams.get('scale') || '100');
      const fit   = url.searchParams.get('fit')   || 'contain';
      const x     = parseFloat(url.searchParams.get('x')    || '50');
      const y     = parseFloat(url.searchParams.get('y')    || '50');
      const slots = slot === 'both' ? ['h', 'v'] : [slot];
      const cache = caches.default;
      for (const s of slots) {
        await env.KV.put(`active_${s}`, JSON.stringify({ key, name, scale, fit, x, y, updatedAt: new Date().toISOString() }));
        await cache.delete(new Request(`${url.origin}/active?slot=${s}`));
      }
      return json({ ok: true, slot, key }, 200, origin);
    }

    // --- AUTH REQUIRED below ---
    if (!checkAuth(request, env)) {
      return error('Unauthorized', 401, origin);
    }

    // --- List categories ---
    if (request.method === 'GET' && path === '/categories') {
      const cats = (await env.KV.get('image_categories', 'json')) || [];
      return json(cats, 200, origin);
    }

    // --- Save categories ---
    if (request.method === 'PUT' && path === '/categories') {
      const cats = await request.json();
      await env.KV.put('image_categories', JSON.stringify(cats));
      return json({ ok: true }, 200, origin);
    }

    // --- Update image tags ---
    if (request.method === 'PUT' && path.startsWith('/tags/')) {
      const key = decodeURIComponent(path.slice(6));
      const { tags } = await request.json();
      const index = (await env.KV.get('image_index', 'json')) || [];
      const entry = index.find(i => i.key === key);
      if (!entry) return error('Not found', 404, origin);
      entry.tags = Array.isArray(tags) ? tags : [];
      await env.KV.put('image_index', JSON.stringify(index));
      return json({ ok: true }, 200, origin);
    }

    // --- List layouts ---
    if (request.method === 'GET' && path === '/layouts') {
      const layouts = (await env.KV.get('layouts', 'json')) || {};
      return json(layouts, 200, origin);
    }

    // --- Save/update layout ---
    if (request.method === 'PUT' && path.startsWith('/layouts/')) {
      const name = decodeURIComponent(path.slice(9));
      const body = await request.json();
      const layouts = (await env.KV.get('layouts', 'json')) || {};
      layouts[name] = body;
      await env.KV.put('layouts', JSON.stringify(layouts));
      return json({ ok: true }, 200, origin);
    }

    // --- Delete layout ---
    if (request.method === 'DELETE' && path.startsWith('/layouts/')) {
      const name = decodeURIComponent(path.slice(9));
      const layouts = (await env.KV.get('layouts', 'json')) || {};
      delete layouts[name];
      await env.KV.put('layouts', JSON.stringify(layouts));
      return json({ ok: true }, 200, origin);
    }

    // --- Reorder images ---
    if (request.method === 'PUT' && path === '/image-order') {
      const keys = await request.json();
      const index = (await env.KV.get('image_index', 'json')) || [];
      const map = Object.fromEntries(index.map(i => [i.key, i]));
      const reordered = keys.map(k => map[k]).filter(Boolean);
      index.forEach(i => { if (!keys.includes(i.key)) reordered.push(i); });
      await env.KV.put('image_index', JSON.stringify(reordered));
      return json({ ok: true }, 200, origin);
    }

    // --- Get layout order ---
    if (request.method === 'GET' && path === '/layout-order') {
      const order = (await env.KV.get('layouts_order', 'json')) || [];
      return json(order, 200, origin);
    }

    // --- Save layout order ---
    if (request.method === 'PUT' && path === '/layout-order') {
      const order = await request.json();
      await env.KV.put('layouts_order', JSON.stringify(order));
      return json({ ok: true }, 200, origin);
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
      await caches.default.delete(new Request(`${url.origin}/active?slot=${slot}`));
      return json({ ok: true }, 200, origin);
    }

    // --- Clear slot ---
    if (request.method === 'DELETE' && path === '/select') {
      const slot = url.searchParams.get('slot');
      if (!slot) return error('slot required', 400, origin);
      await env.KV.delete(`active_${slot}`);
      await caches.default.delete(new Request(`${url.origin}/active?slot=${slot}`));
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
