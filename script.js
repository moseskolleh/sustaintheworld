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
    if (!slides.length) return;
    let currentSlide = 0;

    // The first slide is fetched now; the rest are fetched only once the
    // rotation is about to need them. The previous version applied all three
    // background-images in one pass, which is not what the comment above it
    // claimed and meant three hero-sized images landed on every visit —
    // including visits that never stayed long enough to see slides two and
    // three, and visits in low-energy mode where the rotation never runs.
    const loadSlide = (index) => {
        const slide = slides[index];
        if (!slide || slide.dataset.loaded) return;
        const src = slide.getAttribute('data-bg');
        if (!src) return;
        slide.style.backgroundImage = `url('${src}')`;
        slide.dataset.loaded = '1';
    };
    loadSlide(0);

    // Give slide two a head start, but only once the browser is idle and only
    // if the rotation is actually going to run — low-energy mode holds on the
    // first slide, and fetching for a rotation that never happens is the
    // exact waste this section of the site argues against.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    idle(() => {
        if (!document.body.classList.contains('eco-mode')) loadSlide(1);
    });

    const showSlide = (index) => {
        loadSlide(index);
        // Fetch the next one now, so it is decoded before it is shown rather
        // than fading in from blank.
        loadSlide((index + 1) % slides.length);
        slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
        if (captionText && heroSlideCaptions[index]) {
            captionText.textContent = heroSlideCaptions[index];
        }
    };

    setInterval(() => {
        if (document.body.classList.contains('eco-mode')) return;
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
    }, 8000);
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
// NAVBAR SCROLL EFFECT + PROGRESS BAR
// ===================================
const navbar = document.getElementById('navbar');
const scrollProgress = document.getElementById('scrollProgress');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (navbar) navbar.classList.toggle('scrolled', currentScroll > 100);

    if (scrollProgress) {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (currentScroll / docHeight) * 100 : 0;
        scrollProgress.style.width = pct + '%';
    }
});

// ===================================
// ACTIVE NAVIGATION HIGHLIGHT
// ===================================
const sections = document.querySelectorAll('section[id], header[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        if (window.scrollY >= section.offsetTop - 220) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
    });
});

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

    fetch('assets/journey-map.svg')
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

        if (isExpanded) {
            collapse(card);
        } else {
            card.classList.add('expanded');
            details.inert = false;
            details.style.maxHeight = details.scrollHeight + 'px';
            toggle.setAttribute('aria-expanded', 'true');
            // Once images inside load, the content can grow — re-measure
            setTimeout(() => {
                if (card.classList.contains('expanded')) {
                    details.style.maxHeight = details.scrollHeight + 'px';
                }
            }, 450);
        }
    });
});

// Keep expanded panels correctly sized if the viewport changes
window.addEventListener('resize', () => {
    document.querySelectorAll('.project-card.expanded .project-details').forEach(details => {
        details.style.maxHeight = details.scrollHeight + 'px';
    });
});

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
const scrollTopBtn = document.getElementById('scrollTop');

if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
        scrollTopBtn.classList.toggle('visible', window.pageYOffset > 400);
    });

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
        const formData = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            subject: document.getElementById('subject').value.trim(),
            message: document.getElementById('message').value.trim(),
            website: honeypot ? honeypot.value : '',
            turnstileToken: challenge ? challenge.value : '',
            submitted_at: new Date().toISOString(),
            source: 'Portfolio Website'
        };

        const submitBtn = contactForm.querySelector('.btn-submit');
        const originalBtnContent = submitBtn.innerHTML;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Sending...</span><svg class="icon icon-spin" aria-hidden="true"><use href="#i-spinner"></use></svg>';
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
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnContent;
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
    });
};

