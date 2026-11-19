// Marks JS as available; CSS only hides/animates content under `.js`.
document.documentElement.classList.add('js');

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Reduced motion: no animation, final state shown (CSS hides nothing under `.reduced`).
if (prefersReducedMotion()) document.documentElement.classList.add('reduced');

// One passive scroll listener (and one resize listener) for the whole page,
// throttled to one run per animation frame.
var frameTasks = [];
var framePending = false;
function runFrame() {
  framePending = false;
  for (var i = 0; i < frameTasks.length; i++) frameTasks[i]();
}
function requestFrame() {
  if (!framePending) {
    framePending = true;
    window.requestAnimationFrame(runFrame);
  }
}
function onFrame(task) {
  if (!frameTasks.length) {
    window.addEventListener('scroll', requestFrame, { passive: true });
    window.addEventListener('resize', requestFrame);
  }
  frameTasks.push(task);
  requestFrame();
}

function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

// The Route: draws `path.route-line` in whichever trail SVG is visible as the
// visitor scrolls, and marks stops `.is-active` as the line reaches them.
//   Vertical (<1024px): a stop activates once its dot crosses 60% of the
//   viewport, and the line's tip sits on that same 60% line.
//   Horizontal (>=1024px): stops sit side by side, so a stop activates when
//   the drawn line reaches its dot.
function initRoute(root) {
  if (!root || prefersReducedMotion()) return;
  var map = root.querySelector('.route-map');
  var list = root.querySelector('.stops');
  var stops = Array.prototype.slice.call(root.querySelectorAll('.stop'));
  var svgs = Array.prototype.slice.call(root.querySelectorAll('.route-svg'));
  if (!map || !list || !stops.length || !svgs.length) return;

  var dots = {};
  Array.prototype.forEach.call(root.querySelectorAll('[data-dot]'), function (dot) {
    dots[dot.getAttribute('data-dot')] = dot;
  });
  var detour = root.querySelector('.route-svg--h .route-detour');
  var LINE = 0.6; // fraction of the viewport height where stops activate
  var geo = null; // measured once per layout; refreshed on resize

  function visibleSvg() {
    for (var i = 0; i < svgs.length; i++) {
      if (svgs[i].getClientRects().length) return svgs[i];
    }
    return null;
  }

  function dotY(stop) {
    var y = parseFloat(window.getComputedStyle(stop, '::before').top);
    return isNaN(y) ? 12 : y;
  }

  // Path length at which the (left-to-right) line reaches x, by bisection.
  function lengthAtX(path, x, total) {
    var lo = 0, hi = total;
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      if (path.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
    }
    return hi;
  }

  function measure() {
    svgs.forEach(function (svg) { svg.removeAttribute('style'); });
    var svg = visibleSvg();
    if (!svg) { geo = null; return; }
    var line = svg.querySelector('path.route-line');
    var horizontal = svg.classList.contains('route-svg--h');
    if (!horizontal) {
      // Stretch the vertical trail from the first stop's dot to the last one's.
      var top = list.offsetTop + stops[0].offsetTop + dotY(stops[0]);
      var last = stops[stops.length - 1];
      var bottom = list.offsetTop + last.offsetTop + dotY(last);
      svg.style.top = top + 'px';
      svg.style.height = Math.max(bottom - top, 1) + 'px';
    }
    var length = line.getTotalLength();
    var at = {};
    if (horizontal) {
      stops.forEach(function (stop) {
        var id = stop.getAttribute('data-stop');
        var dot = dots[id];
        at[id] = dot ? lengthAtX(line, parseFloat(dot.getAttribute('cx')), length) / length : 0;
      });
    }
    svgs.forEach(function (s) {
      var p = s.querySelector('path.route-line');
      if (p !== line) { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }
    });
    line.style.strokeDasharray = length + ' ' + length;
    geo = { svg: svg, line: line, length: length, horizontal: horizontal, at: at };
  }

  function update() {
    if (!geo) return;
    var vh = window.innerHeight;
    var progress;
    if (geo.horizontal) {
      // Draw while the trail strip travels from 95% to 60% of the viewport,
      // so the whole map is in view by the time it reaches "you are here".
      var strip = geo.svg.getBoundingClientRect();
      progress = clamp01((0.95 * vh - (strip.top + strip.height / 2)) / (0.35 * vh));
    } else {
      var r = geo.svg.getBoundingClientRect();
      progress = clamp01((LINE * vh - r.top) / r.height);
    }
    geo.line.style.strokeDashoffset = String(geo.length * (1 - progress));

    stops.forEach(function (stop) {
      var id = stop.getAttribute('data-stop');
      var active = geo.horizontal
        ? progress >= geo.at[id] - 0.0005
        : stop.getBoundingClientRect().top + dotY(stop) <= LINE * vh;
      stop.classList.toggle('is-active', active);
      if (dots[id]) dots[id].classList.toggle('is-active', active);
      if (detour && stop.classList.contains('stop--detour')) detour.classList.toggle('is-active', active);
    });
  }

  var lastWidth = -1;
  function frame() {
    if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; measure(); }
    update();
  }

  measure();
  lastWidth = window.innerWidth;
  update();
  root.classList.add('is-live'); // only now may CSS dim not-yet-reached stops
  onFrame(frame);

  // Fonts and late layout change stop heights: re-measure when the list resizes.
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { measure(); requestFrame(); }).observe(list);
  }
}

// Fades `.reveal` blocks in as they enter the viewport.
function initReveal() {
  if (prefersReducedMotion()) return;
  var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  // Anything already on screen is shown at once rather than waiting for the
  // observer's first callback.
  var vh = window.innerHeight;
  els = els.filter(function (el) {
    var r = el.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0) { el.classList.add('is-visible'); return false; }
    return true;
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  els.forEach(function (el) { io.observe(el); });
}

// Marks the nav link of the section most in view with aria-current="true".
// No animation, so it also runs under reduced motion.
function initNav() {
  var header = document.querySelector('header');
  var pairs = [];
  Array.prototype.forEach.call(document.querySelectorAll('main section[id]'), function (section) {
    var link = document.querySelector('header nav a[href="#' + section.id + '"]');
    if (link) pairs.push({ section: section, link: link });
  });
  if (!pairs.length) return;
  var current = null;

  onFrame(function () {
    var top = header ? header.getBoundingClientRect().bottom : 0;
    var bottom = window.innerHeight;
    var best = null, bestSeen = 0;
    pairs.forEach(function (pair) {
      var r = pair.section.getBoundingClientRect();
      var seen = Math.min(r.bottom, bottom) - Math.max(r.top, top);
      if (seen > bestSeen) { bestSeen = seen; best = pair; }
    });
    if (best === current) return;
    if (current) current.link.removeAttribute('aria-current');
    if (best) best.link.setAttribute('aria-current', 'true');
    current = best;
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initRoute(document.getElementById('route'));
  initReveal();
  initNav();
});
