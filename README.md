# Show Graphics AD

Browser source graphics system for dual-format live production (16:9 + 9:16, 4K/30).
Researchers upload images remotely. Operator places them in the gallery. vMix displays live via browser source — no reload needed.

---

## Live URLs

| Page | URL | Who |
|---|---|---|
| Upload | https://edgarmohn-git.github.io/show-graphics_AD/upload.html | Researcher (or use Upload button in gallery) |
| Gallery / Operator | https://edgarmohn-git.github.io/show-graphics_AD/gallery.html | Operator |
| Display H (16:9) | https://edgarmohn-git.github.io/show-graphics_AD/graphic-h.html | vMix browser source |
| Display V (9:16) | https://edgarmohn-git.github.io/show-graphics_AD/graphic-v.html | vMix browser source |
| QR H (16:9) | https://edgarmohn-git.github.io/show-graphics_AD/qr-h.html?url=&size= | vMix browser source |
| QR V (9:16) | https://edgarmohn-git.github.io/show-graphics_AD/qr-v.html?url=&size= | vMix browser source |

---

## Architecture

```
Researcher/Operator → gallery.html → Cloudflare Worker → R2 (images) + KV (state + layouts)
                                                               ↓
vMix → graphic-h.html / graphic-v.html → polls KV every 1.5s → displays live
```

- Images stored permanently in **Cloudflare R2** — persist until deleted
- Active slot state and saved layouts in **Cloudflare KV** — layouts shared across all browsers
- All authenticated API calls require `X-API-Key` header or `?apikey=` URL param

---

## Infrastructure

| Component | Detail |
|---|---|
| Frontend | GitHub Pages (static HTML/CSS/JS, no build step) |
| Backend | Cloudflare Worker `show-graphics-ad.mohn-edgar.workers.dev` |
| Storage | Cloudflare R2 bucket `show-graphics-ad` |
| State | Cloudflare KV `SHOW_GRAPHICS_KV` |
| Canvas H | 3840 × 2160 px transparent (16:9) |
| Canvas V | 2160 × 3840 px transparent (9:16) |

---

## Gallery — Operator Guide

### Setup
1. Open gallery.html — enter API key → Save Key
2. Last active slot state is restored automatically on page reload
3. Saved layouts load automatically from the server — visible to all operators logged in with the same key

### Image Library (bottom section)
- Click **Set H** or **Set V** to assign an image to a slot
- Library images always load at default: scale 100%, Fit (show all), centered
- Then adjust scale, fit mode, and drag to position in the slot preview

### Slot controls
| Control | Function |
|---|---|
| Scale slider / number | Resize image (10–200%). Double-click number → reset to 100% |
| Fit (show all) | `object-fit: contain` — full image visible, transparent edges |
| Fill (crop to fit) | `object-fit: cover` — fills canvas, edges cropped |
| Drag in preview | Move image position on the transparent canvas |
| Clear | Remove image from slot |

### Preview grid
- **◉ Grid** toggle — show/hide grid overlay
- Grid fineness selector: Off / 2×2 up to 100×100 (default: 20×20)
- **Snap to grid** checkbox — drag snaps to nearest grid intersection
- Grid settings (on/off, size, snap) are persisted across page reloads

### Saved Layouts (top section)
- Type a name → **💾 Save H**, **💾 Save V**, or **💾 Save Both**
- Layout card appears with thumbnail — stores exact position, scale, fit
- **↩ H / ↩ V / ↩ Both** — recall to slot(s) instantly
- **✏️** — rename layout
- Layouts are stored on the server (Cloudflare KV) — shared across all browsers and operators
- Original images in library remain unchanged

### Upload
- Click **📤 Upload** in toolbar — upload directly without switching pages
- Supports: JPEG, PNG, WebP, AVIF, GIF, SVG, BMP — up to 100 MB/file
- Multi-file: select multiple → filenames used as names

### Multi-select delete
- **☑ Select** → check any image or layout cards → **🗑 Delete**

### Rebuild Index
- **⚙ Rebuild Index** — rescans R2 and rebuilds KV index (use if gallery shows empty after data loss)

---

## vMix Setup

| Input | URL | Size |
|---|---|---|
| Graphic H | `https://edgarmohn-git.github.io/show-graphics_AD/graphic-h.html` | 3840 × 2160 |
| Graphic V | `https://edgarmohn-git.github.io/show-graphics_AD/graphic-v.html` | 2160 × 3840 |

- Enable **transparent background** in vMix browser source settings
- Pages poll every 1.5s — no reload needed when operator switches images
- Position/scale/fit set in gallery is reflected live on the transparent canvas

