import { saveChatDebounced, updateMessageBlock } from '../../../../script.js';
jQuery(() => {
    let savedSelection = '';
    const $parentDoc = $(window.parent.document);
    
    // 🌟 老板发明的神级外挂：全局时光机存储库！
    window.nuyoahTimeMachine = window.nuyoahTimeMachine || new Map();

    // 🌟 老板发明的神级外挂：打包与 Emoji Token 压缩机！
    function packageResult(rawText, fStart, fEnd) {
        // 🎯 防代码块门框被切碎
        let safeStart = fStart;
        let safeEnd = fEnd;
        const beforeSegment = rawText.substring(Math.max(0, safeStart - 40), safeStart);
        const afterSegment = rawText.substring(safeEnd, Math.min(rawText.length, safeEnd + 40));
        const topMatch = beforeSegment.match(/```\S*[ \t]*\r?\n[ \t]*$/);
        const bottomMatch = afterSegment.match(/^[ \t]*\r?\n[ \t]*```/);
        if (topMatch && bottomMatch) { safeStart -= topMatch[0].length; safeEnd += bottomMatch[0].length; }

        const notebook = getDecorationNotebook(rawText);
        const tokens = new Map();
        let tokenCounter = 1;
        let tokenizedText = "";
        let lastIdx = safeStart;

        // 🛡️ 修复拼接漏洞：只遍历选中范围内的、且没有重叠的实体！
        const jumpKeys = Array.from(notebook.jumpRight.keys()).sort((a, b) => a - b);
        for (const start of jumpKeys) {
            const end = notebook.jumpRight.get(start);
            // 确保实体完全在选区内，且起步坐标大于上一次拼接结束点（防 AST 重叠！）
            if (start >= lastIdx && end <= safeEnd) {
                const part = rawText.substring(start, end);
                
                // 压缩链接的 URL 部分 (把长于 20 个字的网址变成 Emoji)
                if (rawText[start] === ']' && rawText[start+1] === '(') {
                    const urlPart = rawText.substring(start + 1, end);
                    if (urlPart.length > 20 || urlPart.includes('\n')) {
                        tokenizedText += rawText.substring(lastIdx, start + 1); // 补齐之前的普通文字，并保留到 ]
                        const tokenId = `[🔗隐形网址${tokenCounter++}]`;
                        tokens.set(tokenId, urlPart);
                        tokenizedText += tokenId;
                        lastIdx = end;
                        continue;
                    }
                } 
                // 压缩整个 Markdown 图片
                else if (rawText[start] === '!' && rawText[start+1] === '[') {
                    if (part.length > 20 || part.includes('\n')) {
                        tokenizedText += rawText.substring(lastIdx, start); // 补齐之前的普通文字
                        const tokenId = `[🖼️隐形图片${tokenCounter++}]`;
                        tokens.set(tokenId, part);
                        tokenizedText += tokenId;
                        lastIdx = end;
                        continue;
                    }
                }
            }
        }
        // 扫尾：把最后剩下的正常文字补进去
        if (lastIdx < safeEnd) {
            tokenizedText += rawText.substring(lastIdx, safeEnd);
        }

        return { 
            text: tokenizedText, 
            tokens, 
            start: safeStart, 
            end: safeEnd, 
            rawChunk: rawText.substring(safeStart, safeEnd) 
        };
    }

// 🔧 通用消息对象获取器
function getMessageObj(mesid) {
    if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
        const ctx = SillyTavern.getContext();
        if (ctx && ctx.chat) return ctx.chat[mesid];
    }
    if (typeof SillyTavern !== 'undefined' && SillyTavern.chat) return SillyTavern.chat[mesid];
    if (window.parent.SillyTavern && window.parent.SillyTavern.chat) return window.parent.SillyTavern.chat[mesid];
    return null;
}

// 🔄 统一更新消息并保持 UI 状态（无脑双保险版）
async function applyMessageUpdate(mesid, newText, scrollBefore) {
    const $msgBlock = $parentDoc.find(`.mes[mesid="${mesid}"]`);
    const openIndexes =[];
    $msgBlock.find('details').each(function(idx) { if (this.open) openIndexes.push(idx); });

    const targetMsg = getMessageObj(mesid);
    if (!targetMsg) { window.parent.alert('❌ 系统底层找不到该消息！'); return false; }

    targetMsg.mes = newText;
    if (Array.isArray(targetMsg.swipes) && typeof targetMsg.swipe_id === 'number') {
        targetMsg.swipes[targetMsg.swipe_id] = newText;
    }

    if (typeof window.parent.setChatMessages === 'function') {
        try { await window.parent.setChatMessages([{ message_id: mesid, message: newText }]); } catch (e) {}
    } else if (typeof setChatMessages === 'function') {
        try { await setChatMessages([{ message_id: mesid, message: newText }]); } catch (e) {}
    } else if (typeof saveChatDebounced === 'function') {
        saveChatDebounced();
    } else if (typeof window.parent.saveChatDebounced === 'function') {
        window.parent.saveChatDebounced();
    } else if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
        const ctx = SillyTavern.getContext();
        if (ctx && typeof ctx.saveChat === 'function') await ctx.saveChat();
    }

    if (typeof updateMessageBlock === 'function') {
        updateMessageBlock(mesid, targetMsg);
    } else if (typeof window.parent.updateMessageBlock === 'function') {
        window.parent.updateMessageBlock(mesid, targetMsg);
    }

    setTimeout(() => {
        const $newDetails = $parentDoc.find(`.mes[mesid="${mesid}"]`).find('details');
        openIndexes.forEach(idx => { if ($newDetails[idx]) $newDetails[idx].open = true; });
        $parentDoc.find('#chat').scrollTop(scrollBefore);
    }, 150);

    return true;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// 🛡️ 反引号护盾统一处理（修复无限死循环版）
function skipBackticks(raw, i, state) {
    const { inCodeUntil, inCodeCloseLen } = state;
    if (i > inCodeUntil) {
        let tickLen = 1;
        while (raw[i + tickLen] === '`') tickLen++;
        const nextTick = raw.indexOf('`'.repeat(tickLen), i + tickLen);
        if (nextTick !== -1 && (tickLen >= 3 || !raw.substring(i, nextTick).match(/\n[ \t\r]*\n/))) {
            state.inCodeUntil = nextTick;
            state.inCodeCloseLen = tickLen;
            return i + tickLen; // 成功跨越左门框，坐标前进！
        }
    } else if (i === inCodeUntil) {
        state.inCodeUntil = -1;
        return i + inCodeCloseLen; // 成功跨越右门框，坐标前进！
    }
    return i; // 假门框，原路返回（坐标没变）
}

// ==================== 🛠️ 核心解析工具：护盾与天平 ====================

// 🛡️ 标签护盾：无视属性里的 >，精准找闭合，死守“空行不可跨越”的物理铁律！
function getHtmlTagEnd(raw, i) {
    let j = i + 1;
    let inQuote = null;
    let waitQuote = false;
    const max = raw.length; // 无限体力包容巨图
    while (j < max) {
        const c = raw[j];

        if (inQuote) {
            if (c === inQuote) inQuote = null; // 退出引号
        } else {
            // 🚨 老板发明的神级物理结界：只有在引号外面，才严禁跨越空行！
            if (c === '\n') {
                let k = j + 1;
                while(k < max && (raw[k] === ' ' || raw[k] === '\r' || raw[k] === '\t')) k++;
                if (k < max && raw[k] === '\n') return -1; 
            }

            if (c === '=') waitQuote = true;
            else if (c === '"' || c === "'") {
                if (waitQuote) inQuote = c;
                waitQuote = false;
            } else if (c === '>') return j; // 完美闭合
            else if (c !== ' ' && c !== '\n' && c !== '\r' && c !== '\t') waitQuote = false;
        }
        j++;
    }
    return -1; // 扫到底都没找到，安全放弃，绝不用盲目的 indexOf 去瞎兜底！
}

// ⚖️ 套娃天平：跨越所有嵌套，智能换行死锁 + 精准定向防弹衣！
function findBalanced(raw, start, openChar, closeChar, isUrl = false) {
    let balance = 1;
    let j = start;
    let inQuote = null;
    const max = raw.length;
    
    while (j < max) {
        // 🚨 铁血防线：如果是解析网址的 ()，严禁任何换行！
        if (raw[j] === '\n') {
            if (isUrl) return -1; // 网址遇到换行当场死刑
            // 普通方括号允许换行，但严禁空行（双换行）
            let k = j + 1;
            while(k < max && (raw[k] === ' ' || raw[k] === '\r' || raw[k] === '\t')) k++;
            if (k < max && raw[k] === '\n') return -1; 
        }

        if (raw[j] === '\\') { j += 2; continue; } // 无视转义
        
        // 👑 老板的终极打脸修改：只有在解析 URL () 时，才准穿防弹衣！
        // 在 [] 里穿防弹衣会导致[I'm a boy] 的 ] 被生生吞掉！
        if (isUrl && (raw[j] === '"' || raw[j] === "'")) {
            if (!inQuote) inQuote = raw[j];
            else if (raw[j] === inQuote) inQuote = null;
            j++; continue;
        }
        
        if (inQuote) { j++; continue; }
        
        if (raw[j] === openChar) balance++;
        else if (raw[j] === closeChar) {
            balance--;
            if (balance === 0) return j;
        }
        j++;
    }
    return -1;
}

// ==================== 视觉映射工具 ====================

// 引擎一：可见文本映射（影子方案）
    function buildVisibleMap(rawText) {
        if (!rawText) return { str: '', map:[] };
        let str = '';
        let map =[];  
        let i = 0;
        const skipTails = new Set();
        const tickState = { inCodeUntil: -1, inCodeCloseLen: 0 };

        while (i < rawText.length) {
            
            // 0. 智能行内代码护盾（安全防卡死版）
         if (rawText[i] === '`') {
             const nextI = skipBackticks(rawText, i, tickState);
             if (nextI !== i) {
                 i = nextI;
                 continue;
             }
         }

            const inCode = i < tickState.inCodeUntil;

            // 1. HTML 注释
            if (!inCode && rawText.startsWith('<!--', i)) {
                const end = rawText.indexOf('-->', i + 4);
                i = end === -1 ? rawText.length : end + 3;
                continue;
            }

            // 2. HTML 标签
            if (!inCode && rawText[i] === '<' && (/[a-zA-Z]/.test(rawText[i + 1] || '') || (rawText[i + 1] === '/' && /[a-zA-Z]/.test(rawText[i + 2] || '')))) {
                const end = getHtmlTagEnd(rawText, i);
                if (end !== -1) { i = end + 1; continue; }
            }

            // 2b. Markdown 图片
            if (!inCode && rawText[i] === '!' && rawText[i + 1] === '[') {
                const closeBracket = findBalanced(rawText, i + 2, '[', ']');
                if (closeBracket !== -1 && rawText[closeBracket + 1] === '(') {
                    const closeParen = findBalanced(rawText, closeBracket + 2, '(', ')', true);
                    if (closeParen !== -1) { i = closeParen + 1; continue; }
                }
            }

            // 3. Markdown 链接
            if (!inCode && rawText[i] === '[') {
                const closeBracket = findBalanced(rawText, i + 1, '[', ']');
                if (closeBracket !== -1 && rawText[closeBracket + 1] === '(') {
                    const closeParen = findBalanced(rawText, closeBracket + 2, '(', ')', true);
                    if (closeParen !== -1) {
                        skipTails.add(closeBracket);
                        i++; continue; 
                    }
                }
            }

            // 3b. ](url) 尾段跳过
            if (!inCode && rawText[i] === ']' && rawText[i + 1] === '(' && skipTails.has(i)) {
                const closeParen = findBalanced(rawText, i + 2, '(', ')', true);
                if (closeParen !== -1) { i = closeParen + 1; continue; }
            }

            // 4. Markdown 格式符（加粗、斜体等，注意：这里加上了单反引号的兜底跳过，防畸形文本！）
            if (!inCode && (rawText[i] === '*' || rawText[i] === '_' || rawText[i] === '~' || rawText[i] === '`')) {
                if (rawText[i + 1] === rawText[i] && rawText[i] !== '`') {
                    i += 2;
                    continue;
                }
                i++;
                continue;
            }

            // 5. HTML 实体解码
            if (!inCode && rawText[i] === '&') {
                const semi = rawText.indexOf(';', i + 1);
                if (semi !== -1 && semi - i <= 35 && /^&[a-zA-Z0-9#]+;$/.test(rawText.substring(i, semi + 1))) {
                    const decoded = decodeEntity(rawText.substring(i, semi + 1));
                    if (decoded) {
                        for (const ch of decoded) {
                            str += ch;
                            map.push([i, semi + 1]);
                            if (ch.length === 2) map.push([i, semi + 1]);
                        }
                        i = semi + 1;
                        continue;
                    }
                }
            }

            // 6. 其他字符
            const char = String.fromCodePoint(rawText.codePointAt(i));
            str += char;
            map.push([i, i + char.length]);
            if (char.length === 2) map.push([i, i + char.length]);
            i += char.length;
        }

        return { str, map };
    }

    // HTML 实体解码（包含浏览器黑科技全量覆盖 + 毫秒级性能缓存芯片）
    let _entityDecoder = null;
    const _entityCache = Object.create(null);

    function decodeEntity(entity) {
        // 1. 记忆芯片：只要查过，0延迟极速放行
        if (entity in _entityCache) return _entityCache[entity];

        // 2. 核心高频字典
        const map = {
            '&amp;': '&', '&lt;': '<', '&gt;': '>',
            '&quot;': '"', '&apos;': "'", '&nbsp;': ' '
        };
        const lower = entity.toLowerCase();
        if (map[lower] !== undefined) {
            _entityCache[entity] = map[lower];
            return map[lower];
        }

        let m = entity.match(/^&#(\d+);$/);
        if (m) { try { const r = String.fromCodePoint(+m[1]); _entityCache[entity] = r; return r; } catch(e) {} }
        m = entity.match(/^&#x([0-9a-f]+);$/i);
        if (m) { try { const r = String.fromCodePoint(parseInt(m[1], 16)); _entityCache[entity] = r; return r; } catch(e) {} }
        
        // 🌟 终极外挂：白嫖浏览器全量实体字典
        if (typeof document !== 'undefined') {
            if (!_entityDecoder) _entityDecoder = document.createElement('textarea');
            _entityDecoder.innerHTML = entity;
            const decoded = _entityDecoder.value;
            // 认识就返回真身；连浏览器都不认识就返回 null
            if (decoded !== entity) {
                _entityCache[entity] = decoded;
                return decoded;
            }
        }
        
        // 哪怕是假货也记下来，防止下次遇到又去动用 DOM 耗能
        _entityCache[entity] = null;
        return null;
    }

    // ==================== 引擎二：DNA + 邻居/排位 ====================

    // DOM 侧：暴力提取字母数字汉字
    function getDOMDNA(domText) {
        if (!domText) return '';
        return domText.match(/[\p{L}\p{N}]/gu)?.join('') || '';
    }

// Raw 侧 DNA + map：剥光后每个字母数字汉字记录在 raw 的范围
    function getRawDNA(rawText) {
        if (!rawText) return { str: '', map:[] };
        let str = '';
        let map = [];
        const isAlphaNum = /^[\p{L}\p{N}]$/u;
        let i = 0;
        const skipTails = new Set();
        const tickState = { inCodeUntil: -1, inCodeCloseLen: 0 };

        while (i < rawText.length) {
            
            // 0. 智能行内代码护盾（安全防卡死版）
         if (rawText[i] === '`') {
             const nextI = skipBackticks(rawText, i, tickState);
             if (nextI !== i) {
                 i = nextI;
                 continue;
             }
         }

            const inCode = i < tickState.inCodeUntil;

            // 1. HTML 注释
            if (!inCode && rawText.startsWith('<!--', i)) {
                const end = rawText.indexOf('-->', i + 4);
                i = end === -1 ? rawText.length : end + 3;
                continue;
            }

            // 2. HTML 标签
            if (!inCode && rawText[i] === '<' && (/[a-zA-Z]/.test(rawText[i + 1] || '') || (rawText[i + 1] === '/' && /[a-zA-Z]/.test(rawText[i + 2] || '')))) {
                const end = getHtmlTagEnd(rawText, i);
                if (end !== -1) { i = end + 1; continue; }
            }

            // 2b. Markdown 图片
            if (!inCode && rawText[i] === '!' && rawText[i + 1] === '[') {
                const closeBracket = findBalanced(rawText, i + 2, '[', ']');
                if (closeBracket !== -1 && rawText[closeBracket + 1] === '(') {
                    const closeParen = findBalanced(rawText, closeBracket + 2, '(', ')', true);
                    if (closeParen !== -1) { i = closeParen + 1; continue; }
                }
            }

            // 3. Markdown 链接
            if (!inCode && rawText[i] === '[') {
                const closeBracket = findBalanced(rawText, i + 1, '[', ']');
                if (closeBracket !== -1 && rawText[closeBracket + 1] === '(') {
                    const closeParen = findBalanced(rawText, closeBracket + 2, '(', ')', true);
                    if (closeParen !== -1) {
                        skipTails.add(closeBracket);
                        i++; continue;
                    }
                }
            }

            // 3b. Markdown 链接尾部
            if (!inCode && rawText[i] === ']' && rawText[i + 1] === '(' && skipTails.has(i)) {
                const closeParen = findBalanced(rawText, i + 2, '(', ')', true);
                if (closeParen !== -1) { i = closeParen + 1; continue; }
            }

            // 5. HTML 实体
            if (!inCode && rawText[i] === '&') {
                const semi = rawText.indexOf(';', i + 1);
                if (semi !== -1 && semi - i <= 35 && /^&[a-zA-Z0-9#]+;$/.test(rawText.substring(i, semi + 1))) {
                    const decoded = decodeEntity(rawText.substring(i, semi + 1));
                    if (decoded) {
                        for (const ch of decoded) {
                            if (isAlphaNum.test(ch)) {
                                str += ch;
                                map.push([i, semi + 1]);
                                if (ch.length === 2) map.push([i, semi + 1]);
                            }
                        }
                        i = semi + 1;
                        continue;
                    }
                }
            }

            // 6. 其他字符
            const char = String.fromCodePoint(rawText.codePointAt(i));
            if (isAlphaNum.test(char)) {
                str += char;
                map.push([i, i + char.length]);
                if (char.length === 2) map.push([i, i + char.length]);
            }
            i += char.length;
        }

        return { str, map };
    }

// 获取 DOM 选中的上下/左右邻居 DNA + DOM 排位
    function getSelectionContextDNA() {
        const ctx = { up: '', down: '', left: '', right: '', domRank: -1 };
        try {
            const sel = window.parent.getSelection();
            if (!sel || sel.rangeCount === 0) return ctx;
            const range = sel.getRangeAt(0);

            const $block = $(range.startContainer).closest('p, li, summary, div, blockquote');
            if (!$block.length) return ctx;

            // 上下邻居：整段 DNA
            ctx.up = getDOMDNA($block.prev().text() || '');
            ctx.down = getDOMDNA($block.next().text() || '');

// 左右邻居：完整句 DNA
        const blockText = $block.text() || '';
        const selectedText = sel.toString();
        

// 🚨 终极暴力美学：直接用原生 Range 获取纯正物理切片，彻底废弃 Selection 的自动换行符污染长度！
            const blockPreRange = range.cloneRange();
            blockPreRange.selectNodeContents($block[0]);
            blockPreRange.setEnd(range.startContainer, range.startOffset);
            
            const $endBlock = $(range.endContainer).closest('p, li, summary, div, blockquote');
            const blockPostRange = range.cloneRange();
            blockPostRange.selectNodeContents($endBlock.length ? $endBlock[0] : $block[0]);
            blockPostRange.setStart(range.endContainer, range.endOffset);

            const leftDOMText = blockPreRange.toString();
            const rightDOMText = blockPostRange.toString();
            
            ctx.left = getDOMDNA(leftDOMText).slice(-40);
            ctx.right = getDOMDNA(rightDOMText).slice(0, 40);

// ⚡ 终极 DOM 排位法：直接用虚拟光标截断，无视任何俄罗斯套娃标签！
            const selectedDNA = getDOMDNA(selectedText);
            const $mesText = $block.closest('.mes_text');
            
            // 🚨 救命锁 1：如果选区是空的（选中了空气），直接拒绝加班，防死机！
            if (!$mesText.length || !selectedDNA) {
                ctx.domRank = -1;
            } else {
                const preRange = range.cloneRange();
                preRange.setStart($mesText[0], 0);
                preRange.setEnd(range.startContainer, range.startOffset);
                
                const preDNA = getDOMDNA(preRange.toString());
                
                // 🚨 改用全量定位防止跨界重叠被截断，统一强制步长为 1！
                const fullDOMDNA = getDOMDNA($mesText.text() || '');
                const exactOffset = preDNA.length; 
                let rank = 0;
                let searchPos = 0;
                while (true) {
                    const idx = fullDOMDNA.indexOf(selectedDNA, searchPos);
                    // 仅统计在此绝对位移量之前的真实匹配项
                    if (idx === -1 || idx >= exactOffset) break;
                    rank++;
                    searchPos = idx + 1; // 恢复与 findByDNA 强制对齐的步长 1
                }
                ctx.domRank = rank;
            }

        } catch(e) {}
        return ctx;
    }

    // 多候选区分：邻居整段命中优先 → DOM 排位兜底
    function pickCandidate(matches, fullDNA, selLen, ctx) {
        // 第一层：邻居法
        const winners = [];
        for (const dnaStart of matches) {
            const beforeDNA = fullDNA.substring(0, dnaStart);
            const afterDNA = fullDNA.substring(dnaStart + selLen);

            let hit = false;

                     // 🚨 修复Bug1：上下段落邻居采用安全视距防止穿透，左右相邻句采用严格边缘匹配
         if (ctx.up && ctx.up.length > 0 && beforeDNA.slice(-(ctx.up.length + 500)).includes(ctx.up)) hit = true;
         if (!hit && ctx.down && ctx.down.length > 0 && afterDNA.slice(0, ctx.down.length + 500).includes(ctx.down)) hit = true;
         if (!hit && ctx.left && ctx.left.length > 0 && beforeDNA.endsWith(ctx.left)) hit = true;
         if (!hit && ctx.right && ctx.right.length > 0 && afterDNA.startsWith(ctx.right)) hit = true;

            if (hit) winners.push(dnaStart);
        }

        if (winners.length === 1) return winners[0];

        // 第二层：DOM 排位法精准兜底
        if (ctx.domRank >= 0 && ctx.domRank < matches.length) {
            const fallbackCandidate = matches[ctx.domRank];
            // 🚨 逻辑闭环锁：如果邻居法有留存人选，那排位选出的人【必须】在留存名单里！
            // 如果邻居法全军覆没 (winners.length === 0)，说明正则修改太狠，破釜沉舟直接信排位。
            if (winners.length === 0 || winners.includes(fallbackCandidate)) {
                return fallbackCandidate;
            }
        }

        return null;
    }

    // 引擎二主入口
    function findByDNA(rawText, selectedText) {
        const selectedDNA = getDOMDNA(selectedText);
        if (!selectedDNA) {
            return '⚠️ 选中内容无有效文字（全是标点/符号），无法定位。';
        }

        const { str: fullDNA, map: dnaMap } = getRawDNA(rawText);

        const matches = [];
        let searchFrom = 0;
        while (true) {
            const idx = fullDNA.indexOf(selectedDNA, searchFrom);
            if (idx === -1) break;
            matches.push(idx);
            searchFrom = idx + 1;
        }

                if (matches.length === 0) {
            // 引擎二失败，降级引擎三
            return findBySimilarity(rawText, selectedText);
        }

        let dnaStart;
        if (matches.length === 1) {
            dnaStart = matches[0];
        } else {
            const ctx = getSelectionContextDNA();
            const winner = pickCandidate(matches, fullDNA, selectedDNA.length, ctx);
            if (winner === null) {
                return `⚠️ 查出有 ${matches.length} 处相似内容，邻居和排位都无法区分，请提取多点文字。`;
            }
            dnaStart = winner;
        }

        const rawStart = dnaMap[dnaStart][0];
        const rawEnd = dnaMap[dnaStart + selectedDNA.length - 1][1];

const left = expandBlackLeft(rawText, rawStart);
        const right = expandBlackRight(rawText, rawEnd);

        let fStart = rawStart - left;
        let fEnd = rawEnd + right;

        return packageResult(rawText, fStart, fEnd);

    }

    // ==================== 引擎三：80% 相似度兜底 ====================

    // 最长公共子序列长度（动态规划）
    function lcsLength(a, b) {
        if (!a || !b) return 0;
        const m = a.length, n = b.length;
        // 用一维数组节省内存
        let prev = new Array(n + 1).fill(0);
        let curr = new Array(n + 1).fill(0);
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    curr[j] = prev[j - 1] + 1;
                } else {
                    curr[j] = Math.max(prev[j], curr[j - 1]);
                }
            }
            [prev, curr] = [curr, prev];
            curr.fill(0);
        }
        return prev[n];
    }

    // 相似度 = LCS / 选中目标长度（单向包含度）
    function similarity(a, b) {
        if (!a || !b) return 0;
        const lcs = lcsLength(a, b);
        return lcs / a.length;
    }

// 👑 按空行把 raw 切成段（复辟上古防切锁：加装防单行死锁的终极版！）
    function splitByBlankLine(rawText) {
        const segments =[];
        const lines = rawText.split('\n');
        let currentStart = 0;
        let currentLines =[];
        let pos = 0;
        let inCodeBlock = false; // 👈 灵魂保险一：禁止强切代码块
        let inComment = false;   // 👈 灵魂保险二：禁止强切多行注释

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                // 🛡️ 防死锁保险：如果这一行不仅以 ``` 开头，而且在同一行后面又出现了 ```（单行代码块秒开秒闭），立刻把锁关回去！
                if (trimmedLine.length >= 6 && trimmedLine.indexOf('```', 3) !== -1) {
                    inCodeBlock = !inCodeBlock;
                }
            }

            // 🚨 动态侦测 HTML 注释的开闭状态（绝对防吞版！）
            if (trimmedLine.includes('<!--')) inComment = true;
            if (trimmedLine.includes('-->')) inComment = false;

            const isBlank = trimmedLine === '';

            // 🚨 核心防线：只有在代码块外面 且 注释外面的空行，才允许切分拆散！
            if (isBlank && !inCodeBlock && !inComment) {
                if (currentLines.length > 0) {
                    const text = currentLines.join('\n');
                    segments.push({
                        text,
                        start: currentStart,
                        end: currentStart + text.length
                    });
                    currentLines =[];
                }
                pos += line.length + 1; 
                currentStart = pos;
            } else {
                currentLines.push(line);
                pos += line.length + 1;
            }
        }

        // 🧹 循环结束后的终极扫尾：把最后剩下的内容打包推入
        if (currentLines.length > 0) {
            const text = currentLines.join('\n');
            segments.push({
                text,
                start: currentStart,
                end: currentStart + text.length
            });
        }
        return segments;
    }

    // 引擎三主入口
    function findBySimilarity(rawText, selectedText) {
        const selectedDNA = getDOMDNA(selectedText);
        if (!selectedDNA) {
            return '⚠️ 选中内容无有效文字，无法定位。';
        }

        const segments = splitByBlankLine(rawText);

        // 对每段算 DNA 和相似度
        const candidates = [];
        for (const seg of segments) {
            const segDNA = getDOMDNA(seg.text);
            if (!segDNA) continue;
            const sim = similarity(selectedDNA, segDNA);
            if (sim >= 0.8) {
                candidates.push({ seg, sim });
            }
        }

        if (candidates.length === 0) {
            return '⚠️ 找不到匹配的文本（引擎三也未命中）。请确认选中的内容确实存在于消息中。';
        }

        let winner;
        if (candidates.length === 1) {
            winner = candidates[0];
        } else {
            // 多候选 → 邻居佐证
            const ctx = getSelectionContextDNA();
            const validated = [];
            for (const cand of candidates) {
                const idx = segments.indexOf(cand.seg);
                const upSeg = idx > 0 ? getDOMDNA(segments[idx - 1].text) : '';
                const downSeg = idx < segments.length - 1 ? getDOMDNA(segments[idx + 1].text) : '';

                let hit = false;
                // 上下邻居整段相似度也要 80%+
                if (ctx.up && upSeg && similarity(ctx.up, upSeg) >= 0.8) hit = true;
                if (!hit && ctx.down && downSeg && similarity(ctx.down, downSeg) >= 0.8) hit = true;
                // 左右邻居：候选段内是否包含
                if (!hit && ctx.left && getDOMDNA(cand.seg.text).includes(ctx.left)) hit = true;
                if (!hit && ctx.right && getDOMDNA(cand.seg.text).includes(ctx.right)) hit = true;

                if (hit) validated.push(cand);
            }

                        if (validated.length === 1) {
                winner = validated[0];
            } else {
                return `⚠️ 查出有 ${candidates.length} 处高度相似段落且无法精准区分，请多选中几个字进行定位。`;
            }
        }

        // 🚨 终结流氓逻辑：废除“命中后整段开全文”，贯彻“选多少给多少”！
        const { str: sDNA, map: sMap } = getRawDNA(winner.seg.text);
        if (!sDNA || sMap.length === 0) {
            return '⚠️ 无法精确定位边界。为遵循「选多少给多少」原则，已拦截强制展开全文的操作。';
        }
        
        // 提取用户划选内容的头尾特征（前后各取最多12个字作探针锚点）
        const actualLen = selectedDNA.length;
        // 🛡️ 防崩溃：加入 Math.min(actualLen) 防止用户只选 1 个字时截取越界
        const probeLen = Math.min(actualLen, Math.min(12, Math.max(2, Math.floor(actualLen / 3))));
        const headDNA = selectedDNA.substring(0, probeLen);
        const tailDNA = selectedDNA.substring(actualLen - probeLen);

        // 🔭 升级版：微距狙击雷达！废除贪婪暴搜，寻找“距离跨度”跟用户实际划选字数最接近的锚点！
        let bestHead = -1;
        let bestTail = -1;
        let minDiff = Infinity;
        
        let searchHead = 0;
        while (true) {
            const hIdx = sDNA.indexOf(headDNA, searchHead);
            if (hIdx === -1) break;
            
            let searchTail = hIdx;
            while (true) {
                const tIdx = sDNA.indexOf(tailDNA, searchTail);
                if (tIdx === -1) break;
                
                // 计算当前这对头尾在底板中的实际字数跨度
                const currentSpan = (tIdx + probeLen) - hIdx;
                const lengthDiff = Math.abs(currentSpan - actualLen);
                
                // 只要跨度最接近用户的实际划选字数，就立刻锁定！
                if (lengthDiff < minDiff) {
                    minDiff = lengthDiff;
                    bestHead = hIdx;
                    bestTail = tIdx;
                }
                
                // 🛡️ 铁血防线：如果向后找的跨度已经比用户选的字长了超过 50 个字，立即刹车，防止被相同的废词无限拉扯！
                if (currentSpan > actualLen + 50) break;
                
                searchTail = tIdx + 1;
            }
            searchHead = hIdx + 1;
        }

        // 🎯 动态容错：允许因底层排版符号导致的微小字数误差（最多允许 20 个字或总长的 25%）
        const maxAllowedDiff = Math.max(20, actualLen * 0.25);

        // 只有头尾锚点完美配对，且距离合格，才去精确截取边界
        if (bestHead !== -1 && bestTail !== -1 && minDiff <= maxAllowedDiff) {
            const relativeStart = sMap[bestHead][0];
            const relativeEnd = sMap[bestTail + probeLen - 1][1];
            
            const absStart = winner.seg.start + relativeStart;
            const absEnd = winner.seg.start + relativeEnd;

            // 挂载吸铁石吸附（确保边界的排版符号能带上，绝不多吸无关正文）
            const left = expandBlackLeft(rawText, absStart);
            const right = expandBlackRight(rawText, absEnd);

            let fStart = absStart - left;
            let fEnd = absEnd + right;

        return packageResult(rawText, fStart, fEnd);
        }

        // 如果找不到长度贴合的微观边界，拒绝强给全文，直接拦截报错
        return '⚠️ 模糊匹配成功，但选区微观边界锁定失败（可能由于排版干扰或重复词过多）。\n👉 为坚决捍卫「选多少给多少」体验，已拦截强制展开全文。请稍微调整选中范围后重试。';
    }

    function findInRaw(rawText, selectedText) {
        if (!selectedText || !selectedText.trim()) {
            return '⚠️ 选中内容为空';
        }

        // ===== 引擎一：精确可见映射 =====
        const { str: visibleStr, map: visibleMap } = buildVisibleMap(rawText);

        // 在可见字符串里找用户选中的原文（含标点空格）
        let matchCount = 0;
        let firstIdx = -1;
        let searchFrom = 0;
        while (true) {
            const idx = visibleStr.indexOf(selectedText, searchFrom);
            if (idx === -1) break;
            matchCount++;
            if (matchCount === 1) firstIdx = idx;
            searchFrom = idx + 1;
        }

                if (matchCount === 0 || matchCount > 1) {
            
            // ==========================================
            // 🚀 引擎 1.5：裸奔代码捕获网
            // ==========================================
            // 专治渲染器死机：遇到颜文字链接等没被渲染出的原样乱码，直接霸王硬上弓！
            if (matchCount === 0) {
                let nakedMatches =[];
                let sFrom = 0;
                while (true) {
                    const idx = rawText.indexOf(selectedText, sFrom);
                    if (idx === -1) break;

                    // 🗑️ 老板发明的神级物理垃圾桶过滤：防误抓废稿注释
                    // （注：补回了被吞掉的 <!-- 和 -->）
                    const lastOpen = rawText.lastIndexOf('<!--', idx);
                    const lastClose = rawText.lastIndexOf('-->', idx);
                    if (lastOpen !== -1 && lastOpen > lastClose) {
                        sFrom = idx + 1;
                        continue;
                    }

                    nakedMatches.push(idx);
                    sFrom = idx + selectedText.length;
                }

                if (nakedMatches.length > 0) {
                    let bestIdx = nakedMatches[0];
                    
                    // 🛡️ 邻居包抄法：立体雷达 + 纯净脱水验证
                    if (nakedMatches.length > 1) {
                        const ctx = getSelectionContextDNA();
                        let maxScore = -1;
                        
                        for (const idx of nakedMatches) {
                            let score = 0;
                            // 扩大视距到 150，容纳极端变态长网址
                            const before = rawText.substring(Math.max(0, idx - 150), idx);
                            const after = rawText.substring(idx + selectedText.length, Math.min(rawText.length, idx + selectedText.length + 150));
                            
                            // 🌟 金子1：改用 getRawDNA 脱水，彻底扒掉底层 HTML 标签的伪装，防止属性名污染泥土指纹！
                            const dnaBefore = getRawDNA(before).str;
                            const dnaAfter = getRawDNA(after).str;
                            
                            // 🌟 金子2：左右邻居为主力（10分），互相包含即命中，完美容忍底层长网址导致的长度不一
                            if (ctx.left && dnaBefore && (dnaBefore.includes(ctx.left) || ctx.left.includes(dnaBefore))) score += 10;
                            if (ctx.right && dnaAfter && (dnaAfter.includes(ctx.right) || ctx.right.includes(dnaAfter))) score += 10;
                            
                            // 🌟 金子3：上下邻居为辅助（2分），立体防多胞胎撞车
                            if (ctx.up && dnaBefore && (dnaBefore.includes(ctx.up) || ctx.up.includes(dnaBefore))) score += 2;
                            if (ctx.down && dnaAfter && (dnaAfter.includes(ctx.down) || ctx.down.includes(dnaAfter))) score += 2;
                            
                            if (score > maxScore) { maxScore = score; bestIdx = idx; }
                        }
                    }

                    const rawStart = bestIdx;
                    const rawEnd = bestIdx + selectedText.length;
                    
                    // 挂上【白名单严格吸铁石】打扫边缘战场
                    const left = expandStrictLeft(rawText, rawStart);
                    const right = expandStrictRight(rawText, rawEnd);

                    let fStart = rawStart - left;
                    let fEnd = rawEnd + right;

        return packageResult(rawText, fStart, fEnd);
                }
            }

            // 🧬 降级到引擎二：DNA 脱衣化验（杂牌军没抓到，交给法医去验骨架）
            return findByDNA(rawText, selectedText);
        }

        // 通过 map 反查 raw 的精确范围
        const rawStart = visibleMap[firstIdx][0];
        const rawEnd = visibleMap[firstIdx + selectedText.length - 1][1];

        // 严格版吸铁石：只吸装饰物（注释、标签、markdown 符、链接 URL、HTML 实体），遇任何其他字符停

// 插上严格白名单吸铁石的电源！
        const left = expandStrictLeft(rawText, rawStart);
        const right = expandStrictRight(rawText, rawEnd);

        let fStart = rawStart - left;
        let fEnd = rawEnd + right;

return packageResult(rawText, fStart, fEnd);
    }

    // ==================== 👑 终极架构：AST 笔记本与瞬移吸铁石 ====================

    let cachedRawForNotebook = '';
    let cachedNotebook = { jumpLeft: new Map(), jumpRight: new Map() };

    // 📓 1. 绘制全局高亮地图（笔记本）：一次性精准记录所有复杂装饰物的 [起点, 终点]
    function getDecorationNotebook(raw) {
        if (raw === cachedRawForNotebook) return cachedNotebook;

        const jumpLeft = new Map();
        const jumpRight = new Map();

        // 打入零宽钉子
        function record(start, end) {
            jumpRight.set(start, end);
            jumpLeft.set(end, start);
        }

let i = 0;
        const skipTails = new Set();
        const tickState = { inCodeUntil: -1, inCodeCloseLen: 0 };

        while (i < raw.length) {
            
            // 0. 智能行内代码护盾（安全防卡死版）
         if (raw[i] === '`') {
             const nextI = skipBackticks(raw, i, tickState);
             if (nextI !== i) {
                 i = nextI;
                 continue;
             }
         }

            const inCode = i < tickState.inCodeUntil;

            // 1. HTML 注释 <!--...-->
            if (!inCode && raw.startsWith('<!--', i)) {
                const end = raw.indexOf('-->', i + 4);
                if (end !== -1) { record(i, end + 3); i = end + 3; }
                else { i = raw.length; } // 🛡️ 修复：未闭合注释直接跳到末尾，与 buildVisibleMap 行为对齐
                continue;
            }

            // 2. HTML 标签：无视嵌套换行
            if (!inCode && raw[i] === '<' && (/[a-zA-Z]/.test(raw[i + 1] || '') || (raw[i + 1] === '/' && /[a-zA-Z]/.test(raw[i + 2] || '')))) {
                const end = getHtmlTagEnd(raw, i);
                if (end !== -1) { record(i, end + 1); i = end + 1; continue; }
            }
            
            // 3. Markdown 图片：天平全吞
            if (!inCode && raw[i] === '!' && raw[i + 1] === '[') {
                const closeBracket = findBalanced(raw, i + 2, '[', ']');
                if (closeBracket !== -1 && raw[closeBracket + 1] === '(') {
                    const closeParen = findBalanced(raw, closeBracket + 2, '(', ')', true);
                    if (closeParen !== -1) { record(i, closeParen + 1); i = closeParen + 1; continue; }
                }
            }
            
            // 4. Markdown 链接：神级剥洋葱
            if (!inCode && raw[i] === '[') {
                const closeBracket = findBalanced(raw, i + 1, '[', ']');
                if (closeBracket !== -1 && raw[closeBracket + 1] === '(') {
                    const closeParen = findBalanced(raw, closeBracket + 2, '(', ')', true);
                    if (closeParen !== -1) {
                        record(i, i + 1); // 记录左前门[
                        record(closeBracket, closeParen + 1); // 记录右后院 ](url)
                        skipTails.add(closeBracket); // 发放通行证
                        i++; continue; 
                    }
                }
            }

            // 4b. Markdown 链接尾部：一键跨越
            if (!inCode && raw[i] === ']' && raw[i + 1] === '(' && skipTails.has(i)) {
                const closeParen = findBalanced(raw, i + 2, '(', ')', true);
                if (closeParen !== -1) { i = closeParen + 1; continue; }
            }
            
            // 5. HTML 实体：老天爷鉴定版
            if (!inCode && raw[i] === '&') {
                const semi = raw.indexOf(';', i + 1);
                if (semi !== -1 && semi - i <= 35 && /^&[a-zA-Z0-9#]+;$/.test(raw.substring(i, semi + 1))) {
                    if (decodeEntity(raw.substring(i, semi + 1))) {
                        record(i, semi + 1); i = semi + 1; continue;
                    }
                }
            }
            i++;
        }
        
        cachedRawForNotebook = raw;
        cachedNotebook = { jumpLeft, jumpRight };
        return cachedNotebook;
    }

    // 🧲 2. 黑磁铁 (宽容)：查笔记本瞬移，并顺手清理标点垃圾，遇【真实文字】或【换行】停
    function expandBlackLeft(raw, from) {
        const { jumpLeft } = getDecorationNotebook(raw);
        let pos = from;
        let absorbed = 0;
        while (pos > 0) {
            // 🛡️ 查地图：左脚跟踩到贴纸边界了吗？直接瞬移跨越！
            if (jumpLeft.has(pos)) {
                const start = jumpLeft.get(pos);
                // 🚨 AI 防洪闸：拒收 URL 装饰外壳，把一万字的网址死死挡在弹窗外！
                if (raw[start] === '[' || raw[start] === ']' || raw[start] === '!') break;
                
                absorbed += pos - start;
                pos = start;
                continue;
            }

            let charLen = 1;
            if (pos >= 2 && /[\uD800-\uDBFF]/.test(raw[pos - 2]) && /[\uDC00-\uDFFF]/.test(raw[pos - 1])) charLen = 2;
            const testChar = charLen === 2 ? raw[pos - 2] + raw[pos - 1] : raw[pos - 1];
            
            // 遇到有效文字或换行，立刻刹车
            if (testChar === '\n' || testChar === '\r') break;
            if (/[\p{L}\p{N}]/u.test(testChar)) break;
            
            absorbed += charLen;
            pos -= charLen;
        }
        return absorbed;
    }

    function expandBlackRight(raw, from) {
        const { jumpRight } = getDecorationNotebook(raw);
        let pos = from;
        let absorbed = 0;
        while (pos < raw.length) {
            // 🛡️ 查地图：右脚尖踩到贴纸起点了吗？直接瞬移跨越！
            if (jumpRight.has(pos)) {
                const end = jumpRight.get(pos);
                // 🚨 AI 防洪闸：拒收 URL 装饰外壳！
                if (raw[pos] === '[' || raw[pos] === ']' || raw[pos] === '!') break;
                
                absorbed += end - pos;
                pos = end;
                continue;
            }

            let charLen = 1;
            if (pos + 1 < raw.length && /[\uD800-\uDBFF]/.test(raw[pos]) && /[\uDC00-\uDFFF]/.test(raw[pos + 1])) charLen = 2;
            const testChar = charLen === 2 ? raw[pos] + raw[pos + 1] : raw[pos];
            
            if (testChar === '\n' || testChar === '\r') break;
            if (/[\p{L}\p{N}]/u.test(testChar)) break;
            
            absorbed += charLen;
            pos += charLen;
        }
        return absorbed;
    }

    // 🧲 3. 严格磁铁：极其洁癖！【只认】笔记本里的地图和排版符，遇普通字、标点、空格死死停住！
    function expandStrictLeft(raw, from) {
        const { jumpLeft } = getDecorationNotebook(raw);
        let pos = from;
        let absorbed = 0;
        while (pos > 0) {
            // 🛡️ 查地图瞬移
            if (jumpLeft.has(pos)) {
                const start = jumpLeft.get(pos);
                // 🚨 AI 防洪闸：拒收 URL 装饰外壳，把一万字的网址死死挡在弹窗外！
                if (raw[start] === '[' || raw[start] === ']' || raw[start] === '!') break;
                
                absorbed += pos - start;
                pos = start;
                continue;
            }

            const before = pos - 1;

            // 允许吸收零散的 Markdown 格式符 ** __ ~~ * _ `
            if (raw[before] === '*' || raw[before] === '_' || raw[before] === '~' || raw[before] === '`') {
                if (before > 0 && raw[before - 1] === raw[before] && raw[before] !== '`') {
                    absorbed += 2; pos -= 2; continue;
                }
                absorbed += 1; pos -= 1; continue;
            }

            // 👑 行首排版符一键切割 (标题 #, 引用 >, 列表 -, 1.)
            const lineStart = raw.lastIndexOf('\n', before);
            const linePrefix = raw.substring(lineStart === -1 ? 0 : lineStart + 1, pos);
            if (linePrefix.length > 0 && /^(?:\s|>|#|[-+*]|\d+\.)+$/.test(linePrefix)) {
                absorbed += linePrefix.length;
                pos -= linePrefix.length;
                continue;
            }

            break; // 遇到任何未经允许的标点、空格、文字，直接刹车！
        }
        return absorbed;
    }

    function expandStrictRight(raw, from) {
        const { jumpRight } = getDecorationNotebook(raw);
        let pos = from;
        let absorbed = 0;
        while (pos < raw.length) {
            // 🛡️ 查地图瞬移
            if (jumpRight.has(pos)) {
                const end = jumpRight.get(pos);
                // 🚨 AI 防洪闸：拒收 URL 装饰外壳！
                if (raw[pos] === '[' || raw[pos] === ']' || raw[pos] === '!') break;
                
                absorbed += end - pos;
                pos = end;
                continue;
            }

            // 允许吸收零散的 Markdown 格式符
            if (raw[pos] === '*' || raw[pos] === '_' || raw[pos] === '~' || raw[pos] === '`') {
                if (pos + 1 < raw.length && raw[pos + 1] === raw[pos] && raw[pos] !== '`') {
                    absorbed += 2; pos += 2; continue;
                }
                absorbed += 1; pos += 1; continue;
            }

            break; // 遇到正常文字、标点、空格，直接停
        }
        return absorbed;
    }

// ==================== 事件与悬浮铅笔 ====================

    let currentMesidForPencil = null;

    // 1. 在页面上悄悄建一个小铅笔 ✏️
    let $pencil = $parentDoc.find('#st-tank-pencil');
    if (!$pencil.length) {
        $pencil = $(`
            <div id="st-tank-pencil" style="
                position: fixed;
                z-index: 2147483647;
                width: 38px; height: 38px;
                background: var(--SmartThemeBlurTintColor, rgba(50,50,50,0.8));
                border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-size: 18px; cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                backdrop-filter: blur(10px);
                transition: transform 0.1s ease;
            ">✏️</div>
        `).appendTo($parentDoc.find('body'));
$pencil.hide();

// 按下铅笔时的缩放动画，手感拉满（加入 tankScale 命名空间防误杀）
        $pencil.on('mousedown.tankScale touchstart.tankScale', function(e) { 
            e.preventDefault(); 
            $(this).css('transform', 'scale(0.9)'); 
        });
        $pencil.on('mouseup.tankScale touchend.tankScale', function() { $(this).css('transform', 'scale(1)'); });
    }

// 在外面备用一个倒计时秒表
    let pencilTimeout = null;

// 5. 滚动防脱轨保护：只要页面一滚，立刻收起铅笔！
    $parentDoc.find('#chat').off('scroll.nuyoahPencil').on('scroll.nuyoahPencil', function() {
        clearTimeout(pencilTimeout); // 彻底掐死潜伏待发的定时器
        if ($pencil[0].style.display !== 'none') {
            $pencil.hide();
        }
    });

    // 2. 选词变化监听：高级防抖版 (所见即所得)
    $parentDoc.off('selectionchange.nuyoah').on('selectionchange.nuyoah', function() {
        // 🚨 核心体验 1：只要系统侦测到选区还在变化，立刻把铅笔藏起来，绝不碍眼！
        $pencil.hide();
        
        // 我们把倒计时清零，重新开始数
        clearTimeout(pencilTimeout);

        const sel = window.parent.getSelection();
        const text = sel ? sel.toString().trim() : '';

        // 如果选区被点没了，保持隐藏，直接下班
        if (!text || sel.rangeCount === 0) {
            savedSelection = '';
            currentMesidForPencil = null;
            return;
        }

        // 🚨 核心体验 2：启动倒计时。
        // 等底下的数字 (520毫秒) 到了，确认用户手指停稳了，再计算坐标呼出铅笔！
                pencilTimeout = setTimeout(() => {
            // 🌟 实时存活校验：防止在倒计时期间选区被用户点没，引发越界崩溃！
            if (!sel || sel.rangeCount === 0) return;
            
            savedSelection = text;

            // 找这串字在哪个楼层里
            const range = sel.getRangeAt(0);
            const $mes = $(range.startContainer).closest('.mes');
            if (!$mes.length) return;
            const mesid = +$mes.attr('mesid');
            if (isNaN(mesid)) return;
            
            currentMesidForPencil = mesid;

            // 📏 获取最后一行文字的物理边界坐标
            const rects = range.getClientRects();
            if (rects.length === 0) return;
            const lastRect = rects[rects.length - 1]; 

            // (这里是你之前的完美间距设置)
            let x = lastRect.right + 15; 
            let y = lastRect.top + (lastRect.height / 2) - 19; 

// 🛡️ 智能防越界与原生菜单避让系统（终极UX）
            const screenWidth = window.parent.innerWidth;
            const screenHeight = window.parent.innerHeight;
            
            if (x + 40 > screenWidth) { 
                // 🕵️ 侦测选区在屏幕的上下半区
                if (lastRect.top < screenHeight / 2) {
                    // 📍 选区在上半屏：原生菜单会出现在下边，铅笔机智躲到【右上】
                    x = lastRect.right - 38; 
                    y = lastRect.top - 42; // 悬浮在文字正上方
                    // 极限防卡死：如果字在屏幕绝对最顶端，稍往下压防止跑到屏幕外
                    if (y < 5) y = 5; 
                } else {
                    // 📍 选区在下半屏：原生菜单会出现在上边，铅笔机智躲到【右下】
                    x = lastRect.right - 38; 
                    y = lastRect.bottom + 12; // 悬浮在文字正下方
                    // 极限防卡死：如果字在屏幕绝对最底端，稍往上提防止掉出屏幕外
                    if (y + 40 > screenHeight) y = screenHeight - 45;
                }
            }

            // 🚨 用 display: flex 显形，维持你的 Emoji 完美居中！
            $pencil.css({ left: x + 'px', top: y + 'px', display: 'flex' });
        }, 520); // 👈 小铅笔弹出时间
    });

// 3. 点击小铅笔：呼出超级手术刀弹窗！
    $pencil.off('click.nuyoah touchend.nuyoah').on('click.nuyoah touchend.nuyoah', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        $pencil.hide(); // 点击瞬间隐藏铅笔

        if (savedSelection && currentMesidForPencil !== null) {
            const msgObj = getMessageObj(currentMesidForPencil);
            const rawText = msgObj ? msgObj.mes : null;
            
            if (rawText === undefined || rawText === null) {
                window.parent.alert('⚠️ 底层通讯中断：找不到聊天记录数据！');
                return;
            }
            
            const result = findInRaw(rawText, savedSelection);
            
            // 传参呼出弹窗（记得把你神级 AI 教的 originalSelection 带进去）
            showSurgeryPopup(currentMesidForPencil, rawText, result, savedSelection); 
            
            // 打扫战场：这句一执行，手机上烦人的原生蓝框直接消失，干净清爽！
            window.parent.getSelection().removeAllRanges(); 
            savedSelection = '';
        }
    });

    // 4. 选词期间拦截 swipe 翻页（你刚才发明的绝杀防滑代码，原封不动保留！）
    $parentDoc.find('#chat').off('touchmove.nuyoahNoSwipe').on('touchmove.nuyoahNoSwipe', '.mes_text', function(e) {
        const sel = window.parent.getSelection();
        if (sel && sel.toString().length > 0) {
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }
    });

// ==================== 弹窗与回填引擎 ====================

function showSurgeryPopup(mesid, rawText, extractObj, originalSelection) {
    $parentDoc.find('#ultra-surgery-mask').remove();
    const $chat = $parentDoc.find('#chat');
    const scrollBefore = $chat.scrollTop();

    const isError = typeof extractObj === 'string';
    const rawResultText = isError ? extractObj : extractObj.text;
    
    // 🌟 探测这层楼有没有后悔药（chat_id + mesid 双绑，防切换聊天串线）
    const chatKey = (function() {
        let cid = '';
        try {
            if (typeof window.parent.getCurrentChatId === 'function') {
                cid = window.parent.getCurrentChatId() || '';
            } else if (window.parent.SillyTavern && typeof window.parent.SillyTavern.getContext === 'function') {
                const ctx = window.parent.SillyTavern.getContext();
                cid = ctx.chatId || ctx.characterId || '';
            }
        } catch (e) {}
        return `${cid}__${mesid}`;
    })();
    const historyArr = (window.nuyoahTimeMachine && window.nuyoahTimeMachine.get(chatKey)) || [];
    const hasHistory = historyArr.length > 0;

    const isThisMesGenerating = $chat.find(`.mes[mesid="${mesid}"]`).find('.typing_cursor, img[src*="typing"], .mes_typing').length > 0;
    const warningUI = isThisMesGenerating 
        ? `<div style="color:#ef4444; font-size:13px; font-weight:bold; text-align:center; padding:8px; background:rgba(239,68,68,0.15); border-radius:8px; border:1px solid rgba(239,68,68,0.3);">⚠️ 检测到当前楼层正在生成，强行保存将覆盖新内容！</div>` 
        : '';

    // 🌟 时光机右上角按钮（角标计数）
    const historyBtnUI = hasHistory 
        ? `<div id="tank-history-btn" title="查看历史版本" style="position:absolute; top:15px; right:15px; cursor:pointer; width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:transparent; border:none;
 color:var(--SmartThemeEmColor); border-radius:10px; font-size:16px; z-index:100; transition:all 0.2s; user-select:none;"> <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:relative; left:1px; top:1px;"><polyline points="3 4 3 9 8 9"></polyline><path d="M4.5 15a8 8 0 1 0 2-11.5L3 9"></path><line x1="12" y1="8" x2="12" y2="12.5"></line><line x1="12" y1="12.5" x2="15" y2="15"></line></svg>
<span style="position:absolute; top:-5px; right:-5px; min-width:16px; height:16px; padding:0 4px; background:var(--SmartThemeEmColor); color:var(--SmartThemeBlurTintColor); border-radius:8px; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; border:1.5px solid var(--SmartThemeBlurTintColor);">${historyArr.length}</span></div>` 
        : '';

    // 🧹 扫把按钮：有历史按钮时排在它左边，没有时自己站到最右上角
    const broomRight = hasHistory ? 59 : 15;
    const broomBtnUI = isError ? '' : `<div id="tank-clear-btn" title="清空编辑框（不会保存）" style="position:absolute; top:15px; right:${broomRight}px; cursor:pointer; width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; color:var(--SmartThemeEmColor); border-radius:10px; z-index:100; transition:all 0.2s; user-select:none;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="position:relative; top:-1px;"><path d="M18.2 4L15.4 10.4"/><path d="M11.2 12.7C12.2 8.4 19 10.3 18.2 14.6Z"/><path d="M11.2 12.7Q8.8 15.1 5.8 16.9Q11.2 19.6 16.4 20.1Q18.6 17.7 18.2 14.6"/><path d="M10.1 18.7L11.7 16.3M13.5 19.6L15 17.2"/><path fill="currentColor" stroke="none" d="M9 3.9Q9.7 5.4 11.2 6.1Q9.7 6.8 9 8.3Q8.3 6.8 6.8 6.1Q8.3 5.4 9 3.9ZM6.25 8.3Q6.72 9.28 7.7 9.75Q6.72 10.22 6.25 11.2Q5.78 10.22 4.8 9.75Q5.78 9.28 6.25 8.3Z"/></svg></div>`;

    const $mask = $(`

        <div id="ultra-surgery-mask" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;">
            <div style="position:relative; width:90%; max-width:500px; background:var(--SmartThemeBlurTintColor); border:2px solid var(--SmartThemeBorderColor); border-radius:15px; backdrop-filter:blur(10px); padding:20px; box-shadow:0 10px 40px var(--black50a); display:flex; flex-direction:column; gap:15px;">
                
                ${historyBtnUI}
                ${broomBtnUI}

                <div style="font-size:13px; font-weight:bold; opacity:0.7;color:var(--SmartThemeEmColor);">💌 Nuyoah | 第 ${mesid} 楼</div>
                ${warningUI}
                <textarea id="st-tank-editor" style="width:100%; background:var(--SmartThemeBlurTintColor); color:var(--SmartThemeBodyColor); border:1px solid var(--SmartThemeBorderColor); border-radius:8px; padding:12px; font-size:14px; line-height:1.6; outline:none; resize:none; font-family:inherit;">
${escapeHtml(rawResultText)}</textarea>
                
                <div id="tank-btn-group" style="display:flex; justify-content:center; gap:30px; margin-top:5px;">
                    ${isError ? '' : '<button id="tank-save-btn" style="background:transparent; color:#4ade80; border:none; padding:8px 28px; border-radius:8px; cursor:pointer; font-weight:bold; font-size:16px; box-shadow:none; min-width:90px;">确认</button>'}
                    <button id="tank-cancel-btn" style="background:transparent; color:var(--SmartThemeBodyColor); opacity:0.7; border:1px solid var(--SmartThemeBorderColor); padding:8px 28px; border-radius:8px; cursor:pointer; font-weight:bold; min-width:90px;">取消</button>
                </div>
            </div>
        </div>
    `).appendTo(window.parent.document.body);

    const $editor = $mask.find('#st-tank-editor');

    // 🌟 时光机点击逻辑：L2 列表（搜索）+ L3 详情（Diff 荧光笔）
    if (hasHistory) {
        // ====== 助手函数 ======
        function _countMatches(text, query) {
            if (!query) return 0;
            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            let count = 0, pos = 0;
            while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) { count++; pos += lowerQuery.length; }
            return count;
        }

        function _renderMatchedSummary(versionText, query) {
            const lowerText = versionText.toLowerCase();
            const lowerQuery = query.toLowerCase();
            const idx = lowerText.indexOf(lowerQuery);
            if (idx === -1) return '';
            
            // 👑 修复虫洞3：精准控制前后视距！前截 15，后截 30，组成完美 50 字护盾！
            const startPos = Math.max(0, idx - 15);
            // 🚨 加上被那个呆子遗忘的“后半身铡刀”！限制最多往后取 query长度 + 30个字
            const endPos = Math.min(versionText.length, idx + query.length + 30); 
            
            const prefix = startPos > 0 ? '... ' : '';
            const suffix = endPos < versionText.length ? ' ...' : ''; // 尾部也有优雅的省略号了！
            
            // 完美截取，绝不多给！防撑爆 UI！
            const fromMatch = versionText.substring(startPos, endPos);      // 物理原文截取
            const lowerFromMatch = lowerText.substring(startPos, endPos);   // 小写探针截取
            
            let html = prefix, pos = 0;
            while (true) {
                // 用小写探针寻找坐标
                const found = lowerFromMatch.indexOf(lowerQuery, pos);
                if (found === -1) { 
                    html += escapeHtml(fromMatch.substring(pos)) + suffix; // 🚨 别忘了加上尾部省略号 
                    break; 
                }
                
                html += escapeHtml(fromMatch.substring(pos, found));
                // 巧妙利用 found 索引截取物理原文，完美保留原文的真实大小写视觉格式！
                html += `<mark>${escapeHtml(fromMatch.substring(found, found + query.length))}</mark>`;
                pos = found + query.length;
            }
            return html;
        }

// ====== 注入样式（v3 极客版 CSS）======
        if (!$parentDoc.find('#tank-timemachine-css').length) {
            $parentDoc.find('head').append(`
                <style id="tank-timemachine-css">
                    .icon-btn { background:transparent; border:none; width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; cursor:pointer; color:var(--SmartThemeBodyColor); opacity:0.65; transition:all 0.2s; padding:0; }
                    .icon-btn:hover, .icon-btn.is-active { opacity:1; }
                    .icon-btn:hover > svg { filter: drop-shadow(0 0 4px color-mix(in srgb, var(--SmartThemeBodyColor) 60%, transparent)); }
                    .icon-btn.is-active > svg { filter: drop-shadow(0 0 6px var(--SmartThemeEmColor)); color:var(--SmartThemeEmColor); }
                    .icon-btn.is-danger:hover > svg { filter: drop-shadow(0 0 6px rgba(239,68,68,0.8)); color:#ef4444; }
                    .icon-btn svg { display:block; transition:all 0.2s; }
                    
                    .small-circle { width:12px; height:12px; border-radius:50%; border:none; transition:background-color 1.2s ease-in-out; background:color-mix(in srgb, var(--SmartThemeBodyColor) 35%, transparent); animation:breathe-glow-off 3s ease-in-out infinite; }
                    .icon-btn.is-active .small-circle { background:var(--SmartThemeEmColor); animation:breathe-glow-on 2.5s ease-in-out infinite; }
                    @keyframes breathe-glow-on { 0%, 100% { box-shadow:0 0 4px color-mix(in srgb, var(--SmartThemeEmColor) 30%, transparent); } 50% { box-shadow:0 0 12px color-mix(in srgb, var(--SmartThemeEmColor) 75%, transparent); } }
                    @keyframes breathe-glow-off { 0%, 100% { box-shadow:0 0 2px color-mix(in srgb, var(--SmartThemeBodyColor) 10%, transparent); } 50% { box-shadow:0 0 8px color-mix(in srgb, var(--SmartThemeBodyColor) 40%, transparent); } }

                    .geek-search { padding:0 14px; overflow:hidden; max-height:0; opacity:0; transition:max-height 0.3s ease, opacity 0.25s ease, padding 0.3s ease; }
                    .geek-search.is-open { max-height:80px; opacity:1; padding:8px 14px 10px; }
                    .geek-search-row { display:flex; align-items:center; gap:8px; }
                    .geek-input-wrap { flex:1; position:relative; min-width:0; }
                    .geek-search-input { width:100%; background:color-mix(in srgb, var(--SmartThemeBodyColor) 8%, transparent); border:1px solid var(--SmartThemeBorderColor); border-radius:50px; padding:6px 60px 6px 14px; color:var(--SmartThemeBodyColor); font-size:13px; outline:none; font-family:inherit; transition:border-color 0.3s, box-shadow 0.6s ease; }
                    .geek-search-input:focus { border-color:var(--SmartThemeEmColor); animation:breathe-glow-on 2.2s ease-in-out infinite; }
                    .geek-search-input::placeholder { color:var(--SmartThemeBodyColor); opacity:0.4; }
                    .geek-count { position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:11px; color:var(--SmartThemeBodyColor); opacity:0.6; pointer-events:none; }
                    .geek-count b { color:var(--SmartThemeEmColor); opacity:1; font-weight:600; }
                    .geek-nav { display:flex; align-items:center; gap:0; background:color-mix(in srgb, var(--SmartThemeBodyColor) 5%, transparent); border:1px solid var(--SmartThemeBorderColor); border-radius:50px; padding:2px; }
                    .geek-nav .icon-btn { width:26px; height:26px; border-radius:50%; }

                    .l2-topbar { display:flex; align-items:center; justify-content:space-between; padding-bottom:6px; }
                    .back-text-btn { background:transparent; border:none; color:var(--SmartThemeBodyColor); opacity:0.6; cursor:pointer; font-size:13px; padding:4px 6px; font-family:inherit; display:inline-flex; align-items:center; gap:4px; }
                    .back-text-btn:hover { opacity:1; }
                    .l2-title-center { font-size:15px; font-weight:600; color:var(--SmartThemeBodyColor); }
                    .search-wrap { position:relative; margin-bottom:10px; }
                    .search-wrap::before { content:''; position:absolute; left:11px; top:50%; transform:translateY(-50%); width:14px; height:14px; background:currentColor; -webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>") center/contain no-repeat; opacity:0.5; pointer-events:none; }
                    .search-input { width:100%; background:color-mix(in srgb, var(--SmartThemeBodyColor) 8%, transparent); border:1px solid var(--SmartThemeBorderColor); border-radius:10px; padding:10px 12px 10px 34px; color:var(--SmartThemeBodyColor); font-size:14px; outline:none; transition:all 0.3s; }
                    .search-input:focus { border-color:var(--SmartThemeEmColor); animation:breathe-glow-on 2.2s ease-in-out infinite; }
                    .card-list { display:flex; flex-direction:column; gap:10px; max-height:360px; overflow-y:auto; padding-right:2px; }
                    .history-card { position:relative; background:color-mix(in srgb, var(--SmartThemeBodyColor) 4%, transparent); border:1px solid var(--SmartThemeBorderColor); border-radius:12px; padding:12px 14px 12px 46px; color:var(--SmartThemeBodyColor); cursor:pointer; transition:all 0.2s; }
                    .history-card:hover { background:color-mix(in srgb, var(--SmartThemeEmColor) 10%, transparent); border-color:var(--SmartThemeEmColor); transform:translateX(2px); }
                    .version-badge { position:absolute; left:12px; top:14px; width:24px; height:24px; border-radius:50%; background:var(--SmartThemeEmColor); color:var(--SmartThemeBlurTintColor); font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px color-mix(in srgb, var(--SmartThemeEmColor) 40%, transparent); }
                    .version-badge.v2 { opacity:0.65; box-shadow:0 2px 4px color-mix(in srgb, var(--SmartThemeEmColor) 22%, transparent); }
                    .version-badge.v3 { opacity:0.4; box-shadow:none; }
                    .card-timestamp { display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:5px; }
                    .relative-time { color:var(--SmartThemeEmColor); font-weight:600; }
                    .absolute-time { color:var(--SmartThemeBodyColor); opacity:0.5; font-size:11px; }
                    .match-count { margin-left:auto; color:var(--SmartThemeEmColor); font-size:11px; font-weight:600; padding:1px 7px; border-radius:999px; background:color-mix(in srgb, var(--SmartThemeEmColor) 18%, transparent); }
                    .card-summary { font-size:13px; line-height:1.65; word-break:break-word; max-height:calc(1.65em * 3); overflow:hidden; }
                    .card-summary mark { background:color-mix(in srgb, var(--SmartThemeEmColor) 50%, transparent); color:var(--SmartThemeBodyColor); border-radius:3px; padding:0 2px; font-weight:600; }

                    .l3-shell { display:flex; flex-direction:column; width:100%; }
                    .l3-header { display:flex; align-items:center; justify-content:space-between; padding:0 0 10px 0; border-bottom:1px solid var(--SmartThemeBorderColor); gap:10px; }
                    .l3-meta { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
                    .l3-meta .floor-info { color:var(--SmartThemeBodyColor); opacity:0.5; font-size:11px; }
                    .l3-tools { display:flex; align-items:center; gap:2px; }
                    .l3-subbar { display:flex; align-items:center; justify-content:space-between; padding:8px 0; gap:8px; }
                    .l3-mode-tag { font-size:11px; color:var(--SmartThemeBodyColor); opacity:0.55; }
                    .l3-mode-tag b { color:var(--SmartThemeEmColor); opacity:1; font-weight:600; }
                    
                    .l3-content { background:color-mix(in srgb, var(--SmartThemeBodyColor) 4%, transparent); border-radius:10px; padding:14px; font-size:13.5px; line-height:1.75; max-height:240px; overflow-y:auto; word-break:break-word; color:var(--SmartThemeBodyColor); margin-bottom:12px; }
                    .l3-content.raw-mode { font-family: "SF Mono", "Menlo", "Consolas", monospace; white-space:pre-wrap; }
                    
                    /* 👑 解决问题1：全新的块级 Diff 样式，绝不破坏排版！ */
                    .l3-content .diff-paragraph { display:block; background:color-mix(in srgb, var(--SmartThemeEmColor) 14%, transparent); border-left:3px solid color-mix(in srgb, var(--SmartThemeEmColor) 60%, transparent); border-radius:0 6px 6px 0; padding:6px 10px; margin:4px -10px; }
                    .l3-content .diff-paragraph .diff-tag { display:inline-block; font-size:10px; padding:1px 6px; background:var(--SmartThemeEmColor); color:var(--SmartThemeBlurTintColor); border-radius:999px; margin-right:6px; font-weight:700; vertical-align:middle; letter-spacing:1px; }
                    /* 闭灯状态下隐藏 Diff */
                    .l3-content.no-highlight .diff-paragraph { background:transparent; border:none; padding:0; margin:0; }
                    .l3-content.no-highlight .diff-tag { display:none; }
                    
                    .l3-content .search-match { background:color-mix(in srgb, var(--SmartThemeEmColor) 55%, transparent); color:var(--SmartThemeBodyColor); border-radius:3px; padding:0 2px; font-weight:600; }
                    .l3-content .search-match.current { background:var(--SmartThemeEmColor); color:var(--SmartThemeBlurTintColor); box-shadow:0 0 8px color-mix(in srgb, var(--SmartThemeEmColor) 60%, transparent); outline:1px solid var(--SmartThemeEmColor); }

                    .card-list::-webkit-scrollbar, .l3-content::-webkit-scrollbar { width: 4px; }
                    .card-list::-webkit-scrollbar-thumb, .l3-content::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--SmartThemeBodyColor) 15%, transparent); border-radius: 2px; }
                </style>
            `);
        }

// ====== L3：详情预览（方案B：逐块隔离渲染 + 字词级精准高亮 + 改动跳转/仅看改动） ======
        function _showDetailView(snapIdx, passedSearchQuery = '') {
            const snap = historyArr[snapIdx];
            if (!snap) return;
            const oldText = snap.text || '';

            const curMsg = getMessageObj(mesid);
            const curText = curMsg ? (curMsg.mes || rawText) : rawText;

            const versionLabel = snapIdx === 0 ? '最近一次保存' : (snapIdx === 1 ? '上次保存前' : '最早一次');
            const parentDoc = window.parent.document;

            // 单独渲染单块 Markdown/HTML（各块完全隔离，彻底杜绝跨行标签/正则吞噬全楼）
            function _renderMd(mdText) {
                if (!mdText) return '';
                try {
                    if (window.parent.SillyTavern && window.parent.SillyTavern.getContext) {
                        const ctx = window.parent.SillyTavern.getContext();
                        if (typeof ctx.messageFormatting === 'function') {
                            return ctx.messageFormatting(mdText, 'Character', false, false, mesid);
                        }
                    } else if (typeof window.parent.messageFormatting === 'function') {
                        return window.parent.messageFormatting(mdText, 'Character', false, false, mesid);
                    }
                } catch (e) {}
                return escapeHtml(mdText).replace(/\n/g, '<br>');
            }

            // 1. 智能切段：兼容 \r\n 及单行 <br> 排版，避免改一字炸整楼
            function _splitDiffUnits(text) {
                const lines = (text || '').replace(/\r\n?/g, '\n').split('\n');
                const units = [];
                let inCodeBlock = false;

                for (let idx = 0; idx < lines.length; idx++) {
                    const line = lines[idx];
                    const isLastLine = idx === lines.length - 1;
                    const trimmed = line.trim();

                    if (trimmed.startsWith('```')) {
                        inCodeBlock = !inCodeBlock;
                        if (trimmed.length >= 6 && trimmed.indexOf('```', 3) !== -1) inCodeBlock = !inCodeBlock;
                    }

                    if (!inCodeBlock && /<br\s*\/?>/i.test(line)) {
                        const parts = line.split(/((?:<br\s*\/?>)+)/i);
                        const subUnits = [];
                        let buf = '';
                        for (let p = 0; p < parts.length; p++) {
                            buf += parts[p];
                            if (p % 2 === 1) {
                                subUnits.push(buf);
                                buf = '';
                            }
                        }
                        if (buf) subUnits.push(buf);

                        for (let s = 0; s < subUnits.length; s++) {
                            const isLastSub = s === subUnits.length - 1;
                            units.push({ text: subUnits[s], sep: (isLastSub && !isLastLine) ? '\n' : '' });
                        }
                    } else {
                        units.push({ text: line, sep: isLastLine ? '' : '\n' });
                    }
                }
                return units;
            }

            // 2. 块级 LCS 对齐（先裁剪首尾相同块，极大提速）
            function _buildDiffOps(oldT, curT) {
                const oldUnits = _splitDiffUnits(oldT);
                const curUnits = _splitDiffUnits(curT);

                const unitEq = (a, b) => {
                    const ta = a.text.trim(), tb = b.text.trim();
                    if (ta !== '' || tb !== '') return ta === tb;
                    return a.text === b.text;
                };

                let pre = 0;
                const minLen = Math.min(oldUnits.length, curUnits.length);
                while (pre < minLen && unitEq(oldUnits[pre], curUnits[pre])) pre++;

                let eo = oldUnits.length - 1;
                let ec = curUnits.length - 1;
                while (eo >= pre && ec >= pre && unitEq(oldUnits[eo], curUnits[ec])) { eo--; ec--; }

                const midOld = oldUnits.slice(pre, eo + 1);
                const midCur = curUnits.slice(pre, ec + 1);

                const diffItems = [];
                for (let k = 0; k < pre; k++) diffItems.push({ type: 'same', unit: oldUnits[k] });

                if (midOld.length === 0) {
                    midCur.forEach(u => diffItems.push({ type: 'add', unit: u }));
                } else if (midCur.length === 0) {
                    midOld.forEach(u => diffItems.push({ type: 'del', unit: u }));
                } else if (midOld.length * midCur.length > 400000) {
                    midOld.forEach(u => diffItems.push({ type: 'del', unit: u }));
                    midCur.forEach(u => diffItems.push({ type: 'add', unit: u }));
                } else {
                    const m = midOld.length, n = midCur.length;
                    const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
                    for (let i = 1; i <= m; i++) {
                        for (let j = 1; j <= n; j++) {
                            if (unitEq(midOld[i - 1], midCur[j - 1])) lcs[i][j] = lcs[i - 1][j - 1] + 1;
                            else lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
                        }
                    }
                    const midDiff = [];
                    let i = m, j = n;
                    while (i > 0 || j > 0) {
                        if (i > 0 && j > 0 && unitEq(midOld[i - 1], midCur[j - 1])) {
                            midDiff.unshift({ type: 'same', unit: midOld[i - 1] }); i--; j--;
                        } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
                            midDiff.unshift({ type: 'add', unit: midCur[j - 1] }); j--;
                        } else {
                            midDiff.unshift({ type: 'del', unit: midOld[i - 1] }); i--;
                        }
                    }
                    diffItems.push(...midDiff);
                }

                for (let k = eo + 1; k < oldUnits.length; k++) diffItems.push({ type: 'same', unit: oldUnits[k] });

                // 合并为有序块：same / change({ oldText, newText })
                const ops = [];
                let sameBuf = [], delBuf = [], addBuf = [], pendingBlank = [];

                function joinUnits(arr) {
                    let s = '';
                    for (let k = 0; k < arr.length; k++) s += arr[k].text + (k < arr.length - 1 ? arr[k].sep : '');
                    return s;
                }
                function flushSame() {
                    if (sameBuf.length) { ops.push({ type: 'same', text: joinUnits(sameBuf) }); sameBuf = []; }
                }
                function flushChange() {
                    const oText = joinUnits(delBuf);
                    const nText = joinUnits(addBuf);
                    if (oText.trim() || nText.trim()) ops.push({ type: 'change', oldText: oText, newText: nText });
                    delBuf = []; addBuf = [];
                    if (pendingBlank.length) { sameBuf.push(...pendingBlank); pendingBlank = []; }
                }

                for (const item of diffItems) {
                    if (item.type === 'same') {
                        if (delBuf.length || addBuf.length) {
                            if (!item.unit.text.trim()) pendingBlank.push(item.unit);
                            else { flushChange(); sameBuf.push(item.unit); }
                        } else {
                            sameBuf.push(item.unit);
                        }
                    } else if (item.type === 'del') {
                        flushSame();
                        if (addBuf.length) flushChange();
                        else if (pendingBlank.length) { delBuf.push(...pendingBlank); pendingBlank = []; }
                        delBuf.push(item.unit);
                    } else if (item.type === 'add') {
                        flushSame();
                        if (pendingBlank.length) { if (addBuf.length) addBuf.push(...pendingBlank); pendingBlank = []; }
                        addBuf.push(item.unit);
                    }
                }
                flushChange();
                flushSame();
                return ops;
            }

            // 3. 段内字词级 Diff（中文按字、英文按词、Emoji 不截断）
            function _tokenizeText(str) {
                const tokens = [];
                const re = /[A-Za-z0-9_]+|\s+|[\s\S]/gu;
                let m;
                while ((m = re.exec(str)) !== null) {
                    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
                }
                return tokens;
            }

            function _mergeRanges(ranges) {
                if (!ranges.length) return [];
                const out = [ranges[0].slice()];
                for (let k = 1; k < ranges.length; k++) {
                    const prev = out[out.length - 1];
                    if (ranges[k][0] <= prev[1]) prev[1] = Math.max(prev[1], ranges[k][1]);
                    else out.push(ranges[k].slice());
                }
                return out;
            }

            function _diffTextRanges(oldStr, newStr) {
                if (!oldStr || !newStr || oldStr === newStr) return { delRanges: [], addRanges: [] };
                const tokA = _tokenizeText(oldStr);
                const tokB = _tokenizeText(newStr);

                let p = 0;
                const minLen = Math.min(tokA.length, tokB.length);
                while (p < minLen && tokA[p].text === tokB[p].text) p++;

                let sa = tokA.length - 1;
                let sb = tokB.length - 1;
                while (sa >= p && sb >= p && tokA[sa].text === tokB[sb].text) { sa--; sb--; }

                const midA = tokA.slice(p, sa + 1);
                const midB = tokB.slice(p, sb + 1);
                if (!midA.length && !midB.length) return { delRanges: [], addRanges: [] };
                if (!midA.length) return { delRanges: [], addRanges: [[midB[0].start, midB[midB.length - 1].end]] };
                if (!midB.length) return { delRanges: [[midA[0].start, midA[midA.length - 1].end]], addRanges: [] };

                if (midA.length * midB.length > 250000) {
                    return {
                        delRanges: [[midA[0].start, midA[midA.length - 1].end]],
                        addRanges: [[midB[0].start, midB[midB.length - 1].end]]
                    };
                }

                const m = midA.length, n = midB.length;
                const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
                for (let i = 1; i <= m; i++) {
                    for (let j = 1; j <= n; j++) {
                        if (midA[i - 1].text === midB[j - 1].text) dp[i][j] = dp[i - 1][j - 1] + 1;
                        else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                    }
                }

                const delRanges = [], addRanges = [];
                let i = m, j = n;
                while (i > 0 || j > 0) {
                    if (i > 0 && j > 0 && midA[i - 1].text === midB[j - 1].text) {
                        i--; j--;
                    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                        addRanges.unshift([midB[j - 1].start, midB[j - 1].end]); j--;
                    } else {
                        delRanges.unshift([midA[i - 1].start, midA[i - 1].end]); i--;
                    }
                }
                return { delRanges: _mergeRanges(delRanges), addRanges: _mergeRanges(addRanges) };
            }

            // DOM 文本节点精准标红/标绿（不破坏任何 Markdown 加粗、斜体、图片标签）
            function _collectTextNodes(root) {
                const walker = parentDoc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
                const nodes = [];
                let full = '';
                while (walker.nextNode()) {
                    const n = walker.currentNode;
                    const tag = n.parentNode && n.parentNode.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
                    const val = n.nodeValue || '';
                    if (!val) continue;
                    const start = full.length;
                    full += val;
                    nodes.push({ node: n, start, end: full.length });
                }
                return { nodes, full };
            }

            function _applyDomRanges(nodes, ranges, cls) {
                if (!ranges.length) return;
                for (const item of nodes) {
                    const hits = ranges.filter(([rs, re]) => re > item.start && rs < item.end);
                    if (!hits.length) continue;
                    const text = item.node.nodeValue;
                    const frag = parentDoc.createDocumentFragment();
                    let localPos = 0;
                    for (const [rs, re] of hits) {
                        const s = Math.max(0, rs - item.start);
                        const e = Math.min(text.length, re - item.start);
                        if (s > localPos) frag.appendChild(parentDoc.createTextNode(text.substring(localPos, s)));
                        const span = parentDoc.createElement('span');
                        span.className = cls;
                        span.textContent = text.substring(s, e);
                        frag.appendChild(span);
                        localPos = e;
                    }
                    if (localPos < text.length) frag.appendChild(parentDoc.createTextNode(text.substring(localPos)));
                    if (item.node.parentNode) item.node.parentNode.replaceChild(frag, item.node);
                }
            }

            function _renderHighlightedRaw(str, ranges, cls) {
                if (!ranges.length) return escapeHtml(str);
                let out = '', pos = 0;
                for (const [s, e] of ranges) {
                    if (s > pos) out += escapeHtml(str.substring(pos, s));
                    out += `<span class="${cls}">${escapeHtml(str.substring(s, e))}</span>`;
                    pos = e;
                }
                if (pos < str.length) out += escapeHtml(str.substring(pos));
                return out;
            }

            // 4. 组装四份视图 HTML：Preview对比 / Raw对比 / Preview纯净历史 / Raw纯净历史
            const diffOps = _buildDiffOps(oldText, curText);
            const previewParts = [];
            const rawParts = [];

            for (const op of diffOps) {
                if (op.type === 'same') {
                    const cleanSame = op.text.replace(/^\n+|\n+$/g, '');
                    if (!cleanSame.trim()) continue;
                    previewParts.push(`<div class="diff-same-block">${_renderMd(cleanSame)}</div>`);
                    rawParts.push(`<div class="diff-same-block">${escapeHtml(cleanSame)}</div>`);
                } else {
                    const cleanOld = op.oldText.replace(/^\n+|\n+$/g, '');
                    const cleanNew = op.newText.replace(/^\n+|\n+$/g, '');
                    const hasOld = !!cleanOld.trim();
                    const hasNew = !!cleanNew.trim();

                    // ---- Raw 视图 ----
                    if (hasOld && hasNew) {
                        const { delRanges, addRanges } = _diffTextRanges(cleanOld, cleanNew);
                        rawParts.push(
                            `<div class="diff-card">` +
                            `<div class="diff-row diff-old"><div class="diff-tag"></div><div class="diff-content">${_renderHighlightedRaw(cleanOld, delRanges, 'diff-hl-del')}</div></div>` +
                            `<div class="diff-row diff-new"><div class="diff-tag"></div><div class="diff-content">${_renderHighlightedRaw(cleanNew, addRanges, 'diff-hl-add')}</div></div>` +
                            `</div>`
                        );
                    } else if (hasOld) {
                        rawParts.push(`<div class="diff-card"><div class="diff-row diff-old"><div class="diff-tag"></div><div class="diff-content">${escapeHtml(cleanOld)}</div></div></div>`);
                    } else if (hasNew) {
                        rawParts.push(`<div class="diff-card"><div class="diff-row diff-new"><div class="diff-tag"></div><div class="diff-content">${escapeHtml(cleanNew)}</div></div></div>`);
                    }

                    // ---- Preview 视图（逐块隔离渲染 + 过滤隐形假差异 + DOM 字词级精准高亮） ----
                    const trimTrailingBr = s => s.replace(/(?:<br\s*\/?>\s*)+$/i, '');
                    const oldMdHtml = hasOld ? _renderMd(trimTrailingBr(cleanOld)).trim() : '';
                    const newMdHtml = hasNew ? _renderMd(trimTrailingBr(cleanNew)).trim() : '';

                    if (hasOld && hasNew) {
                        if (oldMdHtml === newMdHtml) {
                            // 仅插件改了不可见源码/注释，视觉渲染完全一致 → 不炸假对比卡片
                            if (oldMdHtml) previewParts.push(`<div class="diff-same-block">${oldMdHtml}</div>`);
                        } else {
                            const divOld = parentDoc.createElement('div');
                            const divNew = parentDoc.createElement('div');
                            divOld.innerHTML = oldMdHtml;
                            divNew.innerHTML = newMdHtml;

                            const oldInfo = _collectTextNodes(divOld);
                            const newInfo = _collectTextNodes(divNew);
                            const { delRanges, addRanges } = _diffTextRanges(oldInfo.full, newInfo.full);

                            _applyDomRanges(oldInfo.nodes, delRanges, 'diff-hl-del');
                            _applyDomRanges(newInfo.nodes, addRanges, 'diff-hl-add');

                            previewParts.push(
                                `<div class="diff-card">` +
                                `<div class="diff-row diff-old"><div class="diff-tag"></div><div class="diff-content">${divOld.innerHTML}</div></div>` +
                                `<div class="diff-row diff-new"><div class="diff-tag"></div><div class="diff-content">${divNew.innerHTML}</div></div>` +
                                `</div>`
                            );
                        }
                    } else if (hasOld) {
                        previewParts.push(`<div class="diff-card"><div class="diff-row diff-old"><div class="diff-tag"></div><div class="diff-content">${oldMdHtml}</div></div></div>`);
                    } else if (hasNew) {
                        previewParts.push(`<div class="diff-card"><div class="diff-row diff-new"><div class="diff-tag"></div><div class="diff-content">${newMdHtml}</div></div></div>`);
                    }
                }
            }

            const diffPreviewHtml = previewParts.join('');
            const diffRawHtml = rawParts.join('\n');
            const pureOldPreviewHtml = _renderMd(oldText);
            const pureOldRawHtml = escapeHtml(oldText);

            const $historyView = $mask.find('#tank-history-view');
            $historyView.hide();

            const $detailView = $(`
                <style>
                    .diff-same-block > :first-child { margin-top: 0; }
                    .diff-same-block > :last-child { margin-bottom: 0; }
                    .diff-same-block + .diff-same-block { margin-top: 6px; }
                    .l3-content.raw-mode .diff-same-block { margin: 0; }
                    .l3-content.only-diff .diff-same-block { display: none !important; }

                    .diff-bar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 10px; margin-bottom:8px; background:color-mix(in srgb, var(--SmartThemeBodyColor) 5%, transparent); border:1px solid var(--SmartThemeBorderColor); border-radius:10px; font-size:12px; }
                    .diff-bar-left { display:flex; align-items:center; gap:6px; min-width:0; }
                    .diff-bar-count { color:var(--SmartThemeBodyColor); opacity:0.75; white-space:nowrap; }
                    .diff-bar-count b { color:var(--SmartThemeEmColor); opacity:1; font-weight:700; }
                    .diff-bar-nav { display:inline-flex; align-items:center; gap:0; background:color-mix(in srgb, var(--SmartThemeBodyColor) 5%, transparent); border:1px solid var(--SmartThemeBorderColor); border-radius:999px; padding:1px; }
                    .diff-bar-nav .icon-btn { width:22px; height:22px; border-radius:50%; }
                    .diff-bar-nav .icon-btn:disabled { opacity:0.25; cursor:not-allowed; }
                    .diff-pill-btn { background:transparent; border:1px solid var(--SmartThemeBorderColor); color:var(--SmartThemeBodyColor); opacity:0.75; font-size:11.5px; padding:3px 9px; border-radius:999px; cursor:pointer; font-family:inherit; transition:all 0.2s; white-space:nowrap; }
                    .diff-pill-btn:hover { opacity:1; border-color:var(--SmartThemeEmColor); }
                    .diff-pill-btn.is-active { opacity:1; background:color-mix(in srgb, var(--SmartThemeEmColor) 18%, transparent); border-color:var(--SmartThemeEmColor); color:var(--SmartThemeEmColor); font-weight:600; }
                    .diff-pill-btn:disabled { opacity:0.3; cursor:not-allowed; }

                    .diff-card { display:flex; flex-direction:column; gap:8px; margin:10px 0; padding:11px 13px; background:var(--SmartThemeBlurTintColor); border:1px solid var(--SmartThemeBorderColor); border-radius:14px; box-shadow:0 4px 14px color-mix(in srgb, var(--SmartThemeBodyColor) 8%, transparent); transition:border-color 0.25s, box-shadow 0.25s; }
                    .diff-card.is-focused { border-color:var(--SmartThemeEmColor); box-shadow:0 0 0 1px var(--SmartThemeEmColor), 0 4px 16px color-mix(in srgb, var(--SmartThemeEmColor) 22%, transparent); }
                    .diff-card .diff-row { display:flex; align-items:flex-start; gap:9px; }
                    .diff-card .diff-tag { flex-shrink:0; font-size:11.5px; font-weight:700; padding:2px 7px; border-radius:6px; line-height:1.5; margin-top:2px; user-select:none; }
                    .diff-card .diff-old .diff-tag { color:#e11d48; background:rgba(225,29,72,0.12); }
                    .diff-card .diff-new .diff-tag { color:#10b981; background:rgba(16,185,129,0.14); }
                    .diff-card .diff-old .diff-tag::before { content:'改前'; }
                    .diff-card .diff-new .diff-tag::before { content:'改后'; }
                    .diff-card .diff-old:only-child .diff-tag::before { content:'已删'; }
                    .diff-card .diff-new:only-child .diff-tag::before { content:'新增'; }
                    .diff-card .diff-content { flex:1; min-width:0; word-break:break-word; }
                    .diff-card .diff-content > :first-child { margin-top:0; }
                    .diff-card .diff-content > :last-child { margin-bottom:0; }

                    /* 改前/改后对比时：未改文字保持清晰可读，仅精准标红/标绿真正变动的字词 */
                    .diff-card .diff-old .diff-content { opacity:0.72; }
                    .diff-card .diff-old:only-child .diff-content { opacity:0.55; text-decoration:line-through; text-decoration-color:rgba(225,29,72,0.65); text-decoration-thickness:1.5px; }
                    .diff-card .diff-new:only-child .diff-content { font-weight:600; }

                    .diff-hl-del { background:rgba(225,29,72,0.16); color:#e11d48; text-decoration:line-through; text-decoration-color:rgba(225,29,72,0.75); text-decoration-thickness:1.5px; border-radius:3px; padding:0 2px; }
                    .diff-hl-add { background:rgba(16,185,129,0.18); color:#10b981; font-weight:700; border-radius:3px; padding:0 2px; }
                </style>
                <div id="tank-detail-view" class="l3-shell">
                    <div class="l3-header">
                        <div class="l3-meta">
                            <span class="relative-time">${versionLabel}</span>
                            <span class="floor-info">第 ${mesid} 楼 · 历史记录 ${snapIdx + 1}</span>
                        </div>
                        <div class="l3-tools">
                            <button id="tank-l3-toggle" class="icon-btn is-active" title="关闭 Preview (显示源码)">
                                <div class="small-circle"></div>
                            </button>
                            <button id="tank-l3-copy" class="icon-btn" title="纯净复制 (仅提取纯净历史版本)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                            <button id="tank-detail-back-btn" class="icon-btn is-danger" title="返回列表">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    </div>

                    <div class="l3-subbar">
                        <span class="l3-mode-tag" id="tank-mode-text">模式：<b>Preview</b></span>
                        <div style="display:flex; align-items:center; gap:2px;">
                            <button id="tank-highlight-toggle" class="icon-btn is-active" title="荧光笔（改前改后对比）">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
                            </button>
                            <button id="tank-search-toggle" class="icon-btn" title="在正文中搜索">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            </button>
                        </div>
                    </div>

                    <div id="tank-diff-bar" class="diff-bar">
                        <div class="diff-bar-left">
                            <span id="tank-diff-count" class="diff-bar-count">共 <b>0</b> 处改动</span>
                            <div class="diff-bar-nav">
                                <button id="tank-diff-prev" class="icon-btn" title="上一处改动"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>
                                <button id="tank-diff-next" class="icon-btn" title="下一处改动"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
                            </div>
                        </div>
                        <button id="tank-only-diff-toggle" class="diff-pill-btn" title="折叠未改动段落，只看改动卡片">仅看改动</button>
                    </div>

                    <div id="tank-geek-search" class="geek-search">
                        <div class="geek-search-row">
                            <div class="geek-input-wrap">
                                <input id="tank-search-input" class="geek-search-input" type="text" placeholder="搜索关键字..." style="padding-right: 85px;" />
                                <div style="position:absolute; right:12px; top:50%; transform:translateY(-50%); display:flex; align-items:center; gap:4px;">
                                    <span class="geek-count" id="tank-search-count" style="position:static; transform:none;"><b>0</b> / 0</span>
                                    <button id="tank-search-clear" class="icon-btn" title="清空" style="display:none; width:22px; height:22px; padding:2px; margin-right:-4px;">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                </div>
                            </div>
                            <div class="geek-nav">
                                <button id="tank-search-prev" class="icon-btn" title="上一个"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>
                                <button id="tank-search-next" class="icon-btn" title="下一个"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
                            </div>
                        </div>
                    </div>

                    <div id="tank-detail-content" class="l3-content">${diffPreviewHtml}</div>

                    <div style="display:flex; justify-content:center; margin-top:4px;">
                        <button id="tank-restore-btn" style="background:transparent; color:#ef4444; border:1px solid rgba(239,68,68,0.5); padding:9px 26px; border-radius:9px; cursor:pointer; font-weight:600; font-size:14px; min-width:96px; transition:all 0.2s;">恢复此历史版本</button>
                    </div>
                </div>
            `).insertAfter($editor);

            let isPreview = true;
            let highlightOn = true;
            let onlyDiff = false;
            let diffCards = [];
            let currentDiffIdx = -1;

            let searchMatches = [];
            let currentMatchIdx = -1;
            const $searchInput = $detailView.find('#tank-search-input');
            const $searchCount = $detailView.find('#tank-search-count');
            const $searchClear = $detailView.find('#tank-search-clear');
            const $content = $detailView.find('#tank-detail-content');
            const $diffBar = $detailView.find('#tank-diff-bar');
            const $diffCount = $detailView.find('#tank-diff-count');
            const $diffPrev = $detailView.find('#tank-diff-prev');
            const $diffNext = $detailView.find('#tank-diff-next');
            const $onlyDiffBtn = $detailView.find('#tank-only-diff-toggle');

            function getCurrentBaseHtml() {
                if (highlightOn) return isPreview ? diffPreviewHtml : diffRawHtml;
                return isPreview ? pureOldPreviewHtml : pureOldRawHtml;
            }

            function refreshDiffBar(resetFocus = false) {
                if (resetFocus) currentDiffIdx = -1;
                if (!highlightOn) {
                    $diffBar.hide();
                    $content.removeClass('only-diff');
                    diffCards = [];
                    return;
                }
                $diffBar.css('display', 'flex');
                diffCards = $content.find('.diff-card').toArray();
                const total = diffCards.length;

                if (total === 0) {
                    $diffCount.html('与当前版本无差异');
                    $diffPrev.prop('disabled', true);
                    $diffNext.prop('disabled', true);
                    $onlyDiffBtn.prop('disabled', true).removeClass('is-active');
                    $content.removeClass('only-diff');
                } else {
                    $diffPrev.prop('disabled', false);
                    $diffNext.prop('disabled', false);
                    $onlyDiffBtn.prop('disabled', false).toggleClass('is-active', onlyDiff);
                    $content.toggleClass('only-diff', onlyDiff);
                    if (currentDiffIdx >= 0 && currentDiffIdx < total) {
                        $diffCount.html(`<b>${currentDiffIdx + 1}</b> / ${total} 处改动`);
                        $(diffCards[currentDiffIdx]).addClass('is-focused');
                    } else {
                        $diffCount.html(`共 <b>${total}</b> 处改动`);
                    }
                }
            }

            function jumpToDiff(idx) {
                if (!diffCards.length) return;
                currentDiffIdx = (idx + diffCards.length) % diffCards.length;
                $content.find('.diff-card').removeClass('is-focused');
                const card = diffCards[currentDiffIdx];
                $(card).addClass('is-focused');
                let p = card.parentNode;
                while (p && p !== $content[0]) {
                    if (p.tagName === 'DETAILS' && !p.open) p.open = true;
                    p = p.parentNode;
                }
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                $diffCount.html(`<b>${currentDiffIdx + 1}</b> / ${diffCards.length} 处改动`);
            }

            function renderCurrentView() {
                $content.toggleClass('raw-mode', !isPreview).html(getCurrentBaseHtml());
                refreshDiffBar(true);
                if ($searchInput.val()) $searchInput.trigger('input');
            }

            refreshDiffBar(true);

            // 改动上下跳转 & 仅看改动开关
            $diffNext.on('click', (e) => {
                e.stopPropagation();
                if (!diffCards.length) return;
                jumpToDiff(currentDiffIdx < 0 ? 0 : currentDiffIdx + 1);
            });
            $diffPrev.on('click', (e) => {
                e.stopPropagation();
                if (!diffCards.length) return;
                jumpToDiff(currentDiffIdx < 0 ? diffCards.length - 1 : currentDiffIdx - 1);
            });
            $onlyDiffBtn.on('click', (e) => {
                e.stopPropagation();
                if (!diffCards.length) return;
                onlyDiff = !onlyDiff;
                $onlyDiffBtn.toggleClass('is-active', onlyDiff);
                $content.toggleClass('only-diff', onlyDiff);
                if ($searchInput.val()) $searchInput.trigger('input');
            });

            // Preview / Raw 切换
            $detailView.find('#tank-l3-toggle').on('click', function(e) {
                e.stopPropagation();
                isPreview = !isPreview;
                $(this).toggleClass('is-active', isPreview);
                $detailView.find('#tank-mode-text').html(isPreview ? '模式：<b>Preview</b>' : '模式：<b>Raw Text</b>');
                clearSearch();
                renderCurrentView();
            });

            // 🖍️ 荧光笔开关：开灯=新旧对比卡片，关灯=纯净历史版本
            $detailView.find('#tank-highlight-toggle').on('click', function(e) {
                e.stopPropagation();
                highlightOn = !highlightOn;
                $(this).toggleClass('is-active', highlightOn);
                clearSearch();
                renderCurrentView();
            });

            // 👑 复制按钮（提取纯净历史版本）
            $detailView.find('#tank-l3-copy').on('click', async function(e) {
                e.stopPropagation();
                const $btn = $(this);
                const $svg = $btn.find('svg');
                let textToCopy = '';

                if (isPreview) {
                    const temp = parentDoc.createElement('div');
                    temp.innerHTML = pureOldPreviewHtml;
                    const detailNodes = temp.querySelectorAll('details');
                    for (let i = 0; i < detailNodes.length; i++) detailNodes[i].open = true;
                    temp.style.cssText = 'position:fixed;left:-99999px;top:0;';
                    parentDoc.body.appendChild(temp);
                    textToCopy = temp.innerText || temp.textContent || oldText;
                    parentDoc.body.removeChild(temp);
                } else {
                    textToCopy = oldText;
                }

                let success = false;
                const isSecure = window.parent.isSecureContext || window.isSecureContext || false;
                const hasModernApi = !!(window.parent.navigator && window.parent.navigator.clipboard && window.parent.navigator.clipboard.writeText);

                const ta = parentDoc.createElement('textarea');
                ta.value = textToCopy;
                ta.readOnly = true;
                ta.style.cssText = 'position:fixed;top:0;left:-9999px;';
                parentDoc.body.appendChild(ta);
                ta.focus();
                ta.setSelectionRange(0, textToCopy.length);
                try { success = parentDoc.execCommand('copy'); } catch (err) {}
                parentDoc.body.removeChild(ta);

                if (!success && isSecure && hasModernApi) {
                    try {
                        await window.parent.navigator.clipboard.writeText(textToCopy);
                        success = true;
                    } catch (e) {}
                }

                $svg.css('color', success ? '#10b981' : '#ef4444');
                clearTimeout($btn.data('color-timer'));
                const timer = setTimeout(() => $svg.css('color', ''), 800);
                $btn.data('color-timer', timer);
            });

            function clearSearch() {
                searchMatches = [];
                currentMatchIdx = -1;
                $searchCount.html('<b>0</b> / 0');
                $searchClear.hide();
                $content.html(getCurrentBaseHtml());
                refreshDiffBar(false);
            }

            $searchClear.on('click', function(e) {
                e.stopPropagation();
                $searchInput.val('');
                clearSearch();
                $searchInput.focus();
            });

            function updateSearchNav() {
                $content.find('.search-match').removeClass('current');
                if (currentMatchIdx >= 0 && currentMatchIdx < searchMatches.length) {
                    const el = searchMatches[currentMatchIdx];
                    $(el).addClass('current');
                    let p = el.parentNode;
                    while (p && p !== $content[0]) {
                        if (p.tagName === 'DETAILS' && !p.open) p.open = true;
                        p = p.parentNode;
                    }
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    $searchCount.html(`<b>${currentMatchIdx + 1}</b> / ${searchMatches.length}`);
                }
            }

            // 👑 终极 X 光搜索引擎（自动适配仅看改动 / 关灯模式）
            $searchInput.on('input', function() {
                const query = $(this).val();
                if (!query) { clearSearch(); return; }

                $searchClear.css('display', 'flex');
                $content.html(getCurrentBaseHtml());
                refreshDiffBar(false);

                const lowerQuery = query.toLowerCase();
                const qLen = query.length;
                const targetDoc = $content[0].ownerDocument || parentDoc;
                const walker = targetDoc.createTreeWalker($content[0], NodeFilter.SHOW_TEXT, null, false);
                const textNodes = [];
                while (walker.nextNode()) textNodes.push(walker.currentNode);

                textNodes.forEach(node => {
                    const text = node.nodeValue;
                    if (!text || !text.trim()) return;
                    const pNode = node.parentNode;
                    if (pNode && pNode.classList && pNode.classList.contains('diff-tag')) return;
                    if (highlightOn && onlyDiff && pNode && pNode.closest && pNode.closest('.diff-same-block')) return;

                    const lowerText = text.toLowerCase();
                    let idx = lowerText.indexOf(lowerQuery);
                    if (idx !== -1) {
                        const frag = targetDoc.createDocumentFragment();
                        let lastIdx = 0;
                        while (idx !== -1) {
                            frag.appendChild(targetDoc.createTextNode(text.substring(lastIdx, idx)));
                            const span = targetDoc.createElement('span');
                            span.className = 'search-match';
                            span.textContent = text.substring(idx, idx + qLen);
                            frag.appendChild(span);
                            lastIdx = idx + qLen;
                            idx = lowerText.indexOf(lowerQuery, lastIdx);
                        }
                        frag.appendChild(targetDoc.createTextNode(text.substring(lastIdx)));
                        pNode.replaceChild(frag, node);
                    }
                });

                searchMatches = $content.find('.search-match').toArray();
                if (searchMatches.length > 0) { currentMatchIdx = 0; updateSearchNav(); }
                else { currentMatchIdx = -1; $searchCount.html('<b>0</b> / 0'); }
            });

            $detailView.find('#tank-search-next').on('click', () => {
                if (!searchMatches.length) return;
                currentMatchIdx = (currentMatchIdx + 1) % searchMatches.length;
                updateSearchNav();
            });
            $detailView.find('#tank-search-prev').on('click', () => {
                if (!searchMatches.length) return;
                currentMatchIdx = (currentMatchIdx - 1 + searchMatches.length) % searchMatches.length;
                updateSearchNav();
            });

            $searchInput.on('keydown', function(e) {
                if (e.isComposing || e.keyCode === 229) return;
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    if (e.shiftKey) $detailView.find('#tank-search-prev').click();
                    else $detailView.find('#tank-search-next').click();
                }
            });

            $detailView.find('#tank-search-toggle').on('click', function(e) {
                e.stopPropagation();
                $(this).toggleClass('is-active');
                const $wrap = $detailView.find('#tank-geek-search');
                if ($(this).hasClass('is-active')) {
                    $wrap.addClass('is-open');
                    setTimeout(() => $searchInput.focus(), 300);
                } else {
                    $wrap.removeClass('is-open');
                    $searchInput.val('');
                    clearSearch();
                }
            });

            if (passedSearchQuery) {
                $detailView.find('#tank-geek-search').addClass('is-open');
                $detailView.find('#tank-search-toggle').addClass('is-active');
                $searchInput.val(passedSearchQuery);
                setTimeout(() => $searchInput.trigger('input'), 50);
            }

            $detailView.find('#tank-detail-back-btn').on('click', () => {
                $detailView.remove();
                $historyView.show();
            });

            $detailView.find('#tank-restore-btn').on('click', async () => {
                const proceed = window.parent.confirm(`⚠️ 即将把当前楼层覆盖为此版本（${versionLabel}）！\n\n确认恢复？`);
                if (!proceed) return;

                const targetMsg = getMessageObj(mesid);
                if (!targetMsg) { window.parent.alert('❌ 系统底层找不到该消息！'); $mask.remove(); return; }

                // 💾 恢复前先把"当前状态"也快照进栈，给用户留反悔余地
                window.nuyoahTimeMachine = window.nuyoahTimeMachine || new Map();
                const _arr = window.nuyoahTimeMachine.get(chatKey) || [];
                _arr.unshift({ text: targetMsg.mes, time: Date.now() });
                if (_arr.length > 3) _arr.length = 3;
                window.nuyoahTimeMachine.set(chatKey, _arr);

                await applyMessageUpdate(mesid, oldText, $parentDoc.find('#chat').scrollTop());
                $mask.remove();
                window.parent.alert(`✨ 已恢复到「${versionLabel}」！`);
            });
        }

