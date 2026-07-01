var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const SPEECH_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>
let r=null,i=false;window.addEventListener("message",e=>{e.data==="start"?s():e.data==="stop"?t():0});
function s(){if(i)return;const S=window.SpeechRecognition||window.webkitSpeechRecognition;if(!S){window.parent.postMessage({type:"error",error:"not-supported"},"*");return}
r=new S();r.continuous=true;r.interimResults=true;r.lang="en-US";
r.onresult=e=>{let f="",in_="";for(let j=e.resultIndex;j<e.results.length;j++){if(e.results[j].isFinal)f+=e.results[j][0].transcript;else in_+=e.results[j][0].transcript}
if(in_)window.parent.postMessage({type:"interim",text:in_},"*");if(f)window.parent.postMessage({type:"final",text:f.trim()},"*")};
r.onerror=e=>{window.parent.postMessage({type:"error",error:e.error},"*")};
r.onend=()=>{i=false;window.parent.postMessage({type:"ended"},"*")};
try{r.start();i=true;window.parent.postMessage({type:"started"},"*")}catch(e){window.parent.postMessage({type:"error",error:e.message},"*")}}
function t(){if(r)try{r.stop()}catch(e){}i=false}
<\/script></head><body></body></html>`;

const MAX_MESSAGES = 50;
const RATE_LIMIT_MS = 1000;
const HISTORY_PREF = "zen.agath.last-history";
const CUSTOM_CMDS_PREF = "zen.agath.custom-commands";
const ONBOARDING_PREF = "zen.agath.onboarding-done";
const DEFAULT_MODEL = "llama-3.1-70b-versatile";
const VISION_MODEL = "llama-3.2-11b-vision-preview";

export class AgathManager {
  _panel = null; _messagesContainer = null; _inputField = null;
  _sendBtn = null; _micBtn = null; _toggleBtn = null; _pauseBtn = null;
  _settingsBtn = null; _settingsPanel = null;
  _security = null; _hiddenBrowser = null; _voiceWindow = null;
  _isListening = false; _running = false; _paused = false;
  _stepCount = 0; _actionHistory = []; _task = "";
  _lastCallTime = 0; _shouldStop = false;

  constructor() { this._security = window.gAgathSecurity; }

  init() {
    this._injectVoiceBrowser();
    this._injectPanel();
    this._injectToggleButton();
    this._checkOnboarding();
    window.addEventListener("unload", () => this._cleanup(), { once: true });
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) { e.preventDefault(); this.togglePanel(); }
    });
  }

  _cleanup() {
    if (this._voiceWindow && this._voiceHandler) { try { this._voiceWindow.removeEventListener("message", this._voiceHandler); } catch(e) {} }
    if (this._hiddenBrowser) { try { this._hiddenBrowser.remove(); } catch(e) {} this._hiddenBrowser = null; this._voiceWindow = null; }
    this._running = false; this._paused = false;
  }

  _checkOnboarding() {
    if (!Services.prefs.getBoolPref(ONBOARDING_PREF, false)) {
      setTimeout(() => this._showOnboarding(), 2000);
    }
  }

  _showOnboarding() {
    let c = document.getElementById("zen-toast-container");
    if (!c) return;
    let box = document.createXULElement("vbox");
    box.setAttribute("style", "background:var(--zen-dialog-background,-moz-dialog);border:2px solid var(--zen-brand-color);border-radius:12px;padding:20px;margin-top:8px;max-width:440px;box-shadow:0 4px 24px rgba(0,0,0,0.2);");
    let t = document.createXULElement("label");
    t.textContent = "Welcome to Agath AI!"; t.setAttribute("style", "font-weight:bold;font-size:16px;margin-bottom:8px;");
    let d = document.createXULElement("description");
    d.textContent = "I'm your AI browser assistant.\n• Click the AI button in toolbar to open panel\n• Press Ctrl+Shift+A to toggle\n• Get a free Groq API key at console.groq.com\n• I can search, click, type, fill forms, and more!";
    d.setAttribute("style", "font-size:12px;margin-bottom:12px;white-space:pre-wrap;");
    let btn = document.createXULElement("button");
    btn.setAttribute("label", "Get Started!"); btn.setAttribute("style", "align-self:end;");
    btn.addEventListener("command", () => { box.remove(); Services.prefs.setBoolPref(ONBOARDING_PREF, true); this.showPanel(); });
    box.appendChild(t); box.appendChild(d); box.appendChild(btn);
    c.appendChild(box);
  }

  _injectVoiceBrowser() {
    this._hiddenBrowser = document.createXULElement("browser");
    this._hiddenBrowser.setAttribute("type", "content"); this._hiddenBrowser.setAttribute("style", "display:none");
    this._hiddenBrowser.setAttribute("disablehistory", "true");
    this._hiddenBrowser.loadURI("data:text/html;charset=utf-8," + encodeURIComponent(SPEECH_HTML), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
    this._voiceHandler = (e) => this._onVoiceMessage(e);
    this._hiddenBrowser.addEventListener("load", () => {
      this._voiceWindow = this._hiddenBrowser.contentWindow;
      if (this._voiceWindow) this._voiceWindow.addEventListener("message", this._voiceHandler);
    }, { once: true });
    document.getElementById("appcontent")?.appendChild(this._hiddenBrowser);
  }

  _injectPanel() {
    let p = document.createXULElement("vbox"); p.id = "agath-panel"; p.setAttribute("hidden", "true");

    let hdr = document.createXULElement("hbox"); hdr.id = "agath-header";
    let title = document.createXULElement("label");
    title.textContent = "Agath AI"; title.setAttribute("style", "font-weight:bold;font-size:14px;");

    this._pauseBtn = document.createXULElement("toolbarbutton");
    this._pauseBtn.id = "agath-pause-btn"; this._pauseBtn.setAttribute("label", "⏸");
    this._pauseBtn.setAttribute("tooltiptext", "Pause/Resume"); this._pauseBtn.setAttribute("style", "cursor:pointer;");
    this._pauseBtn.addEventListener("command", () => this._togglePause());

    this._settingsBtn = document.createXULElement("toolbarbutton");
    this._settingsBtn.id = "agath-settings-btn"; this._settingsBtn.setAttribute("label", "⚙");
    this._settingsBtn.setAttribute("tooltiptext", "Settings"); this._settingsBtn.setAttribute("style", "cursor:pointer;");
    this._settingsBtn.addEventListener("command", () => this._toggleSettings());

    let clearBtn = document.createXULElement("toolbarbutton");
    clearBtn.setAttribute("label", "Clear"); clearBtn.setAttribute("style", "cursor:pointer;font-size:11px;");
    clearBtn.addEventListener("command", () => this._clearChat());

    let closeBtn = document.createXULElement("toolbarbutton");
    closeBtn.setAttribute("label", "X"); closeBtn.setAttribute("style", "margin-left:auto;cursor:pointer;");
    closeBtn.addEventListener("command", () => this.hidePanel());

    hdr.appendChild(title); hdr.appendChild(this._pauseBtn); hdr.appendChild(this._settingsBtn);
    hdr.appendChild(clearBtn); hdr.appendChild(closeBtn);

    this._messagesContainer = document.createXULElement("vbox");
    this._messagesContainer.id = "agath-messages";
    this._messagesContainer.setAttribute("flex", "1");
    this._messagesContainer.setAttribute("style", "overflow-y:auto;padding:8px;");

    this._settingsPanel = document.createXULElement("vbox");
    this._settingsPanel.id = "agath-settings"; this._settingsPanel.setAttribute("hidden", "true");
    this._settingsPanel.setAttribute("style", "padding:8px;border-bottom:1px solid var(--zen-border-color,ThreeDShadow);font-size:12px;");

    let sl = document.createXULElement("label"); sl.textContent = "Settings"; sl.setAttribute("style", "font-weight:bold;margin-bottom:6px;");
    this._settingsPanel.appendChild(sl);

    let keyLbl = document.createXULElement("label"); keyLbl.textContent = "Groq API Key:";
    let keyInput = document.createXULElement("textbox");
    keyInput.setAttribute("type", "password"); keyInput.setAttribute("placeholder", "gsk_...");
    (async () => { try { let k = await this._security.getApiKey(); if (k) keyInput.value = k; } catch(e) {} })();
    let keyBtn = document.createXULElement("button"); keyBtn.setAttribute("label", "Save");
    keyBtn.addEventListener("command", async () => {
      let v = keyInput.value.trim();
      if (!v) return;
      if (!v.startsWith("gsk_")) { this._addMessage("system", "Invalid key — must start with gsk_"); return; }
      await this._security.setApiKey(v); this._addMessage("system", "Key saved!");
    });

    let modelLbl = document.createXULElement("label"); modelLbl.textContent = "Model:";
    let modelInput = document.createXULElement("textbox");
    modelInput.value = Services.prefs.getCharPref("zen.agath.model", DEFAULT_MODEL);
    modelInput.setAttribute("style", "font-family:monospace;font-size:11px;");
    let modelBtn = document.createXULElement("button"); modelBtn.setAttribute("label", "Update");
    modelBtn.addEventListener("command", () => { Services.prefs.setCharPref("zen.agath.model", modelInput.value); this._addMessage("system", "Model updated!"); });

    let stepsLbl = document.createXULElement("label"); stepsLbl.textContent = "Max Steps: " + Services.prefs.getIntPref("zen.agath.max-steps", 20);
    let stepsSlider = document.createXULElement("scale");
    stepsSlider.setAttribute("min", "5"); stepsSlider.setAttribute("max", "50"); stepsSlider.setAttribute("value", Services.prefs.getIntPref("zen.agath.max-steps", 20));
    stepsSlider.addEventListener("command", () => { let v = parseInt(stepsSlider.value); Services.prefs.setIntPref("zen.agath.max-steps", v); stepsLbl.textContent = "Max Steps: " + v; });

    let customLbl = document.createXULElement("label"); customLbl.textContent = "Custom Commands:"; customLbl.setAttribute("style", "font-weight:bold;margin-top:6px;");
    this._settingsPanel.appendChild(keyLbl); this._settingsPanel.appendChild(keyInput);
    this._settingsPanel.appendChild(keyBtn);
    this._settingsPanel.appendChild(modelLbl); this._settingsPanel.appendChild(modelInput);
    this._settingsPanel.appendChild(modelBtn);
    this._settingsPanel.appendChild(stepsLbl); this._settingsPanel.appendChild(stepsSlider);
    this._settingsPanel.appendChild(customLbl);

    let ib = document.createXULElement("hbox"); ib.id = "agath-input-box";
    this._inputField = document.createXULElement("textbox"); this._inputField.id = "agath-input";
    this._inputField.setAttribute("placeholder", "Ask Agath to do something...");
    this._inputField.setAttribute("style", "flex:1;");
    this._inputField.addEventListener("keypress", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this._sendText(); } });
    this._micBtn = document.createXULElement("toolbarbutton"); this._micBtn.id = "agath-mic-btn";
    this._micBtn.setAttribute("label", "🎤"); this._micBtn.setAttribute("tooltiptext", "Voice input");
    this._micBtn.addEventListener("command", () => this._toggleMic());
    this._sendBtn = document.createXULElement("toolbarbutton"); this._sendBtn.id = "agath-send-btn";
    this._sendBtn.setAttribute("label", "Send"); this._sendBtn.setAttribute("disabled", "true");
    this._sendBtn.addEventListener("command", () => this._sendText());
    this._inputField.addEventListener("input", () => {
      if (this._inputField.value.trim()) this._sendBtn.removeAttribute("disabled");
      else this._sendBtn.setAttribute("disabled", "true");
    });
    ib.appendChild(this._inputField); ib.appendChild(this._micBtn); ib.appendChild(this._sendBtn);

    p.appendChild(hdr); p.appendChild(this._settingsPanel); p.appendChild(this._messagesContainer); p.appendChild(ib);
    document.getElementById("browser").appendChild(p);
    this._panel = p;
    this._loadCustomCommands();
  }

  _loadCustomCommands() {
    try {
      let raw = Services.prefs.getStringPref(CUSTOM_CMDS_PREF, "[]");
      let cmds = JSON.parse(raw);
      if (cmds.length) {
        let box = document.createXULElement("vbox"); box.setAttribute("style", "gap:4px;margin-top:4px;");
        for (let c of cmds) {
          let row = document.createXULElement("hbox"); row.className = "agath-cmd-row"; row.setAttribute("style", "align-items:center;gap:4px;");
          let lbl = document.createXULElement("label"); lbl.textContent = "\"" + c.trigger + "\" → " + c.action;
          lbl.setAttribute("style", "font-size:11px;flex:1;");
          let del = document.createXULElement("toolbarbutton"); del.setAttribute("label", "✕");
          del.setAttribute("style", "cursor:pointer;font-size:11px;");
          del.addEventListener("command", () => { row.remove(); this._saveCustomCommands(); });
          row.appendChild(lbl); row.appendChild(del);
          if (box.children.length < 20) box.appendChild(row);
        }
        let addBtn = document.createXULElement("button"); addBtn.setAttribute("label", "+ Add Command");
        addBtn.setAttribute("style", "font-size:11px;margin-top:4px;");
        addBtn.addEventListener("command", () => this._addCustomCommandUI());
        this._settingsPanel.appendChild(box);
        this._settingsPanel.appendChild(addBtn);
      } else {
        let addBtn = document.createXULElement("button"); addBtn.setAttribute("label", "+ Add Custom Command");
        addBtn.setAttribute("style", "font-size:11px;margin-top:4px;");
        addBtn.addEventListener("command", () => this._addCustomCommandUI());
        this._settingsPanel.appendChild(addBtn);
      }
    } catch(e) {}
  }

  _addCustomCommandUI() {
    let box = document.createXULElement("vbox"); box.setAttribute("style", "border:1px solid var(--zen-border-color,ThreeDShadow);border-radius:6px;padding:8px;margin-top:4px;gap:4px;");
    let trgLbl = document.createXULElement("label"); trgLbl.textContent = "Trigger phrase:";
    let trgInput = document.createXULElement("textbox"); trgInput.setAttribute("placeholder", "e.g. order pizza");
    let urlLbl = document.createXULElement("label"); urlLbl.textContent = "URL:";
    let urlInput = document.createXULElement("textbox"); urlInput.setAttribute("placeholder", "e.g. https://pizza.com");
    let actionLbl = document.createXULElement("label"); actionLbl.textContent = "Action:";
    let actionInput = document.createXULElement("textbox"); actionInput.setAttribute("placeholder", "e.g. CLICK #order-btn");
    let saveBtn = document.createXULElement("button"); saveBtn.setAttribute("label", "Save Command");
    saveBtn.addEventListener("command", () => {
      if (trgInput.value.trim() && actionInput.value.trim()) {
        try {
          let raw = Services.prefs.getStringPref(CUSTOM_CMDS_PREF, "[]");
          let cmds = JSON.parse(raw);
          cmds.push({ trigger: trgInput.value.trim(), url: urlInput.value.trim(), action: actionInput.value.trim() });
          Services.prefs.setStringPref(CUSTOM_CMDS_PREF, JSON.stringify(cmds));
          box.remove();
          this._addMessage("system", "Command saved! Restart panel to see it.");
        } catch(e) {}
      }
    });
    let cancelBtn = document.createXULElement("button"); cancelBtn.setAttribute("label", "Cancel");
    cancelBtn.addEventListener("command", () => box.remove());
    box.appendChild(trgLbl); box.appendChild(trgInput); box.appendChild(urlLbl); box.appendChild(urlInput);
    box.appendChild(actionLbl); box.appendChild(actionInput);
    let btnRow = document.createXULElement("hbox"); btnRow.setAttribute("style", "gap:4px;");
    btnRow.appendChild(saveBtn); btnRow.appendChild(cancelBtn);
    box.appendChild(btnRow);
    this._settingsPanel.appendChild(box);
    trgInput.focus();
  }

  _saveCustomCommands() {
    let cmds = [];
    let rows = this._settingsPanel.querySelectorAll("hbox.agath-cmd-row");
    for (let row of rows) {
      let lbl = row.querySelector("label");
      if (lbl) {
        let txt = lbl.textContent || "";
        let idx = txt.indexOf("\" → ");
        if (idx > 0) {
          let trigger = txt.substring(1, idx);
          let action = txt.substring(idx + 4);
          cmds.push({ trigger, action });
        }
      }
    }
    Services.prefs.setStringPref(CUSTOM_CMDS_PREF, JSON.stringify(cmds));
  }

  _toggleSettings() {
    if (this._settingsPanel.getAttribute("hidden") === null) this._settingsPanel.setAttribute("hidden", "true");
    else this._settingsPanel.removeAttribute("hidden");
  }

  _injectToggleButton() {
    let navbar = document.getElementById("nav-bar");
    if (!navbar) return;
    this._toggleBtn = document.createXULElement("toolbarbutton");
    this._toggleBtn.id = "agath-toggle-btn";
    this._toggleBtn.setAttribute("class", "toolbarbutton-1 chromeclass-toolbar-additional");
    this._toggleBtn.setAttribute("label", "AI"); this._toggleBtn.setAttribute("tooltiptext", "Toggle Agath AI Panel (Ctrl+Shift+A)");
    this._toggleBtn.addEventListener("command", () => this.togglePanel());
    navbar.appendChild(this._toggleBtn);
  }

  togglePanel() { if (this._panel.getAttribute("hidden") === null) this.hidePanel(); else this.showPanel(); }
  showPanel() { this._panel.removeAttribute("hidden"); if (this._toggleBtn) this._toggleBtn.setAttribute("active", "true"); this._inputField.focus(); }
  hidePanel() { this._panel.setAttribute("hidden", "true"); if (this._toggleBtn) this._toggleBtn.removeAttribute("active"); }

  _clearChat() {
    while (this._messagesContainer.firstChild) this._messagesContainer.firstChild.remove();
    this._actionHistory = []; Services.prefs.setStringPref(HISTORY_PREF, "");
  }

  _togglePause() {
    this._paused = !this._paused;
    this._pauseBtn.setAttribute("label", this._paused ? "▶" : "⏸");
    if (this._paused) this._addMessage("system", "Task paused. Click ▶ to resume.");
    else this._addMessage("system", "Resuming...");
  }

  async _sendText() {
    if (this._running && !this._paused) return;
    let text = this._inputField.value.trim();
    if (!text) return;
    this._inputField.value = ""; this._sendBtn.setAttribute("disabled", "true");
    this._addMessage("user", text); this._truncateMessages();

    let cmds = this._matchCustomCommand(text);
    if (cmds) {
      this._addMessage("system", "Running custom command...");
      if (cmds.url) gBrowser.selectedBrowser.loadURI(cmds.url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      await this._sleep(1500);
    }
    await this._runTask(text);
  }

  _matchCustomCommand(text) {
    try {
      let raw = Services.prefs.getStringPref(CUSTOM_CMDS_PREF, "[]");
      let cmds = JSON.parse(raw);
      let t = text.toLowerCase();
      for (let c of cmds) {
        if (t.includes(c.trigger.toLowerCase())) return c;
      }
    } catch(e) {}
    return null;
  }

  _toggleMic() {
    if (!this._voiceWindow) return;
    if (this._isListening) { this._voiceWindow.postMessage("stop", "*"); this._isListening = false; this._micBtn.removeAttribute("active"); }
    else { this._voiceWindow.postMessage("start", "*"); this._isListening = true; this._micBtn.setAttribute("active", "true"); }
  }

  _onVoiceMessage(event) {
    let data = event.data;
    if (!data || typeof data !== "object") return;
    switch (data.type) {
      case "interim": this._inputField.value = data.text; break;
      case "final": this._inputField.value = data.text; this._isListening = false; this._micBtn.removeAttribute("active"); this._sendText(); break;
      case "error": this._isListening = false; this._micBtn.removeAttribute("active"); if (data.error !== "no-speech") this._addMessage("system", "Voice: " + data.error); break;
      case "ended": this._isListening = false; this._micBtn.removeAttribute("active"); break;
    }
  }

  _addMessage(role, text) {
    let msg = document.createXULElement("vbox");
    let style = "padding:8px 12px;margin:4px 0;border-radius:8px;max-width:90%;";
    switch (role) {
      case "user": style += "background:#e3f2fd;align-self:flex-end;margin-left:auto;"; break;
      case "assistant": style += "background:var(--zen-dialog-background,#f5f5f5);align-self:flex-start;"; break;
      default: style += "background:var(--agath-system-bg,#fff3e0);align-self:center;font-style:italic;font-size:11px;"; break;
    }
    msg.setAttribute("style", style);
    let rl = document.createXULElement("label");
    rl.textContent = role === "user" ? "You" : role === "assistant" ? "Agath" : "System";
    rl.setAttribute("style", "font-weight:600;font-size:11px;margin-bottom:2px;");
    let te = document.createXULElement("description");
    te.textContent = text; te.setAttribute("style", "font-size:12px;white-space:pre-wrap;word-break:break-word;");
    msg.appendChild(rl); msg.appendChild(te);
    this._messagesContainer.appendChild(msg);
    msg.scrollIntoView(false);
  }

  _truncateMessages() { while (this._messagesContainer.children.length > MAX_MESSAGES) this._messagesContainer.children[0].remove(); }

  _addThinking() {
    let el = document.createXULElement("vbox");
    el.id = "agath-thinking";
    el.setAttribute("style", "padding:8px;font-style:italic;color:var(--zen-secondary-text,#888);font-size:12px;");
    el.textContent = "Agath is thinking...";
    this._messagesContainer.appendChild(el); el.scrollIntoView(false);
    return el;
  }

  _tryOffline(task) {
    let t = task.toLowerCase();
    let m;
    if ((m = t.match(/^(?:open|go to|navigate|launch)\s+(.+)/))) {
      let url = m[1].trim();
      if (!url.includes(".") && !url.startsWith("localhost")) url += ".com";
      if (/^https?:\/\//i.test(url)) return { action: "NAVIGATE", url };
      if (url.includes(".")) url = "https://" + url;
      else url = "https://www." + url + ".com";
      return { action: "NAVIGATE", url };
    }
    if ((m = t.match(/^(?:search|google|find)\s+(?:for\s+)?(.+)/))) {
      return { action: "NAVIGATE", url: "https://www.google.com/search?q=" + encodeURIComponent(m[1].trim()) };
    }
    if (/^(?:go\s+)?back$/.test(t)) return { action: "BACK" };
    if (/^(?:go\s+)?forward$/.test(t)) return { action: "FORWARD" };
    if (/^scroll\s+up/.test(t)) return { action: "SCROLL", direction: "up", amount: 400 };
    if (/^scroll\s+down/.test(t)) return { action: "SCROLL", direction: "down", amount: 400 };
    if (/^new\s+tab$/.test(t)) return { action: "NEW_TAB" };
    if (/^close\s+tab/.test(t)) return { action: "CLOSE_TAB" };
    if (/^refresh|reload/.test(t)) return { action: "REFRESH" };
    return null;
  }

  async _executeAGM(cmd, tab, actor) {
    if (cmd.action === "CLICK") {
      await actor.sendQuery("Agath:Highlight", { selector: cmd.selector });
      await this._sleep(300);
      return actor.sendQuery("Agath:ExecuteAction", cmd);
    }
    if (cmd.action === "NAVIGATE") {
      try {
        await new Promise((resolve) => {
          let onLoad = () => { tab.removeEventListener("load", onLoad, true); resolve(); };
          let timeout = setTimeout(() => { tab.removeEventListener("load", onLoad, true); resolve(); }, 20000);
          tab.addEventListener("load", onLoad, true);
          tab.loadURI(cmd.url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
        });
      } catch(e) {}
      await this._sleep(500);
      return { success: true };
    }
    if (cmd.action === "NEW_TAB") {
      let newTab = gBrowser.addTab(cmd.url || "about:newtab", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      if (cmd.url) setTimeout(() => gBrowser.selectedTab = newTab, 100);
      return { success: true };
    }
    if (cmd.action === "SWITCH_TAB") {
      let idx = cmd.index != null ? cmd.index : (cmd.direction === "next" ? gBrowser.tabs.indexOf(gBrowser.selectedTab) + 1 : gBrowser.tabs.indexOf(gBrowser.selectedTab) - 1);
      if (idx >= 0 && idx < gBrowser.tabs.length) { gBrowser.selectedTab = gBrowser.tabs[idx]; await this._sleep(500); }
      return { success: true };
    }
    if (cmd.action === "CLOSE_TAB") {
      if (gBrowser.tabs.length > 1) gBrowser.removeTab(gBrowser.selectedTab);
      return { success: true };
    }
    if (cmd.action === "BACK") { gBrowser.goBack(); await this._sleep(1000); return { success: true }; }
    if (cmd.action === "FORWARD") { gBrowser.goForward(); await this._sleep(1000); return { success: true }; }
    if (cmd.action === "REFRESH") { gBrowser.reloadTab(gBrowser.selectedTab); await this._sleep(1500); return { success: true }; }
    if (cmd.action === "SCROLL") {
      if (tab.contentWindow) tab.contentWindow.scrollBy(0, cmd.direction === "up" ? -(cmd.amount || 400) : (cmd.amount || 400));
      return { success: true };
    }
    if (cmd.action === "WAIT") { await this._sleep(cmd.ms || 2000); return { success: true }; }
    if (cmd.action === "DONE") return { success: true, done: true };

    return actor?.sendQuery("Agath:ExecuteAction", cmd) || { success: false, error: "no actor" };
  }

  async _runTask(task) {
    this._running = true; this._paused = false; this._shouldStop = false;
    this._stepCount = 0; this._task = task; this._actionHistory = [];
    let maxSteps = Services.prefs.getIntPref("zen.agath.max-steps", 20);
    let useGroq = true;

    let stopCheck = () => this._shouldStop = this._panel?.getAttribute("hidden") !== null;
    let checkListener = () => { if (this._running) stopCheck(); };

    try {
      let offline = this._tryOffline(task);
      if (offline) { useGroq = false; this._addMessage("assistant", this._formatAction(offline)); }

      for (let step = 0; step < maxSteps; step++) {
        if (this._shouldStop || this._panel?.getAttribute("hidden") !== null) { this._shouldStop = true; break; }
        this._stepCount = step + 1;
        let thought = this._addThinking();

        if (useGroq) {
          let tab = gBrowser.selectedBrowser;
          if (!tab) { thought.remove(); this._addMessage("system", "No active tab."); break; }
          while (this._paused && !this._shouldStop) { await this._sleep(300); }
          if (this._shouldStop) { thought.remove(); break; }
          if (!this._security.isFocused()) {
            thought.remove(); this._addMessage("system", "Paused — focus this tab to resume.");
            await this._waitForFocus();
            if (this._shouldStop) break;
            thought = this._addThinking();
          }
          let actor = tab.browsingContext?.currentWindowGlobal?.getActor("AgathContent");
          if (!actor) { thought.remove(); this._addMessage("system", "Cannot access page content."); break; }
          let blocked = await actor.sendQuery("Agath:CheckBlocked");
          if (blocked.blocked) { thought.remove(); this._addMessage("system", "Blocked: " + (blocked.reason === "financial" ? "Financial" : "Settings")); break; }

          let dom = await actor.sendQuery("Agath:ExtractDOM");
          let groqResult = await this._callGroq(task, dom);
          thought.remove();
          if (groqResult === null) { break; }
          if (groqResult && groqResult.error) {
            this._addMessage("system", "Groq offline. Using local fallback.");
            let fb = this._tryOffline(task);
            if (fb) { offline = fb; useGroq = false; }
            else { break; }
          }
          if (offline) { useGroq = false; thought = this._addThinking(); }
          else {
            let cmd = groqResult;
            if (cmd.action !== "DONE") this._actionHistory.push({ step: this._stepCount, action: cmd.action, selector: cmd.selector, text: (cmd.text || "").slice(0, 40) });
            Services.prefs.setStringPref(HISTORY_PREF, JSON.stringify(this._actionHistory));
            this._addMessage("assistant", this._formatAction(cmd));
            if (cmd.action === "DONE") { this._addMessage("system", cmd.message || "Done!"); break; }
            let confirmed = await this._security.confirmAction(cmd.action, cmd);
            if (!confirmed) { this._addMessage("system", "Cancelled."); break; }
            await this._executeAGM(cmd, tab, actor);
            await this._sleep(Services.prefs.getIntPref("zen.agath.human-delay-ms", 800));
            this._truncateMessages();
            continue;
          }
        }

        if (offline) {
          let cmd = offline;
          thought.remove();
          if (cmd.action !== "DONE") this._actionHistory.push({ step: this._stepCount, action: cmd.action, text: (cmd.text || cmd.url || "").slice(0, 40) });
          let confirmed = await this._security.confirmAction(cmd.action, cmd);
          if (!confirmed) { this._addMessage("system", "Cancelled."); break; }
          await this._executeAGM(cmd, gBrowser.selectedBrowser, null);
          this._addMessage("system", "Done (offline mode).");
          break;
        }
      }
    } catch (e) { this._addMessage("system", "Error: " + (e.message || e)); }

    this._running = false; this._paused = false;
    if (this._stepCount >= maxSteps && useGroq) this._addMessage("system", "Stopped — max steps.");
    Services.prefs.setStringPref(HISTORY_PREF, "");
  }

  _formatAction(cmd) {
    let t = "**" + (cmd.action || "?") + "**";
    if (cmd.selector) t += " on `" + cmd.selector + "`";
    if (cmd.text) t += ": \"" + cmd.text.slice(0, 60) + "\"";
    if (cmd.url) t += ": " + cmd.url;
    if (cmd.message) t += ": " + cmd.message;
    if (cmd.index != null) t += " [index=" + cmd.index + "]";
    if (cmd.direction) t += " [" + cmd.direction + "]";
    return t;
  }

  async _callGroq(task, dom) {
    let apiKey = await this._security.getApiKey();
    if (!apiKey) { this._showApiKeyPrompt(); return null; }
    let now = Date.now();
    if (now - this._lastCallTime < RATE_LIMIT_MS) await this._sleep(RATE_LIMIT_MS - (now - this._lastCallTime));
    this._lastCallTime = Date.now();
    let model = Services.prefs.getCharPref("zen.agath.model", DEFAULT_MODEL);
    let elementsText = (dom.elements || []).map(e => `[${e.selector}] <${e.tag}${e.type ? " type=" + e.type : ""}> "${e.label}"`).join("\n");
    if (elementsText.length > 6000) elementsText = elementsText.slice(0, 6000) + "\n... (truncated)";
    let historyText = "";
    if (this._actionHistory.length) {
      historyText = "Previous actions:\n" + this._actionHistory.map(h => `  Step ${h.step}: ${h.action}${h.selector ? " on " + h.selector : ""}${h.text ? " \"" + h.text + "\"" : ""}`).join("\n") + "\n\n";
      if (historyText.length > 3000) historyText = historyText.slice(0, 3000) + "\n... (truncated)";
    }
    let sysPrompt = `You are "Agath AI", a browser automation assistant.
