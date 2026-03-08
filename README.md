# Show Graphics AD

Browser source graphics system for dual-format live production (16:9 + 9:16, 4K/30).

Researchers upload device images remotely. The operator selects, scales, and places images in the gallery. vMix (or OBS) displays the result live via browser source — no page reload needed.

---

## Live URLs

| Page | URL | Who uses it |
|---|---|---|
| Upload | https://edgarmohn-git.github.io/show-graphics_AD/upload.html | Researcher (remote) |
| Gallery / Operator | https://edgarmohn-git.github.io/show-graphics_AD/gallery.html | Operator |
| Display H (16:9) | https://edgarmohn-git.github.io/show-graphics_AD/graphic-h.html | vMix / OBS browser source |
| Display V (9:16) | https://edgarmohn-git.github.io/show-graphics_AD/graphic-v.html | vMix / OBS browser source |
| QR H (16:9) | https://edgarmohn-git.github.io/show-graphics_AD/qr-h.html?url=&size= | vMix / OBS browser source |
| QR V (9:16) | https://edgarmohn-git.github.io/show-graphics_AD/qr-v.html?url=&size= | vMix / OBS browser source |

---

## How it works

```
Researcher → upload.html → Cloudflare R2 (storage) + KV (index)
                                        ↓
Operator   → gallery.html → selects image, places it, pushes state to KV
                                        ↓
vMix       → graphic-h/v.html → polls KV every 1.5s → displays image live
```

- Images are stored in **Cloudflare R2** (object storage).
- The image list and active slot state live in **Cloudflare KV** (key-value store).
- Display pages poll the worker every 1.5 seconds — no page reload needed when switching images.
- The display canvas is transparent. In vMix/OBS, the image appears on the exact transparent 4K background, positioned where the operator placed it.

---

## Infrastructure

| Component | Detail |
|---|---|
| Frontend | GitHub Pages (static HTML/CSS/JS) |
| Backend | Cloudflare Worker (`show-graphics-ad.mohn-edgar.workers.dev`) |
| Storage | Cloudflare R2 bucket `show-graphics-ad` |
| State | Cloudflare KV namespace `SHOW_GRAPHICS_KV` |
| Auth | `X-API-Key` header — set via `wrangler secret put API_KEY` |
| Canvas H | 3840 × 2160 px (16:9, 4K) |
| Canvas V | 2160 × 3840 px (9:16, 4K vertical) |

---

## For Researchers — Uploading Images

1. Open **upload.html**
2. Enter the API key and click **Save Key** (key is remembered for the session)
3. Select one or more image files (JPEG, PNG, WebP, AVIF, GIF, SVG, BMP — up to 100 MB each)
   - **1 file:** enter a custom name; preview shown
   - **Multiple files:** filenames are used as names automatically
4. Optionally add comma-separated tags (e.g. `phone, samsung, device`)
5. Click **Upload**

---

## For the Operator — Gallery

### Setup
1. Open **gallery.html**
2. Enter the API key in the toolbar and press Enter or click Load

### Selecting and placing an image

1. Browse the image grid — click a card to activate the **Select** button
2. Click **Select H** or **Select V** to assign the image to a slot
3. The slot preview (top of page) updates immediately
4. **Drag** inside the slot preview to position the image on the canvas
5. Adjust **Scale** with the slider or type a value directly (double-click to reset to 100%)
6. Choose **Fit mode:**
   - **Fit (show all)** — image fits entirely within the canvas, transparent areas around it
   - **Fill (crop to fit)** — image fills the full canvas, edges cropped
7. Changes go live in vMix within 1.5 seconds — no action required

### Scale reference

| Scale | Effect |
|---|---|
| 100% | Image fills the full slot canvas (contain = letterboxed, fill = cropped) |
| 50% | Image at half canvas size |
| 20% | Small — suitable for QR codes, logos, corner graphics |
| > 100% | Zoomed in — useful with Fill mode to reframe |

### Fit mode / positioning examples

- **QR code bottom-right:** Select QR image → Fit (show all) → Scale ~20% → drag to bottom-right corner
- **Silhouette shifted right:** Select portrait image → Fit (show all) → Scale 100% → drag right (transparent area appears on left)
- **Full-bleed background:** Select background image → Fill (crop to fit) → Scale 100% → centered

