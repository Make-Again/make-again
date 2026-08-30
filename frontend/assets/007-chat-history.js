(async () => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  if (root == null || shared == null || state == null) return;
  const params = new URL(location.href).searchParams;
  await state.ready();
  const guard = state.activeGuard();
  if (!guard.allowed) { window.location.replace(guard.redirect); return; }

  const list = root.querySelector("[data-history-list]");
  const empty = root.querySelector("[data-history-empty]");
  const monthTitle = root.querySelector("[data-month-title]");
  const monthCount = root.querySelector("[data-month-count]");
  const previous = root.querySelector("[data-month-previous]");
  const next = root.querySelector("[data-month-next]");
  const emptyChat = root.querySelector("[data-empty-chat]");
  const back = root.querySelector("[data-home-back]");
  const required = [list,empty,monthTitle,monthCount,previous,next,emptyChat,back];
  if (required.some((node) => node == null)) return;

  const accents = ["#eb936e", "#6ca9ff", "#5ab9b1", "#a87aff", "#64c977", "#eb77b1"];
  const weekdayOf = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return Number.isNaN(d.getTime()) ? "" : ["周日","周一","周二","周三","周四","周五","周六"][d.getDay()];
  };
  const buildBackendMonths = (days) => {
    const map = new Map();
    days.forEach((row) => {
      const ym = String(row.date || "").slice(0, 7);
      if (!ym) return;
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym).push(row);
    });
    const months = [];
    for (const [ym, rows] of map) {
      const [y, m] = ym.split("-");
      months.push({
        key: ym,
        title: y + " 年 " + String(Number(m)) + " 月",
        records: rows.map((row, index) => ({
          day: String(row.date || "").slice(8, 10),
          weekday: weekdayOf(row.date),
          key: row.date,
          title: row.summary || "这一天的对话",
          summary: row.summary || "",
          meta: String(row.count || 0) + " 条对话",
          accent: accents[index % accents.length],
        })),
      });
    }
    return months;
  };

  // 真源:登录后拉后端每日总结;无数据/网络失败时保持空态。
  let months = [];
  const uid = state.currentAccountId();
  if (uid && API) {
    try {
      const res = await API.chatHistoryDays(uid);
      if (res && Array.isArray(res.days) && res.days.length) months = buildBackendMonths(res.days);
    } catch (error) { /* 网络失败:保持空态 */ }
  }

  let monthIndex = Math.max(0, months.length - 1);

  const go = (href, status) => shared.nextPage(href, {
    exitState:"utility-home",
    delay:shared.reducedMotion() ? 0 : 220,
    status,
  });

  const makeRecord = (record) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ma-history-card";
    button.style.setProperty("--history-accent", record.accent);
    button.setAttribute("aria-label", record.day + "日，" + record.title + "，查看完整对话");

    const date = document.createElement("span");
    date.className = "ma-history-date";
    const day = document.createElement("strong");
    day.textContent = record.day;
    const weekday = document.createElement("small");
    weekday.textContent = record.weekday;
    date.append(day, weekday);

    const copy = document.createElement("span");
    copy.className = "ma-history-copy";
    const title = document.createElement("strong");
    title.textContent = record.title;
    const summary = document.createElement("p");
    summary.textContent = record.summary;
    const meta = document.createElement("small");
    meta.textContent = record.meta;
    copy.append(title, summary, meta);

    const arrow = document.createElement("span");
    arrow.className = "ma-history-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";
    button.append(date, copy, arrow);
    button.addEventListener("click", () => go("009-chat-day.html?day=" + encodeURIComponent(record.key), "打开当天的完整对话"));
    return button;
  };

  const animateContent = (node) => {
    if (shared.reducedMotion()) return;
    node.animate(
      [{ opacity:.35, transform:"translateY(5px)" }, { opacity:1, transform:"translateY(0)" }],
      { duration:180, easing:"cubic-bezier(.23,1,.32,1)", fill:"both" }
    );
  };

  const render = (animate = false) => {
    const month = months[monthIndex];
    const records = !month ? [] : month.records;
    monthTitle.textContent = month ? month.title : "聊天历史";
    monthCount.textContent = records.length === 0 ? "还没有记录" : String(records.length) + " 天留下了对话";
    previous.disabled = monthIndex <= 0;
    next.disabled = monthIndex >= months.length - 1;

    list.replaceChildren(...records.map(makeRecord));
    const isEmpty = records.length === 0;
    list.hidden = isEmpty;
    empty.hidden = !isEmpty;
    if (animate) animateContent(isEmpty ? empty : list);
  };

  const changeMonth = (delta) => {
    const target = Math.max(0, Math.min(months.length - 1, monthIndex + delta));
    if (target === monthIndex) return;
    monthIndex = target;
    render(true);
  };

  previous.addEventListener("click", () => changeMonth(-1));
  next.addEventListener("click", () => changeMonth(1));
  back.addEventListener("click", () => go("005-home.html?from=history", "返回首页"));
  emptyChat.addEventListener("click", () => go("003-voice.html?from=history-empty", "进入 Wakey 对话"));

  render();
})();
