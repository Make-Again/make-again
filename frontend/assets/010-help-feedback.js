(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  if (root == null || shared == null) return;

  const back = root.querySelector("[data-home-back]");
  const questions = Array.from(root.querySelectorAll(".ma-help-faq article > button"));
  const form = root.querySelector("[data-feedback-form]");
  const textarea = root.querySelector("[data-feedback-text]");
  const file = root.querySelector("[data-feedback-file]");
  const fileName = root.querySelector("[data-feedback-file-name]");
  const fileRemove = root.querySelector("[data-feedback-file-remove]");
  const send = root.querySelector("[data-feedback-send]");
  const toast = root.querySelector("[data-help-toast]");
  const required = [back,form,textarea,file,fileName,fileRemove,send,toast];
  if (required.some((node) => node == null)) return;

  let toastTimer = null;
  const showToast = (copy) => {
    toast.textContent = copy;
    toast.hidden = false;
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; toastTimer = null; }, 2200);
  };

  questions.forEach((button) => {
    button.addEventListener("click", () => {
      const willOpen = button.getAttribute("aria-expanded") !== "true";
      questions.forEach((item) => item.setAttribute("aria-expanded", "false"));
      button.setAttribute("aria-expanded", String(willOpen));
    });
  });

  const updateSend = () => { send.disabled = textarea.value.trim() === ""; };
  textarea.addEventListener("input", updateSend);

  const clearFile = () => {
    file.value = "";
    fileName.textContent = "";
    fileName.hidden = true;
    fileRemove.hidden = true;
  };
  file.addEventListener("change", () => {
    const selected = file.files?.[0];
    if (selected == null) { clearFile(); return; }
    if (!selected.type.startsWith("image/")) {
      clearFile();
      showToast("请选择图片文件");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      clearFile();
      showToast("截图不能超过 10 MB");
      return;
    }
    fileName.textContent = selected.name;
    fileName.hidden = false;
    fileRemove.hidden = false;
  });
  fileRemove.addEventListener("click", clearFile);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = textarea.value.trim();
    if (content === "") {
      updateSend();
      textarea.focus();
      showToast("请先写下问题或建议");
      return;
    }
    textarea.value = "";
    clearFile();
    updateSend();
    // 反馈真源:POST /feedback 落库,失败仍提示已收到。
    if (window.MakeAgainAPI && window.MakeAgainAPI.feedback) {
      try { await window.MakeAgainAPI.feedback(content, null); } catch (error) { /* 网络失败不阻塞提示 */ }
    }
    showToast("反馈已收到，谢谢你认真告诉我们");
  });

  back.addEventListener("click", () => shared.nextPage("005-home.html?from=help", {
    exitState:"utility-home",
    delay:shared.reducedMotion() ? 0 : 220,
    status:"返回首页",
  }));
  window.addEventListener("pagehide", () => { if (toastTimer != null) window.clearTimeout(toastTimer); });
  updateSend();
})();