// Restore saved preference, then mount the toggle
const currentTheme = safeStorage.local.get('theme', 'dark');
if (currentTheme === 'light') {
    document.body.classList.add('light-mode');
}
createThemeToggle();

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
// HASH SCROLL ON LOAD
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash && window.location.hash !== '#') {
        setTimeout(() => {
            let target = null;
            try {
                target = document.querySelector(window.location.hash);
            } catch (err) { /* ignore malformed hashes */ }
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
});

// ===================================
// EASTER EGG: CONSOLE MESSAGE
// ===================================
console.log('%c👋 Welcome to my portfolio!', 'color: #7CFC00; font-size: 24px; font-weight: bold;');
console.log('%cFrom bedrock to cloud — built with passion for sustainability.', 'color: #7CFC00; font-size: 14px;');
console.log('%cInterested in collaboration? Let\'s connect!', 'color: #ffffff; font-size: 14px;');
console.log('%cEmail: moseskollehsesay@gmail.com', 'color: #7CFC00; font-size: 14px;');

// ===================================
// ECOPROMPT WIDGET — AI, weighed
// All numbers come from the shared source of truth (ai-carbon-data.js), the
// same one the full EcoPrompt Coach tool uses — so they can never disagree.
// ===================================
(() => {
    const modelSel = document.getElementById('ecoModel');
    const presetSel = document.getElementById('ecoPreset');
    const gridSel = document.getElementById('ecoGrid');
    const DATA = (typeof window !== 'undefined') ? window.AICarbonData : null;
    if (!modelSel || !presetSel || !gridSel || !DATA) return;

    // Compact homepage view, derived from the shared data.
    const MODELS = DATA.HOMEPAGE_MODELS.map(k => ({
        key: k, label: DATA.MODELS[k].label, model: DATA.MODELS[k]
    }));
    const GRIDS = DATA.HOMEPAGE_REGIONS.map(k => ({
        key: k,
        label: `${DATA.REGIONS[k].label} — ${DATA.REGIONS[k].intensity} gCO₂e/kWh`,
        intensity: DATA.REGIONS[k].intensity
    }));
    const PRESET_TOKENS = { short: 400, chat: 1000, doc: 5000, reasoning: 9000 };
    const PUE = DATA.PUE;                              // data-centre overhead
    const WUE = DATA.WUE_PROFILES.avg.wue_L_per_kWh;   // L per kWh, typical cooling

    MODELS.forEach((m, i) => modelSel.add(new Option(m.label, i)));
    GRIDS.forEach((g, i) => gridSel.add(new Option(g.label, i)));
    modelSel.value = '0';
    gridSel.value = '2'; // Netherlands — where this research happens

    const fmt = (n) => {
        if (n >= 100) return n.toFixed(0);
        if (n >= 1) return n.toFixed(1);
        if (n >= 0.01) return n.toFixed(2);
        return n.toFixed(3);
    };

    const footprint = (model, tokens, grid) => {
        // Presets are a token budget, not a split, so they are spent at the
        // reference mix the benchmarks are calibrated against. The full tool
        // is where the input/output split becomes a control.
        const mix = DATA.TOKEN_ENERGY.referenceMix;
        const wh = DATA.energyForQuery(model.model, tokens * mix.input, tokens * mix.output);
        const kWh = (wh / 1000) * PUE;
        return {
            wh: kWh * 1000,
            carbon: kWh * grid.intensity,
            water: kWh * WUE * 1000
        };
    };

    const render = () => {
        const model = MODELS[modelSel.value];
        const grid = GRIDS[gridSel.value];
        const tokens = PRESET_TOKENS[presetSel.value];
        const f = footprint(model, tokens, grid);

        document.getElementById('ecoEnergy').textContent = fmt(f.wh);
        document.getElementById('ecoCarbon').textContent = fmt(f.carbon);
        document.getElementById('ecoWater').textContent = fmt(f.water);

        const ledMin = f.wh * 60 / 10;               // 10 W LED bulb
        const carM = f.carbon / 170 * 1000;          // EU avg petrol car, 170 g/km
        const teaspoons = f.water / 4.93;
        document.getElementById('ecoEquiv').innerHTML =
            `One answer &asymp; an LED bulb burning for <strong>${fmt(ledMin)} min</strong>, ` +
            `driving a petrol car <strong>${fmt(carM)} m</strong>, ` +
            `and <strong>${fmt(teaspoons)} teaspoons</strong> of cooling water.`;

        const bars = document.getElementById('ecoBars');
        const results = MODELS.map(m => ({ m, f: footprint(m, tokens, grid) }))
            .sort((a, b) => a.f.carbon - b.f.carbon);
        const max = results[results.length - 1].f.carbon || 1;
        bars.innerHTML = results.map(({ m, f: mf }) => `
            <div class="eco-bar-row${m.key === model.key ? ' current' : ''}">
                <span class="eco-bar-name">${m.label}</span>
                <span class="eco-bar-track"><span class="eco-bar-fill" data-w="${(mf.carbon / max * 100).toFixed(1)}"></span></span>
                <span class="eco-bar-val">${fmt(mf.carbon)} g</span>
            </div>`).join('');
        requestAnimationFrame(() => {
            bars.querySelectorAll('.eco-bar-fill').forEach(el => {
                el.style.width = el.getAttribute('data-w') + '%';
            });
        });
    };

    [modelSel, presetSel, gridSel].forEach(el => el.addEventListener('change', render));
    render();
})();

// ===================================
// CARBON BADGE — this page, weighed live
// ===================================
(() => {
    const badgeText = document.getElementById('carbonBadgeText');
    const infoBtn = document.getElementById('carbonInfoBtn');
    const method = document.getElementById('carbonMethod');
    if (!badgeText) return;

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
// SITE THE BOREHOLE — resistivity mini-game (groundwater dossier)
// ===================================
(() => {
    const stage = document.getElementById('boreholeStage');
    const drillBtn = document.getElementById('drillBtn');
    const resetBtn = document.getElementById('drillResetBtn');
    const result = document.getElementById('drillResult');
    const score = document.getElementById('drillScore');
    if (!stage || !drillBtn) return;

    const NS = 'http://www.w3.org/2000/svg';
    const W = 800, H = 430;
    const SURFACE = 190, HOLE_BOTTOM = 380;
    const CURVE_TOP = 55, CURVE_BOT = 150;
    let zones = [];          // {center, half, kind: 'water'|'clay'}
    let rigX = 400;
    let drilling = false;
    let drillRun = 0;        // invalidates in-flight drill animations on reset
    let attempts = 0, strikes = 0;
    let svg, curveEl, rigEl, holesEl, revealEl;

    const el = (tag, attrs, parent) => {
        const n = document.createElementNS(NS, tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        (parent || svg).appendChild(n);
        return n;
    };
    const calm = () => document.body.classList.contains('eco-mode') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Apparent resistivity along the profile: high background with
    // gaussian lows over the hidden zones (water reads lowest, clay close).
    const resistivityAt = (x) => {
        let r = 1 + 0.08 * Math.sin(x / 47) + 0.05 * Math.sin(x / 23 + 2);
        zones.forEach(z => {
            const depth = z.kind === 'water' ? 0.75 : 0.55;
            r -= depth * Math.exp(-((x - z.center) ** 2) / (2 * (z.half * 0.8) ** 2));
        });
        return Math.max(0.08, Math.min(1.15, r));
    };
    const curveY = (x) => CURVE_BOT - resistivityAt(x) * (CURVE_BOT - CURVE_TOP) / 1.15;

    const newZones = () => {
        const kinds = ['water', 'water', 'clay'].sort(() => Math.random() - 0.5);
        const centers = [];
        while (centers.length < 3) {
            const c = 90 + Math.random() * (W - 180);
            if (centers.every(o => Math.abs(o - c) > 150)) centers.push(c);
        }
        zones = centers.map((c, i) => ({ center: c, half: 26 + Math.random() * 14, kind: kinds[i] }));
    };

    const surfaceY = (x) => SURFACE + 4 * Math.sin(x / 90) + 2 * Math.sin(x / 31);

    const drawScene = () => {
        stage.innerHTML = '';
        svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'borehole-svg');
        svg.setAttribute('aria-hidden', 'true');
        stage.appendChild(svg);

        // curve panel
        el('text', { x: 10, y: 30, class: 'bh-label' }).textContent = 'apparent resistivity along the profile';
        el('text', { x: 10, y: CURVE_TOP + 8, class: 'bh-label bh-label-dim' }).textContent = 'high';
        el('text', { x: 10, y: CURVE_BOT, class: 'bh-label bh-label-dim' }).textContent = 'low';
        let d = '';
        for (let x = 40; x <= W - 12; x += 6) d += (d ? ' L ' : 'M ') + x + ' ' + curveY(x).toFixed(1);
        el('path', { d, class: 'bh-curve' });

        // ground
        let gd = `M 0 ${surfaceY(0)}`;
        for (let x = 10; x <= W; x += 10) gd += ` L ${x} ${surfaceY(x).toFixed(1)}`;
        el('path', { d: gd + ` L ${W} ${H} L 0 ${H} Z`, class: 'bh-ground' });
        el('path', { d: gd, class: 'bh-surface' });
        el('text', { x: W - 12, y: SURFACE + 26, 'text-anchor': 'end', class: 'bh-label bh-label-dim' }).textContent = 'weathered regolith';
        el('text', { x: W - 12, y: 300, 'text-anchor': 'end', class: 'bh-label bh-label-dim' }).textContent = 'gabbro bedrock';
        el('line', { x1: 0, y1: 250, x2: W, y2: 250, class: 'bh-strata' });

        revealEl = el('g', {});
        holesEl = el('g', {});

        // rig: base + derrick
        rigEl = el('g', { class: 'bh-rig' });
        el('rect', { x: -22, y: -12, width: 44, height: 8, rx: 2, class: 'bh-rig-base' }, rigEl);
        el('path', { d: 'M -14 -12 L 0 -64 L 14 -12', class: 'bh-rig-mast' }, rigEl);
        el('line', { x1: -9, y1: -28, x2: 9, y2: -28, class: 'bh-rig-mast' }, rigEl);
        el('line', { x1: -5, y1: -46, x2: 5, y2: -46, class: 'bh-rig-mast' }, rigEl);
        placeRig(rigX);
    };

    function placeRig(x) {
        rigX = Math.max(50, Math.min(W - 50, x));
        rigEl.setAttribute('transform', `translate(${rigX.toFixed(1)} ${surfaceY(rigX).toFixed(1)})`);
    }

    const toViewX = (clientX) => {
        const r = svg.getBoundingClientRect();
        return (clientX - r.left) * (W / r.width);
    };

    const updateScore = () => {
        if (!attempts) { score.textContent = ''; return; }
        let t = `Strikes: ${strikes}/${attempts}`;
        if (attempts >= 3) t += ' · blind drilling here hits ~30% — our crews read the curve and hit 70%';
        score.textContent = t;
    };

    const finishHole = (x) => {
        const zone = zones.find(z => Math.abs(x - z.center) <= z.half);
        const sy = surfaceY(x);
        attempts++;
        if (zone && zone.kind === 'water') {
            strikes++;
            el('ellipse', { cx: zone.center, cy: 330, rx: zone.half * 1.5, ry: 26, class: 'bh-reveal-water' }, revealEl);
            el('line', { x1: x, y1: 330, x2: x, y2: sy, class: 'bh-water-col' }, holesEl);
            const gush = el('path', { d: `M ${x} ${sy} q -14 -30 -24 -38 M ${x} ${sy} q 0 -36 0 -44 M ${x} ${sy} q 14 -30 24 -38`, class: 'bh-gush' }, holesEl);
            if (!calm()) gush.classList.add('bh-gush-anim');
            result.textContent = `STRIKE — water at ~${Math.round(38 + Math.random() * 14)} m. That dip was a saturated fracture zone. (${strikes}/${attempts})`;
        } else if (zone) {
            el('ellipse', { cx: zone.center, cy: 300, rx: zone.half * 1.4, ry: 20, class: 'bh-reveal-clay' }, revealEl);
            result.textContent = 'Low resistivity… but it was a clay pocket, not water. Even good surveys get fooled — that\'s why we also ran pumping tests.';
        } else {
            result.textContent = 'Dry hole — hard gabbro all the way down. The curve was high here: high resistivity, no fractures, no water.';
        }
        updateScore();
        drilling = false;
        drillBtn.disabled = false;
    };

    const drill = () => {
        if (drilling) return;
        drilling = true;
        drillBtn.disabled = true;
        const run = ++drillRun;
        const x = rigX, sy = surfaceY(x);
        const hole = el('line', { x1: x, y1: sy, x2: x, y2: sy, class: 'bh-hole' }, holesEl);
        result.textContent = 'Drilling…';
        if (calm()) {
            hole.setAttribute('y2', HOLE_BOTTOM);
            finishHole(x);
            return;
        }
        const t0 = performance.now();
        const step = (t) => {
            if (run !== drillRun) return; // site was reset mid-drill
            const p = Math.min(1, (t - t0) / 900);
            hole.setAttribute('y2', (sy + (HOLE_BOTTOM - sy) * p).toFixed(1));
            if (p < 1) requestAnimationFrame(step);
            else finishHole(x);
        };
        requestAnimationFrame(step);
    };

    const reset = () => {
        drillRun++; // abandon any drill still in progress
        drilling = false;
        drillBtn.disabled = false;
        newZones();
        drawScene();
        result.textContent = 'New site surveyed. Read the curve, place the rig, drill.';
    };

    newZones();
    drawScene();

    let dragging = false;
    stage.addEventListener('pointerdown', (e) => {
        if (drilling) return;
        dragging = true;
        stage.setPointerCapture(e.pointerId);
        placeRig(toViewX(e.clientX));
    });
    stage.addEventListener('pointermove', (e) => {
        if (dragging && !drilling) placeRig(toViewX(e.clientX));
    });
    stage.addEventListener('pointerup', () => { dragging = false; });
    stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { placeRig(rigX - 14); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { placeRig(rigX + 14); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') { drill(); e.preventDefault(); }
    });
    drillBtn.addEventListener('click', drill);
    resetBtn.addEventListener('click', reset);
})();

// ===================================
// DON'T LET IT BECOME A BOAT — Wupper flood-level slider (Wuppertal dossier)
// ===================================
(() => {
    const stageBox = document.getElementById('floodStage');
    const slider = document.getElementById('floodSlider');
    const levelLabel = document.getElementById('floodLevelLabel');
    const note = document.getElementById('floodNote');
    if (!stageBox || !slider) return;

    const NS = 'http://www.w3.org/2000/svg';
    const W = 800, H = 340;
    const BED = 303, BANK = 240, CH_L = 252, CH_R = 548;
    const CAR_BOTTOM = 178;

    const LEVELS = [
        { y: 278, label: 'normal',
          note: 'A calm day — the Wupper runs its channel, well below the suspended track.' },
        { y: 248, label: '+1 m',
          note: 'Riverside paths go under. In a warming climate, days like this come more often.' },
        { y: 222, label: '+2 m',
          note: 'Over the banks: streets and basements flood, and the city\'s lowest infrastructure is in the water.' },
        { y: CAR_BOTTOM + 5, label: 'July 2021',
          note: 'The 2021 flood pushed the Wupper towards the hanging cars — the "boat" scenario. Our roadmap: early warning, room for the river, unsealed surfaces.' }
    ];

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'flood-svg');
    svg.setAttribute('aria-hidden', 'true');
    stageBox.appendChild(svg);
    const el = (tag, attrs, parent) => {
        const n = document.createElementNS(NS, tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        (parent || svg).appendChild(n);
        return n;
    };

    // banks + riverbed
    el('path', { d: `M 0 ${BANK} L ${CH_L} ${BANK} L ${CH_L + 14} ${BED} L 0 ${BED} Z`, class: 'fl-bank' });
    el('path', { d: `M ${W} ${BANK} L ${CH_R} ${BANK} L ${CH_R - 14} ${BED} L ${W} ${BED} Z`, class: 'fl-bank' });
    el('rect', { x: 0, y: BED, width: W, height: H - BED, class: 'fl-bank' });
    // buildings on the banks
    [[30, 150, 60], [110, 170, 46], [660, 160, 52], [730, 145, 50]].forEach(([x, y, w]) => {
        el('rect', { x, y, width: w, height: BANK - y, class: 'fl-building' });
        for (let wy = y + 12; wy < BANK - 12; wy += 22)
            for (let wx = x + 8; wx < x + w - 10; wx += 16)
                el('rect', { x: wx, y: wy, width: 6, height: 8, class: 'fl-window' });
    });

    // water (overbank sheet + channel), drawn behind the structure
    const overbank = el('rect', { x: 40, y: BANK, width: W - 80, height: 0, class: 'fl-water' });
    const channel = el('rect', { x: CH_L, y: LEVELS[0].y, width: CH_R - CH_L, height: BED - LEVELS[0].y, class: 'fl-water' });

    // July 2021 reference line
    el('line', { x1: 46, y1: LEVELS[3].y, x2: W - 46, y2: LEVELS[3].y, class: 'fl-refline' });
    el('text', { x: 52, y: LEVELS[3].y - 6, class: 'fl-label' }).textContent = 'July 2021';

    // Schwebebahn: pylons, track beam, hanging car
    [290, 510].forEach(px => {
        el('path', { d: `M ${px - 44} ${BANK} L ${px} 112 L ${px + 44} ${BANK}`, class: 'fl-pylon' });
    });
    el('rect', { x: 210, y: 104, width: 380, height: 10, rx: 3, class: 'fl-beam' });
    el('line', { x1: 400, y1: 114, x2: 400, y2: 140, class: 'fl-pylon' });
    const car = el('g', { class: 'fl-car-g' });
    el('rect', { x: 352, y: 140, width: 96, height: 38, rx: 10, class: 'fl-car' }, car);
    [362, 382, 402, 422].forEach(wx => el('rect', { x: wx, y: 148, width: 14, height: 12, rx: 2, class: 'fl-car-window' }, car));

    const calm = () => document.body.classList.contains('eco-mode') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    let anim = null;
    const setWater = (y, instant) => {
        const chFrom = +channel.getAttribute('y');
        const obTarget = Math.max(0, BANK - y);
        const obFrom = +overbank.getAttribute('height');
        const apply = (p) => {
            const cy = chFrom + (y - chFrom) * p;
            channel.setAttribute('y', cy.toFixed(1));
            channel.setAttribute('height', (BED - cy).toFixed(1));
            const oh = obFrom + (obTarget - obFrom) * p;
            overbank.setAttribute('height', oh.toFixed(1));
            overbank.setAttribute('y', (BANK - oh).toFixed(1));
        };
        if (instant || calm()) { apply(1); return; }
        if (anim) cancelAnimationFrame(anim);
        const t0 = performance.now();
        const step = (t) => {
            const p = Math.min(1, (t - t0) / 650);
            apply(p * (2 - p)); // ease-out
            if (p < 1) anim = requestAnimationFrame(step);
        };
        anim = requestAnimationFrame(step);
    };

    const update = (instant) => {
        const lv = LEVELS[+slider.value] || LEVELS[0];
        levelLabel.textContent = lv.label;
        note.textContent = lv.note;
        setWater(lv.y, instant);
    };
    slider.addEventListener('input', () => update(false));
    update(true);
})();

// ===================================
// FIELD TERMINAL — press ` or the footer button
// ===================================
(() => {
    const toggleBtn = document.getElementById('terminalToggle');
    let overlay = null, screen = null, input = null, lastFocus = null;
    const history = [];
    let histIdx = -1;

    const print = (text, cls) => {
        const line = document.createElement('div');
        line.className = 'ft-row' + (cls ? ' ' + cls : '');
        line.textContent = text;
        screen.appendChild(line);
        screen.scrollTop = screen.scrollHeight;
    };

    const calm = () => document.body.classList.contains('eco-mode');

    const COMMANDS = {
        help: () => {
            print('available commands:');
            [['journey', 'the route, Freetown to Amsterdam'],
             ['projects', 'list the six project dossiers'],
             ['drill', 'spud in a borehole right here'],
             ['co2', 'how much this visit weighed'],
             ['whoami', 'who runs this place'],
             ['cv', 'download the CV (PDF)'],
             ['map', 'fly to the journey map'],
             ['eco', 'toggle low-energy mode'],
             ['voice', 'read a section aloud — try \'voice about\''],
             ['theme', 'toggle light/dark'],
             ['kushe', 'a greeting from Freetown'],
             ['clear', 'wipe the screen'],
             ['exit', 'close the terminal']
            ].forEach(([c, d]) => print(`  ${c.padEnd(10)} ${d}`));
        },
        whoami: () => {
            print('Moses Kolleh Sesay — geologist by training, sustainability analyst by conviction.');
            print('currently: Amsterdam, NL (52.3676° N, 4.9041° E). previously: see \'journey\'.');
        },
        journey: () => {
            [['2013–2019', 'Freetown, SL', '8.4657° N, 13.2317° W', 'BSc Geology · 164 water points'],
             ['2019–2021', 'Changsha, CN', '28.2282° N, 112.9388° E', 'MSc Industrial Engineering'],
             ['2023', 'Bonn, DE', '50.7374° N, 7.0982° E', 'UNDRR · 54 hazard systems'],
             ['2021–2024', 'Wageningen, NL', '51.9692° N, 5.6654° E', 'MSc Env. Sciences · 10,226 sub-basins'],
             ['2025–now', 'Amsterdam, NL', '52.3676° N, 4.9041° E', 'Sustainable AI research']
            ].forEach(s => print(`  ${s[0].padEnd(10)} ${s[1].padEnd(16)} ${s[2].padEnd(24)} ${s[3]}`));
            print('run \'map\' to fly the route.');
        },
        projects: () => {
            ['Sustainable Generative AI — Digital Society School × Ministry of Finance',
             'Coastal Water Pollution — 10,226 sub-basins, futures for Africa\'s coasts',
             'Flood-Resilient Wuppertal — don\'t let the Schwebebahn become a boat',
             'UN Disaster Risk Reduction — Sendai Framework data, Bonn',
             'Soft Path Water Management — beyond cement, steel and pipes',
             'Groundwater Potential Mapping — geophysics with a 70% strike rate'
            ].forEach((p, i) => print(`  [${i + 1}] ${p}`));
            print('dossiers open in section 04 — PROJECTS.');
        },
        co2: () => {
            const badge = document.getElementById('carbonBadgeText');
            print(badge ? badge.textContent : 'the scale is still warming up — scroll to the footer.');
            print('methodology: Resource Timing API × Sustainable Web Design model.');
            print('this counts network transfer only — not the energy your device spends rendering it.');
            const fd = window.FieldDispatch;
            if (fd) {
                const st = fd.state();
                print(st.mode === 'human'
                    ? `narration: ${st.voiceTitle || 'recorded voice'} — each section is a file, and the player prints its transfer weight before you press play.`
                    : 'narration: your browser\'s own voice. it transfers nothing, so it adds nothing to the figure above — though your device still does the work.');
            }
        },
        drill: (args, done) => {
            const steps = [
                'spudding in…',
                '── 12 m  laterite, red-brown, moist',
                '── 26 m  saprolite, weathered gabbro',
                '── 38 m  fractured gabbro — conductivity rising',
                'STRIKE 💧 water at 38 m. static level −6 m, yield looks good.',
                '(odds are 7/10 when you read the resistivity curve first — see the Groundwater dossier.)'
            ];
            if (calm()) { steps.forEach(s => print(s)); return; }
            let i = 0;
            const tick = () => {
                print(steps[i]);
                i++;
                if (i < steps.length) setTimeout(tick, 420);
                else done();
            };
            tick();
            return true; // async
        },
        cv: () => {
            print('fetching Moses_Kolleh_Sesay_CV.pdf …');
            const a = document.createElement('a');
            a.href = 'assets/Moses_Kolleh_Sesay_CV.pdf';
            a.download = '';
            document.body.appendChild(a);
            a.click();
            a.remove();
        },
        map: () => {
            close();
            const j = document.getElementById('journey');
            if (j) j.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth' });
        },
        eco: () => {
            const b = document.getElementById('ecoModeToggle');
            if (b) b.click();
            print('low-energy mode: ' + (document.body.classList.contains('eco-mode') ? 'on' : 'off'));
        },
        voice: (args) => {
            const fd = window.FieldDispatch;
            if (!fd) { print('no speech engine in this browser — the page stays quiet.', 'ft-err'); return; }
            const state = fd.state();
            const arg = (args && args[0]) || '';

            if (!arg) {
                print('usage: voice <section> — one of: ' + state.ids.join(', '));
                print('       voice stop      — shut it up');
                print('       voice recorded  — switch to the recorded narration, if it has been rendered');
                print('       voice browser   — switch back to your browser\'s own voice (0 bytes)');
                print(`current: ${state.mode === 'human' ? (state.voiceTitle || 'recorded narration') : 'browser voice — ' + state.voice}`);
                if (state.mode === 'human' && state.voiceKind && state.voiceKind !== 'human') {
                    print('note: that is a synthetic text-to-speech voice, not a recording of Moses.');
                }
                if (state.mode !== 'human') {
                    print(state.local
                        ? 'that voice is installed on your device. it transfers nothing over the network.'
                        : 'heads up: your browser has no offline voice, so it streams the audio from its vendor.');
                }
                return;
            }
            if (arg === 'stop') { fd.stop(); print('narration stopped.'); return; }
            // 'moses' still works as an alias — it was the documented word —
            // but it is no longer what the command prints back, because the
            // recorded narration is not Moses's voice.
            if (arg === 'recorded' || arg === 'human' || arg === 'moses') {
                fd.loadManifest().then(() => {
                    if (!fd.hasRecorded()) { print('the recorded narration has not been rendered yet — staying on the browser voice.', 'ft-err'); return; }
                    fd.setMode('human', true);
                    const now = fd.state();
                    print(`voice: ${now.voiceTitle || 'recorded narration'}${now.voiceKind && now.voiceKind !== 'human' ? ' (synthetic)' : ''}.`);
                    print('each section is a file now — the player shows what it transfers.');
                });
                return;
            }
            if (arg === 'browser' || arg === 'synth') {
                fd.setMode('synth', true);
                print('voice: your browser\'s. nothing crosses the wire — though your device still does the work.');
                return;
            }
            if (fd.play(arg)) { close(); return; }
            print(`no section called '${arg}'. try: ${state.ids.join(', ')}`, 'ft-err');
        },
        theme: () => {
            const b = document.querySelector('.theme-toggle');
            if (b) b.click();
            print('theme: ' + (document.body.classList.contains('light-mode') ? 'light' : 'dark'));
        },
        kushe: () => {
            print('Kushe! Aw di bodi?');
            print('(Krio — "hello, how are you?". greetings from Freetown.)');
        },
        clear: () => { screen.innerHTML = ''; },
        exit: () => close()
    };

    const runCommand = (raw) => {
        const cmd = raw.trim().toLowerCase();
        print('moses@sustaintheworld:~$ ' + raw, 'ft-echo');
        if (!cmd) return;
        history.push(raw);
        histIdx = history.length;
        const [name, ...args] = cmd.split(/\s+/);
        const fn = COMMANDS[name];
        if (!fn) { print(`command not found: ${name} — try 'help'`, 'ft-err'); return; }
        input.disabled = true;
        const done = () => { input.disabled = false; input.focus(); };
        if (fn(args, done) !== true) done();
    };

    const build = () => {
        overlay = document.createElement('div');
        overlay.className = 'field-terminal';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Field terminal');
        overlay.innerHTML = `
            <div class="ft-panel">
                <div class="ft-bar">
                    <span class="mono-label">field terminal — sustaintheworld</span>
                    <button class="ft-close" aria-label="Close terminal">×</button>
                </div>
                <div class="ft-screen" aria-live="polite"></div>
                <form class="ft-line">
                    <label class="ft-prompt" for="ftInput">moses@sustaintheworld:~$</label>
                    <input id="ftInput" class="ft-input" type="text" autocomplete="off" spellcheck="false" autocapitalize="off">
                </form>
            </div>`;
        document.body.appendChild(overlay);
        screen = overlay.querySelector('.ft-screen');
        input = overlay.querySelector('.ft-input');
        overlay.querySelector('.ft-close').addEventListener('click', close);
        overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
        // aria-modal promises focus stays inside — trap Tab between the
        // dialog's two focusable controls (close button and prompt input)
        overlay.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            const focusables = [overlay.querySelector('.ft-close'), input]
                .filter(el => el && !el.disabled);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
        overlay.querySelector('.ft-line').addEventListener('submit', (e) => {
            e.preventDefault();
            runCommand(input.value);
            input.value = '';
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' && history.length) {
                histIdx = Math.max(0, histIdx - 1);
                input.value = history[histIdx] || '';
                e.preventDefault();
            } else if (e.key === 'ArrowDown' && history.length) {
                histIdx = Math.min(history.length, histIdx + 1);
                input.value = history[histIdx] || '';
                e.preventDefault();
            }
        });
        print('SUSTAINTHEWORLD field terminal');
        print('from bedrock to cloud. type \'help\' to see what\'s down here.');
        print('');
    };

    const open = () => {
        if (!overlay) build();
        lastFocus = document.activeElement;
        overlay.classList.add('open');
        input.focus();
    };
    function close() {
        if (!overlay) return;
        overlay.classList.remove('open');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    const isOpen = () => overlay && overlay.classList.contains('open');

    if (toggleBtn) toggleBtn.addEventListener('click', () => (isOpen() ? close() : open()));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) { close(); return; }
        if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        const typing = t && t !== input && (
            t.tagName === 'TEXTAREA' || t.isContentEditable ||
            (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit)$/.test(t.type))
        );
        if (typing) return;
        e.preventDefault();
        isOpen() ? close() : open();
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
// SHARE HELPERS — let every interactive result leave with the visitor.
// Web Share where available (mobile), graceful fallbacks: images fall back to a
// download, text falls back to the clipboard. Every payload links home.
// ===================================
window.mksShare = (() => {
    const SITE = (location.hostname + location.pathname).replace(/\/+$/, '') || 'moseskolleh.github.io/sustaintheworld';
    const flash = (btn, msg) => {
        if (!btn) return;
        if (!btn.dataset.label) btn.dataset.label = btn.textContent;
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = btn.dataset.label; }, 1700);
    };
    return {
        site: SITE,
        async image(canvas, filename, text) {
            try {
                if (navigator.share && navigator.canShare) {
                    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                    if (blob) {
                        const file = new File([blob], filename, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            try { await navigator.share({ files: [file], text: text || '' }); return; }
                            catch (e) { if (e && e.name === 'AbortError') return; }
                        }
                    }
                }
            } catch (e) { /* fall through to download */ }
            try {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = filename;
                document.body.appendChild(a); a.click(); a.remove();
            } catch (e) { /* ignore */ }
        },
        async copy(str, btn) {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(str);
                    flash(btn, 'Copied ✓');
                    return;
                }
            } catch (e) { /* fall through to legacy path */ }
            try {
                const ta = document.createElement('textarea');
                ta.value = str; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy'); ta.remove();
                flash(btn, 'Copied ✓');
            } catch (e) { flash(btn, 'Copy failed'); }
        }
    };
})();

