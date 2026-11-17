//! Windows-only, non-atomic, same-handle writes. Never substitutes rename for content CAS.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};

pub const MAX_CONFIG: usize = 64 * 1024;
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    pub volume: u32,
    pub high: u32,
    pub low: u32,
}

#[cfg(windows)]
fn information(file: &File) -> crate::error::DesktopResult<(Identity, u32, u32)> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
        return Err(crate::error::DesktopError::io("无法验证文件身份。"));
    }
    Ok((
        Identity {
            volume: info.dwVolumeSerialNumber,
            high: info.nFileIndexHigh,
            low: info.nFileIndexLow,
        },
        info.dwFileAttributes,
        info.nNumberOfLinks,
    ))
}
#[cfg(not(windows))]
fn information(_: &File) -> crate::error::DesktopResult<(Identity, u32, u32)> {
    Err(crate::error::DesktopError::io(
        "受限写入暂仅支持 Windows 本地磁盘。",
    ))
}

pub fn random_id() -> crate::error::DesktopResult<String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Security::Cryptography::{
            BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        };
        let mut bytes = [0u8; 16];
        if unsafe {
            BCryptGenRandom(
                std::ptr::null_mut(),
                bytes.as_mut_ptr(),
                bytes.len() as u32,
                BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            )
        } < 0
        {
            return Err(crate::error::DesktopError::io("无法生成安全操作编号。"));
        }
        Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
    }
    #[cfg(not(windows))]
    {
        Err(crate::error::DesktopError::io("受限写入暂仅支持 Windows。"))
    }
}

fn options(write: bool) -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(write);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options
            .share_mode(if write { 0 } else { 1 })
            .custom_flags(0x00200000);
    }
    options
}

/// Pins every ancestor before opening descendants. Root must be a fixed local drive.
pub fn directories(path: &Path) -> crate::error::DesktopResult<Vec<File>> {
    #[cfg(not(windows))]
    {
        let _ = path;
        Err(crate::error::DesktopError::io(
            "受限写入暂仅支持 Windows 本地磁盘。",
        ))
    }
    #[cfg(windows)]
    {
        use std::os::windows::{ffi::OsStrExt, fs::OpenOptionsExt};
        use std::path::{Component, PathBuf};
        use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
        let display = path.to_str().ok_or("路径编码不支持。")?;
        let plain = display.strip_prefix("\\\\?\\").unwrap_or(display);
        let bytes = plain.as_bytes();
        if bytes.len() < 3
            || !bytes[0].is_ascii_alphabetic()
            || bytes[1] != b':'
            || !matches!(bytes[2], b'\\' | b'/')
            || plain[2..].contains(':')
            || plain.contains('\0')
        {
            return Err("仅支持本机普通盘符路径，不支持网络、设备或数据流路径。".into());
        }
        let drive: Vec<u16> = Path::new(&plain[..3])
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        if unsafe { GetDriveTypeW(drive.as_ptr()) } != 3
        /* DRIVE_FIXED */
        {
            return Err("首版受限修复仅支持固定本地磁盘。".into());
        }
        let mut held = Vec::new();
        let mut current = PathBuf::new();
        for component in Path::new(plain).components() {
            match component {
                Component::Prefix(_) => {
                    current.push(component.as_os_str());
                    continue;
                }
                Component::RootDir => current.push(component.as_os_str()),
                Component::Normal(name) => {
                    let name = name.to_str().ok_or("文件名编码无效。")?;
                    if name.ends_with(['.', ' ']) {
                        return Err("不支持歧义路径。".into());
                    }
                    current.push(name);
                }
                _ => return Err("不支持路径跳转。".into()),
            }
            let file = OpenOptions::new()
                .read(true)
                .share_mode(3)
                .custom_flags(0x02200000)
                .open(&current)
                .map_err(|_| {
                    crate::error::DesktopError::io("目录正在变更或被占用，请关闭相关程序后重试。")
                })?;
            let (_, attributes, _) = information(&file)?;
            if attributes & 0x400 != 0 || attributes & 0x10 == 0 {
                return Err("不允许链接、联接或非普通目录。".into());
            }
            held.push(file);
        }
        if held.is_empty() {
            return Err("项目路径无效。".into());
        }
        Ok(held)
    }
}

