//! Explicit, bounded context snapshots; never an unrestricted filesystem API.
use crate::project_store::ProjectStore;
use serde::Serialize;
use std::{
    io::Read,
    path::{Component, Path},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub text: String,
    pub bytes: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_revision: Option<u64>,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PrivateFilePolicy {
    no_read: NamePatterns,
    no_send: NamePatterns,
}

#[derive(Default, serde::Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
struct NamePatterns {
    exact: Vec<String>,
    prefix: Vec<String>,
    suffix: Vec<String>,
    contains: Vec<String>,
    prefix_suffix: Vec<PrefixSuffix>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct PrefixSuffix {
    prefix: String,
    suffix: String,
}

impl NamePatterns {
    fn matches(&self, name: &str) -> bool {
        self.exact.iter().any(|s| name == s)
            || self.prefix.iter().any(|s| name.starts_with(s))
            || self.suffix.iter().any(|s| name.ends_with(s))
            || self.contains.iter().any(|s| name.contains(s))
            || self.prefix_suffix.iter().any(|pair| {
                name.strip_prefix(&pair.prefix)
                    .is_some_and(|rest| rest.ends_with(&pair.suffix))
            })
    }
}

static PRIVATE_FILES: std::sync::LazyLock<PrivateFilePolicy> = std::sync::LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../src/private-files.json"))
        .expect("invalid embedded private file policy")
});

