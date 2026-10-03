// r27: the menu at the top right (account, sync, Report a problem, Guide,
// your data) on every tab; Settings without the duplicate Help and Report a
// problem; the Guide; explanations reachable by a tap (an i beside a
// control's label, dotted text on a tap); every section on every tab folds
// and moves, and keeps its order after a reload; the install steps name the
// address the app is really on. The second half runs the real build against
// the stand-in Supabase: signing in and out from the menu.
const { open } = require('./h');
const { execFileSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- Part 1: the source file (no accounts).
  {
    const P = await open('index.html', { touch: true, clock: '2026-09-30T17:30:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await page.setViewportSize({ width: 390, height: 844 });
    // Every section shown, as in r27 (a new install hides a few since r28; tests/r28.js covers that).
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.hidden = []; L.makeDemo(); localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.loadAsk', '1'); L.ui.tab = 'today'; L.render(); });
    await wait(80);

    // The button on every tab.
    for (const t of ['today', 'program', 'dash', 'history', 'settings']) {
      await ev(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); }, t);
      const b = await ev(() => { const el = document.getElementById('saveState'); const r = el.getBoundingClientRect(); const hit = getComputedStyle(el, '::before'); return { act: el.dataset.act, icon: !!el.querySelector('svg.mi'), label: el.getAttribute('aria-label'), w: r.width, hitW: parseFloat(hit.width), hitH: parseFloat(hit.height) }; });
      ok(b.act === 'menuOpen' && b.icon && /^Menu\. /.test(b.label) && b.hitW >= 44 && b.hitH >= 44, `the menu button is at the top right on ${t}, labelled, with a 44 px target`, b);
    }
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); });
    await page.click('#saveState'); await wait(80);
    const menu = await ev(() => { const m = document.getElementById('modal'); return { kind: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind, rows: [...m.querySelectorAll('.mnu')].map(b => ({ t: b.textContent.replace('›', '').trim(), h: b.getBoundingClientRect().height })), acct: m.querySelector('#menuAcct').innerText, build: /Build \d{4}\.\d{2}\.\d{2}-r\d+/.test(m.innerText) }; });
    ok(menu.kind === 'menu' && JSON.stringify(menu.rows.map(r => r.t)) === JSON.stringify(['Report a problem', 'Guide', 'Show, hide, or reorder sections', 'Your data and backups']) && menu.rows.every(r => r.h >= 48) && menu.build, 'the menu: Report a problem, Guide, Show, hide, or reorder sections (r28), Your data and backups (48 px rows), and the build', menu);
    ok(/Saved/.test(menu.acct) && !/Sign in/.test(menu.acct), 'without accounts (the source file) it says where the log is saved, and offers no sign-in', menu.acct);
    // The close button, and the phone's Back, close it.
    await page.click('#modal [data-act="mClose"]'); await wait(60);
    ok(await ev(() => !window.__ironlog.ui.modal), 'the close button closes the menu');
    await page.click('#saveState'); await wait(60); await page.goBack(); await wait(120);
    ok(await ev(() => !window.__ironlog.ui.modal && window.__ironlog.ui.tab === 'history'), 'Back closes the menu and stays on the tab');
    // Report a problem from the menu.
    await page.click('#saveState'); await wait(60); await page.click('#modal .mnu[data-act="fbOpen"]'); await wait(80);
    ok(await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'feedback' && m.cat === 'bug' && m.from === 'history'; }), 'Report a problem opens the report sheet, from the screen you were on');
    await ev(() => window.__ironlog.ACT.mClose());
    // Your data and backups.
    await page.click('#saveState'); await wait(60); await page.click('#modal .mnu[data-act="goBackup"]'); await wait(120);
    ok(await ev(() => { const L = window.__ironlog; const d = document.getElementById('dataSec'); return !L.ui.modal && L.ui.tab === 'settings' && !!d && d.open; }), 'Your data and backups closes the menu and opens Settings, Your data');
    // Settings has no Help section or Report a problem of its own.
    // r27 took Help out of Settings; r28 put it back near the bottom at V's request (tests/r28.js checks its buttons).
    ok(await ev(() => !document.querySelector('[data-mkey="feedback"]') && document.querySelectorAll('#view [data-act="fbOpen"]').length === document.querySelectorAll('#view > [data-mkey="help"] [data-act="fbOpen"]').length), 'Settings has no old feedback section; its report buttons are all in Help');
    // The Guide.
    await page.click('#saveState'); await wait(60); await page.click('#modal .mnu[data-act="guideOpen"]'); await wait(80);
    const g = await ev(() => { const m = document.getElementById('modal'); return { kind: window.__ironlog.ui.modal.kind, topics: [...m.querySelectorAll('.gsec>summary')].map(s => s.textContent), open: m.querySelectorAll('.gsec[open]').length, text: m.innerText }; });
    ok(g.kind === 'guide' && g.topics.join('|') === 'Today|Logging a session|How targets are set|Volume and Stats|Plan and your own exercises|Sections|Your data' && g.open === 0, 'the Guide has seven topics, all folded', g.topics);
    await page.click('#modal .gsec[data-g="rules"]>summary'); await wait(60);
    const rules = await ev(() => document.querySelector('#modal .gsec[data-g="rules"]').innerText);
    ok(/last full session/.test(rules) && /trimmed, lighter, or deload/.test(rules) && /2\.5%/.test(rules) && /never under the empty bar/.test(rules) && /heavy day and a light day/.test(rules), 'How targets are set states the rules: last full session, Last labelled, step sizes, deload floor, per-day ranges', rules.slice(0, 120));
    ok(!/[—]/.test(g.text) && !/!/.test(g.text.replace(/!=/g, '')), 'the Guide has no em dashes or exclamation marks');
    await ev(() => window.__ironlog.ACT.mClose());

    // Explanations by tap: labels get an i button; the label still works its control.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:timer'] = true; L.ui.folds['settings:rir'] = true; L.render(); });
    await wait(80);
    const lab = await ev(() => { const cb = document.querySelector('[data-bind="autoDone"]'); const label = cb.closest('label'); return { i: !!label.querySelector('.tipi'), hastip: !!label.querySelector('.hastip'), checked: cb.checked, total: document.querySelectorAll('#view label .hastip').length }; });
    ok(lab.i && !lab.hastip && lab.total === 0, 'every explained label in Settings has an i button instead of a hidden press and hold', lab);
    await page.click('[data-bind="autoDone"] ~ .tipi'); await wait(60);
    const tip1 = await ev(() => { const t = document.getElementById('tip'); return { shown: !t.hidden, text: t.textContent, checked: document.querySelector('[data-bind="autoDone"]').checked }; });
    ok(tip1.shown && /mistyped/.test(tip1.text) && tip1.checked === lab.checked, 'tapping the i shows the explanation and does not toggle the setting', tip1);
    await page.click('[data-bind="autoDone"] + span'); await wait(80);
    ok(await ev(c => document.querySelector('[data-bind="autoDone"]').checked !== c, lab.checked), 'tapping the label text still toggles the setting');
    await page.click('[data-bind="autoDone"] + span'); await wait(80);
    ok(await ev(() => /RIR, reps in reserve:/.test(document.querySelector('[data-mkey="rir"]').innerText)), 'the Effort (RIR) setting says what RIR is, on screen');
    // The controls keep their spoken names with an i beside the label (review, r27).
    const names = await Promise.all([
      page.getByRole('checkbox', { name: 'Auto-mark a set done after its reps', exact: true }).count(),
      page.getByRole('checkbox', { name: 'Keep the screen on during a session', exact: true }).count(),
      page.getByRole('textbox', { name: 'Lifting time budget (minutes)', exact: true }).count()]);
    ok(names.every(n => n === 1), 'screen readers still name each control by its label alone', names);
    await ev(() => window.__ironlog.ACT.exEdit({ dataset: { ex: 'bench' } })); await wait(80);
    ok(await page.getByRole('combobox', { name: 'Movement', exact: true }).count() === 1 && await page.getByRole('combobox', { name: /^Plate helper/ }).count() === 1, 'and in the exercise editor (Movement, Plate helper)');
    await ev(() => window.__ironlog.ACT.mClose());
    // Dotted text shows its explanation on a tap (Pick for me's "How this is ranked").
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.pickToday && L.ACT.pickToday(); });
    await wait(80);
    const hasRank = await ev(() => !!document.querySelector('#modal .hastip'));
    if (hasRank) { await page.click('#modal .hastip'); await wait(60); }
    ok(hasRank && await ev(() => { const t = document.getElementById('tip'); return !t.hidden && /Ranked by/.test(t.textContent); }), 'dotted text shows its explanation on a tap');
    await ev(() => window.__ironlog.ACT.mClose());

    // ---- Sections: every one on every tab folds and has a handle; moving keeps the order after a reload.
    // A cardio entry and a deleted session, so History shows all three of its sections.
    await ev(() => { const L = window.__ironlog; const st = L.state; st.cardio.push({ id: 'c1', date: '2026-09-29', min: 20, kind: 'walk' }); const s0 = st.sessions[0]; st.trash.push({ id: s0.id, kind: 'session', date: '2026-09-29', data: JSON.parse(JSON.stringify(s0)) }); st.sessions = st.sessions.filter(x => x.id !== s0.id); L.state = L.normalize(st); L.invalidate(); L.saveNow(); });
    for (const t of ['today', 'program', 'dash', 'history', 'settings']) {
      await ev(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); window.scrollTo(0, 0); }, t); await wait(60);
      const keys = await ev(() => [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey));
      const bad = [];
      for (const k of keys) {
        const before = await ev(k => { const d = document.querySelector(`#view > [data-mkey="${k}"]`); const s = d && d.querySelector('summary'); return d ? { open: d.open, summary: !!s, grip: !!d.querySelector('.sgrip') } : null; }, k);
        if (!before || !before.summary || !before.grip) { bad.push(k + ' (no title or handle)'); continue; }
        await page.locator(`#view > [data-mkey="${k}"] > summary .sec-t`).first().click(); await wait(40);
        const after = await ev(k => document.querySelector(`#view > [data-mkey="${k}"]`).open, k);
        if (after === before.open) bad.push(k + ' (did not fold or open)');
        await ev(() => window.__ironlog.render()); await wait(20);
        const kept = await ev(k => document.querySelector(`#view > [data-mkey="${k}"]`).open, k);
        if (kept !== after) bad.push(k + ' (fold lost on a re-render)');
      }
      ok(keys.length >= (t === 'history' ? 3 : 2) && !bad.length, `${t}: all ${keys.length} sections fold and open from their title, keep it across a re-render, and have a ⠿ handle`, bad.length ? bad : keys);
    }
    // Move a section on Today and on Stats by dragging the handle, and by the keyboard.
    const order = async t => ev(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); return [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey); }, t);
    const t0 = await order('today');
    // A finger drag on the handle, the way it is done on a phone (touch events through the browser).
    await ev(() => document.querySelectorAll('#view > details').forEach(d => { d.open = false; }));
    const gb = await page.locator(`#view > [data-mkey="${t0[1]}"] .sgrip`).first().boundingBox();
    const tb = await page.locator(`#view > [data-mkey="${t0[4]}"]`).first().boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const x0 = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2, y1 = tb.y + tb.height - 5;
    await tp('touchStart', x0, y0); await wait(50);
    for (let k = 1; k <= 20; k++) { await tp('touchMove', x0, y0 + (y1 - y0) * k / 20); await wait(25); }
    await wait(200); await tp('touchEnd', x0, y1); await wait(300);
    const t1 = await ev(() => [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey));
    ok(t1.join() !== t0.join() && t1.indexOf(t0[1]) > 1, 'Today: dragging a section by its handle with a finger moves it', { t0, t1 });
    await page.locator(`#view > [data-mkey="${t1[0]}"] .sgrip`).first().focus(); await page.keyboard.press('ArrowDown'); await wait(120);
    const t2 = await ev(() => [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey));
    ok(t2[1] === t1[0], 'and the handle moves it with the arrow keys too', { t1, t2 });
    const s0 = await order('dash');
    await page.locator(`#view > [data-mkey="${s0[0]}"] .sgrip`).first().focus(); await page.keyboard.press('ArrowDown'); await wait(120);
    const s1 = await ev(() => [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey));
    ok(s1[1] === s0[0], 'Stats: a section moves down', { s0, s1 });
    // Month view in This week, then a reload: order kept, sections still fold.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.wkView({ dataset: { v: 'month' } }); L.saveNow(); });
    await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    const t3 = await order('today'); const s3 = await order('dash');
    ok(t3.join() === t2.join() && s3.join() === s1.join(), 'after a reload both orders are kept', { t3, s3 });
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    const wk = await ev(() => { const d = document.querySelector('#view > [data-mkey="week"]'); return { month: !!d.querySelector('.cal-inline'), open: d.open }; });
    await page.locator('#view > [data-mkey="week"] > summary .sec-t').first().click({ force: true }); await wait(40);
    ok(wk.month && await ev(o => document.querySelector('#view > [data-mkey="week"]').open !== o, wk.open), 'This week in Month view still folds from its title', wk);
    await ev(() => { const L = window.__ironlog; L.ACT.layoutReset && L.ACT.layoutReset(); });

    // ---- 320 px: the menu fits.
    await page.setViewportSize({ width: 320, height: 640 });
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await page.click('#saveState'); await wait(80);
    ok(await ev(() => document.documentElement.scrollWidth <= 320 && [...document.querySelectorAll('#modal .mnu')].every(b => b.getBoundingClientRect().right <= 320)), 'at 320 px the menu fits with no sideways scroll');
    ok(!P.errors.length, 'no page errors (' + P.errors.join(' | ') + ')');
    await P.browser.close();
  }

  // ---- Part 2: the real build with accounts, against the stand-in Supabase.
  {
    const { chromium } = require('playwright');
    const { start, quietHibp } = require('./fake-supabase');
    execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r27-'));
    fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
    const fake = await start(tmp);
    const ip = path.join(tmp, 'index.html');
    fs.writeFileSync(ip, fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`));
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const ev = (f, a) => page.evaluate(f, a);
    await page.goto(fake.base + '/ironlog/'); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); localStorage.setItem('ironlog.v1.installLater', '1'); });
    await page.click('#saveState'); await wait(80);
    const so = await ev(() => { const m = document.getElementById('menuAcct'); return { t: m.innerText, signin: !!m.querySelector('[data-act="acctOpen"][data-mode="signin"]'), signup: !!m.querySelector('[data-act="acctOpen"][data-mode="signup"]') }; });
    ok(/Not signed in/.test(so.t) && so.signin && so.signup, 'signed out: the menu says so and offers Sign in and Create account', so);
    // Make an account in the stand-in, then sign in from the menu.
    fake.addUser('m@example.com', 'a strong one 77');
    await page.click('#menuAcct [data-act="acctOpen"][data-mode="signin"]'); await wait(80);
    await page.fill('#modal [data-abind="email"]', 'm@example.com'); await page.fill('#modal [data-abind="pw"]', 'a strong one 77');
    await page.click('#modal [data-act="acctSubmit"]');
    await page.waitForFunction(() => { const L = window.__ironlog; return L.acctUser() && L.cloudState().on; }, null, { timeout: 15000 }).catch(() => {});
    await wait(1500);
    await page.click('#saveState'); await wait(80);
    const si = await ev(() => { const m = document.getElementById('menuAcct'); return { t: m.innerText, out: !!m.querySelector('[data-act="acctSignOut"]'), dot: document.getElementById('saveState').className }; });
    ok(/Signed in as/.test(si.t) && /m@example\.com/.test(si.t) && si.out, 'signed in from the menu: it shows the email and Sign out', si);
    ok(/\bok\b|\bbusy\b/.test(si.dot) && /Synced|Syncing/.test(si.t), 'the button carries the sync dot, and the menu says Synced', si);
    await page.click('#menuAcct [data-act="acctSignOut"]'); await wait(150);
    const outSheet = await ev(() => { const m = window.__ironlog.ui.modal; return m && (m.kind === 'confirm' || m.kind === 'signout' || /Sign out|keep/i.test(document.getElementById('modal').innerText)); });
    ok(outSheet, 'Sign out from the menu asks whether to keep the log on this phone');
    // ---- The install steps name the address the app is on, not vqx7.github.io.
    const inst = await ev(() => { const L = window.__ironlog; L.ACT.mClose(); return { host: location.host, a: L.installSheet({ kind: 'install', how: 'ios-other' }), b: L.installSheet({ kind: 'install', how: 'ios-safari26' }) }; });
    ok(inst.a.includes(inst.host) && inst.b.includes(inst.host) && !/vqx7\.github\.io/.test(inst.a + inst.b), 'the Add to Home Screen steps and picture show the address this copy is on (' + inst.host + ')', inst.host);

    ok(!errors.length, 'built app: no page errors (' + errors.join(' | ') + ')');
    await browser.close(); await fake.close();
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