pub struct Target {
    pub file: File,
    pub identity: Identity,
    pub parent_identity: Identity,
    _parents: Vec<File>,
}
impl Target {
    pub fn open(path: &Path, write: bool) -> crate::error::DesktopResult<Self> {
        let parents = directories(path.parent().ok_or("文件目录缺失。")?)?;
        let parent_identity = information(parents.last().ok_or("目录身份缺失。")?)?.0;
        let file = options(write).open(path).map_err(|_| {
            crate::error::DesktopError::io("文件正被编辑或不可访问；未进行修改，请关闭占用后重试。")
        })?;
        let (identity, attributes, links) = information(&file)?;
        if attributes & (0x400 | 0x10) != 0 || links != 1 {
            return Err("不允许符号链接、硬链接或非普通文件。".into());
        }
        Ok(Self {
            file,
            identity,
            parent_identity,
            _parents: parents,
        })
    }
    pub fn bytes(&mut self, limit: usize) -> crate::error::DesktopResult<Vec<u8>> {
        if self
            .file
            .metadata()
            .map_err(|_| crate::error::DesktopError::io("文件状态不可用。"))?
            .len()
            > limit as u64
        {
            return Err("文件超出受限修复大小上限。".into());
        }
        self.file
            .seek(SeekFrom::Start(0))
            .map_err(|_| crate::error::DesktopError::io("读取文件失败。"))?;
        let mut bytes = Vec::new();
        (&mut self.file)
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| crate::error::DesktopError::io("读取文件失败。"))?;
        if bytes.len() > limit {
            return Err("文件读取超限。".into());
        }
        Ok(bytes)
    }
    pub fn write(&mut self, bytes: &[u8]) -> crate::error::DesktopResult<()> {
        self.file
            .seek(SeekFrom::Start(0))
            .and_then(|_| self.file.write_all(bytes))
            .and_then(|_| self.file.set_len(bytes.len() as u64))
            .and_then(|_| self.file.sync_all())
            .map_err(|_| {
                crate::error::DesktopError::io("写入未完整结束，请通过恢复记录检查原始备份。")
            })?;
        if self.bytes(MAX_CONFIG)? != bytes {
            return Err(crate::error::DesktopError::io(
                "写入回读校验失败，请检查恢复记录。",
            ));
        }
        Ok(())
    }
}

/// Immutable backup/journal: caller retains both parent and file handles through the write.
pub fn create_record(path: &Path, bytes: &[u8]) -> crate::error::DesktopResult<File> {
    let mut options = options(true);
    options.create_new(true);
    let mut file = options.open(path).map_err(|_| {
        crate::error::DesktopError::io("无法创建修复备份或日志；未开始修改源文件。")
    })?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| {
            crate::error::DesktopError::io("无法保存修复备份或日志；未开始修改源文件。")
        })?;
    file.seek(SeekFrom::Start(0))
        .map_err(|_| crate::error::DesktopError::io("备份验证失败。"))?;
    let mut readback = Vec::new();
    file.read_to_end(&mut readback)
        .map_err(|_| crate::error::DesktopError::io("备份验证失败。"))?;
    if readback != bytes {
        return Err(crate::error::DesktopError::io("备份回读验证失败。"));
    }
    Ok(file)
}

/// Publish intent only after its complete bytes have been synced. This is an immutable
/// private log file, not a content-conditioned replacement of the user's source file.
pub fn publish_record(path: &Path, bytes: &[u8]) -> crate::error::DesktopResult<File> {
    let temporary = path.with_extension("pending");
    let file = create_record(&temporary, bytes)?;
    drop(file);
    if path.exists() {
        return Err(crate::error::DesktopError::conflict(
            "修复日志已存在，未覆盖。",
        ));
    }
    std::fs::rename(&temporary, path)
        .map_err(|_| crate::error::DesktopError::io("修复日志未发布；源文件写入未获授权。"))?;
    let mut published = Target::open(path, false)?;
    if published.bytes(256 * 1024)? != bytes {
        return Err(crate::error::DesktopError::io("修复日志发布后校验失败。"));
    }
    Ok(published.file)
}
