let appSettings = null;
let currentHoveredImage = null;
let currentAnalyzeBtnContainer = null;
let currentPrompts = null;
let currentLang = "zh";
let currentImageUrl = null;
const MODAL_MORPH_DURATION = 720;

chrome.storage.local.get(["visionSettings"], res => {
  appSettings = res.visionSettings || {};
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.visionSettings) appSettings = changes.visionSettings.newValue;
});

function getThemeClass() {
  return appSettings?.theme === "light" ? "apple-theme-light" : "apple-theme-dark";
}

function normalizeButtonPosition(pos) {
  if (pos === "outside-br") return "inside-br";
  if (pos === "outside-tr") return "inside-tr";
  return pos === "inside-tr" ? "inside-tr" : "inside-br";
}

function applyButtonPosition(btn) {
  const pos = normalizeButtonPosition(appSettings?.buttonPosition);
  btn.style.bottom = "auto";
  btn.style.top = "auto";
  btn.style.left = "auto";
  btn.style.right = "auto";

  if (pos === "inside-br") {
    btn.style.bottom = "12px";
    btn.style.right = "12px";
  } else if (pos === "inside-tr") {
    btn.style.top = "12px";
    btn.style.right = "12px";
  }
}

document.addEventListener("mouseover", e => {
  if (e.target.tagName && e.target.tagName.toLowerCase() === "img") {
    if (e.target === currentHoveredImage) return;
    if (e.target.offsetWidth < 120 || e.target.offsetHeight < 120) return;

    removeCurrentAnalyzeBtn();
    currentHoveredImage = e.target;
    createAnalyzeBtnOnImage(currentHoveredImage);
  }
});

document.addEventListener("mouseout", e => {
  if (
    currentAnalyzeBtnContainer &&
    !currentAnalyzeBtnContainer.contains(e.relatedTarget) &&
    currentHoveredImage &&
    !currentHoveredImage.contains(e.relatedTarget)
  ) {
    removeCurrentAnalyzeBtn();
    currentHoveredImage = null;
  }
});

function createAnalyzeBtnOnImage(img) {
  const parent = img.parentElement;
  if (!parent) return;

  if (getComputedStyle(parent).position === "static" || !getComputedStyle(parent).position) {
    parent.style.position = "relative";
  }

  const isMini = img.offsetWidth < 280 || img.offsetHeight < 280;
  const miniClass = isMini ? "apple-hover-btn-mini" : "";

  const btnContainer = document.createElement("div");
  btnContainer.className = `apple-hover-btn-container ${getThemeClass()} ${miniClass}`;
  btnContainer.innerHTML =
    '<div class="apple-hover-btn-icon">✨</div><div class="apple-hover-btn-text">图像逆向分析</div>';
  applyButtonPosition(btnContainer);

  btnContainer.addEventListener("click", () => {
    currentImageUrl = img.src;
    try {
      chrome.runtime.sendMessage({ action: "analyze_hovered", srcUrl: currentImageUrl });
    } catch {
      alert("插件底层已更新，请按 F5 强制刷新当前网页。");
    }
  });

  parent.appendChild(btnContainer);
  currentAnalyzeBtnContainer = btnContainer;
}

function removeCurrentAnalyzeBtn() {
  if (currentAnalyzeBtnContainer) {
    currentAnalyzeBtnContainer.remove();
    currentAnalyzeBtnContainer = null;
  }
}

const triggerFromShortcut = (e, type) => {
  if (!appSettings || !appSettings.shortcut || !currentHoveredImage) return;
  const s = appSettings.shortcut;

  const matched =
    s.type === type &&
    (type === "keyboard"
      ? e.key.toLowerCase() === s.key &&
        e.ctrlKey === s.ctrlKey &&
        e.altKey === s.altKey &&
        e.shiftKey === s.shiftKey
      : e.button === s.button);

  if (!matched) return;

  e.preventDefault();
  currentImageUrl = currentHoveredImage.src;
  try {
    chrome.runtime.sendMessage({ action: "analyze_hovered", srcUrl: currentImageUrl });
  } catch {
    alert("插件底层已更新，请按 F5 强制刷新当前网页。");
  }
};

document.addEventListener("keydown", e => triggerFromShortcut(e, "keyboard"));
document.addEventListener("mousedown", e => triggerFromShortcut(e, "mouse"));

chrome.runtime.onMessage.addListener(request => {
  if (request.action === "showLoading") {
    removeCurrentAnalyzeBtn();
    renderModal(
      '<div class="apple-loading"><div class="apple-spinner"></div><span id="vision-ai-loading-text">正在启动视觉分析...</span></div>',
      true
    );
  } else if (request.action === "updateLoading") {
    const loadingText = document.getElementById("vision-ai-loading-text");
    if (loadingText) loadingText.innerText = request.message;
  } else if (request.action === "showResult") {
    currentPrompts = JSON.parse(request.data);
    updateResultUI("zh");
  } else if (request.action === "showError") {
    renderErrorBox("分析中断", request.message);
  }
});

