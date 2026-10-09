/* hidden-engine.js — the Hidden Engine: the heart of Summit, never meant to be
 * found. Revealed when the console's secret `unlock hidden` releases the blast
 * doors. A vast mechanical vault around a gigantic rotating Core Engine, with
 * an archive wall, energy-conduit wall, suspended ceiling gears, a circuit
 * floor that lights beneath your cursor, and one old SUMMIT CORE console where
 * the final puzzle waits.
 */
(function () {
    'use strict';

    function user() {
        return (window.localStorage && localStorage.getItem('currentUser')) || 'Default';
    }

    /**
     * Bind a title to this account, and put it on.
     *
     * Two keys, because the nametag asks two separate questions.
     * `summitTitle:<user>` is "has this account earned the secret title" — it
     * puts the title in the nametag's list of titles at all, and it lets the
     * account straight into /engine (engine.js). `summitRankTitle:<user>`
     * is "which of my titles am I wearing", the chooser's key
     * (frontend/src/utils/rankTitle.ts).
     *
     * Writing only the first would leave a reader who had picked a band
     * wearing the band: the button says TITLE EQUIPPED, and reaching the end of
     * the chain is the equip. The bands stay in the chooser, so this is a
     * default and not a sentence.
     */
    function wearTitle(name) {
        var v = String(name == null ? '' : name).trim().slice(0, 24) || 'Admin';
        try {
            localStorage.setItem('summitTitle:' + user(), v);
            localStorage.setItem('summitRankTitle:' + user(), v);
        } catch (e) {}
        return v;
    }

    var stability = 99.99, draining = false;

    var LOGS = {
        LOG_0001: '"...the engine was never a metaphor."',
        LOG_0002: '"we compiled reality nightly. it held. mostly."',
        LOG_0003: '"if you are reading this, the door has already opened."'
    };

    function reveal(closeSettings) {
        if (document.getElementById('hiddenEngine')) return;

        var he = document.createElement('div');
        he.id = 'hiddenEngine';
        he.innerHTML =
            ceiling() +
            '<div class="he-room">' +
                leftWall() + rightWall() + core() + hiddenConsole() +
            '</div>' +
            '<div class="he-floor"><div class="he-floor-grid"></div><div class="he-floor-glow"></div></div>' +
            '<div class="he-doors"><div class="he-door he-door-l"></div>' +
                '<div class="he-door he-door-r"></div><div class="he-seam"></div></div>';
        document.body.appendChild(he);

        requestAnimationFrame(function () { he.classList.add('lit'); });
        setTimeout(function () { he.classList.add('open'); }, 450);   // doors part
        setTimeout(function () {
            var d = he.querySelector('.he-doors'); if (d) d.remove();
        }, 2600);
        if (closeSettings) setTimeout(closeSettings, 700);            // drop the panel behind the doors

        wireFloor(he);
        wireArchives(he);
        wireConsole(he);
        wireGears(he);
        startAmbient(he);
    }

    // --- Draggable core gears: pull them off the ring and stability drains ---
    function wireGears(he) {
        he.querySelectorAll('.he-cog').forEach(function (cog) {
            cog.classList.add('he-draggable');
            cog.addEventListener('pointerdown', function (e) {
                if (cog._detached && false) return;
                e.preventDefault();
                try { cog.setPointerCapture(e.pointerId); } catch (_) {}
                var rect = cog.getBoundingClientRect();
                var center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                if (!cog._anchor) cog._anchor = center;    // first grab = its ring seat
                var off = { x: e.clientX - center.x, y: e.clientY - center.y };
                var cont = cog.offsetParent.getBoundingClientRect();
                cog.classList.add('he-dragging');
                function move(ev) {
                    var cx = ev.clientX - off.x, cy = ev.clientY - off.y;
                    cog.style.left = (cx - cont.left) + 'px';
                    cog.style.top = (cy - cont.top) + 'px';
                    var d = Math.hypot(cx - cog._anchor.x, cy - cog._anchor.y);
                    if (d > 100 && !cog._detached) {
                        cog._detached = true;
                        cog.classList.add('he-detached');
                        reactCore(he, true);
                        startDrain(he);
                    }
                }
                function upFn() {
                    cog.classList.remove('he-dragging');
                    document.removeEventListener('pointermove', move);
                    document.removeEventListener('pointerup', upFn);
                }
                document.addEventListener('pointermove', move);
                document.addEventListener('pointerup', upFn);
            });
        });
    }

    function startDrain(he) {
        if (draining) return;
        draining = true;
        var stabEl = he.querySelector('#heStab');
        (function loop() {
            var detached = he.querySelectorAll('.he-cog.he-detached').length;
            if (detached === 0) { draining = false; return; }
            stability -= 0.22 * detached + 0.14;
            if (stability <= 0) { stability = 0; renderStab(he, stabEl); triggerGlitch(he); return; }
            renderStab(he, stabEl);
            setTimeout(loop, 90);
        })();
    }

    function renderStab(he, el) {
        if (el) {
            el.textContent = stability.toFixed(2) + '%';
            el.classList.toggle('he-warn', stability < 60);
            el.classList.toggle('he-crit', stability < 25);
        }
        he.classList.toggle('he-unstable', stability < 55);
        he.style.setProperty('--shake', (1 - stability / 100).toFixed(2));
    }

    // --- Ceiling: suspended gears at different speeds -----------------------
    function ceiling() {
        var g = '';
        var specs = [
            { x: '12%', y: '-8%', s: 260, t: 18, dur: 40, dir: 1 },
            { x: '44%', y: '-14%', s: 380, t: 22, dur: 70, dir: -1 },
            { x: '78%', y: '-6%', s: 220, t: 16, dur: 32, dir: 1 },
            { x: '92%', y: '-16%', s: 320, t: 20, dur: 58, dir: -1 }
        ];
        specs.forEach(function (s) {
            g += '<div class="he-ceil-gear" style="left:' + s.x + ';top:' + s.y +
                ';width:' + s.s + 'px;height:' + s.s + 'px;animation-duration:' + s.dur +
                's;animation-direction:' + (s.dir < 0 ? 'reverse' : 'normal') + '">' +
                gearSVG(s.t, '#242c3a') + '</div>';
        });
        return '<div class="he-ceiling">' + g + '<div class="he-sparks"></div></div>';
    }

    // --- Left wall: the archives -------------------------------------------
    function leftWall() {
        var rows = '<div class="he-arch-title">ARCHIVES</div>';
        ['LOG_0001', 'LOG_0002', 'LOG_0003'].forEach(function (id) {
            rows += '<button class="he-archive" type="button" data-log="' + id + '">' + id + '</button>';
        });
        rows += '<div class="he-arch-sub">UNKNOWN</div>';
        for (var i = 0; i < 3; i++) rows += '<button class="he-archive locked" type="button">LOCKED</button>';
        rows += '<div class="he-arch-readout" id="heReadout"></div>';
        return '<aside class="he-wall he-left">' + rows + '</aside>';
    }

    // --- Right wall: energy conduits ---------------------------------------
    function rightWall() {
        return '<aside class="he-wall he-right">' +
            '<div class="he-pw-title">Power Distribution</div>' +
            '<div class="he-bar"><i style="width:100%"></i></div>' +
            '<div class="he-pw-val">100%</div>' +
            '<div class="he-pw-title">Synchronization</div>' +
            '<div class="he-bar"><i id="heSync" style="width:82%"></i></div>' +
            '<div class="he-pw-val" id="heSyncVal">82%</div>' +
            '<div class="he-pw-title">Engine Stability</div>' +
            '<div class="he-stability" id="heStab">99.99%</div>' +
            '<div class="he-conduit"><span></span><span></span><span></span></div>' +
        '</aside>';
    }

    // --- Centerpiece: the gigantic Core Engine -----------------------------
    function core() {
        var cogs = '';
        [['50%', '2%'], ['84%', '30%'], ['74%', '82%'], ['16%', '78%'], ['6%', '32%']].forEach(function (p, i) {
            var s = i === 0 ? 120 : 150;
            cogs += '<div class="he-cog" style="left:' + p[0] + ';top:' + p[1] +
                ';width:' + s + 'px;height:' + s + 'px;animation-duration:' + (14 + i * 4) +
                's;animation-direction:' + (i % 2 ? 'reverse' : 'normal') + '">' +
                gearSVG(14, '#33405a') + '</div>';
        });

        var pistons = '';
        for (var j = 0; j < 4; j++) {
            pistons += '<div class="he-piston" style="left:' + (18 + j * 22) +
                '%;animation-delay:' + (j * 0.3) + 's"><span></span></div>';
        }
        var steam = '';
        ['28%', '50%', '72%'].forEach(function (x) {
            steam += '<span class="he-vent" style="left:' + x + '"><i></i></span>';
        });

        return '<div class="he-core" id="heCore">' +
            '<div class="he-core-glow"></div>' +
            '<div class="he-cogs">' + cogs + '</div>' +
            '<div class="he-ring he-ring1"></div>' +
            '<div class="he-ring he-ring2"></div>' +
            '<div class="he-ring he-ring3"></div>' +
            '<div class="he-hub"><div class="he-hub-pulse"></div>' +
                '<div class="he-hub-core"></div>' +
                '<div class="he-hub-label"><span>SUMMIT</span><strong>CORE</strong></div></div>' +
            '<div class="he-pistons">' + pistons + '</div>' +
            '<div class="he-vents">' + steam + '</div>' +
        '</div>';
    }

    /* The console never lets anybody through, title or not. It used to
       recognise an account that already held one and put SUMMIT CORE a click
       away, which skipped the gears and the ADMIN ROOM; the core is reached
       from the ADMIN ROOM now, at the end of the chain, by everyone. */
    function hiddenConsole() {
        return '<div class="he-console" id="heConsole">' +
            '<div class="he-console-scan"></div>' +
            '<div class="he-console-title">SUMMIT CORE</div>' +
            '<div class="he-console-line" id="heConsoleLine">Awaiting Administrator...</div>' +
        '</div>';
    }

    // --- Wiring ------------------------------------------------------------
    function wireFloor(he) {
        var glow = he.querySelector('.he-floor-glow');
        he.addEventListener('mousemove', function (e) {
            glow.style.setProperty('--mx', (e.clientX / window.innerWidth * 100) + '%');
            glow.style.setProperty('--my', (e.clientY / window.innerHeight * 100) + '%');
            glow.style.opacity = '1';
        });
        he.addEventListener('mouseleave', function () { glow.style.opacity = '0'; });
    }

    function wireArchives(he) {
        var readout = he.querySelector('#heReadout');
        he.querySelectorAll('.he-archive').forEach(function (btn) {
            btn.addEventListener('click', function () {
                reactCore(he, false);
                if (btn.classList.contains('locked')) {
                    btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
                    readout.textContent = 'ACCESS DENIED';
                    readout.className = 'he-arch-readout err';
                } else {
                    var id = btn.getAttribute('data-log');
                    readout.textContent = '> ' + id + '\n' + (LOGS[id] || '[corrupted]');
                    readout.className = 'he-arch-readout';
                }
            });
        });
    }

    function wireConsole(he) {
        var con = he.querySelector('#heConsole');
        var line = he.querySelector('#heConsoleLine');
        con.addEventListener('click', function () {
            reactCore(he, true);
            line.textContent = 'Administrator credentials required.';
            con.classList.remove('he-console-deny'); void con.offsetWidth;
            con.classList.add('he-console-deny');
            setTimeout(function () { line.textContent = 'Awaiting Administrator...'; }, 2200);
        });
    }

    // The core spins up, flares and vents steam when the vault is touched.
    function reactCore(he, strong) {
        var coreEl = he.querySelector('#heCore');
        if (!coreEl) return;
        coreEl.classList.remove('he-reacting'); void coreEl.offsetWidth;
        coreEl.classList.add('he-reacting');
        he.querySelectorAll('.he-vent').forEach(function (v) {
            v.classList.remove('puff'); void v.offsetWidth; v.classList.add('puff');
        });
        clearTimeout(coreEl._t);
        coreEl._t = setTimeout(function () { coreEl.classList.remove('he-reacting'); }, strong ? 1800 : 1200);
    }

    // Ambient life: steam, pulses and a wandering synchronisation reading.
    function startAmbient(he) {
        var sync = he.querySelector('#heSync'), syncVal = he.querySelector('#heSyncVal');
        var spark = he.querySelector('.he-sparks');
        setInterval(function () {
            he.querySelectorAll('.he-vent').forEach(function (v, i) {
                if (Math.random() < 0.6) setTimeout(function () {
                    v.classList.remove('puff'); void v.offsetWidth; v.classList.add('puff');
                }, i * 160);
            });
            if (sync) {
                var s = (80 + Math.random() * 5).toFixed(0);
                sync.style.width = s + '%'; syncVal.textContent = s + '%';
            }
        }, 3200);
        // occasional spark flashes
        setInterval(function () {
            if (!spark) return;
            spark.classList.remove('flash'); void spark.offsetWidth; spark.classList.add('flash');
        }, 2600);
    }

    function gearSVG(teeth, col) {
        var t = '';
        for (var i = 0; i < teeth; i++) {
            var ang = i * (360 / teeth);
            t += '<rect x="45" y="2" width="10" height="16" rx="2" fill="' + col +
                 '" transform="rotate(' + ang + ' 50 50)"/>';
        }
        return '<svg viewBox="0 0 100 100">' + t +
            '<circle cx="50" cy="50" r="33" fill="' + col + '"/>' +
            '<circle cx="50" cy="50" r="24" fill="none" stroke="#0c0f16" stroke-width="3"/>' +
            '<circle cx="50" cy="50" r="12" fill="#0a0d13"/></svg>';
    }

    // --- Stability hit 0: the whole system tears itself apart ---------------
    function triggerGlitch(he) {
        if (document.getElementById('heGlitch')) return;
        he.classList.add('he-glitching');
        var g = document.createElement('div');
        g.id = 'heGlitch';
        g.innerHTML =
            '<div class="he-glitch-scan"></div>' +
            '<div class="he-glitch-word he-gw1" data-t="administrator">administrator</div>' +
            '<div class="he-glitch-word he-gw2" data-t="please enter">please enter</div>';
        document.body.appendChild(g);
        requestAnimationFrame(function () { g.classList.add('on'); });
        setTimeout(function () { buildAdminRoom(he, g); }, 3800);
    }

    // --- The ADMIN ROOM: where the title is claimed -------------------------
    function buildAdminRoom(he, glitch) {
        if (document.getElementById('adminRoom')) return;
        var ar = document.createElement('div');
        ar.id = 'adminRoom';
        ar.innerHTML =
            '<div class="ar-scan"></div>' +
            '<div class="ar-rain"></div>' +
            '<div class="ar-inner">' +
                '<div class="ar-tag">root@summit:~# access granted</div>' +
                '<h1 class="ar-title" data-t="ADMIN ROOM">ADMIN ROOM</h1>' +
                '<p class="ar-sub">You were never supposed to reach this room.</p>' +
                '<button class="ar-equip" id="arEquip" type="button">▸ EQUIP TITLE :: Admin</button>' +
                '<div class="ar-done" id="arDone"></div>' +
            '</div>';
        document.body.appendChild(ar);
        requestAnimationFrame(function () { ar.classList.add('in'); });
        setTimeout(function () {
            if (glitch) glitch.remove();
            he.style.display = 'none';
        }, 700);
        adminRain(ar);
        wireAdmin(ar);
    }

    function wireAdmin(ar) {
        var btn = ar.querySelector('#arEquip');
        var done = ar.querySelector('#arDone');
        btn.addEventListener('click', function () {
            wearTitle('Admin');
            btn.disabled = true;
            btn.textContent = '✓ TITLE EQUIPPED :: Admin';
            btn.classList.add('equipped');
            /* SUMMIT CORE is here, after the title is equipped — the last
               room of the chain, not a shortcut past it. */
            done.innerHTML =
                'The title <b>Admin</b> is now bound to your name.<br>' +
                '<button class="ar-return" id="arCore" type="button">▸ ENTER SUMMIT CORE</button>' +
                '<button class="ar-return" id="arReturn" type="button">▸ RETURN TO DASHBOARD</button>';
            done.classList.add('show');
            ar.querySelector('#arCore').addEventListener('click', function () {
                enterSummitCore(document.getElementById('hiddenEngine'));
            });
            ar.querySelector('#arReturn').addEventListener('click', function () {
                window.location.href = '/dashboard';
            });
        });
    }

    // A little green code-rain behind the ADMIN ROOM / SUMMIT CORE.
    function adminRain(ar) {
        var host = ar.querySelector('.ar-rain') || ar.querySelector('.ac-rain');
        if (!host) return;
        var cv = document.createElement('canvas');
        host.appendChild(cv);
        var ctx = cv.getContext('2d');
        function size() { cv.width = host.offsetWidth; cv.height = host.offsetHeight; }
        size(); window.addEventListener('resize', size);
        var cols = Math.floor(cv.width / 14), drops = [];
        for (var i = 0; i < cols; i++) drops[i] = Math.random() * cv.height / 14;
        var glyphs = 'ADMIN01<>[]{}=+*#/ｦｧｨABCDEF'.split('');
        setInterval(function () {
            ctx.fillStyle = 'rgba(0,6,2,0.1)'; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.fillStyle = '#2bff88'; ctx.font = '14px monospace';
            for (var i = 0; i < drops.length; i++) {
                ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * 14, drops[i] * 14);
                drops[i] = (drops[i] * 14 > cv.height && Math.random() > 0.97) ? 0 : drops[i] + 1;
            }
        }, 70);
    }

    // --- THE SUMMIT CORE: the administrator's seat. Do anything. -------------
    function enterSummitCore(he) {
        if (document.getElementById('summitCore')) return;
        var ac = document.createElement('div');
        ac.id = 'summitCore';

        var toggles = [
            ['OVERCLOCK ENGINE', 'engine overclocked. gears redlined.'],
            ['INFINITE XP', 'xp cap removed. numbers meaningless now.'],
            ['GHOST MODE', 'you no longer cast a shadow in the logs.'],
            ['FREEZE TIME', 'the clock holds its breath.'],
            ['RECOMPILE REALITY', 'reality rebuilt. hopefully the same.'],
            ['GOD MODE', 'you were always the administrator.']
        ];
        var togHtml = toggles.map(function (t, i) {
            return '<button class="ac-power" type="button" data-msg="' + t[1] + '" data-i="' + i + '">' +
                '<span class="ac-power-dot"></span>' + t[0] + '</button>';
        }).join('');

        ac.innerHTML =
            '<div class="ac-scan"></div>' +
            '<div class="ac-rain"></div>' +
            '<div class="ac-inner">' +
                '<div class="ac-tag">administrator :: privileges UNLIMITED</div>' +
                '<h1 class="ac-title" data-t="SUMMIT CORE">SUMMIT CORE</h1>' +
                '<p class="ac-sub">The core is yours. You can do anything here.</p>' +
                '<div class="ac-field">' +
                    '<label>DISPLAYED TITLE</label>' +
                    '<div class="ac-row">' +
                        '<input id="acTitle" spellcheck="false" autocomplete="off" maxlength="24" value="' +
                            (localStorage.getItem('summitTitle:' + user()) || 'Admin') + '">' +
                        '<button id="acSetTitle" type="button">SET</button>' +
                    '</div>' +
                    '<div class="ac-hint" id="acTitleHint">shows before your name on the dashboard</div>' +
                '</div>' +
                '<div class="ac-powers">' + togHtml + '</div>' +
                '<div class="ac-term">' +
                    '<div class="ac-term-log" id="acLog"></div>' +
                    '<div class="ac-term-row"><span class="ac-prompt">core@summit:~#</span>' +
                        '<input class="ac-cmd" id="acCmd" spellcheck="false" autocomplete="off"></div>' +
                '</div>' +
                '<button class="ac-return" id="acReturn" type="button">▸ RETURN TO DASHBOARD</button>' +
            '</div>';
        document.body.appendChild(ac);
        requestAnimationFrame(function () { ac.classList.add('in'); });
        adminRain(ac);
        wireSummitCore(ac, he);
    }

    function wireSummitCore(ac, he) {
        var titleInput = ac.querySelector('#acTitle');
        var setBtn = ac.querySelector('#acSetTitle');
        var hint = ac.querySelector('#acTitleHint');
        function setTitle(v) {
            /* Renaming keeps it worn — the label above this field says DISPLAYED
               TITLE, and a rename that left the rail on the old name would be
               worse than no rename at all: the old name is gone, so the rail
               would fall back to the band. */
            v = wearTitle(v);
            hint.textContent = 'title set to "' + v + '" — it now shows on the dashboard.';
            hint.classList.add('ok');
            if (he) reactCore(he, false);
        }
        setBtn.addEventListener('click', function () { setTitle(titleInput.value); });
        titleInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') setTitle(titleInput.value); });

        ac.querySelectorAll('.ac-power').forEach(function (b) {
            b.addEventListener('click', function () {
                var on = b.classList.toggle('on');
                if (he) reactCore(he, true);
                acLog(ac, (on ? '✓ ' : '× ') + b.textContent.trim() + (on ? ' — ' + b.getAttribute('data-msg') : ' disabled'));
            });
        });

        var cmd = ac.querySelector('#acCmd');
        acLog(ac, 'SUMMIT CORE shell — administrator session. type anything.');
        cmd.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var raw = cmd.value; var c = raw.trim(); cmd.value = '';
            acLog(ac, 'core@summit:~# ' + raw, 'cmd');
            runCore(ac, he, c);
        });
        ac.querySelector('#acReturn').addEventListener('click', function () {
            window.location.href = '/dashboard';
        });
        setTimeout(function () { cmd.focus(); }, 400);
    }

    function acLog(ac, text, cls) {
        var log = ac.querySelector('#acLog'); if (!log) return;
        var d = document.createElement('div');
        if (cls) d.className = 'ac-' + cls;
        d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight;
    }

    function runCore(ac, he, cmd) {
        var parts = cmd.split(/\s+/); var c = (parts[0] || '').toLowerCase();
        if (he) reactCore(he, false);
        switch (c) {
            case '': break;
            case 'help': acLog(ac, 'title <name> · whoami · sudo <..> · clear · exit · (anything else just works)'); break;
            case 'whoami': acLog(ac, 'administrator'); break;
            case 'title':
                var v = wearTitle(parts.slice(1).join(' '));
                acLog(ac, 'title updated → ' + v);
                var ti = ac.querySelector('#acTitle'); if (ti) ti.value = v;
                break;
            case 'sudo': acLog(ac, 'granted.'); break;
            case 'clear': ac.querySelector('#acLog').innerHTML = ''; break;
            case 'exit': window.location.href = '/dashboard'; break;
            default: acLog(ac, '✓ executed.'); break;   // an admin can do anything
        }
    }

    window.SummitHiddenEngine = { reveal: reveal, summitCore: enterSummitCore };
})();
