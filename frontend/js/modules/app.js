/**
 * app.js — Minza Health Global Bootstrap
 * ========================================
 * Loaded as a CLASSIC (non-module) script on every page.
 * Must NOT re-declare anything that ES Module pages import.
 *
 * Responsibilities:
 *   1. Mark the active nav tab based on current URL
 *   2. Wire up connectivity pill if present on the page
 *   3. Expose a lightweight global toast function for non-module fallback
 *   4. Log environment info for debugging
 *
 * What this file must NOT do:
 *   - Redefine apiRequest, auth functions, or any module export
 *   - Call protectRoute() (modules handle that themselves)
 *   - Perform any fetch() calls
 */
 
(function () {
  'use strict';
 
  // 1. Active nav tab 
  // Adds nav__tab--active to whichever tab matches the current filename.
  document.addEventListener('DOMContentLoaded', function () {
    const current = window.location.pathname.split('/').pop(); // e.g. "dashboard.html"
    document.querySelectorAll('.nav__tab').forEach(function (tab) {
      const href = tab.getAttribute('href');
      if (href && href.split('/').pop() === current) {
        tab.classList.add('nav__tab--active');
      }
    });
  });
 
  // 2. Global toast fallback 
  // Only defined if the module version hasn't already set window.showToast.
  // ES module pages will use their imported showToast — this is only for
  // legacy inline scripts or error pages.
  if (typeof window.showToast === 'undefined') {
    window.showToast = function (message, type) {
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent  = message || '';
      el.className    = 'toast toast--visible' + (type ? ' toast--' + type : '');
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(function () {
        el.className = 'toast';
      }, 3500);
    };
  }
 
  // 3. Connectivity pill (passive observer) 
  // The ES module ui.js initConnPill() subscribes to api.js onConnChange.
  // This is a fallback for pages that don't call initConnPill().
  document.addEventListener('DOMContentLoaded', function () {
    const pill = document.getElementById('conn-pill');
    if (!pill) return;
 
    function update(online) {
      pill.textContent = online ? 'Online' : 'Offline';
      pill.className   = 'conn-pill conn-pill--' + (online ? 'online' : 'offline');
    }
 
    // Only set up raw listeners if the module system didn't already wire this
    if (!pill.dataset.moduleWired) {
      update(navigator.onLine);
      window.addEventListener('online',  function () { update(true);  });
      window.addEventListener('offline', function () { update(false); });
    }
  });
 
  // 4. Debug info (development only) 
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalhost) {
    console.log(
      '%c Minza Health ',
      'background:#0D6E6E;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px;',
      '| Page:', window.location.pathname,
      '| Online:', navigator.onLine
    );
  }
 
})();