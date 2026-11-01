# Communichat Android app

This Android app opens the live Communichat website in a WebView. It does not
bundle the Next.js server or work offline. Devices need internet access and the
website at `https://connect-communichat.vercel.app` must remain available.

The app allows the Vercel site and the current Clerk development sign-in host
to load inside the WebView. Other HTTPS links open in the device browser.
Camera and microphone access are requested only when a call asks for them.

## Build a debug APK on Windows

Requirements: Android Studio's JDK, Android SDK Platform 34, and Android SDK
Build-Tools 34.0.0.

From the repository root in PowerShell:

```powershell
Set-Location .\android
.\gradlew.bat assembleDebug
```

The APK is written to:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

You can transfer that file to Android phones for testing. Android may ask each
recipient to allow installation from the app used to open the APK. This debug
APK is for direct testing, not Play Store distribution.

The app currently uses the Clerk development sign-in instance. Configure Clerk
production authentication before sharing this app for regular family use.
