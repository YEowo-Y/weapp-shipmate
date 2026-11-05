import { Button } from '../components/ui/button';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import type { PreferencesSnapshot, PreferencesStore } from './preferences-store';
import { Icon } from './icon';

type ChoiceField = 'theme' | 'messageSize' | 'motion';
type GroupProps = { field: ChoiceField; name: string; label: string; hint: string; choices: [string, string][]; snapshot: PreferencesSnapshot; store: PreferencesStore };
function SettingChoices({ field, name, label, hint, choices, snapshot, store }: GroupProps) {
  return <fieldset className="preferences-field" aria-describedby={hint ? `${name}-hint` : undefined}>
    <legend id={`${name}-label`} className="preferences-sr-only">{label}</legend>
    <div className="preferences-field-row">
      <div className="preferences-field-copy"><span className="preferences-field-label" aria-hidden="true">{label}</span>{hint && <p id={`${name}-hint`}>{hint}</p>}</div>
      <RadioGroup name={name} value={String(snapshot.preferences[field])} disabled={snapshot.blocked}
        aria-labelledby={`${name}-label`} aria-describedby={hint ? `${name}-hint` : undefined}
        onValueChange={value => store.save({ ...snapshot.preferences, [field]: field === 'messageSize' ? Number(value) : value })}
        className={`preferences-choices${field === 'theme' ? ' preferences-theme-choices' : ''}`}>
        {choices.map(([value, text]) => <span className="preferences-choice-option" key={value}>
          <RadioGroupItem id={`${name}-${value}`} value={value} aria-label={text} nativeButton render={<button type="button" />}>
            {field === 'theme' && <span className="preferences-theme-preview" data-theme={value} aria-hidden="true"><span /><span /></span>}
            <span className={field === 'theme' ? 'preferences-sr-only' : undefined}>{text}</span>
            {field === 'theme' && <Icon name="check" className="preferences-theme-check" />}
          </RadioGroupItem>
        </span>)}
      </RadioGroup>
    </div>
  </fieldset>;
}

export function Appearance({ snapshot, store, hidden }: { snapshot: PreferencesSnapshot; store: PreferencesStore; hidden: boolean }) {
  return <section id="preferences-appearance" className="preferences-appearance" aria-labelledby="preferences-appearance-title" hidden={hidden}>
    <span id="preferences-appearance-title" className="preferences-sr-only">外观与阅读</span>
    <h4>显示</h4>
    <div className="preferences-group"><SettingChoices field="theme" name="desktop-theme" label="主题模式" hint="" choices={[[ 'system', '跟随系统' ], [ 'light', '浅色' ], [ 'dark', '深色' ]]} snapshot={snapshot} store={store} /></div>
    <h4>阅读与交互</h4>
    <div className="preferences-group">
      <SettingChoices field="messageSize" name="desktop-message-size" label="正文大小" hint="调整对话与报告文字；菜单、输入框和代码字号保持不变。" choices={[[ '14', '小 · 14' ], [ '16', '标准 · 16' ], [ '18', '大 · 18' ]]} snapshot={snapshot} store={store} />
      <p className="preferences-sample" aria-label="正文大小预览">先查看检查结果，再决定下一步。</p>
      <SettingChoices field="motion" name="desktop-motion" label="界面动效" hint="减少动画与渐变，执行状态仍以文字展示。" choices={[[ 'system', '跟随系统' ], [ 'reduce', '减少动效' ]]} snapshot={snapshot} store={store} />
    </div>
    <div className="preferences-recovery"><div><span>恢复外观默认</span><p id="preferences-reset-description">仅恢复主题、正文大小和动效，不清除会话、项目资料或凭据。</p></div><Button id="preferences-reset" variant="outline" aria-label="恢复外观默认" aria-describedby="preferences-reset-description" onClick={store.reset}>恢复默认</Button></div>
  </section>;
}
