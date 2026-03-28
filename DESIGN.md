# Design System Strategy: Kinetic Craftsmanship

## 1. Overview & Creative North Star
This design system is built on the collision of two seemingly opposing worlds: the tactile, methodical art of needlework and the high-velocity, invisible speed of the Monad blockchain. We move away from the sterile, "template-ready" look of typical Web3 dashboards toward a **High-End Editorial** experience.

**Creative North Star: "The Hyper-Speed Atelier"**
The visual language treats the UI as a digital garment—assembled from "patches" of data and "stitched" together with neon threads of light. We break the rigid grid through intentional asymmetry, overlapping "fabric" containers, and high-contrast typography that feels both hand-crafted and technologically superior. This is not just a landing page; it is a bespoke digital tapestry designed for performance.

---

## 2. Colors & Surface Philosophy
The palette leverages Monad’s signature berry and purple tones, punctuated by tactical neon "speed" accents. 

### The "No-Line" Rule
Standard 1px solid borders are strictly prohibited for sectioning. They represent rigid, low-fidelity design. In this system, boundaries are defined exclusively through:
*   **Tonal Shifts:** A `surface-container-low` section sitting directly on a `surface` background.
*   **Stitch-Paths:** Using dashed strokes (the "Ghost Border" fallback) to imply a boundary without closing it off with a solid line.

### Surface Hierarchy & Nesting
Treat the UI as a series of layered textiles. 
*   **Base Layer:** `surface` (#0d0d18).
*   **The Patchwork:** Use `surface-container-low` (#12121e) for large background blocks and `surface-container-high` (#1e1e2d) for interactive cards.
*   **The "Glass & Gradient" Rule:** Main CTAs and hero elements should utilize a linear gradient from `primary` (#afa2ff) to `primary-container` (#a192ff) at a 135-degree angle to simulate the sheen of high-performance silk.

---

## 3. Typography
Our typography hierarchy is designed to feel authoritative yet approachable, mimicking the bold headings of a fashion lookbook combined with the technical precision of a flight manual.

*   **The Display Voice:** `plusJakartaSans` is our primary tool for storytelling. Use `display-lg` (3.5rem) for hero statements. The rounded terminals of the font echo the "stitched" theme while remaining hyper-modern.
*   **The Narrative Voice:** `manrope` handles all body and title text. It is clean, legible, and functional, ensuring that complex Web3 data remains accessible.
*   **The Tactical Voice:** `spaceGrotesk` is reserved for `label-md` and `label-sm`. Use this for speed metrics, latency indicators, and "stitched" metadata labels. It provides the "technical" contrast to the organic patchwork shapes.

---

## 4. Elevation & Depth: Tonal Layering
We do not use traditional elevation. We use **Material Stack Theory**.

*   **The Layering Principle:** Depth is achieved by "stacking" the surface tiers. A `surface-container-highest` card should feel like a patch sewn onto a `surface-container-low` background. 
*   **Ambient Shadows:** For floating patches, use an extra-diffused shadow: `box-shadow: 0px 24px 48px rgba(175, 162, 255, 0.08)`. Note the color tint—shadows should use a transparent version of `primary` to mimic light passing through purple fabric.
*   **The "Ghost Border":** To create the signature stitching, use `outline-variant` (#474754) with a `border-style: dashed` and a `dash-array` of 4px 4px. This should be applied to the inner edge of cards to look like needlework.
*   **Glassmorphism:** For speed indicators and HUD elements, use `surface-variant` at 40% opacity with a `backdrop-blur` of 12px. This ensures the "speed" of the background movement is never fully obscured.

---

## 5. Components

### Embroidered Buttons (Primary CTA)
*   **Visuals:** A solid `primary` fill with a `secondary` (#ff67ae) dashed border offset by 2px *outside* the button.
*   **Interaction:** On hover, the dashed border "zips" (animates its stroke-offset) to indicate the speed of the Monad network.
*   **Rounding:** Use `sm` (0.125rem) to maintain a "cut fabric" feel rather than a perfect pill shape.

### Patchwork Cards
*   **Visuals:** No solid borders. Use `surface-container-highest` for the background. 
*   **Detailing:** Apply a 1px dashed line in `outline-variant` 8px inside the card's edge. 
*   **Asymmetry:** Occasionally rotate cards by 1 or 1.5 degrees to break the "perfect" digital grid, making the page feel manually assembled.

### Speed Indicators (Tactical Accents)
*   **Visuals:** Use `tertiary` (#a1faff) for metrics.
*   **The "Motion Blur" Effect:** Text and icons in this color should have a subtle 2px horizontal blur or a "trailing stitch" icon to represent low latency.

### Inputs & Fields
*   **Style:** Minimalist. Only a bottom border using the "Ghost Border" (dashed). 
*   **Focus State:** Transition the dashed line to a solid `tertiary` neon blue to signal "active" connectivity.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Whitespace:** Use the `20` (7rem) and `24` (8.5rem) spacing scales to let the "patches" breathe.
*   **Layer Intentionally:** Overlap a "speed" indicator (tertiary) over a "patch" (surface-container) so it looks like an emblem pinned to a jacket.
*   **Use High Contrast:** Ensure `on-background` text is used on dark surfaces for AAA accessibility while maintaining the high-energy vibe.

### Don’t:
*   **No "Boxy" Grids:** Avoid perfectly aligned rows of 3 cards. Offset them or vary their heights using the `Spacing Scale`.
*   **No Solid 1px Lines:** This is the quickest way to kill the "premium" feel of this system. If you need a divider, use a `surface-variant` background shift or a dashed stitch.
*   **Don't Over-texture:** Use fabric textures sparingly—only on the `surface-container` tiers at low opacities (3-5%). The neon accents must remain the stars of the show.