// ===================================
// THE ASSAY — paste a JD, get a client-side fit grade + evidence map.
// Deterministic keyword/ontology matching over a hand-written evidence set.
// No AI, no model download, nothing leaves the browser — that restraint is
// the argument. Every evidence line is real, drawn from this site.
// ===================================
(() => {
    const input = document.getElementById('assayInput');
    const runBtn = document.getElementById('assayRun');
    const clearBtn = document.getElementById('assayClear');
    const result = document.getElementById('assayResult');
    if (!input || !runBtn || !result) return;
    let lastAssayText = '';

    // Capability areas backed by real, delivered work on this site.
    const STRENGTHS = [
        { label: 'ESG analysis & integration',
          syn: ['esg', 'environmental social', 'environmental, social', 'sustainability analyst', 'sustainability strategy', 'materiality', 'double materiality'],
          ev: ['ESG & climate-risk analyses decision-makers can act on', 'Certified ESG Specialist'] },
        { label: 'Sustainability reporting (CSRD/ESRS & frameworks)',
          syn: ['csrd', 'esrs', 'sustainability report', 'non-financial report', 'disclosure', 'gri', 'sasb', 'ifrs s1', 'ifrs s2', 'tcfd', 'tnfd', 'cdp', 'sbti', 'reporting standard'],
          ev: ['Framed sustainable-AI work against CSRD/ESRS disclosure logic', 'Fluent across IFRS S1&S2, SASB, GRI, TCFD, TNFD, CDP, SBTi'] },
        { label: 'GHG accounting & carbon footprinting',
          syn: ['ghg', 'greenhouse gas', 'scope 1', 'scope 2', 'scope 3', 'carbon accounting', 'carbon footprint', 'emissions inventory', 'ghg protocol', 'life cycle', 'lca'],
          ev: ['GHG accounting across Scope 1–3', 'Mapped generative-AI footprint from Scope 2 electricity to Scope 3 hardware and cooling water', 'Life Cycle Assessment'] },
        { label: 'Climate risk, adaptation & disaster resilience',
          syn: ['climate risk', 'climate adaptation', 'resilience', 'physical risk', 'transition risk', 'disaster risk', 'hazard', 'vulnerability', 'sendai'],
          ev: ['UNDRR: documented 54 global hazard information systems for the Sendai Framework', 'Wuppertal flood-risk & climate-adaptation consultancy', 'Authored the Trinidad & Tobago national risk factsheet'] },
        { label: 'Water resources, hydrogeology & WASH',
          syn: ['water', 'wash', 'hydrogeology', 'groundwater', 'aquifer', 'borehole', 'water resource', 'drinking water', 'hydrology', 'sanitation'],
          ev: ['Delivered 164 water points across Sierra Leone', '70% aquifer strike rate using electrical-resistivity surveys', 'Groundwater potential mapping of the Freetown Complex'] },
        { label: 'GIS & geospatial analysis',
          syn: ['gis', 'qgis', 'arcgis', 'geospatial', 'spatial analysis', 'remote sensing', 'cartography', 'mapping'],
          ev: ['QGIS mapping that struck water 7 in 10', 'Produced groundwater-potential maps that guided drilling'] },
        { label: 'Data analysis & visualization',
          syn: ['python', 'data analysis', 'data analytics', 'pandas', 'sql', 'statistic', 'tableau', 'power bi', 'data visualization', 'data visualisation', 'r programming'],
          ev: ['Python for river-export pollution analysis', 'Tableau & Power BI', 'Google Advanced Data Analytics certificate'] },
        { label: 'Sustainable AI & AI governance',
          syn: ['sustainable ai', 'ai governance', 'responsible ai', 'ai ethics', 'green ai', 'ai sustainability', 'generative ai', 'llm', 'machine learning'],
          ev: ['Sustainable-AI framework & prototype for the Dutch Ministry of Finance (Digital Society School)', 'Built EcoPrompt Coach — energy, water & carbon of LLM queries'] },
        { label: 'Water quality & environmental modeling',
          syn: ['pollution', 'water quality', 'contamination', 'nutrient', 'nitrogen', 'effluent', 'catchment', 'watershed', 'eutrophication'],
          ev: ['MARINA-Multi pollution modeling across 10,226 sub-basins', 'River-export pollution analysis'] },
        { label: 'Stakeholder engagement & facilitation',
          syn: ['stakeholder', 'facilitation', 'workshop', 'engagement', 'cross-functional', 'interdisciplinary', 'capacity building', 'collaboration', 'collaborative'],
          ev: ['Interdisciplinary consultancy for the Municipality of Wuppertal', 'Led drilling crews and community water projects'] },
        { label: 'International & cross-cultural work',
          syn: ['international', 'multicultural', 'cross-cultural', 'multilingual', 'global south', 'developing country', 'developing countries', 'emerging market', 'fieldwork'],
          ev: ['Worked across three continents — Sierra Leone, China, Germany & the Netherlands', 'MOFCOM scholarship in China'] },
        { label: 'Applied research & methodology',
          syn: ['research', 'thesis', 'peer-review', 'methodology', 'literature review', 'academic research', 'msc'],
          ev: ['Dual master’s: Environmental Sciences (Wageningen) and Industrial Engineering (Hunan)', 'Design-research at the Digital Society School'] }
    ];

    // Honest growth edges — flagged if the JD asks for them.
    const GAPS = [
        { syn: ['10+ years', '10 years', '12 years', '15 years', '20 years', 'senior director', 'head of sustainability', 'vice president', 'principal consultant', 'director of'],
          note: 'Seniority: early-career — strongest as a fast-growing analyst/specialist, not a 10+-year lead.' },
        { syn: ['financial model', 'financial modeling', 'financial modelling', 'valuation', 'cfa', 'equity research', 'fp&a', 'p&l ownership'],
          note: 'Financial modeling isn’t the core strength — the numbers here are environmental, not financial.' },
        { syn: ['sphera', 'persefoni', 'workiva', 'enablon', 'novisto', 'watershed platform'],
          note: 'Hasn’t used that specific enterprise platform — but the underlying GHG/ESRS logic transfers directly.' },
        { syn: ['phd required', 'ph.d. required', 'doctorate required', 'phd in', 'ph.d in'],
          note: 'Holds two master’s degrees rather than a PhD.' },
        { syn: ['attorney', 'law degree', 'legal counsel', 'regulatory lawyer', 'bar admission'],
          note: 'Not a legal specialist — fluent in disclosure regulation, but not a lawyer.' }
    ];

    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow a trailing plural so "stakeholders" matches "stakeholder", etc.
    const hit = (text, syns) => syns.some(s => new RegExp('\\b' + esc(s) + '(?:s|es)?\\b', 'i').test(text));
    const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const assay = () => {
        const text = (input.value || '').toLowerCase();
        result.hidden = false;
        if (text.trim().length < 20) {
            result.innerHTML = '<p class="assay-empty">Paste a few lines of the job description and I’ll grade the fit.</p>';
            if (clearBtn) clearBtn.hidden = true;
            return;
        }
        const matched = STRENGTHS.filter(t => hit(text, t.syn));
        const gaps = GAPS.filter(g => hit(text, g.syn));
        const strong = matched.length;

        let grade, cls, blurb;
        if (strong === 0) {
            grade = 'Different field'; cls = 'marginal';
            blurb = 'Nothing here maps to my environmental, data or sustainability evidence — most likely a different field. Happy to be told I’m wrong.';
        } else if (strong >= 3 && gaps.length <= 1) {
            grade = 'High-grade match'; cls = 'high';
            blurb = `This sits squarely in my wheelhouse — ${strong} of your requirement areas map to concrete, delivered work.`;
        } else if (strong >= 2) {
            grade = 'Workable match'; cls = 'workable';
            blurb = `A solid overlap — ${strong} requirement areas map to real evidence${gaps.length ? `, with ${gaps.length} honest gap${gaps.length > 1 ? 's' : ''} flagged below` : ''}.`;
        } else {
            grade = 'Marginal match'; cls = 'marginal';
            blurb = `One clear point of overlap${gaps.length ? ', plus some gaps' : ''} — worth a conversation if the rest is learnable on the job.`;
        }

        let html = `<div class="assay-grade assay-grade-${cls}"><span class="assay-grade-tag">${grade}</span><p>${blurb}</p></div>`;
        if (matched.length) {
            html += '<div class="assay-map"><div class="mono-label assay-map-h">What you asked for → what backs it</div>';
            html += matched.map(t => `<div class="assay-row"><div class="assay-req">${escHtml(t.label)}</div><div class="assay-ev">${t.ev.map(e => `<span>${escHtml(e)}</span>`).join('')}</div></div>`).join('');
            html += '</div>';
        }
        if (gaps.length) {
            html += '<div class="assay-gaps"><div class="mono-label assay-gaps-h">Honest gaps</div><ul>' + gaps.map(g => `<li>${escHtml(g.note)}</li>`).join('') + '</ul></div>';
        }
        if (cls === 'high' || cls === 'workable') {
            const subject = encodeURIComponent(`Fit for your role — ${matched.length} matching areas`);
            const body = encodeURIComponent(`Hi Moses,\n\nI ran your in-browser fit-check against a role and it flagged ${matched.length} matching areas${gaps.length ? ` (and ${gaps.length} gap${gaps.length > 1 ? 's' : ''})` : ''}. I'd like to talk.\n\n`);
            html += `<div class="assay-cta-wrap"><a class="btn btn-primary btn-small" href="mailto:moseskollehsesay@gmail.com?subject=${subject}&body=${body}" data-analytics="assay-contact"><svg class="icon" aria-hidden="true"><use href="#i-paper-plane"></use></svg> This looks like a fit — get in touch</a></div>`;
        }
        // Plain-text version a recruiter can copy into notes or an email.
        let plain = `Moses Kolleh Sesay — fit assessment: ${grade}\n${blurb}\n`;
        matched.forEach(t => { plain += `\n• ${t.label}\n`; t.ev.forEach(e => { plain += `   - ${e}\n`; }); });
        if (gaps.length) { plain += `\nHonest gaps:\n`; gaps.forEach(g => { plain += `• ${g.note}\n`; }); }
        plain += `\n— ${window.mksShare ? window.mksShare.site : 'moseskolleh.github.io/sustaintheworld'}`;
        lastAssayText = plain;
        html += `<div class="assay-copy-wrap"><button type="button" class="btn btn-secondary btn-small assay-copy" data-analytics="assay-copy"><svg class="icon" aria-hidden="true"><use href="#i-copy"></use></svg> Copy this result</button></div>`;
        html += '<p class="assay-note">Deterministic keyword match against a hand-written evidence set — no AI, no data sent anywhere. A starting point for a conversation, not a verdict.</p>';
        result.innerHTML = html;
        if (clearBtn) clearBtn.hidden = false;
        if (typeof window.trackEvent === 'function') window.trackEvent('assay-' + cls);
    };

    runBtn.addEventListener('click', assay);
    result.addEventListener('click', (e) => {
        const b = e.target.closest('.assay-copy');
        if (b && window.mksShare) window.mksShare.copy(lastAssayText, b);
    });
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            result.hidden = true;
            result.innerHTML = '';
            clearBtn.hidden = true;
            input.focus();
        });
    }

    // Instant demo: sample roles inject a realistic JD and grade it.
    const SAMPLES = {
        esg: 'ESG Analyst — support CSRD and ESRS reporting, build our GHG inventory across Scope 1, 2 and 3, run sustainability data analysis, and engage stakeholders across the business. Familiarity with GRI, TCFD and SBTi a plus.',
        climate: 'Climate Risk Consultant — assess physical and transition climate risk, build resilience and adaptation plans, analyse hazard and vulnerability data, and facilitate stakeholder workshops. GIS and scenario analysis welcome.',
        water: 'WASH Programme Officer — manage borehole drilling and groundwater projects, run hydrogeology surveys, produce GIS maps, and coordinate community water delivery in developing countries.'
    };
    document.querySelectorAll('.assay-sample').forEach(b => {
        b.addEventListener('click', () => {
            input.value = SAMPLES[b.getAttribute('data-sample')] || '';
            assay();
            result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });
})();

