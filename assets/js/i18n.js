// Toggle ES/EN sin duplicar HTML: lee atributos data-i18n-* y aplica
// el diccionario correspondiente desde /assets/i18n/{lang}.json
(function () {
  const SUPPORTED = ['es', 'en'];
  const STORAGE_KEY = 'portafolio-lang';
  let currentDict = null;
  let currentLang = null;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  function detectDefaultLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const browserLang = (navigator.language || 'es').slice(0, 2);
    return SUPPORTED.includes(browserLang) ? browserLang : 'es';
  }

  async function loadDict(lang) {
    const res = await fetch(`/assets/i18n/${lang}.json`);
    if (!res.ok) throw new Error(`No se pudo cargar el diccionario de idioma: ${lang}`);
    return res.json();
  }

  function applyDict(dict, lang) {
    currentDict = dict;
    currentLang = lang;
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) el.textContent = dict[key];
    });

    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (dict[key] !== undefined) el.innerHTML = dict[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
    });

    document.querySelectorAll('.lang-opt').forEach((btn) => {
      const isActive = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    // Permite que páginas con contenido dinámico (tablas, charts) se
    // vuelvan a renderizar con el idioma y diccionario activos.
    document.dispatchEvent(new CustomEvent('i18n:applied', { detail: { lang, dict } }));
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = 'es';
    const dict = await loadDict(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    applyDict(dict, lang);
    if (resolveReady) { resolveReady({ lang, dict }); resolveReady = null; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await setLang(detectDefaultLang());
    } catch (err) {
      console.error(err);
    }

    document.querySelectorAll('.lang-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        setLang(btn.getAttribute('data-lang')).catch((err) => console.error(err));
      });
    });
  });

  window.portafolioI18n = {
    setLang,
    getSupportedLangs: () => SUPPORTED.slice(),
    // Resuelve con { lang, dict } una vez que el idioma inicial ya se aplicó;
    // los scripts de los demos lo esperan antes de su primer render para no
    // dibujar en el idioma equivocado por una carrera con i18n.js.
    ready,
    getLang: () => currentLang,
    getDict: () => currentDict,
  };
})();
