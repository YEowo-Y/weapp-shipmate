// Append-only project recovery and recoverable, project-scoped archive cleanup.
// Included in project_store so the established transaction and validation helpers are reused.
const BACKUP_MAX_BYTES: usize = 80 * 1024 * 1024;
const BACKUP_MAX_REVISION: u64 = 9_007_199_254_740_991;
const ARCHIVE_TTL_MS: u64 = 15 * 60 * 1000;

#[derive(Default)]
pub struct ProjectArchives(Mutex<Option<PendingArchive>>);
struct PendingArchive {
    token: String,
    project_id: String,
    backup: String,
    prepared_at: u64,
    receipt: Option<serde_json::Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectBackup {
    version: u32,
    project: Project,
    runs: Vec<Run>,
    artifacts: Vec<Artifact>,
    #[serde(default)]
    confirmations: Vec<serde_json::Value>,
    #[serde(default)]
    memory: Option<BackupMemory>,
    #[serde(default)]
    maintenance: Option<crate::project_maintenance::Settings>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupMemory {
    schema_version: u32,
    project_id: String,
    revision: u64,
    entries: Vec<crate::project_memory::MemoryEntry>,
}
fn backup_error() -> String {
    "项目备份格式、大小或记录关联无效；未修改现有数据。请使用应用导出的完整项目 JSON。".into()
}
fn backup_keys(value: &serde_json::Value, allowed: &[&str]) -> Result<(), String> {
    if value
        .as_object()
        .is_none_or(|o| o.keys().any(|key| !allowed.contains(&key.as_str())))
    {
        return Err(backup_error());
    }
    Ok(())
}
fn backup_text(value: &str, max: usize, nonempty: bool) -> bool {
    value.len() <= max && (!nonempty || !value.trim().is_empty()) && !value.contains('\0')
}
fn backup_number(value: u64) -> bool {
    value <= BACKUP_MAX_REVISION
}
fn backup_state(value: &str) -> bool {
    ["running", "succeeded", "failed", "canceled", "interrupted"].contains(&value)
}
fn parse_backup(raw: &str) -> Result<ProjectBackup, String> {
    if raw.is_empty() || raw.len() > BACKUP_MAX_BYTES {
        return Err(backup_error());
    }
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|_| backup_error())?;
    backup_keys(
        &value["project"],
        &[
            "id",
            "name",
            "directory",
            "subject",
            "revision",
            "facts",
            "contextRevision",
            "createdAt",
            "updatedAt",
            "directoryAvailable",
        ],
    )?;
    for run in value["runs"].as_array().ok_or_else(backup_error)? {
        backup_keys(
            run,
            &[
                "id",
                "projectId",
                "kind",
                "state",
                "startedAt",
                "finishedAt",
                "error",
                "projectRevision",
                "contextRevision",
                "toolVersion",
                "rulesVersion",
                "inputSummary",
                "agentRequestId",
                "sessionId",
                "toolCallId",
                "provenance",
                "sourceState",
            ],
        )?;
    }
    for artifact in value["artifacts"].as_array().ok_or_else(backup_error)? {
        backup_keys(
            artifact,
            &[
                "id",
                "runId",
                "projectId",
                "kind",
                "title",
                "markdown",
                "data",
                "createdAt",
                "projectRevision",
                "contextRevision",
                "toolVersion",
                "rulesVersion",
                "inputSummary",
                "provenance",
            ],
        )?;
    }
    let data: ProjectBackup = serde_json::from_value(value).map_err(|_| backup_error())?;
    let p = &data.project;
    id(&p.id)?;
    crate::tool_runner::subject(&p.subject)?;
    if ![1, 2].contains(&data.version)
        || p.revision == 0
        || !backup_number(p.revision)
        || !backup_number(p.context_revision)
        || p.context_revision == BACKUP_MAX_REVISION
        || !backup_text(&p.name, 480, true)
        || p.name.chars().count() > 120
        || p.name.chars().any(char::is_control)
        || !backup_text(&p.directory, 32768, false)
        || p.created_at == 0
        || p.updated_at < p.created_at
        || !backup_number(p.updated_at)
        || p.facts.business_type.chars().count() > 1000
        || p.facts.business_type.chars().any(char::is_control)
        || data.runs.len() > 10000
        || data.artifacts.len() > data.runs.len()
        || data.confirmations.len() > 10000
    {
        return Err(backup_error());
    }
    let mut runs = BTreeMap::new();
    for r in &data.runs {
        id(&r.id)?;
        if runs.insert(r.id.as_str(), r).is_some()
            || r.project_id.as_deref() != Some(&p.id)
            || !["check", "guide", "explain"].contains(&r.kind.as_str())
            || !backup_state(&r.state)
            || r.source_state.as_deref().is_some_and(|v| !backup_state(v))
            || r.provenance.as_deref().is_some_and(|v| v != "imported")
            || r.started_at == 0
            || !backup_number(r.started_at)
            || r.finished_at
                .is_some_and(|t| t < r.started_at || !backup_number(t))
            || (r.state == "running") != r.finished_at.is_none()
            || r.project_revision.is_none_or(|v| v == 0 || v > p.revision)
            || r.context_revision.is_some_and(|v| v > p.context_revision)
            || !backup_text(&r.tool_version, 80, true)
            || !backup_text(&r.rules_version, 131072, true)
            || !backup_text(&r.input_summary, 65536, false)
            || r.error
                .as_ref()
                .is_some_and(|v| !backup_text(v, 16384, false))
        {
            return Err(backup_error());
        }
        for source_id in [&r.agent_request_id, &r.session_id, &r.tool_call_id]
            .into_iter()
            .flatten()
        {
            id(source_id)?;
        }
    }
    let mut artifact_ids = std::collections::HashSet::new();
    let mut artifact_runs = std::collections::HashSet::new();
    let mut bytes = 0;
    for a in &data.artifacts {
        id(&a.id)?;
        let r = runs.get(a.run_id.as_str()).ok_or_else(backup_error)?;
        if !artifact_ids.insert(a.id.as_str())
            || !artifact_runs.insert(a.run_id.as_str())
            || a.project_id.as_deref() != Some(&p.id)
            || a.kind != r.kind
            || (r.state != "succeeded" && r.provenance.as_deref() != Some("imported"))
            || a.project_revision != r.project_revision
            || a.context_revision != r.context_revision
            || a.tool_version != r.tool_version
            || a.rules_version != r.rules_version
            || a.input_summary != r.input_summary
            || a.created_at < r.started_at
            || !backup_number(a.created_at)
            || a.provenance.as_deref().is_some_and(|v| v != "imported")
            || !backup_text(&a.title, 1024, true)
            || !backup_text(&a.markdown, 2 * 1024 * 1024 + 256, true)
        {
            return Err(backup_error());
        }
        if let Some(payload) = &a.data {
            parse_envelope(
                &serde_json::json!({"markdown":"backup validation","data":payload}).to_string(),
                &a.kind,
            )
            .map_err(|_| backup_error())?;
        }
        bytes += encode(a)?.len();
    }
    if bytes > 64 * 1024 * 1024 {
        return Err(backup_error());
    }
    for v in &data.confirmations {
        backup_keys(
            v,
            &[
                "stageId",
                "state",
                "note",
                "recordedAt",
                "contextRevision",
                "rulesVersion",
                "provenance",
                "sourceState",
            ],
        )?;
        if ![
            "registration",
            "certification",
            "filing",
            "category",
            "privacy",
            "domain",
            "review",
            "release",
        ]
        .contains(&v["stageId"].as_str().unwrap_or(""))
            || !["pending", "confirmed", "not_applicable"]
                .contains(&v["state"].as_str().unwrap_or(""))
            || v["note"]
                .as_str()
                .is_none_or(|s| !backup_text(s, 16000, false))
            || v["recordedAt"].as_u64().is_none_or(|n| !backup_number(n))
            || v["contextRevision"]
                .as_u64()
                .is_none_or(|n| n > p.context_revision)
            || v["rulesVersion"]
                .as_str()
                .is_none_or(|s| !backup_text(s, 131072, true))
        {
            return Err(backup_error());
        }
    }
    if let Some(memory) = &data.memory {
        if memory.schema_version != 1
            || memory.project_id != p.id
            || !backup_number(memory.revision)
            || memory.entries.len() > 20
            || (memory.revision == 0 && !memory.entries.is_empty())
        {
            return Err(backup_error());
        }
        let mut ids = std::collections::HashSet::new();
        let mut bytes = 0;
        for entry in &memory.entries {
            id(&entry.id)?;
            if !ids.insert(&entry.id)
                || entry.title.trim().is_empty()
                || entry.title.chars().count() > 80
                || entry.title.chars().any(char::is_control)
                || entry.created_at == 0
                || entry.updated_at < entry.created_at
                || !backup_number(entry.updated_at)
            {
                return Err(backup_error());
            }
            crate::project_context::validate_text(entry.text.clone(), 4096)?;
            bytes += entry.text.len();
        }
        if bytes > 16384 {
            return Err(backup_error());
        }
    }
    if let Some(m) = &data.maintenance {
        if m.project_id != p.id || !backup_number(m.revision) || m.notices.len() > 50 {
            return Err(backup_error());
        }
        // This entire document is discarded, never applied as device authority.
        if encode(m)?.len() > 262144 {
            return Err(backup_error());
        }
    }
    Ok(data)
}
fn storage_status(c: &Connection) -> Result<serde_json::Value, String> {
    let projects: i64 = c
        .query_row("SELECT count(*) FROM projects", [], |r| r.get(0))
        .map_err(db_error)?;
    let runs: i64 = c
        .query_row("SELECT count(*) FROM runs", [], |r| r.get(0))
        .map_err(db_error)?;
    let bytes: i64 = c
        .query_row(
            "SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM artifacts",
            [],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    let confirmations: i64 = c
        .query_row("SELECT count(*) FROM stage_confirmations", [], |r| r.get(0))
        .map_err(db_error)?;
    Ok(
        serde_json::json!({"projects":projects,"runs":runs,"confirmations":confirmations,"artifactBytes":bytes,"projectLimit":200,"runLimit":10000,"confirmationLimit":10000,"artifactByteLimit":67108864,"warning":projects>=160 || runs>=8000 || confirmations>=8000 || bytes>=53687091,"blocked":projects>=200 || runs>=10000 || confirmations>=10000 || bytes>=67108864}),
    )
}
fn backup_preview(data: &ProjectBackup) -> serde_json::Value {
    serde_json::json!({"projectName":data.project.name,"sourceProjectId":data.project.id,"runs":data.runs.len(),"artifacts":data.artifacts.len(),"memoryEntries":data.memory.as_ref().map_or(0,|m|m.entries.len()),"warnings":["恢复只追加新项目；必须重新选择源码目录，备份不包含源码。","历史成果来自外部备份，未在本机执行；阶段确认需重新核对。","记忆默认关闭，不恢复工具授权、文件监听、通知或模型凭据。"]})
}
fn random_backup_id(c: &Connection, prefix: &str) -> Result<String, String> {
    let random: String = c
        .query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
        .map_err(db_error)?;
    Ok(format!("{prefix}-{random}"))
}
#[cfg(test)]
fn read_backup_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|_| "无法读取保留的备份；未更改项目。")?;
    let mut raw = String::new();
    file.take(BACKUP_MAX_BYTES as u64 + 1)
        .read_to_string(&mut raw)
        .map_err(|_| "保留备份无法读取为 UTF-8。")?;
    if raw.len() > BACKUP_MAX_BYTES {
        return Err(backup_error());
    }
    Ok(raw)
}
struct RetainedBackup {
    path: PathBuf,
    _file: std::fs::File,
    #[cfg(windows)]
    _directory: std::fs::File,
}
fn backup_linked(metadata: &std::fs::Metadata) -> bool {
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
fn retain_backup(directory: &Path, file_id: &str, raw: &str) -> Result<RetainedBackup, String> {
    use std::io::{Read, Seek, SeekFrom, Write};
    id(file_id)?;
    std::fs::create_dir_all(directory).map_err(|_| "无法创建项目归档目录；未清理项目。")?;
    if backup_linked(&std::fs::symlink_metadata(directory).map_err(|_| "归档目录不可访问。")?)
    {
        return Err("归档目录不能是符号链接。".into());
    }
    #[cfg(windows)]
    let directory_handle = {
        use std::os::windows::fs::OpenOptionsExt;
        let file = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(3)
            .custom_flags(0x02200000)
            .open(directory)
            .map_err(|_| "归档目录正在变更或不可访问。")?;
        if backup_linked(&file.metadata().map_err(|_| "归档目录信息不可读取。")?) {
            return Err("归档目录不能是链接。".into());
        }
        file
    };
    let path = directory.join(format!("{file_id}.json"));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).read(true).create_new(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0).custom_flags(0x00200000);
    }
    let mut file = match options.open(&path) {
        Ok(mut file) => {
            file.write_all(raw.as_bytes())
                .and_then(|_| file.sync_all())
                .map_err(|_| "备份写入失败；未清理项目，请检查可用空间。")?;
            file
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            let meta = std::fs::symlink_metadata(&path).map_err(|_| "备份文件不可访问。")?;
            if !meta.is_file() || backup_linked(&meta) {
                return Err("备份路径无效。".into());
            }
            options.create_new(false);
            options
                .open(&path)
                .map_err(|_| "备份正被占用或已改变；未修改项目。")?
        }
        Err(_) => return Err("无法写入备份；未清理项目。".into()),
    };
    let metadata = file.metadata().map_err(|_| "备份信息不可读取。")?;
    if !metadata.is_file() || backup_linked(&metadata) || metadata.len() > BACKUP_MAX_BYTES as u64 {
        return Err(backup_error());
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|_| "无法校验备份内容。")?;
    let mut saved = String::new();
    (&mut file)
        .take(BACKUP_MAX_BYTES as u64 + 1)
        .read_to_string(&mut saved)
        .map_err(|_| "无法校验备份内容。")?;
    if saved != raw {
        return Err("保留备份内容与当前操作不一致；未修改项目。".into());
    }
    parse_backup(&saved)?;
    Ok(RetainedBackup {
        path,
        _file: file,
        #[cfg(windows)]
        _directory: directory_handle,
    })
}
fn restore_backup(
    c: &mut Connection,
    raw: &str,
    directory: &str,
    request_id: &str,
    archives: &Path,
) -> Result<serde_json::Value, String> {
    id(request_id)?;
    if request_id.len() > 70 {
        return Err("恢复请求编号过长。".into());
    }
    let mut data = parse_backup(raw)?;
    let directory = crate::tool_runner::directory(directory)?
        .to_string_lossy()
        .into_owned();
    // Persist the exact source before any DB mutation. This is also the durable idempotency binding.
    let _source_backup = retain_backup(archives, &format!("import-{request_id}"), raw)?;
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    let key = format!("project_import:{request_id}");
    let previous: Option<String> = tx
        .query_row("SELECT value FROM settings WHERE key=?", [&key], |r| {
            r.get(0)
        })
        .optional()
        .map_err(db_error)?;
    if let Some(raw) = previous {
        let mut receipt: serde_json::Value = decode(raw)?;
        if receipt["directory"] != directory {
            return Err("此恢复请求已绑定其他目录，请重新预览并发起新请求。".into());
        }
        project(&tx, receipt["projectId"].as_str().ok_or_else(backup_error)?)?;
        receipt["alreadyImported"] = true.into();
        return Ok(receipt);
    }
    let status = storage_status(&tx)?;
    let existing_confirmations: i64 = tx
        .query_row("SELECT count(*) FROM stage_confirmations", [], |r| r.get(0))
        .map_err(db_error)?;
    if status["projects"].as_u64().unwrap_or(200) >= 200
        || status["runs"].as_u64().unwrap_or(10000) + data.runs.len() as u64 > 10000
        || existing_confirmations + data.confirmations.len() as i64 > 10000
    {
        return Err("项目或历史容量不足；请先归档其他项目后再恢复。".into());
    }
    let source_id = data.project.id.clone();
    let new_id = random_backup_id(&tx, "restored")?;
    let mut run_map = BTreeMap::new();
    let mut artifact_map = BTreeMap::new();
    data.project.id = new_id.clone();
    data.project.directory = directory.clone();
    data.project.directory_available = true;
    // Old context evidence cannot become current just by reopening a backup.
    data.project.context_revision += 1;
    data.project.updated_at = now().max(data.project.updated_at);
    tx.execute(
        "INSERT INTO projects(id,revision,data) VALUES(?,?,?)",
        params![new_id, data.project.revision as i64, encode(&data.project)?],
    )
    .map_err(db_error)?;
    for r in &mut data.runs {
        let old_id = r.id.clone();
        r.id = random_backup_id(&tx, "history")?;
        run_map.insert(old_id, r.id.clone());
        r.project_id = Some(new_id.clone());
        r.provenance = Some("imported".into());
        r.source_state = Some(r.source_state.clone().unwrap_or_else(|| r.state.clone()));
        r.state = "interrupted".into();
        r.finished_at = Some(r.finished_at.unwrap_or(r.started_at));
        r.error = Some(format!(
            "导入历史（原状态：{}）；未在本机执行，不作为本机核验结果。",
            r.source_state.as_deref().unwrap_or("unknown")
        ));
        r.agent_request_id = None;
        r.session_id = None;
        r.tool_call_id = None;
        tx.execute(
            "INSERT INTO runs(id,project_id,state,data) VALUES(?,?,?,?)",
            params![r.id, new_id, r.state, encode(r)?],
        )
        .map_err(db_error)?;
    }
    let mut bytes = status["artifactBytes"].as_u64().unwrap_or(67108864);
    for a in &mut data.artifacts {
        let old_id = a.id.clone();
        a.id = random_backup_id(&tx, "history")?;
        artifact_map.insert(old_id, a.id.clone());
        a.run_id = run_map.get(&a.run_id).ok_or_else(backup_error)?.clone();
        a.project_id = Some(new_id.clone());
        a.provenance = Some("imported".into());
        let marker = "> 导入历史：此报告来自项目备份，未在本机执行或核验。\n\n";
        if !a.markdown.starts_with(marker) {
            a.markdown = format!("{marker}{}", a.markdown);
        }
        let encoded = encode(a)?;
        bytes += encoded.len() as u64;
        if bytes > 67108864 {
            return Err(
                "恢复后的成果超过 64 MiB 容量；现有项目保持不变，请先归档其他项目。".into(),
            );
        }
        tx.execute(
            "INSERT INTO artifacts(id,run_id,project_id,data) VALUES(?,?,?,?)",
            params![a.id, a.run_id, new_id, encoded],
        )
        .map_err(db_error)?;
    }
    for v in &mut data.confirmations {
        v["sourceState"] = v["sourceState"]
            .as_str()
            .unwrap_or(v["state"].as_str().unwrap_or("pending"))
            .into();
        v["state"] = "pending".into();
        v["provenance"] = "imported".into();
        tx.execute(
            "INSERT INTO stage_confirmations(project_id,data) VALUES(?,?)",
            params![new_id, encode(v)?],
        )
        .map_err(db_error)?;
    }
    if let Some(memory) = &mut data.memory {
        memory.project_id = new_id.clone();
        for entry in &mut memory.entries {
            entry.enabled = false;
        }
        tx.execute(
            "INSERT INTO settings(key,value) VALUES(?,?)",
            params![format!("project_memory:{new_id}"), encode(memory)?],
        )
        .map_err(db_error)?;
    }
    // Missing maintenance settings resolve to the existing default-off document.
    let receipt = serde_json::json!({"projectId":new_id,"projectName":data.project.name,"directory":directory,"alreadyImported":false,"runs":data.runs.len(),"artifacts":data.artifacts.len(),"idMap":{"projects":{source_id:new_id},"runs":run_map,"artifacts":artifact_map}});
    tx.execute(
        "INSERT INTO settings(key,value) VALUES(?,?)",
        params![key, encode(&receipt)?],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(receipt)
}
fn ensure_no_running(c: &Connection, project_id: &str) -> Result<(), String> {
    let count: i64 = c
        .query_row(
            "SELECT count(*) FROM runs WHERE project_id=? AND state='running'",
            [project_id],
            |r| r.get(0),
        )
        .map_err(db_error)?;
    if count > 0 {
        return Err("项目仍有运行中的任务，请停止并等待任务结束后再归档。".into());
    }
    Ok(())
}
fn prepare_archive(
    c: &mut Connection,
    project_id: &str,
    pending: &ProjectArchives,
) -> Result<serde_json::Value, String> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    ensure_no_running(&tx, project_id)?;
    let raw = export_snapshot(&tx, project_id)?;
    let data = parse_backup(&raw)?;
    let token = random_backup_id(&tx, "archive")?;
    let result = serde_json::json!({"token":token,"backupJson":raw,"projectName":data.project.name,"runs":data.runs.len(),"artifacts":data.artifacts.len(),"expiresAt":now()+ARCHIVE_TTL_MS});
    *pending.0.lock().map_err(|_| "归档预览状态不可用。")? = Some(PendingArchive {
        token,
        project_id: project_id.into(),
        backup: raw,
        prepared_at: now(),
        receipt: None,
    });
    Ok(result)
}
fn commit_archive(
    c: &mut Connection,
    project_id: &str,
    token: &str,
    pending: &ProjectArchives,
    archives: &Path,
) -> Result<serde_json::Value, String> {
    let mut guard = pending.0.lock().map_err(|_| "归档预览状态不可用。")?;
    let entry = guard
        .as_mut()
        .filter(|e| e.token == token && e.project_id == project_id)
        .ok_or("归档确认无效，请重新预览。")?;
    if let Some(receipt) = &entry.receipt {
        return Ok(receipt.clone());
    }
    if now().saturating_sub(entry.prepared_at) > ARCHIVE_TTL_MS {
        return Err("归档预览已过期，请重新预览。".into());
    }
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    ensure_no_running(&tx, project_id)?;
    if export_snapshot(&tx, project_id)? != entry.backup {
        return Err("项目数据已改变，请重新导出并确认归档；未清理任何记录。".into());
    }
    let path = retain_backup(archives, token, &entry.backup)?;
    // A verified durable file exists before the first DELETE, and the DB write lock
    // prevents a run from being created between the comparison and this transaction.
    tx.execute(
        "DELETE FROM stage_confirmations WHERE project_id=?",
        [project_id],
    )
    .map_err(db_error)?;
    tx.execute("DELETE FROM artifacts WHERE project_id=?", [project_id])
        .map_err(db_error)?;
    tx.execute("DELETE FROM runs WHERE project_id=?", [project_id])
        .map_err(db_error)?;
    for key in [
        format!("project_memory:{project_id}"),
        format!("project_maintenance:{project_id}"),
    ] {
        tx.execute("DELETE FROM settings WHERE key=?", [key])
            .map_err(db_error)?;
    }
    tx.execute(
        "UPDATE settings SET value=NULL WHERE key='active_project' AND value=?",
        [project_id],
    )
    .map_err(db_error)?;
    tx.execute("DELETE FROM projects WHERE id=?", [project_id])
        .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    let receipt = serde_json::json!({"projectId":project_id,"archived":true,"backupPath":path.path.to_string_lossy(),"backupJson":entry.backup});
    entry.receipt = Some(receipt.clone());
    Ok(receipt)
}
fn archives_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位项目归档目录。")?
        .join("project-archives"))
}
#[tauri::command]
pub fn project_storage_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
) -> Result<serde_json::Value, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |c| storage_status(c))
}
#[tauri::command]
pub fn project_import_preview(
    window: tauri::WebviewWindow,
    backup_json: String,
) -> Result<serde_json::Value, String> {
    crate::runtime::authorize(&window)?;
    Ok(backup_preview(&parse_backup(&backup_json)?))
}
#[tauri::command]
pub fn project_import(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    backup_json: String,
    directory: String,
    request_id: String,
) -> Result<serde_json::Value, String> {
    crate::runtime::authorize(&window)?;
    let archives = archives_directory(&app)?;
    state.access(&app, |c| {
        restore_backup(c, &backup_json, &directory, &request_id, &archives)
    })
}
#[tauri::command]
pub fn project_archive_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    archives: tauri::State<'_, ProjectArchives>,
    project_id: String,
) -> Result<serde_json::Value, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |c| {
        crate::project_repair::ensure_no_pending_recovery(&app, &project_id)?;
        prepare_archive(c, &project_id, &archives)
    })
}
#[tauri::command]
pub fn project_archive_commit(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    archives: tauri::State<'_, ProjectArchives>,
    project_id: String,
    token: String,
) -> Result<serde_json::Value, String> {
    crate::runtime::authorize(&window)?;
    let directory = archives_directory(&app)?;
    let result = state.access(&app, |c| {
        crate::project_repair::ensure_no_pending_recovery(&app, &project_id)?;
        commit_archive(c, &project_id, &token, &archives, &directory)
    })?;
    crate::project_maintenance::sync_after_project_change(&app);
    Ok(result)
}

