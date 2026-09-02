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

// Exposed so the tests can assert the degradation, and so the field terminal
// can report honestly whether a preference will outlive the tab.
window.mksStorage = safeStorage;

// ===================================
// ON-DEMAND MODULES
// ===================================
// Roughly two thirds of this site's JavaScript serves features most visits
// never reach: the narration player, the field terminal, the games inside
// the project dossiers, the interactives in section 05 and the footer
// receipt. They used to ship in this file, parsed and executed on every
// visit — including the ones that read the hero and left. Now each lives in
// modules/ and is fetched the moment it is first needed: a dossier opening,
// a "listen" press, the backtick key, section 05 coming into range. What
// every visit pays for is what every visit uses.
//
// Modules are classic scripts sharing the page's global scope. They declare
// nothing at the top level (a second `const safeStorage` would be a
// SyntaxError) and reach the core only through window.mks*. Each marks
// itself in window.mksLoaded when it has run, which is also how the jsdom
// harness — which evaluates them directly — tells the loader they are here.
const MODULES = {
    interactives: ['ai-carbon-data.js', 'modules/interactives.js'],
    dossier: ['modules/dossier.js'],
    terminal: ['modules/terminal.js'],
    dispatch: ['voice-scripts.js', 'modules/dispatch.js']
};

const mksLoad = (() => {
    const loaded = (window.mksLoaded = window.mksLoaded || {});
    const inflight = {};

    const inject = (src) => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;   // keep the order a module's dependencies were listed in
        s.onload = () => { loaded[src] = true; resolve(); };
        s.onerror = () => { s.remove(); reject(new Error(`could not load ${src}`)); };
        document.head.appendChild(s);
    });

    return (name) => {
        if (loaded[name]) return Promise.resolve();
        if (inflight[name]) return inflight[name];
        const files = MODULES[name];
        if (!files) return Promise.reject(new Error(`unknown module: ${name}`));
        inflight[name] = files
            .reduce((p, src) => p.then(() => (loaded[src] ? null : inject(src))), Promise.resolve())
            .then(() => { loaded[name] = true; }, (err) => { delete inflight[name]; throw err; });
        return inflight[name];
    };
})();
window.mksLoad = mksLoad;

// A module that will not load is a feature that stays off, not a broken page.
const mksLoadWarn = (err) => {
    if (window.console && console.warn) console.warn(err && err.message ? err.message : err);
};

// The parts of the page owned by modules/interactives.js. A deep link or an
// in-page anchor into one of these loads the module before the page scrolls
// there, so a shared /#ydi lands on a working widget rather than an empty box.
const INTERACTIVE_HOSTS = '#ecoprompt, #ydi, #anatomy, #assay, #receiptPanel, #receiptBtn';
function mksLoadFor(target) {
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest(INTERACTIVE_HOSTS)) mksLoad('interactives').catch(mksLoadWarn);
}

// ===================================
// PRELOADER
// ===================================
(() => {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;

    const wipe = () => preloader.remove();
    const reduce = typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reduced-motion visitors, and anyone who has already seen the intro this
    // session, skip it entirely — no fake loading bar in front of static HTML.
    const seen = safeStorage.session.get('mks-intro-seen');
    if (reduce || seen) { wipe(); return; }
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

    const reduce = typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let heroInView = true;
    if ('IntersectionObserver' in window && hero) {
        new IntersectionObserver((entries) => {
            entries.forEach(en => { heroInView = en.isIntersecting; });
        }, { threshold: 0.05 }).observe(hero);
    }
    const rotating = () => heroInView && !document.hidden && !reduce &&
        !document.body.classList.contains('eco-mode');

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

// Expand a collapsed dossier or the receipt panel that contains a deep-link
// target, so shared links like /#strikeWidget or /#receiptPanel actually reveal
// the feature instead of landing on a closed accordion.
function revealTarget(target) {
    if (!target || !target.closest) return false;
    let expanded = false;
    const card = target.closest('.project-card');
    if (card && !card.classList.contains('expanded')) {
        const summary = card.querySelector('.project-summary');
        if (summary) { summary.click(); expanded = true; }
    }
    const panel = target.id === 'receiptPanel' ? target : target.closest('#receiptPanel');
    if (panel && panel.hasAttribute('hidden')) {
        const rb = document.getElementById('receiptBtn');
        if (rb) { rb.click(); expanded = true; }
    }
    return expanded;
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        // Bare "#" hrefs (e.g. project expand toggles) are not real targets;
        // querySelector('#') would throw SyntaxError, so bail out.
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        mksLoadFor(target);
        const didExpand = revealTarget(target);
        const scroll = () => target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (didExpand) setTimeout(scroll, 180); else scroll();
        setMenuOpen(false);
    });
});

