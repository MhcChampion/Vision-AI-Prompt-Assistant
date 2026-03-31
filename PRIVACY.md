隐私权政策 (Privacy Policy)
生效日期：2026年3月31日

1. 数据收集与使用说明 (Data Collection and Usage)
Vision AI Prompt Assistant（以下简称“本插件”）遵循最小化数据处理原则：

不收集个人身份信息：本插件不会收集、读取或存储您的姓名、电子邮件、电话号码或任何个人账号信息。

本地存储：您在设置面板中填写的 Gemini API Key、自定义人设规则和 UI 偏好，均仅通过 chrome.storage.local 存储在您的本地浏览器设备中。我们无法从服务器端访问这些数据。

图像处理：当您点击分析按钮时，本插件会将当前选中的图片 URL 或其 Base64 编码直接发送至您配置的 AI 服务端（官方 Gemini API 或您的第三方代理）。这些数据仅用于视觉分析，本插件不会在任何远程服务器上保留您的图片副本。

2. 数据传输安全 (Data Transmission)
本插件与 AI 后端的所有通信均通过加密的 HTTPS 协议进行。图像数据通过直接加密通道传输，不会经过任何第三方中间服务器。

3. 第三方服务说明 (Third-party Services)
本插件作为工具，会将数据发送至用户自行配置的第三方 AI 平台。我们建议您阅读并了解对应服务提供商（如 Google Gemini 或您的中转 API 提供商）的隐私政策。

4. 权限使用理由 (Permission Justification)
activeTab/contextMenus: 仅用于在用户主动操作时定位和分析目标图片。

storage: 仅用于在本地保存您的 API 密钥和偏好设置。

scripting: 仅用于在当前页面渲染美观的分析面板。

5. 政策变更 (Changes to This Policy)
我们可能会不时更新此隐私政策。任何更改都将发布在此页面上，您可以随时查看。

English Version (For Google Review)
1. Data Collection
Vision AI Prompt Assistant (referred to as "the Extension") adheres to the principle of data minimization:

No PII Collection: We do not collect, read, or store any Personally Identifiable Information (PII) such as names, emails, or phone numbers.

Local Storage: Your Gemini API Key, custom prompt rules, and UI preferences are stored exclusively in your local browser via chrome.storage.local. We have no access to this data.

Image Processing: Image data is transmitted directly to your configured AI endpoint (Gemini API) solely for visual analysis. We do not retain copies of your images on any remote server.

2. Data Transmission
All communication between the Extension and AI backends is conducted over encrypted HTTPS channels.

3. Third-party Disclosures
The Extension facilitates data transmission to AI platforms chosen by the user. Users should review the privacy policies of their selected providers (e.g., Google Gemini).
