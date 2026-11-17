//! Private native credentials. No command exposes this module to the WebView.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const UNAVAILABLE: &str = "系统凭据存储不可用，请重试或明确选择仅本次连接。";
const INVALID: &str = "系统凭据请求格式无效。";
#[cfg(any(windows, test))]
const TOO_LARGE: &str = "凭据超过系统存储限制，请明确选择仅本次连接。";

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Endpoint {
    base_url: String,
    allow_local_http: bool,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Record {
    key: String,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    endpoint: Option<Endpoint>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Request {
    #[serde(rename = "type")]
    kind: String,
    id: String,
    operation: String,
    provider_id: String,
    record: Option<Record>,
}
fn provider(id: &str) -> bool {
    [
        "openai",
        "anthropic",
        "google",
        "deepseek",
        "glm",
        "kimi",
        "openrouter",
        "ollama",
        "custom",
    ]
    .contains(&id)
}
#[cfg(any(windows, test))]
fn valid_record(id: &str, record: &Record) -> bool {
    let method = match id {
        "ollama" => record.method == "local" && record.key.is_empty(),
        "openrouter" => ["api-key", "oauth"].contains(&record.method.as_str()),
        _ => record.method == "api-key",
    };
    if !provider(id)
        || !method
        || record.key.len() > 4096
        || (id != "ollama" && record.key.is_empty())
        || !record.key.bytes().all(|b| (0x21..=0x7e).contains(&b))
    {
        return false;
    }
    match (&record.endpoint, id) {
        (Some(endpoint), "custom") => {
            let Ok(url) = tauri::Url::parse(&endpoint.base_url) else {
                return false;
            };
            endpoint.base_url.len() <= 2048
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && url.query().is_none()
                && url.fragment().is_none()
                && (url.scheme() == "https"
                    || (url.scheme() == "http"
                        && endpoint.allow_local_http
                        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
        }
        (None, "custom") | (Some(_), _) => false,
        (None, _) => true,
    }
}

pub struct CredentialStore {
    #[cfg_attr(not(windows), allow(dead_code))]
    namespace: String,
}
impl CredentialStore {
    pub fn new(identifier: &str) -> Result<Self, &'static str> {
        if identifier.is_empty()
            || identifier.len() > 200
            || !identifier
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".-_".contains(&b))
        {
            return Err(INVALID);
        }
        Ok(Self {
            namespace: format!("{identifier}/model-connections/v1"),
        })
    }

    #[cfg(windows)]
    fn entry(&self, id: &str) -> Result<keyring_core::Entry, &'static str> {
        use keyring_core::api::CredentialStoreApi;
        if !provider(id) {
            return Err(INVALID);
        }
        let target = format!("{}/{id}", self.namespace);
        let modifiers = std::collections::HashMap::from([
            ("target", target.as_str()),
            ("persistence", "Local"),
        ]);
        windows_native_keyring_store::Store::new()
            .map_err(|_| UNAVAILABLE)?
            .build(&self.namespace, id, Some(&modifiers))
            .map_err(|_| UNAVAILABLE)
    }

    #[cfg(windows)]
    fn execute(&self, request: Request) -> Result<Option<Record>, &'static str> {
        let entry = self.entry(&request.provider_id)?;
        match request.operation.as_str() {
            "load" => match entry.get_secret() {
                Ok(bytes) => {
                    if bytes.len() > 2560 {
                        return Err(INVALID);
                    }
                    let record: Record = serde_json::from_slice(&bytes).map_err(|_| INVALID)?;
                    if !valid_record(&request.provider_id, &record) {
                        return Err(INVALID);
                    }
                    Ok(Some(record))
                }
                Err(keyring_core::Error::NoEntry) => Ok(None),
                Err(_) => Err(UNAVAILABLE),
            },
            "save" => {
                let record = request.record.ok_or(INVALID)?;
                if !valid_record(&request.provider_id, &record) {
                    return Err(INVALID);
                }
                // Raw JSON bytes avoid the password API's UTF-16 expansion.
                let bytes = serde_json::to_vec(&record).map_err(|_| INVALID)?;
                if bytes.len() > 2560 {
                    return Err(TOO_LARGE);
                }
                entry.set_secret(&bytes).map_err(|_| UNAVAILABLE)?;
                Ok(None)
            }
            "delete" => match entry.delete_credential() {
                Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(None),
                Err(_) => Err(UNAVAILABLE),
            },
            _ => Err(INVALID),
        }
    }
    #[cfg(not(windows))]
    fn execute(&self, _: Request) -> Result<Option<Record>, &'static str> {
        Err(UNAVAILABLE)
    }

    pub fn respond(&self, value: Value) -> Value {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| crate::runtime::valid_id(id))
            .unwrap_or("")
            .to_owned();
        let result = serde_json::from_value::<Request>(value)
            .map_err(|_| INVALID)
            .and_then(|request| {
                if request.kind != "credential"
                    || !crate::runtime::valid_id(&request.id)
                    || !provider(&request.provider_id)
                    || !["load", "save", "delete"].contains(&request.operation.as_str())
                    || (request.operation == "save") != request.record.is_some()
                {
                    return Err(INVALID);
                }
                self.execute(request)
            });
        match result {
            Ok(record) => json!({"type":"credential-result","id":id,"ok":true,"record":record}),
            Err(error) => json!({"type":"credential-result","id":id,"ok":false,"error":error}),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn record() -> Record {
        Record {
            key: "fake-p4-test-key".into(),
            method: "api-key".into(),
            endpoint: None,
        }
    }
    #[test]
    fn binds_custom_credentials_to_explicit_safe_endpoint() {
        let mut value = record();
        value.endpoint = Some(Endpoint {
            base_url: "https://models.example/v1".into(),
            allow_local_http: false,
        });
        assert!(valid_record("custom", &value));
        assert!(!valid_record("openai", &value));
        for base in [
            "http://models.example/v1",
            "https://user:password@models.example/v1",
            "https://models.example/v1?key=fake",
            "https://models.example/#fragment",
        ] {
            value.endpoint.as_mut().unwrap().base_url = base.into();
            assert!(!valid_record("custom", &value));
        }
        value.endpoint = Some(Endpoint {
            base_url: "http://127.0.0.1:11434/v1".into(),
            allow_local_http: false,
        });
        assert!(!valid_record("custom", &value));
        value.endpoint.as_mut().unwrap().allow_local_http = true;
        assert!(valid_record("custom", &value));
        value.method = "oauth".into();
        assert!(!valid_record("custom", &value));
    }
    #[test]
    fn rejects_untrusted_names_records_and_frames() {
        assert!(CredentialStore::new("bad/namespace").is_err());
        assert!(valid_record("openai", &record()));
        for id in ["deepseek", "glm", "kimi"] {
            assert!(valid_record(id, &record()));
            let mut oauth = record();
            oauth.method = "oauth".into();
            assert!(!valid_record(id, &oauth));
        }
        assert!(!valid_record("custom", &record()));
        let mut bad = record();
        bad.key = "fake\nkey".into();
        assert!(!valid_record("openai", &bad));
        let store = CredentialStore::new("com.weappshipmate.test.validation").unwrap();
        for frame in [
            json!({"type":"credential","id":"test-1","operation":"load","providerId":"evil"}),
            json!({"type":"credential","id":"test-1","operation":"load","providerId":"openai","record":record()}),
            json!({"type":"credential","id":"test-1","operation":"save","providerId":"openai"}),
            json!({"type":"credential","id":"test-1","operation":"delete","providerId":"openai","target":"other-app"}),
        ] {
            let response = store.respond(frame);
            assert_eq!(response["ok"], false);
            assert!(response.get("record").is_none());
        }
    }

    #[test]
    #[ignore = "Spawns isolated fake-credential processes; run explicitly on Windows"]
    #[cfg(windows)]
    fn windows_vault_multiple_processes() {
        let executable = std::env::current_exe().unwrap();
        let mut children: Vec<_> = (0..3)
            .map(|_| {
                std::process::Command::new(&executable)
                    .args([
                        "--ignored",
                        "--exact",
                        "credential_store::tests::windows_vault_roundtrip_and_concurrency",
                    ])
                    .stdout(std::process::Stdio::null())
                    .spawn()
                    .unwrap()
            })
            .collect();
        for child in &mut children {
            assert!(child.wait().unwrap().success());
        }
    }

    #[test]
    #[ignore = "Writes only fake credentials to unique Windows test targets; run explicitly"]
    #[cfg(windows)]
    fn windows_vault_roundtrip_and_concurrency() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let namespace = format!(
            "com.weappshipmate.acceptance.vault.{}.{stamp}",
            std::process::id()
        );
        let workers: Vec<_> = (0..8)
            .map(|index| {
                let namespace = format!("{namespace}.{index}");
                std::thread::spawn(move || {
                    let store = CredentialStore::new(&namespace).unwrap();
                    let request = |operation: &str, record: Option<Record>| Request {
                        kind: "credential".into(),
                        id: "test-1".into(),
                        operation: operation.into(),
                        provider_id: "openai".into(),
                        record,
                    };
                    assert!(store.execute(request("load", None)).unwrap().is_none());
                    for _ in 0..10 {
                        store.execute(request("save", Some(record()))).unwrap();
                        let restarted = CredentialStore::new(&namespace).unwrap();
                        assert_eq!(
                            restarted
                                .execute(request("load", None))
                                .unwrap()
                                .unwrap()
                                .key,
                            "fake-p4-test-key"
                        );
                    }
                    let mut oversized = record();
                    oversized.key = "x".repeat(3000);
                    assert!(matches!(
                        store.execute(request("save", Some(oversized))),
                        Err(TOO_LARGE)
                    ));
                    assert_eq!(
                        store.execute(request("load", None)).unwrap().unwrap().key,
                        "fake-p4-test-key"
                    );
                    let mut changed = record();
                    changed.key = "fake-replacement-key".into();
                    store.execute(request("save", Some(changed))).unwrap();
                    assert_eq!(
                        store.execute(request("load", None)).unwrap().unwrap().key,
                        "fake-replacement-key"
                    );
                    assert_eq!(
                        store
                            .entry("openai")
                            .unwrap()
                            .get_attributes()
                            .unwrap()
                            .get("persistence")
                            .map(String::as_str),
                        Some("Local")
                    );
                    store.execute(request("delete", None)).unwrap();
                    assert!(store.execute(request("load", None)).unwrap().is_none());
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
    }
}
