// ===================================
// SAFE STORAGE
// ===================================
// Touching localStorage is not a safe operation. Browsers throw on the
// *property access itself* — not just on get/set — when storage is blocked:
// Chrome with third-party cookies disabled inside an iframe, Firefox with
// dom.storage.enabled off, Safari in Lockdown Mode, a corporate policy, or
// simply a full quota. The exception is a SecurityError, and an uncaught one
// at module scope stops the rest of this file from ever running.
//
// That is exactly what happened here: `localStorage.getItem('theme')` sat at
// top level, so a visitor with storage blocked lost the theme toggle, the
// low-energy mode, the narration player, the terminal — everything defined
// below the throw. A preference that cannot be saved should cost the
// preference, not the page.
//
// Every read and write in this file goes through here. Preferences then last
// for the session in memory and are forgotten on reload, which is the correct
// degradation: the feature still works, it just cannot remember.
const safeStorage = (() => {
    const fallback = { local: new Map(), session: new Map() };

    // Resolved lazily and cached: the property access is itself the throw, so
    // this cannot be hoisted to module scope, and probing on every call would
    // pay for the same exception over and over.
    const probed = {};
    const backend = (kind) => {
        if (kind in probed) return probed[kind];
        let store = null;
        try {
            const candidate = kind === 'session' ? window.sessionStorage : window.localStorage;
            // Safari's private mode used to expose a storage object whose
            // setItem always threw, so presence alone is not proof of use.
            const probe = '__mks_probe__';
            candidate.setItem(probe, '1');
            candidate.removeItem(probe);
            store = candidate;
        } catch (e) {
            store = null;   // blocked, disabled, or out of quota
        }
        probed[kind] = store;
        return store;
    };

    const api = (kind) => ({
        get(key, fallbackValue = null) {
            const store = backend(kind);
            if (store) {
                try {
                    const v = store.getItem(key);
                    return v === null ? fallbackValue : v;
                } catch (e) { /* fall through to memory */ }
            }
            const mem = fallback[kind];
            return mem.has(key) ? mem.get(key) : fallbackValue;
        },
        set(key, value) {
            const v = String(value);
            fallback[kind].set(key, v);
            const store = backend(kind);
            if (!store) return false;
            try {
                store.setItem(key, v);
                return true;
            } catch (e) {
                // Quota exhaustion mid-session: the in-memory copy above still
                // holds, so the preference survives until reload.
                return false;
            }
        },
        remove(key) {
            fallback[kind].delete(key);
            const store = backend(kind);
            if (!store) return;
            try { store.removeItem(key); } catch (e) { /* nothing to undo */ }
        },
        // True when a preference written now will still be there next visit.
        get persistent() { return !!backend(kind); }
    });

    return { local: api('local'), session: api('session') };
})();

// ===================================
// window.mks — the page's one global
// ===================================
// What the core shares with its modules hangs off one object, not a dozen
// window.mksThis and window.FieldThat names. Whichever script runs first
// creates it and nothing replaces it, so what count.js adds is kept.
const mks = (window.mks = window.mks || {});

// Exposed so the tests can assert the degradation, and so the field terminal
// can report honestly whether a preference will outlive the tab.
mks.storage = safeStorage;

// ===================================
// MOTION — one answer to "may this move?"
// ===================================
// Eight checks, each its own way: most read the reduced-motion preference
// once at start-up, and some forgot low-energy mode. Now anything about to
// move asks here, and both are read live, so a change mid-visit counts.
const reducedMotion = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const motionOK = () => !(reducedMotion && reducedMotion.matches) &&
    !(document.body && document.body.classList.contains('eco-mode'));
mks.motionOK = motionOK;

// Low-energy mode is restored before the intro, the slideshow and the
// counters first ask; its switch is wired further down.
{
    const saved = safeStorage.local.get('eco-mode');
    document.body.classList.toggle('eco-mode',
        saved !== null ? saved === 'on' : !!(reducedMotion && reducedMotion.matches));
}

// A smooth scroll is motion. The stylesheet turns it off for reduced
// motion, but scrollIntoView({ behavior: 'smooth' }) does not ask the
// stylesheet, so every scripted scroll asks here instead. 'instant', since
// 'auto' defers to the stylesheet, which still glides in low-energy mode.
const scrollMotion = () => (motionOK() ? 'smooth' : 'instant');
mks.scrollMotion = scrollMotion;

// ===================================
// KEYBOARD — one listener
// ===================================
// Five document listeners, blind to each other, used to answer the keys:
// one Escape closed the terminal and the menu behind it. A feature now
// registers its keys with its layer's rank; the highest is asked first,
// and true means the key is used, so one press closes one layer. A key a
// control already used is left alone, and a widget's own keys (the games'
// arrows, a dialog's Tab) stay on the widget.
const KEY_RANK = Object.freeze({ terminal: 40, lightbox: 30, player: 20, menu: 10, page: 0 });
const keyRoutes = {};
mks.keyRank = KEY_RANK;
mks.onKey = (keys, handler, rank = KEY_RANK.page) => {
    [].concat(keys).forEach((key) => {
        const route = keyRoutes[key] || (keyRoutes[key] = []);
        route.push({ handler, rank });
        route.sort((a, b) => b.rank - a.rank);   // stable: equal ranks keep their order
    });
};
document.addEventListener('keydown', (e) => {
    const route = keyRoutes[e.key];
    if (!route || e.defaultPrevented) return;
    for (let i = 0; i < route.length; i++) {
        if (route[i].handler(e) === true) return;
    }
});

// ===================================
// ON-DEMAND MODULES
// ===================================
// Roughly two thirds of this site's JavaScript serves features most visits
// never reach: the narration player, the field terminal, the interactives
// in section 05 and the footer receipt. They used to ship in this file,
// parsed and executed on every visit — including the ones that read the
// hero and left. Now each lives in modules/ and is fetched the moment it is
// first needed: a "listen" press, the backtick key, section 05 coming into
// range. What every visit pays for is what every visit uses. (The two
// project games, modules/dossier.js, moved to the case studies they
// illustrate, which load them the same way without this file.)
//
// Modules are classic scripts sharing the page's global scope. They declare
// nothing at the top level (a second `const safeStorage` would be a
// SyntaxError) and reach the core only through window.mks. Each marks
// itself in mks.loaded when it has run, which is also how the jsdom
// harness — which evaluates them directly — tells the loader they are here.
// A module's own stylesheet is listed first, so it has arrived before the
// script builds anything it styles.
const MODULES = {
    interactives: ['ai-carbon-data.js', 'modules/interactives.js'],
    terminal: ['modules/terminal.js'],
    dispatch: ['modules/dispatch.css', 'voice-scripts.js', 'modules/dispatch.js']
};

