# Technical Report
## RoomView — Web-Based Furniture Augmented Reality Viewer

**Module:** INTE 42312 — Virtual and Augmented Reality  
**Assignment:** 01 — Furniture AR Viewer  
**Application name:** RoomView  
**Student:** Kavisha LP  
**Repository:** https://github.com/KavishaLP/furniture-ar-viewer  
**Public URL (GitHub Pages):** https://kavishalp.github.io/furniture-ar-viewer/

---

## 1. Problem

Buying furniture without seeing it in the room is guesswork. A chair that looks compact in a photograph can overwhelm a small bedroom; a sofa that looks generous online can leave no path to the door. Measuring with a tape is slow, and native AR shopping apps (IKEA Place and similar) require an app store install, a specific operating system, and often a high-end phone.

The problem this project addresses is: **how can a non-technical person preview chairs, sofas, a cupboard and a table in their own space, using only a phone browser, with no app to install?**

Two practical constraints follow from that problem. First, not every phone supports the same AR capability. Android Chrome can run WebXR hit-testing (true floor placement). Many iPhones cannot. A useful product therefore needs **two complementary modes**: markerless room placement where the hardware allows it, and marker-based image tracking that works on almost any phone camera. Second, the interface cannot assume the user knows what a “marker”, “hit-test” or “WebXR session” is. The product has to speak in furniture language: download a picture, point the camera, keep this piece, show my room.

RoomView is a static web application that solves that problem. It catalogues seven 3D furniture models, lets the user download four target pictures, and then either places a model on the detected floor (markerless) or anchors models to scanned catalogue pictures and keeps them in a multi-piece layout (marker-based).

---

## 2. Public URL

The live site is deployed with **GitHub Pages** from the `main` branch, using the repository workflow `.github/workflows/static.yml`.

**Public URL:** https://kavishalp.github.io/furniture-ar-viewer/

Because markerless AR requires a secure context, GitHub Pages (HTTPS) is the production host. Local development uses `python -m http.server 8000` plus a Cloudflare tunnel (`cloudflared --protocol http2`) so a physical phone can open the same files over HTTPS during testing.

---

## 3. Design

### 3.1 Product structure

RoomView is organised as a small set of HTML pages sharing one stylesheet (`style/style.css`):

| Page | Role |
|------|------|
| `index.html` | Home: choose floor placement or scan a picture |
| `print-pictures.html` | Download the four catalogue target images before Marker AR |
| `marker_AR/marker.html` | Marker-based AR (MindAR image tracking) |
| `markerless_AR/markerless.html` | Markerless AR (WebXR hit-test) |
| `references.html` | Sketchfab author credits |

The visual design is intentionally a furniture store, not a technical demo: linen background, walnut buttons, serif headings, and plain-English labels (“Keep this”, “Show my room”, “Open my camera”). Camera overlays stay as dark glass so text remains readable on the live feed.

### 3.2 Two AR modes

**Markerless (floor placement).** The user picks a category (chair / sofa / cupboard / table) and a design, then starts a WebXR `immersive-ar` session with `hit-test`. A reticle (ring) sits on the detected floor. Tapping **Place it here** instantiates the glTF model at that pose. One-finger drag rotates it; pinch scales it. A directional key light casts a shadow onto an invisible floor plane so the model feels grounded. A short placement sound confirms the tap.

**Marker-based (catalogue scan).** Four JPEG targets (`chair-marker.jpg`, `sofa-marker.jpg`, `cupboard-marker.jpg`, `table-marker.jpg`) are compiled into `targets.mind`. Scanning a picture shows the matching furniture on the paper. The user can cycle designs with arrows, then **Keep this** clones the model’s world transform into a scene-level group so it stays after the marker is lost. Further scans add more pieces. Tap-to-select, drag-to-move, pinch-to-scale, turn buttons, undo, clear, and per-item remove support arranging. **Show my room** pauses MindAR tracking (camera stays on, scanner overlay hides). **Start a new room** clears the layout and resumes scanning.

### 3.3 Interaction principles

- Preview models live on the marker; **kept** models live in `#placed-furniture-group` at the scene root.
- Gestures ignore UI buttons so a tap on **Keep this** does not rotate the model.
- Copy never uses file names (`chair_1.glb`). Friendly labels map from a lookup table.
- Markerless is recommended on Android Chrome; Marker AR is the fallback for iPhone.

---

## 4. Implementation

### 4.1 Stack

