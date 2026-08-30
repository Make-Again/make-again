(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  if (root == null || shared == null) return;

  const back = root.querySelector("[data-utility-back]");
  back?.addEventListener("click", () => {
    const source = root.dataset.utilityPage || "menu";
    shared.nextPage("005-home.html?from=" + encodeURIComponent(source), {
      exitState: "utility-home",
      delay: 240,
      status: "正在返回首页",
    });
  });

  const periodButtons = Array.from(root.querySelectorAll("[data-member-period]"));
  const memberPrice = root.querySelector("[data-member-price]");
  const memberUnit = root.querySelector("[data-member-unit]");
  const memberBuy = root.querySelector("[data-member-buy]");
  const periodData = {
    month: { price: "—", unit: "价格待定", button: "会员方案即将上线" },
    quarter: { price: "—", unit: "价格待定", button: "会员方案即将上线" },
  };
  periodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const period = button.dataset.memberPeriod;
      const data = periodData[period];
      if (data == null) return;
      periodButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      if (memberPrice != null) memberPrice.textContent = data.price;
      if (memberUnit != null) memberUnit.textContent = data.unit;
      if (memberBuy != null) memberBuy.textContent = data.button;
    });
  });

  const redeemInput = root.querySelector("[data-redeem-code]");
  const redeemButton = root.querySelector("[data-redeem]");
  const redeemFeedback = root.querySelector("[data-redeem-feedback]");
  redeemButton?.addEventListener("click", () => {
    const code = redeemInput?.value.trim() || "";
    if (redeemFeedback == null) return;
    redeemFeedback.textContent = code === "" ? "请先输入兑换码" : "兑换码功能即将上线";
  });

  root.querySelectorAll("[data-history-item], [data-help-item]").forEach((item) => {
    item.addEventListener("click", () => {
      const expanded = item.getAttribute("aria-expanded") === "true";
      item.setAttribute("aria-expanded", String(!expanded));
    });
  });

  root.querySelectorAll("[data-setting-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const pressed = toggle.getAttribute("aria-pressed") === "true";
      toggle.setAttribute("aria-pressed", String(!pressed));
    });
  });
})();
