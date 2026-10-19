/* 界面渲染与交互 */
(function (global) {
  'use strict';
  var T = global.Tiles, H = global.Hand, C = global.Content, G = global.Game;

  var selected = [];          // 手牌下标
  var showHint = true;
  var busy = false;
  var els = {};

  /* ---------------------------------------------------------- 小工具 */

  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /** 合并档位后缀：1=普通（不显示）/ 2=二重 / 3=满贯 */
  function tierTag(t) { return !t || t === 1 ? '' : (t === 2 ? '·二重' : '·满贯'); }

  function tileEl(id, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'tile s-' + T.suitOf(id) + (opts.mini ? ' mini' : '') + (opts.cls ? ' ' + opts.cls : '');
    var lab = T.label(id);
    if (lab.suit === 'Z') {
      el.innerHTML = '<div class="big">' + lab.big + '</div>';
    } else {
      el.innerHTML = '<div class="corner">' + lab.small + '</div>' +
        '<div class="big">' + lab.big + '</div>' +
        '<div class="small">' + lab.small + '</div>';
    }
    return el;
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.getElementById('app').appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }

  /* ---------------------------------------------------------- 弹窗 */

  function openModal(html, wire) {
    var root = $('modalRoot');
    root.innerHTML = '<div class="modal">' + html + '</div>';
    root.hidden = false;
    if (wire) wire(root);
  }
  function closeModal() {
    var root = $('modalRoot');
    root.hidden = true;
    root.innerHTML = '';
  }

  /* ---------------------------------------------------------- 渲染 */

  function render() {
    var s = G.state();
    if (!s) return;
    renderHud(s);
    renderBoard(s);
    renderJokers(s);
    renderHand(s);
    renderControls(s);
    renderPreview(s);
  }

  function renderHud(s) {
    $('hudRound').textContent = '第 ' + s.round + ' 圈 · ' + C.LEVEL_NAMES[s.levelIndex];
    $('hudMoney').textContent = fmt(s.money);
  }

  function renderBoard(s) {
    $('targetValue').textContent = fmt(s.target);
    $('scoreTarget').textContent = fmt(s.target);
    $('scoreValue').textContent = fmt(s.score);
    var pct = s.target ? Math.min(100, s.score / s.target * 100) : 0;
    var bar = $('progressBar');
    bar.style.width = pct + '%';
    bar.className = s.score >= s.target ? 'done' : '';

    var chips = $('chips');
    clear(chips);
    if (s.doras.length) {
      var dc = document.createElement('span');
      dc.className = 'chip chip--dora';
      dc.appendChild(document.createTextNode('宝牌'));
      s.doras.forEach(function (d) { dc.appendChild(tileEl(d, { mini: true })); });
      chips.appendChild(dc);
    }
    if (s.tenpai) {
      var tc = document.createElement('span');
      tc.className = 'chip chip--tenpai';
      tc.textContent = '听牌 ' + T.tileName(s.tenpai.tile) + '　命中 ×3（剩 '
        + s.tenpai.turnsLeft + ' 回合）';
      chips.appendChild(tc);
    }
    if (s.blind) {
      var b = document.createElement('span');
      b.className = 'chip chip--blind';
      b.textContent = '禁令 ' + s.blind.name;
      b.title = s.blind.desc;
      chips.appendChild(b);
    }
  }

  function renderJokers(s) {
    var strip = $('jokerStrip');
    clear(strip);
    if (!s.jokers.length) {
      var e = document.createElement('div');
      e.className = 'joker-empty';
      e.textContent = '牌灵栏（0/' + G.JOKER_SLOTS + '）—— 通关后到商店购买';
      strip.appendChild(e);
      return;
    }
    s.jokers.forEach(function (it) {
      var id = it.id;
      var j = C.jokerById(id);
      var tag = tierTag(it.tier);
      var el = document.createElement('div');
      el.className = 'joker r-' + rarityKey(j.rarity);
      el.innerHTML = j.name + tag + '<small>' + j.desc + '</small>';
      el.title = '【' + j.rarity + '】' + j.name + tag + '：' + j.desc;
      strip.appendChild(el);
    });
  }

  function rarityKey(r) {
    return { '白': 'white', '青': 'blue', '金': 'gold', '赤': 'red' }[r] || 'white';
  }

  function renderHand(s) {
    var wrap = $('hand');
    clear(wrap);
    s.hand.forEach(function (id, i) {
      var isDora = s.doras.indexOf(id) >= 0;
      var cls = [];
      if (selected.indexOf(i) >= 0) cls.push('sel');
      if (isDora) cls.push('is-dora');
      var el = tileEl(id, { cls: cls.join(' ') });
      el.dataset.index = i;
      if (isDora) el.title = '宝牌：打出每张 +3 番';
      el.addEventListener('click', function () { toggle(i); });
      wrap.appendChild(el);
    });
  }

  function renderControls(s) {
    $('playsLeft').innerHTML = '出牌 <b>' + s.playsLeft + '</b>';
    $('discardsLeft').innerHTML = '换牌 <b>' + s.discardsLeft + '</b>';
    $('btnPlay').textContent = selected.length ? '和牌 (' + selected.length + ')' : '和牌';
    $('btnPlay').disabled = busy || selected.length < G.MIN_PLAY || s.playsLeft <= 0;
    $('btnDiscard').disabled = busy || selected.length < 1 || selected.length > 5 || s.discardsLeft <= 0;
    var hb = $('btnHint');
    var hints = typeof s.hintsLeft === 'number' ? s.hintsLeft : G.HINTS_PER_RUN;
    hb.innerHTML = '提示<small>剩 ' + hints + '</small>';
    hb.disabled = busy || hints <= 0 || s.playsLeft <= 0 || s.phase !== 'level';
    var tb = $('btnTenpai');
    if (s.tenpai) {
      tb.textContent = '听 ' + T.tileName(s.tenpai.tile) + '（' + s.tenpai.turnsLeft + '）';
      tb.disabled = true;
    } else {
      tb.textContent = s.tenpaiUsedThisLevel ? '听牌（本关已用）' : '听牌';
      tb.disabled = busy || s.tenpaiUsedThisLevel || s.phase !== 'level';
    }
  }

  /** 枚举 n 选 k 的组合下标 */
  function forEachCombo(n, k, fn) {
    var idx = [];
    (function rec(start) {
      if (idx.length === k) { fn(idx.slice()); return; }
      for (var i = start; i < n; i++) { idx.push(i); rec(i + 1); idx.pop(); }
    })(0);
  }

  /** 在 2~6 张的范围里枚举出分值最高的一手 */
  function bestCombo(s) {
    var n = s.hand.length;
    if (n < G.MIN_PLAY) return null;
    var ctx = G.buildCtx(), best = null;
    var maxK = Math.min(G.MAX_PLAY, n);
    for (var k = G.MIN_PLAY; k <= maxK; k++) {
      forEachCombo(n, k, function (idx) {
        var cards = idx.map(function (i) { return s.hand[i]; });
        var r = H.scorePlay(cards, ctx, true);
        if (!best || r.total > best.total) {
          best = { total: r.total, type: r.type, idx: idx, cards: cards };
        }
      });
    }
    return best;
  }

  function renderPreview(s) {
    var box = $('preview');
    if (selected.length >= G.MIN_PLAY) {
      var cards = selected.map(function (i) { return s.hand[i]; });
      var r = H.scorePlay(cards, G.buildCtx());
      box.innerHTML = '<b>' + r.type + '</b> ｜ 点数 ' + fmt(r.points) +
        ' × 番数 ' + r.fan + (r.mult !== 1 ? ' × ' + r.mult : '') +
        ' ≈ <b>' + fmt(r.total) + '</b> 分';
      return;
    }
    if (showHint && s.hand.length >= G.MIN_PLAY) {
      var best = bestCombo(s);
      if (best) {
        box.innerHTML = '<span class="tip">本手最佳：' + best.type + '（' + best.idx.length +
          ' 张）≈ ' + fmt(best.total) + ' 分</span>';
        return;
      }
    }
    box.textContent = selected.length
      ? '已选 ' + selected.length + ' 张（可打 ' + G.MIN_PLAY + '~' + G.MAX_PLAY + ' 张）'
      : '可打 ' + G.MIN_PLAY + '~' + G.MAX_PLAY + ' 张——打得越少，留在手里的牌越多';
  }

  /* ---------------------------------------------------------- 交互 */

  function toggle(i) {
    if (busy) return;
    var at = selected.indexOf(i);
    if (at >= 0) selected.splice(at, 1);
    else {
      if (selected.length >= 6) { toast('最多选 6 张'); return; }
      selected.push(i);
    }
    render();
  }

  /** 提交一次和牌（共用：手选 / 提示自动出牌） */
  function commitPlay(cards) {
    var s = G.state();
    var res = G.play(cards);
    if (!res) return false;
    var snapshot = cards.slice();
    selected = [];
    busy = true;
    render();
    global.FX.play(res.detail, snapshot, s).then(function () {
      busy = false;
      if (res.outcome === 'cleared') onCleared();
      else if (res.outcome === 'failed') onFailed();
      else render();
    });
    return true;
  }

  function onPlay() {
    if (busy) return;
    var s = G.state();
    if (selected.length < G.MIN_PLAY || s.playsLeft <= 0) return;
    commitPlay(selected.map(function (i) { return s.hand[i]; }));
  }

  /** 提示：自动选出当前手牌里分值最高的组合并直接打出 */
  /** 听牌：选一个自己手里没有的牌作听口，命中则番数 ×3 */
  function onTenpai() {
    var s = G.state();
    if (!s || s.phase !== 'level' || s.tenpai || s.tenpaiUsedThisLevel) return;
    var html = '<h2>听牌</h2>'
      + '<p class="sub">选一个你现在手里<strong style="color:#e0c25c">没有</strong>的牌作听口。'
      + '之后 ' + G.TENPAI_TURNS + ' 回合内，和牌时只要包含它，番数 ×3。每关限一次。</p>'
      + '<p class="sub">下面的数字是你牌组里该牌的副本数——副本越多越容易摸到。</p>'
      + '<div class="tile-picker" id="picker"></div>'
      + '<div class="modal-actions"><button class="btn btn--ghost" id="btnCancelT">取消</button></div>';
    openModal(html, function (root) {
      var grid = root.querySelector('#picker');
      T.allTileIds().forEach(function (id) {
        var inHand = s.hand.indexOf(id) >= 0;
        var cellEl = document.createElement('div');
        cellEl.className = 'picker-cell' + (inHand ? ' full' : '');
        cellEl.appendChild(tileEl(id, { mini: true }));
        var lab = document.createElement('span');
        lab.className = 'cnt';
        lab.textContent = inHand ? '手牌中' : '×' + (s.copies[id] || 0);
        cellEl.appendChild(lab);
        if (!inHand) {
          cellEl.addEventListener('click', function () {
            G.declareTenpai(id);
            closeModal();
            toast('听牌：' + T.tileName(id) + '（' + G.TENPAI_TURNS + ' 回合内命中则番数 ×3）');
            render();
          });
        }
        grid.appendChild(cellEl);
      });
      root.querySelector('#btnCancelT').addEventListener('click', function () { closeModal(); });
    });
  }

  function onHint() {
    if (busy) return;
    var s = G.state();
    if (!s || s.playsLeft <= 0 || !G.canHint()) {
      toast('提示次数已用完');
      return;
    }
    var best = bestCombo(s);
    if (!best) return;
    var cards = best.cards.slice();
    if (!G.consumeHint()) return;
    toast('提示：自动打出「' + best.type + '」（' + cards.length + ' 张）');
    commitPlay(cards);
  }

  function onDiscard() {
    if (busy) return;
    var s = G.state();
    var cards = selected.map(function (i) { return s.hand[i]; });
    if (!G.discard(cards)) return;
    selected = [];
    render();
  }

  function onCleared() {
    var info = G.completeLevel();
    render();
    showShop(info);
  }

  function onFailed() {
    var r = G.failLevel();
    if (r === 'retry') {
      render();
      toast('流局！消耗一次续命');
      showLevelIntro(true);
    } else {
      render();
      showRunEnd(false);
    }
  }

  /* ---------------------------------------------------------- 关卡准备 */

  function showLevelIntro(isRetry) {
    var s = G.state();
    var d = G.difficulty();
    var html = '<h2>第 ' + s.round + ' 圈 · ' + C.LEVEL_NAMES[s.levelIndex] + '</h2>' +
      '<div class="sub">' + d.name + '｜每种 ' + d.copies + ' 张' +
      (isRetry ? '｜剩余续命 ' + s.retriesLeft : '') + '</div>' +
      '<div class="info-grid">' +
      cell('目标分', fmt(s.target)) +
      cell('出牌次数', s.playsLeft) +
      cell('换牌次数', s.discardsLeft) +
      cell('手牌上限', s.handSize) +
      '</div>' +
      '<h3>本关宝牌</h3>' +
      '<div class="slots" id="doraSlot"></div>' +
      (s.blind ? '<h3>庄关禁令</h3><p><b style="color:#e08a72">' + s.blind.name +
        '</b> — ' + s.blind.desc + '</p>' : '') +
      '<div class="modal-actions"><button class="btn btn--primary" id="btnStart">开始</button></div>';

    openModal(html, function (root) {
      var slot = root.querySelector('#doraSlot');
      s.doras.forEach(function (id) {
        var w = document.createElement('span');
        w.className = 'slot filled';
        w.style.display = 'inline-flex';
        w.style.alignItems = 'center';
        w.style.gap = '5px';
        var t = tileEl(id, { mini: true });
        t.classList.add('is-dora');
        w.appendChild(t);
        var nm = document.createElement('span');
        nm.textContent = T.tileName(id) + '（每张 +3 番）';
        w.appendChild(nm);
        slot.appendChild(w);
      });
      root.querySelector('#btnStart').addEventListener('click', function () {
        closeModal();
        render();
      });
    });
  }

  function cell(k, v) {
    return '<div class="info-cell"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }

  /* ---------------------------------------------------------- 商店 */

  function showShop(info) {
    var s = G.state();
    var html = '<h2>商店</h2>' +
      '<div class="sub">铜钱 ' + fmt(s.money) +
      (info ? '｜本关收入 +' + fmt(info.income) + '，利息 +' + fmt(info.interest) : '') + '</div>' +
      '<h3>牌灵 ' + s.jokers.length + '/' + G.JOKER_SLOTS + '</h3>' +
      '<div class="slots" id="ownedJokers"></div>' +
      '<h3>香火 ' + s.consumableIds.length + '/3</h3>' +
      '<div class="slots" id="ownedCons"></div>' +
      '<h3>在售</h3><div class="shop-list" id="shopList"></div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn--ghost btn--sm" id="btnReroll">重掷 ' + fmt(s.shop.rerollCost) + '</button>' +
      '<button class="btn btn--sm btn--primary" id="btnLever"' + (s.slotUsedThisRound ? ' disabled' : '') + '>' +
      (s.slotUsedThisRound ? '拉杆（本圈已用）' : '拉杆 · 免费摇 3 张') + '</button>' +
      '<button class="btn btn--primary" id="btnNext">下一关</button>' +
      '</div>';

    openModal(html, function (root) {
      renderShopBody(root);
      var lv = root.querySelector('#btnLever');
      if (lv) lv.addEventListener('click', function () { doSpin(root); });

      root.querySelector('#btnReroll').addEventListener('click', function () {
        if (!G.rerollShop()) { toast('铜钱不足'); return; }
        $('#modalRoot').querySelector('.sub').textContent = '铜钱 ' + fmt(G.state().money);
        renderShopBody(root);
        render();
      });
      root.querySelector('#btnNext').addEventListener('click', function () {
        closeModal();
        G.nextLevel();
        var ph = G.state().phase;
        if (ph === 'endlessChoice') { render(); showEndlessChoice(); return; }
        if (ph === 'won') { render(); showRunEnd(true); return; }
        render();
        showLevelIntro(false);
      });
    });
  }

  /** 拉杆：摇出 3 张牌灵，依次停下，同名合并升级 */
  function doSpin(root) {
    var res = G.spinSlot();
    if (!res) { toast('本圈已经摇过了'); return; }
    var names = res.rolls.map(function (id) { return C.jokerById(id).name; });
    var lines = res.results.map(function (r) {
      var nm = C.jokerById(r.id).name;
      if (r.lost) return nm + '（牌灵栏已满，没拿到）';
      if (r.to === 3) return '满贯·' + nm + '  ★★★';
      if (r.to === 2) return '二重·' + nm + '  ★★';
      return nm + (r.from > 0 ? '（已升级）' : '');
    });
    var star = res.results.some(function (r) { return r.to === 3; }) ? '★ 满贯！' : (res.results.some(function (r) { return r.to === 2; }) ? '★★ 合并' : '未中');
    openModal('<h2>拉杆</h2>'
      + '<div class="sub">转出：' + names.join(' / ') + '</div>'
      + '<p style="font-size:16px;color:#e0c25c">' + star + '</p>'
      + '<div class="shop-list">' + lines.map(function (t) { return '<div class="shop-item"><div class="body"><div class="name">' + t + '</div></div></div>'; }).join('') + '</div>'
      + '<div class="modal-actions"><button class="btn btn--primary" id="btnSpinOk">收下</button></div>',
    function (r2) {
      r2.querySelector('#btnSpinOk').addEventListener('click', function () {
        closeModal(); showShop(null); render();
      });
    });
  }

  function renderShopBody(root) {

    var s = G.state();

    var oj = root.querySelector('#ownedJokers');
    clear(oj);
    for (var i = 0; i < G.JOKER_SLOTS; i++) {
      var sp = document.createElement('span');
    var jit = s.jokers[i];
    var jid = jit ? jit.id : null;
      sp.className = 'slot' + (jid ? ' filled' : '');
      sp.textContent = jid ? C.jokerById(jid).name + tierTag(jit.tier) : '空';
      if (jid) sp.title = C.jokerById(jid).desc + tierTag(jit.tier);
      oj.appendChild(sp);
    }

    var oc = root.querySelector('#ownedCons');
    clear(oc);
    for (var k = 0; k < 3; k++) {
      (function (idx) {
        var cid = s.consumableIds[idx];
        var sp = document.createElement('span');
        sp.className = 'slot' + (cid ? ' filled' : '');
        sp.textContent = cid ? C.consumableById(cid).name : '空';
        if (cid) {
          sp.title = C.consumableById(cid).desc + '（点击使用）';
          sp.addEventListener('click', function () { useCons(idx); });
        }
        oc.appendChild(sp);
      })(k);
    }

    var list = root.querySelector('#shopList');
    clear(list);

    s.shop.jokers.forEach(function (item, idx) {
      if (item.sold) return;
      var j = item.j;
      list.appendChild(shopRow('joker', idx, j.name, j.desc, j.rarity, C.RARITY[j.rarity].price, function () {
        if (G.buyJoker(idx)) { toast('已购买 ' + j.name); refresh(root); }
        else toast(G.state().jokers.length >= G.JOKER_SLOTS ? '牌灵栏已满' : '铜钱不足');
      }));
    });
    s.shop.consumables.forEach(function (item, idx) {
      if (item.sold) return;
      var c = item.c;
      list.appendChild(shopRow('consumable', idx, c.name, c.desc, '白', c.price, function () {
        if (G.buyConsumable(idx)) { toast('已购买 ' + c.name); refresh(root); }
        else toast(G.state().consumableIds.length >= 3 ? '香火槽已满' : '铜钱不足');
      }));
    });
    if (!list.children.length) {
      var e = document.createElement('div');
      e.className = 'sub';
      e.textContent = '本店已售罄';
      list.appendChild(e);
    }
  }

  function shopRow(kind, idx, name, desc, rarity, price, onBuy) {
    var row = document.createElement('div');
    row.className = 'shop-item';
    row.dataset.kind = kind;
    row.dataset.idx = idx;
    row.innerHTML = '<span class="rarity r-' + rarityKey(rarity) + '">' + rarity + '</span>' +
      '<div class="body"><div class="name">' + name + '</div>' +
      '<div class="desc">' + desc + '</div></div>';
    var btn = document.createElement('button');
    btn.className = 'btn btn--sm btn--primary';
    btn.textContent = price + ' 钱';
    btn.addEventListener('click', onBuy);
    row.appendChild(btn);
    return row;
  }

  function refresh(root) {
    var m = root.querySelector('.sub');
    if (m) m.textContent = '铜钱 ' + fmt(G.state().money);
    renderShopBody(root);
    render();
  }

  function useCons(idx) {
    var s = G.state();
    var cid = s.consumableIds[idx];
    if (!cid) return;
    var def = C.consumableById(cid);
    if (def.picker) { showTilePicker(def, idx); return; }
    if (G.useConsumable(idx)) {
      toast(def.name + ' 已使用');
      closeModal();
      showShop(null);
      render();
    } else toast('无法使用');
  }

  function showTilePicker(def, consIndex) {
    var s = G.state();
    var html = '<h2>' + def.name + '</h2>' +
      '<p class="sub">' + def.desc + '</p>' +
      '<div class="tile-picker" id="picker"></div>' +
      '<div class="modal-actions"><button class="btn btn--ghost" id="btnCancel">取消</button></div>';
    openModal(html, function (root) {
      var grid = root.querySelector('#picker');
      T.allTileIds().forEach(function (id) {
        var cnt = s.copies[id] || 0;
        var cellEl = document.createElement('div');
        cellEl.className = 'picker-cell' + (cnt >= 4 || (def.picker === 'remove' && cnt <= 1) ? ' full' : '');
        var t = tileEl(id, { mini: true });
        cellEl.appendChild(t);
        var lab = document.createElement('span');
        lab.className = 'cnt';
        lab.textContent = '×' + cnt;
        cellEl.appendChild(lab);
        cellEl.addEventListener('click', function () {
          if (G.useConsumable(consIndex, id)) {
            toast(def.name + ' → ' + T.tileName(id));
            closeModal();
            showShop(null);
            render();
          } else toast('该牌已达上限');
        });
        grid.appendChild(cellEl);
      });
      root.querySelector('#btnCancel').addEventListener('click', function () {
        showShop(null);
      });
    });
  }

  /* ---------------------------------------------------------- 结束 */
  /** 通过第 8 圈：问玩家是结算还是进入无尽 */
  function showEndlessChoice() {
    var s = G.state();
    var next = G.targetFor(s.round, s.levelIndex, s.difficultyId);
    var html = '<h2>通关</h2>'
      + '<div class="sub">你已经打完了 8 圈，总分 ' + fmt(s.totalScore) + '</div>'
      + '<p>接下来是<b style="color:#e0c25c">无尽模式</b>：目标分每圈 ×' + G.ENDLESS_GROWTH
      + '，一旦流局就结束。下一关目标 <b>' + fmt(next) + '</b>。</p>'
      + '<p class="sub">只有把番数倍率做成年年生长的 build（《连庄》《滚雪球》 + 升级符）才走得深。</p>'
      + '<div class="modal-actions">'
      + '<button class="btn btn--ghost" id="btnStop">就此结算</button>'
      + '<button class="btn btn--primary" id="btnGo">继续挑战</button></div>';
    openModal(html, function (root) {
      root.querySelector('#btnStop').addEventListener('click', function () {
        closeModal(); G.finishRun(); render(); showRunEnd(true);
      });
      root.querySelector('#btnGo').addEventListener('click', function () {
        closeModal(); G.enterEndless(); render(); showLevelIntro(false);
      });
    });
  }


  function showRunEnd(won) {
    var s = G.state();
    var d = G.difficulty();
    var html = '<h2>' + (won ? '通关' : '流局') + '</h2>' +
      '<div class="sub">' + d.name + '</div>' +
      '<div class="info-grid">' +
      cell('到达', won ? '第 8 圈 · 庄关' : ('第 ' + s.round + ' 圈 · ' + C.LEVEL_NAMES[s.levelIndex])) +
      cell('本局总分', fmt(s.totalScore)) +
      cell('最高单次', fmt(s.bestPlay.total)) +
      cell('最强牌型', s.bestPlay.type) +
      '</div>' +
      '<h3>最终牌灵</h3><div class="slots" id="endJokers"></div>' +
      '<div class="modal-actions"><button class="btn btn--primary" id="btnAgain">再来一局</button></div>';

    openModal(html, function (root) {
      var w = root.querySelector('#endJokers');
      if (!s.jokers.length) {
        var e = document.createElement('span');
        e.className = 'slot';
        e.textContent = '无';
        w.appendChild(e);
      }
      s.jokers.forEach(function (jt) {
        var id = jt.id;
        var sp = document.createElement('span');
        sp.className = 'slot filled';
        sp.textContent = C.jokerById(id).name + tierTag(jt.tier);
        w.appendChild(sp);
      });
      root.querySelector('#btnAgain').addEventListener('click', function () {
        G.clearSave();
        showStart();
      });
    });
  }

  /* ---------------------------------------------------------- 开始界面 */

  function showStart() {
    var html = '<h2>和牌</h2>' +
      '<p class="sub">麻将主题 · 固定 6 张出牌 · 8 圈通关</p>' +
      '<h3>选择难度</h3><div class="shop-list" id="diffList"></div>' +
      '<div class="modal-actions" id="startActions"></div>';

    openModal(html, function (root) {
      var list = root.querySelector('#diffList');
      C.DIFFICULTIES.forEach(function (d) {
        var row = document.createElement('div');
        row.className = 'shop-item';
        row.innerHTML = '<div class="body"><div class="name">' + d.name +
          ' <span class="sub">' + d.tag + '</span></div>' +
          '<div class="desc">' + d.desc + '｜出牌 ' + d.plays + ' 次｜换牌 ' + d.discards + ' 次</div></div>';
        var btn = document.createElement('button');
        btn.className = 'btn btn--sm btn--primary';
        btn.textContent = '开局';
        btn.addEventListener('click', function () {
          closeModal();
          G.newRun(d.id);
          render();
          showLevelIntro(false);
        });
        row.appendChild(btn);
        list.appendChild(row);
      });

      var saved = G.load();
      if (saved) {
        var acts = root.querySelector('#startActions');
        var b = document.createElement('button');
        b.className = 'btn btn--ghost';
        b.textContent = '继续上一局（第 ' + saved.round + ' 圈）';
        b.addEventListener('click', function () {
          closeModal();
          G.restore(saved);
          render();
          if (G.state().phase === 'shop') showShop(null);
          else showLevelIntro(false);
        });
        acts.appendChild(b);
      }
    });
  }

  /* ---------------------------------------------------------- 菜单 */

  function showMenu() {
    var html = '<h2>菜单</h2>' +
      '<p class="sub">本原型用于验证玩法循环，数值均为初值。</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn--ghost btn--sm" id="btnHint">提示：开</button>' +
      '<button class="btn btn--ghost btn--sm" id="btnRestart">放弃本局</button>' +
      '<button class="btn btn--primary btn--sm" id="btnClose">返回</button>' +
      '</div>';
    openModal(html, function (root) {
      var hb = root.querySelector('#btnHint');
      hb.textContent = '提示：' + (showHint ? '开' : '关');
      hb.addEventListener('click', function () {
        showHint = !showHint;
        hb.textContent = '提示：' + (showHint ? '开' : '关');
        renderPreview(G.state());
      });
      root.querySelector('#btnRestart').addEventListener('click', function () {
        G.clearSave();
        showStart();
      });
      root.querySelector('#btnClose').addEventListener('click', function () {
        closeModal();
        render();
      });
    });
  }

  /* ---------------------------------------------------------- 启动 */

  function init() {
    $('btnPlay').addEventListener('click', onPlay);
    $('btnHint').addEventListener('click', onHint);
    $('btnTenpai').addEventListener('click', onTenpai);
    $('btnDiscard').addEventListener('click', onDiscard);
    $('btnMenu').addEventListener('click', showMenu);

    var saved = G.load();
    if (saved) {
      G.restore(saved);
      render();
      if (G.state().phase === 'shop') showShop(null);
      else showLevelIntro(false);
    } else {
      showStart();
    }
  }

  global.UI = {
    init: init,
    render: render,
    tileEl: tileEl,
    showStart: showStart,
    showLevelIntro: showLevelIntro,
    showShop: showShop,
    showRunEnd: showRunEnd,
    showEndlessChoice: showEndlessChoice,
    toast: toast,
    cell: cell
  };
})(window);
