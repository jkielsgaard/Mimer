; Extra steps for the Windows installer and uninstaller.
;
; The built-in AI (engine and models) is downloaded after Mimer is installed, into the folder
; "mimer-ai" next to the program. The uninstaller does not know about those files, so it removes
; them here, after stopping the engine program so that its files are not locked.

!macro NSIS_HOOK_PREUNINSTALL
  ; Stop llama-server only when it runs from Mimer's own folder (another program's copy is left alone).
  nsExec::Exec `powershell -NoProfile -NonInteractive -Command "Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\mimer-ai\*' } | Stop-Process -Force"`
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove the downloaded engine, models and logs, then the program folder if it is empty.
  RMDir /r "$INSTDIR\mimer-ai"
  RMDir "$INSTDIR"
!macroend
