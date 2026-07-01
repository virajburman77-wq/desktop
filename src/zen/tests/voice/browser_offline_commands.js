/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_Offline_BackForwardRefresh() {
  let { manager } = await waitForAgathInit();
  is(manager._tryOffline("go back")?.action, "BACK", "go back action");
  is(manager._tryOffline("go back")?.action, "BACK", "navigate back action");
  is(manager._tryOffline("go forward")?.action, "FORWARD", "go forward action");
  is(manager._tryOffline("forward")?.action, "FORWARD", "forward action");
  is(manager._tryOffline("refresh")?.action, "REFRESH", "refresh action");
  is(manager._tryOffline("reload")?.action, "REFRESH", "reload action");
});

add_task(async function test_Offline_TabCommands() {
  let { manager } = await waitForAgathInit();
  is(manager._tryOffline("new tab")?.action, "NEW_TAB", "new tab action");
  is(manager._tryOffline("new tab google")?.action, "NEW_TAB", "new tab with url action");
  let newTabResult = manager._tryOffline("new tab about:blank");
  ok(newTabResult?.url, "new tab result should include url");
  is(manager._tryOffline("close tab")?.action, "CLOSE_TAB", "close tab action");
  is(manager._tryOffline("close this tab")?.action, "CLOSE_TAB", "close this tab action");
  is(manager._tryOffline("switch to tab 2")?.action, "SWITCH_TAB", "switch to tab action");
});

add_task(async function test_Offline_NoMatch() {
  let { manager } = await waitForAgathInit();
  ok(!manager._tryOffline("do something completely unrecognizable"),
     "Unrecognized command should return null");
});

add_task(async function test_Offline_NavigateWithHttps() {
  let { manager } = await waitForAgathInit();
  let r = manager._tryOffline("go to https://test.com");
  is(r?.action, "NAVIGATE", "NAVIGATE action for full url");
  is(r?.url, "https://test.com", "preserve https protocol");
});