Page: ${dom.title || "unknown"}
URL: ${dom.url || "unknown"}
Elements:\n${elementsText || "none"}
${historyText}
Return ONLY valid JSON. No markdown.
Actions: {"action":"CLICK","selector":"..."}|{"action":"TYPE","selector":"...","text":"..."}|{"action":"SCROLL","direction":"up|down","amount":400}|{"action":"NAVIGATE","url":"..."}|{"action":"WAIT","ms":2000}|{"action":"EXTRACT","selector":"..."}|{"action":"NEW_TAB","url":"..."}|{"action":"SWITCH_TAB","index":0}|{"action":"SWITCH_TAB","direction":"next|prev"}|{"action":"CLOSE_TAB"}|{"action":"DONE","message":"..."}
Rules: use listed selectors, WAIT after NAVIGATE, EXTRACT for info, DONE when complete.`;

    try {
      let resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: sysPrompt }, { role: "user", content: task }], temperature: 0.1, max_tokens: 500 }),
      });
      if (!resp.ok) { let t = await resp.text(); return { error: "HTTP " + resp.status + ": " + t.slice(0, 200) }; }
      let json = await resp.json();
      let content = json.choices?.[0]?.message?.content?.trim() || "";
      if (!content) return { error: "Empty response" };
      content = content.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
      return JSON.parse(content);
    } catch (e) { return { error: e.message }; }
  }

  _showApiKeyPrompt() {
    let c = document.getElementById("zen-toast-container");
    if (!c) return;
    let box = document.createXULElement("vbox");
    box.setAttribute("style", "background:var(--zen-dialog-background,-moz-dialog);border:2px solid var(--zen-brand-color);border-radius:12px;padding:16px;margin-top:8px;max-width:400px;");
    let lbl = document.createXULElement("label"); lbl.textContent = "Enter your Groq API Key"; lbl.setAttribute("style", "font-weight:bold;margin-bottom:8px;");
    let desc = document.createXULElement("description"); desc.textContent = "Get a free key at https://console.groq.com/keys"; desc.setAttribute("style", "font-size:11px;margin-bottom:8px;");
    let input = document.createXULElement("textbox"); input.setAttribute("type", "password"); input.setAttribute("placeholder", "gsk_...");
    let btn = document.createXULElement("button"); btn.setAttribute("label", "Save Key");
    btn.addEventListener("command", async () => {
      let v = input.value.trim();
      if (!v) return;
      if (!v.startsWith("gsk_")) { this._addMessage("system", "Invalid key — must start with gsk_"); return; }
      await this._security.setApiKey(v); box.remove(); this._addMessage("system", "API key saved securely!");
    });
    box.appendChild(lbl); box.appendChild(desc); box.appendChild(input); box.appendChild(btn);
    c.appendChild(box); input.focus();
  }

  async _waitForFocus() {
    return new Promise(resolve => {
      let check = () => { if (this._security.isFocused() || !this._running) resolve(); else requestAnimationFrame(check); };
      check();
    });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

window.gAgathManager = new AgathManager();
