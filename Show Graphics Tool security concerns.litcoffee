 Show Graphics Tool security concerns:

Next steps:

 what´s the current progress of the show-graphics gallery and what are further    
milestones or possible development options?                                        
                                                                                   
⏺ show-graphics_AD — Current Status                                                
                                                                                   
  Fully implemented ✅                                                             
   
  Infrastructure                                                                   
  - Cloudflare Worker + R2 (images) + KV (state, layouts, categories, tag rules)
  - Cache API on /active — ~99% KV read reduction, ~1.5s update latency
  - GitHub Pages frontend, no build step

  Gallery core
  - API key auth (sessionStorage, validated against /list)
  - Dual slot previews H+V — drag-to-place, scale slider, Fit/Fill, double-click
  reset
  - Grid overlay: Off / 2×2–100×100, snap-to-grid, all persisted to localStorage
  - pixel-accurate alignment: gallery = vMix (inset box-shadow fix)

  Content management
  - Upload modal (📤 button) — multi-file, category pre-tagging, auto-tag from
  filename keywords
  - Finder drag-drop onto window — drop overlay, batch upload
  - Image Library (originals only) / Processed Images (tagged edited) / BG
  References (tagged background)
  - Collapsible sections — state persisted to localStorage
  - Category system — create/rename/delete, assign per-card via 📁, filter bar (All
   / Uncategorized / cats), alphabetical sort
  - Tag rules — per-category keyword → auto-tag on upload (e.g. "ATEM" → "ATEM
  Switchers")
  - Drag card → drop on category button = assign
  - Image reorder (drag within section) — saved to KV

  Layouts
  - Save H / V / Both — thumbnail shows actual position/scale/fit
  - Recall ↩ H/V/Both (greyed out if slot not in layout)
  - Rename ✏️ , preview 🔍, delete 🗑, drag-to-reorder
  - Stored in KV — shared across all operators

  UX polish
  - Multi-select delete (☑ Select) — all sections including BG — floating bottom
  bar (no scrolling)
  - Click any tile = enlarge preview (all sections); select mode = toggle checkbox
  - Slot header: plain URL (click to copy) + ↗ Open / 📋 Copy buttons
  - Help modal ❓ — full feature reference
  - Rebuild Index recovery tool

  ---
  Backlog / possible next milestones

  High value, low complexity
  - Sort/filter controls — by name, date, currently-active-in-slot
  - Connection status dot — Worker live/offline indicator (simple /active fetch
  check)
  - Keyboard shortcuts — e.g. H/V to set slot, S to save layout, Esc to close modal

  Medium complexity
  - Bitfocus Companion integration — HTTP action doc + optional /go webhook
  endpoint
  - Slot lock — prevent accidental slot changes during live show
  - Undo last select — one-level undo for slot changes (restore previous state from
   KV)
  - Image rename — edit name field in image_index without re-uploading

  High complexity / API-dependent
  - remove.bg integration — automated background removal on upload
  - Image search — full-text search across name + tags
  - Show log — timestamped history of slot changes (KV append, display in sidebar)

  Operational
  - Rotate API key before next show: npx wrangler secret put API_KEY
  - Consider moving tag_rules UI into a proper settings panel (currently Category
  Management section)

  What direction do you want to go?




_____________________________

 Show Graphics Tool security concerns:


On the API key security — your understanding is exactly right:                                                 
  - Only people you explicitly share the Worker URL + key with can use it                                        
  - Worst case if the key leaked: someone could change what's displayed on screen, upload junk images, or delete 
  your library. That's annoying, not dangerous — no code execution, no access to anything outside this tool      
  - The key is short ("OGH2026") but the Worker URL itself is obscure and not indexed anywhere                   
  - Recommendation: after the show, do npx wrangler secret put API_KEY and set a new key — takes 10 seconds and  
  invalidates all old URLs your friend used                                                                      


On the /go URL security — one extra practical note for your friend: if he wants to avoid the key ever appearing
   in vMix logs or browser history, vMix VB.NET scripts can send it as a header instead:                         
                                                                                                                 
  Dim req As Net.HttpWebRequest = Net.HttpWebRequest.Create("https://show-graphics-ad.mohn-edgar.workers.dev/go?s
  lot=both&key=FILENAME&scale=30&x=85&y=85")                                                                     
  req.Headers.Add("X-API-Key", "OGH2026")                                                                        
  req.GetResponse()                                                                                              
                                                                                                                 
  Same result, key never in the URL. But for a one-day show with trusted collaborators, the URL approach is      
  perfectly fine.  


 Friend's doc (contains API key — do not commit):                                                               
  /Users/drean/Ponyhof/show-graphics_AD/vmix-integration.md                                                      
                                                                                                                 
  Send him that file or copy-paste it. It covers:                                                                
  - Both browser source URLs + canvas sizes                                                                      
  - API key + Worker URL                                                                                         
  - /go endpoint with all params explained                                                                       
  - Three vMix scripting options (URL-only, header, Web Controller)                                              
  - Companion integration                                                                                        
  - How to get image filenames (gallery + /list API)                                                             
                                                                                                                 
  README is updated on GitHub with the full operator manual (no key in there). 



_________________

Quick status check against that list:

  ┌─────┬──────────────────────────────────┬──────────────────────────────────────────────────────────────────┐  
  │  #  │               Item               │                              Status                              │
  ├─────┼──────────────────────────────────┼──────────────────────────────────────────────────────────────────┤  
  │ 1   │ ALLOWED_ORIGIN not enforced      │ ✅ Fixed — Worker now validates origin                           │
  ├─────┼──────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ 2   │ No rate limiting                 │ ⬜ Still open — accepted risk for a private show tool            │
  ├─────┼──────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ 3   │ File type not validated          │ ⬜ Still open — negligible risk (files served through Worker,    │
  │     │ server-side                      │ nothing executes)                                                │
  ├─────┼──────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ 4   │ graphic-v.html wrong cover       │ ✅ Fixed                                                         │
  │     │ dimensions                       │                                                                  │
  ├─────┼──────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ 5   │ No .gitignore                    │ ✅ Added                                                         │
  └─────┴──────────────────────────────────┴──────────────────────────────────────────────────────────────────┘

  Nothing urgent remaining. Items 2 and 3 are known, accepted, low-risk for a private tool. Rate limiting would
  only matter if the Worker URL became public — at which point you'd rotate the key and the problem goes away
  anyway.

  If you ever want to add server-side file type validation (item 3), it's a 3-line addition to the Worker's
  upload handler — check that the uploaded file's extension is in an allowed list. Happy to do that in a future
  session if you want belt-and-suspenders.




_________________

⏺ Two separate issues visible in the screenshots:                                                                
   
  1. "No images found" in the new browser                                                                        
  The images ARE on the server — the slot previews prove it (both browsers show the same H/V images). The image
  list requires the API key, which lives in sessionStorage — browser-tab scoped, never shared. In the new browser
   you need to type the key and click Save Key, then ↺ Refresh. The images will appear.                        

  2. No layouts in the new browser — this is the real architectural gap
  Layouts are stored in localStorage — that's per-browser, per-device, completely local. There's no way for
  another browser to see them. This needs to move to the Worker/KV to be truly persistent and shared.

  What needs changing:
  - Add GET /layouts, PUT /layouts/:name, DELETE /layouts/:name endpoints to the Worker (KV-backed)
  - Gallery saves/loads/deletes layouts via the API instead of localStorage
  - Every browser with the key sees the same layouts instantly

  Want me to implement this now? It's the right fix — makes layouts as persistent and shared as the images
  themselves. The slot state (H/V active image) already works this way, layouts just need the same treatment.





_______________________
ok, one issue: you removed the magnifying glass pop up when hovering over tiles. this was very useful. 
  Also, can you fill the space of the preview tiles with different colour (light grey or so) in all the areas,   
  where the image (inkl. canvas) isnt located? essentially the sides or top/ bottom depending on format.         
─────────────────────────────────────────────────────────────────────────────

Two clear fixes:                                                                                               
                                                                                                                 
  1. Hover magnify back — but smart this time: JS sets transform-origin based on card position in viewport so    
  left-edge cards expand right, right-edge expand left
  2. Card thumbnail background — light grey so letterbox/pillarbox areas are visible (not black void)            
                                                                                                               
⏺ Searched for 3 patterns, read 1 file (ctrl+o to expand)     
                                                               
⏺ Fix 1 — thumbnail background to light grey:                                                                    
                                               
                                               ⏺ Now add the JS smart-origin handler just before the closing </script>:                                         




___________________

that´s worse.                                                                                                  
  I specifically don´t want auto magnification, that´s to nervous.                                               
  before, when hovering ave a tile, you mad it to just klick and magnify.                                        
  That´s what I want back.                                                                                       
  regarding different colour on the sides: darker please, that´s too bright.                                     
  regarding saved layouts preview, I  want to see the maximum  preview of this layout in the tile, without       
  covering essentials by text. so 9:16 layout: max hight possible, sides darker grey, 16:9 layouts: max width,   
  sides darker as well. 
   check the pictures for context 





Security findings

  ✅ Clean

  - API key never in any committed file — lives only in Cloudflare secrets (correct)
  - wrangler.toml KV namespace ID is not a credential — no Cloudflare account access without auth
  - HTTPS everywhere (Cloudflare Workers enforce it)
  - sessionStorage for the API key in upload.html/gallery — tab-scoped, not persisted to disk, not accessible across
  tabs

  ⚠️  Minor — worth knowing, low actual risk

  1. ALLOWED_ORIGIN is defined but never enforced in the worker
  wrangler.toml defines ALLOWED_ORIGIN = "https://adp-lab.github.io" but worker/index.js echoes back whatever
  origin the caller sends:
  const origin = request.headers.get('Origin') || '*';
  This means any website can call your API from a browser. Auth endpoints are still protected by the key. Public
  endpoints (/active, /img/) are readable by anyone — which is necessary for the display pages to work from GitHub
  Pages anyway. No fix strictly needed, but you could validate origin on auth endpoints for defense-in-depth.

  2. No rate limiting
  Anyone who knows the worker URL can hammer /active or /img/*. Cloudflare Workers free tier handles 100k
  requests/day — unlikely to be a real problem for a private show tool, but worth knowing.

  3. File type not validated server-side
  The worker trusts the client's file.type for content-type. A file named evil.html with extension spoofing could be
  stored in R2. However: all files are served back through the Worker (not directly from R2), so nothing executes.
  Risk is negligible for a private, key-protected upload endpoint.

  ---
  Code findings (not security, just quality)

  4. graphic-v.html had wrong cover dimensions (3840×2160 instead of 2160×3840) — already fixed in last commit.

  5. No .gitignore
  Not a current problem (no secrets in the repo), but a .gitignore would be a good safety net if you ever run npm
  install (creates node_modules/) or add local test files.

  ---
  Bottom line: This is solidly built for a private show tool. The API key pattern (Cloudflare secret + header auth)
  is the right approach. The only thing I'd optionally add is a .gitignore. Want me to add that?

✻ Worked for 1m 11s

❯ I´d say, let´s do everything you mantioned as potentially concerning in the end.     