function updateResultUI(lang = "zh") {
  currentLang = lang;

  if (document.getElementById("apple-editable-result")) {
    syncLanguageToggleState();
    animateResultLanguageSwitch(currentPrompts[currentLang] || currentPrompts.zh || "");
    return;
  }

  const fullText = currentPrompts[currentLang] || currentPrompts.zh || "没有可显示的内容。";

  const singleCardHtml = `
    <div class="apple-option-card apple-single-card">
      <div class="apple-option-text" contenteditable="true" spellcheck="false" id="apple-editable-result">${escapeHtml(fullText)}</div>
    </div>
  `;

  const footerHtml = `
    <div class="apple-footer apple-footer-centered apple-language-toggle-row">
      <div class="apple-segment-ui apple-language-toggle">
        <input type="radio" id="langZh" name="langMode" value="zh" ${currentLang === "zh" ? "checked" : ""}>
        <label for="langZh" style="padding: 4px 16px; font-size: 12px;">中文</label>
        <input type="radio" id="langEn" name="langMode" value="en" ${currentLang === "en" ? "checked" : ""}>
        <label for="langEn" style="padding: 4px 16px; font-size: 12px;">英文</label>
      </div>
    </div>
    <div class="apple-footer apple-footer-split">
      <button class="apple-card-action-btn apple-copy-btn" id="apple-final-copy-btn">
        <svg class="apple-icon" viewBox="0 0 24 24" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span class="apple-btn-text">复制结果</span>
      </button>
      <button class="apple-card-action-btn apple-refresh-btn" id="apple-final-refresh-btn" title="不满意？点击重做一版更详细的结果。">
        <svg class="apple-icon" viewBox="0 0 24 24" stroke="currentColor"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
      </button>
    </div>
  `;

  renderModal(`${singleCardHtml}${footerHtml}`, false);
  bindLanguageToggleEvents();

  document.getElementById("apple-final-copy-btn")?.addEventListener("click", e => {
    const btn = e.currentTarget;
    const editableText = document.getElementById("apple-editable-result").innerText;
    navigator.clipboard.writeText(editableText).then(() => {
      const textSpan = btn.querySelector(".apple-btn-text");
      const originalText = textSpan.innerText;
      btn.classList.add("copied-state");
      textSpan.innerText = "已复制";
      setTimeout(() => {
        btn.classList.remove("copied-state");
        textSpan.innerText = originalText;
      }, 2000);
    });
  });

  document.getElementById("apple-final-refresh-btn")?.addEventListener("click", () => {
    if (!currentImageUrl) {
      alert("找不到图片地址，无法重做。");
      return;
    }

    const btn = document.getElementById("apple-final-refresh-btn");
    btn.classList.add("apple-spinning-icon");

    try {
      chrome.runtime.sendMessage({ action: "regenerate_analysis", srcUrl: currentImageUrl });
    } catch {
      alert("插件已更新，请刷新网页。");
    }
  });
}

function bindLanguageToggleEvents() {
  document.getElementById("langZh")?.addEventListener("change", e => {
    if (e.target.checked && currentLang !== "zh") updateResultUI("zh");
  });
  document.getElementById("langEn")?.addEventListener("change", e => {
    if (e.target.checked && currentLang !== "en") updateResultUI("en");
  });
}

function syncLanguageToggleState() {
  const zhInput = document.getElementById("langZh");
  const enInput = document.getElementById("langEn");
  if (zhInput) zhInput.checked = currentLang === "zh";
  if (enInput) enInput.checked = currentLang === "en";
}

function animateResultLanguageSwitch(nextText) {
  const editable = document.getElementById("apple-editable-result");
  if (!editable || editable.innerText === nextText) return;

  const card = editable.closest(".apple-option-card");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!card || reducedMotion) {
    editable.innerText = nextText;
    return;
  }

  clearTimeout(card._langSwitchOutTimer);
  clearTimeout(card._langSwitchInTimer);
  card.classList.remove("apple-language-switch-in");
  card.classList.add("apple-language-switch-out");

  card._langSwitchOutTimer = setTimeout(() => {
    editable.innerText = nextText;
    card.classList.remove("apple-language-switch-out");
    card.classList.add("apple-language-switch-in");

    card._langSwitchInTimer = setTimeout(() => {
      card.classList.remove("apple-language-switch-in");
    }, 280);
  }, 150);
}