const mksLoad = (() => {
    const loaded = (mks.loaded = mks.loaded || {});
    const inflight = {};

    const inject = (src) => new Promise((resolve, reject) => {
        const css = /\.css$/.test(src);
        const s = document.createElement(css ? 'link' : 'script');
        if (css) { s.rel = 'stylesheet'; s.href = src; }
        else { s.src = src; s.async = false; }   // keep the order a module's dependencies were listed in
        s.onload = () => { loaded[src] = true; resolve(); };
        s.onerror = () => { s.remove(); reject(new Error(`could not load ${src}`)); };
        document.head.appendChild(s);
    });

    return (name) => {
        if (loaded[name]) return Promise.resolve();
        if (inflight[name]) return inflight[name];
        const files = MODULES[name];
        if (!files) return Promise.reject(new Error(`unknown module: ${name}`));
        // A module that has filled its part of the page has moved what is below.
        inflight[name] = files
            .reduce((p, src) => p.then(() => (loaded[src] ? null : inject(src))), Promise.resolve())
            .then(() => {
                loaded[name] = true;
                document.dispatchEvent(new CustomEvent('mks:layout'));
                // A fetched module is a feature someone reached; count.js counts it.
                if (window.mks && window.mks.track) window.mks.track('module-' + name);
            }, (err) => { delete inflight[name]; throw err; });
        return inflight[name];
    };
})();
mks.load = mksLoad;

// A module that will not load is a feature that stays off, not a broken page.
const mksLoadWarn = (err) => {
    if (window.console && console.warn) console.warn(err && err.message ? err.message : err);
};

// The parts of the page owned by modules/interactives.js. A deep link or an
// in-page anchor into one of these loads the module before the page scrolls
// there, so a shared /#ydi lands on a working widget rather than an empty box.
const INTERACTIVE_HOSTS = '#ecoprompt, #ydi, #assay, #receiptPanel, #receiptBtn';
const mksLoadFor = (target) => {
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest(INTERACTIVE_HOSTS)) mksLoad('interactives').catch(mksLoadWarn);
};

// ===================================
// WITHOUT JAVASCRIPT, AND LATE
// ===================================
// The stylesheet hides nothing unless <head> marked the page html.js, and
// <head> takes the mark off if this file has not set mks.ready within 4 s.
// Arriving after that is a slow network, not a failure: the reader has
// already been shown the page, so nothing is hidden again or replayed.
const lateStart = !document.documentElement.classList.contains('js');

// ===================================
// PRELOADER
// ===================================
(() => {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;

    const wipe = () => preloader.remove();

    // Reduced-motion and low-energy visitors, and anyone who has already seen
    // the intro this session, skip it entirely — no fake loading bar in front
    // of static HTML. So does a late start: the page is already on screen.
    const seen = safeStorage.session.get('mks-intro-seen');
    if (!motionOK() || seen || lateStart) { wipe(); return; }
    safeStorage.session.set('mks-intro-seen', '1');

    const coordsEl = document.getElementById('preloaderCoords');
    const journey = [
        '8.4657° N, 13.2317° W',   // Freetown
        '28.2282° N, 112.9388° E', // Changsha
        '50.7374° N, 7.0982° E',   // Bonn
        '51.9692° N, 5.6654° E',   // Wageningen
        '52.3676° N, 4.9041° E'    // Amsterdam
    ];
    let i = 0;
    const ticker = setInterval(() => {
        i = (i + 1) % journey.length;
        if (coordsEl) coordsEl.textContent = journey[i];
    }, 220);

    const hide = () => {
        clearInterval(ticker);
        preloader.style.opacity = '0';
        setTimeout(wipe, 400);
    };

    // Reveal as soon as the DOM is parsed — don't wait on every image to load.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hide);
    } else {
        hide();
    }
    // Safety net: never trap the visitor behind the preloader.
    setTimeout(hide, 2500);
})();

// ===================================
// HERO BACKGROUND SLIDESHOW + CAPTIONS
// ===================================
const heroSlideCaptions = [
    'Borehole drilling · Sierra Leone',
    'Schwebebahn fieldwork · Wuppertal, Germany',
    'Thesis presentation · Wageningen, Netherlands',
    'Public research stand · Amsterdam, Netherlands'
];

const initBackgroundSlideshow = () => {
    const slides = document.querySelectorAll('.hero-bg-slide');
    const captionText = document.getElementById('heroCaptionText');
    const hero = document.querySelector('.hero');
    if (!slides.length) return;
    let currentSlide = 0;

    // The first slide is fetched now; the rest only when the rotation is
    // about to show them. Slide two used to be fetched "on idle" for every
    // visit that was not in low-energy mode — 150 KB for a picture that only
    // appears eight seconds in, paid by every visit that never stayed that
    // long. Measured in a real browser, it was the single largest item in a
    // first view. Now a slide is fetched a moment before it is due, and only
    // while the rotation is actually running: hero on screen, tab visible,
    // nobody having asked for calm.
    const loadSlide = (index) => {
        const slide = slides[index];
        if (!slide || slide.dataset.loaded) return;
        const src = slide.getAttribute('data-bg');
        if (!src) return;
        slide.style.backgroundImage = `url('${src}')`;
        slide.dataset.loaded = '1';
    };
    loadSlide(0);

    // .onscreen is kept by the LOOPS observer below.
    const rotating = () => !!hero && hero.classList.contains('onscreen') && motionOK();

    const showSlide = (index) => {
        loadSlide(index);
        slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
        if (captionText && heroSlideCaptions[index]) {
            captionText.textContent = heroSlideCaptions[index];
        }
    };

    const PERIOD = 8000;
    const LEAD = 1500;   // enough for the next slide to land and decode
    let timer = null;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (rotating()) loadSlide((currentSlide + 1) % slides.length);
            timer = setTimeout(() => {
                if (rotating()) {
                    currentSlide = (currentSlide + 1) % slides.length;
                    showSlide(currentSlide);
                }
                schedule();
            }, LEAD);
        }, PERIOD - LEAD);
    };
    schedule();
};

if (document.readyState === 'complete') {
    initBackgroundSlideshow();
} else {
    window.addEventListener('load', initBackgroundSlideshow);
}

// ===================================
// HERO SUBTITLE
// ===================================
// The role label is intentionally static. A stable, always-legible identity
// protects the critical first impression — the old typewriter could be caught
// mid-deletion on first paint — and keeps first-viewport motion reserved for
// the signature scroll-driven moments (journey map, core log, borehole).

// ===================================
// SMOOTH SCROLLING & NAVIGATION
// ===================================
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

// Open the receipt panel when a deep-link target is in it, so a shared
// /#receiptPanel reveals the receipt instead of landing on a closed panel.
const revealTarget = (target) => {
    if (!target || !target.closest) return false;
    let expanded = false;
    const panel = target.id === 'receiptPanel' ? target : target.closest('#receiptPanel');
    if (panel && panel.hasAttribute('hidden')) {
        const rb = document.getElementById('receiptBtn');
        if (rb) { rb.click(); expanded = true; }
    }
    return expanded;
};

// Focus is what makes a jump real to a keyboard or a screen reader: without
// it the next Tab starts from the link that was pressed, so the skip link
// skipped nothing. A section gets tabindex="-1" (focusable, never a Tab
// stop) only when it needs one. preventScroll: the scroll is the caller's.
const focusTarget = (target) => {
    if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
};

// Section 05's widgets grow when their module arrives, and a jump into or
// past it is what fetches it: a first jump to Skills stopped 318px short.
// A section drawn for the first time swaps its estimated height for its
// real one: a jump to #experience landed 927px out. So for a few seconds
// `land` runs again whenever the page changes height, until the reader
// scrolls, taps or types (any key, heard on window, not through the key
// router): then where it sits is theirs. The height is taken now: the
// observer's first report comes a frame late, and growth in that frame was
// once taken for the start (250-440px short).
let releaseHold = () => {};
const hold = (land) => {
    releaseHold();
    if (!('ResizeObserver' in window)) return;
    const height = () => document.body.getBoundingClientRect().height;
    let last = height();
    const ro = new ResizeObserver(() => {
        const now = height();
        if (now !== last) { last = now; land(); }
    });
    const HANDS = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const release = () => {
        ro.disconnect();
        clearTimeout(timer);
        HANDS.forEach(t => window.removeEventListener(t, release, true));
        if (releaseHold === release) releaseHold = () => {};
    };
    const timer = setTimeout(release, 4000);
    HANDS.forEach(t => window.addEventListener(t, release, { capture: true, passive: true }));
    ro.observe(document.body);
    releaseHold = release;
};

