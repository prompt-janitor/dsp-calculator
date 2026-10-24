/* ---------- Layout breakpoints ---------- */
// The @media rules in app.css use the same values. CSS cannot read them from
// here, so change both together.

// Split view: a sidebar next to the map or build list. Phones in landscape
// are wide enough for it but too short, so they keep the tab bar.
export const SPLIT = '(min-width: 600px) and (min-height: 500px)';
// Full split view, with a wider sidebar and room for the whole map.
export const FULL = '(min-width: 1024px) and (min-height: 500px)';
// A mouse or trackpad, as opposed to touch.
export const MOUSE = '(hover: hover) and (pointer: fine)';
