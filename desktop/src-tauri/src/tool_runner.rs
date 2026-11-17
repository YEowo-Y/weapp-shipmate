use std::{
    io::Read,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

const OUTPUT_LIMIT: usize = 2 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);

/// Machine-readable termination, separate from localized user-facing diagnostics.
#[derive(Clone, Debug)]
pub enum ToolFailure {
    Canceled,
    TimedOut,
    Busy,
    Failed(crate::error::DesktopError),
}
impl ToolFailure {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Canceled => "canceled",
            Self::TimedOut => "tool_timeout",
            Self::Busy => "busy",
            Self::Failed(_) => "tool_failed",
        }
    }
    pub fn into_desktop_error(self) -> crate::error::DesktopError {
        match self {
            Self::Canceled => crate::error::DesktopError::conflict("已停止本地工具。"),
            Self::TimedOut => {
                crate::error::DesktopError::io("本地工具运行超时，请缩小检查范围后重试。")
            }
            Self::Busy => {
                crate::error::DesktopError::conflict("已有本地工具正在运行，请先停止或等待完成。")
            }
            Self::Failed(error) => error,
        }
    }
}
impl std::fmt::Display for ToolFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Canceled => formatter.write_str("已停止本地工具。"),
            Self::TimedOut => formatter.write_str("本地工具运行超时，请缩小检查范围后重试。"),
            Self::Busy => formatter.write_str("已有本地工具正在运行，请先停止或等待完成。"),
            Self::Failed(error) => formatter.write_str(error.message()),
        }
    }
}
impl From<crate::error::DesktopError> for ToolFailure {
    fn from(value: crate::error::DesktopError) -> Self {
        Self::Failed(value)
    }
}
impl From<ToolFailure> for crate::error::DesktopError {
    fn from(value: ToolFailure) -> Self {
        value.into_desktop_error()
    }
}
impl From<String> for ToolFailure {
    fn from(value: String) -> Self {
        Self::Failed(crate::error::DesktopError::from(value))
    }
}
impl From<&'static str> for ToolFailure {
    fn from(value: &'static str) -> Self {
        Self::Failed(crate::error::DesktopError::from(value))
    }
}

#[derive(Clone, Default)]
pub struct ToolRunner(Arc<Inner>);
#[derive(Default)]
struct Inner {
    active: Mutex<Option<Active>>,
    closed: AtomicBool,
    next_token: AtomicU64,
}
/// Owns a reservation across preparation/queueing and releases it on every early exit.
pub struct Reservation {
    runner: ToolRunner,
    id: String,
    token: u64,
}
impl Reservation {
    pub(crate) fn run_reserved(
        &self,
        command: Command,
        check: bool,
    ) -> crate::error::DesktopResult<String> {
        self.run_reserved_outcome(command, check)
            .map_err(Into::into)
    }

    pub(crate) fn run_reserved_outcome(
        &self,
        command: Command,
        check: bool,
    ) -> Result<String, ToolFailure> {
        self.runner.execute_inner(
            command,
            self.id.clone(),
            Some(self.token),
            check,
            TIMEOUT,
            false,
        )
    }

    /// Keep this slot cancellable after the child exits, while its output is validated.
    pub(crate) fn run_retained(&self, command: Command) -> Result<String, ToolFailure> {
        self.runner.execute_inner(
            command,
            self.id.clone(),
            Some(self.token),
            false,
            TIMEOUT,
            true,
        )
    }

