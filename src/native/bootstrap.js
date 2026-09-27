import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export async function bootstrapNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add("native-app");
  document.body.classList.add("native-app");

  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#0c4a6e" });
  } catch {
    // StatusBar may be unavailable on some devices
  }

  try {
    await SplashScreen.hide();
  } catch {
    // ignore
  }

  CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    CapApp.exitApp();
  }).catch(() => {});
}
