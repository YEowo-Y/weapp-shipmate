mod signature;

use super::{DevtoolsState, DevtoolsStatus};
use serde::Deserialize;
use signature::PinnedImage;
use std::{
    env,
    ffi::OsString,
    fs::{File, OpenOptions},
    io::{self, Read},
    mem::{offset_of, size_of, size_of_val},
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpStream},
    os::windows::{
        ffi::OsStringExt,
        fs::{MetadataExt, OpenOptionsExt},
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    path::{Path, PathBuf},
    ptr::{null, null_mut},
    slice,
};
use windows_sys::Win32::{
    Foundation::{
        GetLastError, ERROR_FILE_NOT_FOUND, ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_FILES,
        ERROR_PATH_NOT_FOUND, INVALID_HANDLE_VALUE, NO_ERROR, WAIT_TIMEOUT,
    },
    NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, MIB_TCP_STATE_ESTAB,
        MIB_TCP_STATE_LISTEN, TCP_TABLE_OWNER_PID_ALL,
    },
    Networking::WinSock::AF_INET,
    Security::Cryptography::{
        BCryptCloseAlgorithmProvider, BCryptHash, BCryptOpenAlgorithmProvider, BCRYPT_MD5_ALGORITHM,
    },
    Storage::FileSystem::{
        GetDriveTypeW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        FILE_READ_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE,
    },
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        Registry::{
            RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
            RRF_SUBKEY_WOW6432KEY, RRF_SUBKEY_WOW6464KEY,
        },
        Threading::{
            OpenProcess, QueryFullProcessImageNameW, WaitForSingleObject,
            PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
        },
        WindowsProgramming::DRIVE_FIXED,
    },
};

const LAUNCHER: &str = "微信开发者工具.exe";
const RUNTIME: &str = "wechatdevtools.exe";
const INSTALL_NAMES: [&str; 2] = ["微信开发者工具", "微信web开发者工具"];
const UNINSTALL_ROOT: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
const MAX_VERSION_BYTES: u64 = 16 * 1024;
const MAX_MARKER_BYTES: u64 = 16;

struct Installation {
    root: PathBuf,
    physical_root: PathBuf,
    images: Vec<PathBuf>,
    launcher: PinnedImage,
    version: Option<String>,
}

struct VerifiedProcess {
    pid: u32,
    handle: OwnedHandle,
    image_index: usize,
}

impl VerifiedProcess {
    fn running(&self) -> bool {
        // The open handle identifies this process even after the numeric PID is released.
        unsafe { WaitForSingleObject(self.handle.as_raw_handle(), 0) == WAIT_TIMEOUT }
    }
}

pub(super) struct Listener {
    pub(super) port: u16,
    pub(super) version: Option<String>,
    owner: VerifiedProcess,
    _images: Vec<PinnedImage>,
}

impl Listener {
    pub(super) fn owns_connection(&self, stream: &TcpStream) -> bool {
        let server = SocketAddrV4::new(Ipv4Addr::LOCALHOST, self.port);
        let (Ok(SocketAddr::V4(client)), Ok(peer)) = (stream.local_addr(), stream.peer_addr())
        else {
            return false;
        };
        if peer != SocketAddr::V4(server) || *client.ip() != Ipv4Addr::LOCALHOST {
            return false;
        }
        self.owner.running()
            && tcp_rows().is_ok_and(|rows| established_owner(&rows, server, client, self.owner.pid))
            && self.owner.running()
    }
}

pub(super) fn discover(
    local_app_data: &Path,
    picked_dir: Option<&Path>,
) -> (Result<Listener, DevtoolsStatus>, bool) {
    let installations = match find_installations(picked_dir) {
        Ok(installations) => installations,
        Err(()) => {
            return (
                Err(DevtoolsStatus::new(DevtoolsState::ManualCheck, None)),
                false,
            );
        }
    };
    let selected_install_valid = picked_dir.is_some() && !installations.is_empty();
    (
        discover_listener(local_app_data, installations),
        selected_install_valid,
    )
}