- **HTML / CSS / vanilla JavaScript** — no build step; GitHub Pages serves the folder as-is.
- **A-Frame 1.4.1** — declarative 3D scene (`a-scene`, `a-gltf-model`, lights).
- **MindAR 1.2.5** (`mindar-image-aframe`) — image-target tracking for Marker AR.
- **WebXR Device API** via A-Frame `webxr` — hit-testing, `local-floor` / `local` reference spaces, DOM overlay (`#ar-ui`).
- **Three.js** (bundled with A-Frame) — world matrices, raycasting, `BoxHelper` selection, shadow maps.
- **Assets:** glTF (`.glb`) furniture from Sketchfab; MindAR compiled targets; MP3 placement cue.

### 4.2 Marker AR placement pipeline

On **Keep this**, the preview glTF’s world position, quaternion and scale are read with `getWorldPosition` / `getWorldQuaternion` / `getWorldScale`. A new `a-gltf-model` is appended to `#placed-furniture-group` (not parented to the MindAR target). That is what allows several pieces to coexist after the user looks away from the paper. A `furniture-manipulator` component on the scene raycasts against placed meshes, drags on a camera-facing plane through the object, and pinch-scales the selected item.

**Show my room** calls MindAR’s `pause(true)`. Passing `true` keeps the video element playing while `stopProcessVideo()` ends tracking — so the scanner brackets disappear but the room feed and kept furniture remain.

### 4.3 Markerless placement pipeline

`navigator.xr.isSessionSupported('immersive-ar')` is checked before `sceneEl.enterVR(true)`. Hit-test results drive the reticle. On place, the model scale is restored from zero, the reticle is hidden, `enableModelCastShadow` walks the glTF meshes, and the key light is aimed at the floor point. The shadow-receiving plane uses `material="shader: shadow"` so only the shadow, not a solid floor, is drawn.

### 4.4 Catalogue

Marker AR uses three chairs, two sofas, one cupboard and one table. Markerless still lists a fourth chair file where present. All public credits are on `references.html` with original Sketchfab URLs (AshCreations3D, assetfactory, Garlovisuals, Sousinho, Console Art Cybernetic).

---

## 5. Testing

Testing mixed desktop checks with on-device AR, because camera, WebXR and MindAR cannot be fully simulated in a laptop browser.

| Test | Method | Result |
|------|--------|--------|
| Home, credits, download page load | Local `http.server` and GitHub Pages | Pages return HTTP 200; images in `assets/markers/` serve correctly |
| Download targets | `download` attributes on the four JPGs + Download all | Files save as `roomview-*-picture.jpg` |
| Marker tracking | Phone via Cloudflare HTTPS tunnel; printed / on-screen targets | Each of the four targets opens the matching category |
| Keep / undo / clear / room view | Manual Marker AR session | Kept clones persist after `targetLost`; pause hides scanner; new room resets |
| Drag / pinch / turn / remove | Tap placed items | Raycast selects the correct mesh; empty tap deselects |
| Markerless camera | Chrome on Android, HTTPS | Hit-test reticle appears; place, rotate, scale, shadow, audio |
| Unsupported device | Desktop / iPhone Safari | Clear message: use Chrome on Android, or scan a printed picture |
| UI copy | Non-technical walkthrough | Buttons describe the action without AR jargon |

Known limitation (accepted): MindAR has no world tracking. After **Show my room**, kept furniture is locked to the scene/camera origin, not to a physical floor point. True floor lock is provided by the markerless mode.

---

## 6. Technical challenges and solutions

This section records the specific failures encountered while building RoomView and the exact fixes applied. It is not a general list of AR theory.

### 6.1 Markerless camera did not open

**Challenge.** Tapping start showed a blank view or a compatibility overlay. Requiring `local-floor` as a WebXR feature caused session creation to fail on devices that only expose the `local` reference space. HTTP (not HTTPS) also silently blocks WebXR.

**Solution.** `webxr` was configured with `requiredFeatures: hit-test` and `optionalFeatures: local-floor, local, dom-overlay`. The script checks `window.isSecureContext` and `navigator.xr.isSessionSupported('immersive-ar')` before calling `enterVR`. Failure messages tell the user to use Chrome on Android over HTTPS, or to switch to Marker AR. Local testing uses a Cloudflare tunnel so the phone receives HTTPS.

### 6.2 Touch rotate/scale did nothing after the model appeared

**Challenge.** Gesture listeners were attached to the A-Frame canvas. In a WebXR session with a DOM overlay, the overlay and XR compositor consume canvas events, so `touchmove` never reached the model.

**Solution.** `gesture-handler` (markerless) and `furniture-manipulator` (marker) listen on `window` with `{ passive: false }`. Touches on buttons/links are ignored via `closest(...)`. Markerless gestures also wait until the model scale is non-zero (i.e. after place). Android’s synthetic mouse events after a tap are ignored for 800 ms so one tap is not processed twice.

