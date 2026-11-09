import {
  APP_BLOCK_FRAME_SCOPE,
  APP_BLOCK_HOST_SCOPE,
  APP_BLOCK_PROTOCOL_VERSION,
} from "./contracts";

const safeInline = (value: string): string => value.replace(/<\/script/gi, "<\\/script");

export const createAppBlockFrameDocument = (token: string): string => {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new Error("App-block frame token must be 256-bit lowercase hex.");
  }
  const nonce = token;
  const bridge = `(() => {
  "use strict";
  const SCOPE_HOST = ${JSON.stringify(APP_BLOCK_HOST_SCOPE)};
  const SCOPE_FRAME = ${JSON.stringify(APP_BLOCK_FRAME_SCOPE)};
  const PROTOCOL = ${APP_BLOCK_PROTOCOL_VERSION};
  const TOKEN = ${JSON.stringify(token)};
  const root = document.getElementById("storeblink-app-root");
  const errorBox = document.getElementById("storeblink-app-error");
  let initialized = false;
  const deepFreeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };
  const report = (type, payload = {}) => parent.postMessage(Object.assign({
    scope: SCOPE_FRAME,
    protocolVersion: PROTOCOL,
    token: TOKEN,
    type,
  }, payload), "*");
  const readData = (data, path) => {
    if (path === "store.name") return data.store?.name ?? "";
    if (path === "store.currency") return data.store?.currency ?? "";
    if (path === "cart.itemCount") return String(data.cart?.itemCount ?? 0);
    if (path === "product.id") return data.product?.id ?? "";
    if (path === "product.title") return data.product?.title ?? "";
    if (path === "product.price") return data.product?.price ?? "";
    return "";
  };
  const render = (block, rawData) => {
    const data = deepFreeze(JSON.parse(JSON.stringify(rawData)));
    root.replaceChildren();
    root.setAttribute("aria-label", block.view.ariaLabel);
    block.view.elements.forEach((element) => {
      if (element.kind === "text") {
        const node = document.createElement(element.emphasis === "heading" ? "h2" : "p");
        node.className = "sb-" + element.emphasis;
        node.textContent = element.text;
        root.append(node);
        return;
      }
      if (element.kind === "data") {
        const row = document.createElement("div");
        row.className = "sb-data";
        const label = document.createElement("span");
        label.textContent = element.label;
        const value = document.createElement("strong");
        value.textContent = readData(data, element.path);
        row.append(label, value);
        root.append(row);
        return;
      }
      if (element.kind === "action") {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = element.label;
        button.addEventListener("click", () => report("frame:action", {
          action: element.action,
          productId: element.productId,
          quantity: element.quantity,
          path: element.path,
        }));
        root.append(button);
      }
    });
    errorBox.hidden = true;
    report("frame:rendered");
    requestAnimationFrame(() => report("frame:resize", {
      height: Math.max(1, Math.min(4096, Math.ceil(document.documentElement.scrollHeight))),
    }));
  };
  addEventListener("message", (event) => {
    if (event.source !== parent || initialized) return;
    const message = event.data;
    if (!message || message.scope !== SCOPE_HOST || message.protocolVersion !== PROTOCOL || message.token !== TOKEN || message.type !== "host:init") return;
    initialized = true;
    try {
      render(message.block, message.data);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errorBox.textContent = detail.slice(0, 500);
      errorBox.hidden = false;
      report("frame:error", { message: detail.slice(0, 500) });
    }
  });
  addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) event.preventDefault();
  }, true);
  report("frame:ready");
})();`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'none'; img-src data: blob:; media-src 'none'; font-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'">
  <style nonce="${nonce}">:root{color-scheme:light dark}*{box-sizing:border-box}html,body{margin:0;background:transparent;color:CanvasText;font:14px/1.5 system-ui,sans-serif}#storeblink-app-root{display:grid;gap:12px;padding:16px;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:8px}.sb-heading,.sb-body,.sb-muted{margin:0}.sb-heading{font-size:18px;line-height:1.25}.sb-muted{color:color-mix(in srgb,CanvasText 62%,transparent)}.sb-data{display:flex;justify-content:space-between;gap:16px}button{min-height:44px;padding:0 16px;border:0;border-radius:6px;background:CanvasText;color:Canvas;font:inherit;font-weight:700;cursor:pointer}#storeblink-app-error{margin:8px;padding:8px;background:#7f1d1d;color:#fff;white-space:pre-wrap}</style>
</head>
<body>
  <section id="storeblink-app-root"></section>
  <pre id="storeblink-app-error" role="alert" hidden></pre>
  <script nonce="${nonce}">${safeInline(bridge)}</script>
</body>
</html>`;
};
