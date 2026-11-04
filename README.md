<div align="center">
  <img src="docs/opensesame-icon.svg" width="160" alt="OpenSesame golden keyhole icon on a transparent background" />
  <h1>OpenSesame — Password-Protected File Vault</h1>

<p align="center">
  <a href="https://github.com/pollnull/OpenSesame/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/pollnull/OpenSesame" alt="License" />
  </a>
  <a href="https://github.com/pollnull/OpenSesame/releases/latest">
    <img src="https://img.shields.io/github/v/release/pollnull/OpenSesame" alt="Latest release" />
  </a>
</p>

  <p>Copyright 2026 PollNull</p>
  <p><strong>Open-source app that encrypts any file with its own password and keeps it in a private vault, on Android, Windows, and Linux.</strong></p>
  <p>Android · Windows · Linux · JavaScript · Web Crypto · Electron</p>
</div>

---

OpenSesame is a free and open-source app that works like a secure folder for any device. You add a file, choose a password, and the app encrypts it into its vault. Every encrypted file can be exported as a `.sesame` file and opened with OpenSesame on another phone or computer. Everything happens on the device: the app has no internet access and no accounts.

> [!NOTE]
> OpenSesame is a free, open-source learning project, built with the help of AI (Claude Code, with OpenAI Codex as a reviewer). **Its encryption has not been independently audited**, so please don't make it the only protection for important data.

> **Status:** learning project · not independently audited · v1.4.0 available.

## Download

