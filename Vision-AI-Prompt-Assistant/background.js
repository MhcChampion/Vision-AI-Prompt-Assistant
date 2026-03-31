chrome.runtime.onInstalled.addListener(() => { chrome.contextMenus.create({ id: "analyze-poster-gemini", title: "地毯式图像逆向分析", contexts: ["image"] }); });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze_hovered") { triggerAnalysis(request.srcUrl, sender.tab.id); return true; }
  else if (request.action === "regenerate_analysis") { triggerAnalysis(request.srcUrl, sender.tab.id, true); return true; }
});
chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId === "analyze-poster-gemini") triggerAnalysis(info.srcUrl, tab.id); });

const safeSendMessage = (tabId, payload) => chrome.tabs.sendMessage(tabId, payload).catch(() => {});
const updateStatus = (tabId, msg) => safeSendMessage(tabId, { action: "updateLoading", message: msg });

const saveLog = async (reqPayload, resData, isError = false) => {
  const timestamp = new Date().toLocaleString();
  if (isError) {
    await chrome.storage.local.set({ visionErrorLog: { timestamp, request: reqPayload, response: resData } });
  } else {
    await chrome.storage.local.remove('visionErrorLog');
    const res = await chrome.storage.local.get('visionSuccessLogs');
    let logs = res.visionSuccessLogs || [];
    logs.unshift({ timestamp, request: reqPayload, response: resData }); if (logs.length > 3) logs.pop();
    await chrome.storage.local.set({ visionSuccessLogs: logs });
  }
};

const HARDCODED_SYSTEM_INSTRUCTION = `
【系统底层强制指令 - 最高优先级】
1. 将图片视为独立个体，禁止联系任何历史对话上下文。
2. 你必须、只能返回一个纯净的 JSON 对象。绝对禁止在 JSON 外部添加任何说明文字、代码块标记（如 \`\`\`json）或问候语。
3. JSON 格式必须严格如下，只允许包含 "zh" 和 "en" 两个键，不要将内容分成多个方案，只给出一个最终结果：
{
  "zh": "你的详细中文分析内容...",
  "en": "English version..."
}
`;

