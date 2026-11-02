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

& (Join-Path $android 'gradlew.bat') -p $android :app:assembleRelease --console=plain -q
if ($LASTEXITCODE) { throw 'Falló la compilación' }

$unsigned = Join-Path $android 'app\build\outputs\apk\release\app-release-unsigned.apk'
$out = Join-Path $android 'app\build\outputs\apk\release\OpenSesame-release.apk'
& $apksigner sign --out $out --rotation-min-sdk-version 28 `
    --ks $debug --ks-pass pass:android --ks-key-alias androiddebugkey `
    --next-signer --ks $release --ks-pass "pass:$($props.storePassword)" --ks-key-alias $props.keyAlias `
    --lineage $lineage $unsigned
if ($LASTEXITCODE) { throw 'Falló la firma' }
& $apksigner verify --print-certs $out | Select-String 'Signer'
$out
