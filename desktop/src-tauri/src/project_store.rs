//! Local project metadata and immutable tool artifacts. No model credentials are stored here.
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const SCHEMA: &str = "CREATE TABLE projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE runs(id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), state TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE artifacts(id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(id), project_id TEXT REFERENCES projects(id), data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE INDEX runs_project ON runs(project_id); CREATE INDEX artifacts_project ON artifacts(project_id);";
pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub(crate) fn db_error(error: rusqlite::Error) -> String {
    use rusqlite::ErrorCode;
    crate::diagnostics::record_sqlite_error(
        "project_store",
        "sqlite_error",
        error.sqlite_error_code().map(|code| code as i32),
    );
    let guidance = match error.sqlite_error_code() {
        Some(ErrorCode::DiskFull) => {
            "磁盘空间不足，无法保存本次操作；请释放空间后重试，并检查运行历史。"
        }
        Some(ErrorCode::ReadOnly | ErrorCode::PermissionDenied) => {
            "项目数据库不可写；请检查应用数据目录的写入权限后重试。"
        }
        Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked) => {
            "项目数据库正被占用；请等待其他操作结束后重试。"
        }
        Some(ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase) => {
            "项目数据库损坏或格式不正确；请保留原文件并从备份恢复。"
        }
        Some(ErrorCode::CannotOpen | ErrorCode::SystemIoFailure) => {
            "无法访问项目数据库；请检查磁盘连接、可用空间和目录权限。"
        }
        _ => "项目数据操作失败；请重新打开应用并检查运行历史，勿重复覆盖数据库。",
    };
    format!("{guidance} ({error})")
}
pub(crate) fn encode(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "无法编码项目数据。".into())
}
pub(crate) fn decode<T: serde::de::DeserializeOwned>(value: String) -> Result<T, String> {
    serde_json::from_str(&value).map_err(|_| "项目记录格式损坏，请保留数据库并从备份恢复。".into())
}
pub(crate) fn id(value: &str) -> Result<(), String> {
    if crate::runtime::valid_id(value) {
        Ok(())
    } else {
        Err("项目或运行编号无效。".into())
    }
}
#[derive(Clone, Serialize, Deserialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ProjectFacts {
    pub business_type: String,
    pub has_payment: Option<bool>,
    pub collects_sensitive: Option<bool>,
    pub has_server_domain: Option<bool>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub subject: String,
    pub revision: u64,
    #[serde(default)]
    pub facts: ProjectFacts,
    #[serde(default)]
    pub context_revision: u64,
    pub created_at: u64,
    pub updated_at: u64,
    pub directory_available: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectInput {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub subject: String,
    pub expected_revision: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_state: Option<String>,
    pub id: String,
    pub project_id: Option<String>,
    pub kind: String,
    pub state: String,
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub error: Option<String>,
    pub project_revision: Option<u64>,
    #[serde(default)]
    pub context_revision: Option<u64>,
    pub tool_version: String,
    pub rules_version: String,
    pub input_summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_request_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<String>,
    pub id: String,
    pub run_id: String,
    pub project_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub markdown: String,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
    pub created_at: u64,
    pub project_revision: Option<u64>,
    #[serde(default)]
    pub context_revision: Option<u64>,
    pub tool_version: String,
    pub rules_version: String,
    pub input_summary: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub rules_version: Option<String>,
    pub projects: Vec<Project>,
    pub active_project_id: Option<String>,
    pub runs: Vec<Run>,
    pub artifacts: Vec<serde_json::Value>,
}
#[derive(Clone, Default)]
pub struct ProjectStore(Arc<Mutex<StoreState>>, Arc<Mutex<BTreeMap<String, Run>>>);
#[derive(Default)]
enum StoreState {
    #[default]
    Uninitialized,
    Open(StoreConnection),
    Closed,
}
struct StoreConnection {
    connection: Connection,
    // The OS releases this lock even after a crash. It prevents a second app instance
    // from declaring a still-running operation interrupted during startup recovery.
    _lease: std::fs::File,
}
fn open_store(path: &Path) -> Result<StoreConnection, String> {
    let lease = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path.with_extension("lock"))
        .map_err(|e| format!("无法打开项目存储锁：{e}"))?;
    lease
        .try_lock()
        .map_err(|_| "项目数据正在被另一个应用实例使用，请关闭该实例后重试。")?;
    Ok(StoreConnection {
        connection: open_database(path)?,
        _lease: lease,
    })
}
fn rows<T: serde::de::DeserializeOwned>(
    connection: &Connection,
    sql: &str,
    project: Option<&str>,
) -> Result<Vec<T>, String> {
    let mut statement = connection.prepare(sql).map_err(db_error)?;
    let mut result = Vec::new();
    let mut query = if sql.contains('?') {
        statement.query([project]).map_err(db_error)?
    } else {
        statement.query([]).map_err(db_error)?
    };
    while let Some(row) = query.next().map_err(db_error)? {
        result.push(decode(row.get(0).map_err(db_error)?)?);
    }
    Ok(result)
}
pub(crate) fn project(connection: &Connection, id_value: &str) -> Result<Project, String> {
    id(id_value)?;
    let data = connection
        .query_row("SELECT data FROM projects WHERE id=?", [id_value], |row| {
            row.get(0)
        })
        .optional()
        .map_err(db_error)?
        .ok_or("项目不存在，请刷新项目列表。")?;
    let mut value: Project = decode(data)?;
    value.directory_available = Path::new(&value.directory).is_dir();
    Ok(value)
}
fn migrate(connection: &mut Connection, ddl: &str) -> Result<(), String> {
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let version: u32 = tx
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(db_error)?;
    let tables: u32 = tx
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
            [],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if version != 0 || tables != 0 {
        return Err("迁移期间数据库版本或结构已改变，未执行迁移，请重新打开应用。".into());
    }
    tx.execute_batch(ddl).map_err(db_error)?;
    tx.pragma_update(None, "user_version", 1)
        .map_err(db_error)?;
    tx.commit().map_err(db_error)
}
fn migrate_v2(connection: &mut Connection) -> Result<(), String> {
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let version: u32 = tx
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(db_error)?;
    if version != 1 {
        return Err("迁移期间数据库版本已改变，请重新打开应用。".into());
    }
    tx.prepare("SELECT p.data,p.revision,r.state,r.data,a.run_id,a.data,s.value FROM projects p,runs r,artifacts a,settings s LIMIT 0").map_err(db_error)?;
    tx.execute_batch("CREATE TABLE stage_confirmations(id INTEGER PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL CHECK(json_valid(data))); CREATE INDEX confirmations_project ON stage_confirmations(project_id);").map_err(db_error)?;
    tx.pragma_update(None, "user_version", 2)
        .map_err(db_error)?;
    tx.commit().map_err(db_error)
}
fn backup(source: &Connection, path: &Path) -> Result<(), String> {
    let version: u32 = source
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(db_error)?;
    let target = path.with_extension(format!("pre-v{}-{}.sqlite3", version + 1, now()));
    // Reserve a new filename rather than overwriting a previous recovery point.
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| {
            crate::diagnostics::record_reason(
                "project_store",
                "error",
                "db_backup_failed",
                "create_backup_file_failed",
            );
            format!("无法创建迁移备份：{e}")
        })?;
    let mut destination = Connection::open(&target).map_err(db_error)?;
    destination
        .busy_timeout(Duration::from_millis(100))
        .map_err(db_error)?;
    let handle = rusqlite::backup::Backup::new(source, &mut destination).map_err(db_error)?;
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if Instant::now() >= deadline {
            crate::diagnostics::record_reason(
                "project_store",
                "error",
                "db_backup_failed",
                "backup_timeout",
            );
            return Err("迁移备份超时，未修改原数据库。".into());
        }
        match handle.step(128).map_err(db_error)? {
            rusqlite::backup::StepResult::Done => break,
            _ => std::thread::sleep(Duration::from_millis(10)),
        }
    }
    drop(handle);
    let check: String = destination
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(db_error)?;
    if check != "ok" {
        crate::diagnostics::record_reason(
            "project_store",
            "error",
            "db_backup_failed",
            "backup_integrity_failed",
        );
        return Err("迁移备份完整性检查失败，未修改原数据库。".into());
    }
    Ok(())
}
fn wal_sidecar(path: &Path) -> PathBuf {
    let mut raw = path.as_os_str().to_os_string();
    raw.push("-wal");
    PathBuf::from(raw)
}
fn journal_sidecar(path: &Path) -> PathBuf {
    let mut raw = path.as_os_str().to_os_string();
    raw.push("-journal");
    PathBuf::from(raw)
}
fn is_wal_header(path: &Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut header = [0u8; 20];
    file.read_exact(&mut header).is_ok()
        && &header[..16] == b"SQLite format 3\0"
        && header[18] == 2
        && header[19] == 2
}
fn open_database(path: &Path) -> Result<Connection, String> {
    use rusqlite::config::DbConfig;
    let existing = path.exists();
    if existing {
        // Preserve byte-for-byte non-modification on rollback-journal or future/corrupt WAL files:
        // disable checkpoint-on-close on the probe connection so rejecting a DB never checkpoints
        // WAL frames into `projects.sqlite3` or unlinks `-wal`/`-shm`.
        let recover_wal_index =
            wal_sidecar(path).exists() && is_wal_header(path) && !journal_sidecar(path).exists();
        let probe = if recover_wal_index {
            let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(db_error)?;
            let _ = conn.set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, true);
            conn.pragma_update(None, "query_only", true)
                .map_err(db_error)?;
            conn
        } else {
            let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(db_error)?;
            let _ = conn.set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, true);
            conn
        };
        probe
            .busy_timeout(Duration::from_secs(5))
            .map_err(db_error)?;
        let check: String = probe
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .map_err(db_error)?;
        if check != "ok" {
            crate::diagnostics::record_reason(
                "project_store",
                "error",
                "db_open_rejected",
                "quick_check_failed",
            );
            return Err("项目数据库损坏，未修改原文件，请从备份恢复。".into());
        }
        let version: u32 = probe
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(db_error)?;
        if version > 2 {
            crate::diagnostics::record_reason(
                "project_store",
                "warn",
                "db_open_rejected",
                "future_user_version",
            );
            return Err("项目数据库来自更新版本，请升级应用；未修改原文件。".into());
        }
        if version >= 1 {
            probe.prepare("SELECT p.data,p.revision,r.state,r.data,a.run_id,a.data,s.value FROM projects p,runs r,artifacts a,settings s LIMIT 0").map_err(db_error)?;
        }
        if version == 2 {
            probe
                .prepare("SELECT id,project_id,data FROM stage_confirmations LIMIT 0")
                .map_err(db_error)?;
        }
        if version == 0 {
            let tables: u32 = probe
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
                    [],
                    |row| row.get(0),
                )
                .map_err(db_error)?;
            if tables != 0 {
                crate::diagnostics::record_reason(
                    "project_store",
                    "error",
                    "db_open_rejected",
                    "unknown_v0_tables",
                );
                return Err("无法识别旧项目数据库，未修改原文件。".into());
            }
            backup(&probe, path)?;
        }
    }
    let mut connection = Connection::open(path).map_err(db_error)?;
    let _ = connection.set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, true);
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(db_error)?;
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(db_error)?;
    let version: u32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(db_error)?;
    if version > 2 {
        return Err("项目数据库来自更新版本，未修改原文件。".into());
    }
    if version == 0 {
        migrate(&mut connection, SCHEMA)?;
    }
    let current: u32 = connection
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(db_error)?;
    if current == 1 {
        backup(&connection, path)?;
        migrate_v2(&mut connection)?;
    }
    // Validate every expected table before enabling WAL or performing recovery writes.
    connection.prepare("SELECT p.data,r.state,a.run_id,s.value FROM projects p,runs r,artifacts a,settings s LIMIT 0").map_err(db_error)?;
    let _ = connection.set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, false);
    let journal_mode: String = connection
        .query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))
        .map_err(db_error)?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        crate::diagnostics::record_reason(
            "project_store",
            "error",
            "db_wal_failed",
            "unexpected_journal_mode",
        );
        return Err("无法启用项目数据库预写日志模式，请检查应用数据目录权限与文件系统。".into());
    }
    connection
        .pragma_update(None, "synchronous", "FULL")
        .map_err(db_error)?;
    let pending: Vec<Run> = rows(
        &connection,
        "SELECT data FROM runs WHERE state='running'",
        None,
    )?;
    let tx = connection.transaction().map_err(db_error)?;
    for mut run in pending {
        run.state = "interrupted".into();
        run.finished_at = Some(now());
        run.error = Some("应用退出时运行未完成，可重新运行。".into());
        tx.execute(
            "UPDATE runs SET state=?,data=? WHERE id=?",
            params![run.state, encode(&run)?, run.id],
        )
        .map_err(db_error)?;
    }
    tx.commit().map_err(db_error)?;
    Ok(connection)
}
impl ProjectStore {
    fn snapshot(&self, app: &tauri::AppHandle) -> Result<Snapshot, String> {
        let mut snapshot = self.access(app, |c| snapshot(c))?;
        snapshot.rules_version = versions(app).ok().map(|(_, rules)| rules);
        let failures = self.1.lock().map_err(|_| "运行恢复状态不可用。")?;
        for failure in failures.values() {
            if let Some(run) = snapshot.runs.iter_mut().find(|r| r.id == failure.id) {
                *run = failure.clone();
            } else {
                snapshot.runs.push(failure.clone());
            }
        }
        snapshot
            .runs
            .sort_by(|a, b| b.started_at.cmp(&a.started_at));
        Ok(snapshot)
    }
    fn finish(
        &self,
        app: &tauri::AppHandle,
        run: Run,
        outcome: Result<String, crate::tool_runner::ToolFailure>,
    ) -> Result<Artifact, String> {
        self.access(app, |connection| {
            finish_recoverable(connection, run, outcome, &self.1)
        })
    }
    pub(crate) fn context_project(
        &self,
        app: &tauri::AppHandle,
        project_id: &str,
    ) -> Result<Project, String> {
        self.access(app, |connection| project(connection, project_id))
    }
    pub(crate) fn context_report(
        &self,
        app: &tauri::AppHandle,
        project_id: &str,
        artifact_id: &str,
    ) -> Result<Artifact, String> {
        self.access(app, |connection| {
            context_artifact(connection, project_id, artifact_id)
        })
    }
    pub(crate) fn repair_source(
        &self,
        app: &tauri::AppHandle,
        project_id: &str,
        artifact_id: &str,
    ) -> Result<(Project, Artifact, Run), String> {
        self.access(app, |connection| {
            let project = project(connection, project_id)?;
            let artifact = context_artifact(connection, project_id, artifact_id)?;
            let data: String = connection
                .query_row(
                    "SELECT data FROM runs WHERE id=?",
                    [&artifact.run_id],
                    |row| row.get(0),
                )
                .map_err(db_error)?;
            let run: Run = decode(data)?;
            crate::project_repair::trusted_source(&project, &artifact, &run, &versions(app)?)?;
            Ok((project, artifact, run))
        })
    }
    pub(crate) fn access<T>(
        &self,
        app: &tauri::AppHandle,
        action: impl FnOnce(&mut Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self.0.lock().map_err(|_| "项目存储状态不可用。")?;
        if matches!(*guard, StoreState::Closed) {
            return Err("应用正在退出。".into());
        }
        if matches!(*guard, StoreState::Uninitialized) {
            let directory = app
                .path()
                .app_data_dir()
                .map_err(|_| "无法定位项目存储目录。")?;
            std::fs::create_dir_all(&directory)
                .map_err(|e| format!("无法创建项目存储目录：{e}"))?;
            *guard = StoreState::Open(open_store(&directory.join("projects.sqlite3"))?);
        }
        match &mut *guard {
            StoreState::Open(store) => action(&mut store.connection),
            _ => Err("项目存储不可用。".into()),
        }
    }
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.0.lock() {
            let previous = std::mem::replace(&mut *guard, StoreState::Closed);
            if let StoreState::Open(store) = previous {
                match store
                    .connection
                    .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
                        row.get::<_, i64>(0)
                    }) {
                    Ok(0) => {}
                    Ok(_) => crate::diagnostics::record_reason(
                        "project_store",
                        "warn",
                        "db_shutdown_checkpoint",
                        "checkpoint_busy",
                    ),
                    Err(err) => crate::diagnostics::record_sqlite_error(
                        "project_store",
                        "db_shutdown_checkpoint_failed",
                        err.sqlite_error_code().map(|c| c as i32),
                    ),
                }
            }
        }
    }
}
fn context_artifact(
    connection: &Connection,
    project_id: &str,
    artifact_id: &str,
) -> Result<Artifact, String> {
    project(connection, project_id)?;
    let value = artifact(connection, artifact_id)?;
    if value.project_id.as_deref() != Some(project_id) {
        return Err("报告不属于当前项目。".into());
    }
    Ok(value)
}
fn save(connection: &mut Connection, input: ProjectInput) -> Result<Project, String> {
    id(&input.id)?;
    crate::tool_runner::subject(&input.subject)?;
    let name = input.name.trim();
    if name.is_empty()
        || name.chars().count() > 120
        || name.chars().any(char::is_control)
        || input.directory.len() > 32768
    {
        return Err("项目名称或目录无效。".into());
    }
    let directory = crate::tool_runner::directory(&input.directory)?
        .to_string_lossy()
        .into_owned();
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let previous: Option<String> = tx
        .query_row("SELECT data FROM projects WHERE id=?", [&input.id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(db_error)?;
    let timestamp = now();
    let (revision, created_at, facts, context_revision) = if let Some(data) = previous {
        let previous: Project = decode(data)?;
        if input.expected_revision != Some(previous.revision) {
            return Err("项目已被其他操作更新，请刷新后重试。".into());
        }
        (
            previous
                .revision
                .checked_add(1)
                .filter(|revision| *revision <= 9_007_199_254_740_991)
                .ok_or("项目版本超出限制。")?,
            previous.created_at,
            previous.facts,
            previous.context_revision
                + u64::from(previous.directory != directory || previous.subject != input.subject),
        )
    } else {
        if input.expected_revision.is_some() {
            return Err("项目不存在，无法更新。".into());
        }
        let count: u32 = tx
            .query_row("SELECT count(*) FROM projects", [], |r| r.get(0))
            .map_err(db_error)?;
        if count >= 200 {
            return Err("项目数量已达 200 个，请在项目管理中归档不再使用的项目后重试。".into());
        }
        (1, timestamp, ProjectFacts::default(), 0)
    };
    let value = Project {
        id: input.id,
        name: name.into(),
        directory,
        subject: input.subject,
        revision,
        created_at,
        facts,
        context_revision,
        updated_at: timestamp,
        directory_available: true,
    };
    tx.execute("INSERT INTO projects(id,revision,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data",params![value.id,i64::try_from(revision).map_err(|_| "项目版本超出限制。")?,encode(&value)?]).map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(value)
}
fn snapshot(connection: &Connection) -> Result<Snapshot, String> {
    let mut projects: Vec<Project> = rows(
        connection,
        "SELECT data FROM projects ORDER BY rowid DESC LIMIT 200",
        None,
    )?;
    for value in &mut projects {
        value.directory_available = Path::new(&value.directory).is_dir();
    }
    let active_project_id = connection
        .query_row(
            "SELECT value FROM settings WHERE key='active_project'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(db_error)?
        .flatten();
    // Preserve each tool's latest attempt and saved result even outside the recent window.
    let runs = rows(
        connection,
        "SELECT data FROM runs WHERE rowid IN (SELECT rowid FROM runs ORDER BY rowid DESC LIMIT 200) OR rowid IN (SELECT MAX(rowid) FROM runs GROUP BY project_id,json_extract(data, '$.kind')) OR id IN (SELECT run_id FROM artifacts WHERE rowid IN (SELECT MAX(rowid) FROM artifacts GROUP BY project_id,json_extract(data, '$.kind'))) ORDER BY rowid DESC",
        None,
    )?;
    let mut artifacts: Vec<serde_json::Value> = rows(
        connection,
        "SELECT json_remove(data, '$.markdown', '$.data') FROM artifacts WHERE rowid IN (SELECT rowid FROM artifacts ORDER BY rowid DESC LIMIT 200) OR rowid IN (SELECT MAX(rowid) FROM artifacts GROUP BY project_id,json_extract(data, '$.kind')) ORDER BY rowid DESC",
        None,
    )?;
    for value in &mut artifacts {
        value
            .as_object_mut()
            .ok_or("成果记录格式损坏。")?
            .remove("markdown");
    }
    Ok(Snapshot {
        rules_version: None,
        projects,
        active_project_id,
        runs,
        artifacts,
    })
}
pub(crate) fn artifact(connection: &Connection, artifact_id: &str) -> Result<Artifact, String> {
    id(artifact_id)?;
    let data = connection
        .query_row(
            "SELECT data FROM artifacts WHERE id=?",
            [artifact_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or("成果不存在。")?;
    decode(data)
}
fn local_session_artifact(
    connection: &Connection,
    project_id: &str,
    artifact_id: &str,
) -> Result<Artifact, String> {
    id(project_id)?;
    id(artifact_id)?;
    let mismatch = "未找到与当前项目匹配的本机成功运行和报告。";
    let (artifact_data, run_data, run_id): (String, String, String) = connection
        .query_row(
            "SELECT a.data,r.data,r.id FROM artifacts a
             JOIN runs r ON r.id=a.run_id AND r.project_id=a.project_id
             JOIN projects p ON p.id=a.project_id
             WHERE a.id=?1 AND p.id=?2 AND json_extract(p.data,'$.id')=p.id AND r.state='succeeded'",
            params![artifact_id, project_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or(mismatch)?;
    let artifact: Artifact = decode(artifact_data)?;
    let run: Run = decode(run_data)?;
    if artifact.provenance.is_some()
        || run.provenance.is_some()
        || artifact.id != artifact_id
        || artifact.run_id != run_id
        || run.id != run_id
        || artifact.project_id.as_deref() != Some(project_id)
        || run.project_id != artifact.project_id
        || run.state != "succeeded"
        || run.kind != artifact.kind
        || run.project_revision != artifact.project_revision
        || run.context_revision != artifact.context_revision
        || run.tool_version != artifact.tool_version
        || run.rules_version != artifact.rules_version
    {
        return Err(mismatch.into());
    }
    Ok(artifact)
}
pub(crate) fn versions(app: &tauri::AppHandle) -> Result<(String, String), String> {
    let root = app
        .path()
        .resource_dir()
        .map_err(|_| "无法定位应用资源。")?
        .join("runtime");
    let read = |path: PathBuf| -> Result<serde_json::Value, String> {
        let data = std::fs::read(path).map_err(|_| "应用版本资料缺失，请重新安装。")?;
        serde_json::from_slice(&data).map_err(|_| "应用版本资料无效。".into())
    };
    let package = read(root.join("package.json"))?;
    let tool = package["version"]
        .as_str()
        .filter(|v| v.len() <= 80)
        .ok_or("工具版本缺失。")?
        .to_owned();
    let manifest = read(root.join("runtime-manifest.json"))?;
    let files = manifest["files"].as_object().ok_or("规则版本缺失。")?;
    let mut rules = BTreeMap::new();
    for (path, digest) in files {
        if path.starts_with("rules/") || path == "flow.yaml" || path == "rejections.yaml" {
            let digest = digest
                .as_str()
                .filter(|d| d.len() == 64 && d.bytes().all(|c| c.is_ascii_hexdigit()))
                .ok_or("规则摘要无效。")?;
            rules.insert(path, digest);
        }
    }
    if rules.is_empty() {
        return Err("规则版本缺失。".into());
    }
    Ok((tool, encode(&rules)?))
}
fn begin(
    connection: &mut Connection,
    project_id: Option<String>,
    kind: String,
    run_id: String,
    subject: Option<String>,
    version: (String, String),
) -> Result<(Run, Option<String>, String), String> {
    id(&run_id)?;
    if !["check", "guide", "explain"].contains(&kind.as_str()) {
        return Err("工具类型无效。".into());
    }
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if tx
        .query_row("SELECT 1 FROM runs WHERE id=?", [&run_id], |r| {
            r.get::<_, u8>(0)
        })
        .optional()
        .map_err(db_error)?
        .is_some()
    {
        return Err("此运行编号已使用，不会重复执行。请查看历史成果或新建运行。".into());
    }
    let count: u32 = tx
        .query_row("SELECT count(*) FROM runs", [], |r| r.get(0))
        .map_err(db_error)?;
    if count >= 10000 {
        return Err("运行历史已达 10000 条，请在项目管理中备份并归档旧项目后重试。".into());
    }
    let value = project_id.as_deref().map(|p| project(&tx, p)).transpose()?;
    if kind == "check" && value.is_none() {
        return Err("预检需要先选择项目。".into());
    }
    let subject = value
        .as_ref()
        .map(|p| p.subject.clone())
        .or(subject)
        .unwrap_or_else(|| "personal".into());
    crate::tool_runner::subject(&subject)?;
    let directory = value.as_ref().map(|p| p.directory.clone());
    let run = Run {
        provenance: None,
        source_state: None,
        agent_request_id: None,
        session_id: None,
        tool_call_id: None,
        id: run_id,
        project_id,
        kind,
        state: "running".into(),
        started_at: now(),
        finished_at: None,
        error: None,
        project_revision: value.as_ref().map(|p| p.revision),
        context_revision: value.as_ref().map(|p| p.context_revision),
        tool_version: version.0,
        rules_version: version.1,
        input_summary: encode(
            &serde_json::json!({"directory":directory,"subject":subject,"facts":value.as_ref().map(|p| &p.facts)}),
        )?,
    };
    tx.execute(
        "INSERT INTO runs(id,project_id,state,data) VALUES(?,?,?,?)",
        params![run.id, run.project_id, run.state, encode(&run)?],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok((run, directory, subject))
}
fn finish(
    connection: &mut Connection,
    run: Run,
    result: Result<String, crate::tool_runner::ToolFailure>,
) -> Result<Artifact, String> {
    finish_payload(connection, run, result, None)
}
fn finish_payload(
    connection: &mut Connection,
    mut run: Run,
    result: Result<String, crate::tool_runner::ToolFailure>,
    structured: Option<serde_json::Value>,
) -> Result<Artifact, String> {
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    run.finished_at = Some(now());
    let result = match result {
        Ok(markdown) if !markdown.trim().is_empty() && markdown.len() <= 2 * 1024 * 1024 => {
            Ok(markdown)
        }
        Ok(_) => Err("工具成果为空或超过保存限制。".into()),
        Err(e) => Err(e),
    };
    let output = match result {
        Ok(markdown) => {
            run.state = "succeeded".into();
            let value = Artifact {
                provenance: None,
                id: run.id.clone(),
                run_id: run.id.clone(),
                project_id: run.project_id.clone(),
                kind: run.kind.clone(),
                title: if run.kind == "check" {
                    "项目预检"
                } else if run.kind == "explain" {
                    "拒因解释"
                } else {
                    "提审清单"
                }
                .into(),
                data: structured,
                markdown,
                created_at: now(),
                project_revision: run.project_revision,
                context_revision: run.context_revision,
                tool_version: run.tool_version.clone(),
                rules_version: run.rules_version.clone(),
                input_summary: run.input_summary.clone(),
            };
            let data = encode(&value)?;
            let bytes: i64 = tx
                .query_row(
                    "SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM artifacts",
                    [],
                    |r| r.get(0),
                )
                .map_err(db_error)?;
            if bytes + data.len() as i64 > 64 * 1024 * 1024 {
                return Err("历史成果已达 64 MiB 保存上限，未覆盖旧成果；请在项目管理中备份并归档旧项目后重试。".into());
            }
            tx.execute(
                "INSERT INTO artifacts(id,run_id,project_id,data) VALUES(?,?,?,?)",
                params![value.id, value.run_id, value.project_id, data],
            )
            .map_err(db_error)?;
            Ok(value)
        }
        Err(error) => {
            run.state = if matches!(error, crate::tool_runner::ToolFailure::Canceled) {
                "canceled"
            } else {
                "failed"
            }
            .into();
            let message = error.to_string();
            run.error = Some(message.chars().take(2048).collect());
            Err(message)
        }
    };
    let changed = tx
        .execute(
            "UPDATE runs SET state=?,data=? WHERE id=? AND state='running'",
            params![run.state, encode(&run)?, run.id],
        )
        .map_err(db_error)?;
    if changed != 1 {
        return Err("运行状态已改变，未覆盖历史成果。".into());
    }
    tx.commit().map_err(db_error)?;
    output
}
fn finish_recoverable(
    connection: &mut Connection,
    run: Run,
    outcome: Result<String, crate::tool_runner::ToolFailure>,
    failures: &Mutex<BTreeMap<String, Run>>,
) -> Result<Artifact, String> {
    let result = finish(connection, run.clone(), outcome);
    if let Err(error) = &result {
        let stored_state =
            connection.query_row("SELECT state FROM runs WHERE id=?", [&run.id], |r| {
                r.get::<_, String>(0)
            });
        if stored_state.is_err() || stored_state.is_ok_and(|state| state == "running") {
            // A smaller terminal record can often commit after a report hits the logical capacity limit.
            let recovery = finish(
                connection,
                run.clone(),
                Err(format!("运行已结束，但成果保存失败：{error}").into()),
            );
            let terminal_saved = connection
                .query_row("SELECT state FROM runs WHERE id=?", [&run.id], |r| {
                    r.get::<_, String>(0)
                })
                .is_ok_and(|state| state != "running");
            if !terminal_saved {
                let mut terminal = run;
                terminal.state = "failed".into();
                terminal.finished_at = Some(now());
                terminal.error = Some(format!("运行已结束，但状态未能保存；本次状态仅在当前应用可见，重启后显示中断。请释放空间或恢复写入权限。{error}"));
                failures
                    .lock()
                    .map_err(|_| "运行恢复状态不可用。")?
                    .insert(terminal.id.clone(), terminal);
            }
            drop(recovery);
        }
    }
    result
}
fn select(connection: &Connection, project_id: Option<String>) -> Result<(), String> {
    if let Some(value) = &project_id {
        project(connection, value)?;
    }
    connection.execute(
        "INSERT INTO settings(key,value) VALUES('active_project',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [project_id],
    ).map_err(db_error)?;
    Ok(())
}
fn export(connection: &mut Connection, project_id: &str) -> Result<String, String> {
    let tx = connection.transaction().map_err(db_error)?;
    export_snapshot(&tx, project_id)
}
fn export_snapshot(connection: &Connection, project_id: &str) -> Result<String, String> {
    let value = project(connection, project_id)?;
    let runs: Vec<Run> = rows(
        connection,
        "SELECT data FROM runs WHERE project_id=? ORDER BY rowid",
        Some(project_id),
    )?;
    let artifacts: Vec<Artifact> = rows(
        connection,
        "SELECT data FROM artifacts WHERE project_id=? ORDER BY rowid",
        Some(project_id),
    )?;
    let confirmations: Vec<serde_json::Value> = rows(
        connection,
        "SELECT data FROM stage_confirmations WHERE project_id=? ORDER BY id",
        Some(project_id),
    )?;
    let memory = crate::project_memory::export_document(connection, project_id)?;
    let maintenance = crate::project_maintenance::read_settings(connection, project_id)?;
    encode(
        &serde_json::json!({ "version": 2, "project": value, "runs": runs, "artifacts": artifacts, "confirmations": confirmations, "memory": memory, "maintenance": maintenance }),
    )
}
#[tauri::command]
pub fn project_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
) -> Result<Snapshot, String> {
    crate::runtime::authorize(&window)?;
    state.snapshot(&app)
}
pub(crate) fn active_agent_project(app: &tauri::AppHandle, project_id: &str) -> Result<(), String> {
    id(project_id)?;
    app.state::<ProjectStore>()
        .access(app, |c| validate_agent_project(c, project_id))
}
pub(crate) fn validate_agent_project(c: &Connection, project_id: &str) -> Result<(), String> {
    let active: Option<String> = c
        .query_row(
            "SELECT value FROM settings WHERE key='active_project'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(db_error)?
        .flatten();
    if active.as_deref() != Some(project_id) {
        return Err("请先选择当前项目，再启用项目工具。".into());
    }
    project(c, project_id)?;
    Ok(())
}

pub(crate) struct AgentRun {
    pub request_id: String,
    pub session_id: String,
    pub tool_call_id: String,
    pub reservation: crate::tool_runner::Reservation,
}

#[tauri::command]
pub fn project_save(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project: ProjectInput,
) -> Result<Project, String> {
    crate::runtime::authorize(&window)?;
    let result = state.access(&app, |c| save(c, project))?;
    crate::project_maintenance::sync_after_project_change(&app);
    Ok(result)
}
#[tauri::command]
pub fn project_select(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: Option<String>,
) -> Result<(), String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |c| select(c, project_id))?;
    crate::project_maintenance::sync_after_project_change(&app);
    Ok(())
}
#[tauri::command]
pub fn project_artifact(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    artifact_id: String,
    local_project_id: Option<String>,
) -> Result<Artifact, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |c| match local_project_id {
        Some(project_id) => local_session_artifact(c, &project_id, &artifact_id),
        None => artifact(c, &artifact_id),
    })
}
#[tauri::command]
pub fn project_export(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
) -> Result<String, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |c| export(c, &project_id))
}
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn project_run(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: Option<String>,
    kind: String,
    run_id: String,
    subject: Option<String>,
    query: Option<String>,
) -> Result<Artifact, String> {
    crate::runtime::authorize(&window)?;
    run_internal(
        app,
        state.inner().clone(),
        project_id,
        kind,
        run_id,
        subject,
        query,
        None,
    )
    .await
    .map_err(|error| error.to_string())
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn run_internal(
    app: tauri::AppHandle,
    store: ProjectStore,
    project_id: Option<String>,
    kind: String,
    run_id: String,
    subject: Option<String>,
    query: Option<String>,
    agent: Option<AgentRun>,
) -> Result<Artifact, crate::tool_runner::ToolFailure> {
    run_internal_guarded(
        app, store, project_id, kind, run_id, subject, query, agent, None,
    )
    .await
}

pub(crate) async fn run_maintenance(
    app: tauri::AppHandle,
    store: ProjectStore,
    run_id: String,
    binding: crate::project_maintenance::RunBinding,
) -> Result<Artifact, crate::tool_runner::ToolFailure> {
    run_internal_guarded(
        app,
        store,
        Some(binding.project_id.clone()),
        "check".into(),
        run_id,
        None,
        None,
        None,
        Some(binding),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn run_internal_guarded(
    app: tauri::AppHandle,
    store: ProjectStore,
    project_id: Option<String>,
    kind: String,
    run_id: String,
    subject: Option<String>,
    query: Option<String>,
    agent: Option<AgentRun>,
    maintenance: Option<crate::project_maintenance::RunBinding>,
) -> Result<Artifact, crate::tool_runner::ToolFailure> {
    let runner = app
        .state::<crate::tool_runner::ToolRunner>()
        .inner()
        .clone();
    // Establish cancellation identity before version IO or SQLite lock waiting.
    let (reservation, linkage) = if let Some(agent) = agent {
        (
            agent.reservation,
            Some((agent.request_id, agent.session_id, agent.tool_call_id)),
        )
    } else if maintenance.is_some() {
        (runner.reserve_guard_outcome(&run_id)?, None)
    } else {
        (runner.reserve_guard(&run_id)?, None)
    };
    if let Some(binding) = &maintenance {
        app.state::<crate::project_maintenance::ProjectMaintenance>()
            .validate_run(&app, binding)?;
        app.state::<crate::project_maintenance::ProjectMaintenance>()
            .started(&app, binding, &run_id)?;
    }
    let version = versions(&app)?;
    let query = query.unwrap_or_default();
    if kind == "explain" && (query.trim().is_empty() || query.chars().count() > 4096) {
        return Err("请输入 1–4096 字拒因。".into());
    }
    let (mut run, directory, _) = store.access(&app, |c| {
        begin(c, project_id, kind, run_id, subject, version)
    })?;
    let prepared = (|| {
        if let Some((request_id, session_id, tool_call_id)) = linkage {
            run.agent_request_id = Some(request_id);
            run.session_id = Some(session_id);
            run.tool_call_id = Some(tool_call_id);
        }
        let mut input: serde_json::Value =
            serde_json::from_str(&run.input_summary).map_err(|_| "工具输入无效。")?;
        input["query"] = serde_json::json!(query);
        run.input_summary = encode(&input)?;
        store.access(&app, |c| {
            c.execute(
                "UPDATE runs SET data=? WHERE id=?",
                params![encode(&run)?, run.id],
            )
            .map_err(db_error)?;
            Ok(())
        })?;
        if run.kind == "check" {
            crate::tool_runner::directory(directory.as_deref().ok_or("项目目录缺失。")?)?;
        }
        let mut command = crate::runtime::node_command(&app, "src/project-tool.mjs", false)?;
        command.arg(&run.kind).arg(encode(&input)?);
        Ok::<_, String>(command)
    })();
    let command = match prepared {
        Ok(command) => command,
        Err(error) => {
            return store
                .finish(&app, run, Err(error.into()))
                .map_err(Into::into)
        }
    };
    // Reserve before dispatch so stopping while the worker is queued prevents process launch.
    let application = app.clone();
    let completion_binding = maintenance.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _reservation = reservation;
        let validate = || match &maintenance {
            Some(binding) => application
                .state::<crate::project_maintenance::ProjectMaintenance>()
                .validate_run(&application, binding),
            None => Ok(()),
        };
        let result = validate()
            .and_then(|()| {
                runner.run_reserved_outcome(command, run.id.clone(), run.kind == "check")
            })
            .and_then(|text| validate().map(|()| text));
        match result {
            Ok(text) => match parse_envelope(&text, &run.kind) {
                Ok((markdown, data)) => {
                    if let Some(binding) = &maintenance {
                        let saved = application
                            .state::<crate::project_maintenance::ProjectMaintenance>()
                            .commit_run(&application, binding, |c| {
                                finish_structured(c, run.clone(), markdown, data, &store.1)
                            });
                        if let Err(error) = &saved {
                            let _ = store.finish(&application, run, Err(error.clone()));
                        }
                        saved
                    } else {
                        store
                            .access(&application, |c| {
                                finish_structured(c, run, markdown, data, &store.1)
                            })
                            .map_err(Into::into)
                    }
                }
                Err(error) => store
                    .finish(&application, run, Err(error.into()))
                    .map_err(Into::into),
            },
            Err(error) => store
                .finish(&application, run, Err(error.clone()))
                .map_err(|message| match error {
                    crate::tool_runner::ToolFailure::Failed(_) => message.into(),
                    other => other,
                }),
        }
    })
    .await
    .map_err(|_| "本地任务异常退出；运行记录会在重启后恢复为中断。".to_string())?;
    if let Ok(report) = &result {
        app.state::<crate::project_maintenance::ProjectMaintenance>()
            .completed(&app, report, completion_binding.as_ref());
    }
    result
}

include!("project_workflow.rs");
include!("project_backup.rs");

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_maintenance as maintenance;
    use crate::project_memory::{self as memory, MemoryInput};
    fn maintenance_report(
        c: &mut Connection,
        project_id: &str,
        run_id: &str,
        rules: &str,
        hash: char,
        rule_ids: &[&str],
    ) -> Artifact {
        let (run, _, _) = begin(
            c,
            Some(project_id.into()),
            "check".into(),
            run_id.into(),
            None,
            ("1".into(), rules.into()),
        )
        .unwrap();
        let scope = serde_json::json!({"root":"test-project","policyVersion":"1","complete":true,"filesHash":hash.to_string().repeat(64)});
        let items: Vec<_> = rule_ids.iter().map(|id| serde_json::json!({"ruleId":id,"title":"Local check","stage":"review","severity":"warn","requires":[]})).collect();
        let payload = serde_json::json!({"schemaVersion":1,"kind":"check","scope":scope,"result":{"command":"check","items":items,"meta":{"scan":{"scope":scope,"filesScanned":1,"readErrors":0,"skippedDirs":0,"skippedLinks":0,"skippedLargeFiles":0,"truncated":false,"configErrors":[]}}}});
        finish_structured(
            c,
            run,
            "Local report".into(),
            payload,
            &Mutex::new(BTreeMap::new()),
        )
        .unwrap()
    }
    #[test]
    fn maintenance_settings_default_off_persist_and_isolate_cas() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        save(&mut c, f.input("two", None)).unwrap();
        let initial = maintenance::read_settings(&c, "one").unwrap();
        assert!(!initial.watch_enabled && !initial.notifications_enabled);
        assert!(maintenance::save_settings(&mut c, "one", 0, true, true).is_err());
        select(&c, Some("one".into())).unwrap();
        let saved = maintenance::save_settings(&mut c, "one", 0, true, false).unwrap();
        assert!(saved.watch_enabled && !saved.notifications_enabled);
        assert!(maintenance::save_settings(&mut c, "one", 0, false, true).is_err());
        assert!(!maintenance::read_settings(&c, "two").unwrap().watch_enabled);
        drop(c);
        let mut c = open_database(&f.path).unwrap();
        assert_eq!(maintenance::read_settings(&c, "one").unwrap().revision, 1);
        select(&c, Some("two".into())).unwrap();
        assert!(maintenance::save_settings(&mut c, "one", 1, false, true).is_err());
        assert!(maintenance::mark_read(&mut c, "one", &["notice".into()]).is_err());
        select(&c, Some("one".into())).unwrap();
        let disabled = maintenance::save_settings(&mut c, "one", 1, false, true).unwrap();
        assert!(!disabled.watch_enabled && disabled.notifications_enabled);
        assert_eq!(
            c.query_row("SELECT count(*) FROM runs", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn maintenance_notices_use_successful_comparable_baseline_and_persist_dedup() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        maintenance_report(&mut c, "one", "baseline", "rules", 'a', &["old"]);
        maintenance::save_settings(&mut c, "one", 0, false, true).unwrap();
        maintenance_report(&mut c, "one", "added", "rules", 'a', &["old", "new"]);
        let state = maintenance::record_report(&mut c, "one", "added").unwrap();
        assert_eq!(state.notices.len(), 1);
        assert_eq!(state.notices[0].new_count, 1);
        assert_eq!(state.notices[0].artifact_id, "added");
        assert_eq!(
            maintenance::record_report(&mut c, "one", "added")
                .unwrap()
                .notices
                .len(),
            1
        );
        let read = maintenance::mark_read(&mut c, "one", &["added".into()]).unwrap();
        assert!(read.notices[0].read);
        assert_eq!(read.revision, 1);
        assert!(maintenance::mark_read(&mut c, "one", &["foreign".into()]).is_err());
        drop(c);
        let mut c = open_database(&f.path).unwrap();
        maintenance_report(&mut c, "one", "gone", "rules", 'a', &["old"]);
        maintenance::record_report(&mut c, "one", "gone").unwrap();
        maintenance_report(&mut c, "one", "returned", "rules", 'a', &["old", "new"]);
        assert_eq!(
            maintenance::record_report(&mut c, "one", "returned")
                .unwrap()
                .notices
                .len(),
            1
        );
        maintenance_report(
            &mut c,
            "one",
            "new-scope",
            "rules",
            'b',
            &["old", "new", "scope-rule"],
        );
        assert_eq!(
            maintenance::record_report(&mut c, "one", "new-scope")
                .unwrap()
                .notices
                .len(),
            1
        );
        maintenance_report(&mut c, "one", "new-rules", "rules-v2", 'b', &["rule-v2"]);
        assert_eq!(
            maintenance::record_report(&mut c, "one", "new-rules")
                .unwrap()
                .notices
                .len(),
            1
        );
        maintenance::save_settings(&mut c, "one", 1, false, false).unwrap();
        maintenance_report(
            &mut c,
            "one",
            "muted",
            "rules-v2",
            'b',
            &["rule-v2", "muted-rule"],
        );
        assert_eq!(
            maintenance::record_report(&mut c, "one", "muted")
                .unwrap()
                .notices
                .len(),
            1
        );
        maintenance::save_settings(&mut c, "one", 2, false, true).unwrap();
        maintenance_report(
            &mut c,
            "one",
            "unmuted",
            "rules-v2",
            'b',
            &["rule-v2", "muted-rule"],
        );
        assert_eq!(
            maintenance::record_report(&mut c, "one", "unmuted")
                .unwrap()
                .notices
                .len(),
            1
        );
    }
    #[test]
    fn maintenance_first_incomplete_foreign_and_stale_reports_do_not_notify() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        save(&mut c, f.input("two", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        maintenance::save_settings(&mut c, "one", 0, false, true).unwrap();
        maintenance_report(&mut c, "one", "first", "rules", 'a', &["initial"]);
        assert!(maintenance::record_report(&mut c, "one", "first")
            .unwrap()
            .notices
            .is_empty());
        maintenance_report(&mut c, "two", "foreign", "rules", 'a', &["foreign"]);
        assert!(maintenance::record_report(&mut c, "one", "foreign")
            .unwrap()
            .notices
            .is_empty());
        let mut incomplete = maintenance_report(
            &mut c,
            "one",
            "incomplete",
            "rules",
            'a',
            &["initial", "new"],
        );
        incomplete.data.as_mut().unwrap()["result"]["meta"]["scan"]["truncated"] =
            serde_json::json!(true);
        c.execute(
            "UPDATE artifacts SET data=? WHERE id='incomplete'",
            [encode(&incomplete).unwrap()],
        )
        .unwrap();
        assert!(maintenance::record_report(&mut c, "one", "incomplete")
            .unwrap()
            .notices
            .is_empty());
        let mut stale =
            maintenance_report(&mut c, "one", "stale", "rules", 'a', &["initial", "new"]);
        stale.context_revision = Some(1);
        c.execute(
            "UPDATE artifacts SET data=? WHERE id='stale'",
            [encode(&stale).unwrap()],
        )
        .unwrap();
        let ignored = maintenance::record_report(&mut c, "one", "stale").unwrap();
        assert!(ignored.notices.is_empty());
        assert_eq!(ignored.last_checked_at, Some(incomplete.created_at));
    }
    #[test]
    fn maintenance_inbox_is_bounded_and_corrupt_settings_are_not_overwritten() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        maintenance::save_settings(&mut c, "one", 0, false, true).unwrap();
        maintenance_report(&mut c, "one", "base", "rules", 'a', &[]);
        maintenance::record_report(&mut c, "one", "base").unwrap();
        for index in 0..55 {
            let run_id = format!("notice-{index}");
            let rule_id = format!("rule-{index}");
            maintenance_report(&mut c, "one", &run_id, "rules", 'a', &[&rule_id]);
            maintenance::record_report(&mut c, "one", &run_id).unwrap();
        }
        let saved = maintenance::read_settings(&c, "one").unwrap();
        assert_eq!(saved.notices.len(), 50);
        assert_eq!(saved.notices[0].artifact_id, "notice-54");
        assert_eq!(saved.revision, 1);
        c.execute(
            "UPDATE settings SET value='bad-json' WHERE key='project_maintenance:one'",
            [],
        )
        .unwrap();
        assert!(maintenance::save_settings(&mut c, "one", 1, false, false).is_err());
        let retained: String = c
            .query_row(
                "SELECT value FROM settings WHERE key='project_maintenance:one'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(retained, "bad-json");
    }
    fn memory_input(id: &str, text: &str, enabled: bool) -> MemoryInput {
        MemoryInput {
            id: id.into(),
            title: "项目偏好".into(),
            text: text.into(),
            enabled,
        }
    }
    #[test]
    fn memory_persists_reopens_exports_and_preserves_server_owned_metadata() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        let empty = memory::snapshot(&mut c, "one").unwrap();
        assert_eq!(empty.revision, 0);
        assert!(empty.entries.is_empty());
        let saved = memory::save(
            &mut c,
            "one",
            0,
            memory_input("note", "使用简体中文。", false),
        )
        .unwrap();
        assert_eq!(saved.revision, 1);
        assert_eq!(
            serde_json::to_value(&saved.entries[0]).unwrap()["source"],
            "user"
        );
        let created = saved.entries[0].created_at;
        drop(c);
        let mut c = open_database(&f.path).unwrap();
        let reopened = memory::snapshot(&mut c, "one").unwrap();
        assert_eq!(reopened.entries[0].text, "使用简体中文。");
        assert!(!reopened.entries[0].enabled);
        let updated = memory::save(
            &mut c,
            "one",
            1,
            memory_input("note", "优先列出验收步骤。", true),
        )
        .unwrap();
        assert_eq!(updated.entries[0].created_at, created);
        assert!(updated.entries[0].updated_at >= created);
        let exported: serde_json::Value =
            serde_json::from_str(&export(&mut c, "one").unwrap()).unwrap();
        assert_eq!(exported["version"], 2);
        assert_eq!(exported["memory"]["schemaVersion"], 1);
        assert_eq!(exported["memory"]["projectId"], "one");
        assert_eq!(exported["memory"]["revision"], 2);
        assert_eq!(
            exported["memory"]["entries"][0]["text"],
            "优先列出验收步骤。"
        );
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            2
        );
    }
    #[test]
    fn memory_enforces_active_project_isolation_and_optimistic_writes() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        save(&mut c, f.input("two", None)).unwrap();
        assert!(memory::snapshot(&mut c, "one").is_err());
        select(&c, Some("one".into())).unwrap();
        memory::save(&mut c, "one", 0, memory_input("note", "Project one", true)).unwrap();
        assert!(memory::save(&mut c, "one", 0, memory_input("note", "Stale edit", true)).is_err());
        assert!(memory::delete(&mut c, "one", 0, "note").is_err());
        select(&c, Some("two".into())).unwrap();
        assert!(memory::snapshot(&mut c, "one").is_err());
        assert!(memory::save(
            &mut c,
            "one",
            1,
            memory_input("note", "Cross project", true)
        )
        .is_err());
        assert!(memory::delete(&mut c, "one", 1, "note").is_err());
        assert!(memory::resolve(&mut c, "one", &["note".into()]).is_err());
        assert!(memory::snapshot(&mut c, "missing").is_err());
        assert!(memory::snapshot(&mut c, "../one").is_err());
        assert!(memory::snapshot(&mut c, "two").unwrap().entries.is_empty());
        select(&c, Some("one".into())).unwrap();
        assert_eq!(
            memory::snapshot(&mut c, "one").unwrap().entries[0].text,
            "Project one"
        );
    }
    #[test]
    fn memory_resolves_latest_enabled_content_and_rejects_stale_selections() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        memory::save(&mut c, "one", 0, memory_input("note", "Old text", false)).unwrap();
        assert!(memory::resolve(&mut c, "one", &["note".into()]).is_err());
        memory::save(
            &mut c,
            "one",
            1,
            memory_input("note", "Latest text 中文", true),
        )
        .unwrap();
        let context = memory::resolve(&mut c, "one", &["note".into()]).unwrap();
        assert_eq!(context[0].id, "memory:note");
        assert_eq!(context[0].kind, "memory");
        assert_eq!(context[0].text, "Latest text 中文");
        assert_eq!(context[0].bytes, "Latest text 中文".len());
        assert_eq!(context[0].context_revision, Some(2));
        assert!(memory::resolve(&mut c, "one", &["note".into(), "note".into()]).is_err());
        assert!(memory::resolve(&mut c, "one", &[]).is_err());
        assert!(memory::resolve(&mut c, "one", &vec!["note".into(); 9]).is_err());
        assert!(memory::resolve(&mut c, "one", &[String::new()]).is_err());
        let deleted = memory::delete(&mut c, "one", 2, "note").unwrap();
        assert_eq!(deleted.revision, 3);
        assert!(deleted.entries.is_empty());
        assert!(memory::resolve(&mut c, "one", &["note".into()]).is_err());
        assert!(memory::delete(&mut c, "one", 3, "note").is_err());
    }
    #[test]
    fn memory_rejects_forged_input_secrets_control_characters_and_oversized_text() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        for extra in ["source", "createdAt", "updatedAt"] {
            let mut input =
                serde_json::json!({"id":"note","title":"Title","text":"Hello","enabled":false});
            input[extra] = serde_json::json!("system");
            assert!(serde_json::from_value::<MemoryInput>(input).is_err());
        }
        for text in [
            "",
            "  ",
            "sk-private-value",
            "Bearer abc",
            "a\0b",
            &"界".repeat(1366),
        ] {
            assert!(memory::save(&mut c, "one", 0, memory_input("note", text, false)).is_err());
        }
        for title in [
            "".into(),
            "a\nb".into(),
            "界".repeat(81),
            "sk-private".into(),
        ] {
            let mut input = memory_input("note", "Valid content", false);
            input.title = title;
            assert!(memory::save(&mut c, "one", 0, input).is_err());
        }
        assert!(memory::snapshot(&mut c, "one").unwrap().entries.is_empty());
    }
    #[test]
    fn memory_quotas_are_atomic_and_updates_can_replace_at_capacity() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        for n in 0..4 {
            memory::save(
                &mut c,
                "one",
                n,
                memory_input(&format!("note-{n}"), &"a".repeat(4096), false),
            )
            .unwrap();
        }
        assert!(memory::save(&mut c, "one", 4, memory_input("overflow", "x", false)).is_err());
        assert_eq!(memory::snapshot(&mut c, "one").unwrap().revision, 4);
        memory::save(&mut c, "one", 4, memory_input("note-0", "Short", false)).unwrap();
        for n in 4..20 {
            memory::save(
                &mut c,
                "one",
                n + 1,
                memory_input(&format!("note-{n}"), "x", false),
            )
            .unwrap();
        }
        assert!(memory::save(&mut c, "one", 21, memory_input("twenty-first", "x", false)).is_err());
        assert_eq!(memory::snapshot(&mut c, "one").unwrap().entries.len(), 20);
        memory::save(
            &mut c,
            "one",
            21,
            memory_input("note-19", "replacement", true),
        )
        .unwrap();
    }
    #[test]
    fn memory_rejects_corrupt_or_foreign_documents_without_overwriting_them() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        memory::save(
            &mut c,
            "one",
            0,
            memory_input("note", "Local preference", true),
        )
        .unwrap();
        let original: String = c
            .query_row(
                "SELECT value FROM settings WHERE key='project_memory:one'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let mut corruptions = vec!["invalid JSON".into()];
        for (key, value) in [
            ("schemaVersion", serde_json::json!(2)),
            ("projectId", serde_json::json!("two")),
        ] {
            let mut doc: serde_json::Value = serde_json::from_str(&original).unwrap();
            doc[key] = value;
            corruptions.push(doc.to_string());
        }
        let mut doc: serde_json::Value = serde_json::from_str(&original).unwrap();
        doc["entries"][0]["source"] = serde_json::json!("model");
        corruptions.push(doc.to_string());
        let mut doc: serde_json::Value = serde_json::from_str(&original).unwrap();
        doc["entries"][0]["text"] = serde_json::json!("Bearer secret");
        corruptions.push(doc.to_string());
        for corrupted in corruptions {
            c.execute(
                "UPDATE settings SET value=? WHERE key='project_memory:one'",
                [&corrupted],
            )
            .unwrap();
            assert!(memory::snapshot(&mut c, "one").is_err());
            assert!(memory::save(
                &mut c,
                "one",
                1,
                memory_input("note", "Recovery overwrite", false)
            )
            .is_err());
            assert!(memory::resolve(&mut c, "one", &["note".into()]).is_err());
            let retained: String = c
                .query_row(
                    "SELECT value FROM settings WHERE key='project_memory:one'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(retained, corrupted);
        }
    }
    #[test]
    fn agent_binding_requires_current_saved_project_and_keeps_run_linkage() {
        let fixture = Fixture::new();
        let mut store = open_store(&fixture.path).unwrap();
        let c = &mut store.connection;
        save(c, fixture.input("p", None)).unwrap();
        assert!(validate_agent_project(c, "p").is_err());
        select(c, Some("p".into())).unwrap();
        assert!(validate_agent_project(c, "p").is_ok());
        assert!(validate_agent_project(c, "forged").is_err());
        let mut run = start(c, Some("p"), "agent-run");
        run.agent_request_id = Some("request".into());
        run.session_id = Some("session".into());
        run.tool_call_id = Some("call".into());
        finish(c, run, Ok("local result".into())).unwrap();
        let snapshot = snapshot(c).unwrap();
        assert_eq!(
            snapshot.runs[0].agent_request_id.as_deref(),
            Some("request")
        );
        assert_eq!(snapshot.runs[0].session_id.as_deref(), Some("session"));
        assert_eq!(snapshot.runs[0].tool_call_id.as_deref(), Some("call"));
        let legacy = serde_json::to_value(start(c, Some("p"), "legacy-run")).unwrap();
        assert!(legacy.get("agentRequestId").is_none());
        assert!(serde_json::from_value::<Run>(legacy)
            .unwrap()
            .agent_request_id
            .is_none());
    }
    static FIXTURE_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    struct Fixture {
        root: PathBuf,
        path: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "shipmate-project-test-{}-{}-{}",
                FIXTURE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(&root).unwrap();
            Self {
                path: root.join("projects.sqlite3"),
                root,
            }
        }
        fn input(&self, id_value: &str, revision: Option<u64>) -> ProjectInput {
            ProjectInput {
                id: id_value.into(),
                name: format!("项目 {id_value}"),
                directory: self.root.to_string_lossy().into_owned(),
                subject: "personal".into(),
                expected_revision: revision,
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
    fn start(c: &mut Connection, p: Option<&str>, run_id: &str) -> Run {
        begin(
            c,
            p.map(str::to_string),
            "guide".into(),
            run_id.into(),
            Some("personal".into()),
            ("0.1.0".into(), "{}".into()),
        )
        .unwrap()
        .0
    }
    #[test]
    fn malformed_v1_is_rejected_without_migration_writes() {
        let f = Fixture::new();
        let c = Connection::open(&f.path).unwrap();
        c.execute_batch("CREATE TABLE projects(id TEXT); PRAGMA user_version=1;")
            .unwrap();
        drop(c);
        let bytes = std::fs::read(&f.path).unwrap();
        assert!(open_database(&f.path).is_err());
        assert_eq!(std::fs::read(&f.path).unwrap(), bytes);
    }
    #[test]
    fn workflow_guards_unknown_inapplicable_stale_and_revoked_dependencies() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        let mut p = save(&mut c, f.input("one", None)).unwrap();
        let catalog = serde_json::json!({"stages":[{"stage":"privacy","applies_when":"collects_sensitive == true"},{"stage":"review","requires_stage":["privacy"]}]});
        assert!(validate_stage(&c, &p, &catalog, "rules", "privacy", "confirmed").is_err());
        assert!(validate_stage(&c, &p, &catalog, "rules", "privacy", "pending").is_ok());
        assert!(validate_stage(&c, &p, &catalog, "rules", "review", "confirmed").is_err());
        p.facts.collects_sensitive = Some(false);
        assert!(validate_stage(&c, &p, &catalog, "rules", "privacy", "confirmed").is_err());
        assert!(validate_stage(&c, &p, &catalog, "rules", "privacy", "not_applicable").is_ok());
        let record = serde_json::json!({"stageId":"privacy","state":"not_applicable","contextRevision":0,"rulesVersion":"rules"});
        c.execute(
            "INSERT INTO stage_confirmations(project_id,data) VALUES(?,?)",
            params![p.id, record.to_string()],
        )
        .unwrap();
        assert!(validate_stage(&c, &p, &catalog, "rules", "review", "confirmed").is_ok());
        assert!(validate_stage(&c, &p, &catalog, "new-rules", "review", "confirmed").is_err());
        p.context_revision = 1;
        assert!(validate_stage(&c, &p, &catalog, "rules", "review", "confirmed").is_err());
        p.context_revision = 0;
        let pending = serde_json::json!({"stageId":"privacy","state":"pending","contextRevision":0,"rulesVersion":"rules"});
        c.execute(
            "INSERT INTO stage_confirmations(project_id,data) VALUES(?,?)",
            params![p.id, pending.to_string()],
        )
        .unwrap();
        assert!(validate_stage(&c, &p, &catalog, "rules", "review", "confirmed").is_err());
    }
    #[test]
    fn structured_report_persists_payload_in_same_commit() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        let (run, _, _) = begin(
            &mut c,
            Some("one".into()),
            "guide".into(),
            "structured".into(),
            None,
            ("1".into(), "r".into()),
        )
        .unwrap();
        let payload = serde_json::json!({"schemaVersion":1,"kind":"guide","result":{"command":"guide","items":[]},"scope":null});
        let failures = Mutex::new(BTreeMap::new());
        finish_structured(&mut c, run, "report".into(), payload.clone(), &failures).unwrap();
        assert_eq!(artifact(&c, "structured").unwrap().data, Some(payload));
        assert!(snapshot(&c).unwrap().artifacts[0].get("data").is_none());
    }
    #[test]
    fn v1_upgrade_preserves_projects_and_separates_context_revision() {
        let f = Fixture::new();
        let mut legacy = Connection::open(&f.path).unwrap();
        migrate(&mut legacy, SCHEMA).unwrap();
        let original = save(&mut legacy, f.input("one", None)).unwrap();
        drop(legacy);
        let mut c = open_database(&f.path).unwrap();
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            2
        );
        assert_eq!(project(&c, "one").unwrap().created_at, original.created_at);
        assert_eq!(project(&c, "one").unwrap().facts.has_payment, None);
        let mut renamed = f.input("one", Some(1));
        renamed.name = "renamed".into();
        assert_eq!(save(&mut c, renamed).unwrap().context_revision, 0);
        let mut changed = f.input("one", Some(2));
        changed.subject = "enterprise".into();
        assert_eq!(save(&mut c, changed).unwrap().context_revision, 1);
        let backup = std::fs::read_dir(&f.root)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| p.to_string_lossy().contains("pre-v2"))
            .unwrap();
        let old = Connection::open(backup).unwrap();
        assert_eq!(
            old.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn second_app_instance_cannot_interrupt_live_runs() {
        let f = Fixture::new();
        let mut first = open_store(&f.path).unwrap();
        start(&mut first.connection, None, "active");
        assert!(open_store(&f.path).is_err());
        assert_eq!(
            snapshot(&first.connection).unwrap().runs[0].state,
            "running"
        );
        drop(first);
        let next = open_store(&f.path).unwrap();
        assert_eq!(
            snapshot(&next.connection).unwrap().runs[0].state,
            "interrupted"
        );
    }
    #[test]
    fn project_and_artifact_survive_reopen_with_snapshot_provenance() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        let p = save(&mut c, f.input("one", None)).unwrap();
        let run = start(&mut c, Some("one"), "run-one");
        let a = finish(&mut c, run, Ok("# 原始报告".into())).unwrap();
        assert_eq!(a.project_revision, Some(p.revision));
        save(&mut c, f.input("one", Some(1))).unwrap();
        drop(c);
        let c = open_database(&f.path).unwrap();
        assert_eq!(project(&c, "one").unwrap().revision, 2);
        assert_eq!(artifact(&c, "run-one").unwrap().markdown, "# 原始报告");
        let s = snapshot(&c).unwrap();
        assert_eq!(s.artifacts[0]["projectRevision"], 1);
        assert!(s.artifacts[0].get("markdown").is_none());
    }
    #[test]
    fn failed_and_canceled_runs_preserve_previous_artifacts() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        let run = start(&mut c, None, "ok");
        finish(&mut c, run, Ok("保存报告".into())).unwrap();
        for (name, message) in [("failed", "工具失败"), ("canceled", "已停止本地工具。")]
        {
            let run = start(&mut c, None, name);
            assert_eq!(
                finish(
                    &mut c,
                    run,
                    Err(if name == "canceled" {
                        crate::tool_runner::ToolFailure::Canceled
                    } else {
                        message.into()
                    })
                )
                .unwrap_err(),
                message
            );
        }
        let s = snapshot(&c).unwrap();
        assert_eq!(s.artifacts.len(), 1);
        assert_eq!(
            s.runs.iter().find(|r| r.id == "failed").unwrap().state,
            "failed"
        );
        assert_eq!(
            s.runs.iter().find(|r| r.id == "canceled").unwrap().state,
            "canceled"
        );
        assert_eq!(artifact(&c, "ok").unwrap().markdown, "保存报告");
    }
    #[test]
    fn context_reports_cannot_cross_project_boundaries() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        save(&mut c, f.input("two", None)).unwrap();
        let run = start(&mut c, Some("one"), "context-report");
        finish(&mut c, run, Ok("explicit report".into())).unwrap();
        assert!(context_artifact(&c, "one", "context-report").is_ok());
        assert!(context_artifact(&c, "two", "context-report").is_err());
        assert!(context_artifact(&c, "missing", "context-report").is_err());
    }
    #[test]
    fn duplicate_run_ids_never_execute_twice() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        let run = start(&mut c, None, "once");
        finish(&mut c, run, Ok("ok".into())).unwrap();
        assert!(begin(
            &mut c,
            None,
            "guide".into(),
            "once".into(),
            None,
            ("1".into(), "{}".into())
        )
        .unwrap_err()
        .contains("不会重复执行"));
        assert_eq!(snapshot(&c).unwrap().runs.len(), 1);
    }
    #[test]
    fn reopening_recovers_interrupted_runs_once() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        start(&mut c, None, "interrupted");
        drop(c);
        let mut c = open_database(&f.path).unwrap();
        assert_eq!(snapshot(&c).unwrap().runs[0].state, "interrupted");
        start(&mut c, None, "active");
        assert_eq!(snapshot(&c).unwrap().runs[0].state, "running");
    }
    #[test]
    fn missing_directory_keeps_project_and_report_readable() {
        let f = Fixture::new();
        let nested = f.root.join("move-me");
        std::fs::create_dir(&nested).unwrap();
        let mut input = f.input("one", None);
        input.directory = nested.to_string_lossy().into_owned();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, input).unwrap();
        let run = start(&mut c, Some("one"), "run");
        finish(&mut c, run, Ok("report".into())).unwrap();
        std::fs::remove_dir(nested).unwrap();
        assert!(!project(&c, "one").unwrap().directory_available);
        assert_eq!(artifact(&c, "run").unwrap().markdown, "report");
        save(&mut c, f.input("one", Some(1))).unwrap();
        assert!(project(&c, "one").unwrap().directory_available);
        assert_eq!(artifact(&c, "run").unwrap().project_revision, Some(1));
    }
    #[test]
    fn migration_failure_rolls_back_schema_and_version() {
        let f = Fixture::new();
        let mut c = Connection::open(&f.path).unwrap();
        assert!(migrate(&mut c, "CREATE TABLE partial(id TEXT); INVALID SQL;").is_err());
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name='partial'",
                [],
                |r| r.get::<_, u32>(0)
            )
            .unwrap(),
            0
        );
        migrate(&mut c, SCHEMA).unwrap();
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn migration_of_empty_legacy_database_has_consistent_backup() {
        let f = Fixture::new();
        drop(Connection::open(&f.path).unwrap());
        let c = open_database(&f.path).unwrap();
        drop(c);
        let backups: Vec<_> = std::fs::read_dir(&f.root)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.file_name().unwrap().to_string_lossy().contains("pre-v1"))
            .collect();
        assert_eq!(backups.len(), 1);
        let backup = Connection::open(&backups[0]).unwrap();
        assert_eq!(
            backup
                .query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            backup
                .query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
    }
    #[test]
    fn future_unknown_and_corrupt_databases_remain_byte_identical() {
        for kind in ["future", "unknown", "corrupt"] {
            let f = Fixture::new();
            if kind == "corrupt" {
                std::fs::write(&f.path, b"not a sqlite database - preserve me").unwrap();
            } else {
                let c = Connection::open(&f.path).unwrap();
                c.execute_batch(
                    "CREATE TABLE precious(value TEXT); INSERT INTO precious VALUES('preserve');",
                )
                .unwrap();
                if kind == "future" {
                    c.pragma_update(None, "user_version", 9).unwrap();
                }
            }
            let original = std::fs::read(&f.path).unwrap();
            assert!(open_database(&f.path).is_err());
            assert_eq!(std::fs::read(&f.path).unwrap(), original);
        }
    }
    #[test]
    fn compare_and_swap_rejects_stale_updates_across_connections() {
        let f = Fixture::new();
        let mut first = open_database(&f.path).unwrap();
        save(&mut first, f.input("one", None)).unwrap();
        let mut second = open_database(&f.path).unwrap();
        save(&mut first, f.input("one", Some(1))).unwrap();
        assert!(save(&mut second, f.input("one", Some(1)))
            .unwrap_err()
            .contains("其他操作"));
        assert_eq!(project(&second, "one").unwrap().revision, 2);
    }
    #[test]
    fn disk_capacity_failure_rolls_back_artifact_and_success_state() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        let run = start(&mut c, None, "saved");
        finish(&mut c, run, Ok("previous".into())).unwrap();
        let run = start(&mut c, None, "full");
        let count: u32 = c.query_row("PRAGMA page_count", [], |r| r.get(0)).unwrap();
        c.pragma_update(None, "max_page_count", count).unwrap();
        assert!(finish(&mut c, run, Ok("a".repeat(100000))).is_err());
        assert_eq!(artifact(&c, "saved").unwrap().markdown, "previous");
        assert!(artifact(&c, "full").is_err());
        assert_eq!(
            snapshot(&c)
                .unwrap()
                .runs
                .iter()
                .find(|r| r.id == "full")
                .unwrap()
                .state,
            "running"
        );
    }
    #[test]
    fn snapshot_retains_each_projects_latest_artifact_beyond_global_window() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("old", None)).unwrap();
        let run = start(&mut c, Some("old"), "old-report");
        finish(&mut c, run, Ok("important".into())).unwrap();
        for index in 0..201 {
            let run = start(&mut c, None, &format!("new-{index}"));
            finish(&mut c, run, Ok("new".into())).unwrap();
        }
        let s = snapshot(&c).unwrap();
        assert_eq!(s.artifacts.len(), 201);
        assert!(s.artifacts.iter().any(|a| a["id"] == "old-report"));
        assert!(s.runs.iter().any(|r| r.id == "old-report"));
    }
    #[test]
    fn snapshot_retains_latest_attempt_and_success_per_project_and_kind() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        for project_id in ["old-a", "old-b", "recent"] {
            save(&mut c, f.input(project_id, None)).unwrap();
        }
        let mut retained = Vec::new();
        for project_id in [Some("old-a"), Some("old-b"), None] {
            for kind in ["check", "guide", "explain"] {
                if project_id.is_none() && kind == "check" {
                    continue;
                }
                let prefix = format!("{}-{kind}", project_id.unwrap_or("unassigned"));
                for suffix in ["obsolete", "saved", "latest"] {
                    let run = begin(
                        &mut c,
                        project_id.map(str::to_string),
                        kind.into(),
                        format!("{prefix}-{suffix}"),
                        Some("personal".into()),
                        ("0.1.0".into(), "{}".into()),
                    )
                    .unwrap()
                    .0;
                    if suffix == "latest" {
                        let error = if kind == "guide" {
                            crate::tool_runner::ToolFailure::Canceled
                        } else {
                            "Latest attempt failed".into()
                        };
                        assert!(finish(&mut c, run, Err(error)).is_err());
                    } else {
                        finish(&mut c, run, Ok("Saved result".into())).unwrap();
                    }
                }
                retained.push((project_id, kind, prefix));
            }
        }
        // Move every retained scope beyond both global 200-row windows.
        for index in 0..201 {
            let run = start(&mut c, Some("recent"), &format!("recent-{index}"));
            finish(&mut c, run, Ok("Recent result".into())).unwrap();
        }
        let s = snapshot(&c).unwrap();
        for (project_id, kind, prefix) in &retained {
            let latest_id = format!("{prefix}-latest");
            let saved_id = format!("{prefix}-saved");
            let latest = s
                .runs
                .iter()
                .find(|r| r.id == latest_id)
                .unwrap_or_else(|| panic!("Missing latest attempt for {prefix}"));
            assert_eq!(latest.project_id.as_deref(), *project_id);
            assert_eq!(latest.kind, *kind);
            assert_eq!(
                latest.state,
                if *kind == "guide" {
                    "canceled"
                } else {
                    "failed"
                }
            );
            let saved = s
                .artifacts
                .iter()
                .find(|a| a["id"] == saved_id)
                .unwrap_or_else(|| panic!("Missing latest successful artifact for {prefix}"));
            assert_eq!(saved["projectId"], serde_json::json!(project_id));
            assert_eq!(saved["kind"], *kind);
            assert!(saved.get("markdown").is_none());
            assert!(saved.get("data").is_none());
            assert!(s
                .runs
                .iter()
                .any(|r| r.id == saved_id && r.state == "succeeded"));
            assert!(!s
                .artifacts
                .iter()
                .any(|a| a["id"] == format!("{prefix}-obsolete")));
            assert!(!s.runs.iter().any(|r| r.id == format!("{prefix}-obsolete")));
            if let Some(project_id) = project_id {
                let old =
                    local_session_artifact(&c, project_id, &format!("{prefix}-obsolete")).unwrap();
                assert_eq!(old.run_id, format!("{prefix}-obsolete"));
            }
        }
        assert_eq!(s.artifacts.len(), 200 + retained.len());
        assert_eq!(s.runs.len(), 200 + retained.len() * 2);
    }
    #[test]
    fn local_chat_report_requires_the_matching_native_project_and_successful_run() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        save(&mut c, f.input("two", None)).unwrap();
        let run = start(&mut c, Some("one"), "first-run");
        finish(&mut c, run, Ok("local report".into())).unwrap();
        assert!(local_session_artifact(&c, "two", "first-run").is_err());
        assert!(local_session_artifact(&c, "missing", "first-run").is_err());
        assert!(local_session_artifact(&c, "one", "missing").is_err());
        for update in [
            "UPDATE runs SET state='failed'",
            "UPDATE runs SET project_id='two'",
            "UPDATE runs SET data=json_set(data,'$.state','failed')",
            "UPDATE runs SET data=json_set(data,'$.provenance','imported')",
            "UPDATE runs SET data=json_set(data,'$.contextRevision',1234)",
            "UPDATE runs SET data=json_set(data,'$.kind','explain')",
            "UPDATE artifacts SET data=json_set(data,'$.projectRevision',1234)",
            "UPDATE artifacts SET data=json_set(data,'$.rulesVersion','other')",
            "UPDATE artifacts SET data=json_set(data,'$.provenance','imported')",
            "UPDATE artifacts SET data=json_set(data,'$.runId','other')",
        ] {
            let tx = c.transaction().unwrap();
            tx.execute(update, []).unwrap();
            assert!(
                local_session_artifact(&tx, "one", "first-run").is_err(),
                "{update}"
            );
            tx.rollback().unwrap();
        }
        assert_eq!(
            local_session_artifact(&c, "one", "first-run")
                .unwrap()
                .markdown,
            "local report"
        );
    }
    #[test]
    fn export_is_complete_and_project_scoped_while_selection_survives_restart() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        save(&mut c, f.input("two", None)).unwrap();
        select(&c, Some("one".into())).unwrap();
        assert!(select(&c, Some("absent".into())).is_err());
        for index in 0..205 {
            let run = start(&mut c, Some("one"), &format!("one-{index}"));
            finish(&mut c, run, Ok(format!("report-{index}"))).unwrap();
        }
        let run = start(&mut c, Some("two"), "two-report");
        finish(&mut c, run, Ok("private to two".into())).unwrap();
        let value: serde_json::Value =
            serde_json::from_str(&export(&mut c, "one").unwrap()).unwrap();
        assert_eq!(value["artifacts"].as_array().unwrap().len(), 205);
        assert_eq!(value["runs"].as_array().unwrap().len(), 205);
        assert_eq!(value["artifacts"][0]["markdown"], "report-0");
        assert!(value["artifacts"]
            .as_array()
            .unwrap()
            .iter()
            .all(|a| a["projectId"] == "one"));
        assert!(value.get("sessions").is_none());
        drop(c);
        let c = open_database(&f.path).unwrap();
        assert_eq!(
            snapshot(&c).unwrap().active_project_id.as_deref(),
            Some("one")
        );
        select(&c, None).unwrap();
        assert!(snapshot(&c).unwrap().active_project_id.is_none());
    }
    #[test]
    fn migration_rechecks_version_and_unknown_schema_inside_transaction() {
        let f = Fixture::new();
        let mut c = Connection::open(&f.path).unwrap();
        c.pragma_update(None, "user_version", 7).unwrap();
        assert!(migrate(&mut c, SCHEMA).is_err());
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            7
        );
        c.pragma_update(None, "user_version", 0).unwrap();
        c.execute("CREATE TABLE unknown(value TEXT)", []).unwrap();
        assert!(migrate(&mut c, SCHEMA).is_err());
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name='unknown'",
                [],
                |r| r.get::<_, u32>(0)
            )
            .unwrap(),
            1
        );
    }
    #[test]
    fn read_only_and_capacity_errors_offer_specific_recovery() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        save(&mut c, f.input("one", None)).unwrap();
        drop(c);
        let mut read_only =
            Connection::open_with_flags(&f.path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        assert!(save(&mut read_only, f.input("one", Some(1)))
            .unwrap_err()
            .contains("写入权限"));
        assert_eq!(project(&read_only, "one").unwrap().revision, 1);
        let error = db_error(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_FULL),
            None,
        ));
        assert!(error.contains("释放空间"));
    }
    #[test]
    fn capacity_failure_can_persist_small_terminal_record_without_losing_old_artifact() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        let run = start(&mut c, None, "saved");
        finish(&mut c, run, Ok("previous".into())).unwrap();
        let run = start(&mut c, None, "full");
        let pages: u32 = c.query_row("PRAGMA page_count", [], |r| r.get(0)).unwrap();
        c.pragma_update(None, "max_page_count", pages).unwrap();
        let failures = Mutex::new(BTreeMap::new());
        assert!(finish_recoverable(&mut c, run, Ok("x".repeat(100000)), &failures).is_err());
        assert_eq!(
            snapshot(&c)
                .unwrap()
                .runs
                .iter()
                .find(|r| r.id == "full")
                .unwrap()
                .state,
            "failed"
        );
        assert!(failures.lock().unwrap().is_empty());
        assert_eq!(artifact(&c, "saved").unwrap().markdown, "previous");
    }
    #[test]
    fn unwritable_terminal_is_explicitly_volatile_until_restart() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        let run = start(&mut c, None, "readonly");
        c.pragma_update(None, "query_only", true).unwrap();
        let failures = Mutex::new(BTreeMap::new());
        assert!(finish_recoverable(&mut c, run, Ok("completed".into()), &failures).is_err());
        let failure = failures.lock().unwrap().get("readonly").unwrap().clone();
        assert_eq!(failure.state, "failed");
        assert!(failure.error.unwrap().contains("未能保存"));
        assert_eq!(snapshot(&c).unwrap().runs[0].state, "running");
        drop(c);
        let c = open_database(&f.path).unwrap();
        assert_eq!(snapshot(&c).unwrap().runs[0].state, "interrupted");
    }
    #[test]
    fn bounded_lock_timeout_preserves_existing_project() {
        let f = Fixture::new();
        let mut first = open_database(&f.path).unwrap();
        save(&mut first, f.input("one", None)).unwrap();
        let mut second = open_database(&f.path).unwrap();
        second.busy_timeout(Duration::from_millis(20)).unwrap();
        let tx = first
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
        assert!(save(&mut second, f.input("one", Some(1))).is_err());
        drop(tx);
        assert_eq!(project(&second, "one").unwrap().revision, 1);
    }
    #[test]
    fn invalid_inputs_and_foreign_keys_reject_orphans() {
        let f = Fixture::new();
        let mut c = open_database(&f.path).unwrap();
        assert!(save(&mut c, f.input("../bad", None)).is_err());
        assert!(begin(
            &mut c,
            None,
            "check".into(),
            "id".into(),
            None,
            ("1".into(), "{}".into())
        )
        .is_err());
        assert!(begin(
            &mut c,
            Some("missing".into()),
            "guide".into(),
            "id".into(),
            None,
            ("1".into(), "{}".into())
        )
        .is_err());
        assert!(c
            .execute(
                "INSERT INTO runs VALUES('orphan','missing','running','{}')",
                []
            )
            .is_err());
        assert!(snapshot(&c).unwrap().runs.is_empty());
    }
    #[test]
    fn wal_mode_is_enabled_recovers_missing_shm_and_checkpoints_on_shutdown() {
        let f = Fixture::new();
        let store = open_store(&f.path).unwrap();
        let mode: String = store
            .connection
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert!(mode.eq_ignore_ascii_case("wal"));
        let sync_mode: i64 = store
            .connection
            .query_row("PRAGMA synchronous", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sync_mode, 2);
        drop(store);

        // Legacy v1 rollback-journal database upgrades to v2 and switches to WAL.
        let legacy_fixture = Fixture::new();
        let mut legacy = Connection::open(&legacy_fixture.path).unwrap();
        migrate(&mut legacy, SCHEMA).unwrap();
        save(&mut legacy, legacy_fixture.input("legacy", None)).unwrap();
        drop(legacy);
        let mut upgraded = open_database(&legacy_fixture.path).unwrap();
        let upgraded_mode: String = upgraded
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert!(upgraded_mode.eq_ignore_ascii_case("wal"));
        save(&mut upgraded, legacy_fixture.input("legacy", Some(1))).unwrap();
        let pre_v2_backup = std::fs::read_dir(&legacy_fixture.root)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| p.to_string_lossy().contains("pre-v2"))
            .unwrap();
        let backup_conn = Connection::open(&pre_v2_backup).unwrap();
        let integrity: String = backup_conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");
        drop(backup_conn);

        // Existing v2 rollback-journal database (`DELETE`) also upgrades cleanly to WAL.
        let v2_rollback = Fixture::new();
        let mut v2_conn = Connection::open(&v2_rollback.path).unwrap();
        migrate(&mut v2_conn, SCHEMA).unwrap();
        migrate_v2(&mut v2_conn).unwrap();
        let prev_mode: String = v2_conn
            .query_row("PRAGMA journal_mode=DELETE", [], |r| r.get(0))
            .unwrap();
        assert!(prev_mode.eq_ignore_ascii_case("delete"));
        drop(v2_conn);
        let v2_opened = open_database(&v2_rollback.path).unwrap();
        let v2_mode: String = v2_opened
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert!(v2_mode.eq_ignore_ascii_case("wal"));
        drop(v2_opened);

        // Simulate uncheckpointed WAL frames (including a `running` run) left without `-shm` after an abrupt crash.
        let raw_wal = wal_sidecar(&legacy_fixture.path);
        drop(upgraded);
        let mut writer = Connection::open(&legacy_fixture.path).unwrap();
        let _: String = writer
            .query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))
            .unwrap();
        writer
            .pragma_update(None, "wal_autocheckpoint", 0i64)
            .unwrap();
        save(&mut writer, legacy_fixture.input("after-crash", None)).unwrap();
        start(&mut writer, Some("after-crash"), "crash-running");
        assert!(raw_wal.exists() && std::fs::metadata(&raw_wal).unwrap().len() > 0);
        let crash_fixture = Fixture::new();
        std::fs::copy(&legacy_fixture.path, &crash_fixture.path).unwrap();
        std::fs::copy(&raw_wal, wal_sidecar(&crash_fixture.path)).unwrap();
        drop(writer);

        let recovered_store = ProjectStore::default();
        *recovered_store.0.lock().unwrap() =
            StoreState::Open(open_store(&crash_fixture.path).unwrap());
        {
            let guard = recovered_store.0.lock().unwrap();
            let StoreState::Open(store) = &*guard else {
                panic!("expected open store");
            };
            let conn = &store.connection;
            assert_eq!(project(conn, "after-crash").unwrap().revision, 1);
            assert_eq!(project(conn, "legacy").unwrap().revision, 2);
            let recovered_run = snapshot(conn)
                .unwrap()
                .runs
                .into_iter()
                .find(|r| r.id == "crash-running")
                .unwrap();
            assert_eq!(recovered_run.state, "interrupted");
        }
        recovered_store.shutdown();
        assert!(matches!(
            *recovered_store.0.lock().unwrap(),
            StoreState::Closed
        ));
        let wal_after = wal_sidecar(&crash_fixture.path);
        if wal_after.exists() {
            assert_eq!(std::fs::metadata(&wal_after).unwrap().len(), 0);
        }
        let reopened = open_database(&crash_fixture.path).unwrap();
        assert_eq!(project(&reopened, "after-crash").unwrap().revision, 1);
        drop(reopened);

        // Future (`user_version > 2`) WAL database with uncheckpointed `-wal` (without `-shm`)
        // must remain byte-identical on both main DB and `-wal` when rejected!
        let future_wal_src = Fixture::new();
        let future_conn = Connection::open(&future_wal_src.path).unwrap();
        let _: String = future_conn
            .query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0))
            .unwrap();
        future_conn
            .pragma_update(None, "wal_autocheckpoint", 0i64)
            .unwrap();
        future_conn
            .execute_batch("CREATE TABLE future_data(v TEXT); PRAGMA user_version=9;")
            .unwrap();
        future_conn
            .execute("INSERT INTO future_data VALUES('uncheckpointed-v9')", [])
            .unwrap();
        let future_copy = Fixture::new();
        std::fs::copy(&future_wal_src.path, &future_copy.path).unwrap();
        std::fs::copy(
            wal_sidecar(&future_wal_src.path),
            wal_sidecar(&future_copy.path),
        )
        .unwrap();
        drop(future_conn);
        let orig_db_bytes = std::fs::read(&future_copy.path).unwrap();
        let orig_wal_bytes = std::fs::read(wal_sidecar(&future_copy.path)).unwrap();
        assert!(open_database(&future_copy.path).is_err());
        assert_eq!(std::fs::read(&future_copy.path).unwrap(), orig_db_bytes);
        assert_eq!(
            std::fs::read(wal_sidecar(&future_copy.path)).unwrap(),
            orig_wal_bytes
        );
    }
}