// Direct hits (a shared link, back/forward) also open the collapsed feature.
function handleHashReveal() {
    if (!location.hash || location.hash === '#') return;
    let target;
    try { target = document.querySelector(location.hash); } catch (e) { return; }
    if (!target) return;
    mksLoadFor(target);
    const didExpand = revealTarget(target);
    setTimeout(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }), didExpand ? 240 : 0);
}
window.addEventListener('hashchange', handleHashReveal);
if (location.hash) window.addEventListener('load', () => setTimeout(handleHashReveal, 320));

function setMenuOpen(open) {
    if (!navToggle || !navMenu) return;
    navMenu.classList.toggle('active', open);
    navToggle.classList.toggle('active', open);
    navToggle.setAttribute('aria-expanded', String(open));
}

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        setMenuOpen(!navMenu.classList.contains('active'));
    });

    document.addEventListener('click', (e) => {
        if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
            setMenuOpen(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.classList.contains('active')) {
            setMenuOpen(false);
            navToggle.focus();
        }
    });
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

(() => {
    let sectionTops = [];
    const measure = () => {
        sectionTops = sections.map(s => ({ id: s.id, top: s.offsetTop - 220 }));
    };

    let ticking = false;
    const update = () => {
        ticking = false;
        const y = window.pageYOffset || document.documentElement.scrollTop || 0;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        let current = '';
        for (let i = 0; i < sectionTops.length; i++) {
            if (y >= sectionTops[i].top) current = sectionTops[i].id;
        }
        if (navbar) navbar.classList.toggle('scrolled', y > 100);
        if (scrollTopBtn) scrollTopBtn.classList.toggle('visible', y > 400);
        if (scrollProgress) scrollProgress.style.width = (docHeight > 0 ? (y / docHeight) * 100 : 0) + '%';
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
        });
    };
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
    };
    const relayout = () => { measure(); onScroll(); };

    window.addEventListener('scroll', onScroll, { passive: true });
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(relayout, 150);
    }, { passive: true });
    window.addEventListener('load', relayout);
    // Anything that opens or closes a block of the page — a dossier, the
    // receipt — announces it here so the offsets stay true.
    document.addEventListener('mks:layout', relayout);
    relayout();
})();