function renderErrorBox(errorTitle, errorDesc) {
  const errorHtml = `
    <div class="apple-error-container">
       <div class="apple-error-icon">⚠</div>
       <div class="apple-error-title">${errorTitle}</div>
       <div class="apple-error-desc" style="white-space: pre-wrap; max-width: 90%; margin-bottom: 20px;">${errorDesc}</div>
       <button class="apple-error-btn" id="closeErrorBtn">关闭面板</button>
    </div>
  `;
  renderModal(errorHtml, false);
  document.getElementById("closeErrorBtn")?.addEventListener("click", () => {
    document.getElementById("vision-ai-prompt-container")?.remove();
  });
}

function renderModal(content, isLoading) {
  let container = document.getElementById("vision-ai-prompt-container");
  const nextMode = isLoading ? "loading" : content.includes("apple-error-container") ? "error" : "result";

  if (!container) {
    container = document.createElement("div");
    container.id = "vision-ai-prompt-container";
    container.className = getThemeClass();
    container.style.position = "fixed";
    container.style.top = "50%";
    container.style.left = "50%";
    container.style.transform = "translate(-50%, -50%)";
    container.innerHTML =
      '<div class="apple-header" id="apple-header"><span class="apple-title">视觉设计逆向工程</span><button class="apple-close" id="apple-close-btn"><svg viewBox="0 0 24 24" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div><div class="apple-content" id="apple-content"></div>';
    document.body.appendChild(container);
    document.getElementById("apple-close-btn").addEventListener("click", () => container.remove());
    makeElementDraggable(container);
    applyModalMode(container, nextMode);
    setModalContent(container, content, nextMode, false);
    return;
  }

  const currentRect = container.getBoundingClientRect();
  container.className = getThemeClass();
  setModalContent(container, content, nextMode, true, currentRect);
}

function applyModalMode(container, mode) {
  container.dataset.modalMode = mode;
  container.classList.remove("apple-modal-loading", "apple-modal-result", "apple-modal-error");
  container.classList.add(`apple-modal-${mode}`);
}

function setModalContent(container, content, mode, animate, startRect = null) {
  const contentEl = document.getElementById("apple-content");
  if (!contentEl) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wrappedContent = `<div class="apple-content-stage apple-content-stage-${mode}">${content}</div>`;

  if (!animate || reducedMotion) {
    applyModalMode(container, mode);
    contentEl.innerHTML = wrappedContent;
    contentEl.firstElementChild?.classList.add("is-visible");
    container.style.width = "";
    container.style.height = "";
    container.classList.remove("apple-modal-morphing");
    return;
  }

  const fromRect = startRect || container.getBoundingClientRect();
  applyModalMode(container, mode);
  const targetRect = measureModalRect(wrappedContent, mode);

  contentEl.innerHTML = wrappedContent;
  container.classList.add("apple-modal-morphing");
  container.style.width = `${Math.round(fromRect.width)}px`;
  container.style.height = `${Math.round(fromRect.height)}px`;

  void container.offsetWidth;

  requestAnimationFrame(() => {
    container.style.width = `${Math.round(targetRect.width)}px`;
    container.style.height = `${Math.round(targetRect.height)}px`;
    requestAnimationFrame(() => contentEl.firstElementChild?.classList.add("is-visible"));
  });

  clearTimeout(container._modalMorphTimer);
  container._modalMorphTimer = setTimeout(() => {
    container.style.width = "";
    container.style.height = "";
    container.classList.remove("apple-modal-morphing");
  }, MODAL_MORPH_DURATION);
}

function measureModalRect(content, mode) {
  const probe = document.createElement("div");
  probe.className = `${getThemeClass()} apple-modal-measure apple-modal-${mode}`;
  probe.innerHTML =
    `<div class="apple-header"><span class="apple-title">视觉设计逆向工程</span><button class="apple-close" type="button" aria-hidden="true"><svg viewBox="0 0 24 24" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div><div class="apple-content">${content}</div>`;
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return rect;
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  if (typeof unsafe !== "string") unsafe = JSON.stringify(unsafe);
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function makeElementDraggable(el) {
  let pos1 = 0;
  let pos2 = 0;
  let pos3 = 0;
  let pos4 = 0;
  const header = document.getElementById("apple-header");
  if (!header) return;

  header.onmousedown = e => {
    if (e.target.closest(".apple-close")) return;
    e.preventDefault();

    if (el.style.transform.includes("translate")) {
      const rect = el.getBoundingClientRect();
      el.style.transform = "none";
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
    }

    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDrag;
    document.onmousemove = drag;
    el.style.cursor = "grabbing";
    header.style.cursor = "grabbing";
  };

  function drag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    el.style.top = `${el.offsetTop - pos2}px`;
    el.style.left = `${el.offsetLeft - pos1}px`;
  }

  function closeDrag() {
    document.onmouseup = null;
    document.onmousemove = null;
    el.style.cursor = "auto";
    header.style.cursor = "grab";
  }
}
