document.addEventListener("DOMContentLoaded", () => {
  const apiRadios = document.querySelectorAll('input[name="apiMode"]');
  const optionsBtn = document.getElementById("optionsBtn");
  const fetchQuotaBtn = document.getElementById("fetchQuotaBtn");
  const quotaContent = document.getElementById("quotaContent");

  chrome.storage.local.get(["visionSettings"], res => {
    const settings = res.visionSettings || {};
    const currentMode = settings.apiMode || "official";
    const activeRadio = document.querySelector(`input[name="apiMode"][value="${currentMode}"]`);
    if (activeRadio) activeRadio.checked = true;
  });

  apiRadios.forEach(radio => {
    radio.addEventListener("change", e => {
      const selectedMode = e.target.value;
      chrome.storage.local.get(["visionSettings"], res => {
        const settings = res.visionSettings || {};
        settings.apiMode = selectedMode;
        chrome.storage.local.set({ visionSettings: settings });
      });
    });
  });

  optionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  fetchQuotaBtn.addEventListener("click", async () => {
    fetchQuotaBtn.textContent = "查询中...";
    quotaContent.textContent = "正在连接...";

    try {
      const { visionSettings } = await chrome.storage.local.get("visionSettings");
      if (!visionSettings) {
        throw new Error("请先完成扩展配置。");
      }

      if (visionSettings.apiMode === "official") {
        throw new Error("Gemini 官方接口不支持这里的代理用量查询。");
      }

      if (visionSettings.apiMode === "ark") {
        const billingMode = visionSettings.arkBillingMode === "coding-plan" ? "coding-plan" : "token";
        if (billingMode === "coding-plan") {
          throw new Error("火山方舟 Coding Plan 会员用量请到方舟 Coding Plan 控制台查看。");
        }
        throw new Error("火山方舟按 Token 计费的用量请到方舟控制台查看。");
      }

      const apiKey = visionSettings.customApiKey;
      let baseUrl = (visionSettings.baseUrl || "").trim().replace(/\/+$/, "");

      if (!apiKey || !baseUrl) {
        throw new Error("请先在设置页填写兼容接口的密钥和接口地址。");
      }

      if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3);
      if (baseUrl.endsWith("/v1beta")) baseUrl = baseUrl.slice(0, -7);

      const res = await fetch(`${baseUrl}/api/data/self`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}：用量接口不可用或密钥无效。`);
      }

      const data = await res.json();
      if (!data.data) {
        quotaContent.textContent = JSON.stringify(data, null, 2);
        return;
      }

      if (data.data.quota !== undefined && data.data.used_quota !== undefined) {
        quotaContent.textContent =
          `总额度：${data.data.quota}\n` +
          `已用额度：${data.data.used_quota}\n` +
          `剩余额度：${data.data.remain_quota}`;
        return;
      }

      quotaContent.textContent = JSON.stringify(data.data, null, 2);
    } catch (error) {
      quotaContent.textContent = `错误：${error.message}`;
    } finally {
      setTimeout(() => {
        fetchQuotaBtn.textContent = "刷新";
      }, 500);
    }
  });
});
