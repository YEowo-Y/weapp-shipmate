#[cfg(any(windows, test))]
mod http;
#[cfg(windows)]
mod windows;

use serde::Serialize;
#[cfg(windows)]
use std::{path::PathBuf, sync::Mutex};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum DevtoolsState {
    NotDetected,
    NotRunning,
    PortUnavailable,
    SignedOut,
    Ready,
    ManualCheck,
    #[cfg(not(windows))]
    Unsupported,
    SelectionCanceled,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct DevtoolsStatus {
    status: DevtoolsState,
    version: Option<String>,
}

impl DevtoolsStatus {
    fn new(status: DevtoolsState, version: Option<String>) -> Self {
        Self { status, version }
    }
}

#[derive(Default)]
pub struct DevtoolsSelection(#[cfg(windows)] Mutex<Option<PathBuf>>);

#[tauri::command]
pub async fn devtools_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    select_install: bool,
) -> crate::error::DesktopResult<DevtoolsStatus> {
    crate::runtime::authorize(&window)?;
    #[cfg(windows)]
    {
        crate::error::run_blocking(
            "devtools_status",
            "开发者工具检测意外退出，请重试。",
            move || Ok(check_windows(&app, &window, select_install)),
        )
        .await
    }

    #[cfg(not(windows))]
    {
        let _ = (app, select_install);
        Ok(DevtoolsStatus::new(DevtoolsState::Unsupported, None))
    }
}

#[cfg(windows)]
fn check_windows(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    select_install: bool,
) -> DevtoolsStatus {
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;

    let manual = || DevtoolsStatus::new(DevtoolsState::ManualCheck, None);
    let selection = app.state::<DevtoolsSelection>();
    let Ok(mut directory) = selection.0.try_lock() else {
        return manual();
    };
    let Ok(local_data_dir) = app.path().local_data_dir() else {
        return manual();
    };
    let picked = if select_install {
        let Some(folder) = app
            .dialog()
            .file()
            .set_parent(window)
            .set_title("选择微信开发者工具的安装目录")
            .set_can_create_directories(false)
            .blocking_pick_folder()
        else {
            return DevtoolsStatus::new(DevtoolsState::SelectionCanceled, None);
        };
        let tauri_plugin_dialog::FilePath::Path(path) = folder else {
            return manual();
        };
        Some(path)
    } else {
        None
    };
    let (target, verified_directory) =
        windows::discover(&local_data_dir, picked.as_deref().or(directory.as_deref()));
    if let (true, Some(picked)) = (verified_directory, picked) {
        *directory = Some(picked);
    }
    let listener = match target {
        Ok(listener) => listener,
        Err(status) => return status,
    };
    let status = http::read_login_status(listener.port, |socket| listener.owns_connection(socket));
    DevtoolsStatus::new(status, listener.version)
}
