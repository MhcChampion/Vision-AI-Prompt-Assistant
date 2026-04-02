const DEFAULT_CUSTOM_MODEL = "gemini-1.5-pro";
const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_ARK_ENDPOINT_ID = "";
const DEFAULT_ARK_BILLING_MODE = "token";
const DEFAULT_ARK_CODING_PLAN_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";
const DEFAULT_ARK_CODING_PLAN_MODEL = "doubao-seed-2.0-pro";
const VALID_BUTTON_POSITIONS = new Set(["inside-br", "inside-tr"]);

const defaultPersona = `请将图片拆解为高密度、可复用的视觉设计分析结果。
至少覆盖以下维度：
1. 整体风格、气质、题材与叙事氛围。
2. 构图、镜头视角、透视关系、前中后景层次与视觉动线。
3. 主体动作、姿态、表情、服装、发型、材质与细节。
4. 光线方向、光比、阴影、反射、高光与环境光表现。
5. 配色体系、主辅色、冷暖关系、饱和度与对比度。
6. 道具、环境、装饰元素与容易被忽略的细节。
7. 材质纹理、真实感、颗粒感、磨损感或 CG 质感来源。
8. 图片中的标题、标识或文字内容，以及它们的排版和字体风格。
输出要求：
1. 只输出一个最终结果，不要给多个候选方案。
2. 不要提及无关品牌或平台联想。
3. 同时提供中文和英文版本。`;

