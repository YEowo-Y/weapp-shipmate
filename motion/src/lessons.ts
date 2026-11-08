export type Rect = { x: number; y: number; width: number; height: number };
export type Step = {
  title: string;
  instruction: string;
  detail: string;
  screenshot: string;
  camera: Rect;
  focus: Rect;
};
export type Lesson = {
  id: string;
  number: string;
  title: string;
  description: string;
  reminder: string;
  steps: Step[];
};

// Camera and focus rectangles use the original screenshot's pixel coordinates.
// Updated from the native capture receipt; no UI state is synthesized here.
export const lessons: Lesson[] = [
  {
    id: 'preflight', number: '01', title: '运行项目预检', description: '从本地项目，到有依据的检查结果。',
    reminder: '检查在本机运行 · 静态预检不代表官方审核通过',
    steps: [
      { title: '先选对项目', instruction: '在“当前项目”中\n选择已保存的项目。', detail: '首次使用？先打开旁边的文件夹入口，添加项目目录。', screenshot: 'home', camera: { x: 0, y: 0, width: 1300, height: 800 }, focus: { x: 10, y: 138, width: 260, height: 60 } },
      { title: '运行本地检查', instruction: '打开“项目工具”，\n点击“运行项目预检”。', detail: '核对项目目录后再运行。无需连接模型，也不会自动修改代码。', screenshot: 'tools', camera: { x: 600, y: 0, width: 900, height: 620 }, focus: { x: 1070, y: 420, width: 170, height: 55 } },
      { title: '读懂检查结果', instruction: '点击“阅读报告”后，\n逐项核对检查结果。', detail: '先看需要处理的项，再核对适用条件、官方来源与检查限制。', screenshot: 'report', camera: { x: 350, y: 400, width: 1100, height: 730 }, focus: { x: 687, y: 625, width: 750, height: 350 } },
    ],
  },
  {
    id: 'workflow', number: '02', title: '导出准备清单', description: '先核对事实，再带走一份准备事项。',
    reminder: '人工确认记录 ≠ 官方完成状态 · 导出不包含未保存草稿',
    steps: [
      { title: '进入上线进度', instruction: '选择当前项目，\n打开“上线进度”。', detail: '这里按阶段整理准备事项，并展示当前下一步。', screenshot: 'home', camera: { x: 0, y: 0, width: 1500, height: 960 }, focus: { x: 10, y: 295, width: 320, height: 50 } },
      { title: '核对已保存事实', instruction: '检查项目事实，\n改动后先保存。', detail: '不知道的选项保持“尚未确认”。不要把未知当成“否”。', screenshot: 'workflow', camera: { x: 350, y: 530, width: 1100, height: 720 }, focus: { x: 380, y: 625, width: 1060, height: 525 } },
      { title: '下载准备清单', instruction: '点击“导出准备清单”，\n保存 Markdown 文件。', detail: '文件包含已保存事实、阶段状态、材料要求和来源，可留档核对。', screenshot: 'workflow', camera: { x: 340, y: 160, width: 1100, height: 760 }, focus: { x: 700, y: 545, width: 170, height: 60 } },
    ],
  },
  {
    id: 'handoff', number: '03', title: '生成修复交接', description: '把问题和依据，一起交给下一位处理者。',
    reminder: '生成交接不会修改代码 · 处理前核对当前文件与业务需要',
    steps: [
      { title: '从已有报告出发', instruction: '完成一次检查，\n点击“修复交接”。', detail: '使用当前项目的已保存报告；若文件已变化，先重新检查。', screenshot: 'tools-result', camera: { x: 780, y: 350, width: 720, height: 460 }, focus: { x: 1218, y: 691, width: 125, height: 60 } },
      { title: '核对问题与来源', instruction: '阅读交接内容，\n确认问题确实适用。', detail: '交接保留报告来源、规则依据与核验提醒。它不是新的扫描结果。', screenshot: 'handoff', camera: { x: 215, y: 390, width: 1040, height: 730 }, focus: { x: 240, y: 575, width: 985, height: 490 } },
      { title: '复制或导出', instruction: '点击“复制 Markdown”，\n或导出交接文件。', detail: '将问题、期望结果和验证步骤交给自己或协作者，逐项处理。', screenshot: 'handoff', camera: { x: 215, y: 35, width: 1040, height: 680 }, focus: { x: 242, y: 210, width: 188, height: 64 } },
    ],
  },
];

export const FPS = 30;
export const STEP_FRAMES = 240;
export const DURATION = STEP_FRAMES * 3;
