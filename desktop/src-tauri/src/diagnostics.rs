//! Bounded, sanitized local diagnostic event log and panic hook.
//! Never records project file contents, credentials, tokens, SQL parameters, or panic payloads.
use serde::Serialize;
use std::{
    cell::Cell,
    fs::{self, File, OpenOptions},
    io::Write,
    panic::{self, PanicHookInfo},
    path::{Component, Path, PathBuf},
    sync::{Mutex, Once, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

pub const MAX_LOG_BYTES: u64 = 512 * 1024;
const SUBDIR: &str = "diagnostics";
const ACTIVE_FILE: &str = "desktop-events.jsonl";
const PREVIOUS_FILE: &str = "desktop-events.prev.jsonl";

static SINK: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static PANIC_HOOK: Once = Once::new();

thread_local! {
    static IN_DIAGNOSTICS: Cell<bool> = const { Cell::new(false) };
}

struct ReentrancyGuard(bool);
impl ReentrancyGuard {
    fn enter() -> Option<Self> {
        IN_DIAGNOSTICS.with(|flag| {
            if flag.get() {
                None
            } else {
                flag.set(true);
                Some(Self(true))
            }
        })
    }
}
impl Drop for ReentrancyGuard {
    fn drop(&mut self) {
        if self.0 {
            IN_DIAGNOSTICS.with(|flag| flag.set(false));
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PanicLocation<'a> {
    file: &'a str,
    line: u32,
    column: u32,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum EventDetail<'a> {
    Reason {
        reason: &'static str,
    },
    Sqlite {
        sqlite_code: Option<i32>,
    },
    Panic {
        thread: &'a str,
        location: Option<PanicLocation<'a>>,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticEvent<'a> {
    schema_version: u32,
    timestamp_ms: u64,
    level: &'static str,
    subsystem: &'static str,
    code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<EventDetail<'a>>,
}

fn sink() -> &'static Mutex<Option<PathBuf>> {
    SINK.get_or_init(|| Mutex::new(None))
}

fn write_lock() -> &'static Mutex<()> {
    WRITE_LOCK.get_or_init(|| Mutex::new(()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn is_meta_link_or_reparse(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        if (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
            return true;
        }
    }
    false
}

fn is_link_or_reparse(path: &Path) -> Result<bool, std::io::Error> {
    match fs::symlink_metadata(path) {
        Ok(meta) => Ok(is_meta_link_or_reparse(&meta)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(err) => Err(err),
    }
}

fn sanitize_source_path(raw: &str) -> &str {
    for marker in [
        "desktop/src-tauri/",
        "desktop\\src-tauri\\",
        "src/",
        "src\\",
    ] {
        if let Some(idx) = raw.rfind(marker) {
            return &raw[idx..];
        }
    }
    raw.rsplit(['/', '\\']).next().unwrap_or("unknown")
}

fn sanitize_thread_name(name: Option<&str>) -> &'static str {
    match name {
        Some("main") => "main",
        Some("shipmate-model-output") => "shipmate-model-output",
        Some(other) if other.starts_with("tokio-runtime") => "tokio-runtime",
        Some(_) => "named-worker",
        None => "unnamed",
    }
}

fn ensure_safe_directory(target: &Path) -> Result<(), std::io::Error> {
    if !target.is_absolute() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "diagnostics path must be absolute",
        ));
    }
    let mut current = PathBuf::new();
    for component in target.components() {
        match component {
            Component::Prefix(prefix) => current.push(prefix.as_os_str()),
            Component::RootDir => current.push(component.as_os_str()),
            Component::Normal(part) => {
                if part.is_empty() {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "empty path segment",
                    ));
                }
                current.push(part);
                match fs::symlink_metadata(&current) {
                    Ok(meta) => {
                        if is_meta_link_or_reparse(&meta) || !meta.is_dir() {
                            return Err(std::io::Error::new(
                                std::io::ErrorKind::InvalidInput,
                                "unsafe ancestor or non-directory in diagnostics path",
                            ));
                        }
                    }
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                        match fs::create_dir(&current) {
                            Ok(()) => {}
                            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
                            Err(e) => return Err(e),
                        }
                        let meta = fs::symlink_metadata(&current)?;
                        if is_meta_link_or_reparse(&meta) || !meta.is_dir() {
                            return Err(std::io::Error::new(
                                std::io::ErrorKind::InvalidInput,
                                "unsafe directory created in diagnostics path",
                            ));
                        }
                    }
                    Err(err) => return Err(err),
                }
            }
            Component::CurDir | Component::ParentDir => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "dot segments not allowed in diagnostics path",
                ));
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
fn lock_directory_handle(dir: &Path) -> Result<File, std::io::Error> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    let handle = OpenOptions::new()
        .read(true)
        .share_mode(3)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(dir)?;
    let meta = handle.metadata()?;
    if !meta.is_dir() || (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "diagnostics directory handle is a reparse point",
        ));
    }
    Ok(handle)
}

