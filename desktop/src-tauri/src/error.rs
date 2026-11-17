//! Structured error taxonomy and blocking-worker boundary for the desktop native backend.
//!
//! Serializes to the exact localized user-facing message string expected by the
//! WebView IPC layer and native harnesses, while preserving variant-level
//! classification and redacted diagnostics in Rust.

use serde::{Serialize, Serializer};
use std::{borrow::Cow, fmt, ops::Deref};

pub type DesktopResult<T> = Result<T, DesktopError>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DesktopError {
    Unauthorized(Cow<'static, str>),
    Validation(Cow<'static, str>),
    RuntimeUnavailable(Cow<'static, str>),
    Database(Cow<'static, str>),
    Io(Cow<'static, str>),
    StateUnavailable(Cow<'static, str>),
    Conflict(Cow<'static, str>),
    TaskAborted(Cow<'static, str>),
}

impl DesktopError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Unauthorized(_) => "unauthorized",
            Self::Validation(_) => "validation",
            Self::RuntimeUnavailable(_) => "runtime_unavailable",
            Self::Database(_) => "database",
            Self::Io(_) => "io",
            Self::StateUnavailable(_) => "state_unavailable",
            Self::Conflict(_) => "conflict",
            Self::TaskAborted(_) => "task_aborted",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::Unauthorized(msg)
            | Self::Validation(msg)
            | Self::RuntimeUnavailable(msg)
            | Self::Database(msg)
            | Self::Io(msg)
            | Self::StateUnavailable(msg)
            | Self::Conflict(msg)
            | Self::TaskAborted(msg) => msg.as_ref(),
        }
    }

    pub fn into_message(self) -> String {
        match self {
            Self::Unauthorized(msg)
            | Self::Validation(msg)
            | Self::RuntimeUnavailable(msg)
            | Self::Database(msg)
            | Self::Io(msg)
            | Self::StateUnavailable(msg)
            | Self::Conflict(msg)
            | Self::TaskAborted(msg) => msg.into_owned(),
        }
    }

    pub fn unauthorized(message: impl Into<Cow<'static, str>>) -> Self {
        Self::Unauthorized(message.into())
    }

    pub fn validation(message: impl Into<Cow<'static, str>>) -> Self {
        Self::Validation(message.into())
    }

    pub fn runtime_unavailable(
        subsystem: &'static str,
        reason: &'static str,
        message: impl Into<Cow<'static, str>>,
    ) -> Self {
        crate::diagnostics::record_reason(subsystem, "error", "runtime_unavailable", reason);
        Self::RuntimeUnavailable(message.into())
    }

    pub fn database(message: impl Into<Cow<'static, str>>) -> Self {
        Self::Database(message.into())
    }

    pub fn io(message: impl Into<Cow<'static, str>>) -> Self {
        Self::Io(message.into())
    }

    pub fn state_unavailable(
        subsystem: &'static str,
        message: impl Into<Cow<'static, str>>,
    ) -> Self {
        crate::diagnostics::record_reason(
            subsystem,
            "error",
            "state_lock_unavailable",
            "mutex_or_state_unavailable",
        );
        Self::StateUnavailable(message.into())
    }

    pub fn conflict(message: impl Into<Cow<'static, str>>) -> Self {
        Self::Conflict(message.into())
    }

    pub fn task_aborted(subsystem: &'static str, message: impl Into<Cow<'static, str>>) -> Self {
        crate::diagnostics::record_reason(
            subsystem,
            "error",
            "task_aborted",
            "blocking_worker_join_failed",
        );
        Self::TaskAborted(message.into())
    }
}

impl fmt::Display for DesktopError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message())
    }
}

impl std::error::Error for DesktopError {}

impl Serialize for DesktopError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.message())
    }
}

impl Deref for DesktopError {
    type Target = str;

    fn deref(&self) -> &str {
        self.message()
    }
}

impl AsRef<str> for DesktopError {
    fn as_ref(&self) -> &str {
        self.message()
    }
}