// Fetch what the target needs, open the receipt around it (and
// give that a moment to push things into place), then scroll and focus. A
// target waiting to fade in is shown at once: it sits 26px low until then.
const jumpTo = (target, behavior, focus, wait) => {
    mksLoadFor(target);
    const fade = target.closest('.reveal:not(.visible)');
    if (fade) {
        fade.style.transition = 'none';
        fade.classList.add('visible');
        void fade.offsetWidth;   // commit it before the transition returns
        fade.style.transition = '';
    }
    const land = () => {
        const put = () => target.scrollIntoView({ behavior, block: 'start' });
        put();
        if (focus) focusTarget(target);
        hold(put);
    };
    if (revealTarget(target)) setTimeout(land, 240);
    else if (wait) setTimeout(land, 0); else land();
};

// The address each jump was handled for: Back and Forward fire popstate
// and, when the fragment changes, hashchange too. The second is dropped.
let jumpedTo = null;

// In-page links used to scroll and stop there: the address never changed,
// so Back left the site, and focus stayed on the link. Now they navigate.
const inPageLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
inPageLinks.forEach((anchor, index) => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        // Bare "#" hrefs (e.g. project expand toggles) are not real targets;
        // querySelector('#') would throw SyntaxError, so bail out.
        if (!href || href === '#') return;
        // A modified click asks for a new tab or window: the browser's job.
        if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        // The same link twice is one entry; the entry left notes the link,
        // for Back to focus. Safari throws past 100 history calls in 30 s,
        // which should cost the entry, not the jump.
        if (location.hash !== href) {
            try {
                history.replaceState(Object.assign({}, history.state, { mksFrom: index }), '');
                history.pushState(null, '', href);
            } catch (err) { /* jump anyway */ }
        }
        jumpedTo = location.href;
        jumpTo(target, scrollMotion(), true, false);
        setMenuOpen(false);
    });
});

// Direct hits (a shared link, Back and Forward, a typed fragment) land the
// same way, a task later so the browser's own scroll restoring comes first.
// A shared link on arrival is not focused: nobody has pressed anything yet.
const handleHashReveal = (e) => {
    if (location.href === jumpedTo) return;
    jumpedTo = location.href;
    if (!location.hash || location.hash === '#') {
        // Back before any jump: focus returns to the link that jumped (in
        // the closed menu, to the top of the page, as natively), not left
        // on the last target, thousands of pixels away.
        if (!e) return;
        releaseHold();
        const from = e.state && inPageLinks[e.state.mksFrom];
        if (from) from.focus({ preventScroll: true });
        if (!from || document.activeElement !== from) {
            document.body.tabIndex = -1;
            document.body.focus({ preventScroll: true });
            document.body.removeAttribute('tabindex');
        }
        return;
    }
    let target;
    try { target = document.querySelector(location.hash); } catch (err) { return; }
    if (target) jumpTo(target, scrollMotion(), !!e, true);
};
window.addEventListener('popstate', handleHashReveal);
window.addEventListener('hashchange', handleHashReveal);
if (location.hash) window.addEventListener('load', () => setTimeout(() => handleHashReveal(null), 320));

const setMenuOpen = (open) => {
    if (!navToggle || !navMenu) return;
    navMenu.classList.toggle('active', open);
    navToggle.classList.toggle('active', open);
    navToggle.setAttribute('aria-expanded', String(open));
};

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        setMenuOpen(!navMenu.classList.contains('active'));
    });

    document.addEventListener('click', (e) => {
        if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
            setMenuOpen(false);
        }
    });

    // The lowest layer Escape closes: a dialog or the player goes first.
    mks.onKey('Escape', () => {
        if (!navMenu.classList.contains('active')) return false;
        setMenuOpen(false);
        navToggle.focus();
        return true;
    }, KEY_RANK.menu);
}

// ===================================
// SCROLL — one passive listener, one frame
// ===================================
// The navbar shadow, the progress bar, the active nav link and the
// scroll-to-top button each used to add a scroll listener of their own, and
// the active-link one read every section's offsetTop on every event — a
// forced layout per section per scroll, on the main thread, on every phone.
// One listener now coalesces the four into a single animation frame, reads
// before it writes, and the section offsets are measured once and re-measured
// only when the layout can have moved them.
const navbar = document.getElementById('navbar');
const scrollProgress = document.getElementById('scrollProgress');
const scrollTopBtn = document.getElementById('scrollTop');
const sections = Array.from(document.querySelectorAll('section[id], header[id]'));
const navLinks = Array.from(document.querySelectorAll('.nav-link'));
// The section each nav link lights for: the one it jumps to or, for a link
// to another page, its data-spy (Work: this page's projects).
const navSpies = navLinks.map((link) => {
    const href = link.getAttribute('href');
    return [link, link.dataset.spy || (href[0] === '#' ? href.slice(1) : '')];
});

