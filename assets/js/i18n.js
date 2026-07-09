// Toggle ES/EN sin duplicar HTML: lee atributos data-i18n-* y aplica
// el diccionario correspondiente desde /assets/i18n/{lang}.json
(function () {
  const SUPPORTED = ['es', 'en'];
  const STORAGE_KEY = 'portafolio-lang';

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
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) el.textContent = dict[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
    });

    const toggle = document.querySelector('.lang-toggle');
    if (toggle) toggle.textContent = lang === 'es' ? 'EN' : 'ES';

    // Permite que páginas con contenido dinámico (tablas, charts) se
    // vuelvan a renderizar con el idioma y diccionario activos.
    document.dispatchEvent(new CustomEvent('i18n:applied', { detail: { lang, dict } }));
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = 'es';
    const dict = await loadDict(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    applyDict(dict, lang);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await setLang(detectDefaultLang());
    } catch (err) {
      console.error(err);
    }

    const toggle = document.querySelector('.lang-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = document.documentElement.lang === 'es' ? 'en' : 'es';
        setLang(next).catch((err) => console.error(err));
      });
    }
  });

  window.portafolioI18n = { setLang, getSupportedLangs: () => SUPPORTED.slice() };
})();
