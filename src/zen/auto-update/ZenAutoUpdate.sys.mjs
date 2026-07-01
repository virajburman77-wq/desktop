var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const GITHUB_OWNER = "vibe-browser";
const GITHUB_REPO = "desktop";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

const ENABLED_PREF = "zen.auto-update.enabled";
const LAST_CHECK_PREF = "zen.auto-update.last-check-ms";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const PENDING_PATH_PREF = "zen.auto-update.pending-path";
const PENDING_VERSION_PREF = "zen.auto-update.pending-version";

let gVersionComparator = null;
try {
  gVersionComparator = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
} catch (e) {}

export class ZenAutoUpdate {
  constructor() {
    this._running = false;
    this._timer = null;
  }

  init() {
    this._handlePendingUpdate();
    setTimeout(() => this.checkForUpdates(), 4000);
    this._timer = setInterval(() => this.checkForUpdates(), CHECK_INTERVAL_MS);
  }

  _handlePendingUpdate() {
    let path = Services.prefs.getStringPref(PENDING_PATH_PREF, "");
    if (!path) return;
    try {
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      if (!file.exists()) return;
      this._launchInstaller(file);
    } catch (e) {
      console.error("ZenAutoUpdate: pending install failed", e);
    }
  }

  _launchInstaller(file) {
    let os = Services.appinfo.OS;
    try {
      if (os === "WINNT") {
        let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
        process.init(file);
        process.runAsync(["/S"], 1);
      } else if (os === "Darwin") {
        let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
        let launcher = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        launcher.initWithPath("/usr/bin/open");
        process.init(launcher);
        process.runAsync([file.path], 1);
      } else {
        let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
        process.init(file);
        process.runAsync([], 0);
      }
      Services.prefs.clearUserPref(PENDING_PATH_PREF);
      Services.prefs.clearUserPref(PENDING_VERSION_PREF);
    } catch (e) {
      console.error("ZenAutoUpdate: launch failed, will retry", e);
      return;
    }
    let appStartup = Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup);
    appStartup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestartLater);
  }

  async checkForUpdates() {
    if (this._running) return;
    if (!Services.prefs.getBoolPref(ENABLED_PREF, true)) return;
    let lastCheck = Services.prefs.getStringPref(LAST_CHECK_PREF, "0");
    if (Date.now() - parseInt(lastCheck, 10) < CHECK_INTERVAL_MS) return;
    this._running = true;
    Services.prefs.setStringPref(LAST_CHECK_PREF, String(Date.now()));
    try {
      let resp = await fetch(GITHUB_API, {
        headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "VibeBrowser" },
      });
      if (!resp.ok) return;
      let release = await resp.json();
      let tag = (release.tag_name || "").replace(/^v/i, "");
      if (!tag) return;
      let current = Services.appinfo.displayVersion || Services.appinfo.version;
      if (gVersionComparator) {
        try { if (gVersionComparator.compare(tag, current) <= 0) return; } catch (e) {}
      }
      let asset = this._findAsset(release.assets);
      if (!asset) return;
      this._notifyUpdateAvailable(tag);
      this._downloadUpdate(asset.browser_download_url, asset.name, tag);
    } catch (e) {
      console.error("ZenAutoUpdate: check failed", e);
    } finally {
      this._running = false;
    }
  }

  _findAsset(assets) {
    let os = Services.appinfo.OS;
    let patterns = [];
    if (os === "WINNT") {
      patterns.push(/\.exe$/i);
    } else if (os === "Darwin") {
      patterns.push(/\.dmg$/i, /\.pkg$/i);
    } else {
      patterns.push(/\.AppImage$/i, /\.tar\.bz2$/i, /\.tar\.gz$/i);
    }
    for (let pat of patterns) {
      for (let a of assets) {
        if (pat.test(a.name)) return a;
      }
    }
    return assets[0] || null;
  }

  async _downloadUpdate(url, filename, version) {
    try {
      let cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      let resp = await fetch(url);
      if (!resp.ok) return;
      let buf = await resp.arrayBuffer();
      let tmp = Services.dirsvc.get("TmpD", Ci.nsIFile);
      let file = tmp.clone();
      file.append(cleanName);
      let stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      stream.init(file, 0x02 | 0x08 | 0x20, 0o666, 0);
      let bytes = new Uint8Array(buf);
      stream.write(bytes, bytes.length);
      stream.close();
      Services.prefs.setStringPref(PENDING_PATH_PREF, file.path);
      Services.prefs.setStringPref(PENDING_VERSION_PREF, version);
      this._notifyUpdateReady(version);
    } catch (e) {
      console.error("ZenAutoUpdate: download failed", e);
    }
  }

  _notifyUpdateAvailable(version) {
    let c = document.getElementById("zen-toast-container");
    if (!c) return;
    let box = document.createXULElement("vbox");
    box.setAttribute("style", "background:var(--zen-dialog-background,-moz-dialog);border:2px solid var(--zen-brand-color);border-radius:12px;padding:16px;margin-top:8px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,0.2);");
    let lbl = document.createXULElement("label");
    lbl.textContent = `Update v${version} is downloading...`;
    lbl.setAttribute("style", "font-weight:bold;margin-bottom:4px;");
    let desc = document.createXULElement("description");
    desc.textContent = "The update will be installed on next restart.";
    desc.setAttribute("style", "font-size:11px;");
    box.appendChild(lbl);
    box.appendChild(desc);
    c.appendChild(box);
  }

  _notifyUpdateReady(version) {
    let c = document.getElementById("zen-toast-container");
    if (!c) return;
    let box = document.createXULElement("vbox");
    box.setAttribute("style", "background:var(--zen-dialog-background,-moz-dialog);border:2px solid #4caf50;border-radius:12px;padding:16px;margin-top:8px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,0.2);");
    let lbl = document.createXULElement("label");
    lbl.textContent = `Update v${version} ready!`;
    lbl.setAttribute("style", "font-weight:bold;margin-bottom:4px;color:#4caf50;");
    let desc = document.createXULElement("description");
    desc.textContent = "Restart the browser to install the update.";
    desc.setAttribute("style", "font-size:11px;margin-bottom:8px;");
    let btn = document.createXULElement("button");
    btn.setAttribute("label", "Restart Now");
    btn.addEventListener("command", () => {
      box.remove();
      let appStartup = Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup);
      appStartup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
    });
    box.appendChild(lbl);
    box.appendChild(desc);
    box.appendChild(btn);
    c.appendChild(box);
  }
}

window.gZenAutoUpdate = new ZenAutoUpdate();
