//! Opt-in, current-project file maintenance. No project scripts or model requests run here.
use crate::project_store::{
    artifact, compare_artifacts, db_error, decode, encode, id, now, project,
    validate_agent_project, Artifact, Project, ProjectStore,
};
use crate::tool_runner::{ToolFailure, ToolRunner};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    io::{BufRead, BufReader, Read},
    process::{Child, ChildStdin, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
static RUN_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Notice {
    pub id: String,
    pub artifact_id: String,
    pub created_at: u64,
    pub new_count: usize,
    pub read: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Settings {
    schema_version: u32,
    pub project_id: String,
    pub revision: u64,
    pub watch_enabled: bool,
    pub notifications_enabled: bool,
    baseline_artifact_id: Option<String>,
    pub last_checked_at: Option<u64>,
    pub notices: Vec<Notice>,
    seen_rule_ids: Vec<String>,
}
impl Settings {
    fn new(project_id: &str) -> Self {
        Self {
            schema_version: 1,
            project_id: project_id.into(),
            revision: 0,
            watch_enabled: false,
            notifications_enabled: false,
            baseline_artifact_id: None,
            last_checked_at: None,
            notices: vec![],
            seen_rule_ids: vec![],
        }
    }
}
fn write_settings(c: &Connection, value: &Settings) -> crate::error::DesktopResult<()> {
    c.execute(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![format!("project_maintenance:{}", value.project_id), encode(value)?],
    ).map_err(db_error)?;
    Ok(())
}
pub(crate) fn read_settings(
    c: &Connection,
    project_id: &str,
) -> crate::error::DesktopResult<Settings> {
    id(project_id)?;
    let raw: Option<Option<String>> = c.query_row(
        "SELECT CASE WHEN length(CAST(value AS BLOB))<=262144 THEN value ELSE NULL END FROM settings WHERE key=?",
        [format!("project_maintenance:{project_id}")], |r| r.get(0),
    ).optional().map_err(db_error)?;
    let value: Settings = match raw {
        None => Settings::new(project_id),
        Some(Some(raw)) => decode(raw)?,
        Some(None) => {
            return Err(crate::error::DesktopError::database(
                "项目维护设置损坏或超过上限，请保留数据库并检查备份。",
            ))
        }
    };
    if value.schema_version != 1
        || value.project_id != project_id
        || value.revision > 9_007_199_254_740_991
        || value.notices.len() > 50
        || value.seen_rule_ids.len() > 512
        || value
            .seen_rule_ids
            .iter()
            .any(|s| s.is_empty() || s.len() > 256 || s.chars().any(char::is_control))
    {
        return Err(crate::error::DesktopError::database(
            "项目维护设置的版本或所属项目无效。",
        ));
    }
    let mut ids = HashSet::new();
    for notice in &value.notices {
        id(&notice.id)?;
        id(&notice.artifact_id)?;
        if !ids.insert(&notice.id) || notice.new_count == 0 || notice.new_count > 512 {
            return Err(crate::error::DesktopError::database("项目通知记录无效。"));
        }
    }
    if let Some(baseline) = &value.baseline_artifact_id {
        id(baseline)?;
    }
    Ok(value)
}
fn initialize_baseline(c: &Connection, value: &mut Settings) -> crate::error::DesktopResult<()> {
    if value.baseline_artifact_id.is_none() {
        let data: Option<String> = c.query_row(
            "SELECT a.data FROM artifacts a JOIN runs r ON r.id=a.run_id WHERE a.project_id=? AND json_extract(a.data,'$.kind')='check' AND r.state='succeeded' ORDER BY a.rowid DESC LIMIT 1",
            [&value.project_id], |r| r.get(0),
        ).optional().map_err(db_error)?;
        if let Some(data) = data {
            let a: Artifact = decode(data)?;
            value.last_checked_at = Some(a.created_at);
            value.baseline_artifact_id = Some(a.id);
        }
    }
    Ok(())
}
pub(crate) fn save_settings(
    c: &mut Connection,
    project_id: &str,
    expected_revision: u64,
    watch: bool,
    notify: bool,
) -> crate::error::DesktopResult<Settings> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    validate_agent_project(&tx, project_id)?;
    let mut value = read_settings(&tx, project_id)?;
    if value.revision != expected_revision {
        return Err(crate::error::DesktopError::conflict(
            "项目维护设置已改变，请刷新后重试。",
        ));
    }
    value.revision = value
        .revision
        .checked_add(1)
        .filter(|v| *v <= 9_007_199_254_740_991)
        .ok_or("项目维护版本超出上限。")?;
    value.watch_enabled = watch;
    value.notifications_enabled = notify;
    initialize_baseline(&tx, &mut value)?;
    write_settings(&tx, &value)?;
    tx.commit().map_err(db_error)?;
    Ok(value)
}
pub(crate) fn mark_read(
    c: &mut Connection,
    project_id: &str,
    notice_ids: &[String],
) -> crate::error::DesktopResult<Settings> {
    if notice_ids.is_empty() || notice_ids.len() > 50 {
        return Err("请选择 1–50 条通知。".into());
    }
    let mut ids = HashSet::new();
    for notice in notice_ids {
        id(notice)?;
        if !ids.insert(notice) {
            return Err("通知编号不能重复。".into());
        }
    }
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    validate_agent_project(&tx, project_id)?;
    let mut value = read_settings(&tx, project_id)?;
    for notice_id in notice_ids {
        let notice = value
            .notices
            .iter_mut()
            .find(|n| &n.id == notice_id)
            .ok_or_else(|| {
                crate::error::DesktopError::conflict("通知已不在当前项目列表，请刷新后重试。")
            })?;
        notice.read = true;
    }
    write_settings(&tx, &value)?;
    tx.commit().map_err(db_error)?;
    Ok(value)
}
pub(crate) fn record_report(
    c: &mut Connection,
    project_id: &str,
    artifact_id: &str,
) -> crate::error::DesktopResult<Settings> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    validate_agent_project(&tx, project_id)?;
    let p = project(&tx, project_id)?;
    let report = artifact(&tx, artifact_id)?;
    let mut value = read_settings(&tx, project_id)?;
    if report.project_id.as_deref() != Some(project_id)
        || report.kind != "check"
        || report.context_revision != Some(p.context_revision)
        || serde_json::from_str::<serde_json::Value>(&report.input_summary)
            .ok()
            .is_none_or(|v| v["directory"] != p.directory)
    {
        return Ok(value);
    }
    let success: String = tx
        .query_row("SELECT state FROM runs WHERE id=?", [&report.run_id], |r| {
            r.get(0)
        })
        .map_err(db_error)?;
    if success != "succeeded" || value.baseline_artifact_id.as_deref() == Some(artifact_id) {
        return Ok(value);
    }
    let added = if let Some(before) = &value.baseline_artifact_id {
        let ordinal = |id: &str| {
            tx.query_row("SELECT rowid FROM artifacts WHERE id=?", [id], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(db_error)
        };
        // A late completion must never move the baseline backwards or replay old problems.
        if ordinal(before)? >= ordinal(artifact_id)? {
            return Ok(value);
        }
        let comparison = compare_artifacts(&tx, project_id, before, artifact_id)?;
        if comparison["comparable"] == true {
            comparison["added"].as_array().cloned().unwrap_or_default()
        } else {
            vec![]
        }
    } else {
        vec![]
    };
    let mut fresh = Vec::new();
    for row in added {
        let rule_id = row["ruleId"].as_str().unwrap_or_default();
        if !rule_id.is_empty()
            && rule_id.len() <= 256
            && !rule_id.chars().any(char::is_control)
            && !value.seen_rule_ids.iter().any(|s| s == rule_id)
            && !fresh.iter().any(|s| s == rule_id)
        {
            fresh.push(rule_id.to_string());
        }
    }
    if value.notifications_enabled && !fresh.is_empty() {
        let count = fresh.len().min(512);
        value.seen_rule_ids.extend(fresh.into_iter().take(512));
        if value.seen_rule_ids.len() > 512 {
            value.seen_rule_ids.drain(..value.seen_rule_ids.len() - 512);
        }
        value.notices.insert(
            0,
            Notice {
                id: report.id.clone(),
                artifact_id: report.id.clone(),
                created_at: report.created_at,
                new_count: count,
                read: false,
            },
        );
        value.notices.truncate(50);
    }
    value.baseline_artifact_id = Some(report.id);
    value.last_checked_at = Some(report.created_at);
    write_settings(&tx, &value)?;
    tx.commit().map_err(db_error)?;
    Ok(value)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceSnapshot {
    project_id: String,
    revision: u64,
    watch_enabled: bool,
    notifications_enabled: bool,
    state: String,
    message: String,
    run_id: Option<String>,
    last_checked_at: Option<u64>,
    notices: Vec<Notice>,
}
struct WatchProcess {
    child: Child,
    stdin: Option<ChildStdin>,
}
impl Drop for WatchProcess {
    fn drop(&mut self) {
        drop(self.stdin.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
struct Active {
    project: Project,
    settings: Settings,
    generation: u64,
    task_epoch: u64,
    worker: bool,
    dirty: bool,
    run_id: Option<String>,
    state: String,
    message: String,
    notification_error: bool,
    watcher: Option<WatchProcess>,
}
impl Active {
    fn snapshot(&self) -> MaintenanceSnapshot {
        MaintenanceSnapshot {
            project_id: self.project.id.clone(),
            revision: self.settings.revision,
            watch_enabled: self.settings.watch_enabled,
            notifications_enabled: self.settings.notifications_enabled,
            state: self.state.clone(),
            message: self.message.clone(),
            run_id: self.run_id.clone(),
            last_checked_at: self.settings.last_checked_at,
            notices: self.settings.notices.clone(),
        }
    }
    fn same_project(&self, p: &Project) -> bool {
        self.project.id == p.id
            && self.project.directory == p.directory
            && self.project.context_revision == p.context_revision
    }
    fn allows(&self, binding: &RunBinding) -> bool {
        self.generation == binding.generation
            && self.task_epoch == binding.task_epoch
            && self.worker
            && self.settings.watch_enabled
            && self.project.id == binding.project_id
            && self.project.directory == binding.directory
            && self.project.context_revision == binding.context_revision
    }
    fn enqueue(&mut self) -> bool {
        if !self.settings.watch_enabled
            || !matches!(self.state.as_str(), "watching" | "pending" | "checking")
        {
            return false;
        }
        self.dirty = true;
        if self.worker {
            return false;
        }
        self.worker = true;
        self.state = "pending".into();
        self.message = "检测到文件变化，等待本地预检。".into();
        true
    }
    fn halt(&mut self, runner: &ToolRunner) {
        self.task_epoch = self.task_epoch.wrapping_add(1);
        self.worker = false;
        self.dirty = false;
        if let Some(run_id) = self.run_id.take() {
            let _ = runner.cancel(&run_id);
        }
    }
    fn finish(&mut self, result: Result<(), ToolFailure>) {
        self.run_id = None;
        match result {
            Ok(()) if self.notification_error => {
                self.dirty = false;
                self.worker = false;
                self.state = "paused".into();
                self.message =
                    "预检已保存，但通知记录保存失败。自动预检已暂停，请检查本地存储后点击重试。"
                        .into();
            }
            Ok(()) => {
                self.state = if self.dirty { "pending" } else { "watching" }.into();
                self.message = "预检已保存；继续监听文件变化。".into();
                self.worker = self.dirty;
            }
            Err(ToolFailure::Canceled) => {
                self.dirty = false;
                self.worker = false;
                self.state = "watching".into();
                self.message = "已停止本次自动预检，继续监听后续变化。".into();
            }
            Err(error) => {
                self.dirty = false;
                self.worker = false;
                self.state = "paused".into();
                self.message = format!("自动预检已暂停：{error} 请检查后点击重试。");
            }
        }
    }
}
#[derive(Default)]
struct Runtime {
    generation: u64,
    closed: bool,
    current: Option<Active>,
}
#[derive(Clone, Default)]
pub struct ProjectMaintenance(Arc<Mutex<Runtime>>);
#[derive(Clone)]
pub(crate) struct RunBinding {
    generation: u64,
    task_epoch: u64,
    pub project_id: String,
    directory: String,
    context_revision: u64,
}
fn emit(app: &tauri::AppHandle, value: &Active) {
    let _ = app.emit("project-maintenance", value.snapshot());
}

impl ProjectMaintenance {
    pub(crate) fn sync(
        &self,
        app: &tauri::AppHandle,
        force: bool,
    ) -> crate::error::DesktopResult<Option<MaintenanceSnapshot>> {
        let mut runtime = self.0.lock().map_err(|_| {
            crate::error::DesktopError::state_unavailable(
                "project_maintenance",
                "项目维护状态不可用。",
            )
        })?;
        if runtime.closed {
            return Err(crate::error::DesktopError::state_unavailable(
                "project_maintenance",
                "应用正在退出。",
            ));
        }
        let loaded = app.state::<ProjectStore>().access(app, |c| {
            let selected: Option<String> = c
                .query_row(
                    "SELECT value FROM settings WHERE key='active_project'",
                    [],
                    |r| r.get(0),
                )
                .optional()
                .map_err(db_error)?
                .flatten();
            selected
                .map(|project_id| {
                    let p = project(c, &project_id)?;
                    let mut settings = read_settings(c, &project_id)?;
                    initialize_baseline(c, &mut settings)?;
                    Ok::<_, crate::error::DesktopError>((p, settings))
                })
                .transpose()
        });
        let loaded = match loaded {
            Ok(value) => value,
            Err(error) => {
                if let Some(mut old) = runtime.current.take() {
                    old.halt(&app.state::<ToolRunner>());
                    drop(old.watcher.take());
                }
                runtime.generation = runtime.generation.wrapping_add(1);
                return Err(error);
            }
        };
        if let Some((p, settings)) = loaded.as_ref() {
            if let Some(active) = runtime.current.as_mut().filter(|a| {
                !force && a.same_project(p) && a.settings.watch_enabled == settings.watch_enabled
            }) {
                active.settings = settings.clone();
                active.project = p.clone();
                return Ok(Some(active.snapshot()));
            }
        }
        if let Some(mut old) = runtime.current.take() {
            old.halt(&app.state::<ToolRunner>());
            drop(old.watcher.take());
        }
        runtime.generation = runtime.generation.wrapping_add(1);
        let Some((p, settings)) = loaded else {
            return Ok(None);
        };
        let generation = runtime.generation;
        let mut active = Active {
            project: p,
            settings,
            generation,
            task_epoch: 0,
            worker: false,
            dirty: false,
            run_id: None,
            state: "off".into(),
            message: "文件监听已关闭。".into(),
            notification_error: false,
            watcher: None,
        };
        if active.settings.watch_enabled {
            active.state = "starting".into();
            active.message = "正在启动当前项目的文件监听。".into();
            match self.start_watcher(app, &active.project, generation) {
                Ok(watcher) => active.watcher = Some(watcher),
                Err(error) => {
                    active.state = "error".into();
                    active.message = error.into_message();
                }
            }
        }
        emit(app, &active);
        let snapshot = active.snapshot();
        runtime.current = Some(active);
        Ok(Some(snapshot))
    }
    fn start_watcher(
        &self,
        app: &tauri::AppHandle,
        p: &Project,
        generation: u64,
    ) -> crate::error::DesktopResult<WatchProcess> {
        let directory = crate::tool_runner::directory(&p.directory)?;
        let mut command =
            crate::runtime::node_command(app, "desktop/server/project-watch.mjs", false)?;
        let mut child = command
            .arg(directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| {
                crate::error::DesktopError::io("无法启动内置文件监听，请修复应用后重试。")
            })?;
        let stdin = child.stdin.take();
        let Some(stdout) = child.stdout.take() else {
            let _ = child.kill();
            let _ = child.wait();
            return Err(crate::error::DesktopError::io("文件监听输出通道不可用。"));
        };
        let manager = self.clone();
        let application = app.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut frame = Vec::new();
                match reader.by_ref().take(1025).read_until(b'\n', &mut frame) {
                    Ok(0) => {
                        manager.fail_watch(
                            &application,
                            generation,
                            "文件监听已中断，请点击重试。",
                        );
                        break;
                    }
                    Ok(_) if frame.len() <= 1024 && frame.last() == Some(&b'\n') => {}
                    _ => {
                        manager.fail_watch(
                            &application,
                            generation,
                            "文件监听返回了无效状态，请重试。",
                        );
                        break;
                    }
                }
                match serde_json::from_slice::<WatchEvent>(&frame) {
                    Ok(WatchEvent { kind, .. }) if kind == "ready" => {
                        manager.ready(&application, generation)
                    }
                    Ok(WatchEvent { kind, .. }) if kind == "changed" => {
                        manager.changed(&application, generation)
                    }
                    Ok(WatchEvent { kind, code }) if kind == "error" => {
                        let message = match code.as_deref() {
                            Some("root_unavailable" | "root_changed") => {
                                "项目目录已移动或不可访问，请检查目录后重试。"
                            }
                            _ => "文件监听失败，请检查项目目录后重试。",
                        };
                        manager.fail_watch(&application, generation, message);
                        break;
                    }
                    _ => {
                        manager.fail_watch(
                            &application,
                            generation,
                            "文件监听返回了无效状态，请重试。",
                        );
                        break;
                    }
                }
            }
        });
        let manager = self.clone();
        let application = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(10));
            if manager.0.lock().ok().is_some_and(|r| {
                r.current
                    .as_ref()
                    .is_some_and(|a| a.generation == generation && a.state == "starting")
            }) {
                manager.fail_watch(&application, generation, "文件监听启动超时，请重试。");
            }
        });
        Ok(WatchProcess { child, stdin })
    }
    fn ready(&self, app: &tauri::AppHandle, generation: u64) {
        if let Ok(mut runtime) = self.0.lock() {
            if let Some(active) = runtime
                .current
                .as_mut()
                .filter(|a| a.generation == generation && a.state == "starting")
            {
                active.state = "watching".into();
                active.message = "正在监听；下一次文件变化后自动预检。".into();
                emit(app, active);
            }
        }
    }
    fn fail_watch(&self, app: &tauri::AppHandle, generation: u64, message: &str) {
        if let Ok(mut runtime) = self.0.lock() {
            if let Some(active) = runtime
                .current
                .as_mut()
                .filter(|a| a.generation == generation && a.watcher.is_some())
            {
                active.halt(&app.state::<ToolRunner>());
                drop(active.watcher.take());
                active.state = "error".into();
                active.message = message.into();
                emit(app, active);
            }
        }
    }
    fn changed(&self, app: &tauri::AppHandle, generation: u64) {
        let binding = if let Ok(mut runtime) = self.0.lock() {
            runtime
                .current
                .as_mut()
                .filter(|a| a.generation == generation)
                .and_then(|a| {
                    if !a.enqueue() {
                        return None;
                    }
                    emit(app, a);
                    Some(RunBinding {
                        generation,
                        task_epoch: a.task_epoch,
                        project_id: a.project.id.clone(),
                        directory: a.project.directory.clone(),
                        context_revision: a.project.context_revision,
                    })
                })
        } else {
            None
        };
        if let Some(binding) = binding {
            let manager = self.clone();
            let application = app.clone();
            std::thread::spawn(move || manager.worker(application, binding));
        }
    }
    pub(crate) fn validate_run(
        &self,
        app: &tauri::AppHandle,
        binding: &RunBinding,
    ) -> Result<(), ToolFailure> {
        let runtime = self.0.lock().map_err(|_| {
            ToolFailure::from(crate::error::DesktopError::state_unavailable(
                "project_maintenance",
                "项目维护状态不可用。",
            ))
        })?;
        let active = runtime
            .current
            .as_ref()
            .filter(|a| !runtime.closed && a.allows(binding))
            .ok_or(ToolFailure::Canceled)?;
        if active.project.id != binding.project_id {
            return Err(ToolFailure::Canceled);
        }
        app.state::<ProjectStore>()
            .access(app, |c| {
                validate_agent_project(c, &binding.project_id)?;
                let p = project(c, &binding.project_id)?;
                if p.directory != binding.directory
                    || p.context_revision != binding.context_revision
                    || !read_settings(c, &binding.project_id)?.watch_enabled
                {
                    return Err(crate::error::DesktopError::conflict(
                        "项目维护上下文已改变。",
                    ));
                }
                crate::tool_runner::directory(&p.directory)?;
                Ok(())
            })
            .map_err(ToolFailure::from)
    }
    pub(crate) fn commit_run<T>(
        &self,
        app: &tauri::AppHandle,
        binding: &RunBinding,
        operation: impl FnOnce(&mut Connection) -> crate::error::DesktopResult<T>,
    ) -> Result<T, ToolFailure> {
        // Preserve runtime generation and project identity through the artifact transaction.
        let runtime = self.0.lock().map_err(|_| {
            ToolFailure::from(crate::error::DesktopError::state_unavailable(
                "project_maintenance",
                "项目维护状态不可用。",
            ))
        })?;
        if runtime.closed || runtime.current.as_ref().is_none_or(|a| !a.allows(binding)) {
            return Err(ToolFailure::Canceled);
        }
        app.state::<ProjectStore>()
            .access(app, |c| {
                validate_agent_project(c, &binding.project_id)?;
                let p = project(c, &binding.project_id)?;
                if p.directory != binding.directory
                    || p.context_revision != binding.context_revision
                    || !read_settings(c, &binding.project_id)?.watch_enabled
                {
                    return Err(crate::error::DesktopError::conflict(
                        "项目维护上下文已改变。",
                    ));
                }
                operation(c)
            })
            .map_err(ToolFailure::from)
    }
    pub(crate) fn started(
        &self,
        app: &tauri::AppHandle,
        binding: &RunBinding,
        run_id: &str,
    ) -> Result<(), ToolFailure> {
        let mut runtime = self.0.lock().map_err(|_| {
            ToolFailure::from(crate::error::DesktopError::state_unavailable(
                "project_maintenance",
                "项目维护状态不可用。",
            ))
        })?;
        if runtime.closed {
            return Err(ToolFailure::Canceled);
        }
        let active = runtime
            .current
            .as_mut()
            .filter(|a| a.allows(binding) && a.run_id.as_deref() == Some(run_id))
            .ok_or(ToolFailure::Canceled)?;
        active.state = "checking".into();
        active.message = "正在进行只读预检。".into();
        emit(app, active);
        Ok(())
    }
    fn worker(&self, app: tauri::AppHandle, binding: RunBinding) {
        loop {
            if let Err(error) = self.validate_run(&app, &binding) {
                self.finish_run(&app, &binding, Err(error));
                return;
            }
            let run_id = {
                let Ok(mut runtime) = self.0.lock() else {
                    return;
                };
                let Some(active) = runtime.current.as_mut().filter(|a| {
                    a.generation == binding.generation
                        && a.task_epoch == binding.task_epoch
                        && a.worker
                }) else {
                    return;
                };
                if !active.dirty {
                    active.worker = false;
                    active.state = "watching".into();
                    active.message = "正在监听文件变化。".into();
                    emit(&app, active);
                    return;
                }
                active.dirty = false;
                let run_id = format!(
                    "maintenance-{}-{}-{}",
                    now(),
                    binding.generation,
                    RUN_SEQUENCE.fetch_add(1, Ordering::Relaxed)
                );
                active.run_id = Some(run_id.clone());
                run_id
            };
            let result = tauri::async_runtime::block_on(crate::project_store::run_maintenance(
                app.clone(),
                app.state::<ProjectStore>().inner().clone(),
                run_id,
                binding.clone(),
            ));
            if matches!(result, Err(ToolFailure::Busy)) {
                let Ok(mut runtime) = self.0.lock() else {
                    return;
                };
                let Some(active) = runtime.current.as_mut().filter(|a| {
                    a.generation == binding.generation
                        && a.task_epoch == binding.task_epoch
                        && a.worker
                }) else {
                    return;
                };
                let changed =
                    active.state != "pending" || active.message != "正在等待其他本地工具完成。";
                active.run_id = None;
                active.dirty = true;
                active.state = "pending".into();
                active.message = "正在等待其他本地工具完成。".into();
                if changed {
                    emit(&app, active);
                }
                drop(runtime);
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            let again = self.finish_run(&app, &binding, result);
            if !again {
                return;
            }
        }
    }
    fn finish_run(
        &self,
        app: &tauri::AppHandle,
        binding: &RunBinding,
        result: Result<Artifact, ToolFailure>,
    ) -> bool {
        let Ok(mut runtime) = self.0.lock() else {
            return false;
        };
        let Some(active) = runtime.current.as_mut().filter(|a| {
            a.generation == binding.generation && a.task_epoch == binding.task_epoch && a.worker
        }) else {
            return false;
        };
        active.finish(result.map(|_| ()));
        emit(app, active);
        active.worker
    }
    pub(crate) fn completed(
        &self,
        app: &tauri::AppHandle,
        report: &Artifact,
        binding: Option<&RunBinding>,
    ) {
        if report.kind != "check" {
            return;
        }
        let Ok(mut runtime) = self.0.lock() else {
            return;
        };
        let Some(active) = runtime.current.as_mut().filter(|a| {
            report.project_id.as_deref() == Some(a.project.id.as_str())
                && report.context_revision == Some(a.project.context_revision)
                && binding.is_none_or(|binding| a.allows(binding))
        }) else {
            return;
        };
        match app.state::<ProjectStore>().access(app, |c| {
            let before = read_settings(c, &active.project.id)?;
            let settings = record_report(c, &active.project.id, &report.id)?;
            let fresh_notice = settings
                .notices
                .iter()
                .find(|notice| {
                    notice.id == report.id && !before.notices.iter().any(|old| old.id == notice.id)
                })
                .cloned();
            Ok((settings, fresh_notice))
        }) {
            Ok((settings, fresh_notice)) => {
                active.notification_error = false;
                active.settings = settings;
                emit(app, active);
                if let Some(notice) = fresh_notice {
                    app.state::<crate::system_notifications::SystemNotifications>()
                        .new_notice(app, &active.project.id, &notice);
                }
            }
            Err(err) => {
                crate::diagnostics::record_reason(
                    "project_maintenance",
                    "warn",
                    "notice_persist_failed",
                    err.kind(),
                );
                active.notification_error = true;
                active.message = "预检已保存，但通知记录保存失败；请检查本地存储并刷新。".into();
                emit(app, active);
            }
        }
    }
    pub fn shutdown(&self, app: &tauri::AppHandle) {
        if let Ok(mut runtime) = self.0.lock() {
            runtime.closed = true;
            if let Some(mut active) = runtime.current.take() {
                active.halt(&app.state::<ToolRunner>());
                drop(active.watcher.take());
            }
        }
    }
    fn require(
        &self,
        app: &tauri::AppHandle,
        project_id: &str,
    ) -> crate::error::DesktopResult<MaintenanceSnapshot> {
        app.state::<ProjectStore>()
            .access(app, |c| validate_agent_project(c, project_id))?;
        self.sync(app, false)?
            .filter(|s| s.project_id == project_id)
            .ok_or_else(|| crate::error::DesktopError::conflict("当前项目已改变，请刷新。"))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WatchEvent {
    #[serde(rename = "type")]
    kind: String,
    code: Option<String>,
}
pub(crate) fn sync_after_project_change(app: &tauri::AppHandle) {
    if let Some(manager) = app.try_state::<ProjectMaintenance>() {
        let _ = manager.sync(app, false);
    }
}

#[tauri::command]
pub async fn project_maintenance_sync(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectMaintenance>,
) -> crate::error::DesktopResult<Option<MaintenanceSnapshot>> {
    crate::runtime::authorize(&window)?;
    let state = state.inner().clone();
    crate::error::run_blocking(
        "project_maintenance",
        "同步项目维护状态意外退出，请重试。",
        move || state.sync(&app, false),
    )
    .await
}
#[tauri::command]
pub async fn project_maintenance_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectMaintenance>,
    project_id: String,
) -> crate::error::DesktopResult<MaintenanceSnapshot> {
    crate::runtime::authorize(&window)?;
    let state = state.inner().clone();
    crate::error::run_blocking(
        "project_maintenance",
        "读取项目维护状态意外退出，请重试。",
        move || state.require(&app, &project_id),
    )
    .await
}
#[tauri::command]
pub async fn project_maintenance_save(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectMaintenance>,
    project_id: String,
    expected_revision: u64,
    watch_enabled: bool,
    notifications_enabled: bool,
) -> crate::error::DesktopResult<MaintenanceSnapshot> {
    crate::runtime::authorize(&window)?;
    let state = state.inner().clone();
    crate::error::run_blocking(
        "project_maintenance",
        "保存项目维护设置意外退出，请重试。",
        move || {
            app.state::<ProjectStore>().access(&app, |c| {
                save_settings(
                    c,
                    &project_id,
                    expected_revision,
                    watch_enabled,
                    notifications_enabled,
                )
            })?;
            let snapshot = state.require(&app, &project_id)?;
            let _ = app.emit("project-maintenance", &snapshot);
            Ok(snapshot)
        },
    )
    .await
}
#[tauri::command]
pub async fn project_maintenance_retry(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectMaintenance>,
    project_id: String,
) -> crate::error::DesktopResult<MaintenanceSnapshot> {
    crate::runtime::authorize(&window)?;
    let state = state.inner().clone();
    crate::error::run_blocking(
        "project_maintenance",
        "重试文件监听意外退出，请重试。",
        move || {
            state.require(&app, &project_id)?;
            state
                .sync(&app, true)?
                .ok_or_else(|| crate::error::DesktopError::validation("请先选择项目。"))
        },
    )
    .await
}
#[tauri::command]
pub async fn project_maintenance_read(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectMaintenance>,
    project_id: String,
    notice_ids: Vec<String>,
) -> crate::error::DesktopResult<MaintenanceSnapshot> {
    crate::runtime::authorize(&window)?;
    let state = state.inner().clone();
    crate::error::run_blocking(
        "project_maintenance",
        "更新通知已读状态意外退出，请重试。",
        move || {
            app.state::<ProjectStore>()
                .access(&app, |c| mark_read(c, &project_id, &notice_ids))?;
            let snapshot = state.require(&app, &project_id)?;
            let _ = app.emit("project-maintenance", &snapshot);
            Ok(snapshot)
        },
    )
    .await
}
#[tauri::command]
pub async fn project_maintenance_stop(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectMaintenance>,
    project_id: String,
) -> crate::error::DesktopResult<MaintenanceSnapshot> {
    crate::runtime::authorize(&window)?;
    let state = state.inner().clone();
    crate::error::run_blocking(
        "project_maintenance",
        "停止自动预检意外退出，请重试。",
        move || {
            state.require(&app, &project_id)?;
            let mut runtime = state.0.lock().map_err(|_| {
                crate::error::DesktopError::state_unavailable(
                    "project_maintenance",
                    "项目维护状态不可用。",
                )
            })?;
            let active = runtime
                .current
                .as_mut()
                .filter(|a| a.project.id == project_id)
                .ok_or_else(|| crate::error::DesktopError::conflict("当前项目已改变。"))?;
            active.halt(&app.state::<ToolRunner>());
            if active.watcher.is_some()
                && matches!(active.state.as_str(), "checking" | "pending" | "watching")
            {
                active.state = "watching".into();
                active.message = "已停止本次自动预检，继续监听后续变化。".into();
            }
            emit(&app, active);
            Ok(active.snapshot())
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn active() -> Active {
        let mut settings = Settings::new("one");
        settings.watch_enabled = true;
        Active {
            project: Project {
                id: "one".into(),
                name: "One".into(),
                directory: "fixture".into(),
                subject: "personal".into(),
                revision: 1,
                facts: Default::default(),
                context_revision: 0,
                created_at: 1,
                updated_at: 1,
                directory_available: true,
            },
            settings,
            generation: 1,
            task_epoch: 0,
            worker: false,
            dirty: false,
            run_id: None,
            state: "watching".into(),
            message: String::new(),
            notification_error: false,
            watcher: None,
        }
    }
    fn binding() -> RunBinding {
        RunBinding {
            generation: 1,
            task_epoch: 0,
            project_id: "one".into(),
            directory: "fixture".into(),
            context_revision: 0,
        }
    }
    #[test]
    fn maintenance_event_storm_keeps_one_worker_and_one_followup() {
        let mut a = active();
        assert!(a.enqueue());
        assert!(a.worker && a.dirty);
        a.dirty = false;
        a.state = "checking".into();
        for _ in 0..1000 {
            assert!(!a.enqueue());
        }
        assert!(a.worker && a.dirty);
        a.state = "paused".into();
        a.dirty = false;
        assert!(!a.enqueue());
        assert!(!a.dirty);
        a.state = "watching".into();
        a.settings.watch_enabled = false;
        assert!(!a.enqueue());
        assert!(!a.dirty);
    }
    #[test]
    fn maintenance_stop_invalidates_queued_binding_and_only_cancels_owned_run() {
        let runner = ToolRunner::default();
        let mut a = active();
        a.enqueue();
        assert!(a.allows(&binding()));
        a.halt(&runner);
        assert!(!a.allows(&binding()));
        assert!(!a.dirty && !a.worker);
        a.enqueue();
        let mut next = binding();
        next.task_epoch = 1;
        assert!(a.allows(&next));
        let _reservation = runner.reserve_guard_outcome("owned").unwrap();
        a.run_id = Some("owned".into());
        a.halt(&runner);
        assert!(matches!(
            runner.run_reserved_outcome(
                std::process::Command::new("missing-test-executable"),
                "owned".into(),
                false
            ),
            Err(ToolFailure::Canceled)
        ));
        drop(_reservation);
        let _manual = runner.reserve_guard_outcome("manual").unwrap();
        a.run_id = Some("different".into());
        a.halt(&runner);
        assert!(matches!(
            runner.run_reserved_outcome(
                std::process::Command::new("missing-test-executable"),
                "manual".into(),
                false
            ),
            Err(ToolFailure::Failed(_))
        ));
    }
    #[test]
    fn maintenance_generation_context_and_directory_changes_invalidate_binding() {
        let mut a = active();
        a.enqueue();
        let original = binding();
        assert!(a.allows(&original));
        for mutation in 0..4 {
            let mut candidate = original.clone();
            match mutation {
                0 => candidate.project_id = "two".into(),
                1 => candidate.generation += 1,
                2 => candidate.context_revision += 1,
                _ => candidate.directory = "moved".into(),
            }
            assert!(!a.allows(&candidate));
        }
        a.project.name = "Renamed".into();
        a.project.revision += 1;
        assert!(a.allows(&original));
    }
    #[test]
    fn maintenance_watcher_protocol_rejects_paths_and_unknown_fields() {
        assert!(serde_json::from_str::<WatchEvent>(r#"{"type":"ready"}"#).is_ok());
        assert!(
            serde_json::from_str::<WatchEvent>(r#"{"type":"error","code":"root_changed"}"#).is_ok()
        );
        assert!(
            serde_json::from_str::<WatchEvent>(r#"{"type":"changed","path":"private.txt"}"#)
                .is_err()
        );
        assert!(serde_json::from_str::<WatchEvent>(r#"{"type":12}"#).is_err());
    }
    #[test]
    fn maintenance_notice_write_failure_remains_paused_after_success() {
        let mut a = active();
        a.enqueue();
        a.notification_error = true;
        a.run_id = Some("saved-report".into());
        a.finish(Ok(()));
        assert_eq!(a.state, "paused");
        assert!(a.message.contains("通知记录保存失败"));
        assert!(!a.worker && !a.dirty);
        assert!(a.run_id.is_none());
        assert!(!a.enqueue());
    }
}