### QR browser sources
```
qr-h.html?url=https://example.com&size=400
qr-v.html?url=https://example.com&size=400
```

---

## Worker API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/active?slot=h\|v` | public | Active slot state (polled by display pages) |
| GET | `/img/:key` | public | Serve image from R2 |
| GET | `/go?slot=&key=&...&apikey=` | URL param | Force graphic select (vMix scripting) |
| POST | `/upload` | X-API-Key | Upload image (multipart) |
| GET | `/list` | X-API-Key | List all images |
| GET | `/rebuild` | X-API-Key | Rebuild KV index from R2 |
| PUT | `/select` | X-API-Key | Set active image for slot |
| DELETE | `/select?slot=` | X-API-Key | Clear slot |
| DELETE | `/img/:key` | X-API-Key | Delete image |
| GET | `/layouts` | X-API-Key | List all saved layouts |
| PUT | `/layouts/:name` | X-API-Key | Save/update a layout |
| DELETE | `/layouts/:name` | X-API-Key | Delete a layout |

### GET /go — vMix trigger endpoint
Force any graphic into any slot via a single GET URL (usable from vMix scripts, Companion, web triggers):

```
/go?slot=h|v|both&key=FILENAME&scale=100&fit=contain&x=50&y=50&name=LABEL&apikey=KEY
```

| Param | Required | Default | Notes |
|---|---|---|---|
| `slot` | ✓ | — | `h`, `v`, or `both` |
| `key` | ✓ | — | Exact R2 filename |
| `apikey` | ✓ | — | Or use `X-API-Key` header |
| `scale` | — | 100 | 10–200 |
| `fit` | — | contain | `contain` or `cover` |
| `x` | — | 50 | Center X as % of canvas |
| `y` | — | 50 | Center Y as % of canvas |
| `name` | — | key | Display label in gallery |

---

## Positioning model

- Scale 100% = image fills the canvas (contain = letterboxed, cover = cropped)
- Scale 50% = half canvas size
- x/y = image center as % of canvas (0–100, default 50/50 = centered)
- Gallery preview is proportionally identical to display page — what you see is what vMix shows

---

## Persistent state

| What | Where | Scope |
|---|---|---|
| Active slot H/V | `localStorage` | Browser (restored on reload) |
| Grid on/off, size, snap | `localStorage` | Browser (restored on reload) |
| API key | `sessionStorage` | Browser tab (cleared on close — intentional) |
| Saved layouts | Cloudflare KV | Server — shared across all browsers |

---

## Storage

Images live in Cloudflare R2 — permanent object storage. No expiry, no auto-purge. Free tier: 10 GB. Images persist until explicitly deleted.

---

## Security notes

- API key stored in Cloudflare Secrets only — never in any file or commit
- CORS restricted to `https://edgarmohn-git.github.io`
- `/go` with `?apikey=` in URL: acceptable for private show use; key visible in logs. For stricter use, send key as `X-API-Key` header from vMix VB.NET script instead
- After each show: rotate key with `npx wrangler secret put API_KEY`

---

## Deploy workflow

```bash
cd /Users/drean/Ponyhof/show-graphics_AD
git add -A && git commit -m "..." && git push   # HTML/frontend changes
npx wrangler deploy                              # Worker changes
npx wrangler secret put API_KEY                 # Rotate API key
npx wrangler tail                               # Live Worker logs
```

---

## Project status

- ✅ Upload (modal in gallery + standalone upload.html), gallery, display pages H+V, QR pages
- ✅ Worker: R2 storage, KV state, authenticated API, /go vMix trigger endpoint
- ✅ Drag-to-place, scale, fit modes — gallery preview = display page (pixel-accurate)
- ✅ Crop, trim sides, color knock-out (hard + soft edges)
- ✅ Layout save/recall as grid cards — stored in Cloudflare KV, shared across browsers
- ✅ Layout thumbnails: show actual position/scale/fit; H-only/V-only/Both correctly proportioned
- ✅ Recall buttons greyed out for slots not included in a layout
- ✅ Multi-select delete (images + layouts), rename layouts
- ✅ Preview grid overlay (2×2 to 100×100, snap-to-grid, show/hide toggle, default 20×20)
- ✅ Grid preferences persistent across page reloads
- ✅ Auto-save slot state across page reloads
- ✅ Click thumbnail to preview (all card types); select mode: click thumbnail = toggle select
- ✅ Security: .gitignore, CORS origin enforced, API key never in code
- ⬜ Background reference images (vMix layout screenshots as positioning guide) — planned
- ⬜ Bitfocus Companion webhook (optional)
- ⬜ remove.bg API integration (optional)
