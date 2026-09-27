import React, { useEffect, useState } from "react";
import { Network } from "@capacitor/network";
import { isNativeApp } from "../lib/runtime.js";

export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);

  useEffect(() => {
    let remove = null;
    const syncBrowser = () => setOffline(!navigator.onLine);
    window.addEventListener("online", syncBrowser);
    window.addEventListener("offline", syncBrowser);

    if (isNativeApp()) {
      Network.getStatus()
        .then((status) => setOffline(!status.connected))
        .catch(() => {});
      Network.addListener("networkStatusChange", (status) => {
        setOffline(!status.connected);
      }).then((handle) => {
        remove = () => handle.remove();
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener("online", syncBrowser);
      window.removeEventListener("offline", syncBrowser);
      remove?.();
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offline-banner" role="status">
      离线模式：可使用已缓存的学科与题库练习；教练评分使用本地规则，联网后可同步完整教练。
    </div>
  );
}