fn open_append_regular_file(path: &Path) -> Result<File, std::io::Error> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .share_mode(3)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)?;
        let meta = file.metadata()?;
        if !meta.is_file() || (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "active diagnostics handle is not a regular file",
            ));
        }
        Ok(file)
    }
    #[cfg(not(windows))]
    {
        let before = fs::symlink_metadata(path).ok();
        if let Some(ref meta) = before {
            if is_meta_link_or_reparse(meta) || !meta.is_file() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "active diagnostics path is not a regular file",
                ));
            }
        }
        let file = OpenOptions::new().create(true).append(true).open(path)?;
        let handle_meta = file.metadata()?;
        let path_meta = fs::symlink_metadata(path)?;
        if !handle_meta.is_file() || is_meta_link_or_reparse(&path_meta) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "active diagnostics path changed to non-regular file",
            ));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if handle_meta.dev() != path_meta.dev() || handle_meta.ino() != path_meta.ino() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "active diagnostics inode mismatch",
                ));
            }
        }
        Ok(file)
    }
}

fn append_line_to_dir(base_dir: &Path, line: &[u8]) -> Result<(), std::io::Error> {
    if line.is_empty() || line.len() as u64 > MAX_LOG_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid diagnostics line size",
        ));
    }
    let dir = base_dir.join(SUBDIR);
    ensure_safe_directory(&dir)?;
    #[cfg(windows)]
    let _dir_guard = lock_directory_handle(&dir)?;

    let active = dir.join(ACTIVE_FILE);
    let previous = dir.join(PREVIOUS_FILE);
    if is_link_or_reparse(&active)? || is_link_or_reparse(&previous)? {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "unsafe diagnostics file link",
        ));
    }

    let existing_len = match fs::symlink_metadata(&active) {
        Ok(meta) => {
            if !meta.is_file() || is_meta_link_or_reparse(&meta) {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "active diagnostics target is not a regular file",
                ));
            }
            meta.len()
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => 0,
        Err(err) => return Err(err),
    };

    if existing_len > 0 && existing_len.saturating_add(line.len() as u64) > MAX_LOG_BYTES {
        if let Ok(prev_meta) = fs::symlink_metadata(&previous) {
            if !prev_meta.is_file() || is_meta_link_or_reparse(&prev_meta) {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "previous diagnostics target is not a regular file",
                ));
            }
        }
        // Atomic replacement without deleting `previous` beforehand.
        fs::rename(&active, &previous)?;
    }

    let mut file = open_append_regular_file(&active)?;
    file.write_all(line)?;
    file.flush()
}

fn emit_event(event: &DiagnosticEvent<'_>) {
    let Some(_reentrancy) = ReentrancyGuard::enter() else {
        return;
    };
    let Ok(mut encoded) = serde_json::to_vec(event) else {
        return;
    };
    encoded.push(b'\n');
    if encoded.len() as u64 > MAX_LOG_BYTES {
        return;
    }
    let target_dir = {
        let guard = sink()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.clone()
    };
    if let Some(base_dir) = target_dir {
        let _writer = write_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let _ = append_line_to_dir(&base_dir, &encoded);
    }
}

