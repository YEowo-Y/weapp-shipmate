//! Explicit user-authored project notes. These are reference data, never permissions or rules.
use crate::{
    project_context::{validate_text, ContextSnapshot},
    project_store::{db_error, decode, encode, id, now, validate_agent_project, ProjectStore},
};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const MAX_ENTRIES: usize = 20;
const MAX_TEXT_BYTES: usize = 4096;
const MAX_TOTAL_BYTES: usize = 16384;
const MAX_REVISION: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MemorySource {
    User,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryEntry {
    pub id: String,
    pub title: String,
    pub text: String,
    pub enabled: bool,
    pub source: MemorySource,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryInput {
    pub id: String,
    pub title: String,
    pub text: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub project_id: String,
    pub revision: u64,
    pub entries: Vec<MemoryEntry>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MemoryDocument {
    schema_version: u32,
    project_id: String,
    revision: u64,
    entries: Vec<MemoryEntry>,
}

impl From<MemoryDocument> for MemorySnapshot {
    fn from(value: MemoryDocument) -> Self {
        Self {
            project_id: value.project_id,
            revision: value.revision,
            entries: value.entries,
        }
    }
}

fn validate_entry(entry_id: &str, title: &str, text: &str) -> Result<(), String> {
    id(entry_id)?;
    if title.trim().is_empty() || title.chars().count() > 80 || title.chars().any(char::is_control)
    {
        return Err("请填写 1–80 字的记忆标题，且不要包含控制字符。".into());
    }
    validate_text(title.to_owned(), 320)?;
    validate_text(text.to_owned(), MAX_TEXT_BYTES)?;
    Ok(())
}

fn validate_document(document: &MemoryDocument, project_id: &str) -> Result<(), String> {
    if document.schema_version != 1
        || document.project_id != project_id
        || document.revision > MAX_REVISION
        || (document.revision == 0 && !document.entries.is_empty())
    {
        return Err("项目记忆版本或所属项目不匹配，请保留数据库并检查备份。".into());
    }
    if document.entries.len() > MAX_ENTRIES {
        return Err("每个项目最多保存 20 条记忆，请先删除不再需要的内容。".into());
    }
    let mut ids = HashSet::new();
    let mut bytes = 0;
    for entry in &document.entries {
        validate_entry(&entry.id, &entry.title, &entry.text)?;
        if !ids.insert(&entry.id)
            || entry.created_at == 0
            || entry.updated_at < entry.created_at
            || entry.updated_at > MAX_REVISION
        {
            return Err("项目记忆记录无效，请保留数据库并检查备份。".into());
        }
        bytes += entry.text.len();
    }
    if bytes > MAX_TOTAL_BYTES {
        return Err("项目记忆正文总量不能超过 16 KiB，请缩短或删除部分内容。".into());
    }
    Ok(())
}

fn read_document(connection: &Connection, project_id: &str) -> Result<MemoryDocument, String> {
    id(project_id)?;
    // Bound decoding even if a local database was modified outside the application.
    let stored: Option<Option<String>> = connection
        .query_row(
            "SELECT CASE WHEN length(CAST(value AS BLOB)) <= 131072 THEN value ELSE NULL END FROM settings WHERE key=?",
            [format!("project_memory:{project_id}")],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    let document: MemoryDocument = match stored {
        None => MemoryDocument {
            schema_version: 1,
            project_id: project_id.into(),
            revision: 0,
            entries: vec![],
        },
        Some(Some(value)) => decode(value)?,
        Some(None) => return Err("项目记忆数据为空或超出上限，请保留数据库并检查备份。".into()),
    };
    validate_document(&document, project_id)?;
    Ok(document)
}

fn check_revision(document: &MemoryDocument, expected: u64) -> Result<(), String> {
    if document.revision != expected {
        return Err("项目记忆已发生变化，请刷新后重新编辑，避免覆盖其他修改。".into());
    }
    Ok(())
}

fn persist(connection: &Connection, document: &mut MemoryDocument) -> Result<(), String> {
    document.revision = document
        .revision
        .checked_add(1)
        .ok_or("项目记忆版本超出上限。")?;
    validate_document(document, &document.project_id)?;
    connection
        .execute(
            "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![format!("project_memory:{}", document.project_id), encode(document)?],
        )
        .map_err(db_error)?;
    Ok(())
}

pub(crate) fn snapshot(
    connection: &mut Connection,
    project_id: &str,
) -> Result<MemorySnapshot, String> {
    let tx = connection.transaction().map_err(db_error)?;
    validate_agent_project(&tx, project_id)?;
    Ok(read_document(&tx, project_id)?.into())
}

pub(crate) fn save(
    connection: &mut Connection,
    project_id: &str,
    expected_revision: u64,
    input: MemoryInput,
) -> Result<MemorySnapshot, String> {
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    validate_agent_project(&tx, project_id)?;
    validate_entry(&input.id, &input.title, &input.text)?;
    let mut document = read_document(&tx, project_id)?;
    check_revision(&document, expected_revision)?;
    let timestamp = now();
    if let Some(entry) = document
        .entries
        .iter_mut()
        .find(|entry| entry.id == input.id)
    {
        entry.title = input.title.trim().into();
        entry.text = input.text;
        entry.enabled = input.enabled;
        entry.updated_at = timestamp.max(entry.updated_at);
    } else {
        document.entries.push(MemoryEntry {
            id: input.id,
            title: input.title.trim().into(),
            text: input.text,
            enabled: input.enabled,
            source: MemorySource::User,
            created_at: timestamp,
            updated_at: timestamp,
        });
    }
    persist(&tx, &mut document)?;
    tx.commit().map_err(db_error)?;
    Ok(document.into())
}

pub(crate) fn delete(
    connection: &mut Connection,
    project_id: &str,
    expected_revision: u64,
    entry_id: &str,
) -> Result<MemorySnapshot, String> {
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    validate_agent_project(&tx, project_id)?;
    id(entry_id)?;
    let mut document = read_document(&tx, project_id)?;
    check_revision(&document, expected_revision)?;
    let index = document
        .entries
        .iter()
        .position(|entry| entry.id == entry_id)
        .ok_or("这条项目记忆已被删除，请刷新后重试。")?;
    document.entries.remove(index);
    persist(&tx, &mut document)?;
    tx.commit().map_err(db_error)?;
    Ok(document.into())
}

pub(crate) fn resolve(
    connection: &mut Connection,
    project_id: &str,
    entry_ids: &[String],
) -> Result<Vec<ContextSnapshot>, String> {
    let tx = connection.transaction().map_err(db_error)?;
    validate_agent_project(&tx, project_id)?;
    if entry_ids.is_empty() || entry_ids.len() > 8 {
        return Err("每次请选择 1–8 条项目记忆。".into());
    }
    let mut unique = HashSet::new();
    for entry_id in entry_ids {
        id(entry_id)?;
        if !unique.insert(entry_id) {
            return Err("不能重复引用同一条项目记忆。".into());
        }
    }
    let document = read_document(&tx, project_id)?;
    entry_ids
        .iter()
        .map(|entry_id| {
            let entry = document
                .entries
                .iter()
                .find(|entry| &entry.id == entry_id)
                .ok_or("所选项目记忆已被删除，请移除这条引用后重试。")?;
            if !entry.enabled {
                return Err("所选项目记忆已停用引用，请移除这条引用或重新启用。".into());
            }
            Ok(ContextSnapshot {
                id: format!("memory:{}", entry.id),
                kind: "memory".into(),
                title: entry.title.clone(),
                text: entry.text.clone(),
                bytes: entry.text.len(),
                created_at: Some(entry.updated_at),
                context_revision: Some(document.revision),
            })
        })
        .collect()
}

// Project export already validates the saved project and runs in a read transaction.
pub(crate) fn export_document(
    connection: &Connection,
    project_id: &str,
) -> Result<serde_json::Value, String> {
    serde_json::to_value(read_document(connection, project_id)?)
        .map_err(|_| "无法编码项目记忆。".into())
}

#[tauri::command]
pub fn project_memory_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
) -> Result<MemorySnapshot, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |connection| snapshot(connection, &project_id))
}

#[tauri::command]
pub fn project_memory_save(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
    expected_revision: u64,
    entry: MemoryInput,
) -> Result<MemorySnapshot, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |connection| {
        save(connection, &project_id, expected_revision, entry)
    })
}

#[tauri::command]
pub fn project_memory_delete(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
    expected_revision: u64,
    entry_id: String,
) -> Result<MemorySnapshot, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |connection| {
        delete(connection, &project_id, expected_revision, &entry_id)
    })
}

#[tauri::command]
pub fn project_memory_context(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ProjectStore>,
    project_id: String,
    entry_ids: Vec<String>,
) -> Result<Vec<ContextSnapshot>, String> {
    crate::runtime::authorize(&window)?;
    state.access(&app, |connection| {
        resolve(connection, &project_id, &entry_ids)
    })
}
