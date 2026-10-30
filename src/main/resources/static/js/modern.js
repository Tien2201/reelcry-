// REELCRY - hiệu ứng 3D + tối ưu tải ảnh, dùng chung cho mọi trang (nạp từ
// header.html với "defer" nên không chặn việc vẽ trang).
(function () {
    'use strict';

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Chỉ bật nghiêng 3D theo chuột trên thiết bị có chuột thật (máy tính).
    // Trên điện thoại không có "hover", tính toán thêm chỉ gây tốn pin.
    var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    var PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f1f23"/><stop offset="1" stop-color="#121214"/></linearGradient></defs>' +
        '<rect width="300" height="450" fill="url(#g)"/>' +
        '<circle cx="150" cy="200" r="38" fill="none" stroke="#e50914" stroke-opacity=".55" stroke-width="5"/>' +
        '<path d="M140 182l26 18-26 18z" fill="#e50914" fill-opacity=".7"/>' +
        '<text x="150" y="285" fill="#77777d" font-family="sans-serif" font-size="20" text-anchor="middle">Không có ảnh</text></svg>');

    // ---------- Ảnh: dừng shimmer khi tải xong, thay ảnh lỗi bằng ảnh chờ ----------
    function markLoaded(img) {
        var box = img.closest('.movie-img-container, .related-img-wrap');
        if (box) box.classList.add('is-loaded');
    }

    // Sự kiện load/error của <img> không nổi bọt -> bắt ở pha capture trên document
    document.addEventListener('load', function (e) {
        if (e.target && e.target.tagName === 'IMG') markLoaded(e.target);
    }, true);

    document.addEventListener('error', function (e) {
        var img = e.target;
        if (!img || img.tagName !== 'IMG' || img.dataset.rcFallback) return;
        if (!img.closest('.movie-img-container, .related-img-wrap, .cf-item, .trailer-thumb')) return;
        img.dataset.rcFallback = '1';
        img.src = PLACEHOLDER;
    }, true);

    function markAlreadyLoaded() {
        document.querySelectorAll('.movie-img-container img, .related-img-wrap img').forEach(function (img) {
            if (img.complete && img.naturalWidth > 0) markLoaded(img);
        });
    }

    // ---------- Hero trang chủ: chỉ tải ảnh nền slide đầu tiên ngay ----------
    // 5 slide còn lại (mỗi ảnh vài trăm KB) được tải sau khi trang đã hiện
    // xong, không còn tranh băng thông với poster phim lúc mới mở trang
    function loadDeferredHeroBackgrounds() {
        document.querySelectorAll('.home-hero-bg[data-bg]').forEach(function (el) {
            el.style.backgroundImage = 'url("' + el.dataset.bg + '")';
            el.removeAttribute('data-bg');
        });
    }

    // ---------- Thanh điều hướng đổ bóng khi cuộn ----------
    function wireNavbarShadow() {
        var nav = document.getElementById('reelcryNavbar');
        if (!nav) return;
        var ticking = false;
        function update() {
            nav.classList.toggle('is-scrolled', window.scrollY > 8);
            ticking = false;
        }
        window.addEventListener('scroll', function () {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }

    // ---------- Card nghiêng 3D theo chuột ----------
    function wireTilt() {
        if (reduceMotion || !finePointer) return;

        var MAX_TILT = 9; // độ
        var current = null;
        var pending = null;
        var rafId = 0;

        function apply() {
            rafId = 0;
            if (!pending) return;
            var card = pending.card;
            var rect = card.getBoundingClientRect();
            var x = (pending.x - rect.left) / rect.width;  // 0..1
            var y = (pending.y - rect.top) / rect.height;  // 0..1
            card.style.setProperty('--ry', ((x - 0.5) * 2 * MAX_TILT).toFixed(2) + 'deg');
            card.style.setProperty('--rx', ((0.5 - y) * 2 * MAX_TILT).toFixed(2) + 'deg');
            card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
            card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        }

        function reset(card) {
            card.classList.remove('is-tilting');
            card.style.setProperty('--rx', '0deg');
            card.style.setProperty('--ry', '0deg');
        }

        document.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'mouse') return;
            var card = e.target.closest && e.target.closest('.movie-card, .related-card');
            // Không nghiêng khi đang kéo cuộn ngang 1 hàng phim
            if (card && card.closest('.dragging-row')) card = null;

            if (card !== current) {
                if (current) reset(current);
                current = card;
                if (card) card.classList.add('is-tilting');
            }
            if (!card) return;

            pending = { card: card, x: e.clientX, y: e.clientY };
            if (!rafId) rafId = requestAnimationFrame(apply);
        }, { passive: true });

        document.addEventListener('pointerleave', function () {
            if (current) reset(current);
            current = null;
        });

        // Cuộn trang làm card trượt khỏi chuột mà không có pointermove -> trả về thẳng
        window.addEventListener('scroll', function () {
            if (current) {
                reset(current);
                current = null;
            }
        }, { passive: true });
    }

    // ---------- Hero parallax theo chuột ----------
    function wireParallax() {
        if (reduceMotion || !finePointer) return;

        document.querySelectorAll('.home-hero, .hero-card').forEach(function (hero) {
            var rafId = 0;
            var px = 0, py = 0;

            function apply() {
                rafId = 0;
                hero.style.setProperty('--px', px.toFixed(3));
                hero.style.setProperty('--py', py.toFixed(3));
            }

            hero.addEventListener('pointermove', function (e) {
                var rect = hero.getBoundingClientRect();
                px = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                py = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                if (!rafId) rafId = requestAnimationFrame(apply);
            }, { passive: true });

            hero.addEventListener('pointerleave', function () {
                px = 0;
                py = 0;
                if (!rafId) rafId = requestAnimationFrame(apply);
            });
        });
    }

    function init() {
        markAlreadyLoaded();
        wireNavbarShadow();
        wireTilt();
        wireParallax();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    if (document.readyState === 'complete') {
        loadDeferredHeroBackgrounds();
    } else {
        window.addEventListener('load', loadDeferredHeroBackgrounds);
    }
})();