fn sensitive(value: &str) -> bool {
    // Match the same lowercase filename semantics as the local scanner.
    let name = value.to_lowercase();
    PRIVATE_FILES.no_read.matches(&name) || PRIVATE_FILES.no_send.matches(&name)
}
pub(crate) fn validate_text(text: String, limit: usize) -> Result<String, String> {
    if text.len() > limit || text.trim().is_empty() {
        return Err("资料为空或超出大小上限。".into());
    }
    if text
        .chars()
        .any(|c| c.is_control() && !['\n', '\r', '\t'].contains(&c))
    {
        return Err("不支持二进制或包含控制字符的资料。".into());
    }
    let lower = text.to_ascii_lowercase();
    if [
        "-----begin",
        "sk-",
        "ghp_",
        "github_pat_",
        "xoxb-",
        "xoxp-",
        "aizasy",
        "akia",
        "bearer ",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
    {
        return Err("资料可能包含密钥或令牌，请先移除敏感信息。".into());
    }
    Ok(text)
}
fn linked(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}
// Hold traversed Windows directories without DELETE sharing, preventing
// junction substitution between validation and the bounded file read.
#[cfg(windows)]
fn hold_directory(path: &Path) -> Result<std::fs::File, String> {
    use std::os::windows::fs::OpenOptionsExt;
    let file = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(3)
        .custom_flags(0x02200000)
        .open(path)
        .map_err(|_| "目录正在变更或不可读取。")?;
    let metadata = file.metadata().map_err(|_| "目录信息不可读取。")?;
    if !metadata.is_dir() || linked(&metadata) {
        return Err("不支持链接目录。".into());
    }
    Ok(file)
}
fn read_file(root: &Path, supplied: &str) -> Result<ContextSnapshot, String> {
    if supplied.len() > 32768
        || supplied.contains('\0')
        || supplied.starts_with("\\\\")
        || supplied.starts_with("//")
    {
        return Err("不支持此文件路径。".into());
    }
    let root_meta = std::fs::symlink_metadata(root).map_err(|_| "项目目录不可用。")?;
    if linked(&root_meta) {
        return Err("不支持链接项目目录。".into());
    }
    let canonical_root = root.canonicalize().map_err(|_| "项目目录不可用。")?;
    let root_display = root.to_string_lossy();
    let plain_root = Path::new(
        root_display
            .strip_prefix("\\\\?\\")
            .unwrap_or(&root_display),
    );
    let path = Path::new(supplied);
    let relative = if path.is_absolute() {
        path.strip_prefix(root)
            .or_else(|_| path.strip_prefix(plain_root))
            .or_else(|_| path.strip_prefix(&canonical_root))
            .map_err(|_| "只能选择当前项目内的文件。")?
    } else {
        path
    };
    if relative.as_os_str().is_empty() {
        return Err("请选择文本文件。".into());
    }
    let mut target = canonical_root.clone();
    #[cfg(windows)]
    let mut directory_handles = vec![hold_directory(&canonical_root)?];
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err("不允许路径跳转。".into());
        };
        let name = name.to_str().ok_or("文件名格式不支持。")?;
        let upper = name.split('.').next().unwrap_or("").to_ascii_uppercase();
        if name.contains(':')
            || name.ends_with(['.', ' '])
            || sensitive(name)
            || [
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9",
            ]
            .contains(&upper.as_str())
        {
            return Err("此文件名或目录可能包含敏感资料，不支持附加。".into());
        }
        target.push(name);
        #[cfg(windows)]
        if target.is_dir() {
            directory_handles.push(hold_directory(&target)?);
        }
        if linked(&std::fs::symlink_metadata(&target).map_err(|_| "无法读取所选文件。")?) {
            return Err("不支持符号链接或目录联接。".into());
        }
    }
    if !target
        .canonicalize()
        .map_err(|_| "无法读取所选文件。")?
        .starts_with(&canonical_root)
    {
        return Err("文件位于项目目录之外。".into());
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000).share_mode(1);
    }
    let file = options.open(&target).map_err(|_| "无法读取所选文件。")?;
    let metadata = file.metadata().map_err(|_| "无法读取文件信息。")?;
    if !metadata.is_file() || linked(&metadata) || metadata.len() > 16384 {
        return Err("仅支持不超过 16 KiB 的普通文本文件。".into());
    }
    let mut bytes = Vec::new();
    file.take(16385)
        .read_to_end(&mut bytes)
        .map_err(|_| "文件读取失败。")?;
    let text = validate_text(
        String::from_utf8(bytes).map_err(|_| "仅支持 UTF-8 文本文件。")?,
        16384,
    )?;
    let title = relative.to_string_lossy().into_owned();
    Ok(ContextSnapshot {
        id: format!("file:{title}"),
        kind: "file".into(),
        title,
        bytes: text.len(),
        text,
        created_at: None,
        context_revision: None,
    })
}
#[tauri::command]
pub fn project_context_file(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
    path: String,
) -> Result<ContextSnapshot, String> {
    crate::runtime::authorize(&window)?;
    let project = state.context_project(&app, &project_id)?;
    read_file(Path::new(&project.directory), &path)
}
#[tauri::command]
pub fn project_context_report(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
    artifact_id: String,
) -> Result<ContextSnapshot, String> {
    crate::runtime::authorize(&window)?;
    let artifact = state.context_report(&app, &project_id, &artifact_id)?;
    let text = validate_text(artifact.markdown, 24576)?;
    Ok(ContextSnapshot {
        id: format!("report:{}", artifact.id),
        kind: "report".into(),
        title: artifact.title,
        bytes: text.len(),
        text,
        created_at: Some(artifact.created_at),
        context_revision: artifact.context_revision,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_file_cases() {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Case {
            path: String,
            no_read: bool,
            no_send: bool,
        }
        let cases: Vec<Case> = serde_json::from_str(include_str!(
            "../../../tests/fixtures/private-file-cases.json"
        ))
        .unwrap();
        for case in cases {
            let name = case.path.rsplit('/').next().unwrap().to_lowercase();
            assert_eq!(
                PRIVATE_FILES.no_read.matches(&name),
                case.no_read,
                "{}",
                case.path
            );
            let blocked = case.path.split('/').any(sensitive);
            assert_eq!(blocked, case.no_send, "{}", case.path);
        }
    }
    #[test]
    fn context_rejects_sensitive_and_binary_text() {
        for text in [
            "sk-secret123",
            "Bearer value",
            "a\0b",
            "-----BEGIN PRIVATE KEY-----",
        ] {
            assert!(validate_text(text.into(), 24576).is_err());
        }
        assert!(validate_text("normal report".into(), 24576).is_ok());
        assert!(validate_text("a".repeat(16385), 16384).is_err());
    }
    #[test]
    fn context_metadata_is_structured_and_optional() {
        let mut snapshot = ContextSnapshot {
            id: "file:readme.md".into(),
            kind: "file".into(),
            title: "readme.md".into(),
            text: "body".into(),
            bytes: 4,
            created_at: None,
            context_revision: None,
        };
        let file = serde_json::to_value(&snapshot).unwrap();
        assert!(file.get("createdAt").is_none());
        assert!(file.get("contextRevision").is_none());
        snapshot.kind = "report".into();
        snapshot.created_at = Some(1792700000000);
        snapshot.context_revision = Some(3);
        let report = serde_json::to_value(&snapshot).unwrap();
        assert_eq!(report["createdAt"], 1792700000000_u64);
        assert_eq!(report["contextRevision"], 3);
        assert_eq!(report["title"], "readme.md");
        assert_eq!(report["text"], "body");
    }
    #[test]
    fn file_snapshot_is_bounded_and_project_scoped() {
        let root = std::env::temp_dir().join(format!("shipmate-context-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("readme.txt"), "safe content").unwrap();
        std::fs::write(root.join(".env"), "safe content").unwrap();
        std::fs::write(root.join("project.private.config.json"), "{}").unwrap();
        std::fs::write(root.join("large.txt"), vec![b'a'; 16385]).unwrap();
        std::fs::write(root.join("invalid.txt"), [0xff, 0xfe]).unwrap();
        assert_eq!(read_file(&root, "readme.txt").unwrap().text, "safe content");
        for path in [
            "../readme.txt",
            ".env",
            "project.private.config.json",
            "large.txt",
            "invalid.txt",
            "readme.txt:stream",
            "NUL",
        ] {
            assert!(read_file(&root, path).is_err(), "{path}");
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