    /// Linearize a short persistence operation with cancellation and shutdown.
    /// The callback must not call the runner or wait for a process.
    pub(crate) fn commit<T>(
        &self,
        action: impl FnOnce() -> crate::error::DesktopResult<T>,
    ) -> Result<T, ToolFailure> {
        let guard = self.runner.0.active.lock().map_err(|_| {
            crate::error::DesktopError::state_unavailable("tool_runner", "本地工具状态不可用。")
        })?;
        let active = guard
            .as_ref()
            .filter(|active| active.token == self.token && active.id == self.id)
            .ok_or(ToolFailure::Canceled)?;
        if active.cancelled || self.runner.0.closed.load(Ordering::Acquire) {
            return Err(ToolFailure::Canceled);
        }
        if active.child.is_some() {
            return Err(
                crate::error::DesktopError::conflict("工具尚未完成，不能保存结果。").into(),
            );
        }
        action().map_err(ToolFailure::Failed)
    }
}
impl Drop for Reservation {
    fn drop(&mut self) {
        drop(Lease {
            runner: &self.runner,
            token: self.token,
        });
    }
}
struct Active {
    id: String,
    token: u64,
    child: Option<Child>,
    cancelled: bool,
}
struct Lease<'a> {
    runner: &'a ToolRunner,
    token: u64,
}
impl Drop for Lease<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.runner.0.active.lock() {
            if active.as_ref().is_some_and(|a| a.token == self.token) {
                if let Some(mut child) = active.take().and_then(|a| a.child) {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }
}

pub fn subject(value: &str) -> crate::error::DesktopResult<()> {
    if ["personal", "individual_business", "enterprise"].contains(&value) {
        Ok(())
    } else {
        Err(crate::error::DesktopError::validation(
            "请选择有效的主体类型。",
        ))
    }
}
pub fn directory(value: &str) -> crate::error::DesktopResult<PathBuf> {
    if value.trim().is_empty() {
        return Err(crate::error::DesktopError::validation(
            "请先选择小程序项目文件夹。",
        ));
    }
    let path = PathBuf::from(value)
        .canonicalize()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => {
                crate::error::DesktopError::io("项目文件夹不存在，请重新选择。")
            }
            std::io::ErrorKind::PermissionDenied => {
                crate::error::DesktopError::io("没有访问项目文件夹的权限，请选择可访问的文件夹。")
            }
            _ => crate::error::DesktopError::io("无法读取项目文件夹，请检查路径后重试。"),
        })?;
    if !path.is_dir() {
        return Err(crate::error::DesktopError::validation(
            "请选择文件夹，不能选择文件。",
        ));
    }
    Ok(path)
}
fn diagnostic(stderr: &[u8]) -> String {
    // Plain text only: discard terminal/control and bidi formatting, cap user-facing detail.
    let text = String::from_utf8_lossy(&stderr[..stderr.len().min(8192)]);
    let mut characters = text.chars().filter(|c| {
        (!c.is_control() || matches!(c, '\n' | '\t'))
            && !matches!(c, '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
    });
    let detail: String = characters.by_ref().take(1024).collect();
    let truncated = characters.next().is_some() || stderr.len() > 8192;
    format!(
        "{}{}",
        detail.trim(),
        if truncated {
            "…（错误详情已截断）"
        } else {
            ""
        }
    )
}
fn report(
    code: Option<i32>,
    check: bool,
    output: Vec<u8>,
    stderr: &[u8],
) -> crate::error::DesktopResult<String> {
    if !(code == Some(0) || check && code == Some(2)) {
        let status = code.map_or_else(
            || "进程异常终止".to_string(),
            |code| format!("退出码 {code}"),
        );
        let detail = diagnostic(stderr);
        return Err(crate::error::DesktopError::io(format!(
            "本地工具执行失败（{status}）。{}",
            if detail.is_empty() {
                "未提供错误详情，请重试。".to_string()
            } else {
                format!("\n{detail}")
            }
        )));
    }
    let text = String::from_utf8(output)
        .map_err(|_| crate::error::DesktopError::io("本地工具返回了无效文本。"))?;
    if text.trim().is_empty() {
        return Err(crate::error::DesktopError::io(
            "本地工具没有返回报告，请重试。",
        ));
    }
    Ok(text)
}
fn drain(mut pipe: impl Read, overflow: Arc<AtomicBool>) -> crate::error::DesktopResult<Vec<u8>> {
    let mut output = Vec::new();
    pipe.by_ref()
        .take((OUTPUT_LIMIT + 1) as u64)
        .read_to_end(&mut output)
        .map_err(|_| crate::error::DesktopError::io("读取本地工具输出失败。"))?;
    if output.len() > OUTPUT_LIMIT {
        overflow.store(true, Ordering::Release);
        return Err(crate::error::DesktopError::validation(
            "本地工具报告过大，请缩小检查范围。",
        ));
    }
    Ok(output)
}
impl ToolRunner {
    pub fn cancel(&self, id: &str) -> crate::error::DesktopResult<()> {
        if !crate::runtime::valid_id(id) {
            return Err(crate::error::DesktopError::validation("运行编号无效。"));
        }
        let mut active = self.0.active.lock().map_err(|_| {
            crate::error::DesktopError::state_unavailable("tool_runner", "本地工具状态不可用。")
        })?;
        if let Some(active) = active.as_mut().filter(|a| a.id == id) {
            active.cancelled = true;
            if let Some(child) = active.child.as_mut() {
                let _ = child.kill();
            }
        }
        Ok(())
    }
    pub fn shutdown(&self) {
        if let Ok(mut active) = self.0.active.lock() {
            self.0.closed.store(true, Ordering::Release);
            if let Some(active) = active.as_mut() {
                active.cancelled = true;
                if let Some(child) = active.child.as_mut() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        } else {
            self.0.closed.store(true, Ordering::Release);
        }
    }
    #[cfg(test)]
    pub fn reserve(&self, id: &str) -> crate::error::DesktopResult<()> {
        self.reserve_outcome(id).map(|_| ()).map_err(Into::into)
    }
    fn reserve_outcome(&self, id: &str) -> Result<u64, ToolFailure> {
        if !crate::runtime::valid_id(id) {
            return Err(crate::error::DesktopError::validation("运行编号无效。").into());
        }
        let mut active = self.0.active.lock().map_err(|_| {
            crate::error::DesktopError::state_unavailable("tool_runner", "本地工具状态不可用。")
        })?;
        if self.0.closed.load(Ordering::Acquire) {
            return Err(crate::error::DesktopError::state_unavailable(
                "tool_runner",
                "应用正在退出。",
            )
            .into());
        }
        if active.is_some() {
            return Err(ToolFailure::Busy);
        }
        let token = self.0.next_token.fetch_add(1, Ordering::Relaxed) + 1;
        *active = Some(Active {
            id: id.to_owned(),
            token,
            child: None,
            cancelled: false,
        });
        Ok(token)
    }
    pub fn reserve_guard(&self, id: &str) -> crate::error::DesktopResult<Reservation> {
        self.reserve_guard_outcome(id).map_err(Into::into)
    }
    pub fn reserve_guard_outcome(&self, id: &str) -> Result<Reservation, ToolFailure> {
        let token = self.reserve_outcome(id)?;
        Ok(Reservation {
            runner: self.clone(),
            id: id.into(),
            token,
        })
    }
    #[cfg(test)]
    pub fn run_reserved(
        &self,
        command: Command,
        id: String,
        check: bool,
    ) -> crate::error::DesktopResult<String> {
        self.run_reserved_outcome(command, id, check)
            .map_err(Into::into)
    }
    #[cfg(test)]
    pub fn run_reserved_outcome(
        &self,
        command: Command,
        id: String,
        check: bool,
    ) -> Result<String, ToolFailure> {
        self.execute(command, id, check, TIMEOUT)
    }
    #[cfg(test)]
    fn run(
        &self,
        command: Command,
        id: String,
        check: bool,
    ) -> crate::error::DesktopResult<String> {
        self.run_with_timeout(command, id, check, TIMEOUT)
    }
    #[cfg(test)]
    fn run_with_timeout(
        &self,
        command: Command,
        id: String,
        check: bool,
        timeout: Duration,
    ) -> crate::error::DesktopResult<String> {
        self.reserve(&id)?;
        self.execute(command, id, check, timeout)
            .map_err(Into::into)
    }
    #[cfg(test)]
    fn execute(
        &self,
        command: Command,
        id: String,
        check: bool,
        timeout: Duration,
    ) -> Result<String, ToolFailure> {
        self.execute_inner(command, id, None, check, timeout, false)
    }
    fn execute_inner(
        &self,
        mut command: Command,
        id: String,
        expected_token: Option<u64>,
        check: bool,
        timeout: Duration,
        retained: bool,
    ) -> Result<String, ToolFailure> {
        let mut lease = None;
        let (slot_token, stdout, stderr) = {
            // Spawn under the same lock used by shutdown, so shutdown cannot miss a new child.
            let mut active = self.0.active.lock().map_err(|_| {
                crate::error::DesktopError::state_unavailable("tool_runner", "本地工具状态不可用。")
            })?;
            let active = active
                .as_mut()
                .filter(|a| a.id == id && expected_token.is_none_or(|t| a.token == t))
                .ok_or_else(|| {
                    crate::error::DesktopError::state_unavailable(
                        "tool_runner",
                        "本地工具状态不可用。",
                    )
                })?;
            let slot_token = active.token;
            if !retained {
                lease = Some(Lease {
                    runner: self,
                    token: slot_token,
                });
            }
            if active.cancelled {
                return Err(ToolFailure::Canceled);
            }
            let child = command
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|_| {
                    crate::error::DesktopError::io("无法启动内置工具，请修复或重新安装应用。")
                })?;
            active.child = Some(child);
            let child = active.child.as_mut().unwrap();
            (
                slot_token,
                child
                    .stdout
                    .take()
                    .ok_or_else(|| crate::error::DesktopError::io("工具输出通道不可用。"))?,
                child
                    .stderr
                    .take()
                    .ok_or_else(|| crate::error::DesktopError::io("工具错误通道不可用。"))?,
            )
        };
        let overflow = Arc::new(AtomicBool::new(false));
        let stdout_limit = overflow.clone();
        let stderr_limit = overflow.clone();
        let stdout = std::thread::spawn(move || drain(stdout, stdout_limit));
        let stderr = std::thread::spawn(move || drain(stderr, stderr_limit));
        let start = Instant::now();
        let outcome = loop {
            let state = self
                .0
                .active
                .lock()
                .map_err(|_| {
                    ToolFailure::from(crate::error::DesktopError::state_unavailable(
                        "tool_runner",
                        "本地工具状态不可用。",
                    ))
                })
                .and_then(|mut active| {
                    let active = active
                        .as_mut()
                        .filter(|a| a.token == slot_token)
                        .ok_or_else(|| {
                            crate::error::DesktopError::state_unavailable(
                                "tool_runner",
                                "本地工具状态不可用。",
                            )
                        })?;
                    if active.cancelled {
                        return Err(ToolFailure::Canceled);
                    }
                    if overflow.load(Ordering::Acquire) {
                        return Err(crate::error::DesktopError::validation(
                            "本地工具报告过大，请缩小检查范围。",
                        )
                        .into());
                    }
                    if start.elapsed() >= timeout {
                        return Err(ToolFailure::TimedOut);
                    }
                    active
                        .child
                        .as_mut()
                        .ok_or_else(|| {
                            crate::error::DesktopError::state_unavailable(
                                "tool_runner",
                                "工具进程不可用。",
                            )
                        })?
                        .try_wait()
                        .map_err(|_| {
                            crate::error::DesktopError::io("无法读取工具退出状态。").into()
                        })
                });
            match state {
                Ok(Some(status)) => break Ok(status.code()),
                Err(error) => break Err(error),
                Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            }
        };
        // Reap before joining readers, but keep retained slots cancellable until commit/drop.
        if retained {
            if let Ok(mut active) = self.0.active.lock() {
                if let Some(mut child) = active
                    .as_mut()
                    .filter(|active| active.token == slot_token)
                    .and_then(|active| active.child.take())
                {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
        drop(lease);
        let output = stdout.join().map_err(|_| {
            crate::error::DesktopError::task_aborted("tool_runner", "工具输出读取失败。")
        });
        let error_output = stderr.join().map_err(|_| {
            crate::error::DesktopError::task_aborted("tool_runner", "工具错误读取失败。")
        });
        let code = outcome?;
        let output = output??;
        let error_output = error_output??;
        report(code, check, output, &error_output).map_err(ToolFailure::Failed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retained_process_output_stays_busy_and_cancellable_until_persistence() {
        for shutdown in [false, true] {
            let runner = ToolRunner::default();
            let reservation = runner.reserve_guard("source-check").unwrap();
            let (ready_tx, ready_rx) = std::sync::mpsc::channel();
            let (continue_tx, continue_rx) = std::sync::mpsc::channel();
            let worker = std::thread::spawn(move || {
                reservation.run_retained(fixture("success")).unwrap();
                ready_tx.send(()).unwrap();
                continue_rx.recv().unwrap();
                reservation.commit(|| panic!("canceled result must not be committed"))
            });
            ready_rx.recv().unwrap();
            assert!(matches!(
                runner.reserve_guard_outcome("overlap"),
                Err(ToolFailure::Busy)
            ));
            assert!(runner
                .0
                .active
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .child
                .is_none());
            if shutdown {
                runner.shutdown();
            } else {
                runner.cancel("source-check").unwrap();
            }
            continue_tx.send(()).unwrap();
            let outcome: Result<(), _> = worker.join().unwrap();
            assert!(matches!(outcome, Err(ToolFailure::Canceled)));
            assert!(runner.0.active.lock().unwrap().is_none());
            if !shutdown {
                assert!(runner.reserve_guard("retry").is_ok());
            }
        }
    }

    #[test]
    fn retained_commit_and_failures_release_reservation_without_releasing_lock_early() {
        let runner = ToolRunner::default();
        {
            let reservation = runner.reserve_guard("successful").unwrap();
            reservation.run_retained(fixture("success")).unwrap();
            assert_eq!(
                reservation
                    .commit(|| {
                        assert!(runner.0.active.try_lock().is_err());
                        Ok(42)
                    })
                    .unwrap(),
                42
            );
        }
        {
            let reservation = runner.reserve_guard("storage-failed").unwrap();
            reservation.run_retained(fixture("success")).unwrap();
            assert!(matches!(
                reservation.commit::<()>(|| Err("storage unavailable".into())),
                Err(ToolFailure::Failed(_))
            ));
        }
        {
            let reservation = runner.reserve_guard("process-failed").unwrap();
            assert!(reservation.run_retained(fixture("failure")).is_err());
        }
        {
            let reservation = runner.reserve_guard("spawn-failed").unwrap();
            assert!(reservation
                .run_retained(Command::new("missing-source-checker-executable"))
                .is_err());
        }
        assert!(runner.reserve_guard("recovered").is_ok());
    }

    #[test]
    fn typed_busy_and_timeout_codes_never_depend_on_diagnostics() {
        let runner = ToolRunner::default();
        let reservation = runner.reserve_guard_outcome("first").unwrap();
        assert!(matches!(
            runner.reserve_guard_outcome("second"),
            Err(ToolFailure::Busy)
        ));
        drop(reservation);
        let reservation = runner.reserve_guard_outcome("timeout-code").unwrap();
        let error = runner
            .execute(
                fixture("hang"),
                "timeout-code".into(),
                false,
                Duration::from_millis(40),
            )
            .unwrap_err();
        assert!(matches!(error, ToolFailure::TimedOut));
        assert_eq!(error.code(), "tool_timeout");
        drop(reservation);
        assert!(runner.reserve_guard_outcome("recovered").is_ok());
        assert_eq!(ToolFailure::Busy.code(), "busy");
        assert_eq!(
            ToolFailure::Failed("tool_timeout C:/secret/token".into()).code(),
            "tool_failed"
        );
        assert_eq!(ToolFailure::from("已停止本地工具。").code(), "tool_failed");
    }
    fn fixture(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "tool_runner::tests::process_fixture",
                "--nocapture",
            ])
            .env("SHIPMATE_RUST_PROCESS_FIXTURE", mode);
        command
    }
    #[test]
    fn cancellation_during_preparation_never_launches_and_guard_releases_on_error() {
        let runner = ToolRunner::default();
        let reservation = runner.reserve_guard("preparing").unwrap();
        let worker_runner = runner.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (continue_tx, continue_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _reservation = reservation;
            ready_tx.send(()).unwrap();
            continue_rx.recv().unwrap();
            worker_runner.run_reserved_outcome(
                Command::new("missing-executable-must-not-launch"),
                "preparing".into(),
                false,
            )
        });
        ready_rx.recv().unwrap();
        runner.cancel("preparing").unwrap();
        continue_tx.send(()).unwrap();
        assert!(matches!(worker.join().unwrap(), Err(ToolFailure::Canceled)));
        let early_exit = runner.reserve_guard("early-exit").unwrap();
        drop(early_exit);
        assert!(runner.reserve_guard("next").is_ok());
    }
    #[test]
    fn typed_cancellation_does_not_depend_on_error_text() {
        let runner = ToolRunner::default();
        runner.reserve("typed-stop").unwrap();
        runner.cancel("typed-stop").unwrap();
        assert!(matches!(
            runner.run_reserved_outcome(fixture("slow"), "typed-stop".into(), false),
            Err(ToolFailure::Canceled)
        ));
        assert!(matches!(
            ToolFailure::from("已停止本地工具。"),
            ToolFailure::Failed(_)
        ));
    }
    #[test]
    fn process_fixture() {
        match std::env::var("SHIPMATE_RUST_PROCESS_FIXTURE").as_deref() {
            Ok("hang") => std::thread::sleep(Duration::from_secs(60)),
            Ok("failure") => {
                println!("misleading success report");
                eprintln!("Cannot find package js-yaml");
                std::process::exit(1);
            }
            Ok("overflow") => {
                print!("{}", "x".repeat(OUTPUT_LIMIT + 10));
            }
            _ => {}
        }
    }
    #[test]
    fn process_timeout_and_output_limit_reap_and_allow_retry() {
        let runner = ToolRunner::default();
        let start = Instant::now();
        assert!(runner
            .run_with_timeout(
                fixture("hang"),
                "timeout".into(),
                false,
                Duration::from_millis(100)
            )
            .unwrap_err()
            .contains("超时"));
        assert!(start.elapsed() < Duration::from_secs(5));
        assert!(runner.0.active.lock().unwrap().is_none());
        assert!(runner
            .run(fixture("overflow"), "overflow".into(), false)
            .unwrap_err()
            .contains("过大"));
        assert!(runner
            .run(fixture("success"), "retry".into(), false)
            .is_ok());
    }
    #[test]
    fn active_process_cancellation_and_shutdown_reap() {
        for shutdown in [false, true] {
            let runner = ToolRunner::default();
            let worker = runner.clone();
            let handle =
                std::thread::spawn(move || worker.run(fixture("hang"), "running".into(), false));
            let start = Instant::now();
            while runner
                .0
                .active
                .lock()
                .unwrap()
                .as_ref()
                .is_none_or(|a| a.child.is_none())
            {
                assert!(start.elapsed() < Duration::from_secs(5));
                std::thread::sleep(Duration::from_millis(5));
            }
            runner.cancel("stale").unwrap();
            assert!(runner
                .run(fixture("success"), "concurrent".into(), false)
                .unwrap_err()
                .contains("已有"));
            if shutdown {
                runner.shutdown();
            } else {
                runner.cancel("running").unwrap();
            }
            assert!(handle.join().unwrap().unwrap_err().contains("停止"));
            assert!(runner.0.active.lock().unwrap().is_none());
            if shutdown {
                assert!(runner
                    .run(fixture("success"), "after".into(), false)
                    .unwrap_err()
                    .contains("退出"));
            }
        }
    }
    #[test]
    fn exit_status_overrides_stdout() {
        assert!(report(Some(0), false, b"report".to_vec(), &[]).is_ok());
        assert!(report(Some(2), true, b"blockers".to_vec(), &[]).is_ok());
        for code in [Some(1), Some(3), None] {
            assert!(report(code, true, b"looks successful".to_vec(), &[]).is_err());
        }
        assert!(report(Some(2), false, b"bad guide".to_vec(), &[]).is_err());
        assert!(report(Some(0), true, vec![], &[]).is_err());
        assert!(report(Some(0), true, vec![255], &[]).is_err());
    }
    #[test]
    fn failures_preserve_bounded_diagnostics_not_stdout() {
        let failure = ToolRunner::default()
            .run(fixture("failure"), "failed".into(), true)
            .unwrap_err();
        assert!(failure.contains("退出码 1"));
        assert!(failure.contains("Cannot find package js-yaml"));
        assert!(!failure.contains("misleading success report"));
        let error = report(None, false, vec![], b"signal failure").unwrap_err();
        assert!(error.contains("进程异常终止"));
        assert!(error.contains("signal failure"));
        let detail = diagnostic(format!("error\0\u{202e}{}", "细".repeat(9000)).as_bytes());
        assert!(!detail.contains('\0'));
        assert!(!detail.contains('\u{202e}'));
        assert!(detail.contains("已截断"));
        assert!(detail.chars().count() < 1100);
    }
    #[test]
    fn validates_inputs_and_bounds_output() {
        for value in ["personal", "individual_business", "enterprise"] {
            assert!(subject(value).is_ok());
        }
        assert!(subject("--help").is_err());
        assert!(directory("").is_err());
        assert!(directory("Cargo.toml").is_err());
        let overflow = Arc::new(AtomicBool::new(false));
        assert!(drain(&vec![b'x'; OUTPUT_LIMIT + 1][..], overflow.clone()).is_err());
        assert!(overflow.load(Ordering::Acquire));
    }
    #[test]
    fn stale_cancellation_cannot_stop_another_run() {
        let runner = ToolRunner::default();
        *runner.0.active.lock().unwrap() = Some(Active {
            id: "new".into(),
            token: 1,
            child: None,
            cancelled: false,
        });
        runner.cancel("old").unwrap();
        assert!(!runner.0.active.lock().unwrap().as_ref().unwrap().cancelled);
        runner.cancel("new").unwrap();
        assert!(runner.0.active.lock().unwrap().as_ref().unwrap().cancelled);
        runner.shutdown();
        assert!(runner.0.closed.load(Ordering::Acquire));
    }
    #[test]
    fn stop_before_worker_starts_does_not_launch_process() {
        let runner = ToolRunner::default();
        runner.reserve("queued").unwrap();
        runner.cancel("queued").unwrap();
        assert!(runner
            .run_reserved(fixture("hang"), "queued".into(), false)
            .unwrap_err()
            .contains("停止"));
        assert!(runner.0.active.lock().unwrap().is_none());
    }
    #[test]
    fn dropping_completed_reservation_does_not_evict_reused_run_id() {
        let runner = ToolRunner::default();
        let res1 = runner.reserve_guard("reused-run").unwrap();
        res1.run_reserved(fixture("success"), false).unwrap();
        let res2 = runner.reserve_guard("reused-run").unwrap();
        drop(res1);
        assert_eq!(res2.commit(|| Ok("ok")).unwrap(), "ok");
        drop(res2);

        let res3 = runner.reserve_guard("reused-run-legacy").unwrap();
        runner
            .run_reserved(fixture("success"), "reused-run-legacy".into(), false)
            .unwrap();
        let res4 = runner.reserve_guard("reused-run-legacy").unwrap();
        drop(res3);
        assert_eq!(res4.commit(|| Ok("ok")).unwrap(), "ok");
    }
}
