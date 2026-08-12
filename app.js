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

/* -- signup ---------------------------------------------------------------
 * Talks to the live Notary service. The API key comes back exactly once, so
 * this deliberately renders it into the page and tells the user to save it
 * rather than silently relying on them noticing.
 */
(function () {
  var API = 'https://api.rootwitness.com';
  var form = document.getElementById('signup-form');
  if (!form) return;

  var email = document.getElementById('su-email');
  var logName = document.getElementById('su-log');
  var button = document.getElementById('su-go');
  var msg = document.getElementById('su-msg');
  var out = document.getElementById('su-out');

  function say(text, state) {
    msg.textContent = text;
    if (state) { msg.setAttribute('data-state', state); }
    else { msg.removeAttribute('data-state'); }
  }

  // Clear the invalid marker as soon as the user starts correcting the field.
  // Leaving a red border on a box the user has already fixed reads as though
  // the page is not listening to them.
  [email, logName].forEach(function (field) {
    field.addEventListener('input', function () {
      if (field.getAttribute('aria-invalid') === 'true') {
        field.removeAttribute('aria-invalid');
        say('');
      }
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var addr = email.value.trim();
    var name = logName.value.trim().toLowerCase();
    email.removeAttribute('aria-invalid');
    logName.removeAttribute('aria-invalid');

    if (!addr || addr.indexOf('@') < 1) {
      email.setAttribute('aria-invalid', 'true');
      say('That email does not look right.', 'error');
      email.focus();
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name)) {
      logName.setAttribute('aria-invalid', 'true');
      say('Log names use lowercase letters, numbers and dashes, 3 to 32 characters.', 'error');
      logName.focus();
      return;
    }

    button.disabled = true;
    say('Creating your log\u2026');

    fetch(API + '/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addr, log_name: name })
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          var detail = result.body && result.body.detail;
          if (typeof detail !== 'string') {
            detail = result.status === 429
              ? 'Too many signups from your address just now. Try again in a minute.'
              : 'Signup failed (HTTP ' + result.status + ').';
          }
          say(detail, 'error');
          button.disabled = false;
          return;
        }

        var data = result.body;
        document.getElementById('out-origin').textContent = data.origin;
        document.getElementById('out-key').textContent = data.api_key;
        document.getElementById('out-cmd').textContent =
          'pip install git+https://github.com/725ttzn82p-beep/rootwitness\n\n' +
          'rootwitness init \\\n' +
          '  --origin ' + data.origin + ' \\\n' +
          '  --log-key ' + data.public_key + '\n\n' +
          'rootwitness check';
        out.hidden = false;
        say('Log created. Save your API key now \u2014 it is not shown again.', 'ok');
        button.textContent = 'Log created';
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
      .catch(function () {
        say('Could not reach the service. Check your connection and try again.', 'error');
        button.disabled = false;
      });
  });
})();

/* -- live checkpoint in the footer ---------------------------------------
 * The footer shows a real checkpoint fetched from the public demo log. It
 * needs no credential, which is the entire claim: verification data is public.
 * If the fetch fails the pre-rendered value stays, so the footer never breaks.
 */
(function () {
  var el = document.getElementById('live-checkpoint');
  if (!el || !window.fetch) return;
  var LOG = 'https://api.rootwitness.com/demo';

  fetch(LOG + '/checkpoint', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
    .then(function (note) {
      var lines = note.split('\n');
      // Line 0 is the origin the log signed. Render THAT rather than a
      // hardcoded host: a label that disagrees with the signed origin is
      // exactly what a tampered-with log would look like to a witness, so the
      // page must never invent one.
      var origin = (lines[0] || '').replace(/^https?:\/\//, '');
      var size = lines[1];
      var root = lines[2] || '';
      if (!origin || !size || !root) return;
      el.textContent =
        'checkpoint ' + origin + ' \u00b7 ' +
        size + ' \u00b7 ' + root.slice(0, 8) + '\u2026' + root.slice(-8);
      el.title = 'Fetched live. No credential required.';
    })
    .catch(function () { /* keep the pre-rendered value */ });
})();
