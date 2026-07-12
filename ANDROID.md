# Android build

The Android app is packaged with Capacitor. The GitHub Pages files remain the source of truth; `npm run web:bundle` copies them into the generated `www` directory.

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
