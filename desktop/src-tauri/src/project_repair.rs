//! Explicit local repair, with recoverable exclusive writes (NOT atomic replacement).
use crate::{
    project_store::{now, Artifact, Project, ProjectStore, Run},
    repair_writer::{self as writer, Identity, Target, MAX_CONFIG},
};
use serde::{
    de::{self, MapAccess, SeqAccess, Visitor},
    Deserialize, Serialize,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fmt, fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

const MAX_APPLIES: usize = 100;
const MAX_COMPENSATIONS: usize = 200;
const MAX_OPERATIONS: usize = MAX_APPLIES + MAX_COMPENSATIONS;
const APIS: [&str; 8] = [
    "getLocation",
    "getFuzzyLocation",
    "onLocationChange",
    "startLocationUpdate",
    "startLocationUpdateBackground",
    "chooseLocation",
    "choosePoi",
    "chooseAddress",
];
const NOTICE: &str = "仅补充源码声明，不代表接口实际运行、业务必需或已完成后台隐私申报。采用有备份的独占写入，不是原子替换；中断时可能需要显式恢复。";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Evidence {
    file: String,
    apis: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceFile {
    file: String,
    sha256: String,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Scan {
    schema_version: u32,
    files: Vec<SourceFile>,
    missing_apis: Vec<String>,
    evidence: Vec<Evidence>,
    fingerprint: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairPlan {
    plan_id: String,
    expires_at: u64,
    project_id: String,
    file: String,
    before: String,
    after: String,
    missing_apis: Vec<String>,
    evidence: Vec<Evidence>,
    warnings: Vec<String>,
    kind: String,
}
struct Plan {
    view: RepairPlan,
    project: Project,
    identity: Identity,
    root_identity: Identity,
    scan: Option<Scan>,
    artifact_id: Option<String>,
    related: Option<String>,
    versions: (String, String),
}
#[derive(Default)]
pub struct ProjectRepairs {
    plans: Mutex<BTreeMap<String, Plan>>,
    gate: Mutex<()>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepairResult {
    operation_id: String,
    project_id: String,
    created_at: u64,
    kind: String,
    write_state: String,
    recheck_state: String,
    undo_available: bool,
    recovery_available: bool,
    backup_path: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    recheck_artifact_id: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairSnapshot {
    operations: Vec<RepairResult>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    version: u32,
    operation_id: String,
    plan_id: String,
    request_id: String,
    project: Project,
    created_at: u64,
    kind: String,
    identity: Identity,
    root_identity: Identity,
    before_hash: String,
    after_hash: String,
    related: Option<String>,
    versions: (String, String),
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    artifact_id: String,
    checked_at: u64,
}

pub(crate) fn trusted_source(
    project: &Project,
    artifact: &Artifact,
    run: &Run,
    versions: &(String, String),
) -> Result<(), String> {
    if artifact.provenance.is_some()
        || run.provenance.is_some()
        || artifact.kind != "check"
        || run.kind != "check"
        || run.state != "succeeded"
        || artifact.project_id.as_deref() != Some(&project.id)
        || run.project_id.as_deref() != Some(&project.id)
        || artifact.run_id != run.id
        || artifact.project_revision != Some(project.revision)
        || run.project_revision != Some(project.revision)
        || artifact.context_revision != Some(project.context_revision)
        || run.context_revision != Some(project.context_revision)
        || artifact.tool_version != versions.0
        || run.tool_version != versions.0
        || artifact.rules_version != versions.1
        || run.rules_version != versions.1
    {
        return Err("仅当前项目、当前版本的本机成功预检可用于修复；导入历史或过期报告不能授权写入，请重新预检。".into());
    }
    Ok(())
}

// Strict recursive duplicate-key rejection. The original text, not the parsed Value, is edited.
struct Unique(serde_json::Value);
impl<'de> Deserialize<'de> for Unique {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = Unique;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("strict JSON without duplicate keys")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Unique, A::Error> {
                let mut value = serde_json::Map::new();
                while let Some(key) = map.next_key::<String>()? {
                    if value.contains_key(&key) {
                        return Err(de::Error::custom("duplicate JSON key"));
                    }
                    value.insert(key, map.next_value::<Unique>()?.0);
                }
                Ok(Unique(value.into()))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Unique, A::Error> {
                let mut values = Vec::new();
                while let Some(value) = seq.next_element::<Unique>()? {
                    values.push(value.0);
                }
                Ok(Unique(values.into()))
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Unique, E> {
                Ok(Unique(v.into()))
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Unique, E> {
                Ok(Unique(v.into()))
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Unique, E> {
                Ok(Unique(v.into()))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Unique, E> {
                Ok(Unique(v.into()))
            }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Unique, E> {
                serde_json::Number::from_f64(v)
                    .map(|v| Unique(v.into()))
                    .ok_or_else(|| de::Error::custom("invalid number"))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Unique, E> {
                Ok(Unique(serde_json::Value::Null))
            }
        }
        deserializer.deserialize_any(V)
    }
}
fn patch(before: &str, apis: &[String]) -> Result<String, String> {
    if before.len() > MAX_CONFIG
        || apis.is_empty()
        || apis.len() > 8
        || apis.iter().any(|api| !APIS.contains(&api.as_str()))
        || apis.iter().collect::<BTreeSet<_>>().len() != apis.len()
    {
        return Err("修复内容不在支持范围内。".into());
    }
    let value: Unique = serde_json::from_str(before)
        .map_err(|_| "app.json 必须是无注释、无重复键的严格 JSON；请手动处理此配置。")?;
    let object = value.0.as_object().ok_or("app.json 必须是 JSON 对象。")?;
    if object.contains_key("requiredPrivateInfos") {
        return Err("字段已存在，首版不会覆盖或合并已有声明，请手动核对。".into());
    }
    let close = before.trim_end().len() - 1;
    let end = before[..close].trim_end().len();
    let nl = if before.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let insertion = format!(
        "{}{nl}  \"requiredPrivateInfos\": {}{}",
        if object.is_empty() { "" } else { "," },
        serde_json::to_string(apis).map_err(|_| "无法生成声明。")?,
        if end == close { nl } else { "" }
    );
    let after = format!("{}{}{}", &before[..end], insertion, &before[end..]);
    if after.len() > MAX_CONFIG {
        return Err("修复后配置超过 64 KiB，未修改。".into());
    }
    Ok(after)
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位修复备份目录。")?
        .join("project-repairs-v1");
    fs::create_dir_all(&directory).map_err(|_| "无法创建修复备份目录。")?;
    let _held = writer::directories(&directory)?;
    Ok(directory)
}
fn read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    Target::open(path, false)?.bytes(limit)
}
fn journals(directory: &Path) -> Result<Vec<Journal>, String> {
    let _held = writer::directories(directory)?;
    let mut journals = Vec::new();
    let mut count = 0;
    for entry in fs::read_dir(directory).map_err(|_| "修复记录不可读取。")? {
        let entry = entry.map_err(|_| "修复记录不可读取。")?;
        count += 1;
        if count > MAX_OPERATIONS {
            return Err("修复记录已达上限，请保留备份并手动处理。".into());
        }
        let name = entry
            .file_name()
            .to_str()
            .ok_or("修复记录路径无效。")?
            .to_owned();
        if name.len() != 32 || !name.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("修复记录目录含未知内容，请保留并检查。".into());
        }
        let _folder = writer::directories(&entry.path())?;
        let path = entry.path().join("committing.json");
        // A backup-only interruption precedes the first source write; retain it without executing it.
        if !path.exists() {
            continue;
        }
        let journal: Journal = serde_json::from_slice(&read(&path, 256 * 1024)?)
            .map_err(|_| "修复日志损坏，禁止重放；请保留备份。")?;
        if journal.version != 1
            || journal.operation_id != name
            || !["apply", "undo", "recovery"].contains(&journal.kind.as_str())
        {
            return Err("修复日志版本或编号无效。".into());
        }
        journals.push(journal);
    }
    journals.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(journals)
}
fn bytes_for(directory: &Path, journal: &Journal) -> Result<(String, String), String> {
    let folder = directory.join(&journal.operation_id);
    let before = read(&folder.join("original.bin"), MAX_CONFIG)?;
    let after = read(&folder.join("approved.bin"), MAX_CONFIG)?;
    if writer::hash(&before) != journal.before_hash || writer::hash(&after) != journal.after_hash {
        return Err("修复备份校验失败，禁止写入或撤销。".into());
    }
    Ok((
        String::from_utf8(before).map_err(|_| "备份编码无效。")?,
        String::from_utf8(after).map_err(|_| "备份编码无效。")?,
    ))
}
fn result(directory: &Path, journal: &Journal) -> Result<RepairResult, String> {
    let folder = directory.join(&journal.operation_id);
    let (before, after) = bytes_for(directory, journal)?;
    let completed = folder.join("result.json");
    // A torn optional completion record is not authority: recover from durable intent and current bytes.
    let stored = if completed.exists() {
        serde_json::from_slice::<RepairResult>(&read(&completed, 16384)?).ok()
    } else {
        None
    };
    let current = Target::open(
        &Path::new(&journal.project.directory).join("app.json"),
        false,
    )
    .and_then(|mut target| {
        if target.identity != journal.identity || target.parent_identity != journal.root_identity {
            return Err("文件身份已变化。".into());
        }
        target.bytes(MAX_CONFIG)
    });
    let equal_before = current.as_ref().is_ok_and(|v| v == before.as_bytes());
    let equal_after = current.as_ref().is_ok_and(|v| v == after.as_bytes());
    let resolved = compensation_completed(directory, journal)?;
    let state = if resolved {
        "undone"
    } else {
        stored
            .as_ref()
            .map(|v| v.write_state.as_str())
            .unwrap_or(if equal_after {
                if journal.kind == "apply" {
                    "applied"
                } else {
                    "undone"
                }
            } else if equal_before {
                "not_applied"
            } else {
                "recovery_required"
            })
    };
    let needs_recovery = state == "recovery_required";
    let receipt = folder.join("recheck.json");
    let recheck = if receipt.exists() {
        Some(
            serde_json::from_slice::<Receipt>(&read(&receipt, 4096)?)
                .map_err(|_| "复检关联记录损坏。")?,
        )
    } else {
        None
    };
    Ok(RepairResult {
        operation_id: journal.operation_id.clone(),
        project_id: journal.project.id.clone(),
        created_at: journal.created_at,
        kind: journal.kind.clone(),
        write_state: state.into(),
        recheck_state: if recheck.is_some() {
            "completed"
        } else if ["applied", "undone"].contains(&state) {
            "required"
        } else {
            "not_required"
        }
        .into(),
        undo_available: journal.kind == "apply" && state == "applied" && equal_after,
        recovery_available: needs_recovery && current.is_ok(),
        backup_path: folder.join("original.bin").to_string_lossy().into_owned(),
        message: if needs_recovery {
            "写入曾中断或无法确认；请核对当前内容与原始备份，再明确选择恢复。"
        } else if state == "not_applied" {
            "未应用修改；原始备份已保留。"
        } else {
            "文件写入已记录；复检与平台审核结果需分别确认。"
        }
        .into(),
        recheck_artifact_id: recheck.map(|v| v.artifact_id),
    })
}
fn compensation_completed(directory: &Path, original: &Journal) -> Result<bool, String> {
    for child in journals(directory)? {
        if child.related.as_deref() != Some(original.operation_id.as_str())
            || child.project.id != original.project.id
            || child.project.directory != original.project.directory
            || child.identity != original.identity
            || child.root_identity != original.root_identity
            || child.after_hash != original.before_hash
            || !["undo", "recovery"].contains(&child.kind.as_str())
        {
            continue;
        }
        bytes_for(directory, &child)?;
        let completed = directory.join(&child.operation_id).join("result.json");
        let completion = if completed.exists() {
            serde_json::from_slice::<RepairResult>(&read(&completed, 16384)?).ok()
        } else {
            None
        };
        if let Some(completion) = completion {
            if completion.write_state == "undone" {
                return Ok(true);
            }
        } else if let Ok(mut target) =
            Target::open(&Path::new(&child.project.directory).join("app.json"), false)
        {
            if target.identity == child.identity
                && target.parent_identity == child.root_identity
                && writer::hash(&target.bytes(MAX_CONFIG)?) == child.after_hash
            {
                return Ok(true);
            }
        }
    }
    Ok(false)
}
fn require_active(connection: &rusqlite::Connection, project_id: &str) -> Result<(), String> {
    use rusqlite::OptionalExtension;
    let active: Option<String> = connection
        .query_row(
            "SELECT value FROM settings WHERE key='active_project'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(crate::project_store::db_error)?
        .flatten();
    if active.as_deref() != Some(project_id) {
        return Err("当前项目已切换，修复审批作废；请返回目标项目后重新准备。".into());
    }
    Ok(())
}
pub(crate) fn ensure_no_pending_recovery(
    app: &tauri::AppHandle,
    project_id: &str,
) -> Result<(), String> {
    let directory = root(app)?;
    ensure_no_pending_at(&directory, project_id)
}
fn ensure_no_pending_at(directory: &Path, project_id: &str) -> Result<(), String> {
    for journal in journals(directory)? {
        if journal.project.id == project_id
            && result(directory, &journal)?.write_state == "recovery_required"
        {
            return Err("项目存在尚未解决的修复中断，请先恢复并核对文件，再归档项目。".into());
        }
    }
    Ok(())
}
fn find(directory: &Path, operation_id: &str) -> Result<Journal, String> {
    journals(directory)?
        .into_iter()
        .find(|j| j.operation_id == operation_id)
        .ok_or("找不到本机修复记录；导入历史不能用于撤销或恢复。".into())
}
fn validate_scan(scan: &Scan) -> Result<(), String> {
    if scan.schema_version != 1
        || scan.files.is_empty()
        || scan.files.len() > 512
        || scan.evidence.is_empty()
        || scan.missing_apis.is_empty()
        || scan
            .missing_apis
            .iter()
            .any(|a| !APIS.contains(&a.as_str()))
        || scan.fingerprint.len() != 64
    {
        return Err("修复扫描证据无效。".into());
    }
    let mut files = BTreeSet::new();
    for entry in &scan.files {
        if !files.insert(&entry.file)
            || entry.file.starts_with('/')
            || entry.file.contains(['\\', ':', '\0'])
            || entry
                .file
                .split('/')
                .any(|p| p.is_empty() || p == "." || p == "..")
            || entry.sha256.len() != 64
        {
            return Err("修复扫描文件边界无效。".into());
        }
    }
    if !files.contains(&"app.json".to_string()) || !files.contains(&"app.js".to_string()) {
        return Err("原生项目入口缺失。".into());
    }
    Ok(())
}
fn scan(
    app: &tauri::AppHandle,
    project: &Project,
    reservation: &crate::tool_runner::Reservation,
) -> Result<Scan, String> {
    let _root = writer::directories(Path::new(&project.directory))?;
    let mut command = crate::runtime::node_command(app, "src/repair-evidence.mjs", false)?;
    command.arg(&project.directory);
    let text = reservation
        .run_retained(command)
        .map_err(|e| e.to_string())?;
    let scan: Scan = serde_json::from_str(&text).map_err(|_| "修复扫描返回格式无效。")?;
    validate_scan(&scan)?;
    Ok(scan)
}
fn pin_sources(project: &Project, scan: &Scan, target: &mut Target) -> Result<Vec<Target>, String> {
    let mut held = Vec::new();
    for entry in &scan.files {
        if entry.file == "app.json" {
            if writer::hash(&target.bytes(MAX_CONFIG)?) != entry.sha256 {
                return Err("配置已改变，请重新准备差异。".into());
            }
        } else {
            let mut file = Target::open(&Path::new(&project.directory).join(&entry.file), false)?;
            if writer::hash(&file.bytes(1024 * 1024)?) != entry.sha256 {
                return Err("源码已改变，请重新预检和审批。".into());
            }
            held.push(file);
        }
    }
    Ok(held)
}
fn insert(state: &ProjectRepairs, plan: Plan) -> Result<RepairPlan, String> {
    let view = plan.view.clone();
    let mut plans = state.plans.lock().map_err(|_| "修复计划状态不可用。")?;
    plans.retain(|_, p| p.view.expires_at > now());
    if plans.len() >= 8 {
        return Err("待确认修复计划过多，请等待旧计划过期后重试。".into());
    }
    plans.insert(view.plan_id.clone(), plan);
    Ok(view)
}

#[tauri::command]
pub async fn project_repair_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    state: tauri::State<'_, ProjectRepairs>,
    project_id: String,
    artifact_id: String,
) -> Result<RepairPlan, String> {
    crate::runtime::authorize(&window)?;
    store.access(&app, |connection| require_active(connection, &project_id))?;
    store.repair_source(&app, &project_id, &artifact_id)?;
    let fresh = crate::project_store::run_internal(
        app.clone(),
        store.inner().clone(),
        Some(project_id.clone()),
        "check".into(),
        format!("repair-{}", writer::random_id()?),
        None,
        None,
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    let (project, _, _) = store.repair_source(&app, &project_id, &fresh.id)?;
    let runner = app
        .state::<crate::tool_runner::ToolRunner>()
        .inner()
        .clone();
    let reservation = runner.reserve_guard(&format!("repair-{}", writer::random_id()?))?;
    let application = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let evidence = scan(&application, &project, &reservation)?;
        let mut target = Target::open(&Path::new(&project.directory).join("app.json"), false)?;
        let _sources = pin_sources(&project, &evidence, &mut target)?;
        let before =
            String::from_utf8(target.bytes(MAX_CONFIG)?).map_err(|_| "app.json 必须是 UTF-8。")?;
        let after = patch(&before, &evidence.missing_apis)?;
        let versions = crate::project_store::versions(&application)?;
        let plan = Plan {
            view: RepairPlan {
                plan_id: writer::random_id()?,
                expires_at: now() + 300_000,
                project_id: project.id.clone(),
                file: "app.json".into(),
                before,
                after,
                missing_apis: evidence.missing_apis.clone(),
                evidence: evidence.evidence.clone(),
                warnings: vec![NOTICE.into()],
                kind: "apply".into(),
            },
            project,
            identity: target.identity.clone(),
            root_identity: target.parent_identity.clone(),
            scan: Some(evidence),
            artifact_id: Some(fresh.id),
            related: None,
            versions,
        };
        reservation.commit(|| Ok(plan)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "修复准备意外中断，未修改文件。")??;
    insert(&state, result)
}

fn history_plan(
    app: &tauri::AppHandle,
    store: &ProjectStore,
    state: &ProjectRepairs,
    operation_id: &str,
    recovery: bool,
) -> Result<RepairPlan, String> {
    let _gate = state.gate.lock().map_err(|_| "修复状态不可用。")?;
    let directory = root(app)?;
    let journal = find(&directory, operation_id)?;
    let current = result(&directory, &journal)?;
    if if recovery {
        !current.recovery_available
    } else {
        !current.undo_available
    } {
        return Err(if recovery {
            "此操作不需要自动恢复，或当前文件无法安全读取，请检查备份。"
        } else {
            "当前文件已改变或此操作不能撤销；不会覆盖你的后续修改。"
        }
        .into());
    }
    let project = store.context_project(app, &journal.project.id)?;
    store.access(app, |connection| require_active(connection, &project.id))?;
    if project.directory != journal.project.directory {
        return Err("项目目录已变更，不能在新目录执行旧修复的撤销或恢复。".into());
    }
    let (original, _) = bytes_for(&directory, &journal)?;
    let mut target = Target::open(&Path::new(&project.directory).join("app.json"), false)?;
    if target.identity != journal.identity || target.parent_identity != journal.root_identity {
        return Err("文件已被替换，旧修复不能授权覆盖。".into());
    }
    let before = String::from_utf8(target.bytes(MAX_CONFIG)?)
        .map_err(|_| "当前文件不是 UTF-8，请通过备份手动恢复。")?;
    validate_compensation_bytes(&journal, &before, recovery)?;
    let kind = if recovery { "recovery" } else { "undo" };
    insert(state,Plan{view:RepairPlan{plan_id:writer::random_id()?,expires_at:now()+300_000,project_id:project.id.clone(),file:"app.json".into(),before,after:original,missing_apis:Vec::new(),evidence:Vec::new(),warnings:vec![NOTICE.into(),if recovery{"恢复将用原始备份替换差异中展示的当前内容，请逐项确认，包括中断后的手工编辑。"}else{"只撤销这一次写入；平台后台配置不会改变。"}.into()],kind:kind.into()},project,identity:target.identity.clone(),root_identity:target.parent_identity.clone(),scan:None,artifact_id:None,related:Some(operation_id.into()),versions:crate::project_store::versions(app)?})
}
fn validate_compensation_bytes(
    journal: &Journal,
    before: &str,
    recovery: bool,
) -> Result<(), String> {
    if !recovery && writer::hash(before.as_bytes()) != journal.after_hash {
        return Err("当前文件已改变，撤销不会覆盖你的后续修改；请手动核对。".into());
    }
    Ok(())
}
#[tauri::command]
pub fn project_repair_undo_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    state: tauri::State<'_, ProjectRepairs>,
    operation_id: String,
) -> Result<RepairPlan, String> {
    crate::runtime::authorize(&window)?;
    history_plan(&app, &store, &state, &operation_id, false)
}
#[tauri::command]
pub fn project_repair_recovery_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    state: tauri::State<'_, ProjectRepairs>,
    operation_id: String,
) -> Result<RepairPlan, String> {
    crate::runtime::authorize(&window)?;
    history_plan(&app, &store, &state, &operation_id, true)
}

fn persist_write(
    directory: &Path,
    plan: &Plan,
    request_id: &str,
    target: &mut Target,
) -> Result<RepairResult, String> {
    persist_write_using(directory, plan, request_id, target, |target, bytes| {
        target.write(bytes)
    })
}
fn persist_write_using(
    directory: &Path,
    plan: &Plan,
    request_id: &str,
    target: &mut Target,
    write: impl FnOnce(&mut Target, &[u8]) -> Result<(), String>,
) -> Result<RepairResult, String> {
    let count = fs::read_dir(directory)
        .map_err(|_| "无法读取修复记录。")?
        .count();
    let existing = journals(directory)?;
    let applies = existing.iter().filter(|j| j.kind == "apply").count();
    let compensations = existing.len() - applies;
    if count >= MAX_OPERATIONS
        || plan.view.kind == "apply" && (applies >= MAX_APPLIES || count >= MAX_APPLIES)
        || plan.view.kind != "apply" && compensations >= MAX_COMPENSATIONS
    {
        return Err(if plan.view.kind == "apply" {
            "新修复已达上限；撤销与恢复保留独立配额，现有备份仍可使用。"
        } else {
            "补偿操作已达独立安全上限，请保留原始备份并手动恢复，不会覆盖源文件。"
        }
        .into());
    }
    let operation_id = writer::random_id()?;
    let folder = directory.join(&operation_id);
    fs::create_dir(&folder).map_err(|_| "无法创建修复备份目录，未修改文件。")?;
    let _directory = writer::directories(&folder)?;
    let _before = writer::create_record(&folder.join("original.bin"), plan.view.before.as_bytes())?;
    let _after = writer::create_record(&folder.join("approved.bin"), plan.view.after.as_bytes())?;
    let journal = Journal {
        version: 1,
        operation_id: operation_id.clone(),
        plan_id: plan.view.plan_id.clone(),
        request_id: request_id.into(),
        project: plan.project.clone(),
        created_at: now(),
        kind: plan.view.kind.clone(),
        identity: target.identity.clone(),
        root_identity: target.parent_identity.clone(),
        before_hash: writer::hash(plan.view.before.as_bytes()),
        after_hash: writer::hash(plan.view.after.as_bytes()),
        related: plan.related.clone(),
        versions: plan.versions.clone(),
    };
    let _record = writer::publish_record(
        &folder.join("committing.json"),
        &serde_json::to_vec(&journal).map_err(|_| "无法编码修复日志。")?,
    )?;
    let write = write(target, plan.view.after.as_bytes());
    let (write_state, message) = match write {
        Ok(()) => (
            if plan.view.kind == "apply" {
                "applied"
            } else {
                "undone"
            },
            "已完成文件写入；请继续运行预检。",
        ),
        Err(_) => {
            if target.write(plan.view.before.as_bytes()).is_ok() {
                (
                    "not_applied",
                    "写入失败，已在持有文件期间恢复原始内容；备份保留。请重新准备。",
                )
            } else {
                (
                    "recovery_required",
                    "写入和回滚未完整结束；请保留备份并从恢复记录核对当前内容。",
                )
            }
        }
    };
    let result = RepairResult {
        operation_id,
        project_id: plan.project.id.clone(),
        created_at: journal.created_at,
        kind: plan.view.kind.clone(),
        write_state: write_state.into(),
        recheck_state: if ["applied", "undone"].contains(&write_state) {
            "required"
        } else {
            "not_required"
        }
        .into(),
        undo_available: write_state == "applied",
        recovery_available: write_state == "recovery_required",
        backup_path: folder.join("original.bin").to_string_lossy().into_owned(),
        message: message.into(),
        recheck_artifact_id: None,
    };
    // If this final record fails, immutable committing + byte hashes determine restart state.
    let _ = writer::publish_record(
        &folder.join("result.json"),
        &serde_json::to_vec(&result).map_err(|_| "无法编码修复结果。")?,
    );
    Ok(result)
}
async fn execute(
    app: tauri::AppHandle,
    store: ProjectStore,
    plan_id: String,
    request_id: String,
    apply: bool,
    business_confirmed: bool,
) -> Result<RepairResult, String> {
    crate::project_store::id(&request_id)?;
    if apply && !business_confirmed {
        return Err("请明确确认静态发现的位置功能确为业务所需，再批准具体差异。".into());
    }
    let runner = app
        .state::<crate::tool_runner::ToolRunner>()
        .inner()
        .clone();
    let reservation = runner.reserve_guard(&format!("repair-{}", writer::random_id()?))?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ProjectRepairs>();
        let _gate = state.gate.lock().map_err(|_| "修复状态不可用。")?;
        let directory = root(&app)?;
        let _root = writer::directories(&directory)?;
        for journal in journals(&directory)? {
            if journal.request_id == request_id {
                if journal.plan_id != plan_id || (journal.kind == "apply") != apply {
                    return Err("请求编号已用于其他操作，请勿重复提交。".into());
                }
                return result(&directory, &journal);
            }
        }
        let plan = state
            .plans
            .lock()
            .map_err(|_| "修复计划不可用。")?
            .remove(&plan_id)
            .ok_or("修复计划已过期或已处理，请重新查看差异。")?;
        if plan.view.expires_at <= now() || (plan.view.kind == "apply") != apply {
            return Err("修复计划已过期或操作不匹配，请重新准备。".into());
        }
        let project = store.context_project(&app, &plan.project.id)?;
        if project.revision != plan.project.revision
            || project.context_revision != plan.project.context_revision
            || project.directory != plan.project.directory
            || crate::project_store::versions(&app)? != plan.versions
        {
            return Err("项目或规则版本已改变，审批作废；请重新预检。".into());
        }
        let fresh = if let Some(expected) = &plan.scan {
            store.repair_source(
                &app,
                &project.id,
                plan.artifact_id.as_deref().ok_or("修复报告缺失。")?,
            )?;
            let fresh = scan(&app, &project, &reservation)?;
            if fresh.fingerprint != expected.fingerprint
                || fresh.missing_apis != expected.missing_apis
            {
                return Err("源码已改变，原差异审批作废；请重新预检。".into());
            }
            Some(fresh)
        } else {
            None
        };
        let mut target = Target::open(&Path::new(&project.directory).join("app.json"), true)?;
        if target.identity != plan.identity
            || target.parent_identity != plan.root_identity
            || target.bytes(MAX_CONFIG)? != plan.view.before.as_bytes()
        {
            return Err("配置内容或身份已变化，未覆盖；请重新准备差异。".into());
        }
        let _sources = if let Some(fresh) = fresh {
            pin_sources(&project, &fresh, &mut target)?
        } else {
            Vec::new()
        };
        // Short disk commit is linearized with stop/shutdown; a stop cannot relabel an applied write as canceled.
        reservation
            .commit(|| {
                store.access(&app, |connection| {
                    let latest = crate::project_store::project(connection, &project.id)?;
                    require_active(connection, &project.id)?;
                    if latest.revision != project.revision
                        || latest.context_revision != project.context_revision
                        || latest.directory != project.directory
                    {
                        return Err("项目在提交前已改变，未写入；请重新准备。".into());
                    }
                    persist_write(&directory, &plan, &request_id, &mut target)
                })
            })
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "修复任务中断；请打开修复历史确认文件及备份，勿重复覆盖。")?
}
#[tauri::command]
pub async fn project_repair_apply(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    plan_id: String,
    request_id: String,
    business_confirmed: bool,
) -> Result<RepairResult, String> {
    crate::runtime::authorize(&window)?;
    execute(
        app,
        store.inner().clone(),
        plan_id,
        request_id,
        true,
        business_confirmed,
    )
    .await
}
#[tauri::command]
pub async fn project_repair_undo(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    plan_id: String,
    request_id: String,
) -> Result<RepairResult, String> {
    crate::runtime::authorize(&window)?;
    execute(app, store.inner().clone(), plan_id, request_id, false, true).await
}
#[tauri::command]
pub fn project_repair_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    state: tauri::State<'_, ProjectRepairs>,
    project_id: String,
) -> Result<RepairSnapshot, String> {
    crate::runtime::authorize(&window)?;
    store.context_project(&app, &project_id)?;
    let _gate = state.gate.lock().map_err(|_| "修复状态不可用。")?;
    let directory = root(&app)?;
    let mut operations = Vec::new();
    for journal in journals(&directory)? {
        if journal.project.id == project_id {
            operations.push(result(&directory, &journal)?);
        }
    }
    Ok(RepairSnapshot { operations })
}
#[tauri::command]
pub fn project_repair_record_recheck(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    state: tauri::State<'_, ProjectRepairs>,
    operation_id: String,
    artifact_id: String,
) -> Result<RepairResult, String> {
    crate::runtime::authorize(&window)?;
    let _gate = state.gate.lock().map_err(|_| "修复状态不可用。")?;
    let directory = root(&app)?;
    let journal = find(&directory, &operation_id)?;
    let current = result(&directory, &journal)?;
    if !["applied", "undone"].contains(&current.write_state.as_str()) {
        return Err("写入未完成，不能关联完成复检。".into());
    }
    let (project, artifact, run) = store.repair_source(&app, &journal.project.id, &artifact_id)?;
    if project.directory != journal.project.directory
        || run.started_at < journal.created_at
        || run.finished_at.is_none()
    {
        return Err("只能关联本次写入之后在原项目完成的本机预检。".into());
    }
    let mut target = Target::open(&Path::new(&project.directory).join("app.json"), false)?;
    if target.identity != journal.identity
        || target.parent_identity != journal.root_identity
        || writer::hash(&target.bytes(MAX_CONFIG)?) != journal.after_hash
    {
        return Err("配置已在复检前后改变，不能将此报告关联为本次写入的复检。".into());
    }
    let folder = directory.join(&operation_id);
    let _held = writer::directories(&folder)?;
    let path = folder.join("recheck.json");
    if !path.exists() {
        let _receipt = writer::publish_record(
            &path,
            &serde_json::to_vec(&Receipt {
                artifact_id: artifact.id,
                checked_at: now(),
            })
            .map_err(|_| "复检记录编码失败。")?,
        )?;
    }
    result(&directory, &journal)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project(directory: String) -> Project {
        Project {
            id: "repair-project".into(),
            name: "Repair fixture".into(),
            directory,
            subject: "personal".into(),
            revision: 1,
            facts: Default::default(),
            context_revision: 0,
            created_at: 1,
            updated_at: 1,
            directory_available: true,
        }
    }
    fn sources() -> (Project, Artifact, Run) {
        let p = project("C:/fixture".into());
        let r:Run=serde_json::from_value(serde_json::json!({"id":"r","projectId":p.id,"kind":"check","state":"succeeded","startedAt":1,"finishedAt":2,"error":null,"projectRevision":1,"contextRevision":0,"toolVersion":"test","rulesVersion":"rules","inputSummary":"{}"})).unwrap();
        let a:Artifact=serde_json::from_value(serde_json::json!({"id":"a","runId":"r","projectId":p.id,"kind":"check","title":"Report","markdown":"Report","createdAt":2,"projectRevision":1,"contextRevision":0,"toolVersion":"test","rulesVersion":"rules","inputSummary":"{}"})).unwrap();
        (p, a, r)
    }
    #[test]
    fn repair_strict_json_preserves_bytes_and_rejects_existing_duplicate_or_jsonc() {
        let before = "{\r\n \"pages\": [], \"big\":9007199254740993\r\n}\r\n";
        let after = patch(before, &["getLocation".into()]).unwrap();
        assert!(after.starts_with(before[..before.trim_end().len() - 1].trim_end()));
        assert!(after.ends_with("}\r\n"));
        assert!(after.contains("9007199254740993"));
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&after).unwrap()["requiredPrivateInfos"],
            serde_json::json!(["getLocation"])
        );
        for bad in [
            "{\"requiredPrivateInfos\":[]}",
            "{\"requiredPrivate\\u0049nfos\":[]}",
            "{\"a\":1,\"a\":2}",
            "{\"x\":{\"a\":1,\"a\":2}}",
            "{\"x\":[{\"a\":1,\"a\":2}]}",
            "{/*comment*/}",
            "{\"a\":1,}",
            "[]",
            "{} garbage",
        ] {
            assert!(patch(bad, &["getLocation".into()]).is_err(), "{bad}");
        }
        assert!(patch("{}", &["arbitrary".into()]).is_err());
        assert!(patch("{}", &[]).is_err());
    }
    #[test]
    fn repair_requires_current_local_success_and_exact_project() {
        let (p, a, r) = sources();
        let v = ("test".into(), "rules".into());
        assert!(trusted_source(&p, &a, &r, &v).is_ok());
        let mut imported = a.clone();
        imported.provenance = Some("imported".into());
        assert!(trusted_source(&p, &imported, &r, &v).is_err());
        let mut imported = r.clone();
        imported.provenance = Some("imported".into());
        assert!(trusted_source(&p, &a, &imported, &v).is_err());
        for state in ["running", "failed", "interrupted"] {
            let mut bad = r.clone();
            bad.state = state.into();
            assert!(trusted_source(&p, &a, &bad, &v).is_err());
        }
        let mut bad = a.clone();
        bad.project_id = Some("another".into());
        assert!(trusted_source(&p, &bad, &r, &v).is_err());
        let mut bad = a.clone();
        bad.context_revision = Some(2);
        assert!(trusted_source(&p, &bad, &r, &v).is_err());
        let mut bad = r.clone();
        bad.rules_version = "old".into();
        assert!(trusted_source(&p, &a, &bad, &v).is_err());
    }
    #[cfg(windows)]
    struct Fixture {
        root: PathBuf,
        store: PathBuf,
        path: PathBuf,
        plan: Plan,
    }
    #[cfg(windows)]
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir()
                .join(format!("shipmate-repair-{}", writer::random_id().unwrap()));
            fs::create_dir_all(root.join("project")).unwrap();
            let store = root.join("records");
            fs::create_dir(&store).unwrap();
            let path = root.join("project/app.json");
            let before = "{\r\n \"pages\": []\r\n}\r\n".to_owned();
            fs::write(&path, &before).unwrap();
            let target = Target::open(&path, false).unwrap();
            let p = project(root.join("project").to_string_lossy().into_owned());
            let plan = Plan {
                view: RepairPlan {
                    plan_id: writer::random_id().unwrap(),
                    expires_at: now() + 300000,
                    project_id: p.id.clone(),
                    file: "app.json".into(),
                    after: patch(&before, &["getLocation".into()]).unwrap(),
                    before,
                    missing_apis: vec!["getLocation".into()],
                    evidence: vec![],
                    warnings: vec![],
                    kind: "apply".into(),
                },
                project: p,
                identity: target.identity.clone(),
                root_identity: target.parent_identity.clone(),
                scan: None,
                artifact_id: None,
                related: None,
                versions: ("test".into(), "rules".into()),
            };
            drop(target);
            Self {
                root,
                store,
                path,
                plan,
            }
        }
    }
    #[cfg(windows)]
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    #[cfg(windows)]
    #[test]
    fn repair_windows_write_and_exact_undo_have_independent_persistent_records() {
        let mut f = Fixture::new();
        let original = f.plan.view.before.clone();
        let mut target = Target::open(&f.path, true).unwrap();
        let applied = persist_write(&f.store, &f.plan, "request-1", &mut target).unwrap();
        drop(target);
        assert_eq!(applied.write_state, "applied");
        assert_eq!(fs::read_to_string(&f.path).unwrap(), f.plan.view.after);
        let journal = find(&f.store, &applied.operation_id).unwrap();
        assert!(result(&f.store, &journal).unwrap().undo_available);
        let after = f.plan.view.after.clone();
        f.plan.view.before = after;
        f.plan.view.after = original.clone();
        f.plan.view.kind = "undo".into();
        f.plan.view.plan_id = writer::random_id().unwrap();
        f.plan.related = Some(applied.operation_id);
        let mut target = Target::open(&f.path, true).unwrap();
        let undone = persist_write(&f.store, &f.plan, "request-2", &mut target).unwrap();
        drop(target);
        assert_eq!(undone.write_state, "undone");
        assert_eq!(fs::read_to_string(&f.path).unwrap(), original);
        assert_eq!(journals(&f.store).unwrap().len(), 2);
        assert!(!result(&f.store, &journal).unwrap().undo_available);
    }
    #[cfg(windows)]
    #[test]
    fn repair_windows_later_edits_disable_undo_without_overwriting() {
        let f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        let applied = persist_write(&f.store, &f.plan, "request", &mut target).unwrap();
        drop(target);
        fs::write(&f.path, "{\"later\":true}").unwrap();
        let journal = find(&f.store, &applied.operation_id).unwrap();
        let snapshot = result(&f.store, &journal).unwrap();
        assert!(!snapshot.undo_available);
        assert!(!snapshot.recovery_available);
        assert_eq!(fs::read_to_string(&f.path).unwrap(), "{\"later\":true}");
    }
    #[cfg(windows)]
    #[test]
    fn repair_windows_interrupted_write_has_backup_and_explicit_recovery() {
        use std::io::{Seek, SeekFrom, Write};
        let f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        let interrupted = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            persist_write_using(
                &f.store,
                &f.plan,
                "request",
                &mut target,
                |target, bytes| {
                    target.file.seek(SeekFrom::Start(0)).unwrap();
                    target.file.write_all(&bytes[..bytes.len() / 2]).unwrap();
                    target.file.sync_all().unwrap();
                    panic!("simulated process interruption before completion");
                },
            )
        }));
        assert!(interrupted.is_err());
        drop(target);
        let journal = journals(&f.store).unwrap().pop().unwrap();
        let snapshot = result(&f.store, &journal).unwrap();
        assert_eq!(snapshot.write_state, "recovery_required");
        assert!(snapshot.recovery_available);
        assert!(!snapshot.undo_available);
        assert_eq!(bytes_for(&f.store, &journal).unwrap().0, f.plan.view.before);
    }
    #[cfg(windows)]
    #[test]
    fn repair_windows_write_failure_rolls_back_on_same_handle() {
        let f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        let output = persist_write_using(&f.store, &f.plan, "request", &mut target, |target, _| {
            target.write(b"partial")?;
            Err("injected failure".into())
        })
        .unwrap();
        drop(target);
        assert_eq!(output.write_state, "not_applied");
        assert_eq!(fs::read_to_string(&f.path).unwrap(), f.plan.view.before);
    }
    #[cfg(windows)]
    #[test]
    fn repair_windows_protection_blocks_concurrent_paths_and_hardlinks() {
        let f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        assert!(fs::write(&f.path, b"foreign").is_err());
        assert!(fs::rename(&f.path, f.path.with_file_name("moved.json")).is_err());
        assert!(fs::rename(f.path.parent().unwrap(), f.root.join("moved")).is_err());
        assert_eq!(
            target.bytes(MAX_CONFIG).unwrap(),
            f.plan.view.before.as_bytes()
        );
        drop(target);
        let link = f.root.join("link.json");
        fs::hard_link(&f.path, &link).unwrap();
        assert!(Target::open(&f.path, true).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn repair_windows_backup_failures_never_start_source_write() {
        let f = Fixture::new();
        let blocked = f.root.join("not-a-directory");
        fs::write(&blocked, "busy").unwrap();
        let mut target = Target::open(&f.path, true).unwrap();
        assert!(persist_write(&blocked, &f.plan, "request", &mut target).is_err());
        assert_eq!(
            target.bytes(MAX_CONFIG).unwrap(),
            f.plan.view.before.as_bytes()
        );
    }
    #[cfg(windows)]
    #[test]
    fn repair_windows_torn_completion_recovers_from_hashes() {
        let f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        let applied = persist_write(&f.store, &f.plan, "request", &mut target).unwrap();
        drop(target);
        fs::write(f.store.join(&applied.operation_id).join("result.json"), "{").unwrap();
        let journal = find(&f.store, &applied.operation_id).unwrap();
        assert_eq!(result(&f.store, &journal).unwrap().write_state, "applied");
        fs::write(
            f.store.join(&applied.operation_id).join("original.bin"),
            "tampered",
        )
        .unwrap();
        assert!(result(&f.store, &journal).is_err());
    }
    #[test]
    fn repair_scan_rejects_untrusted_paths() {
        let mut scan = Scan {
            schema_version: 1,
            files: vec![
                SourceFile {
                    file: "app.json".into(),
                    sha256: "0".repeat(64),
                },
                SourceFile {
                    file: "app.js".into(),
                    sha256: "0".repeat(64),
                },
            ],
            missing_apis: vec!["getLocation".into()],
            evidence: vec![Evidence {
                file: "app.js".into(),
                apis: vec!["getLocation".into()],
            }],
            fingerprint: "0".repeat(64),
        };
        assert!(validate_scan(&scan).is_ok());
        scan.files[0].file = "../app.json".into();
        assert!(validate_scan(&scan).is_err());
    }
    #[test]
    fn repair_active_project_is_checked_again_before_authorizing_commit() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); INSERT INTO settings VALUES('active_project','A')").unwrap();
        assert!(require_active(&connection, "A").is_ok());
        connection
            .execute("UPDATE settings SET value='B'", [])
            .unwrap();
        assert!(require_active(&connection, "A").is_err());
        assert!(require_active(&connection, "B").is_ok());
        connection
            .execute("UPDATE settings SET value=NULL", [])
            .unwrap();
        assert!(require_active(&connection, "B").is_err());
    }
    #[cfg(windows)]
    #[test]
    fn repair_undo_revalidates_bytes_on_the_handle_that_forms_the_plan() {
        let f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        let applied = persist_write(&f.store, &f.plan, "request", &mut target).unwrap();
        drop(target);
        let journal = find(&f.store, &applied.operation_id).unwrap();
        assert!(result(&f.store, &journal).unwrap().undo_available);
        // Real external edit between eligibility projection and the later protected plan read.
        fs::write(&f.path, "{\"newWork\":1}").unwrap();
        let mut second = Target::open(&f.path, false).unwrap();
        assert_eq!(second.identity, journal.identity);
        let bytes = String::from_utf8(second.bytes(MAX_CONFIG).unwrap()).unwrap();
        assert!(validate_compensation_bytes(&journal, &bytes, false).is_err());
        assert_eq!(bytes, "{\"newWork\":1}");
    }
    #[cfg(windows)]
    #[test]
    fn repair_resolved_interruption_no_longer_blocks_archive_or_offers_recovery() {
        use std::io::{Seek, SeekFrom, Write};
        let mut f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            persist_write_using(
                &f.store,
                &f.plan,
                "interrupted",
                &mut target,
                |target, _| {
                    target.file.seek(SeekFrom::Start(0)).unwrap();
                    target.file.write_all(b"partial").unwrap();
                    target.file.sync_all().unwrap();
                    panic!("interrupt");
                },
            )
        }));
        drop(target);
        let original = journals(&f.store).unwrap().pop().unwrap();
        assert!(ensure_no_pending_at(&f.store, &f.plan.project.id).is_err());
        let original_bytes = f.plan.view.before.clone();
        f.plan.view.before = fs::read_to_string(&f.path).unwrap();
        f.plan.view.after = original_bytes;
        f.plan.view.kind = "recovery".into();
        f.plan.view.plan_id = writer::random_id().unwrap();
        f.plan.related = Some(original.operation_id.clone());
        let mut target = Target::open(&f.path, true).unwrap();
        let recovered = persist_write(&f.store, &f.plan, "recover", &mut target).unwrap();
        drop(target);
        assert_eq!(recovered.write_state, "undone");
        let old = result(&f.store, &original).unwrap();
        assert_eq!(old.write_state, "undone");
        assert!(!old.recovery_available);
        assert!(!old.undo_available);
        assert!(ensure_no_pending_at(&f.store, &f.plan.project.id).is_ok());
        fs::write(
            f.store.join(&recovered.operation_id).join("result.json"),
            "{",
        )
        .unwrap();
        let recovered_after_torn_result = result(&f.store, &original).unwrap();
        assert_eq!(recovered_after_torn_result.write_state, "undone");
        assert!(!recovered_after_torn_result.recovery_available);
        assert!(ensure_no_pending_at(&f.store, &f.plan.project.id).is_ok());
    }
    #[cfg(windows)]
    #[test]
    fn repair_unpublished_partial_intent_never_poison_existing_history() {
        let f = Fixture::new();
        let mut target = Target::open(&f.path, true).unwrap();
        let applied = persist_write(&f.store, &f.plan, "good", &mut target).unwrap();
        drop(target);
        let orphan = f.store.join(writer::random_id().unwrap());
        fs::create_dir(&orphan).unwrap();
        fs::write(orphan.join("committing.pending"), "{\"version\":").unwrap();
        assert_eq!(journals(&f.store).unwrap().len(), 1);
        assert_eq!(
            result(&f.store, &find(&f.store, &applied.operation_id).unwrap())
                .unwrap()
                .write_state,
            "applied"
        );
        assert_eq!(fs::read_to_string(&f.path).unwrap(), f.plan.view.after);
    }
    #[cfg(windows)]
    #[test]
    fn repair_new_apply_limit_preserves_a_separate_undo_budget() {
        let mut f = Fixture::new();
        let mut latest = None;
        for i in 0..MAX_APPLIES {
            fs::write(&f.path, &f.plan.view.before).unwrap();
            f.plan.view.plan_id = writer::random_id().unwrap();
            let mut target = Target::open(&f.path, true).unwrap();
            latest =
                Some(persist_write(&f.store, &f.plan, &format!("apply-{i}"), &mut target).unwrap());
        }
        let mut target = Target::open(&f.path, true).unwrap();
        assert!(persist_write(&f.store, &f.plan, "over-capacity", &mut target).is_err());
        drop(target);
        let applied = latest.unwrap();
        let original = find(&f.store, &applied.operation_id).unwrap();
        let before = f.plan.view.before.clone();
        f.plan.view.before = f.plan.view.after.clone();
        f.plan.view.after = before;
        f.plan.view.kind = "undo".into();
        f.plan.view.plan_id = writer::random_id().unwrap();
        f.plan.related = Some(applied.operation_id);
        let mut target = Target::open(&f.path, true).unwrap();
        assert_eq!(
            persist_write(&f.store, &f.plan, "undo-after-capacity", &mut target)
                .unwrap()
                .write_state,
            "undone"
        );
        drop(target);
        assert_eq!(journals(&f.store).unwrap().len(), MAX_APPLIES + 1);
        assert_eq!(result(&f.store, &original).unwrap().write_state, "undone");
    }
}