impl PartialEq<&str> for DesktopError {
    fn eq(&self, other: &&str) -> bool {
        self.message() == *other
    }
}

impl PartialEq<str> for DesktopError {
    fn eq(&self, other: &str) -> bool {
        self.message() == other
    }
}

impl PartialEq<String> for DesktopError {
    fn eq(&self, other: &String) -> bool {
        self.message() == other.as_str()
    }
}

impl From<&'static str> for DesktopError {
    fn from(message: &'static str) -> Self {
        Self::Validation(Cow::Borrowed(message))
    }
}

impl From<String> for DesktopError {
    fn from(message: String) -> Self {
        Self::Validation(Cow::Owned(message))
    }
}

pub(crate) async fn run_blocking<T, F>(
    subsystem: &'static str,
    abort_message: &'static str,
    work: F,
) -> DesktopResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> DesktopResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| DesktopError::task_aborted(subsystem, abort_message))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "shipmate-err-{tag}-{}-{unique}",
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
    fn variants_preserve_exact_ipc_serialization_and_classification() {
        let temp = TempDir::new("serialize");
        crate::diagnostics::with_test_sink(temp.0.clone(), || {
            let cases = [
                (
                    DesktopError::unauthorized("此窗口不能调用本机能力。"),
                    "unauthorized",
                    "此窗口不能调用本机能力。",
                ),
                (
                    DesktopError::validation("项目编号无效。"),
                    "validation",
                    "项目编号无效。",
                ),
                (
                    DesktopError::runtime_unavailable(
                        "runtime",
                        "missing_node",
                        "应用运行时缺失，请重新安装应用。",
                    ),
                    "runtime_unavailable",
                    "应用运行时缺失，请重新安装应用。",
                ),
                (
                    DesktopError::database("无法读写项目存储，请重试。"),
                    "database",
                    "无法读写项目存储，请重试。",
                ),
                (
                    DesktopError::io("无法读取项目文件。"),
                    "io",
                    "无法读取项目文件。",
                ),
                (
                    DesktopError::state_unavailable("project_store", "项目存储状态不可用。"),
                    "state_unavailable",
                    "项目存储状态不可用。",
                ),
                (
                    DesktopError::conflict("项目已改变，请刷新重试。"),
                    "conflict",
                    "项目已改变，请刷新重试。",
                ),
                (
                    DesktopError::task_aborted("project_store", "后台任务意外退出，请重试。"),
                    "task_aborted",
                    "后台任务意外退出，请重试。",
                ),
            ];

            for (err, expected_kind, expected_text) in cases {
                assert_eq!(err.kind(), expected_kind);
                assert_eq!(err.to_string(), expected_text);
                assert_eq!(err, expected_text);
                assert!(err.contains(&expected_text[..3]));
                assert_eq!(
                    serde_json::to_value(&err).unwrap(),
                    serde_json::Value::String(expected_text.to_string())
                );
            }

            let log = fs::read_to_string(temp.0.join("diagnostics").join("desktop-events.jsonl"))
                .unwrap();
            assert!(log.contains("\"code\":\"runtime_unavailable\""));
            assert!(log.contains("\"code\":\"state_lock_unavailable\""));
            assert!(log.contains("\"code\":\"task_aborted\""));
        });
    }

    #[test]
    fn run_blocking_propagates_results_and_maps_panics_to_task_aborted() {
        let temp = TempDir::new("blocking");
        crate::diagnostics::with_test_sink(temp.0.clone(), || {
            let ok = tauri::async_runtime::block_on(run_blocking(
                "project_store",
                "项目操作异常退出，请重试。",
                || Ok(42usize),
            ))
            .unwrap();
            assert_eq!(ok, 42);

            let domain_err = tauri::async_runtime::block_on(run_blocking::<(), _>(
                "project_store",
                "项目操作异常退出，请重试。",
                || Err(DesktopError::conflict("项目已改变，请刷新重试。")),
            ))
            .unwrap_err();
            assert_eq!(domain_err.kind(), "conflict");
            assert_eq!(domain_err, "项目已改变，请刷新重试。");

            let panicked = tauri::async_runtime::block_on(run_blocking::<(), _>(
                "project_store",
                "项目操作异常退出，请重试。",
                || panic!("synthetic-secret-panic-payload-98765"),
            ))
            .unwrap_err();
            assert_eq!(
                panicked,
                DesktopError::TaskAborted(Cow::Borrowed("项目操作异常退出，请重试。"))
            );
            assert_eq!(panicked.to_string(), "项目操作异常退出，请重试。");

            let log = fs::read_to_string(temp.0.join("diagnostics").join("desktop-events.jsonl"))
                .unwrap();
            assert!(log.contains("\"code\":\"task_aborted\""));
            assert!(!log.contains("synthetic-secret-panic-payload-98765"));
        });
    }

    #[test]
    fn sqlite_and_tool_failure_classifications_preserve_kinds_and_codes() {
        use crate::{project_store::db_error, tool_runner::ToolFailure};
        use rusqlite::{ffi, Error as SqlError, ErrorCode};

        let temp = TempDir::new("classify");
        crate::diagnostics::with_test_sink(temp.0.clone(), || {
            let mk_sql = |code: ErrorCode| {
                SqlError::SqliteFailure(
                    ffi::Error {
                        code,
                        extended_code: code as i32,
                    },
                    None,
                )
            };
            assert_eq!(db_error(mk_sql(ErrorCode::DatabaseBusy)).kind(), "conflict");
            assert_eq!(
                db_error(mk_sql(ErrorCode::DatabaseLocked)).kind(),
                "conflict"
            );
            assert_eq!(db_error(mk_sql(ErrorCode::DiskFull)).kind(), "io");
            assert_eq!(db_error(mk_sql(ErrorCode::ReadOnly)).kind(), "io");
            assert_eq!(db_error(mk_sql(ErrorCode::PermissionDenied)).kind(), "io");
            assert_eq!(db_error(mk_sql(ErrorCode::CannotOpen)).kind(), "io");
            assert_eq!(db_error(mk_sql(ErrorCode::SystemIoFailure)).kind(), "io");
            assert_eq!(
                db_error(mk_sql(ErrorCode::DatabaseCorrupt)).kind(),
                "database"
            );
            assert_eq!(db_error(mk_sql(ErrorCode::NotADatabase)).kind(), "database");

            let canceled = ToolFailure::Canceled;
            assert_eq!(canceled.code(), "canceled");
            assert_eq!(DesktopError::from(canceled).kind(), "conflict");

            let timed_out = ToolFailure::TimedOut;
            assert_eq!(timed_out.code(), "tool_timeout");
            assert_eq!(DesktopError::from(timed_out).kind(), "io");

            let busy = ToolFailure::Busy;
            assert_eq!(busy.code(), "busy");
            assert_eq!(DesktopError::from(busy).kind(), "conflict");

            let inner = DesktopError::runtime_unavailable(
                "runtime",
                "missing_node",
                "应用运行时缺失，请重新安装应用。",
            );
            let failed = ToolFailure::from(inner.clone());
            assert_eq!(failed.code(), "tool_failed");
            assert_eq!(DesktopError::from(failed), inner);
        });
    }

    #[test]
    fn concurrent_blocking_tasks_and_cancellation_race_cleanly() {
        let runner = crate::tool_runner::ToolRunner::default();
        tauri::async_runtime::block_on(async {
            for idx in 0..16 {
                let run_id = format!("t13b-race-{idx}");
                let guard = runner.reserve_guard(&run_id).unwrap();
                let r1 = runner.clone();
                let id1 = run_id.clone();
                let cancel_task = tauri::async_runtime::spawn(async move {
                    r1.cancel(&id1).unwrap();
                });
                let r2 = runner.clone();
                let worker = run_blocking(
                    "tool_runner",
                    "本地工具任务意外退出。",
                    move || {
                        let _guard = guard;
                        r2.cancel(&run_id)
                    },
                );
                cancel_task.await.unwrap();
                worker.await.unwrap();
            }
        });
    }
}
