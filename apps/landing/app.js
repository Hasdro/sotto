// Language, theme and download wiring. No framework. Downloads come from downloads.json (scripts/downloads-manifest.mjs).
(() => {
  var store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch (_e) {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch (_e) {}
    },
  };
  var lang = store.get("lang") || ((navigator.language || "en").slice(0, 2) === "ar" ? "ar" : "en");
  function t(k) {
    return window.I18N[lang]?.[k] || window.I18N.en[k] || k;
  }
  function esc(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function isDark() {
    var th = document.documentElement.dataset.theme;
    return th === "dark" || (!th && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  // The button names the theme it switches to; aria-pressed says whether dark is on.
  function themeLabel() {
    var tb = document.getElementById("theme-btn");
    if (!tb) return;
    tb.textContent = isDark() ? t("ui.light") : t("ui.dark");
    tb.setAttribute("aria-pressed", isDark() ? "true" : "false");
  }
  function applyLang() {
    var h = document.documentElement;
    h.lang = lang;
    h.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
      el.setAttribute("alt", t(el.getAttribute("data-i18n-alt")));
    });
    var lb = document.getElementById("lang-btn");
    if (lb) {
      lb.textContent = t("ui.lang");
      lb.lang = lang === "ar" ? "en" : "ar";
    }
    themeLabel();
    renderDownloads();
  }

  // null = still loading, false = failed, object = manifest
  var manifest = null;
  function href(key) {
    return `/downloads/${encodeURIComponent(manifest.files[key].file)}`;
  }
  function mb(n) {
    return `${(n / 1048576).toFixed(0)} ${t("dl.size")}`;
  }
  // One build: a button, then size and a checksum the visitor can compare.
  function file(key, label, primary) {
    var f = manifest.files[key];
    return (
      '<div class="file"><a class="ss-btn ss-btn--lg ' +
      (primary ? "ss-btn--primary" : "file-btn") +
      '" href="' +
      href(key) +
      '" download>' +
      esc(label) +
      '</a><p class="meta">' +
      esc(mb(f.size)) +
      " · " +
      esc(t("dl.sha")) +
      ' <code dir="ltr">' +
      esc(f.sha256.slice(0, 16)) +
      "…</code></p></div>"
    );
  }
  function fail(el) {
    el.innerHTML =
      '<p class="meta">' +
      esc(t("dl.unavailable")) +
      ' <a href="mailto:sotto@agncompu.com?subject=AGN%20Sales%20Shield%20download">' +
      esc(t("dl.ask")) +
      "</a></p>";
  }
  function renderDownloads() {
    var hero = document.getElementById("hero-dl"),
      mac = document.getElementById("dl-mac"),
      win = document.getElementById("dl-win"),
      lead = document.getElementById("dl-lead");
    if (!hero || manifest === null) return;
    if (manifest === false) {
      [hero, mac, win].forEach(fail);
      return;
    }
    var ua = navigator.userAgent || "",
      isMac = /Mac/.test(ua) && !/iPhone|iPad|Mobile/.test(ua),
      isWin = /Windows/.test(ua);
    var ver = `${t("dl.ver")} ${manifest.version}`;
    // The hero button follows the visitor's platform; phones and Linux get the section link.
    if (isMac || isWin) {
      hero.innerHTML =
        '<a class="ss-btn ss-btn--lg ss-btn--primary" href="' +
        href(isMac ? "mac-arm64" : "win-x64") +
        '" download>' +
        esc(isMac ? t("dl.mac") : t("dl.win")) +
        '</a><p class="meta">' +
        esc(isMac ? t("dl.armShort") : "Windows 10+") +
        " · " +
        esc(ver) +
        ' · <a href="#download">' +
        esc(t("dl.other")) +
        "</a></p>";
    } else {
      hero.innerHTML =
        '<a class="ss-btn ss-btn--lg ss-btn--primary" href="#download">' +
        esc(t("dl.desktop")) +
        '</a><p class="meta">' +
        esc(t("dl.desktopNote")) +
        "</p>";
    }
    if (lead) lead.textContent = `${t("dl.lead")} ${ver}.`;
    mac.innerHTML = file("mac-arm64", t("dl.arm"), false) + file("mac-x64", t("dl.x64"), false);
    win.innerHTML = file("win-x64", t("dl.winInstaller"), false);
  }

  document.addEventListener("DOMContentLoaded", () => {
    var lb = document.getElementById("lang-btn"),
      tb = document.getElementById("theme-btn");
    var th = store.get("theme");
    if (th) document.documentElement.dataset.theme = th;
    if (lb)
      lb.addEventListener("click", () => {
        lang = lang === "ar" ? "en" : "ar";
        store.set("lang", lang);
        applyLang();
      });
    if (tb)
      tb.addEventListener("click", () => {
        var next = isDark() ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        store.set("theme", next);
        themeLabel();
      });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", themeLabel);
    applyLang();
    if (document.getElementById("hero-dl")) {
      fetch("downloads.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : false))
        .then((m) => {
          manifest = m?.files ? m : false;
          renderDownloads();
        })
        .catch(() => {
          manifest = false;
          renderDownloads();
        });
    }
  });
})();
