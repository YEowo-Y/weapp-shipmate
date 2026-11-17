//! Shared bundled-runtime and IPC trust boundary. Never resolve executables from PATH.
use std::{
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn local_origin(label: &str, url: &tauri::Url, development: bool) -> bool {
    label == "main"
        && url.username().is_empty()
        && url.password().is_none()
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (matches!(url.scheme(), "http" | "https")
                && url.host_str() == Some("tauri.localhost")
                && url.port().is_none())
            || (development
                && url.scheme() == "http"
                && url.host_str() == Some("localhost")
                && url.port() == Some(1420)))
}

pub fn authorize(window: &tauri::WebviewWindow) -> crate::error::DesktopResult<()> {
    let url = window
        .url()
        .map_err(|_| crate::error::DesktopError::unauthorized("无法验证桌面窗口来源。"))?;
    if local_origin(window.label(), &url, cfg!(debug_assertions)) {
        Ok(())
    } else {
        Err(crate::error::DesktopError::unauthorized(
            "此窗口不能调用本机能力。",
        ))
    }
}

fn bundled_file(root: &Path, relative: &str) -> crate::error::DesktopResult<PathBuf> {
    let root = root.join("runtime").canonicalize().map_err(|_| {
        crate::error::DesktopError::runtime_unavailable(
            "runtime",
            "missing_runtime_dir",
            "应用运行时缺失，请重新安装应用。",
        )
    })?;
    let path = root.join(relative).canonicalize().map_err(|_| {
        crate::error::DesktopError::runtime_unavailable(
            "runtime",
            "missing_runtime_file",
            "应用运行时文件缺失，请重新安装应用。",
        )
    })?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(crate::error::DesktopError::runtime_unavailable(
            "runtime",
            "invalid_runtime_path",
            "应用运行时路径无效。",
        ));
    }
    Ok(path)
}

pub fn node_command(
    app: &tauri::AppHandle,
    script: &str,
    broker: bool,
) -> crate::error::DesktopResult<Command> {
    let root = app.path().resource_dir().map_err(|_| {
        crate::error::DesktopError::runtime_unavailable(
            "runtime",
            "missing_resource_dir",
            "无法定位应用资源。",
        )
    })?;
    command_at(&root, script, broker)
}

fn command_at(root: &Path, script: &str, broker: bool) -> crate::error::DesktopResult<Command> {
    let node = bundled_file(root, if cfg!(windows) { "node.exe" } else { "node" })?;
    let script = bundled_file(root, script)?;
    let mut command = Command::new(node);
    command.arg(script).current_dir(root.join("runtime"));
    // Node preload/path variables must never turn release runtime into an arbitrary-code launcher.
    for variable in [
        "NODE_PATH",
        "NODE_REPL_EXTERNAL_MODULE",
        "NODE_EXTRA_CA_CERTS",
        "NODE_TLS_REJECT_UNAUTHORIZED",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
    ] {
        command.env_remove(variable);
    }
    // Existing native E2E uses a Node preload to mock provider HTTP; release never permits it.
    if !(broker && cfg!(debug_assertions)) {
        command.env_remove("NODE_OPTIONS");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trusts_only_main_local_origins() {
        for origin in [
            "tauri://localhost/",
            "http://tauri.localhost/",
            "https://tauri.localhost/index.html",
        ] {
            let url = tauri::Url::parse(origin).unwrap();
            assert!(local_origin("main", &url, false));
            assert!(!local_origin("other", &url, true));
        }
        for origin in [
            "https://example.com/",
            "http://localhost:5501/",
            "http://tauri.localhost.evil/",
            "https://user@tauri.localhost/",
        ] {
            assert!(!local_origin(
                "main",
                &tauri::Url::parse(origin).unwrap(),
                true
            ));
        }
        let dev = tauri::Url::parse("http://localhost:1420/").unwrap();
        assert!(local_origin("main", &dev, true));
        assert!(!local_origin("main", &dev, false));
    }
    #[test]
    fn rejects_unsafe_ids_and_missing_runtime() {
        assert!(valid_id("tool-123_a"));
        for id in ["", "../a", "a\nb", "a b"] {
            assert!(!valid_id(id));
        }
        assert!(!valid_id(&"x".repeat(81)));
        assert!(bundled_file(Path::new("missing-runtime-fixture"), "node.exe").is_err());
    }
    #[test]
    fn bundled_paths_and_node_environment_are_constrained() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("shipmate-runtime-{}-{unique}", std::process::id()));
        let runtime = root.join("runtime");
        std::fs::create_dir_all(&runtime).unwrap();
        let node = if cfg!(windows) { "node.exe" } else { "node" };
        std::fs::write(runtime.join(node), b"fixture").unwrap();
        std::fs::write(runtime.join("entry.mjs"), b"fixture").unwrap();
        std::fs::write(root.join("outside.mjs"), b"fixture").unwrap();
        let command = command_at(&root, "entry.mjs", false).unwrap();
        assert_eq!(
            PathBuf::from(command.get_program()),
            runtime.join(node).canonicalize().unwrap()
        );
        assert!(command
            .get_envs()
            .any(|(name, value)| name == "NODE_OPTIONS" && value.is_none()));
        assert!(command
            .get_envs()
            .any(|(name, value)| name == "NODE_PATH" && value.is_none()));
        assert!(command_at(&root, "../outside.mjs", false).is_err());
        assert!(bundled_file(&root, ".").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
