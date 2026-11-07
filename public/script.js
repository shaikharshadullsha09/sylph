const appEl = document.getElementById("app");
const scrim = document.getElementById("scrim");
const menuBtn = document.getElementById("menu-btn");
const closeBtn = document.getElementById("close-btn");
const themeBtn = document.getElementById("theme-btn");
const sideNewBtn = document.getElementById("new-chat-btn");
const topNewBtn = document.getElementById("new-chat-top");
const searchEl = document.getElementById("search");
const chatList = document.getElementById("chat-list");
const chatTitle = document.getElementById("chat-title");
const chatPersona = document.getElementById("chat-persona");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");

const WIDE_SCREEN = 900;

// Static icon markup written by us (never user or AI text).
const MOON = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>`;
const SUN = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>`;

// Display text for each persona (the system prompts stay on the server).
const FLAVOUR = {
  general: {
    tagline: "Everyday questions, explained plainly.",
    hint: "Ask me anything",
    starters: [
      "Explain how the internet works, simply",
      "Help me plan a productive weekend",
      "Give me five fun facts about space",
    ],
  },
  cooking: {
    tagline: "Recipes, substitutions and fixes for dinners gone sideways.",
    hint: "What's in your kitchen?",
    starters: [
      "What can I make with eggs, rice and spinach?",
      "Plan a week of quick vegetarian dinners",
      "How do I keep rice from turning mushy?",
    ],
  },
  study: {
    tagline: "Concepts explained step by step, then a quick quiz.",
    hint: "What are you studying?",
    starters: [
      "Explain photosynthesis like I'm new to it",
      "Quiz me on basic Python concepts",
      "Help me make a revision plan for next week",
    ],
  },
  coding: {
    tagline: "Debugging help and clear explanations of how code works.",
    hint: "Describe the bug or paste an error",
    starters: [
      "Explain what a Python dictionary is",
      "Why does my code say IndexError?",
      "Review the logic of a simple login function",
    ],
  },
};

let personas = {};
let allChats = [];
let currentId = null;
let currentPersonaName = "MultiBot";
let busy = false;
let starting = false;
let introPlayed = false;

/* ---------- helpers ---------- */

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function flavour(key) {
  return FLAVOUR[key] || { tagline: "", hint: "Message", starters: [] };
}

function shortName(name) {
  return name.replace(/ (Assistant|Buddy|Helper)$/, "");
}

function setTheme(key) {
  document.body.dataset.persona = personas[key] ? key : "general";
}

function store(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: ignore */ }
}

function renderMarkdown(text) {
  // AI text is untrusted: parse the markdown, then sanitize the HTML.
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(text));
  }
  return null; // libraries failed to load: caller falls back to plain text
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}

function setInputEnabled(enabled) {
  input.disabled = !enabled;
  sendBtn.disabled = !enabled;
  if (enabled) input.focus();
  autoGrow();
}

/* ---------- sidebar and theme ---------- */

function isWide() {
  return window.innerWidth >= WIDE_SCREEN;
}

function setSidebar(open, remember) {
  appEl.classList.toggle("side-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Hide sidebar" : "Show sidebar");
  if (remember && isWide()) store("sylph-sidebar", open ? "open" : "closed");
}

function toggleSidebar() {
  setSidebar(!appEl.classList.contains("side-open"), true);
}

function applyTheme(theme, remember) {
  document.documentElement.dataset.theme = theme;
  themeBtn.innerHTML = theme === "dark" ? SUN : MOON;
  themeBtn.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  );
  if (remember) store("sylph-theme", theme);
}

/* ---------- message rows ---------- */

function addRow(className, labelText) {
  const row = document.createElement("div");
  row.className = "row " + className;

  const msg = document.createElement("div");
  msg.className = "msg";

  if (labelText) {
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = labelText;
    msg.appendChild(label);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  msg.appendChild(bubble);

  row.appendChild(msg);
  messagesEl.appendChild(row);
  return { row, msg, bubble };
}

function makeCopyButton(text) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-btn";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch (err) {
      btn.textContent = "Couldn't copy";
    }
    setTimeout(() => { btn.textContent = "Copy"; }, 1600);
  });
  return btn;
}

function addBubble(role, text) {
  const { msg, bubble } = addRow(role, role === "user" ? "Me" : currentPersonaName);
  if (role === "model") {
    const html = renderMarkdown(text);
    if (html !== null) bubble.innerHTML = html;
    else bubble.textContent = text;

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.appendChild(makeCopyButton(text));
    msg.appendChild(actions);
  } else {
    bubble.textContent = text; // user text is never treated as HTML
  }
  scrollToBottom();
}

