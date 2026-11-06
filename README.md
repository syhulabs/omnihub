# Omni Hub

Offline all-in-one utility app for Android and iOS. Vite + React + TypeScript, wrapped with Capacitor.

## Develop

```
npm install
npm run dev
```

## Build

```
npm run build
```

## Android

```
npm run android:sync   # build web app + sync into the native Android project
npm run android:open   # open android/ in Android Studio
```

See [`docs/android-build.md`](docs/android-build.md) for signed AAB build steps and a Play Store checklist.

## iOS

```
npm run ios:sync   # build web app + sync into the native iOS project (runs pod install)
npm run ios:open   # open ios/App/App.xcworkspace in Xcode
```

Needs a Mac with Xcode and CocoaPods, plus `ios/App/App/GoogleService-Info.plist` from the Firebase console.
See [`docs/ios-build.md`](docs/ios-build.md) for setup, TestFlight upload and the App Store review checklist.
