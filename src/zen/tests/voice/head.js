/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function waitForAgathInit(win = window) {
  await TestUtils.waitForCondition(() => {
    return win.gAgathManager && win.gAgathSecurity;
  }, "Wait for Agath to initialize", 100, 50);
  return { manager: win.gAgathManager, security: win.gAgathSecurity };
}

async function openAgathPanel(win = window) {
  let { manager } = await waitForAgathInit(win);
  if (manager._panel?.getAttribute("hidden") !== null) {
    manager.togglePanel();
  }
  await TestUtils.waitForCondition(() => {
    return manager._panel?.getAttribute("hidden") === null;
  }, "Wait for Agath panel to open", 100, 20);
  return manager;
}
