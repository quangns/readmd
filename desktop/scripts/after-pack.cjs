// Hook afterPack của electron-builder: gắn icon và thông tin phiên bản vào convertSRS.exe
// bằng resedit (thuần JavaScript) — build được bộ cài Windows trên Linux mà không cần Wine/rcedit.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const { NtExecutable, NtExecutableResource, Resource, Data } = ResEdit.default || ResEdit;

  const appInfo = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  // Icon
  const iconFile = Data.IconFile.from(fs.readFileSync(path.join(context.packager.info.buildResourcesDir, 'icon.ico')));
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map((i) => i.data));

  // Thông tin phiên bản (Properties > Details trên Windows)
  const [vi] = Resource.VersionInfo.fromEntries(res.entries);
  const version = appInfo.version.split('.').map(Number);
  while (version.length < 4) version.push(0);
  vi.setFileVersion(...version);
  vi.setProductVersion(...version);
  const strings = {
    FileDescription: appInfo.productName,
    ProductName: appInfo.productName,
    CompanyName: 'Nguyễn Sỹ Quang',
    LegalCopyright: appInfo.copyright,
    OriginalFilename: `${appInfo.productFilename}.exe`,
    InternalName: appInfo.productName,
    FileVersion: appInfo.version,
    ProductVersion: appInfo.version,
  };
  for (const lng of vi.getAllLanguagesForStringValues()) vi.setStringValues(lng, strings);
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • after-pack: đã gắn icon và thông tin phiên bản cho ${path.basename(exePath)}`);
};
