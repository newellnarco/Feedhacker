@echo off
rem Native-messaging host entry point. Chrome launches this; it hands stdin/stdout to
rem the PowerShell host, which speaks the length-prefixed native-messaging protocol.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0updater-host.ps1"
