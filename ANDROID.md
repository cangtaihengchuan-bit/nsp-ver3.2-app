# Android build

The Android app is packaged with Capacitor. The GitHub Pages files remain the source of truth; `npm run web:bundle` copies them into the generated `www` directory.

## Storage modes

The Android build is local-first. This behavior is injected only while generating `www`; the GitHub Pages HTML is not changed.

- **Device mode (default):** shopping, household, locations, and discount notes stay in the Android WebView storage. No account is required. Supabase Auth, database requests, sharing, and store advertisements are disabled.
- **Sync mode (optional):** the user explicitly switches modes and signs in before the existing Supabase synchronization and sharing features are enabled.
- **Manual upload:** while signed in to sync mode, the user can explicitly append device data to the account. Uploads keep the device copy and force uploaded discount notes to `shared_enabled=false`.

Switching to device mode removes the app's local login session but does not delete cloud data. Uninstalling the app or clearing its storage deletes device-only data.

## Debug APK

```powershell
npm.cmd install
npm.cmd run android:build:debug
```

The installable APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.

On the Android device, allow installation from the browser or file manager used to open the APK. Camera and location permissions are requested only when the corresponding feature is used.

## Google Play preparation

The package ID is fixed as `jp.kaimonoclock.app`, the target SDK is API 36, and local app data is excluded from Android backups. For a Play release, create a private upload keystore, configure release signing outside version control, increment `versionCode` and `versionName`, and run:

```powershell
npm.cmd run android:build:release
```

The resulting Android App Bundle can be submitted to Google Play after signing. Never commit keystores or passwords.