#[cfg(test)]
mod project_backup_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    struct Fixture {
        root: PathBuf,
        c: Connection,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "shipmate-restore-{}-{}-{}",
                std::process::id(),
                now(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&root).unwrap();
            let c = open_database(&root.join("projects.sqlite3")).unwrap();
            Self { root, c }
        }
        fn source(&mut self) -> String {
            save(
                &mut self.c,
                ProjectInput {
                    id: "original".into(),
                    name: "恢复测试".into(),
                    directory: self.root.to_string_lossy().into_owned(),
                    subject: "personal".into(),
                    expected_revision: None,
                },
            )
            .unwrap();
            select(&self.c, Some("original".into())).unwrap();
            let (run, _, _) = begin(
                &mut self.c,
                Some("original".into()),
                "guide".into(),
                "run-original".into(),
                None,
                ("1".into(), "rules".into()),
            )
            .unwrap();
            finish(&mut self.c, run, Ok("原始报告".into())).unwrap();
            crate::project_memory::save(
                &mut self.c,
                "original",
                0,
                crate::project_memory::MemoryInput {
                    id: "memory".into(),
                    title: "业务说明".into(),
                    text: "不收集资料".into(),
                    enabled: true,
                },
            )
            .unwrap();
            crate::project_maintenance::save_settings(&mut self.c, "original", 0, true, true)
                .unwrap();
            self.c.execute("INSERT INTO stage_confirmations(project_id,data) VALUES('original',?)",[serde_json::json!({"stageId":"registration","state":"confirmed","note":"原设备确认","recordedAt":now(),"contextRevision":0,"rulesVersion":"rules"}).to_string()]).unwrap();
            export(&mut self.c, "original").unwrap()
        }
        fn restore(&mut self, raw: &str, request: &str) -> Result<serde_json::Value, String> {
            restore_backup(
                &mut self.c,
                raw,
                &self.root.to_string_lossy(),
                request,
                &self.root.join("archives"),
            )
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
    #[test]
    fn round_trip_remaps_identity_and_disables_execution_authority() {
        let mut f = Fixture::new();
        let raw = f.source();
        let receipt = f.restore(&raw, "restore-one").unwrap();
        let pid = receipt["projectId"].as_str().unwrap();
        assert_ne!(pid, "original");
        let restored = parse_backup(&export(&mut f.c, pid).unwrap()).unwrap();
        assert_eq!(restored.runs.len(), 1);
        assert_eq!(restored.artifacts.len(), 1);
        assert_eq!(restored.runs[0].state, "interrupted");
        assert_eq!(restored.runs[0].source_state.as_deref(), Some("succeeded"));
        assert_eq!(restored.runs[0].provenance.as_deref(), Some("imported"));
        assert_eq!(
            restored.artifacts[0].provenance.as_deref(),
            Some("imported")
        );
        assert_eq!(restored.artifacts[0].run_id, restored.runs[0].id);
        assert!(!restored.memory.as_ref().unwrap().entries[0].enabled);
        assert_eq!(restored.memory.as_ref().unwrap().project_id, pid);
        assert!(!restored.maintenance.as_ref().unwrap().watch_enabled);
        assert!(!restored.maintenance.as_ref().unwrap().notifications_enabled);
        assert_eq!(restored.confirmations[0]["state"], "pending");
        assert_eq!(
            snapshot(&f.c).unwrap().active_project_id.as_deref(),
            Some("original")
        );
        assert_eq!(project(&f.c, "original").unwrap().revision, 1);
        let exported = export(&mut f.c, pid).unwrap();
        assert!(f.restore(&exported, "restore-two").is_ok());
    }
    #[test]
    fn rejects_corrupt_foreign_unknown_duplicate_and_mismatched_backup_fields() {
        let mut f = Fixture::new();
        let raw = f.source();
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
        for mutation in 0..9 {
            let mut v = value.clone();
            match mutation {
                0 => v["version"] = 99.into(),
                1 => v["project"]["secret"] = true.into(),
                2 => v["runs"][0]["projectId"] = "other".into(),
                3 => v["runs"][0]["state"] = "approved".into(),
                4 => v["artifacts"][0]["runId"] = "missing".into(),
                5 => v["artifacts"][0]["projectRevision"] = 2.into(),
                6 => v["memory"]["projectId"] = "other".into(),
                7 => {
                    let r = v["runs"][0].clone();
                    v["runs"].as_array_mut().unwrap().push(r);
                }
                _ => v["confirmations"][0]["state"] = "approved".into(),
            }
            assert!(
                f.restore(&v.to_string(), &format!("bad-{mutation}"))
                    .is_err(),
                "mutation {mutation}"
            );
        }
        assert_eq!(storage_status(&f.c).unwrap()["projects"], 1);
        assert!(parse_backup(&"x".repeat(BACKUP_MAX_BYTES + 1)).is_err());
    }
    #[test]
    fn idempotent_restore_survives_reopen_and_rejects_changed_input() {
        let mut f = Fixture::new();
        let raw = f.source();
        let first = f.restore(&raw, "same").unwrap();
        let again = f.restore(&raw, "same").unwrap();
        assert_eq!(first["projectId"], again["projectId"]);
        assert_eq!(again["alreadyImported"], true);
        assert!(f
            .restore(&raw.replace("原始报告", "其他内容"), "same")
            .is_err());
        let root = f.root.clone();
        let directory = root.to_string_lossy().into_owned();
        let mut reopened = Connection::open(root.join("projects.sqlite3")).unwrap();
        let third = restore_backup(
            &mut reopened,
            &raw,
            &directory,
            "same",
            &root.join("archives"),
        )
        .unwrap();
        assert_eq!(third["alreadyImported"], true);
        assert_eq!(storage_status(&f.c).unwrap()["projects"], 2);
    }
    #[test]
    fn failed_restore_rolls_back_every_record_and_keeps_original() {
        let mut f = Fixture::new();
        let raw = f.source();
        f.c.execute_batch("CREATE TRIGGER refuse_artifact BEFORE INSERT ON artifacts BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
        assert!(f.restore(&raw, "failure").is_err());
        assert_eq!(storage_status(&f.c).unwrap()["projects"], 1);
        assert_eq!(storage_status(&f.c).unwrap()["runs"], 1);
        f.c.execute_batch("DROP TRIGGER refuse_artifact").unwrap();
        assert!(f.restore(&raw, "failure").is_ok());
    }
    #[test]
    fn archive_persists_recoverable_data_releases_capacity_and_is_idempotent() {
        let mut f = Fixture::new();
        let raw = f.source();
        let pending = ProjectArchives::default();
        let before = storage_status(&f.c).unwrap();
        let preview = prepare_archive(&mut f.c, "original", &pending).unwrap();
        let receipt = commit_archive(
            &mut f.c,
            "original",
            preview["token"].as_str().unwrap(),
            &pending,
            &f.root.join("archives"),
        )
        .unwrap();
        assert!(Path::new(receipt["backupPath"].as_str().unwrap()).is_file());
        assert_eq!(
            read_backup_file(Path::new(receipt["backupPath"].as_str().unwrap())).unwrap(),
            raw
        );
        assert!(project(&f.c, "original").is_err());
        assert_eq!(storage_status(&f.c).unwrap()["projects"], 0);
        assert!(before["artifactBytes"].as_u64().unwrap() > 0);
        assert_eq!(storage_status(&f.c).unwrap()["artifactBytes"], 0);
        assert!(snapshot(&f.c).unwrap().active_project_id.is_none());
        assert_eq!(
            commit_archive(
                &mut f.c,
                "original",
                preview["token"].as_str().unwrap(),
                &pending,
                &f.root.join("archives")
            )
            .unwrap(),
            receipt
        );
        assert!(f.restore(&raw, "after-archive").is_ok());
    }
    #[test]
    fn archive_rejects_running_stale_token_changed_data_and_disk_failure() {
        let mut f = Fixture::new();
        f.source();
        let pending = ProjectArchives::default();
        let preview = prepare_archive(&mut f.c, "original", &pending).unwrap();
        assert!(commit_archive(
            &mut f.c,
            "original",
            "wrong",
            &pending,
            &f.root.join("archives")
        )
        .is_err());
        let (run, _, _) = begin(
            &mut f.c,
            Some("original".into()),
            "guide".into(),
            "running".into(),
            None,
            ("1".into(), "rules".into()),
        )
        .unwrap();
        assert!(prepare_archive(&mut f.c, "original", &pending).is_err());
        assert!(commit_archive(
            &mut f.c,
            "original",
            preview["token"].as_str().unwrap(),
            &pending,
            &f.root.join("archives")
        )
        .is_err());
        finish(&mut f.c, run, Err("test failure".into())).unwrap_err();
        assert!(commit_archive(
            &mut f.c,
            "original",
            preview["token"].as_str().unwrap(),
            &pending,
            &f.root.join("archives")
        )
        .unwrap_err()
        .contains("已改变"));
        let preview = prepare_archive(&mut f.c, "original", &pending).unwrap();
        let path = f.root.join("blocked");
        std::fs::write(&path, "file").unwrap();
        assert!(commit_archive(
            &mut f.c,
            "original",
            preview["token"].as_str().unwrap(),
            &pending,
            &path
        )
        .is_err());
        assert!(project(&f.c, "original").is_ok());
        pending.0.lock().unwrap().as_mut().unwrap().prepared_at = now() - ARCHIVE_TTL_MS - 1;
        assert!(commit_archive(
            &mut f.c,
            "original",
            preview["token"].as_str().unwrap(),
            &pending,
            &f.root.join("archives")
        )
        .unwrap_err()
        .contains("过期"));
    }
    #[test]
    fn archive_delete_failure_keeps_rows_and_durable_recovery_file() {
        let mut f = Fixture::new();
        let raw = f.source();
        let pending = ProjectArchives::default();
        let preview = prepare_archive(&mut f.c, "original", &pending).unwrap();
        f.c.execute_batch("CREATE TRIGGER refuse_project_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
        let token = preview["token"].as_str().unwrap();
        assert!(commit_archive(
            &mut f.c,
            "original",
            token,
            &pending,
            &f.root.join("archives")
        )
        .is_err());
        assert_eq!(export(&mut f.c, "original").unwrap(), raw);
        assert_eq!(
            read_backup_file(&f.root.join("archives").join(format!("{token}.json"))).unwrap(),
            raw
        );
        f.c.execute_batch("DROP TRIGGER refuse_project_delete")
            .unwrap();
        assert!(commit_archive(
            &mut f.c,
            "original",
            token,
            &pending,
            &f.root.join("archives")
        )
        .is_ok());
    }
    #[test]
    fn capacity_limits_warn_and_restore_failure_is_atomic() {
        let mut f = Fixture::new();
        let raw = f.source();
        let tx = f.c.transaction().unwrap();
        for index in 1..200 {
            let mut p = project(&tx, "original").unwrap();
            p.id = format!("project-{index}");
            tx.execute(
                "INSERT INTO projects(id,revision,data) VALUES(?,1,?)",
                params![p.id, encode(&p).unwrap()],
            )
            .unwrap();
        }
        tx.commit().unwrap();
        let status = storage_status(&f.c).unwrap();
        assert_eq!(status["warning"], true);
        assert_eq!(status["blocked"], true);
        assert!(f.restore(&raw, "full").unwrap_err().contains("容量不足"));
        assert_eq!(storage_status(&f.c).unwrap()["projects"], 200);
        let pending = ProjectArchives::default();
        let preview = prepare_archive(&mut f.c, "project-1", &pending).unwrap();
        commit_archive(
            &mut f.c,
            "project-1",
            preview["token"].as_str().unwrap(),
            &pending,
            &f.root.join("archives"),
        )
        .unwrap();
        assert!(f.restore(&raw, "full").is_ok());
    }
    #[test]
    fn imported_report_is_rejected_as_comparison_evidence() {
        let mut f = Fixture::new();
        let raw = f.source();
        let receipt = f.restore(&raw, "compare").unwrap();
        let pid = receipt["projectId"].as_str().unwrap();
        let aid = receipt["idMap"]["artifacts"]["run-original"]
            .as_str()
            .unwrap();
        assert_eq!(receipt["idMap"]["projects"]["original"], pid);
        let outcome = compare_artifacts(&f.c, pid, aid, aid).unwrap();
        assert_eq!(outcome["comparable"], false);
        assert!(outcome["reason"].as_str().unwrap().contains("导入历史"));
        let snapshot = snapshot(&f.c).unwrap();
        assert_eq!(
            snapshot.artifacts.iter().find(|a| a["id"] == aid).unwrap()["provenance"],
            "imported"
        );
        assert_eq!(
            snapshot
                .runs
                .iter()
                .find(|r| r.project_id.as_deref() == Some(pid))
                .unwrap()
                .provenance
                .as_deref(),
            Some("imported")
        );
    }
    #[cfg(windows)]
    #[test]
    fn retained_windows_backup_cannot_be_rewritten_or_deleted_during_commit() {
        let mut f = Fixture::new();
        let raw = f.source();
        let retained = retain_backup(&f.root.join("archives"), "locked", &raw).unwrap();
        assert!(std::fs::write(&retained.path, "replacement").is_err());
        assert!(std::fs::remove_file(&retained.path).is_err());
        let path = retained.path.clone();
        drop(retained);
        assert_eq!(read_backup_file(&path).unwrap(), raw);
    }
}
