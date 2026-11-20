export const AGENT_BAR_WIDTH = 66;
export const AGENT_BAR_HEADER = 24;
export const AGENT_BAR_ROW = 51;

export const agentBarPage = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>UPCode Agent Bar</title>
<style>
  * { box-sizing: border-box }
  body { margin: 0; background: #171b25; color: #e8ebf4; font: 14px "Segoe UI", sans-serif }
  .grip { height: ${AGENT_BAR_HEADER}px; display: grid; place-items: center; color: #9da8bd; letter-spacing: 2px; app-region: drag; -webkit-app-region: drag; user-select: none }
  #threads { display: grid; justify-items: center; grid-auto-rows: ${AGENT_BAR_ROW}px; height: calc(100vh - ${AGENT_BAR_HEADER}px); overflow: auto; scrollbar-width: thin }
  button, .empty { position: relative; align-self: start; width: 43px; height: 43px; border-radius: 11px; border: 1px solid #414959; background: #252b39; color: #dce6fa; font: 650 17px "Segoe UI", sans-serif; display: grid; place-items: center }
  button { cursor: pointer }
  button:hover, button:focus-visible { outline: 1px solid #b8c9e8; outline-offset: 2px }
  .badge { position: absolute; bottom: -3px; right: -3px; width: 18px; height: 18px; display: grid; place-items: center; border: 2px solid #171b25; border-radius: 50%; background: #89c8ff; color: #111721; font: 800 11px "Segoe UI", sans-serif }
  [data-status=input] .badge, [data-status=approval] .badge { background: #ffc478 }
  [data-status=done] .badge { background: #8bddaf }
  [data-status=failed] .badge, [data-status=limited] .badge { background: #ffa4ad }
  [data-status=waiting] .badge, [data-status=offline] .badge { background: #b5bed0 }
  [data-brand=claude] { color: #ffad8b }
  [data-brand=cursor] { color: #e1d7ff }
</style>
<div class="grip" title="Drag the agent bar" aria-hidden="true">⋮⋮</div>
<main id="threads" aria-label="Agent threads"><span class="empty" title="No active or unread threads">–</span></main>
<script>
  const list = document.querySelector('#threads');
  const buttons = new Map();
  const states = {
    working: ['•', 'Working'], waiting: ['◷', 'Waiting'],
    input: ['!', 'Needs your input'], approval: ['!', 'Needs approval'],
    done: ['✓', 'Finished · unread'], failed: ['×', 'Failed'],
    limited: ['!', 'Usage limit reached'], offline: ['–', 'Offline']
  };
  const glyphs = { claude: '✳', codex: '⌘', cursor: '◇' };
  const empty = list.firstElementChild;
  window.updateAgentBar = (entries) => {
    const keys = new Set();
    for (const row of entries) {
      const key = JSON.stringify([row.environmentId, row.threadId]);
      keys.add(key);
      let button = buttons.get(key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        const icon = document.createElement('span');
        const badge = document.createElement('span');
        badge.className = 'badge';
        icon.setAttribute('aria-hidden', 'true');
        badge.setAttribute('aria-hidden', 'true');
        button.append(icon, badge);
        button.addEventListener('click', () => window.open('https://agent-bar.invalid/' + encodeURIComponent(key)));
        buttons.set(key, button);
        list.append(button);
      }
      const [badge, label] = states[row.status];
      const brand = row.provider.toLowerCase().match(/claude|codex|cursor/)?.[0];
      button.dataset.status = row.status;
      button.dataset.brand = brand ?? '';
      button.firstChild.textContent = (brand && glyphs[brand]) || row.provider.slice(0, 2).toUpperCase();
      button.lastChild.textContent = badge;
      button.title = row.title + ' · ' + row.provider + ' · ' + label;
      button.setAttribute('aria-label', button.title);
    }
    for (const [key, button] of buttons) {
      if (keys.has(key)) continue;
      button.remove();
      buttons.delete(key);
    }
    empty.hidden = entries.length > 0;
    empty.style.display = empty.hidden ? 'none' : '';
  };
</script>
</html>`;
