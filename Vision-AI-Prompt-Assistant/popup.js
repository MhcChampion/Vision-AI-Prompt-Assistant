document.addEventListener('DOMContentLoaded', () => {
  const apiRadios = document.querySelectorAll('input[name="apiMode"]');
  const optionsBtn = document.getElementById('optionsBtn');
  const fetchQuotaBtn = document.getElementById('fetchQuotaBtn');
  const quotaContent = document.getElementById('quotaContent');

  chrome.storage.local.get(['visionSettings'], (res) => {
    const settings = res.visionSettings || {};
    const currentMode = settings.apiMode || 'official';
    const activeRadio = document.querySelector(`input[name="apiMode"][value="${currentMode}"]`);
    if (activeRadio) activeRadio.checked = true;
  });

  apiRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selectedMode = e.target.value;
      chrome.storage.local.get(['visionSettings'], (res) => {
        let settings = res.visionSettings || {};
        settings.apiMode = selectedMode;
        chrome.storage.local.set({ visionSettings: settings });
      });
    });
  });

  optionsBtn.addEventListener('click', () => { chrome.runtime.openOptionsPage(); });

  fetchQuotaBtn.addEventListener('click', async () => {
    fetchQuotaBtn.textContent = '查询中...'; quotaContent.textContent = '正在联系服务器...';
    try {
      const { visionSettings } = await chrome.storage.local.get("visionSettings");
      if (!visionSettings) throw new Error("请先点击下方首选项进行配置。");
      if (visionSettings.apiMode === 'official') throw new Error("官方 API 不支持此数据接口，请切换至第三方 API 后查询。");
      const apiKey = visionSettings.customApiKey; let baseUrl = (visionSettings.baseUrl || "").trim().replace(/\/+$/, '');
      if (!apiKey || !baseUrl) throw new Error("请先前往首选项填写第三方 API Key 与 Base URL。");
      if (baseUrl.endsWith('/v1')) baseUrl = baseUrl.substring(0, baseUrl.length - 3);
      if (baseUrl.endsWith('/v1beta')) baseUrl = baseUrl.substring(0, baseUrl.length - 7);
      const res = await fetch(`${baseUrl}/api/data/self`, { method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}: 代理未开启额度查询或 Key 无效。`);
      const data = await res.json();
      if (data.data) {
         let output = "";
         if (data.data.quota !== undefined && data.data.used_quota !== undefined) {
            output += `💎 总获取额度: ${data.data.quota}\n🔥 已消耗额度: ${data.data.used_quota}\n✨ 账户剩余量: ${data.data.remain_quota}`;
         } else { output = JSON.stringify(data.data, null, 2); }
         quotaContent.textContent = output.trim() || "无具体额度数据返回";
      } else { quotaContent.textContent = JSON.stringify(data, null, 2); }
    } catch (err) { quotaContent.textContent = `❌ ${err.message}`;
    } finally { setTimeout(() => { fetchQuotaBtn.textContent = '刷新额度'; }, 500); }
  });
});