// ===================================
// ANIMATED COUNTERS (hero stats)
// ===================================
const animateCounters = () => {
    document.querySelectorAll('.hero-stat-number').forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 1800;
        const increment = target / (duration / 16);
        let current = 0;

        const updateCounter = () => {
            current += increment;
            if (current < target) {
                counter.textContent = Math.ceil(current);
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = target + '+';
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
            // first fly-to so their markers get counter-scaled with the rest
            document.dispatchEvent(new CustomEvent('journeymap:ready', { detail: { svg, mapBox } }));
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

    // The map is 29 KB that sits a full screen below the fold. It is fetched
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
// EXPANDABLE PROJECT DOSSIERS
// ===================================
document.querySelectorAll('.project-card').forEach((card, i) => {
    const toggle = card.querySelector('.project-summary');
    const details = card.querySelector('.project-details');
    if (!toggle || !details) return;

    // Disclosure semantics + keep collapsed content non-interactive. `inert`
    // (with the CSS visibility:hidden fallback) takes the hidden galleries and
    // mini-games out of the tab order and the accessibility tree until opened.
    if (!details.id) details.id = `project-details-${i + 1}`;
    toggle.setAttribute('aria-controls', details.id);
    details.inert = true;

    const collapse = (c) => {
        const d = c.querySelector('.project-details');
        const t = c.querySelector('.project-summary');
        c.classList.remove('expanded');
        if (d) { d.style.maxHeight = '0px'; d.inert = true; }
        if (t) t.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', (e) => {
        // Let real links inside the summary (e.g. demo buttons) work normally
        if (e.target.closest('a') && e.target.closest('a') !== toggle) return;
        e.preventDefault();

        const isExpanded = card.classList.contains('expanded');

        // Collapse any other open dossier so the reader keeps their bearings
        document.querySelectorAll('.project-card.expanded').forEach(open => {
            if (open !== card) collapse(open);
        });

        const remeasure = () => {
            if (card.classList.contains('expanded')) {
                details.style.maxHeight = details.scrollHeight + 'px';
            }
        };

        if (isExpanded) {
            collapse(card);
        } else {
            card.classList.add('expanded');
            details.inert = false;
            details.style.maxHeight = details.scrollHeight + 'px';
            toggle.setAttribute('aria-expanded', 'true');
            // The mini-games inside a dossier load on its first opening —
            // nothing in a collapsed dossier can be seen, so nothing in one
            // is fetched until now.
            if (details.querySelector('.dossier-widget, #floodSlider')) {
                mksLoad('dossier').then(remeasure).catch(mksLoadWarn);
            }
            // Once images inside load, the content can grow — re-measure
            setTimeout(remeasure, 450);
        }
        // Sections below have moved; the scroll bookkeeping needs new offsets.
        setTimeout(() => document.dispatchEvent(new CustomEvent('mks:layout')), 500);
    });
});

// Keep expanded panels correctly sized if the viewport changes: all the
// reads in one pass, then all the writes, so the browser lays out once.
let dossierResize = null;
window.addEventListener('resize', () => {
    if (dossierResize) return;
    dossierResize = requestAnimationFrame(() => {
        dossierResize = null;
        const open = Array.from(document.querySelectorAll('.project-card.expanded .project-details'));
        const heights = open.map(d => d.scrollHeight);
        open.forEach((d, i) => { d.style.maxHeight = heights[i] + 'px'; });
    });
}, { passive: true });

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

    document.querySelectorAll('.gallery-item').forEach(item => {
        const img = item.querySelector('img');
        if (!img) return;
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', 'View larger: ' + (img.alt || 'photo'));
        const openItem = () => open(img.src, img.alt, item.getAttribute('data-caption'));
        item.addEventListener('click', openItem);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openItem();
            }
        });
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
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) close();
    });
})();

// ===================================
// SCROLL TO TOP BUTTON
// ===================================
// Its visibility is handled by the shared scroll handler above.
if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

        const submitBtn = contactForm.querySelector('.btn-submit');
        const originalBtnContent = submitBtn ? submitBtn.innerHTML : '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Sending...</span><svg class="icon icon-spin" aria-hidden="true"><use href="#i-spinner"></use></svg>';
        }
        if (formStatus) formStatus.hidden = true;

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
                throw new Error(result.message || 'Submission rejected');
            }

            showStatus('success', 'Thank you for your message! It has been sent — I will get back to you soon.');
            contactForm.reset();
        } catch (error) {
            console.error('Error submitting form:', error);
            showStatus('error', 'Something went wrong and your message was not sent. Please try again in a moment, or email me directly at moseskollehsesay@gmail.com.');
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
const createThemeToggle = () => {
    const toggle = document.createElement('button');
    const startsLight = document.body.classList.contains('light-mode');
    toggle.innerHTML = `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${startsLight ? 'sun' : 'moon'}"></use></svg>`;
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle light/dark mode');

    document.body.appendChild(toggle);

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLightMode = document.body.classList.contains('light-mode');
        const use = toggle.querySelector('use');
        if (use) use.setAttribute('href', `#i-${isLightMode ? 'sun' : 'moon'}`);
        safeStorage.local.set('theme', isLightMode ? 'light' : 'dark');
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
createThemeToggle();
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

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return;   // mid IME composition
    if (isTypingContext(e.target)) return;

    const jump = (selector) => {
        const target = document.querySelector(selector);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    };

    if (e.key === 'h' || e.key === 'H') jump('#home');
    if (e.key === 'c' || e.key === 'C') jump('#contact');
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
// The terminal itself is modules/terminal.js. The core only listens for the
// two ways in — the backtick and the footer button — and fetches it on the
// first press. Once it is in place it owns both keys, and this stands down.
(() => {
    const toggleBtn = document.getElementById('terminalToggle');
    const openTerminal = () => mksLoad('terminal')
        .then(() => { if (window.FieldTerminal) window.FieldTerminal.open(); })
        .catch(mksLoadWarn);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (!window.FieldTerminal) openTerminal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (window.FieldTerminal) return;
        if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (isTypingContext(e.target)) return;
        e.preventDefault();
        openTerminal();
    });
})();