fn record_panic_info(info: &PanicHookInfo<'_>) {
    // Intentionally never inspect or serialize `info.payload()` so arbitrary panic strings
    // cannot leak source snippets, paths, or credentials to disk.
    let thread = std::thread::current();
    let thread_label = sanitize_thread_name(thread.name());
    let location = info.location().map(|loc| PanicLocation {
        file: sanitize_source_path(loc.file()),
        line: loc.line(),
        column: loc.column(),
    });
    emit_event(&DiagnosticEvent {
        schema_version: 1,
        timestamp_ms: now_ms(),
        level: "panic",
        subsystem: "panic",
        code: "thread_panic",
        detail: Some(EventDetail::Panic {
            thread: thread_label,
            location,
        }),
    });
}

pub fn install_panic_hook() {
    PANIC_HOOK.call_once(|| {
        let previous = panic::take_hook();
        panic::set_hook(Box::new(move |info| {
            record_panic_info(info);
            previous(info);
        }));
    });
}

pub fn configure_base_dir(base_dir: PathBuf) {
    let mut guard = sink()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(base_dir);
}

pub fn init_for_app(app: &tauri::AppHandle) {
    if let Ok(dir) = app.path().app_local_data_dir() {
        configure_base_dir(dir);
    }
    install_panic_hook();
    record_reason("app", "info", "startup", "initialized");
}

pub fn record_reason(
    subsystem: &'static str,
    level: &'static str,
    code: &'static str,
    reason: &'static str,
) {
    emit_event(&DiagnosticEvent {
        schema_version: 1,
        timestamp_ms: now_ms(),
        level,
        subsystem,
        code,
        detail: Some(EventDetail::Reason { reason }),
    });
}

pub fn record_sqlite_error(subsystem: &'static str, code: &'static str, sqlite_code: Option<i32>) {
    emit_event(&DiagnosticEvent {
        schema_version: 1,
        timestamp_ms: now_ms(),
        level: "error",
        subsystem,
        code,
        detail: Some(EventDetail::Sqlite { sqlite_code }),
    });
}

