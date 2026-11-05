#!/bin/bash
# Builds the unsigned release APK like F-Droid does: a clean clone of the last commit, Debian's JDK 21 and a
# Linux Android SDK. Called by firmar-release.ps1, which then signs it on Windows.
# One-time setup in Ubuntu: sudo apt install openjdk-21-jdk-headless unzip, and the SDK in ~/fdroid-tools/sdk
# (platform-tools, build-tools;36.0.0, platforms;android-37.0).
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ] || echo "Aviso: hay cambios sin commit; el APK usa solo el último commit."
export ANDROID_HOME=$HOME/fdroid-tools/sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 PATH=/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH
W=$HOME/opensesame-apk
rm -rf "$W"
git clone -q "$ROOT" "$W"
cd "$W"
echo "Compilando $(git log -1 --format='%h %s')"
chmod +x android/gradlew
android/gradlew -p android :app:assembleRelease --console=plain -q --no-daemon
mkdir -p "$ROOT/android/app/build/outputs/apk/release"
cp android/app/build/outputs/apk/release/app-release-unsigned.apk "$ROOT/android/app/build/outputs/apk/release/"
