/* 计分演出 */
(function (global) {
  'use strict';

  var fast = false;

  function wait(ms) {
    return new Promise(function (res) { setTimeout(res, fast ? 16 : ms); });
  }

  function countTo(el, from, to, ms) {
    return new Promise(function (res) {
      if (fast || ms <= 0) { el.textContent = fmt(to); res(); return; }
      var start = performance.now();
      (function tick(now) {
        var p = Math.min(1, (now - start) / ms);
        el.textContent = fmt(Math.round(from + (to - from) * p));
        if (p < 1) requestAnimationFrame(tick); else res();
      })(performance.now());
    });
  }

  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

  function play(detail, cards, state) {
    fast = false;
    return new Promise(function (resolve) {
      var root = document.getElementById('fx');
      var inner = document.createElement('div');
      inner.className = 'fx-inner';
      root.innerHTML = '';
      root.appendChild(inner);

      var cardsRow = document.createElement('div');
      cardsRow.className = 'fx-cards';
      cards.forEach(function (id) {
        var t = global.UI.tileEl(id, { mini: true });
        cardsRow.appendChild(t);
      });
      inner.appendChild(cardsRow);

      var typeEl = document.createElement('div');
      typeEl.className = 'fx-type';
      typeEl.textContent = detail.type;
      inner.appendChild(typeEl);

      var row = document.createElement('div');
      row.className = 'fx-row';
      row.innerHTML = '<span class="fx-label">点数</span>' +
        '<span class="fx-num pts" id="fxPts">0</span>' +
        '<span class="fx-mult">×</span>' +
        '<span class="fx-label">番数</span>' +
        '<span class="fx-num fan" id="fxFan">0</span>';
      inner.appendChild(row);

      var list = document.createElement('div');
      list.className = 'fx-list';
      inner.appendChild(list);

      var totalRow = document.createElement('div');
      totalRow.className = 'fx-row';
      totalRow.innerHTML = '<span class="fx-label">得分</span>' +
        '<span class="fx-num total" id="fxTotal">0</span>';
      inner.appendChild(totalRow);

      root.classList.add('on');
      root.onclick = function () { fast = true; };

      var ptsEl = inner.querySelector('#fxPts');
      var fanEl = inner.querySelector('#fxFan');
      var totalEl = inner.querySelector('#fxTotal');

      (async function run() {
        await wait(200);
        await countTo(ptsEl, 0, detail.points, 340);

        fanEl.textContent = detail.baseFan;
        await wait(180);

        for (var i = 0; i < detail.fanItems.length; i++) {
          var it = detail.fanItems[i];
          var li = document.createElement('div');
          li.className = 'fx-item' + (it.fan === 0 ? ' m' : '');
          li.textContent = (it.fan >= 0 ? '+ ' : '') + it.name +
            (it.fan ? '（' + (it.fan > 0 ? '+' : '') + it.fan + ' 番）' : '');
          list.appendChild(li);
          var target = detail.baseFan;
          for (var k = 0; k <= i; k++) target += detail.fanItems[k].fan;
          fanEl.textContent = fmt(target);
          await wait(120);
        }

        for (var m = 0; m < detail.multipliers.length; m++) {
          var mm = detail.multipliers[m];
          var lm = document.createElement('div');
          lm.className = 'fx-item m';
          lm.textContent = '× ' + mm.name + ' ×' + mm.mult;
          list.appendChild(lm);
          await wait(150);
        }

        var shown = detail.fan;
        if (detail.mult !== 1) {
          shown = Math.round(detail.fan * detail.mult);
          fanEl.textContent = fmt(shown);
        }
        await wait(160);

        await countTo(totalEl, 0, detail.total, 460);
        root.classList.add('shake');
        await wait(420);

        root.classList.remove('shake', 'on');
        root.onclick = null;
        root.innerHTML = '';
        resolve();
      })();
    });
  }

  global.FX = { play: play };
})(window);
