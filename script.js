// ===================================
// SMOOTH SCROLLING & NAVIGATION
// ===================================

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            // Close mobile menu after clicking
            navMenu.classList.remove('active');
        }
    });
});

// Mobile Navigation Toggle
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
        navMenu.classList.remove('active');
    }
});

// ===================================
// NAVBAR SCROLL EFFECT
// ===================================
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
});

// ===================================
// ACTIVE NAVIGATION HIGHLIGHT
// ===================================
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= (sectionTop - 200)) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// ===================================
// ANIMATED COUNTERS
// ===================================
const animateCounters = () => {
    const counters = document.querySelectorAll('.stat-number');

    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000; // 2 seconds
        const increment = target / (duration / 16); // 60 FPS
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

// Intersection Observer for counter animation
const observerOptions = {
    threshold: 0.5,
    rootMargin: '0px'
};

const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounters();
            counterObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

const statsSection = document.querySelector('.about-stats');
if (statsSection) {
    counterObserver.observe(statsSection);
}

// ===================================
// SKILL BARS ANIMATION
// ===================================
const animateSkillBars = () => {
    const skillBars = document.querySelectorAll('.skill-progress');

    skillBars.forEach(bar => {
        const progress = bar.getAttribute('data-progress');
        bar.style.width = progress + '%';
    });
};

const skillsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateSkillBars();
            skillsObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

const skillsSection = document.querySelector('.skills');
if (skillsSection) {
    skillsObserver.observe(skillsSection);
}

// ===================================
// SCROLL TO TOP BUTTON
// ===================================
const scrollTopBtn = document.getElementById('scrollTop');

window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollTopBtn.classList.add('visible');
    } else {
        scrollTopBtn.classList.remove('visible');
    }
});

scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// ===================================
// HERO SEARCH FUNCTIONALITY
// ===================================
const heroSearch = document.getElementById('heroSearch');
const searchBtn = document.querySelector('.search-btn');

const searchContent = (query) => {
    const searchTerms = {
        'esg': '#skills',
        'sustainability': '#projects',
        'climate': '#experience',
        'water': '#projects',
        'data': '#skills',
        'python': '#skills',
        'research': '#projects',
        'education': '#education',
        'contact': '#contact',
        'about': '#about',
        'ghg': '#skills',
        'carbon': '#skills',
        'analytics': '#skills',
        'environmental': '#about',
        'disaster': '#projects',
        'un': '#experience',
        'wageningen': '#education',
        'experience': '#experience'
    };

    const lowerQuery = query.toLowerCase();

    for (const [key, value] of Object.entries(searchTerms)) {
        if (lowerQuery.includes(key)) {
            const section = document.querySelector(value);
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
                return;
            }
        }
    }

    // Default to projects if no match
    const projectsSection = document.querySelector('#projects');
    if (projectsSection) {
        projectsSection.scrollIntoView({ behavior: 'smooth' });
    }
};

searchBtn.addEventListener('click', () => {
    const query = heroSearch.value;
    if (query.trim()) {
        searchContent(query);
    }
});

heroSearch.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = heroSearch.value;
        if (query.trim()) {
            searchContent(query);
        }
    }
});

// ===================================
// CONTACT FORM HANDLING
// ===================================
const contactForm = document.getElementById('contactForm');

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Get form values
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value;

    // Create mailto link
    const mailtoLink = `mailto:moseskollehsesay@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`)}`;

    // Open email client
    window.location.href = mailtoLink;

    // Show success message
    alert('Thank you for your message! Your email client will open to send the message.');

    // Reset form
    contactForm.reset();
});

// ===================================
// SCROLL ANIMATIONS
// ===================================
const observeElements = () => {
    const elements = document.querySelectorAll('.timeline-item, .project-card, .education-card, .highlight-card');

    const elementObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 100);
                elementObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    elements.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        elementObserver.observe(element);
    });
};

// Initialize scroll animations
observeElements();

// ===================================
// TYPING EFFECT FOR HERO SUBTITLE
// ===================================
const typeWriter = (element, text, speed = 100) => {
    let i = 0;
    element.textContent = '';

    const type = () => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    };

    type();
};

// Optional: Uncomment to enable typing effect
// window.addEventListener('load', () => {
//     const heroSubtitle = document.querySelector('.hero-subtitle');
//     const originalText = heroSubtitle.textContent;
//     typeWriter(heroSubtitle, originalText, 80);
// });

// ===================================
// LAZY LOADING BACKGROUND IMAGES
// ===================================
const lazyLoadImages = () => {
    const images = document.querySelectorAll('[data-bg]');

    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.style.backgroundImage = `url(${img.dataset.bg})`;
                imageObserver.unobserve(img);
            }
        });
    });

    images.forEach(img => imageObserver.observe(img));
};

lazyLoadImages();

// ===================================
// PARTICLE EFFECT (Optional Enhancement)
// ===================================
const createParticles = () => {
    const hero = document.querySelector('.hero');
    const particlesCount = 50;

    for (let i = 0; i < particlesCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: 2px;
            height: 2px;
            background: rgba(124, 252, 0, 0.3);
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: float ${5 + Math.random() * 10}s infinite ease-in-out;
            animation-delay: ${Math.random() * 5}s;
        `;
        hero.appendChild(particle);
    }

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
            50% { transform: translateY(-100px) translateX(50px); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
};

