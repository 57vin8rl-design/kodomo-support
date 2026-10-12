// 共通の定数と小道具。外部パッケージは使わない（Node 20以上の標準機能だけ）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ORGS_PATH = join(ROOT, "site/data/organizations.json");
export const CONFIG_PATH = join(ROOT, "site/data/site-config.json");
export const STATE_DIR = join(ROOT, "state");

export const CATEGORY_KEYS = ["traffic-orphans", "children-homes", "disability", "family-support", "child-cafeteria"];
export const METHOD_KEYS = ["wishlist", "money", "goods", "volunteer"];
export const PREFECTURES = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];

// サイトを巡回するときの名乗り。相手に連絡先が分かるようにする
export const USER_AGENT = "kodomo-support-linkcheck/1.0 (+運営サイトの掲載確認。頻度は週1回以下)";

export const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
export const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
export const loadOrgs = () => readJson(ORGS_PATH, []);
export const saveOrgs = (o) => writeJson(ORGS_PATH, o);
export const loadConfig = () => readJson(CONFIG_PATH, {});
export const today = () => new Date().toISOString().slice(0, 10);
export const isAmazon = (u) => /(^|\.)amazon\.(co\.jp|com)$/i.test(safeHost(u)) || /amzn\./i.test(safeHost(u));
export function safeHost(u) { try { return new URL(u).hostname; } catch { return ""; } }

// ---- GitHub Issue（通知と承認の窓口） ----
// 承認してほしい操作は、Issue本文の中に機械が読める形で埋め込む。
// スマホのGitHubアプリで「承認」ラベルを付けると apply-approval.mjs が実行する。
export const ACTION_RE = /<!--\s*ks-action:(\{[\s\S]*?\})\s*-->/;
export const actionBlock = (action) => `\n\n<!-- ks-action:${JSON.stringify(action)} -->`;

async function gh(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null; // ローカル実行時は何もしない
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function openIssues(label) {
  return (await gh(`/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`)) || [];
}

// 同じ内容の通知を何度も立てないよう、keyで重複を防ぐ
export async function notify({ key, title, body, labels = [], action }) {
  const fullBody = `${body}${action ? actionBlock(action) : ""}\n\n<!-- ks-key:${key} -->`;
  if (!process.env.GITHUB_TOKEN) {
    console.log(`\n[通知のみ表示（ローカル）] ${title}\n${body}\n`);
    return;
  }
  const existing = await openIssues("自動通知");
  if (existing.some((i) => (i.body || "").includes(`ks-key:${key}`))) return;
  await gh(`/issues`, { method: "POST", body: JSON.stringify({ title, body: fullBody, labels: ["自動通知", ...labels] }) });
}

export async function commentAndClose(number, body) {
  await gh(`/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  await gh(`/issues/${number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
}

export async function comment(number, body) {
  await gh(`/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}