async function triggerAnalysis(imageUrl, tabId, isRegenerate = false) {
  safeSendMessage(tabId, { action: "showLoading" });
  try {
    updateStatus(tabId, `${isRegenerate ? '【二次重做】' : '1/4 '}读取本地分析配置...`);
    const { visionSettings } = await chrome.storage.local.get("visionSettings");
    if (!visionSettings) throw new Error("配置缺失，请先打开首选项设置授权。");

    // 🔥 核心防 500 崩溃机制：如果是重做，强制延时 1.5 秒，给第三方代理服务器喘息的机会，防止触发并发防火墙
    if (isRegenerate) {
        updateStatus(tabId, "【安全缓冲】正在错开代理请求高峰...");
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    await processImageAnalysis(imageUrl, visionSettings, tabId, isRegenerate);
  } catch (error) {
    await saveLog("启动逆向分析失败", error.message, true);
    safeSendMessage(tabId, { action: "showError", message: error.message });
  }
}

async function processImageAnalysis(imageUrl, settings, tabId, isRegenerate = false) {
  const activeKey = settings.apiMode === 'official' ? settings.officialApiKey : settings.customApiKey;
  const modeName = settings.apiMode === 'official' ? '官方引擎' : '第三方引擎';
  if (!activeKey) throw new Error(`未检测到 ${modeName} 的 API Key。`);

  updateStatus(tabId, `2/4 转码原图 (Base64 原生格式)...`);
  let base64String = "", mimeType = "image/jpeg";
  try {
      const imgController = new AbortController(); const imgTimeout = setTimeout(() => imgController.abort(), 15000);
      const imageResponse = await fetch(imageUrl, { signal: imgController.signal });
      clearTimeout(imgTimeout); if (!imageResponse.ok) throw new Error("HTTP " + imageResponse.status);
      const imageBlob = await imageResponse.blob(); mimeType = imageBlob.type || 'image/jpeg';
      const arrayBuffer = await imageBlob.arrayBuffer(); let binary = ''; const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.length; i += 0x8000) { binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); }
      base64String = btoa(binary);
  } catch (e) { throw new Error(`图片防盗链拦截或提取超时: ${e.message}`); }

  let finalPrompt = HARDCODED_SYSTEM_INSTRUCTION;
  // 🔥 核心防超时机制：修改重做话术，注重质量而非长度，防止代理服务器因等待过久而报 500 错误
  if (isRegenerate) {
     finalPrompt += "\n\n【重做请求：全新专业视角模式】\n用户需要另一版方案。请抛离之前的输出记忆，提供一个侧重点完全不同的全新详细分析。深入挖掘未被注意的构图元素、细微的光影漫反射和隐藏的材质纹理。直接输出一个单一的高质量 JSON 方案，不要提及“重做”相关字眼。\n\n【用户设定的格式要求】\n" + settings.persona;
  } else {
     finalPrompt += "\n\n【用户设定的具体设计分析规则】\n" + settings.persona;
  }

  const payload = { contents: [{ parts: [{ text: finalPrompt }, { inlineData: { mimeType: mimeType, data: base64String } }] }] };

  let apiEndpoint = "", headers = { "Content-Type": "application/json" };
  if (settings.apiMode === 'official') {
    apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${activeKey}`;
  } else {
    let baseUrl = settings.baseUrl.replace(/\/+$/, '');
    if (baseUrl.endsWith('/v1beta')) baseUrl = baseUrl.substring(0, baseUrl.length - 7);
    let cleanModelName = (settings.modelName || "gemini-1.5-pro").replace(/^models\//, '');
    apiEndpoint = `${baseUrl}/v1beta/models/${cleanModelName}:generateContent`;
    headers["Authorization"] = `Bearer ${activeKey}`; headers["x-goog-api-key"] = activeKey;
  }

  const reqLog = JSON.stringify(payload, null, 2);
  updateStatus(tabId, `${isRegenerate ? '🔥 发起深度重做请求 (限时120秒)...' : '3/4 呼叫 AI 端深度分析 (限时120秒)...'}`);

  let response;
  try {
    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 120000);
    response = await fetch(apiEndpoint, { method: 'POST', headers: headers, body: JSON.stringify(payload), signal: apiController.signal });
    clearTimeout(apiTimeout);
  } catch (err) {
    const errText = err.name === 'AbortError' ? "请求严重超时 (已超过120秒)，代理接口死机断连。" : `网络连接失败: ${err.message}`;
    await saveLog(reqLog, errText, true); throw new Error(errText);
  }

  updateStatus(tabId, "4/4 解析并执行后台强校验...");
  const resultData = await response.json();
  const rawResponseText = JSON.stringify(resultData, null, 2);

  if (!response.ok) {
    await saveLog(reqLog, rawResponseText, true);
    // 明确提示 500 错误的归属
    if (response.status === 500 || response.status === 502) {
       throw new Error(`[${modeName}] 代理服务器内部崩溃 (代码 ${response.status})。通常是由于代理商线路不稳定，请稍后重试。`);
    } else {
       throw new Error(`[${modeName}] 遭拒 (代码 ${response.status})。请查阅首选项错误日志。`);
    }
  }

  const generatedText = resultData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!generatedText) { await saveLog(reqLog, rawResponseText, true); throw new Error("AI 引擎未返回任何有效分析文字。"); }

  let finalJson;
  try {
      let cleanStr = generatedText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
      const firstBrace = cleanStr.indexOf('{');
      const lastBrace = cleanStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
      finalJson = JSON.parse(cleanStr);
      if (Object.keys(finalJson).length === 0) throw new Error("JSON为空");
  } catch (parseErr) {
      await saveLog(reqLog, `JSON 格式校验彻底失败！\n\nAI 原始乱码返回：\n${generatedText}`, true);
      throw new Error(`AI 未按要求返回纯 JSON 格式。已记录至错误日志，请重试。`);
  }

  await saveLog(reqLog, rawResponseText, false);
  safeSendMessage(tabId, { action: "showResult", data: JSON.stringify(finalJson) });
}