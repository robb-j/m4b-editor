#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, exec } from "node:child_process";

const usage = `
usage:
	./scripts/itool.js <input_dir> <output_dir> [options]
	
options:
	--dryRun  emulate what will happen
	--help    show this help message
	--debug   output extra debug information
	--force   overwrite existing files
`;

// Parse CLI arguments
const [inputDir, outputDir] = process.argv.slice(2);

// Parse CLI options
const options = {
	dryRun:
		process.argv.includes("--dryRun") || process.argv.includes("--dry-run"),
	help: process.argv.includes("--help"),
	debug: process.argv.includes("--debug"),
	force: process.argv.includes("--force"),
};

// Console helpers
const output = (str) => process.stdout.write(str);
const debug = (...args) => (options.debug ? console.error(...args) : {});

if (!inputDir || !outputDir || options.help) {
	console.error(usage);
	process.exit(1);
}

// Use ffprobe to get mp3 tags and parse it from JSON
function getAudioMetadata(filename) {
	const result = execSync(
		`ffprobe -loglevel error -show_streams -show_entries stream_tags:format_tags -of json "${filename}"`,
		{ encoding: "utf8" },
	);
	return JSON.parse(result);
}

/** @param {Generator<Promise>} iterator */
async function pool(iterator, limit = 4) {
	const threads = new Set();

	while (true) {
		// If the threads are full, wait for one to finish
		if (threads.size >= limit) {
			await Promise.race(threads.values());
		}

		// Start and get the next promise
		const result = iterator.next();
		if (result.done) break;

		// Add the thread and remove itself when it finishes
		const promise = result.value.finally(() => {
			threads.delete(promise);
		});
		threads.add(promise);
	}
	return Promise.all(threads);
}

/** @param {string} file */
function processFile(file) {
	const relative = path.relative(inputDir, file);
	debug("\nfile=%o", relative);

	// Get JSON metadata for the track
	const metadata = getAudioMetadata(file);
	debug("metadata", JSON.stringify(metadata));

	const outfile = path.join(outputDir, relative);

	// Ensure the output directory exists to put the file into
	fs.mkdirSync(path.dirname(outfile), { recursive: true });

	// Skip if it already exists, unless --force is set
	if (!options.force && fs.existsSync(outfile)) {
		output("_");
		debug("skip", relative);
		return Promise.resolve();
	}

	const cmd = [
		"ffmpeg",
		"-i",
		`"${file}"`,

		// encoding
		"-codec:a",
		"aac",
		"-b:a",
		"256k",
		"-map_metadata",
		"0",

		// cover
		"-c:v",
		"copy",

		// Logging
		"-v",
		"quiet",
		"-stats",
	];

	// Overwrite the "artist" from "album_artist" if set in the input file
	if (metadata.format?.tags?.album_artist) {
		cmd.push(`-metadata`, `artist="${metadata.format.tags.album_artist}"`);
	}

	// End with the output filename
	cmd.push(`"${outfile}"`);

	if (options.dryRun) {
		console.log("DRY-RUN:", cmd.join(" "));
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		exec(cmd.join(" "), (err, _stdout, stderr) => {
			if (err) {
				output("x");
				console.error(stderr);
				reject(err);
			} else {
				output(".");
				resolve();
			}
		});
	});
}

// Generate promises to convert files so pool can chunk the execution of them
function* threads() {
	for (const file of fs.globSync(
		path.join(inputDir, "**/*.{mp3,m4a,aac,aiff,flac,m4b,m4r}"),
	)) {
		yield processFile(file);
	}
}

async function main() {
	fs.mkdirSync(outputDir, { recursive: true });

	debug("input=%o", inputDir);
	debug("output=%o", outputDir);

	await pool(threads(), 4);

	output("\ndone!\n");
}

main();
