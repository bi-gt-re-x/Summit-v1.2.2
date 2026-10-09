/* engine.js — THE ENGINE room, served on the dedicated /engine page.
 *
 * Reached only through the hidden chain (dashboard quote → pentagon → void
 * riddle → shatter). Builds the industrial machine hall — gears, belts, pipes,
 * pistons, floating code and the living SUMMIT ENGINE core — plus the metal
 * ENGINE SETTINGS door and a small ◂ button back to the dashboard.
 */
(function () {
    'use strict';

    function user() {
        return (window.localStorage && localStorage.getItem('currentUser')) || 'Default';
    }
    function todayStr() {
        var d = new Date();
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    function unlocked() {
        try { return localStorage.getItem('easterEgg:' + user() + ':' + todayStr()) === '1'; }
        catch (e) { return false; }
    }

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    ready(function () {
        // The engine is a secret — reachable once today's unlock is written,
        // by the dashboard's mountain or by answering the riddle. A title
        // earned on an earlier day is no way in: it used to be, and an admin
        // could type /engine and skip the whole chain.
        if (!unlocked()) { window.location.replace('/home'); return; }
        buildEngine();
    });

    function buildEngine() {
        var eng = document.createElement('div');
        eng.id = 'summitEngine';

        var gearSpecs = [
            { x: '7%',  y: '22%', s: 190, t: 14, dur: 36, dir: 1 },
            { x: '90%', y: '17%', s: 250, t: 16, dur: 48, dir: -1 },
            { x: '85%', y: '80%', s: 290, t: 18, dur: 56, dir: 1 },
            { x: '13%', y: '82%', s: 220, t: 14, dur: 42, dir: -1 },
            { x: '50%', y: '9%',  s: 130, t: 12, dur: 30, dir: 1 }
        ];
        var gears = gearSpecs.map(function (g) {
            return '<div class="eng-gear" style="left:' + g.x + ';top:' + g.y +
                ';width:' + g.s + 'px;height:' + g.s + 'px;animation-duration:' + g.dur +
                's;animation-direction:' + (g.dir < 0 ? 'reverse' : 'normal') + '">' +
                gearSVG(g.t) + '</div>';
        }).join('');

        var pistons = '';
        for (var i = 0; i < 7; i++) {
            pistons += '<div class="eng-piston" style="left:' + (4 + i * 14) + '%;' +
                'animation-delay:' + (i * 0.16) + 's"><span></span></div>';
        }

        var belts =
            belt('20%', 'ltr', ['+10 XP', 'TASK ✓', '+25 XP', 'FOCUS', '+5 XP', 'TASK ✓', 'LEVEL ↑', '+15 XP']) +
            belt('73%', 'rtl', ['COMPILE', '+40 XP', 'TASK ✓', 'STREAK', '+15 XP', 'RENDER', '+10 XP', 'BUILD']);

        var comments = [
            { t: '// Productivity is manufactured here.', x: '6%',  y: '33%' },
            { t: '// Reality is compiled every refresh.', x: '58%', y: '26%' },
            { t: '// Do not alter the engine.',           x: '30%', y: '63%' }
        ];
        var floatCode = comments.map(function (c, i) {
            return '<pre class="eng-cmt" style="left:' + c.x + ';top:' + c.y +
                ';animation-delay:' + (i * 0.8) + 's">' + c.t + '</pre>';
        }).join('');
        var streams = '';
        for (var j = 0; j < 3; j++) {
            streams += '<pre class="eng-stream" style="left:' + (12 + j * 38) +
                '%;animation-duration:' + (9 + j * 3) + 's"></pre>';
        }

        var lightCols = ['#57e08a', '#e0b74f', '#b0413e', '#57e08a', '#5aa0ff', '#e0b74f', '#57e08a', '#b0413e', '#5aa0ff'];
        var lights = lightCols.map(function (col, k) {
            return '<span class="eng-light" style="--lc:' + col + ';animation-delay:' +
                (k * 0.21) + 's;animation-duration:' + (0.9 + (k % 3) * 0.5) + 's"></span>';
        }).join('');

        // Steam vents around the core — they hiss when the machine reacts.
        var steam = '';
        ['32%', '50%', '68%'].forEach(function (x) {
            steam += '<span class="eng-vent" style="left:' + x + '"><i></i></span>';
        });

        eng.innerHTML =
            '<div class="eng-room"><div class="eng-floor"></div><div class="eng-haze"></div></div>' +
            '<div class="eng-layer eng-pipes">' + pipesSVG() + '</div>' +
            '<div class="eng-layer eng-gears">' + gears + '</div>' +
            '<div class="eng-layer eng-belts">' + belts + '</div>' +
            '<div class="eng-layer eng-codewrap">' + floatCode + streams + '</div>' +
            '<div class="eng-layer eng-pistons">' + pistons + '</div>' +
            '<div class="eng-layer eng-steam">' + steam + '</div>' +
            coreMarkup() +
            '<div class="eng-panel">' + lights + '</div>' +
            '<div class="eng-vignette"></div>' +
            '<div class="eng-nameplate">THE ENGINE</div>' +
            backButton() +
            settingsArrow();
        document.body.appendChild(eng);

        wireBack(eng);
        wireSettings(eng);
        requestAnimationFrame(function () { eng.classList.add('lit'); });
        startCode(eng);

        // No shortcut for anyone who already holds a title. The vault used to
        // open by itself for them, with SUMMIT CORE one click away — the whole
        // second half of the chain skipped. Everybody goes through ENGINE
        // SETTINGS, `unlock hidden`, the gears and the ADMIN ROOM.

        // Any interaction with the system makes the engine spin up, light up
        // and vent steam for a beat.
        window.SummitEngine = {
            react: function () {
                eng.classList.remove('eng-reacting'); void eng.offsetWidth;
                eng.classList.add('eng-reacting');
                eng.querySelectorAll('.eng-vent').forEach(function (v) {
                    v.classList.remove('puff'); void v.offsetWidth; v.classList.add('puff');
                });
                clearTimeout(window.SummitEngine._t);
                window.SummitEngine._t = setTimeout(function () {
                    eng.classList.remove('eng-reacting');
                }, 1400);
            }
        };
    }

    function coreMarkup() {
        return '<div class="eng-core">' +
            '<div class="eng-core-glow"></div>' +
            '<div class="eng-core-ring eng-core-ring1"></div>' +
            '<div class="eng-core-ring eng-core-ring2"></div>' +
            '<div class="eng-core-ring eng-core-ring3"></div>' +
            '<div class="eng-core-hub">' +
                '<div class="eng-core-pulse"></div>' +
                '<div class="eng-core-name"><span>SUMMIT</span><strong>ENGINE</strong></div>' +
            '</div>' +
        '</div>';
    }

    function pipesSVG() {
        var pipe = function (d) { return '<path class="eng-pipe" d="' + d + '"/>'; };
        var flow = function (d) { return '<path class="eng-flow" d="' + d + '"/>'; };
        var d1 = 'M0 28 H26 Q38 28 38 40 V64';
        var d2 = 'M100 20 H72 Q60 20 60 32 V58';
        var d3 = 'M10 100 V82 Q10 72 22 72 H44';
        var d4 = 'M100 74 H80 Q70 74 70 84 V100';
        return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
            pipe(d1) + pipe(d2) + pipe(d3) + pipe(d4) +
            flow(d1) + flow(d2) + flow(d3) +
            '</svg>';
    }

    function belt(top, dir, items) {
        var doubled = items.concat(items);
        var chips = doubled.map(function (it) {
            return '<span class="eng-chip">' + it + '</span>';
        }).join('');
        return '<div class="eng-belt" style="top:' + top + '">' +
            '<div class="eng-belt-surface"></div>' +
            '<div class="eng-belt-track' + (dir === 'rtl' ? ' rtl' : '') + '">' + chips + '</div>' +
        '</div>';
    }

    function backButton() {
        return '<button class="eng-back" id="engBack" type="button" aria-label="Back to dashboard">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
                'stroke-linecap="round" stroke-linejoin="round">' +
                '<line x1="20" y1="12" x2="6" y2="12"/><polyline points="12 6 6 12 12 18"/></svg>' +
        '</button>';
    }

    function settingsArrow() {
        return '<button id="engSettings" class="eng-settings" type="button" aria-label="Engine settings">' +
            '<span class="eng-settings-text">ENGINE SETTINGS</span>' +
            '<svg class="eng-settings-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
                '<line x1="4" y1="12" x2="17" y2="12"/><polyline points="12 6 18 12 12 18"/></svg>' +
        '</button>';
    }

    function wireBack(eng) {
        var back = eng.querySelector('#engBack');
        if (!back) return;
        back.addEventListener('click', function () {
            eng.classList.remove('lit');
            setTimeout(function () { window.location.href = '/dashboard'; }, 450);
        });
    }

    function wireSettings(eng) {
        var btn = eng.querySelector('#engSettings');
        if (!btn) return;
        btn.addEventListener('click', function () {
            btn.classList.add('pressed');
            eng.classList.add('powering');
            if (window.SummitEngine) window.SummitEngine.react();   // steam + spin-up
            setTimeout(function () {
                btn.classList.remove('pressed');
                eng.classList.remove('powering');
                if (window.SummitEngineSettings) window.SummitEngineSettings.open();
            }, 260);
        });
    }

    function gearSVG(teeth) {
        var t = '';
        for (var i = 0; i < teeth; i++) {
            var ang = i * (360 / teeth);
            t += '<rect x="44" y="2" width="12" height="18" rx="2.5" fill="#3a4150" ' +
                 'transform="rotate(' + ang + ' 50 50)"/>';
        }
        return '<svg viewBox="0 0 100 100">' + t +
            '<circle cx="50" cy="50" r="34" fill="#2f3542"/>' +
            '<circle cx="50" cy="50" r="34" fill="none" stroke="#4b566b" stroke-width="1.5"/>' +
            '<circle cx="50" cy="50" r="25" fill="none" stroke="#12151c" stroke-width="2.5"/>' +
            '<circle cx="50" cy="50" r="13" fill="#0a0d13"/>' +
            '<circle cx="50" cy="50" r="13" fill="none" stroke="#5a6675" stroke-width="2"/>' +
            '</svg>';
    }

    function startCode(eng) {
        var glyphs = '01{}[]()<>=+-*/;:#&|!$%ABCDEF0123456789';
        var line = function (n) {
            var s = '';
            for (var i = 0; i < n; i++) s += glyphs[(Math.random() * glyphs.length) | 0];
            return s;
        };
        var cols = eng.querySelectorAll('.eng-stream');
        cols.forEach(function (pre) {
            var rows = 22, buf = [];
            for (var i = 0; i < rows; i++) buf.push(line(9));
            pre.textContent = buf.join('\n');
            pre._buf = buf;
        });
        setInterval(function () {
            cols.forEach(function (pre) {
                var buf = pre._buf; if (!buf) return;
                for (var k = 0; k < 3; k++) buf[(Math.random() * buf.length) | 0] = line(9);
                pre.textContent = buf.join('\n');
            });
        }, 130);
    }
})();
