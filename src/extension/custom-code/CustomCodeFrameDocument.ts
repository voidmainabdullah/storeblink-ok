import preactRuntimeSource from "../../../node_modules/preact/dist/preact.min.umd.js?raw";
import preactHooksSource from "../../../node_modules/preact/hooks/dist/hooks.umd.js?raw";

const withoutSourceMapComment = (source: string) =>
  source.replace(/\n?\/\/# sourceMappingURL=.*$/gm, "");

const safeInlineScript = (source: string) =>
  withoutSourceMapComment(source).replace(/<\/script/gi, "<\\/script");

const bridge = `(() => {
  "use strict";
  const root = document.getElementById("storeblink-root");
  const style = document.getElementById("storeblink-style");
  const errorBox = document.getElementById("storeblink-error");
  const React = Object.assign({}, self.preact, self.preactHooks);
  const ReactDOM = {
    render: (value, target = root) => self.preact.render(value, target),
    createRoot: (target = root) => ({
      render: (value) => self.preact.render(value, target),
      unmount: () => self.preact.render(null, target),
    }),
  };
  let activeToken = "";
  const report = (type, payload = {}) => {
    parent.postMessage(Object.assign({
      scope: "storeblink-custom-code",
      token: activeToken,
      type,
    }, payload), "*");
  };
  const StoreBlink = {
    data: Object.freeze({}),
    render(value) {
      errorBox.hidden = true;
      ReactDOM.render(value, root);
    },
    navigate(path) {
      if (typeof path === "string" && path.length <= 2048) {
        report("navigate", { path });
      }
    },
    addToCart(productId, quantity = 1) {
      report("action", { action: "add-to-cart", productId, quantity });
    },
    openCart() {
      report("action", { action: "open-cart" });
    },
    viewProduct(productId) {
      report("action", { action: "view-product", productId });
    },
  };
  Object.defineProperties(self, {
    React: { value: React, configurable: false, writable: false },
    ReactDOM: { value: ReactDOM, configurable: false, writable: false },
    StoreBlink: { value: StoreBlink, configurable: false, writable: false },
  });
  addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const message = event.data;
    if (!message || message.scope !== "storeblink-custom-code-host" || typeof message.token !== "string") return;
    activeToken = message.token;
    style.textContent = typeof message.css === "string" ? message.css : "";
    StoreBlink.data = Object.freeze(
      message.data && typeof message.data === "object" ? message.data : {},
    );
    try {
      ReactDOM.render(null, root);
      errorBox.hidden = true;
      const execute = new Function(
        "React",
        "ReactDOM",
        "StoreBlink",
        '"use strict";\\n' + (message.compiledJs || ""),
      );
      execute(React, ReactDOM, StoreBlink);
      report("rendered");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errorBox.textContent = detail;
      errorBox.hidden = false;
      report("error", { message: detail.slice(0, 500) });
    }
  });
})();`;

export const CUSTOM_CODE_FRAME_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob: https:; media-src data: blob: https:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <style id="storeblink-style"></style>
  <style>html,body,#storeblink-root{width:100%;height:100%;margin:0;overflow:auto}#storeblink-error{position:fixed;inset:auto 8px 8px;padding:8px 10px;background:#7f1d1d;color:#fff;font:12px/1.4 ui-monospace,monospace;border-radius:4px;white-space:pre-wrap}</style>
</head>
<body>
  <div id="storeblink-root"></div>
  <pre id="storeblink-error" role="alert" hidden></pre>
  <script>${safeInlineScript(preactRuntimeSource)}</script>
  <script>${safeInlineScript(preactHooksSource)}</script>
  <script>${safeInlineScript(bridge)}</script>
</body>
</html>`;