function addTyping() {
  const { row, bubble } = addRow("model typing", currentPersonaName);
  bubble.setAttribute("aria-label", "Thinking");
  const skeleton = document.createElement("div");
  skeleton.className = "skeleton";
  for (let i = 0; i < 3; i++) {
    const line = document.createElement("span");
    line.className = "sk";
    skeleton.appendChild(line);
  }
  bubble.appendChild(skeleton);
  scrollToBottom();
  return row;
}

function addError(text) {
  const { bubble } = addRow("error", "");
  bubble.textContent = text;
  scrollToBottom();
}

/* ---------- wordmark and start screen ---------- */

function makeHeroWordmark(animate) {
  const wrap = document.createElement("div");
  wrap.className = "wordmark hero";
  wrap.setAttribute("aria-label", "SYLPH, a multibot");

  const big = document.createElement("span");
  big.className = "wm-big";
  "SYLPH".split("").forEach((letter, i) => {
    const span = document.createElement("span");
    span.textContent = letter;
    if (animate) {
      span.className = "wm-letter";
      span.style.animationDelay = i * 0.09 + "s";
    }
    big.appendChild(span);
  });

  const small = document.createElement("span");
  small.className = "wm-small";
  small.textContent = "~a multibot";

  wrap.append(big, small);
  return wrap;
}

function showEmptyState() {
  currentId = null;
  currentPersonaName = "MultiBot";
  setTheme("general");
  chatPersona.textContent = "";
  chatTitle.textContent = "";
  input.placeholder = flavour("general").hint;
  setInputEnabled(true);
  messagesEl.innerHTML = "";

  const welcome = document.createElement("section");
  welcome.className = "welcome";

  const sub = document.createElement("p");
  sub.className = "welcome-sub";
  sub.textContent = "Ask anything, or start with a specialist.";

  const chips = document.createElement("div");
  chips.className = "chips";

  const hint = document.createElement("p");
  hint.className = "welcome-hint";

  Object.values(personas).forEach((persona) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";

    const emoji = document.createElement("span");
    emoji.textContent = persona.icon;
    const name = document.createElement("span");
    name.textContent = persona.name;
    chip.append(emoji, name);

    // Hovering or focusing a chip previews that specialist's colours.
    const preview = () => {
      setTheme(persona.key);
      hint.textContent = flavour(persona.key).tagline;
    };
    const restore = () => {
      if (currentId === null) {
        setTheme("general");
        hint.textContent = "";
      }
    };
    chip.addEventListener("mouseenter", preview);
    chip.addEventListener("focus", preview);
    chip.addEventListener("mouseleave", restore);
    chip.addEventListener("blur", restore);
    chip.addEventListener("click", () => createConversation(persona.key));

    chips.appendChild(chip);
  });

  welcome.append(makeHeroWordmark(!introPlayed), sub, chips, hint);
  messagesEl.appendChild(welcome);
  introPlayed = true;
}

function showStarter(personaKey) {
  const persona = personas[personaKey];
  const info = flavour(personaKey);

  const box = document.createElement("section");
  box.className = "starter";

  const icon = document.createElement("div");
  icon.className = "starter-icon";
  icon.textContent = persona ? persona.icon : "💬";

  const title = document.createElement("h3");
  title.textContent = persona ? persona.name + " is ready" : "Ready when you are";

  const tagline = document.createElement("p");
  tagline.textContent = info.tagline;

  const list = document.createElement("div");
  list.className = "starter-list";
  info.starters.forEach((prompt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "starter-btn";
    btn.textContent = prompt;
    btn.addEventListener("click", () => {
      if (busy) return;
      input.value = prompt;
      form.requestSubmit();
    });
    list.appendChild(btn);
  });

  box.append(icon, title, tagline, list);
  messagesEl.appendChild(box);
}

/* ---------- personas and chat list ---------- */

async function loadPersonas() {
  const list = await api("/api/personas");
  list.forEach((p) => { personas[p.key] = p; });
}

function makeIconButton(label, action, tip) {
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.type = "button";
  btn.textContent = label;
  btn.dataset.action = action;
  btn.title = tip;
  btn.setAttribute("aria-label", tip);
  return btn;
}

function renderChatList() {
  const term = searchEl.value.trim().toLowerCase();
  const shown = allChats.filter((c) => c.title.toLowerCase().includes(term));

  chatList.innerHTML = "";

  if (shown.length === 0) {
    const empty = document.createElement("li");
    empty.className = "chat-empty";
    empty.textContent = allChats.length === 0 ? "No chats yet. Start one above." : "No chats match your search.";
    chatList.appendChild(empty);
    return;
  }

  shown.forEach((c) => {
    const li = document.createElement("li");
    li.className = "chat-item" + (c.id === currentId ? " active" : "");
    li.dataset.id = c.id;
    li.dataset.title = c.title;
    li.dataset.persona = c.persona;
    li.tabIndex = 0;

    const icon = (personas[c.persona] || {}).icon || "💬";
    const title = document.createElement("span");
    title.className = "chat-item-title";
    title.textContent = icon + "  " + c.title;

    li.append(
      title,
      makeIconButton("✎", "rename", "Rename chat"),
      makeIconButton("×", "delete", "Delete chat")
    );
    chatList.appendChild(li);
  });
}