// ====== L2：历史列表（带一键关闭与联动搜索） ======
        function _showHistoryView() {
            $editor.hide();
            $mask.find('#tank-btn-group').hide();

            $mask.find('#tank-history-btn, #tank-clear-btn').hide();

            const $historyView = $(`
                <div id="tank-history-view" class="l3-shell" style="gap:8px;">
                    <div class="l2-topbar">
                        <button id="tank-history-back" class="back-text-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>返回编辑
                        </button>
                        <span class="l2-title-center"> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4.5px; margin-right:4px;"><polyline points="3 4 3 9 8 9"></polyline><path d="M4.5 15a8 8 0 1 0 2-11.5L3 9"></path><line x1="12" y1="8" x2="12" y2="12.5"></line><line x1="12" y1="12.5" x2="15" y2="15"></line></svg>
历史版本</span>
                        <!-- 👑 修复问题5：新增的超快捷一键关闭弹窗 ❌ -->
                        <button id="tank-history-close" class="icon-btn is-danger" title="关闭弹窗" style="width:26px; height:26px; padding:3px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    <div class="search-wrap">
                        <input id="tank-search" class="search-input" type="text" placeholder="搜索此贴历史版本记录..." />
                    </div>
                    <div id="tank-card-list" class="card-list"></div>
                </div>
            `).insertAfter($editor);

            const $list = $historyView.find('#tank-card-list');
            const $search = $historyView.find('#tank-search');

            function _renderCards(query) {
                $list.empty();
                const q = (query || '').trim();
                let visibleCount = 0;
                const totalCount = historyArr.length;

                historyArr.forEach((snap, idx) => {
                    const versionText = snap.text || '';
                    const matches = q ? _countMatches(versionText, q) : 0;
                    if (q && matches === 0) return;

                    const summaryHtml = q ? _renderMatchedSummary(versionText, q) : escapeHtml(versionText);
                    
                    const now = Date.now();
                    const diffMin = Math.max(0, Math.floor((now - (snap.time || now)) / 60000));
                    let relTime = diffMin < 1 ? '刚刚' : (diffMin < 60 ? `${diffMin} 分钟前` : (diffMin < 1440 ? `${Math.floor(diffMin/60)} 小时前` : '更早'));
                    if (idx === 0) relTime = '最近保存';
                    
                    const dateObj = new Date(snap.time || now);
                    const absTime = `${dateObj.getHours().toString().padStart(2,'0')}:${dateObj.getMinutes().toString().padStart(2,'0')}`;

                    const badgeClass = idx === 0 ? '' : (idx === 1 ? ' v2' : ' v3');
                    const matchHtml = q ? `<span class="match-count">命中 ${matches}</span>` : '';

                    const $card = $(`
                        <div class="history-card" data-idx="${idx}">
                            <div class="version-badge${badgeClass}">${idx + 1}</div>
                            <div class="card-timestamp">
                                <span class="relative-time">${relTime}</span>
                                <span class="absolute-time">${absTime}</span>
                                ${matchHtml}
                            </div>
                            <div class="card-summary">${summaryHtml}</div>
                        </div>
                    `);
                    
                    // 👑 把 L2 输入框里的关键词打包快递给 L3 详情页！
                    $card.on('click', () => _showDetailView(idx, $search.val().trim()));
                    
                    $list.append($card);
                    visibleCount++;
                });

                if (q && visibleCount === 0) {
                    $list.append(`<div style="text-align:center; padding:36px 0; color:var(--SmartThemeBodyColor); opacity:0.5; font-size:13px;"><span style="font-size:32px; display:block; margin-bottom:10px;">🔍</span>未找到包含 "${escapeHtml(q)}" 的记录</div>`);
                } else if (q && visibleCount < totalCount) {
                    $list.append(`<div style="opacity:0.45; text-align:center; font-size:12px; padding:10px 0; color:var(--SmartThemeBodyColor);">${totalCount - visibleCount} 个版本未命中</div>`);
                }
            }

            $search.on('input', () => _renderCards($search.val()));
            
            // 绑定两个关闭动作
            $historyView.find('#tank-history-back').on('click', () => {
                $historyView.remove();
                $editor.show();
                $mask.find('#tank-btn-group').show();

                $mask.find('#tank-history-btn, #tank-clear-btn').show();

            });
            $historyView.find('#tank-history-close').on('click', () => {
                $mask.remove();
            });

            _renderCards('');
        }

        $mask.find('#tank-history-btn').on('click', _showHistoryView);
    }

