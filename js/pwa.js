import { toast } from "./utils.js";

export function initPwa() {
  const buttons = [...document.querySelectorAll("[data-install-app]")];
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installPrompt = null;

  buttons.forEach((button) => { button.hidden = standalone; });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .catch((error) => console.warn("Service worker registration failed:", error));
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    buttons.forEach((button) => { button.hidden = false; });
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    buttons.forEach((button) => { button.hidden = true; });
    toast("Rota instalado", "O aplicativo foi adicionado ao seu dispositivo.");
  });

  buttons.forEach((button) => button.addEventListener("click", async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") buttons.forEach((item) => { item.hidden = true; });
      } catch (error) {
        console.error("PWA install prompt failed:", error);
        toast("Instala\u00e7\u00e3o indispon\u00edvel", "Tente instalar pelo menu do navegador.", "error");
      }
      return;
    }

    if (isAppleMobile) {
      toast("Instalar no iPhone ou iPad", "No Safari, toque em Compartilhar e escolha Adicionar \u00e0 Tela de In\u00edcio.");
    } else {
      toast("Instalar o Rota", "Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar \u00e0 tela inicial.");
    }
  }));
}