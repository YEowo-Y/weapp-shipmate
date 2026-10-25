use crate::runtime::{authorize, valid_id};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::ipc::Channel;
use tauri::Manager;

type Channels = Arc<Mutex<HashMap<String, Channel<Value>>>>;
pub struct ModelBridge(Mutex<Option<Runtime>>, AtomicBool);
struct Runtime {
    agent_tools: crate::agent_tools::AgentTools,
    tool_runner: crate::tool_runner::ToolRunner,
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    channels: Channels,
    reader_closed: Arc<AtomicBool>,
}
impl Default for ModelBridge {
    fn default() -> Self {
        Self(Mutex::new(None), AtomicBool::new(false))
    }
}
impl Runtime {
    fn stop(&mut self) {
        self.agent_tools.clear(&self.tool_runner);
        let _ = self.child.kill();
        let _ = self.child.wait();
        fail_pending(&self.channels);
    }
}
fn fail_pending(channels: &Channels) {
    if let Ok(mut pending) = channels.lock() {
        for (_, channel) in pending.drain() {
            let _ =
                channel.send(json!({"type":"error","message":"桌面模型服务已退出，请重试连接。"}));
        }
    }
}
impl ModelBridge {
    pub fn shutdown(&self) {
        self.1.store(true, Ordering::Release);
        if let Ok(mut runtime) = self.0.lock() {
            if let Some(mut child) = runtime.take() {
                child.stop();
            }
        }
    }
}
impl Drop for ModelBridge {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct ModelRequest {
    id: String,
    path: String,
    method: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
}
fn agent_route(path: &str) -> bool {
    [
        "/api/model-connections/openai/agent",
        "/api/model-connections/anthropic/agent",
        "/api/model-connections/google/agent",
    ]
    .contains(&path)
}
fn validate(request: &ModelRequest) -> bool {
    let base = "/api/model-connections";
    let route = request.path.strip_prefix(&format!("{base}/")).unwrap_or("");
    let parts: Vec<_> = route.split('/').collect();
    let allowed = request.method == "GET" && request.path == base && request.body.is_none()
        || request.method == "POST"
            && (parts.len() == 2
                && [
                    "openai",
                    "anthropic",
                    "google",
                    "openrouter",
                    "ollama",
                    "custom",
                ]
                .contains(&parts[0])
                && ["connect", "refresh", "disconnect", "chat", "verify"].contains(&parts[1])
                || agent_route(&request.path)
                || [
                    "tools/explain",
                    "openrouter/oauth/start",
                    "openrouter/oauth/cancel",
                    "openrouter/oauth/complete",
                ]
                .contains(&route));
    valid_id(&request.id)
        && allowed
        && request.body.as_ref().is_none_or(|s| s.len() <= 65536)
        && request.headers.iter().all(|(k, v)| {
            ["content-type", "x-shipmate-csrf", "accept"].contains(&k.to_ascii_lowercase().as_str())
                && v.len() <= 256
                && !v.contains(['\r', '\n'])
        })
}
fn public_event(event: &Value) -> bool {
    let fields: &[&str] = match event.get("type").and_then(Value::as_str) {
        Some("headers") => &["type", "id", "status", "headers"],
        Some("chunk") => &["type", "id", "data"],
        Some("end") => &["type", "id"],
        Some("error") => &["type", "id", "message"],
        _ => return false,
    };
    event
        .get("id")
        .and_then(Value::as_str)
        .is_some_and(valid_id)
        && event
            .as_object()
            .is_some_and(|map| map.keys().all(|key| fields.contains(&key.as_str())))
}
fn write_frame(stdin: &Arc<Mutex<ChildStdin>>, value: &Value) -> Result<(), ()> {
    let mut stdin = stdin.lock().map_err(|_| ())?;
    let frame = value.to_string() + "\n";
    stdin
        .write_all(frame.as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|_| ())
}
fn start(app: &tauri::AppHandle) -> Result<Runtime, String> {
    let tool_runner = app
        .state::<crate::tool_runner::ToolRunner>()
        .inner()
        .clone();
    let agent_tools = crate::agent_tools::AgentTools::new(tool_runner.clone());
    let output_tools = agent_tools.clone();
    let output_runner = tool_runner.clone();
    let output_app = app.clone();
    let credentials = crate::credential_store::CredentialStore::new(&app.config().identifier)
        .map_err(str::to_owned)?;

    let mut command = crate::runtime::node_command(app, "desktop/server/desktop-bridge.mjs", true)?;
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "无法启动内置模型服务，请修复或重新安装应用。".to_string())?;
    let (stdin, stdout) = match (child.stdin.take(), child.stdout.take()) {
        (Some(stdin), Some(stdout)) => (stdin, stdout),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("无法创建模型服务通信通道。".into());
        }
    };
    let stdin = Arc::new(Mutex::new(stdin));
    let output_stdin = stdin.clone();
    let channels: Channels = Arc::new(Mutex::new(HashMap::new()));
    let output_channels = channels.clone();
    let reader_closed = Arc::new(AtomicBool::new(false));
    let output_closed = reader_closed.clone();
    let reader = std::thread::Builder::new()
        .name("shipmate-model-output".into())
        .spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                // Bound each IPC frame, even if the child malfunctions.
                let mut bytes = Vec::new();
                let mut limited = std::io::Read::take(&mut reader, 2_000_001);
                match limited.read_until(b'\n', &mut bytes) {
                    Ok(0) | Err(_) => break,
                    _ => {}
                }
                if bytes.len() > 2_000_000 || bytes.last() != Some(&b'\n') {
                    break;
                }
                let Ok(mut event) = serde_json::from_slice::<Value>(&bytes) else {
                    break;
                };
                if event.get("type").and_then(Value::as_str) == Some("credential") {
                    let response = credentials.respond(event);
                    if write_frame(&output_stdin, &response).is_err() {
                        break;
                    }
                    continue;
                }
                if event.get("type").and_then(Value::as_str) == Some("project-tool") {
                    let tools = output_tools.clone();
                    let app = output_app.clone();
                    let stdin = output_stdin.clone();
                    // Never block the reader: cancellation must still reach the active child.
                    tauri::async_runtime::spawn(async move {
                        let response = tools.execute(app, event).await;
                        let _ = write_frame(&stdin, &response);
                    });
                    continue;
                }
                if event.get("type").and_then(Value::as_str) == Some("project-tool-cancel") {
                    if !output_tools.cancel_frame(&event, &output_runner) {
                        break;
                    }
                    continue;
                }
                if !public_event(&event) {
                    break;
                }
                let Some(id) = event.get("id").and_then(Value::as_str).map(str::to_owned) else {
                    break;
                };
                let terminal = matches!(
                    event.get("type").and_then(Value::as_str),
                    Some("end" | "error")
                );
                if terminal {
                    output_tools.revoke(&id, &output_runner);
                }
                event.as_object_mut().map(|e| e.remove("id"));
                if let Ok(mut pending) = output_channels.lock() {
                    if let Some(channel) = pending.get(&id) {
                        let _ = channel.send(event);
                    }
                    if terminal {
                        pending.remove(&id);
                    }
                }
            }
            output_closed.store(true, Ordering::Release);
            output_tools.clear(&output_runner);
            fail_pending(&output_channels);
        });
    if reader.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("无法启动模型服务输出读取器，请重试。".into());
    }
    Ok(Runtime {
        agent_tools,
        tool_runner,
        child,
        stdin,
        channels,
        reader_closed,
    })
}

