// owner: stream S4 (temporary home)
//
// Ambient declaration so a renderer entry can `import "…/eve-desktop.css"`.
// Vite handles CSS imports natively; TypeScript needs to be told they exist,
// and this project has no vite/client types wired.
//
// S5 (design system) is the natural owner of this line — move it to the
// stylesheet's own folder when that stream lands. It lives here only because
// S4's summon.main.tsx / flyout-main.tsx were the first entries to import the
// sheet, and S4 may not edit tsconfig.json or any S1 file.
declare module "*.css";
