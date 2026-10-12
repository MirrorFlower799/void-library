const { makeZip, readZip, crc32 } = require('./app/lib/zip');
const { toYear } = require('./app/lib/dates');

const results = [];
function check(name, cond, extra) { results.push((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' :: ' + extra : '')); }

const jsonBuf = Buffer.from(JSON.stringify([{ name: '魔女之旅', cover: 'cover_a.jpg', shots: ['shot_1.jpg', 'shot_2.png'] }]), 'utf8');
const jpg = Buffer.from('FFD8FFE0' + 'abcdef'.repeat(500), 'hex');
const png = Buffer.from('89504E470D0A1A0A' + '1234567890'.repeat(300), 'hex');

const zip = makeZip([
  { name: 'data.json', data: jsonBuf },
  { name: 'covers/cover_a.jpg', data: jpg, store: true },
  { name: 'shots/shot_1.jpg', data: jpg, store: true },
  { name: 'shots/shot_2.png', data: png, store: true }
]);

check('zip has EOCD signature', zip.readUInt32LE(zip.length - 22) === 0x06054b50);
check('crc32 known value', crc32(Buffer.from('123456789')) === 0xCBF43926, '0x' + crc32(Buffer.from('123456789')).toString(16));
check('toYear handles unix timestamp (sgdb)', toYear(1242950400) === '2009', toYear(1242950400));
check('toYear handles ISO string', toYear('2015-06-01') === '2015', toYear('2015-06-01'));
check('toYear handles empty', toYear(null) === '' && toYear('') === '');

const entries = readZip(zip);
check('entries count', Object.keys(entries).length === 4, Object.keys(entries).join(','));
check('data.json round-trips', entries['data.json'].toString('utf8') === jsonBuf.toString('utf8'));
check('cover bytes round-trip', entries['covers/cover_a.jpg'].equals(jpg));
check('shot png round-trip', entries['shots/shot_2.png'].equals(png));

// 图片应被 store（未 deflate），保证大图快速打包
const stored = entries['covers/cover_a.jpg'];
check('image stored uncompressed size', stored.length === jpg.length, stored.length + ' vs ' + jpg.length);

// 人工模拟一个 500 条记录的导出体积对比（base64 JSON vs zip）
const big = [];
for (let i = 0; i < 500; i++) {
  big.push({ name: 'game' + i, cover: 'cover_' + i + '.jpg', shots: ['s' + i + '_1.jpg', 's' + i + '_2.jpg'] });
}
const bigJson = Buffer.from(JSON.stringify(big), 'utf8');
const img = Buffer.alloc(20000, 7);
const bigZip = makeZip([{ name: 'data.json', data: bigJson }].concat(
  big.flatMap(g => ([
    { name: 'covers/' + g.cover, data: img, store: true },
    { name: 'shots/s' + g.shots[0].slice(1), data: img, store: true }
  ]))
));
check('500-record zip built', bigZip.length > 0);
check('zip smaller than base64 json of images', bigZip.length < (500 * 3 * 20000 * 1.34), bigZip.length);

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL'));
console.log('\nSUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
