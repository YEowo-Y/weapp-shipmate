//! Manual read-only query for the latest public release of this application.
use crate::error::{run_blocking, DesktopResult};
use crate::tool_runner::{ToolFailure, ToolRunner};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

const RELEASE_PAGE: &str = "https://github.com/YEowo-Y/weapp-shipmate/releases/tag";
const MAX_REPLY_BYTES: usize = 512;
const RUN_ID: &str = "release-check";

#[derive(Default)]
pub struct ReleaseChecker(ToolRunner);

impl ReleaseChecker {
    pub fn shutdown(&self) {
        self.0.shutdown();
    }
}

#[derive(Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
enum ScriptResult {
    Release { tag: String },
    Unavailable {},
    Failed {},
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Comparison {
    PublicNewer,
    Same,
    LocalNewer,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ReleaseCheckResult {
    Release {
        tag: String,
        comparison: Comparison,
        url: String,
    },
    Unavailable,
    Busy,
    Failed,
}

fn read_result(output: &str, package: &tauri::PackageInfo) -> ReleaseCheckResult {
    if output.len() > MAX_REPLY_BYTES {
        return ReleaseCheckResult::Failed;
    }
    let tag = match serde_json::from_str::<ScriptResult>(output) {
        Ok(ScriptResult::Release { tag }) => tag,
        Ok(ScriptResult::Unavailable {}) => return ReleaseCheckResult::Unavailable,
        Ok(ScriptResult::Failed {}) | Err(_) => return ReleaseCheckResult::Failed,
    };
    let Some(public_version) = tag
        .strip_prefix('v')
        .and_then(|version| version.parse().ok())
    else {
        return ReleaseCheckResult::Failed;
    };
    let comparison = match package.version.cmp_precedence(&public_version) {
        Ordering::Less => Comparison::PublicNewer,
        Ordering::Equal => Comparison::Same,
        Ordering::Greater => Comparison::LocalNewer,
    };
    if !public_version.pre.is_empty() || !public_version.build.is_empty() {
        return ReleaseCheckResult::Failed;
    }
    ReleaseCheckResult::Release {
        url: format!("{RELEASE_PAGE}/{tag}"),
        tag,
        comparison,
    }
}

#[tauri::command]
pub async fn release_check(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    checker: tauri::State<'_, ReleaseChecker>,
) -> DesktopResult<ReleaseCheckResult> {
    crate::runtime::authorize(&window)?;
    let reservation = match checker.0.reserve_guard_outcome(RUN_ID) {
        Ok(reservation) => reservation,
        Err(ToolFailure::Busy) => return Ok(ReleaseCheckResult::Busy),
        Err(_) => return Ok(ReleaseCheckResult::Failed),
    };
    let result = run_blocking(
        "release_check",
        "检查更新失败，请重试。",
        move || {
            let mut command =
                crate::runtime::node_command(&app, "desktop/server/release-check.mjs", false)?;
            // Keep the public lookup independent of Node's opt-in proxy credentials.
            command.env_remove("NODE_USE_ENV_PROXY");
            let output = reservation.run_reserved(command, false)?;
            Ok(read_result(&output, app.package_info()))
        },
    )
    .await;
    Ok(result.unwrap_or(ReleaseCheckResult::Failed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn package(version: &str) -> tauri::PackageInfo {
        tauri::PackageInfo {
            name: "test".to_owned(),
            version: version.parse().unwrap(),
            authors: "",
            description: "",
            crate_name: "test",
        }
    }

    #[test]
    fn compares_stable_tags_against_the_current_package_version() {
        let cases = [
            ("0.2.0-rc.6", "v0.1.0", Comparison::LocalNewer),
            ("0.2.0-rc.6", "v0.2.0", Comparison::PublicNewer),
            ("0.2.0", "v0.2.0", Comparison::Same),
            ("0.2.0+build.2", "v0.2.0", Comparison::Same),
            ("0.2.0", "v0.10.0", Comparison::PublicNewer),
        ];
        for (current, tag, comparison) in cases {
            let output = serde_json::json!({ "status": "release", "tag": tag });
            assert_eq!(
                read_result(&output.to_string(), &package(current)),
                ReleaseCheckResult::Release {
                    tag: tag.to_owned(),
                    comparison,
                    url: format!("{RELEASE_PAGE}/{tag}"),
                },
            );
        }
    }

    #[test]
    fn rejects_noncanonical_tags_and_unexpected_child_output() {
        let package = package("0.2.0-rc.6");
        for tag in [
            "0.2.0",
            "v00.2.0",
            "v0.2.0-rc.7",
            "v0.2.0+build",
            "v18446744073709551616.0.0",
            "v0.2.0/../../unrelated",
            "v0.2.0\n",
        ] {
            let output = serde_json::json!({ "status": "release", "tag": tag });
            assert_eq!(
                read_result(&output.to_string(), &package),
                ReleaseCheckResult::Failed,
                "{tag}"
            );
        }
        for output in [
            r#"{"status":"unavailable","url":"https://example.invalid"}"#,
            r#"{"status":"release","tag":"v0.3.0","url":"https://example.invalid"}"#,
            r#"{"status":"busy"}"#,
            r#"{"status":"release"}"#,
            "unexpected output",
            "{\"status\":\"unavailable\"}\n{}",
            &format!(
                "{}{}",
                " ".repeat(MAX_REPLY_BYTES),
                r#"{"status":"unavailable"}"#
            ),
        ] {
            assert_eq!(read_result(output, &package), ReleaseCheckResult::Failed);
        }
        assert_eq!(
            read_result(r#"{"status":"unavailable"}"#, &package),
            ReleaseCheckResult::Unavailable
        );
        assert_eq!(
            read_result(r#"{"status":"failed"}"#, &package),
            ReleaseCheckResult::Failed
        );
    }

    #[test]
    fn holds_a_separate_single_slot_and_closes_it_on_shutdown() {
        let checker = ReleaseChecker::default();
        let project_runner = ToolRunner::default();
        let release = checker.0.reserve_guard_outcome(RUN_ID).unwrap();
        let project = project_runner
            .reserve_guard_outcome("project-check")
            .unwrap();
        assert!(matches!(
            checker.0.reserve_guard_outcome(RUN_ID),
            Err(ToolFailure::Busy)
        ));
        drop(release);
        assert!(checker.0.reserve_guard_outcome(RUN_ID).is_ok());
        checker.shutdown();
        assert!(checker.0.reserve_guard_outcome(RUN_ID).is_err());
        assert!(matches!(
            project_runner.reserve_guard_outcome("another"),
            Err(ToolFailure::Busy)
        ));
        drop(project);
    }
}