#[cfg(test)]
pub(crate) fn with_test_sink<R>(dir: PathBuf, action: impl FnOnce() -> R) -> R {
    let _guard = tests::TEST_SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let _scope = tests::SinkScope::set(dir);
    action()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    pub(super) static TEST_SERIAL: StdMutex<()> = StdMutex::new(());

    pub(super) struct SinkScope(Option<PathBuf>);
    impl SinkScope {
        pub(super) fn set(dir: PathBuf) -> Self {
            let mut guard = sink().lock().unwrap_or_else(|p| p.into_inner());
            let previous = guard.replace(dir);
            Self(previous)
        }
    }
    impl Drop for SinkScope {
        fn drop(&mut self) {
            let mut guard = sink().lock().unwrap_or_else(|p| p.into_inner());
            *guard = self.0.take();
        }
    }

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "shipmate-diag-{tag}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn writes_bounded_jsonl_and_rotates_atomically_across_multiple_cycles() {
        let _guard = TEST_SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let temp = TempDir::new("rotate");
        let line = br#"{"schemaVersion":1,"timestampMs":1,"level":"warn","subsystem":"project_store","code":"rotation_probe_event","detail":{"kind":"reason","reason":"bounded_diagnostic_rotation_probe_reason"}}"#;
        let mut with_lf = line.to_vec();
        with_lf.push(b'\n');

        // Exceed 2 * MAX_LOG_BYTES so `previous` already exists and atomic replacement is exercised.
        for _ in 0..7_000 {
            append_line_to_dir(&temp.0, &with_lf).unwrap();
        }

        let diag_dir = temp.0.join(SUBDIR);
        let active = diag_dir.join(ACTIVE_FILE);
        let prev = diag_dir.join(PREVIOUS_FILE);
        assert!(active.is_file());
        assert!(prev.is_file());
        assert!(fs::metadata(&active).unwrap().len() <= MAX_LOG_BYTES);
        assert!(fs::metadata(&prev).unwrap().len() <= MAX_LOG_BYTES);

        let entries: Vec<_> = fs::read_dir(&diag_dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries.len(), 2);

        for file in [&active, &prev] {
            let text = fs::read_to_string(file).unwrap();
            assert!(!text.contains('\r'));
            for row in text.lines() {
                let parsed: serde_json::Value = serde_json::from_str(row).unwrap();
                assert_eq!(parsed["schemaVersion"], 1);
                assert_eq!(parsed["code"], "rotation_probe_event");
            }
        }

        // Oversized single lines are rejected even on a fresh directory.
        let fresh = TempDir::new("oversize");
        assert!(append_line_to_dir(&fresh.0, &vec![b'x'; (MAX_LOG_BYTES + 1) as usize]).is_err());
    }

    #[test]
    fn rejects_relative_dot_and_ancestor_or_leaf_reparse_points() {
        let _guard = TEST_SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        assert!(append_line_to_dir(Path::new("relative-diag-dir"), b"{}\n").is_err());
        let temp = TempDir::new("dots");
        assert!(append_line_to_dir(&temp.0.join("a").join("..").join("b"), b"{}\n").is_err());
        assert_eq!(
            sanitize_source_path("D:\\src\\Users\\secret_user\\.cargo\\registry\\src\\lib.rs"),
            "src\\lib.rs"
        );

        #[cfg(windows)]
        {
            let junction_root = TempDir::new("junction");
            let real_target = junction_root.0.join("real-outside");
            let ancestor_link = junction_root.0.join("ancestor-junction");
            fs::create_dir_all(&real_target).unwrap();
            let status = std::process::Command::new("cmd")
                .args([
                    "/C",
                    "mklink",
                    "/J",
                    &ancestor_link.to_string_lossy(),
                    &real_target.to_string_lossy(),
                ])
                .output()
                .unwrap();
            assert!(status.status.success());

            // Rejects both direct junction and normal child nested beneath an ancestor junction.
            let nested_base = ancestor_link.join("nested-app-data");
            assert!(append_line_to_dir(&nested_base, b"{\"schemaVersion\":1}\n").is_err());
            assert!(!real_target.join("nested-app-data").exists());

            let _ = std::process::Command::new("cmd")
                .args(["/C", "rmdir", &ancestor_link.to_string_lossy()])
                .output();
        }
    }

    #[test]
    fn panic_hook_records_location_without_leaking_payload_or_deadlocking_on_reentry() {
        let _guard = TEST_SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let temp = TempDir::new("panic");
        let _sink_scope = SinkScope::set(temp.0.clone());
        install_panic_hook();

        let canary = "SECRET_CANARY_TOKEN_998877_DO_NOT_LOG";
        let caught = panic::catch_unwind(|| {
            panic!("simulated failure with {canary}");
        });
        assert!(caught.is_err());

        // Simulate re-entrant panic while `IN_DIAGNOSTICS` is already active on this thread.
        let reentrant = panic::catch_unwind(|| {
            let _held = ReentrancyGuard::enter().unwrap();
            panic!("reentrant panic with {canary}");
        });
        assert!(reentrant.is_err());

        let active = temp.0.join(SUBDIR).join(ACTIVE_FILE);
        let raw = fs::read_to_string(&active).unwrap();
        assert!(!raw.contains(canary));
        let panic_events: Vec<serde_json::Value> = raw
            .lines()
            .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
            .filter(|v| v["code"] == "thread_panic")
            .collect();
        assert_eq!(panic_events.len(), 1);
        let event = &panic_events[0];
        assert_eq!(event["level"], "panic");
        assert_eq!(event["subsystem"], "panic");
        assert_eq!(event["detail"]["kind"], "panic");
        assert!(event["detail"]["location"]["line"].as_u64().unwrap() > 0);
        let file = event["detail"]["location"]["file"].as_str().unwrap();
        assert!(file.ends_with("diagnostics.rs"));
    }
}
