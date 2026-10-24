//! Device-scoped, opt-in native notifications. No caller-supplied notification text.
use crate::project_store::{db_error, decode, encode, id, now, ProjectStore};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_notification::{NotificationExt, PermissionState};

const KEY: &str = "system_notifications";
const MAX_REVISION: u64 = 9_007_199_254_740_991;
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Permission {
    Granted,
    Denied,
    Prompt,
    Unknown,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Delivery {
    Idle,
    Submitted,
    Failed,
    Disabled,
    PermissionRequired,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Attempt {
    kind: String,
    notice_id: Option<String>,
    attempted_at: u64,
    outcome: Delivery,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    schema_version: u32,
    revision: u64,
    enabled: bool,
    delivery: Delivery,
    last_attempt: Option<Attempt>,
    attempted_notices: Vec<String>,
    enabled_after_artifact: i64,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            enabled: false,
            delivery: Delivery::Disabled,
            last_attempt: None,
            attempted_notices: vec![],
            enabled_after_artifact: 0,
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    schema_version: u32,
    revision: u64,
    enabled: bool,
    permission: Permission,
    delivery: Delivery,
    message: Option<String>,
    installation_required: bool,
    last_attempt: Option<Attempt>,
}
#[derive(Default)]
pub struct SystemNotifications(Mutex<()>);

trait Backend {
    fn permission(&self) -> Permission;
    fn request_permission(&self) -> Permission;
    fn submit(&self, count: Option<usize>) -> Result<(), ()>;
}
struct Plugin<'a>(&'a tauri::AppHandle);
fn permission(value: Result<PermissionState, tauri_plugin_notification::Error>) -> Permission {
    match value {
        Ok(PermissionState::Granted) => Permission::Granted,
        Ok(PermissionState::Denied) => Permission::Denied,
        Ok(_) => Permission::Prompt,
        Err(_) => Permission::Unknown,
    }
}
impl Backend for Plugin<'_> {
    fn permission(&self) -> Permission {
        permission(self.0.notification().permission_state())
    }
    fn request_permission(&self) -> Permission {
        permission(self.0.notification().request_permission())
    }
    fn submit(&self, count: Option<usize>) -> Result<(), ()> {
        let body = match count {
            Some(count) => format!("预检发现 {count} 项新增问题，请在应用内查看。"),
            None => "这是一条测试通知，用于检查此设备的通知显示。".into(),
        };
        self.0
            .notification()
            .builder()
            .title("船友 · 项目提醒")
            .body(body)
            .show()
            .map_err(|_| ())
    }
}
fn read(c: &Connection) -> Result<Settings, String> {
    let raw: Option<Option<String>> = c.query_row("SELECT CASE WHEN length(CAST(value AS BLOB))<=65536 THEN value ELSE NULL END FROM settings WHERE key=?", [KEY], |r| r.get(0)).optional().map_err(db_error)?;
    let value: Settings = match raw {
        None => Settings::default(),
        Some(Some(raw)) => decode(raw)?,
        Some(None) => return Err("系统通知设置超过上限，请检查本地备份。".into()),
    };
    if value.schema_version != 1
        || value.revision > MAX_REVISION
        || value.attempted_notices.len() > 256
        || value.enabled_after_artifact < 0
        || value
            .attempted_notices
            .iter()
            .any(|key| key.is_empty() || key.len() > 300 || key.chars().any(char::is_control))
    {
        return Err("系统通知设置格式无效，请检查本地备份。".into());
    }
    if let Some(attempt) = &value.last_attempt {
        if !["test", "notice"].contains(&attempt.kind.as_str())
            || attempt.attempted_at > MAX_REVISION
            || ![
                Delivery::Submitted,
                Delivery::Failed,
                Delivery::PermissionRequired,
            ]
            .contains(&attempt.outcome)
            || (attempt.kind == "notice") != attempt.notice_id.is_some()
        {
            return Err("系统通知尝试记录无效。".into());
        }
        if let Some(notice_id) = &attempt.notice_id {
            id(notice_id)?;
        }
    }
    Ok(value)
}
fn write(c: &Connection, value: &Settings) -> Result<(), String> {
    c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![KEY, encode(value)?]).map_err(db_error)?;
    Ok(())
}
fn snapshot(value: &Settings, permission: Permission) -> Snapshot {
    let message = match value.delivery {
        Delivery::Submitted => {
            Some("已提交系统通知组件；是否显示取决于 Windows 通知设置、勿扰模式和安装状态。".into())
        }
        Delivery::Failed => {
            Some("系统通知提交失败；应用内提醒和预检结果已保留，可稍后测试。".into())
        }
        Delivery::PermissionRequired => {
            Some("系统通知权限不可用；应用内提醒继续保留。请检查系统设置后重新开启。".into())
        }
        Delivery::Disabled => Some("系统通知已关闭；应用内提醒可独立使用。".into()),
        Delivery::Idle => Some(
            "仅提醒此后发现的新增问题，不补发历史提醒。Windows 权限状态不代表通知一定显示。".into(),
        ),
    };
    Snapshot {
        schema_version: 1,
        revision: value.revision,
        enabled: value.enabled,
        permission,
        delivery: value.delivery,
        message,
        installation_required: cfg!(windows),
        last_attempt: value.last_attempt.clone(),
    }
}
fn save(
    c: &mut Connection,
    backend: &impl Backend,
    expected: u64,
    enabled: bool,
) -> Result<Snapshot, String> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let mut value = read(&tx)?;
    if value.revision != expected {
        return Err("系统通知设置已改变，请刷新后重试。".into());
    }
    let revision = value
        .revision
        .checked_add(1)
        .filter(|v| *v <= MAX_REVISION)
        .ok_or("系统通知设置版本超出上限。")?;
    // Only this explicit enable operation requests native permission. It does not send a test.
    let grant = if enabled {
        backend.request_permission()
    } else {
        backend.permission()
    };
    value.revision = revision;
    value.enabled = enabled && grant == Permission::Granted;
    if value.enabled {
        value.enabled_after_artifact = tx
            .query_row("SELECT COALESCE(MAX(rowid),0) FROM artifacts", [], |r| {
                r.get(0)
            })
            .map_err(db_error)?;
    }
    value.delivery = if !enabled {
        Delivery::Disabled
    } else if value.enabled {
        Delivery::Idle
    } else {
        Delivery::PermissionRequired
    };
    write(&tx, &value)?;
    tx.commit().map_err(db_error)?;
    Ok(snapshot(&value, grant))
}
fn dispatch(
    c: &mut Connection,
    backend: &impl Backend,
    notice: Option<(&str, &str, usize)>,
) -> Result<Snapshot, String> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let mut value = read(&tx)?;
    let grant = backend.permission();
    if !value.enabled {
        return Ok(snapshot(&value, grant));
    }
    let count = if let Some((project_id, notice_id, count)) = notice {
        id(project_id)?;
        id(notice_id)?;
        if count == 0 || count > 512 {
            return Err("通知问题数量无效。".into());
        }
        let ordinal: Option<i64> = tx
            .query_row(
                "SELECT rowid FROM artifacts WHERE id=? AND project_id=?",
                params![notice_id, project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(db_error)?;
        if ordinal.is_none_or(|ordinal| ordinal <= value.enabled_after_artifact) {
            return Ok(snapshot(&value, grant));
        }
        let key = format!("{project_id}:{notice_id}");
        if value.attempted_notices.contains(&key) {
            return Ok(snapshot(&value, grant));
        }
        value.attempted_notices.push(key);
        if value.attempted_notices.len() > 256 {
            value.attempted_notices.remove(0);
        }
        Some(count)
    } else {
        None
    };
    let outcome = if grant == Permission::Granted {
        Delivery::Failed
    } else {
        Delivery::PermissionRequired
    };
    value.last_attempt = Some(Attempt {
        kind: if notice.is_some() { "notice" } else { "test" }.into(),
        notice_id: notice.map(|(_, id, _)| id.into()),
        attempted_at: now(),
        outcome,
    });
    value.delivery = outcome;
    // Persist the attempt before calling the external API: a crash never replays it.
    write(&tx, &value)?;
    tx.commit().map_err(db_error)?;
    if grant == Permission::Granted {
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(db_error)?;
        let current = read(&tx)?;
        if !current.enabled
            || current.revision != value.revision
            || current.last_attempt != value.last_attempt
        {
            return Ok(snapshot(&current, backend.permission()));
        }
        value.delivery = if backend.submit(count).is_ok() {
            Delivery::Submitted
        } else {
            Delivery::Failed
        };
        if let Some(attempt) = value.last_attempt.as_mut() {
            attempt.outcome = value.delivery;
        }
        write(&tx, &value)?;
        tx.commit().map_err(db_error)?;
    }
    Ok(snapshot(&value, grant))
}

impl SystemNotifications {
    pub(crate) fn new_notice(
        &self,
        app: &tauri::AppHandle,
        project_id: &str,
        notice: &crate::project_maintenance::Notice,
    ) {
        // Shared gate with save/test: once disable returns no new API submission can start.
        let Ok(_gate) = self.0.lock() else {
            return;
        };
        let result = app.state::<ProjectStore>().access(app, |c| {
            dispatch(
                c,
                &Plugin(app),
                Some((project_id, &notice.id, notice.new_count)),
            )
        });
        if result.is_err() {
            eprintln!("System notification attempt could not be persisted; report remains saved.");
        }
    }
}
#[tauri::command]
pub fn system_notifications_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SystemNotifications>,
    store: tauri::State<'_, ProjectStore>,
) -> Result<Snapshot, String> {
    crate::runtime::authorize(&window)?;
    let _gate = state.0.lock().map_err(|_| "系统通知状态不可用。")?;
    store.access(&app, |c| Ok(snapshot(&read(c)?, Plugin(&app).permission())))
}
#[tauri::command]
pub fn system_notifications_save(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SystemNotifications>,
    store: tauri::State<'_, ProjectStore>,
    expected_revision: u64,
    enabled: bool,
) -> Result<Snapshot, String> {
    crate::runtime::authorize(&window)?;
    let _gate = state.0.lock().map_err(|_| "系统通知状态不可用。")?;
    store.access(&app, |c| save(c, &Plugin(&app), expected_revision, enabled))
}
#[tauri::command]
pub fn system_notifications_test(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SystemNotifications>,
    store: tauri::State<'_, ProjectStore>,
) -> Result<Snapshot, String> {
    crate::runtime::authorize(&window)?;
    let _gate = state.0.lock().map_err(|_| "系统通知状态不可用。")?;
    store.access(&app, |c| dispatch(c, &Plugin(&app), None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    struct Fake {
        permission: Cell<Permission>,
        requested: Cell<usize>,
        submitted: Cell<usize>,
        fails: bool,
    }
    impl Default for Fake {
        fn default() -> Self {
            Self {
                permission: Cell::new(Permission::Granted),
                requested: Cell::new(0),
                submitted: Cell::new(0),
                fails: false,
            }
        }
    }
    impl Backend for Fake {
        fn permission(&self) -> Permission {
            self.permission.get()
        }
        fn request_permission(&self) -> Permission {
            self.requested.set(self.requested.get() + 1);
            self.permission.get()
        }
        fn submit(&self, count: Option<usize>) -> Result<(), ()> {
            assert!(count.is_none_or(|count| count > 0 && count <= 512));
            self.submitted.set(self.submitted.get() + 1);
            if self.fails {
                Err(())
            } else {
                Ok(())
            }
        }
    }
    fn database() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)", [])
            .unwrap();
        c.execute(
            "CREATE TABLE artifacts(id TEXT PRIMARY KEY,project_id TEXT)",
            [],
        )
        .unwrap();
        c
    }
    fn artifact(c: &Connection, project: &str, id: &str) {
        c.execute(
            "INSERT INTO artifacts(id,project_id) VALUES(?,?)",
            params![id, project],
        )
        .unwrap();
    }
    #[test]
    fn default_off_read_enable_and_restart_never_send() {
        let mut c = database();
        let backend = Fake::default();
        assert!(!read(&c).unwrap().enabled);
        let initial = dispatch(&mut c, &backend, None).unwrap();
        assert_eq!(initial.delivery, Delivery::Disabled);
        assert!(initial.last_attempt.is_none());
        let enabled = save(&mut c, &backend, 0, true).unwrap();
        assert!(enabled.enabled);
        assert_eq!(enabled.revision, 1);
        assert_eq!(backend.requested.get(), 1);
        assert_eq!(backend.submitted.get(), 0);
        assert!(read(&c).unwrap().enabled);
        assert!(read(&c).unwrap().last_attempt.is_none());
        assert!(save(&mut c, &backend, 0, false).is_err());
        assert_eq!(backend.requested.get(), 1);
    }
    #[test]
    fn explicit_test_and_disable_preserve_attempt_without_resending() {
        let mut c = database();
        let backend = Fake::default();
        save(&mut c, &backend, 0, true).unwrap();
        let sent = dispatch(&mut c, &backend, None).unwrap();
        assert_eq!(sent.delivery, Delivery::Submitted);
        assert_eq!(sent.last_attempt.as_ref().unwrap().kind, "test");
        let disabled = save(&mut c, &backend, 1, false).unwrap();
        assert!(!disabled.enabled);
        assert_eq!(
            dispatch(&mut c, &backend, None).unwrap().last_attempt,
            sent.last_attempt
        );
        dispatch(&mut c, &backend, Some(("project-one", "notice-one", 1))).unwrap();
        assert_eq!(backend.submitted.get(), 1);
        assert_eq!(backend.requested.get(), 1);
    }
    #[test]
    fn notice_attempts_deduplicate_across_toggle_and_failure() {
        let mut c = database();
        let backend = Fake {
            fails: true,
            ..Fake::default()
        };
        save(&mut c, &backend, 0, true).unwrap();
        artifact(&c, "project-one", "notice-one");
        let result = dispatch(&mut c, &backend, Some(("project-one", "notice-one", 2))).unwrap();
        assert_eq!(result.delivery, Delivery::Failed);
        assert_eq!(
            result.last_attempt.unwrap().notice_id.as_deref(),
            Some("notice-one")
        );
        save(&mut c, &backend, 1, false).unwrap();
        save(&mut c, &backend, 2, true).unwrap();
        dispatch(&mut c, &backend, Some(("project-one", "notice-one", 2))).unwrap();
        assert_eq!(backend.submitted.get(), 1);
        artifact(&c, "project-two", "notice-two");
        dispatch(&mut c, &backend, Some(("project-two", "notice-two", 2))).unwrap();
        assert_eq!(backend.submitted.get(), 2);
        assert_eq!(read(&c).unwrap().attempted_notices.len(), 2);
    }
    #[test]
    fn denied_or_unknown_permission_never_sends_and_does_not_affect_in_app_records() {
        let mut c = database();
        let backend = Fake::default();
        backend.permission.set(Permission::Denied);
        let denied = save(&mut c, &backend, 0, true).unwrap();
        assert!(!denied.enabled);
        assert_eq!(denied.delivery, Delivery::PermissionRequired);
        dispatch(&mut c, &backend, None).unwrap();
        assert_eq!(backend.submitted.get(), 0);
        backend.permission.set(Permission::Granted);
        save(&mut c, &backend, 1, true).unwrap();
        backend.permission.set(Permission::Unknown);
        assert_eq!(
            dispatch(&mut c, &backend, None).unwrap().delivery,
            Delivery::PermissionRequired
        );
        assert_eq!(backend.submitted.get(), 0);
    }
    #[test]
    fn corrupt_settings_fail_closed_without_request_or_overwrite() {
        let mut c = database();
        let backend = Fake::default();
        c.execute("INSERT INTO settings VALUES(?,?)", params![KEY, "broken"])
            .unwrap();
        assert!(save(&mut c, &backend, 0, true).is_err());
        assert!(dispatch(&mut c, &backend, None).is_err());
        assert_eq!(backend.requested.get(), 0);
        assert_eq!(backend.submitted.get(), 0);
        let raw: String = c
            .query_row("SELECT value FROM settings WHERE key=?", [KEY], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(raw, "broken");
    }

    #[test]
    fn enable_high_watermark_blocks_delayed_disabled_notices() {
        let mut c = database();
        let backend = Fake::default();
        artifact(&c, "project-one", "created-while-disabled");
        save(&mut c, &backend, 0, true).unwrap();
        let skipped = dispatch(
            &mut c,
            &backend,
            Some(("project-one", "created-while-disabled", 1)),
        )
        .unwrap();
        assert!(skipped.last_attempt.is_none());
        assert_eq!(backend.submitted.get(), 0);
        artifact(&c, "project-one", "fresh-notice");
        dispatch(&mut c, &backend, Some(("project-one", "fresh-notice", 1))).unwrap();
        assert_eq!(backend.submitted.get(), 1);
        save(&mut c, &backend, 1, false).unwrap();
        artifact(&c, "project-one", "second-disabled-notice");
        save(&mut c, &backend, 2, true).unwrap();
        dispatch(
            &mut c,
            &backend,
            Some(("project-one", "second-disabled-notice", 1)),
        )
        .unwrap();
        dispatch(
            &mut c,
            &backend,
            Some(("foreign-project", "fresh-notice", 1)),
        )
        .unwrap();
        assert_eq!(backend.submitted.get(), 1);
    }

    #[test]
    fn failed_attempt_persistence_prevents_submission() {
        let mut c = database();
        let backend = Fake::default();
        save(&mut c, &backend, 0, true).unwrap();
        c.execute_batch("CREATE TRIGGER reject_attempt BEFORE UPDATE ON settings BEGIN SELECT RAISE(FAIL,'cannot persist'); END;").unwrap();
        assert!(dispatch(&mut c, &backend, None).is_err());
        assert_eq!(backend.submitted.get(), 0);
        assert!(read(&c).unwrap().last_attempt.is_none());
    }

    #[test]
    fn device_settings_and_dedup_survive_connection_reopen_without_replay() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "shipmate-notification-test-{}-{stamp}.sqlite3",
            std::process::id()
        ));
        let backend = Fake::default();
        {
            let mut c = Connection::open(&path).unwrap();
            c.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE artifacts(id TEXT PRIMARY KEY,project_id TEXT);").unwrap();
            save(&mut c, &backend, 0, true).unwrap();
            artifact(&c, "project-one", "durable-notice");
            dispatch(&mut c, &backend, Some(("project-one", "durable-notice", 1))).unwrap();
        }
        {
            let mut c = Connection::open(&path).unwrap();
            let recovered = snapshot(&read(&c).unwrap(), backend.permission());
            assert!(recovered.enabled);
            assert_eq!(
                recovered.last_attempt.unwrap().notice_id.as_deref(),
                Some("durable-notice")
            );
            dispatch(&mut c, &backend, Some(("project-one", "durable-notice", 1))).unwrap();
            assert_eq!(backend.submitted.get(), 1);
        }
        std::fs::remove_file(path).unwrap();
    }
}
