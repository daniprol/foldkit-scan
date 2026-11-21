// Widget styles. They live inside a shadow root, so app CSS cannot reach
// them and they cannot leak into the app. The palette matches Foldkit
// DevTools, so the two tools look like one family.

export const styles = `
:host {
  position: fixed;
  inset: 0;
  pointer-events: none;
  /* One below Foldkit DevTools, which wins any overlap. */
  z-index: 2147483646;
  --bg: #1e1e2e;
  --raised: #282839;
  --hover: #313244;
  --line: #45475a;
  --fg: #cdd6f4;
  --muted: #9399b2;
  --accent: #94e2d5;
  --update: #89b4fa;
  --view: #cba6f7;
  --patch: #f5c26b;
  --good: #a6e3a1;
  --issue: #ff9466;
  --replay: #7f849c;
  --shadow: rgba(5, 6, 12, 0.45);
  --mono: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font: 12px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--fg);
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }

canvas.flashes { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }

/* ---- pill ---- */
.pill {
  position: fixed; pointer-events: auto;
  display: flex; align-items: center; gap: 8px;
  height: 30px; padding: 0 10px 0 11px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 999px;
  box-shadow: 0 4px 14px var(--shadow);
  user-select: none; touch-action: none;
}
.pill:hover { background: var(--raised); }
.pill.open { border-color: var(--accent); }
.corner-BottomLeft { left: 12px; bottom: 16px; }
.corner-BottomRight { right: 12px; bottom: 16px; }
.corner-TopLeft { left: 12px; top: 16px; }
.corner-TopRight { right: 12px; top: 16px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); flex: none; }
.dot.slow { background: var(--patch); }
.dot.issue { background: var(--issue); box-shadow: 0 0 0 3px rgba(255, 148, 102, 0.25); }
.pill .num { font: 500 12px var(--mono); }
.pill .unit { color: var(--muted); font-size: 10.5px; margin-left: -5px; }
.pill .bar { width: 1px; height: 14px; background: var(--line); }
.pill .batch { font: 500 10.5px var(--mono); color: var(--update); background: var(--raised); padding: 2px 6px; border-radius: 999px; }
.pill .count { font-weight: 600; font-size: 11px; color: var(--bg); background: var(--issue); padding: 2px 7px; border-radius: 999px; }
.pill .toast { font-size: 11px; color: var(--accent); }
.spark { display: block; }

/* tucked: a 12 px tab on the screen edge */
.tuck {
  position: fixed; pointer-events: auto; width: 12px; height: 38px; padding: 0;
  background: var(--bg); border: 1px solid var(--line);
  display: grid; place-items: center; box-shadow: 0 2px 8px var(--shadow);
}
.tuck.corner-BottomLeft, .tuck.corner-TopLeft { left: 0; border-left: 0; border-radius: 0 6px 6px 0; }
.tuck.corner-BottomRight, .tuck.corner-TopRight { right: 0; border-right: 0; border-radius: 6px 0 0 6px; }

/* the one-time offer */
.offer {
  position: fixed; pointer-events: auto; width: 270px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 9px;
  padding: 10px 11px; box-shadow: 0 8px 24px var(--shadow);
}
.offer p { margin: 0 0 8px; }
.offer .actions { display: flex; gap: 6px; justify-content: flex-end; }

/* ---- panel ---- */
.panel {
  position: fixed; pointer-events: auto;
  width: 360px; height: 420px; max-height: calc(100vh - 80px);
  display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 10px 32px var(--shadow); overflow: hidden;
}
.panel.corner-BottomLeft { left: 12px; bottom: 54px; }
.panel.corner-BottomRight { right: 12px; bottom: 54px; }
.panel.corner-TopLeft { left: 12px; top: 54px; }
.panel.corner-TopRight { right: 12px; top: 54px; }
@media (max-width: 480px) {
  .panel { left: 0 !important; right: 0 !important; top: 0 !important; bottom: 0 !important;
    width: auto; height: auto; max-height: none; border-radius: 0; }
}
.head { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 6px 0 11px; border-bottom: 1px solid var(--line); flex: none; }
.logo { font-weight: 600; font-size: 12.5px; margin-right: auto; }
.logo b { color: var(--view); }
.seg { display: flex; background: var(--raised); border-radius: 6px; padding: 2px; }
.seg button { background: transparent; border: 0; border-radius: 4px; padding: 3px 7px; font-size: 11px; color: var(--muted); }
.seg button[aria-pressed='true'] { background: var(--hover); color: var(--fg); }
.icon { width: 26px; height: 26px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 5px; color: var(--muted); }
.icon:hover, .icon[aria-pressed='true'] { background: var(--hover); color: var(--fg); }
.tabs { display: flex; border-bottom: 1px solid var(--line); flex: none; padding: 0 4px; }
.tabs button { background: transparent; border: 0; padding: 8px 9px 7px; font-size: 12px; color: var(--muted); border-bottom: 2px solid transparent; display: flex; align-items: center; gap: 5px; }
.tabs button[aria-selected='true'] { color: var(--fg); border-bottom-color: var(--accent); }
.tabs .badge { font-size: 10px; font-weight: 600; background: var(--issue); color: var(--bg); border-radius: 999px; padding: 1px 5px; }
.body { flex: 1; overflow-y: auto; padding: 10px 11px 12px; min-height: 0; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.empty { color: var(--muted); padding: 24px 6px; text-align: center; }
.h { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 12px 0 4px; }
.h:first-child { margin-top: 0; }

/* frames timeline */
.timeline { display: block; width: 100%; height: 64px; cursor: pointer; }
.axis { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); margin: 2px 0 8px; }
.fh { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.fh b, .fh .total { font-size: 12.5px; white-space: nowrap; }
.fh .batch { font: 500 10.5px var(--mono); color: var(--update); }
.fh .total { margin-left: auto; font: 500 12px var(--mono); }
.tag-wasted, .tag-replay { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--raised); color: var(--muted); }
.tag-wasted { color: var(--issue); }
.phase { display: grid; grid-template-columns: 46px minmax(0, 1fr) 82px; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); margin: 3px 0; }
.phase i { height: 6px; background: var(--raised); border-radius: 3px; overflow: hidden; display: block; }
.phase i b { display: block; height: 100%; border-radius: 3px; }
.phase em { font: normal 10.5px var(--mono); text-align: right; color: var(--fg); }
.phase em.over { color: var(--patch); }
.u { background: var(--update); } .v { background: var(--view); } .p { background: var(--patch); }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; align-items: center; gap: 7px; white-space: nowrap; padding: 4px 6px; border-radius: 5px; font-size: 11.5px; }
.list li:hover { background: var(--raised); }
.list .tag { font-family: var(--mono); font-size: 11px; color: var(--update); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.list .label { font-family: var(--mono); font-size: 11px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.list .kind { font-size: 10.5px; color: var(--muted); }
.list .kind.Churn { color: var(--issue); }
.list .yes { color: var(--good); font-size: 10.5px; }
.list .no { color: var(--muted); font-size: 10.5px; }
.list .failed { color: var(--issue); }
.mini.devtools { margin: 2px 0 8px; }
.list em { margin-left: auto; font: normal 10.5px var(--mono); color: var(--muted); }
.mini { background: var(--raised); border: 1px solid var(--line); border-radius: 4px; font-size: 10px; padding: 1px 6px; color: var(--muted); }
.mini:hover { color: var(--fg); }
.btn { background: var(--raised); border: 1px solid var(--line); border-radius: 5px; padding: 3px 9px; font-size: 11.5px; }
.btn.primary { background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 600; }

/* issues */
.issue-card { border: 1px solid var(--line); border-left: 3px solid var(--issue); border-radius: 6px; padding: 8px 9px; margin-bottom: 8px; background: var(--raised); }
.issue-card.note { border-left-color: var(--muted); background: transparent; }
.issue-card .title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.issue-card .title b { font-size: 12px; }
.issue-card .title code { font-family: var(--mono); font-size: 11px; color: var(--muted); }
.issue p { margin: 4px 0 6px; font-size: 11.5px; }
.issue-card .hint { color: var(--muted); }
.issue-card .actions { display: flex; gap: 6px; align-items: center; }
.issue-card .actions span { margin-left: auto; font-size: 10.5px; color: var(--muted); }

/* hotspots */
.rank { list-style: none; margin: 0; padding: 0; }
.rank li { display: grid; grid-template-columns: 140px minmax(0, 1fr) 64px; gap: 8px; align-items: center; padding: 3px 0; font-size: 11px; }
.rank code { font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank i { height: 6px; border-radius: 3px; background: var(--raised); display: block; overflow: hidden; }
.rank i b { display: block; height: 100%; background: var(--view); }
.rank.messages i b { background: var(--update); }
.rank em { font: normal 10.5px var(--mono); color: var(--muted); text-align: right; }

/* settings */
.settings { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 8px 10px; align-items: center; font-size: 11.5px; }
.settings > span { color: var(--muted); }
.settings .seg { justify-self: start; }
.keys { margin-top: 14px; font-size: 11px; color: var(--muted); display: grid; grid-template-columns: max-content 1fr; gap: 3px 10px; }
kbd { font-family: var(--mono); font-size: 10px; background: var(--raised); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; color: var(--fg); }

/* inspect mode */
.inspect-box { position: fixed; border: 2px solid var(--accent); border-radius: 4px; background: rgba(148, 226, 213, 0.1); pointer-events: none; }
.inspect-tag { position: absolute; left: -2px; top: -22px; font: 500 10.5px/1 var(--mono); background: var(--accent); color: var(--bg); padding: 4px 6px; border-radius: 4px 4px 4px 0; white-space: nowrap; }
.inspect-card { position: fixed; width: 300px; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; padding: 10px 11px; box-shadow: 0 10px 28px var(--shadow); pointer-events: auto; }
.inspect-card .ttl { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.inspect-card .ttl code { font: 600 11.5px var(--mono); }
.inspect-card .ttl span { color: var(--muted); font-size: 10.5px; }
.kv { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 3px 10px; font-size: 11.5px; margin: 0; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; }
.kv .bad { color: var(--issue); }
.inspect-foot { margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--line); display: flex; gap: 10px; flex-wrap: wrap; font-size: 10.5px; color: var(--muted); }
.banner { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; font-size: 11.5px; box-shadow: 0 4px 12px var(--shadow); white-space: nowrap; }
.banner .dot { background: var(--accent); }
.catcher { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; background: transparent; }

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`