(() => {
    let sectionTops = [];
    const underfoot = new Set();   // keep-clear elements in the button's band
    const measure = () => {
        sectionTops = sections.map(s => ({ id: s.id, top: s.offsetTop - 220 }));
    };

    const update = () => {
        const y = window.pageYOffset || document.documentElement.scrollTop || 0;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        let current = '';
        for (let i = 0; i < sectionTops.length; i++) {
            if (y >= sectionTops[i].top) current = sectionTops[i].id;
        }
        if (navbar) navbar.classList.toggle('scrolled', y > 100);
        if (scrollTopBtn) scrollTopBtn.classList.toggle('visible', y > window.innerHeight && !underfoot.size);
        if (scrollProgress) scrollProgress.style.width = (docHeight > 0 ? (y / docHeight) * 100 : 0) + '%';
        navSpies.forEach(([link, id]) => {
            link.classList.toggle('active', !!id && id === current);
        });
    };
    let queued = false;   // a frame is on its way
    let stale = true;     // …and should measure the sections first
    const frame = () => {
        queued = false;
        if (stale) { stale = false; measure(); watch(); }
        update();
    };
    const onScroll = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(frame);
    };
    // Measuring forces a layout, and used to run the moment anything asked,
    // mid-parse included. Asking now marks the offsets stale, and the next
    // frame measures once, however many asked.
    const relayout = () => { stale = true; onScroll(); };

    // Back to top floats bottom right. It waits for a full screen of scroll
    // (the hero's buttons are above it by then) and steps aside while any
    // control is in its corner or about to be: the observer's root is cut to
    // 140px up, 100px in and 10% below, and does that geometry off the scroll
    // path. Watching four whole regions, it sat on the dossier titles, and
    // the footer hid it on the last screen. A module's new controls are
    // picked up when the layout moves.
    const CONTROLS = 'a[href], button, select, input, textarea, .hero-availability, .carbon-badge';
    let band = null;
    const watch = () => {
        if (!scrollTopBtn || !('IntersectionObserver' in window)) return;
        const size = innerWidth + 'x' + innerHeight;
        if (!band || band.size !== size) {
            if (band) band.io.disconnect();
            underfoot.clear();
            band = { size, io: new IntersectionObserver((entries) => {
                entries.forEach(en => {
                    if (en.isIntersecting) underfoot.add(en.target); else underfoot.delete(en.target);
                });
                onScroll();
            }, { rootMargin: `${140 - innerHeight}px 0px 10% ${100 - innerWidth}px` }) };
        }
        document.querySelectorAll(CONTROLS).forEach((el) => {
            if (el !== scrollTopBtn && !(navbar && navbar.contains(el))) band.io.observe(el);
        });
    };

    // A section skipped past undrawn (a jump, a dragged scroll bar) keeps its
    // estimate, and drawn as the reader came back up it moved the page up to
    // 2,370px: scroll anchoring missed it. So once the page rests, what is
    // above the screen is drawn for good, and what is on screen held still.
    let resting = 0;
    const drawAbove = () => {
        const above = sections.filter(s => s.matches('main > section:not(.drawn)') && s.getBoundingClientRect().bottom <= 0);
        const seen = sections.find(s => s.getBoundingClientRect().bottom > 0) || document.querySelector('body > footer');
        if (!above.length || !seen) return;
        const was = seen.getBoundingClientRect().top;
        above.forEach(s => s.classList.add('drawn'));
        const moved = seen.getBoundingClientRect().top - was;
        if (Math.abs(moved) >= 1) window.scrollBy({ top: moved, behavior: 'instant' });
    };

    window.addEventListener('scroll', () => {
        onScroll();
        clearTimeout(resting);
        resting = setTimeout(drawAbove, 150);
    }, { passive: true });
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(relayout, 150);
    }, { passive: true });
    window.addEventListener('load', relayout);
    // A module that has filled in its part of the page, or the Assay's
    // result, announces it: new controls for back to top to keep clear of.
    document.addEventListener('mks:layout', relayout);
    // A section that changes height moves every offset below it: a module
    // filling it in, or one drawn for the first time (content-visibility sizes it
    // by estimate until then). Each asks for a measurement.
    if ('ResizeObserver' in window) {
        const sized = new ResizeObserver(() => relayout());
        sections.forEach(s => sized.observe(s));
    }
    relayout();
})();

// ===================================
// ANIMATED COUNTERS (hero stats)
// ===================================
// The real figures are in the HTML, so a reader without JavaScript sees 164,
// not 0 — and they are exact counts, so nothing is appended. Counting up is
// motion: not under reduced motion, low-energy mode or a late start.
const counters = Array.from(document.querySelectorAll('.hero-stat-number'));
const countersMove = () => !lateStart && scrollMotion() === 'smooth';

// A counter mid-count told a screen reader, Find or Reader mode "0 Master's
// degrees" while the stats sat below the fold. While the digits move they
// are hidden from those, and a still copy is read instead.
const still = (counter, on) => {
    if (on) {
        counter.setAttribute('aria-hidden', 'true');
        counter.insertAdjacentHTML('afterend', `<span class="sr-only">${counter.dataset.target}</span>`);
    } else if (counter.hasAttribute('aria-hidden')) {
        counter.removeAttribute('aria-hidden');
        counter.nextElementSibling.remove();
    }
};

const animateCounters = () => {
    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'), 10);
        if (isNaN(target)) return;
        if (!countersMove()) {
            // Only differs if low-energy mode came on after it was zeroed.
            if (counter.textContent !== String(target)) { counter.textContent = String(target); still(counter, false); }
            return;
        }
        const duration = 1800;
        const increment = target / (duration / 16);
        let current = 0;

        const updateCounter = () => {
            current += increment;
            if (current < target) {
                counter.textContent = Math.ceil(current);
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = String(target);
                still(counter, false);
            }
        };

        updateCounter();
    });
};

const observerOptions = { threshold: 0.4, rootMargin: '0px' };

const statsSection = document.querySelector('.hero-stats');
if (statsSection && 'IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounters();
                counterObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);
    counterObserver.observe(statsSection);

    // Zeroed before the first paint, only if they will count up from it.
    // Low-energy mode, which decides that too, is restored at the top.
    if (countersMove()) counters.forEach(counter => { still(counter, true); counter.textContent = '0'; });
}

