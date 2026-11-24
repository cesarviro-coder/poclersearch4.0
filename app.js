const form = document.querySelector("#search-form");
const input = document.querySelector("#query");
const section = document.querySelector("#results-section");
const results = document.querySelector("#results");
const title = document.querySelector("#results-title");
const status = document.querySelector("#status");
const tabs = [...document.querySelectorAll(".tab")];

let currentQuery = "";
let currentKind = "web";
let cached = {web: null, images: null, videos: null, news: null};
let requestNumber = 0;

const esc = (value = "") => String(value).replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));
const safeUrl = value => {
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
};
const wikiLang = "https://en.wikipedia.org/w/api.php";
const commonsApi = "https://commons.wikimedia.org/w/api.php";

function card(item, image = false) {
  const url = safeUrl(item.url || item.page);
  const thumb = safeUrl(item.image || item.thumb);
  return `<article class="result-card">
    ${image && thumb ? `<a href="${esc(url || thumb)}" target="_blank" rel="noopener noreferrer"><img class="result-image" loading="lazy" src="${esc(thumb)}" alt="${esc(item.title)}"></a>` : ""}
    <div class="result-url">${esc(item.source || (url ? new URL(url).hostname : "Resultado"))}</div>
    <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.title || "Abrir resultado")}</a>` : esc(item.title || "Resultado")}</h3>
    ${item.description ? `<p>${esc(item.description)}</p>` : ""}
    ${!image && thumb ? `<img class="result-image" loading="lazy" src="${esc(thumb)}" alt="${esc(item.title)}">` : ""}
  </article>`;
}

function render(items, kind) {
  if (!items || !items.length) {
    results.innerHTML = `<div class="empty">No encontramos resultados para esta categoría. Prueba otra palabra o cambia de pestaña.</div>`;
    return;
  }
  results.innerHTML = items.map(item => card(item, kind === "images")).join("");
}

async function fetchWeb(query) {
  const url = new URL(wikiLang);
  url.search = new URLSearchParams({action:"query", generator:"search", gsrsearch:query, gsrnamespace:"0", gsrlimit:"12", prop:"extracts|pageimages|info", exintro:"1", explaintext:"1", exsentences:"3", piprop:"thumbnail", pithumbsize:"700", inprop:"url", format:"json", origin:"*"});
  const data = await fetch(url).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  return Object.values(data.query?.pages || {}).map(p => ({title:p.title, description:p.extract || "", url:p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,"_"))}`, image:p.thumbnail?.source, source:"Wikipedia"}));
}
async function fetchCommons(query, video = false) {
  const params = {action:"query", generator:"search", gsrsearch:video ? `${query} filetype:video` : query, gsrnamespace:"6", gsrlimit:"18", prop:"imageinfo", iiprop:"url|extmetadata", iiurlwidth:"700", format:"json", origin:"*"};
  const data = await fetch(commonsApi + "?" + new URLSearchParams(params)).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  return Object.values(data.query?.pages || {}).map(p => {
    const info = p.imageinfo?.[0] || {};
    const meta = info.extmetadata || {};
    const desc = (meta.ImageDescription?.value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g," ").trim();
    const page = `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,"_"))}`;
    return {title:p.title.replace(/^File:/,""), description:desc.slice(0,240), url:page, image:info.thumburl || info.url, source:"Wikimedia Commons"};
  }).filter(x => !video || /\.(webm|ogv|mp4|gif)$/i.test(x.title));
}
async function fetchNews(query) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.search = new URLSearchParams({query, mode:"ArtList", format:"json", maxrecords:"12", sort:"DateDesc"});
  const data = await fetch(url).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  return (data.articles || []).map(a => ({title:a.title || "Noticia", description:a.seendate ? `Publicado/registrado: ${a.seendate}` : (a.domain || ""), url:a.url, image:a.socialimage, source:a.domain || "Noticias"})).filter(a => safeUrl(a.url));
}

async function runSearch(kind = currentKind) {
  if (!currentQuery) return;
  currentKind = kind;
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.kind === kind));
  section.hidden = false;
  title.textContent = currentQuery;
  results.innerHTML = `<div class="empty">Buscando “${esc(currentQuery)}”…</div>`;
  status.textContent = "Buscando…";
  section.scrollIntoView({behavior:"smooth", block:"start"});
  const id = ++requestNumber;
  try {
    let items = cached[kind];
    if (!items) {
      if (kind === "web") items = await fetchWeb(currentQuery);
      if (kind === "images") items = await fetchCommons(currentQuery, false);
      if (kind === "videos") items = await fetchCommons(currentQuery, true);
      if (kind === "news") items = await fetchNews(currentQuery);
      cached[kind] = items;
    }
    if (id !== requestNumber) return;
    render(items, kind);
    status.textContent = `${items.length} resultados · ${kind === "news" ? "GDELT" : kind === "web" ? "Wikipedia" : "Wikimedia Commons"}`;
  } catch (err) {
    if (id !== requestNumber) return;
    results.innerHTML = `<div class="empty">No se pudo conectar con el servicio de búsqueda ahora mismo.<br>Comprueba tu conexión e inténtalo de nuevo.</div>`;
    status.textContent = "Servicio no disponible";
  }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  currentQuery = q;
  cached = {web:null, images:null, videos:null, news:null};
  runSearch("web");
});
tabs.forEach(tab => tab.addEventListener("click", () => runSearch(tab.dataset.kind)));
document.querySelectorAll("[data-query]").forEach(button => button.addEventListener("click", () => {
  input.value = button.dataset.query;
  form.requestSubmit();
}));