### 6.3 Marker AR showed a blue/blank screen instead of the camera

**Challenge.** The A-Frame scene painted an opaque background over MindAR’s camera video.

**Solution.** The scene renderer was set to transparent (`alpha` / `background: transparent` as required) and the page used an `ar-page` body so only the camera feed is visible behind the overlay UI.

### 6.4 Shadows were invisible or sat as a blob under the furniture

**Challenge.** A dark disc parented under the model was unreadable on real floors. Default lights were too even, so the shadow map had no contrast.

**Solution.** Fill lighting (ambient + hemisphere) was separated from a single directional **key light** with `castShadow: true`, a tight shadow camera, and PCF-soft maps. An invisible `a-plane` with `shader: shadow` receives the shadow at the hit-test point. The light target is aimed at the furniture position so the shadow falls to the side, like a real lamp, and rotates with the model because it is produced by the mesh, not a painted decal.

### 6.5 Marker furniture vanished when the paper left the frame

**Challenge.** Models parented to `mindar-image-target` are hidden on `targetLost`. Users could not build a multi-piece layout.

**Solution.** **Keep this** copies the preview’s world transform into `#placed-furniture-group`. Preview pose is reset and hidden. Subsequent scans add more clones. This matches MindAR’s capabilities without pretending it is SLAM.

### 6.6 After placing, the scanner overlay still dominated the view

**Challenge.** Users wanted a “finished room” view without the scanning brackets.

**Solution.** MindAR’s `pause(true)` stops `processVideo` but leaves the `<video>` playing. The scanning overlay is given the library’s `hidden` class. **Add another piece** calls `unpause()`; **Start a new room** clears clones then unpauses.

### 6.7 Unstable Cloudflare tunnel (QUIC timeouts)

**Challenge.** `cloudflared` failed with HTTP 408 / “no recent network activity” on campus Wi-Fi.

**Solution.** The tunnel is started with `--protocol http2`, which is more reliable than default QUIC on restrictive networks.

### 6.8 Download page 404

**Challenge.** The browser requested `/print-pictures.html` at the site root; the first version of the page lived only under `marker_AR/`.

**Solution.** The download UI was placed at `print-pictures.html` in the project root. Home and Marker AR Help now link there. The old path redirects.

---

## 7. Reflection

The hardest part of this assignment was not loading a glTF file; it was making AR **behave like a product** on a real phone. WebXR, MindAR and the DOM overlay each have different event and camera rules. Listening on `window`, cloning world transforms, and pausing tracking without stopping video were the three implementation ideas that turned a demo into something a non-technical person can finish.

If the project continued, the main improvement would be world-anchored Marker AR (for example by switching kept items into a WebXR hit-test pose after the first scan), so **Show my room** would pin furniture to the floor while walking. A second improvement would be visual model thumbnails in the picker instead of name-only cycling.

Ethically, the camera is used only as a live view. Nothing is recorded or uploaded. Third-party 3D models remain credited on the references page with their original Sketchfab links.

---

## 8. Three-minute demonstration script

Use a phone on the GitHub Pages URL (HTTPS). Have one target picture ready (downloaded or on a second screen).

| Time | What to show | What to say |
|------|----------------|-------------|
| 0:00–0:20 | Home page | “RoomView runs in the browser. Two ways: put furniture on the floor, or scan a catalogue picture.” |
| 0:20–0:40 | `print-pictures.html` | “Before scanning, download the four pictures. Chair, sofa, cupboard, table — each opens a different piece.” |
| 0:40–1:40 | Marker AR | Scan chair → arrows to change design → **Keep this**. Scan sofa → keep. Tap a piece, drag, pinch, turn, remove. **Show my room** (scanner off). **Start a new room**. |
| 1:40–2:40 | Markerless AR | Pick sofa → **Open my camera** → allow camera → move until the circle sits on the floor → **Place it here** (sound + shadow). Drag to turn, pinch to resize. |
| 2:40–3:00 | Credits + recap | “Models are credited to their Sketchfab authors. Same catalogue, two AR techniques, no app install.” |

**If WebXR is unavailable on the demo phone:** spend the middle minute on Marker AR multi-place and room view, and explain markerless from the setup screen plus a short pre-recorded clip.

---

## References (tools and assets)

- A-Frame 1.4.1, https://aframe.io  
- MindAR 1.2.5, https://hiukim.github.io/mind-ar-js-doc/  
- WebXR Device API / hit-test, W3C  
- Sketchfab models as listed on `references.html`  
- GitHub Pages deployment workflow in this repository  
