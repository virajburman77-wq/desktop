var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const FINANCIAL_DOMAINS = [
  "paypal.com", "paytm.com", "phonepe.com", "gpay.com",
  "bankofamerica.com", "icicibank.com", "hdfcbank.com",
  "sbionline.com", "axisbank.com", "kotak.com", "yesbank.com",
  "citi.com", "wellsfargo.com", "chase.com", "capitalone.com",
];

const BLOCKED_URL_PREFIXES = [
  "about:addons", "about:config", "about:debugging",
  "about:preferences", "about:profiles", "about:networking",
];

const DANGEROUS_ACTIONS = ["submit", "purchase", "delete", "payment", "checkout"];

const LOGIN_ORIGIN = "agath://api-key";
const LOGIN_REALM = "Groq AI Key";

export class AgathSecurity {
  _focused = true;

  init() {
    window.addEventListener("focus", () => { this._focused = true; });
    window.addEventListener("blur", () => { this._focused = false; });
    document.addEventListener("visibilitychange", () => {
      this._focused = !document.hidden;
    });
  }

  isFocused() {
    return this._focused && !document.hidden;
  }

  async setApiKey(key) {
    try {
      let logins = await Services.logins.searchLoginsAsync({
        origin: LOGIN_ORIGIN,
        httpRealm: LOGIN_REALM,
      });
      for (let l of logins) {
        Services.logins.removeLogin(l);
      }
      let loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"]
        .createInstance(Ci.nsILoginInfo);
      loginInfo.init(LOGIN_ORIGIN, null, LOGIN_REALM, "groq-key", key, "", "");
      await Services.logins.addLoginAsync(loginInfo);
    } catch (e) {
      Services.prefs.setStringPref("zen.agath.api-key", key);
    }
  }

  async getApiKey() {
    try {
      let logins = await Services.logins.searchLoginsAsync({
        origin: LOGIN_ORIGIN,
        httpRealm: LOGIN_REALM,
      });
      if (logins.length) return logins[0].password;
    } catch (e) {}
    return Services.prefs.getStringPref("zen.agath.api-key", "");
  }

  async hasApiKey() {
    return !!(await this.getApiKey());
  }

  isBlockedURL(url, hostname) {
    if (BLOCKED_URL_PREFIXES.some(p => url.startsWith(p))) {
      return { blocked: true, reason: "browser-settings", message: "Cannot automate browser settings pages." };
    }
    if (FINANCIAL_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d))) {
      return { blocked: true, reason: "financial", message: "Financial websites are blocked for automation." };
    }
    return { blocked: false };
  }

  async confirmAction(action, details) {
    let text = details?.text || "";
    let isDangerous = DANGEROUS_ACTIONS.some(d =>
      text.toLowerCase().includes(d) || (action || "").toLowerCase().includes(d)
    );
    if (!isDangerous) return true;

    return new Promise((resolve) => {
      this._showConfirmPopup(
        "Agath AI needs your confirmation",
        `This action may require your review: "${text}"`,
        resolve
      );
    });
  }

  _showConfirmPopup(title, message, callback) {
    let container = document.getElementById("zen-toast-container");
    if (!container) { callback(true); return; }

    let box = document.createXULElement("vbox");
    box.style.background = "var(--zen-dialog-background, -moz-dialog)";
    box.style.border = "2px solid #e44";
    box.style.borderRadius = "12px";
    box.style.padding = "16px";
    box.style.marginTop = "8px";
    box.style.maxWidth = "400px";
    box.style.boxShadow = "0 4px 24px rgba(0,0,0,0.2)";

    let titleLbl = document.createXULElement("label");
    titleLbl.textContent = title;
    titleLbl.style.fontWeight = "bold";
    titleLbl.style.marginBottom = "8px";

    let msgLbl = document.createXULElement("description");
    msgLbl.textContent = message;
    msgLbl.style.marginBottom = "12px";
    msgLbl.style.fontSize = "12px";

    let btnBox = document.createXULElement("hbox");
    btnBox.style.justifyContent = "end";
    btnBox.style.gap = "8px";

    let denyBtn = document.createXULElement("button");
    denyBtn.setAttribute("label", "Deny");
    denyBtn.addEventListener("command", () => {
      box.remove();
      callback(false);
    });

    let allowBtn = document.createXULElement("button");
    allowBtn.setAttribute("label", "Allow");
    allowBtn.setAttribute("style", "background: #e44; color: white;");
    allowBtn.addEventListener("command", () => {
      box.remove();
      callback(true);
    });

    btnBox.appendChild(denyBtn);
    btnBox.appendChild(allowBtn);
    box.appendChild(titleLbl);
    box.appendChild(msgLbl);
    box.appendChild(btnBox);
    container.appendChild(box);
  }
}

window.gAgathSecurity = new AgathSecurity();
