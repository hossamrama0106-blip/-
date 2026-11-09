; مثبّت Khiam Ops Agent — يصنع KhiamOps-Setup.exe (يتسطّب مثل أي برنامج ويندوز، بشريط تثبيت).
; الخطوات: 1) شغّل build_exe.bat لإنتاج dist\KhiamAgent.exe
;          2) ثبّت Inno Setup من jrsoftware.org
;          3) افتح هذا الملف بـ Inno Setup واضغط Compile → يطلّع Output\KhiamOps-Setup.exe
[Setup]
AppId={{B4B6E7B2-9C1E-4D3A-8F21-1A2B3C4D5E6F}
AppName=Khiam Ops
AppVersion=1.1
AppPublisher=Khiam
DefaultDirName={autopf}\KhiamOps
DefaultGroupName=Khiam Ops
OutputBaseFilename=KhiamOps-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=Khiam Ops
UninstallDisplayIcon={app}\KhiamAgent.exe

[Languages]
Name: "ar"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\KhiamAgent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Khiam Ops"; Filename: "{app}\KhiamAgent.exe"
Name: "{group}\إلغاء تثبيت Khiam Ops"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Khiam Ops"; Filename: "{app}\KhiamAgent.exe"; Tasks: desktopicon
; اختصار بدء التشغيل يفتح البرنامج في الخلفية مباشرة (--tray)
Name: "{userstartup}\Khiam Ops"; Filename: "{app}\KhiamAgent.exe"; Parameters: "--tray"; Tasks: startupicon

[Tasks]
Name: "desktopicon"; Description: "إنشاء اختصار على سطح المكتب"; GroupDescription: "اختصارات:"
Name: "startupicon"; Description: "تشغيل تلقائي مع بدء ويندوز (في الخلفية)"; GroupDescription: "اختصارات:"; Flags: checkedonce

[Registry]
; نظّف مفتاح التشغيل التلقائي الذي قد يضيفه البرنامج نفسه (خانة «شغّل مع بدء ويندوز») عند إلغاء التثبيت
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "KhiamOps"; Flags: uninsdeletevalue; ValueType: none

[Run]
Filename: "{app}\KhiamAgent.exe"; Description: "تشغيل Khiam Ops الآن"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; أغلق البرنامج قبل إزالته (لو شغّال في الخلفية)
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM KhiamAgent.exe"; Flags: runhidden; RunOnceId: "KillKhiam"
