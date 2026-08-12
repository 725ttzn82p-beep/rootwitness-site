// theme toggle (in-memory only — sandboxed iframes block storage)
(function () {
  var root = document.documentElement;
  // Dark is the intended default for this site; the toggle offers light for
  // bright-office / printed-review situations.
  root.setAttribute('data-theme', 'dark');
  var btn = document.getElementById('theme');
  if (btn) {
    btn.addEventListener('click', function () {
      root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }
})();

// copy buttons on code blocks
(function () {
  document.querySelectorAll('.codeblock').forEach(function (block) {
    var btn = block.querySelector('.copy');
    var code = block.querySelector('code');
    if (!btn || !code) return;
    btn.addEventListener('click', function () {
      var text = code.innerText;
      var done = function () {
        btn.textContent = 'copied';
        btn.setAttribute('data-done', '1');
        setTimeout(function () { btn.textContent = 'copy'; btn.removeAttribute('data-done'); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
      } else { fallback(text, done); }
    });
  });
  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'absolute'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }
})();

// docs: highlight the section currently in view
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  var map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var a = map[e.target.id];
      if (a && e.isIntersecting) {
        links.forEach(function (l) { l.style.color = ''; });
        a.style.color = 'var(--accent)';
      }
    });
  }, { rootMargin: '-80px 0px -70% 0px' });
  Object.keys(map).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) obs.observe(el);
  });
})();
