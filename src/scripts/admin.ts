type DailyActivity = { day: string; dau: number };
type ActivityReport = {
  timezone: 'Asia/Shanghai';
  today: string;
  generatedAt: string;
  days: DailyActivity[];
};
type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; report: ActivityReport }
  | { kind: 'auth' }
  | { kind: 'leaving' }
  | { kind: 'error'; message: string };

const numberFormat = new Intl.NumberFormat('zh-CN');
const dateTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function parseReport(value: unknown, expectedDays: number): ActivityReport {
  if (typeof value !== 'object' || value === null
    || !('timezone' in value) || value.timezone !== 'Asia/Shanghai'
    || !('today' in value) || !isDate(value.today)
    || !('generatedAt' in value) || typeof value.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !('days' in value) || !Array.isArray(value.days) || value.days.length !== expectedDays) {
    throw new Error('统计数据格式异常，请稍后重试。');
  }
  const todayTime = Date.parse(value.today);
  const days = value.days.map((row: unknown, index): DailyActivity => {
    const expectedDay = new Date(todayTime - (expectedDays - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    if (typeof row !== 'object' || row === null
      || !('day' in row) || row.day !== expectedDay
      || !('dau' in row) || typeof row.dau !== 'number' || !Number.isSafeInteger(row.dau) || row.dau < 0) {
      throw new Error('统计数据格式异常，请稍后重试。');
    }
    return { day: expectedDay, dau: row.dau };
  });
  return { timezone: value.timezone, today: value.today, generatedAt: value.generatedAt, days };
}

function drawChart(container: HTMLElement, days: DailyActivity[]): void {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  const width = Math.max(240, container.clientWidth);
  const height = 250;
  const left = 60;
  const right = 14;
  const top = 12;
  const bottom = 36;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const maximum = Math.max(0, ...days.map(row => row.dau));
  const roughStep = Math.max(1, (maximum + 1) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.ceil(roughStep / magnitude) * magnitude;
  const ceiling = step * 4;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', 'chart-title chart-description');
  const title = document.createElementNS(svgNS, 'title');
  title.id = 'chart-title';
  title.textContent = '每日活跃安装数';
  const description = document.createElementNS(svgNS, 'desc');
  description.id = 'chart-description';
  description.textContent = '按北京时间统计，同一安装每日去重。完整数值见每日明细表。';
  svg.append(title, description);

  for (let tick = 0; tick <= 4; tick++) {
    const y = top + plotHeight - tick / 4 * plotHeight;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', String(left));
    line.setAttribute('x2', String(width - right));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', tick === 0 ? 'baseline' : 'gridline');
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', String(left - 10));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.textContent = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(tick * step);
    svg.append(line, label);
  }

  const band = plotWidth / days.length;
  days.forEach((row, index) => {
    const bar = document.createElementNS(svgNS, 'rect');
    const barHeight = row.dau / ceiling * plotHeight;
    bar.setAttribute('x', String(left + index * band + band * .15));
    bar.setAttribute('y', String(top + plotHeight - barHeight));
    bar.setAttribute('width', String(band * .7));
    bar.setAttribute('height', String(barHeight));
    bar.setAttribute('class', 'bar');
    const barTitle = document.createElementNS(svgNS, 'title');
    barTitle.textContent = `${row.day}，${numberFormat.format(row.dau)}`;
    bar.append(barTitle);
    svg.append(bar);
    const labelStep = Math.ceil((days.length - 1) / 4);
    if (index % labelStep === 0) {
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(left + (index + .5) * band));
      label.setAttribute('y', String(height - 10));
      label.setAttribute('text-anchor', index === 0 ? 'start' : 'middle');
      label.textContent = row.day.slice(5).replace('-', '/');
      svg.append(label);
    }
  });
  container.replaceChildren(svg);
}

function initialize(): void {
  const logout = document.querySelector('#logout');
  const refresh = document.querySelector('#refresh');
  const retry = document.querySelector('#retry');
  const range = document.querySelector('#days');
  const status = document.querySelector('#status');
  const recovery = document.querySelector('#recovery');
  const statistics = document.querySelector('#statistics');
  const todayDau = document.querySelector('#today-dau');
  const todayDate = document.querySelector('#today-date');
  const yesterdayDau = document.querySelector('#yesterday-dau');
  const yesterdayDate = document.querySelector('#yesterday-date');
  const period = document.querySelector('#period');
  const chart = document.querySelector('#chart');
  const zeroState = document.querySelector('#zero-state');
  const dailyRows = document.querySelector('#daily-rows');
  const updatedAt = document.querySelector('#updated-at');
  if (!(logout instanceof HTMLButtonElement) || !(refresh instanceof HTMLButtonElement) || !(retry instanceof HTMLButtonElement)
    || !(range instanceof HTMLSelectElement) || !(status instanceof HTMLElement)
    || !(recovery instanceof HTMLElement) || !(statistics instanceof HTMLElement)
    || !(todayDau instanceof HTMLElement) || !(todayDate instanceof HTMLElement)
    || !(yesterdayDau instanceof HTMLElement) || !(yesterdayDate instanceof HTMLElement)
    || !(period instanceof HTMLElement) || !(chart instanceof HTMLElement)
    || !(zeroState instanceof HTMLElement) || !(dailyRows instanceof HTMLElement)
    || !(updatedAt instanceof HTMLTimeElement)) return;

  let state: ViewState = { kind: 'loading' };
  let request: AbortController | undefined;

  const render = (nextState: ViewState): void => {
    state = nextState;
    const loading = nextState.kind === 'loading' || nextState.kind === 'leaving';
    logout.disabled = nextState.kind === 'leaving';
    refresh.disabled = loading;
    range.disabled = loading;
    statistics.setAttribute('aria-busy', String(loading));
    statistics.hidden = nextState.kind !== 'ready';
    status.hidden = nextState.kind === 'ready';
    recovery.hidden = nextState.kind !== 'error' && nextState.kind !== 'auth';
    retry.textContent = nextState.kind === 'auth' ? '重新登录' : '重试';
    if (nextState.kind === 'auth' || nextState.kind === 'leaving') {
      todayDau.textContent = '';
      todayDate.textContent = '';
      yesterdayDau.textContent = '';
      yesterdayDate.textContent = '';
      period.textContent = '';
      chart.replaceChildren();
      dailyRows.replaceChildren();
      updatedAt.textContent = '';
      updatedAt.removeAttribute('datetime');
    }
    switch (nextState.kind) {
      case 'loading': status.textContent = '正在加载统计…'; return;
      case 'leaving': status.textContent = '正在退出登录…'; return;
      case 'auth': status.textContent = '登录已过期或无访问权限，请重新登录。'; return;
      case 'error': status.textContent = nextState.message; return;
      case 'ready': {
        const report = nextState.report;
        const today = report.days.at(-1);
        const yesterday = report.days.at(-2);
        todayDau.textContent = today ? numberFormat.format(today.dau) : '—';
        todayDate.textContent = report.today;
        yesterdayDau.textContent = yesterday ? numberFormat.format(yesterday.dau) : '—';
        yesterdayDate.textContent = yesterday?.day ?? '';
        period.textContent = `${report.days.at(0)?.day ?? ''} 至 ${report.today}`;
        drawChart(chart, report.days);
        zeroState.hidden = report.days.some(row => row.dau > 0);
        const rows = report.days.toReversed().map(row => {
          const tr = document.createElement('tr');
          const dateCell = document.createElement('td');
          dateCell.textContent = row.day;
          const countCell = document.createElement('td');
          countCell.textContent = numberFormat.format(row.dau);
          tr.append(dateCell, countCell);
          return tr;
        });
        dailyRows.replaceChildren(...rows);
        updatedAt.dateTime = report.generatedAt;
        updatedAt.textContent = dateTimeFormat.format(new Date(report.generatedAt));
        return;
      }
      default: {
        const exhaustive: never = nextState;
        return exhaustive;
      }
    }
  };

  const load = async (): Promise<void> => {
    if (state.kind === 'leaving') return;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    render({ kind: 'loading' });
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/admin/api/dau?days=${range.value}`, {
        signal: controller.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'manual',
        headers: { Accept: 'application/json' },
      });
      if (request !== controller) return;
      if (response.status === 401 || response.status === 403 || response.type === 'opaqueredirect'
        || (response.ok && !response.headers.get('content-type')?.includes('application/json'))) {
        render({ kind: 'auth' });
        window.location.replace('/admin/login/');
        return;
      }
      if (!response.ok) throw new Error(response.status === 503
        ? '统计服务暂不可用，请稍后重试。' : '统计加载失败，请稍后重试。');
      const value: unknown = await response.json();
      const report = parseReport(value, Number(range.value));
      if (request === controller) render({ kind: 'ready', report });
    } catch (error) {
      if (request !== controller) return;
      render({ kind: 'error', message: controller.signal.aborted ? '请求超时，请重试。'
        : error instanceof Error && error.message.startsWith('统计') ? error.message : '无法连接统计服务，请重试。' });
    } finally {
      window.clearTimeout(timeout);
    }
  };

  refresh.addEventListener('click', () => void load());
  logout.addEventListener('click', async () => {
    request?.abort();
    request = undefined;
    render({ kind: 'leaving' });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/admin/api/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (response.status !== 204) throw new Error('logout_failed');
      window.location.replace('/admin/login/');
    } catch {
      render({ kind: 'error', message: '退出失败，请重试。' });
    } finally {
      window.clearTimeout(timeout);
    }
  });
  range.addEventListener('change', () => void load());
  retry.addEventListener('click', () => {
    if (state.kind === 'auth') window.location.replace('/admin/login/');
    else void load();
  });
  let chartWidth = chart.clientWidth;
  const observer = new ResizeObserver(() => {
    if (chart.clientWidth === chartWidth) return;
    chartWidth = chart.clientWidth;
    if (state.kind === 'ready') drawChart(chart, state.report.days);
  });
  observer.observe(chart);
  window.addEventListener('pagehide', () => {
    request?.abort();
    request = undefined;
    render({ kind: 'auth' });
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void load();
  });
  void load();
}

initialize();