fn discover_listener(
    local_app_data: &Path,
    mut installations: Vec<Installation>,
) -> Result<Listener, DevtoolsStatus> {
    if installations.is_empty() {
        return Err(DevtoolsStatus::new(DevtoolsState::NotDetected, None));
    }

    let Some((index, processes)) = running_installation(&installations)
        .map_err(|()| DevtoolsStatus::new(DevtoolsState::ManualCheck, None))?
    else {
        let version = (installations.len() == 1)
            .then(|| installations[0].version.clone())
            .flatten();
        return Err(DevtoolsStatus::new(DevtoolsState::NotRunning, version));
    };
    let install = installations.swap_remove(index);
    let status = |state| DevtoolsStatus::new(state, install.version.clone());
    let mut images = install
        .images
        .iter()
        .enumerate()
        .skip(1)
        .filter(|(index, _)| {
            processes
                .iter()
                .any(|process| process.image_index == *index)
        })
        .map(|(_, path)| signature::pin_trusted_image(path))
        .collect::<io::Result<Vec<_>>>()
        .map_err(|_| status(DevtoolsState::ManualCheck))?;
    let port = port_marker(local_app_data, &install.root)
        .map_err(|()| status(DevtoolsState::ManualCheck))?
        .ok_or_else(|| status(DevtoolsState::PortUnavailable))?;
    let rows = tcp_rows().map_err(|()| status(DevtoolsState::ManualCheck))?;
    let pid = listener_pid(&rows, port)
        .map_err(|()| status(DevtoolsState::ManualCheck))?
        .ok_or_else(|| status(DevtoolsState::PortUnavailable))?;
    let owner = processes
        .into_iter()
        .find(|owner| owner.pid == pid && owner.running())
        .ok_or_else(|| status(DevtoolsState::ManualCheck))?;
    images.push(install.launcher);
    Ok(Listener {
        port,
        version: install.version.clone(),
        owner,
        _images: images,
    })
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn registry_string(hive: HKEY, view: u32, key: &[u16], name: &str) -> Result<Option<String>, ()> {
    let mut buffer = [0u16; 4096];
    let mut size = size_of_val(&buffer) as u32;
    // The key and value names are terminated UTF-16, and size is the writable byte count.
    let code = unsafe {
        RegGetValueW(
            hive,
            key.as_ptr(),
            wide(name).as_ptr(),
            RRF_RT_REG_SZ | view,
            null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    match code {
        ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND => Ok(None),
        NO_ERROR => {
            if !size.is_multiple_of(size_of::<u16>() as u32) {
                return Err(());
            }
            let count = size as usize / size_of::<u16>();
            let value = buffer
                .get(..count)
                .and_then(|value| value.strip_suffix(&[0]));
            let value = value.filter(|value| !value.contains(&0)).ok_or(())?;
            String::from_utf16(value).map(Some).map_err(|_| ())
        }
        _ => Err(()),
    }
}

fn icon_directory(value: &str) -> Option<PathBuf> {
    let value = value.trim();
    let exe = match value.rsplit_once(',') {
        Some((path, index)) if index.trim().parse::<i32>().is_ok() => path.trim_end(),
        _ => value,
    };
    let exe = match exe.strip_prefix('"') {
        Some(quoted) => quoted.strip_suffix('"')?,
        None => exe,
    };
    let path = Path::new(exe);
    path.file_name()
        .filter(|name| name.eq_ignore_ascii_case(LAUNCHER))?;
    path.parent().map(Path::to_path_buf)
}

fn valid_version(value: &str) -> bool {
    value.len() <= 32
        && value.contains('.')
        && value
            .split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

fn find_installations(picked_dir: Option<&Path>) -> Result<Vec<Installation>, ()> {
    if let Some(path) = picked_dir {
        return Ok(inspect_installation(path, None)?.into_iter().collect());
    }

    let mut candidates = Vec::new();
    for (hive, view) in [
        (HKEY_CURRENT_USER, 0),
        (HKEY_LOCAL_MACHINE, RRF_SUBKEY_WOW6432KEY),
        (HKEY_LOCAL_MACHINE, RRF_SUBKEY_WOW6464KEY),
    ] {
        for name in INSTALL_NAMES {
            let key = wide(&format!(r"{UNINSTALL_ROOT}\{name}"));
            let root = match registry_string(hive, view, &key, "InstallLocation")?
                .filter(|path| !path.trim().is_empty())
            {
                Some(path) => Some(PathBuf::from(path)),
                None => registry_string(hive, view, &key, "DisplayIcon")?
                    .map(|value| icon_directory(&value).ok_or(()))
                    .transpose()?,
            };
            if let Some(root) = root {
                let version = registry_string(hive, view, &key, "DisplayVersion")?
                    .filter(|value| valid_version(value));
                candidates.push((root, version));
            }
        }
    }
    for base in ["ProgramFiles", "ProgramFiles(x86)"]
        .into_iter()
        .filter_map(env::var_os)
    {
        for name in INSTALL_NAMES {
            candidates.push((PathBuf::from(&base).join("Tencent").join(name), None));
        }
    }

    let mut installations: Vec<Installation> = Vec::new();
    for (root, version) in candidates {
        if let Some(install) = inspect_installation(&root, version)? {
            // Keep the installer spelling used by the V2 profile hash. Registry candidates
            // come before fallback paths.
            if !installations
                .iter()
                .any(|other| other.physical_root == install.physical_root)
            {
                installations.push(install);
            }
        }
    }
    Ok(installations)
}

fn invalid_path() -> io::Error {
    io::ErrorKind::InvalidInput.into()
}

fn ordinary_disk_path(path: &Path) -> io::Result<PathBuf> {
    let path = path.to_str().ok_or_else(invalid_path)?;
    let path = path.strip_prefix(r"\\?\").unwrap_or(path);
    let bytes = path.as_bytes();
    if !bytes.first().is_some_and(u8::is_ascii_alphabetic)
        || bytes.get(1) != Some(&b':')
        || !matches!(bytes.get(2), Some(b'\\' | b'/'))
    {
        return Err(invalid_path());
    }
    let drive = [u16::from(bytes[0]), u16::from(b':'), u16::from(b'\\'), 0];
    // A mapped remote drive can have an ordinary drive-letter path.
    if unsafe { GetDriveTypeW(drive.as_ptr()) } != DRIVE_FIXED {
        return Err(invalid_path());
    }
    let mut result = PathBuf::from(format!("{}\\", &path[..2]));
    for part in path[3..].split(['\\', '/']).filter(|part| !part.is_empty()) {
        if part.ends_with(['.', ' '])
            || part.contains([':', '<', '>', '"', '|', '?', '*'])
            || part.chars().any(char::is_control)
            || dos_device_name(part)
        {
            return Err(invalid_path());
        }
        result.push(part);
    }
    Ok(result)
}

fn dos_device_name(name: &str) -> bool {
    let name = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_uppercase();
    matches!(
        name.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        name.strip_prefix(prefix).is_some_and(|number| {
            matches!(
                number,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    })
}

fn hold_directories(path: &Path) -> io::Result<Vec<File>> {
    let ancestors: Vec<_> = path.ancestors().filter(|path| path.has_root()).collect();
    ancestors
        .into_iter()
        .rev()
        .map(|directory| {
            // Open each component itself and disallow its replacement while accessing children.
            let file = OpenOptions::new()
                .access_mode(FILE_READ_ATTRIBUTES)
                .share_mode(FILE_SHARE_READ)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
                .open(directory)?;
            let metadata = file.metadata()?;
            if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
            {
                return Err(invalid_path());
            }
            Ok(file)
        })
        .collect()
}

fn expected_file(path: &Path, read_content: bool) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    if read_content {
        options.read(true).share_mode(FILE_SHARE_READ);
    } else {
        options
            .access_mode(FILE_READ_ATTRIBUTES)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(invalid_path());
    }
    Ok(file)
}

fn inspect_installation(root: &Path, version: Option<String>) -> Result<Option<Installation>, ()> {
    fn inspect(root: &Path, version: Option<String>) -> io::Result<Installation> {
        let root = ordinary_disk_path(root)?;
        let _dirs = hold_directories(&root)?;
        let _cli = expected_file(&root.join("cli.bat"), false)?;
        let launcher = root.join(LAUNCHER);
        let _launcher = expected_file(&launcher, false)?;
        let physical_root = ordinary_disk_path(&root.canonicalize()?)?;
        let launcher = ordinary_disk_path(&launcher.canonicalize()?)?;
        let launcher_pin = signature::pin_trusted_image(&launcher)?;
        let mut images = vec![launcher];
        let runtime = root.join(RUNTIME);
        match expected_file(&runtime, false) {
            Ok(_image) => images.push(ordinary_disk_path(&runtime.canonicalize()?)?),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        Ok(Installation {
            root,
            physical_root,
            images,
            launcher: launcher_pin,
            version,
        })
    }
    match inspect(root, version) {
        Ok(install) => Ok(Some(install)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(()),
    }
}

fn read_small_file(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    let path = ordinary_disk_path(path)?;
    let _dirs = hold_directories(path.parent().ok_or_else(invalid_path)?)?;
    let file = expected_file(&path, true)?;
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    // The handle remains open through the metadata check and the only read.
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0
        || info.nNumberOfLinks != 1
        || file.metadata()?.len() > limit
    {
        return Err(invalid_path());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(invalid_path());
    }
    Ok(bytes)
}

fn profile_key(root: &Path, latest_nw: &str) -> Result<String, ()> {
    if latest_nw.is_empty()
        || latest_nw.len() > 64
        || !latest_nw
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(());
    }
    let path = root.to_str().ok_or(())?;
    let input = format!("{path}{latest_nw}");
    let input_len = u32::try_from(input.len()).map_err(|_| ())?;
    let mut algorithm = null_mut();
    let mut digest = [0u8; 16];
    // MD5 is the documented directory-name formula, not an authentication check.
    unsafe {
        if BCryptOpenAlgorithmProvider(&mut algorithm, BCRYPT_MD5_ALGORITHM, null(), 0) < 0 {
            return Err(());
        }
        let status = BCryptHash(
            algorithm,
            null(),
            0,
            input.as_ptr(),
            input_len,
            digest.as_mut_ptr(),
            digest.len() as u32,
        );
        BCryptCloseAlgorithmProvider(algorithm, 0);
        if status < 0 {
            return Err(());
        }
    }
    Ok(format!("{:032x}", u128::from_be_bytes(digest)))
}

fn parse_port(bytes: &[u8]) -> Result<u16, ()> {
    let digits = bytes.trim_ascii();
    if digits.is_empty() || digits.len() > 5 || !digits.iter().all(u8::is_ascii_digit) {
        return Err(());
    }
    std::str::from_utf8(digits)
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0)
        .ok_or(())
}

fn port_marker(local_app_data: &Path, install_root: &Path) -> Result<Option<u16>, ()> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Version {
        latest_nw: String,
    }
    let version =
        read_small_file(&install_root.join("version"), MAX_VERSION_BYTES).map_err(|_| ())?;
    let version: Version = serde_json::from_slice(&version).map_err(|_| ())?;
    let marker = local_app_data
        .join(INSTALL_NAMES[0])
        .join("User Data")
        .join(profile_key(install_root, &version.latest_nw)?)
        .join("Default")
        .join(".ide");
    match read_small_file(&marker, MAX_MARKER_BYTES) {
        Ok(bytes) => parse_port(&bytes).map(Some),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(()),
    }
}

fn process_image(process: &OwnedHandle) -> Result<PathBuf, ()> {
    let mut buffer = vec![0u16; 32_768];
    let mut len = buffer.len() as u32;
    // Query the image path only, with the buffer size expressed in UTF-16 code units.
    if unsafe {
        QueryFullProcessImageNameW(process.as_raw_handle(), 0, buffer.as_mut_ptr(), &mut len)
    } == 0
    {
        return Err(());
    }
    let raw = PathBuf::from(OsString::from_wide(buffer.get(..len as usize).ok_or(())?));
    ordinary_disk_path(&raw).map_err(|_| ())
}

fn running_installation(
    installations: &[Installation],
) -> Result<Option<(usize, Vec<VerifiedProcess>)>, ()> {
    // The snapshot contains process filenames and PIDs. Only exact IDE filenames proceed
    // to the limited query needed to confirm their full image paths.
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(());
    }
    // The successful snapshot is an owned kernel handle.
    let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot) };
    let mut entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    if unsafe { Process32FirstW(snapshot.as_raw_handle(), &mut entry) } == 0 {
        return Err(());
    }
    let mut active = None;
    let mut processes = Vec::new();
    loop {
        let name = OsString::from_wide(
            entry
                .szExeFile
                .split(|unit| *unit == 0)
                .next()
                .unwrap_or(&[]),
        );
        if [LAUNCHER, RUNTIME]
            .iter()
            .any(|expected| name.eq_ignore_ascii_case(expected))
        {
            let pid = entry.th32ProcessID;
            // No access to the process memory, command line, or environment is requested.
            let handle = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                    0,
                    pid,
                )
            };
            if handle.is_null() {
                return Err(());
            }
            // A successful OpenProcess returns a handle that this probe owns.
            let handle = unsafe { OwnedHandle::from_raw_handle(handle) };
            let image = process_image(&handle)?;
            let (index, image_index) = installations
                .iter()
                .enumerate()
                .find_map(|(index, install)| {
                    install
                        .images
                        .iter()
                        .position(|expected| *expected == image)
                        .map(|image_index| (index, image_index))
                })
                .ok_or(())?;
            if active.is_some_and(|previous| previous != index) {
                return Err(());
            }
            let process = VerifiedProcess {
                pid,
                handle,
                image_index,
            };
            if process.running() {
                processes.push(process);
                active = Some(index);
            }
        }
        if unsafe { Process32NextW(snapshot.as_raw_handle(), &mut entry) } == 0 {
            if unsafe { GetLastError() } == ERROR_NO_MORE_FILES {
                break;
            }
            return Err(());
        }
    }
    Ok(active.map(|index| (index, processes)))
}

