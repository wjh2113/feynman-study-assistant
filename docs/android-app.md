# 知练 Android App（离线练习）

安卓客户端用 **Capacitor** 包装线上 Web（`https://study.aidigitcloud.cn`），配合 **PWA Service Worker + IndexedDB** 支持离线费曼练习。

## 能力范围

| 场景 | 在线 | 离线 |
|---|---|---|
| 登录后浏览已缓存学科 | ✅ | ✅（需曾成功登录并拉过列表） |
| 费曼练习（本地题库 / 已缓存题库） | ✅ | ✅ |
| AI 教练完整追问 | ✅ | ❌ → 本地启发式评分 |
| 上传资料 / 导入学科包 | ❌（请用电脑网页） | ❌ |
| 知识地图查看 / 重新总结 | ✅（在线） | ❌ |
| 语音输入 | ✅ | ❌ |

首次请在有网时登录并打开学科，系统会把项目快照写入本机 IndexedDB；之后断网可继续练习。

## 构建 APK

前置：Node ≥ 20、JDK 21、Android SDK（`ANDROID_HOME`）。

```bash
# macOS 示例
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

npm run android:sync    # vite build + cap sync
npm run android:apk     # 打 debug APK
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

也可用 Android Studio 打开 `android/` 目录直接 Run / 生成 Release 签名包。

## 配置说明

- `capacitor.config.json` 中 `server.url` 指向生产站，保证 Cookie 登录与 Web 一致。
- 纯本地壳（不加载远程 URL）时，可去掉 `server.url`，并设置：

  ```bash
  VITE_API_BASE_URL=https://study.aidigitcloud.cn npm run build
  ```

  此时需服务端允许 Capacitor 源的 CORS（当前默认方案是远程 URL，无需改 CORS）。

## 手机安装

1. 开启「允许安装未知应用」。
2. 安装 `app-debug.apk`。
3. 有网登录 → 进入学科与费曼练习一次 → 再断网验证离线横幅与练习。