// ===================================
// ANATOMY OF A PROMPT — one answer, split into Scope 2 / Scope 3 / water,
// each mapped to its ESRS disclosure line. Hand-drawn SVG flow, no library.
// ===================================
(() => {
    const svg = document.getElementById('anatomySvg');
    const sel = document.getElementById('anatomyModel');
    const summary = document.getElementById('anatomySummary');
    const DATA = (typeof window !== 'undefined') ? window.AICarbonData : null;
    if (!svg || !sel || !DATA) return;

    const NS = 'http://www.w3.org/2000/svg';
    const mk = (name, attrs) => {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    };

    const gridSel = document.getElementById('anatomyGrid');
    const TOKENS = 1000;                              // everyday-chat workload
    const PUE = DATA.PUE;
    const WUE = DATA.WUE_PROFILES.avg.wue_L_per_kWh;
    // The roughest term: embodied hardware carbon amortised per query, as
    // gCO2e per Wh of inference. Grid-independent (manufacturing is already
    // spent), so on a clean grid it can exceed operational Scope 2.
    const EMBODIED_G_PER_WH = 0.05;
    const ANSWERS_PER_YEAR = 20 * 220;               // 20 prompts/day × 220 working days
    let scale = 'answer';

    DATA.HOMEPAGE_MODELS.forEach(k => sel.add(new Option(DATA.MODELS[k].label, k)));
    sel.value = DATA.MODELS['gpt-4o'] ? 'gpt-4o' : DATA.HOMEPAGE_MODELS[0];
    if (gridSel) {
        DATA.HOMEPAGE_REGIONS.forEach(k => gridSel.add(new Option(`${DATA.REGIONS[k].label} — ${DATA.REGIONS[k].intensity} gCO₂e/kWh`, k)));
        gridSel.value = 'nl';
    }
    const gridNow = () => (gridSel && DATA.REGIONS[gridSel.value]) || DATA.REGIONS['nl'];

    const compute = (key, grid) => {
        // Split the workload at the reference mix the per-1k benchmarks are
        // calibrated against, so this widget and the full tool agree on what
        // "1000 tokens" costs even though the tool lets you change the split.
        const mix = DATA.TOKEN_ENERGY.referenceMix;
        const infWh = DATA.energyForQuery(DATA.MODELS[key], TOKENS * mix.input, TOKENS * mix.output);
        const wh = infWh * PUE;                                                // facility energy (grid + cooling overhead)
        const kwh = wh / 1000;
        // Embodied hardware scales with the chips' compute, not facility overhead,
        // so Scope 3 uses pre-PUE inference energy (matching the coefficient's basis).
        return { scope2: kwh * grid.intensity, scope3: infWh * EMBODIED_G_PER_WH, water: kwh * WUE * 1000 };
    };
    const fmt = (n) => (n === 0 ? '0' : n >= 1 ? n.toFixed(2) : n >= 0.001 ? n.toFixed(3) : '<0.001');

    const cy = 160, sx = 180, tx = 430, rows = [70, 160, 250];
    const ribbon = (x1, y1, x2, y2, w) => {
        const mx = (x1 + x2) / 2, t = w / 2;
        return `M ${x1} ${y1 - t} C ${mx} ${y1 - t}, ${mx} ${y2 - t}, ${x2} ${y2 - t} L ${x2} ${y2 + t} C ${mx} ${y2 + t}, ${mx} ${y1 + t}, ${x1} ${y1 + t} Z`;
    };

    const cards = [
        { t: 'Grid electricity · Scope 2', esrs: 'ESRS E1-6 · Scope 2 emissions', cls: 'r0' },
        { t: 'Embodied hardware · Scope 3', esrs: 'ESRS E1-6 · Scope 3 (capital goods)', cls: 'r1' },
        { t: 'Cooling water', esrs: 'ESRS E3-4 · Water consumption', cls: 'r2' }
    ];

    // static build
    svg.appendChild(mk('rect', { x: 20, y: cy - 38, width: 160, height: 76, rx: 10, class: 'anatomy-source' }));
    const st = mk('text', { x: 100, y: cy - 4, 'text-anchor': 'middle', class: 'anatomy-source-t' }); st.textContent = 'One AI answer'; svg.appendChild(st);
    const ss = mk('text', { x: 100, y: cy + 15, 'text-anchor': 'middle', class: 'anatomy-source-sub' }); ss.textContent = '~1,000 tokens'; svg.appendChild(ss);
    const ribbons = rows.map((ry, i) => { const p = mk('path', { class: 'anatomy-ribbon ' + cards[i].cls }); svg.appendChild(p); return p; });
    const vals = rows.map((ry, i) => {
        const title = mk('text', { x: tx + 10, y: ry - 14, class: 'anatomy-t-title ' + cards[i].cls }); title.textContent = cards[i].t; svg.appendChild(title);
        const val = mk('text', { x: tx + 10, y: ry + 8, class: 'anatomy-t-val' }); svg.appendChild(val);
        const esrs = mk('text', { x: tx + 10, y: ry + 28, class: 'anatomy-t-esrs' }); esrs.textContent = cards[i].esrs; svg.appendChild(esrs);
        return val;
    });

    const update = () => {
        const grid = gridNow();
        const d = compute(sel.value, grid);
        const carbonMax = Math.max(d.scope2, d.scope3, 0.0001);
        const widths = [8 + (d.scope2 / carbonMax) * 40, 8 + (d.scope3 / carbonMax) * 40, 26];
        rows.forEach((ry, i) => ribbons[i].setAttribute('d', ribbon(sx, cy, tx, ry, widths[i])));
        const yr = scale === 'year';
        const m = yr ? ANSWERS_PER_YEAR : 1;
        const cDiv = yr ? 1000 : 1;                   // g -> kg, mL -> L
        const cu = yr ? 'kg' : 'g', wu = yr ? 'L' : 'mL';
        vals[0].textContent = `${fmt(d.scope2 * m / cDiv)} ${cu} CO₂e`;
        vals[1].textContent = `${fmt(d.scope3 * m / cDiv)} ${cu} CO₂e`;
        vals[2].textContent = `${fmt(d.water * m / cDiv)} ${wu} water`;
        if (summary) {
            const basis = yr ? `at ~${ANSWERS_PER_YEAR.toLocaleString()} answers/analyst-year (20/day × 220 days)` : 'one everyday answer';
            summary.innerHTML = `<strong>${DATA.MODELS[sel.value].label}</strong>, ${basis} on the <strong>${grid.label}</strong> grid: <strong>${fmt(d.scope2 * m / cDiv)} ${cu}</strong> Scope 2, <strong>${fmt(d.scope3 * m / cDiv)} ${cu}</strong> Scope 3, <strong>${fmt(d.water * m / cDiv)} ${wu}</strong> cooling water — three ESRS lines.`;
        }
    };

    update();
    sel.addEventListener('change', update);
    if (gridSel) gridSel.addEventListener('change', update);
    const copyBtn = document.getElementById('anatomyCopy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
        const txt = (summary ? summary.textContent : '') + `\n— Moses Kolleh Sesay · ${window.mksShare ? window.mksShare.site : ''}`;
        if (window.mksShare) window.mksShare.copy(txt, copyBtn);
    });
    document.querySelectorAll('.anatomy-scale-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            scale = btn.getAttribute('data-scale');
            document.querySelectorAll('.anatomy-scale-btn').forEach(b => {
                const on = b === btn;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            update();
        });
    });
})();

