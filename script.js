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
    let seen = false;
    try { seen = sessionStorage.getItem('mks-intro-seen'); } catch (e) { /* private mode */ }
    if (reduce || seen) { wipe(); return; }
    try { sessionStorage.setItem('mks-intro-seen', '1'); } catch (e) { /* ignore */ }

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

    // Only the first slide ships with the page; the rest are fetched
    // after load so the initial payload stays light.
    slides.forEach(slide => {
        const src = slide.getAttribute('data-bg');
        if (src) slide.style.backgroundImage = `url('${src}')`;
    });

    const showSlide = (index) => {
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

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        // Bare "#" hrefs (e.g. project expand toggles) are not real targets;
        // querySelector('#') would throw SyntaxError, so bail out.
        if (!href || href === '#') return;
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setMenuOpen(false);
        }
    });
});

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
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (lightboxClose) lightboxClose.focus();
    };

    const close = () => {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = 'auto';
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
        const formData = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            subject: document.getElementById('subject').value.trim(),
            message: document.getElementById('message').value.trim(),
            website: honeypot ? honeypot.value : '',
            submitted_at: new Date().toISOString(),
            source: 'Portfolio Website'
        };

        const submitBtn = contactForm.querySelector('.btn-submit');
        const originalBtnContent = submitBtn.innerHTML;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Sending...</span><i class="fas fa-spinner fa-spin"></i>';
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
    toggle.innerHTML = `<i class="fas fa-${startsLight ? 'sun' : 'moon'}"></i>`;
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle light/dark mode');

    document.body.appendChild(toggle);

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const icon = toggle.querySelector('i');
        const isLightMode = document.body.classList.contains('light-mode');

        icon.className = isLightMode ? 'fas fa-sun' : 'fas fa-moon';
        localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    });
};

// Restore saved preference, then mount the toggle
const currentTheme = localStorage.getItem('theme') || 'dark';
if (currentTheme === 'light') {
    document.body.classList.add('light-mode');
}
createThemeToggle();

// ===================================
// KEYBOARD NAVIGATION
// ===================================
document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;

    if (e.key === 'h' || e.key === 'H') {
        const home = document.querySelector('#home');
        if (home) home.scrollIntoView({ behavior: 'smooth' });
    }

    if (e.key === 'c' || e.key === 'C') {
        const contact = document.querySelector('#contact');
        if (contact) contact.scrollIntoView({ behavior: 'smooth' });
    }
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
        key: k, label: DATA.MODELS[k].label, whPer1k: DATA.MODELS[k].energyPer1kTokens_Wh
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
        const kWh = (model.whPer1k * tokens / 1000 / 1000) * PUE;
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

    const saved = localStorage.getItem('eco-mode');
    const prefersCalm = typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    apply(saved !== null ? saved === 'on' : prefersCalm);

    toggle.addEventListener('click', () => {
        const on = !document.body.classList.contains('eco-mode');
        apply(on);
        localStorage.setItem('eco-mode', on ? 'on' : 'off');
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
            print('methodology: Resource Timing API × Sustainable Web Design model. every gram counted.');
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
    const DATA = (typeof window !== 'undefined') ? window.AICarbonData : null;
    if (!svg || !revealBtn || !DATA) return;

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
    const yMax = 1.3;
    const xAt = (i) => M.l + (i / (n - 1)) * plotW;
    const yAt = (wh) => M.t + (1 - Math.min(wh, yMax) / yMax) * plotH;
    const whAtY = (y) => Math.max(0, Math.min(yMax, (1 - (y - M.t) / plotH) * yMax));

    const guess = models.map((m, i) => (i < KNOWN ? m.wh : models[KNOWN - 1].wh));
    let revealed = false;
    let interacted = false;

    // --- static layer: gridlines + y labels ---
    [0, 0.5, 1.0].forEach(v => {
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

    // real line (revealed later)
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

    // --- interaction ---
    const hit = mk('rect', { x: M.l, y: M.t, width: plotW, height: plotH, class: 'ydi-hit', fill: 'transparent' });
    svg.appendChild(hit);

    const toLocal = (evt) => {
        const rect = svg.getBoundingClientRect();
        return { x: (evt.clientX - rect.left) / rect.width * W, y: (evt.clientY - rect.top) / rect.height * H };
    };
    const paint = (p) => {
        if (revealed) return;
        let i = Math.round((p.x - M.l) / plotW * (n - 1));
        i = Math.max(KNOWN, Math.min(n - 1, i));
        guess[i] = whAtY(p.y);
        drawGuess();
        if (!interacted) { interacted = true; if (hintEl) hintEl.style.opacity = '0'; }
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

    // --- reveal ---
    const doReveal = () => {
        if (revealed) return;
        revealed = true;
        realLine.setAttribute('points', models.map((m, i) => `${xAt(i)},${yAt(m.wh)}`).join(' '));
        svg.classList.add('revealed');
        models.forEach((m, i) => {
            const c = mk('circle', { cx: xAt(i), cy: yAt(m.wh), r: 4, class: 'ydi-real-dot' });
            svg.appendChild(c);
            realDots.push(c);
        });
        if (hintEl) hintEl.style.opacity = '0';
        if (resetBtn) resetBtn.hidden = false;
        revealBtn.hidden = true;

        const gWh = guess[n - 1];
        const rWh = models[n - 1].wh;
        const tiny = models[0].wh;
        const factorFrontier = Math.round(rWh / tiny);
        let msg;
        if (gWh > 0 && rWh / gWh >= 1.3) {
            msg = `You put the biggest model at ~${gWh.toFixed(2)} Wh. It's actually ${rWh.toFixed(2)} Wh — you underestimated the frontier by ${(rWh / gWh).toFixed(1)}×.`;
        } else if (gWh > 0 && gWh / rWh >= 1.3) {
            msg = `You had the frontier at ~${gWh.toFixed(2)} Wh; it's actually ${rWh.toFixed(2)} Wh — an overestimate of ${(gWh / rWh).toFixed(1)}×.`;
        } else {
            msg = `Close — you had the frontier near ${gWh.toFixed(2)} Wh; it's ${rWh.toFixed(2)} Wh.`;
        }
        msg += ` A 1B model answers for ${tiny.toFixed(3)} Wh — the frontier reasoning model burns roughly ${factorFrontier}× more for the same 1,000-token answer. That gap is exactly what the tools people prompt with never show them.`;
        if (verdictEl) { verdictEl.textContent = msg; verdictEl.hidden = false; }
    };
    revealBtn.addEventListener('click', doReveal);

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            revealed = false;
            svg.classList.remove('revealed');
            realLine.setAttribute('points', '');
            realDots.forEach(d => d.remove());
            realDots.length = 0;
            for (let i = KNOWN; i < n; i++) guess[i] = models[KNOWN - 1].wh;
            drawGuess();
            if (verdictEl) { verdictEl.hidden = true; verdictEl.textContent = ''; }
            resetBtn.hidden = true;
            revealBtn.hidden = false;
            interacted = false;
            if (hintEl) hintEl.style.opacity = '';
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
        lines.push({ t: 'c', s: 'browsed lightly — thank you' });
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
            ctx.fillStyle = ln.dim ? '#8a8577' : '#1a1a1a';
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
            try {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = 'sustaintheworld-carbon-receipt.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (e) { /* canvas is same-origin, so this won't taint — ignore */ }
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
