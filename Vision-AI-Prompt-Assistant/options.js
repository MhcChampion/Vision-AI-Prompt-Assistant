// 🔥 现在的默认人设极其干净，底层 JSON 约束已交由后台引擎接管
const defaultPersona = `请对图片进行法医解剖式的、极其详尽的画面信息拆解分析。

【核心分析规则】
1. 剔除所有对标：我要的是分析图片的详细画面信息，不需要对标任何流媒体或品牌（不需要 Netflix/HBO 等）。
2. 汇聚单一方案：只提供一个唯一的、最终的、最详尽的中文图像分析方案。

【细节与排版要求】
1. 必须详细描述色彩搭配、具体的打光方式、人物肤色质感、背景纹理。
2. 将剧名设计加到提示词里，输出的剧名必须一字不差，禁止缩短或修改！如果是合适手写的剧名请加入手写体设计，不适合就不用加。
3. 你的中文分析结果必须放在可一键复制的代码块中（即在文本前后加上 \`\`\`中文提示词 和 \`\`\`）。`;

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    theme: document.getElementById('themeSelect'), posCards: document.querySelectorAll('.pos-card'),
    configRadios: document.querySelectorAll('input[name="configMode"]'), offView: document.getElementById('official-config-view'), cusView: document.getElementById('custom-config-view'),
    offApiKey: document.getElementById('officialApiKey'), cusApiKey: document.getElementById('customApiKey'),
    baseUrl: document.getElementById('baseUrl'), modelName: document.getElementById('modelName'),
    modelSelect: document.getElementById('modelSelect'), fetchModelsBtn: document.getElementById('fetchModelsBtn'),
    persona: document.getElementById('personaPrompt'), shortcutBtn: document.getElementById('shortcutBtn'),
    saveBtn: document.getElementById('saveBtn'), resetBtn: document.getElementById('resetPersonaBtn'),
    status: document.getElementById('status'),
    errorContainer: document.getElementById('errorLogContainer'), successContainer: document.getElementById('successLogContainer'), refreshLogBtn: document.getElementById('refreshLogBtn')
  };

  let currentShortcut = { type: 'keyboard', key: 'q', altKey: true, ctrlKey: false, shiftKey: false };
  let activePos = 'inside-br';

  chrome.storage.local.get(['visionSettings'], (res) => {
    const s = res.visionSettings || {};
    els.theme.value = s.theme || 'dark'; activePos = s.buttonPosition || 'inside-br'; updatePosCards(activePos);
    els.offApiKey.value = s.officialApiKey || ''; els.cusApiKey.value = s.customApiKey || '';
    els.baseUrl.value = s.baseUrl || ''; els.modelName.value = s.modelName || '';
    els.persona.value = s.persona || defaultPersona; currentShortcut = s.shortcut || currentShortcut; updateShortcutText();
  });

  loadLogs();

  els.posCards.forEach(card => { card.addEventListener('click', () => { activePos = card.getAttribute('data-pos'); updatePosCards(activePos); }); });
  function updatePosCards(pos) { els.posCards.forEach(c => c.classList.remove('active')); document.querySelector(`.pos-card[data-pos="${pos}"]`).classList.add('active'); }

  els.configRadios.forEach(radio => { radio.addEventListener('change', (e) => toggleConfigView(e.target.value)); });
  function toggleConfigView(mode) {
    if(mode === 'official') { els.offView.classList.remove('hidden'); els.cusView.classList.add('hidden'); }
    else { els.offView.classList.add('hidden'); els.cusView.classList.remove('hidden'); }
  }

  els.fetchModelsBtn.addEventListener('click', async () => {
    let baseUrl = els.baseUrl.value.trim().replace(/\/+$/, '');
    const apiKey = els.cusApiKey.value.trim();
    if (!baseUrl || !apiKey) { alert('请先填写【第三方 API Key】和【Base URL】！'); return; }
    els.fetchModelsBtn.textContent = '抓取中...'; els.fetchModelsBtn.disabled = true;
    if (baseUrl.endsWith('/v1beta')) baseUrl = baseUrl.substring(0, baseUrl.length - 7);
    try {
      const res = await fetch(`${baseUrl}/v1beta/models`, { headers: { 'Authorization': `Bearer ${apiKey}`, 'x-goog-api-key': apiKey } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        els.modelSelect.innerHTML = '';
        data.models.forEach(m => {
          const modelId = m.name.replace('models/', ''); const opt = document.createElement('option');
          opt.value = modelId; opt.textContent = m.displayName ? `${m.displayName} (${modelId})` : modelId;
          els.modelSelect.appendChild(opt);
        });
        els.modelName.classList.add('hidden'); els.modelSelect.classList.remove('hidden');
        if (els.modelName.value) els.modelSelect.value = els.modelName.value.replace('models/', '');
        els.modelName.value = els.modelSelect.value;
        els.modelSelect.addEventListener('change', () => { els.modelName.value = els.modelSelect.value; });
        els.fetchModelsBtn.textContent = '拉取成功';
      } else { throw new Error("返回数据结构异常"); }
    } catch (e) { alert(`拉取失败: ${e.message}`); els.fetchModelsBtn.textContent = '拉取失败';
    } finally { setTimeout(() => { els.fetchModelsBtn.textContent = '重新拉取'; els.fetchModelsBtn.disabled = false; }, 2000); }
  });

  els.shortcutBtn.addEventListener('click', () => { els.shortcutBtn.textContent = "请按下按键..."; els.shortcutBtn.classList.add('recording'); els.shortcutBtn.focus(); });
  els.shortcutBtn.addEventListener('keydown', (e) => {
    if (!els.shortcutBtn.classList.contains('recording')) return;
    e.preventDefault(); if (e.key === 'Escape') { stopRecording(); return; }
    currentShortcut = { type: 'keyboard', key: e.key.toLowerCase(), ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey }; stopRecording();
  });
  els.shortcutBtn.addEventListener('mousedown', (e) => {
    if (!els.shortcutBtn.classList.contains('recording')) return;
    if (e.button === 0) return; e.preventDefault(); currentShortcut = { type: 'mouse', button: e.button }; stopRecording();
  });
  function stopRecording() { els.shortcutBtn.classList.remove('recording'); els.shortcutBtn.blur(); updateShortcutText(); }
  function updateShortcutText() {
    if (currentShortcut.type === 'keyboard') {
      const keys = []; if (currentShortcut.ctrlKey) keys.push('Ctrl'); if (currentShortcut.altKey) keys.push('Alt'); if (currentShortcut.shiftKey) keys.push('Shift');
      keys.push(currentShortcut.key.toUpperCase()); els.shortcutBtn.textContent = keys.join(' + ');
    } else els.shortcutBtn.textContent = currentShortcut.button === 1 ? '鼠标中键' : (currentShortcut.button === 3 ? '鼠标侧键 (后退)' : '鼠标侧键 (前进)');
  }

  els.saveBtn.addEventListener('click', () => {
    chrome.storage.local.get(['visionSettings'], (res) => {
      const currentLatestApiMode = (res.visionSettings && res.visionSettings.apiMode) ? res.visionSettings.apiMode : 'official';
      const settings = {
        apiMode: currentLatestApiMode, theme: els.theme.value, buttonPosition: activePos,
        officialApiKey: els.offApiKey.value.trim(), customApiKey: els.cusApiKey.value.trim(), baseUrl: els.baseUrl.value.trim(), modelName: els.modelName.value.trim(),
        shortcut: currentShortcut, persona: els.persona.value.trim()
      };
      chrome.storage.local.set({ visionSettings: settings }, () => { els.status.textContent = '设置已储存'; setTimeout(() => els.status.textContent = '', 2000); });
    });
  });

  els.resetBtn.addEventListener('click', () => { if(confirm("恢复默认人设？")) els.persona.value = defaultPersona; });
  els.refreshLogBtn.addEventListener('click', loadLogs);

  function loadLogs() {
    chrome.storage.local.get(['visionErrorLog', 'visionSuccessLogs'], (res) => {
      const errLog = res.visionErrorLog;
      if (errLog) {
        els.errorContainer.innerHTML = `<div class="log-item"><div class="log-header"><span class="error-text">失败记录</span><span class="log-time">${errLog.timestamp}</span></div><pre class="log-box">${errLog.request}</pre><pre class="log-box" style="color:#FF6961;">${errLog.response}</pre></div>`;
      } else { els.errorContainer.innerHTML = `<div class="log-empty">无错误发生</div>`; }
      const succLogs = res.visionSuccessLogs || [];
      if (succLogs.length > 0) {
        let html = ''; succLogs.forEach((log, index) => { html += `<div class="log-item"><div class="log-header"><span style="color:var(--accent);">成功日志 ${index + 1}</span><span class="log-time">${log.timestamp}</span></div><pre class="log-box">${log.response}</pre></div>`; });
        els.successContainer.innerHTML = html;
      } else { els.successContainer.innerHTML = `<div class="log-empty">暂无生成记录</div>`; }
    });
  }
});