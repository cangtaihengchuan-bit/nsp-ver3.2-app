(() => {
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;

  document.documentElement.classList.add("native-android");

  const style = document.createElement("style");
  style.textContent = `
    html.native-android { background: #f4f8fb; }
    html.native-android body {
      padding-top: env(safe-area-inset-top);
      padding-right: env(safe-area-inset-right);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);

  const app = capacitor.Plugins?.App;
  if (!app?.addListener) return;

  app.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) {
      window.history.back();
      return;
    }
    app.exitApp();
  });
})();
