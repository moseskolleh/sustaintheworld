// ===================================
// PRELOADER
// ===================================
(() => {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;

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
        setTimeout(() => preloader.remove(), 500);
    };

    if (document.readyState === 'complete') {
        setTimeout(hide, 600);
    } else {
        window.addEventListener('load', () => setTimeout(hide, 600));
        // Safety net: never trap the visitor behind the preloader
        setTimeout(hide, 4000);
    }
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
// TYPEWRITER ROLES
// ===================================
(() => {
    const el = document.getElementById('typewriter');
    if (!el) return;

    const roles = [
        'Sustainability & Climate Analyst',
        'Geologist by training',
        'Water systems specialist',
        'ESG & climate-risk analyst',
        'Sustainable AI researcher'
    ];
    let roleIndex = 0;
    let charIndex = roles[0].length;
    let deleting = true;

    const tick = () => {
        if (document.body.classList.contains('eco-mode')) {
            setTimeout(tick, 4000);
            return;
        }
        const current = roles[roleIndex];

        if (deleting) {
            charIndex--;
            el.textContent = current.slice(0, charIndex);
            if (charIndex === 0) {
                deleting = false;
                roleIndex = (roleIndex + 1) % roles.length;
            }
            setTimeout(tick, 32);
        } else {
            charIndex++;
            el.textContent = roles[roleIndex].slice(0, charIndex);
            if (charIndex === roles[roleIndex].length) {
                deleting = true;
                setTimeout(tick, 2600);
            } else {
                setTimeout(tick, 65);
            }
        }
    };

    setTimeout(tick, 2600);
})();

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
            if (navMenu) navMenu.classList.remove('active');
            if (navToggle) navToggle.classList.remove('active');
        }
    });
});

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
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

    // Projected coordinates of each stop inside the SVG's 1000x500 viewBox
    // (see scripts/generate-journey-map.js). Order matches the journey cards.
    const STOPS = [
        { x: 464.8, y: 223.8, zoom: 1.9, readout: '8.4657° N, 13.2317° W — Freetown' },
        { x: 790.3, y: 162.5, zoom: 1.9, readout: '28.2282° N, 112.9388° E — Changsha' },
        { x: 516.5, y: 93.3,  zoom: 3.4, readout: '50.7374° N, 7.0982° E — Bonn' },
        { x: 513.1, y: 89.6,  zoom: 4.4, readout: '51.9692° N, 5.6654° E — Wageningen' },
        { x: 511.3, y: 88.5,  zoom: 4.4, readout: '52.3676° N, 4.9041° E — Amsterdam' }
    ];
    const VB_W = 1000, VB_H = 500;
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

        // markers, labels and strokes live in map units — counter-scale
        // them (partially: sqrt keeps a hint of growth) so zooming doesn't
        // turn them into blobs
        const comp = 1 / Math.sqrt(s);
        svg.style.setProperty('--zoom-comp', comp.toFixed(3));
        svg.querySelectorAll('.map-stop-dot').forEach(el => el.setAttribute('r', (3.2 * comp).toFixed(2)));
        svg.querySelectorAll('.map-stop-halo').forEach(el => el.setAttribute('r', (10 * comp).toFixed(2)));
        svg.querySelectorAll('.map-stop-label').forEach(el => el.style.fontSize = (11 * comp).toFixed(2) + 'px');
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
document.querySelectorAll('.project-card').forEach(card => {
    const toggle = card.querySelector('.project-summary');
    const details = card.querySelector('.project-details');
    if (!toggle || !details) return;

    toggle.addEventListener('click', (e) => {
        // Let real links inside the summary (e.g. demo buttons) work normally
        if (e.target.closest('a') && e.target.closest('a') !== toggle) return;
        e.preventDefault();

        const isExpanded = card.classList.contains('expanded');

        // Collapse any other open dossier so the reader keeps their bearings
        document.querySelectorAll('.project-card.expanded').forEach(open => {
            if (open !== card) {
                open.classList.remove('expanded');
                const openDetails = open.querySelector('.project-details');
                const openToggle = open.querySelector('.project-summary');
                if (openDetails) openDetails.style.maxHeight = '0px';
                if (openToggle) openToggle.setAttribute('aria-expanded', 'false');
            }
        });

        if (isExpanded) {
            card.classList.remove('expanded');
            details.style.maxHeight = '0px';
            toggle.setAttribute('aria-expanded', 'false');
        } else {
            card.classList.add('expanded');
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

    const open = (src, alt, caption) => {
        lightboxImage.src = src;
        lightboxImage.alt = alt || '';
        if (lightboxCaption) lightboxCaption.textContent = caption || '';
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    const close = () => {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = 'auto';
    };

    document.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
            const img = item.querySelector('img');
            if (img) open(img.src, img.alt, item.getAttribute('data-caption'));
        });
    });

    if (lightboxClose) lightboxClose.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) close();
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
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const subject = document.getElementById('subject').value;
        const message = document.getElementById('message').value;

        const submitBtn = contactForm.querySelector('.btn-submit');
        const originalBtnContent = submitBtn.innerHTML;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Sending...</span><i class="fas fa-spinner fa-spin"></i>';

        const formData = {
            name: name,
            email: email,
            subject: subject,
            message: message,
            submitted_at: new Date().toISOString(),
            source: 'Portfolio Website'
        };

        try {
            await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                mode: 'no-cors' // Required for Google Apps Script
            });

            alert('✅ Thank you for your message! Your response has been submitted successfully. I will get back to you soon.');
            contactForm.reset();
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('❌ There was an error submitting your message. Please try again or contact me directly at moseskollehsesay@gmail.com');
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
// ACCESSIBILITY: SKIP TO CONTENT
// ===================================
(() => {
    const skipLink = document.createElement('a');
    skipLink.href = '#about';
    skipLink.textContent = 'Skip to content';
    skipLink.className = 'skip-link';
    document.body.insertBefore(skipLink, document.body.firstChild);
})();

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
// Data kept in sync with carbon-ai.js (Jegham et al. 2025; Ember 2023).
// ===================================
(() => {
    const modelSel = document.getElementById('ecoModel');
    const presetSel = document.getElementById('ecoPreset');
    const gridSel = document.getElementById('ecoGrid');
    if (!modelSel || !presetSel || !gridSel) return;

    const MODELS = [
        { key: 'gpt-4o',           label: 'GPT-4o',            whPer1k: 0.50 },
        { key: 'gpt-4o-mini',      label: 'GPT-4o mini',       whPer1k: 0.08 },
        { key: 'claude-37-sonnet', label: 'Claude 3.7 Sonnet', whPer1k: 0.40 },
        { key: 'gemini-20-flash',  label: 'Gemini 2.0 Flash',  whPer1k: 0.15 },
        { key: 'llama-33-70b',     label: 'Llama 3.3 70B',     whPer1k: 0.30 },
        { key: 'llama-32-1b',      label: 'Llama 3.2 1B',      whPer1k: 0.005 },
        { key: 'deepseek-r1',      label: 'DeepSeek-R1',       whPer1k: 1.20 }
    ];
    const GRIDS = [
        { key: 'no',     label: 'Norway — 30 gCO₂e/kWh',          intensity: 30 },
        { key: 'fr',     label: 'France — 56 gCO₂e/kWh',          intensity: 56 },
        { key: 'nl',     label: 'Netherlands — 268 gCO₂e/kWh',    intensity: 268 },
        { key: 'us-avg', label: 'US average — 367 gCO₂e/kWh',     intensity: 367 },
        { key: 'cn',     label: 'China — 538 gCO₂e/kWh',          intensity: 538 },
        { key: 'in',     label: 'India — 713 gCO₂e/kWh',          intensity: 713 }
    ];
    const PRESET_TOKENS = { short: 400, chat: 1000, doc: 5000, reasoning: 9000 };
    const PUE = 1.2;            // data-centre overhead
    const WUE = 1.8;            // L per kWh, industry-typical cooling

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

    const weigh = () => {
        let bytes = 0;
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) bytes += nav.transferSize || 0;
            performance.getEntriesByType('resource').forEach(r => {
                bytes += r.transferSize || 0;
            });
        } catch (e) { /* older browsers: leave the badge quiet */ }
        if (!bytes) {
            badgeText.textContent = 'Built to stay under 1 MB per visit';
            return;
        }
        const mb = bytes / (1024 * 1024);
        const g = mb * G_CO2_PER_MB;
        let comparison = '';
        if (mb < MEDIAN_PAGE_MB) {
            comparison = ` — ${Math.round((1 - mb / MEDIAN_PAGE_MB) * 100)}% lighter than the median web page`;
        }
        badgeText.textContent =
            `This visit transferred ${mb.toFixed(2)} MB ≈ ${g.toFixed(2)} g CO₂e${comparison}`;
    };

    if (document.readyState === 'complete') {
        setTimeout(weigh, 1200);
    } else {
        window.addEventListener('load', () => setTimeout(weigh, 1200));
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
