const CONTEXT_MENU_ID = "analyze-poster-gemini";
const DEFAULT_GEMINI_MODEL = "gemini-1.5-pro";
const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_ARK_ENDPOINT_ID = "";
const DEFAULT_ARK_BILLING_MODE = "token";
const DEFAULT_ARK_CODING_PLAN_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";
const DEFAULT_ARK_CODING_PLAN_MODEL = "doubao-seed-2.0-pro";

function runWithKeepAlive(task) {
  const keepAliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => chrome.runtime.lastError);
  }, 20000);

  return Promise.resolve()
    .then(task)
    .finally(() => clearInterval(keepAliveTimer));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "视觉设计逆向分析",
      contexts: ["image"]
    });
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze_hovered") {
    runWithKeepAlive(() => triggerAnalysis(request.srcUrl, sender.tab?.id))
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error?.message || "unknown_error" }));
    return true;
  }

  if (request.action === "regenerate_analysis") {
    runWithKeepAlive(() => triggerAnalysis(request.srcUrl, sender.tab?.id, true))
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error?.message || "unknown_error" }));
    return true;
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    runWithKeepAlive(() => triggerAnalysis(info.srcUrl, tab?.id)).catch(() => {});
  }
});

const safeSendMessage = (tabId, payload) => {
  if (!tabId) return Promise.resolve();
  return chrome.tabs.sendMessage(tabId, payload).catch(() => {});
};

const updateStatus = (tabId, message) =>
  safeSendMessage(tabId, { action: "updateLoading", message });

const saveLog = async (reqPayload, resData, isError = false) => {
  const timestamp = new Date().toLocaleString();

  if (isError) {
    await chrome.storage.local.set({
      visionErrorLog: { timestamp, request: reqPayload, response: resData }
    });
    return;
  }

  await chrome.storage.local.remove("visionErrorLog");
  const res = await chrome.storage.local.get("visionSuccessLogs");
  const logs = res.visionSuccessLogs || [];
  logs.unshift({ timestamp, request: reqPayload, response: resData });
  if (logs.length > 3) logs.pop();
  await chrome.storage.local.set({ visionSuccessLogs: logs });
};

const HARDCODED_SYSTEM_INSTRUCTION = `
[系统指令 - 最高优先级]
1. 将图片视为独立输入，忽略任何历史对话上下文。
2. 只能返回一个纯 JSON 对象，不要在 JSON 外添加说明、代码块标记或问候语。
3. JSON 只能包含 "zh" 和 "en" 两个键：
{
  "zh": "详细中文分析...",
  "en": "English version..."
}
`;

async function triggerAnalysis(imageUrl, tabId, isRegenerate = false) {
  safeSendMessage(tabId, { action: "showLoading" });

  try {
    updateStatus(tabId, `${isRegenerate ? "重做模式" : "1/4"} 正在读取配置...`);
    const { visionSettings } = await chrome.storage.local.get("visionSettings");
    if (!visionSettings) {
      throw new Error("未找到配置，请先打开设置页完成 API 配置。");
    }

    if (isRegenerate) {
      updateStatus(tabId, "正在错峰重试请求...");
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    await processImageAnalysis(imageUrl, normalizeSettings(visionSettings), tabId, isRegenerate);
  } catch (error) {
    await saveLog("启动分析失败", error.message, true);
    safeSendMessage(tabId, { action: "showError", message: error.message });
  }
}

function normalizeSettings(settings = {}) {
  return {
    apiMode: settings.apiMode || "official",
    officialApiKey: settings.officialApiKey || "",
    customApiKey: settings.customApiKey || "",
    baseUrl: settings.baseUrl || "",
    modelName: settings.modelName || DEFAULT_GEMINI_MODEL,
    arkApiKey: settings.arkApiKey || "",
    arkBillingMode: normalizeArkBillingMode(settings.arkBillingMode),
    arkBaseUrl: settings.arkBaseUrl || DEFAULT_ARK_BASE_URL,
    arkEndpointId: settings.arkEndpointId || settings.arkModelName || DEFAULT_ARK_ENDPOINT_ID,
    arkCodingPlanBaseUrl: settings.arkCodingPlanBaseUrl || DEFAULT_ARK_CODING_PLAN_BASE_URL,
    arkCodingPlanModel: settings.arkCodingPlanModel || DEFAULT_ARK_CODING_PLAN_MODEL,
    persona: settings.persona || ""
  };
}

function getProviderLabel(provider) {
  if (provider === "official") return "Gemini 官方";
  if (provider === "ark") return "火山方舟";
  return "Gemini 兼容接口";
}

function normalizeArkBillingMode(mode) {
  return mode === "coding-plan" ? "coding-plan" : DEFAULT_ARK_BILLING_MODE;
}

function getProviderLabelFromSettings(settings) {
  if (settings?.apiMode === "ark" && normalizeArkBillingMode(settings.arkBillingMode) === "coding-plan") {
    return "火山方舟 Coding Plan";
  }

  return getProviderLabel(settings?.apiMode);
}

function getProviderApiKey(settings) {
  if (settings.apiMode === "official") return settings.officialApiKey;
  if (settings.apiMode === "ark") return settings.arkApiKey;
  return settings.customApiKey;
}

function buildPrompt(settings, isRegenerate) {
  const persona = settings.persona || "";

  if (isRegenerate) {
    return `${HARDCODED_SYSTEM_INSTRUCTION}

[重做要求]
请完全抛开上一版输出，提供一版观察角度明显不同但同样细致专业的新分析。重点关注之前可能被忽略的构图、光影、材质、排版和氛围细节。
[用户规则]
${persona}`;
  }

  return `${HARDCODED_SYSTEM_INSTRUCTION}

[用户规则]
${persona}`;
}

async function fetchImageAsBase64(imageUrl) {
  let mimeType = "image/jpeg";
  let base64String = "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    mimeType = blob.type || mimeType;

    const arrayBuffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    base64String = btoa(binary);
  } catch (error) {
    throw new Error(`读取图片失败：${error.message}`);
  }

  return { mimeType, base64String };
}

