//! Explicit checks of bundled official sources, independent of projects and policy approval.
use crate::{
    project_store::{db_error, encode, now, ProjectStore},
    tool_runner::ToolRunner,
};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Deserializer, Serialize};
use std::{collections::HashSet, io::Read, path::Path};
use tauri::Manager;

#[path = "source_quote.rs"]
pub mod quote;

const CATALOG_LIMIT: usize = 256 * 1024;
const RECORD_LIMIT: usize = 4096;
const CLOCK_TOLERANCE: u64 = 5000;
const INVALID_CATALOG: &str = "内置来源目录无效，请修复或重新安装应用。";
const INVALID_RESULT: &str = "来源检查结果不完整或与当前目录不符，未保存本次结果。";
const INVALID_RECORD: &str = "来源检查记录损坏，请保留数据库并检查备份；原记录未被覆盖。";

// Nullable fields are still required by the wire contract.
fn nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceCatalog {
    schema_version: u32,
    catalog_version: String,
    stale_days: u32,
    sources: Vec<Source>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source {
    id: String,
    url: String,
    title: String,
    references: Vec<Reference>,
    #[serde(deserialize_with = "nullable")]
    baseline: Option<Baseline>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reference {
    id: String,
    title: String,
    #[serde(deserialize_with = "nullable")]
    last_verified: Option<String>,
    draft: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Baseline {
    hash: String,
    fetched_at: String,
    method: Method,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Method {
    Fetch,
    Manual,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum CheckState {
    Unchanged,
    Changed,
    Reachable,
    Unavailable,
    Unknown,
    Manual,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Reason {
    Same,
    Different,
    NoBaseline,
    NotFound,
    Network,
    Timeout,
    Redirect,
    Access,
    Body,
    Manual,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CheckResult {
    schema_version: u32,
    catalog_version: String,
    source_id: String,
    checked_at: u64,
    state: CheckState,
    reason: Reason,
    #[serde(deserialize_with = "nullable")]
    http_status: Option<u16>,
    #[serde(deserialize_with = "nullable")]
    content_hash: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckRecord {
    source_id: String,
    latest: CheckResult,
    #[serde(deserialize_with = "nullable")]
    last_evidence: Option<CheckResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreshnessSnapshot {
    catalog: SourceCatalog,
    checks: Vec<CheckRecord>,
}

fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

fn source_id(value: &str) -> bool {
    value.strip_prefix("source-").is_some_and(|s| hex(s, 16))
}

fn text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn official_url(value: &str) -> bool {
    if value.len() > 2048 || value.chars().any(|c| c.is_whitespace() || c == '\\') {
        return false;
    }
    let authority = value
        .strip_prefix("https://")
        .and_then(|rest| rest.split(['/', '?', '#']).next());
    if !matches!(
        authority,
        Some("developers.weixin.qq.com" | "pay.weixin.qq.com")
    ) {
        return false;
    }
    tauri::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && url.host_str() == authority
    })
}

fn validate_catalog(catalog: &SourceCatalog) -> crate::error::DesktopResult<()> {
    if catalog.schema_version != 1
        || catalog.stale_days != 180
        || !hex(&catalog.catalog_version, 64)
        || catalog.sources.len() > 128
    {
        return Err(INVALID_CATALOG.into());
    }
    let mut ids = HashSet::new();
    let mut urls = HashSet::new();
    for source in &catalog.sources {
        if !source_id(&source.id)
            || !ids.insert(&source.id)
            || !official_url(&source.url)
            || !urls.insert(&source.url)
            || !text(&source.title, 1000)
            || source.references.len() > 1024
            || source
                .baseline
                .as_ref()
                .is_some_and(|baseline| !hex(&baseline.hash, 64) || !text(&baseline.fetched_at, 64))
        {
            return Err(INVALID_CATALOG.into());
        }
        let mut refs = HashSet::new();
        for reference in &source.references {
            if !text(&reference.id, 256)
                || !refs.insert(&reference.id)
                || !text(&reference.title, 1000)
                || reference
                    .last_verified
                    .as_ref()
                    .is_some_and(|date| !text(date, 64))
            {
                return Err(INVALID_CATALOG.into());
            }
        }
    }
    Ok(())
}

fn parse_catalog(bytes: &[u8]) -> crate::error::DesktopResult<SourceCatalog> {
    if bytes.len() > CATALOG_LIMIT {
        return Err(INVALID_CATALOG.into());
    }
    let catalog = serde_json::from_slice(bytes).map_err(|_| INVALID_CATALOG)?;
    validate_catalog(&catalog)?;
    Ok(catalog)
}

fn catalog_at(root: &Path) -> crate::error::DesktopResult<SourceCatalog> {
    let root = root.join("runtime").canonicalize().map_err(|_| {
        crate::error::DesktopError::runtime_unavailable(
            "source_freshness",
            "missing_runtime_dir",
            INVALID_CATALOG,
        )
    })?;
    let path = root
        .join("source-catalog.json")
        .canonicalize()
        .map_err(|_| {
            crate::error::DesktopError::runtime_unavailable(
                "source_freshness",
                "missing_source_catalog",
                INVALID_CATALOG,
            )
        })?;
    if !path.starts_with(root) || !path.is_file() {
        return Err(crate::error::DesktopError::runtime_unavailable(
            "source_freshness",
            "invalid_source_catalog_path",
            INVALID_CATALOG,
        ));
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|_| crate::error::DesktopError::io(INVALID_CATALOG))?
        .take((CATALOG_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| crate::error::DesktopError::io(INVALID_CATALOG))?;
    parse_catalog(&bytes)
}

fn load_catalog(app: &tauri::AppHandle) -> crate::error::DesktopResult<SourceCatalog> {
    catalog_at(&app.path().resource_dir().map_err(|_| {
        crate::error::DesktopError::runtime_unavailable(
            "source_freshness",
            "missing_resource_dir",
            INVALID_CATALOG,
        )
    })?)
}

fn lookup<'a>(catalog: &'a SourceCatalog, id: &str) -> crate::error::DesktopResult<&'a Source> {
    catalog
        .sources
        .iter()
        .find(|source| source.id == id)
        .ok_or_else(|| "来源不在当前内置目录中，请刷新后重试。".into())
}

fn evidence(result: &CheckResult) -> bool {
    matches!(
        result.state,
        CheckState::Unchanged | CheckState::Changed | CheckState::Reachable
    )
}

fn validate_result(
    result: &CheckResult,
    catalog: &SourceCatalog,
    source: &Source,
    clock: u64,
) -> crate::error::DesktopResult<()> {
    if result.schema_version != 1
        || result.catalog_version != catalog.catalog_version
        || result.source_id != source.id
        || result.checked_at == 0
        || result.checked_at > clock.saturating_add(CLOCK_TOLERANCE)
        || result.checked_at > 9_007_199_254_740_991
        || result
            .http_status
            .is_some_and(|status| !(100..=599).contains(&status))
        || result
            .content_hash
            .as_ref()
            .is_some_and(|hash| !hex(hash, 64))
    {
        return Err(INVALID_RESULT.into());
    }
    let successful_http = result.http_status.is_some_and(|s| (200..=299).contains(&s));
    let manual = source
        .baseline
        .as_ref()
        .is_some_and(|b| b.method == Method::Manual);
    let valid = if manual {
        result.state == CheckState::Manual
            && result.reason == Reason::Manual
            && result.http_status.is_none()
            && result.content_hash.is_none()
    } else if evidence(result) {
        successful_http
            && result.content_hash.as_ref().is_some_and(|hash| {
                match (&source.baseline, result.state, result.reason) {
                    (Some(b), CheckState::Unchanged, Reason::Same) => &b.hash == hash,
                    (Some(b), CheckState::Changed, Reason::Different) => &b.hash != hash,
                    (None, CheckState::Reachable, Reason::NoBaseline) => true,
                    _ => false,
                }
            })
    } else {
        result.content_hash.is_none()
            && match (result.state, result.reason) {
                (CheckState::Unavailable, Reason::NotFound) => {
                    matches!(result.http_status, Some(404 | 410))
                }
                (CheckState::Unknown, Reason::Network) => {
                    result.http_status.is_none() || successful_http
                }
                (CheckState::Unknown, Reason::Timeout) => result.http_status.is_none(),
                (CheckState::Unknown, Reason::Redirect) => {
                    result.http_status.is_some_and(|s| (300..=399).contains(&s))
                }
                (CheckState::Unknown, Reason::Access) => result
                    .http_status
                    .is_none_or(|s| !(300..=399).contains(&s) && !matches!(s, 404 | 410)),
                (CheckState::Unknown, Reason::Body) => successful_http,
                _ => false,
            }
    };
    if valid {
        Ok(())
    } else {
        Err(INVALID_RESULT.into())
    }
}

fn parse_result(
    output: &str,
    catalog: &SourceCatalog,
    source: &Source,
    started_at: u64,
    clock: u64,
) -> crate::error::DesktopResult<CheckResult> {
    if output.len() > RECORD_LIMIT {
        return Err(INVALID_RESULT.into());
    }
    let result: CheckResult = serde_json::from_str(output).map_err(|_| INVALID_RESULT)?;
    validate_result(&result, catalog, source, clock)?;
    if result.checked_at < started_at.saturating_sub(CLOCK_TOLERANCE) {
        return Err(INVALID_RESULT.into());
    }
    Ok(result)
}

fn key(catalog: &SourceCatalog, source: &Source) -> String {
    format!("source_freshness:{}:{}", catalog.catalog_version, source.id)
}

fn validate_record(
    record: &CheckRecord,
    catalog: &SourceCatalog,
    source: &Source,
    clock: u64,
) -> crate::error::DesktopResult<()> {
    if record.source_id != source.id {
        return Err(crate::error::DesktopError::database(INVALID_RECORD));
    }
    validate_result(&record.latest, catalog, source, clock)
        .map_err(|_| crate::error::DesktopError::database(INVALID_RECORD))?;
    if let Some(previous) = &record.last_evidence {
        validate_result(previous, catalog, source, clock)
            .map_err(|_| crate::error::DesktopError::database(INVALID_RECORD))?;
        if !evidence(previous) || previous.checked_at > record.latest.checked_at {
            return Err(crate::error::DesktopError::database(INVALID_RECORD));
        }
    }
    if evidence(&record.latest) && record.last_evidence.as_ref() != Some(&record.latest) {
        return Err(crate::error::DesktopError::database(INVALID_RECORD));
    }
    Ok(())
}

fn read_record(
    connection: &Connection,
    catalog: &SourceCatalog,
    source: &Source,
    clock: u64,
) -> crate::error::DesktopResult<Option<CheckRecord>> {
    let value: Option<Option<String>> = connection
        .query_row(
            "SELECT CASE WHEN length(CAST(value AS BLOB)) <= 4096 THEN value ELSE NULL END FROM settings WHERE key=?",
            [key(catalog, source)],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    match value {
        None => Ok(None),
        Some(None) => Err(crate::error::DesktopError::database(INVALID_RECORD)),
        Some(Some(value)) => {
            let record = serde_json::from_str(&value)
                .map_err(|_| crate::error::DesktopError::database(INVALID_RECORD))?;
            validate_record(&record, catalog, source, clock)?;
            Ok(Some(record))
        }
    }
}

fn save_result(
    connection: &mut Connection,
    catalog: &SourceCatalog,
    source: &Source,
    result: CheckResult,
    clock: u64,
) -> crate::error::DesktopResult<CheckRecord> {
    validate_result(&result, catalog, source, clock)?;
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    // Validate the current record before any update; corruption is never silently repaired.
    let previous = read_record(&tx, catalog, source, clock)?;
    if previous
        .as_ref()
        .is_some_and(|old| old.latest.checked_at > result.checked_at)
    {
        return Err(crate::error::DesktopError::conflict(
            "已有更新的来源检查，请刷新后重试。",
        ));
    }
    let record = CheckRecord {
        source_id: source.id.clone(),
        last_evidence: if evidence(&result) {
            Some(result.clone())
        } else {
            previous.and_then(|record| record.last_evidence)
        },
        latest: result,
    };
    tx.execute(
        "INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key(catalog, source), encode(&record)?],
    ).map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(record)
}

fn snapshot(
    connection: &Connection,
    catalog: SourceCatalog,
    clock: u64,
) -> crate::error::DesktopResult<FreshnessSnapshot> {
    let checks = catalog
        .sources
        .iter()
        .map(|source| read_record(connection, &catalog, source, clock))
        .collect::<crate::error::DesktopResult<Vec<_>>>()?
        .into_iter()
        .flatten()
        .collect();
    Ok(FreshnessSnapshot { catalog, checks })
}

#[tauri::command]
pub async fn source_freshness_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
) -> crate::error::DesktopResult<FreshnessSnapshot> {
    crate::runtime::authorize(&window)?;
    let store = state.inner().clone();
    crate::error::run_blocking(
        "source_freshness",
        "读取来源新鲜度意外退出，请重试。",
        move || {
            let catalog = load_catalog(&app)?;
            store.access(&app, |connection| snapshot(connection, catalog, now()))
        },
    )
    .await
}

#[tauri::command]
pub async fn source_freshness_check(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    runner: tauri::State<'_, ToolRunner>,
    source_id: String,
    run_id: String,
) -> crate::error::DesktopResult<CheckRecord> {
    crate::runtime::authorize(&window)?;
    // Establish cancellation identity before catalog reads or SQLite preparation.
    let reservation = runner.reserve_guard(&run_id)?;
    let store = state.inner().clone();
    crate::error::run_blocking(
        "source_freshness",
        "来源检查任务意外退出，请重试。",
        move || {
            let catalog = load_catalog(&app)?;
            let source = lookup(&catalog, &source_id)?.clone();
            let mut command =
                crate::runtime::node_command(&app, "desktop/server/source-check.mjs", false)?;
            command.arg(source_id);
            // Reject corrupt current records before contacting a source, without holding the DB lock during I/O.
            store.access(&app, |connection| {
                read_record(connection, &catalog, &source, now())
            })?;
            let started_at = now();
            let output = reservation
                .run_retained(command)
                .map_err(crate::error::DesktopError::from)?;
            let result = parse_result(&output, &catalog, &source, started_at, now())?;
            reservation
                .commit(|| {
                    // A runtime replacement cannot label output against a different installed catalog.
                    if load_catalog(&app)?.catalog_version != catalog.catalog_version {
                        return Err(crate::error::DesktopError::conflict(
                            "内置来源目录已更新，请刷新后重新检查。",
                        ));
                    }
                    store.access(&app, |connection| {
                        save_result(connection, &catalog, &source, result, now())
                    })
                })
                .map_err(crate::error::DesktopError::from)
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const CLOCK: u64 = 100_000;

    fn catalog() -> SourceCatalog {
        parse_catalog(&serde_json::to_vec(&json!({
            "schemaVersion":1,"catalogVersion":"a".repeat(64),"staleDays":180,
            "sources":[{"id":"source-0123456789abcdef","url":"https://developers.weixin.qq.com/miniprogram/dev/",
                "title":"Official source","references":[{"id":"rule-1","title":"Rule","lastVerified":"2026-10-23","draft":false}],
                "baseline":{"hash":"b".repeat(64),"fetchedAt":"2026-10-23T00:00:00.000Z","method":"fetch"}}]
        })).unwrap()).unwrap()
    }

    fn connection() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            .unwrap();
        connection
    }

    fn result(catalog: &SourceCatalog) -> CheckResult {
        CheckResult {
            schema_version: 1,
            catalog_version: catalog.catalog_version.clone(),
            source_id: catalog.sources[0].id.clone(),
            checked_at: CLOCK,
            state: CheckState::Unchanged,
            reason: Reason::Same,
            http_status: Some(200),
            content_hash: Some("b".repeat(64)),
        }
    }

    #[test]
    fn catalog_requires_bounded_trusted_official_sources_and_explicit_fields() {
        let original = serde_json::to_value(catalog()).unwrap();
        for url in [
            "http://developers.weixin.qq.com/",
            "https://developers.weixin.qq.com:443/",
            "https://developers.weixin.qq.com:8443/",
            "https://user@developers.weixin.qq.com/",
            "https://developers.weixin.qq.com@evil.test/",
            "https://developers.weixin.qq.com.evil.test/",
            "https://127.0.0.1/",
            "https://developers.weixin.qq.com\\@evil.test/",
            "https://developers.weixin.qq.com/\n",
        ] {
            let mut value = original.clone();
            value["sources"][0]["url"] = json!(url);
            assert!(
                parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err(),
                "{url}"
            );
        }
        for field in ["baseline", "title", "references", "id"] {
            let mut value = original.clone();
            value["sources"][0].as_object_mut().unwrap().remove(field);
            assert!(
                parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err(),
                "{field}"
            );
        }
        let mut value = original.clone();
        value["sources"][0]["references"][0]
            .as_object_mut()
            .unwrap()
            .remove("lastVerified");
        assert!(parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err());
        let mut value = original.clone();
        value["sources"][0]["arbitraryScript"] = json!("unsafe");
        assert!(parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err());
        let mut value = original.clone();
        value["sources"] = json!(vec![original["sources"][0].clone(); 129]);
        assert!(parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err());
        let mut value = original;
        value["sources"][0]["title"] = json!("x".repeat(CATALOG_LIMIT));
        assert!(parse_catalog(&serde_json::to_vec(&value).unwrap()).is_err());
        assert!(lookup(&catalog(), "source-ffffffffffffffff").is_err());
    }

    #[test]
    fn result_semantics_distinguish_body_evidence_network_failure_and_manual_sources() {
        let mut catalog = catalog();
        let mut value = result(&catalog);
        assert!(validate_result(&value, &catalog, &catalog.sources[0], CLOCK).is_ok());
        value.content_hash = Some("c".repeat(64));
        assert!(validate_result(&value, &catalog, &catalog.sources[0], CLOCK).is_err());
        value.state = CheckState::Changed;
        value.reason = Reason::Different;
        assert!(validate_result(&value, &catalog, &catalog.sources[0], CLOCK).is_ok());
        value.state = CheckState::Reachable;
        value.reason = Reason::NoBaseline;
        assert!(validate_result(&value, &catalog, &catalog.sources[0], CLOCK).is_err());
        catalog.sources[0].baseline = None;
        assert!(validate_result(&value, &catalog, &catalog.sources[0], CLOCK).is_ok());
        for (state, reason, status, valid) in [
            (CheckState::Unavailable, Reason::NotFound, Some(404), true),
            (CheckState::Unavailable, Reason::NotFound, Some(410), true),
            (CheckState::Unavailable, Reason::NotFound, Some(500), false),
            (CheckState::Unknown, Reason::Network, None, true),
            (CheckState::Unknown, Reason::Network, Some(200), true),
            (CheckState::Unknown, Reason::Network, Some(403), false),
            (CheckState::Unknown, Reason::Timeout, None, true),
            (CheckState::Unknown, Reason::Timeout, Some(200), false),
            (CheckState::Unknown, Reason::Access, None, true),
            (CheckState::Unknown, Reason::Access, Some(200), true),
            (CheckState::Unknown, Reason::Access, Some(403), true),
            (CheckState::Unknown, Reason::Access, Some(429), true),
            (CheckState::Unknown, Reason::Access, Some(503), true),
            (CheckState::Unknown, Reason::Access, Some(404), false),
            (CheckState::Unknown, Reason::Redirect, Some(302), true),
            (CheckState::Unknown, Reason::Redirect, Some(200), false),
            (CheckState::Unknown, Reason::Body, Some(200), true),
            (CheckState::Unknown, Reason::Body, None, false),
            (CheckState::Manual, Reason::Manual, None, false),
        ] {
            value.state = state;
            value.reason = reason;
            value.http_status = status;
            value.content_hash = None;
            assert_eq!(
                validate_result(&value, &catalog, &catalog.sources[0], CLOCK).is_ok(),
                valid,
                "{state:?}/{reason:?}/{status:?}"
            );
        }
        catalog.sources[0].baseline = Some(Baseline {
            hash: "b".repeat(64),
            fetched_at: "2026-10-23".into(),
            method: Method::Manual,
        });
        value.state = CheckState::Manual;
        value.reason = Reason::Manual;
        assert!(validate_result(&value, &catalog, &catalog.sources[0], CLOCK).is_ok());
        assert!(validate_result(&result(&catalog), &catalog, &catalog.sources[0], CLOCK).is_err());
    }

    #[test]
    fn output_rejects_extra_body_missing_nullable_fields_stale_version_and_times() {
        let catalog = catalog();
        let original = serde_json::to_value(result(&catalog)).unwrap();
        for (field, bad) in [
            ("schemaVersion", json!(2)),
            ("catalogVersion", json!("d".repeat(64))),
            ("sourceId", json!("source-ffffffffffffffff")),
            ("checkedAt", json!(0)),
            ("checkedAt", json!(CLOCK + CLOCK_TOLERANCE + 1)),
            ("checkedAt", json!(CLOCK - CLOCK_TOLERANCE - 1)),
            ("checkedAt", json!(-1)),
            ("checkedAt", json!(1.5)),
            ("httpStatus", json!(200.5)),
            ("httpStatus", json!(600)),
            ("contentHash", json!("ABC")),
            ("body", json!("private page")),
            ("state", json!("approved")),
            ("reason", json!("policy_valid")),
        ] {
            let mut value = original.clone();
            value[field] = bad;
            assert!(
                parse_result(
                    &value.to_string(),
                    &catalog,
                    &catalog.sources[0],
                    CLOCK,
                    CLOCK
                )
                .is_err(),
                "{field}: {value}"
            );
        }
        for field in ["httpStatus", "contentHash"] {
            let mut value = original.clone();
            value.as_object_mut().unwrap().remove(field);
            assert!(parse_result(
                &value.to_string(),
                &catalog,
                &catalog.sources[0],
                CLOCK,
                CLOCK
            )
            .is_err());
        }
        for bad in [
            "not JSON".into(),
            format!("{}{}", original, original),
            "x".repeat(RECORD_LIMIT + 1),
        ] {
            assert!(parse_result(&bad, &catalog, &catalog.sources[0], CLOCK, CLOCK).is_err());
        }
    }

    #[test]
    fn persistence_reopens_preserves_evidence_and_versions_are_isolated() {
        let path = std::env::temp_dir().join(format!(
            "shipmate-source-{}-{}.sqlite3",
            std::process::id(),
            now()
        ));
        let catalog = catalog();
        let source = &catalog.sources[0];
        let success = result(&catalog);
        {
            let mut connection = Connection::open(&path).unwrap();
            connection
                .execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
                .unwrap();
            let empty = snapshot(&connection, catalog.clone(), CLOCK).unwrap();
            assert!(empty.checks.is_empty());
            save_result(&mut connection, &catalog, source, success.clone(), CLOCK).unwrap();
        }
        {
            let mut connection = Connection::open(&path).unwrap();
            let restored = read_record(&connection, &catalog, source, CLOCK)
                .unwrap()
                .unwrap();
            assert_eq!(restored.last_evidence, Some(success.clone()));
            let mut failure = success.clone();
            failure.checked_at += 1;
            failure.state = CheckState::Unknown;
            failure.reason = Reason::Timeout;
            failure.http_status = None;
            failure.content_hash = None;
            let record = save_result(
                &mut connection,
                &catalog,
                source,
                failure.clone(),
                CLOCK + 1,
            )
            .unwrap();
            assert_eq!(record.latest, failure);
            assert_eq!(record.last_evidence, Some(success.clone()));
            assert!(save_result(&mut connection, &catalog, source, success, CLOCK + 1).is_err());
            let mut new_catalog = catalog.clone();
            new_catalog.catalog_version = "d".repeat(64);
            assert!(snapshot(&connection, new_catalog.clone(), CLOCK + 1)
                .unwrap()
                .checks
                .is_empty());
            let mut next = result(&new_catalog);
            next.content_hash = Some("c".repeat(64));
            next.state = CheckState::Changed;
            next.reason = Reason::Different;
            save_result(
                &mut connection,
                &new_catalog,
                &new_catalog.sources[0],
                next.clone(),
                CLOCK + 1,
            )
            .unwrap();
            assert_eq!(
                read_record(&connection, &catalog, source, CLOCK + 1)
                    .unwrap()
                    .unwrap()
                    .latest,
                failure
            );
            assert_eq!(
                snapshot(&connection, new_catalog, CLOCK + 1)
                    .unwrap()
                    .checks[0]
                    .last_evidence,
                Some(next)
            );
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn corrupt_current_records_never_get_overwritten_and_foreign_versions_are_ignored() {
        let catalog = catalog();
        let source = &catalog.sources[0];
        let mut connection = connection();
        let result = result(&catalog);
        let good = save_result(&mut connection, &catalog, source, result.clone(), CLOCK).unwrap();
        let mut invalid_evidence = serde_json::to_value(&good).unwrap();
        invalid_evidence["lastEvidence"]["sourceId"] = json!("source-ffffffffffffffff");
        for bad in [
            "{".to_string(),
            "x".repeat(RECORD_LIMIT + 1),
            invalid_evidence.to_string(),
            json!({"sourceId":source.id,"latest":result,"lastEvidence":null}).to_string(),
        ] {
            connection
                .execute(
                    "UPDATE settings SET value=? WHERE key=?",
                    params![bad, key(&catalog, source)],
                )
                .unwrap();
            assert!(snapshot(&connection, catalog.clone(), CLOCK).is_err());
            assert!(save_result(&mut connection, &catalog, source, result.clone(), CLOCK).is_err());
            let stored: String = connection
                .query_row(
                    "SELECT value FROM settings WHERE key=?",
                    [key(&catalog, source)],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(stored, bad);
            let mut changed = catalog.clone();
            changed.catalog_version = "e".repeat(64);
            assert!(snapshot(&connection, changed, CLOCK)
                .unwrap()
                .checks
                .is_empty());
        }
    }

    #[test]
    fn canceled_or_shutdown_reservation_cannot_write_even_after_valid_output() {
        let catalog = catalog();
        let mut connection = connection();
        for shutdown in [false, true] {
            let runner = ToolRunner::default();
            let guard = runner.reserve_guard("source-check").unwrap();
            if shutdown {
                runner.shutdown();
            } else {
                runner.cancel("source-check").unwrap();
            }
            assert!(matches!(
                guard.commit(|| save_result(
                    &mut connection,
                    &catalog,
                    &catalog.sources[0],
                    result(&catalog),
                    CLOCK
                )),
                Err(crate::tool_runner::ToolFailure::Canceled)
            ));
            assert!(snapshot(&connection, catalog.clone(), CLOCK)
                .unwrap()
                .checks
                .is_empty());
        }
    }

    #[test]
    fn cancellation_during_catalog_preparation_prevents_source_process_start() {
        let runner = ToolRunner::default();
        let reservation = runner.reserve_guard("preparing-source").unwrap();
        runner.cancel("preparing-source").unwrap();
        let catalog = catalog();
        lookup(&catalog, &catalog.sources[0].id).unwrap();
        assert!(matches!(
            reservation.run_retained(std::process::Command::new(
                "missing-executable-must-not-launch"
            )),
            Err(crate::tool_runner::ToolFailure::Canceled)
        ));
        drop(reservation);
        assert!(runner.reserve_guard("next-source").is_ok());
    }
}
