use super::*;
use sha2::{Digest, Sha256};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuoteQuery {
    rule_id: String,
    url: String,
    quote: String,
}

#[derive(PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Match {
    Exact,
    WhitespaceNormalized,
    Missing,
    Unverified,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuoteResult {
    source: CheckResult,
    quote_hash: String,
    r#match: Match,
}

impl QuoteResult {
    fn verified(&self) -> bool {
        matches!(self.r#match, Match::Exact | Match::WhitespaceNormalized)
    }

    fn validate(&self, catalog: &SourceCatalog, source: &Source, hash: &str) -> Result<(), String> {
        validate_result(&self.source, catalog, source, now())?;
        if self.quote_hash != hash || (self.r#match != Match::Unverified) != evidence(&self.source)
        {
            return Err(INVALID_RESULT.into());
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuoteRecord {
    latest: QuoteResult,
    #[serde(deserialize_with = "nullable")]
    last_verified_at: Option<u64>,
}

#[derive(Serialize)]
pub struct QuoteRow {
    availability: &'static str,
    record: Option<QuoteRecord>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteSnapshot {
    catalog_version: String,
    rows: Vec<QuoteRow>,
}

fn resolve_query<'a>(catalog: &'a SourceCatalog, query: &QuoteQuery) -> Option<&'a Source> {
    if query.quote.encode_utf16().count() > 8192
        || query.quote.contains('\0')
        || !query.quote.chars().any(|c| {
            !c.is_whitespace() && !matches!(c, '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{feff}')
        })
    {
        return None;
    }
    catalog
        .sources
        .iter()
        .find(|s| s.url == query.url && s.references.iter().any(|r| r.id == query.rule_id))
}

fn scope(version: &str) -> Result<String, String> {
    if version.is_empty() || version.encode_utf16().count() > 16384 {
        return Err(INVALID_RESULT.into());
    }
    Ok(format!("{:x}", Sha256::digest(version.as_bytes())))
}

fn identity(
    catalog: &SourceCatalog,
    source: &Source,
    query: &QuoteQuery,
    scope: &str,
) -> (String, String) {
    let hash = format!("{:x}", Sha256::digest(query.quote.as_bytes()));
    let key = format!(
        "source_quote:{}:{scope}:{}:{}:{hash}",
        catalog.catalog_version, source.id, query.rule_id
    );
    (key, hash)
}

#[cfg(test)]
#[test]
fn records_are_scoped_to_the_report_rule_quote_and_installed_catalog() {
    let source = Source {
        id: "source-0123456789abcdef".into(),
        url: "https://developers.weixin.qq.com/miniprogram/introduction/".into(),
        title: "官方页面".into(),
        references: vec![Reference {
            id: "registration".into(),
            title: "注册".into(),
            draft: false,
            last_verified: None,
        }],
        baseline: None,
    };
    let mut catalog = SourceCatalog {
        schema_version: 1,
        catalog_version: "a".repeat(64),
        stale_days: 180,
        sources: vec![source.clone()],
    };
    let mut q = QuoteQuery {
        rule_id: "registration".into(),
        url: source.url.clone(),
        quote: "引用原文。".into(),
    };
    let v = scope("report-v1").unwrap();
    assert!(resolve_query(&catalog, &q).is_some());
    let (key, hash) = identity(&catalog, &source, &q, &v);
    let connection = Connection::open_in_memory().unwrap();
    connection
        .execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value)")
        .unwrap();
    for invalid in ["{", "{}", &"x".repeat(4097)] {
        connection
            .execute(
                "INSERT OR REPLACE INTO settings(key,value) VALUES (?1,?2)",
                params![key, invalid],
            )
            .unwrap();
        let row = read(&connection, &catalog, &source, &key, &hash).unwrap();
        assert_eq!(row.availability, "invalid-record");
        assert!(row.record.is_none());
        assert_eq!(
            read(&connection, &catalog, &source, "another-quote", &hash)
                .unwrap()
                .availability,
            "ready"
        );
        let original: String = connection
            .query_row("SELECT value FROM settings WHERE key=?", [&key], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(original, invalid);
    }
    assert_ne!(
        identity(&catalog, &source, &q, &scope("report-v2").unwrap()).0,
        key
    );
    q.quote.push(' ');
    assert_ne!(identity(&catalog, &source, &q, &v).1, hash);
    q.quote.pop();
    catalog.catalog_version = "b".repeat(64);
    assert_ne!(identity(&catalog, &source, &q, &v).0, key);
    q.rule_id = "other".into();
    assert!(resolve_query(&catalog, &q).is_none());
    q.rule_id = "registration".into();
    q.url.push_str("other");
    assert!(resolve_query(&catalog, &q).is_none());
}

fn read(
    connection: &Connection,
    catalog: &SourceCatalog,
    source: &Source,
    key: &str,
    hash: &str,
) -> Result<QuoteRow, String> {
    let raw: Option<String> = connection.query_row(
        "SELECT CASE WHEN typeof(value)='text' AND length(CAST(value AS BLOB)) <= 4096 THEN value ELSE '' END FROM settings WHERE key=?",
        [key], |row| row.get(0)).optional().map_err(db_error)?;
    match raw {
        None => Ok(QuoteRow {
            availability: "ready",
            record: None,
        }),
        Some(raw) => Ok(match decode_record(&raw, catalog, source, hash) {
            Ok(record) => QuoteRow {
                availability: "ready",
                record: Some(record),
            },
            Err(_) => QuoteRow {
                availability: "invalid-record",
                record: None,
            },
        }),
    }
}

fn decode_record(
    raw: &str,
    catalog: &SourceCatalog,
    source: &Source,
    hash: &str,
) -> Result<QuoteRecord, String> {
    let record: QuoteRecord = serde_json::from_str(raw).map_err(|_| INVALID_RECORD)?;
    record
        .latest
        .validate(catalog, source, hash)
        .map_err(|_| INVALID_RECORD)?;
    let at = record.latest.source.checked_at;
    if record.last_verified_at.is_some_and(|v| v == 0 || v > at)
        || (record.latest.verified() && record.last_verified_at != Some(at))
    {
        return Err(INVALID_RECORD.into());
    }
    Ok(record)
}

#[tauri::command]
pub fn source_quote_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    queries: Vec<QuoteQuery>,
    rules_version: String,
) -> Result<QuoteSnapshot, String> {
    crate::runtime::authorize(&window)?;
    let scope = scope(&rules_version)?;
    if queries.len() > 512 {
        return Err(INVALID_RESULT.into());
    }
    let catalog = load_catalog(&app)?;
    state.access(&app, |conn| {
        let mut rows = Vec::with_capacity(queries.len());
        for q in queries {
            let mut row = QuoteRow {
                availability: "unsupported",
                record: None,
            };
            if let Some(source) = resolve_query(&catalog, &q) {
                if source
                    .baseline
                    .as_ref()
                    .is_some_and(|b| b.method == Method::Manual)
                {
                    row.availability = "manual";
                } else {
                    let (key, hash) = identity(&catalog, source, &q, &scope);
                    row = read(conn, &catalog, source, &key, &hash)?;
                }
            }
            rows.push(row);
        }
        Ok(QuoteSnapshot {
            catalog_version: catalog.catalog_version,
            rows,
        })
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn source_quote_check(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    runner: tauri::State<'_, ToolRunner>,
    query: QuoteQuery,
    rules_version: String,
    catalog_version: String,
    run_id: String,
) -> Result<QuoteRecord, String> {
    crate::runtime::authorize(&window)?;
    let reservation = runner.reserve_guard(&run_id)?;
    let catalog = load_catalog(&app)?;
    if catalog.catalog_version != catalog_version {
        return Err("内置来源目录已更新，请重新打开报告。".into());
    }
    let source = resolve_query(&catalog, &query)
        .ok_or("未找到对应的官方来源或有效引文。")?
        .clone();
    if source
        .baseline
        .as_ref()
        .is_some_and(|b| b.method == Method::Manual)
    {
        return Err("此来源需要人工核对。".into());
    }
    let (key, hash) = identity(&catalog, &source, &query, &scope(&rules_version)?);
    let mut command = crate::runtime::node_command(&app, "desktop/server/source-check.mjs", false)?;
    command.arg(&source.id).arg("--quote").arg(&query.quote);
    let store = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.access(&app, |conn| {
            let row = read(conn, &catalog, &source, &key, &hash)?;
            if row.availability == "invalid-record" { return Err(INVALID_RECORD.into()) }
            Ok(())
        })?;
        let started_at = now();
        let output = reservation.run_retained(command).map_err(|e| e.to_string())?;
        if output.len() > RECORD_LIMIT { return Err(INVALID_RESULT.into()) }
        let latest: QuoteResult = serde_json::from_str(&output).map_err(|_| INVALID_RESULT)?;
        latest.validate(&catalog, &source, &hash)?;
        let at = latest.source.checked_at;
        if at < started_at.saturating_sub(CLOCK_TOLERANCE) { return Err(INVALID_RESULT.into()) }
        reservation.commit(|| {
            if load_catalog(&app)?.catalog_version != catalog_version { return Err(INVALID_RESULT.into()) }
            store.access(&app, |conn| {
                let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(db_error)?;
                let row = read(&tx, &catalog, &source, &key, &hash)?;
                if row.availability == "invalid-record" { return Err(INVALID_RECORD.into()) }
                let old = row.record;
                if old.as_ref().is_some_and(|r| r.latest.source.checked_at > at) { return Err(INVALID_RESULT.into()) }
                let last_verified_at = if latest.verified() { Some(at) } else { old.and_then(|r| r.last_verified_at) };
                let record = QuoteRecord { latest, last_verified_at };
                tx.execute("INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    params![key, encode(&record)?]).map_err(db_error)?;
                tx.commit().map_err(db_error)?;
                Ok(record)
            })
        }).map_err(|e| e.to_string())
    }).await.map_err(|_| "引文核验意外退出，请重试。".to_string())?
}
