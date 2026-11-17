fn parse_envelope(text: &str, kind: &str) -> crate::error::DesktopResult<(String, serde_json::Value)> {
    if text.len() > 2 * 1024 * 1024 {
        return Err("结构化成果超过保存限制。".into());
    }
    let v: serde_json::Value = serde_json::from_str(text).map_err(|_| "工具返回格式无效。")?;
    let markdown = v["markdown"]
        .as_str()
        .filter(|v| !v.trim().is_empty() && v.len() <= 2 * 1024 * 1024)
        .ok_or("工具报告无效。")?;
    let data = &v["data"];
    if data["schemaVersion"] != 1 || data["kind"] != kind || !data["result"].is_object() {
        return Err("工具结构化成果无效。".into());
    }
    if data["result"]["command"] != kind || !data["result"]["items"].is_array() {
        return Err("工具结果类型不匹配。".into());
    }
    for item in data["result"]["items"].as_array().ok_or("清单无效。")? {
        if ["ruleId", "title", "stage", "severity"]
            .iter()
            .any(|k| item[k].as_str().is_none_or(|v| v.is_empty()))
            || !item["requires"]
                .as_array()
                .is_some_and(|v| v.iter().all(|s| s.is_string()))
        {
            return Err("清单字段无效。".into());
        }
    }
    if kind == "check" {
        let scan = &data["result"]["meta"]["scan"];
        if [
            "filesScanned",
            "readErrors",
            "skippedDirs",
            "skippedLinks",
            "skippedLargeFiles",
        ]
        .iter()
        .any(|k| scan[k].as_u64().is_none())
            || !scan["truncated"].is_boolean()
            || !scan["configErrors"].is_array()
        {
            return Err("扫描统计无效。".into());
        }
        let scope = &data["scope"];
        if !scope["root"].is_string()
            || !scope["policyVersion"].is_string()
            || !scope["complete"].is_boolean()
            || !scope["filesHash"]
                .as_str()
                .is_some_and(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
            || data["result"]["meta"]["scan"]["scope"] != *scope
        {
            return Err("扫描范围无效。".into());
        }
    } else if !data["scope"].is_null() {
        return Err("工具范围类型无效。".into());
    }
    Ok((markdown.into(), data.clone()))
}
fn finish_structured(
    c: &mut Connection,
    run: Run,
    markdown: String,
    data: serde_json::Value,
    failures: &Mutex<BTreeMap<String, Run>>,
) -> crate::error::DesktopResult<Artifact> {
    let result = finish_payload(c, run.clone(), Ok(markdown), Some(data));
    if let Err(error) = &result {
        let _ = finish_recoverable(
            c,
            run,
            Err(format!("成果保存失败：{error}").into()),
            failures,
        );
    }
    result
}

fn catalog(app: &tauri::AppHandle) -> crate::error::DesktopResult<serde_json::Value> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|_| {
            crate::error::DesktopError::runtime_unavailable(
                "project_workflow",
                "missing_resource_dir",
                "无法定位规则。",
            )
        })?
        .join("runtime/workflow-catalog.json");
    let data = std::fs::read(path).map_err(|_| {
        crate::error::DesktopError::runtime_unavailable(
            "project_workflow",
            "missing_workflow_catalog",
            "阶段资料缺失，请重新安装。",
        )
    })?;
    let value: serde_json::Value = serde_json::from_slice(&data).map_err(|_| "阶段资料损坏。")?;
    if value["schemaVersion"] != 1 || !value["stages"].is_array() || !value["rules"].is_array() {
        return Err("阶段资料无效。".into());
    }
    validate_catalog(&value)?;
    Ok(value)
}
fn validate_catalog(v: &serde_json::Value) -> crate::error::DesktopResult<()> {
    let stages = v["stages"].as_array().ok_or("阶段目录无效。")?;
    if stages.is_empty() || stages.len() > 16 {
        return Err("阶段目录数量无效。".into());
    }
    let mut edges = BTreeMap::new();
    for stage in stages {
        let id = stage["stage"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or("阶段编号无效。")?;
        if edges.contains_key(id) || !stage["title"].is_string() {
            return Err("阶段编号重复或标题无效。".into());
        }
        let deps = match stage.get("requires_stage") {
            None => Vec::new(),
            Some(x) => x
                .as_array()
                .ok_or("阶段依赖无效。")?
                .iter()
                .map(|v| v.as_str().ok_or("阶段依赖编号无效。"))
                .collect::<Result<Vec<_>, _>>()?,
        };
        edges.insert(id, deps);
        if let Some(condition) = stage.get("applies_when") {
            if !matches!(
                condition.as_str(),
                Some("collects_sensitive == true" | "has_server_domain == true")
            ) {
                return Err("阶段条件不受支持。".into());
            }
        }
    }
    fn visit<'a>(
        id: &'a str,
        edges: &BTreeMap<&'a str, Vec<&'a str>>,
        path: &mut Vec<&'a str>,
    ) -> crate::error::DesktopResult<()> {
        if path.contains(&id) {
            return Err("阶段依赖存在循环。".into());
        }
        path.push(id);
        for dependency in edges.get(id).ok_or("阶段依赖不存在。")? {
            visit(dependency, edges, path)?;
        }
        path.pop();
        Ok(())
    }
    for id in edges.keys() {
        visit(id, &edges, &mut Vec::new())?;
    }
    Ok(())
}
fn persist_project(c: &Connection, p: &mut Project) -> crate::error::DesktopResult<()> {
    p.revision = p
        .revision
        .checked_add(1)
        .filter(|n| *n <= 9_007_199_254_740_991)
        .ok_or("项目版本超出限制。")?;
    p.updated_at = now();
    c.execute(
        "UPDATE projects SET revision=?,data=? WHERE id=?",
        params![p.revision as i64, encode(p)?, p.id],
    )
    .map_err(db_error)?;
    Ok(())
}
fn validate_stage(
    c: &Connection,
    p: &Project,
    catalog: &serde_json::Value,
    rules: &str,
    stage_id: &str,
    state: &str,
) -> crate::error::DesktopResult<()> {
    validate_stage_depth(c, p, catalog, rules, stage_id, state, 0)
}
fn validate_stage_depth(
    c: &Connection,
    p: &Project,
    catalog: &serde_json::Value,
    rules: &str,
    stage_id: &str,
    state: &str,
    depth: usize,
) -> crate::error::DesktopResult<()> {
    if depth > 16 {
        return Err("阶段依赖存在循环或过深。".into());
    }
    let stage = catalog["stages"]
        .as_array()
        .and_then(|v| v.iter().find(|s| s["stage"] == stage_id))
        .ok_or("阶段不存在。")?;
    if state == "pending" {
        return Ok(());
    }
    let applies = match stage["applies_when"].as_str() {
        None => Some(true),
        Some("collects_sensitive == true") => p.facts.collects_sensitive,
        Some("has_server_domain == true") => p.facts.has_server_domain,
        Some(_) => return Err("条件暂不支持，请更新应用。".into()),
    };
    if applies.is_none()
        || (state == "confirmed" && applies != Some(true))
        || (state == "not_applicable" && applies != Some(false))
    {
        return Err("请补齐事实并核对阶段适用性。".into());
    }
    let records: Vec<serde_json::Value> = rows(
        c,
        "SELECT data FROM stage_confirmations WHERE project_id=? ORDER BY id",
        Some(&p.id),
    )?;
    for dependency in stage["requires_stage"].as_array().into_iter().flatten() {
        let record = records
            .iter()
            .rev()
            .find(|r| r["stageId"] == *dependency)
            .ok_or("请先完成前置阶段。")?;
        if !["confirmed", "not_applicable"].contains(&record["state"].as_str().unwrap_or(""))
            || record["contextRevision"] != p.context_revision
            || record["rulesVersion"] != rules
        {
            return Err("前置阶段需要重新核对。".into());
        }
        validate_stage_depth(
            c,
            p,
            catalog,
            rules,
            dependency.as_str().ok_or("阶段无效。")?,
            record["state"].as_str().ok_or("确认无效。")?,
            depth + 1,
        )?;
    }
    Ok(())
}
#[tauri::command]
pub async fn project_facts_save(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
    expected_revision: u64,
    facts: ProjectFacts,
) -> crate::error::DesktopResult<Project> {
    crate::runtime::authorize(&window)?;
    if facts.business_type.chars().count() > 1000
        || facts.business_type.chars().any(char::is_control)
    {
        return Err("业务说明无效。".into());
    }
    let store = state.inner().clone();
    crate::error::run_blocking("project_workflow", "保存项目事实意外退出，请重试。", move || {
        let result = store.access(&app, |c| {
            let tx = c
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(db_error)?;
            let mut p = project(&tx, &project_id)?;
            if p.revision != expected_revision {
                return Err(crate::error::DesktopError::conflict(
                    "项目已改变，请刷新重试。",
                ));
            }
            if p.facts != facts {
                p.context_revision += 1;
                p.facts = facts;
            }
            persist_project(&tx, &mut p)?;
            tx.commit().map_err(db_error)?;
            Ok(p)
        })?;
        crate::project_maintenance::sync_after_project_change(&app);
        Ok(result)
    })
    .await
}
#[tauri::command]
pub async fn project_workflow(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
) -> crate::error::DesktopResult<serde_json::Value> {
    crate::runtime::authorize(&window)?;
    let store = state.inner().clone();
    crate::error::run_blocking("project_workflow", "读取上线流程意外退出，请重试。", move || {
        let catalog = catalog(&app)?;
        let (_, rules) = versions(&app)?;
        store.access(&app, |c| {
            let project = project(c, &project_id)?;
            let confirmations: Vec<serde_json::Value> = rows(
                c,
                "SELECT data FROM stage_confirmations WHERE project_id=? ORDER BY id",
                Some(&project_id),
            )?;
            Ok(serde_json::json!({"project":project,"catalog":catalog,"rulesVersion":rules,"confirmations":confirmations}))
        })
    })
    .await
}
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn project_stage_confirm(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    store: tauri::State<'_, ProjectStore>,
    project_id: String,
    expected_revision: u64,
    expected_rules_version: String,
    stage_id: String,
    state: String,
    note: String,
) -> crate::error::DesktopResult<Project> {
    crate::runtime::authorize(&window)?;
    let store = store.inner().clone();
    crate::error::run_blocking("project_workflow", "保存阶段确认意外退出，请重试。", move || {
        let (_, rules) = versions(&app)?;
        if rules != expected_rules_version
            || !["confirmed", "not_applicable", "pending"].contains(&state.as_str())
            || note.chars().count() > 2000
            || (state == "not_applicable" && note.trim().is_empty())
        {
            return Err("确认参数或规则版本无效，请刷新。".into());
        }
        let trusted_catalog = catalog(&app)?;
        if !trusted_catalog["stages"]
            .as_array()
            .ok_or("阶段资料无效。")?
            .iter()
            .any(|s| s["stage"] == stage_id)
        {
            return Err("阶段不存在。".into());
        }
        store.access(&app, |c| {
            let tx = c
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(db_error)?;
            let mut p = project(&tx, &project_id)?;
            if p.revision != expected_revision {
                return Err(crate::error::DesktopError::conflict(
                    "项目已改变，请重新核对。",
                ));
            }
            validate_stage(&tx, &p, &trusted_catalog, &rules, &stage_id, &state)?;
            let count: u32 = tx
                .query_row("SELECT count(*) FROM stage_confirmations", [], |r| r.get(0))
                .map_err(db_error)?;
            if count >= 10000 {
                return Err(crate::error::DesktopError::conflict(
                    "确认历史已达上限，请在项目管理中备份并归档旧项目后重试。",
                ));
            }
            let record = serde_json::json!({"stageId":stage_id,"state":state,"note":note,"recordedAt":now(),"contextRevision":p.context_revision,"rulesVersion":rules});
            tx.execute(
                "INSERT INTO stage_confirmations(project_id,data) VALUES(?,?)",
                params![project_id, encode(&record)?],
            )
            .map_err(db_error)?;
            persist_project(&tx, &mut p)?;
            tx.commit().map_err(db_error)?;
            Ok(p)
        })
    })
    .await
}
#[tauri::command]
pub async fn project_compare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
    before_artifact_id: String,
    after_artifact_id: String,
) -> crate::error::DesktopResult<serde_json::Value> {
    crate::runtime::authorize(&window)?;
    let store = state.inner().clone();
    crate::error::run_blocking("project_workflow", "比较预检报告意外退出，请重试。", move || {
        store.access(&app, |c| {
            compare_artifacts(c, &project_id, &before_artifact_id, &after_artifact_id)
        })
    })
    .await
}
pub(crate) fn compare_artifacts(
    c: &Connection,
    project_id: &str,
    before_artifact_id: &str,
    after_artifact_id: &str,
) -> crate::error::DesktopResult<serde_json::Value> {
        project(c,project_id)?;
        let a = artifact(c,before_artifact_id)?;
        let b = artifact(c,after_artifact_id)?;
        let no = |reason: &str| serde_json::json!({"comparable":false,"reason":reason,"added":[],"remaining":[],"notDetected":[]});
        if a.provenance.as_deref()==Some("imported") || b.provenance.as_deref()==Some("imported") { return Ok(no("导入历史未经本机执行，请重新预检后再比较。")); }
        if a.project_id.as_deref()!=Some(project_id) || b.project_id!=a.project_id || a.kind!="check" || b.kind!="check" || a.id==b.id || a.created_at>b.created_at { return Ok(no("请选择同项目按时间排列的两份预检。")); }
        let ordinal = |id: &str| c.query_row("SELECT rowid FROM artifacts WHERE id=?",[id],|r|r.get::<_,i64>(0)).map_err(db_error);
        if ordinal(&a.id)? >= ordinal(&b.id)? { return Ok(no("报告顺序无效，请选择更早的基线。")); }
        for artifact in [&a,&b] {
            let state: String = c.query_row("SELECT state FROM runs WHERE id=?",[&artifact.run_id],|r|r.get(0)).map_err(db_error)?;
            if state != "succeeded" { return Ok(no("仅能比较成功的预检。")); }
        }
        if a.rules_version!=b.rules_version || a.tool_version!=b.tool_version || a.input_summary!=b.input_summary { return Ok(no("规则、工具或项目事实已经变化。")); }
        let (Some(ad),Some(bd))=(a.data,b.data) else { return Ok(no("旧报告缺少结构化范围，无法比较。")); };
        for v in [&ad,&bd] {
            let envelope=serde_json::json!({"markdown":"comparison validation","data":v}).to_string();
            if parse_envelope(&envelope,"check").is_err() { return Ok(no("结构化成果无效，无法比较。")); }

            let scan = &v["result"]["meta"]["scan"];
            if scan["filesScanned"].as_u64().unwrap_or(0)==0 || scan["truncated"]==true || ["readErrors","skippedDirs","skippedLinks","skippedLargeFiles"].iter().any(|k|scan[k].as_u64().unwrap_or(0)>0) || scan["configErrors"].as_array().is_some_and(|v|!v.is_empty()) { return Ok(no("扫描不完整，无法比较。")); }
        }
        if ad["scope"] != bd["scope"] || ad["scope"]["complete"] != true || !ad["scope"]["filesHash"].is_string() { return Ok(no("扫描范围不同或不完整。")); }
        let (Some(ai),Some(bi)) = (ad["result"]["items"].as_array(),bd["result"]["items"].as_array()) else { return Ok(no("检查结果结构不完整。")); };
        let key = |v: &serde_json::Value| v["ruleId"].as_str().or(v["id"].as_str()).unwrap_or("").to_string();
        if ai.iter().chain(bi).any(|v| key(v).is_empty()) { return Ok(no("检查规则编号缺失。")); }
        let added: Vec<_> = bi.iter().filter(|v| !ai.iter().any(|old| key(old)==key(v))).collect();
        let remaining: Vec<_> = bi.iter().filter(|v| ai.iter().any(|old| key(old)==key(v))).collect();
        let not_detected: Vec<_> = ai.iter().filter(|v| !bi.iter().any(|new| key(new)==key(v))).collect();
        Ok(serde_json::json!({"comparable":true,"reason":"同范围预检比较；未再检出不代表已修复。","added":added,"remaining":remaining,"notDetected":not_detected}))
}

