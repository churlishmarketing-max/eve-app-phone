$ErrorActionPreference = "Continue"
$sdk = "C:\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_HOME = $sdk
$sm = Join-Path $sdk "cmdline-tools\latest\bin\sdkmanager.bat"

# Answer every license prompt on stdin, for BOTH commands.
$yes = (1..200 | ForEach-Object { "y" }) -join "`r`n"

Write-Output "== accepting licenses =="
$yes | & $sm "--sdk_root=$sdk" --licenses

Write-Output "== installing packages =="
$yes | & $sm "--sdk_root=$sdk" "platform-tools" "platforms;android-34" "build-tools;34.0.0"

Write-Output "== verify =="
Write-Output ("adb: " + (Test-Path (Join-Path $sdk 'platform-tools\adb.exe')))
Write-Output ("android-34: " + (Test-Path (Join-Path $sdk 'platforms\android-34')))
Write-Output ("build-tools: " + (Test-Path (Join-Path $sdk 'build-tools')))
Write-Output "SDK_PACKAGES_DONE"
