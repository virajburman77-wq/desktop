const BLOCKED_DOMAINS = [
  "paypal.com", "paytm.com", "phonepe.com", "gpay.com",
  "bankofamerica.com", "icicibank.com", "hdfcbank.com", "sbionline.com",
  "axisbank.com", "kotak.com", "yesbank.com",
];

const BLOCKED_PATHS = [
  "about:addons", "about:config", "about:debugging", "about:preferences",
  "about:profiles", "about:networking", "chrome://",
];

export class AgathContentChild extends JSWindowActorChild {
  receiveMessage(message) {
    switch (message.name) {
      case "Agath:ExtractDOM":
        return this._extractDOM();
      case "Agath:ExecuteAction":
        return this._executeAction(message.data);
      case "Agath:CheckBlocked":
        return this._checkBlocked();
      case "Agath:Highlight":
        return this._highlight(message.data.selector);
      default:
        return { error: "Unknown message" };
    }
  }

  _checkBlocked() {
    let url = this.contentWindow?.location?.href || "";
    let hostname = this.contentWindow?.location?.hostname || "";
    if (BLOCKED_PATHS.some(p => url.startsWith(p))) {
      return { blocked: true, reason: "browser-settings" };
    }
    if (BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d))) {
      return { blocked: true, reason: "financial" };
    }
    return { blocked: false };
  }

  _extractDOM() {
    let win = this.contentWindow;
    if (!win || !win.document) return { elements: [], url: "", title: "" };
    let url = win.location.href;
    let title = win.document.title || "";
    let elements = [];
    let seen = new Set();

    let all = win.document.querySelectorAll(
      "a, button, input, textarea, select, [role=button], [role=link], [tabindex]:not([tabindex=-1])"
    );
    for (let el of all) {
      if (!this._isVisible(el, win)) continue;
      let tag = el.tagName.toLowerCase();
      let text = (el.textContent || "").trim().slice(0, 120);
      let placeholder = el.getAttribute("placeholder") || "";
      let ariaLabel = el.getAttribute("aria-label") || "";
      let name = el.getAttribute("name") || "";
      let href = el.getAttribute("href") || "";
      let type = el.type || "";
      let role = el.getAttribute("role") || "";
      let selector = this._getSelector(el);
      if (!text && !placeholder && !ariaLabel && !name && !href && tag !== "input" && tag !== "textarea") continue;
      let label = text || placeholder || ariaLabel || name || href.slice(0, 60) || tag;
      let key = tag + "|" + label;
      if (seen.has(key)) continue;
      seen.add(key);
      elements.push({ tag, type, role, selector, text: text.slice(0, 80), placeholder: placeholder.slice(0, 40), name: name.slice(0, 40), href: href.slice(0, 80), ariaLabel: ariaLabel.slice(0, 40), label: label.slice(0, 80) });
    }
    return { elements: elements.slice(0, 150), url, title };
  }

  _highlight(selector) {
    let el = this._findElement(selector);
    if (!el) return { success: false };
    try {
      let win = this.contentWindow;
      let rect = el.getBoundingClientRect();
      let overlay = win.document.createElement("div");
      overlay.id = "agath-highlight";
      overlay.style.cssText = "position:fixed;z-index:999999;pointer-events:none;border:3px solid #ff4444;border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,0.15);transition:all 0.15s;";
      overlay.style.left = rect.left + "px";
      overlay.style.top = rect.top + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
      if (win.document.body) win.document.body.appendChild(overlay); else return { success: false };
      setTimeout(() => { try { overlay.remove(); } catch(e) {} }, 800);
      return { success: true };
    } catch (e) { return { success: false }; }
  }

  _getSelector(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    let parent = el.parentElement;
    let siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName) : [];
    let idx = siblings.indexOf(el) + 1;
    return el.tagName.toLowerCase() + ":nth-of-type(" + idx + ")";
  }

  _executeAction(data) {
    let win = this.contentWindow;
    if (!win || !win.document) return { success: false, error: "no window" };
    let { action, selector, text, url, direction, amount, ms } = data;
    let el = selector ? this._findElement(selector) : null;

    if (action !== "NAVIGATE" && action !== "WAIT" && action !== "SCROLL" && action !== "DONE" && !el) {
      return { success: false, error: "element not found: " + selector };
    }

    switch (action) {
      case "CLICK":
        el.click();
        return { success: true, action: "clicked" };
      case "TYPE":
        if (el.type === "file") return { success: false, error: "cannot type into file input" };
        el.focus();
        if (el.isContentEditable) {
          el.textContent = text || "";
        } else {
          el.value = "";
          for (let ch of (text || "")) { el.value += ch; el.dispatchEvent(new win.InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" })); }
        }
        el.dispatchEvent(new win.Event("change", { bubbles: true }));
        return { success: true, action: "typed", text };
      case "SCROLL":
        win.scrollBy(0, direction === "up" ? -(amount || 400) : (amount || 400));
        return { success: true, action: "scrolled", direction };
      case "NAVIGATE":
        return { success: true, action: "navigate", url };
      case "EXTRACT":
        let extracted = el ? (el.textContent || "").trim().slice(0, 1500) : "";
        return { success: true, action: "extracted", text: extracted };
      case "WAIT":
        return { success: true, action: "wait", ms: ms || 2000 };
      case "DONE":
        return { success: true, action: "done", message: text || "Done" };
      default:
        return { success: false, error: "unknown action: " + action };
    }
  }

  _findElement(selector) {
    try {
      if (selector.startsWith("#")) return this.contentWindow.document.querySelector(selector);
      return this.contentWindow.document.querySelector(selector);
    } catch (e) { return null; }
  }

  _isVisible(el, win) {
    try {
      let rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      let style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (rect.top > win.innerHeight + 200 || rect.bottom < -200) return false;
      return true;
    } catch (e) { return true; }
  }
}