// ===================================
// JOURNEY MAP — the route, flown live
// ===================================
(() => {
    const frame = document.getElementById('journeyMapFrame');
    const mapBox = document.getElementById('journeyMap');
    const readout = document.getElementById('journeyMapReadout');
    if (!frame || !mapBox || typeof fetch !== 'function') return;

    // Projected coordinates of each stop inside the SVG's 1000x726 viewBox
    // (see scripts/generate-journey-map.js). Order matches the journey cards.
    const STOPS = [
        { x: 120.1, y: 399.4, zoom: 2.4, readout: '8.4657° N, 13.2317° W — Freetown' },
        { x: 901.6, y: 254.1, zoom: 2.4, readout: '28.2282° N, 112.9388° E — Changsha' },
        { x: 279.7, y: 90.1,  zoom: 5.0, readout: '50.7374° N, 7.0982° E — Bonn' },
        { x: 273.5, y: 81.4,  zoom: 7.5, readout: '51.9692° N, 5.6654° E — Wageningen' },
        { x: 269.9, y: 78.6,  zoom: 7.5, readout: '52.3676° N, 4.9041° E — Amsterdam' }
    ];
    const VB_W = 1000, VB_H = 726;
    let svg = null;
    let activeIndex = -1;

    const flyTo = (index) => {
        if (!svg) return;
        const stop = STOPS[index];
        const w = frame.clientWidth;
        const h = w * (VB_H / VB_W);
        const s = stop.zoom;
        const px = stop.x * (w / VB_W);
        const py = stop.y * (h / VB_H);
        // centre the stop, but never drag the map edge inside the frame
        const tx = Math.min(0, Math.max(w - s * w, w / 2 - s * px));
        const ty = Math.min(0, Math.max(h - s * h, h / 2 - s * py));
        svg.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s})`;

        // Markers, labels and strokes live in map units — counter-scale them
        // so zooming doesn't turn them into blobs. Strokes/fonts shrink as
        // 1/sqrt(s) (a hint of growth); dots shrink harder (s^-0.7) so the
        // Rhine-delta cluster stays separable at high zoom; label offsets
        // shrink as 1/s so labels keep a constant on-screen distance.
        const comp = 1 / Math.sqrt(s);
        const dotComp = Math.pow(s, -0.7);
        const offComp = 2 / s;
        svg.style.setProperty('--zoom-comp', comp.toFixed(3));
        svg.querySelectorAll('.map-stop-dot, .map-you-dot').forEach(el => el.setAttribute('r', (3.2 * dotComp).toFixed(2)));
        svg.querySelectorAll('.map-stop-halo').forEach(el => el.setAttribute('r', (10 * dotComp).toFixed(2)));
        svg.querySelectorAll('.map-stop-ring').forEach(el => el.setAttribute('r', (6.5 * dotComp).toFixed(2)));
        svg.querySelectorAll('.map-site-mark').forEach(el => {
            el.setAttribute('transform', `translate(${el.dataset.x} ${el.dataset.y}) scale(${(dotComp * 1.4).toFixed(3)})`);
        });
        svg.querySelectorAll('.map-stop-label, .map-site-label, .map-you-label').forEach(el => {
            const base = el.classList.contains('map-site-label') ? 9.5 :
                el.classList.contains('map-you-label') ? 9 : 11;
            el.style.fontSize = (base * comp).toFixed(2) + 'px';
            if (el.dataset.cx) {
                el.setAttribute('x', (+el.dataset.cx + el.dataset.dx * offComp).toFixed(1));
                el.setAttribute('y', (+el.dataset.cy + el.dataset.dy * offComp).toFixed(1));
            }
        });
    };

    const setActive = (index) => {
        if (index === activeIndex || !svg) return;
        activeIndex = index;
        STOPS.forEach((_, i) => {
            const stopEl = svg.querySelector('#mapStop' + i);
            if (stopEl) {
                stopEl.classList.toggle('active', i === index);
                stopEl.classList.toggle('visited', i < index);
            }
            if (i < STOPS.length - 1) {
                const arc = svg.querySelector('#mapArc' + i);
                if (arc) arc.classList.toggle('drawn', i < index);
            }
        });
        // fieldwork sites appear once the journey reaches their era
        svg.querySelectorAll('.map-site').forEach(site => {
            site.classList.toggle('active', index >= +site.dataset.activate);
        });
        document.querySelectorAll('.journey-stop').forEach((card, i) => {
            card.classList.toggle('map-active', i === index);
        });
        if (readout) readout.textContent = STOPS[index].readout;
        flyTo(index);
    };

    const load = () => fetch('assets/journey-map.svg')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(markup => {
            frame.innerHTML = markup;
            svg = frame.querySelector('svg');
            // let enhancements (e.g. the visitor mark) attach before the
            // first fly-to so their markers get counter-scaled with the rest,
            // or, if they land later, call rescale
            const rescale = () => { if (activeIndex >= 0) flyTo(activeIndex); };
            document.dispatchEvent(new CustomEvent('journeymap:ready', { detail: { svg, mapBox, rescale } }));
            setActive(0);

            const stops = document.querySelectorAll('.journey-stop');
            if ('IntersectionObserver' in window && stops.length) {
                const mapObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const i = parseInt(entry.target.getAttribute('data-stop'), 10);
                            if (!isNaN(i)) setActive(i);
                        }
                    });
                }, { threshold: 0.6 });
                stops.forEach(stop => mapObserver.observe(stop));
            }

            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => { if (activeIndex >= 0) flyTo(activeIndex); }, 200);
            });
        })
        .catch(() => { mapBox.style.display = 'none'; });

    // The map is 13 KB that sits a full screen below the fold. It is fetched
    // on the first sign the visitor is going there — a scroll, a key, a touch,
    // a deep link, or a page that opened already scrolled down — and never by
    // a visit that reads the hero and leaves.
    let requested = false;
    const request = () => {
        if (requested) return;
        requested = true;
        ['scroll', 'keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(type => {
            window.removeEventListener(type, request);
        });
        load();
    };
    if ((location.hash && location.hash !== '#') || window.pageYOffset > 0) {
        request();
    } else {
        ['scroll', 'keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(type => {
            window.addEventListener(type, request, { passive: true });
        });
    }
})();

// ===================================
// LOOPS — only where they can be seen
// ===================================
// The dots, the map's halo and the hero's zoom loop for ever, and ran every
// frame out of sight. style.css holds a top-level block still until this
// marks it .onscreen: in view, in a visible tab.
(() => {
    const blocks = document.querySelectorAll('body > header, main > section, body > footer');
    const inView = new Set();
    const mark = () => blocks.forEach(b => b.classList.toggle('onscreen', !document.hidden && inView.has(b)));
    document.addEventListener('visibilitychange', mark);
    if (!('IntersectionObserver' in window)) { blocks.forEach(b => inView.add(b)); mark(); return; }
    const watch = new IntersectionObserver((entries) => {
        entries.forEach(en => (en.isIntersecting ? inView.add(en.target) : inView.delete(en.target)));
        mark();
    }, { rootMargin: '100px 0px' });
    blocks.forEach(b => watch.observe(b));
})();

// ===================================
// REVEAL ON SCROLL
// ===================================
(() => {
    const elements = document.querySelectorAll('.reveal');
    if (!elements.length) return;

    if (!('IntersectionObserver' in window)) {
        elements.forEach(el => el.classList.add('visible'));
        return;
    }

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('visible'), index * 80);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    elements.forEach(el => revealObserver.observe(el));
})();

// ===================================
// GALLERY LIGHTBOX
// ===================================
(() => {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxCaption = document.getElementById('lightboxCaption');
    const lightboxClose = document.getElementById('lightboxClose');
    if (!lightbox || !lightboxImage) return;

    let lastFocus = null;

    const open = (src, alt, caption) => {
        lastFocus = document.activeElement;
        lightboxImage.src = src;
        lightboxImage.alt = alt || '';
        if (lightboxCaption) lightboxCaption.textContent = caption || '';

        // The dialog is named by its caption. Not every gallery item has one,
        // and a dialog with no accessible name is announced as just "dialog",
        // so the image's alt text stands in when the caption is empty.
        if (caption) {
            lightbox.setAttribute('aria-labelledby', 'lightboxCaption');
            lightbox.removeAttribute('aria-label');
        } else {
            lightbox.removeAttribute('aria-labelledby');
            lightbox.setAttribute('aria-label', alt || 'Enlarged image');
        }

        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (lightboxClose) lightboxClose.focus();
    };

    const close = () => {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        // Restore rather than assert: 'auto' overrides whatever the stylesheet
        // had to say about body overflow.
        document.body.style.overflow = '';
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        lastFocus = null;
    };

    // The photo sits in a real button. A <figure> cannot take role=button —
    // the role hides the figure and its caption from assistive technology —
    // and a button brings Enter, Space and focus with it. A click anywhere on
    // the figure, caption included, still opens it.
    document.querySelectorAll('.gallery-item').forEach(item => {
        const img = item.querySelector('img');
        if (!img) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gallery-open';
        btn.setAttribute('aria-label', 'View larger: ' + (img.alt || 'photo'));
        img.replaceWith(btn);
        btn.appendChild(img);
        item.addEventListener('click', () => open(img.src, img.alt, item.getAttribute('data-caption')));
    });

    if (lightboxClose) lightboxClose.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) close();
    });
    // The close button is the dialog's only focusable control — keep Tab on it
    lightbox.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && lightboxClose) {
            e.preventDefault();
            lightboxClose.focus();
        }
    });
    mks.onKey('Escape', () => {
        if (!lightbox.classList.contains('active')) return false;
        close();
        return true;
    }, KEY_RANK.lightbox);
})();

// ===================================
// SCROLL TO TOP BUTTON
// ===================================
// Its visibility is handled by the shared scroll handler above. It hides as
// the page rises, so focus moves to the top rather than vanish with it.
if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: scrollMotion() });
        const home = document.getElementById('home');
        if (home) focusTarget(home);
    });
}

// ===================================
// CONTACT FORM HANDLING
// ===================================
const contactForm = document.getElementById('contactForm');

// Google Apps Script Web App URL
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgyqRUmu0d2UFjb0WxbYyoDbO8F9jVnlvIQnNAfMU0v8JFpH5KAefy4z9BNoQqd68/exec';

if (contactForm) {
    const formStatus = document.getElementById('formStatus');

    const showStatus = (kind, text) => {
        if (!formStatus) { alert(text); return; }
        formStatus.hidden = false;
        formStatus.textContent = text;
        formStatus.classList.remove('success', 'error');
        formStatus.classList.add(kind);
    };

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const honeypot = document.getElementById('website');
        // Cloudflare Turnstile is optional and off by default — no third-party
        // script is loaded unless the owner adds the widget to the form. When
        // it is present it drops a hidden input with this name, and the Apps
        // Script endpoint verifies the token server-side.
        const challenge = contactForm.querySelector('[name="cf-turnstile-response"]');
        const field = (id) => {
            const el = document.getElementById(id);
            return el && typeof el.value === 'string' ? el.value.trim() : '';
        };
        const formData = {
            name: field('name'),
            email: field('email'),
            subject: field('subject'),
            message: field('message'),
            website: honeypot ? honeypot.value : '',
            turnstileToken: challenge ? challenge.value : '',
            submitted_at: new Date().toISOString(),
            source: 'Portfolio Website'
        };
        // Kept out of the public tally (stats.html), as DNT and GPC ask.
        if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) formData.count = false;

        const submitBtn = contactForm.querySelector('.btn-submit');
        const originalBtnContent = submitBtn ? submitBtn.innerHTML : '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Sending...</span><svg class="icon icon-spin" aria-hidden="true"><use href="#i-spinner"></use></svg>';
        }
        if (formStatus) formStatus.hidden = true;

        // When the endpoint turns a message down it says why, in words meant
        // for the visitor ("a valid email address", "wait a moment"). That
        // beats a generic error, which is kept for when it could not be asked.
        let reason = '';
        try {
            // A plain-string body keeps this a "simple" request — no CORS
            // preflight, which Apps Script cannot answer — while the followed
            // redirect still lets us read the JSON status the script returns.
            const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const result = await response.json();
            if (result.status !== 'success') {
                reason = typeof result.message === 'string' ? result.message.trim() : '';
                throw new Error(reason || 'Submission rejected');
            }

            showStatus('success', 'Thank you for your message! It has been sent — I will get back to you soon.');
            contactForm.reset();
        } catch (error) {
            console.error('Error submitting form:', error);
            showStatus('error', reason
                ? `Your message was not sent. ${reason}`
                : 'Something went wrong and your message was not sent. Please try again in a moment, or email me directly at moseskollehsesay@gmail.com.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
            }
        }
    });
}

// ===================================
// THEME TOGGLE
// ===================================
// A button in the nav bar (it used to float over the hero on a phone). It
// ships hidden, since without script it cannot switch anything. Its name
// says what pressing it does, which also tells the current theme.
const initThemeToggle = () => {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    const sync = () => {
        const isLightMode = document.body.classList.contains('light-mode');
        const use = toggle.querySelector('use');
        if (use) use.setAttribute('href', `#i-${isLightMode ? 'sun' : 'moon'}`);
        toggle.setAttribute('aria-label', isLightMode ? 'Switch to dark theme' : 'Switch to light theme');
    };
    sync();
    toggle.hidden = false;

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLightMode = document.body.classList.contains('light-mode');
        safeStorage.local.set('theme', isLightMode ? 'light' : 'dark');
        sync();
        syncThemeColor();
    });
};