#[cfg(test)]
mod workflow_tests {
    use super::*;
    #[test]
    fn catalog_rejects_cycles_missing_and_malformed_dependencies() {
        for stages in [
            serde_json::json!([{"stage":"a","title":"A","requires_stage":["a"]}]),
            serde_json::json!([{"stage":"a","title":"A","requires_stage":["missing"]}]),
            serde_json::json!([{"stage":"a","title":"A","requires_stage":false}]),
        ] {
            assert!(validate_catalog(&serde_json::json!({"stages":stages})).is_err());
        }
    }
    #[test]
    fn structured_contract_rejects_text_wrong_kind_and_missing_scope() {
        assert!(parse_envelope("report", "check").is_err());
        let good = serde_json::json!({"markdown":"report","data":{"schemaVersion":1,"kind":"guide","result":{"command":"guide","items":[]},"scope":null}}).to_string();
        assert!(parse_envelope(&good, "guide").is_ok());
        assert!(parse_envelope(&good, "check").is_err());
        assert!(parse_envelope(&good.replace("guide", "check"), "check").is_err());
    }
    #[test]
    fn old_artifact_has_no_structured_payload() {
        let value = serde_json::json!({"id":"a","runId":"r","projectId":null,"kind":"check","title":"old","markdown":"report","createdAt":1,"projectRevision":null,"toolVersion":"1","rulesVersion":"1","inputSummary":"{}"});
        let a: Artifact = serde_json::from_value(value).unwrap();
        assert!(a.data.is_none());
        assert!(a.context_revision.is_none());
    }
}
