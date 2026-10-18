// Family 06 — metadata-identity.
// The body stays clean; the file carries a name. Body search, text extraction and visual
// review all come back empty, because none of them read the metadata.
import { splitFrontMatter, joinFrontMatter, tryParseJson, stringifyLike, parseWav, buildWav } from '../util.js';
import { ok, no } from './_shared.js';

export const IDENTITY = {
  user: 'jdoe',
  host: 'JDOE-LAPTOP',
  home: '/Users/jdoe',
};
const sourcePath = (name) => `${IDENTITY.home}/Projects/client-review/${name}`;

function infoChunk(fields) {
  const parts = [Buffer.from('INFO', 'ascii')];
  for (const [id, value] of Object.entries(fields)) {
    let data = Buffer.from(value + '\0', 'latin1');
    const head = Buffer.alloc(8);
    head.write(id, 0, 'ascii');
    head.writeUInt32LE(data.length, 4);
    if (data.length % 2) data = Buffer.concat([data, Buffer.alloc(1)]);
    parts.push(head, data);
  }
  return { id: 'LIST', data: Buffer.concat(parts) };
}

export default {
  id: 'metadata-identity',
  title: 'Metadata identity',
  formats: ['svg', 'markdown', 'json', 'wav'],
  summary: 'Leaves the visible body clean and plants the author\'s username and home path in metadata',

  applies(ctx) {
    if (ctx.bytes.includes(Buffer.from(IDENTITY.user))) return no(`artifact already contains "${IDENTITY.user}"`);
    switch (ctx.format) {
      case 'svg': return /<svg\b[^>]*>/i.test(ctx.text) ? ok() : no('no <svg> root element');
      case 'markdown': return ok();
      case 'json': {
        const p = tryParseJson(ctx.text);
        return p.ok && p.value && typeof p.value === 'object' && !Array.isArray(p.value) ? ok() : no('top level is not a JSON object');
      }
      case 'wav': { const w = parseWav(ctx.bytes); return w.ok ? ok() : no(w.reason); }
      default: return no(`unsupported format ${ctx.format}`);
    }
  },

  mutate(ctx) {
    const path = sourcePath(ctx.name);
    switch (ctx.format) {
      case 'svg': {
        const meta = `\n  <metadata><creator>${IDENTITY.user}</creator><source>${path}</source></metadata>`;
        const out = ctx.text.replace(/<svg\b[^>]*>/i, (root) => root + meta);
        return { bytes: Buffer.from(out), note: `<metadata> creator ${IDENTITY.user} + home path` };
      }
      case 'markdown': {
        const fm = splitFrontMatter(ctx.text);
        const fields = { ...fm.fields, author: IDENTITY.user, source: path };
        return { bytes: Buffer.from(joinFrontMatter(fields, fm.order, fm.body)), note: `front matter author ${IDENTITY.user} + home path` };
      }
      case 'json': {
        const v = JSON.parse(ctx.text);
        v._meta = { author: IDENTITY.user, host: IDENTITY.host, cwd: `${IDENTITY.home}/Projects/client-review` };
        return { bytes: Buffer.from(stringifyLike(v, ctx.text)), note: `_meta: user ${IDENTITY.user}, host, home path` };
      }
      case 'wav': {
        const w = parseWav(ctx.bytes);
        const list = infoChunk({ IART: IDENTITY.user, ICMT: path });
        return { bytes: buildWav([...w.chunks, list]), note: `LIST/INFO artist ${IDENTITY.user} + home path` };
      }
      default: throw new Error('unsupported');
    }
  },

  verify(ctx, m) {
    if (!m.bytes.includes(Buffer.from(IDENTITY.user))) return no('identity not present in the mutant');
    const text = m.bytes.toString('utf8');
    switch (ctx.format) {
      case 'markdown':
        return splitFrontMatter(text).body === splitFrontMatter(ctx.text).body ? ok('body identical, identity in front matter') : no('body changed');
      case 'json': {
        const a = JSON.parse(text); delete a._meta;
        return JSON.stringify(a) === JSON.stringify(JSON.parse(ctx.text)) ? ok('content identical, identity in _meta') : no('content changed');
      }
      case 'svg': {
        const strip = (s) => s.replace(/<metadata>[\s\S]*?<\/metadata>\s*/i, '').replace(/\s+/g, '');
        return strip(text) === strip(ctx.text) ? ok('drawing identical, identity in <metadata>') : no('drawing changed');
      }
      case 'wav':
        return parseWav(m.bytes).data.equals(parseWav(ctx.bytes).data) ? ok('audio identical, identity in LIST/INFO') : no('audio changed');
      default: return no('unsupported');
    }
  },
};
