/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_Agath_Modules_Loaded() {
  let { manager, security } = await waitForAgathInit();
  ok(manager, "gAgathManager should be defined");
  ok(security, "gAgathSecurity should be defined");
  ok(typeof manager.togglePanel === "function", "togglePanel should be a function");
  ok(typeof security.isFocused === "function", "isFocused should be a function");
});

add_task(async function test_Agath_Panel_Toggle() {
  let manager = await openAgathPanel();
  ok(manager._panel.getAttribute("hidden") === null, "Panel should be visible after toggle");
  manager.togglePanel();
  ok(manager._panel.getAttribute("hidden") !== null, "Panel should be hidden after second toggle");
});

add_task(async function test_Agath_OfflineFallback_Open() {
  let { manager } = await waitForAgathInit();
  let task = "open example.com";
  let result = manager._tryOffline(task);
  ok(result, "Offline fallback should return a command for 'open example.com'");
  is(result.action, "NAVIGATE", "Action should be NAVIGATE");
  ok(result.url.includes("example.com"), "URL should contain example.com");
});

add_task(async function test_Agath_OfflineFallback_Search() {
  let { manager } = await waitForAgathInit();
  let task = "search for cats";
  let result = manager._tryOffline(task);
  ok(result, "Offline fallback should return a command for 'search for cats'");
  is(result.action, "NAVIGATE", "Action should be NAVIGATE");
  ok(result.url.includes("google.com"), "URL should point to google");
});

add_task(async function test_Agath_OfflineFallback_Scroll() {
  let { manager } = await waitForAgathInit();
  let up = manager._tryOffline("scroll up");
  is(up?.action, "SCROLL", "scroll up action");
  is(up?.direction, "up", "scroll up direction");
  let down = manager._tryOffline("scroll down");
  is(down?.action, "SCROLL", "scroll down action");
  is(down?.direction, "down", "scroll down direction");
});
