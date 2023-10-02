import url from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { validate } from '@budibase/backend-core/plugins';
import esbuild from 'esbuild';
import tar from 'tar';
import pkg from './package.json' assert { type: "json" };

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const src = path.join(__dirname, 'src');
const dist = path.join(__dirname, 'dist');

const assets = ['schema.json', 'package.json', 'icon.svg'];

const schema = fs.readFileSync('schema.json', 'utf8');
validate(JSON.parse(schema));

if (!fs.existsSync(dist)) {
	fs.mkdirSync(dist);
}

cleanDist();

await esbuild.build({
	entryPoints: [path.join(src, 'index.ts')],
	bundle: true,
	platform: 'node',
	loader: {
		'.html': 'text', // eslint-disable-line @typescript-eslint/naming-convention
	},
	sourcemap: 'inline',
	target: 'esnext',
	treeShaking: true,
	format: 'cjs',
	define: {
		...(process.env.NODE_ENV === 'dev' && { __dirname: JSON.stringify(dist) }),
		'process.env.NODE_ENV': JSON.stringify(
			process.env.NODE_ENV ?? 'production',
		),
	},
	outfile: path.join(dist, 'plugin.min.js'),
});

for (const asset of assets) {
	fs.copyFileSync(path.join(__dirname, asset), path.join(dist, asset));
}

hash();

bundle();

function cleanDist() {
	for (const p of fs.readdirSync(dist)) {
		if (p.endsWith('.tar.gz')) {
			fs.unlinkSync(path.join(dist, p));
		}
	}
}

function hash() {
	// generate JS hash
	const fileBuffer = fs.readFileSync(path.join(dist, 'plugin.min.js'));
	const hashSum = crypto.createHash('sha1');
	hashSum.update(fileBuffer);
	const hex = hashSum.digest('hex');

	// read and parse existing schema from dist folder
	const schema = JSON.parse(
		fs.readFileSync(path.join(dist, 'schema.json'), 'utf8'),
	);

	// write updated schema to dist folder, pretty printed as JSON again
	const newSchema = {
		...schema,
		hash: hex,
		version: pkg.version,
	};
	fs.writeFileSync(
		path.join(dist, 'schema.json'),
		JSON.stringify(newSchema, null, 2),
	);
}

function bundle() {
	const bundleName = `${pkg.name}-${pkg.version}.tar.gz`;
	tar
		.c({ gzip: true, cwd: dist }, [...assets, 'plugin.min.js'])
		.pipe(fs.createWriteStream(path.join(dist, bundleName)));
}
