import { t as tr } from '../i18n/i18n';

/**
 * 修改密碼純 HTML 面板，可在任何場景呼叫。
 * onClosed：面板關閉後的回呼（可用來 re-enable Phaser input）。
 */
export function openChangePasswordOverlay(
  domContainer: HTMLElement,
  onClosed?: () => void,
): void {
  const roots: HTMLElement[] = [];
  const close = () => { roots.forEach(e => e.remove()); onClosed?.(); };

  // 全畫面遮罩：固定在 viewport，完全跳脫 Phaser domContainer 的座標系
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0',
    'background:rgba(0,0,0,0.78)',
    'z-index:99999',
    'font-family:sans-serif',
    'pointer-events:auto',
  ].join(';');
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  roots.push(overlay);

  // 面板：絕對定位於 overlay 正中央
  const vw = window.innerWidth;
  const panelW = Math.min(vw - 16, 300);
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute',
    `width:${panelW}px`,
    `left:${(vw - panelW) / 2}px`,
    'top:50%',
    'background:#060e06',
    'border:3px solid #2a8a2a',
    'border-radius:8px',
    'overflow:hidden',
    'box-shadow:0 4px 24px rgba(0,0,0,0.7)',
    'pointer-events:auto',
  ].join(';');
  panel.style.transform = 'translateY(-50%)';
  overlay.appendChild(panel);

  // 標題列
  const header = document.createElement('div');
  Object.assign(header.style, {
    background: '#0a1e0a',
    padding: '12px 40px 12px 16px',
    textAlign: 'center',
    color: '#77ff99',
    fontSize: '17px',
    fontWeight: 'bold',
    borderBottom: '1px solid #1a4a1a',
  });
  header.textContent = tr('ui.changePass');
  panel.appendChild(header);

  // ✕ 關閉按鈕
  const closeBtn = document.createElement('div');
  Object.assign(closeBtn.style, {
    position: 'absolute', top: '8px', right: '12px',
    color: '#55cc55', fontSize: '16px', fontWeight: 'bold',
    cursor: 'pointer', padding: '4px 6px', zIndex: '1',
    pointerEvents: 'auto',
  });
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('pointerup', close);
  panel.appendChild(closeBtn);

  // 主體
  const body = document.createElement('div');
  Object.assign(body.style, { padding: '14px 14px 14px' });
  panel.appendChild(body);

  const makeRow = (label: string, placeholder: string): HTMLInputElement => {
    const row = document.createElement('div');
    Object.assign(row.style, { marginBottom: '12px' });

    const lbl = document.createElement('div');
    lbl.textContent = label;
    Object.assign(lbl.style, { color: '#99cc99', fontSize: '13px', marginBottom: '5px' });
    row.appendChild(lbl);

    const inp = document.createElement('input');
    inp.type = 'password';
    inp.placeholder = placeholder;
    Object.assign(inp.style, {
      width: '100%', height: '34px', fontSize: '14px',
      padding: '4px 8px', background: '#0a180a', color: '#c8ffc8',
      border: '1px solid #2a8a2a', borderRadius: '6px',
      outline: 'none', boxSizing: 'border-box',
      pointerEvents: 'auto',
    });
    row.appendChild(inp);
    body.appendChild(row);
    return inp;
  };

  const oldInp  = makeRow(tr('prep.changePass.old'),     tr('prep.changePass.oldPH'));
  const newInp  = makeRow(tr('prep.changePass.new'),     tr('prep.changePass.newPH'));
  const confInp = makeRow(tr('prep.changePass.confirm'), tr('prep.changePass.confirmPH'));

  // 送出按鈕
  const sbBtn = document.createElement('button');
  Object.assign(sbBtn.style, {
    width: '100%', height: '40px', marginTop: '4px',
    background: '#0d3a0d', color: '#ffffff',
    border: '1px solid #1a8a1a', borderRadius: '6px',
    fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
    pointerEvents: 'auto',
  });
  sbBtn.textContent = tr('prep.changePass.submit');
  body.appendChild(sbBtn);

  const setBtn = (bg: string, border: string, text: string, disabled = false) => {
    sbBtn.style.background   = bg;
    sbBtn.style.borderColor  = border;
    sbBtn.textContent        = text;
    sbBtn.disabled           = disabled;
  };

  sbBtn.addEventListener('pointerup', async () => {
    const oldPw  = oldInp.value.trim();
    const newPw  = newInp.value.trim();
    const confPw = confInp.value.trim();
    if (!oldPw || !newPw || !confPw) { setBtn('#3a0d0d', '#8a1a1a', tr('prep.changePass.empty'));    return; }
    if (newPw.length < 6)            { setBtn('#3a0d0d', '#8a1a1a', tr('prep.changePass.short'));    return; }
    if (newPw !== confPw)            { setBtn('#3a0d0d', '#8a1a1a', tr('prep.changePass.mismatch')); return; }

    setBtn('#1a3a1a', '#2a6a2a', tr('prep.changePass.loading'), true);

    const rguRaw = localStorage.getItem('rg_user');
    const token  = rguRaw ? (JSON.parse(rguRaw)?.accessToken ?? '') : '';
    const apiUrl = (window as any).__apiUrl as string ?? '';
    try {
      const res  = await fetch(`${apiUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (res.ok) {
        setBtn('#0d3a18', '#1a8a3a', tr('prep.changePass.done'), true);
        setTimeout(close, 1800);
      } else {
        setBtn('#3a0d0d', '#8a1a1a', data.error ?? tr('prep.changePass.fail'));
      }
    } catch {
      setBtn('#3a0d0d', '#8a1a1a', tr('prep.misc.networkErr'));
    }
  });
}
