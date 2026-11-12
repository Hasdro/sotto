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
  function applyLang() {
    var h = document.documentElement;
    h.lang = lang;
    h.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    renderDownloads();
  }
  var manifest = null;
  function mb(n) {
    return `${(n / 1048576).toFixed(0)} ${t("dl.size")}`;
  }
  function link(key, label, sub) {
    var f = manifest.files[key];
    return (
      '<a class="btn" href="/downloads/' +
      encodeURIComponent(f.file) +
      '" download>' +
      label +
      "</a>" +
      '<div class="meta">' +
      sub +
      " · " +
      mb(f.size) +
      "<br>" +
      t("dl.sha") +
      ": <code>" +
      f.sha256.slice(0, 16) +
      "…</code></div>"
    );
  }
  function renderDownloads() {
    var hero = document.getElementById("hero-dl"),
      all = document.getElementById("all-dl");
    if (!hero) return;
    if (!manifest) {
      hero.textContent = t("dl.unavailable");
      all.textContent = "";
      return;
    }
    var ua = navigator.userAgent || "",
      isMac = /Mac/.test(ua) && !/iPhone|iPad/.test(ua);
    var heroKey = isMac ? "mac-arm64" : "win-x64";
    hero.innerHTML = isMac
      ? link("mac-arm64", `${t("dl.mac")} (${t("dl.arm")})`, `${t("dl.ver")} ${manifest.version}`) +
        '<p class="meta"><a href="#download">' +
        t("dl.x64") +
        " · " +
        t("dl.win") +
        "</a></p>"
      : `${link("win-x64", t("dl.win"), `${t("dl.ver")} ${manifest.version}`)}<p class="meta"><a href="#download">${t("dl.mac")}</a></p>`;
    all.innerHTML =
      '<div class="card"><h3>macOS</h3>' +
      link("mac-arm64", t("dl.arm"), `${t("dl.ver")} ${manifest.version}`) +
      "<br>" +
      link("mac-x64", t("dl.x64"), `${t("dl.ver")} ${manifest.version}`) +
      "</div>" +
      '<div class="card"><h3>Windows</h3>' +
      link("win-x64", t("dl.win"), `${t("dl.ver")} ${manifest.version}`) +
      "</div>";
    void heroKey;
  }
  document.addEventListener("DOMContentLoaded", () => {
    var lb = document.getElementById("lang-btn"),
      tb = document.getElementById("theme-btn");
    if (lb)
      lb.addEventListener("click", () => {
        lang = lang === "ar" ? "en" : "ar";
        store.set("lang", lang);
        lb.textContent = t("ui.lang");
        applyLang();
      });
    if (lb) lb.textContent = t("ui.lang");
    var th = store.get("theme");
    if (th) document.documentElement.dataset.theme = th;
    if (tb)
      tb.addEventListener("click", () => {
        var dark =
          document.documentElement.dataset.theme === "dark" ||
          (!document.documentElement.dataset.theme &&
            matchMedia("(prefers-color-scheme: dark)").matches);
        var next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        store.set("theme", next);
      });
    applyLang();
    if (document.getElementById("hero-dl")) {
      fetch("downloads.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => {
          manifest = m;
          renderDownloads();
        })
        .catch(() => {});
    }
  });
})();