#[tauri::command]
pub fn model_request(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<ModelBridge>,
    request: ModelRequest,
    on_event: Channel<Value>,
) -> Result<(), String> {
    authorize(&window)?;
    if !validate(&request) {
        return Err("桌面模型请求格式无效。".into());
    }
    let permission = if agent_route(&request.path) {
        Some(crate::agent_tools::permission(request.body.as_deref())?)
    } else {
        None
    };
    let mut guard = state.0.lock().map_err(|_| "模型服务状态不可用。")?;
    if state.1.load(Ordering::Acquire) {
        return Err("应用正在退出。".into());
    }
    if guard.as_mut().is_some_and(|runtime| {
        runtime.reader_closed.load(Ordering::Acquire)
            || !matches!(runtime.child.try_wait(), Ok(None))
    }) {
        if let Some(mut runtime) = guard.take() {
            runtime.stop();
        }
    }
    if guard.is_none() {
        *guard = Some(start(&app)?);
    }
    let runtime = guard.as_mut().unwrap();
    {
        let mut pending = runtime
            .channels
            .lock()
            .map_err(|_| "模型服务状态不可用。")?;
        if pending.len() >= 16 || pending.contains_key(&request.id) {
            return Err("请求过多或请求编号重复，请稍后重试。".into());
        }
        if let Some(permission) = permission {
            runtime
                .agent_tools
                .register(&app, &request.id, permission)?;
        }
        pending.insert(request.id.clone(), on_event);
    }
    let frame = json!({"type":"request","request":request});
    if write_frame(&runtime.stdin, &frame).is_err() {
        runtime.stop();
        *guard = None;
        return Err("模型服务已退出，请重试。".into());
    }
    Ok(())
}
#[tauri::command]
pub fn model_cancel(
    window: tauri::WebviewWindow,
    state: tauri::State<ModelBridge>,
    id: String,
) -> Result<(), String> {
    authorize(&window)?;
    if !valid_id(&id) {
        return Err("请求编号无效。".into());
    }
    let mut guard = state.0.lock().map_err(|_| "模型服务状态不可用。")?;
    if let Some(runtime) = guard.as_mut() {
        runtime.agent_tools.revoke(&id, &runtime.tool_runner);
        let frame = json!({"type":"cancel","id":id});
        if write_frame(&runtime.stdin, &frame).is_err() {
            runtime.stop();
            *guard = None;
            return Err("模型服务已退出，请重试。".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_frames_never_pass_public_dispatch() {
        assert!(public_event(
            &json!({"type":"chunk","id":"test-1","data":"ok"})
        ));
        for kind in [
            "credential",
            "credential-result",
            "project-tool",
            "project-tool-result",
            "project-tool-cancel",
            "unknown",
        ] {
            assert!(!public_event(
                &json!({"type":kind,"id":"test-1","record":{"key":"fake"}})
            ));
        }
        assert!(!public_event(
            &json!({"type":"chunk","id":"test-1","key":"fake"})
        ));
    }
    #[test]
    fn restricts_routes_and_headers() {
        let mut request = ModelRequest {
            id: "test-1".into(),
            path: "/api/model-connections".into(),
            method: "GET".into(),
            body: None,
            headers: HashMap::new(),
        };
        assert!(validate(&request));
        request.path = "http://evil.test".into();
        assert!(!validate(&request));
        request.path = "/api/model-connections/ollama/chat".into();
        request.method = "POST".into();
        assert!(validate(&request));
        request.path = "/api/model-connections/custom/verify".into();
        assert!(validate(&request));
        request.path = "/api/model-connections/openai/agent".into();
        assert!(validate(&request));
        request.path = "/api/model-connections/anthropic/agent".into();
        assert!(validate(&request));
        request.path = "/api/model-connections/google/agent".into();
        assert!(validate(&request));
        for provider in ["openai", "anthropic", "google"] {
            request.path = format!("/api/model-connections/{provider}/agent");
            assert!(agent_route(&request.path));
            request.method = "GET".into();
            assert!(!validate(&request));
            request.method = "POST".into();
        }
        for route in [
            "/api/model-connections/custom/agent",
            "/api/model-connections/openrouter/agent",
            "/api/model-connections/ollama/agent",
            "/api/model-connections/google/agent/extra",
            "/api/model-connections/anthropic/agent?scope=all",
        ] {
            request.path = route.into();
            assert!(!validate(&request));
            assert!(!agent_route(&request.path));
        }
        request.path = "/api/model-connections/openrouter/oauth/complete".into();
        assert!(validate(&request));
        request.path = "/api/model-connections/tools/explain".into();
        assert!(validate(&request));
        request.method = "GET".into();
        assert!(!validate(&request));
        request.method = "POST".into();
        for route in [
            "/api/model-connections/tools/explain/extra",
            "/api/model-connections/tools/explain?query=x",
            "/api/model-connections/tools/guide",
            "/api/model-connections/openai/oauth/complete",
            "/api/model-connections/openrouter/oauth/complete/extra",
            "/api/model-connections/openrouter/oauth/complete?code=secret",
        ] {
            request.path = route.into();
            assert!(!validate(&request));
        }
        request.path = "/api/model-connections/openrouter/oauth/complete".into();
        request.headers.insert("Host".into(), "evil.test".into());
        assert!(!validate(&request));
        request.headers.clear();
        request.body = Some("x".repeat(65537));
        assert!(!validate(&request));
    }
}
