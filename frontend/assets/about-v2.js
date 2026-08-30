(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const layer = root?.querySelector("[data-about-sheet]");
  const sheet = layer?.querySelector(".ma-about-sheet");
  const title = layer?.querySelector("[data-about-title]");
  const body = layer?.querySelector("[data-about-body]");
  if (!root || !layer || !sheet || !title || !body) return;

  const documents = {
    agreement: {
      title: "用户协议",
      paragraphs: [
        "本页面将用于说明 Make Again 的服务范围、账户使用方式、用户内容边界及双方责任。",
        "正式版本发布前，仍需根据最终产品功能完成产品与法律审核。"
      ]
    },
    privacy: {
      title: "隐私与数据说明",
      paragraphs: [
        "本页面将说明我们收集哪些数据、为何使用、保存多久，以及你如何访问、更正或删除自己的数据。",
        "正式版本需要在数据清单、存储周期和删除流程确认后发布。"
      ]
    },
    ai: {
      title: "AI 生成内容说明",
      paragraphs: [
        "Make Again 的回复由 AI 生成，可能存在不准确或不完整的情况。",
        "这些内容不能替代医疗、法律或其他专业判断；遇到紧急或高风险情况时，请及时寻求专业支持。"
      ]
    }
  };

  let trigger = null;
  const open = (key, button) => {
    const document = documents[key];
    if (!document) return;
    trigger = button;
    title.textContent = document.title;
    body.replaceChildren(...document.paragraphs.map((copy) => {
      const paragraph = window.document.createElement("p");
      paragraph.textContent = copy;
      return paragraph;
    }));
    layer.dataset.open = "true";
    layer.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
  };

  const close = () => {
    if (layer.dataset.open !== "true") return;
    delete layer.dataset.open;
    layer.setAttribute("aria-hidden", "true");
    trigger?.focus({ preventScroll: true });
    trigger = null;
  };

  root.querySelectorAll("[data-about-document]").forEach((button) => {
    button.addEventListener("click", () => open(button.dataset.aboutDocument, button));
  });
  root.querySelectorAll("[data-about-close]").forEach((button) => button.addEventListener("click", close));
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && layer.dataset.open === "true") {
      event.preventDefault();
      close();
    }
  });
})();