function buildGeminiPayload(prompt, mimeType, base64String) {
  return {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64String } }
        ]
      }
    ]
  };
}

function canUseRemoteImageUrl(imageUrl) {
  return /^https?:\/\//i.test(String(imageUrl || "").trim());
}

function buildArkImageUrl(imageUrl, mimeType, base64String) {
  if (canUseRemoteImageUrl(imageUrl)) {
    return imageUrl;
  }

  if (mimeType && base64String) {
    return `data:${mimeType};base64,${base64String}`;
  }

  throw new Error("火山方舟图片参数无效，无法构造 image_url。");
}

function buildArkChatPayload(model, prompt, imageUrl, mimeType, base64String) {
  return {
    model: String(model || "").trim(),
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: buildArkImageUrl(imageUrl, mimeType, base64String) }
          },
          {
            type: "text",
            text: prompt
          }
        ]
      }
    ]
  };
}

function buildRequestConfig(settings, prompt, imageUrl, mimeType, base64String) {
  const provider = settings.apiMode;
  const activeKey = getProviderApiKey(settings);

  if (provider === "official") {
    return {
      apiEndpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${activeKey}`,
      headers: { "Content-Type": "application/json" },
      payload: buildGeminiPayload(prompt, mimeType, base64String)
    };
  }

  if (provider === "ark") {
    const arkBillingMode = normalizeArkBillingMode(settings.arkBillingMode);
    let baseUrl =
      arkBillingMode === "coding-plan"
        ? (settings.arkCodingPlanBaseUrl || DEFAULT_ARK_CODING_PLAN_BASE_URL).trim().replace(/\/+$/, "")
        : (settings.arkBaseUrl || DEFAULT_ARK_BASE_URL).trim().replace(/\/+$/, "");

    if (arkBillingMode === "coding-plan") {
      if (!/\/api\/coding\/v\d+$/i.test(baseUrl)) {
        baseUrl = `${baseUrl}/api/coding/v3`;
      }
    } else if (!/\/api\/v\d+$/i.test(baseUrl)) {
      baseUrl = `${baseUrl}/api/v3`;
    }

    return {
      apiEndpoint: `${baseUrl}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeKey}`
      },
      payload: buildArkChatPayload(
        arkBillingMode === "coding-plan"
          ? settings.arkCodingPlanModel || DEFAULT_ARK_CODING_PLAN_MODEL
          : settings.arkEndpointId || DEFAULT_ARK_ENDPOINT_ID,
        prompt,
        imageUrl,
        mimeType,
        base64String
      )
    };
  }

  let baseUrl = (settings.baseUrl || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("请先为 Gemini 兼容接口填写接口地址。");
  }
  if (baseUrl.endsWith("/v1beta")) {
    baseUrl = baseUrl.slice(0, -7);
  }

  const cleanModelName = (settings.modelName || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
  return {
    apiEndpoint: `${baseUrl}/v1beta/models/${cleanModelName}:generateContent`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${activeKey}`,
      "x-goog-api-key": activeKey
    },
    payload: buildGeminiPayload(prompt, mimeType, base64String)
  };
}

async function parseJsonResponse(response) {
  const rawText = await response.text();

  try {
    return {
      data: rawText ? JSON.parse(rawText) : {},
      raw: rawText || ""
    };
  } catch {
    return {
      data: { raw: rawText || "" },
      raw: rawText || ""
    };
  }
}

