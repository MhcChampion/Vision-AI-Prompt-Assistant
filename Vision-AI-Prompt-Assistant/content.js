let appSettings = null, currentHoveredImage = null, currentAnalyzeBtnContainer = null, targetImageRect = null;
let currentPrompts = null, currentLang = 'zh', currentImageUrl = null;

chrome.storage.local.get(['visionSettings'], (res) => { appSettings = res.visionSettings || {}; });
chrome.storage.onChanged.addListener((changes) => { if (changes.visionSettings) appSettings = changes.visionSettings.newValue; });

function getThemeClass() { return appSettings?.theme === 'light' ? 'apple-theme-light' : 'apple-theme-dark'; }

function applyButtonPosition(btn) {
  const pos = appSettings?.buttonPosition || 'inside-br';
  btn.style.bottom = 'auto'; btn.style.top = 'auto'; btn.style.left = 'auto'; btn.style.right = 'auto';
  if (pos === 'inside-br') { btn.style.bottom = '12px'; btn.style.right = '12px'; }
  else if (pos === 'inside-tr') { btn.style.top = '12px'; btn.style.right = '12px'; }
  else if (pos === 'outside-br') { btn.style.bottom = '-42px'; btn.style.right = '0px'; }
  else if (pos === 'outside-tr') { btn.style.top = '-42px'; btn.style.right = '0px'; }
}

document.addEventListener('mouseover', (e) => {
  if (e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
    if (e.target === currentHoveredImage) return;

    // 🔥 核心过滤机制 1：忽略微小图片 (长或宽小于 120px 的头像、Icon 直接跳过)
    if (e.target.offsetWidth < 120 || e.target.offsetHeight < 120) return;

    removeCurrentAnalyzeBtn(); currentHoveredImage = e.target; createAnalyzeBtnOnImage(currentHoveredImage);
  }
});

document.addEventListener('mouseout', (e) => {
  if (currentAnalyzeBtnContainer && !currentAnalyzeBtnContainer.contains(e.relatedTarget) && currentHoveredImage && !currentHoveredImage.contains(e.relatedTarget)) {
    removeCurrentAnalyzeBtn(); currentHoveredImage = null;
  }
});

function createAnalyzeBtnOnImage(img) {
  const parent = img.parentElement; if (!parent) return;
  if (getComputedStyle(parent).position === 'static' || !getComputedStyle(parent).position) parent.style.position = 'relative';

  // 🔥 核心过滤机制 2：判断是否为中小尺寸图片，若是则挂载 mini 迷你版样式类名
  const isMini = img.offsetWidth < 280 || img.offsetHeight < 280;
  const miniClass = isMini ? 'apple-hover-btn-mini' : '';

  const btnContainer = document.createElement("div");
  btnContainer.className = `apple-hover-btn-container ${getThemeClass()} ${miniClass}`;
  btnContainer.innerHTML = `<div class="apple-hover-btn-icon">✧</div><div class="apple-hover-btn-text">图像逆向分析</div>`;
  applyButtonPosition(btnContainer);

  btnContainer.addEventListener("click", () => {
    currentImageUrl = img.src;
    try { chrome.runtime.sendMessage({ action: "analyze_hovered", srcUrl: currentImageUrl }); }
    catch (err) { alert("插件底层已更新，请按键盘 F5 强制刷新当前网页！"); }
  });
  parent.appendChild(btnContainer); currentAnalyzeBtnContainer = btnContainer;
}

function removeCurrentAnalyzeBtn() { if (currentAnalyzeBtnContainer) { currentAnalyzeBtnContainer.remove(); currentAnalyzeBtnContainer = null; } }

const triggerFromShortcut = (e, type) => {
  if (!appSettings || !appSettings.shortcut || !currentHoveredImage) return;
  const s = appSettings.shortcut;
  if (s.type === type && (type === 'keyboard' ? (e.key.toLowerCase() === s.key && e.ctrlKey === s.ctrlKey && e.altKey === s.altKey && e.shiftKey === s.shiftKey) : e.button === s.button)) {
    e.preventDefault();
    currentImageUrl = currentHoveredImage.src;
    try { chrome.runtime.sendMessage({ action: "analyze_hovered", srcUrl: currentImageUrl }); }
    catch(err) { alert("插件底层已更新，请按键盘 F5 强制刷新当前网页！"); }
  }
};
document.addEventListener('keydown', (e) => triggerFromShortcut(e, 'keyboard'));
document.addEventListener('mousedown', (e) => triggerFromShortcut(e, 'mouse'));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showLoading") {
    removeCurrentAnalyzeBtn();
    renderModal(`<div class="apple-loading"><div class="apple-spinner"></div><span id="vision-ai-loading-text">启动地毯式分析引擎...</span></div>`, true);
  } else if (request.action === "updateLoading") {
    const loadingText = document.getElementById("vision-ai-loading-text");
    if (loadingText) loadingText.innerText = request.message;
  } else if (request.action === "showResult") {
    currentPrompts = JSON.parse(request.data);
    updateResultUI('zh');
  } else if (request.action === "showError") {
    renderErrorBox("分析中断", request.message);
  }
});

