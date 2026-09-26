// In-page links, the theme switch and back to top.
//
// A jump to a section used to scroll and stop there: the address never
// changed, so Back left the site, and focus stayed on the link, so "Skip to
// content" skipped nothing. The theme switch and back to top both floated in
// the bottom-right corner, over the hero's availability line and buttons on
// a phone. These pin the replacements down. What only a real browser can
// show (the next Tab after the skip link, what the button covers on a real
// layout) is in scripts/smoke.js.
//
// Run with: node tests/navigation.test.js

const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (window, el, init) => {
    const ev = new window.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, init || {}));
    el.dispatchEvent(ev);
    return ev;
};

// Counts scrollIntoView per element id, so a jump handled twice shows.
const countScrolls = (window) => {
    const scrolled = {};
    window.HTMLElement.prototype.scrollIntoView = function () {
        scrolled[this.id] = (scrolled[this.id] || 0) + 1;
    };
    return scrolled;
};

(async () => {
    // --- A link is a navigation: one history entry, focus on the target ---
    {
        const { window } = run('dark', {
            // A link whose target is focusable already, put in before the
            // script binds its links.
            before: (w) => {
                const a = w.document.createElement('a');
                a.href = '#navProbeBtn';
                a.id = 'navProbeLink';
                const b = w.document.createElement('button');
                b.type = 'button';
                b.id = 'navProbeBtn';
                w.document.body.append(a, b);
            }
        });
        const doc = window.document;
        const scrolled = countScrolls(window);

        click(window, doc.getElementById('navProbeLink'));
        const btn = doc.getElementById('navProbeBtn');
        assert(doc.activeElement === btn && !btn.hasAttribute('tabindex'), 'Links: a target that is focusable already gets focus and keeps its own tabindex');

        const start = window.history.length;

        const about = doc.querySelector('.nav-menu a[href="#about"]');
        const ev = click(window, about);
        const section = doc.getElementById('about');
        assert(ev.defaultPrevented, 'Links: the page handles an in-page link itself');
        assert(window.location.hash === '#about' && window.history.length === start + 1, `Links: the address becomes #about with one new history entry (hash ${window.location.hash}, +${window.history.length - start})`);
        assert(doc.activeElement === section, `Links: focus moves to the section (on ${doc.activeElement && (doc.activeElement.id || doc.activeElement.tagName)})`);
        assert(section.getAttribute('tabindex') === '-1', 'Links: a section is given tabindex="-1" so it can take focus');
        assert(scrolled.about === 1, 'Links: the page scrolls to the section once');

        click(window, about);
        assert(window.history.length === start + 1, 'Links: following the same link again adds no second entry');

        const skip = doc.querySelector('.skip-link');
        click(window, skip);
        const main = doc.getElementById('main');
        assert(doc.activeElement === main && window.location.hash === '#main', 'Links: the skip link moves focus to <main>, so the next Tab starts inside it');

        // Back and Forward: jsdom fires popstate and hashchange, as browsers
        // do; the landing happens once, a task later.
        click(window, doc.querySelector('.nav-menu a[href="#skills"]'));
        assert(doc.activeElement === doc.getElementById('skills'), 'Links: focus is on #skills before going Back');
        const aboutScrolls = scrolled.about;
        window.history.back();
        await wait(40);
        assert(window.location.hash === '#main', `History: Back returns to the previous address (${window.location.hash})`);
        assert(doc.activeElement === main, 'History: Back moves focus to where that entry pointed');
        window.history.back();
        await wait(40);
        assert(window.location.hash === '#about' && doc.activeElement === section, 'History: Back again lands on #about');
        assert(scrolled.about === aboutScrolls + 1, `History: popstate and hashchange for one Back land once, not twice (${scrolled.about - aboutScrolls})`);
        window.history.forward();
        await wait(40);
        assert(window.location.hash === '#main' && doc.activeElement === main, 'History: Forward lands on #main again');

        // Last, because jsdom then follows the link itself (a browser would
        // open a tab), which is a history entry of its own.
        const modified = click(window, about, { ctrlKey: true });
        assert(!modified.defaultPrevented, 'Links: a Ctrl-click is left to the browser (a new tab), not hijacked');
    }

    // --- A jump glides, except in low-energy mode ---
    // 'auto' would defer to the stylesheet, whose html scroll-behavior is
    // smooth, so low-energy mode used to glide the whole page anyway.
    {
        const { window } = run('dark');
        const doc = window.document;
        const seen = [];
        window.HTMLElement.prototype.scrollIntoView = function (opts) { seen.push(opts && opts.behavior); };
        click(window, doc.querySelector('.nav-menu a[href="#about"]'));
        doc.body.classList.add('eco-mode');
        click(window, doc.querySelector('.nav-menu a[href="#skills"]'));
        window.history.back();
        await wait(40);
        assert(seen[0] === 'smooth' && seen[1] === 'instant' && seen[2] === 'instant',
            `Motion: a jump glides, but not in low-energy mode, Back included (${seen.join(', ')})`);
    }

    // --- Back into a collapsed dossier opens it again ---
    {
        const { window } = run('dark');
        const doc = window.document;
        countScrolls(window);
        const card = doc.querySelector('.project-card[data-project="groundwater"]');
        const game = doc.getElementById('boreholeGame');
        assert(!!card && !!game && card.contains(game), 'Dossier setup: the borehole game sits inside the groundwater dossier');

        click(window, doc.querySelector('.play-index a[href="#boreholeGame"]'));
        assert(card.classList.contains('expanded'), 'Dossier: a link into a closed dossier opens it');
        await wait(300);
        assert(doc.activeElement === game, 'Dossier: focus lands on the game once the dossier is open');

        card.querySelector('.project-toggle').click();   // the reader closes it
        assert(!card.classList.contains('expanded'), 'Dossier setup: closed again');
        click(window, doc.querySelector('.nav-menu a[href="#skills"]'));
        window.history.back();
        await wait(320);
        assert(window.location.hash === '#boreholeGame' && card.classList.contains('expanded'), 'Dossier: Back to #boreholeGame opens the dossier again');
        assert(doc.activeElement === game, 'Dossier: and focus follows it in');
    }

    // --- The theme switch is a button in the nav bar ---
    {
        const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const tag = (raw.match(/<button[^>]*id="themeToggle"[^>]*>/) || [''])[0];
        assert(/\btype="button"/.test(tag) && /\shidden(\s|>|=)/.test(tag), 'Theme: the static button is type="button" and hidden until the script can run it');
        const bar = raw.indexOf('class="nav-container"');
        assert(bar > 0 && raw.indexOf('id="themeToggle"') > bar &&
            /<button[^>]*id="themeToggle"[^>]*>[\s\S]*?<\/button>\s*<button[^>]*id="navToggle"/.test(raw),
            'Theme: it sits in the nav bar, immediately before the menu button');

        const { window } = run('dark');
        const doc = window.document;
        const toggle = doc.getElementById('themeToggle');
        const meta = doc.querySelector('meta[name="theme-color"]');
        assert(doc.querySelectorAll('.theme-toggle').length === 1 && toggle.parentElement.classList.contains('nav-container'), 'Theme: one switch, in the bar, none added to the page corner');
        assert(toggle.hidden === false, 'Theme: the script shows it');
        assert(toggle.getAttribute('aria-label') === 'Switch to light theme', `Theme: in the dark its name says it switches to light (${toggle.getAttribute('aria-label')})`);

        toggle.click();
        const use = toggle.querySelector('use');
        assert(doc.body.classList.contains('light-mode'), 'Theme: pressing it switches to light');
        assert(toggle.getAttribute('aria-label') === 'Switch to dark theme' && use.getAttribute('href') === '#i-sun', 'Theme: the name and the icon follow');
        assert(meta.getAttribute('content') === '#f4f6f0', `Theme: the browser chrome colour follows (${meta.getAttribute('content')})`);
        assert(window.localStorage.getItem('theme') === 'light', 'Theme: the choice is remembered');
        toggle.click();
        assert(!doc.body.classList.contains('light-mode') && toggle.getAttribute('aria-label') === 'Switch to light theme' && meta.getAttribute('content') === '#0a0a0a', 'Theme: and back to dark');
    }
    {
        const { window } = run('light');
        const toggle = window.document.getElementById('themeToggle');
        assert(toggle.getAttribute('aria-label') === 'Switch to dark theme', 'Theme: a remembered light theme is named correctly on arrival');
    }

    // --- Back to top: after one full screen, and never over a control ---
    {
        const observers = [];
        const { window } = run('dark', {
            before: (w) => {
                w.IntersectionObserver = class {
                    constructor(cb, opts) { this.cb = cb; this.opts = opts || {}; this.els = []; observers.push(this); }
                    observe(el) { this.els.push(el); }
                    unobserve() {}
                    disconnect() {}
                };
            }
        });
        const doc = window.document;
        const btn = doc.getElementById('scrollTop');
        const scrollTo = async (y) => {
            window.pageYOffset = y;
            window.dispatchEvent(new window.Event('scroll'));
            await wait(20);
        };
        window.innerHeight = 800;

        await scrollTo(790);
        assert(!btn.classList.contains('visible'), 'Back to top: hidden before one full screen of scrolling (it used to show at 400px)');
        await scrollTo(820);
        assert(btn.classList.contains('visible'), 'Back to top: shown after one full screen');

        const band = observers.find(o => o.els.some(el => el.classList.contains('contact-form')));
        const watched = (sel) => band && band.els.includes(doc.querySelector(sel));
        assert(!!band && ['.hero-availability', '.hero-cta', '.contact-form', '.footer'].every(watched),
            'Back to top: it watches the availability line, the hero buttons, the contact form and the footer');
        const form = doc.querySelector('.contact-form');
        band.cb([{ target: form, isIntersecting: true }]);
        await wait(20);
        assert(!btn.classList.contains('visible'), 'Back to top: it steps aside while the contact form passes beneath it');
        band.cb([{ target: form, isIntersecting: false }]);
        await wait(20);
        assert(btn.classList.contains('visible'), 'Back to top: and comes back once the form has passed');

        btn.click();
        assert(doc.activeElement === doc.getElementById('home'), 'Back to top: focus goes to the top of the page, not down with the hidden button');
    }

    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    // The site script leaves timers running (the slideshow), which would
    // otherwise keep the process alive.
    process.exit(0);
})().catch((err) => {
    console.log('FAIL: navigation checks threw', err);
    process.exit(1);
});
