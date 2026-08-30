import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// make-again-state-v3.js 是「后端门面」:真源在后端 /state,靠 window.MakeAgainAPI 取数。
// 本测试在 node vm 里 mock 掉 MakeAgainAPI,验证门面的路由/门槛/合成逻辑(不再依赖 localStorage 多账号模型)。
const makeStorage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const boot = (statePayload = null, { token = "tok" } = {}) => {
  const localStorage = makeStorage();
  const api = {
    getUserId: () => (token ? "u1" : null),
    getToken: () => token,
    clearSession: () => {},
    logout: async () => ({}),
    state: async () => statePayload,
    patchState: async (patch) => ({ ...(statePayload || {}), ...patch }),
    relationshipSet: async (rt) => ({ ...(statePayload || {}), relationship_type: rt }),
    relationshipInfer: async () => ({ adopted: false }),
    endingCommit: async (ritual) => ({ ...(statePayload || {}), archived_at: "2026-08-30T00:00:00Z", destination: "018", ending_ritual: ritual }),
  };
  const window = { localStorage, MakeAgainAPI: api };
  const context = vm.createContext({ window, localStorage, structuredClone, Date, Math, JSON, Set });
  vm.runInContext(fs.readFileSync(new URL("./assets/make-again-state-v3.js", import.meta.url), "utf8"), context);
  return window.MakeAgainState;
};

const active = {
  relationship_type: "pet",
  subject_name: "豆豆",
  first_letter_status: "opened",
  first_report_status: "pinned",
  destination: null,
  archived_at: null,
};

// 1. 无 token → 登录页 + 门槛拒绝
const anon = boot(null, { token: null });
await anon.ready();
assert.equal(anon.resolveLoginDestination(), "001-login.html");
assert.equal(anon.activeGuard().allowed, false);

// 2. 已登录、主界面阶段 → 005
const main = boot({ ...active, destination: "005" });
await main.ready();
assert.equal(main.resolveLoginDestination(), "005-home.html?from=login");
const journey = main.getCurrentJourney();
assert.equal(journey.relationshipType, "pet");
assert.equal(journey.firstReportStatus, "pinned");
assert.equal(main.getAccount().preferences.ttsEnabled, true);

// 3. 归档 → 018,且无 active journey(只有 archive)
const archived = boot({ ...active, destination: "018", archived_at: "2026-08-30T00:00:00Z" });
await archived.ready();
assert.equal(archived.resolveLoginDestination(), "018-archive-bag.html?from=login");
assert.equal(archived.getCurrentJourney(), null);
assert.equal(archived.listArchives().length, 1);

// 4. 未归档、无 destination → 002(继续 onboarding)
const fresh = boot({ relationship_type: null, destination: null });
await fresh.ready();
assert.equal(fresh.resolveLoginDestination(), "002-founder-letter.html?from=auth");

// 5. activeGuard 门槛:首份报告未生成 → 拦截到 004
const guard = boot({ ...active, first_report_status: "pending" });
await guard.ready();
const g = guard.activeGuard({ requireReport: true });
assert.equal(g.allowed, false);
assert.match(g.redirect, /^004-report-board\.html/);

// 6. normalizeRelationshipType 映射
assert.equal(main.normalizeRelationshipType("Relative"), "relative");
assert.equal(main.normalizeRelationshipType("friend"), null);

// 7. commitArchive 走 endingCommit → 产出 archive(relationshipType 保留)
const archive = await main.commitArchive("buried");
assert.equal(archive.relationshipType, "pet");
assert.equal(main.resolveLoginDestination(), "018-archive-bag.html?from=login");

console.log("state-v3: ok");
