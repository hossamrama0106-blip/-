; مثبّت Khiam Ops Agent — يصنع KhiamOps-Setup.exe (يتسطّب مثل أي برنامج ويندوز).
; الخطوات: 1) شغّل build_exe.bat لإنتاج dist\KhiamAgent.exe
;          2) ثبّت Inno Setup من jrsoftware.org
;          3) افتح هذا الملف بـ Inno Setup واضغط Compile → يطلّع Output\KhiamOps-Setup.exe
[Setup]
AppName=Khiam Ops
AppVersion=1.0
AppPublisher=Khiam
DefaultDirName={autopf}\KhiamOps
DefaultGroupName=Khiam Ops
OutputBaseFilename=KhiamOps-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
WizardStyle=modern

[Languages]
Name: "ar"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\KhiamAgent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Khiam Ops"; Filename: "{app}\KhiamAgent.exe"
Name: "{autodesktop}\Khiam Ops"; Filename: "{app}\KhiamAgent.exe"; Tasks: desktopicon
Name: "{userstartup}\Khiam Ops"; Filename: "{app}\KhiamAgent.exe"; Tasks: startupicon

[Tasks]
Name: "desktopicon"; Description: "انشاء اختصار على سطح المكتب"; GroupDescription: "اختصارات:"
Name: "startupicon"; Description: "تشغيل تلقائي عند بدء ويندوز"; GroupDescription: "اختصارات:"

[Run]
Filename: "{app}\KhiamAgent.exe"; Description: "تشغيل Khiam Ops الآن"; Flags: nowait postinstall skipifsilent
