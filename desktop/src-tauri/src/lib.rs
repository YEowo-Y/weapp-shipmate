mod agent_tools;
mod credential_store;
mod model_bridge;
mod project_context;
mod project_maintenance;
mod project_memory;
mod project_repair;
mod repair_writer;
mod project_store;
mod runtime;
mod source_freshness;
mod system_notifications;
mod tool_runner;
use tauri::Manager;

#[tauri::command]
async fn run_check(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, tool_runner::ToolRunner>,
    dir: String,
    subject: String,
    run_id: String,
) -> Result<String, String> {
    runtime::authorize(&window)?;
    tool_runner::subject(&subject)?;
    let dir = tool_runner::directory(&dir)?;
    let mut command = runtime::node_command(&app, "bin/weapp-shipmate.mjs", false)?;
    command.arg("check").arg(dir).arg("--subject").arg(subject);
    let runner = state.inner().clone();
    runner.reserve(&run_id)?;
    tauri::async_runtime::spawn_blocking(move || runner.run_reserved(command, run_id, true))
        .await
        .map_err(|_| "本地工具任务意外退出。".to_string())?
}

#[tauri::command]
async fn run_guide(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, tool_runner::ToolRunner>,
    subject: String,
    run_id: String,
) -> Result<String, String> {
    runtime::authorize(&window)?;
    tool_runner::subject(&subject)?;
    let mut command = runtime::node_command(&app, "bin/weapp-shipmate.mjs", false)?;
    command.arg("guide").arg("--subject").arg(subject);
    let runner = state.inner().clone();
    runner.reserve(&run_id)?;
    tauri::async_runtime::spawn_blocking(move || runner.run_reserved(command, run_id, false))
        .await
        .map_err(|_| "本地工具任务意外退出。".to_string())?
}

#[tauri::command]
fn run_cancel(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, tool_runner::ToolRunner>,
    run_id: String,
) -> Result<(), String> {
    runtime::authorize(&window)?;
    state.cancel(&run_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(model_bridge::ModelBridge::default())
        .manage(tool_runner::ToolRunner::default())
        .manage(project_store::ProjectStore::default())
        .manage(project_store::ProjectArchives::default())
        .manage(project_repair::ProjectRepairs::default())
        .manage(project_maintenance::ProjectMaintenance::default())
        .manage(system_notifications::SystemNotifications::default())
        .invoke_handler(tauri::generate_handler![
            project_store::project_snapshot,
            project_store::project_save,
            project_store::project_select,
            project_store::project_artifact,
            project_store::project_export,
            project_store::project_storage_status,
            project_store::project_import_preview,
            project_store::project_import,
            project_store::project_archive_prepare,
            project_store::project_archive_commit,
            project_store::project_run,
            project_repair::project_repair_prepare,
            project_repair::project_repair_apply,
            project_repair::project_repair_undo_prepare,
            project_repair::project_repair_undo,
            project_repair::project_repair_recovery_prepare,
            project_repair::project_repair_snapshot,
            project_repair::project_repair_record_recheck,
            project_store::project_facts_save,
            project_store::project_workflow,
            project_store::project_stage_confirm,
            project_store::project_compare,
            project_context::project_context_file,
            project_context::project_context_report,
            project_memory::project_memory_snapshot,
            project_memory::project_memory_save,
            project_memory::project_memory_delete,
            project_memory::project_memory_context,
            project_maintenance::project_maintenance_sync,
            project_maintenance::project_maintenance_snapshot,
            project_maintenance::project_maintenance_save,
            project_maintenance::project_maintenance_retry,
            project_maintenance::project_maintenance_read,
            project_maintenance::project_maintenance_stop,
            source_freshness::source_freshness_snapshot,
            source_freshness::source_freshness_check,
            source_freshness::quote::source_quote_snapshot,
            source_freshness::quote::source_quote_check,
            system_notifications::system_notifications_snapshot,
            system_notifications::system_notifications_save,
            system_notifications::system_notifications_test,
            run_check,
            run_guide,
            run_cancel,
            model_bridge::model_request,
            model_bridge::model_cancel
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<project_maintenance::ProjectMaintenance>()
                    .shutdown(app);
                app.state::<tool_runner::ToolRunner>().shutdown();
                app.state::<model_bridge::ModelBridge>().shutdown();
            }
        });
}