Download the [OpenSesame v1.4.0 release](https://github.com/pollnull/OpenSesame/releases/tag/v1.4.0), or browse [all releases](https://github.com/pollnull/OpenSesame/releases):

- **Android:** `OpenSesame-1.4.apk`
- **Windows:** `OpenSesame-1.4.0-portable.exe`
- **Linux:** `OpenSesame-1.4.0-amd64.deb` (Debian, Ubuntu, Mint…) or `OpenSesame-1.4.0-x86_64.AppImage` (other distributions)

The Windows build is portable: it needs no installation and keeps its vault in an `OpenSesame-datos` folder next to the `.exe`, so move them together. On Android, allow installing apps from unknown sources to install the APK.

On Linux, install the `.deb` with `sudo apt install ./OpenSesame-1.4.0-amd64.deb`, then open the app from the applications menu or by typing `opensesame` in a terminal. The AppImage runs without installing: make it executable (`chmod +x`) and open it.

## Features

- Encrypt any file with its own password and keep it in an in-app vault.
- Optionally delete the original after encrypting it. The original is deleted only after the encrypted copy is written to disk, read back, decrypted, and found identical, and only if the original has not changed since it was picked.
- Decrypt a file and save a copy wherever you choose, or export it as a `.sesame` file to open on another device.
- Rename, delete, search, and sort files (recent, name, size). Long-press on Android, right-click or ⋮ on Windows.
- Windows and Linux extras: drag and drop files onto the window, and keyboard shortcuts (Ctrl+O, Ctrl+F, Enter, F2, Del).
- Linux terminal mode: `opensesame lock FILE` encrypts a file and `opensesame unlock FILE.sesame` decrypts it, asking for the password (hidden) and the destination folder in the terminal, without opening a window. It never overwrites an existing file, and the original is kept. The `.sesame` files it makes open in the app, and the other way around.
- On Android, the colors follow the wallpaper (Material You): the accent color on Android 12 and later, and the backgrounds too on Android 14 and later.
- Interface in Spanish and English, following the device language, with reduced-motion support.

## Security

These are the measures the AI implemented and tested. They have not been checked by an independent security expert.

- **Encryption:** AES-256-GCM with a key derived from the password using PBKDF2-SHA256 (600,000 iterations), with a random salt and IV for every file. The original file name is encrypted too.
- **File format:** a `.sesame` file is the header (`SESAME`, version, iterations, salt, IV) followed by the AES-GCM ciphertext. Since version 2, the header is authenticated as additional data. Version 1 files still open. See [`web/sesame.js`](web/sesame.js).
- **Android:**
  - The release APK is not debuggable.
  - It blocks screenshots, screen recording, and the recent-apps preview.
  - It requests no Android permissions and excludes the vault from backups.
- **Windows and Linux:** developer tools are disabled. The app exits if launched with a debugging port, and the Electron fuses that allow running it as Node or inspecting it are turned off.

## Build

You need Node.js 20 or later. For Android you also need Android Studio (its JDK) and the Android SDK with Platform 37 and Build Tools 36.0.0. The project includes the Gradle Wrapper, so you do not need to install Gradle separately.

The interface in [`web/`](web/) is shared by both platforms. From the project root:

```powershell
npm install
npm test           # encryption tests
npm start          # run the Windows app without packaging
npm run dist:win   # dist/OpenSesame-<version>-portable.exe
```

The Linux packages cannot be built on Windows. Build them on Linux with `npm run dist:linux`, or from Windows inside Ubuntu on WSL (with Node.js installed in `~/.local/node`):

```powershell
wsl -d Ubuntu -- bash compilar-linux.sh   # dist/OpenSesame-<version>-amd64.deb and .AppImage
```

To build the Android debug APK:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
.\android\gradlew.bat -p android :app:assembleDebug
```

The debug APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`. It is meant for testing only, because it is debuggable.

To build a signed, non-debuggable release APK, put your own keystore in `android/signing/`, with `opensesame-release.jks` and a `keystore.properties` containing `storePassword` and `keyAlias`. Then run:

```powershell
.\android\firmar-release.ps1
```

Do not commit keystores, `keystore.properties`, `local.properties`, or machine-specific paths. The `.gitignore` already excludes them.

## Privacy and limitations

The app works offline and sends nothing anywhere. These are its limits:

- **No password recovery.** If you forget a file's password, no one can open that file.
- **Use a strong password.** A stolen `.sesame` file can be attacked offline, so use a phrase of four or more random words.
- **Visible names.** File names in the vault list are visible without a password. The original name inside the file is encrypted.
- **Decrypted copies are unprotected.** Once you save a decrypted copy, it is an ordinary file; delete it when you no longer need it.
- **Deleting is not secure erasure.** Copies of an original may remain in the trash, cloud sync, or backups, and flash storage cannot guarantee an unrecoverable delete.
- **Tiny race window.** If another program modifies the original at the exact moment of deletion, that modified version may be deleted.
- **Uninstalling erases the vault.** On Android, uninstalling the app erases its vault; export files first.
- **Large files.** Very large files, roughly over 100 MB, may fail to decrypt on Android because they are passed through memory.

## How this project was made

OpenSesame is built with AI assistance, split in two:

- **Smaller changes are made by me, as I learn to code.** I write them myself, and the AI only supervises: it explains, guides, and reviews what I wrote. The Material You colors in 1.4 were made this way.

- **Big changes are made with AI.** The encryption, the architecture, new platforms, and bug fixes are written by **Anthropic Claude (Claude Code)**, which also builds the apps and tests them in a browser, an emulator, and a real phone. **OpenAI Codex** acts as a second opinion on the interface design and the encryption and security changes. Their discussions are recorded in [`docs/ui-debate.md`](docs/ui-debate.md) and [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md), in Spanish.

I also decide what to build and test every version on my own devices. Third-party files keep their own authors: the Gradle Wrapper (`android/gradlew*`, `android/gradle/`), the IBM Plex fonts, and the Apache License text.

## License

OpenSesame is distributed under the Apache License 2.0. See [`LICENSE`](LICENSE). Because most of the code is AI-generated, it may not be eligible for copyright protection in some jurisdictions. The Apache-2.0 license applies to whatever rights do exist.

Third-party resources retain their own licenses.

### Third-party resources under their own licenses

The IBM Plex Sans and IBM Plex Mono fonts are licensed under the SIL Open Font License 1.1. The [`web/fonts/OFL.txt`](web/fonts/OFL.txt) file contains their license and attribution: Copyright 2019 IBM Corp.

## Contributing

Open an [issue](https://github.com/pollnull/OpenSesame/issues) to report a bug or suggest an improvement. If you know about security and find a weakness, please describe it as clearly as you can; a clear explanation helps get it fixed properly.

## A note

OpenSesame is a learning project, shared for free. Bug reports, suggestions, and reviews are very welcome. I'll do my best to fix what comes up, but I can't promise when. If you need software you can fully rely on to protect important files, prefer a mature, audited tool.
