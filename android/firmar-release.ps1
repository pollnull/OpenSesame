# Compila el APK de versión (sin depuración) y lo firma con la clave propia de android/signing.
# La firma incluye una rotación desde la clave de depuración, así un teléfono con la versión anterior
# actualiza sin desinstalar y sin perder la bóveda. Uso: .\android\firmar-release.ps1
# Las herramientas de Java escriben avisos en stderr; los fallos se detectan por el código de salida.
$ErrorActionPreference = 'Continue'
$android = $PSScriptRoot
$signing = Join-Path $android 'signing'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$apksigner = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat'
$props = Get-Content (Join-Path $signing 'keystore.properties') | ConvertFrom-StringData
$release = Join-Path $signing 'opensesame-release.jks'
$debug = Join-Path $env:USERPROFILE '.android\debug.keystore'
$lineage = Join-Path $signing 'lineage'

if (-not (Test-Path $lineage)) {
    & $apksigner rotate --out $lineage `
        --old-signer --ks $debug --ks-pass pass:android --ks-key-alias androiddebugkey `
        --new-signer --ks $release --ks-pass "pass:$($props.storePassword)" --ks-key-alias $props.keyAlias
    if ($LASTEXITCODE) { throw 'No se pudo crear la rotación de firma' }
}

# El APK sin firmar se compila en Ubuntu (WSL) con el Java 21 de Debian, desde el último commit, igual que F-Droid.
# Así su compilación sale idéntica y puede publicar este APK con nuestra firma (builds reproducibles).
# Requiere en Ubuntu: openjdk-21-jdk-headless y el SDK en ~/fdroid-tools/sdk (ver android/compilar-apk-wsl.sh).
wsl -d Ubuntu --cd $android -- bash compilar-apk-wsl.sh
if ($LASTEXITCODE) { throw 'Falló la compilación' }

$unsigned = Join-Path $android 'app\build\outputs\apk\release\app-release-unsigned.apk'
$out = Join-Path $android 'app\build\outputs\apk\release\OpenSesame-release.apk'
# Solo firma v3 (con el historial de rotación) y sin tocar la alineación: F-Droid exige un único certificado
# y copia nuestra firma sobre su propia compilación.
& $apksigner sign --out $out --rotation-min-sdk-version 28 --alignment-preserved `
    --v1-signing-enabled false --v2-signing-enabled false `
    --ks $debug --ks-pass pass:android --ks-key-alias androiddebugkey `
    --next-signer --ks $release --ks-pass "pass:$($props.storePassword)" --ks-key-alias $props.keyAlias `
    --lineage $lineage $unsigned
if ($LASTEXITCODE) { throw 'Falló la firma' }
& $apksigner verify --print-certs $out | Select-String 'Signer'
$out