function extractArkText(resultData) {
  const content = resultData?.choices?.[0]?.message?.content;

  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return JSON.stringify(content);
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === "string") return part;
        if (part?.type === "text") return part.text || "";
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function extractGeneratedText(provider, resultData) {
  if (provider === "ark") {
    return extractArkText(resultData);
  }

  return resultData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function getArkErrorDetail(resultData, fallbackText = "") {
  const error = resultData?.error || {};
  const code = error.code || error.type || "";
  const message = error.message || fallbackText || "";
  const requestId = error.request_id || error.requestId || "";

  return {
    code: String(code || "").trim(),
    message: String(message || "").trim(),
    requestId: String(requestId || "").trim()
  };
}

function parseGeneratedJson(generatedText) {
  let cleanStr = String(generatedText || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gi, "")
    .trim();

  const firstBrace = cleanStr.indexOf("{");
  const lastBrace = cleanStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanStr = cleanStr.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleanStr);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.keys(parsed).length) {
    throw new Error("返回的 JSON 无效");
  }

  return parsed;
}

async function processImageAnalysis(imageUrl, settings, tabId, isRegenerate = false) {
  const provider = settings.apiMode;
  const providerLabel = getProviderLabelFromSettings(settings);
  const activeKey = getProviderApiKey(settings);
  const arkBillingMode = normalizeArkBillingMode(settings.arkBillingMode);

  if (!activeKey) {
    throw new Error(`缺少 ${providerLabel} 的接口密钥。`);
  }

  if (provider === "ark" && arkBillingMode === "token" && !(settings.arkEndpointId || "").trim()) {
    throw new Error("缺少火山方舟 Endpoint ID，请在设置页填写推理接入点 Endpoint ID。");
  }

  if (provider === "ark" && arkBillingMode === "coding-plan" && !(settings.arkCodingPlanModel || "").trim()) {
    throw new Error("缺少火山方舟 Coding Plan 模型名称，请在设置页填写模型名称。");
  }

  const prompt = buildPrompt(settings, isRegenerate);
  let mimeType = "";
  let base64String = "";

  if (provider === "ark" && canUseRemoteImageUrl(imageUrl)) {
    updateStatus(tabId, "2/4 正在准备图片链接...");
  } else {
    updateStatus(tabId, "2/4 正在读取图片并转换为 Base64...");
    ({ mimeType, base64String } = await fetchImageAsBase64(imageUrl));
  }

  const { apiEndpoint, headers, payload } = buildRequestConfig(settings, prompt, imageUrl, mimeType, base64String);

  try {
    new URL(apiEndpoint);
  } catch {
    throw new Error(`[${providerLabel}] 接口地址无效：${apiEndpoint}`);
  }

  const reqLog = JSON.stringify(
    {
      provider,
      apiEndpoint,
      payload
    },
    null,
    2
  );

  updateStatus(tabId, `${isRegenerate ? "3/4 正在发送重做请求..." : "3/4 正在调用 AI 接口..."}`);

  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    response = await fetch(apiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? `${providerLabel} 请求超时，已超过 120 秒。`
        : `网络错误：${error.message}\n接口地址：${apiEndpoint}`;
    await saveLog(reqLog, message, true);
    throw new Error(message);
  }

  updateStatus(tabId, "4/4 正在解析模型响应...");
  const { data: resultData, raw } = await parseJsonResponse(response);
  const rawResponseText = raw || JSON.stringify(resultData, null, 2);

  if (!response.ok) {
    await saveLog(reqLog, rawResponseText, true);
    if (provider === "ark") {
      const arkError = getArkErrorDetail(resultData, rawResponseText);
      const detailParts = [arkError.code, arkError.message].filter(Boolean);
      const detailText = detailParts.join(": ");
      const requestIdText = arkError.requestId ? ` Request ID: ${arkError.requestId}` : "";
      if (detailText) {
        throw new Error(`[${providerLabel}] ${detailText} (HTTP ${response.status}).${requestIdText}`);
      }
    }
    if (response.status === 500 || response.status === 502) {
      throw new Error(`[${providerLabel}] 服务暂时不可用（HTTP ${response.status}）。`);
    }
    throw new Error(`[${providerLabel}] 请求失败（HTTP ${response.status}），请查看设置页错误日志。`);
  }

  const generatedText = extractGeneratedText(provider, resultData);
  if (!generatedText) {
    await saveLog(reqLog, rawResponseText, true);
    throw new Error("模型未返回可用文本。");
  }

  let finalJson;
  try {
    finalJson = parseGeneratedJson(generatedText);
  } catch {
    await saveLog(reqLog, `JSON 校验失败，原始输出如下：\n\n${generatedText}`, true);
    throw new Error("模型没有返回合法 JSON，请查看错误日志。");
  }

  await saveLog(reqLog, rawResponseText, false);
  safeSendMessage(tabId, { action: "showResult", data: JSON.stringify(finalJson) });
}
