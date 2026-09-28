// COUNT: one cookieless POST per page view, as the page is hidden or left, and
// none under Do Not Track or GPC. Exactly these keys (google-apps-script/README.md):
// {"v":1,"page":"index","lens":"","deepest":"contact","features":["cv-download-hero","cv-download","module-interactives"],"ref":"www.linkedin.com","vp":"m","kb":284}
(() => {
    const ok = (s) => typeof s === 'string' && /^[a-z0-9-]{1,40}$/.test(s);
    const mks = (window.mks = window.mks || {});
    const features = [];
    mks.track = (name) => {
        if (ok(name) && features.length < 20 && !features.includes(name)) features.push(name);
    };

    // 404.html names itself: it answers any missing address.
    const me = document.currentScript;
    const page = (me && me.dataset.page) ||
        location.pathname.split('/').pop().replace(/\.html?$/, '').toLowerCase() || 'index';
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true || !ok(page)) return;

    const lens = new URLSearchParams(location.search).get('lens');
    let ref = '';
    try { ref = new URL(document.referrer).host; } catch (e) { /* none */ }
    if (ref === location.host || !/^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(ref)) ref = '';

    // One observer, no scroll handler: a part reports once, when first seen.
    const parts = [].filter.call(document.querySelectorAll('main > [id]'), (el) => /^[\w-]{1,40}$/.test(el.id));
    let deepest = -1;
    const io = window.IntersectionObserver && new IntersectionObserver((entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        deepest = Math.max(deepest, parts.indexOf(e.target));
        io.unobserve(e.target);
    }));
    if (io) parts.forEach((el) => io.observe(el));

    // "cv-download": this view used a CV link, whichever.
    document.addEventListener('click', (e) => {
        const el = e.target.closest && e.target.closest('[data-analytics]');
        const name = el && el.getAttribute('data-analytics');
        mks.track(name);
        if (/^cv-download-/.test(name)) mks.track('cv-download');
    });

    let sent = false;
    const send = () => {
        if (sent) return;
        sent = true;
        let bytes = 0;
        try {
            ['navigation', 'resource'].forEach((type) => performance.getEntriesByType(type)
                .forEach((r) => { bytes += r.transferSize || 0; }));
        } catch (e) { /* no Resource Timing: 0 */ }
        const w = window.innerWidth;
        // Not sendBeacon, which would carry the browser's Google cookies.
        try {
            fetch('https://script.google.com/macros/s/AKfycbzgyqRUmu0d2UFjb0WxbYyoDbO8F9jVnlvIQnNAfMU0v8JFpH5KAefy4z9BNoQqd68/exec?action=count', {
                method: 'POST',
                keepalive: true,
                credentials: 'omit',
                mode: 'no-cors',
                referrerPolicy: 'no-referrer',
                body: JSON.stringify({
                    v: 1,
                    page,
                    lens: ok(lens) ? lens : '',
                    deepest: deepest < 0 ? '' : parts[deepest].id,
                    features,
                    ref,
                    vp: w < 600 ? 's' : w < 1024 ? 'm' : 'l',
                    kb: Math.min(100000, Math.round(bytes / 1024))
                })
            }).catch(() => {});
        } catch (e) { /* a count is never worth an error */ }
    };
    addEventListener('pagehide', send);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') send();
    });
})();