// 🧹 只清空编辑框，不保存；要生效必须用户自己点确认
    $mask.find('#tank-clear-btn').on('click', (e) => {
        e.stopPropagation();
        $editor.val('').trigger('input').focus();
    });

    $mask.find('#tank-cancel-btn').on('click', () => $mask.remove());

    if (!isError) {
        $mask.find('#tank-save-btn').on('click', async () => {
            const newText = $editor.val();
            if (newText === rawResultText) { $mask.remove(); return; }

            // 🌟 核心破坏性拦截：检查 Emoji 占位符是否存活！
            let missingTokens = 0;
            let detokenizedText = newText;
            
            if (extractObj.tokens) {
                for (const [tokenId, urlPart] of extractObj.tokens.entries()) {
                    if (!newText.includes(tokenId)) {
                        missingTokens++;
                        // 用户手贱/故意删了占位符，不回填了，意味着底层链接将随之灰飞烟灭！
                    } else {
                        // 👑 修复虫洞1：用劈裂缝合法全量替换，彻底免疫 V8 引擎的 $ 符号污染漏洞！
                        detokenizedText = detokenizedText.split(tokenId).join(urlPart);
                    }
                }
            }

            // 🚨 触发破坏性警告！
            if (missingTokens > 0) {
                const proceed = window.parent.confirm(`⚠️ 警告：检测到您删除了 ${missingTokens} 个 [🔗隐形网址]！\n\n如果点击【确定】，这些链接/图片将被永久销毁（用户自己行为，自己买单）。\n\n如果您手滑删错了，请点击【取消】默默擦屁股，返回弹窗。`);
                if (!proceed) return; // 拦截保存！让用户留在弹窗里
            }

            const targetMsg = getMessageObj(mesid);

            if (!targetMsg) { window.parent.alert('❌ 系统底层找不到该消息！'); $mask.remove(); return; }

            const currentRaw = targetMsg.mes;
            let updatedFullText;

            if (currentRaw === rawText) {
                updatedFullText = rawText.substring(0, extractObj.start) + detokenizedText + rawText.substring(extractObj.end);
            } else {
                const proceed = window.parent.confirm('⚠️ 消息在弹窗打开期间被改动过，点【确定】智能保存。');
                if (!proceed) { $mask.remove(); return; }
                const isOriginalIntact = currentRaw.substring(extractObj.start, extractObj.end) === extractObj.rawChunk;
                if (isOriginalIntact) updatedFullText = currentRaw.substring(0, extractObj.start) + detokenizedText + currentRaw.substring(extractObj.end);
                else { window.parent.alert('❌ 底层结构剧变，强制取消！'); $mask.remove(); return; }
            }

            // 💾 🌟 历史快照大招：chat_id+mesid 双绑，最多 3 版本，新版插队最前
            window.nuyoahTimeMachine = window.nuyoahTimeMachine || new Map();
            const _hisArr = window.nuyoahTimeMachine.get(chatKey) || [];
            _hisArr.unshift({ text: currentRaw, time: Date.now() });
            if (_hisArr.length > 3) _hisArr.length = 3;
            window.nuyoahTimeMachine.set(chatKey, _hisArr);
            
            $mask.remove();
            
            await applyMessageUpdate(mesid, updatedFullText, scrollBefore);
        });
    }
}

// ==================== 样式注入 ====================
    if (!$parentDoc.find('#st-tank-editor-css').length) {
        $parentDoc.find('head').append(`
            <style id="st-tank-editor-css">
                /* 核心基础样式：自适应高度 */
                #st-tank-editor {
                    min-height: 50px !important;
                    max-height: 155px !important; /* 限制最大高度为屏幕的40%，防止太长撑爆屏幕 */
                    field-sizing: content !important; 
                    
                    /* Firefox/IE/Edge 隐藏滚动条 */
                    scrollbar-width: none !important;
                    -ms-overflow-style: none !important;
                }
                
                /* Chrome/Safari 隐藏滚动条 */
                #st-tank-editor::-webkit-scrollbar {
                    display: none !important;
                    width: 0 !important;
                    height: 0 !important;
                }
            </style>
        `);
    }

});