function updateResultUI(lang = 'zh') {
  currentLang = lang;
  let fullText = currentPrompts[currentLang] || currentPrompts['zh'] || "无内容返回";

  const singleCardHtml = `
    <div class="apple-option-card apple-single-card">
      <div class="apple-option-text" contenteditable="true" spellcheck="false" id="apple-editable-result">${escapeHtml(fullText)}</div>
    </div>
  `;

  const footerHtml = `
    <div class="apple-footer apple-footer-split" style="margin-bottom: 8px;">
      <div class="apple-segment-ui" style="margin: 0; padding: 2px;">
        <input type="radio" id="langZh" name="langMode" value="zh" ${currentLang === 'zh' ? 'checked' : ''}>
        <label for="langZh" style="padding: 4px 16px; font-size: 12px;">中文</label>
        <input type="radio" id="langEn" name="langMode" value="en" ${currentLang === 'en' ? 'checked' : ''}>
        <label for="langEn" style="padding: 4px 16px; font-size: 12px;">English</label>
      </div>
    </div>
    <div class="apple-footer apple-footer-split">
      <button class="apple-card-action-btn apple-copy-btn" id="apple-final-copy-btn">
        <svg class="apple-icon" viewBox="0 0 24 24" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span class="apple-btn-text">复制结果</span>
      </button>
      <button class="apple-card-action-btn apple-refresh-btn" id="apple-final-refresh-btn" title="不满意？点击重做一版更详尽的。">
        <svg class="apple-icon" viewBox="0 0 24 24" stroke="currentColor"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
      </button>
    </div>
  `;

  renderModal(`${singleCardHtml}${footerHtml}`, false);

  document.getElementById('langZh')?.addEventListener('change', () => updateResultUI('zh'));
  document.getElementById('langEn')?.addEventListener('change', () => updateResultUI('en'));

  document.getElementById('apple-final-copy-btn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const editableText = document.getElementById('apple-editable-result').innerText;
    navigator.clipboard.writeText(editableText).then(() => {
      const textSpan = btn.querySelector('.apple-btn-text'); const originalText = textSpan.innerText;
      btn.classList.add('copied-state'); textSpan.innerText = "已拷贝";
      setTimeout(() => { btn.classList.remove('copied-state'); textSpan.innerText = originalText; }, 2000);
    });
  });

  document.getElementById('apple-final-refresh-btn')?.addEventListener('click', () => {
    if (!currentImageUrl) { alert("找不到图片路径，无法重做。"); return; }
    const btn = document.getElementById('apple-final-refresh-btn');
    btn.classList.add('apple-spinning-icon');
    try { chrome.runtime.sendMessage({ action: "regenerate_analysis", srcUrl: currentImageUrl }); }
    catch (err) { alert("插件已更新，请刷新网页！"); }
  });
}

function renderErrorBox(errorTitle, errorDesc) {
  const errorHtml = `
    <div class="apple-error-container">
       <div class="apple-error-icon">⚠️</div>
       <div class="apple-error-title">${errorTitle}</div>
       <div class="apple-error-desc" style="white-space: pre-wrap; max-width: 90%; margin-bottom: 20px;">${errorDesc}</div>
       <button class="apple-error-btn" id="closeErrorBtn">关闭面板</button>
    </div>
  `;
  renderModal(errorHtml, false);
  document.getElementById('closeErrorBtn')?.addEventListener('click', () => { document.getElementById('vision-ai-prompt-container')?.remove(); });
}

function renderModal(content, isLoading) {
  let container = document.getElementById("vision-ai-prompt-container");
  if (!container) {
    container = document.createElement("div"); container.id = "vision-ai-prompt-container"; container.className = getThemeClass();
    container.style.position = 'fixed'; container.style.top = '50%'; container.style.left = '50%'; container.style.transform = 'translate(-50%, -50%)';
    container.innerHTML = `<div class="apple-header" id="apple-header"><span class="apple-title">视觉设计逆向工程</span><button class="apple-close" id="apple-close-btn"><svg viewBox="0 0 24 24" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div><div class="apple-content" id="apple-content"></div>`;
    document.body.appendChild(container);
    document.getElementById("apple-close-btn").addEventListener("click", () => container.remove());
    makeElementDraggable(container);
  } else { container.className = getThemeClass(); }
  document.getElementById("apple-content").innerHTML = content;
}

function escapeHtml(unsafe) {
  if (!unsafe) return ""; if (typeof unsafe !== 'string') unsafe = JSON.stringify(unsafe);
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function makeElementDraggable(el) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = document.getElementById("apple-header");
  if (!header) return;
  header.onmousedown = (e) => {
    if (e.target.closest('.apple-close')) return;
    e.preventDefault();
    if (el.style.transform.includes('translate')) {
        const rect = el.getBoundingClientRect(); el.style.transform = 'none'; el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px';
    }
    pos3 = e.clientX; pos4 = e.clientY; document.onmouseup = closeDrag; document.onmousemove = drag; el.style.cursor = 'grabbing'; header.style.cursor = 'grabbing';
  };
  function drag(e) { e.preventDefault(); pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY; pos3 = e.clientX; pos4 = e.clientY; el.style.top = (el.offsetTop - pos2) + "px"; el.style.left = (el.offsetLeft - pos1) + "px"; }
  function closeDrag() { document.onmouseup = null; document.onmousemove = null; el.style.cursor = 'auto'; header.style.cursor = 'grab'; }
}