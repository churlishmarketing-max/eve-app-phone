$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$sdk = "C:\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_HOME = $sdk

$cmdRoot = Join-Path $sdk "cmdline-tools"
$tmpExtract = Join-Path $cmdRoot "_tmp"
$latest = Join-Path $cmdRoot "latest"
New-Item -ItemType Directory -Force $cmdRoot | Out-Null

$zip = Join-Path $env:TEMP "cmdtools.zip"
Write-Output "downloading command-line tools..."
Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip" -OutFile $zip

Write-Output "extracting..."
if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmpExtract -Force
if (Test-Path $latest) { Remove-Item $latest -Recurse -Force }
Move-Item (Join-Path $tmpExtract "cmdline-tools") $latest
Remove-Item $tmpExtract -Recurse -Force

$sm = Join-Path $latest "bin\sdkmanager.bat"
Write-Output "accepting licenses..."
$y = ("y`r`n" * 60)
$y | & $sm "--sdk_root=$sdk" --licenses | Out-Null

Write-Output "installing platform-tools, android-34, build-tools 34.0.0..."
& $sm "--sdk_root=$sdk" "platform-tools" "platforms;android-34" "build-tools;34.0.0" | Out-Null

Write-Output "SDK_BOOTSTRAP_DONE"
