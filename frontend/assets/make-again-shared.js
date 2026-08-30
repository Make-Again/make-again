(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  if (root == null) return;

  const status = root.querySelector(".ma-letter-review-status");
  const brandName = root.querySelector(".ma-letter-brand-name");
  const pageEntry = new URL(window.location.href).searchParams.get("from") || "";
  let navigationTimer = null;

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setStatus = (message) => {
    if (status != null) status.textContent = message;
  };

  const prepareBrandName = () => {
    if (brandName == null || brandName.dataset.prepared === "true") return;
    const brandText = brandName.textContent || "Make Again";
    brandName.textContent = "";
    Array.from(brandText).forEach((character, index) => {
      if (character === " ") {
        brandName.append(document.createTextNode(" "));
        return;
      }
      const span = document.createElement("span");
      span.className = "ma-letter-brand-char";
      span.textContent = character;
      span.style.setProperty("--ma-brand-delay", String(index * 64) + "ms");
      span.style.setProperty("--ma-drift-x", String((index % 3) * 7 - 7) + "px");
      span.style.setProperty("--ma-drift-y", String((index % 4) * 5 - 13) + "px");
      brandName.append(span);
    });
    brandName.dataset.prepared = "true";
  };

  const wireModeToggle = () => {
    const toggle = root.querySelector(".ma-letter-mode-toggle");
    if (toggle == null) return;
    toggle.addEventListener("click", () => {
      const atmosphere = root.dataset.mode !== "structure";
      root.dataset.mode = atmosphere ? "structure" : "atmosphere";
      toggle.setAttribute("aria-pressed", String(!atmosphere));
      toggle.textContent = atmosphere ? "切换至氛围草图" : "切换至结构线框";
    });
  };

  const nextPage = (href, options = {}) => {
    if (href == null || href === "" || navigationTimer != null) return false;
    const config = typeof options === "string" ? { exitState: options } : (options || {});
    const requestedDelay = Number(config.delay);
    const delay = Number.isFinite(requestedDelay) ? Math.max(0, requestedDelay) : 0;
    const effectiveDelay = reducedMotion() ? Math.min(delay, 20) : delay;
    if (config.exitState != null && config.exitState !== "") {
      root.dataset.maPageExit = String(config.exitState);
    }
    if (config.status != null && config.status !== "") setStatus(String(config.status));
    navigationTimer = window.setTimeout(() => {
      navigationTimer = null;
      window.location.assign(href);
    }, effectiveDelay);
    return true;
  };

  prepareBrandName();
  wireModeToggle();
  if (pageEntry !== "") root.dataset.maPageEntry = pageEntry;

  window.MakeAgainShared = {
    reducedMotion,
    setStatus,
    nextPage,
    pageEntry,
  };
})();
