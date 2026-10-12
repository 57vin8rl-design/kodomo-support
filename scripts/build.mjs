// データの検査と公開用ファイルの作成。
//   node scripts/build.mjs            … 検査だけ
//   node scripts/build.mjs --production … 検査して dist/ を作る（Cloudflare Pagesが実行）
//   node scripts/build.mjs --preview    … ダミー入りの1ファイル版 preview.html を作る
import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, CATEGORY_KEYS, METHOD_KEYS, PREFECTURES, loadOrgs, loadConfig, writeJson } from "./lib.mjs";

const mode = process.argv.includes("--production") ? "production" : process.argv.includes("--preview") ? "preview" : "check";
const orgs = loadOrgs();
const config = loadConfig();
const errors = [];
const err = (o, m) => errors.push(`${o?.id || "?"}: ${m}`);
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

const ids = new Set();
for (const o of orgs) {
  if (!o.id || !/^[a-z0-9-]+$/.test(o.id)) err(o, "idは半角英小文字・数字・ハイフンで");
  if (ids.has(o.id)) err(o, "idが重複しています");
  ids.add(o.id);
  if (!o.name) err(o, "団体名がありません");
  if (!PREFECTURES.includes(o.prefecture)) err(o, `都道府県「${o.prefecture}」が正しくありません`);
  if (!Array.isArray(o.categories) || !o.categories.length) err(o, "カテゴリがありません");
  for (const c of o.categories || []) if (!CATEGORY_KEYS.includes(c)) err(o, `カテゴリ「${c}」は使えません`);
  if (!o.description || o.description.length > 120) err(o, "紹介文は1〜120字で（公式の文章をそのまま写さない）");
  if (!isHttps(o.officialWebsite)) err(o, "公式サイトはhttps://で始まるURLで");
  if (!Array.isArray(o.supportLinks) || !o.supportLinks.length) err(o, "支援リンクがありません");
  for (const l of o.supportLinks || []) {
    if (!METHOD_KEYS.includes(l.type)) err(o, `支援方法「${l.type}」は使えません`);
    if (!isHttps(l.url)) err(o, `支援リンク ${l.url} はhttps://で始まるURLで`);
  }
  if (o.verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(o.verifiedAt)) err(o, "確認日はYYYY-MM-DDで");
  if (!o.isDemo && o.verifiedAt && !o.verificationMethod) err(o, "確認方法を書いてください");
  if (!["active", "paused"].includes(o.status)) err(o, "statusはactiveかpausedで");
}

if (mode === "production") {
  // ダミーは下で自動的に外し、出力後にもう一度検査して残っていたら止める
  if (!config.operatorName || !config.operatorContact) errors.push("site-config.json の運営者名とお問い合わせ先が未設定のため、本番公開を止めました");
}

if (errors.length) {
  console.error("データに問題があります:\n- " + errors.join("\n- "));
  process.exit(1);
}

const publicOrgs = orgs.filter((o) => !o.isDemo && o.status === "active" && o.verifiedAt);

if (mode === "production") {
  const dist = join(ROOT, "dist");
  rmSync(dist, { recursive: true, force: true });
  cpSync(join(ROOT, "site"), dist, { recursive: true });
  writeJson(join(dist, "data/organizations.json"), publicOrgs);
  const leaked = JSON.parse(readFileSync(join(dist, "data/organizations.json"), "utf8")).some((o) => o.isDemo);
  if (leaked) { console.error("ダミーが公開データに残っています。公開を止めました"); process.exit(1); }
  console.log(`公開用に ${publicOrgs.length} 件を出力しました（ダミー・未確認・停止中は除外）`);
} else if (mode === "preview") {
  const site = join(ROOT, "site");
  let html = readFileSync(join(site, "index.html"), "utf8");
  const css = readFileSync(join(site, "style.css"), "utf8");
  const js = readFileSync(join(site, "app.js"), "utf8");
  const data = JSON.stringify({ config, organizations: orgs }).replace(/</g, "\\u003c");
  const head = html.match(/<title>[\s\S]*?<\/title>/)[0] +
    '\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap">\n';
  const app = html.match(/<!--APP-->([\s\S]*?)<!--\/APP-->/)[1];
  const out = `${head}<style>\n${css}\n</style>\n${app}\n<script>window.__KS_PREVIEW__=true;window.__KS_DATA__=${data};</script>\n<script>\n${js}\n</script>\n`;
  mkdirSync(join(ROOT, "preview"), { recursive: true });
  writeFileSync(join(ROOT, "preview/preview.html"), out);
  console.log("preview/preview.html を作りました（ダミー表示あり）");
} else {
  console.log(`検査OK：全${orgs.length}件（公開対象 ${publicOrgs.length}件）`);
}
