import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Real Windows WebView2 and the existing native chat protocol fixture. This does
// not substitute message DOM, emulate touch hardware, or claim external LLM QA.
export async function checkOpenClaudeChat({ run, checked, click, press, inspect, command, until, screenshot, finished, requests }) {
  const evidence = [];
  const original = await inspect('return {width:outerWidth,height:outerHeight,draft:document.querySelector("#desktopInput").value}');
  const preferences = async () => {
    await click('#desktop-preferences-open');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'chat appearance settings');
  };
  const closePreferences = async () => {
    await click('#preferences-content-dismiss');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'return to chat from appearance settings');
  };
  await preferences();
  const originalTheme = await inspect('return document.querySelector("#desktop-preferences [role=radio][id^=desktop-theme-][aria-checked=true]").id.replace("desktop-theme-", "")');
  await closePreferences();
  const fillDraft = async value => {
    const count = requests.length;
    // Clear through real editing keys so input listeners also update send state.
    // Use explicit Shift+Enter for newlines; no plain Enter or DOM input dispatch.
    await click('#desktopInput');
    const actions = [{type:'keyDown',value:'\uE009'},{type:'keyDown',value:'a'},{type:'keyUp',value:'a'},{type:'keyUp',value:'\uE009'},{type:'keyDown',value:'\uE003'},{type:'keyUp',value:'\uE003'}];
    for (const character of value) {
      if (character === '\n') actions.push({type:'keyDown',value:'\uE008'},{type:'keyDown',value:'\uE007'},{type:'keyUp',value:'\uE007'},{type:'keyUp',value:'\uE008'});
      else actions.push({type:'keyDown',value:character},{type:'keyUp',value:character});
    }
    await command('POST','/actions',{actions:[{type:'key',id:'keyboard',actions}]});
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'),value,'native keyboard input preserves the complete draft including every newline');
    assert.equal(requests.length,count,'editing a draft must not submit an upstream request');
    assert.equal(await inspect('return document.querySelector("#desktopSend").disabled'),!value.trim(),'idle send availability follows the actual draft after native keyboard edits');
    assert.equal(await inspect('return document.querySelector("#desktopSend").dataset.mode'),'send','draft editing must not enter the stop-generation state');
    assert.equal(await inspect(`return document.querySelectorAll('#desktopMessages [data-state="working"],#desktopMessages [data-state="streaming"]').length`),0,'draft editing leaves no running response');
  };
  const style = () => inspect('const c=getComputedStyle(document.querySelector("#desktopComposer .agent-composer"));return {shadow:c.boxShadow,border:c.borderColor}');
  const geometry = async label => {
    const value = await inspect(`const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const composer=document.querySelector('#desktopComposer .agent-composer'),input=document.querySelector('#desktopInput'),model=document.querySelector('#desktopComposer .agent-composer__model'),send=document.querySelector('#desktopSend'),messages=document.querySelector('#desktopMessages');
      const c=getComputedStyle(composer),i=getComputedStyle(input),coarse=matchMedia('(pointer:coarse)').matches;
      const hit=n=>{const r=n.getBoundingClientRect(),p=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return p===n||n.contains(p);};
      return {width:innerWidth,height:innerHeight,theme:document.body.dataset.theme,coarse,pageOverflow:document.documentElement.scrollWidth-innerWidth,
        composer:{...rect(composer),overflow:composer.scrollWidth-composer.clientWidth,radius:parseFloat(c.borderRadius)},
        input:{...rect(input),hasText:Boolean(input.value.trim()),min:parseFloat(i.minHeight),max:i.maxHeight,scrollHeight:input.scrollHeight},
        model:{...rect(model),visible:model.checkVisibility(),hit:hit(model)},send:{...rect(send),visible:send.checkVisibility(),enabled:!send.disabled,hit:hit(send)},
        messages:{...rect(messages),overflow:messages.scrollWidth-messages.clientWidth},
        users:[...messages.querySelectorAll('.msg--user')].map(n=>({...rect(n),parentWidth:n.parentElement.clientWidth,maxWidth:getComputedStyle(n).maxWidth})),
        icons:[...document.querySelectorAll('#desktopComposer .agent-composer__add,#desktopComposer .agent-composer__send')].filter(n=>n.checkVisibility()).map(rect)};`);
    evidence.push({label,...value});
    await writeFile(resolve(run,'open-claude-chat-layout.json'),JSON.stringify({fixture:'Actual native IPC chat with deterministic local protocol responses; no external account or touch emulation',views:evidence},null,2));
    await screenshot(`open-claude-${label}`);
    assert.ok(value.pageOverflow <= 1 && value.composer.overflow <= 1 && value.messages.overflow <= 1, `${label}: no horizontal overflow`);
    assert.ok(value.composer.width <= 705 && value.messages.width <= 705, `${label}: bounded 704px reading column`);
    assert.equal(value.composer.radius,20);
    if (!value.input.hasText) assert.equal(value.send.enabled,false, `${label}: empty idle composer cannot send`);
    assert.ok(value.input.height >= 48 && value.input.height <= 145, `${label}: input remains within 48–144px`);
    for (const user of value.users) assert.ok(user.width <= user.parentWidth*.85+1, `${label}: user bubble is capped at 85%`);
    for (const [name,box] of [['composer',value.composer],['model',value.model],['send',value.send]]) {
      assert.ok(box.left>=0&&box.right<=value.width+1&&box.top>=0&&box.bottom<=value.height+1, `${label}: ${name} stays inside viewport`);
    }
    assert.ok(value.model.visible&&value.model.hit&&value.send.visible&&value.send.hit, `${label}: model and send controls are unobstructed`);
    assert.equal(value.icons.length,2, `${label}: both composer icon actions are visible`);
    for(const icon of value.icons) assert.ok(icon.width>=(value.coarse?44:32)&&icon.height>=(value.coarse?44:32), `${label}: icon actions retain usable targets for the actual pointer type`);
    return value;
  };
  try {
    for(const theme of ['light','dark']) await checked(`Open Claude adopted chat proportions remain usable in ${theme} at desktop and narrow widths`, async()=>{
      await command('POST','/window/rect',{width:1000,height:900});
      await preferences(); await click(`#desktop-theme-${theme}`); await closePreferences();
      for(const width of [1000,1440,390,320]) {
        await command('POST','/window/rect',{width,height:900});
        await preferences(); await closePreferences();
        const unfocused=await style();
        await click('#desktopInput');
        await until(async()=>{const focused=await style();return focused.shadow!=='none'&&JSON.stringify(focused)!==JSON.stringify(unfocused);}, 'visible composer focus feedback');
        await press('\uE004');
        await command('POST','/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\uE008'},{type:'keyDown',value:'\uE004'},{type:'keyUp',value:'\uE004'},{type:'keyUp',value:'\uE008'}]}]});
        const keyboard=await inspect('const input=document.querySelector("#desktopInput"),c=getComputedStyle(document.querySelector("#desktopComposer .agent-composer"));return {active:document.activeElement===input,visible:input.matches(":focus-visible"),outline:c.outlineStyle,width:parseFloat(c.outlineWidth),color:c.outlineColor}');
        assert.equal(keyboard.active,true,'Tab then Shift+Tab returns to the textarea through native keyboard navigation');
        assert.equal(keyboard.visible,true,'keyboard focus uses the focus-visible treatment');
        assert.notEqual(keyboard.outline,'none'); assert.ok(keyboard.width>=2);
        assert.ok(!['transparent','rgba(0, 0, 0, 0)'].includes(keyboard.color),'keyboard outline is visibly painted');
        evidence.push({label:`${theme}-${width}-keyboard-focus`,...keyboard});
        await geometry(`${theme}-${width}-chat`);
      }
      await fillDraft(Array.from({length:24},(_,i)=>`第 ${i+1} 行：真实输入框长草稿，验证内部滚动与发送按钮可达。`).join('\n'));
      const long=await geometry(`${theme}-320-long-draft`);
      assert.ok(long.input.scrollHeight>long.input.height,'long draft scrolls inside the bounded textarea');
      assert.equal(long.send.enabled,true,'narrow send action remains enabled for a valid draft');
      await fillDraft(original.draft);
    });
    await checked('Narrow chat sends through the actual native transport after visual adoption',async()=>{
      await command('POST','/window/rect',{width:320,height:900});
      const count=requests.length;
      await fillDraft('原生窄屏视觉验收：请返回测试协议回复。');
      const before=await geometry('dark-320-ready-to-send');assert.equal(before.send.enabled,true);
      await click('#desktopSend');
      await until(()=>requests.length>count&&requests.at(-1).completed,'narrow native fixture response completes'); await finished();
      assert.equal(await inspect('return document.querySelector("#desktopInput").value'),'');
      await geometry('dark-320-sent');
    });
  } finally {
    await command('POST','/window/rect',{width:original.width,height:original.height});
    await preferences(); await click(`#desktop-theme-${originalTheme}`); await closePreferences();
    await fillDraft(original.draft);
  }
}