// ===================================
// SEVEN IN TEN — the 70% strike rate as a felt human delta
// A 100-dot waffle of boreholes; the slider moves the strike rate from blind
// drilling in hard rock up to the field-proven 70%, flipping dry holes to water.
// ===================================
(() => {
    const waffle = document.getElementById('strikeWaffle');
    const slider = document.getElementById('strikeSlider');
    const counter = document.getElementById('strikeCounter');
    const out = document.getElementById('strikeOut');
    if (!waffle || !slider || !counter) return;

    const N = 100;
    // Deterministic scatter: 37 is coprime with 100, so (k*37)%100 is a fixed
    // permutation of every cell — the same rate always paints the same picture,
    // no Math.random, no fake variation.
    const order = Array.from({ length: N }, (_, k) => (k * 37) % N);

    const cells = [];
    for (let i = 0; i < N; i++) {
        const c = document.createElement('span');
        c.className = 'strike-cell';
        waffle.appendChild(c);
        cells.push(c);
    }

    const render = (rate) => {
        const water = new Set(order.slice(0, rate));
        for (let i = 0; i < N; i++) cells[i].classList.toggle('water', water.has(i));
        const dry = N - rate;
        const moreThanBlind = rate - 30;
        if (out) out.textContent = rate + '%';
        // Announce a meaningful value on the slider itself instead of spamming a
        // live region on every 1% step.
        slider.setAttribute('aria-valuetext', `${rate}% strike rate — ${rate} of 100 boreholes strike water`);
        let msg = `<strong>${rate} of 100</strong> boreholes strike water — <strong>${dry}</strong> come up dry.`;
        if (rate <= 32) {
            msg += ' Blind drilling in hard rock: about 7 in 10 are dry holes a community paid for.';
        } else if (rate >= 68) {
            msg += ` Reading the resistivity curve first: <strong>7 in 10 strike water</strong> — ${moreThanBlind} more communities served per 100 boreholes, same rigs, same budget.`;
        } else {
            msg += ` That's <strong>${moreThanBlind} more</strong> communities with water than blind drilling — same rigs, same budget.`;
        }
        counter.innerHTML = msg;
    };

    let userInteracted = false;
    slider.addEventListener('input', () => { userInteracted = true; render(+slider.value); });
    // Soft snap to the two meaningful anchors on release.
    slider.addEventListener('change', () => {
        const v = +slider.value;
        if (Math.abs(v - 30) <= 3) { slider.value = 30; render(30); }
        else if (Math.abs(v - 70) <= 3) { slider.value = 70; render(70); }
    });
    render(+slider.value);

    // Auto-demo: on first scroll-into-view, sweep 30 -> 70 so every visitor sees
    // the dry holes turn to water and the slider rests on the win. The cell
    // transitions give the staggered fill. Reduced-motion / eco-mode stay at 70.
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && 'IntersectionObserver' in window) {
        let played = false;
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting) && !played && !userInteracted && !document.body.classList.contains('eco-mode')) {
                played = true;
                io.disconnect();
                slider.value = 30; render(30);
                let v = 30;
                const step = () => {
                    if (userInteracted) return;
                    v += 2;
                    if (v >= 70) { slider.value = 70; render(70); return; }
                    slider.value = v; render(v);
                    setTimeout(step, 45);
                };
                setTimeout(step, 400);
            }
        }, { threshold: 0.35 });
        io.observe(document.getElementById('strikeWidget') || waffle);
    }
})();

