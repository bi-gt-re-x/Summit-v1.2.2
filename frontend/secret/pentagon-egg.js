/* pentagon-egg.js — the second clue in the chain.
 *
 * The mysterious quote (unlocked on the dashboard) says "The pentagon is the
 * key, find it" — this pentagon in the landing page's Growth Rating card. It
 * only wakes up once that quote has been revealed today. Every click pops it;
 * on the third the pop rolls into a full turn, after which the whole page
 * shakes, all the cards collapse in on themselves and vanish, and a lone
 * clickable arrow is left.
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
    // Gate: the mysterious quote must have shown up today (dashboard easter egg).
    function quoteUnlocked() {
        try { return localStorage.getItem('easterEgg:' + user() + ':' + todayStr()) === '1'; }
        catch (e) { return false; }
    }
    function init() {
        var pent = document.querySelector('.lp-preview-rating .lp-radar');
        if (!pent) return;
        if (!quoteUnlocked()) return;          // stays inert until the quote is found

        /* No `cursor: pointer`. It used to be set here, and only in dark mode,
           which was the one visible difference between a pentagon that was a
           door and one that was a drawing — an arrow turning into a hand is
           exactly the tell a secret cannot afford. */
        pent.style.pointerEvents = 'auto';

        var clicks = 0;
        var busy = false;
        pent.addEventListener('click', function () {
            if (busy) return;
            /* The dark-mode gate is gone from the whole chain. It was here and
               on the door that opens this one, and it meant a reader in the
               light clicked ten times on the dashboard, got nothing, and had no
               way to find out why — the one state where a secret is not
               mysterious but broken. The clue is a clue in both themes now. */
            clicks++;
            // Every click pops — the third one's pop is built into the front of
            // the spin, so it turns straight out of the same bounce.
            pent.classList.remove('pentagon-pop');
            void pent.offsetWidth;                  // restart the animation
            if (clicks < 3) {
                pent.classList.add('pentagon-pop');
            } else {
                busy = true;
                pent.classList.add('pentagon-spin'); // pop into a full 360° turn
                setTimeout(collapsePage, 720);       // then the page comes apart
            }
        });
    }

    function collapsePage() {
        var main = document.querySelector('.home-main') || document.body;
        var lp = document.querySelector('.lp');
        if (!lp) return;

        // 1) The whole main page shakes.
        document.documentElement.classList.add('pent-clip');
        main.classList.add('page-quake');

        // 2) The shake settles into a collapse — every card implodes and fades,
        //    and the surrounding chrome (nav, account row, footer) dissolves too
        //    so the whole page empties out.
        setTimeout(function () {
            main.classList.remove('page-quake');
            lp.classList.add('page-collapse');
            document.body.classList.add('pent-void');
        }, 820);

        // 3) Once the debris has flown off, the page is emptied and a lone
        //    arrow is left behind.
        setTimeout(function () {
            lp.style.display = 'none';
            document.documentElement.classList.remove('pent-clip');
            showArrow(lp);
        }, 820 + 1300);
    }

    function showArrow(lp) {
        if (document.getElementById('pentArrow')) return;
        var btn = document.createElement('button');
        btn.id = 'pentArrow';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Continue');
        btn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="4" y1="12" x2="18" y2="12"/><polyline points="12 6 18 12 12 18"/></svg>';
        document.body.appendChild(btn);
        requestAnimationFrame(function () { btn.classList.add('show'); });

        // Clickable: it leads into the mutated, super-dark, empty calendar.
        btn.addEventListener('click', function () {
            btn.classList.add('leaving');
            setTimeout(function () {
                window.location.href = '/calendar#void';
            }, 380);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
