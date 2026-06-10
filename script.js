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

    const showSlide = (index) => {
        slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
        if (captionText && heroSlideCaptions[index]) {
            captionText.textContent = heroSlideCaptions[index];
        }
    };

    setInterval(() => {
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
// SKILL BARS ANIMATION
// ===================================
const skillsSection = document.querySelector('.skills');
if (skillsSection && 'IntersectionObserver' in window) {
    const skillsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                document.querySelectorAll('.skill-progress').forEach(bar => {
                    bar.style.width = bar.getAttribute('data-progress') + '%';
                });
                skillsObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });
    skillsObserver.observe(skillsSection);
}

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
