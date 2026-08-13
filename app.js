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
        var upField = document.getElementById('up-log');
        if (upField) upField.value = name;
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


/* -- upgrade to Team -------------------------------------------------------
 * Stripe asks the buyer to type which log they are paying for, and a Payment
 * Link cannot have a custom field prefilled -- only client_reference_id and
 * the utm_* parameters are accepted in the URL. A typo in that field is
 * expensive: notary/billing.py cannot resolve the origin, logs an error and
 * returns handled:false, so the card is charged and the tier never moves.
 *
 * So the name is checked here against the public checkpoint endpoint, which
 * needs no credential and answers 404 for a log that does not exist, and is
 * then also passed as client_reference_id -- the webhook's last-resort source
 * for the origin, so a name mistyped on Stripe's own page is still
 * recoverable by hand.
 *
 * A failure to CHECK never blocks the payment. Refusing someone's money
 * because our own endpoint had a bad moment is worse than a name we could not
 * verify, so that path offers to continue anyway.
 */
(function () {
  var API = 'https://api.rootwitness.com';
  var NAME_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

  /* Both tiers go through the same check. Regulated is the more expensive
   * mistake by a factor of eight, so it is the last one that should have
   * been left pointing straight at Stripe. */
  var TIERS = {
    team: {
      link: 'https://buy.stripe.com/14A5kC1S2bwcgmicAV7Vm00',
      label: 'Check the name and continue \u2014 $99 / month'
    },
    regulated: {
      link: 'https://buy.stripe.com/14A5kC0NY0Ry5HE30l7Vm01',
      label: 'Check the name and continue \u2014 $799 / month'
    }
  };

  var form = document.getElementById('upgrade-form');
  if (!form || !window.fetch) return;
  var input = document.getElementById('up-log');
  var msg = document.getElementById('up-msg');
  var button = document.getElementById('up-go');
  var regnote = document.getElementById('up-regnote');
  var radios = form.querySelectorAll('input[name="tier"]');

  function currentTier() {
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked && TIERS[radios[i].value]) return radios[i].value;
    }
    return 'team';
  }

  function syncTier() {
    var tier = currentTier();
    button.textContent = TIERS[tier].label;
    if (regnote) { regnote.hidden = (tier !== 'regulated'); }
    var stale = document.getElementById('up-anyway');
    if (stale) stale.parentNode.removeChild(stale);
    say('');
  }

  for (var r = 0; r < radios.length; r++) {
    radios[r].addEventListener('change', syncTier);
  }

  /* The Regulated card's link now lands here instead of on Stripe. */
  var regJump = document.getElementById('reg-jump');
  if (regJump) {
    regJump.addEventListener('click', function () {
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = (radios[i].value === 'regulated');
      }
      syncTier();
      window.setTimeout(function () { input.focus(); }, 200);
    });
  }

  function say(text, state) {
    msg.textContent = text;
    if (state) { msg.setAttribute('data-state', state); }
    else { msg.removeAttribute('data-state'); }
  }

  function checkoutUrl(name) {
    return TIERS[currentTier()].link + '?client_reference_id=' + encodeURIComponent(name);
  }

  /* Accept what people actually paste: a bare name, a full log URL, a
   * host and path. Anything else fails the pattern test below. */
  function clean(raw) {
    var value = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (value.indexOf('/') !== -1) { value = value.slice(value.lastIndexOf('/') + 1); }
    return value;
  }

  function offerAnyway(name) {
    if (document.getElementById('up-anyway')) return;
    var link = document.createElement('a');
    link.id = 'up-anyway';
    link.className = 'up-anyway';
    link.href = checkoutUrl(name);
    link.textContent = 'Continue to checkout anyway';
    msg.parentNode.insertBefore(link, msg.nextSibling);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var existing = document.getElementById('up-anyway');
    if (existing) existing.parentNode.removeChild(existing);

    var name = clean(input.value);
    input.value = name;
    if (!NAME_RE.test(name)) {
      say('That does not look like a log name. Lowercase letters, numbers and dashes.', 'error');
      input.focus();
      return;
    }

    button.disabled = true;
    say('Checking that log exists\u2026');

    fetch(API + '/' + encodeURIComponent(name) + '/checkpoint', { cache: 'no-store' })
      .then(function (response) {
        button.disabled = false;
        if (response.ok) {
          say('Found it. Sending you to checkout\u2026', 'ok');
          window.location.href = checkoutUrl(name);
          return;
        }
        if (response.status === 404) {
          say('There is no log called \u201c' + name + '\u201d. Check the spelling \u2014 paying for a '
              + 'log that does not exist will not create it.', 'error');
          return;
        }
        say('Could not check that name just now (HTTP ' + response.status + ').', 'error');
        offerAnyway(name);
      })
      .catch(function () {
        button.disabled = false;
        say('Could not reach the service to check that name.', 'error');
        offerAnyway(name);
      });
  });
})();