async function loadConversations() {
  allChats = await api("/api/conversations");
  renderChatList();
}

/* ---------- conversations ---------- */

async function openConversation(id) {
  const data = await api("/api/conversations/" + id);
  currentId = data.id;
  setTheme(data.persona);

  const persona = personas[data.persona];
  currentPersonaName = persona ? persona.name : "MultiBot";
  chatPersona.textContent = persona ? persona.icon + " " + shortName(persona.name) : "";
  chatTitle.textContent = data.title;
  input.placeholder = flavour(data.persona).hint;

  messagesEl.innerHTML = "";
  if (data.messages.length === 0) showStarter(data.persona);
  else data.messages.forEach((m) => addBubble(m.role, m.content));

  setInputEnabled(true);
  await loadConversations();
  if (!isWide()) setSidebar(false, false);
}

async function createConversation(personaKey) {
  if (busy || starting) return null;
  starting = true;
  try {
    const conversation = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ persona: personaKey }),
    });
    await openConversation(conversation.id);
    return conversation.id;
  } catch (err) {
    alert(err.message);
    return null;
  } finally {
    starting = false;
  }
}

async function renameConversation(id, currentTitle) {
  const newTitle = prompt("Rename chat:", currentTitle);
  if (newTitle === null || newTitle.trim() === "") return;
  try {
    const updated = await api("/api/conversations/" + id, {
      method: "PATCH",
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (id === currentId) chatTitle.textContent = updated.title;
    await loadConversations();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteConversation(id) {
  if (!confirm("Delete this chat and all its messages?")) return;
  try {
    await api("/api/conversations/" + id, { method: "DELETE" });
    if (id === currentId) showEmptyState();
    await loadConversations();
  } catch (err) {
    alert(err.message);
  }
}

async function startNewChat() {
  if (busy) return;
  showEmptyState();
  await loadConversations();
  if (!isWide()) setSidebar(false, false);
}

/* ---------- sending messages ---------- */

async function sendMessage(text) {
  const sendingTo = currentId;
  busy = true;
  setInputEnabled(false);

  const starter = messagesEl.querySelector(".starter");
  if (starter) starter.remove();

  addBubble("user", text);
  const typing = addTyping();

  try {
    const data = await api("/api/conversations/" + sendingTo + "/messages", {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });
    typing.remove();
    if (currentId === sendingTo) {
      addBubble("model", data.reply);
      chatTitle.textContent = data.title;
    }
    await loadConversations();
  } catch (err) {
    typing.remove();
    if (currentId === sendingTo) {
      addError(err.message);
      input.value = text; // give the text back so nothing is lost
    }
  } finally {
    busy = false;
    setInputEnabled(true);
  }
}

/* ---------- events ---------- */

menuBtn.addEventListener("click", toggleSidebar);
closeBtn.addEventListener("click", () => setSidebar(false, true));
scrim.addEventListener("click", () => setSidebar(false, false));
themeBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next, true);
});
sideNewBtn.addEventListener("click", startNewChat);
topNewBtn.addEventListener("click", startNewChat);
searchEl.addEventListener("input", renderChatList);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    toggleSidebar();
  }
});

chatList.addEventListener("click", (e) => {
  const li = e.target.closest(".chat-item");
  if (!li) return;
  const id = Number(li.dataset.id);
  const action = e.target.dataset.action;
  if (action === "rename") renameConversation(id, li.dataset.title);
  else if (action === "delete") deleteConversation(id);
  else if (!busy) openConversation(id);
});

chatList.addEventListener("keydown", (e) => {
  const li = e.target.closest(".chat-item");
  if (li && e.target === li && e.key === "Enter" && !busy) {
    openConversation(Number(li.dataset.id));
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy || starting) return;

  // Typing on the start screen begins a General chat automatically.
  if (currentId === null) {
    const id = await createConversation("general");
    if (id === null) return;
  }

  input.value = "";
  autoGrow();
  sendMessage(text);
});

input.addEventListener("input", autoGrow);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

/* ---------- start ---------- */

(async function init() {
  applyTheme(document.documentElement.dataset.theme || "light", false);

  let saved = null;
  try { saved = localStorage.getItem("sylph-sidebar"); } catch (e) { /* ignore */ }
  setSidebar(isWide() && saved !== "closed", false);

  try {
    await loadPersonas();
    showEmptyState();
    await loadConversations();
  } catch (err) {
    showEmptyState();
    addError("Could not load SYLPH: " + err.message);
  }
})();