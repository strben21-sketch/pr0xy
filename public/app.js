
const $ = (id) => document.getElementById(id);

const tabs = [];
let activeId = null;
let nextId = 1;
const bookmarks = [];

function normalizeInput(value) {
  const input = value.trim();
  if (!input) return null;

  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  // Treat spaces and common search phrases as search queries.
  if (/\s/.test(input) || !input.includes(".")) {
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  }

  try {
    return new URL(`https://${input}`).href;
  } catch {
    return null;
  }
}

function currentTab() {
  return tabs.find(tab => tab.id === activeId);
}

function makeTab(url = null) {
  const tab = {
    id: nextId++,
    title: "New tab",
    url: null,
    history: [],
    index: -1
  };

  tabs.push(tab);
  activeId = tab.id;

  if (url) navigate(url);
  else render();

  return tab;
}

function renderTabs() {
  const container = $("tabs");
  container.replaceChildren();

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.className = `tab${tab.id === activeId ? " active" : ""}`;
    button.type = "button";
    button.title = tab.url || "New tab";

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = tab.title;

    const close = document.createElement("span");
    close.className = "close-tab";
    close.textContent = "×";
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", `Close ${tab.title}`);

    close.addEventListener("click", event => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    button.addEventListener("click", () => {
      activeId = tab.id;
      render();
    });

    button.append(label, close);
    container.append(button);
  }
}

function render() {
  const tab = currentTab();
  if (!tab) return;

  renderTabs();
  $("address").value = tab.url || "";
  $("back").disabled = tab.index <= 0;
  $("forward").disabled = tab.index >= tab.history.length - 1;

  const isHome = !tab.url;
  $("start-page").hidden = !isHome;
  $("page-view").hidden = isHome;

  if (isHome) {
    $("search").value = "";
  }
}

function navigate(rawUrl, { replace = false } = {}) {
  const url = normalizeInput(rawUrl);
  if (!url) {
    alert("Enter a valid website address or search phrase.");
    return;
  }

  const tab = currentTab();
  if (!tab) return;

  if (replace && tab.index >= 0) {
    tab.history[tab.index] = url;
  } else {
    tab.history = tab.history.slice(0, tab.index + 1);
    tab.history.push(url);
    tab.index = tab.history.length - 1;
  }

  tab.url = url;
  try {
    tab.title = new URL(url).hostname;
  } catch {
    tab.title = "Website";
  }

  render();
  loadPage(tab);
}

function loadPage(tab) {
  if (tab.id !== activeId || !tab.url) return;

  const frame = $("page-frame");
  $("loading").hidden = false;
  $("loading").textContent = `Loading ${tab.url}…`;

  // The frame only receives pages fetched by our server.
  frame.onload = () => {
    if (tab.id === activeId) {
      $("loading").hidden = true;
      try {
        const title = frame.contentDocument?.title;
        if (title && title.trim()) {
          tab.title = title.trim().slice(0, 80);
          renderTabs();
        }
      } catch {
        // The sandbox deliberately isolates proxied content.
      }
    }
  };

  frame.src = `/view?url=${encodeURIComponent(tab.url)}`;
}

function closeTab(id) {
  const index = tabs.findIndex(tab => tab.id === id);
  if (index === -1) return;

  tabs.splice(index, 1);

  if (!tabs.length) {
    activeId = null;
    makeTab();
    return;
  }

  if (activeId === id) {
    activeId = tabs[Math.min(index, tabs.length - 1)].id;
  }

  render();
  const tab = currentTab();
  if (tab.url) loadPage(tab);
  else $("page-frame").removeAttribute("src");
}

function goBack() {
  const tab = currentTab();
  if (!tab || tab.index <= 0) return;
  tab.index--;
  tab.url = tab.history[tab.index];
  render();
  loadPage(tab);
}

function goForward() {
  const tab = currentTab();
  if (!tab || tab.index >= tab.history.length - 1) return;
  tab.index++;
  tab.url = tab.history[tab.index];
  render();
  loadPage(tab);
}

function goHome() {
  const tab = currentTab();
  if (!tab) return;
  tab.url = null;
  render();
  $("page-frame").removeAttribute("src");
}

$("address-form").addEventListener("submit", event => {
  event.preventDefault();
  navigate($("address").value);
});

$("search-form").addEventListener("submit", event => {
  event.preventDefault();
  navigate($("search").value);
});

$("new-tab").addEventListener("click", () => makeTab());
$("back").addEventListener("click", goBack);
$("forward").addEventListener("click", goForward);
$("home").addEventListener("click", goHome);

$("reload").addEventListener("click", () => {
  const tab = currentTab();
  if (tab?.url) loadPage(tab);
  else render();
});

$("bookmark").addEventListener("click", () => {
  const tab = currentTab();
  if (!tab?.url) {
    alert("Open a page before bookmarking it.");
    return;
  }

  if (bookmarks.some(item => item.url === tab.url)) {
    alert("This page is already bookmarked.");
    return;
  }

  const name = prompt("Bookmark name:", tab.title);
  if (name === null) return;

  bookmarks.push({ name: name.trim() || tab.title, url: tab.url });
  renderBookmarks();
});

function renderBookmarks() {
  const container = $("bookmarks");
  container.replaceChildren();

  for (const item of bookmarks) {
    const button = document.createElement("button");
    button.textContent = item.name;
    button.title = item.url;
    button.addEventListener("click", () => navigate(item.url));
    container.append(button);
  }
}

document.querySelectorAll("[data-url]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.url));
});

document.addEventListener("keydown", event => {
  const mac = navigator.platform.toLowerCase().includes("mac");
  const mod = mac ? event.metaKey : event.ctrlKey;

  if (mod && event.key.toLowerCase() === "t") {
    event.preventDefault();
    makeTab();
  }

  if (mod && event.key.toLowerCase() === "w") {
    event.preventDefault();
    closeTab(activeId);
  }

  if (mod && event.key.toLowerCase() === "l") {
    event.preventDefault();
    $("address").focus();
    $("address").select();
  }

  if (event.altKey && event.key === "ArrowLeft") goBack();
  if (event.altKey && event.key === "ArrowRight") goForward();
});

makeTab();