// Optional: Uncomment to enable particles
// createParticles();

// ===================================
// PROJECT CARD INTERACTIONS
// ===================================
const projectCards = document.querySelectorAll('.project-card');

projectCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-10px) scale(1.02)';
    });

    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
    });
});

// ===================================
// THEME TOGGLE (Optional Feature)
// ===================================
const createThemeToggle = () => {
    const toggle = document.createElement('button');
    toggle.innerHTML = '<i class="fas fa-moon"></i>';
    toggle.className = 'theme-toggle';
    toggle.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 30px;
        width: 50px;
        height: 50px;
        background-color: var(--card-bg);
        border: 2px solid var(--primary-green);
        border-radius: 50%;
        color: var(--primary-green);
        font-size: 1.2rem;
        cursor: pointer;
        z-index: 999;
        transition: all 0.3s ease;
    `;

    document.body.appendChild(toggle);

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const icon = toggle.querySelector('i');
        icon.className = document.body.classList.contains('light-theme')
            ? 'fas fa-sun'
            : 'fas fa-moon';
    });
};

// Optional: Uncomment to enable theme toggle
// createThemeToggle();

// ===================================
// PRELOADER
// ===================================
window.addEventListener('load', () => {
    // Remove preloader if it exists
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.remove();
            }, 300);
        }, 500);
    }

    // Initialize animations
    document.body.style.opacity = '1';
});

// ===================================
// PERFORMANCE OPTIMIZATION
// ===================================
// Debounce function for scroll events
const debounce = (func, wait = 10) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Apply debounce to scroll handler
const debouncedScroll = debounce(() => {
    // Your scroll logic here
}, 10);

window.addEventListener('scroll', debouncedScroll);

// ===================================
// COPY EMAIL ON CLICK
// ===================================
const emailLinks = document.querySelectorAll('a[href^="mailto:"]');

emailLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        const email = link.textContent || link.getAttribute('href').replace('mailto:', '');

        // Create temporary input to copy email
        const temp = document.createElement('input');
        temp.value = email;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);

        // Show feedback
        const originalText = link.textContent;
        if (originalText) {
            link.textContent = 'Email Copied!';
            setTimeout(() => {
                link.textContent = originalText;
            }, 2000);
        }
    });
});

// ===================================
// EASTER EGG: Console Message
// ===================================
console.log('%c👋 Welcome to my portfolio!', 'color: #7CFC00; font-size: 24px; font-weight: bold;');
console.log('%cBuilt with passion for sustainability and environmental impact.', 'color: #7CFC00; font-size: 14px;');
console.log('%cInterested in collaboration? Let\'s connect!', 'color: #ffffff; font-size: 14px;');
console.log('%cEmail: moseskollehsesay@gmail.com', 'color: #7CFC00; font-size: 14px;');

// ===================================
// PRINT PROJECT DETAILS
// ===================================
const printDetails = () => {
    window.print();
};

// ===================================
// ACCESSIBILITY: Skip to Content
// ===================================
const createSkipLink = () => {
    const skipLink = document.createElement('a');
    skipLink.href = '#about';
    skipLink.textContent = 'Skip to content';
    skipLink.className = 'skip-link';
    skipLink.style.cssText = `
        position: absolute;
        top: -40px;
        left: 0;
        background: var(--primary-green);
        color: var(--darker-bg);
        padding: 8px;
        text-decoration: none;
        z-index: 100;
    `;

    skipLink.addEventListener('focus', () => {
        skipLink.style.top = '0';
    });

    skipLink.addEventListener('blur', () => {
        skipLink.style.top = '-40px';
    });

    document.body.insertBefore(skipLink, document.body.firstChild);
};

createSkipLink();

// ===================================
// KEYBOARD NAVIGATION ENHANCEMENT
// ===================================
document.addEventListener('keydown', (e) => {
    // Press 'H' to go to home
    if (e.key === 'h' || e.key === 'H') {
        if (!e.target.matches('input, textarea')) {
            document.querySelector('#home').scrollIntoView({ behavior: 'smooth' });
        }
    }

    // Press 'C' to go to contact
    if (e.key === 'c' || e.key === 'C') {
        if (!e.target.matches('input, textarea')) {
            document.querySelector('#contact').scrollIntoView({ behavior: 'smooth' });
        }
    }
});

// ===================================
// DYNAMIC YEAR IN FOOTER
// ===================================
const updateFooterYear = () => {
    const yearElements = document.querySelectorAll('.current-year');
    const currentYear = new Date().getFullYear();
    yearElements.forEach(el => {
        el.textContent = currentYear;
    });
};

updateFooterYear();

// ===================================
// INITIAL PAGE LOAD
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Portfolio loaded successfully!');

    // Add loading class removal
    document.body.classList.add('loaded');

    // Initialize all features
    observeElements();
    lazyLoadImages();

    // Smooth scroll to section if hash exists
    if (window.location.hash) {
        setTimeout(() => {
            const target = document.querySelector(window.location.hash);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }, 100);
    }
});

// ===================================
// SERVICE WORKER REGISTRATION (Optional)
// ===================================
if ('serviceWorker' in navigator) {
    // Uncomment to enable service worker
    // window.addEventListener('load', () => {
    //     navigator.serviceWorker.register('/sw.js')
    //         .then(reg => console.log('Service Worker registered'))
    //         .catch(err => console.log('Service Worker registration failed'));
    // });
}
