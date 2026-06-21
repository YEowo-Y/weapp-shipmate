import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

let dir = "";
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function setStatus(msg: string, kind: "" | "busy" | "error" | "ok" = "") {
  const el = $("#status");
  el.textContent = msg;
  el.className = "status " + kind;
}

async function pickFolder() {
  const picked = await open({
    directory: true,
    multiple: false,
    title: "选择微信小程序项目文件夹",
  });
  if (typeof picked === "string") {
    dir = picked;
    $("#dir").textContent = picked;
    ($("#check-btn") as HTMLButtonElement).disabled = false;
  }
}

async function run(cmd: "run_check" | "run_guide") {
  const subject = ($("#subject") as HTMLSelectElement).value;
  setStatus(cmd === "run_check" ? "预检中…" : "生成导航中…", "busy");
  $("#report").textContent = "";
  try {
    const args = cmd === "run_check" ? { dir, subject } : { subject };
    const out = await invoke<string>(cmd, args);
    $("#report").textContent = out;
    setStatus("完成。报告仅供参考，不构成合规担保。", "ok");
  } catch (e) {
    $("#report").textContent = "";
    setStatus(String(e), "error");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  $("#pick-btn").addEventListener("click", pickFolder);
  $("#check-btn").addEventListener("click", () => run("run_check"));
  $("#guide-btn").addEventListener("click", () => run("run_guide"));
});