// The browser chrome (address bar on phones, title bar as an installed app)
// takes its colour from <meta name="theme-color">, which was hardcoded to
// the dark background — so light mode sat under a black bar.
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const syncThemeColor = () => {
    if (!themeColorMeta) return;
    const light = document.body.classList.contains('light-mode');
    themeColorMeta.setAttribute('content', light ? THEME_COLOR_LIGHT : THEME_COLOR_DARK);
};
const THEME_COLOR_DARK = '#0a0a0a';
const THEME_COLOR_LIGHT = '#f4f6f0';

// Restore saved preference, then mount the toggle
const currentTheme = safeStorage.local.get('theme', 'dark');
if (currentTheme === 'light') {
    document.body.classList.add('light-mode');
}
initThemeToggle();
syncThemeColor();

// ===================================
// KEYBOARD NAVIGATION
// ===================================
// Single-letter shortcuts are only safe while nothing is being operated by
// keyboard. `input, textarea` was not enough: a <select> takes letter keys to
// jump between options, so pressing "c" on the carbon calculator's model
// picker scrolled the page to Contact instead of selecting Claude. The same
// goes for buttons, contenteditable regions, anything with a text-entry ARIA
// role, and any keystroke carrying a modifier — Ctrl+C is a copy, not a
// navigation request.
const TYPING_SELECTOR = [
    'input',
    'textarea',
    'select',
    'button',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="menu"]',
    '[role="menuitem"]'
].join(', ');

const isTypingContext = (target) => {
    // keydown can fire with document or window as the target, neither of
    // which has closest(), and a detached node has no matches().
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest(TYPING_SELECTOR);
};

mks.onKey(['h', 'H', 'c', 'C'], (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.isComposing || e.keyCode === 229) return false;   // mid IME composition
    if (isTypingContext(e.target)) return false;

    const target = document.querySelector(/h/i.test(e.key) ? '#home' : '#contact');
    if (target) jumpTo(target, scrollMotion(), false, false);
    return true;
});

// ===================================
// DYNAMIC YEAR IN FOOTER
// ===================================
document.querySelectorAll('.current-year').forEach(el => {
    el.textContent = new Date().getFullYear();
});

// ===================================
// FIELD TERMINAL — the trigger
// ===================================
// The terminal itself is modules/terminal.js, fetched on the first press of
// the footer button or the backtick. The backtick stays routed here once it
// is loaded, so one rule decides it; the module adds Escape and its prompt.
(() => {
    const toggleBtn = document.getElementById('terminalToggle');
    const openTerminal = () => mksLoad('terminal')
        .then(() => { if (mks.terminal) mks.terminal.open(); })
        .catch(mksLoadWarn);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (!mks.terminal) openTerminal();
        });
    }
    // The backtick is not a letter shortcut: a focused button or <select>
    // does nothing with it, so only text entry holds it back.
    const TEXT_ENTRY = 'textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], ' +
        'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])';
    mks.onKey('`', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.target && typeof e.target.closest === 'function' && e.target.closest(TEXT_ENTRY)) return false;
        e.preventDefault();
        const term = mks.terminal;
        if (!term) openTerminal();
        else if (term.isOpen()) term.close();
        else term.open();
        return true;
    });
})();

// ===================================
// INTERACTIVES — the trigger
// ===================================
// You Draw It in "AI, Weighed", The Assay and The Receipt
// (modules/interactives.js, with ai-carbon-data.js behind them) load when
// any of their homes comes within about a screen of the viewport, so they
// are drawn by the time the visitor arrives — and on the first press of one
// of their buttons if they somehow arrive first.
(() => {
    const hosts = Array.from(document.querySelectorAll(INTERACTIVE_HOSTS));
    if (!hosts.length) return;
    const load = () => mksLoad('interactives').catch(mksLoadWarn);

    if ('IntersectionObserver' in window) {
        // Stop watching only once the module is in. Disconnecting first meant
        // one failed fetch left the section blank for the rest of the visit;
        // now coming back into range tries again.
        const io = new IntersectionObserver((entries) => {
            if (entries.some(en => en.isIntersecting)) {
                mksLoad('interactives').then(() => io.disconnect(), mksLoadWarn);
            }
        }, { rootMargin: '1200px 0px' });
        hosts.forEach(h => io.observe(h));
    } else {
        load();
    }

    // Presses waiting for the module. A second press on the same button
    // while it is on its way is the same request: replaying both opened the
    // receipt and closed it again.
    const waiting = new Set();
    document.addEventListener('click', (e) => {
        if (mks.loaded.interactives) return;
        const btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!btn || !btn.closest(INTERACTIVE_HOSTS)) return;
        e.preventDefault();
        if (waiting.has(btn)) return;
        waiting.add(btn);
        // Replay the press once the module's own handler is listening.
        mksLoad('interactives')
            .then(() => btn.click(), mksLoadWarn)
            .then(() => waiting.delete(btn));
    });
})();