// ===================================
// YOU DRAW IT — predict AI's hidden energy curve, then reveal the truth
// The NYT "you draw it" mechanic, powered by the shared AI carbon data.
// ===================================
(() => {
    const svg = document.getElementById('ydiSvg');
    const revealBtn = document.getElementById('ydiReveal');
    const resetBtn = document.getElementById('ydiReset');
    const verdictEl = document.getElementById('ydiVerdict');
    const hintEl = document.getElementById('ydiHint');
    const tableEl = document.getElementById('ydiTable');
    const shareBtn = document.getElementById('ydiShare');
    const cardCanvas = document.getElementById('ydiCardCanvas');
    const legendEl = document.getElementById('ydiLegend');
    const DATA = (typeof window !== 'undefined') ? window.AICarbonData : null;
    if (!svg || !revealBtn || !DATA) return;
    let cardData = null;

    const NS = 'http://www.w3.org/2000/svg';
    const mk = (name, attrs) => {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    };

    const KEYS = ['llama-32-1b', 'gpt-4-1-nano', 'gpt-4o-mini', 'gemini-15-flash', 'gemini-20-flash', 'llama-33-70b', 'claude-37-sonnet', 'gpt-4o', 'gemini-15-pro', 'deepseek-r1'];
    const SHORT = { 'llama-32-1b': '1B', 'gpt-4-1-nano': 'nano', 'gpt-4o-mini': '4o-mini', 'gemini-15-flash': '1.5 Flash', 'gemini-20-flash': '2.0 Flash', 'llama-33-70b': '70B', 'claude-37-sonnet': 'Sonnet', 'gpt-4o': 'GPT-4o', 'gemini-15-pro': '1.5 Pro', 'deepseek-r1': 'R1' };
    const models = KEYS.filter(k => DATA.MODELS[k]).map(k => ({ key: k, label: DATA.MODELS[k].label, short: SHORT[k] || DATA.MODELS[k].label, wh: DATA.MODELS[k].energyPer1kTokens_Wh }));
    const n = models.length;
    if (n < 5) return;
    const KNOWN = 3;

    const W = 640, H = 380;
    const M = { l: 58, r: 18, t: 26, b: 86 };
    const plotW = W - M.l - M.r, plotH = H - M.t - M.b;
    const yMax = 1.6;
    const xAt = (i) => M.l + (i / (n - 1)) * plotW;
    const yAt = (wh) => M.t + (1 - Math.min(wh, yMax) / yMax) * plotH;
    const whAtY = (y) => Math.max(0, Math.min(yMax, (1 - (y - M.t) / plotH) * yMax));

    const guess = models.map((m, i) => (i < KNOWN ? m.wh : models[KNOWN - 1].wh));
    let revealed = false;
    let interacted = false;

    // --- static layer: gridlines + y labels ---
    [0, 0.5, 1.0, 1.5].forEach(v => {
        const y = yAt(v);
        svg.appendChild(mk('line', { x1: M.l, y1: y, x2: W - M.r, y2: y, class: 'ydi-grid' }));
        const t = mk('text', { x: M.l - 10, y: y + 4, class: 'ydi-axis-label', 'text-anchor': 'end' });
        t.textContent = v.toFixed(1);
        svg.appendChild(t);
    });
    const yTitle = mk('text', { x: M.l - 46, y: M.t - 10, class: 'ydi-axis-title', 'text-anchor': 'start' });
    yTitle.textContent = 'Wh / answer';
    svg.appendChild(yTitle);

    // x labels
    models.forEach((m, i) => {
        const x = xAt(i);
        const t = mk('text', { x: x, y: H - M.b + 20, class: 'ydi-xlabel' + (i < KNOWN ? ' known' : ''), 'text-anchor': 'end', transform: `rotate(-40 ${x} ${H - M.b + 20})` });
        t.textContent = m.short;
        svg.appendChild(t);
    });

    // divider + region labels
    const dividerX = (xAt(KNOWN - 1) + xAt(KNOWN)) / 2;
    svg.appendChild(mk('line', { x1: dividerX, y1: M.t, x2: dividerX, y2: M.t + plotH, class: 'ydi-divider' }));
    const pLabel = mk('text', { x: xAt(n - 1), y: M.t - 10, class: 'ydi-region-label predict', 'text-anchor': 'end' });
    pLabel.textContent = 'you predict →';
    svg.appendChild(pLabel);

    // known line + dots
    const knownPts = models.slice(0, KNOWN).map((m, i) => `${xAt(i)},${yAt(m.wh)}`).join(' ');
    svg.appendChild(mk('polyline', { points: knownPts, class: 'ydi-known-line' }));
    models.slice(0, KNOWN).forEach((m, i) => svg.appendChild(mk('circle', { cx: xAt(i), cy: yAt(m.wh), r: 4, class: 'ydi-known-dot' })));

    // "typical intuition" line + the measured line (both revealed later)
    const intuitLine = mk('polyline', { points: '', class: 'ydi-intuit-line' });
    svg.appendChild(intuitLine);
    const realLine = mk('polyline', { points: '', class: 'ydi-real-line' });
    svg.appendChild(realLine);
    const realDots = [];

    // guess line + draggable dots
    const guessLine = mk('polyline', { points: '', class: 'ydi-guess-line' });
    svg.appendChild(guessLine);
    const guessDots = models.map((m, i) => {
        if (i < KNOWN) return null;
        const c = mk('circle', { cx: xAt(i), cy: yAt(guess[i]), r: 5, class: 'ydi-guess-dot' });
        svg.appendChild(c);
        return c;
    });

    const drawGuess = () => {
        const pts = [`${xAt(KNOWN - 1)},${yAt(models[KNOWN - 1].wh)}`];
        for (let i = KNOWN; i < n; i++) pts.push(`${xAt(i)},${yAt(guess[i])}`);
        guessLine.setAttribute('points', pts.join(' '));
        for (let i = KNOWN; i < n; i++) guessDots[i].setAttribute('cy', yAt(guess[i]));
    };
    drawGuess();
    // Pulse the first predict dot so people know the curve is grabbable.
    if (guessDots[KNOWN]) guessDots[KNOWN].classList.add('ydi-dot-pulse');
    // Device-aware hint: touch users tap or drag; pointer users drag.
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (hintEl && coarse) hintEl.textContent = 'tap or drag across to draw';

    // --- interaction (pointer + keyboard) ---
    let cursor = KNOWN;
    const cursorRing = mk('circle', { class: 'ydi-cursor', r: 9, cx: xAt(cursor), cy: yAt(guess[cursor]) });
    svg.appendChild(cursorRing);
    const hit = mk('rect', { x: M.l, y: M.t, width: plotW, height: plotH, class: 'ydi-hit', fill: 'transparent' });
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'application');
    hit.setAttribute('aria-label', 'Draw your prediction: left/right arrows move between models, up/down arrows raise or lower the guessed energy, Enter reveals the real curve. The Reveal button and the data table below are equivalent.');
    svg.appendChild(hit);

    const markInteracted = () => {
        if (interacted) return;
        interacted = true;
        if (hintEl) hintEl.style.opacity = '0';
        if (guessDots[KNOWN]) guessDots[KNOWN].classList.remove('ydi-dot-pulse');
    };
    const toLocal = (evt) => {
        const rect = svg.getBoundingClientRect();
        return { x: (evt.clientX - rect.left) / rect.width * W, y: (evt.clientY - rect.top) / rect.height * H };
    };
    const paint = (p) => {
        if (revealed) return;
        let i = Math.round((p.x - M.l) / plotW * (n - 1));
        i = Math.max(KNOWN, Math.min(n - 1, i));
        guess[i] = whAtY(p.y);
        cursor = i;
        drawGuess();
        markInteracted();
    };
    let dragging = false;
    hit.addEventListener('pointerdown', (e) => {
        dragging = true;
        if (hit.setPointerCapture) { try { hit.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
        paint(toLocal(e));
        e.preventDefault();
    });
    hit.addEventListener('pointermove', (e) => { if (dragging) { paint(toLocal(e)); e.preventDefault(); } });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointercancel', () => { dragging = false; });

    const moveCursor = () => {
        cursorRing.setAttribute('cx', xAt(cursor));
        cursorRing.setAttribute('cy', yAt(guess[cursor]));
        hit.setAttribute('aria-valuetext', `${models[cursor].short}: your guess ${guess[cursor].toFixed(2)} Wh per answer`);
    };
    hit.addEventListener('focus', () => { svg.classList.add('ydi-kbd'); moveCursor(); });
    hit.addEventListener('blur', () => { svg.classList.remove('ydi-kbd'); });
    hit.addEventListener('keydown', (e) => {
        if (revealed) return;
        const step = yMax / 24;
        const k = e.key;
        if (k === 'ArrowLeft') cursor = Math.max(KNOWN, cursor - 1);
        else if (k === 'ArrowRight') cursor = Math.min(n - 1, cursor + 1);
        else if (k === 'ArrowUp') guess[cursor] = Math.min(yMax, guess[cursor] + step);
        else if (k === 'ArrowDown') guess[cursor] = Math.max(0, guess[cursor] - step);
        else if (k === 'Enter' || k === ' ') { doReveal(); e.preventDefault(); return; }
        else return;
        e.preventDefault();
        markInteracted();
        drawGuess();
        moveCursor();
    });

    // --- reveal ---
    const nudge = () => {
        if (hintEl) {
            hintEl.style.opacity = '';
            hintEl.classList.add('ydi-hint-nudge');
            setTimeout(() => hintEl.classList.remove('ydi-hint-nudge'), 1200);
        }
        if (guessDots[KNOWN]) guessDots[KNOWN].classList.add('ydi-dot-pulse');
    };

    const doReveal = () => {
        if (revealed) return;
        if (!interacted) { nudge(); return; }   // draw first — don't grade a guess never made
        revealed = true;
        const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        realLine.setAttribute('points', models.map((m, i) => `${xAt(i)},${yAt(m.wh)}`).join(' '));
        svg.classList.add('revealed');
        // Draw the measured line in, left to right.
        if (!reduce && realLine.getTotalLength) {
            const len = realLine.getTotalLength();
            realLine.style.strokeDasharray = String(len);
            realLine.style.strokeDashoffset = String(len);
            realLine.getBoundingClientRect(); // force reflow before transitioning
            realLine.style.transition = 'stroke-dashoffset 0.85s ease';
            realLine.style.strokeDashoffset = '0';
        }
        models.forEach((m, i) => {
            const c = mk('circle', { cx: xAt(i), cy: yAt(m.wh), r: 4, class: 'ydi-real-dot' });
            svg.appendChild(c);
            realDots.push(c);
        });
        if (hintEl) hintEl.style.opacity = '0';
        if (resetBtn) resetBtn.hidden = false;
        revealBtn.hidden = true;

        const gWh = Math.max(guess[n - 1], 0);
        const rWh = models[n - 1].wh;
        const tiny = models[0].wh;
        const factorFrontier = Math.round(rWh / tiny);
        let msg;
        if (gWh < 0.02) {
            msg = `You put the biggest model near zero — it's actually ${rWh.toFixed(2)} Wh, a dramatic underestimate of the frontier.`;
        } else if (rWh / gWh >= 1.3) {
            msg = `You put the biggest model at ~${gWh.toFixed(2)} Wh. It's actually ${rWh.toFixed(2)} Wh — you underestimated the frontier by ${(rWh / gWh).toFixed(1)}×.`;
        } else if (gWh / rWh >= 1.3) {
            msg = `You had the frontier at ~${gWh.toFixed(2)} Wh; it's actually ${rWh.toFixed(2)} Wh — an overestimate of ${(gWh / rWh).toFixed(1)}×.`;
        } else {
            msg = `Close — you had the frontier near ${gWh.toFixed(2)} Wh; it's ${rWh.toFixed(2)} Wh.`;
        }
        msg += ` A 1B model answers for ${tiny.toFixed(3)} Wh — the frontier reasoning model burns roughly ${factorFrontier}× more for the same 1,000-token answer. That gap is exactly what the tools people prompt with never show them.`;
        // Shape grade: did they capture the frontier spike, not just a magnitude?
        let guessPeak = KNOWN;
        for (let i = KNOWN + 1; i < n; i++) if (guess[i] > guess[guessPeak]) guessPeak = i;
        const spread = guess[n - 1] - guess[KNOWN];
        let shape;
        if (guessPeak === n - 1 && rWh / Math.max(gWh, 0.001) < 1.6) shape = 'You nailed the shape — you saw the frontier spike.';
        else if (guessPeak === n - 1) shape = 'You saw the spike, but under-scaled how steep it gets.';
        else if (spread < 0.1) shape = 'You drew it nearly flat — the real curve hides a cliff at the frontier.';
        else shape = 'You underestimated the frontier — the reasoning model is the outlier.';
        if (verdictEl) { verdictEl.innerHTML = `<span class="ydi-shape">${shape}</span> ${msg}`; verdictEl.hidden = false; }
        cardData = { shape: shape, factor: factorFrontier };
        // Third line: what people typically expect — a near-linear ramp that
        // misses the reasoning spike, reframing the miss as the industry's.
        const intuitEnd = 0.55;
        intuitLine.setAttribute('points', models.map((m, i) => `${xAt(i)},${yAt(tiny + (i / (n - 1)) * (intuitEnd - tiny))}`).join(' '));
        // Callout on the frontier spike.
        const callout = mk('text', { x: xAt(n - 1) - 8, y: yAt(rWh) - 12, class: 'ydi-callout', 'text-anchor': 'end' });
        callout.textContent = `R1 · ~${factorFrontier}× a 1B model`;
        svg.appendChild(callout);
        realDots.push(callout);
        if (legendEl) legendEl.hidden = false;
        if (shareBtn) shareBtn.hidden = false;
    };
    revealBtn.addEventListener('click', doReveal);

    // Shareable result card (dark, on-brand) — reuses the canvas-PNG pattern.
    const wrapText = (ctx, text, maxWidth) => {
        const words = text.split(' ');
        const out = [];
        let line = '';
        words.forEach(w => {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = w; }
            else line = test;
        });
        if (line) out.push(line);
        return out;
    };
    const drawCard = () => {
        if (!cardCanvas || !cardCanvas.getContext || !cardData) return;
        const scale = 2, W = 460, padX = 32, cw = W - padX * 2;
        let ctx = cardCanvas.getContext('2d');
        if (!ctx) return;
        ctx.font = "600 19px 'Space Grotesk', system-ui, sans-serif";
        const shapeLines = wrapText(ctx, cardData.shape, cw);
        ctx.font = "400 16px 'Inter', system-ui, sans-serif";
        const factorText = `The frontier reasoning model burns about ${cardData.factor}× more energy per answer than a 1-billion-parameter model.`;
        const factorLines = wrapText(ctx, factorText, cw);
        const headerH = 78;
        const H = headerH + 26 + shapeLines.length * 26 + 14 + factorLines.length * 23 + 66;
        cardCanvas.width = W * scale; cardCanvas.height = H * scale;
        ctx = cardCanvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = '#0b1705'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#7CFC00'; ctx.font = "700 24px 'Space Grotesk', system-ui, sans-serif";
        ctx.fillText("AI's Hidden Curve", padX, 40);
        ctx.fillStyle = '#9fdf7a'; ctx.font = "400 13px 'IBM Plex Mono', monospace";
        ctx.fillText('I guessed what one AI answer really costs', padX, 62);
        let y = headerH + 22;
        ctx.fillStyle = '#eaffe0'; ctx.font = "600 19px 'Space Grotesk', system-ui, sans-serif";
        shapeLines.forEach(l => { ctx.fillText(l, padX, y); y += 26; });
        y += 12;
        ctx.fillStyle = '#cfe8c0'; ctx.font = "400 16px 'Inter', system-ui, sans-serif";
        factorLines.forEach(l => { ctx.fillText(l, padX, y); y += 23; });
        y += 24;
        ctx.fillStyle = '#7CFC00'; ctx.font = "600 15px 'Space Grotesk', system-ui, sans-serif";
        ctx.fillText('Moses Kolleh Sesay', padX, y);
        ctx.fillStyle = '#88a878'; ctx.font = "400 12px 'IBM Plex Mono', monospace";
        ctx.fillText(window.mksShare ? window.mksShare.site : 'moseskolleh.github.io/sustaintheworld', padX, y + 18);
    };
    if (shareBtn && cardCanvas) {
        shareBtn.addEventListener('click', () => {
            drawCard();
            const text = `${cardData ? cardData.shape : ''} I tried to guess what one AI answer costs. ${window.mksShare ? window.mksShare.site : ''}`;
            if (window.mksShare) window.mksShare.image(cardCanvas, 'ai-hidden-curve.png', text);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            revealed = false;
            svg.classList.remove('revealed');
            realLine.setAttribute('points', '');
            realLine.style.strokeDasharray = '';
            realLine.style.strokeDashoffset = '';
            realLine.style.transition = '';
            intuitLine.setAttribute('points', '');
            if (legendEl) legendEl.hidden = true;
            realDots.forEach(d => d.remove());
            realDots.length = 0;
            for (let i = KNOWN; i < n; i++) guess[i] = models[KNOWN - 1].wh;
            drawGuess();
            if (verdictEl) { verdictEl.hidden = true; verdictEl.textContent = ''; }
            resetBtn.hidden = true;
            revealBtn.hidden = false;
            if (shareBtn) shareBtn.hidden = true;
            interacted = false;
            if (hintEl) hintEl.style.opacity = '';
            if (guessDots[KNOWN]) guessDots[KNOWN].classList.add('ydi-dot-pulse');
        });
    }

    // --- accessible, non-visual data table ---
    if (tableEl) {
        const rows = models.map(m => `<tr><td>${m.label}</td><td>${m.wh} Wh</td></tr>`).join('');
        tableEl.innerHTML = `<table><caption>Measured energy per 1,000-token answer by model (order-of-magnitude estimates)</caption><thead><tr><th>Model</th><th>Wh per answer</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
})();

// ===================================
// THE RECEIPT — this page prints its own itemised carbon bill
// Reads the same Resource Timing data as the footer badge, groups it by asset
// class, and renders a thermal-receipt you can save as a PNG. Pure vanilla:
// the PNG is drawn on a <canvas>, no library, no gigabyte of anything.
// ===================================
(() => {
    const btn = document.getElementById('receiptBtn');
    const panel = document.getElementById('receiptPanel');
    const body = document.getElementById('receiptBody');
    const dlBtn = document.getElementById('receiptDownload');
    const canvas = document.getElementById('receiptCanvas');
    if (!btn || !panel || !body) return;

    const G_CO2_PER_MB = 0.36;
    const MEDIAN_MB = 2.5;
    const pageOrigin = location.origin;
    const urlText = (location.hostname + location.pathname).replace(/\/+$/, '') || 'moseskolleh.github.io/sustaintheworld';
    let lastReceiptG = 0;

    const bytesOf = (r) => {
        if (r.transferSize && r.transferSize > 0) return r.transferSize;
        if (r.encodedBodySize && r.encodedBodySize > 0) return r.encodedBodySize;
        return 0;
    };

    const classify = (r) => {
        const t = r.initiatorType;
        const n = (r.name || '').toLowerCase();
        if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(n)) return 'Fonts';
        if (t === 'img' || /\.(webp|png|jpe?g|gif|svg|avif)(\?|$)/.test(n)) return 'Images';
        if (t === 'script' || /\.js(\?|$)/.test(n)) return 'Scripts';
        if (t === 'link' || t === 'css' || /\.css(\?|$)/.test(n)) return 'Styles';
        return 'Other';
    };

    const ORDER = ['HTML', 'Styles', 'Scripts', 'Fonts', 'Images', 'Other'];

    const gather = () => {
        const g = { HTML: 0, Styles: 0, Scripts: 0, Fonts: 0, Images: 0, Other: 0 };
        let unmeasured = 0;
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) g.HTML += bytesOf(nav);
            performance.getEntriesByType('resource').forEach(r => {
                const b = bytesOf(r);
                if (b === 0) {
                    if (r.name && r.name.indexOf(pageOrigin) !== 0) unmeasured++;
                    return;
                }
                g[classify(r)] += b;
            });
        } catch (e) { /* older browsers: receipt stays empty */ }
        return { g, unmeasured };
    };

    const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB');
    const fmtG = (grams) => (grams >= 1 ? grams.toFixed(2) : grams.toFixed(3)) + ' g';

    const buildLines = () => {
        const { g, unmeasured } = gather();
        let total = 0;
        ORDER.forEach(k => { total += g[k]; });
        const totalMb = total / 1048576;
        const totalG = totalMb * G_CO2_PER_MB;
        lastReceiptG = totalG;
        const dt = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}  ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

        const lines = [];
        lines.push({ t: 'c', s: 'MKS · SUSTAINTHEWORLD', b: true });
        lines.push({ t: 'c', s: 'page-load carbon receipt' });
        lines.push({ t: 'c', s: stamp, dim: true });
        lines.push({ t: 'd' });
        ORDER.forEach(k => {
            if (g[k] > 0) {
                const grams = (g[k] / 1048576) * G_CO2_PER_MB;
                lines.push({ t: 'r', l: k, r: `${fmtSize(g[k])}   ${fmtG(grams)}` });
            }
        });
        lines.push({ t: 'd' });
        lines.push({ t: 'r', l: 'TOTAL', r: `${fmtSize(total)}   ${fmtG(totalG)}`, b: true });
        lines.push({ t: 'c', s: 'CO₂e · global avg grid', dim: true });
        lines.push({ t: 'd' });
        lines.push({ t: 'r', l: 'Median web page', r: `${MEDIAN_MB.toFixed(2)} MB` });
        if (totalMb < MEDIAN_MB) {
            lines.push({ t: 'c', s: `— you're ${Math.round((1 - totalMb / MEDIAN_MB) * 100)}% lighter —` });
        }
        lines.push({ t: 'r', l: 'Text-only report', r: '8 KB' });
        if (unmeasured) {
            lines.push({ t: 'c', s: `* ${unmeasured} third-party file${unmeasured > 1 ? 's' : ''} not counted`, dim: true });
        }
        lines.push({ t: 'd' });
        lines.push({ t: 'c', s: 'browsed lightly — say hello' });
        lines.push({ t: 'd' });
        lines.push({ t: 'c', s: 'MOSES KOLLEH SESAY', b: true });
        lines.push({ t: 'c', s: urlText, dim: true });
        lines.push({ t: 'c', s: 'climate · ESG · sustainable AI' });
        lines.push({ t: 'c', s: '||‖|‖||‖|||‖|‖||‖|||', mono: true });
        return lines;
    };

    const renderDOM = (lines) => {
        body.innerHTML = '';
        lines.forEach(ln => {
            let el;
            if (ln.t === 'd') {
                el = document.createElement('div');
                el.className = 'receipt-divider';
            } else if (ln.t === 'c') {
                el = document.createElement('div');
                el.className = 'receipt-center' + (ln.b ? ' receipt-strong' : '') + (ln.dim ? ' receipt-dim' : '') + (ln.mono ? ' receipt-barcode' : '');
                el.textContent = ln.s;
            } else {
                el = document.createElement('div');
                el.className = 'receipt-row' + (ln.b ? ' receipt-strong' : '');
                const l = document.createElement('span'); l.textContent = ln.l;
                const r = document.createElement('span'); r.textContent = ln.r;
                el.appendChild(l); el.appendChild(r);
            }
            body.appendChild(el);
        });
    };

    const drawCanvas = (lines) => {
        if (!canvas || !canvas.getContext) return;
        const scale = 2, W = 340, padX = 22, padY = 22, lh = 22;
        const H = padY * 2 + lines.length * lh;
        canvas.width = W * scale;
        canvas.height = H * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(scale, scale);
        ctx.fillStyle = '#f5f3ea';
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'middle';
        let y = padY + lh / 2;
        lines.forEach(ln => {
            ctx.fillStyle = ln.dim ? '#6b665a' : '#1a1a1a';
            ctx.font = `${ln.b ? '700' : '400'} 13px 'IBM Plex Mono', ui-monospace, monospace`;
            if (ln.t === 'd') {
                ctx.strokeStyle = '#b7b1a1';
                ctx.setLineDash([2, 3]);
                ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
                ctx.setLineDash([]);
            } else if (ln.t === 'c') {
                ctx.textAlign = 'center';
                ctx.fillText(ln.s, W / 2, y);
            } else {
                ctx.textAlign = 'left';
                ctx.fillText(ln.l, padX, y);
                ctx.textAlign = 'right';
                ctx.fillText(ln.r, W - padX, y);
            }
            y += lh;
        });
    };

    let built = false;
    const build = () => {
        const lines = buildLines();
        renderDOM(lines);
        drawCanvas(lines);
        built = true;
    };

    btn.addEventListener('click', () => {
        const open = panel.hasAttribute('hidden');
        if (open) build();
        panel.toggleAttribute('hidden', !open);
        btn.setAttribute('aria-expanded', String(open));
        if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    if (dlBtn && canvas) {
        dlBtn.addEventListener('click', () => {
            if (!built) build();
            const fn = 'carbon-receipt-' + lastReceiptG.toFixed(3).replace('.', '_') + 'g.png';
            const msg = `This whole climate portfolio cost ${lastReceiptG.toFixed(2)} g CO₂e to view — ${window.mksShare.site}`;
            if (window.mksShare) window.mksShare.image(canvas, fn, msg);
        });
    }
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
// FIELD DISPATCH — the spoken page
// ===================================
// Two voices for the same words, and the choice is the point.
//
//   browser voice — window.speechSynthesis. Zero bytes over the wire.
//   Moses         — narration rendered ahead of time, fetched only when
//                   asked for, labelled with exactly what it weighs.
//
// The recorded option stays hidden until assets/audio/voice-manifest.json
// exists, so this works the moment it ships and gets richer after the first
// `npm run voice`. Nothing here ever autoplays, in any mode.
(() => {
    const SCRIPTS = (window.VoiceScripts && window.VoiceScripts.SCRIPTS) || [];
    if (!SCRIPTS.length) return;

    const synth = window.speechSynthesis;
    const canSynth = typeof synth !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
    if (!canSynth && typeof window.Audio !== 'function') return;

    let manifest = null;       // null until we know whether narration exists
    let manifestTried = false;
    let mode = 'synth';        // 'synth' | 'human'
    let rate = 1;
    let current = null;        // { id, sentences, index }
    let audioEl = null;
    let keepAlive = null;

    // Distinguishes "the visitor picked a voice" from "nobody has chosen yet".
    // Only an explicit click is remembered, so the default below can change
    // without overriding someone's stated preference.
    let modeChosen = false;

    const savedMode = safeStorage.local.get('mks-voice-mode');
    if (savedMode === 'human' || savedMode === 'synth') { mode = savedMode; modeChosen = true; }
    const savedRate = parseFloat(safeStorage.local.get('mks-voice-rate'));
    if (savedRate >= 0.5 && savedRate <= 2) rate = savedRate;

    // Sentence splitting lives with the scripts themselves — see
    // voice-scripts.js for why it is more careful than a split on ".".
    const splitSentences = window.VoiceScripts.splitSentences;

    // ---------------------------------------------------------------
    // Voice choice. Offline voices are strongly preferred: Chrome's default
    // network voices round-trip audio through Google's servers, which would
    // quietly make the "0.00 g" claim false. When only a network voice is
    // available the badge says so rather than printing a number the page
    // cannot stand behind.
    // ---------------------------------------------------------------
    let chosenVoice = null;
    let voiceIsLocal = false;

    const pickVoice = () => {
        if (!canSynth) return;
        const voices = synth.getVoices() || [];
        if (!voices.length) { updateAvailability(); return; }
        const english = voices.filter(v => /^en(-|$)/i.test(v.lang || ''));
        const pool = english.length ? english : voices;
        const local = pool.filter(v => v.localService);
        const ranked = (local.length ? local : pool).slice().sort((a, b) => {
            const score = v => (/GB|IE|ZA|NG/i.test(v.lang || '') ? 0 : 1);
            return score(a) - score(b);
        });
        chosenVoice = ranked[0] || null;
        voiceIsLocal = !!(chosenVoice && chosenVoice.localService);
        updateAvailability();
    };

    // A speech engine that reports no voices — headless browsers, and Linux
    // builds without speech-dispatcher installed — accepts an utterance and
    // then silently drops it. Rather than shipping a button that blinks and
    // does nothing, the controls stay out of the page until there is either a
    // usable voice or a recorded track to fall back on.
    const canSpeak = () => !!(canSynth && (synth.getVoices() || []).length);

    function updateAvailability() {
        const usable = canSpeak() || !!manifest;
        document.querySelectorAll('.listen-wrap').forEach(w => { w.hidden = !usable; });
        if (!usable && current) stop();
    }

    // Voices arrive asynchronously in most browsers, and in Chrome the first
    // getVoices() is routinely empty. Wiring happens at the end of this module
    // instead of here, once the controls whose labels depend on the answer
    // actually exist.

    // ---------------------------------------------------------------
    // The manifest records what each recorded track actually weighs.
    // Fetched once, on demand, and only if a visitor reaches for it.
    // ---------------------------------------------------------------
    const loadManifest = async () => {
        if (manifestTried) return manifest;
        manifestTried = true;
        try {
            const res = await fetch('assets/audio/voice-manifest.json', { cache: 'force-cache' });
            if (!res.ok) return null;
            const data = await res.json();
            manifest = (data && data.tracks && Object.keys(data.tracks).length) ? data : null;
        } catch (e) {
            manifest = null; // narration not generated yet — the synth path still works
        }
        return manifest;
    };

    const trackFor = id => (manifest && manifest.tracks && manifest.tracks[id]) || null;

    // ---------------------------------------------------------------
    // What the numbers mean.
    //
    // The Sustainable Web Design model converts *transferred bytes* into
    // grams of CO₂e. That is the only thing it converts. It does not include
    // the energy your device spends decoding audio, driving a speaker, or —
    // for the browser voice — synthesising speech in the first place.
    //
    // The old label read "0.00 g" for the browser voice, which claimed the
    // listening was free. It is not free; it is free *of network transfer*.
    // Every figure here now says which of the two it is.
    // ---------------------------------------------------------------
    const TRANSFER_NOTE =
        'Estimated network-transfer emissions only (Sustainable Web Design model: 0.36 g CO₂e per MB). ' +
        'The energy your device spends synthesising, decoding and playing the audio is real and is not included.';

    const weightLabel = (id) => {
        if (mode === 'human') {
            const t = trackFor(id);
            if (!t) return 'not recorded yet';
            return `≈${t.grams.toFixed(2)} g transfer · ${Math.round(t.bytes / 1024)} KB`;
        }
        // A local (offline) voice moves no bytes. A network voice — Chrome's
        // default on some platforms — round-trips audio through a server, and
        // the page cannot see how much, so it must not print a figure.
        return voiceIsLocal ? '0 KB transferred' : 'streamed by your browser · size unknown';
    };

    const refreshCosts = () => {
        document.querySelectorAll('.listen-wrap').forEach(w => {
            const cost = w.querySelector('.listen-cost');
            if (!cost) return;
            cost.textContent = weightLabel(w.dataset.voiceId);
            cost.title = TRANSFER_NOTE;
        });
        if (el.weight) el.weight.title = TRANSFER_NOTE;
        refreshVoiceNote();
    };

    // Who is actually reading, in the player's own words. The recorded option
    // used to be labelled "Moses", which read as "this is his voice". It is a
    // stock synthetic voice from a TTS library; the manifest records which
    // one, and the page says so rather than implying otherwise.
    const refreshVoiceNote = () => {
        if (!el.voiceNote) return;
        if (mode === 'human' && manifest) {
            const title = manifest.voiceTitle || 'recorded narration';
            const synthetic = manifest.voiceKind !== 'human';
            el.voiceNote.textContent = synthetic
                ? `“${title}” — a synthetic voice${manifest.voiceProvider ? ` from ${manifest.voiceProvider}` : ''}, not a recording of Moses.`
                : `Read by ${title}.`;
            el.voiceNote.hidden = false;
            return;
        }
        if (mode === 'synth') {
            el.voiceNote.textContent = voiceIsLocal
                ? 'Your browser\'s own voice, running on your device — nothing crosses the network.'
                : 'Your browser\'s voice. This one is served over the network, so it is not transfer-free.';
            el.voiceNote.hidden = false;
            return;
        }
        el.voiceNote.hidden = true;
    };

    // ---------------------------------------------------------------
    // The dispatch bar
    // ---------------------------------------------------------------
    const bar = document.createElement('div');
    bar.className = 'dispatch-bar';
    bar.id = 'dispatchBar';
    bar.hidden = true;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Narration player');
    bar.innerHTML = `
        <div class="dispatch-row">
            <button class="dispatch-play" type="button" aria-label="Pause narration">
                <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-pause"></use></svg>
            </button>
            <div class="dispatch-info">
                <span class="dispatch-title mono-label"></span>
                <p class="dispatch-caption" aria-live="polite"></p>
            </div>
            <button class="dispatch-rate mono-label" type="button" aria-label="Playback speed">1&times;</button>
            <button class="dispatch-close" type="button" aria-label="Stop narration">&times;</button>
        </div>
        <div class="dispatch-progress" aria-hidden="true"><span></span></div>
        <div class="dispatch-foot">
            <div class="dispatch-voices" role="group" aria-label="Choose a voice">
                <button type="button" data-mode="synth" aria-pressed="true">browser voice</button>
                <button type="button" data-mode="human" aria-pressed="false" hidden>recorded</button>
            </div>
            <span class="dispatch-weight mono-label"></span>
        </div>
        <p class="dispatch-voice-note" hidden></p>`;

    const el = {
        play: bar.querySelector('.dispatch-play'),
        title: bar.querySelector('.dispatch-title'),
        caption: bar.querySelector('.dispatch-caption'),
        rate: bar.querySelector('.dispatch-rate'),
        close: bar.querySelector('.dispatch-close'),
        progress: bar.querySelector('.dispatch-progress span'),
        weight: bar.querySelector('.dispatch-weight'),
        voiceNote: bar.querySelector('.dispatch-voice-note'),
        modes: Array.prototype.slice.call(bar.querySelectorAll('.dispatch-voices button'))
    };

    const setIcon = (name) => {
        el.play.innerHTML = `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
        el.play.setAttribute('aria-label', name === 'pause' ? 'Pause narration' : 'Resume narration');
    };

    const setProgress = (frac) => {
        el.progress.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    };

    const syncModeButtons = () => {
        el.modes.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    };

    // ---------------------------------------------------------------
    // Playback — one engine per mode, one shared surface
    // ---------------------------------------------------------------
    const stopKeepAlive = () => { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } };

    // The floating theme and scroll-top buttons are fixed to the same corner
    // and outrank the player on z-index. On narrow screens, where the player
    // spans the full width, they get lifted clear of it instead of sitting
    // on top of the close button.
    const showBar = (visible) => {
        bar.hidden = !visible;
        document.body.classList.toggle('dispatch-open', visible);
    };

    const clearPlayingButtons = () => {
        document.querySelectorAll('.listen-btn.is-playing').forEach(b => {
            b.classList.remove('is-playing');
            b.setAttribute('aria-pressed', 'false');
        });
    };

    // The script a failed attempt was for, so the player's play button can
    // become a retry rather than doing nothing.
    let retryScript = null;

    const stop = () => {
        stopKeepAlive();
        if (canSynth) synth.cancel();
        if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); audioEl = null; }
        current = null;
        retryScript = null;
        bar.classList.remove('dispatch-failed');
        showBar(false);
        setProgress(0);
        clearPlayingButtons();
    };

    // Neither engine could produce sound.
    //
    // The old behaviour was to switch to 'synth' and call runSynth() no
    // matter what. Where no speech engine exists — headless browsers, Linux
    // without speech-dispatcher, browsers with speech disabled — that left a
    // player showing a pause icon over silence, with no way back and no
    // explanation. Now the player stops, says which engine failed, and turns
    // its play button into a retry.
    const failPlayback = (script, message) => {
        stopKeepAlive();
        if (canSynth) synth.cancel();
        if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); audioEl = null; }
        current = null;
        retryScript = script || null;
        setProgress(0);
        setIcon('play');
        showBar(true);
        bar.classList.add('dispatch-failed');
        el.caption.textContent = message;
        el.play.setAttribute('aria-label', retryScript ? 'Try playing the narration again' : 'Resume narration');
        clearPlayingButtons();
    };

    // Speaks `sentences` from `startAt`. Used for first play and for a rate
    // change mid-sentence, since an utterance's rate is fixed once it starts.
    const runSynth = (id, sentences, startAt) => {
        // Every path that falls back to the browser voice arrives here, so
        // this is the one place that has to establish there is a voice to
        // fall back to. Without the check, the next line throws on a browser
        // with no speech engine, or — worse — succeeds and plays nothing.
        if (!canSpeak()) {
            failPlayback(
                window.VoiceScripts.byId[id],
                'this browser has no speech voice available, and there is no recording to fall back on. Try another browser, or read the section instead.'
            );
            return;
        }

        current = { id, sentences, index: startAt };
        synth.cancel();

        const next = () => {
            if (!current || current.index >= sentences.length) { stop(); return; }
            const line = sentences[current.index];
            el.caption.textContent = line;
            setProgress(current.index / sentences.length);

            const u = new SpeechSynthesisUtterance(line);
            if (chosenVoice) u.voice = chosenVoice;
            u.lang = (chosenVoice && chosenVoice.lang) || 'en-GB';
            u.rate = rate;
            u.onend = () => { if (current) { current.index++; next(); } };
            u.onerror = () => { if (current) { current.index++; next(); } };
            synth.speak(u);
        };
        next();

        // Chrome drops long speech on the floor after ~15s of engine idle.
        // A pause/resume tick keeps it alive without affecting playback.
        stopKeepAlive();
        keepAlive = setInterval(() => {
            if (!current || audioEl) { stopKeepAlive(); return; }
            if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
        }, 10000);
    };

    const speakHuman = (script) => {
        const track = trackFor(script.id);
        if (!track) { runSynth(script.id, splitSentences(script.text), 0); return; }

        const sentences = splitSentences(script.text);
        current = { id: script.id, sentences, index: 0 };

        audioEl = new Audio();
        audioEl.preload = 'none';   // nothing crosses the wire until play()
        audioEl.src = track.file;
        audioEl.playbackRate = rate;

        // No per-word timings come back from the API, so captions advance by
        // position through the clip. Close enough to follow along, and never
        // presented as more than that.
        audioEl.addEventListener('timeupdate', () => {
            if (!audioEl || !audioEl.duration) return;
            const frac = audioEl.currentTime / audioEl.duration;
            setProgress(frac);
            const i = Math.min(sentences.length - 1, Math.floor(frac * sentences.length));
            if (current && i !== current.index) {
                current.index = i;
                el.caption.textContent = sentences[i];
            }
        });
        audioEl.addEventListener('ended', stop);
        audioEl.addEventListener('error', () => {
            audioEl = null;
            // Only switch engines if there is another engine. Switching into
            // a mode that cannot speak is how the player ended up dead.
            if (!canSpeak()) {
                failPlayback(script, 'that recording would not load, and this browser has no speech voice to fall back on. Press play to try again.');
                return;
            }
            el.caption.textContent = 'that recording would not load — using the browser voice instead.';
            setMode('synth', false);
            runSynth(script.id, sentences, 0);
        });

        el.caption.textContent = sentences[0];
        audioEl.play().catch(() => {
            // Autoplay policy, or a decode the browser refused. Either way it
            // is retryable, so keep the track loaded and hand back a play
            // button that actually restarts it.
            failPlayback(script, 'playback was blocked by the browser — press play to try again.');
        });
    };

    const play = async (script, btn) => {
        stop();
        if (mode === 'human') await loadManifest();

        showBar(true);
        setIcon('pause');
        setProgress(0);
        el.title.textContent = script.label;
        el.rate.innerHTML = `${rate}&times;`;
        el.weight.textContent = weightLabel(script.id);
        el.weight.title = TRANSFER_NOTE;
        syncModeButtons();
        refreshVoiceNote();

        if (btn) {
            btn.classList.add('is-playing');
            btn.setAttribute('aria-pressed', 'true');
        }

        // A recorded track also stands in when the browser has no voice of
        // its own, which is the only reason this feature works at all on some
        // Linux builds.
        if ((mode === 'human' || !canSpeak()) && trackFor(script.id)) speakHuman(script);
        else runSynth(script.id, splitSentences(script.text), 0);
    };

    const isPaused = () => (audioEl ? audioEl.paused : (canSynth && synth.paused));

    const togglePause = () => {
        // After a failure the play button is a retry, not a resume.
        if (!current) {
            if (!retryScript) return;
            const script = retryScript;
            play(script, document.querySelector(`.listen-btn[data-voice="${script.id}"]`));
            return;
        }
        if (audioEl) {
            if (audioEl.paused) { audioEl.play(); setIcon('pause'); }
            else { audioEl.pause(); setIcon('play'); }
            return;
        }
        if (synth.paused) { synth.resume(); setIcon('pause'); }
        else { synth.pause(); setIcon('play'); }
    };

    // `persist` is true only for a deliberate click on the voice switch.
    // Falling back automatically (no engine, missing track) must not be
    // recorded as a preference.
    function setMode(next, persist) {
        mode = next;
        if (persist) {
            modeChosen = true;
            safeStorage.local.set('mks-voice-mode', mode);
        }
        syncModeButtons();
        if (current) el.weight.textContent = weightLabel(current.id);
        refreshCosts();
    }

    // ---------------------------------------------------------------
    // Controls
    // ---------------------------------------------------------------
    el.play.addEventListener('click', togglePause);
    el.close.addEventListener('click', stop);

    el.rate.addEventListener('click', () => {
        const steps = [1, 1.25, 1.5, 0.85];
        const at = steps.indexOf(rate);
        rate = steps[(at + 1) % steps.length];
        el.rate.innerHTML = `${rate}&times;`;
        safeStorage.local.set('mks-voice-rate', String(rate));

        if (audioEl) { audioEl.playbackRate = rate; return; }
        // An utterance's rate cannot change once it is speaking, so the
        // current sentence restarts at the new rate rather than finishing old.
        if (current) runSynth(current.id, current.sentences, current.index);
    });

    el.modes.forEach(b => b.addEventListener('click', async () => {
        const nextMode = b.dataset.mode;
        if (nextMode === mode) return;
        const resume = current ? window.VoiceScripts.byId[current.id] : null;
        if (nextMode === 'human') await loadManifest();
        setMode(nextMode, true);
        if (resume) play(resume, document.querySelector(`.listen-btn[data-voice="${resume.id}"]`));
    }));

    // Talking after someone has left the page is a bug, not a feature.
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && current && !isPaused()) togglePause();
    });

    // ---------------------------------------------------------------
    // Buttons in the page
    // ---------------------------------------------------------------
    const makeButton = (script) => {
        const wrap = document.createElement('div');
        wrap.className = 'listen-wrap';
        wrap.dataset.voiceId = script.id;
        wrap.innerHTML = `
            <button class="listen-btn mono-label" type="button" data-voice="${script.id}"
                    aria-pressed="false" data-analytics="listen-${script.id}">
                <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-play"></use></svg>
                <span>listen<span class="sr-only"> to ${script.label}</span></span>
            </button>
            <span class="listen-cost mono-label">${weightLabel(script.id)}</span>`;
        wrap.querySelector('.listen-btn').addEventListener('click', (e) => {
            if (current && current.id === script.id) { stop(); return; }
            play(script, e.currentTarget);
        });
        return wrap;
    };

    SCRIPTS.forEach(script => {
        if (script.id === 'hero') {
            const cta = document.querySelector('.hero-cta');
            if (cta) cta.insertAdjacentElement('afterend', makeButton(script));
            return;
        }
        const section = document.getElementById(script.id);
        const header = section && section.querySelector('.section-header');
        if (header) header.appendChild(makeButton(script));
    });

    // Now that the controls exist, work out which voice we have and whether
    // the controls should be shown at all. A voice arriving late has to
    // refresh the cost labels too — "≈0 g · voice from your browser" becomes
    // "0.00 g · 0 KB" the moment an offline voice turns up.
    const onVoicesReady = () => {
        pickVoice();
        refreshCosts();
        updateAvailability();
    };

    onVoicesReady();
    if (canSynth) {
        if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', onVoicesReady);
        else synth.onvoiceschanged = onVoicesReady;
    }

    // Reveal the recorded-voice option only once we know it exists.
    //
    // Where a recording exists it becomes the default: it is a real human
    // reading, and it is the reason the narration was commissioned at all.
    // The browser voice stays one click away and still says 0.00 g, so the
    // lighter option is offered rather than imposed — and anyone who has
    // actually picked a side keeps their choice.
    loadManifest().then(m => {
        if (!m) return;
        const humanBtn = el.modes.filter(b => b.dataset.mode === 'human')[0];
        if (humanBtn) {
            // Name the voice on the control itself. "Moses" was misleading;
            // the manifest knows what was actually used, so use that.
            if (m.voiceTitle) {
                humanBtn.textContent = m.voiceTitle;
                humanBtn.title = m.voiceKind === 'human'
                    ? `Recorded narration read by ${m.voiceTitle}.`
                    : `“${m.voiceTitle}” — a synthetic text-to-speech voice${m.voiceProvider ? ` from ${m.voiceProvider}` : ''}. Not a recording of Moses Kolleh Sesay.`;
            }
            humanBtn.hidden = false;
        }
        if (!modeChosen || !canSpeak()) setMode('human', false);
        refreshCosts();
        updateAvailability();
    });

    syncModeButtons();
    document.body.appendChild(bar);

    // Exposed for the field terminal's `voice` command.
    window.FieldDispatch = {
        play: (id) => {
            const script = window.VoiceScripts.byId[id];
            if (!script) return false;
            play(script, document.querySelector(`.listen-btn[data-voice="${id}"]`));
            return true;
        },
        stop,
        setMode,
        hasRecorded: () => !!manifest,
        loadManifest,
        state: () => ({
            mode,
            playing: current ? current.id : null,
            voice: chosenVoice ? `${chosenVoice.name} (${chosenVoice.lang})` : 'none available',
            local: voiceIsLocal,
            recorded: !!manifest,
            // Who the recorded narrator actually is, so no caller has to
            // guess — and so nothing has to hardcode a name again.
            voiceTitle: manifest ? (manifest.voiceTitle || '') : '',
            voiceKind: manifest ? (manifest.voiceKind || '') : '',
            voiceProvider: manifest ? (manifest.voiceProvider || '') : '',
            ids: SCRIPTS.map(s => s.id)
        })
    };
})();
