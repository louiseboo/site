import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const base = { status: '已确认', test_category: '档期测试', product_type: '三明治', campaign_year: '2027', campaign: '01月｜CNY', version_label: 'V1', round_conclusion: '通过且进入众测', created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z', finished_spec: '150g/个' };
export const previewRecords = [
  { ...base, id: 'sandwich-v1', supplier_name: '示例供应商 A', product_name: '蛋香蟹柳三明治', quote_rmb: 8.6 },
  { ...base, id: 'sandwich-v2', supplier_name: '示例供应商 A', product_name: '蛋香蟹柳三明治', version_label: 'V2', round_conclusion: '继续调整', tasting_scene: '众测后优化', quote_rmb: 8.1, campaign: '01月｜CNY（含烘焙 / 三明治换新）', version_change: '优化酱料配比与产品成本', created_at: '2026-09-02T08:00:00Z' },
  { ...base, id: 'beef-v1', supplier_name: '示例供应商 A', product_name: '香辣牛肉三明治', quote_rmb: 9.2 },
  { ...base, id: 'beef-v2', supplier_name: '示例供应商 A', product_name: '香辣牛肉三明治', version_label: 'V2', tasting_scene: '众测后优化', round_conclusion: '继续调整', quote_rmb: null },
  { ...base, id: 'cake', supplier_name: '示例供应商 B', product_name: '抹茶柚子慕斯', product_type: '蛋糕', quote_rmb: 7.8, finished_spec: '90g/个' },
  { ...base, id: 'same-name', supplier_name: '示例供应商 C', product_name: '抹茶柚子慕斯', quote_rmb: 8.2 },
  { ...base, id: 'cake-trial', supplier_name: '示例供应商 B', product_name: '抹茶柚子慕斯', version_label: 'V3', round_conclusion: '通过且进入中试', quote_rmb: 6.9 },
  { ...base, id: 'spring', supplier_name: '示例供应商 B', product_name: '莓果山楂蛋糕', campaign: '04月｜摘星档期（含烘焙 / 三明治换新）', quote_rmb: 7.5 },
  { ...base, id: 'old-year', supplier_name: '示例供应商 A', product_name: '蛋香蟹柳三明治', campaign_year: '2026', quote_rmb: 8.9 },
  { ...base, id: 'autumn', supplier_name: '示例供应商 D', product_name: '桂花酒酿蛋糕', campaign_year: '2026', campaign: '09月｜桂花档期 2', quote_rmb: 7.6 },
  { ...base, id: 'missing', supplier_name: '示例供应商 D', product_name: '待排期新品', campaign_year: '', campaign: '', quote_rmb: null },
  { ...base, id: 'pending', supplier_name: '示例供应商 E', product_name: '前期打磨样品', round_conclusion: '继续调整', status: '待处理', quote_rmb: 4.5 }
];

export async function startPreview(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/supplier-feedback') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let action;
      try { action = JSON.parse(body).action; } catch {}
      const allowed = req.method === 'POST' && action === 'adminList';
      res.writeHead(allowed ? 200 : 403, { 'content-type': 'application/json' });
      res.end(JSON.stringify(allowed ? { ok: true, data: { records: previewRecords } } : { ok: false, error: '本地预览仅供查看，不能保存或修改真实数据。' }));
      return;
    }
    if (req.method !== 'GET') { res.writeHead(403).end(); return; }
    if (url.pathname.endsWith('/cloudbase-config.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript' }).end('window.CATEGORYLAB_CLOUDBASE = {apiUrl: "/api/supplier-feedback"};');
      return;
    }
    if (url.pathname.endsWith('/supabase-config.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript' }).end('window.CATEGORYLAB_SUPABASE = {};');
      return;
    }
    if (!['/', '/decks/category-lab/supplier-submissions-admin.html'].includes(url.pathname)) { res.writeHead(404).end(); return; }
    try {
      let html = await readFile(resolve(repo, 'decks/category-lab/supplier-submissions-admin.html'), 'utf8');
      html = html.replace(/<script src="https:\/\/cdn.jsdelivr.net[^>]+><\/script>/, '');
      html = html.replace('<body>', '<body><div style="background:#efe3cb;padding:8px 18px;font-size:13px;color:#574a31;border-bottom:1px solid #d6c5a5">本地预览 · 示例产品与报价 · 不连接线上数据 · 保存已禁用</div>');
      html = html.replace('<title>产品信息收件箱</title>', '<title>本地预览｜众测产品信息</title>');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "connect-src 'self'; img-src 'self' data:;" }).end(html);
    } catch { res.writeHead(500).end('Preview read failed'); }
  });
  await new Promise(resolveListen => server.listen(port, '127.0.0.1', resolveListen));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startPreview(Number(process.env.CROWD_PREVIEW_PORT || 4178));
  console.log(`http://127.0.0.1:${server.address().port}/decks/category-lab/supplier-submissions-admin.html?backend=cloudbase&view=crowd`);
}