// ===================================
// INTERACTIVES — the trigger
// ===================================
// "AI, Weighed", You Draw It, Anatomy of a Prompt, The Assay and The Receipt
// (modules/interactives.js, with ai-carbon-data.js behind them) load when
// any of their homes comes within about a screen of the viewport, so they
// are drawn by the time the visitor arrives — and on the first press of one
// of their buttons if they somehow arrive first.
(() => {
    const hosts = Array.from(document.querySelectorAll(INTERACTIVE_HOSTS));
    if (!hosts.length) return;
    const load = () => mksLoad('interactives').catch(mksLoadWarn);

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            if (entries.some(en => en.isIntersecting)) { io.disconnect(); load(); }
        }, { rootMargin: '1200px 0px' });
        hosts.forEach(h => io.observe(h));
    } else {
        load();
    }

    document.addEventListener('click', (e) => {
        if (window.mksLoaded.interactives) return;
        const btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!btn || !btn.closest(INTERACTIVE_HOSTS)) return;
        e.preventDefault();
        // Replay the press once the module's own handler is listening.
        mksLoad('interactives').then(() => btn.click()).catch(mksLoadWarn);
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
    window.mksCarbon = { bytesOf, gramsPerMB: G_CO2_PER_MB, medianPageMB: MEDIAN_PAGE_MB };

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

    const saved = safeStorage.local.get('eco-mode');
    const prefersCalm = typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    apply(saved !== null ? saved === 'on' : prefersCalm);

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
(() => {
    // city, lon, lat for common IANA timezones (coarse on purpose)
    const TZ = {
        'Europe/Amsterdam': ['Amsterdam', 4.9, 52.37], 'Europe/London': ['London', -0.13, 51.51],
        'Europe/Dublin': ['Dublin', -6.26, 53.35], 'Europe/Paris': ['Paris', 2.35, 48.86],
        'Europe/Brussels': ['Brussels', 4.35, 50.85], 'Europe/Berlin': ['Berlin', 13.41, 52.52],
        'Europe/Madrid': ['Madrid', -3.7, 40.42], 'Europe/Lisbon': ['Lisbon', -9.14, 38.72],
        'Europe/Rome': ['Rome', 12.5, 41.9], 'Europe/Zurich': ['Zurich', 8.54, 47.38],
        'Europe/Vienna': ['Vienna', 16.37, 48.21], 'Europe/Prague': ['Prague', 14.44, 50.08],
        'Europe/Warsaw': ['Warsaw', 21.01, 52.23], 'Europe/Stockholm': ['Stockholm', 18.07, 59.33],
        'Europe/Oslo': ['Oslo', 10.75, 59.91], 'Europe/Copenhagen': ['Copenhagen', 12.57, 55.69],
        'Europe/Helsinki': ['Helsinki', 24.94, 60.17], 'Europe/Athens': ['Athens', 23.73, 37.98],
        'Europe/Istanbul': ['Istanbul', 28.98, 41.01], 'Europe/Kyiv': ['Kyiv', 30.52, 50.45],
        'Europe/Bucharest': ['Bucharest', 26.1, 44.43], 'Europe/Budapest': ['Budapest', 19.04, 47.5],
        'Europe/Moscow': ['Moscow', 37.62, 55.76],
        'Africa/Freetown': ['Freetown', -13.23, 8.47], 'Africa/Abidjan': ['Abidjan', -4.02, 5.35],
        'Africa/Accra': ['Accra', -0.19, 5.6], 'Africa/Lagos': ['Lagos', 3.38, 6.52],
        'Africa/Dakar': ['Dakar', -17.45, 14.72], 'Africa/Casablanca': ['Casablanca', -7.59, 33.57],
        'Africa/Algiers': ['Algiers', 3.06, 36.75], 'Africa/Tunis': ['Tunis', 10.17, 36.81],
        'Africa/Cairo': ['Cairo', 31.24, 30.04], 'Africa/Nairobi': ['Nairobi', 36.82, -1.29],
        'Africa/Addis_Ababa': ['Addis Ababa', 38.75, 9.02], 'Africa/Kampala': ['Kampala', 32.58, 0.35],
        'Africa/Kinshasa': ['Kinshasa', 15.27, -4.44], 'Africa/Johannesburg': ['Johannesburg', 28.05, -26.2],
        'Africa/Harare': ['Harare', 31.05, -17.83], 'Africa/Lusaka': ['Lusaka', 28.32, -15.39],
        'Africa/Monrovia': ['Monrovia', -10.8, 6.3], 'Africa/Bamako': ['Bamako', -8.0, 12.65],
        'Africa/Conakry': ['Conakry', -13.68, 9.54],
        'Asia/Shanghai': ['Shanghai', 121.47, 31.23], 'Asia/Hong_Kong': ['Hong Kong', 114.17, 22.32],
        'Asia/Singapore': ['Singapore', 103.85, 1.29], 'Asia/Tokyo': ['Tokyo', 139.69, 35.69],
        'Asia/Seoul': ['Seoul', 126.98, 37.57], 'Asia/Taipei': ['Taipei', 121.57, 25.03],
        'Asia/Bangkok': ['Bangkok', 100.5, 13.76], 'Asia/Jakarta': ['Jakarta', 106.85, -6.21],
        'Asia/Manila': ['Manila', 120.98, 14.6], 'Asia/Kolkata': ['Mumbai/Delhi', 77.21, 28.61],
        'Asia/Karachi': ['Karachi', 67.01, 24.86], 'Asia/Dhaka': ['Dhaka', 90.41, 23.81],
        'Asia/Dubai': ['Dubai', 55.27, 25.2], 'Asia/Riyadh': ['Riyadh', 46.72, 24.69],
        'Asia/Qatar': ['Doha', 51.53, 25.29], 'Asia/Tehran': ['Tehran', 51.39, 35.69],
        'Asia/Jerusalem': ['Jerusalem', 35.21, 31.77], 'Asia/Beirut': ['Beirut', 35.5, 33.89],
        'Asia/Almaty': ['Almaty', 76.89, 43.24], 'Asia/Tashkent': ['Tashkent', 69.24, 41.31],
        'America/New_York': ['New York', -74.01, 40.71], 'America/Toronto': ['Toronto', -79.38, 43.65],
        'America/Chicago': ['Chicago', -87.63, 41.88], 'America/Denver': ['Denver', -104.99, 39.74],
        'America/Los_Angeles': ['Los Angeles', -118.24, 34.05], 'America/Vancouver': ['Vancouver', -123.12, 49.28],
        'America/Mexico_City': ['Mexico City', -99.13, 19.43], 'America/Bogota': ['Bogotá', -74.07, 4.71],
        'America/Lima': ['Lima', -77.04, -12.05], 'America/Santiago': ['Santiago', -70.67, -33.45],
        'America/Sao_Paulo': ['São Paulo', -46.63, -23.55], 'America/Argentina/Buenos_Aires': ['Buenos Aires', -58.38, -34.6],
        'America/Caracas': ['Caracas', -66.9, 10.49], 'America/Port_of_Spain': ['Port of Spain', -61.52, 10.65],
        'Australia/Sydney': ['Sydney', 151.21, -33.87], 'Australia/Melbourne': ['Melbourne', 144.96, -37.81],
        'Australia/Perth': ['Perth', 115.86, -31.95], 'Pacific/Auckland': ['Auckland', 174.76, -36.85]
    };

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

    document.addEventListener('journeymap:ready', (e) => {
        const { svg, mapBox } = e.detail;
        let zone = '';
        try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (err) { return; }
        const hit = TZ[zone];
        if (!hit) return;
        const [city, lon, lat] = hit;
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
    });
})();

// ===================================
// CONVERSION ANALYTICS (privacy-first, provider-agnostic)
// ===================================
// A tiny dispatcher that fires named events on the key conversion actions
// (contact, email, CV download) into whichever cookieless analytics provider
// is enabled in index.html's <head>. It is a no-op until you turn one on, so it
// never transmits anything on its own and needs no cookie-consent banner.
(() => {
    const track = (name) => {
        if (!name) return;
        try {
            if (typeof window.plausible === 'function') {
                window.plausible(name);
            } else if (typeof window.gtag === 'function') {
                window.gtag('event', name);
            } else if (Array.isArray(window.dataLayer)) {
                window.dataLayer.push({ event: name });
            }
        } catch (e) { /* analytics must never break the page */ }
    };
    window.trackEvent = track;

    // Delegated: anything carrying data-analytics reports itself on click.
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-analytics]');
        if (el) track(el.getAttribute('data-analytics'));
    });

    // A contact-form submission is the primary conversion goal.
    const form = document.getElementById('contactForm');
    if (form) form.addEventListener('submit', () => track('contact-form-submit'));
})();