### Layout save and recall

- Type a name in the **Layout name** field
- **💾 H** — saves current H slot state only
- **💾 V** — saves current V slot state only
- **💾 Both** — saves both slots together
- Select a saved layout from the dropdown → click **Recall** to restore it
  - Recalling an H-only layout leaves V untouched (and vice versa)
- A thumbnail preview is shown in the dropdown for visual reference

### Editing images (crop, trim, color knock-out)

Click the **Edit** button on any image card to open the edit modal:

**Crop tab (cropperjs)**
- Drag the crop box to select a region, then click **Save Crop** — saves as a new PNG

**Trim sides**
- Individual sliders for Top / Right / Bottom / Left (0–49% each)
- Live preview updates as you drag
- Click **Apply + KO** after trimming to run knock-out on top

**Color Knock-out**
- Click the eyedropper cursor on the image to sample the background color
- Adjust **Tolerance** to control how aggressively similar colors are removed
- **KO Soft edges** — smoothstep falloff instead of hard cutoff; handles gradient/vignette backgrounds
- Click **Apply + KO** to run; result is shown in the preview canvas
- Click **Save as PNG** to store the result as a new image in the gallery

### Multi-select delete

1. Click **☑ Select** in the toolbar to enter select mode
2. Check any number of image cards
3. Click **Delete Selected** — confirms before deleting

### Rebuild index

If the image list is ever out of sync (e.g. after a manual R2 operation), click **⚙ Rebuild Index** in the toolbar. This scans R2 directly and rebuilds the KV index.

---

## vMix Setup

Add two browser sources:

| Input name | URL | Canvas size |
|---|---|---|
| Graphic H | `https://edgarmohn-git.github.io/show-graphics_AD/graphic-h.html` | 3840 × 2160 |
| Graphic V | `https://edgarmohn-git.github.io/show-graphics_AD/graphic-v.html` | 2160 × 3840 |

- Enable **transparent background** in browser source settings
- No reload is needed when the operator switches images — the page polls and updates automatically

### QR browser sources

Pass `url` and `size` as query parameters:

```
qr-h.html?url=https://example.com&size=400
qr-v.html?url=https://example.com&size=400
```

`size` is the QR code pixel size (default 300). The page background is transparent.

---

## Worker API

All authenticated endpoints require header `X-API-Key: <key>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/active?slot=h\|v` | public | Active slot state (polled by display pages) |
| GET | `/img/:key` | public | Serve image from R2 |
| POST | `/upload` | ✓ | Upload image (multipart: file, name, tags) |
| GET | `/list` | ✓ | List all images (KV index) |
| GET | `/rebuild` | ✓ | Rebuild KV index from R2 |
| PUT | `/select` | ✓ | Set active image for a slot |
| DELETE | `/select?slot=` | ✓ | Clear a slot |
| DELETE | `/img/:key` | ✓ | Delete image from R2 and index |

**PUT /select payload:**
```json
{ "slot": "h", "key": "filename.jpg", "name": "Samsung S25", "scale": 100, "fit": "contain", "x": 50, "y": 50 }
```
`x` and `y` are the image center position as a percentage of the canvas (0–100, default 50).

---

## Supported image formats

JPEG, PNG, WebP, AVIF, GIF, SVG, BMP — up to 100 MB per file.

---

## Deploy / development

```bash
cd /Users/drean/Ponyhof/show-graphics_AD

# Deploy HTML changes
git add -A && git commit -m "..." && git push

# Deploy Worker changes
npx wrangler deploy

# Reset API key
npx wrangler secret put API_KEY

# Watch Worker logs
npx wrangler tail
```

GitHub Pages serves the frontend. The Cloudflare Worker is deployed separately via Wrangler.

---

## Project status

- ✅ Upload (single + multi-file), gallery, display pages (H + V), QR pages
- ✅ Worker: R2 storage, KV state, authenticated API
- ✅ Drag-to-place, scale, fit modes, position sync gallery ↔ display pages
- ✅ Crop (cropperjs), trim sides, color knock-out (hard + soft edges)
- ✅ Layout save/recall with thumbnails (localStorage, per-slot)
- ✅ Multi-select delete, rebuild index
- ⬜ Bitfocus Companion webhook (optional)
- ⬜ remove.bg API integration (optional)
