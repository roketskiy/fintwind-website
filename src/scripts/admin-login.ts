type LoginState = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

function initializeLogin(): void {
  const form = document.querySelector('#login-form');
  const password = document.querySelector('#password');
  const submit = document.querySelector('#login-submit');
  const status = document.querySelector('#login-status');
  if (!(form instanceof HTMLFormElement) || !(password instanceof HTMLInputElement)
    || !(submit instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) return;

  let state: LoginState = { kind: 'idle' };
  const render = (nextState: LoginState): void => {
    state = nextState;
    const submitting = nextState.kind === 'submitting';
    form.setAttribute('aria-busy', String(submitting));
    password.readOnly = submitting;
    password.setAttribute('aria-invalid', String(nextState.kind === 'error'));
    submit.disabled = submitting;
    submit.textContent = submitting ? '登录中…' : '登录';
    status.textContent = nextState.kind === 'error' ? nextState.message : submitting ? '正在登录…' : '';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.kind === 'submitting') return;
    render({ kind: 'submitting' });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/admin/api/login', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password: password.value }),
      });
      if (response.status === 204) {
        password.value = '';
        window.location.replace('/admin/');
        return;
      }
      const message = response.status === 401 ? '密码错误'
        : response.status === 429 ? '尝试次数过多，请稍后重试。'
        : response.status === 503 ? '登录服务暂不可用，请稍后重试。'
        : '登录失败，请稍后重试。';
      render({ kind: 'error', message });
      password.focus();
    } catch {
      render({ kind: 'error', message: controller.signal.aborted ? '请求超时，请重试。' : '无法连接登录服务，请重试。' });
    } finally {
      window.clearTimeout(timeout);
    }
  });
  password.addEventListener('input', () => {
    if (state.kind === 'error') render({ kind: 'idle' });
  });
  window.addEventListener('pagehide', () => { password.value = ''; });
}

initializeLogin();