// ===================================
// THE SPOKEN PAGE — the listen controls
// ===================================
// The player behind them (modules/dispatch.js plus the scripts it reads) is
// about 40 KB that only a visitor who presses one of these needs. So the core
// renders the controls — one on the hero, one in every section header — and
// the first press fetches the player, which takes them over: same buttons in
// the same places, now with the transfer cost of each voice printed beside
// them. A section header without a narration script would get a dead button
// here, which is why tests/bugs.test.js holds the two lists to each other.
(() => {
    const canSynth = typeof window.speechSynthesis !== 'undefined' &&
        typeof window.SpeechSynthesisUtterance === 'function';
    if (!canSynth && typeof window.Audio !== 'function') return;

    const mounts = [];
    const cta = document.querySelector('.hero-cta');
    if (cta) mounts.push({ id: 'hero', label: 'the introduction', insert: (el) => cta.insertAdjacentElement('afterend', el) });
    document.querySelectorAll('section[id]').forEach(section => {
        const header = section.querySelector('.section-header');
        if (!header) return;
        const title = header.querySelector('h2');
        mounts.push({
            id: section.id,
            label: title ? title.textContent.replace(/\s+/g, ' ').trim() : section.id,
            insert: (el) => header.appendChild(el)
        });
    });

    mounts.forEach(({ id, label, insert }) => {
        const wrap = document.createElement('div');
        wrap.className = 'listen-wrap';
        wrap.dataset.voiceId = id;
        wrap.innerHTML = `
            <button class="listen-btn mono-label" type="button" data-voice="${id}"
                    aria-pressed="false" data-analytics="listen-${id}">
                <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-play"></use></svg>
                <span>listen<span class="sr-only"> to ${label}</span></span>
            </button>
            <span class="listen-cost mono-label"></span>`;
        const btn = wrap.querySelector('.listen-btn');
        btn.addEventListener('click', () => {
            btn.disabled = true;
            btn.classList.add('is-loading');
            mksLoad('dispatch').then(() => {
                const fd = window.FieldDispatch;
                if (!fd || !fd.play(id)) return;
                // The player replaced this button with its own; keep the
                // keyboard where the visitor left it.
                const live = document.querySelector(`.listen-btn[data-voice="${id}"]`);
                if (live && live !== btn) live.focus();
            }).catch((err) => {
                btn.disabled = false;
                btn.classList.remove('is-loading');
                mksLoadWarn(err);
            });
        });
        insert(wrap);
    });
})();