fn tcp_rows() -> Result<Vec<MIB_TCPROW_OWNER_PID>, ()> {
    let mut bytes = 0;
    // The first call obtains the current table size without writing to a buffer.
    if unsafe {
        GetExtendedTcpTable(
            null_mut(),
            &mut bytes,
            0,
            u32::from(AF_INET),
            TCP_TABLE_OWNER_PID_ALL,
            0,
        )
    } != ERROR_INSUFFICIENT_BUFFER
    {
        return Err(());
    }
    let offset = offset_of!(MIB_TCPTABLE_OWNER_PID, table);
    let row_size = size_of::<MIB_TCPROW_OWNER_PID>();
    // TCP entries can change between sizing and filling. Retry a bounded number of times.
    for _ in 0..3 {
        if bytes < offset as u32 || bytes > 8 * 1024 * 1024 {
            return Err(());
        }
        let mut buffer = vec![0u32; (bytes as usize).div_ceil(size_of::<u32>())];
        let capacity = size_of_val(buffer.as_slice());
        bytes = capacity as u32;
        let result = unsafe {
            GetExtendedTcpTable(
                buffer.as_mut_ptr().cast(),
                &mut bytes,
                0,
                u32::from(AF_INET),
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };
        match result {
            ERROR_INSUFFICIENT_BUFFER => continue,
            NO_ERROR => {
                let len = bytes as usize;
                let count = buffer[0] as usize;
                if len < offset || len > capacity || count > (len - offset) / row_size {
                    return Err(());
                }
                // The SDK table offset and DWORD-aligned allocation match this row type.
                // The count has been checked against the initialized buffer length.
                let rows = unsafe {
                    slice::from_raw_parts(
                        buffer
                            .as_ptr()
                            .cast::<u8>()
                            .add(offset)
                            .cast::<MIB_TCPROW_OWNER_PID>(),
                        count,
                    )
                };
                return Ok(rows.to_vec());
            }
            _ => return Err(()),
        }
    }
    Err(())
}

fn endpoint(addr: u32, port: u32) -> SocketAddrV4 {
    // Win32 stores both values in network byte order, with the port in the low WORD.
    SocketAddrV4::new(
        Ipv4Addr::from(addr.to_ne_bytes()),
        u16::from_be(port as u16),
    )
}

fn listener_pid(rows: &[MIB_TCPROW_OWNER_PID], port: u16) -> Result<Option<u32>, ()> {
    let mut owner = None;
    for row in rows
        .iter()
        .filter(|row| row.dwState == MIB_TCP_STATE_LISTEN as u32)
    {
        let local = endpoint(row.dwLocalAddr, row.dwLocalPort);
        if local.port() != port
            || (!local.ip().is_unspecified() && *local.ip() != Ipv4Addr::LOCALHOST)
        {
            continue;
        }
        if *local.ip() != Ipv4Addr::LOCALHOST || owner.replace(row.dwOwningPid).is_some() {
            return Err(());
        }
    }
    Ok(owner)
}

fn established_owner(
    rows: &[MIB_TCPROW_OWNER_PID],
    server: SocketAddrV4,
    client: SocketAddrV4,
    pid: u32,
) -> bool {
    let mut matches = rows.iter().filter(|row| {
        row.dwState == MIB_TCP_STATE_ESTAB as u32
            && endpoint(row.dwLocalAddr, row.dwLocalPort) == server
            && endpoint(row.dwRemoteAddr, row.dwRemotePort) == client
    });
    matches.next().is_some_and(|row| row.dwOwningPid == pid) && matches.next().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        net::TcpListener,
        os::windows::fs::symlink_dir,
        process,
        sync::atomic::{AtomicUsize, Ordering},
    };

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("target");
            fs::create_dir_all(&root).unwrap();
            let path = root.join(format!(
                "test-devtools-discovery-{}-{}",
                process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("target");
            if let (Ok(expected), Ok(actual)) = (root.canonicalize(), self.0.canonicalize()) {
                if actual.parent() == Some(expected.as_path()) {
                    let _ = fs::remove_dir_all(&self.0);
                }
            }
        }
    }

    #[test]
    fn reads_only_the_exact_profile_for_a_custom_install() {
        let fixture = Fixture::new();
        let root = fixture.0.join("自定义安装");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("version"), br#"{"latestNw":"0.99.0"}"#).unwrap();
        assert_eq!(
            profile_key(Path::new(r"D:\定向夹具"), "0.99.0"),
            Ok("8627248a895ea1c7f29001e0f30b37da".into())
        );

        let profiles = fixture.0.join(INSTALL_NAMES[0]).join("User Data");
        let other = profiles
            .join("00000000000000000000000000000000")
            .join("Default");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join(".ide"), b"40210").unwrap();
        assert_eq!(port_marker(&fixture.0, &root), Ok(None));

        let profile = profiles
            .join(profile_key(&root, "0.99.0").unwrap())
            .join("Default");
        fs::create_dir_all(&profile).unwrap();
        let marker = profile.join(".ide");
        fs::write(&marker, b"40215\r\n").unwrap();
        assert_eq!(port_marker(&fixture.0, &root), Ok(Some(40215)));
        assert_eq!(listener_pid(&[], 40215), Ok(None));
        fs::write(&marker, b"40215\nunrecognized").unwrap();
        assert_eq!(port_marker(&fixture.0, &root), Err(()));
    }

    #[test]
    fn does_not_retain_a_selected_folder_with_an_unsigned_launcher() {
        let fixture = Fixture::new();
        let (result, selected_install_valid) = discover(&fixture.0, Some(&fixture.0));
        assert!(result.is_err());
        assert!(!selected_install_valid);

        fs::write(fixture.0.join(LAUNCHER), []).unwrap();
        fs::write(fixture.0.join("cli.bat"), []).unwrap();
        let (result, selected_install_valid) = discover(&fixture.0, Some(&fixture.0));
        assert!(matches!(result, Err(status) if status.status == DevtoolsState::ManualCheck));
        assert!(!selected_install_valid);
    }

    #[test]
    fn rejects_unsigned_executable_at_an_expected_path() {
        let fixture = Fixture::new();
        let path = fixture.0.join(LAUNCHER);
        fs::write(&path, b"unsigned fixture").unwrap();
        assert!(signature::pin_trusted_image(&path).is_err());
    }

    #[test]
    #[ignore = "requires a real installation and a locally trusted certificate chain"]
    fn checks_installed_images_without_launching_the_tool() {
        let root = PathBuf::from(env::var_os("SHIPMATE_TEST_DEVTOOLS_INSTALL_DIR").unwrap());
        let install = inspect_installation(&root, None).unwrap().unwrap();
        for path in &install.images {
            signature::pin_trusted_image(path)
                .unwrap_or_else(|error| panic!("{:?}: {error}", path.file_name()));
        }
        let (result, selected_install_valid) =
            discover(Path::new("invalid-local-data"), Some(&root));
        assert!(result.is_err());
        assert!(selected_install_valid);
    }

    #[test]
    fn rejects_nonlocal_and_unsafe_paths_without_opening_them() {
        for path in [
            r"D:relative\dir",
            r"\\remote\share\test",
            r"\\?\UNC\remote\share\test",
            r"\\.\pipe\fixture",
            r"D:\test\..\dir",
            r"D:\test\.\dir",
            r"D:\test\normal:name",
            r"D:\test\COM1.txt",
        ] {
            assert!(ordinary_disk_path(Path::new(path)).is_err(), "{path}");
        }
        assert_eq!(
            icon_directory(r#""D:\应用,目录\微信开发者工具.exe",-2"#),
            Some(PathBuf::from(r"D:\应用,目录"))
        );
        assert_eq!(icon_directory(r"D:\Dev\unrelated.exe,0"), None);
    }

    #[test]
    fn rejects_linked_and_oversized_metadata() {
        let fixture = Fixture::new();
        let file = fixture.0.join("ordinary");
        fs::write(&file, b"40215").unwrap();
        assert_eq!(read_small_file(&file, 5).unwrap(), b"40215");
        assert!(read_small_file(&file, 4).is_err());
        let alias = fixture.0.join(".ide");
        fs::hard_link(&file, &alias).unwrap();
        assert!(read_small_file(&alias, 16).is_err());
    }

    #[test]
    fn rejects_reparse_directories_when_available() {
        let fixture = Fixture::new();
        let real = fixture.0.join("expected-data");
        let link = fixture.0.join("reparse");
        fs::create_dir(&real).unwrap();
        fs::write(real.join(".ide"), b"40215").unwrap();
        match symlink_dir(&real, &link) {
            Ok(()) => {
                assert!(read_small_file(&link.join(".ide"), 16).is_err());
                fs::remove_dir(link).unwrap();
            }
            Err(error)
                if error.raw_os_error()
                    == Some(windows_sys::Win32::Foundation::ERROR_PRIVILEGE_NOT_HELD as i32) =>
            {
                eprintln!("Directory symlink fixture requires Developer Mode or symlink privilege");
            }
            Err(error) => panic!("Unable to create directory symlink fixture: {error}"),
        }
    }

    #[test]
    fn only_accepts_bounded_decimal_ports() {
        assert_eq!(parse_port(b"65535"), Ok(65535));
        for marker in [
            &b""[..],
            b"0",
            b"65536",
            b"+43122",
            b"43122\0",
            b"\xef\xbb\xbf43122",
            b"127.0.0.1:43122",
        ] {
            assert_eq!(parse_port(marker), Err(()));
        }
    }

    fn listening(ip: Ipv4Addr, port: u16, pid: u32) -> MIB_TCPROW_OWNER_PID {
        MIB_TCPROW_OWNER_PID {
            dwState: MIB_TCP_STATE_LISTEN as u32,
            dwLocalAddr: u32::from_ne_bytes(ip.octets()),
            dwLocalPort: u32::from(port.to_be()),
            dwOwningPid: pid,
            ..Default::default()
        }
    }

    #[test]
    fn rejects_wildcard_or_multiple_listeners() {
        let localhost = listening(Ipv4Addr::LOCALHOST, 40215, 123);
        let competitor = listening(Ipv4Addr::LOCALHOST, 40215, 456);
        let wildcard = listening(Ipv4Addr::UNSPECIFIED, 40215, 123);
        let different_address = listening(Ipv4Addr::new(127, 0, 0, 2), 40215, 123);
        assert_eq!(listener_pid(&[localhost], 40215), Ok(Some(123)));
        assert_eq!(listener_pid(&[different_address], 40215), Ok(None));
        assert_eq!(listener_pid(&[wildcard], 40215), Err(()));
        assert_eq!(listener_pid(&[wildcard, localhost], 40215), Err(()));
        assert_eq!(listener_pid(&[competitor, localhost], 40215), Err(()));
    }

    #[test]
    fn confirms_server_half_of_a_real_loopback_connection() {
        let pid = process::id();
        let socket = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = socket.local_addr().unwrap();
        let port = address.port();
        assert_eq!(listener_pid(&tcp_rows().unwrap(), port), Ok(Some(pid)));

        let client = TcpStream::connect(address).unwrap();
        let (server, _) = socket.accept().unwrap();
        let handle = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                0,
                pid,
            )
        };
        assert!(!handle.is_null());
        let mut listener = Listener {
            port,
            version: None,
            owner: VerifiedProcess {
                pid,
                handle: unsafe { OwnedHandle::from_raw_handle(handle) },
                image_index: 0,
            },
            _images: Vec::new(),
        };
        assert!(listener.owns_connection(&client));
        assert!(!listener.owns_connection(&server));
        listener.owner.pid = 0;
        assert!(!listener.owns_connection(&client));
    }
}