// ===================================
// EXPERIENCE — short cards on a phone
// ===================================
// Below 600px style.css shows each role as its title, organisation, dates
// and first line, and keeps the rest of the card until it is asked for:
// the whole log was 5.3 screens on a 390px phone. The button that asks is
// made here, because nothing could press it without this script; above
// 600px it is not shown and every card is whole.
(() => {
    document.querySelectorAll('.corelog-item .timeline-content').forEach((card, i) => {
        const list = card.querySelector('ul');
        if (!list || (list.children.length < 2 && !card.querySelector('.tags'))) return;
        if (!list.id) list.id = `corelog-more-${i + 1}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'corelog-more';
        btn.setAttribute('aria-controls', list.id);
        // Five buttons that all say "More" are one name five times in a
        // screen reader's list of controls; each is told apart by its role.
        const word = document.createTextNode('');
        const role = document.createElement('span');
        role.className = 'sr-only';
        role.textContent = ` about ${(card.querySelector('h3') || {}).textContent || 'this role'}`;
        btn.append(word, role);
        const show = (open) => {
            card.classList.toggle('is-open', open);
            btn.setAttribute('aria-expanded', String(open));
            word.textContent = open ? 'Less' : 'More';
        };
        show(false);
        btn.addEventListener('click', () => {
            show(!card.classList.contains('is-open'));
            document.dispatchEvent(new CustomEvent('mks:layout'));
        });
        card.appendChild(btn);
    });
})();

// ===================================
// EASTER EGG: CONSOLE MESSAGE
// ===================================
console.log('%c👋 Welcome to my portfolio!', 'color: #7CFC00; font-size: 24px; font-weight: bold;');
console.log('%cFrom bedrock to cloud — built with passion for sustainability.', 'color: #7CFC00; font-size: 14px;');
console.log('%cInterested in collaboration? Let\'s connect!', 'color: #ffffff; font-size: 14px;');
console.log('%cEmail: moseskollehsesay@gmail.com', 'color: #7CFC00; font-size: 14px;');

// ===================================
// CARBON BADGE — this page, weighed live
// ===================================
(() => {
    const badgeText = document.getElementById('carbonBadgeText');
    const infoBtn = document.getElementById('carbonInfoBtn');
    const method = document.getElementById('carbonMethod');

    const MEDIAN_PAGE_MB = 2.5;      // HTTP Archive median page weight
    const G_CO2_PER_MB = 0.36;       // Sustainable Web Design model, global grid
    const pageOrigin = location.origin;

    // Weight of one resource. transferSize is the real wire cost, but it reads 0
    // for anything served from cache — so a naive sum collapses on a repeat
    // visit and the page looks falsely lighter. Fall back to encodedBodySize
    // (the compressed asset size), the honest weight whether or not this visit
    // re-downloaded it. Cross-origin assets with no Timing-Allow-Origin header
    // report 0 for both and are genuinely unmeasurable — we flag those instead
    // of pretending they weigh nothing.
    const bytesOf = (r) => {
        if (r.transferSize && r.transferSize > 0) return r.transferSize;
        if (r.encodedBodySize && r.encodedBodySize > 0) return r.encodedBodySize;
        return 0;
    };

    // The receipt (modules/interactives.js) itemises the same entries with
    // the same rule and the same constants. One definition, shared, so the
    // badge and the receipt can never disagree about what a byte weighs.
    mks.carbon = { bytesOf, gramsPerMB: G_CO2_PER_MB, medianPageMB: MEDIAN_PAGE_MB };

    if (!badgeText) return;

    const weigh = () => {
        let bytes = 0;
        let unmeasured = 0;
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) bytes += bytesOf(nav);
            performance.getEntriesByType('resource').forEach(r => {
                const b = bytesOf(r);
                bytes += b;
                if (b === 0 && r.name && r.name.indexOf(pageOrigin) !== 0) unmeasured++;
            });
        } catch (e) { /* older browsers: leave the badge quiet */ }
        if (!bytes) {
            badgeText.textContent = 'Built to stay light — under ~1 MB per visit';
            return;
        }
        const mb = bytes / (1024 * 1024);
        const g = mb * G_CO2_PER_MB;
        let comparison = '';
        if (mb < MEDIAN_PAGE_MB) {
            comparison = ` — ${Math.round((1 - mb / MEDIAN_PAGE_MB) * 100)}% lighter than the median web page`;
        }
        // A leading "≈" and, when third-party files are uncounted, a "+" keep the
        // claim honest: the true figure is this or a little more, never less.
        const plus = unmeasured ? '+ ' : '';
        badgeText.textContent =
            `This page weighs ${plus}${mb.toFixed(2)} MB ≈ ${plus}${g.toFixed(2)} g CO₂e${comparison}`;
    };

    weigh();
    // Images lazy-load on scroll, so recompute as new resources arrive.
    if ('PerformanceObserver' in window) {
        try {
            new PerformanceObserver(() => weigh()).observe({ type: 'resource', buffered: true });
        } catch (e) { /* type unsupported: the initial weigh() still stands */ }
    }
    // Final pass once the footer badge is actually in view — by then everything
    // above it has loaded.
    if ('IntersectionObserver' in window) {
        const badge = document.getElementById('carbonBadge');
        if (badge) {
            new IntersectionObserver((entries) => {
                if (entries.some(en => en.isIntersecting)) weigh();
            }, { rootMargin: '0px 0px 200px 0px' }).observe(badge);
        }
    }

    if (infoBtn && method) {
        infoBtn.addEventListener('click', () => {
            const open = method.hasAttribute('hidden');
            method.toggleAttribute('hidden', !open);
            infoBtn.setAttribute('aria-expanded', String(open));
        });
    }
})();

// ===================================
// LOW-ENERGY MODE
// ===================================
(() => {
    const toggle = document.getElementById('ecoModeToggle');
    const label = document.getElementById('ecoModeLabel');
    if (!toggle || !label) return;

    const apply = (on) => {
        document.body.classList.toggle('eco-mode', on);
        label.textContent = 'Low-energy mode: ' + (on ? 'on' : 'off');
        toggle.setAttribute('aria-pressed', String(on));
    };

    // Restored at the top of the file (MOTION); this names it.
    apply(document.body.classList.contains('eco-mode'));

    toggle.addEventListener('click', () => {
        const on = !document.body.classList.contains('eco-mode');
        apply(on);
        safeStorage.local.set('eco-mode', on ? 'on' : 'off');
    });
})();

// ===================================
// YOU ARE HERE — visitor mark on the journey map
// Guessed from the browser's timezone. Nothing leaves the browser.
// ===================================
// The zone table was 4 KB of this file on every visit; it is fetched now
// (assets/timezones.json) once the map is here. The zone is never sent.
(() => {
    const FREETOWN = [-13.2317, 8.4657];
    const haversine = (lon1, lat1, lon2, lat2) => {
        const R = 6371, toR = Math.PI / 180;
        const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
        return Math.round(2 * R * Math.asin(Math.sqrt(a)));
    };

    // Natural Earth I raw projection (matches d3-geo's geoNaturalEarth1)
    const neRaw = (l, p) => {
        const p2 = p * p, p4 = p2 * p2;
        return [
            l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
            p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
        ];
    };

    const mark = ({ svg, mapBox, rescale }, [city, lon, lat]) => {
        const km = haversine(lon, lat, FREETOWN[0], FREETOWN[1]);
        const kmTxt = km.toLocaleString('en-US');

        const readout = document.createElement('p');
        readout.className = 'journey-you-readout mono-label';
        readout.title = 'Guessed from your clock\'s timezone — nothing leaves your browser.';
        mapBox.appendChild(readout);

        const d = svg.dataset;
        const crop = (d.crop || '').split(' ').map(Number);
        const inCrop = crop.length === 4 &&
            lon >= crop[0] && lon <= crop[2] && lat >= crop[1] && lat <= crop[3];
        if (!inCrop || !d.projK) {
            readout.textContent = `you: ~${city}, off this map's edge · ${kmTxt} km from Freetown`;
            return;
        }
        readout.textContent = `you: ~${city} · ${kmTxt} km from Freetown`;

        let l = lon + +d.projRot;
        if (l > 180) l -= 360;
        if (l < -180) l += 360;
        const [a, b] = neRaw(l * Math.PI / 180, lat * Math.PI / 180);
        const x = +d.projTx + d.projK * a;
        const y = +d.projTy - d.projK * b;

        const NS = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'map-you');
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('class', 'map-you-dot');
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', y.toFixed(1));
        dot.setAttribute('r', '3.2');
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('class', 'map-you-label');
        label.setAttribute('x', (x + 14).toFixed(1));
        label.setAttribute('y', (y - 6).toFixed(1));
        label.setAttribute('text-anchor', 'start');
        label.setAttribute('data-cx', x.toFixed(1));
        label.setAttribute('data-cy', y.toFixed(1));
        label.setAttribute('data-dx', '14');
        label.setAttribute('data-dy', '-6');
        label.textContent = 'you?';
        g.appendChild(dot);
        g.appendChild(label);
        const scene = svg.querySelector('#mapScene') || svg;
        scene.appendChild(g);
        // The map drew before this arrived: size the mark with the rest.
        if (typeof rescale === 'function') rescale();
    };

    document.addEventListener('journeymap:ready', (e) => {
        let zone = '';
        try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (err) { return; }
        if (!zone || typeof fetch !== 'function') return;
        fetch('assets/timezones.json')
            .then(r => (r.ok ? r.json() : null))
            .then((table) => {
                const hit = table && table.zones && table.zones[zone];
                if (hit) mark(e.detail, hit);
            })
            .catch(() => { /* no table, no mark: the map is whole without it */ });
    });
})();

