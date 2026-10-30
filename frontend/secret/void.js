/* void.js — the riddle at the end of the chain.
 *
 * When the pentagon's arrow drops you into /calendar#void, the page is emptied
 * (void.css hides all of it) and a single riddle hangs in the dark:
 *
 *   "I have no legs, but I can run. I have no lungs, but I need air. I feed on
 *    fuel, and my heart beats with a roar."   →  engine
 *
 * Answer it and jagged cracks race across the screen, the page shatters into
 * shards that rain down, and you drop through into /engine.
 *
 * Two ways in, one riddle. Arriving with html.egg-void already set — the
 * calendar, via the pentagon — opens it on load; anything else opens it by
 * hand through VoidRiddle.open(), which is how the landing page's testimonial
 * (quote-egg.js) reaches the same dark room without leaving the page.
 */
(function () {
    'use strict';

    var ANSWER = 'engine';
    var RIDDLE = "I have no legs, but I can run. I have no lungs, but I need air. " +
                 "I feed on fuel, and my heart beats with a roar. What am I?";

    // What the void says to a wrong answer, one line per miss, the last one
    // repeating. A flat "no" every time read as a broken box after the third
    // try, so it starts pointing the way.
    var NUDGES = [
        '… no.',
        '… still no.',
        '… look under the hood.',
        '… six letters. under the hood.'
    ];

    // "engine", "an engine", "The engine!", "engines": all the same answer. It
    // used to strip everything but letters and compare, so "an engine" came out
    // as "anengine" and got a "no" for being right. A short phrase with the
    // word in it counts; a long list of guesses doesn't.
    function isAnswer(raw) {
        var words = String(raw || '').toLowerCase().match(/[a-z]+/g) || [];
        if (words.length > 4) return false;
        return words.some(function (w) { return w === ANSWER || w === ANSWER + 's'; });
    }

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    // The day's unlock — the same flag the dashboard's ten clicks on the logo
    // set, and the one /engine checks on arrival. Stamped when the riddle is
    // answered, so whichever way somebody reached the question, solving it is
    // enough to be let through. (Coming by the pentagon, it is already set.)
    function markUnlocked() {
        try {
            var user = (window.localStorage && localStorage.getItem('currentUser')) || 'Default';
            var d = new Date();
            var p = function (n) { return n < 10 ? '0' + n : '' + n; };
            var day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
            localStorage.setItem('easterEgg:' + user + ':' + day, '1');
        } catch (e) {}
    }

    // Hang the riddle in the dark. Safe to call twice — the second call finds
    // it already there and leaves it alone.
    function open() {
        if (document.getElementById('voidRiddle')) return;
        // Nothing here is meant to be read or dragged — only answered.
        document.body.style.userSelect = 'none';
        buildRiddle();
    }
    window.VoidRiddle = { open: open };

    if (document.documentElement.classList.contains('egg-void')) ready(open);

    function buildRiddle() {
        var wrap = document.createElement('div');
        wrap.id = 'voidRiddle';
        wrap.innerHTML =
            '<div class="void-riddle-inner">' +
                '<p class="void-riddle-text"></p>' +
                '<form id="voidRiddleForm" autocomplete="off">' +
                    '<input id="voidRiddleInput" type="text" spellcheck="false" ' +
                        'autocomplete="off" placeholder="…" aria-label="Answer" />' +
                '</form>' +
                '<p class="void-riddle-err" id="voidRiddleErr" aria-live="polite"></p>' +
            '</div>';
        document.body.appendChild(wrap);
        wrap.querySelector('.void-riddle-text').textContent = RIDDLE;

        var form = document.getElementById('voidRiddleForm');
        var input = document.getElementById('voidRiddleInput');
        var err = document.getElementById('voidRiddleErr');

        var misses = 0;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (isAnswer(input.value)) {
                solve(wrap);
            } else {
                misses++;
                err.textContent = NUDGES[Math.min(misses, NUDGES.length) - 1];
                input.classList.remove('wrong');
                void input.offsetWidth;
                input.classList.add('wrong');
                // Leave the guess showing but selected, so the next one
                // replaces it instead of landing on the end ("carfire").
                input.select();
            }
        });

        requestAnimationFrame(function () { wrap.classList.add('show'); });
        setTimeout(function () { input.focus(); }, 500);
    }

    function solve(wrap) {
        var input = document.getElementById('voidRiddleInput');
        if (input) input.blur();
        wrap.classList.add('solved');          // riddle recedes into the dark
        markUnlocked();                        // the answer is the key

        drawCracks(function () {
            shatter(function () {
                // The floor is gone — drop through into the engine.
                window.location.href = '/engine';
            });
        });
    }

    // --- Jagged cracks racing across the screen -----------------------------
    function drawCracks(done) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'voidCracks';
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');

        var forks = 9;
        for (var i = 0; i < forks; i++) {
            var ang = (i / forks) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            svg.appendChild(makeCrack(50, 50, ang, i * 0.05));
        }
        document.body.appendChild(svg);
        setTimeout(done, 620);
    }

    function makeCrack(cx, cy, angle, delay) {
        var d = 'M ' + cx + ' ' + cy;
        var x = cx, y = cy, a = angle, step = 8 + Math.random() * 6, hops = 7;
        for (var i = 0; i < hops; i++) {
            a += (Math.random() - 0.5) * 0.8;
            x += Math.cos(a) * step;
            y += Math.sin(a) * step;
            d += ' L ' + x.toFixed(1) + ' ' + y.toFixed(1);
            step *= 0.92;
        }
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('class', 'void-crack');
        p.style.animationDelay = delay + 's';
        return p;
    }

    // --- The shatter: the screen breaks into shards that rain down ----------
    function shatter(done) {
        var layer = document.createElement('div');
        layer.id = 'voidShatter';
        var G = 7;                               // G×G grid, two shards per cell
        for (var r = 0; r < G; r++) {
            for (var c = 0; c < G; c++) {
                addShard(layer, c, r, G, true);
                addShard(layer, c, r, G, false);
            }
        }
        document.body.appendChild(layer);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { layer.classList.add('go'); });
        });
        setTimeout(function () { if (done) done(); }, 1650);
    }

    function addShard(layer, c, r, G, upper) {
        var u = 100 / G;
        var x0 = c * u, x1 = (c + 1) * u, y0 = r * u, y1 = (r + 1) * u;
        var clip = upper
            ? 'polygon(' + x0 + '% ' + y0 + '%, ' + x1 + '% ' + y0 + '%, ' + x0 + '% ' + y1 + '%)'
            : 'polygon(' + x1 + '% ' + y0 + '%, ' + x1 + '% ' + y1 + '%, ' + x0 + '% ' + y1 + '%)';
        var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        var dx = (cx - 50) / 50, dy = (cy - 50) / 50;
        var sh = document.createElement('div');
        sh.className = 'void-shard';
        sh.style.clipPath = clip;
        sh.style.webkitClipPath = clip;
        sh.style.setProperty('--tx', (dx * (6 + Math.random() * 14)).toFixed(1) + 'vw');
        sh.style.setProperty('--ty', (108 + Math.random() * 60).toFixed(1) + 'vh');
        sh.style.setProperty('--rot', ((Math.random() - 0.5) * 220).toFixed(0) + 'deg');
        sh.style.transitionDelay = ((Math.abs(dx) + Math.abs(dy)) * 0.13).toFixed(2) + 's';
        layer.appendChild(sh);
    }
})();
