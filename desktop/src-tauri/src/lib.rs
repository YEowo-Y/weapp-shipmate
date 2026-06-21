// 上线船友 · 桌面外壳（P2.0 薄外壳）。
// 验证「外壳 / 大脑解耦」这条主链路：把零依赖的 Node 规则大脑当 sidecar 进程调起，
// 渲染上线预检（check）/ 流程导航（guide）报告。无终端 / 无 BYO-key / 无 agent——那些是 P2.1+。
use std::path::{Path, PathBuf};
use std::process::Command;

/// 规则大脑 CLI 路径（仓库内 bin/weapp-shipmate.mjs）。
/// P2.0 用编译期相对路径定位（仅本机开发）；打包分发时改为随包 sidecar（P2.1+）。
fn brain_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bin/weapp-shipmate.mjs")
}

/// 调起 Node 大脑并取回标准输出。check 命中阻断时 CLI 返回非零退出码属正常，
/// 故以「stdout 是否有内容」判定成败，而非退出码。
fn run_brain(args: &[&str]) -> Result<String, String> {
    let out = Command::new("node")
        .arg(brain_path())
        .args(args)
        .output()
        .map_err(|e| format!("无法启动 node（请确认已安装 Node ≥ 20 且在 PATH 中）：{e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    if stdout.trim().is_empty() {
        Err(format!(
            "规则大脑无输出。\nstderr：{}",
            String::from_utf8_lossy(&out.stderr)
        ))
    } else {
        Ok(stdout)
    }
}

#[tauri::command]
fn run_check(dir: String, subject: String) -> Result<String, String> {
    if dir.trim().is_empty() {
        return Err("请先选择小程序项目文件夹".into());
    }
    run_brain(&["check", &dir, "--subject", &subject])
}

#[tauri::command]
fn run_guide(subject: String) -> Result<String, String> {
    run_brain(&["guide", "--subject", &subject])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![run_check, run_guide])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