// ===================================
// TAKEN OVER
// ===================================
// Everything the stylesheet's html.js rules wait on has run, so the <head>
// failsafe can stand down. On a late start every reveal is marked done
// first: putting the mark back must not hide
// what the reader has seen, nor move it, though it brings back widgets
// above them (and estimated heights). The line a third of the way down is
// put back where it was, and held there while they fill in: that was left
// to scroll anchoring, which Safari lacks (without it the line slid up to
// 2,800px).
if (lateStart) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    // The line and what holds it: a note standing in for a widget goes with
    // the mark, and then what held it stays put instead.
    const trail = [];
    let line = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(innerWidth / 2, innerHeight / 3) : null;
    for (; line && line !== document.body; line = line.parentElement) trail.push([line, line.getBoundingClientRect().top]);
    document.documentElement.classList.add('js');
    const keep = () => {
        const [el, was] = trail.find(([e]) => e.isConnected && e.getClientRects().length) || [];
        const moved = el ? el.getBoundingClientRect().top - was : 0;
        if (Math.abs(moved) >= 1) window.scrollTo({ top: window.pageYOffset + moved, behavior: 'instant' });
    };
    if (trail.length) { keep(); hold(keep); }
}
mks.ready = true;

// ===================================
// CONVERSION ANALYTICS
// ===================================
// The counting itself is count.js, on every page: it keeps this visit's list
// of features used, counts every [data-analytics] click into it, and sends
// the list once as the page is left (never under Do Not Track or GPC). It
// used to be a dispatcher into Plausible or gtag, neither of which was ever
// switched on, so nothing had been counted at all.
//
// This adds the one conversion that is not a click on a hook: the contact
// form being sent, by its button or by Enter. count.js is deferred and runs
// after this file, so it is looked up when needed rather than captured now.
(() => {
    const form = document.getElementById('contactForm');
    if (!form) return;
    form.addEventListener('submit', () => {
        const mks = window.mks;
        if (mks && typeof mks.track === 'function') mks.track('contact-form-submit');
    });
})();

// ===================================
// THE SPOKEN PAGE — one listen control, in the nav
// ===================================
// The player behind it (modules/dispatch.js, its stylesheet and the scripts
// it reads) is about 16 KB gzipped that only a visitor who presses Listen
// needs. So the core only decides whether to show the button; the first
// press fetches the player, which reads the section in view and moves
// between sections itself.
//
// There used to be ten of these, one in every section header: eight-plus
// extra Tab stops for a feature most visits never use. One is enough.
//
// The button stays hidden unless something can actually speak. A speech
// engine that reports no voices (headless browsers, Linux without
// speech-dispatcher) accepts an utterance and silently drops it, and a
// button that loads a player to say nothing is worse than no button. The one
// other thing that can speak is Moses's own recorded introduction, so a
// browser with no voice asks the manifest once, well after the first view
// (no-cache: a cached empty one must not hide a new recording).
(() => {
    const wrap = document.getElementById('navListen');
    const btn = document.getElementById('listenBtn');
    if (!wrap || !btn) return;

    const synth = window.speechSynthesis;
    const canSynth = typeof synth !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
    const hasVoice = () => canSynth && (synth.getVoices() || []).length > 0;
    const show = () => { wrap.hidden = false; };

    if (hasVoice()) {
        show();
    } else {
        // Chrome's first getVoices() is routinely empty; the list arrives later.
        if (canSynth && typeof synth.addEventListener === 'function') {
            synth.addEventListener('voiceschanged', () => { if (hasVoice()) show(); });
        }
        window.addEventListener('load', () => setTimeout(() => {
            if (!wrap.hidden || typeof window.fetch !== 'function') return;
            fetch('assets/audio/voice-manifest.json', { cache: 'no-cache' })
                .then(r => (r.ok ? r.json() : null))
                .then(m => { if (m && m.tracks && m.tracks.intro) show(); })
                .catch(() => { /* no recording: the button stays hidden */ });
        }, 1500));
    }

    // Every press goes through the player once it is here; the first one
    // also fetches it. A second press while it is on its way is the same
    // request, not a close.
    btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-busy') === 'true') return;
        btn.setAttribute('aria-busy', 'true');
        mksLoad('dispatch').then(() => {
            btn.removeAttribute('aria-busy');
            if (mks.narration) mks.narration.toggle();
        }, (err) => {
            btn.removeAttribute('aria-busy');
            mksLoadWarn(err);
        });
    });
})();