document.addEventListener("DOMContentLoaded", () => {
  const els = {
    theme: document.getElementById("themeSelect"),
    posCards: document.querySelectorAll(".pos-card"),
    configRadios: document.querySelectorAll('input[name="configMode"]'),
    offView: document.getElementById("official-config-view"),
    cusView: document.getElementById("custom-config-view"),
    arkView: document.getElementById("ark-config-view"),
    offApiKey: document.getElementById("officialApiKey"),
    cusApiKey: document.getElementById("customApiKey"),
    baseUrl: document.getElementById("baseUrl"),
    modelName: document.getElementById("modelName"),
    modelSelect: document.getElementById("modelSelect"),
    fetchModelsBtn: document.getElementById("fetchModelsBtn"),
    arkApiKey: document.getElementById("arkApiKey"),
    arkBillingRadios: document.querySelectorAll('input[name="arkBillingMode"]'),
    arkTokenView: document.getElementById("ark-token-config-view"),
    arkCodingPlanView: document.getElementById("ark-coding-plan-config-view"),
    arkBaseUrl: document.getElementById("arkBaseUrl"),
    arkEndpointId: document.getElementById("arkEndpointId"),
    arkDefaultsBtn: document.getElementById("arkDefaultsBtn"),
    arkCodingPlanBaseUrl: document.getElementById("arkCodingPlanBaseUrl"),
    arkCodingPlanModel: document.getElementById("arkCodingPlanModel"),
    arkCodingPlanDefaultsBtn: document.getElementById("arkCodingPlanDefaultsBtn"),
    persona: document.getElementById("personaPrompt"),
    shortcutBtn: document.getElementById("shortcutBtn"),
    saveBtn: document.getElementById("saveBtn"),
    resetBtn: document.getElementById("resetPersonaBtn"),
    status: document.getElementById("status"),
    errorContainer: document.getElementById("errorLogContainer"),
    successContainer: document.getElementById("successLogContainer"),
    refreshLogBtn: document.getElementById("refreshLogBtn")
  };

  let currentShortcut = { type: "keyboard", key: "q", altKey: true, ctrlKey: false, shiftKey: false };
  let activePos = "inside-br";

  chrome.storage.local.get(["visionSettings"], res => {
    const settings = res.visionSettings || {};
    const currentMode = settings.apiMode || "official";
    const currentArkBillingMode = normalizeArkBillingMode(settings.arkBillingMode);
    const activeRadio = document.querySelector(`input[name="configMode"][value="${currentMode}"]`);
    const activeArkBillingRadio = document.querySelector(
      `input[name="arkBillingMode"][value="${currentArkBillingMode}"]`
    );

    if (activeRadio) activeRadio.checked = true;
    if (activeArkBillingRadio) activeArkBillingRadio.checked = true;

    els.theme.value = settings.theme || "dark";
    activePos = normalizeButtonPosition(settings.buttonPosition);
    updatePosCards(activePos);

    els.offApiKey.value = settings.officialApiKey || "";
    els.cusApiKey.value = settings.customApiKey || "";
    els.baseUrl.value = settings.baseUrl || "";
    els.modelName.value = settings.modelName || DEFAULT_CUSTOM_MODEL;
    els.arkApiKey.value = settings.arkApiKey || "";
    els.arkBaseUrl.value = settings.arkBaseUrl || DEFAULT_ARK_BASE_URL;
    els.arkEndpointId.value = settings.arkEndpointId || settings.arkModelName || DEFAULT_ARK_ENDPOINT_ID;
    els.arkCodingPlanBaseUrl.value = settings.arkCodingPlanBaseUrl || DEFAULT_ARK_CODING_PLAN_BASE_URL;
    els.arkCodingPlanModel.value = settings.arkCodingPlanModel || DEFAULT_ARK_CODING_PLAN_MODEL;
    els.persona.value = settings.persona || defaultPersona;
    currentShortcut = settings.shortcut || currentShortcut;

    updateShortcutText();
    toggleConfigView(currentMode);
    toggleArkBillingView(currentArkBillingMode);
  });

  loadLogs();

  els.posCards.forEach(card => {
    card.addEventListener("click", () => {
      activePos = card.getAttribute("data-pos");
      updatePosCards(activePos);
    });
  });

  els.configRadios.forEach(radio => {
    radio.addEventListener("change", e => {
      toggleConfigView(e.target.value);
    });
  });

  els.arkBillingRadios.forEach(radio => {
    radio.addEventListener("change", e => {
      toggleArkBillingView(e.target.value);
    });
  });

  els.fetchModelsBtn.addEventListener("click", async () => {
    let baseUrl = els.baseUrl.value.trim().replace(/\/+$/, "");
    const apiKey = els.cusApiKey.value.trim();

    if (!baseUrl || !apiKey) {
      alert("请先填写兼容接口的密钥和接口地址。");
      return;
    }

    els.fetchModelsBtn.textContent = "加载中...";
    els.fetchModelsBtn.disabled = true;

    try {
      const res = await fetch(`${baseUrl}/v1beta/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-goog-api-key": apiKey
        }
      });
      const data = await res.json();

      if (!Array.isArray(data.models) || !data.models.length) {
        throw new Error("接口没有返回模型列表。");
      }

      els.modelSelect.innerHTML = "";
      data.models.forEach(model => {
        const modelId = (model.name || "").replace("models/", "");
        if (!modelId) return;
        const opt = document.createElement("option");
        opt.value = modelId;
        opt.textContent = modelId;
        els.modelSelect.appendChild(opt);
      });

      if (!els.modelSelect.options.length) {
        throw new Error("模型列表为空。");
      }

      const selectedValue = Array.from(els.modelSelect.options).some(option => option.value === els.modelName.value)
        ? els.modelName.value
        : els.modelSelect.options[0].value;

      els.modelName.classList.add("hidden");
      els.modelSelect.classList.remove("hidden");
      els.modelSelect.value = selectedValue;
      els.modelName.value = selectedValue;
    } catch (error) {
      alert(`拉取模型失败：${error.message}`);
    } finally {
      els.fetchModelsBtn.textContent = "重新拉取";
      els.fetchModelsBtn.disabled = false;
    }
  });

  els.modelSelect.addEventListener("change", () => {
    els.modelName.value = els.modelSelect.value;
  });

  els.arkDefaultsBtn.addEventListener("click", () => {
    els.arkBaseUrl.value = DEFAULT_ARK_BASE_URL;
    els.arkEndpointId.value = DEFAULT_ARK_ENDPOINT_ID;
  });

  els.arkCodingPlanDefaultsBtn.addEventListener("click", () => {
    els.arkCodingPlanBaseUrl.value = DEFAULT_ARK_CODING_PLAN_BASE_URL;
    els.arkCodingPlanModel.value = DEFAULT_ARK_CODING_PLAN_MODEL;
  });

  els.shortcutBtn.addEventListener("click", () => {
    els.shortcutBtn.textContent = "请按下快捷键...";
    els.shortcutBtn.classList.add("recording");
    els.shortcutBtn.focus();
  });

  els.shortcutBtn.addEventListener("keydown", e => {
    if (!els.shortcutBtn.classList.contains("recording")) return;

    e.preventDefault();
    currentShortcut = {
      type: "keyboard",
      key: e.key.toLowerCase(),
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey
    };
    stopRecording();
  });

  els.saveBtn.addEventListener("click", () => {
    const settings = {
      apiMode: document.querySelector('input[name="configMode"]:checked').value,
      theme: els.theme.value,
      buttonPosition: normalizeButtonPosition(activePos),
      officialApiKey: els.offApiKey.value.trim(),
      customApiKey: els.cusApiKey.value.trim(),
      baseUrl: els.baseUrl.value.trim(),
      modelName: els.modelName.value.trim() || DEFAULT_CUSTOM_MODEL,
      arkApiKey: els.arkApiKey.value.trim(),
      arkBillingMode: getSelectedArkBillingMode(),
      arkBaseUrl: els.arkBaseUrl.value.trim() || DEFAULT_ARK_BASE_URL,
      arkEndpointId: els.arkEndpointId.value.trim() || DEFAULT_ARK_ENDPOINT_ID,
      arkCodingPlanBaseUrl: els.arkCodingPlanBaseUrl.value.trim() || DEFAULT_ARK_CODING_PLAN_BASE_URL,
      arkCodingPlanModel: els.arkCodingPlanModel.value.trim() || DEFAULT_ARK_CODING_PLAN_MODEL,
      shortcut: currentShortcut,
      persona: els.persona.value.trim() || defaultPersona
    };

    chrome.storage.local.set({ visionSettings: settings }, () => {
      els.status.textContent = "已保存";
      setTimeout(() => {
        els.status.textContent = "";
      }, 2000);
    });
  });

  els.resetBtn.addEventListener("click", () => {
    if (confirm("确认恢复默认分析规则吗？")) {
      els.persona.value = defaultPersona;
    }
  });

  els.refreshLogBtn.addEventListener("click", loadLogs);

  function getSelectedArkBillingMode() {
    return normalizeArkBillingMode(document.querySelector('input[name="arkBillingMode"]:checked')?.value);
  }

  function toggleConfigView(mode) {
    els.offView.classList.toggle("hidden", mode !== "official");
    els.cusView.classList.toggle("hidden", mode !== "custom");
    els.arkView.classList.toggle("hidden", mode !== "ark");

    if (mode === "ark") {
      toggleArkBillingView(getSelectedArkBillingMode());
    }
  }

  function toggleArkBillingView(mode) {
    const billingMode = normalizeArkBillingMode(mode);
    els.arkTokenView.classList.toggle("hidden", billingMode !== "token");
    els.arkCodingPlanView.classList.toggle("hidden", billingMode !== "coding-plan");
  }

  function normalizeArkBillingMode(mode) {
    return mode === "coding-plan" ? "coding-plan" : DEFAULT_ARK_BILLING_MODE;
  }

  function normalizeButtonPosition(pos) {
    if (pos === "outside-br") return "inside-br";
    if (pos === "outside-tr") return "inside-tr";
    return VALID_BUTTON_POSITIONS.has(pos) ? pos : "inside-br";
  }

  function updatePosCards(pos) {
    const normalizedPos = normalizeButtonPosition(pos);
    els.posCards.forEach(card => card.classList.remove("active"));
    document.querySelector(`.pos-card[data-pos="${normalizedPos}"]`)?.classList.add("active");
  }

  function stopRecording() {
    els.shortcutBtn.classList.remove("recording");
    els.shortcutBtn.blur();
    updateShortcutText();
  }

  function updateShortcutText() {
    const keys = [];
    if (currentShortcut.ctrlKey) keys.push("Ctrl");
    if (currentShortcut.altKey) keys.push("Alt");
    if (currentShortcut.shiftKey) keys.push("Shift");
    keys.push((currentShortcut.key || "Q").toUpperCase());
    els.shortcutBtn.textContent = keys.join(" + ");
  }

  function loadLogs() {
    chrome.storage.local.get(["visionErrorLog", "visionSuccessLogs"], res => {
      const errLog = res.visionErrorLog;
      els.errorContainer.innerHTML = errLog
        ? `<div class="log-item"><pre class="log-box">${escapeHtml(errLog.response || "")}</pre></div>`
        : '<div class="log-empty">暂无错误日志</div>';

      const succLogs = res.visionSuccessLogs || [];
      els.successContainer.innerHTML = succLogs.length
        ? succLogs
            .map(log => `<div class="log-item"><pre class="log-box">${escapeHtml(log.response || "")}</pre></div>`)
            .join("")
        : '<div class="log-empty">暂无成功日志</div>';
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
