import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties } from 'react';
import { DURATION, STEP_FRAMES, type Lesson, type Step } from './lessons';
import './style.css';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const panel = { width: 1240, height: 760 };

function Screenshot({ step, frame }: { step: Step; frame: number }) {
  const { fps } = useVideoConfig();
  const settle = spring({ fps, frame, config: { damping: 28, stiffness: 100 }, durationInFrames: 32 });
  const scale = Math.min(panel.width / step.camera.width, panel.height / step.camera.height);
  const left = (panel.width - step.camera.width * scale) / 2;
  const top = (panel.height - step.camera.height * scale) / 2;
  const rect = {
    left: left + (step.focus.x - step.camera.x) * scale,
    top: top + (step.focus.y - step.camera.y) * scale,
    width: step.focus.width * scale,
    height: step.focus.height * scale,
  };
  const highlight = interpolate(frame, [24, 45], [0, 1], clamp);
  const pointer = interpolate(frame, [35, 65], [28, 0], clamp);
  return <div className="screen" style={{ opacity: interpolate(frame, [0, 14], [0.3, 1], clamp), transform: `translateY(${(1 - settle) * 14}px)` }}>
    <div className="screenshot-camera" style={{ left, top, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
      <Img src={staticFile(`screens/${step.screenshot}.png`)} style={{ position: 'absolute', left: -step.camera.x, top: -step.camera.y, maxWidth: 'none' }} />
    </div>
    <div className="focus" style={{ ...rect, opacity: highlight }} />
    <div className="pointer" style={{ left: rect.left + rect.width - 18 + pointer, top: rect.top + rect.height - 10 + pointer, opacity: highlight }}>
      <svg width="36" height="42" viewBox="0 0 36 42"><path d="M4 3L30 22L19 25L14 37Z" fill="#b45531" stroke="white" strokeWidth="3" strokeLinejoin="round" /></svg>
    </div>
    <div className="screen-label">真实界面 · 示例项目</div>
  </div>;
}

export function Tutorial({ lesson }: { lesson: Lesson }) {
  const frame = useCurrentFrame();
  const index = Math.min(2, Math.floor(frame / STEP_FRAMES));
  const step = lesson.steps[index];
  const local = frame % STEP_FRAMES;
  const appear = interpolate(local, [0, 18], [0, 1], clamp);
  const progress = (frame + 1) / DURATION;
  return <AbsoluteFill className="tutorial">
    <div className="topbar">
      <div className="brand"><span className="brand-mark"><svg width="32" height="32" viewBox="0 0 32 32"><path d="M16 5L6 20h10V5Zm3 5v10h7L19 10ZM5 24c4 4 18 4 22 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /></svg></span>上线船友<span className="brand-divider"/>操作教程</div>
      <span className="edition">{lesson.number} / 03<span>24 秒 · 可暂停跟练</span></span>
    </div>
    <div className="copy">
      <div className="eyebrow">一步一步，完成当前任务</div>
      <h1>{lesson.title}</h1>
      <p className="description">{lesson.description}</p>
      <div className="step-copy" style={{ opacity: appear, transform: `translateY(${(1 - appear) * 10}px)` }}>
        <div className="step-number">{String(index + 1).padStart(2, '0')}<span>{step.title}</span></div>
        <h2>{step.instruction}</h2>
        <p className="detail">{step.detail}</p>
      </div>
      <div className="pause-note"><span>Ⅱ</span> 随时暂停，回到应用完成这一步</div>
    </div>
    <div className="visual"><Screenshot key={`${lesson.id}-${index}`} step={step} frame={local} /></div>
    <div className="bottom">
      <div className="step-track">{lesson.steps.map((item, i) => <div key={item.title} className={`track-item ${index === i ? 'active' : ''} ${i < index ? 'done' : ''}`}><span className="track-number">{i < index ? '✓' : i + 1}</span><span>{item.title}</span><div className="track-fill" style={{ transform: `scaleX(${i < index ? 1 : i === index ? (local + 1) / STEP_FRAMES : 0})` }} /></div>)}</div>
      <div className="footnote"><span>{lesson.reminder}</span><span className="time">{Math.floor(frame / 30).toString().padStart(2, '0')} / 24s</span></div>
    </div>
    <div className="film-progress" style={{ '--progress': progress } as CSSProperties} />
  </AbsoluteFill>;
}
