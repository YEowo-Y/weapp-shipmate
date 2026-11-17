//! Private, request-scoped capabilities. Model input never determines a project path.
use crate::{project_store, runtime::valid_id, tool_runner::ToolRunner};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const LIMIT: Duration = Duration::from_secs(120);
static RUN_ID: AtomicU64 = AtomicU64::new(0);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Permission {
    project_id: String,
    session_id: String,
    allow_read: bool,
    share_results: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Body {
    model: String,
    messages: Vec<Message>,
    agent: Permission,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Message {
    role: String,
    content: String,
}
pub(crate) fn permission(body: Option<&str>) -> crate::error::DesktopResult<Permission> {
    let body: Body = serde_json::from_str(body.ok_or("缺少项目工具授权。")?)
        .map_err(|_| crate::error::DesktopError::validation("项目工具请求无效。"))?;
    if body.model.trim().is_empty()
        || body.model.len() > 256
        || body.messages.is_empty()
        || body.messages.len() > 100
        || body.messages.iter().any(|m| {
            !["user", "assistant"].contains(&m.role.as_str())
                || m.content.trim().is_empty()
                || m.content.encode_utf16().count() > 32768
        })
        || !body.agent.allow_read
        || !valid_id(&body.agent.project_id)
        || !valid_id(&body.agent.session_id)
    {
        return Err(crate::error::DesktopError::validation(
            "项目工具请求或授权无效。",
        ));
    }
    // Required boolean, separate from local read permission; enforced by the model adapter.
    let _share_results = body.agent.share_results;
    Ok(body.agent)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Input {
    kind: String,
    query: String,
}
impl Input {
    fn valid(&self) -> bool {
        if self
            .query
            .chars()
            .any(|c| c.is_ascii_control() && !matches!(c, '\t' | '\r' | '\n'))
        {
            return false;
        }
        match self.kind.as_str() {
            "check" | "guide" => self.query.is_empty(),
            "explain" => !self.query.trim().is_empty() && self.query.encode_utf16().count() <= 4096,
            _ => false,
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Frame {
    #[serde(rename = "type")]
    frame_type: String,
    id: String,
    request_id: String,
    tool_call_id: String,
    input: Input,
}
struct Grant {
    project_id: String,
    session_id: String,
    created: Instant,
    calls: HashSet<String>,
    active: Option<String>,
}
#[derive(Default)]
struct Registry {
    grants: HashMap<String, Grant>,
    used: HashSet<String>,
}
#[derive(Clone, Default)]
pub(crate) struct AgentTools(Arc<Mutex<Registry>>);
impl AgentTools {
    pub(crate) fn new(runner: ToolRunner) -> Self {
        let tools = Self::default();
        let registry = Arc::downgrade(&tools.0);
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(250));
            let Some(registry) = registry.upgrade() else {
                break;
            };
            if let Ok(mut registry) = registry.lock() {
                registry.grants.retain(|_, grant| {
                    if grant.created.elapsed() < LIMIT {
                        return true;
                    }
                    if let Some(id) = &grant.active {
                        let _ = runner.cancel(id);
                    }
                    false
                });
            };
        });
        tools
    }
    pub(crate) fn register(
        &self,
        app: &tauri::AppHandle,
        request_id: &str,
        permission: Permission,
    ) -> crate::error::DesktopResult<()> {
        project_store::active_agent_project(app, &permission.project_id)?;
        let mut registry = self.0.lock().map_err(|_| {
            crate::error::DesktopError::state_unavailable("agent_tools", "项目工具授权不可用。")
        })?;
        if registry.used.len() >= 10000
            || registry.used.contains(request_id)
            || registry
                .grants
                .values()
                .any(|g| g.session_id == permission.session_id)
        {
            return Err(crate::error::DesktopError::conflict(
                "此会话已有任务或请求编号已使用，请停止后新建请求。",
            ));
        }
        registry.used.insert(request_id.to_owned());
        registry.grants.insert(
            request_id.to_owned(),
            Grant {
                project_id: permission.project_id,
                session_id: permission.session_id,
                created: Instant::now(),
                calls: HashSet::new(),
                active: None,
            },
        );
        Ok(())
    }
    pub(crate) fn revoke(&self, request_id: &str, runner: &ToolRunner) {
        if let Ok(mut registry) = self.0.lock() {
            if let Some(grant) = registry.grants.remove(request_id) {
                if let Some(id) = grant.active {
                    let _ = runner.cancel(&id);
                }
            }
        }
    }
    pub(crate) fn clear(&self, runner: &ToolRunner) {
        if let Ok(mut registry) = self.0.lock() {
            for (_, grant) in registry.grants.drain() {
                if let Some(id) = grant.active {
                    let _ = runner.cancel(&id);
                }
            }
        }
    }
    pub(crate) fn cancel_frame(&self, frame: &Value, runner: &ToolRunner) -> bool {
        let Some(map) = frame.as_object() else {
            return false;
        };
        if map.len() != 3
            || frame["type"] != "project-tool-cancel"
            || !frame["id"].as_str().is_some_and(valid_id)
        {
            return false;
        }
        let Some(id) = frame["requestId"].as_str().filter(|id| valid_id(id)) else {
            return false;
        };
        self.revoke(id, runner);
        true
    }
    pub(crate) async fn execute(&self, app: tauri::AppHandle, value: Value) -> Value {
        let id = value["id"]
            .as_str()
            .filter(|id| valid_id(id))
            .unwrap_or("invalid")
            .to_owned();
        let result = self.execute_inner(app, value).await;
        match result {
            Ok(result) => json!({"type":"project-tool-result","id":id,"ok":true,"result":result}),
            Err(code) => {
                json!({"type":"project-tool-result","id":id,"ok":false,"errorCode":code,"error":"项目工具未完成：授权已失效、参数无效、任务忙碌或执行失败。请查看本机运行记录后重试。"})
            }
        }
    }
    async fn execute_inner(
        &self,
        app: tauri::AppHandle,
        value: Value,
    ) -> Result<Value, &'static str> {
        let frame: Frame = serde_json::from_value(value).map_err(|_| "invalid_request")?;
        if frame.frame_type != "project-tool"
            || !valid_id(&frame.id)
            || !valid_id(&frame.request_id)
            || !valid_tool_call_id(&frame.tool_call_id)
            || !frame.input.valid()
        {
            return Err("invalid_request");
        }
        let runner = app.state::<ToolRunner>().inner().clone();
        let (project_id, agent, run_id) = {
            let mut registry = self.0.lock().map_err(|_| "not_authorized")?;
            let grant = registry
                .grants
                .get_mut(&frame.request_id)
                .ok_or("not_authorized")?;
            claim(grant, &frame.tool_call_id)?;
            let run_id = format!(
                "agent-{}-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos(),
                RUN_ID.fetch_add(1, Ordering::Relaxed)
            );
            let reservation = runner
                .reserve_guard_outcome(&run_id)
                .map_err(|error| error.code())?;
            grant.active = Some(run_id.clone());
            (
                grant.project_id.clone(),
                project_store::AgentRun {
                    request_id: frame.request_id.clone(),
                    session_id: grant.session_id.clone(),
                    tool_call_id: frame.tool_call_id,
                    reservation,
                },
                run_id,
            )
        };
        let result = project_store::run_internal(
            app.clone(),
            app.state::<project_store::ProjectStore>().inner().clone(),
            Some(project_id),
            frame.input.kind,
            run_id,
            None,
            Some(frame.input.query),
            Some(agent),
        )
        .await;
        let mut registry = self.0.lock().map_err(|_| "not_authorized")?;
        let grant = registry
            .grants
            .get_mut(&frame.request_id)
            .ok_or("not_authorized")?;
        grant.active = None;
        if grant.created.elapsed() >= LIMIT {
            return Err("tool_timeout");
        }
        project(&result.map_err(|error| error.code())?).map_err(|_| "tool_failed")
    }
}
fn valid_tool_call_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn claim(grant: &mut Grant, tool_call_id: &str) -> Result<(), &'static str> {
    if grant.created.elapsed() >= LIMIT {
        return Err("not_authorized");
    }
    if grant.active.is_some() {
        return Err("busy");
    }
    if grant.calls.len() >= 2 || !grant.calls.insert(tool_call_id.to_owned()) {
        return Err("invalid_request");
    }
    Ok(())
}

fn bounded(value: &Value, limit: usize) -> crate::error::DesktopResult<&str> {
    value
        .as_str()
        .filter(|v| {
            !v.is_empty() && v.encode_utf16().count() <= limit && !v.chars().any(char::is_control)
        })
        .ok_or_else(|| crate::error::DesktopError::validation("工具摘要字段无效。"))
}
fn project(artifact: &project_store::Artifact) -> crate::error::DesktopResult<Value> {
    let data = artifact.data.as_ref().ok_or("缺少结构化结果。")?;
    if data["schemaVersion"] != 1
        || data["kind"] != artifact.kind
        || !["check", "guide", "explain"].contains(&artifact.kind.as_str())
    {
        return Err("结果类型无效。".into());
    }
    let rows = data["result"]["items"].as_array().ok_or("结果列表无效。")?;
    let mut items = Vec::new();
    for row in rows.iter().take(20) {
        let rule_id = bounded(&row["ruleId"], 120)?;
        let title = bounded(&row["title"], 240)?;
        let severity = bounded(&row["severity"], 32)?;
        if !["blocker", "warning", "info", "error"].contains(&severity) {
            return Err("工具规则级别无效。".into());
        }
        let source = row["official_url"].as_str().unwrap_or("");
        let source = if source.len() <= 2048
            && tauri::Url::parse(source).is_ok_and(|url| {
                url.scheme() == "https"
                    && url.host_str().is_some()
                    && url.username().is_empty()
                    && url.password().is_none()
            }) {
            source
        } else {
            ""
        };
        items.push(json!({"ruleId":rule_id,"title":title,"severity":severity,"sourceUrl":source}));
    }
    if !valid_id(&artifact.run_id)
        || !valid_id(&artifact.id)
        || artifact
            .project_revision
            .is_none_or(|n| n > 9_007_199_254_740_991)
        || artifact
            .context_revision
            .is_none_or(|n| n > 9_007_199_254_740_991)
        || rows.len() > 100000
    {
        return Err("工具成果关联无效。".into());
    }
    let title = match artifact.kind.as_str() {
        "check" => "项目预检",
        "guide" => "提审清单",
        _ => "拒因解释",
    };
    let scope = if artifact.kind == "check" {
        Some(
            data["scope"]["complete"]
                .as_bool()
                .ok_or("扫描范围无效。")?,
        )
    } else {
        None
    };
    let mut result = json!({"schemaVersion":1,"kind":artifact.kind,"runId":artifact.run_id,"artifactId":artifact.id,"title":title,"summary":format!("本地工具已完成，共 {} 条规则结果；完整报告已保存到本机成果区。",rows.len()),"itemCount":rows.len(),"items":items,"truncated":rows.len()>20,"scopeComplete":scope,"projectRevision":artifact.project_revision,"contextRevision":artifact.context_revision});
    while result.to_string().len() > 24000 {
        if result["items"].as_array_mut().unwrap().pop().is_none() {
            return Err("工具摘要超过限制。".into());
        }
        result["truncated"] = json!(true);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn artifact(items: Vec<Value>) -> project_store::Artifact {
        serde_json::from_value(json!({"id":"run-1","runId":"run-1","projectId":"p","kind":"guide","title":"SECRET_TITLE","markdown":"SECRET_CODE","data":{"schemaVersion":1,"kind":"guide","result":{"items":items,"query":"SECRET_QUERY"},"scope":null},"createdAt":1,"projectRevision":1,"contextRevision":0,"toolVersion":"1","rulesVersion":"1","inputSummary":"SECRET_PATH"})).unwrap()
    }
    #[test]
    fn projection_only_exports_bounded_rule_metadata() {
        let item = json!({"ruleId":"r","title":"固定规则","severity":"warning","official_url":"https://example.com/rule","snippet":"SECRET_SNIPPET","why":"SECRET_WHY"});
        let value = project(&artifact(vec![item; 21])).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 20);
        assert_eq!(value["itemCount"], 21);
        assert_eq!(value["truncated"], true);
        assert_eq!(value["items"][0]["sourceUrl"], "https://example.com/rule");
        assert!(!value.to_string().contains("SECRET"));
        assert!(value["scopeComplete"].is_null());
    }
    #[test]
    fn projection_rejects_corrupt_data_and_removes_credential_urls() {
        let mut a = artifact(vec![
            json!({"ruleId":"r","title":"rule","severity":"info","official_url":"https://user:password@example.com"}),
        ]);
        assert_eq!(project(&a).unwrap()["items"][0]["sourceUrl"], "");
        a.data.as_mut().unwrap()["result"]["items"][0]["title"] = json!("x".repeat(241));
        assert!(project(&a).is_err());
        a.data = None;
        assert!(project(&a).is_err());
    }
    #[test]
    fn projection_trims_rows_to_byte_budget_and_ids_follow_sdk_bounds() {
        let item = json!({"ruleId":"r","title":"规".repeat(240),"severity":"info","official_url":format!("https://example.com/{}","x".repeat(1900))});
        let value = project(&artifact(vec![item; 20])).unwrap();
        assert!(value.to_string().len() <= 24000);
        assert_eq!(value["truncated"], true);
        assert!(value["items"].as_array().unwrap().len() < 20);
        assert!(valid_tool_call_id(&"a".repeat(128)));
        assert!(!valid_tool_call_id(&"a".repeat(129)));
        assert!(!Input {
            kind: "explain".into(),
            query: "😀".repeat(2049)
        }
        .valid());
    }
    fn grant() -> Grant {
        Grant {
            project_id: "p".into(),
            session_id: "s".into(),
            created: Instant::now(),
            calls: HashSet::new(),
            active: None,
        }
    }
    #[test]
    fn rejects_identity_and_extra_input() {
        for input in [
            json!({"kind":"check","query":"","directory":"C:/"}),
            json!({"kind":"guide","query":"","projectId":"evil"}),
        ] {
            assert!(serde_json::from_value::<Input>(input).is_err());
        }
        assert!(!Input {
            kind: "check".into(),
            query: "x".into()
        }
        .valid());
        assert!(!Input {
            kind: "explain".into(),
            query: " ".into()
        }
        .valid());
        assert!(!Input {
            kind: "explain".into(),
            query: "bad\0input".into()
        }
        .valid());
        let mut body = json!({"model":"test","messages":[{"role":"user","content":"hello"}],"agent":{"projectId":"p","sessionId":"s","allowRead":true,"shareResults":false}});
        assert!(permission(Some(&body.to_string())).is_ok());
        body["agent"]["allowRead"] = json!(false);
        assert!(permission(Some(&body.to_string())).is_err());
        body["agent"]["allowRead"] = json!(true);
        body["agent"]["directory"] = json!("C:/");
        assert!(permission(Some(&body.to_string())).is_err());
    }
    #[test]
    fn duplicate_parallel_expired_and_excess_calls_fail() {
        let mut g = grant();
        assert!(claim(&mut g, "a").is_ok());
        assert!(claim(&mut g, "a").is_err());
        g.active = Some("run".into());
        assert!(claim(&mut g, "b").is_err());
        g.active = None;
        assert!(claim(&mut g, "b").is_ok());
        assert!(claim(&mut g, "c").is_err());
        let mut g = grant();
        g.created = Instant::now() - LIMIT;
        assert!(claim(&mut g, "a").is_err());
    }
    #[test]
    fn cancellation_removes_capability_and_preserves_tombstone() {
        let tools = AgentTools::default();
        let runner = ToolRunner::default();
        {
            let mut r = tools.0.lock().unwrap();
            r.used.insert("request".into());
            let mut g = grant();
            runner.reserve("run").unwrap();
            g.active = Some("run".into());
            r.grants.insert("request".into(), g);
        }
        assert!(!tools.cancel_frame(&json!({"type":"project-tool-cancel","id":"c","requestId":"request","projectId":"other"}),&runner));
        assert!(tools.cancel_frame(
            &json!({"type":"project-tool-cancel","id":"c","requestId":"request"}),
            &runner
        ));
        let r = tools.0.lock().unwrap();
        assert!(r.grants.is_empty());
        assert!(r.used.contains("request"));
    }
}
